/**
 * MLB/WBC Stat Fetchers
 *
 * Uses MLB Stats API for structured data and Gemini Grounding for context.
 * WBC is a short tournament — many traditional "season stats" don't apply.
 * Focus on: pitcher matchups, career stats, recent WBC performance, roster data.
 */

import {
  getWbcTeams,
  getTeamRoster,
  getPlayerCareerStats,
  getPlayerSeasonStats,
  getWbcStandings,
  getWbcFullSchedule,
  getGameBoxScore,
  searchPlayer,
} from '../../../mlbStatsApiService.js';
import { geminiGroundingSearch } from '../../scoutReport/shared/grounding.js';

// Helper: find WBC team by name
async function findWbcTeam(teamName) {
  const teams = await getWbcTeams();
  const norm = (teamName || '').toLowerCase().trim();
  return teams.find(t =>
    (t.name || '').toLowerCase().includes(norm) ||
    (t.teamName || '').toLowerCase().includes(norm) ||
    (t.abbreviation || '').toLowerCase() === norm
  );
}

// Helper: format player career hitting stats
function formatHittingStats(stats, name) {
  if (!stats) return `${name}: Career stats unavailable`;
  return `${name}: .${Math.round((stats.avg || 0) * 1000)} AVG, ${stats.homeRuns || 0} HR, ${stats.rbi || 0} RBI, .${Math.round((stats.ops || 0) * 1000)} OPS (MLB career: ${stats.gamesPlayed || 0} GP)`;
}

function formatPitchingStats(stats, name) {
  if (!stats) return `${name}: Career stats unavailable`;
  return `${name}: ${stats.wins || 0}-${stats.losses || 0}, ${stats.era || '—'} ERA, ${stats.whip || '—'} WHIP, ${stats.strikeOuts || 0} K in ${stats.inningsPitched || 0} IP`;
}

