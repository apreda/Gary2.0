/**
 * THE SHADOW MODEL (founder GO, Sep 3 2026 — "let's build your system too
 * and test it for the last 3 weeks of MLB to see which system is better").
 *
 * The market is the starting number; the model moves it only for what is
 * new since the line was set and what the desk already fetches in
 * structured form: which leverage arms are actually available tonight, how
 * many regulars are missing from the confirmed nine, and whether the
 * starter is on a short leash. Then every ticket on the board is priced
 * against the adjusted number and the best one is the bet. Weights are
 * small, in probability points, hand-set to start and refit weekly against
 * the closing line. Pure functions; shadowPick.js owns the fetches.
 *
 * Nothing here reaches Gary. It is a second system running beside him.
 */

export const DEFAULT_WEIGHTS = {
  pen: 2.0,        // points per full unit of (home pen availability − away pen availability), each 0..1
  lineup: 0.8,     // points per missing regular, cap 3 a side
  leash: 1.0,      // points against a side whose starter is on a short leash
  rlShare: 0.8,    // how much of the moneyline move the run line inherits
  cap: 4.0,        // total adjustment cap, points
};

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const clamp = (p, lo = 0.02, hi = 0.98) => Math.max(lo, Math.min(hi, p));

/** American price → implied probability (vig in). */
export function implied(american) {
  const o = num(american);
  if (o == null || o === 0) return null;
  return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);
}

/** Vig-free probability of side A from a two-way price pair. */
export function deVig(priceA, priceB) {
  const a = implied(priceA);
  const b = implied(priceB);
  if (a == null || b == null) return null;
  return a / (a + b);
}

/** Decimal payout multiple (profit per unit staked) for an American price. */
export function profitPerUnit(american) {
  const o = num(american);
  if (o == null || o === 0) return null;
  return o > 0 ? o / 100 : 100 / Math.abs(o);
}

/** The board's own numbers: p(home) vig-free, and the run line when it is ±1.5 both sides. */
export function marketFromBoard(board) {
  const pHome = deVig(board?.moneyline_home, board?.moneyline_away);
  let runline = null;
  const sh = num(board?.spread_home);
  const sa = num(board?.spread_away);
  if (sh != null && sa != null && Math.abs(sh) === 1.5 && Math.abs(sa) === 1.5 && sh === -sa) {
    const fav = sh < 0 ? 'home' : 'away';
    const pFavCover = deVig(fav === 'home' ? board.spread_home_odds : board.spread_away_odds, fav === 'home' ? board.spread_away_odds : board.spread_home_odds);
    if (pFavCover != null) runline = { fav, pFavCover };
  }
  return { pHome, runline };
}

/** Median vig-free p(home) across every book on the game, when bookmakers ride the game. */
export function consensusHome(bookmakers, homeName, awayName) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const h = norm(homeName);
  const a = norm(awayName);
  const ps = [];
  for (const bk of Array.isArray(bookmakers) ? bookmakers : []) {
    const m = (bk?.markets || []).find((x) => x?.key === 'h2h');
    if (!m) continue;
    let ph = null;
    let pa = null;
    for (const o of m.outcomes || []) {
      const n = norm(o?.name);
      if (n && (n === h || h.endsWith(n) || n.endsWith(h))) ph = o.price;
      else if (n && (n === a || a.endsWith(n) || n.endsWith(a))) pa = o.price;
    }
    const p = deVig(ph, pa);
    if (p != null) ps.push(p);
  }
  if (!ps.length) return null;
  ps.sort((x, y) => x - y);
  const mid = Math.floor(ps.length / 2);
  return ps.length % 2 ? ps[mid] : (ps[mid - 1] + ps[mid]) / 2;
}

const shiftDate = (ymd, days) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Pen availability tonight: of the club's top four leverage arms (the pen
 * builder already sorts saves, holds, innings), how many can go. An arm is
 * down after 25+ pitches yesterday, after pitching both of the last two
 * days, or after three of the last four. Score 0..1.
 */
