// THE NFL VOLUME MODEL (founder GO, Sep 23 2026).
//
// The NFL props desk had no pricing formula: Gary read the whole board with
// each player's cleared counts. This is the top-down model sharp football
// bettors build, priced against the consensus of the books:
//
//   1. TEAM VOLUME — offensive plays from the team's own pace and the
//      opponent's plays allowed; the dropback rate from the team's own rate,
//      moved by the spread (a trailing team throws, a leading team runs).
//   2. OPPONENT — yards per pass attempt and per carry the defense allows,
//      against the league.
//   3. PLAYER SHARE — his share of the team's targets and carries in the
//      games he played, recent games counted double, last season carried as
//      a prior while this season is short (NFL law: small samples are counts).
//   4. EFFICIENCY — catch rate, yards per target, per carry, per attempt,
//      completion and touchdown rates, each shrunk toward the position.
//   5. A SEEDED SIMULATION of his game (6,000 draws) gives every market's
//      chance; the chance is blended with the consensus price like MLB.
//
// Team box scores come from BDL /nfl/v1/team_stats (season_type scalar,
// game_ids only with seasons — see the bdl-football-team-stats-filters
// memory); prior seasons are cached on disk for good.

import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ballDontLieService } from '../ballDontLieService.js';

const SPORT = 'americanfootball_nfl';
const CACHE_DIR = fileURLToPath(new URL('../../../.cache/nfl-team-boxes/', import.meta.url));
const SIMS = 6000;
const PRIOR_SEASON_GAME_WEIGHT = 0.5;

