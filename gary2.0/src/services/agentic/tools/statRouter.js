/**
 * Stat Router
 * 
 * Maps stat tokens to actual Ball Don't Lie API calls.
 * Uses BDL Season Averages (Advanced) for NBA efficiency stats.
 */

import { ballDontLieService } from '../../ballDontLieService.js';

// BDL API key for direct calls
const BDL_API_KEY = process.env.BALLDONTLIE_API_KEY;

/**
 * Main router function - fetches stats based on token
 */
export async function fetchStats(sport, token, homeTeam, awayTeam, options = {}) {
  const bdlSport = sportToBdlKey(sport);
  const season = options.season || 2025;
  const normalizedSport = normalizeSportName(sport);
  
  console.log(`[Stat Router] Fetching ${token} for ${awayTeam} @ ${homeTeam} (${sport})`);
  
  try {
    // Get team IDs first
    const teams = await ballDontLieService.getTeams(bdlSport);
    const home = findTeam(teams, homeTeam);
    const away = findTeam(teams, awayTeam);
    
    if (!home || !away) {
      return { error: `Could not find teams: ${homeTeam} or ${awayTeam}`, token };
    }
    
    // Route to appropriate fetcher
    const fetcher = FETCHERS[token];
    if (!fetcher) {
      return { error: `Unknown stat token: ${token}`, token };
    }
    
    const result = await fetcher(bdlSport, home, away, season, options);
    return { token, sport, ...result };
    
  } catch (error) {
    console.error(`[Stat Router] Error fetching ${token}:`, error.message);
    return { error: error.message, token };
  }
}

/**
 * Convert sport to BDL API key
 */
function sportToBdlKey(sport) {
  const mapping = {
    'NBA': 'basketball_nba',
    'NFL': 'americanfootball_nfl',
    'NCAAB': 'basketball_ncaab',
    'NCAAF': 'americanfootball_ncaaf'
  };
  return mapping[sport] || sport;
}

/**
 * Normalize sport name for display
 */
function normalizeSportName(sport) {
  const mapping = {
    'basketball_nba': 'NBA',
    'americanfootball_nfl': 'NFL',
    'basketball_ncaab': 'NCAAB',
    'americanfootball_ncaaf': 'NCAAF',
    'NBA': 'NBA',
    'NFL': 'NFL',
    'NCAAB': 'NCAAB',
    'NCAAF': 'NCAAF'
  };
  return mapping[sport] || sport;
}

/**
 * Fetch NBA team advanced stats via BDL Season Averages endpoint
 * Returns aggregated team stats from their top players
 */
async function fetchNBATeamAdvancedStats(teamId, season = 2024) {
  try {
    // Get active players for team
    const playersUrl = `https://api.balldontlie.io/v1/players/active?team_ids[]=${teamId}&per_page=10`;
    const playersResp = await fetch(playersUrl, { headers: { Authorization: BDL_API_KEY } });
    const playersJson = await playersResp.json();
    const players = playersJson.data || [];
    
    if (players.length === 0) return null;
    
    // Get season averages (advanced) for top 5 players
    const topPlayerIds = players.slice(0, 5).map(p => p.id);
    const playerIdParams = topPlayerIds.map(id => `player_ids[]=${id}`).join('&');
    const seasonAvgUrl = `https://api.balldontlie.io/v1/season_averages/general?season=${season}&season_type=regular&type=advanced&${playerIdParams}`;
    
    const resp = await fetch(seasonAvgUrl, { headers: { Authorization: BDL_API_KEY } });
    const json = await resp.json();
    const playerStats = json.data || [];
    
    if (playerStats.length === 0) return null;
    
    // Aggregate team stats (weighted by minutes/games played)
    let totalMinutes = 0;
    let weightedORtg = 0, weightedDRtg = 0, weightedNetRtg = 0;
    let weightedEfg = 0, weightedPace = 0, weightedTsPct = 0;
    let totalGames = 0;
    
    for (const ps of playerStats) {
      const mins = ps.stats?.min || 0;
      const gp = ps.stats?.gp || 1;
      const weight = mins * gp;
      totalMinutes += weight;
      totalGames = Math.max(totalGames, gp);
      
      weightedORtg += (ps.stats?.off_rating || 0) * weight;
      weightedDRtg += (ps.stats?.def_rating || 0) * weight;
      weightedNetRtg += (ps.stats?.net_rating || 0) * weight;
      weightedEfg += (ps.stats?.efg_pct || 0) * weight;
      weightedPace += (ps.stats?.pace || 0) * weight;
      weightedTsPct += (ps.stats?.ts_pct || 0) * weight;
    }
    
    if (totalMinutes === 0) return null;
    
    return {
      offensive_rating: (weightedORtg / totalMinutes).toFixed(1),
      defensive_rating: (weightedDRtg / totalMinutes).toFixed(1),
      net_rating: (weightedNetRtg / totalMinutes).toFixed(1),
      efg_pct: ((weightedEfg / totalMinutes) * 100).toFixed(1),
      pace: (weightedPace / totalMinutes).toFixed(1),
      true_shooting_pct: ((weightedTsPct / totalMinutes) * 100).toFixed(1),
      games_played: totalGames,
      players_sampled: playerStats.length,
      top_players: playerStats.slice(0, 3).map(ps => ({
        name: `${ps.player?.first_name} ${ps.player?.last_name}`,
        off_rating: ps.stats?.off_rating,
        def_rating: ps.stats?.def_rating,
        usage: ((ps.stats?.usg_pct || 0) * 100).toFixed(1)
      }))
    };
  } catch (error) {
    console.warn('[Stat Router] BDL NBA advanced stats fetch failed:', error.message);
    return null;
  }
}

/**
 * Fetch NBA Leaders for a stat type
 */
