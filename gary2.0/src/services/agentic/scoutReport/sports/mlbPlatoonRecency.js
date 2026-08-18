/**
 * PLATOON RECENCY (founder GO, Aug 18 2026 — the audit's Tier 3): every
 * platoon split on the desk was a season aggregate with no time axis, so
 * "is he still giving up lots of hits to lefties — his last time out?" and
 * "who were those righty hitters?" had no answer anywhere. BDL plate
 * appearances carry batter_side, pitcher_hand, and a result string per PA
 * (verified live Aug 18), so the per-start vs-hand ledger is computable from
 * the same cached PA payloads the whiff-by-start device already fetches.
 * Facts only — what a split's drift means for tonight is the brain's read.
 */
import { ballDontLieService } from '../../../ballDontLieService.js';
import { toEtDate } from './mlbSeriesState.js';

const MAX_STARTS = 5;

/** Tolerant PA-result classifier. BDL result strings are display words
 *  ("Single", "Groundout", "Home Run", "Walk", "Strikeout", ...). Unknown
 *  words count as at-bat outs — never as hits. */
export function classifyPaResult(result) {
  const r = String(result || '').toLowerCase();
  const isHit = /^single|^double|^triple|home ?run/.test(r);
  const isHr = /home ?run/.test(r);
  const isBb = /walk|intent/.test(r);
  const isHbp = /hit by pitch/.test(r);
  const isK = /strike ?out|struck out/.test(r);
  const isSac = /sac/.test(r);
  const isInterference = /interference/.test(r);
  const isAb = !isBb && !isHbp && !isSac && !isInterference && r.length > 0;
  return { isAb, isHit, isHr, isBb, isK };
}

const emptySide = () => ({ ab: 0, h: 0, hr: 0, bb: 0, k: 0 });

function foldInto(side, cls) {
  if (cls.isAb) side.ab += 1;
  if (cls.isHit) side.h += 1;
  if (cls.isHr) side.hr += 1;
  if (cls.isBb) side.bb += 1;
  if (cls.isK) side.k += 1;
}

const fmtSide = (s) => {
  if (s.ab === 0 && s.bb === 0) return 'not faced';
  const bits = [`${s.h}-${s.ab}`];
  if (s.hr) bits.push(`${s.hr} HR`);
  if (s.bb) bits.push(`${s.bb} BB`);
  if (s.k) bits.push(`${s.k} K`);
  return bits.join(', ');
};

/**
 * Per-start vs-hand ledger for a starting pitcher, from his own recent
 * appearances' plate-appearance payloads (cached per finished game).
 * Returns { lines: [..], latest: { date, damage: [...] } } or null.
 * `startLabels` maps an ET date to "vs/@ Opponent" from the statsapi ledger
 * so the rows read like the rest of the starter block.
 */
export async function computeSpVsHandByStart({ pitcherBdlId, season, startLabels = new Map() }) {
  if (pitcherBdlId == null) return null;
  const chrono = await ballDontLieService.getMlbPlayerGameRowsChrono(pitcherBdlId, season).catch(() => []);
  const startRows = (chrono || []).filter((r) => r?.ip != null && parseFloat(r.ip) > 0).slice(-MAX_STARTS);
  if (!startRows.length) return null;
  const pid = String(pitcherBdlId);

  const perStart = [];
  for (const row of startRows) {
    const pas = await ballDontLieService.getMlbPlateAppearances(row.game_id).catch(() => []);
    const mine = (pas || []).filter((pa) => String(pa.pitcher_id) === pid);
    if (!mine.length) continue;
    const vsL = emptySide();
    const vsR = emptySide();
    const hitters = []; // { batterId, side, result } for the damage line
    for (const pa of mine) {
      const cls = classifyPaResult(pa.result);
      const side = String(pa.batter_side || '').toUpperCase() === 'L' ? vsL : vsR;
      foldInto(side, cls);
      if (cls.isHit) hitters.push({ batterId: pa.batter_id, side: String(pa.batter_side || '?').toUpperCase(), result: pa.result });
    }
    // ET official date, never a raw UTC slice — West-Coast night games land
    // on the wrong day otherwise (the recurring join lesson).
    const date = toEtDate(row._game?.date || row.game?.date || row.date || '');
    perStart.push({ date, vsL, vsR, hitters });
  }
  if (!perStart.length) return null;

  const lines = perStart.map((s) => {
    const label = startLabels.get(s.date) || '';
    return `${s.date}${label ? ` ${label}` : ''}: vs LHB ${fmtSide(s.vsL)} | vs RHB ${fmtSide(s.vsR)}`;
  });

  // WHO did the damage in his most recent start — names + the side they hit
  // from (founder's literal question). Identity lookup is one cached call.
  let damageLine = null;
  const latest = perStart[perStart.length - 1];
  if (latest?.hitters?.length) {
    const players = await ballDontLieService.getMlbPlayersByIds(latest.hitters.map((h) => h.batterId)).catch(() => []);
    const nameOf = new Map(players.map((p) => [String(p.id), p.last_name || p.full_name || '?']));
    const byBatter = new Map();
    for (const h of latest.hitters) {
      const key = String(h.batterId);
      const acc = byBatter.get(key) || { side: h.side, results: [] };
      acc.results.push(String(h.result || 'hit').toLowerCase());
      byBatter.set(key, acc);
    }
    const parts = [...byBatter.entries()].map(([id, a]) => {
      const nm = nameOf.get(id) || '?';
      return `${nm} (${a.side}HB: ${a.results.join(', ')})`;
    });
    if (parts.length) damageLine = `Hits off him last start (${latest.date}): ${parts.join(' · ')}`;
  }

  return { lines, damageLine };
}