export const NFL_LEAGUE = {
  plays: 62, dropbackRate: 0.60, sackRate: 0.065, netYpa: 6.2, ypc: 4.3, pointsPerGame: 22,
  catchRate: { WR: 0.63, TE: 0.70, RB: 0.77, FB: 0.75 },
  ypt: { WR: 8.2, TE: 7.1, RB: 5.7, FB: 5.0 },
  compPct: 0.645, grossYpa: 6.9, tdRate: 0.043, intRate: 0.022,
  tdPerGame: { WR: 0.33, TE: 0.25, RB: 0.42, QB: 0.12, FB: 0.1 },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const norm = s => String(s || '').toLowerCase().trim();

// ── team boxes ───────────────────────────────────────────────────────────────
async function cachedRows(key, fetcher, maxAgeMs) {
  const file = `${CACHE_DIR}${key}.json`;
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    if (maxAgeMs == null || Date.now() - saved.at < maxAgeMs) return saved.rows;
  } catch { /* fetch below */ }
  const rows = await fetcher();
  await mkdir(CACHE_DIR, { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify({ at: Date.now(), rows }));
  await rename(tmp, file);
  return rows;
}

const finalRow = r => String(r?.game?.status || '').toLowerCase().includes('final') || r?.game?.status_state === 'final';

/** A team's own boxes and its opponents' boxes (the defense) for one regular season. */
async function teamSeason(teamId, season, current) {
  const maxAge = current ? 6 * 3600000 : null;
  const own = (await cachedRows(`own-${season}-${teamId}`, () =>
    ballDontLieService.getTeamStats(SPORT, { seasons: [season], team_ids: [teamId], season_type: 2, per_page: 100 }), maxAge))
    .filter(r => finalRow(r) && String(r.team?.id) === String(teamId));
  const gameIds = own.map(r => r.game?.id).filter(Boolean);
  const opp = gameIds.length ? (await cachedRows(`opp-${season}-${teamId}`, () =>
    ballDontLieService.getTeamStats(SPORT, { seasons: [season], game_ids: gameIds, per_page: 100 }), maxAge))
    .filter(r => finalRow(r) && String(r.team?.id) !== String(teamId) && gameIds.includes(r.game?.id)) : [];
  return { own, opp };
}

function offenseLine(rows) {
  const t = rows.reduce((a, r) => {
    const isHome = String(r.game?.home_team?.id) === String(r.team?.id);
    a.plays += n(r.total_offensive_plays); a.att += n(r.passing_attempts); a.sacks += n(r.sacks);
    a.netPass += n(r.net_passing_yards); a.rushAtt += n(r.rushing_attempts); a.rushYds += n(r.rushing_yards);
    a.points += n(isHome ? r.game?.home_team_score : r.game?.visitor_team_score); a.games += 1;
    return a;
  }, { plays: 0, att: 0, sacks: 0, netPass: 0, rushAtt: 0, rushYds: 0, points: 0, games: 0 });
  return t;
}

/** Blend this season with last season (half weight per game), then shrink to the league with a 3-game prior. */
function teamRates(cur, prior) {
  const w = PRIOR_SEASON_GAME_WEIGHT;
  const sum = k => n(cur[k]) + w * n(prior[k]);
  const games = n(cur.games) + w * n(prior.games);
  const G = 3;
  const plays = sum('plays'), att = sum('att'), sacks = sum('sacks'), rushAtt = sum('rushAtt');
  return {
    games: cur.games,
    plays: (plays + G * NFL_LEAGUE.plays) / (games + G),
    dropbackRate: ((att + sacks) + G * NFL_LEAGUE.plays * NFL_LEAGUE.dropbackRate) / (plays + G * NFL_LEAGUE.plays),
    sackRate: (sacks + G * 38 * NFL_LEAGUE.sackRate) / (att + sacks + G * 38),
    netYpa: (sum('netPass') + G * 34 * NFL_LEAGUE.netYpa) / (att + sacks + G * 34),
    ypc: (sum('rushYds') + G * 26 * NFL_LEAGUE.ypc) / (rushAtt + G * 26),
    pointsPerGame: (sum('points') + G * NFL_LEAGUE.pointsPerGame) / (games + G),
  };
}

/** Everything the simulation needs about both teams, or null when a box read fails. */
export async function buildNflGameContext({ game, season, spreadHome, total }) {
  try {
    const [home, away] = await Promise.all([
      ballDontLieService.getTeamByNameGeneric(SPORT, game.home_team),
      ballDontLieService.getTeamByNameGeneric(SPORT, game.away_team),
    ]);
    if (!home?.id || !away?.id) return null;
    const load = async (id) => {
      const [cur, prior] = await Promise.all([teamSeason(id, season, true), teamSeason(id, season - 1, false)]);
      return {
        offense: teamRates(offenseLine(cur.own), offenseLine(prior.own)),
        defense: teamRates(offenseLine(cur.opp), offenseLine(prior.opp)),
        boxes: new Map([...cur.own, ...prior.own].map(r => [String(r.game?.id), r])),
      };
    };
    const [h, a] = await Promise.all([load(home.id), load(away.id)]);
    const spread = Number.isFinite(Number(spreadHome)) ? Number(spreadHome) : 0;
    const tot = Number.isFinite(Number(total)) ? Number(total) : null;
    const side = (us, them, teamSpread, implied) => {
      const plays = 0.5 * us.offense.plays + 0.5 * them.defense.plays;
      const dropbackRate = clamp(us.offense.dropbackRate + 0.006 * teamSpread, 0.45, 0.75);
      const dropbacks = plays * dropbackRate;
      return {
        plays, dropbackRate,
        passAtt: dropbacks * (1 - us.offense.sackRate),
        rushAtt: plays - dropbacks,
        passYdsFactor: clamp(them.defense.netYpa / NFL_LEAGUE.netYpa, 0.85, 1.15),
        rushYdsFactor: clamp(them.defense.ypc / NFL_LEAGUE.ypc, 0.85, 1.15),
        scoringFactor: implied != null ? clamp(implied / us.offense.pointsPerGame, 0.7, 1.35) : 1,
        boxes: us.boxes,
        teamId: String(us === h ? home.id : away.id),
      };
    };
    const homeImplied = tot != null ? (tot - spread) / 2 : null;
    const awayImplied = tot != null ? (tot + spread) / 2 : null;
    return {
      home: side(h, a, spread, homeImplied),
      away: side(a, h, -spread, awayImplied),
      names: { home: norm(home.full_name || game.home_team), away: norm(away.full_name || game.away_team) },
    };
  } catch (error) {
    console.warn(`[NFL Model] team context unavailable: ${error.message}`);
    return null;
  }
}

// ── player profile ──────────────────────────────────────────────────────────
/** Shares and efficiencies from his games (this season full weight, last season half). */
export function nflPlayerProfile({ current = [], prior = [], position, teamSide }) {
  const pos = String(position || '').toUpperCase();
  const rows = [
    ...current.map((g, i) => ({ g, w: i < 3 ? 2 : 1 })),
    ...prior.slice(0, 8).map(g => ({ g, w: PRIOR_SEASON_GAME_WEIGHT })),
  ];
  if (!rows.length) return null;
  let tgt = 0, teamAtt = 0, car = 0, teamRush = 0, wSum = 0;
  const tdRaw = { tds: 0, games: 0 };
  const raw = { targets: 0, rec: 0, recYds: 0, rushAtt: 0, rushYds: 0, passAtt: 0, comp: 0, passYds: 0, passTd: 0, ints: 0, tds: 0, games: 0 };
  for (const { g, w } of rows) {
    const box = teamSide?.boxes?.get(String(g.gameId));
    if (box) {
      tgt += w * n(g.targets); teamAtt += w * n(box.passing_attempts);
      car += w * n(g.rush_att); teamRush += w * n(box.rushing_attempts);
    }
    wSum += w;
    raw.targets += w * n(g.targets); raw.rec += w * n(g.receptions); raw.recYds += w * n(g.rec_yds);
    raw.rushAtt += w * n(g.rush_att); raw.rushYds += w * n(g.rush_yds);
    raw.passAtt += w * n(g.pass_att); raw.comp += w * n(g.pass_comp); raw.passYds += w * n(g.pass_yds);
    raw.passTd += w * n(g.pass_tds); raw.ints += w * n(g.ints);
    raw.tds += w * (n(g.rush_tds) + n(g.rec_tds)); raw.games += w;
    // Touchdowns are too rare for the recent-games double weight: they count once.
    tdRaw.tds += (w === 2 ? 1 : w) * (n(g.rush_tds) + n(g.rec_tds)); tdRaw.games += (w === 2 ? 1 : w);
  }
  const catchPrior = NFL_LEAGUE.catchRate[pos] ?? 0.66;
  const yptPrior = NFL_LEAGUE.ypt[pos] ?? 7.5;
  const isQb = pos === 'QB' || raw.passAtt / Math.max(1, raw.games) >= 10;
  return {
    position: pos, isQb, games: current.length, weightedGames: raw.games,
    targetShare: teamAtt > 0 ? tgt / teamAtt : null,
    carryShare: teamRush > 0 ? car / teamRush : null,
    targetsPerGame: raw.targets / raw.games, carriesPerGame: raw.rushAtt / raw.games,
    catchRate: (raw.rec + 20 * catchPrior) / (raw.targets + 20),
    ypt: (raw.recYds + 30 * yptPrior) / (raw.targets + 30),
    ypc: (raw.rushYds + 40 * NFL_LEAGUE.ypc) / (raw.rushAtt + 40),
    passShare: isQb ? 1 : 0,
    compPct: (raw.comp + 100 * NFL_LEAGUE.compPct) / (raw.passAtt + 100),
    grossYpa: (raw.passYds + 150 * NFL_LEAGUE.grossYpa) / (raw.passAtt + 150),
    tdRate: (raw.passTd + 150 * NFL_LEAGUE.tdRate) / (raw.passAtt + 150),
    intRate: (raw.ints + 200 * NFL_LEAGUE.intRate) / (raw.passAtt + 200),
    tdPerGame: Math.min(0.9, (tdRaw.tds + 12 * (NFL_LEAGUE.tdPerGame[pos] ?? 0.25)) / (tdRaw.games + 12)),
  };
}

// ── simulation ──────────────────────────────────────────────────────────────
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = s => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
function normal(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function gamma(r, shape, scale) {
  if (shape < 1) return gamma(r, shape + 1, scale) * Math.pow(r(), 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = normal(r); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = r();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
  }
}
function poisson(r, lambda) {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(r)));
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}
const negBin = (r, mean, shape = 6) => (mean > 0 ? poisson(r, gamma(r, shape, mean / shape)) : 0);
function binomial(r, trials, p) { let k = 0; for (let i = 0; i < trials; i++) if (r() < p) k++; return k; }

