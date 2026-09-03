/**
 * THE PROP MODEL (Sep 2 2026) — a player's night as a distribution, priced
 * against the book's number.
 *
 * Founder, Sep 2: "do this system then for props." Two per game is the
 * product, so the model's job is to find the best two on each board: for
 * every market, the chance the player clears the line from HIS OWN numbers —
 * how many trips to the plate he gets, what each one is worth, split by
 * what he has done lately — compared with the chance the price implies once
 * the vig is stripped. The gap ranks the board. Gary reads the ranked
 * candidates with the desk and the sheets and makes the picks; the model
 * never writes a card and its numbers never reach the prompt as a "lean".
 *
 * Pure arithmetic over BDL game rows (oldest → newest), no I/O, so the same
 * code runs the August replay (scripts/props-replay.js) and the live board.
 *
 * WHAT THE AUGUST REPLAY FOUND (Sep 2 2026; 329 boards, 33,563 two-sided
 * markets, rows dated before each game): the model alone does not beat the
 * book — betting its side at any gap returns the vig (-3 to -5% ROI), and
 * plus-money longshots (+161 and longer) lose 7-11% in every slice. What
 * held in BOTH halves of the month and both model variants: the favorite
 * side priced -130 to -200 where the model's number sits 4+ points above
 * the price — 64% winners, +5 to +7% ROI at two per game. That is the menu
 * policy in propsBrain.selectCandidates; the model's job is that pocket.
 * Rank one carried most of it (68%, +12%), so the board is three deep.
 *
 * Distributions:
 *   per-PA outcomes (hit, single, double, triple, HR, walk, strikeout, steal)
 *     → Binomial over a plate-appearance count drawn from the player's own
 *       season PA-per-game distribution;
 *   total bases → a per-PA multinomial (out / 1B / 2B / 3B / HR) convolved
 *     over the PA count;
 *   runs, RBI → Poisson at the player's per-PA rate × PA;
 *   hits+runs+RBI → the convolution of the three;
 *   pitcher K / BB / hits → Binomial over batters faced (his recent starts)
 *     at his per-BF rate, scaled by the lineup's own tendency vs the league;
 *   pitcher outs → his empirical outs-per-start distribution, smoothed;
 *   earned runs → Poisson at his per-BF rate × BF.
 * Rates are recency-weighted (season 70 / last 30 days 30) and shrunk toward
 * the league rate with a 100-PA prior, so a hot week moves the number and a
 * ten-game sample does not own it.
 */
import { statForProp } from './propsBrain.js';
import { hitterGames, pitcherStarts } from './propSheets.js';

const norm = (s) => String(s || '').toLowerCase().trim();

// League rates per plate appearance / batter faced (2026 to date; the replay
// prints the pooled values so these can be checked against the season).
export const LEAGUE = {
  hits: 0.232, singles: 0.150, doubles: 0.046, triples: 0.004, hr: 0.032,
  bb: 0.083, k: 0.226, sb: 0.013, runs: 0.118, rbi: 0.113,
  p_k: 0.226, p_bb: 0.083, p_h: 0.232, er: 0.104, p_hr: 0.030,
  bf_per_start: 22,
};
const PRIOR_PA = 100;      // shrinkage weight toward the league rate
const RECENT_DAYS = 30;    // the "lately" window
const RECENT_WEIGHT = 0.3;

const dateOf = (r) => String(r?._game?.date || '').slice(0, 10);

/** Rows strictly before a date (the replay's no-peeking rule); all rows when no date. */
export function rowsBefore(rows, asOf) {
  if (!asOf) return rows || [];
  return (rows || []).filter((r) => dateOf(r) && dateOf(r) < asOf);
}

const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);

/** Recency-weighted, league-shrunk rate of `num` per `den` over the rows. */
function blendedRate(rows, num, den, leagueRate, asOf) {
  const sum = (list, f) => list.reduce((a, r) => a + (Number(f(r)) || 0), 0);
  const nAll = sum(rows, den);
  const kAll = sum(rows, num);
  const last = asOf || (rows.length ? dateOf(rows[rows.length - 1]) : null);
  const recent = last ? rows.filter((r) => dateOf(r) && daysBetween(dateOf(r), last) <= RECENT_DAYS) : [];
  const nRec = sum(recent, den);
  const kRec = sum(recent, num);
  const seasonRate = nAll > 0 ? kAll / nAll : leagueRate;
  const recentRate = nRec > 0 ? kRec / nRec : seasonRate;
  const observed = nRec > 0 ? (1 - RECENT_WEIGHT) * seasonRate + RECENT_WEIGHT * recentRate : seasonRate;
  return (nAll * observed + PRIOR_PA * leagueRate) / (nAll + PRIOR_PA);
}