async function fetchNBALeaders(statType, season = 2024) {
  try {
    const url = `https://api.balldontlie.io/v1/leaders?stat_type=${statType}&season=${season}`;
    const resp = await fetch(url, { headers: { Authorization: BDL_API_KEY } });
    const json = await resp.json();
    return json.data || [];
  } catch (error) {
    console.warn(`[Stat Router] BDL Leaders fetch failed for ${statType}:`, error.message);
    return [];
  }
}

/**
 * Find team by name
 */
function findTeam(teams, teamName) {
  if (!teams || !teamName) return null;
  const normalized = teamName.toLowerCase();
  return teams.find(t => 
    t.full_name?.toLowerCase().includes(normalized) ||
    t.name?.toLowerCase().includes(normalized) ||
    normalized.includes(t.name?.toLowerCase())
  );
}

/**
 * Format number helper
 */
function fmtNum(val, decimals = 1) {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  return Number(val).toFixed(decimals);
}

/**
 * Format percentage helper
 */
function fmtPct(val) {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  const pct = val <= 1 ? val * 100 : val;
  return `${pct.toFixed(1)}%`;
}

// =============================================================================
// FETCHERS - Each function fetches a specific stat category
// =============================================================================

const FETCHERS = {
  // ===== PACE & TEMPO =====
  PACE: async (bdlSport, home, away, season) => {
    // For NBA, use BDL Season Averages (Advanced) which includes pace
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);
      
      const homePace = homeStats?.pace ? parseFloat(homeStats.pace) : 0;
      const awayPace = awayStats?.pace ? parseFloat(awayStats.pace) : 0;
      const avgPace = (homePace + awayPace) / 2;
      
      return {
        category: 'Pace & Tempo (BDL Advanced)',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          pace: homeStats?.pace || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          pace: awayStats?.pace || 'N/A'
        },
        projected_pace: avgPace > 0 ? avgPace.toFixed(1) : 'N/A',
        analysis: homePace > 100 && awayPace > 100 
          ? 'Both teams play at a fast pace - expect high possession game'
          : homePace < 98 && awayPace < 98 
            ? 'Both teams play slow - expect grinding, low-possession game'
            : `Pace mismatch: ${home.name} (${homePace.toFixed(1)}) vs ${away.name} (${awayPace.toFixed(1)})`
      };
    }
    
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    return {
      category: 'Pace & Tempo',
      home: {
        team: home.full_name || home.name,
        pace: fmtNum(homeData?.pace),
        possessions_per_game: fmtNum(homeData?.possessions_per_game)
      },
      away: {
        team: away.full_name || away.name,
        pace: fmtNum(awayData?.pace),
        possessions_per_game: fmtNum(awayData?.possessions_per_game)
      },
      analysis: buildPaceAnalysis(homeData, awayData)
    };
  },
  
  TEMPO: async (bdlSport, home, away, season) => {
    // Alias for PACE in college
    return FETCHERS.PACE(bdlSport, home, away, season);
  },

  // ===== EFFICIENCY =====
  OFFENSIVE_RATING: async (bdlSport, home, away, season) => {
    // For NBA, use BDL Season Averages (Advanced) - requires GOAT tier
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);
      
      return {
        category: 'Offensive Efficiency (BDL Advanced)',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          offensive_rating: homeStats?.offensive_rating || 'N/A',
          true_shooting_pct: homeStats?.true_shooting_pct ? `${homeStats.true_shooting_pct}%` : 'N/A',
          games_played: homeStats?.games_played || 0,
          top_players: homeStats?.top_players || []
        },
        away: {
          team: away.full_name || away.name,
          offensive_rating: awayStats?.offensive_rating || 'N/A',
          true_shooting_pct: awayStats?.true_shooting_pct ? `${awayStats.true_shooting_pct}%` : 'N/A',
          games_played: awayStats?.games_played || 0,
          top_players: awayStats?.top_players || []
        },
        comparison: homeStats && awayStats ? 
          `${home.name} ORtg ${homeStats.offensive_rating} vs ${away.name} ORtg ${awayStats.offensive_rating} = ${(parseFloat(homeStats.offensive_rating) - parseFloat(awayStats.offensive_rating)).toFixed(1)} point gap` : 
          'Comparison unavailable'
      };
    }
    
    // For other sports, try BDL team season stats
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    return {
      category: 'Offensive Efficiency',
      home: {
        team: home.full_name || home.name,
        offensive_rating: fmtNum(homeData?.offensive_rating),
        points_per_game: fmtNum(homeData?.points_per_game || homeData?.total_points_per_game)
      },
      away: {
        team: away.full_name || away.name,
        offensive_rating: fmtNum(awayData?.offensive_rating),
        points_per_game: fmtNum(awayData?.points_per_game || awayData?.total_points_per_game)
      }
    };
  },
  
  DEFENSIVE_RATING: async (bdlSport, home, away, season) => {
    // For NBA, use BDL Season Averages (Advanced)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);
      
      return {
        category: 'Defensive Efficiency (BDL Advanced)',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          defensive_rating: homeStats?.defensive_rating || 'N/A',
          games_played: homeStats?.games_played || 0
        },
        away: {
          team: away.full_name || away.name,
          defensive_rating: awayStats?.defensive_rating || 'N/A',
          games_played: awayStats?.games_played || 0
        },
        comparison: homeStats && awayStats ?
          `${home.name} DRtg ${homeStats.defensive_rating} vs ${away.name} DRtg ${awayStats.defensive_rating} (lower is better)` :
          'Comparison unavailable'
      };
    }
    
    // For other sports
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    return {
      category: 'Defensive Efficiency',
      home: {
        team: home.full_name || home.name,
        defensive_rating: fmtNum(homeData?.defensive_rating),
        opp_points_per_game: fmtNum(homeData?.opp_points_per_game || homeData?.opp_total_points_per_game)
      },
      away: {
        team: away.full_name || away.name,
        defensive_rating: fmtNum(awayData?.defensive_rating),
        opp_points_per_game: fmtNum(awayData?.opp_points_per_game || awayData?.opp_total_points_per_game)
      }
    };
  },
  
  NET_RATING: async (bdlSport, home, away, season) => {
    // For NBA, use BDL Season Averages (Advanced)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);
      
      const homeNet = homeStats?.net_rating ? parseFloat(homeStats.net_rating) : 0;
      const awayNet = awayStats?.net_rating ? parseFloat(awayStats.net_rating) : 0;
      const gap = (homeNet - awayNet).toFixed(1);
      
      return {
        category: 'Net Rating Comparison (BDL Advanced)',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          net_rating: homeStats?.net_rating || 'N/A',
          offensive_rating: homeStats?.offensive_rating || 'N/A',
          defensive_rating: homeStats?.defensive_rating || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          net_rating: awayStats?.net_rating || 'N/A',
          offensive_rating: awayStats?.offensive_rating || 'N/A',
          defensive_rating: awayStats?.defensive_rating || 'N/A'
        },
        gap: gap,
        interpretation: homeNet > awayNet 
          ? `${home.name} has +${gap} net rating advantage (${homeNet.toFixed(1)} vs ${awayNet.toFixed(1)})`
          : `${away.name} has +${Math.abs(parseFloat(gap)).toFixed(1)} net rating advantage (${awayNet.toFixed(1)} vs ${homeNet.toFixed(1)})`
      };
    }
    
    // For other sports
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    const homeNet = (homeData?.offensive_rating || 0) - (homeData?.defensive_rating || 0);
    const awayNet = (awayData?.offensive_rating || 0) - (awayData?.defensive_rating || 0);
    
    return {
      category: 'Net Rating',
      home: {
        team: home.full_name || home.name,
        net_rating: fmtNum(homeNet),
        offensive_rating: fmtNum(homeData?.offensive_rating),
        defensive_rating: fmtNum(homeData?.defensive_rating)
      },
      away: {
        team: away.full_name || away.name,
        net_rating: fmtNum(awayNet),
        offensive_rating: fmtNum(awayData?.offensive_rating),
        defensive_rating: fmtNum(awayData?.defensive_rating)
      },
      gap: fmtNum(homeNet - awayNet),
      interpretation: homeNet > awayNet 
        ? `${home.name} has ${fmtNum(homeNet - awayNet)} point net rating advantage`
        : `${away.name} has ${fmtNum(awayNet - homeNet)} point net rating advantage`
    };
  },
  
  ADJ_OFFENSIVE_EFF: async (bdlSport, home, away, season) => {
    return FETCHERS.OFFENSIVE_RATING(bdlSport, home, away, season);
  },
  
  ADJ_DEFENSIVE_EFF: async (bdlSport, home, away, season) => {
    return FETCHERS.DEFENSIVE_RATING(bdlSport, home, away, season);
  },
  
  ADJ_EFFICIENCY_MARGIN: async (bdlSport, home, away, season) => {
    return FETCHERS.NET_RATING(bdlSport, home, away, season);
  },

  // ===== FOUR FACTORS =====
  EFG_PCT: async (bdlSport, home, away, season) => {
    // For NBA, use BDL Season Averages (Advanced)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);
      
      return {
        category: 'Shooting Efficiency (BDL Advanced)',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          efg_pct: homeStats?.efg_pct ? `${homeStats.efg_pct}%` : 'N/A',
          true_shooting_pct: homeStats?.true_shooting_pct ? `${homeStats.true_shooting_pct}%` : 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          efg_pct: awayStats?.efg_pct ? `${awayStats.efg_pct}%` : 'N/A',
          true_shooting_pct: awayStats?.true_shooting_pct ? `${awayStats.true_shooting_pct}%` : 'N/A'
        },
        comparison: homeStats && awayStats ?
          `eFG% gap: ${(parseFloat(homeStats.efg_pct) - parseFloat(awayStats.efg_pct)).toFixed(1)}% (${home.name} ${homeStats.efg_pct}% vs ${away.name} ${awayStats.efg_pct}%)` :
          'Comparison unavailable'
      };
    }
    
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    // Calculate eFG% if not provided: eFG% = (FGM + 0.5 * FG3M) / FGA
    const calcEfg = (d) => {
      if (d?.efg_pct || d?.effective_fg_pct) return d.efg_pct || d.effective_fg_pct;
      const fgm = d?.fgm || 0;
      const fg3m = d?.fg3m || 0;
      const fga = d?.fga || 1;
      return ((fgm + 0.5 * fg3m) / fga) * 100;
    };
    
    return {
      category: 'Effective Field Goal %',
      home: {
        team: home.full_name || home.name,
        efg_pct: fmtPct(calcEfg(homeData)),
        fg_pct: fmtPct(homeData?.fg_pct || homeData?.field_goal_pct),
        three_pct: fmtPct(homeData?.fg3_pct || homeData?.three_pct || homeData?.three_point_pct)
      },
      away: {
        team: away.full_name || away.name,
        efg_pct: fmtPct(calcEfg(awayData)),
        fg_pct: fmtPct(awayData?.fg_pct || awayData?.field_goal_pct),
        three_pct: fmtPct(awayData?.fg3_pct || awayData?.three_pct || awayData?.three_point_pct)
      }
    };
  },
  
  TURNOVER_RATE: async (bdlSport, home, away, season) => {
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    // NCAAB uses 'turnover', NBA uses 'turnovers_per_game'
    return {
      category: 'Turnover Rate',
      home: {
        team: home.full_name || home.name,
        tov_rate: fmtPct(homeData?.turnover_rate || homeData?.tov_pct),
        turnovers_per_game: fmtNum(homeData?.turnovers_per_game || homeData?.turnover) // NCAAB uses 'turnover'
      },
      away: {
        team: away.full_name || away.name,
        tov_rate: fmtPct(awayData?.turnover_rate || awayData?.tov_pct),
        turnovers_per_game: fmtNum(awayData?.turnovers_per_game || awayData?.turnover) // NCAAB uses 'turnover'
      }
    };
  },
  
  OREB_RATE: async (bdlSport, home, away, season) => {
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    return {
      category: 'Offensive Rebounding',
      home: {
        team: home.full_name || home.name,
        oreb_rate: fmtPct(homeData?.oreb_pct || homeData?.offensive_reb_pct),
        oreb_per_game: fmtNum(homeData?.oreb_per_game || homeData?.oreb || homeData?.offensive_rebounds_per_game) // NCAAB uses 'oreb'
      },
      away: {
        team: away.full_name || away.name,
        oreb_rate: fmtPct(awayData?.oreb_pct || awayData?.offensive_reb_pct),
        oreb_per_game: fmtNum(awayData?.oreb_per_game || awayData?.oreb || awayData?.offensive_rebounds_per_game) // NCAAB uses 'oreb'
      }
    };
  },
  
  FT_RATE: async (bdlSport, home, away, season) => {
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    // Calculate FT Rate (FTA/FGA) if not provided
    const calcFtRate = (d) => {
      if (d?.ft_rate) return d.ft_rate;
      const fta = d?.fta || 0;
      const fga = d?.fga || 1;
      return fta / fga;
    };
    
    return {
      category: 'Free Throw Rate',
      home: {
        team: home.full_name || home.name,
        ft_rate: fmtNum(calcFtRate(homeData), 3),
        ft_pct: fmtPct(homeData?.ft_pct || homeData?.free_throw_pct),
        fta_per_game: fmtNum(homeData?.fta_per_game || homeData?.fta) // NCAAB uses 'fta'
      },
      away: {
        team: away.full_name || away.name,
        ft_rate: fmtNum(calcFtRate(awayData), 3),
        ft_pct: fmtPct(awayData?.ft_pct || awayData?.free_throw_pct),
        fta_per_game: fmtNum(awayData?.fta_per_game || awayData?.fta) // NCAAB uses 'fta'
      }
    };
  },

  // ===== SHOOTING =====
  THREE_PT_SHOOTING: async (bdlSport, home, away, season) => {
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    // BDL NCAAB uses fg3_pct, fg3m, fg3a; NBA uses three_pct, three_made_per_game, etc.
    return {
      category: 'Three-Point Shooting',
      home: {
        team: home.full_name || home.name,
        three_pct: fmtPct(homeStats?.fg3_pct || homeStats?.three_pct || homeStats?.three_point_pct),
        three_made_per_game: fmtNum(homeStats?.fg3m || homeStats?.three_made_per_game),
        three_attempted_per_game: fmtNum(homeStats?.fg3a || homeStats?.three_attempted_per_game)
      },
      away: {
        team: away.full_name || away.name,
        three_pct: fmtPct(awayStats?.fg3_pct || awayStats?.three_pct || awayStats?.three_point_pct),
        three_made_per_game: fmtNum(awayStats?.fg3m || awayStats?.three_made_per_game),
        three_attempted_per_game: fmtNum(awayStats?.fg3a || awayStats?.three_attempted_per_game)
      }
    };
  },

  // ===== PLAYERS =====
  TOP_PLAYERS: async (bdlSport, home, away, season) => {
    const [homePlayers, awayPlayers] = await Promise.all([
      fetchTopPlayersForTeam(bdlSport, home, season),
      fetchTopPlayersForTeam(bdlSport, away, season)
    ]);
    
    return {
      category: 'Top Players',
      home: {
        team: home.full_name || home.name,
        players: homePlayers
      },
      away: {
        team: away.full_name || away.name,
        players: awayPlayers
      }
    };
  },
  
  INJURIES: async (bdlSport, home, away) => {
    const teamIds = [home.id, away.id];
    const injuries = await ballDontLieService.getInjuriesGeneric(bdlSport, { team_ids: teamIds });
    
    const homeInjuries = injuries?.filter(i => 
      i.player?.team?.id === home.id || i.team_id === home.id
    ) || [];
    const awayInjuries = injuries?.filter(i => 
      i.player?.team?.id === away.id || i.team_id === away.id
    ) || [];
    
    return {
      category: 'Injuries',
      home: {
        team: home.full_name || home.name,
        injuries: homeInjuries.map(i => ({
          player: `${i.player?.first_name} ${i.player?.last_name}`,
          position: i.player?.position,
          status: i.status,
          comment: i.comment?.slice(0, 100)
        }))
      },
      away: {
        team: away.full_name || away.name,
        injuries: awayInjuries.map(i => ({
          player: `${i.player?.first_name} ${i.player?.last_name}`,
          position: i.player?.position,
          status: i.status,
          comment: i.comment?.slice(0, 100)
        }))
      }
    };
  },

  // ===== STANDINGS & RECORDS =====
  // ===== STANDINGS & RECORDS =====
  STANDINGS: async (bdlSport, home, away, season) => {
    const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
    
    const homeSt = standings?.find(s => s.team?.id === home.id);
    const awaySt = standings?.find(s => s.team?.id === away.id);
    
    return {
      category: 'Full Standings & Records',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        wins: homeSt?.wins || 'N/A',
        losses: homeSt?.losses || 'N/A',
        overall_record: `${homeSt?.wins || 0}-${homeSt?.losses || 0}`,
        home_record: homeSt?.home_record || 'N/A',
        away_record: homeSt?.road_record || 'N/A',
        conference_record: homeSt?.conference_record || 'N/A',
        conference_rank: homeSt?.conference_rank || 'N/A',
        division_record: homeSt?.division_record || 'N/A',
        division_rank: homeSt?.division_rank || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        wins: awaySt?.wins || 'N/A',
        losses: awaySt?.losses || 'N/A',
        overall_record: `${awaySt?.wins || 0}-${awaySt?.losses || 0}`,
        home_record: awaySt?.home_record || 'N/A',
        away_record: awaySt?.road_record || 'N/A',
        conference_record: awaySt?.conference_record || 'N/A',
        conference_rank: awaySt?.conference_rank || 'N/A',
        division_record: awaySt?.division_record || 'N/A',
        division_rank: awaySt?.division_rank || 'N/A'
      },
      context: homeSt && awaySt ? 
        `${home.name} (${homeSt.wins}-${homeSt.losses}, #${homeSt.conference_rank} in conf) vs ${away.name} (${awaySt.wins}-${awaySt.losses}, #${awaySt.conference_rank} in conf)` :
        'Standings comparison unavailable'
    };
  },
  
  TEAM_RECORD: async (bdlSport, home, away, season) => {
    // Alias for STANDINGS
    return FETCHERS.STANDINGS(bdlSport, home, away, season);
  },
  
  CONFERENCE_STANDING: async (bdlSport, home, away, season) => {
    // Alias for STANDINGS
    return FETCHERS.STANDINGS(bdlSport, home, away, season);
  },
  
  HOME_AWAY_SPLITS: async (bdlSport, home, away, season) => {
    const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
    
    const homeSt = standings?.find(s => s.team?.id === home.id);
    const awaySt = standings?.find(s => s.team?.id === away.id);
    
    return {
      category: 'Home/Away Splits',
      home: {
        team: home.full_name || home.name,
        overall: homeSt ? `${homeSt.wins}-${homeSt.losses}` : 'N/A',
        home_record: homeSt?.home_record || 'N/A',
        away_record: homeSt?.road_record || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        overall: awaySt ? `${awaySt.wins}-${awaySt.losses}` : 'N/A',
        home_record: awaySt?.home_record || 'N/A',
        away_record: awaySt?.road_record || 'N/A'
      }
    };
  },

  // ===== RECENT FORM =====
  RECENT_FORM: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching RECENT_FORM for ${away.name} @ ${home.name} (${bdlSport})`);
    
    // NFL uses seasons[] and team_ids[], not date ranges
    const isNFL = bdlSport === 'americanfootball_nfl';
    const isNCAA = bdlSport === 'americanfootball_ncaaf' || bdlSport === 'basketball_ncaab';
    
    let params;
    if (isNFL || isNCAA) {
      // For football, use season filter - get all games this season
      params = {
        seasons: [season],
        per_page: 20 // Get more games to ensure we have enough
      };
    } else {
      // For other sports, use date range
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      params = {
        start_date: thirtyDaysAgo.toISOString().split('T')[0],
        end_date: today.toISOString().split('T')[0],
        per_page: 20
      };
    }
    
    try {
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], ...params }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], ...params })
      ]);
      
      console.log(`[Stat Router] Got ${homeGames?.length || 0} games for ${home.name}, ${awayGames?.length || 0} for ${away.name}`);
      
      // Sort by date descending (most recent first)
      const sortByDate = (a, b) => new Date(b.date) - new Date(a.date);
      const sortedHomeGames = (homeGames || []).sort(sortByDate);
      const sortedAwayGames = (awayGames || []).sort(sortByDate);
      
      const homeForm = formatRecentGames(sortedHomeGames, home.name);
      const awayForm = formatRecentGames(sortedAwayGames, away.name);
      
      return {
        category: 'Recent Form (Last 5 Games)',
        home: {
          team: home.full_name || home.name,
          ...homeForm
        },
        away: {
          team: away.full_name || away.name,
          ...awayForm
        },
        note: 'These are REAL game results from this season. Use them in your analysis.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching recent form:`, error.message);
      return {
        category: 'Recent Form',
        home: { team: home.full_name || home.name, record: 'N/A', note: 'Data unavailable' },
        away: { team: away.full_name || away.name, record: 'N/A', note: 'Data unavailable' }
      };
    }
  },

  // ===== CLUTCH STATS (Close Game Record) =====
  CLUTCH_STATS: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching CLUTCH_STATS (close game record) for ${away.name} @ ${home.name}`);
    
    try {
      // Get recent games to calculate close game record
      const today = new Date();
      const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
      const params = {
        start_date: ninetyDaysAgo.toISOString().split('T')[0],
        end_date: today.toISOString().split('T')[0],
        per_page: 50
      };
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], ...params }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], ...params })
      ]);
      
      // Calculate close game record (games decided by 5 points or less)
      const calcClutchRecord = (games, teamName) => {
        let closeWins = 0;
        let closeLosses = 0;
        const closeGameMargin = 5;
        
        for (const game of games || []) {
          const homeScore = game.home_team_score || game.home_score || 0;
          const awayScore = game.visitor_team_score || game.away_score || game.away_team_score || 0;
          const margin = Math.abs(homeScore - awayScore);
          
          // Skip unplayed games
          if (homeScore === 0 && awayScore === 0) continue;
          
          if (margin <= closeGameMargin) {
            const isHomeTeam = game.home_team?.name?.includes(teamName.split(' ').pop()) || 
                               game.home_team?.full_name?.includes(teamName);
            const won = isHomeTeam ? homeScore > awayScore : awayScore > homeScore;
            if (won) closeWins++;
            else closeLosses++;
          }
        }
        
        const total = closeWins + closeLosses;
        const pct = total > 0 ? ((closeWins / total) * 100).toFixed(0) : 'N/A';
        
        return {
          close_record: `${closeWins}-${closeLosses}`,
          close_win_pct: total > 0 ? `${pct}%` : 'N/A',
          close_games: total
        };
      };
      
      const homeClutch = calcClutchRecord(homeGames, home.name);
      const awayClutch = calcClutchRecord(awayGames, away.name);
      
      return {
        category: 'Clutch Stats (Games Decided by ≤5 Points)',
        home: {
          team: home.full_name || home.name,
          ...homeClutch
        },
        away: {
          team: away.full_name || away.name,
          ...awayClutch
        },
        interpretation: `Close game records indicate which team performs better in tight situations`
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching clutch stats:`, error.message);
      return {
        category: 'Clutch Stats',
        home: { team: home.full_name || home.name, close_record: 'N/A' },
        away: { team: away.full_name || away.name, close_record: 'N/A' }
      };
    }
  },

  // ===== NFL SPECIFIC =====
  // Helper to extract first element from BDL team_season_stats array response
  _extractNflStats: (statsArray) => {
    if (Array.isArray(statsArray) && statsArray.length > 0) return statsArray[0];
    return statsArray || {};
  },

  OFFENSIVE_EPA: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    // Extract first element from array response
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Offensive EPA (Points Per Game / Yards Per Play proxies)',
      home: {
        team: home.full_name || home.name,
        points_per_game: fmtNum(homeStats?.total_points_per_game),
        yards_per_game: fmtNum(homeStats?.total_offensive_yards_per_game),
        yards_per_play: fmtNum(homeStats?.net_total_offensive_yards_per_game / 
          ((homeStats?.passing_attempts || 0) + (homeStats?.rushing_attempts || 0)) || 0, 2)
      },
      away: {
        team: away.full_name || away.name,
        points_per_game: fmtNum(awayStats?.total_points_per_game),
        yards_per_game: fmtNum(awayStats?.total_offensive_yards_per_game),
        yards_per_play: fmtNum(awayStats?.net_total_offensive_yards_per_game / 
          ((awayStats?.passing_attempts || 0) + (awayStats?.rushing_attempts || 0)) || 0, 2)
      }
    };
  },
  
  DEFENSIVE_EPA: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Defensive EPA (Points Allowed / Yards Allowed proxies)',
      home: {
        team: home.full_name || home.name,
        opp_points_per_game: fmtNum(homeStats?.opp_total_points_per_game),
        opp_yards_per_game: fmtNum(homeStats?.opp_total_offensive_yards_per_game)
      },
      away: {
        team: away.full_name || away.name,
        opp_points_per_game: fmtNum(awayStats?.opp_total_points_per_game),
        opp_yards_per_game: fmtNum(awayStats?.opp_total_offensive_yards_per_game)
      }
    };
  },
  
  TURNOVER_MARGIN: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Turnover Margin',
      home: {
        team: home.full_name || home.name,
        turnover_diff: fmtNum(homeStats?.misc_turnover_differential, 0),
        takeaways: fmtNum(homeStats?.misc_total_takeaways, 0),
        giveaways: fmtNum(homeStats?.misc_total_giveaways, 0)
      },
      away: {
        team: away.full_name || away.name,
        turnover_diff: fmtNum(awayStats?.misc_turnover_differential, 0),
        takeaways: fmtNum(awayStats?.misc_total_takeaways, 0),
        giveaways: fmtNum(awayStats?.misc_total_giveaways, 0)
      },
      interpretation: interpretTurnoverMargin(homeStats, awayStats)
    };
  },
  
  RED_ZONE_OFFENSE: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Red Zone Offense',
      home: {
        team: home.full_name || home.name,
        third_down_pct: fmtPct(homeStats?.misc_third_down_conv_pct / 100),
        fourth_down_pct: fmtPct(homeStats?.misc_fourth_down_conv_pct / 100)
      },
      away: {
        team: away.full_name || away.name,
        third_down_pct: fmtPct(awayStats?.misc_third_down_conv_pct / 100),
        fourth_down_pct: fmtPct(awayStats?.misc_fourth_down_conv_pct / 100)
      }
    };
  },
  
  QB_STATS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Quarterback/Passing Stats',
      home: {
        team: home.full_name || home.name,
        qb_rating: fmtNum(homeStats?.passing_qb_rating),
        completion_pct: fmtPct(homeStats?.passing_completion_pct / 100),
        yards_per_attempt: fmtNum(homeStats?.yards_per_pass_attempt),
        passing_tds: fmtNum(homeStats?.passing_touchdowns, 0),
        interceptions: fmtNum(homeStats?.passing_interceptions, 0)
      },
      away: {
        team: away.full_name || away.name,
        qb_rating: fmtNum(awayStats?.passing_qb_rating),
        completion_pct: fmtPct(awayStats?.passing_completion_pct / 100),
        yards_per_attempt: fmtNum(awayStats?.yards_per_pass_attempt),
        passing_tds: fmtNum(awayStats?.passing_touchdowns, 0),
        interceptions: fmtNum(awayStats?.passing_interceptions, 0)
      }
    };
  },
  
  RB_STATS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Rushing Stats',
      home: {
        team: home.full_name || home.name,
        rushing_yards_per_game: fmtNum(homeStats?.rushing_yards_per_game),
        yards_per_carry: fmtNum(homeStats?.rushing_yards_per_rush_attempt),
        rushing_tds: fmtNum(homeStats?.rushing_touchdowns, 0)
      },
      away: {
        team: away.full_name || away.name,
        rushing_yards_per_game: fmtNum(awayStats?.rushing_yards_per_game),
        yards_per_carry: fmtNum(awayStats?.rushing_yards_per_rush_attempt),
        rushing_tds: fmtNum(awayStats?.rushing_touchdowns, 0)
      }
    };
  },

  // ===== SITUATIONAL =====
  REST_SITUATION: async (bdlSport, home, away) => {
    // This would need schedule analysis - for now return basic info
    return {
      category: 'Rest Situation',
      note: 'Rest data requires schedule analysis',
      home: { team: home.full_name || home.name, rest_days: 'Check scout report' },
      away: { team: away.full_name || away.name, rest_days: 'Check scout report' }
    };
  },

  // ===== CATCH-ALL for unimplemented tokens =====
  DEFAULT: async (bdlSport, home, away) => {
    return {
      error: 'Stat not yet implemented',
      home: { team: home.full_name || home.name },
      away: { team: away.full_name || away.name }
    };
  }
};