/** The player's simulated games: arrays of every stat a market can settle on. */
export function simulateNflPlayer(profile, side, key) {
  const r = rng(seedOf(key));
  const out = { receptions: [], receiving_yards: [], rushing_yards: [], rushing_attempts: [], rushing_receiving_yards: [],
    passing_yards: [], passing_attempts: [], passing_completions: [], passing_tds: [], interceptions: [], anytime_td: [] };
  const tMean = profile.targetShare != null ? profile.targetShare * side.passAtt : profile.targetsPerGame;
  const cMean = profile.carryShare != null ? profile.carryShare * side.rushAtt : profile.carriesPerGame;
  const ypr = profile.catchRate > 0 ? profile.ypt / profile.catchRate : 10;
  const tdMean = profile.tdPerGame * side.scoringFactor;
  for (let i = 0; i < SIMS; i++) {
    const targets = negBin(r, tMean);
    const rec = binomial(r, targets, profile.catchRate);
    let recYds = 0;
    for (let j = 0; j < rec; j++) recYds += gamma(r, 1.3, (ypr * side.passYdsFactor) / 1.3);
    const carries = negBin(r, cMean);
    const rushYds = carries ? carries * profile.ypc * side.rushYdsFactor + Math.sqrt(carries) * 5.8 * normal(r) : 0;
    out.receptions.push(rec);
    out.receiving_yards.push(recYds);
    out.rushing_attempts.push(carries);
    out.rushing_yards.push(rushYds);
    out.rushing_receiving_yards.push(recYds + rushYds);
    out.anytime_td.push(poisson(r, tdMean) > 0 ? 1 : 0);
    if (profile.isQb) {
      const att = Math.max(0, Math.round(side.passAtt + 5 * normal(r)));
      out.passing_attempts.push(att);
      out.passing_completions.push(binomial(r, att, profile.compPct));
      out.passing_yards.push(att * profile.grossYpa * side.passYdsFactor + Math.sqrt(att) * 7.5 * normal(r));
      out.passing_tds.push(poisson(r, att * profile.tdRate * side.scoringFactor));
      out.interceptions.push(poisson(r, att * profile.intRate));
    }
  }
  return out;
}