/** Empirical PA-per-game distribution: Map<pa, probability>, from the last 60 games. */
export function paDistribution(rows) {
  const games = hitterGames(rows).slice(-60);
  const counts = new Map();
  for (const r of games) {
    const pa = Math.max(1, Math.min(7, Math.round(Number(r.plate_appearances) || Number(r.at_bats) || 0)));
    counts.set(pa, (counts.get(pa) || 0) + 1);
  }
  const n = games.length;
  if (!n) return new Map([[4, 1]]);
  return new Map([...counts.entries()].map(([pa, c]) => [pa, c / n]));
}

// Plate appearances by lineup slot (league, 2026): the leadoff man bats
// ~4.6 times, the nine-hole ~3.8. Tonight's slot is known from the posted
// lineup, so it outranks the player's own PA history (a call-up batting 2nd
// tonight is not the bench bat his last 60 games say he was).
const SLOT_PA = { 1: 4.65, 2: 4.55, 3: 4.45, 4: 4.35, 5: 4.25, 6: 4.12, 7: 4.02, 8: 3.92, 9: 3.82 };
export function slotPaDistribution(slot) {
  const mean = SLOT_PA[Number(slot)];
  if (!mean) return null;
  const lo = Math.floor(mean), frac = mean - lo;
  // Mass on floor/ceil for the mean, a little on either side for extra innings and blowouts.
  const d = new Map();
  const add = (pa, w) => d.set(pa, (d.get(pa) || 0) + w);
  add(lo, 0.8 * (1 - frac)); add(lo + 1, 0.8 * frac);
  add(lo - 1, 0.1); add(lo + 2, 0.1);
  return d;
}

/** A hitter's per-PA rates as of a date; `slot` = tonight's batting order when posted. */
export function hitterProfile(rows, { asOf = null, slot = null } = {}) {
  const games = hitterGames(rowsBefore(rows, asOf));
  const pa = (r) => Number(r.plate_appearances) || Number(r.at_bats) || 0;
  const singles = (r) => (Number(r.hits) || 0) - (Number(r.doubles) || 0) - (Number(r.triples) || 0) - (Number(r.hr) || 0);
  const rate = (f, key) => blendedRate(games, f, pa, LEAGUE[key], asOf);
  return {
    games: games.length,
    rows: games,
    asOf: asOf || (games.length ? dateOf(games[games.length - 1]) : null),
    paDist: slotPaDistribution(slot) || paDistribution(games),
    slot: slot || null,
    rates: {
      hits: rate((r) => r.hits, 'hits'),
      singles: rate(singles, 'singles'),
      doubles: rate((r) => r.doubles, 'doubles'),
      triples: rate((r) => r.triples, 'triples'),
      hr: rate((r) => r.hr, 'hr'),
      bb: rate((r) => r.bb, 'bb'),
      k: rate((r) => r.k, 'k'),
      sb: rate((r) => r.stolen_bases, 'sb'),
      runs: rate((r) => r.runs, 'runs'),
      rbi: rate((r) => r.rbi, 'rbi'),
    },
  };
}

// ── distribution arithmetic (arrays indexed by count, truncated at 30) ──────
const MAXN = 30;
const binomial = (n, p) => {
  const out = new Array(MAXN + 1).fill(0);
  let c = Math.pow(1 - p, n);
  for (let k = 0; k <= Math.min(n, MAXN); k++) {
    out[k] = c;
    c = c * ((n - k) / (k + 1)) * (p / (1 - p));
    if (!Number.isFinite(c)) c = 0;
  }
  return out;
};
const poisson = (lambda) => {
  const out = new Array(MAXN + 1).fill(0);
  let c = Math.exp(-lambda);
  for (let k = 0; k <= MAXN; k++) { out[k] = c; c = c * lambda / (k + 1); }
  return out;
};
const convolve = (a, b) => {
  const out = new Array(MAXN + 1).fill(0);
  for (let i = 0; i <= MAXN; i++) {
    if (!a[i]) continue;
    for (let j = 0; i + j <= MAXN; j++) out[i + j] += a[i] * b[j];
  }
  return out;
};
const mixOverPa = (paDist, distForPa) => {
  const out = new Array(MAXN + 1).fill(0);
  for (const [pa, w] of paDist) {
    const d = distForPa(pa);
    for (let k = 0; k <= MAXN; k++) out[k] += w * d[k];
  }
  return out;
};
/** Total bases over `pa` plate appearances: per-PA multinomial convolved. */
const totalBasesDist = (rates, pa) => {
  const p1 = Math.max(0, rates.singles), p2 = Math.max(0, rates.doubles), p3 = Math.max(0, rates.triples), p4 = Math.max(0, rates.hr);
  const p0 = Math.max(0, 1 - p1 - p2 - p3 - p4);
  const step = new Array(MAXN + 1).fill(0);
  step[0] = p0; step[1] = p1; step[2] = p2; step[3] = p3; step[4] = p4;
  let d = new Array(MAXN + 1).fill(0); d[0] = 1;
  for (let i = 0; i < pa; i++) d = convolve(d, step);
  return d;
};
/** P(X > line) for a count distribution. */
export const probOver = (dist, line) => {
  const L = Number(line);
  let p = 0;
  for (let k = 0; k <= MAXN; k++) if (k > L) p += dist[k];
  return Math.min(1, Math.max(0, p));
};