// Add aliases for tokens that use the same fetcher
const ALIASES = {
  PACE_LAST_10: 'PACE',
  PACE_HOME_AWAY: 'HOME_AWAY_SPLITS',
  EFFICIENCY_LAST_10: 'NET_RATING',
  OPP_EFG_PCT: 'EFG_PCT',
  OPP_TOV_RATE: 'TURNOVER_RATE',
  PAINT_SCORING: 'EFG_PCT',
  MIDRANGE: 'EFG_PCT',
  PAINT_DEFENSE: 'DEFENSIVE_RATING',
  PERIMETER_DEFENSE: 'THREE_PT_SHOOTING',
  TRANSITION_DEFENSE: 'DEFENSIVE_RATING',
  // CLUTCH_STATS now has its own fetcher - calculates close game record
  QUARTER_SPLITS: 'RECENT_FORM',
  LINEUP_DATA: 'TOP_PLAYERS',
  USAGE_RATES: 'TOP_PLAYERS',
  H2H_HISTORY: 'RECENT_FORM',
  VS_ELITE_TEAMS: 'RECENT_FORM',
  ATS_TRENDS: 'RECENT_FORM',
  LUCK_ADJUSTED: 'NET_RATING',
  SCHEDULE_STRENGTH: 'HOME_AWAY_SPLITS',
  TEMPO_CONTROL: 'PACE',
  DREB_RATE: 'OREB_RATE',
  OPP_FT_RATE: 'FT_RATE',
  THREE_PT_DEFENSE: 'THREE_PT_SHOOTING',
  TWO_PT_SHOOTING: 'EFG_PCT',
  HOME_COURT_VALUE: 'HOME_AWAY_SPLITS',
  ROAD_PERFORMANCE: 'HOME_AWAY_SPLITS',
  CONFERENCE_STATS: 'HOME_AWAY_SPLITS',
  NON_CONF_STRENGTH: 'HOME_AWAY_SPLITS',
  EXPERIENCE: 'TOP_PLAYERS',
  BENCH_DEPTH: 'TOP_PLAYERS',
  VS_RANKED: 'RECENT_FORM',
  CLOSE_GAME_RECORD: 'RECENT_FORM',
  EFFICIENCY_TREND: 'NET_RATING',
  PASSING_EPA: 'OFFENSIVE_EPA',
  RUSHING_EPA: 'OFFENSIVE_EPA',
  EPA_LAST_5: 'OFFENSIVE_EPA',
  SUCCESS_RATE_OFFENSE: 'OFFENSIVE_EPA',
  SUCCESS_RATE_DEFENSE: 'DEFENSIVE_EPA',
  EARLY_DOWN_SUCCESS: 'OFFENSIVE_EPA',
  LATE_DOWN_EFFICIENCY: 'RED_ZONE_OFFENSE',
  EXPLOSIVE_PLAYS: 'OFFENSIVE_EPA',
  EXPLOSIVE_ALLOWED: 'DEFENSIVE_EPA',
  OL_RANKINGS: 'RB_STATS',
  DL_RANKINGS: 'DEFENSIVE_EPA',
  PRESSURE_RATE: 'QB_STATS',
  TIME_TO_THROW: 'QB_STATS',
  TURNOVER_LUCK: 'TURNOVER_MARGIN',
  FUMBLE_LUCK: 'TURNOVER_MARGIN',
  RED_ZONE_DEFENSE: 'RED_ZONE_OFFENSE',
  GOAL_LINE: 'RED_ZONE_OFFENSE',
  TWO_MINUTE_DRILL: 'QB_STATS',
  SPECIAL_TEAMS: 'HOME_AWAY_SPLITS',
  KICKING: 'HOME_AWAY_SPLITS',
  FIELD_POSITION: 'HOME_AWAY_SPLITS',
  WR_TE_STATS: 'OFFENSIVE_EPA',
  DEFENSIVE_PLAYMAKERS: 'DEFENSIVE_EPA',
  WEATHER: 'REST_SITUATION',
  DIVISION_RECORD: 'HOME_AWAY_SPLITS',
  PRIMETIME_RECORD: 'HOME_AWAY_SPLITS',
  SP_PLUS_RATINGS: 'NET_RATING',
  SP_PLUS_TREND: 'NET_RATING',
  FEI_RATINGS: 'NET_RATING',
  SUCCESS_RATE: 'OFFENSIVE_EPA',
  EXPLOSIVENESS: 'OFFENSIVE_EPA',
  HAVOC_RATE: 'TURNOVER_MARGIN',
  HAVOC_ALLOWED: 'TURNOVER_MARGIN',
  TALENT_COMPOSITE: 'TOP_PLAYERS',
  BLUE_CHIP_RATIO: 'TOP_PLAYERS',
  TRANSFER_PORTAL: 'TOP_PLAYERS',
  STUFF_RATE: 'RB_STATS',
  RED_ZONE: 'RED_ZONE_OFFENSE',
  THIRD_DOWN: 'RED_ZONE_OFFENSE',
  FOURTH_DOWN: 'RED_ZONE_OFFENSE',
  SPECIAL_TEAMS_RATING: 'HOME_AWAY_SPLITS',
  MOTIVATION_CONTEXT: 'RECENT_FORM',
  HOME_FIELD: 'HOME_AWAY_SPLITS',
  NIGHT_GAME: 'HOME_AWAY_SPLITS',
  WR_STATS: 'OFFENSIVE_EPA',
  DEFENSIVE_STARS: 'DEFENSIVE_EPA',
  CONFERENCE_RECORD: 'HOME_AWAY_SPLITS'
};

