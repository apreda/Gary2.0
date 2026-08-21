// What each side's DEFENCE has actually allowed this season.
//
// Source contract: the opponent's own BDL team-game box from every game a slate
// team has already played (loadFootballOpponentGameStats). "Pass yards allowed"
// is literally the other team's passing line in those games — a recorded fact,
// not a rating, projection, or league-average fill. Both leagues are supported;
// each metric appears only where that league's box carries the field.
//
// This is the defensive half of footballTeamEdges, kept in its own computer so
// an offence-side data gap can never be papered over with a defensive number.

import { makeRow, TONES } from '../shared.js';
import { attachLaneReads, detailFact } from '../laneReads.js';
import {
  aggregateFootballTeamStats,
  loadFootballOpponentGameStats,
  loadFootballTeamGameStats,
} from '../footballData.js';

const METRICS = Object.freeze([
  Object.freeze({
    key: 'passingYardsPerGame',
    category: 'coverage',
    label: 'passing yards allowed per game',
    short: 'PASS YDS ALLOWED',
    decimals: 1,
    threshold: { nfl: 25, ncaaf: 30 },
    headline: (leader, gap) => `${leader}'s secondary gives up ${gap} fewer passing yards per game`,
  }),
  Object.freeze({
    key: 'rushingYardsPerGame',
    category: 'trenches',
    label: 'rushing yards allowed per game',
    short: 'RUSH YDS ALLOWED',
    decimals: 1,
    threshold: { nfl: 18, ncaaf: 22 },
    headline: (leader, gap) => `${leader}'s front holds runners to ${gap} fewer yards per game`,
  }),
  Object.freeze({
    key: 'yardsPerPlay',
    category: 'coverage',
    label: 'yards per play allowed',
    short: 'Y / PLAY ALLOWED',
    decimals: 2,
    leagues: new Set(['nfl']),
    threshold: { nfl: 0.4 },
    headline: (leader, gap) => `${leader}'s defence surrenders ${gap} fewer yards a snap`,
  }),
  Object.freeze({
    key: 'thirdDownPct',
    category: 'coverage',
    label: 'third downs allowed',
    short: '3RD DOWN ALLOWED',
    decimals: 1,
    threshold: { nfl: 5, ncaaf: 6 },
    headline: (leader, gap) => `${leader} gets off the field on third down ${gap}% more often`,
  }),
  Object.freeze({
    // The opponent's giveaways are this defence's takeaways — the other half of
    // turnover margin, which an offence-only feed cannot see at all.
    key: 'turnoversPerGame',
    category: 'turnover_edge',
    label: 'takeaways per game',
    short: 'TAKEAWAYS / G',
    better: 'high',
    decimals: 2,
    threshold: { nfl: 0.35, ncaaf: 0.4 },
    headline: (leader, gap) => `${leader}'s defence takes the ball away ${gap} more times per game`,
  }),
  Object.freeze({
    key: 'redZonePct',
    category: 'red_zone',
    label: 'red-zone scoring allowed',
    short: 'RZ % ALLOWED',
    decimals: 1,
    leagues: new Set(['nfl']),
    threshold: { nfl: 10 },
    headline: (leader, gap) => `${leader} holds red-zone trips to a score ${gap}% less often`,
  }),
  Object.freeze({
    key: 'sacksPerGame',
    category: 'pass_rush',
    label: 'sacks recorded per game',
    short: 'SACKS / G',
    better: 'high',
    decimals: 2,
    leagues: new Set(['nfl']),
    threshold: { nfl: 0.5 },
    headline: (leader, gap) => `${leader}'s rush gets home ${gap} more times per game`,
  }),
]);

function teamName(team) {
  return team?.abbreviation || team?.name || team?.full_name || 'TEAM';
}

function finite(value) {
  return value != null && Number.isFinite(Number(value));
}

function fixed(value, decimals) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(decimals).replace(/\.0+$|(?<=\.[0-9])0+$/g, '');
}

function sampleWord(n) {
  return `${n} game${n === 1 ? '' : 's'}`;
}

