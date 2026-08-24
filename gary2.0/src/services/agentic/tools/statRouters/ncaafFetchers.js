import { ballDontLieService } from '../../../ballDontLieService.js';
import { loadTeamResults, formSummary, homeAwaySplit, marginProfile, closeGameRecord } from './footballTeamGames.js';

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

  // ═══════════════════════════════════════════════════════════════════════
  // SPORT-SPECIFIC OVERRIDES (Aug 24 2026 audit)
  //
  // INJURIES, RECENT_FORM, HOME_AWAY_SPLITS and CLOSE_GAME_RECORD are owned
  // by the NBA map, so the cross-sport guard refused them on every NCAAF run
  // while the checklist kept asking. NCAAF runs the full factor menu all
  // season — there is no preseason scope to mask this — so these were live
  // holes, not dormant ones.
  // ═══════════════════════════════════════════════════════════════════════

  NCAAF_RECENT_FORM: async (bdlSport, home, away, season) => {
    const [homeResults, awayResults] = await Promise.all([
      loadTeamResults(NCAAF_BDL_SPORT, home.id, season),
      loadTeamResults(NCAAF_BDL_SPORT, away.id, season)
    ]);
    return {
      category: 'Recent Form (Last 5)',
      data_scope: 'Completed games this season, newest first, each with its opponent and score',
      home: { team: home.full_name || home.name, ...(formSummary(homeResults, 5) || { note: 'No completed games found' }) },
      away: { team: away.full_name || away.name, ...(formSummary(awayResults, 5) || { note: 'No completed games found' }) }
    };
  },

  NCAAF_HOME_AWAY_SPLITS: async (bdlSport, home, away, season) => {
    const [homeResults, awayResults] = await Promise.all([
      loadTeamResults(NCAAF_BDL_SPORT, home.id, season),
      loadTeamResults(NCAAF_BDL_SPORT, away.id, season)
    ]);
    const homeSplit = homeAwaySplit(homeResults);
    const awaySplit = homeAwaySplit(awayResults);
    return {
      category: 'Home/Away Splits',
      data_scope: 'Completed games this season, split by venue',
      home: { team: home.full_name || home.name, at_home: homeSplit.home, on_road: homeSplit.away },
      away: { team: away.full_name || away.name, at_home: awaySplit.home, on_road: awaySplit.away }
    };
  },

  NCAAF_CLOSE_GAME_RECORD: async (bdlSport, home, away, season) => {
    const [homeResults, awayResults] = await Promise.all([
      loadTeamResults(NCAAF_BDL_SPORT, home.id, season),
      loadTeamResults(NCAAF_BDL_SPORT, away.id, season)
    ]);
    return {
      category: 'Close Game Record (within 7)',
      data_scope: 'Completed games decided by one score, with the margin profile behind the record',
      home: {
        team: home.full_name || home.name,
        ...(closeGameRecord(homeResults, 7) || { note: 'No one-score games found' }),
        margin_profile: marginProfile(homeResults)
      },
      away: {
        team: away.full_name || away.name,
        ...(closeGameRecord(awayResults, 7) || { note: 'No one-score games found' }),
        margin_profile: marginProfile(awayResults)
      }
    };
  },

  NCAAF_INJURIES: async (bdlSport, home, away) => {
    // BDL publishes no NCAAF injury endpoint (ncaaf/v1/player_injuries is a
    // 404). Say so plainly rather than returning an ownership error that
    // reads like a routing bug.
    return {
      category: 'Injury Report',
      source: 'NOT AVAILABLE',
      note: 'BDL does not publish an NCAAF injury feed. Use the availability and roster information in the scout report; do not infer availability from its absence here.',
      home: { team: home.full_name || home.name },
      away: { team: away.full_name || away.name }
    };
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CHECKLIST ASKS WITH A REAL BDL SOURCE (Aug 24 2026 audit)
  // Both were on the no-fetcher list while the fields sat in the same season
  // row the other NCAAF fetchers already pull.
  // ═══════════════════════════════════════════════════════════════════════

  NCAAF_PASS_EFFICIENCY: async (bdlSport, home, away, season) => {
    try {
      const { homeStats, awayStats } = await fetchNcaafTeamPair(home, away, season);
      return {
        category: 'Passing Efficiency',
        source: 'Ball Don\'t Lie',
        data_scope: 'Season passing rate stats (not per-play EPA or success rate)',
        home: {
          team: home.full_name || home.name,
          qb_rating: displayValue(homeStats.passing_qb_rating, 1),
          passing_ypg: displayValue(homeStats.passing_yards_per_game, 1),
          passing_tds: displayValue(homeStats.passing_touchdowns),
          passing_ints: displayValue(homeStats.passing_interceptions)
        },
        away: {
          team: away.full_name || away.name,
          qb_rating: displayValue(awayStats.passing_qb_rating, 1),
          passing_ypg: displayValue(awayStats.passing_yards_per_game, 1),
          passing_tds: displayValue(awayStats.passing_touchdowns),
          passing_ints: displayValue(awayStats.passing_interceptions)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Pass Efficiency fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  NCAAF_RUSH_EFFICIENCY: async (bdlSport, home, away, season) => {
    try {
      const { homeStats, awayStats } = await fetchNcaafTeamPair(home, away, season);
      return {
        category: 'Rushing Efficiency',
        source: 'Ball Don\'t Lie',
        data_scope: 'Season rushing rate stats (not per-play EPA or success rate)',
        home: {
          team: home.full_name || home.name,
          rushing_ypg: displayValue(homeStats.rushing_yards_per_game, 1),
          rushing_yards: displayValue(homeStats.rushing_yards),
          rushing_tds: displayValue(homeStats.rushing_touchdowns)
        },
        away: {
          team: away.full_name || away.name,
          rushing_ypg: displayValue(awayStats.rushing_yards_per_game, 1),
          rushing_yards: displayValue(awayStats.rushing_yards),
          rushing_tds: displayValue(awayStats.rushing_touchdowns)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Rush Efficiency fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CHECKLIST ASKS WITH NO SOURCE (Aug 24 2026 audit)
  //
  // BDL's NCAAF season row carries 13 fields and its game box 10 — no points,
  // no sacks, no red zone, no explosive-play or havoc inputs, and no ratings.
  // These tokens previously fell through to "Unknown stat token", which reads
  // like a routing bug and invites the researcher to fill the hole itself.
  // Declaring them says the true thing — the number does not exist for us —
  // and names what would source it, so the absence stays visible and greppable.
  // ═══════════════════════════════════════════════════════════════════════

  NCAAF_SP_PLUS_RATINGS: async (bdlSport, home, away) => ({
    category: 'Sp Plus Ratings',
    source: 'NOT AVAILABLE',
    reason: 'SP+ is a Football Outsiders/Bill Connelly rating; BDL does not publish it.',
    note: 'Do not estimate, derive or recall this figure. Report it as unavailable. A CollegeFootballData.com feed would source it.',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  }),

  NCAAF_FPI_RATINGS: async (bdlSport, home, away) => ({
    category: 'Fpi Ratings',
    source: 'NOT AVAILABLE',
    reason: 'FPI is an ESPN rating; BDL does not publish it.',
    note: 'Do not estimate, derive or recall this figure. Report it as unavailable. A CollegeFootballData.com feed would source it.',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  }),

  NCAAF_EPA: async (bdlSport, home, away) => ({
    category: 'Epa',
    source: 'NOT AVAILABLE',
    reason: 'Per-play EPA needs play-by-play; BDL NCAAF provides season and game totals only.',
    note: 'Do not estimate, derive or recall this figure. Report it as unavailable. A CollegeFootballData.com feed would source it.',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  }),

  NCAAF_SUCCESS_RATE: async (bdlSport, home, away) => ({
    category: 'Success Rate',
    source: 'NOT AVAILABLE',
    reason: 'Per-play success rate needs play-by-play; BDL NCAAF provides season and game totals only.',
    note: 'Do not estimate, derive or recall this figure. Report it as unavailable. A CollegeFootballData.com feed would source it.',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  }),

  NCAAF_HAVOC: async (bdlSport, home, away) => ({
    category: 'Havoc',
    source: 'NOT AVAILABLE',
    reason: 'Havoc rate needs TFLs, forced fumbles and pass breakups; BDL NCAAF carries none of them.',
    note: 'Do not estimate, derive or recall this figure. Report it as unavailable. A CollegeFootballData.com feed would source it.',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  }),

  NCAAF_EXPLOSIVE_PLAYS: async (bdlSport, home, away) => ({
    category: 'Explosive Plays',
    source: 'NOT AVAILABLE',
    reason: 'Explosive-play counts need play-level yardage or long-play fields; BDL NCAAF carries neither.',
    note: 'Do not estimate, derive or recall this figure. Report it as unavailable. A CollegeFootballData.com feed would source it.',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  }),

  NCAAF_REDZONE: async (bdlSport, home, away) => ({
    category: 'Redzone',
    source: 'NOT AVAILABLE',
    reason: 'BDL NCAAF box scores carry no red-zone attempts or scores (the NFL boxes do).',
    note: 'Do not estimate, derive or recall this figure. Report it as unavailable. A CollegeFootballData.com feed would source it.',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  }),

  NCAAF_STRENGTH_OF_SCHEDULE: async (bdlSport, home, away) => ({
    category: 'Strength Of Schedule',
    source: 'NOT AVAILABLE',
    reason: 'No opponent-adjusted rating is published in the BDL NCAAF feed.',
    note: 'Do not estimate, derive or recall this figure. Report it as unavailable. A CollegeFootballData.com feed would source it.',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  }),

  NCAAF_CONFERENCE_STRENGTH: async (bdlSport, home, away) => ({
    category: 'Conference Strength',
    source: 'NOT AVAILABLE',
    reason: 'No conference rating is published in the BDL NCAAF feed.',
    note: 'Do not estimate, derive or recall this figure. Report it as unavailable. A CollegeFootballData.com feed would source it.',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  }),

  NCAAF_VS_POWER_OPPONENTS: async (bdlSport, home, away) => ({
    category: 'Vs Power Opponents',
    source: 'NOT AVAILABLE',
    reason: 'Requires an opponent-quality classification BDL does not provide.',
    note: 'Do not estimate, derive or recall this figure. Report it as unavailable. A CollegeFootballData.com feed would source it.',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  }),

  NCAAF_PLAYER_GAME_LOGS: async (bdlSport, home, away) => ({
    category: 'Player Game Logs',
    source: 'NOT AVAILABLE',
    reason: 'This token has never had a fetcher. Per-player game logs are not wired into the stat router for either football league.',
    note: 'The scout report already carries the starting quarterbacks and the key-player stat lines for this game. Use those; do not recall or estimate a game log.',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  })

};