// Resolve aliases
for (const [alias, target] of Object.entries(ALIASES)) {
  if (!FETCHERS[alias] && FETCHERS[target]) {
    FETCHERS[alias] = FETCHERS[target];
  }
}

// Default handler for unknown tokens
for (const token of Object.keys(ALIASES)) {
  if (!FETCHERS[token]) {
    FETCHERS[token] = FETCHERS.DEFAULT;
  }
}

// Helper functions
async function fetchTopPlayersForTeam(bdlSport, team, season) {
  try {
    const seasonStats = await ballDontLieService.getPlayerStats(bdlSport, {
      seasons: [season],
      team_ids: [team.id],
      per_page: 10
    });
    
    if (!seasonStats || seasonStats.length === 0) {
      return [{ note: 'No player stats available' }];
    }
    
    // Sort by points or relevant stat
    const sorted = seasonStats
      .filter(p => p.games_played > 0)
      .sort((a, b) => (b.pts || b.points || 0) - (a.pts || a.points || 0))
      .slice(0, 5);
    
    return sorted.map(p => ({
      name: `${p.player?.first_name || ''} ${p.player?.last_name || ''}`.trim(),
      position: p.player?.position || 'N/A',
      games: p.games_played,
      ppg: fmtNum(p.pts_per_game || p.points_per_game || (p.pts / p.games_played)),
      rpg: fmtNum(p.reb_per_game || p.rebounds_per_game || (p.reb / p.games_played)),
      apg: fmtNum(p.ast_per_game || p.assists_per_game || (p.ast / p.games_played))
    }));
  } catch (error) {
    console.warn(`[Stat Router] Error fetching players for ${team.name}:`, error.message);
    return [{ note: 'Player stats unavailable' }];
  }
}