export const mlbFetchers = {

  // ═══════════════════════════════════════════════════════════════════
  // PITCHING
  // ═══════════════════════════════════════════════════════════════════

  MLB_STARTING_PITCHERS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const result = await geminiGroundingSearch(
      `${awayTeam} vs ${homeTeam} WBC World Baseball Classic probable starting pitcher today March 2026`
    );
    return {
      homeValue: result || 'N/A',
      awayValue: result || 'N/A',
      comparison: `Probable starting pitchers for ${awayTeam} @ ${homeTeam}`,
      source: 'Gemini Grounding',
    };
  },

  MLB_BULLPEN: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const result = await geminiGroundingSearch(
      `${awayTeam} vs ${homeTeam} WBC bullpen availability workload recent usage March 2026`
    );
    return {
      homeValue: result || 'N/A',
      awayValue: result || 'N/A',
      comparison: `Bullpen status for ${awayTeam} @ ${homeTeam}`,
      source: 'Gemini Grounding',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // HITTING / LINEUP
  // ═══════════════════════════════════════════════════════════════════

  MLB_KEY_HITTERS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const homeLines = [];
    const awayLines = [];

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const wbcTeam = await findWbcTeam(team.full_name || team.name);
      if (!wbcTeam) {
        // No roster available — use grounding to find key hitters
        const result = await geminiGroundingSearch(
          `${teamName} WBC 2026 World Baseball Classic key hitters batting lineup stats home runs RBI average. Who are the best hitters on ${teamName}?`
        ).catch(() => '');
        lines.push(typeof result === 'string' ? result : (result?.data || `${teamName}: Roster unavailable`));
        continue;
      }
      const roster = await getTeamRoster(wbcTeam.id);
      const hitters = roster.filter(p => p.positionType !== 'Pitcher').slice(0, 5);
      let hasAnyMLBStats = false;
      for (const h of hitters) {
        const career = await getPlayerCareerStats(h.id, 'hitting').catch(() => null);
        if (career) hasAnyMLBStats = true;
        lines.push(formatHittingStats(career, h.name));
      }
      // If most hitters lack MLB stats, supplement with grounding for international league context
      if (!hasAnyMLBStats) {
        const result = await geminiGroundingSearch(
          `${teamName} WBC 2026 World Baseball Classic key hitters stats. Which players are the best hitters? Include their regular league (NPB, KBO, CPBL, etc.) stats and background.`
        ).catch(() => '');
        const groundingText = typeof result === 'string' ? result : (result?.data || '');
        if (groundingText) lines.push(`\n--- International League Context ---\n${groundingText}`);
      }
    }
    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: 'Key hitters (MLB career stats + international league context where needed)',
      source: 'MLB Stats API + Gemini Grounding',
    };
  },

  MLB_LINEUP: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const result = await geminiGroundingSearch(
      `${awayTeam} vs ${homeTeam} WBC World Baseball Classic confirmed batting lineup order today March 2026`
    );
    return {
      homeValue: result || 'N/A',
      awayValue: result || 'N/A',
      comparison: `Confirmed lineups for ${awayTeam} @ ${homeTeam}`,
      source: 'Gemini Grounding',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // STANDINGS & CONTEXT
  // ═══════════════════════════════════════════════════════════════════

  STANDINGS: async (sport, home, away, season, options) => {
    const standings = await getWbcStandings();
    if (!standings?.records) return { homeValue: 'N/A', awayValue: 'N/A', comparison: 'Standings unavailable' };
    const lines = [];
    for (const record of standings.records) {
      const divName = record.division?.name || 'Pool';
      for (const tr of (record.teamRecords || [])) {
        lines.push(`${divName}: ${tr.team?.name} ${tr.wins}-${tr.losses}`);
      }
    }
    return {
      homeValue: lines.join('\n'),
      awayValue: '',
      comparison: 'WBC Pool Standings',
      source: 'MLB Stats API',
    };
  },

  MLB_WBC_RESULTS: async (sport, home, away, season, options) => {
    const schedule = await getWbcFullSchedule();
    const completed = schedule.filter(g => g.status?.detailedState === 'Final');
    if (completed.length === 0) return { homeValue: 'No completed games yet', awayValue: '', comparison: 'WBC Results' };
    const lines = completed.map(g => {
      const h = g.teams?.home;
      const a = g.teams?.away;
      return `${a?.team?.name} ${a?.score} @ ${h?.team?.name} ${h?.score}`;
    });
    return {
      homeValue: lines.join('\n'),
      awayValue: '',
      comparison: 'Completed WBC games',
      source: 'MLB Stats API',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // ODDS (Grounding-based — no API has WBC odds)
  // ═══════════════════════════════════════════════════════════════════

  MLB_ODDS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const result = await geminiGroundingSearch(
      `${awayTeam} vs ${homeTeam} WBC moneyline run line total over under odds DraftKings FanDuel BetMGM today`
    );
    return {
      homeValue: result || 'N/A',
      awayValue: result || 'N/A',
      comparison: `Current WBC odds for ${awayTeam} @ ${homeTeam}`,
      source: 'Gemini Grounding (sportsbook aggregation)',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // GENERIC / SHARED TOKENS
  // ═══════════════════════════════════════════════════════════════════

  INJURIES: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const result = await geminiGroundingSearch(
      `${awayTeam} ${homeTeam} WBC injuries scratches roster changes today March 2026`
    );
    return {
      homeValue: result || 'No injury info found',
      awayValue: '',
      comparison: `Injury/roster updates for ${awayTeam} @ ${homeTeam}`,
      source: 'Gemini Grounding',
    };
  },

  RECENT_FORM: async (sport, home, away, season, options) => {
    const schedule = await getWbcFullSchedule();
    const homeTeamName = (home.full_name || home.name || '').toLowerCase();
    const awayTeamName = (away.full_name || away.name || '').toLowerCase();

    function teamGames(teamName) {
      return schedule.filter(g => {
        const hName = (g.teams?.home?.team?.name || '').toLowerCase();
        const aName = (g.teams?.away?.team?.name || '').toLowerCase();
        return (hName.includes(teamName) || aName.includes(teamName)) &&
          (g.status?.detailedState === 'Final');
      });
    }

    const homeGames = teamGames(homeTeamName);
    const awayGames = teamGames(awayTeamName);

    function formatGames(games, teamName) {
      if (games.length === 0) return 'No completed WBC games yet';
      return games.map(g => {
        const h = g.teams?.home;
        const a = g.teams?.away;
        return `${a?.team?.name} ${a?.score} @ ${h?.team?.name} ${h?.score}`;
      }).join('\n');
    }

    return {
      homeValue: formatGames(homeGames, homeTeamName),
      awayValue: formatGames(awayGames, awayTeamName),
      comparison: 'WBC tournament results for both teams',
      source: 'MLB Stats API (schedule)',
    };
  },

  H2H_HISTORY: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const result = await geminiGroundingSearch(
      `${awayTeam} vs ${homeTeam} WBC World Baseball Classic head to head history all time record`
    );
    return {
      homeValue: result || 'No H2H data found',
      awayValue: '',
      comparison: `WBC H2H history: ${awayTeam} vs ${homeTeam}`,
      source: 'Gemini Grounding',
    };
  },

  REST_SITUATION: async (sport, home, away, season, options) => {
    const schedule = await getWbcFullSchedule();
    const today = new Date().toISOString().split('T')[0];

    function lastGameDate(teamName) {
      const norm = (teamName || '').toLowerCase();
      const past = schedule.filter(g => {
        const gDate = (g.gameDate || '').split('T')[0];
        if (gDate >= today) return false;
        const hName = (g.teams?.home?.team?.name || '').toLowerCase();
        const aName = (g.teams?.away?.team?.name || '').toLowerCase();
        return hName.includes(norm) || aName.includes(norm);
      });
      if (past.length === 0) return null;
      return past[past.length - 1].gameDate?.split('T')[0];
    }

    const homeLast = lastGameDate(home.full_name || home.name);
    const awayLast = lastGameDate(away.full_name || away.name);

    function daysRest(lastDate) {
      if (!lastDate) return 'First WBC game';
      const diff = Math.floor((new Date(today) - new Date(lastDate)) / (1000 * 60 * 60 * 24));
      return `${diff} day(s) rest (last played ${lastDate})`;
    }

    return {
      homeValue: daysRest(homeLast),
      awayValue: daysRest(awayLast),
      comparison: 'Days rest between WBC games',
      source: 'MLB Stats API (schedule)',
    };
  },

  TOP_PLAYERS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const homeLines = [];
    const awayLines = [];

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const wbcTeam = await findWbcTeam(team.full_name || team.name);
      if (!wbcTeam) {
        const result = await geminiGroundingSearch(
          `${teamName} WBC 2026 World Baseball Classic top players stars roster. Who are the best players on ${teamName}? Include stats and league background.`
        ).catch(() => '');
        lines.push(typeof result === 'string' ? result : (result?.data || `${teamName}: Team not found`));
        continue;
      }
      const roster = await getTeamRoster(wbcTeam.id);
      const hitters = roster.filter(p => p.positionType !== 'Pitcher').slice(0, 3);
      let hasAnyMLBStats = false;
      for (const h of hitters) {
        const career = await getPlayerCareerStats(h.id, 'hitting').catch(() => null);
        if (career) hasAnyMLBStats = true;
        lines.push(formatHittingStats(career, `${teamName} — ${h.name}`));
      }
      if (!hasAnyMLBStats) {
        const result = await geminiGroundingSearch(
          `${teamName} WBC 2026 key players stats background. Include their regular league stats.`
        ).catch(() => '');
        const groundingText = typeof result === 'string' ? result : (result?.data || '');
        if (groundingText) lines.push(`\n--- International Context ---\n${groundingText}`);
      }
    }
    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: 'Top position players (MLB career + international context)',
      source: 'MLB Stats API + Gemini Grounding',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // WBC-SPECIFIC GROUNDING TOOLS
  // ═══════════════════════════════════════════════════════════════════

  WBC_GAME_PREVIEW: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const result = await geminiGroundingSearch(
      `${awayTeam} vs ${homeTeam} WBC 2026 World Baseball Classic game preview prediction analysis today. ` +
      `Include: starting pitcher scouting reports, key matchup advantages, projected lineup, ` +
      `betting projections, expert picks, and any blog or media analysis.`
    );
    return {
      homeValue: result || 'N/A',
      awayValue: result || 'N/A',
      comparison: `Game preview and analysis for ${awayTeam} @ ${homeTeam}`,
      source: 'Gemini Grounding',
    };
  },

  WBC_PITCHER_SCOUTING: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const result = await geminiGroundingSearch(
      `${awayTeam} vs ${homeTeam} WBC 2026 starting pitcher scouting report. ` +
      `Pitcher stats, recent outings, pitch mix, strengths, weaknesses, ERA, WHIP, strikeouts. ` +
      `Include their regular season league stats (MLB, NPB, KBO, CPBL, etc.) and any WBC tournament appearances.`
    );
    return {
      homeValue: result || 'N/A',
      awayValue: result || 'N/A',
      comparison: `Starting pitcher scouting for ${awayTeam} @ ${homeTeam}`,
      source: 'Gemini Grounding',
    };
  },

  WBC_TOURNAMENT_FORM: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const result = await geminiGroundingSearch(
      `${homeTeam} ${awayTeam} WBC 2026 World Baseball Classic tournament form results performance. ` +
      `How has each team played so far in this tournament? Key performers, momentum, ` +
      `offensive and pitching performance through the tournament.`
    );
    return {
      homeValue: result || 'N/A',
      awayValue: result || 'N/A',
      comparison: `Tournament form for ${homeTeam} and ${awayTeam}`,
      source: 'Gemini Grounding',
    };
  },

  // Default handler
  DEFAULT: async (sport, home, away, season, options) => {
    return {
      homeValue: 'Token not available for MLB/WBC',
      awayValue: '',
      comparison: 'This stat token is not implemented for baseball',
      source: 'N/A',
    };
  },
};