export function penAvailability(arms, todayEt) {
  const top = (Array.isArray(arms) ? arms : []).slice(0, 4);
  if (!top.length) return { score: null, available: 0, of: 0, down: [] };
  const d1 = shiftDate(todayEt, -1);
  const d2 = shiftDate(todayEt, -2);
  const d3 = shiftDate(todayEt, -3);
  const d4 = shiftDate(todayEt, -4);
  const down = [];
  let available = 0;
  for (const a of top) {
    const p = a?.sum?.pitchesByDate || {};
    const y = Number(p[d1] || 0);
    const pitched = (d) => Number(p[d] || 0) > 0;
    const reason = y >= 25 ? `${y} pitches yesterday`
      : pitched(d1) && pitched(d2) ? 'pitched both of the last two days'
        : [d1, d2, d3, d4].filter(pitched).length >= 3 ? 'three of the last four days'
          : null;
    if (reason) down.push(`${a.name} (${reason})`);
    else available += 1;
  }
  return { score: available / top.length, available, of: top.length, down };
}

/**
 * Starter leash from his last three starts' pitch counts: short when he
 * averages under 75 pitches or has not started in 12+ days (an IL return
 * or a spot start). Null when there is no log.
 */
export function starterLeash(log, todayEt) {
  const rows = (Array.isArray(log) ? log : []).filter((r) => (Number(r?.stat?.gamesStarted) || 0) > 0 && r?.date);
  if (!rows.length) return { expectedPitches: null, short: null, daysSince: null };
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const last3 = rows.slice(-3);
  const pitches = last3.map((r) => Number(r.stat?.numberOfPitches) || 0).filter((p) => p > 0);
  const expectedPitches = pitches.length ? Math.round(pitches.reduce((s, p) => s + p, 0) / pitches.length) : null;
  const lastDate = String(rows[rows.length - 1].date).slice(0, 10);
  const daysSince = Math.round((new Date(`${todayEt}T12:00:00Z`) - new Date(`${lastDate}T12:00:00Z`)) / 86400000);
  const short = (expectedPitches != null && expectedPitches < 75) || daysSince >= 12;
  return { expectedPitches, short, daysSince };
}

/** Accent-insensitive name key: "José Ramírez" and "Jose Ramirez" are one man. */
export const nameKey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const norm = nameKey;

/**
 * Regulars missing from the confirmed nine: a regular is a hitter with at
 * least 60% of the club's leader in games played, top nine by games. Null
 * when there is no confirmed lineup (nothing to compare).
 */
export function lineupAbsence(lineup, hitters) {
  if (!Array.isArray(lineup) || lineup.length < 9) return { missing: null, count: null };
  // Playing time by at-bats, not games: a defensive sub piles up games
  // without being a regular. Games played is the fallback.
  const hs = (Array.isArray(hitters) ? hitters : []).map((h) => ({ name: h?.player?.full_name || h?.name || '', gp: Number(h?.batting_ab ?? h?.ab ?? h?.batting_gp ?? h?.gp ?? 0) })).filter((h) => h.name);
  if (!hs.length) return { missing: null, count: null };
  const maxGp = Math.max(...hs.map((h) => h.gp));
  const regulars = hs.filter((h) => h.gp >= 0.6 * maxGp).sort((a, b) => b.gp - a.gp).slice(0, 9);
  const inLineup = new Set(lineup.map((b) => norm(b?.name)));
  const missing = regulars.filter((r) => !inLineup.has(norm(r.name))).map((r) => r.name);
  return { missing, count: missing.length };
}

/**
 * The adjustment, in probability points toward the HOME side, from the
 * features of both clubs. Every contribution is recorded as a driver.
 */