function formatRecentGames(games, teamName) {
  if (!games || games.length === 0) {
    return { record: 'N/A', games: [], note: 'No recent game data available' };
  }
  
  // Filter to only completed games (status = 'Final')
  const completedGames = games.filter(g => 
    g.status === 'Final' || 
    g.home_team_score !== null || 
    g.visitor_team_score !== null
  );
  
  if (completedGames.length === 0) {
    return { record: 'N/A', games: [], note: 'No completed games found' };
  }
  
  let wins = 0, losses = 0, ties = 0;
  const gameDetails = completedGames.slice(0, 5).map(g => {
    // Handle both nested object and string team names
    const homeTeamName = g.home_team?.name || g.home_team?.full_name || g.home_team;
    const awayTeamName = g.visitor_team?.name || g.visitor_team?.full_name || g.away_team?.name || g.away_team;
    
    // Normalize for comparison
    const normalizedTeamName = String(teamName).toLowerCase();
    const normalizedHome = String(homeTeamName).toLowerCase();
    const normalizedAway = String(awayTeamName).toLowerCase();
    
    const isHome = normalizedHome.includes(normalizedTeamName) || normalizedTeamName.includes(normalizedHome);
    
    const teamScore = isHome ? g.home_team_score : g.visitor_team_score;
    const oppScore = isHome ? g.visitor_team_score : g.home_team_score;
    const opponent = isHome ? awayTeamName : homeTeamName;
    
    let result = 'T';
    if (teamScore > oppScore) {
      wins++;
      result = 'W';
    } else if (oppScore > teamScore) {
      losses++;
      result = 'L';
    } else {
      ties++;
    }
    
    // Format date
    const gameDate = g.date ? new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    
    return {
      result,
      score: `${teamScore}-${oppScore}`,
      opponent: opponent || 'Unknown',
      location: isHome ? 'Home' : 'Away',
      date: gameDate,
      week: g.week || null,
      display: `${result} ${teamScore}-${oppScore} ${isHome ? 'vs' : '@'} ${opponent}${gameDate ? ` (${gameDate})` : ''}`
    };
  });
  
  const record = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
  const streak = gameDetails.slice(0, 5).map(g => g.result).join('');
  
  return {
    record,
    last_5: streak,
    games: gameDetails,
    summary: gameDetails.map(g => g.display).join(', ')
  };
}