/**
 * Tonight's confirmed hitters vs tonight's opposing starter, THIS SEASON —
 * the desk-legal batter-vs-pitcher (current season only, per the Aug 10
 * no-prior-season ruling). Built from the PAs of his starts against this
 * club. Returns a single line or null.
 */
export async function computeSeasonBvpForLineup({ pitcherBdlId, pitcherLastName, gameIds = [], lineupBatters = [] }) {
  if (pitcherBdlId == null || !gameIds.length || !lineupBatters.length) return null;
  const pid = String(pitcherBdlId);
  const wanted = new Map(); // bdl batter id -> display name
  for (const b of lineupBatters) {
    if (b?.playerId != null) wanted.set(String(b.playerId), String(b.name || '').split(' ').pop());
  }
  if (!wanted.size) return null;

  const agg = new Map(); // batterId -> { ab, h, hr, bb, k }
  for (const gid of gameIds) {
    const pas = await ballDontLieService.getMlbPlateAppearances(gid).catch(() => []);
    for (const pa of pas || []) {
      if (String(pa.pitcher_id) !== pid) continue;
      const bid = String(pa.batter_id);
      if (!wanted.has(bid)) continue;
      const acc = agg.get(bid) || emptySide();
      foldInto(acc, classifyPaResult(pa.result));
      agg.set(bid, acc);
    }
  }
  const parts = [...agg.entries()]
    .filter(([, a]) => a.ab > 0 || a.bb > 0)
    .sort((x, y) => (y[1].h + y[1].hr) - (x[1].h + x[1].hr))
    .map(([bid, a]) => `${wanted.get(bid)} ${fmtSide(a)}`);
  return parts.length
    ? `Tonight's hitters vs ${pitcherLastName} this season: ${parts.join(' | ')}`
    : null;
}

/**
 * Per-start pitch-type effectiveness for a starter's recent outings — the
 * arsenal's own recency axis ("his slider stopped missing bats in August").
 * Uses BDL pitcher_pitch_type_game_stats (gameIds variant). Prints the two
 * pitches he leans on most across the window. Null on thin/absent data.
 */
export async function computePitchTypeTrendByStart({ pitcherBdlId, gameIds = [] }) {
  if (pitcherBdlId == null || gameIds.length < 2) return null;
  const rows = await ballDontLieService.getMlbPitcherPitchTypeStats({ playerIds: [pitcherBdlId], gameIds }).catch(() => []);
  if (!Array.isArray(rows) || !rows.length) return null;
  const gameOf = (r) => r.game_id ?? r.game?.id ?? null;
  const orderIndex = new Map(gameIds.map((id, i) => [String(id), i]));
  const byPitch = new Map(); // pitch_type -> { usage: total, points: Map(gameIdx -> {whiff, xwoba}) }
  for (const r of rows) {
    const gid = gameOf(r);
    if (gid == null || !orderIndex.has(String(gid))) continue;
    const pt = r.pitch_type || 'unknown';
    const acc = byPitch.get(pt) || { usage: 0, points: new Map() };
    acc.usage += Number(r.pitch_usage_percent) || 0;
    acc.points.set(orderIndex.get(String(gid)), {
      whiff: r.whiff_percent != null ? Math.round(Number(r.whiff_percent)) : null,
      xwoba: r.xwoba != null ? Number(r.xwoba).toFixed(3).replace(/^0/, '') : null,
    });
    byPitch.set(pt, acc);
  }
  const top = [...byPitch.entries()]
    .filter(([, a]) => a.points.size >= 2)
    .sort((x, y) => y[1].usage - x[1].usage)
    .slice(0, 2);
  if (!top.length) return null;
  const seq = (a, f) => gameIds.map((_, i) => a.points.get(i)?.[f] ?? '—').join(' → ');
  const lines = top.map(([pt, a]) =>
    `${pt}: whiff ${seq(a, 'whiff')}%, xwOBA ${seq(a, 'xwoba')}`);
  return `By start (oldest→newest, his top pitches): ${lines.join('  ·  ')}`;
}

export default { classifyPaResult, computeSpVsHandByStart, computeSeasonBvpForLineup, computePitchTypeTrendByStart };
