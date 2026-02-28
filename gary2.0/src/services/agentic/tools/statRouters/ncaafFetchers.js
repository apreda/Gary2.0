import { getCurrentSeasonString, sportToBdlKey, normalizeSportName, findTeam, fmtNum, fmtPct, fetchBothTeamSeasonStats, fetchNBATeamScoringStats, fetchNBATeamAdvancedStats, fetchNBALeaders, fetchNBATeamBaseStats, fetchNBATeamOpponentStats, fetchNBATeamDefenseStats, fetchTopPlayersForTeam, formatRecentGames, buildPaceAnalysis, interpretTurnoverMargin, BDL_API_KEY, _nbaBaseStatsCache, _nbaAdvancedStatsCache, _nbaOpponentStatsCache, _nbaDefenseStatsCache, _nbaTeamScoringStatsCache } from './statRouterCommon.js';
import { ballDontLieService } from '../../../ballDontLieService.js';

export const ncaafFetchers = {

  // ===== NCAAF BDL-BASED STATS (THESE WORK - use team_season_stats) =====
  
  NCAAF_PASSING_OFFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Passing Offense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      // Fetch team season stats from BDL (note: function expects object with teamId, season)
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      return {
        category: 'Passing Offense',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          passing_yards: homeStats?.passing_yards || 'N/A',
          passing_ypg: homeStats?.passing_yards_per_game?.toFixed(1) || 'N/A',
          passing_tds: homeStats?.passing_touchdowns || 'N/A',
          passing_ints: homeStats?.passing_interceptions || 'N/A'
        },
        away: {
          team: awayTeamName,
          passing_yards: awayStats?.passing_yards || 'N/A',
          passing_ypg: awayStats?.passing_yards_per_game?.toFixed(1) || 'N/A',
          passing_tds: awayStats?.passing_touchdowns || 'N/A',
          passing_ints: awayStats?.passing_interceptions || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Passing Offense fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },

  NCAAF_RUSHING_OFFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Rushing Offense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      return {
        category: 'Rushing Offense',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          rushing_yards: homeStats?.rushing_yards || 'N/A',
          rushing_ypg: homeStats?.rushing_yards_per_game?.toFixed(1) || 'N/A',
          rushing_tds: homeStats?.rushing_touchdowns || 'N/A'
        },
        away: {
          team: awayTeamName,
          rushing_yards: awayStats?.rushing_yards || 'N/A',
          rushing_ypg: awayStats?.rushing_yards_per_game?.toFixed(1) || 'N/A',
          rushing_tds: awayStats?.rushing_touchdowns || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Rushing Offense fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },

  NCAAF_TOTAL_OFFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Total Offense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      const homeTotalYds = (homeStats?.passing_yards || 0) + (homeStats?.rushing_yards || 0);
      const awayTotalYds = (awayStats?.passing_yards || 0) + (awayStats?.rushing_yards || 0);
      const homeTotalYpg = ((homeStats?.passing_yards_per_game || 0) + (homeStats?.rushing_yards_per_game || 0));
      const awayTotalYpg = ((awayStats?.passing_yards_per_game || 0) + (awayStats?.rushing_yards_per_game || 0));
      
      return {
        category: 'Total Offense',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          total_yards: homeTotalYds || 'N/A',
          total_ypg: homeTotalYpg?.toFixed(1) || 'N/A',
          passing_ypg: homeStats?.passing_yards_per_game?.toFixed(1) || 'N/A',
          rushing_ypg: homeStats?.rushing_yards_per_game?.toFixed(1) || 'N/A'
        },
        away: {
          team: awayTeamName,
          total_yards: awayTotalYds || 'N/A',
          total_ypg: awayTotalYpg?.toFixed(1) || 'N/A',
          passing_ypg: awayStats?.passing_yards_per_game?.toFixed(1) || 'N/A',
          rushing_ypg: awayStats?.rushing_yards_per_game?.toFixed(1) || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Total Offense fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },

  NCAAF_DEFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Defense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      return {
        category: 'Defense (Yards Allowed)',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          opp_passing_yards: homeStats?.opp_passing_yards || 'N/A',
          opp_rushing_yards: homeStats?.opp_rushing_yards || 'N/A',
          opp_total_yards: ((homeStats?.opp_passing_yards || 0) + (homeStats?.opp_rushing_yards || 0)) || 'N/A'
        },
        away: {
          team: awayTeamName,
          opp_passing_yards: awayStats?.opp_passing_yards || 'N/A',
          opp_rushing_yards: awayStats?.opp_rushing_yards || 'N/A',
          opp_total_yards: ((awayStats?.opp_passing_yards || 0) + (awayStats?.opp_rushing_yards || 0)) || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Defense fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },

  NCAAF_SCORING: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Scoring for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      // Calculate TDs from passing + rushing (approximate scoring)
      const homeTotalTds = (homeStats?.passing_touchdowns || 0) + (homeStats?.rushing_touchdowns || 0);
      const awayTotalTds = (awayStats?.passing_touchdowns || 0) + (awayStats?.rushing_touchdowns || 0);
      
      return {
        category: 'Scoring (Touchdowns)',
        data_scope: 'Touchdowns only (total points/PPG not available from BDL for NCAAF)',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          passing_tds: homeStats?.passing_touchdowns || 'N/A',
          rushing_tds: homeStats?.rushing_touchdowns || 'N/A',
          total_tds: homeTotalTds || 'N/A'
        },
        away: {
          team: awayTeamName,
          passing_tds: awayStats?.passing_touchdowns || 'N/A',
          rushing_tds: awayStats?.rushing_touchdowns || 'N/A',
          total_tds: awayTotalTds || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Scoring fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },

  NCAAF_TURNOVER_MARGIN: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Turnover Data for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      return {
        category: 'Interceptions',
        data_scope: 'INTs thrown only (full turnover data unavailable from BDL for NCAAF)',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          interceptions_thrown: homeStats?.passing_interceptions || 'N/A'
        },
        away: {
          team: awayTeamName,
          interceptions_thrown: awayStats?.passing_interceptions || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Turnover fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },

};