function buildPaceAnalysis(homeStats, awayStats) {
  const homePace = homeStats?.pace || 0;
  const awayPace = awayStats?.pace || 0;
  const gap = Math.abs(homePace - awayPace);
  
  if (gap > 4) {
    return `SIGNIFICANT PACE CLASH: ${gap.toFixed(1)} possession difference`;
  } else if (gap > 2) {
    return `Moderate pace difference: ${gap.toFixed(1)} possessions`;
  } else {
    return `Similar pace profiles`;
  }
}

function interpretTurnoverMargin(homeStats, awayStats) {
  const homeDiff = homeStats?.misc_turnover_differential || 0;
  const awayDiff = awayStats?.misc_turnover_differential || 0;
  
  const parts = [];
  if (Math.abs(homeDiff) > 6) {
    parts.push(`${homeStats?.team?.name || 'Home'}: ${homeDiff > 0 ? 'LUCKY' : 'UNLUCKY'} (regression likely)`);
  }
  if (Math.abs(awayDiff) > 6) {
    parts.push(`${awayStats?.team?.name || 'Away'}: ${awayDiff > 0 ? 'LUCKY' : 'UNLUCKY'} (regression likely)`);
  }
  
  return parts.length > 0 ? parts.join('; ') : 'Both teams near expected turnover rates';
}

export default { fetchStats };