const STAT_KEY = {
  receptions: 'receptions', player_receptions: 'receptions',
  receiving_yards: 'receiving_yards', rec_yds: 'receiving_yards', player_rec_yds: 'receiving_yards',
  rushing_yards: 'rushing_yards', rush_yds: 'rushing_yards', player_rush_yds: 'rushing_yards',
  rushing_attempts: 'rushing_attempts', rush_attempts: 'rushing_attempts', player_rush_attempts: 'rushing_attempts',
  rushing_receiving_yards: 'rushing_receiving_yards', rush_rec_yds: 'rushing_receiving_yards',
  passing_yards: 'passing_yards', pass_yds: 'passing_yards', player_pass_yds: 'passing_yards',
  passing_attempts: 'passing_attempts', pass_attempts: 'passing_attempts', player_pass_attempts: 'passing_attempts',
  passing_completions: 'passing_completions', completions: 'passing_completions', pass_completions: 'passing_completions', player_completions: 'passing_completions',
  passing_tds: 'passing_tds', passing_touchdowns: 'passing_tds', pass_tds: 'passing_tds', player_pass_tds: 'passing_tds',
  interceptions: 'interceptions', player_interceptions: 'interceptions',
  anytime_td: 'anytime_td', anytime_touchdown: 'anytime_td', player_anytime_td: 'anytime_td',
};

const implied = o => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
// A one-priced "yes" (anytime TD) carries the book's margin on one side; take
// a typical 7% off so the gap is measured against a fair chance.
const ONE_SIDED_MARGIN = 1.07;

/**
 * Screen an NFL board the way propModel.screenBoard screens MLB: every market
 * the model can price, each side's gap to the consensus (or de-vigged) price.
 */
export function screenNflBoard(markets, { context, profileFor }) {
  const out = [];
  const sims = new Map();
  for (const m of markets || []) {
    const stat = STAT_KEY[norm(m?.prop_type)];
    if (!stat || m.line == null) continue;
    const key = norm(m.player);
    const entry = profileFor(key, m);
    if (!entry?.profile || !entry.side) continue;
    if (!sims.has(key)) sims.set(key, simulateNflPlayer(entry.profile, entry.side, `${key}|${m.game_id ?? ''}`));
    const values = sims.get(key)[stat];
    if (!values?.length) continue;
    const line = Number(m.line);
    const pModelOver = values.filter(v => v > line).length / values.length;
    const consensus = Number.isFinite(m.fair_over) && m.fair_over > 0 && m.fair_over < 1;
    let mkt;
    if (consensus) mkt = { over: m.fair_over, under: 1 - m.fair_over, oneSided: false };
    else if (m.over_odds != null && m.under_odds != null) {
      const po = implied(Number(m.over_odds)), pu = implied(Number(m.under_odds));
      mkt = { over: po / (po + pu), under: pu / (po + pu), oneSided: false };
    } else if (m.over_odds != null) {
      const po = implied(Number(m.over_odds)) / ONE_SIDED_MARGIN;
      mkt = { over: po, under: 1 - po, oneSided: true };
    } else continue;
    // Every market blends the model with the price the same way, so a
    // one-priced anytime-TD gap is measured on the same footing as a two-sided
    // yardage gap (Sep 24 2026: unblended one-sided gaps read about twice as
    // large and crowded the touchdown markets onto the shortlist).
    const pOver = 0.5 * pModelOver + 0.5 * mkt.over;
    const edgeOver = m.over_odds != null ? pOver - mkt.over : null;
    const edgeUnder = m.under_odds != null ? (1 - pOver) - mkt.under : null;
    const sideTaken = edgeUnder != null && (edgeOver == null || edgeUnder > edgeOver) ? 'under' : 'over';
    const edge = sideTaken === 'under' ? edgeUnder : edgeOver;
    out.push({
      market: m, side: sideTaken, edge,
      pModel: sideTaken === 'over' ? pOver : 1 - pOver,
      pMarket: sideTaken === 'over' ? mkt.over : mkt.under,
      odds: sideTaken === 'over' ? m.over_odds : m.under_odds,
      oneSided: mkt.oneSided,
      sample: entry.profile.games,
      fairBooks: consensus ? (m.fair_books ?? null) : 0,
      adjust: { plays: +entry.side.plays.toFixed(1), dropback: +entry.side.dropbackRate.toFixed(3), pass_def: +entry.side.passYdsFactor.toFixed(3), rush_def: +entry.side.rushYdsFactor.toFixed(3) },
    });
  }
  return out.sort((a, b) => b.edge - a.edge);
}
