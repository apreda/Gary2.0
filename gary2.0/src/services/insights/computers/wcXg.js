// gary2.0/src/services/insights/computers/wcXg.js
//
// LANE: wcXg  (category token emitted: xg_recap — its own iOS "xG Recap" lane)
// "The result that lied. Once matches are played, the underlying numbers — xG and
//  possession — often disagree with the scoreline. A side that out-created its
//  opponent on xG but didn't win is the classic positive-regression bet going
//  forward; a side that won while being out-xG'd flatters to deceive. This lane
//  reads the MOST RECENT completed match day and surfaces those divergences."
//
// WHY IT'S A 'RECAP' LANE: xG only exists for COMPLETED matches, and those are
// yesterday's (or the last match day's), NOT today's fixtures. So this lane does
// NOT score ctx.games — it fetches the most recent completed match day itself and
// emits board-level rows (game_id OMITTED) so the orchestrator slate filter keeps
// them. Pre-tournament (no completed matches) -> []. Runs in BOTH modes so the
// recap survives rest days between rounds.
//
// DATA SHAPES (confirmed live against the FIFA BDL API on 2026-06-08 — quoted):
//   * getMatches({seasons}) completed row: { id, datetime, home_team:{name},
//       away_team:{name}, home_score, away_score, group:{name}, stage:{name} }.
//   * getTeamMatchStats([matchIds]) -> 2 rows per match: { match_id, team_id,
//       is_home, possession_pct, expected_goals, big_chances, shots_on_target, ... }.
//
// ROW SHAPE: up to 3 board rows — (1) the biggest xG "robbery" (higher-xG side
// did NOT win), (2) the most dominant underlying display, (3) sterile possession
// (a side >=60% possession that failed to win). game carries 'AWY @ HOM';
// game_id OMITTED. relevance 60-74. Defensive: any gap -> drop the row, never throw.

import fifaWorldCupService from '../../fifaWorldCupService.js';
import { makeRow, TONES, clampScore } from '../shared.js';

const wc = fifaWorldCupService;
const DEFAULT_SEASON = 2026;

const RECENT_DAYS = 3;            // completed matches within this many days of the latest one
const MIN_XG_MARGIN = 0.6;        // a meaningful xG gap (goals of expected value)
const STERILE_POSSESSION = 60;    // >= this possession % and no win = sterile dominance
const SCORE_ROBBERY = 74;
const SCORE_DOMINANT = 64;
const SCORE_STERILE = 60;

export async function computeWcXg(ctx) {
  const season = Number(ctx?.season) || DEFAULT_SEASON;

  // 1. Most recent completed match day for this season.
  const all = await safe(() => wc.getMatches({ seasons: [season] }), []);
  const completed = (all || []).filter((m) => m?.status === 'completed' && m?.datetime);
  if (!completed.length) {
    console.log('[wcXg] examined 0, emitted 0 (no completed matches)');
    return [];
  }
  const latestDay = completed
    .map((m) => m.datetime.slice(0, 10))
    .sort()
    .pop();
  const latestMs = new Date(`${latestDay}T00:00:00Z`).getTime();
  const recent = completed.filter((m) => {
    const ms = new Date(m.datetime.slice(0, 10) + 'T00:00:00Z').getTime();
    return latestMs - ms <= RECENT_DAYS * 86400000;
  });

  // 2. Team match stats for those matches (batched).
  const ids = recent.map((m) => m.id);
  const teamStats = await safe(() => wc.getTeamMatchStats(ids), []);
  const statsByMatch = indexStatsByMatch(teamStats);

  // 3. Build a per-match analytical view.
  const views = [];
  for (const m of recent) {
    const v = buildMatchView(m, statsByMatch.get(m.id));
    if (v) views.push(v);
  }
  if (!views.length) {
    console.log(`[wcXg] examined ${recent.length}, emitted 0 (no xG stats)`);
    return [];
  }

  const rows = [];

  // (1) THE ROBBERY — biggest xG margin where the higher-xG side did NOT win.
  const robberies = views
    .filter((v) => v.xgMargin >= MIN_XG_MARGIN && v.xgLeader && v.xgLeader !== v.resultWinner)
    .sort((a, b) => b.xgMargin - a.xgMargin);
  if (robberies[0]) rows.push(buildRobberyRow(robberies[0]));

  // (2) DOMINANT DISPLAY — biggest xG margin overall (skip if it's the robbery match).
  const dominant = [...views].sort((a, b) => b.xgMargin - a.xgMargin)[0];
  if (dominant && dominant.xgMargin >= MIN_XG_MARGIN && dominant.matchId !== robberies[0]?.matchId) {
    rows.push(buildDominantRow(dominant));
  }

  // (3) STERILE POSSESSION — a side with heavy possession that failed to win.
  const sterile = views
    .filter((v) => v.possLeaderPct >= STERILE_POSSESSION && v.possLeader && v.possLeader !== v.resultWinner)
    .sort((a, b) => b.possLeaderPct - a.possLeaderPct)
    .find((v) => v.matchId !== robberies[0]?.matchId && v.matchId !== dominant?.matchId);
  if (sterile) rows.push(buildSterileRow(sterile));

  console.log(`[wcXg] examined ${views.length}, emitted ${rows.length}`);
  return rows;
}

