// THE MISMATCH — the one collision that decides the game.
//
// Founder brief (Aug 20): two NEW football sections beyond the MLB analogs,
// "a step or 2 beyond what ESPN would show, more fun than PPG". This lane
// answers the question a fan actually argues about: WHERE does this game get
// won? One row per game: the single largest unit gap between the sides,
// named as a collision ("Houston's pass rush against a Raiders line that
// takes 4.0 sacks a game"), with Gary's read on why it decides things.
//
// Source contract: the SAME aggregated team boxes footballTeamEdges reads —
// no ratings, no projections, no invented units. A gap only qualifies as THE
// mismatch when it clears 1.5x the teamEdges materiality threshold for its
// metric; a slate with no such gap simply has no mismatch row (absence stays
// absent). NFL + NCAAF.

import { makeRow, TONES } from '../shared.js';
import { attachLaneReads, detailFact } from '../laneReads.js';
import {
  aggregateFootballTeamStats,
  loadFootballTeamGameStats,
} from '../footballData.js';

function clockText(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  const mins = Math.floor(n / 60);
  const secs = Math.round(n % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function fixed(value, decimals) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(decimals).replace(/\.0+$|(?<=\.[0-9])0+$/g, '');
}

function teamName(team) {
  return team?.abbreviation || team?.name || team?.full_name || 'TEAM';
}

// The collision vocabulary: for each measurable, how the WINNING side and the
// LOSING side of the gap read as football units. Same keys/thresholds as
// footballTeamEdges so the two lanes can never disagree about materiality.
const COLLISIONS = Object.freeze([
  Object.freeze({
    key: 'sacksPerGame', better: 'low', decimals: 2,
    threshold: { nfl: 0.5 },
    leagues: new Set(['nfl']),
    frame: (winner, loser, wv, lv) =>
      `${winner}'s protection against a ${loser} front — ${loser} takes ${lv} sacks a game to ${winner}'s ${wv}`,
    unit: 'SACKS TAKEN / G',
  }),
  Object.freeze({
    key: 'turnoversPerGame', better: 'low', decimals: 2,
    threshold: { nfl: 0.35, ncaaf: 0.35 },
    frame: (winner, loser, wv, lv) =>
      `${winner}'s ball security against ${loser}'s giveaways — ${lv} turnovers a game to ${winner}'s ${wv}`,
    unit: 'TURNOVERS / G',
  }),
  Object.freeze({
    key: 'rushingYardsPerGame', better: 'high', decimals: 1,
    threshold: { nfl: 15, ncaaf: 20 },
    frame: (winner, loser, wv, lv) =>
      `${winner}'s ground game against ${loser}'s — ${wv} rush yards a game to ${lv}`,
    unit: 'RUSH YPG',
  }),
  Object.freeze({
    key: 'passingYardsPerGame', better: 'high', decimals: 1,
    threshold: { nfl: 20, ncaaf: 25 },
    frame: (winner, loser, wv, lv) =>
      `${winner}'s passing attack against ${loser}'s — ${wv} pass yards a game to ${lv}`,
    unit: 'PASS YPG',
  }),
  Object.freeze({
    key: 'yardsPerPlay', better: 'high', decimals: 2,
    threshold: { nfl: 0.4, ncaaf: 0.5 },
    frame: (winner, loser, wv, lv) =>
      `${winner}'s explosiveness against ${loser}'s — ${wv} yards a snap to ${lv}`,
    unit: 'YDS / PLAY',
  }),
  Object.freeze({
    key: 'pointsAllowedPerGame', better: 'low', decimals: 1,
    threshold: { nfl: 3, ncaaf: 4 },
    frame: (winner, loser, wv, lv) =>
      `${winner}'s defense against ${loser}'s — ${winner} allows ${wv} a game, ${loser} ${lv}`,
    unit: 'PTS ALLOWED / G',
  }),
  Object.freeze({
    key: 'thirdDownPct', better: 'high', decimals: 1,
    threshold: { nfl: 5, ncaaf: 6 },
    frame: (winner, loser, wv, lv) =>
      `${winner} on the money downs — ${wv}% on third down to ${loser}'s ${lv}%`,
    unit: '3RD DOWN %',
  }),
  Object.freeze({
    key: 'possessionSecondsPerGame', better: 'high', decimals: 0,
    threshold: { nfl: 120, ncaaf: 150 },
    display: clockText,
    frame: (winner, loser, wv, lv) =>
      `${winner}'s clock control — ${wv} of possession a game to ${loser}'s ${lv}`,
    unit: 'POSSESSION',
  }),
]);

// A gap must beat the teamEdges threshold by this factor to be THE mismatch.
const MISMATCH_FACTOR = 1.5;

export async function computeFootballMismatch(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  if (!['nfl', 'ncaaf'].includes(league)) return [];

  const raw = await loadFootballTeamGameStats({ bdl, league, season, date, games });
  const statsByTeam = aggregateFootballTeamStats(raw, { league });

  const rows = [];
  for (const game of games || []) {
    const awayTeam = game?.away_team ?? game?.visitor_team;
    const homeTeam = game?.home_team;
    const awayStats = statsByTeam.get(String(awayTeam?.id));
    const homeStats = statsByTeam.get(String(homeTeam?.id));
    if (game?.id == null || !awayTeam?.id || !homeTeam?.id || !awayStats || !homeStats) continue;
    if (awayStats.games < 1 || homeStats.games < 1) continue;

    let best = null;
    for (const metric of COLLISIONS) {
      if (metric.leagues && !metric.leagues.has(league)) continue;
      const threshold = metric.threshold?.[league];
      if (!Number.isFinite(threshold)) continue;
      const awayValue = Number(awayStats[metric.key]);
      const homeValue = Number(homeStats[metric.key]);
      if (!Number.isFinite(awayValue) || !Number.isFinite(homeValue)) continue;
      const gap = Math.abs(awayValue - homeValue);
      const severity = gap / threshold;
      if (severity < MISMATCH_FACTOR) continue;
      if (!best || severity > best.severity) {
        best = { metric, awayValue, homeValue, gap, severity };
      }
    }
    if (!best) continue;

    const { metric, awayValue, homeValue } = best;
    const awayLeads = metric.better === 'low' ? awayValue < homeValue : awayValue > homeValue;
    const winner = awayLeads ? awayTeam : homeTeam;
    const loser = awayLeads ? homeTeam : awayTeam;
    const winnerValue = awayLeads ? awayValue : homeValue;
    const loserValue = awayLeads ? homeValue : awayValue;
    const show = metric.display || ((v) => fixed(v, metric.decimals));

    rows.push(makeRow({
      category: 'mismatch',
      headline: metric.frame(teamName(winner), teamName(loser), show(winnerValue), show(loserValue)),
      detail: `The widest gap on this matchup's tape: ${metric.unit.toLowerCase()} — ${teamName(awayTeam)} ${show(awayValue)}, ${teamName(homeTeam)} ${show(homeValue)}, over ${awayStats.games} and ${homeStats.games} game samples.`,
      game: helpers.gameLabel(game),
      value: `${show(winnerValue)} VS ${show(loserValue)}`,
      tone: TONES.NEUTRAL,
      relevance_score: Math.min(90, Math.round(56 + best.severity * 8)),
      team_id: winner.id,
      game_id: game.id,
      meta: {
        source: 'balldontlie_team_stats',
        metric: metric.key,
        unit: metric.unit,
        league: league.toUpperCase(),
        season,
        severity: Number(best.severity.toFixed(2)),
        away: { team_id: awayTeam.id, abbreviation: teamName(awayTeam), value: awayValue, games: awayStats.games },
        home: { team_id: homeTeam.id, abbreviation: teamName(homeTeam), value: homeValue, games: homeStats.games },
        through: date,
      },
    }));
  }

  await attachLaneReads('footballMismatch', rows, detailFact, {
    ask: 'why THIS collision decides the game — how the stronger unit actually attacks the weaker one, what the weaker side has to do to hide it, and what it means for how the game plays out',
  });

  console.log(`[footballMismatch] ${league.toUpperCase()} ${date}: ${rows.length} mismatch row(s)`);
  return rows;
}

export default { computeFootballMismatch };