/**
 * The player's own game-by-game outcomes for a stat as a distribution —
 * recent 30 days weighted 1.5×. Null under five games.
 */
export function empiricalDistribution(rows, propType, asOf) {
  const games = (rows || []).filter((r) => statForProp(r, propType) != null);
  if (games.length < 5) return null;
  const dist = new Array(MAXN + 1).fill(0);
  let total = 0;
  for (const r of games) {
    const v = Math.max(0, Math.min(MAXN, Math.round(statForProp(r, propType))));
    const w = asOf && dateOf(r) && daysBetween(dateOf(r), asOf) <= RECENT_DAYS ? 1.5 : 1;
    dist[v] += w; total += w;
  }
  return dist.map((x) => x / total);
}

const EMPIRICAL_PRIOR_GAMES = 20;
const blendDists = (empirical, parametric, n) => {
  if (!empirical) return parametric;
  if (!parametric) return empirical;
  const wEmp = n / (n + EMPIRICAL_PRIOR_GAMES);
  return parametric.map((p, k) => wEmp * empirical[k] + (1 - wEmp) * p);
};

/**
 * The distribution of a hitter's stat tonight: the parametric shape (his
 * per-PA rates over his own PA-per-game mix) blended with his own game-by-
 * game outcomes — the parametric part regularizes a thin sample, the
 * empirical part carries the clumpiness (runs and RBI come in bunches that
 * a Poisson at his rate never sees).
 */
export function hitterDistribution(profile, propType, oppPitcher = null) {
  const parametric = hitterParametric(profile, propType, oppPitcher);
  if (!parametric) return null;
  const empirical = empiricalDistribution(profile.rows, propType, profile.asOf);
  // The home-run lane is the one market where the arm matters more than the
  // history: the empirical blend is skipped so the starter's tendency carries.
  if (norm(propType).includes('home_run') && oppPitcher?.hr != null) return parametric;
  return blendDists(empirical, parametric, profile.games);
}

/** The opposing starter's HR-allowed rate against the league, capped. */
export const pitcherHrScale = (oppPitcher) => {
  const r = oppPitcher?.hr;
  if (!Number.isFinite(r) || !r) return 1;
  return Math.min(1.6, Math.max(0.6, r / LEAGUE.p_hr));
};

function hitterParametric(profile, propType, oppPitcher = null) {
  const t = norm(propType);
  const { rates, paDist } = profile;
  const bern = (p) => mixOverPa(paDist, (pa) => binomial(pa, Math.min(0.95, Math.max(0.001, p))));
  const pois = (rate) => mixOverPa(paDist, (pa) => poisson(Math.max(0.001, rate * pa)));
  switch (t) {
    case 'hits': return bern(rates.hits);
    case 'singles': return bern(rates.singles);
    case 'doubles': return bern(rates.doubles);
    case 'triples': return bern(rates.triples);
    case 'home_runs': case 'first_home_run': return bern(rates.hr * pitcherHrScale(oppPitcher));
    case 'walks': return bern(rates.bb);
    case 'strikeouts': return bern(rates.k);
    case 'stolen_bases': return bern(rates.sb);
    case 'runs_scored': return pois(rates.runs);
    case 'rbis': return pois(rates.rbi);
    case 'total_bases': return mixOverPa(paDist, (pa) => totalBasesDist(rates, pa));
    case 'extra_base_hits': return bern(rates.doubles + rates.triples + rates.hr);
    case 'runs_rbis': return pois(rates.runs + rates.rbi);
    case 'hits_runs_rbis': return convolve(bern(rates.hits), pois(rates.runs + rates.rbi));
    default: return null;
  }
}