export async function computeFootballDefensiveEdges(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  if (!['nfl', 'ncaaf'].includes(league)) return [];

  const ownRows = await loadFootballTeamGameStats({ bdl, league, season, date, games });
  if (!ownRows.length) return [];
  const opponentRows = await loadFootballOpponentGameStats({ bdl, league, season, games, ownRows });
  if (opponentRows.size === 0) return [];

  // Aggregate each slate team's OPPONENTS. The aggregator keys by the row's own
  // team id, so it runs once per slate team over that team's opponent boxes and
  // the per-game averages are collapsed here.
  const allowedByTeam = new Map();
  for (const [slateTeamId, rows] of opponentRows) {
    const perOpponent = aggregateFootballTeamStats(rows, { league });
    if (perOpponent.size === 0) continue;
    const totals = Object.create(null);
    const counts = Object.create(null);
    // Conversion rates are made-over-attempted across the WHOLE sample, so they
    // are rebuilt from the raw counters the aggregator carries — averaging a
    // 1-for-1 red-zone night against a 5-for-7 one would weight them equally.
    const tally = {
      thirdDownMade: 0, thirdDownAttempts: 0,
      fourthDownMade: 0, fourthDownAttempts: 0,
      redZoneScores: 0, redZoneAttempts: 0,
    };
    const RATE_KEYS = new Set([
      'thirdDownPct', 'fourthDownPct', 'redZonePct', ...Object.keys(tally),
    ]);
    let games = 0;
    for (const stats of perOpponent.values()) {
      games += stats.games || 0;
      for (const key of Object.keys(tally)) tally[key] += Number(stats[key]) || 0;
      for (const [key, value] of Object.entries(stats)) {
        if (key === 'teamId' || key === 'games' || RATE_KEYS.has(key)) continue;
        if (!finite(value)) continue;
        // Weight each opponent by how many of this team's games it accounts for,
        // so a division rival met twice counts twice — as it should.
        const weight = stats.games || 1;
        totals[key] = (totals[key] || 0) + Number(value) * weight;
        counts[key] = (counts[key] || 0) + weight;
      }
    }
    const allowed = { games };
    for (const key of Object.keys(totals)) {
      allowed[key] = counts[key] > 0 ? totals[key] / counts[key] : null;
    }
    allowed.thirdDownPct = tally.thirdDownAttempts > 0
      ? (tally.thirdDownMade / tally.thirdDownAttempts) * 100
      : null;
    allowed.fourthDownPct = tally.fourthDownAttempts > 0
      ? (tally.fourthDownMade / tally.fourthDownAttempts) * 100
      : null;
    allowed.redZonePct = tally.redZoneAttempts > 0
      ? (tally.redZoneScores / tally.redZoneAttempts) * 100
      : null;
    allowedByTeam.set(String(slateTeamId), allowed);
  }

  const through = (() => {
    const d = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(d) ? new Date(d - 86400000).toISOString().slice(0, 10) : date;
  })();

  const rows = [];
  for (const game of games || []) {
    const awayTeam = game?.away_team ?? game?.visitor_team;
    const homeTeam = game?.home_team;
    const awayAllowed = allowedByTeam.get(String(awayTeam?.id));
    const homeAllowed = allowedByTeam.get(String(homeTeam?.id));
    if (game?.id == null || !awayTeam?.id || !homeTeam?.id || !awayAllowed || !homeAllowed) continue;
    if (awayAllowed.games < 1 || homeAllowed.games < 1) continue;

    for (const metric of METRICS) {
      if (metric.leagues && !metric.leagues.has(league)) continue;
      const awayValue = awayAllowed[metric.key];
      const homeValue = homeAllowed[metric.key];
      if (!finite(awayValue) || !finite(homeValue)) continue;
      const gap = Math.abs(Number(awayValue) - Number(homeValue));
      if (gap < (metric.threshold?.[league] ?? Infinity)) continue;

      // Defaults to 'low' — for an allowed stat, fewer is the better defence.
      const awayLeads = metric.better === 'high'
        ? Number(awayValue) > Number(homeValue)
        : Number(awayValue) < Number(homeValue);
      const leaderTeam = awayLeads ? awayTeam : homeTeam;
      const gapText = fixed(gap, metric.decimals);
      const awayText = fixed(awayValue, metric.decimals);
      const homeText = fixed(homeValue, metric.decimals);
      if (gapText == null || awayText == null || homeText == null) continue;

      rows.push(makeRow({
        category: metric.category,
        headline: metric.headline(teamName(leaderTeam), gapText),
        detail:
          `${teamName(awayTeam)}'s opponents are at ${awayText} ${metric.label} over ${sampleWord(awayAllowed.games)}; ` +
          `${teamName(homeTeam)}'s are at ${homeText} over ${sampleWord(homeAllowed.games)}. ` +
          `Those come from the opposing team boxes in the games each side has already played this ${season} season, through ${through}.`,
        game: helpers.gameLabel(game),
        value: `${gapText} ${metric.short}`,
        tone: TONES.EDGE,
        relevance_score: Math.min(90, Math.round(50 + (gap / (metric.threshold?.[league] || 1)) * 10)),
        team_id: leaderTeam.id,
        game_id: game.id,
        meta: {
          source: 'balldontlie_team_stats_opponents',
          metric: `allowed_${metric.key}`,
          league: league.toUpperCase(),
          season,
          through,
          away: {
            team_id: awayTeam.id,
            abbreviation: teamName(awayTeam),
            value: Number(awayValue),
            games: awayAllowed.games,
          },
          home: {
            team_id: homeTeam.id,
            abbreviation: teamName(homeTeam),
            value: Number(homeValue),
            games: homeAllowed.games,
          },
        },
      }));
    }
  }

  await attachLaneReads('footballDefensiveEdges', rows, detailFact, {
    ask: "what this defensive number means once you account for who they played and how those offences attacked them — whether the unit is actually good or has been protected by schedule and script, and what the other side's identity does to it",
  });

  console.log(`[footballDefensiveEdges] ${league.toUpperCase()} ${date}: ${allowedByTeam.size} team(s) with opponent boxes -> ${rows.length} row(s)`);
  return rows;
}

export default { computeFootballDefensiveEdges };
