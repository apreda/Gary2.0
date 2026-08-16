// Grounded NFL/NCAAF team edges.
//
// Source contract: BDL /{league}/v1/team_stats rows for the exact current
// football season, strictly before today's slate date. We compute simple
// per-game comparisons from those boxes. No ratings, projections, roster
// assumptions, SP+, FPI, EPA, havoc, or missing-data substitution appears here.

import { makeRow, TONES } from '../shared.js';
import {
  aggregateFootballTeamStats,
  loadFootballTeamGameStats,
} from '../footballData.js';

const METRICS = Object.freeze([
  Object.freeze({
    key: 'rushingYardsPerGame',
    category: 'trenches',
    label: 'rushing yards per game',
    short: 'RUSH YPG',
    decimals: 1,
    better: 'high',
    threshold: { nfl: 15, ncaaf: 20 },
    headline: (leader, gap) => `${leader} is +${gap} rush yards per game`,
  }),
  Object.freeze({
    key: 'passingYardsPerGame',
    category: 'quarterback',
    label: 'team passing yards per game',
    short: 'PASS YPG',
    decimals: 1,
    better: 'high',
    threshold: { nfl: 20, ncaaf: 25 },
    headline: (leader, gap) => `${leader}'s passing game is +${gap} yards per game`,
  }),
  Object.freeze({
    key: 'pointsPerGame',
    category: 'pace_script',
    label: 'points per game',
    short: 'PPG',
    decimals: 1,
    better: 'high',
    threshold: { nfl: 3, ncaaf: 4 },
    headline: (leader, gap) => `${leader} is scoring +${gap} points per game`,
  }),
  Object.freeze({
    key: 'turnoversPerGame',
    category: 'turnover_edge',
    label: 'turnovers committed per game',
    short: 'TO / G',
    decimals: 2,
    better: 'low',
    threshold: { nfl: 0.35, ncaaf: 0.35 },
    headline: (leader, gap) => `${leader} commits ${gap} fewer turnovers per game`,
  }),
  Object.freeze({
    key: 'yardsPerPlay',
    category: 'explosive_play',
    label: 'yards per play',
    short: 'Y / PLAY',
    decimals: 2,
    better: 'high',
    threshold: { nfl: 0.4, ncaaf: 0.5 },
    headline: (leader, gap) => `${leader} owns a +${gap} yards-per-play gap`,
  }),
  Object.freeze({
    // In the official NFL team box schema, `sacks` lives with the passing
    // offense and records sacks taken. We name that fact literally here.
    key: 'sacksPerGame',
    category: 'pass_rush',
    label: 'sacks taken per game',
    short: 'SACKS / G',
    decimals: 2,
    better: 'low',
    leagues: new Set(['nfl']),
    threshold: { nfl: 0.5 },
    headline: (leader, gap) => `${leader}'s offense takes ${gap} fewer sacks per game`,
  }),
]);

function finite(value) {
  return value != null && Number.isFinite(Number(value));
}

function fixed(value, decimals) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(decimals).replace(/\.0+$|(?<=\.[0-9])0+$/g, '');
}

function teamName(team) {
  return team?.abbreviation || team?.name || team?.full_name || 'TEAM';
}

function sampleWord(n) {
  return `${n} game${n === 1 ? '' : 's'}`;
}

function relevance(metric, gap, league) {
  const threshold = metric.threshold?.[league] || 1;
  return Math.min(92, Math.round(50 + (gap / threshold) * 10));
}

function evidenceMeta({ metric, league, season, date, away, home, awayValue, homeValue }) {
  return {
    source: 'balldontlie_team_stats',
    metric: metric.key,
    league: league.toUpperCase(),
    season,
    through: date,
    away: {
      team_id: away.team.id,
      abbreviation: teamName(away.team),
      value: Number(awayValue),
      games: away.stats.games,
    },
    home: {
      team_id: home.team.id,
      abbreviation: teamName(home.team),
      value: Number(homeValue),
      games: home.stats.games,
    },
  };
}

/**
 * Produce only comparisons that clear a sport-specific materiality threshold.
 * Missing either side's current-season sample drops that fact, not the game.
 */
export async function computeFootballTeamEdges(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  if (!['nfl', 'ncaaf'].includes(league)) return [];

  const raw = await loadFootballTeamGameStats({ bdl, league, season, date, games });
  const statsByTeam = aggregateFootballTeamStats(raw, { league });
  const through = (() => {
    const d = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(d) ? new Date(d - 86400000).toISOString().slice(0, 10) : date;
  })();
  const rows = [];

  for (const game of games || []) {
    const awayTeam = game?.away_team ?? game?.visitor_team;
    const homeTeam = game?.home_team;
    const awayStats = statsByTeam.get(String(awayTeam?.id));
    const homeStats = statsByTeam.get(String(homeTeam?.id));
    if (game?.id == null || !awayTeam?.id || !homeTeam?.id || !awayStats || !homeStats) continue;
    if (awayStats.games < 1 || homeStats.games < 1) continue;

    const sides = {
      away: { team: awayTeam, stats: awayStats },
      home: { team: homeTeam, stats: homeStats },
    };

    for (const metric of METRICS) {
      if (metric.leagues && !metric.leagues.has(league)) continue;
      const awayValue = awayStats[metric.key];
      const homeValue = homeStats[metric.key];
      if (!finite(awayValue) || !finite(homeValue)) continue;
      const gap = Math.abs(Number(awayValue) - Number(homeValue));
      if (gap < (metric.threshold?.[league] ?? Infinity)) continue;

      const awayLeads = metric.better === 'low'
        ? Number(awayValue) < Number(homeValue)
        : Number(awayValue) > Number(homeValue);
      const leader = awayLeads ? sides.away : sides.home;
      const gapText = fixed(gap, metric.decimals);
      const awayText = fixed(awayValue, metric.decimals);
      const homeText = fixed(homeValue, metric.decimals);
      if (gapText == null || awayText == null || homeText == null) continue;

      rows.push(makeRow({
        category: metric.category,
        headline: metric.headline(teamName(leader.team), gapText),
        detail:
          `${teamName(awayTeam)} is at ${awayText} ${metric.label} over ${sampleWord(awayStats.games)}; ` +
          `${teamName(homeTeam)} is at ${homeText} over ${sampleWord(homeStats.games)}. ` +
          `Those are current-${season} team-game results through ${through}.`,
        game: helpers.gameLabel(game),
        value: `${gapText} ${metric.short}`,
        tone: TONES.EDGE,
        relevance_score: relevance(metric, gap, league),
        team_id: leader.team.id,
        game_id: game.id,
        meta: evidenceMeta({
          metric,
          league,
          season,
          date: through,
          away: sides.away,
          home: sides.home,
          awayValue,
          homeValue,
        }),
      }));
    }
  }

  console.log(`[footballTeamEdges] ${league.toUpperCase()} ${date}: ${raw.length} BDL team boxes -> ${rows.length} row(s)`);
  return rows;
}

export default { computeFootballTeamEdges };