/** A starter's per-BF rates, expected batters faced, and outs distribution as of a date. */
export function pitcherProfile(rows, { asOf = null } = {}) {
  const starts = pitcherStarts(rowsBefore(rows, asOf));
  const bf = (r) => Number(r.batters_faced) || 0;
  const withBf = starts.filter((r) => bf(r) > 0);
  const rate = (f, key) => blendedRate(withBf, f, bf, LEAGUE[key], asOf);
  const recent = withBf.slice(-5);
  const bfRecent = recent.length ? recent.reduce((a, r) => a + bf(r), 0) / recent.length : null;
  const bfSeason = withBf.length ? withBf.reduce((a, r) => a + bf(r), 0) / withBf.length : null;
  const expectedBf = bfRecent == null ? LEAGUE.bf_per_start
    : bfSeason == null ? bfRecent : 0.6 * bfRecent + 0.4 * bfSeason;
  const outs = starts.map((r) => (r.pitching_outs != null ? Number(r.pitching_outs) : statForProp(r, 'pitcher_outs'))).filter((v) => v != null);
  return {
    starts: starts.length,
    rows: starts,
    asOf: asOf || (starts.length ? dateOf(starts[starts.length - 1]) : null),
    expectedBf,
    rates: {
      k: rate((r) => r.p_k, 'p_k'),
      bb: rate((r) => r.p_bb, 'p_bb'),
      h: rate((r) => r.p_hits, 'p_h'),
      er: rate((r) => r.er, 'er'),
      hr: rate((r) => r.p_hr, 'p_hr'),
    },
    outs,
  };
}

/** Empirical outs distribution smoothed with a ±1 kernel; recent starts count double. */
function outsDistribution(outs) {
  const dist = new Array(MAXN + 1).fill(0);
  if (!outs.length) return null;
  const n = outs.length;
  outs.forEach((o, i) => {
    const w = i >= n - 5 ? 2 : 1;
    const v = Math.max(0, Math.min(MAXN, Math.round(o)));
    dist[v] += 0.6 * w;
    if (v > 0) dist[v - 1] += 0.2 * w;
    if (v < MAXN) dist[v + 1] += 0.2 * w;
  });
  const total = dist.reduce((a, b) => a + b, 0);
  return dist.map((x) => x / total);
}

/**
 * The distribution of a starter's stat tonight. `lineup` (optional) carries
 * the opposing nine's own per-PA k / bb / hits rates; the pitcher's rate is
 * scaled by lineup ÷ league, capped at ±35%.
 */
export function pitcherDistribution(profile, propType, lineup = null) {
  const parametric = pitcherParametric(profile, propType, lineup);
  if (!parametric) return null;
  if (norm(propType) === 'pitcher_outs') return parametric; // already empirical
  const empirical = empiricalDistribution(profile.rows, propType, profile.asOf);
  return blendDists(empirical, parametric, profile.starts);
}

function pitcherParametric(profile, propType, lineup = null) {
  const t = norm(propType);
  const bfInt = Math.max(6, Math.round(profile.expectedBf));
  const bfDist = new Map([[bfInt, 0.5], [Math.max(6, bfInt - 2), 0.25], [bfInt + 2, 0.25]]);
  const scale = (key, leagueKey) => {
    const l = lineup?.[key];
    if (!Number.isFinite(l) || !l) return 1;
    return Math.min(1.35, Math.max(0.65, l / LEAGUE[leagueKey]));
  };
  const bern = (p) => mixOverPa(bfDist, (bf) => binomial(bf, Math.min(0.95, Math.max(0.001, p))));
  switch (t) {
    case 'pitcher_strikeouts': return bern(profile.rates.k * scale('k', 'k'));
    case 'pitcher_walks': return bern(profile.rates.bb * scale('bb', 'bb'));
    case 'pitcher_hits_allowed': return bern(profile.rates.h * scale('hits', 'hits'));
    case 'pitcher_earned_runs': return mixOverPa(bfDist, (bf) => poisson(Math.max(0.01, profile.rates.er * bf)));
    case 'pitcher_outs': return outsDistribution(profile.outs);
    default: return null;
  }
}

