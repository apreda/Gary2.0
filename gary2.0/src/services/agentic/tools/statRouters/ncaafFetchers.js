import { ballDontLieService } from '../../../ballDontLieService.js';

const NCAAF_BDL_SPORT = 'americanfootball_ncaaf';

function normalizeId(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function rowTeamId(row) {
  return normalizeId(
    row?.team?.id ??
    row?.team_id ??
    row?.teamId ??
    row?.team?.team_id
  );
}

/**
 * Select the season-stat row that actually belongs to the requested team.
 *
 * BDL normally honors team_id and returns one row, but treating `rows[0]` as
 * authoritative caused a historical failure mode where the same row could be
 * presented for both sides. A single unlabelled row is accepted because some
 * BDL responses omit the nested team object; an explicitly mismatched row is
 * never accepted.
 */
export function selectNcaafTeamStats(payload, requestedTeamId) {
  const rows = Array.isArray(payload) ? payload : (payload ? [payload] : []);
  const wantedId = normalizeId(requestedTeamId);
  if (!wantedId || rows.length === 0) return null;

  const exact = rows.find((row) => rowTeamId(row) === wantedId);
  if (exact) return exact;

  if (rows.length === 1 && rowTeamId(rows[0]) === null) {
    return rows[0];
  }

  return null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function displayValue(value, decimals = null) {
  const number = numberOrNull(value);
  if (number === null) return 'N/A';
  return decimals === null ? number : number.toFixed(decimals);
}

function sumAvailable(stats, keys, decimals = null) {
  const values = keys.map((key) => numberOrNull(stats?.[key])).filter((value) => value !== null);
  if (values.length === 0) return 'N/A';
  const total = values.reduce((sum, value) => sum + value, 0);
  return decimals === null ? total : total.toFixed(decimals);
}

async function fetchNcaafTeamPair(home, away, season) {
  const [homePayload, awayPayload] = await Promise.all([
    ballDontLieService.getTeamSeasonStats(NCAAF_BDL_SPORT, { teamId: home.id, season }),
    ballDontLieService.getTeamSeasonStats(NCAAF_BDL_SPORT, { teamId: away.id, season })
  ]);

  const homeStats = selectNcaafTeamStats(homePayload, home.id);
  const awayStats = selectNcaafTeamStats(awayPayload, away.id);

  if (!homeStats || !awayStats) {
    const missing = [!homeStats ? (home.full_name || home.name) : null, !awayStats ? (away.full_name || away.name) : null]
      .filter(Boolean)
      .join(', ');
    throw new Error(`BDL returned no team-matched NCAAF season stats for ${missing}`);
  }

  return { homeStats, awayStats };
}

function unavailableResult(error, home, away) {
  return {
    error: error.message,
    source: 'Ball Don\'t Lie',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  };
}

export const ncaafFetchers = {

  // ===== NCAAF BDL-BASED STATS (THESE WORK - use team_season_stats) =====
  
  NCAAF_PASSING_OFFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Passing Offense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      const { homeStats, awayStats } = await fetchNcaafTeamPair(home, away, season);
      
      return {
        category: 'Passing Offense',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          passing_yards: displayValue(homeStats.passing_yards),
          passing_ypg: displayValue(homeStats.passing_yards_per_game, 1),
          passing_tds: displayValue(homeStats.passing_touchdowns),
          passing_ints: displayValue(homeStats.passing_interceptions)
        },
        away: {
          team: awayTeamName,
          passing_yards: displayValue(awayStats.passing_yards),
          passing_ypg: displayValue(awayStats.passing_yards_per_game, 1),
          passing_tds: displayValue(awayStats.passing_touchdowns),
          passing_ints: displayValue(awayStats.passing_interceptions)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Passing Offense fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  NCAAF_RUSHING_OFFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Rushing Offense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const { homeStats, awayStats } = await fetchNcaafTeamPair(home, away, season);
      
      return {
        category: 'Rushing Offense',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          rushing_yards: displayValue(homeStats.rushing_yards),
          rushing_ypg: displayValue(homeStats.rushing_yards_per_game, 1),
          rushing_tds: displayValue(homeStats.rushing_touchdowns)
        },
        away: {
          team: awayTeamName,
          rushing_yards: displayValue(awayStats.rushing_yards),
          rushing_ypg: displayValue(awayStats.rushing_yards_per_game, 1),
          rushing_tds: displayValue(awayStats.rushing_touchdowns)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Rushing Offense fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  NCAAF_TOTAL_OFFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Total Offense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const { homeStats, awayStats } = await fetchNcaafTeamPair(home, away, season);
      
      return {
        category: 'Total Offense',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          total_yards: sumAvailable(homeStats, ['passing_yards', 'rushing_yards']),
          total_ypg: sumAvailable(homeStats, ['passing_yards_per_game', 'rushing_yards_per_game'], 1),
          passing_ypg: displayValue(homeStats.passing_yards_per_game, 1),
          rushing_ypg: displayValue(homeStats.rushing_yards_per_game, 1)
        },
        away: {
          team: awayTeamName,
          total_yards: sumAvailable(awayStats, ['passing_yards', 'rushing_yards']),
          total_ypg: sumAvailable(awayStats, ['passing_yards_per_game', 'rushing_yards_per_game'], 1),
          passing_ypg: displayValue(awayStats.passing_yards_per_game, 1),
          rushing_ypg: displayValue(awayStats.rushing_yards_per_game, 1)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Total Offense fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  NCAAF_DEFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Defense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const { homeStats, awayStats } = await fetchNcaafTeamPair(home, away, season);
      
      return {
        category: 'Defense (Yards Allowed)',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          opp_passing_yards: displayValue(homeStats.opp_passing_yards),
          opp_rushing_yards: displayValue(homeStats.opp_rushing_yards),
          opp_total_yards: sumAvailable(homeStats, ['opp_passing_yards', 'opp_rushing_yards'])
        },
        away: {
          team: awayTeamName,
          opp_passing_yards: displayValue(awayStats.opp_passing_yards),
          opp_rushing_yards: displayValue(awayStats.opp_rushing_yards),
          opp_total_yards: sumAvailable(awayStats, ['opp_passing_yards', 'opp_rushing_yards'])
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Defense fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  NCAAF_SCORING: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Scoring for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const { homeStats, awayStats } = await fetchNcaafTeamPair(home, away, season);
      
      return {
        category: 'Scoring (Touchdowns)',
        data_scope: 'Touchdowns only (total points/PPG not available from BDL for NCAAF)',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          passing_tds: displayValue(homeStats.passing_touchdowns),
          rushing_tds: displayValue(homeStats.rushing_touchdowns),
          total_tds: sumAvailable(homeStats, ['passing_touchdowns', 'rushing_touchdowns'])
        },
        away: {
          team: awayTeamName,
          passing_tds: displayValue(awayStats.passing_touchdowns),
          rushing_tds: displayValue(awayStats.rushing_touchdowns),
          total_tds: sumAvailable(awayStats, ['passing_touchdowns', 'rushing_touchdowns'])
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Scoring fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  NCAAF_TURNOVER_MARGIN: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Turnover Data for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const { homeStats, awayStats } = await fetchNcaafTeamPair(home, away, season);
      
      return {
        category: 'Interceptions',
        data_scope: 'INTs thrown only (full turnover data unavailable from BDL for NCAAF)',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          interceptions_thrown: displayValue(homeStats.passing_interceptions)
        },
        away: {
          team: awayTeamName,
          interceptions_thrown: displayValue(awayStats.passing_interceptions)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Turnover fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

};
