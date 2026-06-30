// gary2.0/src/services/insights/computers/wcXgRegression.js
//
// LANE: wcXgRegression  (category token emitted: xg_regression — iOS XG REGRESSION lane)
// "The finishing that won't last. Over a tournament a side's goals drift back
//  toward the chances it actually creates (xG). A team scoring far ABOVE its xG is
//  finishing hot — unsustainable, due to cool; one scoring far BELOW is creating
//  without converting — due to break out. This lane reads each team's cumulative
//  xG-for vs goals-for across completed matches and flags the most-stretched side
//  in TODAY'S fixtures as a forward regression read."
//
// FORWARD-LOOKING counterpart to wcXg (which RECAPS the last completed match day).
// This SCORES ctx.games (today's fixtures); the full completed-match set + team xG
// stats are only the lookup table. A side with < 2 completed matches -> skipped.
//
// DATA SHAPES (the same FIFA BDL endpoints wcXg uses, confirmed live 2026-06-08):
//   * getMatches({seasons}) completed row: { id, status:'completed',
//       home_team:{id,name}, away_team:{id,name}, home_score, away_score }.
//   * getTeamMatchStats([ids]) -> 2 rows per match:
//       { match_id, team_id, is_home, expected_goals, ... }.
//
// ROW SHAPE: one row per qualifying fixture. game = 'AWY @ HOM' (3-letter codes),
// game_id = the fixture id, value = 'xG +N.N' (goals/match above/below expected).
// relevance 58-78. Defensive: any missing piece -> skip the fixture, never throw.
// Pre-tournament (< 2 completed matches overall) -> [].

import fifaWorldCupService from '../../fifaWorldCupService.js';
import { makeRow, TONES, clampScore } from '../shared.js';

const wc = fifaWorldCupService;
const DEFAULT_SEASON = 2026;
const MIN_MATCHES = 2;          // a side needs >= 2 completed matches for a stable read
const MIN_GAP_PER_MATCH = 0.45; // goals/match above or below xG worth surfacing
const SCORE_BASE = 58;
const SCORE_PER = 12;           // + per goal/match of divergence
const SCORE_CAP = 78;

export async function computeWcXgRegression(ctx) {
  const season = Number(ctx?.season) || DEFAULT_SEASON;
  const games = Array.isArray(ctx?.games) ? ctx.games : [];
  if (!games.length) { console.log('[wcXgRegression] examined 0, emitted 0'); return []; }

  // 1. All completed matches this season + their per-team xG stats (one batched call).
  const all = await safe(() => wc.getMatches({ seasons: [season] }), []);
  const completed = (all || []).filter((m) => m?.status === 'completed');
  if (completed.length < 2) { console.log('[wcXgRegression] examined 0, emitted 0 (pre-tournament)'); return []; }
  const teamStats = await safe(() => wc.getTeamMatchStats(completed.map((m) => m.id)), []);
  const xgByMatchTeam = indexXg(teamStats);

  // 2. Accumulate per-team goals-for and xG-for across completed matches.
  const acc = new Map(); // teamId -> { name, matches, goalsFor, xgFor }
  for (const m of completed) {
    const hs = num(m.home_score), as = num(m.away_score);
    if (hs == null || as == null) continue;
    addTeam(acc, m.home_team, hs, xgByMatchTeam.get(`${m.id}|${m.home_team?.id}`));
    addTeam(acc, m.away_team, as, xgByMatchTeam.get(`${m.id}|${m.away_team?.id}`));
  }

  // 3. For each of today's fixtures, surface the more-stretched side (if any clears the gap).
  const rows = [];
  let examined = 0;
  for (const match of games) {
    examined += 1;
    const row = buildRegressionRow(match, acc);
    if (row) rows.push(row);
  }
  console.log(`[wcXgRegression] examined ${examined}, emitted ${rows.length}`);
  return rows;
}

function addTeam(acc, team, goals, xg) {
  if (!team?.id || xg == null) return;
  const k = String(team.id);
  const cur = acc.get(k) || { name: team.name, matches: 0, goalsFor: 0, xgFor: 0 };
  cur.matches += 1;
  cur.goalsFor += goals;
  cur.xgFor += xg;
  acc.set(k, cur);
}

function buildRegressionRow(match, acc) {
  const home = match?.home_team, away = match?.away_team;
  if (!home?.id || !away?.id) return null;

  // The more-stretched side: largest |goals - xG| per match that clears the threshold.
  const cand = [gapFor(acc.get(String(home.id)), home), gapFor(acc.get(String(away.id)), away)]
    .filter(Boolean)
    .filter((c) => Math.abs(c.gap) >= MIN_GAP_PER_MATCH)
    .sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap))[0];
  if (!cand) return null;

  const hot = cand.gap > 0; // scoring ABOVE xG -> due to cool
  const goalsPer = (cand.goalsFor / cand.matches).toFixed(1);
  const xgPer = (cand.xgFor / cand.matches).toFixed(1);
  const headline = hot
    ? `${cand.name} are finishing above their chances`
    : `${cand.name} have created more than they've scored`;
  const detail = hot
    ? `${cand.name} are scoring ${goalsPer}/match on ${xgPer} xG — ${gapStr(cand.gap)} above expected across ${cand.matches} matches. Finishing that hot rarely holds; their scoring is a regression-down read going forward.`
    : `${cand.name} are scoring ${goalsPer}/match on ${xgPer} xG — ${gapStr(cand.gap)} below expected across ${cand.matches} matches. The chances are there; they're due for the finishing to catch up.`;

  return makeRow({
    category: 'xg_regression',
    headline,
    detail,
    game: `${fifaCode(away)} @ ${fifaCode(home)}`,
    value: `xG ${hot ? '+' : '-'}${Math.abs(cand.gap).toFixed(1)}`,
    tone: hot ? TONES.CAUTION : TONES.EDGE,
    // [goals/match, xG/match] — drives the iOS WC regression board's Goals-vs-xG
    // gap bar (the soccer analog of the pitcher board's ERA→xERA bar).
    spark: [Number(goalsPer), Number(xgPer)],
    relevance_score: clampScore(Math.min(SCORE_CAP, SCORE_BASE + SCORE_PER * Math.abs(cand.gap))),
    game_id: match.id,
  });
}

function gapFor(t, team) {
  if (!t || t.matches < MIN_MATCHES) return null;
  return { name: t.name || team?.name, matches: t.matches, goalsFor: t.goalsFor, xgFor: t.xgFor, gap: (t.goalsFor - t.xgFor) / t.matches };
}

/** Map `${match_id}|${team_id}` -> expected_goals from the flat team_match_stats list. */
function indexXg(rows) {
  const m = new Map();
  for (const r of rows || []) {
    if (r?.match_id == null || r?.team_id == null) continue;
    const xg = num(r.expected_goals);
    if (xg != null) m.set(`${r.match_id}|${r.team_id}`, xg);
  }
  return m;
}

function gapStr(g) { return `${Math.abs(g).toFixed(1)} goals/match`; }
function num(v) { const x = Number(v); return Number.isFinite(x) ? x : null; }
function fifaCode(team) {
  const code = team?.abbreviation || team?.country_code;
  if (code) return String(code).toUpperCase().slice(0, 3);
  return String(team?.name || 'TBD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'TBD';
}
async function safe(fn, fallback) { try { const v = await fn(); return v == null ? fallback : v; } catch { return fallback; } }

export default { computeWcXgRegression };