/** The opposing nine's per-PA k / bb / hits rates from their rows (as of a date). */
export function lineupRates(batterRows, { asOf = null } = {}) {
  let pa = 0, k = 0, bb = 0, hits = 0, covered = 0;
  for (const rows of batterRows || []) {
    const games = hitterGames(rowsBefore(rows, asOf));
    const s = games.reduce((a, r) => {
      a.pa += Number(r.plate_appearances) || Number(r.at_bats) || 0;
      a.k += Number(r.k) || 0; a.bb += Number(r.bb) || 0; a.hits += Number(r.hits) || 0;
      return a;
    }, { pa: 0, k: 0, bb: 0, hits: 0 });
    if (!s.pa) continue;
    covered += 1; pa += s.pa; k += s.k; bb += s.bb; hits += s.hits;
  }
  if (covered < 5 || !pa) return null;
  return { k: k / pa, bb: bb / pa, hits: hits / pa, covered };
}

/** American odds → implied probability (with vig). */
export const implied = (odds) => {
  const o = Number(odds);
  if (!Number.isFinite(o) || o === 0) return null;
  return o > 0 ? 100 / (o + 100) : -o / (-o + 100);
};

/** The two sides' vig-free probabilities (multiplicative normalization). */
export function marketProbabilities(overOdds, underOdds) {
  const po = implied(overOdds);
  const pu = implied(underOdds);
  if (po == null && pu == null) return null;
  if (po == null) return { over: 1 - pu, under: pu, oneSided: true };
  if (pu == null) return { over: po, under: 1 - po, oneSided: true };
  const s = po + pu;
  return { over: po / s, under: pu / s, oneSided: false };
}

/** Units won at American odds for a 1-unit stake. */
export const payout = (odds) => {
  const o = Number(odds);
  return o > 0 ? o / 100 : 100 / Math.abs(o);
};

/**
 * Screen one board. `context.rowsFor(playerKey)` → chrono rows; `context.asOf`
 * → the date rows must precede (replay) or null (live);
 * `context.lineupFor(playerKey)` → the opposing nine's rates for a pitcher.
 * Returns every market with a model number, ranked by the better side's gap.
 */
export function screenBoard(markets, context) {
  const out = [];
  const profiles = new Map();
  for (const m of markets || []) {
    if (!m?.player || !m?.prop_type || m.line == null) continue;
    const key = norm(m.player);
    const rows = context.rowsFor(key);
    if (!rows || !rows.length) continue;
    const isPitcher = norm(m.prop_type).startsWith('pitcher_');
    let profile = profiles.get(`${key}|${isPitcher}`);
    if (!profile) {
      profile = isPitcher
        ? pitcherProfile(rows, { asOf: context.asOf })
        : hitterProfile(rows, { asOf: context.asOf, slot: context.slotFor ? context.slotFor(key) : null });
      profiles.set(`${key}|${isPitcher}`, profile);
    }
    if ((isPitcher ? profile.starts : profile.games) < 5) continue;
    const dist = isPitcher
      ? pitcherDistribution(profile, m.prop_type, context.lineupFor ? context.lineupFor(key) : null)
      : hitterDistribution(profile, m.prop_type, context.oppPitcherFor ? context.oppPitcherFor(key) : null);
    if (!dist) continue;
    const mkt = marketProbabilities(m.over_odds, m.under_odds);
    if (!mkt) continue;
    // The book's number is information too: the model's P(over) is shrunk
    // toward the vig-free market probability (context.marketBlend, default
    // 0.5 — the August replay's best-calibrated weight: every decile of the
    // blended number hit within a point of itself) and the ranking is left
    // to the disagreement that survives.
    const beta = Number.isFinite(context.marketBlend) ? context.marketBlend : 0.5;
    const pOver = mkt.oneSided ? probOver(dist, m.line) : (1 - beta) * probOver(dist, m.line) + beta * mkt.over;
    const edgeOver = m.over_odds != null ? pOver - mkt.over : null;
    const edgeUnder = m.under_odds != null ? (1 - pOver) - mkt.under : null;
    const side = edgeUnder != null && (edgeOver == null || edgeUnder > edgeOver) ? 'under' : 'over';
    const edge = side === 'under' ? edgeUnder : edgeOver;
    out.push({
      market: m, side, edge,
      pModel: side === 'over' ? pOver : 1 - pOver,
      pMarket: side === 'over' ? mkt.over : mkt.under,
      odds: side === 'over' ? m.over_odds : m.under_odds,
      oneSided: mkt.oneSided,
      sample: isPitcher ? profile.starts : profile.games,
    });
  }
  return out.sort((a, b) => b.edge - a.edge);
}