// --- row builders ----------------------------------------------------------

function buildRobberyRow(v) {
  const outcome = v.resultWinner ? `lost to ${v.resultWinner}` : 'were held to a draw';
  return makeRow({
    category: 'xg_recap',
    headline: `${v.xgLeader} out-created the field but ${shortOutcome(v)}`,
    detail:
      `${v.xgLeader} won the xG battle ${fmtXg(v.xgLeaderVal)}–${fmtXg(v.xgTrailVal)} yet ${outcome} ${scoreline(v)}. ` +
      `The underlying numbers favoured them — a side the result flattered to deceive.`,
    game: v.label,
    value: `xG ${fmtXg(v.xgLeaderVal)}–${fmtXg(v.xgTrailVal)}`,
    tone: TONES.EDGE,
    relevance_score: clampScore(SCORE_ROBBERY),
    // game_id OMITTED — recap board row (the match is not on today's slate).
  });
}

function buildDominantRow(v) {
  const wonClause = v.xgLeader === v.resultWinner ? 'and took the result to match' : 'in a tight finish';
  return makeRow({
    category: 'xg_recap',
    headline: `${v.xgLeader} created the better chances`,
    detail:
      `${v.xgLeader} led the xG ${fmtXg(v.xgLeaderVal)}–${fmtXg(v.xgTrailVal)} ${wonClause} ${scoreline(v)}.`,
    game: v.label,
    value: `xG ${fmtXg(v.xgLeaderVal)}–${fmtXg(v.xgTrailVal)}`,
    tone: TONES.NEUTRAL,
    relevance_score: clampScore(SCORE_DOMINANT),
  });
}

function buildSterileRow(v) {
  const outcome = v.resultWinner ? `lost to ${v.resultWinner}` : 'could only draw';
  return makeRow({
    category: 'xg_recap',
    headline: `${v.possLeader} dominated the ball but ${shortOutcome(v)}`,
    detail:
      `${v.possLeader} held ${Math.round(v.possLeaderPct)}% of possession yet ${outcome} ${scoreline(v)} — ` +
      `control without the cutting edge.`,
    game: v.label,
    value: `${Math.round(v.possLeaderPct)}% poss`,
    tone: TONES.CAUTION,
    relevance_score: clampScore(SCORE_STERILE),
  });
}

// --- match view ------------------------------------------------------------

function buildMatchView(match, pair) {
  const home = match?.home_team?.name;
  const away = match?.away_team?.name;
  if (!home || !away || !pair) return null;
  const { homeStat, awayStat } = pair;
  if (!homeStat || !awayStat) return null;

  const homeXg = num(homeStat.expected_goals);
  const awayXg = num(awayStat.expected_goals);
  if (homeXg == null || awayXg == null) return null;
  const homePoss = num(homeStat.possession_pct);
  const awayPoss = num(awayStat.possession_pct);

  const homeGoals = num(match.home_score);
  const awayGoals = num(match.away_score);

  const resultWinner =
    homeGoals == null || awayGoals == null ? null
    : homeGoals > awayGoals ? home
    : awayGoals > homeGoals ? away
    : null; // draw

  const xgLeader = homeXg > awayXg ? home : awayXg > homeXg ? away : null;
  const xgLeaderVal = Math.max(homeXg, awayXg);
  const xgTrailVal = Math.min(homeXg, awayXg);

  const possLeader = homePoss != null && awayPoss != null
    ? (homePoss >= awayPoss ? home : away) : null;
  const possLeaderPct = homePoss != null && awayPoss != null ? Math.max(homePoss, awayPoss) : 0;

  return {
    matchId: match.id,
    label: `${fifaCode(match.away_team)} @ ${fifaCode(match.home_team)}`,
    home, away, homeGoals, awayGoals,
    resultWinner,
    xgLeader, xgLeaderVal, xgTrailVal,
    xgMargin: Math.abs(homeXg - awayXg),
    possLeader, possLeaderPct,
  };
}

/** Map match_id -> { homeStat, awayStat } from the flat team_match_stats list. */
function indexStatsByMatch(rows) {
  const byMatch = new Map();
  for (const r of rows || []) {
    const mid = r?.match_id;
    if (mid == null) continue;
    const cur = byMatch.get(mid) || { homeStat: null, awayStat: null };
    if (r.is_home) cur.homeStat = r; else cur.awayStat = r;
    byMatch.set(mid, cur);
  }
  return byMatch;
}

// --- formatting ------------------------------------------------------------

function scoreline(v) {
  if (v.homeGoals == null || v.awayGoals == null) return '';
  // Express from the xG leader's perspective for readability.
  return `(${v.homeGoals}–${v.awayGoals})`;
}

function shortOutcome(v) {
  return v.resultWinner ? "didn't win" : 'only drew';
}

/** One-decimal xG. */
function fmtXg(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(1) : String(n);
}

/** 3-letter FIFA code: abbreviation -> country_code -> first 3 of name. */
function fifaCode(team) {
  const code = team?.abbreviation || team?.country_code;
  if (code) return String(code).toUpperCase().slice(0, 3);
  return String(team?.name || 'TBD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'TBD';
}

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

async function safe(fn, fallback) {
  try {
    const v = await fn();
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export default { computeWcXg };