export function adjust(features, weights = DEFAULT_WEIGHTS) {
  const w = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  const drivers = [];
  let pts = 0;
  const hp = features?.home?.pen?.score;
  const ap = features?.away?.pen?.score;
  if (hp != null && ap != null && hp !== ap) {
    const d = (hp - ap) * w.pen;
    pts += d;
    drivers.push({ name: 'pen availability', pts: round1(d), detail: `home ${features.home.pen.available}/${features.home.pen.of} leverage arms available, away ${features.away.pen.available}/${features.away.pen.of}` });
  }
  for (const side of ['home', 'away']) {
    const miss = features?.[side]?.lineup?.count;
    if (miss) {
      const d = -w.lineup * Math.min(3, miss) * (side === 'home' ? 1 : -1);
      pts += d;
      drivers.push({ name: `${side} regulars missing`, pts: round1(d), detail: features[side].lineup.missing.join(', ') });
    }
    const leash = features?.[side]?.leash;
    if (leash?.short) {
      const d = -w.leash * (side === 'home' ? 1 : -1);
      pts += d;
      drivers.push({ name: `${side} starter short leash`, pts: round1(d), detail: leash.expectedPitches != null ? `${leash.expectedPitches} pitches a start, ${leash.daysSince} days since his last` : `${leash.daysSince} days since his last start` });
    }
  }
  const capped = Math.max(-w.cap, Math.min(w.cap, pts));
  return { pts: round1(capped), raw: round1(pts), drivers };
}
const round1 = (v) => Math.round(v * 10) / 10;

/**
 * Every ticket on the board priced against the adjusted number. Returns the
 * tickets sorted best first and the choice (least-bad when all are negative).
 */
export function priceTickets({ pHomeAdj, board, market, weights = DEFAULT_WEIGHTS, homeName, awayName, deltaPts }) {
  const w = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  const tickets = [];
  const push = (side, type, price, p, label) => {
    const ppu = profitPerUnit(price);
    if (ppu == null || p == null) return;
    tickets.push({ side, type, price: Number(price), p: Math.round(p * 10000) / 10000, ev: Math.round((p * ppu - (1 - p)) * 10000) / 10000, label });
  };
  push('home', 'moneyline', board?.moneyline_home, pHomeAdj, `${homeName} ML`);
  push('away', 'moneyline', board?.moneyline_away, 1 - pHomeAdj, `${awayName} ML`);
  if (market?.runline) {
    const favIsHome = market.runline.fav === 'home';
    const towardFav = (favIsHome ? 1 : -1) * (Number(deltaPts) || 0) / 100;
    const pFav = clamp(market.runline.pFavCover + towardFav * w.rlShare);
    const favName = favIsHome ? homeName : awayName;
    const dogName = favIsHome ? awayName : homeName;
    push(market.runline.fav, 'spread', favIsHome ? board.spread_home_odds : board.spread_away_odds, pFav, `${favName} -1.5`);
    push(favIsHome ? 'away' : 'home', 'spread', favIsHome ? board.spread_away_odds : board.spread_home_odds, 1 - pFav, `${dogName} +1.5`);
  }
  // Best EV first; a dead tie goes to the moneyline, then to the likelier side.
  tickets.sort((a, b) => (b.ev - a.ev) || (a.type !== b.type ? (a.type === 'moneyline' ? -1 : 1) : (b.p - a.p)));
  return { tickets, choice: tickets[0] || null };
}

/** The whole decision from a board and the two clubs' features. */
export function decide({ board, bookmakers = null, features, weights = DEFAULT_WEIGHTS, homeName, awayName }) {
  const market = marketFromBoard(board);
  const consensus = consensusHome(bookmakers, homeName, awayName);
  const pHomeMarket = consensus ?? market.pHome;
  if (pHomeMarket == null) return { ok: false, error: 'no moneyline pair on the board' };
  const adj = adjust(features, weights);
  const pHomeAdj = clamp(pHomeMarket + adj.pts / 100);
  const priced = priceTickets({ pHomeAdj, board, market, weights, homeName, awayName, deltaPts: adj.pts });
  if (!priced.choice) return { ok: false, error: 'no priced ticket' };
  return {
    ok: true,
    pHomeMarket: Math.round(pHomeMarket * 10000) / 10000,
    pHomeAdj: Math.round(pHomeAdj * 10000) / 10000,
    consensusBooks: consensus != null,
    adjustment: adj,
    tickets: priced.tickets,
    choice: priced.choice,
  };
}
