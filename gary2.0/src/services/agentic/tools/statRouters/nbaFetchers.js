import { getCurrentSeasonString, sportToBdlKey, normalizeSportName, findTeam, fmtNum, fmtPct, fetchBothTeamSeasonStats, fetchNBATeamScoringStats, fetchNBATeamAdvancedStats, fetchNBALeaders, fetchNBATeamBaseStats, fetchNBATeamOpponentStats, fetchNBATeamDefenseStats, fetchTopPlayersForTeam, formatRecentGames, buildPaceAnalysis, BDL_API_KEY, _nbaBaseStatsCache, _nbaAdvancedStatsCache, _nbaOpponentStatsCache, _nbaDefenseStatsCache, _nbaTeamScoringStatsCache, geminiGroundingSearch, isGameCompleted, getBarttovikRatings } from './statRouterCommon.js';
import { ballDontLieService } from '../../../ballDontLieService.js';
import { ncaabFetchers } from './ncaabFetchers.js';

export const nbaFetchers = {
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
        analysis: `${home.name} pace: ${homePace.toFixed(1)}, ${away.name} pace: ${awayPace.toFixed(1)}, projected: ${avgPace > 0 ? avgPace.toFixed(1) : 'N/A'}`,
        comparison: `${home.name} pace: ${homePace.toFixed(1)}, ${away.name} pace: ${awayPace.toFixed(1)}, projected game pace: ${avgPace > 0 ? avgPace.toFixed(1) : 'N/A'}`
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
    return nbaFetchers.PACE(bdlSport, home, away, season);
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
        comparison: 'Season offensive rating and efficiency data for both teams.'
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
        comparison: 'Season defensive rating data for both teams.'
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
    // For NBA, use BDL Season Averages (Advanced) with BDL v2 usage/scoring data
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
          defensive_rating: homeStats?.defensive_rating || 'N/A',
          // BDL v2: Usage concentration
          usage_concentration: homeStats?.usage_concentration || null,
          // BDL v2: Scoring profile (where they score)
          scoring_profile: homeStats?.scoring_profile || null,
          top_players: homeStats?.top_players || []
        },
        away: {
          team: away.full_name || away.name,
          net_rating: awayStats?.net_rating || 'N/A',
          offensive_rating: awayStats?.offensive_rating || 'N/A',
          defensive_rating: awayStats?.defensive_rating || 'N/A',
          usage_concentration: awayStats?.usage_concentration || null,
          scoring_profile: awayStats?.scoring_profile || null,
          top_players: awayStats?.top_players || []
        },
        gap: gap,
        comparison: 'Season net rating (ORtg - DRtg) for both teams.'
      };
    }
    
    // For NCAAB: use Barttorvik AdjEM (AdjOE - AdjDE) — real adjusted net rating
    if (bdlSport === 'basketball_ncaab') {
      const [homeBartt, awayBartt] = await Promise.all([
        getBarttovikRatings(home.full_name || home.name),
        getBarttovikRatings(away.full_name || away.name)
      ]);

      const homeNet = homeBartt?.adjEM ?? 0;
      const awayNet = awayBartt?.adjEM ?? 0;

      return {
        category: 'Net Rating (Barttorvik AdjEM = AdjOE - AdjDE)',
        source: 'barttorvik.com',
        home: {
          team: home.full_name || home.name,
          net_rating: fmtNum(homeNet),
          offensive_rating: homeBartt?.adjOE ?? 'N/A',
          defensive_rating: homeBartt?.adjDE ?? 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          net_rating: fmtNum(awayNet),
          offensive_rating: awayBartt?.adjOE ?? 'N/A',
          defensive_rating: awayBartt?.adjDE ?? 'N/A'
        },
        gap: fmtNum(homeNet - awayNet),
        comparison: 'Adjusted net rating (AdjOE - AdjDE) for both teams.'
      };
    }

    // For other sports (NHL, NFL, NCAAF)
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
      gap: fmtNum(homeNet - awayNet)
    };
  },

  ADJ_OFFENSIVE_EFF: async (bdlSport, home, away, season) => {
    return nbaFetchers.OFFENSIVE_RATING(bdlSport, home, away, season);
  },

  ADJ_DEFENSIVE_EFF: async (bdlSport, home, away, season) => {
    return nbaFetchers.DEFENSIVE_RATING(bdlSport, home, away, season);
  },

  ADJ_EFFICIENCY_MARGIN: async (bdlSport, home, away, season) => {
    return nbaFetchers.NET_RATING(bdlSport, home, away, season);
  },


  // ===== FOUR FACTORS =====
  EFG_PCT: async (bdlSport, home, away, season) => {
    // For NBA, use BDL Season Averages (Advanced + Opponent)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats, homeOpp, awayOpp] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season),
        fetchNBATeamOpponentStats(home.id, season),
        fetchNBATeamOpponentStats(away.id, season)
      ]);

      return {
        category: 'Shooting Efficiency (BDL Advanced + Opponent)',
        source: 'Ball Don\'t Lie API (Advanced + Opponent)',
        home: {
          team: home.full_name || home.name,
          efg_pct: homeStats?.efg_pct ? `${homeStats.efg_pct}%` : 'N/A',
          true_shooting_pct: homeStats?.true_shooting_pct ? `${homeStats.true_shooting_pct}%` : 'N/A',
          opp_efg_pct_allowed: homeOpp?.opp_efg_pct ? `${homeOpp.opp_efg_pct}%` : 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          efg_pct: awayStats?.efg_pct ? `${awayStats.efg_pct}%` : 'N/A',
          true_shooting_pct: awayStats?.true_shooting_pct ? `${awayStats.true_shooting_pct}%` : 'N/A',
          opp_efg_pct_allowed: awayOpp?.opp_efg_pct ? `${awayOpp.opp_efg_pct}%` : 'N/A'
        },
        comparison: homeStats && awayStats ?
          `eFG% gap: ${(parseFloat(homeStats.efg_pct) - parseFloat(awayStats.efg_pct)).toFixed(1)}% (${home.name} ${homeStats.efg_pct}% vs ${away.name} ${awayStats.efg_pct}%).` :
          'Comparison unavailable',
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
    // For NBA, use REAL tm_tov_pct from advanced stats + opponent TOV context
    if (bdlSport === 'basketball_nba') {
      const [homeAdvanced, awayAdvanced, homeBase, awayBase, homeOpp, awayOpp] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season),
        fetchNBATeamBaseStats(home.id, season),
        fetchNBATeamBaseStats(away.id, season),
        fetchNBATeamOpponentStats(home.id, season),
        fetchNBATeamOpponentStats(away.id, season)
      ]);

      return {
        category: 'Turnover Rate (BDL Advanced + Opponent)',
        source: 'Ball Don\'t Lie API (Advanced: tm_tov_pct + Opponent: opp_tov_rate)',
        home: {
          team: home.full_name || home.name,
          tov_rate: homeAdvanced?.tm_tov_pct ? `${homeAdvanced.tm_tov_pct}%` : 'N/A',
          turnovers_per_game: homeBase?.tov_per_game || 'N/A',
          opp_tov_rate: homeOpp?.opp_tov_rate ? `${homeOpp.opp_tov_rate}%` : 'N/A',
          opp_tov_per_game: homeOpp?.opp_tov_per_game || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          tov_rate: awayAdvanced?.tm_tov_pct ? `${awayAdvanced.tm_tov_pct}%` : 'N/A',
          turnovers_per_game: awayBase?.tov_per_game || 'N/A',
          opp_tov_rate: awayOpp?.opp_tov_rate ? `${awayOpp.opp_tov_rate}%` : 'N/A',
          opp_tov_per_game: awayOpp?.opp_tov_per_game || 'N/A'
        },
        comparison: 'Turnover rate, turnovers per game, and forced turnover data for both teams.',
      };
    }
    
    // For other sports, use getTeamSeasonStats
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    // NCAAB BDL fields: turnover (per game), fga, fta — NO turnover_rate field exists
    // Calculate TOV% = TOV / (FGA + 0.44*FTA + TOV) * 100 (standard Four Factors formula)
    const calcTovRate = (d) => {
      if (!d) return null;
      // NBA has turnovers_per_game; NCAAB has turnover
      const tov = bdlSport === 'basketball_ncaab' ? d.turnover : (d.turnovers_per_game || d.turnover);
      if (tov != null && d.fga && d.fta) return (tov / (d.fga + 0.44 * d.fta + tov)) * 100;
      return null;
    };
    return {
      category: 'Turnover Rate',
      home: {
        team: home.full_name || home.name,
        tov_rate: fmtPct(calcTovRate(homeData)),
        turnovers_per_game: fmtNum(bdlSport === 'basketball_ncaab' ? homeData?.turnover : (homeData?.turnovers_per_game || homeData?.turnover))
      },
      away: {
        team: away.full_name || away.name,
        tov_rate: fmtPct(calcTovRate(awayData)),
        turnovers_per_game: fmtNum(bdlSport === 'basketball_ncaab' ? awayData?.turnover : (awayData?.turnovers_per_game || awayData?.turnover))
      }
    };
  },

  OREB_RATE: async (bdlSport, home, away, season) => {
    // For NBA, use REAL oreb_pct from advanced stats + opponent OREB context
    if (bdlSport === 'basketball_nba') {
      const [homeAdvanced, awayAdvanced, homeBase, awayBase, homeOpp, awayOpp] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season),
        fetchNBATeamBaseStats(home.id, season),
        fetchNBATeamBaseStats(away.id, season),
        fetchNBATeamOpponentStats(home.id, season),
        fetchNBATeamOpponentStats(away.id, season)
      ]);

      return {
        category: 'Offensive Rebounding (BDL Advanced + Opponent)',
        source: 'Ball Don\'t Lie API (Advanced: oreb_pct + Opponent: opp_oreb)',
        home: {
          team: home.full_name || home.name,
          oreb_pct: homeAdvanced?.oreb_pct ? `${homeAdvanced.oreb_pct}%` : 'N/A',
          oreb_per_game: homeBase?.oreb_per_game || 'N/A',
          opp_oreb_per_game: homeOpp?.opp_oreb || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          oreb_pct: awayAdvanced?.oreb_pct ? `${awayAdvanced.oreb_pct}%` : 'N/A',
          oreb_per_game: awayBase?.oreb_per_game || 'N/A',
          opp_oreb_per_game: awayOpp?.opp_oreb || 'N/A'
        },
        comparison: 'Rebounding data for both teams — offensive and defensive boards with opponent context.'
      };
    }
    
    // For other sports, use getTeamSeasonStats
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    // NCAAB BDL fields: oreb, dreb (per game) — NO oreb_pct field exists
    // ORB% = OREB / (OREB + Opponent_DREB) (Dean Oliver formula, Basketball Reference)
    const calcOrebRate = (d, opponentData) => {
      if (!d) return null;
      // NBA may have oreb_pct directly; NCAAB only has raw oreb/dreb
      if (bdlSport !== 'basketball_ncaab' && (d.oreb_pct || d.offensive_reb_pct)) return d.oreb_pct || d.offensive_reb_pct;
      const oreb = bdlSport === 'basketball_ncaab' ? d.oreb : (d.oreb_per_game || d.oreb);
      // Use opponent's DREB for correct ORB% formula; fall back to own DREB if unavailable
      const oppDreb = opponentData ? (bdlSport === 'basketball_ncaab' ? opponentData.dreb : (opponentData.dreb_per_game || opponentData.dreb)) : null;
      const dreb = oppDreb != null ? oppDreb : (bdlSport === 'basketball_ncaab' ? d.dreb : (d.dreb_per_game || d.dreb));
      if (oreb != null && dreb != null && (oreb + dreb) > 0) return (oreb / (oreb + dreb)) * 100;
      return null;
    };
    return {
      category: 'Offensive Rebounding',
      home: {
        team: home.full_name || home.name,
        oreb_rate: fmtPct(calcOrebRate(homeData, awayData)),
        oreb_per_game: fmtNum(bdlSport === 'basketball_ncaab' ? homeData?.oreb : (homeData?.oreb_per_game || homeData?.oreb))
      },
      away: {
        team: away.full_name || away.name,
        oreb_rate: fmtPct(calcOrebRate(awayData, homeData)),
        oreb_per_game: fmtNum(bdlSport === 'basketball_ncaab' ? awayData?.oreb : (awayData?.oreb_per_game || awayData?.oreb))
      }
    };
  },

  FT_RATE: async (bdlSport, home, away, season) => {
    // For NBA, use team-level base stats + opponent FT data
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats, homeOpp, awayOpp] = await Promise.all([
        fetchNBATeamBaseStats(home.id, season),
        fetchNBATeamBaseStats(away.id, season),
        fetchNBATeamOpponentStats(home.id, season),
        fetchNBATeamOpponentStats(away.id, season)
      ]);

      return {
        category: 'Free Throw Rate (BDL Base + Opponent)',
        source: 'Ball Don\'t Lie API (Base + Opponent)',
        home: {
          team: home.full_name || home.name,
          ft_rate: homeStats?.ft_rate || 'N/A',
          ft_pct: homeStats?.ft_pct ? `${homeStats.ft_pct}%` : 'N/A',
          fta_per_game: homeStats?.fta_per_game || 'N/A',
          opp_ft_rate: homeOpp?.opp_ft_rate ? `${homeOpp.opp_ft_rate}%` : 'N/A',
          opp_fta_per_game: homeOpp?.opp_fta_per_game || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          ft_rate: awayStats?.ft_rate || 'N/A',
          ft_pct: awayStats?.ft_pct ? `${awayStats.ft_pct}%` : 'N/A',
          fta_per_game: awayStats?.fta_per_game || 'N/A',
          opp_ft_rate: awayOpp?.opp_ft_rate ? `${awayOpp.opp_ft_rate}%` : 'N/A',
          opp_fta_per_game: awayOpp?.opp_fta_per_game || 'N/A'
        },
        comparison: 'Free throw rate, attempts per game, and opponent FT data for both teams.'
      };
    }
    
    // For other sports, use getTeamSeasonStats
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
    // For NBA, use player-aggregated base stats (BDL has no team_season_stats for NBA)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamBaseStats(home.id, season),
        fetchNBATeamBaseStats(away.id, season)
      ]);
      
      return {
        category: 'Three-Point Shooting',
        home: {
          team: home.full_name || home.name,
          three_pct: homeStats?.fg3_pct ? `${homeStats.fg3_pct}%` : 'N/A',
          three_made_per_game: homeStats?.fg3m_per_game || 'N/A',
          three_attempted_per_game: homeStats?.fg3a_per_game || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          three_pct: awayStats?.fg3_pct ? `${awayStats.fg3_pct}%` : 'N/A',
          three_made_per_game: awayStats?.fg3m_per_game || 'N/A',
          three_attempted_per_game: awayStats?.fg3a_per_game || 'N/A'
        },
        comparison: 'Season shooting splits (FG%, 3P%, FT%) for both teams.',
      };
    }
    
    // For other sports, use getTeamSeasonStats
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    // BDL returns an array - extract first item
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
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


  // ===== NCAAB/NCAAF SPECIFIC STATS =====
  // These provide actual data that BDL has for college sports
  
  SCORING: async (bdlSport, home, away, season) => {
    const { homeData, awayData } = await fetchBothTeamSeasonStats(bdlSport, home, away, season);
    
    return {
      category: 'Scoring',
      home: {
        team: home.full_name || home.name,
        points_per_game: fmtNum(homeData?.pts || homeData?.points_per_game, 1),
        fg_pct: fmtPct(homeData?.fg_pct),
        games_played: homeData?.games_played || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        points_per_game: fmtNum(awayData?.pts || awayData?.points_per_game, 1),
        fg_pct: fmtPct(awayData?.fg_pct),
        games_played: awayData?.games_played || 'N/A'
      }
    };
  },

  ASSISTS: async (bdlSport, home, away, season) => {
    const { homeData, awayData } = await fetchBothTeamSeasonStats(bdlSport, home, away, season);
    
    return {
      category: 'Assists',
      home: {
        team: home.full_name || home.name,
        assists_per_game: fmtNum(homeData?.ast || homeData?.assists_per_game, 1)
      },
      away: {
        team: away.full_name || away.name,
        assists_per_game: fmtNum(awayData?.ast || awayData?.assists_per_game, 1)
      }
    };
  },

  REBOUNDS: async (bdlSport, home, away, season) => {
    const { homeData, awayData } = await fetchBothTeamSeasonStats(bdlSport, home, away, season);
    
    return {
      category: 'Rebounding',
      home: {
        team: home.full_name || home.name,
        rebounds_per_game: fmtNum(homeData?.reb || homeData?.rebounds_per_game, 1),
        oreb_per_game: fmtNum(homeData?.oreb, 1),
        dreb_per_game: fmtNum(homeData?.dreb, 1)
      },
      away: {
        team: away.full_name || away.name,
        rebounds_per_game: fmtNum(awayData?.reb || awayData?.rebounds_per_game, 1),
        oreb_per_game: fmtNum(awayData?.oreb, 1),
        dreb_per_game: fmtNum(awayData?.dreb, 1)
      }
    };
  },

  STEALS: async (bdlSport, home, away, season) => {
    const { homeData, awayData } = await fetchBothTeamSeasonStats(bdlSport, home, away, season);
    
    return {
      category: 'Steals',
      home: {
        team: home.full_name || home.name,
        steals_per_game: fmtNum(homeData?.stl || homeData?.steals_per_game, 1)
      },
      away: {
        team: away.full_name || away.name,
        steals_per_game: fmtNum(awayData?.stl || awayData?.steals_per_game, 1)
      }
    };
  },

  BLOCKS: async (bdlSport, home, away, season) => {
    const { homeData, awayData } = await fetchBothTeamSeasonStats(bdlSport, home, away, season);
    
    return {
      category: 'Blocks',
      home: {
        team: home.full_name || home.name,
        blocks_per_game: fmtNum(homeData?.blk || homeData?.blocks_per_game, 1)
      },
      away: {
        team: away.full_name || away.name,
        blocks_per_game: fmtNum(awayData?.blk || awayData?.blocks_per_game, 1)
      }
    };
  },

  FG_PCT: async (bdlSport, home, away, season) => {
    const { homeData, awayData } = await fetchBothTeamSeasonStats(bdlSport, home, away, season);
    
    return {
      category: 'Field Goal Percentage',
      home: {
        team: home.full_name || home.name,
        fg_pct: fmtPct(homeData?.fg_pct),
        fgm_per_game: fmtNum(homeData?.fgm, 1),
        fga_per_game: fmtNum(homeData?.fga, 1)
      },
      away: {
        team: away.full_name || away.name,
        fg_pct: fmtPct(awayData?.fg_pct),
        fgm_per_game: fmtNum(awayData?.fgm, 1),
        fga_per_game: fmtNum(awayData?.fga, 1)
      }
    };
  },



  // ===== PLAYERS =====
  TOP_PLAYERS: async (bdlSport, home, away, season) => {
    // For NBA, use player-aggregated base stats which includes top_players
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamBaseStats(home.id, season),
        fetchNBATeamBaseStats(away.id, season)
      ]);
      
      return {
        category: 'Top Players',
        home: {
          team: home.full_name || home.name,
          players: homeStats?.top_players || [{ note: 'No player data' }]
        },
        away: {
          team: away.full_name || away.name,
          players: awayStats?.top_players || [{ note: 'No player data' }]
        }
      };
    }
    
    // For other sports, use the generic fetcher
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
    // NCAAF/NCAAB standings require conference_id - skip to avoid 400 errors
    // Standings snapshot is already fetched in scoutReportBuilder with proper conference handling
    if (bdlSport === 'americanfootball_ncaaf' || bdlSport === 'basketball_ncaab') {
      return {
        category: 'Full Standings & Records',
        note: 'College standings require conference_id. Check the Scout Report standings snapshot for conference records.',
        home: { team: home.full_name || home.name, overall: 'See Scout Report', conference_record: 'See Scout Report' },
        away: { team: away.full_name || away.name, overall: 'See Scout Report', conference_record: 'See Scout Report' }
      };
    }

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
    return nbaFetchers.STANDINGS(bdlSport, home, away, season);
  },

  CONFERENCE_STANDING: async (bdlSport, home, away, season) => {
    // Alias for STANDINGS
    return nbaFetchers.STANDINGS(bdlSport, home, away, season);
  },

  HOME_AWAY_SPLITS: async (bdlSport, home, away, season) => {
    // NCAAB: BDL standings require conference_id — delegate to Gemini Grounding fetcher
    if (bdlSport === 'basketball_ncaab') {
      return ncaabFetchers.NCAAB_HOME_AWAY_SPLITS(bdlSport, home, away, season);
    }
    // NCAAF: BDL standings require conference_id — no grounding fetcher available
    if (bdlSport === 'americanfootball_ncaaf') {
      return {
        category: 'Home/Away Splits',
        note: 'NCAAF home/away splits unavailable via BDL standings - use RECENT_FORM for game context',
        home: { team: home.full_name || home.name, overall: 'N/A', home_record: 'N/A', away_record: 'N/A' },
        away: { team: away.full_name || away.name, overall: 'N/A', home_record: 'N/A', away_record: 'N/A' }
      };
    }
    
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
      },
      comparison: 'Season home/away records and splits for both teams.'
    };
  },


  // ===== CONFERENCE STATS (REAL DATA - from BDL Standings) =====
  CONFERENCE_STATS: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching CONFERENCE_STATS for ${away.name} @ ${home.name}`);
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const homeSt = standings?.find(s => s.team?.id === home.id);
      const awaySt = standings?.find(s => s.team?.id === away.id);
      
      // Parse conference record (format: "X-Y")
      const parseConfRecord = (record) => {
        if (!record || record === 'N/A') return { wins: 0, losses: 0, pct: null };
        const parts = record.split('-');
        const wins = parseInt(parts[0]) || 0;
        const losses = parseInt(parts[1]) || 0;
        const total = wins + losses;
        return { wins, losses, pct: total > 0 ? (wins / total * 100).toFixed(0) : null };
      };
      
      const homeConf = parseConfRecord(homeSt?.conference_record);
      const awayConf = parseConfRecord(awaySt?.conference_record);
      
      return {
        category: 'Conference Performance',
        source: 'Ball Don\'t Lie API (Standings)',
        home: {
          team: home.full_name || home.name,
          conference: homeSt?.team?.conference || 'N/A',
          conference_record: homeSt?.conference_record || 'N/A',
          conference_win_pct: homeConf.pct ? `${homeConf.pct}%` : 'N/A',
          conference_rank: homeSt?.conference_rank || 'N/A',
          division: homeSt?.team?.division || 'N/A',
          division_record: homeSt?.division_record || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          conference: awaySt?.team?.conference || 'N/A',
          conference_record: awaySt?.conference_record || 'N/A',
          conference_win_pct: awayConf.pct ? `${awayConf.pct}%` : 'N/A',
          conference_rank: awaySt?.conference_rank || 'N/A',
          division: awaySt?.team?.division || 'N/A',
          division_record: awaySt?.division_record || 'N/A'
        },
        same_conference: homeSt?.team?.conference === awaySt?.team?.conference,
        same_division: homeSt?.team?.division === awaySt?.team?.division,
        comparison: homeSt?.team?.conference === awaySt?.team?.conference
          ? 'Conference game — standings and conference records for both teams.'
          : 'Non-conference game — standings and conference records for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching CONFERENCE_STATS:`, error.message);
      return {
        category: 'Conference Performance',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== NON-CONFERENCE STRENGTH (REAL DATA - calculated from games) =====
  NON_CONF_STRENGTH: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching NON_CONF_STRENGTH for ${away.name} @ ${home.name}`);
    
    try {
      // Get standings to know each team's conference
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const homeSt = standings?.find(s => s.team?.id === home.id);
      const awaySt = standings?.find(s => s.team?.id === away.id);
      
      const homeConf = homeSt?.team?.conference;
      const awayConf = awaySt?.team?.conference;
      
      // Build map of team ID -> conference
      const teamConfMap = {};
      for (const s of standings || []) {
        if (s.team?.id && s.team?.conference) {
          teamConfMap[s.team.id] = s.team.conference;
        }
      }
      
      // Get season games for both teams
      const seasonStart = new Date(season - 1, 9, 1); // Oct 1
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        })
      ]);
      
      // Calculate non-conference record
      const calcNonConfRecord = (games, teamId, teamConf) => {
        let wins = 0, losses = 0;
        const nonConfGames = [];
        
        for (const game of games || []) {
          const homeScore = game.home_team_score || game.home_score || 0;
          const awayScore = game.visitor_team_score || game.away_score || 0;
          if (homeScore === 0 && awayScore === 0) continue; // Unplayed
          
          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          const oppId = isHome 
            ? (game.visitor_team?.id || game.visitor_team_id)
            : (game.home_team?.id || game.home_team_id);
          
          const oppConf = teamConfMap[oppId];
          
          // Non-conference = different conference
          if (oppConf && oppConf !== teamConf) {
            const won = isHome ? homeScore > awayScore : awayScore > homeScore;
            if (won) wins++;
            else losses++;
            nonConfGames.push({
              opponent: isHome ? game.visitor_team?.name : game.home_team?.name,
              result: won ? 'W' : 'L',
              opponent_conf: oppConf
            });
          }
        }
        
        const total = wins + losses;
        return {
          record: total > 0 ? `${wins}-${losses}` : 'No non-conf games',
          win_pct: total > 0 ? `${(wins / total * 100).toFixed(0)}%` : 'N/A',
          games_played: total,
          recent: nonConfGames.slice(-3).reverse()
        };
      };
      
      const homeNonConf = calcNonConfRecord(homeGames, home.id, homeConf);
      const awayNonConf = calcNonConfRecord(awayGames, away.id, awayConf);
      
      return {
        category: 'Non-Conference Strength',
        source: 'Ball Don\'t Lie API (calculated)',
        home: {
          team: home.full_name || home.name,
          conference: homeConf || 'N/A',
          non_conf_record: homeNonConf.record,
          non_conf_win_pct: homeNonConf.win_pct,
          non_conf_games: homeNonConf.games_played,
          recent_non_conf: homeNonConf.recent
        },
        away: {
          team: away.full_name || away.name,
          conference: awayConf || 'N/A',
          non_conf_record: awayNonConf.record,
          non_conf_win_pct: awayNonConf.win_pct,
          non_conf_games: awayNonConf.games_played,
          recent_non_conf: awayNonConf.recent
        },
        comparison: 'Conference standings and playoff positioning data for both teams.',
        note: 'Non-conference records provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NON_CONF_STRENGTH:`, error.message);
      return {
        category: 'Non-Conference Strength',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== DEFENSIVE REBOUNDING (REAL DATA — DREB% from advanced + opponent OREB context) =====
  DREB_RATE: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching DREB_RATE for ${away.name} @ ${home.name}`);

    if (bdlSport !== 'basketball_nba') {
      return {
        category: 'Defensive Rebounding',
        note: 'DREB rate currently only available for NBA',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }

    try {
      const [homeAdvanced, awayAdvanced, homeOpp, awayOpp, homeBase, awayBase] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season),
        fetchNBATeamOpponentStats(home.id, season),
        fetchNBATeamOpponentStats(away.id, season),
        fetchNBATeamBaseStats(home.id, season),
        fetchNBATeamBaseStats(away.id, season)
      ]);

      return {
        category: 'Defensive Rebounding',
        source: 'Ball Don\'t Lie API (Advanced + Opponent)',
        home: {
          team: home.full_name || home.name,
          dreb_pct: homeAdvanced?.dreb_pct ? `${homeAdvanced.dreb_pct}%` : 'N/A',
          dreb_per_game: homeBase?.dreb_per_game || 'N/A',
          opp_oreb_per_game: homeOpp?.opp_oreb || 'N/A',
          games_played: homeAdvanced?.games_played || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          dreb_pct: awayAdvanced?.dreb_pct ? `${awayAdvanced.dreb_pct}%` : 'N/A',
          dreb_per_game: awayBase?.dreb_per_game || 'N/A',
          opp_oreb_per_game: awayOpp?.opp_oreb || 'N/A',
          games_played: awayAdvanced?.games_played || 'N/A'
        },
        comparison: 'Defensive rebounding rate, DREB per game, and opponent OREB data for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching DREB_RATE:`, error.message);
      return {
        category: 'Defensive Rebounding',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== POINT DIFFERENTIAL TREND (REAL DATA - L5 vs Season) =====
  EFFICIENCY_TREND: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching EFFICIENCY_TREND (point differential) for ${away.name} @ ${home.name}`);
    
    try {
      // Get season games for point differential trends
      const seasonStart = new Date(season - 1, 9, 1);
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 30
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 30
        })
      ]);
      
      // Calculate efficiency trend (point differential)
      const calcEfficiencyTrend = (games, teamId) => {
        const completed = (games || [])
          .filter(g => {
            const hs = g.home_team_score || g.home_score || 0;
            const as = g.visitor_team_score || g.away_score || 0;
            return hs > 0 || as > 0;
          })
          .sort((a, b) => new Date(b.date || b.game_date) - new Date(a.date || a.game_date));
        
        if (completed.length < 5) return null;
        
        // Calculate point differential for each game
        const margins = completed.map(g => {
          const isHome = (g.home_team?.id || g.home_team_id) === teamId;
          const teamScore = isHome ? (g.home_team_score || g.home_score) : (g.visitor_team_score || g.away_score);
          const oppScore = isHome ? (g.visitor_team_score || g.away_score) : (g.home_team_score || g.home_score);
          return teamScore - oppScore;
        });
        
        const l5Margins = margins.slice(0, 5);
        const l10Margins = margins.slice(0, 10);
        const seasonMargins = margins;
        
        const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        
        const l5Avg = avg(l5Margins);
        const l10Avg = avg(l10Margins);
        const seasonAvg = avg(seasonMargins);
        
        return {
          l5_margin: `${l5Avg > 0 ? '+' : ''}${l5Avg.toFixed(1)}`,
          l10_margin: `${l10Avg > 0 ? '+' : ''}${l10Avg.toFixed(1)}`,
          season_margin: `${seasonAvg > 0 ? '+' : ''}${seasonAvg.toFixed(1)}`,
          games_analyzed: completed.length
        };
      };
      
      const homeTrend = calcEfficiencyTrend(homeGames, home.id);
      const awayTrend = calcEfficiencyTrend(awayGames, away.id);
      
      return {
        category: 'Point Differential Trend (L5 vs L10 vs Season)',
        source: 'Ball Don\'t Lie API (calculated)',
        data_scope: 'Point differential trends (not pace-adjusted efficiency)',
        home: {
          team: home.full_name || home.name,
          ...homeTrend
        },
        away: {
          team: away.full_name || away.name,
          ...awayTrend
        },
        comparison: 'Recent point differential trends for both teams.',
        note: 'Raw point differentials for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching EFFICIENCY_TREND:`, error.message);
      return {
        category: 'Efficiency Trend',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== THREE POINT DEFENSE (REAL DATA — opponent 3PT% + volume from BDL) =====
  THREE_PT_DEFENSE: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching THREE_PT_DEFENSE for ${away.name} @ ${home.name}`);
    const [homeOpp, awayOpp] = await Promise.all([
      fetchNBATeamOpponentStats(home.id, season),
      fetchNBATeamOpponentStats(away.id, season)
    ]);
    return {
      category: 'Three Point Defense',
      source: 'Ball Don\'t Lie API (Opponent Stats)',
      home: {
        team: home.full_name || home.name,
        opp_fg3_pct: homeOpp?.opp_fg3_pct ? `${homeOpp.opp_fg3_pct}%` : 'N/A',
        opp_fg3a_per_game: homeOpp?.opp_fg3a_per_game || 'N/A',
        opp_fg3m_per_game: homeOpp?.opp_fg3m_per_game || 'N/A',
        games_played: homeOpp?.games_played || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        opp_fg3_pct: awayOpp?.opp_fg3_pct ? `${awayOpp.opp_fg3_pct}%` : 'N/A',
        opp_fg3a_per_game: awayOpp?.opp_fg3a_per_game || 'N/A',
        opp_fg3m_per_game: awayOpp?.opp_fg3m_per_game || 'N/A',
        games_played: awayOpp?.games_played || 'N/A'
      },
      comparison: 'Opponent 3-point shooting data allowed by each team.'
    };
  },


  // ===== OPPONENT FREE THROW RATE (REAL DATA — from BDL opponent stats) =====
  OPP_FT_RATE: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching OPP_FT_RATE for ${away.name} @ ${home.name}`);

    try {
      const [homeOpp, awayOpp] = await Promise.all([
        fetchNBATeamOpponentStats(home.id, season),
        fetchNBATeamOpponentStats(away.id, season)
      ]);

      return {
        category: 'Opponent Free Throw Rate (Foul Discipline)',
        source: 'Ball Don\'t Lie API (Opponent Stats)',
        home: {
          team: home.full_name || home.name,
          opp_ft_rate: homeOpp?.opp_ft_rate ? `${homeOpp.opp_ft_rate}%` : 'N/A',
          opp_fta_per_game: homeOpp?.opp_fta_per_game || 'N/A',
          opp_ftm_per_game: homeOpp?.opp_ftm_per_game || 'N/A',
          games_played: homeOpp?.games_played || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          opp_ft_rate: awayOpp?.opp_ft_rate ? `${awayOpp.opp_ft_rate}%` : 'N/A',
          opp_fta_per_game: awayOpp?.opp_fta_per_game || 'N/A',
          opp_ftm_per_game: awayOpp?.opp_ftm_per_game || 'N/A',
          games_played: awayOpp?.games_played || 'N/A'
        },
        comparison: 'Opponent free throw rate and attempts allowed by each team.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching OPP_FT_RATE:`, error.message);
      return {
        category: 'Opponent Free Throw Rate',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== OPPONENT EFFECTIVE FG% (REAL DATA — from BDL opponent stats) =====
  OPP_EFG_PCT: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching OPP_EFG_PCT for ${away.name} @ ${home.name}`);
    const [homeOpp, awayOpp] = await Promise.all([
      fetchNBATeamOpponentStats(home.id, season),
      fetchNBATeamOpponentStats(away.id, season)
    ]);
    return {
      category: 'Opponent Shooting Efficiency',
      source: 'Ball Don\'t Lie API (Opponent Stats)',
      home: {
        team: home.full_name || home.name,
        opp_efg_pct: homeOpp?.opp_efg_pct ? `${homeOpp.opp_efg_pct}%` : 'N/A',
        opp_fg_pct: homeOpp?.opp_fg_pct ? `${homeOpp.opp_fg_pct}%` : 'N/A',
        opp_fg3_pct: homeOpp?.opp_fg3_pct ? `${homeOpp.opp_fg3_pct}%` : 'N/A',
        games_played: homeOpp?.games_played || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        opp_efg_pct: awayOpp?.opp_efg_pct ? `${awayOpp.opp_efg_pct}%` : 'N/A',
        opp_fg_pct: awayOpp?.opp_fg_pct ? `${awayOpp.opp_fg_pct}%` : 'N/A',
        opp_fg3_pct: awayOpp?.opp_fg3_pct ? `${awayOpp.opp_fg3_pct}%` : 'N/A',
        games_played: awayOpp?.games_played || 'N/A'
      },
      comparison: 'Opponent FG% and 3P% allowed by each team.'
    };
  },


  // ===== OPPONENT TURNOVER RATE (REAL DATA — from BDL opponent stats) =====
  OPP_TOV_RATE: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching OPP_TOV_RATE for ${away.name} @ ${home.name}`);
    const [homeOpp, awayOpp] = await Promise.all([
      fetchNBATeamOpponentStats(home.id, season),
      fetchNBATeamOpponentStats(away.id, season)
    ]);
    return {
      category: 'Opponent Turnover Rate',
      source: 'Ball Don\'t Lie API (Opponent Stats)',
      home: {
        team: home.full_name || home.name,
        opp_tov_rate: homeOpp?.opp_tov_rate ? `${homeOpp.opp_tov_rate}%` : 'N/A',
        opp_tov_per_game: homeOpp?.opp_tov_per_game || 'N/A',
        games_played: homeOpp?.games_played || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        opp_tov_rate: awayOpp?.opp_tov_rate ? `${awayOpp.opp_tov_rate}%` : 'N/A',
        opp_tov_per_game: awayOpp?.opp_tov_per_game || 'N/A',
        games_played: awayOpp?.games_played || 'N/A'
      },
      comparison: 'Forced turnover rate and turnovers per game allowed by each team.'
    };
  },


  // ===== PACE LAST 10 GAMES (REAL season pace + L10 scoring trend) =====
  PACE_LAST_10: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching PACE_LAST_10 for ${away.name} @ ${home.name}`);

    if (bdlSport !== 'basketball_nba') {
      return { category: 'Pace Last 10', note: 'Only available for NBA' };
    }

    try {
      // Get recent games + season advanced stats (for real pace) in parallel
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [homeGames, awayGames, homeAdvanced, awayAdvanced] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: thirtyDaysAgo.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 15
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: thirtyDaysAgo.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 15
        }),
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);

      // Calculate L10 scoring trend (recent data, not a proxy)
      const calcRecentPace = (games, teamId) => {
        const completed = (games || [])
          .filter(g => ((g.home_team_score ?? g.home_score ?? 0) > 0))
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 10);

        if (completed.length < 5) return null;

        let totalPts = 0, totalOppPts = 0;
        for (const g of completed) {
          const isHome = g.home_team?.id === teamId;
          totalPts += isHome ? (g.home_team_score ?? g.home_score ?? 0) : (g.visitor_team_score ?? g.away_score ?? 0);
          totalOppPts += isHome ? (g.visitor_team_score ?? g.away_score ?? 0) : (g.home_team_score ?? g.home_score ?? 0);
        }

        return {
          games_analyzed: completed.length,
          last_10_total_ppg: ((totalPts + totalOppPts) / completed.length).toFixed(1),
          last_10_team_ppg: (totalPts / completed.length).toFixed(1),
          last_10_opp_ppg: (totalOppPts / completed.length).toFixed(1)
        };
      };

      const homePace = calcRecentPace(homeGames, home.id);
      const awayPace = calcRecentPace(awayGames, away.id);

      return {
        category: 'Pace - Season + Last 10 Games',
        source: 'Ball Don\'t Lie API (Advanced + Recent Games)',
        home: {
          team: home.full_name || home.name,
          season_pace: homeAdvanced?.pace || 'N/A',
          ...homePace
        },
        away: {
          team: away.full_name || away.name,
          season_pace: awayAdvanced?.pace || 'N/A',
          ...awayPace
        },
        comparison: 'Recent pace trends (L5/L10) vs season pace for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching PACE_LAST_10:`, error.message);
      return {
        category: 'Pace Last 10',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== PACE HOME vs AWAY (REAL season pace + venue scoring splits) =====
  PACE_HOME_AWAY: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching PACE_HOME_AWAY for ${away.name} @ ${home.name}`);

    if (bdlSport !== 'basketball_nba') {
      return { category: 'Pace Splits', note: 'Only available for NBA' };
    }

    try {
      const seasonStart = new Date(season - 1, 9, 1);
      const today = new Date();

      const [homeGames, awayGames, homeAdvanced, awayAdvanced] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        }),
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);

      // Calculate home/away scoring splits (venue-specific data)
      const calcPaceSplits = (games, teamId) => {
        const completed = (games || []).filter(g => ((g.home_team_score ?? g.home_score ?? 0) > 0));

        const homeGamesOnly = completed.filter(g => g.home_team?.id === teamId);
        const roadGamesOnly = completed.filter(g => g.visitor_team?.id === teamId);

        const calcAvgTotal = (gList) => {
          if (gList.length === 0) return null;
          let total = 0;
          for (const g of gList) {
            total += (g.home_team_score ?? g.home_score ?? 0) + (g.visitor_team_score ?? g.away_score ?? 0);
          }
          return (total / gList.length).toFixed(1);
        };

        const homeTotalPpg = calcAvgTotal(homeGamesOnly);
        const roadTotalPpg = calcAvgTotal(roadGamesOnly);

        return {
          home_total_ppg: homeTotalPpg,
          home_games: homeGamesOnly.length,
          away_total_ppg: roadTotalPpg,
          away_games: roadGamesOnly.length,
          home_away_diff: homeTotalPpg && roadTotalPpg
            ? (parseFloat(homeTotalPpg) - parseFloat(roadTotalPpg)).toFixed(1)
            : 'N/A'
        };
      };

      const homeSplits = calcPaceSplits(homeGames, home.id);
      const awaySplits = calcPaceSplits(awayGames, away.id);

      return {
        category: 'Pace - Season + Home vs Road Splits',
        source: 'Ball Don\'t Lie API (Advanced + Game Splits)',
        home: {
          team: home.full_name || home.name,
          season_pace: homeAdvanced?.pace || 'N/A',
          home_total_ppg: homeSplits.home_total_ppg,
          away_total_ppg: homeSplits.away_total_ppg,
          home_away_diff: homeSplits.home_away_diff,
          home_games: homeSplits.home_games,
          away_games: homeSplits.away_games,
          note: 'Playing at HOME tonight'
        },
        away: {
          team: away.full_name || away.name,
          season_pace: awayAdvanced?.pace || 'N/A',
          home_total_ppg: awaySplits.home_total_ppg,
          away_total_ppg: awaySplits.away_total_ppg,
          home_away_diff: awaySplits.home_away_diff,
          home_games: awaySplits.home_games,
          away_games: awaySplits.away_games,
          note: 'Playing on ROAD tonight'
        },
        comparison: 'Home and away performance splits for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching PACE_HOME_AWAY:`, error.message);
      return {
        category: 'Pace Splits',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== PAINT SCORING (REAL DATA from BDL scoring type breakdown) =====
  PAINT_SCORING: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching PAINT_SCORING (real zone data) for ${away.name} @ ${home.name}`);
    const [homeAdvanced, awayAdvanced] = await Promise.all([
      fetchNBATeamAdvancedStats(home.id, season),
      fetchNBATeamAdvancedStats(away.id, season)
    ]);

    const formatScoringZones = (stats) => {
      if (!stats?.scoring_profile) return { error: 'Scoring profile unavailable' };
      return {
        pct_paint: stats.scoring_profile.pct_paint || 'N/A',
        pct_midrange: stats.scoring_profile.pct_midrange || 'N/A',
        pct_3pt: stats.scoring_profile.pct_3pt || 'N/A',
        pct_fastbreak: stats.scoring_profile.pct_fastbreak || 'N/A'
      };
    };

    return {
      category: 'Scoring Zone Breakdown (Paint, Midrange, 3PT, Fastbreak)',
      source: 'Ball Don\'t Lie API (Scoring Type)',
      home: {
        team: home.full_name || home.name,
        ...formatScoringZones(homeAdvanced)
      },
      away: {
        team: away.full_name || away.name,
        ...formatScoringZones(awayAdvanced)
      },
      comparison: 'Scoring zone distribution for both teams — paint, perimeter, and free throw breakdown.'
    };
  },


  // ===== MIDRANGE SHOOTING (REAL DATA from BDL scoring type breakdown) =====
  MIDRANGE: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching MIDRANGE (real zone data) for ${away.name} @ ${home.name}`);

    try {
      const [homeAdvanced, awayAdvanced] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);

      const formatMidrange = (stats) => {
        if (!stats?.scoring_profile) return { error: 'Scoring profile unavailable' };
        return {
          pct_midrange: stats.scoring_profile.pct_midrange || 'N/A',
          pct_paint: stats.scoring_profile.pct_paint || 'N/A',
          pct_3pt: stats.scoring_profile.pct_3pt || 'N/A'
        };
      };

      return {
        category: 'Midrange Shooting (Zone Breakdown)',
        source: 'Ball Don\'t Lie API (Scoring Type)',
        home: {
          team: home.full_name || home.name,
          ...formatMidrange(homeAdvanced)
        },
        away: {
          team: away.full_name || away.name,
          ...formatMidrange(awayAdvanced)
        },
        comparison: 'Midrange shooting frequency and efficiency for both teams.',
        note: 'Percentages show share of total scoring from each zone.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching MIDRANGE:`, error.message);
      return {
        category: 'Midrange Shooting',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== PAINT DEFENSE (REAL DATA — opponent paint pts + fast break pts from BDL defense stats) =====
  PAINT_DEFENSE: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching PAINT_DEFENSE for ${away.name} @ ${home.name}`);
    const [homeAdvanced, awayAdvanced, homeBase, awayBase, homeDefense, awayDefense] = await Promise.all([
      fetchNBATeamAdvancedStats(home.id, season),
      fetchNBATeamAdvancedStats(away.id, season),
      fetchNBATeamBaseStats(home.id, season),
      fetchNBATeamBaseStats(away.id, season),
      fetchNBATeamDefenseStats(home.id, season),
      fetchNBATeamDefenseStats(away.id, season)
    ]);
    return {
      category: 'Paint Defense',
      source: 'Ball Don\'t Lie API (Defense + Advanced + Base)',
      home: {
        team: home.full_name || home.name,
        opp_pts_paint: homeDefense?.opp_pts_paint || 'N/A',
        opp_pts_fb: homeDefense?.opp_pts_fb || 'N/A',
        defensive_rating: homeAdvanced?.defensive_rating || 'N/A',
        blk_per_game: homeBase?.blk_per_game || 'N/A',
        games_played: homeDefense?.games_played || homeAdvanced?.games_played || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        opp_pts_paint: awayDefense?.opp_pts_paint || 'N/A',
        opp_pts_fb: awayDefense?.opp_pts_fb || 'N/A',
        defensive_rating: awayAdvanced?.defensive_rating || 'N/A',
        blk_per_game: awayBase?.blk_per_game || 'N/A',
        games_played: awayDefense?.games_played || awayAdvanced?.games_played || 'N/A'
      },
      comparison: 'Paint defense and interior scoring data for both teams.'
    };
  },


  // ===== TRANSITION DEFENSE (BDL Defense Stats) =====
  TRANSITION_DEFENSE: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching TRANSITION_DEFENSE for ${away.name} @ ${home.name}`);

    if (bdlSport === 'basketball_nba') {
      const [homeDefense, awayDefense, homeAdvanced, awayAdvanced] = await Promise.all([
        fetchNBATeamDefenseStats(home.id, season),
        fetchNBATeamDefenseStats(away.id, season),
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);

      return {
        category: 'Transition Defense (Fast Break & Turnover Points Allowed)',
        source: 'Ball Don\'t Lie API (Defense Stats)',
        home: {
          team: home.full_name || home.name,
          opp_pts_fb: homeDefense?.opp_pts_fb || 'N/A',
          opp_pts_off_tov: homeDefense?.opp_pts_off_tov || 'N/A',
          pace: homeAdvanced?.pace || 'N/A',
          games_played: homeDefense?.games_played || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          opp_pts_fb: awayDefense?.opp_pts_fb || 'N/A',
          opp_pts_off_tov: awayDefense?.opp_pts_off_tov || 'N/A',
          pace: awayAdvanced?.pace || 'N/A',
          games_played: awayDefense?.games_played || 'N/A'
        },
        comparison: 'Transition defense and fast break data for both teams.'
      };
    }

    // Non-NBA fallback
    return {
      category: 'Transition Defense',
      note: 'Transition defense data only available for NBA',
      home: { team: home.full_name || home.name },
      away: { team: away.full_name || away.name }
    };
  },


  // KEEP: Grounding required - BDL does not have 5-man lineup data. Unique data not available elsewhere.
  // ===== LINEUP NET RATINGS (First Unit & Second Unit Performance - GROUNDING) =====
  LINEUP_NET_RATINGS: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching LINEUP_NET_RATINGS for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'basketball_nba') {
      return { category: 'Lineup Net Ratings', note: 'Only available for NBA' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `${seasonStr} NBA lineup net rating first unit second unit bench ${home.name} vs ${away.name}.
        What is each team's:
        1. Starting lineup (first unit) net rating
        2. Bench unit (second unit) net rating
        3. Best performing 5-man lineup
        4. Death lineup or closing lineup if they have one
        Include minutes played for key lineups.`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NBA lineup analyst. Provide lineup net ratings for starters, bench, and key 5-man combinations for both teams.'
      });
      
      return {
        category: 'Lineup Net Ratings (First & Second Unit)',
        source: 'Gemini Grounding (Live Search)',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.content || 'Data unavailable',
        comparison: 'Bench scoring and depth data for both teams.',
        note: 'Starter vs bench unit stats provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching LINEUP_NET_RATINGS:`, error.message);
      return {
        category: 'Lineup Net Ratings',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== TRAVEL SITUATION (Time Zone & Fatigue) =====
  TRAVEL_SITUATION: async (bdlSport, home, away, season, options = {}) => {
    console.log(`[Stat Router] Fetching TRAVEL_SITUATION for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'basketball_nba') {
      return { category: 'Travel Situation', note: 'Currently only available for NBA' };
    }
    
    // NBA team time zones (simplified)
    const teamTimeZones = {
      // Pacific (PT)
      'Lakers': 'PT', 'Clippers': 'PT', 'Warriors': 'PT', 'Kings': 'PT',
      'Trail Blazers': 'PT', 'Blazers': 'PT',
      // Mountain (MT)
      'Nuggets': 'MT', 'Jazz': 'MT', 'Suns': 'MT',
      // Central (CT)
      'Mavericks': 'CT', 'Spurs': 'CT', 'Rockets': 'CT', 'Pelicans': 'CT',
      'Grizzlies': 'CT', 'Timberwolves': 'CT', 'Thunder': 'CT', 'Bulls': 'CT',
      'Bucks': 'CT',
      // Eastern (ET)
      'Celtics': 'ET', 'Nets': 'ET', 'Knicks': 'ET', '76ers': 'ET', 'Sixers': 'ET',
      'Raptors': 'ET', 'Heat': 'ET', 'Magic': 'ET', 'Hawks': 'ET', 'Hornets': 'ET',
      'Wizards': 'ET', 'Cavaliers': 'ET', 'Cavs': 'ET', 'Pistons': 'ET', 'Pacers': 'ET'
    };
    
    const getTimeZone = (teamName) => {
      for (const [key, tz] of Object.entries(teamTimeZones)) {
        if (teamName.includes(key)) return tz;
      }
      return 'ET'; // Default
    };
    
    const tzOrder = { 'PT': 0, 'MT': 1, 'CT': 2, 'ET': 3 };
    
    const homeTz = getTimeZone(home.name || home.full_name);
    const awayTz = getTimeZone(away.name || away.full_name);
    
    const tzDiff = tzOrder[homeTz] - tzOrder[awayTz];
    
    const travelNote = tzDiff !== 0
      ? `${away.name} traveling ${tzDiff > 0 ? 'EAST' : 'WEST'} across ${Math.abs(tzDiff)} time zone${Math.abs(tzDiff) > 1 ? 's' : ''}.`
      : 'Same time zone.';
    
    return {
      category: 'Travel & Time Zone Situation',
      source: 'Calculated from team locations',
      home: {
        team: home.full_name || home.name,
        time_zone: homeTz,
        status: 'Playing at HOME - no travel'
      },
      away: {
        team: away.full_name || away.name,
        time_zone: awayTz,
        status: `Traveling from ${awayTz} to ${homeTz}`
      },
      time_zone_diff: Math.abs(tzDiff),
      travel_direction: tzDiff > 0 ? 'EASTWARD' : tzDiff < 0 ? 'WESTWARD' : 'SAME ZONE',
      travel_note: travelNote,
      note: 'Travel and time zone data for this game.'
    };
  },


  // ===== MINUTES TREND (Top 5 MPG per team from BDL season averages) =====
  MINUTES_TREND: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching MINUTES_TREND for ${away.name} @ ${home.name}`);

    if (bdlSport !== 'basketball_nba') {
      return { category: 'Minutes Trend', note: 'Only available for NBA' };
    }

    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month >= 10 ? year : year - 1;
    }

    try {
      // Fetch active players for both teams, then get season averages with MPG
      const fetchTopMinutesPlayers = async (teamId) => {
        const playersUrl = `https://api.balldontlie.io/v1/players/active?team_ids[]=${teamId}&per_page=15`;
        const playersResp = await fetch(playersUrl, { headers: { Authorization: BDL_API_KEY } });
        const playersJson = await playersResp.json();
        const players = playersJson.data || [];
        if (players.length === 0) return [];

        const topPlayerIds = players.slice(0, 12).map(p => p.id);
        const playerIdParams = topPlayerIds.map(id => `player_ids[]=${id}`).join('&');
        const seasonAvgUrl = `https://api.balldontlie.io/v1/season_averages/general?season=${season}&season_type=regular&type=base&${playerIdParams}`;
        const resp = await fetch(seasonAvgUrl, { headers: { Authorization: BDL_API_KEY } });
        const json = await resp.json();
        const playerStats = json.data || [];

        // Sort by minutes descending, take full rotation
        return playerStats
          .filter(ps => ps.stats?.min != null && parseFloat(ps.stats.min) > 0)
          .sort((a, b) => parseFloat(b.stats.min) - parseFloat(a.stats.min))
          .slice(0, 10)
          .map(ps => ({
            name: `${ps.player?.first_name || ''} ${ps.player?.last_name || ''}`.trim(),
            mpg: parseFloat(ps.stats.min).toFixed(1),
            ppg: (ps.stats?.pts || 0).toFixed(1),
            games_played: ps.stats?.games_played || 'N/A'
          }));
      };

      const [homePlayers, awayPlayers] = await Promise.all([
        fetchTopMinutesPlayers(home.id),
        fetchTopMinutesPlayers(away.id)
      ]);

      return {
        category: 'Minutes Distribution (Top 5 by MPG)',
        source: 'Ball Don\'t Lie API (Season Averages)',
        home: {
          team: home.full_name || home.name,
          top_5_by_minutes: homePlayers.length > 0 ? homePlayers : 'Data unavailable'
        },
        away: {
          team: away.full_name || away.name,
          top_5_by_minutes: awayPlayers.length > 0 ? awayPlayers : 'Data unavailable'
        },
        comparison: 'Minutes distribution and rotation patterns for both teams.',
        note: 'Season MPG for top 5 players per team.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching MINUTES_TREND:`, error.message);
      return {
        category: 'Minutes Trend',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== BLOWOUT TENDENCY (Margin Patterns) =====
  BLOWOUT_TENDENCY: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching BLOWOUT_TENDENCY for ${away.name} @ ${home.name}`);
    
    try {
      const seasonStart = new Date(season - 1, 9, 1);
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 40
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 40
        })
      ]);
      
      // Calculate blowout and close game patterns
      const calcMarginPatterns = (games, teamId) => {
        const completed = (games || [])
          .filter(g => (g.home_team_score || 0) > 0)
          .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        if (completed.length < 5) return null;
        
        let blowoutWins = 0, blowoutLosses = 0;
        let closeWins = 0, closeLosses = 0;
        let totalMargin = 0;
        const margins = [];
        
        for (const g of completed) {
          const isHome = g.home_team?.id === teamId;
          const teamScore = isHome ? (g.home_team_score ?? g.home_score ?? 0) : (g.visitor_team_score ?? g.away_score ?? 0);
          const oppScore = isHome ? (g.visitor_team_score ?? g.away_score ?? 0) : (g.home_team_score ?? g.home_score ?? 0);
          const margin = teamScore - oppScore;
          const absMargin = Math.abs(margin);

          margins.push(margin);
          totalMargin += margin;

          if (margin > 0) {
            // Win
            if (absMargin >= 15) blowoutWins++;
            else if (absMargin <= 5) closeWins++;
          } else {
            // Loss
            if (absMargin >= 15) blowoutLosses++;
            else if (absMargin <= 5) closeLosses++;
          }
        }
        
        const avgMargin = totalMargin / completed.length;
        const blowoutRate = ((blowoutWins + blowoutLosses) / completed.length * 100).toFixed(0);
        const closeGameRate = ((closeWins + closeLosses) / completed.length * 100).toFixed(0);
        
        return {
          games_analyzed: completed.length,
          avg_margin: `${avgMargin > 0 ? '+' : ''}${avgMargin.toFixed(1)}`,
          blowout_wins: blowoutWins,
          blowout_losses: blowoutLosses,
          blowout_rate: `${blowoutRate}%`,
          close_wins: closeWins,
          close_losses: closeLosses,
          close_game_rate: `${closeGameRate}%`,
          total_games: completed.length
        };
      };
      
      const homePatterns = calcMarginPatterns(homeGames, home.id);
      const awayPatterns = calcMarginPatterns(awayGames, away.id);
      
      return {
        category: 'Blowout Tendency & Margin Patterns',
        source: 'Ball Don\'t Lie API (calculated)',
        home: {
          team: home.full_name || home.name,
          ...homePatterns
        },
        away: {
          team: away.full_name || away.name,
          ...awayPatterns
        },
        comparison: 'Recent point differential trends for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching BLOWOUT_TENDENCY:`, error.message);
      return {
        category: 'Blowout Tendency',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== RECENT FORM (ENHANCED) =====
  // Now includes margin analysis, opponent quality, and narrative context
  RECENT_FORM: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching ENHANCED RECENT_FORM for ${awayName} @ ${homeName} (${bdlSport})`);
    
    // NFL uses seasons[] and team_ids[], not date ranges
    const isNFL = bdlSport === 'americanfootball_nfl';
    const isNCAA = bdlSport === 'americanfootball_ncaaf' || bdlSport === 'basketball_ncaab';
    const isNBA = bdlSport === 'basketball_nba';
    const isNHL = bdlSport === 'icehockey_nhl';
    
    let params;
    if (isNFL || isNCAA) {
      // For football, use season filter - get all games this season (need 10+ for L10)
      params = {
        seasons: [season],
        per_page: 25 // Get more games to ensure we have enough for L10
      };
    } else {
      // For other sports (NBA, NHL), use date range - extend to 45 days to capture L10
      const today = new Date();
      const fortyFiveDaysAgo = new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000);
      params = {
        start_date: fortyFiveDaysAgo.toISOString().split('T')[0],
        end_date: today.toISOString().split('T')[0],
        per_page: 25 // Need more for L10
      };
    }
    
    try {
      // Fetch games AND standings in parallel for opponent quality analysis
      const [homeGames, awayGames, standings] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], ...params }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], ...params }),
        // Fetch standings to assess opponent quality
        (isNFL || isNBA || isNHL) ? ballDontLieService.getStandingsGeneric(bdlSport, { season }) : Promise.resolve([])
      ]);
      
      console.log(`[Stat Router] Got ${homeGames?.length || 0} games for ${homeName}, ${awayGames?.length || 0} for ${awayName}, ${standings?.length || 0} standings`);
      
      // Build standings map for quick opponent lookup
      const standingsMap = new Map();
      if (standings && standings.length > 0) {
        for (const s of standings) {
          const teamId = s.team?.id;
          if (teamId) {
            standingsMap.set(teamId, {
              overall_record: s.overall_record || `${s.wins || 0}-${s.losses || 0}`,
              wins: s.wins || 0,
              losses: s.losses || 0,
              point_differential: s.point_differential || 0
            });
          }
        }
        console.log(`[Stat Router] Built standings map with ${standingsMap.size} teams for opponent quality lookup`);
      }
      
      // Sort by date descending (most recent first)
      const sortByDate = (a, b) => new Date(b.date) - new Date(a.date);
      const sortedHomeGames = (homeGames || []).sort(sortByDate);
      const sortedAwayGames = (awayGames || []).sort(sortByDate);
      
      // Pass standings map for enhanced analysis
      const homeForm = formatRecentGames(sortedHomeGames, homeName, standingsMap);
      const awayForm = formatRecentGames(sortedAwayGames, awayName, standingsMap);
      
      return {
        category: 'Recent Form - L5 + L10 Analysis',

        home: {
          team: home.full_name || home.name,
          ...homeForm
        },
        away: {
          team: away.full_name || away.name,
          ...awayForm
        },
        note: 'If Scout Report grounding has more recent data, prefer that for accuracy.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching recent form:`, error.message);
      return {
        category: 'Recent Form',
        home: { team: home.full_name || home.name, record: 'N/A', note: 'Data unavailable' },
        away: { team: away.full_name || away.name, record: 'N/A', note: 'Data unavailable' },
        WARNING: 'Recent form data unavailable.'
      };
    }
  },


  // ===== QUARTER SCORING TRENDS (NFL) =====
  // Shows Q1, Q2, Q3, Q4 scoring breakdown - fast starters vs closers
  QUARTER_SCORING: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching QUARTER_SCORING for ${awayName} @ ${homeName} (${bdlSport})`);
    
    try {
      // NHL uses periods (P1/P2/P3), not quarters — BDL NHL game data doesn't expose period scores
      if (bdlSport === 'icehockey_nhl') {
        return {
          category: 'Period Scoring Trends',
          data_scope: 'BDL NHL game data does not expose period-by-period scores (P1/P2/P3). Use Gemini Grounding for period scoring trends.',
          home: { team: homeName, note: 'Period scoring data unavailable from BDL' },
          away: { team: awayName, note: 'Period scoring data unavailable from BDL' }
        };
      }

      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 20 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 20 })
      ]);

      // Filter to completed games only - using case-insensitive status check
      const completedHomeGames = (homeGames || []).filter(g => isGameCompleted(g.status));
      const completedAwayGames = (awayGames || []).filter(g => isGameCompleted(g.status));

      const calcQuarterStats = (games, teamId, teamName) => {
        if (!games || games.length === 0) return null;
        
        let q1Scored = 0, q2Scored = 0, q3Scored = 0, q4Scored = 0;
        let q1Allowed = 0, q2Allowed = 0, q3Allowed = 0, q4Allowed = 0;
        let gamesWithQuarters = 0;
        
        for (const game of games) {
          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          
          // Get quarter scores based on whether team is home or away
          const teamQ1 = isHome ? game.home_team_q1 : game.visitor_team_q1;
          const teamQ2 = isHome ? game.home_team_q2 : game.visitor_team_q2;
          const teamQ3 = isHome ? game.home_team_q3 : game.visitor_team_q3;
          const teamQ4 = isHome ? game.home_team_q4 : game.visitor_team_q4;
          
          const oppQ1 = isHome ? game.visitor_team_q1 : game.home_team_q1;
          const oppQ2 = isHome ? game.visitor_team_q2 : game.home_team_q2;
          const oppQ3 = isHome ? game.visitor_team_q3 : game.home_team_q3;
          const oppQ4 = isHome ? game.visitor_team_q4 : game.home_team_q4;
          
          // Only count games with quarter data
          if (teamQ1 !== null && teamQ2 !== null && teamQ3 !== null && teamQ4 !== null) {
            q1Scored += teamQ1 || 0;
            q2Scored += teamQ2 || 0;
            q3Scored += teamQ3 || 0;
            q4Scored += teamQ4 || 0;
            q1Allowed += oppQ1 || 0;
            q2Allowed += oppQ2 || 0;
            q3Allowed += oppQ3 || 0;
            q4Allowed += oppQ4 || 0;
            gamesWithQuarters++;
          }
        }
        
        if (gamesWithQuarters === 0) return null;
        
        const avgQ1 = (q1Scored / gamesWithQuarters).toFixed(1);
        const avgQ2 = (q2Scored / gamesWithQuarters).toFixed(1);
        const avgQ3 = (q3Scored / gamesWithQuarters).toFixed(1);
        const avgQ4 = (q4Scored / gamesWithQuarters).toFixed(1);
        const avg1H = ((q1Scored + q2Scored) / gamesWithQuarters).toFixed(1);
        const avg2H = ((q3Scored + q4Scored) / gamesWithQuarters).toFixed(1);
        
        const avgQ1Allowed = (q1Allowed / gamesWithQuarters).toFixed(1);
        const avgQ2Allowed = (q2Allowed / gamesWithQuarters).toFixed(1);
        const avgQ3Allowed = (q3Allowed / gamesWithQuarters).toFixed(1);
        const avgQ4Allowed = (q4Allowed / gamesWithQuarters).toFixed(1);
        
        // Determine team profile
        const q1Diff = parseFloat(avgQ1) - parseFloat(avgQ1Allowed);
        const q4Diff = parseFloat(avgQ4) - parseFloat(avgQ4Allowed);
        const firstHalfDiff = parseFloat(avg1H) - ((parseFloat(avgQ1Allowed) + parseFloat(avgQ2Allowed)));
        const secondHalfDiff = parseFloat(avg2H) - ((parseFloat(avgQ3Allowed) + parseFloat(avgQ4Allowed)));
        
        return {
          team: teamName,
          games_analyzed: gamesWithQuarters,
          scoring: { Q1: avgQ1, Q2: avgQ2, Q3: avgQ3, Q4: avgQ4, '1H': avg1H, '2H': avg2H },
          allowed: { Q1: avgQ1Allowed, Q2: avgQ2Allowed, Q3: avgQ3Allowed, Q4: avgQ4Allowed },
          differential: { Q1: q1Diff.toFixed(1), Q4: q4Diff.toFixed(1), '1H': firstHalfDiff.toFixed(1), '2H': secondHalfDiff.toFixed(1) }
        };
      };
      
      return {
        category: 'Quarter-by-Quarter Scoring Trends',
        home: calcQuarterStats(completedHomeGames, home.id, homeName),
        away: calcQuarterStats(completedAwayGames, away.id, awayName),
        note: 'Quarter-by-quarter scoring and defensive data for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching QUARTER_SCORING:`, error.message);
      return { category: 'Quarter Scoring', error: 'Data unavailable' };
    }
  },


  // ===== FIRST HALF TRENDS =====
  // Teams that start hot vs cold - halftime lead %
  FIRST_HALF_TRENDS: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching FIRST_HALF_TRENDS for ${awayName} @ ${homeName} (${bdlSport})`);
    
    try {
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 20 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 20 })
      ]);
      
      const completedHomeGames = (homeGames || []).filter(g => g.status === 'Final' || g.status === 'final');
      const completedAwayGames = (awayGames || []).filter(g => g.status === 'Final' || g.status === 'final');
      
      const calcFirstHalfStats = (games, teamId, teamName) => {
        if (!games || games.length === 0) return null;
        
        let leadingAtHalf = 0, trailingAtHalf = 0, tiedAtHalf = 0;
        let totalFirstHalfScored = 0, totalFirstHalfAllowed = 0;
        let winsWhenLeading = 0, winsWhenTrailing = 0;
        let gamesWithData = 0;
        
        for (const game of games) {
          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          
          const teamQ1 = isHome ? game.home_team_q1 : game.visitor_team_q1;
          const teamQ2 = isHome ? game.home_team_q2 : game.visitor_team_q2;
          const oppQ1 = isHome ? game.visitor_team_q1 : game.home_team_q1;
          const oppQ2 = isHome ? game.visitor_team_q2 : game.home_team_q2;
          
          const teamFinal = isHome ? (game.home_team_score ?? game.home_score ?? 0) : (game.visitor_team_score ?? game.away_score ?? 0);
          const oppFinal = isHome ? (game.visitor_team_score ?? game.away_score ?? 0) : (game.home_team_score ?? game.home_score ?? 0);
          
          if (teamQ1 !== null && teamQ2 !== null && oppQ1 !== null && oppQ2 !== null) {
            const team1H = (teamQ1 || 0) + (teamQ2 || 0);
            const opp1H = (oppQ1 || 0) + (oppQ2 || 0);
            
            totalFirstHalfScored += team1H;
            totalFirstHalfAllowed += opp1H;
            gamesWithData++;
            
            const won = teamFinal > oppFinal;
            
            if (team1H > opp1H) {
              leadingAtHalf++;
              if (won) winsWhenLeading++;
            } else if (team1H < opp1H) {
              trailingAtHalf++;
              if (won) winsWhenTrailing++;
            } else {
              tiedAtHalf++;
            }
          }
        }
        
        if (gamesWithData === 0) return null;
        
        const avg1HScored = (totalFirstHalfScored / gamesWithData).toFixed(1);
        const avg1HAllowed = (totalFirstHalfAllowed / gamesWithData).toFixed(1);
        const leadPct = ((leadingAtHalf / gamesWithData) * 100).toFixed(0);
        const closeRate = leadingAtHalf > 0 ? ((winsWhenLeading / leadingAtHalf) * 100).toFixed(0) : 'N/A';
        const comebackRate = trailingAtHalf > 0 ? ((winsWhenTrailing / trailingAtHalf) * 100).toFixed(0) : 'N/A';
        
        return {
          team: teamName,
          games_analyzed: gamesWithData,
          avg_1H_scored: avg1HScored,
          avg_1H_allowed: avg1HAllowed,
          leading_at_half: `${leadingAtHalf}/${gamesWithData} (${leadPct}%)`,
          trailing_at_half: `${trailingAtHalf}/${gamesWithData}`,
          close_out_rate: closeRate !== 'N/A' ? `${closeRate}% when leading at half` : 'N/A',
          comeback_rate: comebackRate !== 'N/A' ? `${comebackRate}% when trailing at half` : 'N/A'
        };
      };
      
      return {
        category: 'First Half Scoring Trends',
        home: calcFirstHalfStats(completedHomeGames, home.id, homeName),
        away: calcFirstHalfStats(completedAwayGames, away.id, awayName),
        note: 'First half scoring and halftime lead data for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching FIRST_HALF_TRENDS:`, error.message);
      return { category: 'First Half Trends', error: 'Data unavailable' };
    }
  },


  // ===== SECOND HALF TRENDS =====
  // Closers vs faders - 4th quarter dominance
  SECOND_HALF_TRENDS: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching SECOND_HALF_TRENDS for ${awayName} @ ${homeName} (${bdlSport})`);
    
    try {
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 20 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 20 })
      ]);
      
      const completedHomeGames = (homeGames || []).filter(g => g.status === 'Final' || g.status === 'final');
      const completedAwayGames = (awayGames || []).filter(g => g.status === 'Final' || g.status === 'final');
      
      const calcSecondHalfStats = (games, teamId, teamName) => {
        if (!games || games.length === 0) return null;
        
        let total2HScored = 0, total2HAllowed = 0;
        let totalQ4Scored = 0, totalQ4Allowed = 0;
        let won2ndHalf = 0, lost2ndHalf = 0;
        let wonQ4 = 0, lostQ4 = 0;
        let gamesWithData = 0;
        
        for (const game of games) {
          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          
          const teamQ3 = isHome ? game.home_team_q3 : game.visitor_team_q3;
          const teamQ4 = isHome ? game.home_team_q4 : game.visitor_team_q4;
          const oppQ3 = isHome ? game.visitor_team_q3 : game.home_team_q3;
          const oppQ4 = isHome ? game.visitor_team_q4 : game.home_team_q4;
          
          if (teamQ3 !== null && teamQ4 !== null && oppQ3 !== null && oppQ4 !== null) {
            const team2H = (teamQ3 || 0) + (teamQ4 || 0);
            const opp2H = (oppQ3 || 0) + (oppQ4 || 0);
            const teamQ4Score = teamQ4 || 0;
            const oppQ4Score = oppQ4 || 0;
            
            total2HScored += team2H;
            total2HAllowed += opp2H;
            totalQ4Scored += teamQ4Score;
            totalQ4Allowed += oppQ4Score;
            gamesWithData++;
            
            if (team2H > opp2H) won2ndHalf++;
            else if (team2H < opp2H) lost2ndHalf++;
            
            if (teamQ4Score > oppQ4Score) wonQ4++;
            else if (teamQ4Score < oppQ4Score) lostQ4++;
          }
        }
        
        if (gamesWithData === 0) return null;
        
        const avg2HScored = (total2HScored / gamesWithData).toFixed(1);
        const avg2HAllowed = (total2HAllowed / gamesWithData).toFixed(1);
        const avgQ4Scored = (totalQ4Scored / gamesWithData).toFixed(1);
        const avgQ4Allowed = (totalQ4Allowed / gamesWithData).toFixed(1);
        const q4Diff = (totalQ4Scored - totalQ4Allowed) / gamesWithData;
        
        return {
          team: teamName,
          games_analyzed: gamesWithData,
          avg_2H_scored: avg2HScored,
          avg_2H_allowed: avg2HAllowed,
          avg_Q4_scored: avgQ4Scored,
          avg_Q4_allowed: avgQ4Allowed,
          Q4_differential: q4Diff >= 0 ? `+${q4Diff.toFixed(1)}` : q4Diff.toFixed(1),
          won_2nd_half: `${won2ndHalf}/${gamesWithData}`,
          won_Q4: `${wonQ4}/${gamesWithData}`
        };
      };
      
      return {
        category: 'Second Half & 4th Quarter Trends',
        home: calcSecondHalfStats(completedHomeGames, home.id, homeName),
        away: calcSecondHalfStats(completedAwayGames, away.id, awayName),
        note: 'Second half and Q4 scoring data for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching SECOND_HALF_TRENDS:`, error.message);
      return { category: 'Second Half Trends', error: 'Data unavailable' };
    }
  },


  // ===== VARIANCE & CONSISTENCY ANALYSIS =====
  VARIANCE_CONSISTENCY: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching VARIANCE_CONSISTENCY for ${awayName} @ ${homeName} (${bdlSport})`);
    
    // Only supported for NFL currently (expandable to other sports)
    if (bdlSport !== 'americanfootball_nfl') {
      return {
        category: 'Variance & Consistency',
        note: 'Currently only available for NFL. Coming soon for other sports.',
        home: { team: homeName },
        away: { team: awayName }
      };
    }
    
    try {
      // Get recent games for both teams
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 17 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 17 })
      ]);
      
      const completedHomeGames = (homeGames || []).filter(g => g.status === 'Final' || g.status === 'final').slice(0, 10);
      const completedAwayGames = (awayGames || []).filter(g => g.status === 'Final' || g.status === 'final').slice(0, 10);
      
      // Calculate variance stats for a team
      const calcVarianceStats = (games, teamId, teamName) => {
        if (!games || games.length < 3) {
          return { team: teamName, error: 'Insufficient data' };
        }
        
        const margins = [];
        const pointsScored = [];
        let closeGames = 0; // Within 7 points
        let blowouts = 0;   // Won/lost by 14+
        let beatsGoodTeams = 0;
        let losesToBadTeams = 0;
        
        for (const game of games) {
          const isHome = game.home_team?.id === teamId;
          const teamScore = isHome ? game.home_team_score : game.away_team_score;
          const oppScore = isHome ? game.away_team_score : game.home_team_score;
          
          if (teamScore == null || oppScore == null) continue;
          
          const margin = teamScore - oppScore;
          margins.push(margin);
          pointsScored.push(teamScore);
          
          // Close game analysis
          if (Math.abs(margin) <= 7) closeGames++;
          if (Math.abs(margin) >= 14) blowouts++;
        }
        
        if (margins.length < 3) {
          return { team: teamName, error: 'Insufficient games with scores' };
        }
        
        // Calculate standard deviation of margins (VARIANCE indicator)
        const avgMargin = margins.reduce((a, b) => a + b, 0) / margins.length;
        const variance = margins.reduce((acc, m) => acc + Math.pow(m - avgMargin, 2), 0) / margins.length;
        const stdDev = Math.sqrt(variance);
        
        // Calculate scoring consistency
        const avgPoints = pointsScored.reduce((a, b) => a + b, 0) / pointsScored.length;
        const scoringVariance = pointsScored.reduce((acc, p) => acc + Math.pow(p - avgPoints, 2), 0) / pointsScored.length;
        const scoringStdDev = Math.sqrt(scoringVariance);
        
        // Calculate upset potential indicators
        const closeGamePct = ((closeGames / margins.length) * 100).toFixed(0);
        const blowoutPct = ((blowouts / margins.length) * 100).toFixed(0);

        return {
          team: teamName,
          games_analyzed: margins.length,
          margin_analysis: {
            avg_margin: avgMargin.toFixed(1),
            std_dev: stdDev.toFixed(1)
          },
          scoring_analysis: {
            avg_points: avgPoints.toFixed(1),
            std_dev: scoringStdDev.toFixed(1)
          },
          game_types: {
            close_games: `${closeGames}/${margins.length} (${closeGamePct}%)`,
            blowouts: `${blowouts}/${margins.length} (${blowoutPct}%)`
          }
        };
      };
      
      const homeVariance = calcVarianceStats(completedHomeGames, home.id, homeName);
      const awayVariance = calcVarianceStats(completedAwayGames, away.id, awayName);
      
      return {
        category: 'Variance & Consistency Analysis',
        note: 'Margin and scoring standard deviation for both teams.',
        home: homeVariance,
        away: awayVariance
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching VARIANCE_CONSISTENCY:`, error.message);
      return { category: 'Variance & Consistency', error: 'Data unavailable' };
    }
  },


  // ===== HEAD-TO-HEAD HISTORY =====
  H2H_HISTORY: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching H2H_HISTORY for ${awayName} @ ${homeName} (${bdlSport})`);
    
    // Helper: Extract personnel notes from box score data
    const extractPersonnelNote = (boxScore, homeTeamId, awayTeamId) => {
      try {
        if (!boxScore || !boxScore.home_team_stats || !boxScore.away_team_stats) {
          return null;
        }
        
        // Get top scorer from each team
        const homeStats = boxScore.home_team_stats || [];
        const awayStats = boxScore.away_team_stats || [];
        
        // Sort by points to find top performers
        const homeTop = [...homeStats].sort((a, b) => (b.pts || 0) - (a.pts || 0))[0];
        const awayTop = [...awayStats].sort((a, b) => (b.pts || 0) - (a.pts || 0))[0];
        
        // Find any key players who DNP (0 minutes or not in stats)
        const homeDnp = homeStats.filter(p => (p.min === '0:00' || p.min === 0 || p.min === '00:00') && p.player?.first_name);
        const awayDnp = awayStats.filter(p => (p.min === '0:00' || p.min === 0 || p.min === '00:00') && p.player?.first_name);
        
        let note = 'Key: ';
        if (homeTop?.player) {
          const name = `${homeTop.player.first_name?.[0] || ''}. ${homeTop.player.last_name || 'Unknown'}`;
          note += `${name} ${homeTop.pts || 0}pts/${homeTop.min || '?'}min`;
        }
        if (awayTop?.player) {
          const name = `${awayTop.player.first_name?.[0] || ''}. ${awayTop.player.last_name || 'Unknown'}`;
          note += `; ${name} ${awayTop.pts || 0}pts/${awayTop.min || '?'}min`;
        }
        
        // Add DNP notes for all players (Gary needs full absence awareness)
        const dnpNotes = [];
        if (homeDnp.length > 0) {
          const dnpNames = homeDnp.map(p => `${p.player?.last_name || 'Unknown'}`).join(', ');
          dnpNotes.push(`${dnpNames} DNP`);
        }
        if (awayDnp.length > 0) {
          const dnpNames = awayDnp.map(p => `${p.player?.last_name || 'Unknown'}`).join(', ');
          dnpNotes.push(`${dnpNames} DNP`);
        }
        
        if (dnpNotes.length > 0) {
          note += ` | ${dnpNotes.join('; ')}`;
        }
        
        return note;
      } catch (e) {
        console.log(`[Stat Router] Error extracting personnel note: ${e.message}`);
        return null;
      }
    };
    
    try {
      // Calculate dynamic season - NFL/NCAAF: Aug-Feb spans years
      // If season not provided, calculate based on current date
      let currentSeason = season;
      if (!currentSeason) {
        const month = new Date().getMonth() + 1;
        const year = new Date().getFullYear();
        // NFL/NCAAF: Aug-Feb, so Jan-Jul = previous year's season
        currentSeason = month <= 7 ? year - 1 : year;
      }
      
      const homeGames = await ballDontLieService.getGames(bdlSport, {
        team_ids: [home.id],
        seasons: [currentSeason],
        per_page: 50
      });

      // Filter to only COMPLETED games against the away team
      const h2hGames = (homeGames || []).filter(game => {
        const gameHomeId = game.home_team?.id || game.home_team_id;
        const gameAwayId = game.visitor_team?.id || game.visitor_team_id;
        const isH2H = (gameHomeId === away.id || gameAwayId === away.id);
        // BDL status values vary by sport:
        // NBA: has home_team_score > 0 means completed
        // NFL: status='Final'
        // NCAAB: status='Final' or 'post'
        // NHL: status='Final' or game_state='OFF'
        const hasScores = ((game.home_team_score ?? game.home_score ?? 0) > 0) || ((game.visitor_team_score ?? game.away_score ?? 0) > 0);
        const statusFinal = game.status === 'Final' || game.status === 'post' || game.status === 'final';
        const isCompleted = hasScores || statusFinal;
        // Also ensure game date is in the past
        const gameDate = new Date(game.date);
        const isPast = gameDate < new Date();
        return isH2H && isCompleted && isPast;
      }).sort((a, b) => new Date(b.date) - new Date(a.date)); // Most recent first
      
      if (h2hGames.length === 0) {
        return {
          category: `Head-to-Head History (${currentSeason} Season)`,
          games_found: 0,
          h2h_available: false,
          note: `NO H2H DATA: ${homeName} and ${awayName} have not played each other in the ${currentSeason} season.`,
          revenge_game: false,
          ANTI_HALLUCINATION: `CRITICAL: You have ZERO H2H data for this matchup. DO NOT claim any historical records, winning streaks, or "Team A owns Team B" narratives. If you don't have H2H data, simply don't mention H2H in your analysis.`
        };
      }
      
      // For NBA, try to fetch box scores to get personnel context
      const isNba = bdlSport === 'basketball_nba';
      let boxScoresByDate = {};
      
      if (isNba && h2hGames.length <= 3) {
        // Only fetch box scores for recent H2H games (limit to avoid slowdown)
        console.log(`[Stat Router] Fetching box scores for ${h2hGames.length} H2H game(s) to get personnel notes...`);
        
        for (const game of h2hGames.slice(0, 3)) {
          try {
            const gameDate = game.date?.split('T')[0]; // YYYY-MM-DD
            if (gameDate && !boxScoresByDate[gameDate]) {
              const boxScores = await ballDontLieService.getNbaBoxScores(gameDate, 30); // Cache 30 min
              if (boxScores && boxScores.length > 0) {
                // Find the box score that matches this game (by team IDs)
                const matchingBox = boxScores.find(bs => {
                  const bsHomeId = bs.game?.home_team?.id || bs.home_team?.id;
                  const bsAwayId = bs.game?.visitor_team?.id || bs.visitor_team?.id;
                  return (bsHomeId === home.id || bsHomeId === away.id) && 
                         (bsAwayId === home.id || bsAwayId === away.id);
                });
                if (matchingBox) {
                  boxScoresByDate[gameDate] = matchingBox;
                }
              }
            }
          } catch (e) {
            console.log(`[Stat Router] Box score fetch failed for ${game.date}: ${e.message}`);
          }
        }
      }
      
      // Format H2H results with full date including year AND personnel notes
      const h2hResults = h2hGames.slice(0, 5).map(game => {
        const isHomeTeamHome = (game.home_team?.id || game.home_team_id) === home.id;
        const homeScore = isHomeTeamHome ? (game.home_team_score ?? game.home_score ?? 0) : (game.visitor_team_score ?? game.away_score ?? 0);
        const awayScore = isHomeTeamHome ? (game.visitor_team_score ?? game.away_score ?? 0) : (game.home_team_score ?? game.home_score ?? 0);
        const winner = homeScore > awayScore ? homeName : awayName;
        const margin = Math.abs(homeScore - awayScore);
        const gameDate = new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const gameDateKey = game.date?.split('T')[0];
        const week = game.week ? `Week ${game.week}` : '';
        
        // Get personnel note from box score if available
        const boxScore = boxScoresByDate[gameDateKey];
        const personnelNote = boxScore ? extractPersonnelNote(boxScore, home.id, away.id) : null;
        
        return {
          date: gameDate,
          week: week,
          result: `${winner} won by ${margin}`,
          score: `${homeName} ${homeScore} - ${awayScore} ${awayName}`,
          margin: margin, // Store margin for sweep context analysis
          home_won: homeScore > awayScore,
          personnel_note: personnelNote || (isNba ? '(Box score unavailable)' : null)
        };
      });
      
      // Calculate series record for THIS SEASON
      const homeWins = h2hResults.filter(r => r.home_won).length;
      const awayWins = h2hResults.length - homeWins;
      
      // Check for revenge game (did away team lose last meeting?)
      const lastMeeting = h2hResults[0];
      const revengeGame = lastMeeting && !lastMeeting.home_won;
      
      // ===== NBA SWEEP CONTEXT DETECTION (NBA-SPECIFIC) =====
      // Detects when one team is about to sweep an elite opponent 4-0
      // This is historically very rare and should prompt investigation
      let sweepContext = null;
      
      if (isNba && h2hGames.length >= 3) {
        const gamesPlayed = h2hGames.length;
        const isCompleteSweep = (homeWins === gamesPlayed) || (awayWins === gamesPlayed);
        
        if (isCompleteSweep) {
          try {
            // Determine dominant and swept teams
            const dominantTeam = homeWins === gamesPlayed ? home : away;
            const dominantTeamName = homeWins === gamesPlayed ? homeName : awayName;
            const sweptTeam = homeWins === gamesPlayed ? away : home;
            const sweptTeamName = homeWins === gamesPlayed ? awayName : homeName;
            
            // Fetch standings to get win percentages and division info
            const standings = await ballDontLieService.getNbaStandings(currentSeason);
            
            // Get swept team's standing (with null checks)
            const sweptTeamStanding = standings?.find(s => s.team?.id === sweptTeam.id);
            const dominantTeamStanding = standings?.find(s => s.team?.id === dominantTeam.id);
            
            if (sweptTeamStanding?.wins !== undefined && sweptTeamStanding?.losses !== undefined) {
              const sweptWins = sweptTeamStanding.wins;
              const sweptLosses = sweptTeamStanding.losses;
              const sweptTotal = sweptWins + sweptLosses;
              
              if (sweptTotal > 0) {
                const sweptWinPct = (sweptWins / sweptTotal) * 100;
                
                // Check if division rivals (same division = more film study and adjustment opportunities)
                const sweptDivision = sweptTeamStanding?.team?.division;
                const dominantDivision = dominantTeamStanding?.team?.division;
                const isDivisionRival = sweptDivision && dominantDivision && sweptDivision === dominantDivision;
                
                // Calculate average margin of H2H wins
                const margins = h2hResults.map(r => r.margin || 0);
                const avgMargin = margins.reduce((sum, m) => sum + m, 0) / margins.length;
                
                sweepContext = {
                  triggered: true,
                  games_in_sweep: gamesPlayed,
                  dominant_team: dominantTeamName,
                  swept_team: sweptTeamName,
                  swept_team_record: `${sweptWins}-${sweptLosses}`,
                  swept_team_win_pct: `${sweptWinPct.toFixed(1)}%`,
                  is_division_rival: isDivisionRival,
                  division: isDivisionRival ? sweptDivision : null,
                  avg_margin: avgMargin.toFixed(1)
                };
                console.log(`[Stat Router] SWEEP CONTEXT: ${dominantTeamName} is ${gamesPlayed}-0 vs ${sweptTeamName} (${sweptWinPct.toFixed(1)}% win rate${isDivisionRival ? ', division rival' : ''})`);
              }
            }
          } catch (sweepErr) {
            console.log(`[Stat Router] Sweep context check failed (non-fatal): ${sweepErr.message}`);
            // Non-fatal - just skip sweep context if standings unavailable
          }
        }
      }
      
      // ===== NFL REVENGE CONTEXT DETECTION (NFL-SPECIFIC) =====
      // In NFL, elite teams don't lose twice to the same opponent, especially after a blowout
      const isNfl = bdlSport === 'americanfootball_nfl';
      
      if (isNfl && h2hGames.length >= 1 && !sweepContext) {
        try {
          // Get the previous meeting details
          const lastGame = h2hResults[0];
          const lastMargin = lastGame?.margin || 0;
          
          // Determine winner and loser of last meeting
          const lastWinnerIsHome = lastGame?.home_won;
          const losingTeam = lastWinnerIsHome ? away : home;
          const losingTeamName = lastWinnerIsHome ? awayName : homeName;
          const winningTeam = lastWinnerIsHome ? home : away;
          const winningTeamName = lastWinnerIsHome ? homeName : awayName;
          
          // Fetch standings to get win percentages and division info
          const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason });
          
          const losingTeamStanding = standings?.find(s => s.team?.id === losingTeam.id);
          const winningTeamStanding = standings?.find(s => s.team?.id === winningTeam.id);
          
          if (losingTeamStanding?.wins !== undefined && losingTeamStanding?.losses !== undefined) {
            const losingWins = losingTeamStanding.wins;
            const losingLosses = losingTeamStanding.losses;
            const losingTotal = losingWins + losingLosses;
            
            if (losingTotal > 0) {
              const losingWinPct = (losingWins / losingTotal) * 100;
              
              // Check if division rivals
              const losingDivision = losingTeamStanding?.team?.division;
              const winningDivision = winningTeamStanding?.team?.division;
              const isDivisionRival = losingDivision && winningDivision && losingDivision === winningDivision;
              
              // NFL Revenge Context: Division rival lost by 14+ points AND is 70%+ win rate
              // In NFL, 14+ points is a convincing win (2+ TDs)
              if (isDivisionRival && losingWinPct >= 70 && lastMargin >= 14) {
                sweepContext = {
                  triggered: true,
                  sport: 'NFL',
                  games_played: h2hGames.length,
                  losing_team: losingTeamName,
                  winning_team: winningTeamName,
                  losing_team_record: `${losingWins}-${losingLosses}`,
                  losing_team_win_pct: `${losingWinPct.toFixed(1)}%`,
                  is_division_rival: true,
                  division: losingDivision,
                  last_margin: lastMargin,
                  sweep_note: `NFL DIVISION REMATCH: ${losingTeamName} is ${losingWins}-${losingLosses} (${losingWinPct.toFixed(1)}%) and lost by ${lastMargin} points to division rival ${winningTeamName} earlier this season.`
                };
                console.log(`[Stat Router] NFL REVENGE CONTEXT: ${losingTeamName} (${losingWinPct.toFixed(1)}%) lost by ${lastMargin} to division rival ${winningTeamName}`);
              }
            }
          }
        } catch (nflErr) {
          console.log(`[Stat Router] NFL revenge context check failed (non-fatal): ${nflErr.message}`);
        }
      }
      
      // ===== NCAAB SWEEP CONTEXT DETECTION (NCAAB-SPECIFIC) =====
      // In NCAAB, conference rivals play 2x per year; 2-0 sweeps trigger caution for elite/ranked teams
      const isNcaab = bdlSport === 'basketball_ncaab';
      
      if (isNcaab && h2hGames.length >= 2 && !sweepContext) {
        const gamesPlayed = h2hGames.length;
        const isCompleteSweep = (homeWins === gamesPlayed) || (awayWins === gamesPlayed);
        
        if (isCompleteSweep) {
          try {
            // Determine dominant and swept teams
            const dominantTeam = homeWins === gamesPlayed ? home : away;
            const dominantTeamName = homeWins === gamesPlayed ? homeName : awayName;
            const sweptTeam = homeWins === gamesPlayed ? away : home;
            const sweptTeamName = homeWins === gamesPlayed ? awayName : homeName;
            
            // Fetch standings to get win percentages and conference info
            const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason });
            
            const sweptTeamStanding = standings?.find(s => s.team?.id === sweptTeam.id);
            const dominantTeamStanding = standings?.find(s => s.team?.id === dominantTeam.id);
            
            if (sweptTeamStanding?.wins !== undefined && sweptTeamStanding?.losses !== undefined) {
              const sweptWins = sweptTeamStanding.wins;
              const sweptLosses = sweptTeamStanding.losses;
              const sweptTotal = sweptWins + sweptLosses;
              
              if (sweptTotal > 0) {
                const sweptWinPct = (sweptWins / sweptTotal) * 100;
                
                // Check if conference rivals
                const sweptConference = sweptTeamStanding?.team?.conference;
                const dominantConference = dominantTeamStanding?.team?.conference;
                const isConferenceRival = sweptConference && dominantConference && sweptConference === dominantConference;
                
                // Check if swept team is ranked (Top 25 indicator)
                const sweptRanking = sweptTeamStanding?.ranking || sweptTeamStanding?.ap_rank || null;
                const isRanked = sweptRanking && sweptRanking <= 25;
                
                // Calculate average margin
                const margins = h2hResults.map(r => r.margin || 0);
                const avgMargin = margins.reduce((sum, m) => sum + m, 0) / margins.length;
                
                // NCAAB Sweep Context: Conference rival is 0-2 AND is 70%+ OR ranked
                if (isConferenceRival && (sweptWinPct >= 70 || isRanked)) {
                  sweepContext = {
                    triggered: true,
                    sport: 'NCAAB',
                    games_in_sweep: gamesPlayed,
                    dominant_team: dominantTeamName,
                    swept_team: sweptTeamName,
                    swept_team_record: `${sweptWins}-${sweptLosses}`,
                    swept_team_win_pct: `${sweptWinPct.toFixed(1)}%`,
                    swept_team_ranking: sweptRanking,
                    is_conference_rival: true,
                    conference: sweptConference,
                    avg_margin: avgMargin.toFixed(1)
                  };
                  console.log(`[Stat Router] NCAAB SWEEP CONTEXT: ${sweptTeamName} (${sweptWinPct.toFixed(1)}%${isRanked ? ', #' + sweptRanking : ''}) is 0-${gamesPlayed} vs conference rival ${dominantTeamName}`);
                }
              }
            }
          } catch (ncaabErr) {
            console.log(`[Stat Router] NCAAB sweep context check failed (non-fatal): ${ncaabErr.message}`);
          }
        }
      }
      
      // ===== CONDITIONS CHANGED CONTEXT (1-2 GAME H2H) =====
      // For small sample H2H (1-2 games), check if conditions have significantly changed
      // This helps Gary understand that a single game result may not be representative
      let conditionsChangedContext = null;
      
      if (isNba && h2hGames.length <= 2 && h2hResults.length > 0) {
        try {
          // Check for DNPs in previous H2H games (from personnel notes)
          const dnpMatches = [];
          for (const result of h2hResults) {
            if (result.personnel_note) {
              // Look for DNP patterns like "DNP: Embiid" or "Embiid (0 min)"
              const dnpPattern = /DNP:\s*([^|,]+)|(\w+)\s*\(0\s*min\)/gi;
              let match;
              while ((match = dnpPattern.exec(result.personnel_note)) !== null) {
                const playerName = (match[1] || match[2] || '').trim();
                if (playerName && playerName.length > 2) {
                  dnpMatches.push({
                    player: playerName,
                    date: result.date,
                    result: result.result
                  });
                }
              }
            }
          }
          
          // If we found DNPs, flag that conditions may have changed
          if (dnpMatches.length > 0) {
            const dnpList = dnpMatches.map(d => `${d.player} (out ${d.date})`).join(', ');
            const gamesText = h2hGames.length === 1 ? 'the only H2H game' : `${h2hGames.length} H2H games`;
            
            conditionsChangedContext = {
              triggered: true,
              dnp_players: dnpMatches,
              sample_size: h2hGames.length,
              note: `CONDITIONS CHANGED: In ${gamesText} this season, key player(s) were OUT: ${dnpList}. This result happened under different circumstances than tonight. Check current injury report for who is available tonight.`
            };
            console.log(`[Stat Router] CONDITIONS CHANGED: Found DNP(s) in H2H: ${dnpList}`);
          } else if (h2hGames.length === 1) {
            // Even without detected DNPs, flag that 1-game H2H is anecdotal
            conditionsChangedContext = {
              triggered: true,
              dnp_players: [],
              sample_size: 1,
              note: `Only 1 H2H game this season.`
            };
          }
        } catch (condErr) {
          console.log(`[Stat Router] Conditions changed check failed (non-fatal): ${condErr.message}`);
        }
      }
      
      return {
        category: `Head-to-Head History (${currentSeason} Season ONLY)`,
        games_found: h2hGames.length,
        h2h_available: true,
        this_season_record: `${homeName} ${homeWins}-${awayWins} ${awayName}`,
        meetings_this_season: h2hResults,
        revenge_game: revengeGame,
        revenge_note: revengeGame ? `${awayName} lost the last meeting.` : null,
        sweep_context: sweepContext,
        conditions_changed_context: conditionsChangedContext,
        ANTI_HALLUCINATION: `DATA BOUNDARY: You have ONLY ${h2hGames.length} verified H2H game(s) from the ${currentSeason} season. You may cite these specific games. DO NOT claim historical streaks, prior season records, or "all-time" H2H records that are not shown here.`
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching H2H history:`, error.message);
      return {
        category: 'Head-to-Head History',
        h2h_available: false,
        error: 'Data unavailable',
        ANTI_HALLUCINATION: 'CRITICAL: H2H data fetch FAILED. You have ZERO verified H2H data. DO NOT mention H2H history at all - focus on other factors instead.'
      };
    }
  },


  // ===== CLUTCH STATS (Close Game Record) =====
  CLUTCH_STATS: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching CLUTCH_STATS for ${away.name} @ ${home.name}`);

    try {
      // NBA: Use real BDL team_season_averages/clutch endpoint
      if (bdlSport === 'basketball_nba') {
        const API_KEY = process.env.BALLDONTLIE_API_KEY;
        const baseUrl = 'https://api.balldontlie.io/nba/v1/team_season_averages/clutch';

        const fetchClutch = async (url) => {
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          return resp.json();
        };

        const [homeAdvJson, awayAdvJson, homeBaseJson, awayBaseJson] = await Promise.all([
          fetchClutch(`${baseUrl}?season=${season}&season_type=regular&type=advanced&team_ids[]=${home.id}`),
          fetchClutch(`${baseUrl}?season=${season}&season_type=regular&type=advanced&team_ids[]=${away.id}`),
          fetchClutch(`${baseUrl}?season=${season}&season_type=regular&type=base&team_ids[]=${home.id}`),
          fetchClutch(`${baseUrl}?season=${season}&season_type=regular&type=base&team_ids[]=${away.id}`)
        ]);

        const hAdv = homeAdvJson?.data?.[0]?.stats || {};
        const aAdv = awayAdvJson?.data?.[0]?.stats || {};
        const hBase = homeBaseJson?.data?.[0]?.stats || {};
        const aBase = awayBaseJson?.data?.[0]?.stats || {};

        const formatClutch = (adv, base, teamName) => ({
          team: teamName,
          clutch_record: `${adv.w || 0}-${adv.l || 0}`,
          clutch_win_pct: adv.w_pct ? `${(adv.w_pct * 100).toFixed(1)}%` : 'N/A',
          clutch_games: adv.gp || 0,
          clutch_net_rating: adv.net_rating ?? 'N/A',
          clutch_net_rank: adv.net_rating_rank ?? 'N/A',
          clutch_off_rating: adv.off_rating ?? 'N/A',
          clutch_def_rating: adv.def_rating ?? 'N/A',
          clutch_efg_pct: adv.efg_pct ? `${(adv.efg_pct * 100).toFixed(1)}%` : 'N/A',
          clutch_ts_pct: adv.ts_pct ? `${(adv.ts_pct * 100).toFixed(1)}%` : 'N/A',
          clutch_tov_pct: adv.tm_tov_pct ? `${(adv.tm_tov_pct * 100).toFixed(1)}%` : 'N/A',
          clutch_ppg: base.pts ?? 'N/A',
          clutch_plus_minus: base.plus_minus ?? 'N/A'
        });

        return {
          category: 'Clutch Performance (BDL Team Clutch Averages)',
          home: formatClutch(hAdv, hBase, home.full_name || home.name),
          away: formatClutch(aAdv, aBase, away.full_name || away.name)
        };
      }

      // Non-NBA: Sport not supported for clutch stats
      return { category: 'Clutch Stats', note: 'Only available for NBA', error: 'Sport not supported' };
    } catch (error) {
      console.error(`[Stat Router] Error fetching clutch stats:`, error.message);
      return {
        category: 'Clutch Stats',
        home: { team: home.full_name || home.name, close_record: 'N/A' },
        away: { team: away.full_name || away.name, close_record: 'N/A' }
      };
    }
  },


  // ===== LUCK-ADJUSTED (Pythagorean Expected Wins) =====
  LUCK_ADJUSTED: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching LUCK_ADJUSTED (Pythagorean expected wins) for ${away.name} @ ${home.name}`);
    
    try {
      // Get standings for wins/losses + recent games for scoring
      const [standings, homeGames, awayGames] = await Promise.all([
        ballDontLieService.getNbaStandings(season),
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [home.id], 
          start_date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
          per_page: 20 
        }),
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [away.id], 
          start_date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
          per_page: 20 
        })
      ]);
      
      // Find teams in standings
      const homeStanding = standings.find(s => s.team?.id === home.id);
      const awayStanding = standings.find(s => s.team?.id === away.id);
      
      // Calculate PPG from recent games
      const calcPpg = (games, teamId) => {
        const completedGames = (games || []).filter(g => (g.home_team_score ?? g.home_score ?? 0) > 0 || (g.visitor_team_score ?? g.away_score ?? 0) > 0);
        if (completedGames.length === 0) return { ppg: 0, oppPpg: 0 };

        let totalPf = 0, totalPa = 0;
        for (const g of completedGames) {
          const isHome = g.home_team?.id === teamId;
          totalPf += isHome ? (g.home_team_score ?? g.home_score ?? 0) : (g.visitor_team_score ?? g.away_score ?? 0);
          totalPa += isHome ? (g.visitor_team_score ?? g.away_score ?? 0) : (g.home_team_score ?? g.home_score ?? 0);
        }
        return { ppg: totalPf / completedGames.length, oppPpg: totalPa / completedGames.length };
      };
      
      const homeScoring = calcPpg(homeGames, home.id);
      const awayScoring = calcPpg(awayGames, away.id);
      
      // Calculate Pythagorean expected win %
      const calcPythagorean = (standing, scoring) => {
        const wins = standing?.wins || 0;
        const losses = standing?.losses || 0;
        const games = wins + losses;
        const ppg = scoring.ppg;
        const oppPpg = scoring.oppPpg;
        
        if (ppg === 0 || oppPpg === 0 || games === 0) {
          return { actual_record: 'N/A', expected_wins: 'N/A', luck_factor: 'N/A' };
        }
        
        // NBA Pythagorean exponent
        const exp = 13.91;
        const expectedWinPct = Math.pow(ppg, exp) / (Math.pow(ppg, exp) + Math.pow(oppPpg, exp));
        const expectedWins = Math.round(expectedWinPct * games * 10) / 10;
        const actualWinPct = wins / games;
        
        // Luck factor: positive = lucky (winning more than expected), negative = unlucky
        const luckFactor = ((actualWinPct - expectedWinPct) * 100).toFixed(1);
        return {
          actual_record: `${wins}-${losses}`,
          actual_win_pct: `${(actualWinPct * 100).toFixed(1)}%`,
          expected_wins: expectedWins.toFixed(1),
          expected_win_pct: `${(expectedWinPct * 100).toFixed(1)}%`,
          ppg: ppg.toFixed(1),
          opp_ppg: oppPpg.toFixed(1),
          luck_factor: `${parseFloat(luckFactor) > 0 ? '+' : ''}${luckFactor}%`
        };
      };
      
      return {
        category: 'Luck-Adjusted (Pythagorean Expected Wins)',
        home: {
          team: home.full_name || home.name,
          ...calcPythagorean(homeStanding, homeScoring)
        },
        away: {
          team: away.full_name || away.name,
          ...calcPythagorean(awayStanding, awayScoring)
        },
        note: 'Pythagorean expected wins vs actual wins for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching luck-adjusted stats:`, error.message);
      return {
        category: 'Luck-Adjusted',
        error: 'Data unavailable'
      };
    }
  },


  // ===== USAGE RATES (Real data from BDL advanced stats — usage concentration + top players) =====
  USAGE_RATES: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching USAGE_RATES for ${away.name} @ ${home.name}`);

    try {
      // Use fetchNBATeamAdvancedStats which already fetches usage data from BDL
      // season_averages/general?type=scoring (pct_pts_paint, etc.) and type=usage (usg_pct)
      const [homeAdvanced, awayAdvanced] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);

      const formatTeamUsage = (stats) => {
        if (!stats) return { error: 'Data unavailable' };
        return {
          usage_concentration: stats.usage_concentration || 'N/A',
          top_players: (stats.top_players || []).map(p => ({
            name: p.name,
            usage_pct: p.usage,
            minutes: p.mins
          })),
          scoring_profile: stats.scoring_profile || null
        };
      };

      return {
        category: 'Usage Rates & Offensive Concentration',
        source: 'Ball Don\'t Lie API (Advanced)',
        home: {
          team: home.full_name || home.name,
          ...formatTeamUsage(homeAdvanced)
        },
        away: {
          team: away.full_name || away.name,
          ...formatTeamUsage(awayAdvanced)
        },
        comparison: 'Bench scoring and depth data for both teams.',
        note: 'Usage % = share of possessions used while on court.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching usage rates:`, error.message);
      return { category: 'Usage Rates', error: 'Data unavailable' };
    }
  },


  // ===== VS ELITE TEAMS (Record vs Top 5 teams by conference) =====
  VS_ELITE_TEAMS: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching VS_ELITE_TEAMS for ${away.name} @ ${home.name}`);
    
    try {
      // Get standings to identify elite teams (top 5 in each conference)
      const standings = await ballDontLieService.getNbaStandings(season);
      
      // Get top 5 teams from each conference
      const eastElite = standings
        .filter(s => s.team?.conference === 'East')
        .sort((a, b) => (b.wins || 0) - (a.wins || 0))
        .slice(0, 5)
        .map(s => s.team?.id);
      
      const westElite = standings
        .filter(s => s.team?.conference === 'West')
        .sort((a, b) => (b.wins || 0) - (a.wins || 0))
        .slice(0, 5)
        .map(s => s.team?.id);
      
      const eliteTeamIds = [...eastElite, ...westElite];
      
      // Get games for each team this season
      const seasonStart = new Date(season - 1, 9, 1); // Oct 1
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        })
      ]);
      
      // Calculate record vs elite teams
      const calcVsElite = (games, teamId) => {
        let wins = 0, losses = 0;
        const eliteGames = [];
        
        for (const game of games || []) {
          const homeScore = game.home_team_score || 0;
          const awayScore = game.visitor_team_score || 0;
          if (homeScore === 0 && awayScore === 0) continue; // Unplayed
          
          const isHome = game.home_team?.id === teamId;
          const opponentId = isHome ? game.visitor_team?.id : game.home_team?.id;
          
          if (eliteTeamIds.includes(opponentId)) {
            const won = isHome ? homeScore > awayScore : awayScore > homeScore;
            if (won) wins++;
            else losses++;
            eliteGames.push({
              opponent: isHome ? game.visitor_team?.name : game.home_team?.name,
              result: won ? 'W' : 'L',
              score: isHome ? `${homeScore}-${awayScore}` : `${awayScore}-${homeScore}`
            });
          }
        }
        
        return {
          record: `${wins}-${losses}`,
          win_pct: wins + losses > 0 ? `${((wins / (wins + losses)) * 100).toFixed(0)}%` : 'N/A',
          games_played: wins + losses,
          recent_results: eliteGames.slice(0, 5)
        };
      };
      
      // Get elite team names for context
      const eliteTeamNames = standings
        .filter(s => eliteTeamIds.includes(s.team?.id))
        .map(s => s.team?.name)
        .slice(0, 10);
      
      return {
        category: 'Record vs Elite Teams (Top 5 Each Conference)',
        elite_teams: eliteTeamNames,
        home: {
          team: home.full_name || home.name,
          ...calcVsElite(homeGames, home.id)
        },
        away: {
          team: away.full_name || away.name,
          ...calcVsElite(awayGames, away.id)
        },
        note: 'Record vs .500+ teams for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching vs elite teams:`, error.message);
      return { category: 'Record vs Elite Teams', error: 'Data unavailable' };
    }
  },


  // ===== SCHEDULE STRENGTH (Real SOS - Not an alias!) =====
  SCHEDULE_STRENGTH: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching SCHEDULE_STRENGTH for ${away.name} @ ${home.name}`);
    
    // Works for NBA, NHL, and college sports
    const isNba = bdlSport === 'basketball_nba';
    const isNhl = bdlSport === 'icehockey_nhl';
    
    try {
      // Get standings to know each team's record
      let standings = [];
      if (isNba) {
        standings = await ballDontLieService.getNbaStandings(season);
      } else if (isNhl) {
        standings = await ballDontLieService.getNhlStandings(season);
      } else {
        // For college, use generic standings router (sport-aware)
        standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      }
      
      // Build a map of team ID -> win percentage
      const teamWinPct = {};
      for (const s of standings || []) {
        const teamId = s.team?.id;
        const wins = s.wins || 0;
        const losses = s.losses || 0;
        const total = wins + losses;
        if (teamId && total > 0) {
          teamWinPct[teamId] = wins / total;
        }
      }
      
      // Get games for each team this season
      const seasonStart = new Date(season - 1, 9, 1); // Oct 1
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        })
      ]);
      
      // Calculate SOS for each team
      const calcSOS = (games, teamId) => {
        const completedGames = (games || []).filter(g => {
          const homeScore = g.home_team_score || g.home_score || 0;
          const awayScore = g.visitor_team_score || g.away_score || 0;
          return homeScore > 0 || awayScore > 0;
        });
        
        if (completedGames.length === 0) return null;
        
        let totalOppWinPct = 0;
        let opponentsWithData = 0;
        const opponentBreakdown = { elite: 0, good: 0, average: 0, weak: 0 };
        
        for (const game of completedGames) {
          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          const oppId = isHome 
            ? (game.visitor_team?.id || game.visitor_team_id)
            : (game.home_team?.id || game.home_team_id);
          
          const oppWinPct = teamWinPct[oppId];
          if (oppWinPct !== undefined) {
            totalOppWinPct += oppWinPct;
            opponentsWithData++;
            
            // Categorize opponent
            if (oppWinPct >= 0.600) opponentBreakdown.elite++;
            else if (oppWinPct >= 0.500) opponentBreakdown.good++;
            else if (oppWinPct >= 0.400) opponentBreakdown.average++;
            else opponentBreakdown.weak++;
          }
        }
        
        if (opponentsWithData === 0) return null;
        
        const avgOppWinPct = totalOppWinPct / opponentsWithData;

        return {
          avg_opp_win_pct: `${(avgOppWinPct * 100).toFixed(1)}%`,
          games_analyzed: opponentsWithData,
          opponent_breakdown: opponentBreakdown,
          vs_elite: opponentBreakdown.elite,
          vs_weak: opponentBreakdown.weak
        };
      };
      
      const homeSOS = calcSOS(homeGames, home.id);
      const awaySOS = calcSOS(awayGames, away.id);
      
      // Determine if records are inflated/deflated
      return {
        category: 'Schedule Strength (Real SOS)',
        source: 'Ball Don\'t Lie API (calculated from opponent records)',
        home: {
          team: home.full_name || home.name,
          ...homeSOS
        },
        away: {
          team: away.full_name || away.name,
          ...awaySOS
        },
        comparison: 'Conference standings and playoff positioning data for both teams.',
        note: 'Strength of schedule data for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching SCHEDULE_STRENGTH:`, error.message);
      return { 
        category: 'Schedule Strength', 
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== BENCH DEPTH (NBA) =====
  BENCH_DEPTH: async (bdlSport, home, away, season) => {
    // NCAAB: Use player season stats to compute depth (starters vs bench contribution)
    if (bdlSport === 'basketball_ncaab') {
      console.log(`[Stat Router] Fetching NCAAB BENCH_DEPTH for ${away.name} @ ${home.name}`);
      try {
        const [homeStats, awayStats] = await Promise.all([
          ballDontLieService.getNcaabPlayerSeasonStats({ teamId: home.id, season }),
          ballDontLieService.getNcaabPlayerSeasonStats({ teamId: away.id, season })
        ]);

        const calcNcaabDepth = (playerStats, teamName) => {
          if (!playerStats || playerStats.length === 0) return { error: 'No player stats' };
          // Calculate per-game averages, sort by PPG
          const players = playerStats
            .filter(s => (s.games_played || 0) > 0)
            .map(s => {
              const gp = s.games_played || 1;
              return {
                name: `${s.player?.first_name || ''} ${s.player?.last_name || ''}`.trim(),
                ppg: (s.pts || 0) / gp,
                rpg: (s.reb || 0) / gp,
                apg: (s.ast || 0) / gp,
                gp
              };
            })
            .sort((a, b) => b.ppg - a.ppg);

          const starters = players.slice(0, 5);
          const bench = players.slice(5);
          const starterPPG = starters.reduce((sum, p) => sum + p.ppg, 0);
          const benchPPG = bench.reduce((sum, p) => sum + p.ppg, 0);
          const benchContributors = bench.filter(p => p.ppg >= 3).length;

          return {
            starter_ppg: starterPPG.toFixed(1),
            bench_ppg: benchPPG.toFixed(1),
            bench_pct: starterPPG > 0 ? `${((benchPPG / (starterPPG + benchPPG)) * 100).toFixed(0)}%` : 'N/A',
            rotation_size: players.filter(p => p.ppg >= 3).length,
            bench_contributors: benchContributors,
            top_bench: bench.slice(0, 6).map(p => `${p.name} ${p.ppg.toFixed(1)}ppg`).join(', ') || 'None'
          };
        };

        const homeDepth = calcNcaabDepth(homeStats, home.name);
        const awayDepth = calcNcaabDepth(awayStats, away.name);
        return {
          category: 'NCAAB Bench Depth (Season Stats)',
          home: { team: home.full_name || home.name, ...homeDepth },
          away: { team: away.full_name || away.name, ...awayDepth },
          note: 'Bench scoring data for both teams.'
        };
      } catch (error) {
        console.warn('[Stat Router] NCAAB BENCH_DEPTH error:', error.message);
        return { category: 'Bench Depth', error: 'Data unavailable for NCAAB' };
      }
    }

    // Non-NBA/NCAAB: not supported
    if (bdlSport !== 'basketball_nba') {
      return { category: 'Bench Depth', note: 'Only available for NBA/NCAAB', error: 'Sport not supported' };
    }

    console.log(`[Stat Router] Fetching BENCH_DEPTH for ${away.name} @ ${home.name}`);
    
    try {
      // Get recent games for both teams (last 10)
      const seasonStart = new Date(season - 1, 9, 1); // Oct 1
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 15
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 15
        })
      ]);
      
      // Get last 10 completed games for each team
      const getCompletedGames = (games, limit = 10) => {
        return (games || [])
          .filter(g => g.status === 'Final' && (g.home_team_score || 0) > 0)
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, limit);
      };
      
      const recentHomeGames = getCompletedGames(homeGames);
      const recentAwayGames = getCompletedGames(awayGames);
      
      if (recentHomeGames.length < 3 || recentAwayGames.length < 3) {
        return { category: 'Bench Depth', error: 'Not enough games to calculate bench depth' };
      }
      
      // Get player stats for these games
      const homeGameIds = recentHomeGames.map(g => g.id);
      const awayGameIds = recentAwayGames.map(g => g.id);
      
      const [homePlayerStats, awayPlayerStats] = await Promise.all([
        ballDontLieService.getPlayerStats(bdlSport, { game_ids: homeGameIds, per_page: 100 }),
        ballDontLieService.getPlayerStats(bdlSport, { game_ids: awayGameIds, per_page: 100 })
      ]);
      
      // Calculate bench depth for a team
      const calcBenchDepth = (playerStats, teamId, numGames) => {
        // Filter to only this team's players
        const teamStats = (playerStats || []).filter(s => s.team?.id === teamId);
        
        if (teamStats.length === 0) {
          return { error: 'No player stats available' };
        }
        
        // Aggregate stats by player
        const playerAgg = {};
        for (const stat of teamStats) {
          const playerId = stat.player?.id;
          if (!playerId) continue;
          
          if (!playerAgg[playerId]) {
            playerAgg[playerId] = {
              name: `${stat.player?.first_name || ''} ${stat.player?.last_name || ''}`.trim(),
              games: 0,
              minutes: 0,
              points: 0,
              plusMinus: 0
            };
          }
          
          // Parse minutes (format: "32" or "32:45")
          const minStr = stat.min || '0';
          const mins = parseInt(minStr.split(':')[0]) || 0;
          
          playerAgg[playerId].games++;
          playerAgg[playerId].minutes += mins;
          playerAgg[playerId].points += stat.pts || 0;
          playerAgg[playerId].plusMinus += stat.plus_minus || 0;
        }
        
        // Convert to array and sort by total minutes (most minutes = starter)
        const players = Object.entries(playerAgg)
          .map(([id, data]) => ({
            id,
            ...data,
            mpg: data.games > 0 ? data.minutes / data.games : 0,
            ppg: data.games > 0 ? data.points / data.games : 0,
            avgPlusMinus: data.games > 0 ? data.plusMinus / data.games : 0
          }))
          .sort((a, b) => b.mpg - a.mpg);
        
        // Top 5 by minutes = starters, rest = bench
        const starters = players.slice(0, 5);
        const bench = players.slice(5);
        
        // Calculate aggregates
        const starterPPG = starters.reduce((sum, p) => sum + p.ppg, 0);
        const benchPPG = bench.reduce((sum, p) => sum + p.ppg, 0);
        const starterMPG = starters.reduce((sum, p) => sum + p.mpg, 0);
        const benchMPG = bench.reduce((sum, p) => sum + p.mpg, 0);
        const starterPlusMinus = starters.reduce((sum, p) => sum + p.avgPlusMinus, 0) / Math.max(starters.length, 1);
        const benchPlusMinus = bench.reduce((sum, p) => sum + p.avgPlusMinus, 0) / Math.max(bench.length, 1);
        
        // Identify top bench scorers
        const topBench = bench.slice(0, 6).map(p => ({
          name: p.name,
          ppg: p.ppg.toFixed(1),
          mpg: p.mpg.toFixed(1)
        }));
        
        return {
          starter_ppg: starterPPG.toFixed(1),
          bench_ppg: benchPPG.toFixed(1),
          starter_mpg: starterMPG.toFixed(1),
          bench_mpg: benchMPG.toFixed(1),
          bench_plus_minus: benchPlusMinus.toFixed(1),
          starter_plus_minus: starterPlusMinus.toFixed(1),
          rotation_size: players.filter(p => p.mpg >= 10).length,
          top_bench_players: topBench,
          games_analyzed: numGames
        };
      };
      
      const homeDepth = calcBenchDepth(homePlayerStats, home.id, recentHomeGames.length);
      const awayDepth = calcBenchDepth(awayPlayerStats, away.id, recentAwayGames.length);
      
      return {
        category: 'Bench Depth Analysis (Last 10 Games)',
        home: {
          team: home.full_name || home.name,
          ...homeDepth
        },
        away: {
          team: away.full_name || away.name,
          ...awayDepth
        },
        note: 'Bench scoring and depth data for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching bench depth:`, error.message);
      return { category: 'Bench Depth', error: 'Data unavailable - ' + error.message };
    }
  },

  // ===== NFL SPECIFIC =====
  // Helper to extract first element from BDL team_season_stats array response
  _extractNflStats: (statsArray) => {
    if (Array.isArray(statsArray) && statsArray.length > 0) return statsArray[0];
    return statsArray || {};
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
      comparison: 'Turnover differential, takeaways, and giveaways for both teams.'
    };
  },


  // ===== SITUATIONAL =====
  REST_SITUATION: async (bdlSport, home, away, season, gameId, gameDate) => {
    // Fetch recent games for both teams to calculate rest situation
    console.log(`[Stat Router] Fetching REST_SITUATION for ${away.name} @ ${home.name}`);
    
    try {
      // Determine date range - look back 10 days from game date for current rest
      const targetDate = gameDate ? new Date(gameDate) : new Date();
      const endDateStr = targetDate.toISOString().split('T')[0];
      const startDate = new Date(targetDate);
      startDate.setDate(startDate.getDate() - 10); // Look back 10 days
      const startDateStr = startDate.toISOString().split('T')[0];

      // For B2B history, look back at entire season
      const seasonStart = new Date(season - 1, 9, 1); // Oct 1
      const seasonStartStr = seasonStart.toISOString().split('T')[0];

      let homeRecentGames, awayRecentGames, homeSeasonGames, awaySeasonGames;

      if (bdlSport === 'icehockey_nhl') {
        // BDL NHL API ignores start_date/end_date — use dates[] array for recent games
        const recentDates = [];
        for (let i = 0; i <= 10; i++) {
          const d = new Date(targetDate);
          d.setDate(d.getDate() - i);
          recentDates.push(d.toISOString().split('T')[0]);
        }
        [homeRecentGames, awayRecentGames, homeSeasonGames, awaySeasonGames] = await Promise.all([
          ballDontLieService.getGames(bdlSport, { team_ids: [home.id], dates: recentDates, per_page: 20 }),
          ballDontLieService.getGames(bdlSport, { team_ids: [away.id], dates: recentDates, per_page: 20 }),
          ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 100 }),
          ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 100 })
        ]);
      } else {
        // NBA/NFL/NCAAB support start_date/end_date
        [homeRecentGames, awayRecentGames, homeSeasonGames, awaySeasonGames] = await Promise.all([
          ballDontLieService.getGames(bdlSport, {
            team_ids: [home.id],
            start_date: startDateStr,
            end_date: endDateStr,
            per_page: 10
          }),
          ballDontLieService.getGames(bdlSport, {
            team_ids: [away.id],
            start_date: startDateStr,
            end_date: endDateStr,
            per_page: 10
          }),
          ballDontLieService.getGames(bdlSport, {
            team_ids: [home.id],
            start_date: seasonStartStr,
            end_date: endDateStr,
            per_page: 60
          }),
          ballDontLieService.getGames(bdlSport, {
            team_ids: [away.id],
            start_date: seasonStartStr,
            end_date: endDateStr,
            per_page: 60
          })
        ]);
      }

      // Use recent games for current rest calculation
      const homeGames = homeRecentGames;
      const awayGames = awayRecentGames;
      
      // Calculate rest for each team
      const calculateRest = (games, teamId, targetDateObj) => {
        const targetDateStr = targetDateObj.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        
        // Helper to get game date (handles both NBA's "date" and NHL's "game_date")
        const getGameDateStr = (g) => (g.game_date || g.date || '').split('T')[0];
        
        // Filter to completed games before today
        const completedGames = (games || [])
          .filter(g => {
            const gameStr = getGameDateStr(g);
            // NHL uses home_score/away_score, NBA/NFL use home_team_score/visitor_team_score
            const hasScore = (g.home_team_score || g.home_score || 0) > 0 || (g.visitor_team_score || g.away_score || 0) > 0;
            return gameStr < targetDateStr || (gameStr === targetDateStr && hasScore);
          })
          .sort((a, b) => new Date(getGameDateStr(b)) - new Date(getGameDateStr(a))); // Most recent first
        
        if (completedGames.length === 0) {
          return { daysRest: null, isBackToBack: false, lastGameDate: null, gamesInLast4Days: 0 };
        }
        
        const lastGame = completedGames[0];
        const lastGameDateStr = getGameDateStr(lastGame);
        const lastGameDate = new Date(lastGameDateStr + 'T12:00:00');
        const targetMidnight = new Date(targetDateStr + 'T12:00:00');
        
        const diffDays = Math.round((targetMidnight - lastGameDate) / (1000 * 60 * 60 * 24));
        const isBackToBack = diffDays <= 1;
        
        // Count games in last 4 days
        const fourDaysAgo = new Date(targetMidnight);
        fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
        const gamesInLast4Days = completedGames.filter(g => {
          const gDate = new Date(getGameDateStr(g) + 'T12:00:00');
          return gDate >= fourDaysAgo;
        }).length;
        
        return {
          daysRest: diffDays,
          isBackToBack,
          isHeavySchedule: gamesInLast4Days >= 3,
          gamesInLast4Days,
          lastGameDate: lastGameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        };
      };
      
      const homeRest = calculateRest(homeGames, home.id, targetDate);
      const awayRest = calculateRest(awayGames, away.id, targetDate);
      
      // Determine rest advantage
      let restAdvantage = 'EVEN';
      if (homeRest.daysRest !== null && awayRest.daysRest !== null) {
        if (homeRest.daysRest > awayRest.daysRest + 1) restAdvantage = 'HOME';
        else if (awayRest.daysRest > homeRest.daysRest + 1) restAdvantage = 'AWAY';
      }
      
      // Format status strings
      const formatStatus = (rest) => {
        if (rest.daysRest === null) return 'No recent games found';
        if (rest.isBackToBack) return `BACK-TO-BACK (played ${rest.lastGameDate})`;
        if (rest.isHeavySchedule) return `Heavy schedule (${rest.gamesInLast4Days} games in 4 days)`;
        if (rest.daysRest >= 3) return `Well-rested (${rest.daysRest} days)`;
        return `${rest.daysRest} day(s) rest`;
      };
      
      // Calculate B2B HISTORICAL performance for each team
      const calcB2BHistory = (seasonGames, teamId) => {
        const getGameDateStr = (g) => (g.game_date || g.date || '').split('T')[0];
        
        // Sort games by date
        const completed = (seasonGames || [])
          .filter(g => {
            const homeScore = g.home_team_score || g.home_score || 0;
            const awayScore = g.visitor_team_score || g.away_score || 0;
            return homeScore > 0 || awayScore > 0;
          })
          .sort((a, b) => new Date(getGameDateStr(a)) - new Date(getGameDateStr(b)));
        
        if (completed.length < 5) return null;
        
        let b2bWins = 0, b2bLosses = 0;
        const b2bGames = [];
        
        // Find B2B games (played day after previous game)
        for (let i = 1; i < completed.length; i++) {
          const prevDate = new Date(getGameDateStr(completed[i-1]));
          const currDate = new Date(getGameDateStr(completed[i]));
          const daysDiff = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));
          
          if (daysDiff === 1) {
            // This is a B2B game
            const game = completed[i];
            const isHome = (game.home_team?.id || game.home_team_id) === teamId;
            const teamScore = isHome 
              ? (game.home_team_score || game.home_score || 0)
              : (game.visitor_team_score || game.away_score || 0);
            const oppScore = isHome 
              ? (game.visitor_team_score || game.away_score || 0)
              : (game.home_team_score || game.home_score || 0);
            
            const won = teamScore > oppScore;
            if (won) b2bWins++;
            else b2bLosses++;
            
            b2bGames.push({
              date: getGameDateStr(game),
              result: won ? 'W' : 'L',
              margin: Math.abs(teamScore - oppScore)
            });
          }
        }
        
        const totalB2B = b2bWins + b2bLosses;
        if (totalB2B === 0) return { record: 'No B2Bs yet', win_pct: null, games: 0 };
        
        const winPct = b2bWins / totalB2B;

        // Get last 3 B2B results
        const recentB2B = b2bGames.slice(-3).reverse().map(g => g.result).join('-');

        return {
          record: `${b2bWins}-${b2bLosses}`,
          win_pct: `${(winPct * 100).toFixed(0)}%`,
          games: totalB2B,
          recent_b2b: recentB2B || 'N/A',
          avg_margin: b2bGames.length > 0 
            ? (b2bGames.reduce((s, g) => s + g.margin, 0) / b2bGames.length).toFixed(1)
            : 'N/A'
        };
      };
      
      const homeB2BHistory = calcB2BHistory(homeSeasonGames, home.id);
      const awayB2BHistory = calcB2BHistory(awaySeasonGames, away.id);
      
      return {
        category: 'Rest & Schedule Situation',
        source: 'Ball Don\'t Lie API (calculated)',
        home: {
          team: home.full_name || home.name,
          days_rest: homeRest.daysRest,
          status: formatStatus(homeRest),
          is_back_to_back: homeRest.isBackToBack,
          is_heavy_schedule: homeRest.isHeavySchedule || false,
          last_game: homeRest.lastGameDate,
          b2b_history: homeB2BHistory
        },
        away: {
          team: away.full_name || away.name,
          days_rest: awayRest.daysRest,
          status: formatStatus(awayRest),
          is_back_to_back: awayRest.isBackToBack,
          is_heavy_schedule: awayRest.isHeavySchedule || false,
          last_game: awayRest.lastGameDate,
          b2b_history: awayB2BHistory
        },
        rest_advantage: restAdvantage,
        comparison: homeRest.isBackToBack || awayRest.isBackToBack
          ? 'Back-to-back situation detected — rest and schedule data for both teams.'
          : null
      };
      
    } catch (error) {
      console.error(`[Stat Router] Error fetching REST_SITUATION:`, error.message);
      return {
        category: 'Rest & Schedule Situation',
        error: 'Unable to calculate rest data',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== CATCH-ALL for unimplemented tokens =====
  DEFAULT: async (bdlSport, home, away) => {
    return {
      error: 'Stat not yet implemented',
      home: { team: home.full_name || home.name },
      away: { team: away.full_name || away.name }
    };
  },

};
