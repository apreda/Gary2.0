/** NBA stat tools: Team ratings and per-game rates: pace, offensive/defensive/net rating, the four factors, shooting and box-score rates. (split from nbaFetchers.js, Oct 13 2026). */
import { fmtNum, fmtPct, fetchBothTeamSeasonStats, fetchNBATeamAdvancedStats, fetchNBATeamBaseStats, fetchNBATeamOpponentStats, buildPaceAnalysis, getBarttovikRatings, isPostseasonOptions } from '../statRouterCommon.js';
import { ballDontLieService } from '../../../../ballDontLieService.js';

export const efficiencyFetchers = {
  // ===== PACE & TEMPO =====
  PACE: async (bdlSport, home, away, season, options) => {
    // For NBA, use BDL Season Averages (Advanced) which includes pace
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamAdvancedStats(away.id, season, isPostseasonOptions(options))
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
        projected_pace: homePace && awayPace ? avgPace.toFixed(1) : 'N/A',
        analysis: `${home.name} pace: ${homePace ? homePace.toFixed(1) : 'N/A'}, ${away.name} pace: ${awayPace ? awayPace.toFixed(1) : 'N/A'}, projected: ${homePace && awayPace ? avgPace.toFixed(1) : 'N/A'}`,
        comparison: `${home.name} pace: ${homePace.toFixed(1)}, ${away.name} pace: ${awayPace.toFixed(1)}, projected game pace: ${avgPace > 0 ? avgPace.toFixed(1) : 'N/A'}`
      };
    }
    
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: isPostseasonOptions(options) }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: isPostseasonOptions(options) })
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

  TEMPO: async (bdlSport, home, away, season, options) => {
    // Alias for PACE in college
    return efficiencyFetchers.PACE(bdlSport, home, away, season);
  },


  // ===== EFFICIENCY =====
  OFFENSIVE_RATING: async (bdlSport, home, away, season, options) => {
    // For NBA, use BDL Season Averages (Advanced) - requires GOAT tier
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamAdvancedStats(away.id, season, isPostseasonOptions(options))
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
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: isPostseasonOptions(options) }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: isPostseasonOptions(options) })
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

  DEFENSIVE_RATING: async (bdlSport, home, away, season, options) => {
    // For NBA, use BDL Season Averages (Advanced)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamAdvancedStats(away.id, season, isPostseasonOptions(options))
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
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: isPostseasonOptions(options) }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: isPostseasonOptions(options) })
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

  NET_RATING: async (bdlSport, home, away, season, options) => {
    // For NBA, use BDL Season Averages (Advanced) with BDL v2 usage/scoring data
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamAdvancedStats(away.id, season, isPostseasonOptions(options))
      ]);

      const homeNet = parseFloat(homeStats?.net_rating);
      const awayNet = parseFloat(awayStats?.net_rating);
      const gap = Number.isFinite(homeNet) && Number.isFinite(awayNet) ? (homeNet - awayNet).toFixed(1) : 'N/A';

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
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: isPostseasonOptions(options) }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: isPostseasonOptions(options) })
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

  ADJ_OFFENSIVE_EFF: async (bdlSport, home, away, season, options) => {
    return efficiencyFetchers.OFFENSIVE_RATING(bdlSport, home, away, season);
  },

  ADJ_DEFENSIVE_EFF: async (bdlSport, home, away, season, options) => {
    return efficiencyFetchers.DEFENSIVE_RATING(bdlSport, home, away, season);
  },

  ADJ_EFFICIENCY_MARGIN: async (bdlSport, home, away, season, options) => {
    return efficiencyFetchers.NET_RATING(bdlSport, home, away, season);
  },


  // ===== FOUR FACTORS =====
  EFG_PCT: async (bdlSport, home, away, season, options) => {
    // For NBA, use BDL Season Averages (Advanced + Opponent)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats, homeOpp, awayOpp] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamAdvancedStats(away.id, season, isPostseasonOptions(options)),
        fetchNBATeamOpponentStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamOpponentStats(away.id, season, isPostseasonOptions(options))
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
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: isPostseasonOptions(options) }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: isPostseasonOptions(options) })
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

  TURNOVER_RATE: async (bdlSport, home, away, season, options) => {
    // For NBA, use REAL tm_tov_pct from advanced stats + opponent TOV context
    if (bdlSport === 'basketball_nba') {
      const [homeAdvanced, awayAdvanced, homeBase, awayBase, homeOpp, awayOpp] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamAdvancedStats(away.id, season, isPostseasonOptions(options)),
        fetchNBATeamBaseStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamBaseStats(away.id, season, isPostseasonOptions(options)),
        fetchNBATeamOpponentStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamOpponentStats(away.id, season, isPostseasonOptions(options))
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
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: isPostseasonOptions(options) }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: isPostseasonOptions(options) })
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

  OREB_RATE: async (bdlSport, home, away, season, options) => {
    // For NBA, use REAL oreb_pct from advanced stats + opponent OREB context
    if (bdlSport === 'basketball_nba') {
      const [homeAdvanced, awayAdvanced, homeBase, awayBase, homeOpp, awayOpp] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamAdvancedStats(away.id, season, isPostseasonOptions(options)),
        fetchNBATeamBaseStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamBaseStats(away.id, season, isPostseasonOptions(options)),
        fetchNBATeamOpponentStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamOpponentStats(away.id, season, isPostseasonOptions(options))
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
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: isPostseasonOptions(options) }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: isPostseasonOptions(options) })
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

  FT_RATE: async (bdlSport, home, away, season, options) => {
    // For NBA, use team-level base stats + opponent FT data
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats, homeOpp, awayOpp] = await Promise.all([
        fetchNBATeamBaseStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamBaseStats(away.id, season, isPostseasonOptions(options)),
        fetchNBATeamOpponentStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamOpponentStats(away.id, season, isPostseasonOptions(options))
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
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: isPostseasonOptions(options) }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: isPostseasonOptions(options) })
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
  THREE_PT_SHOOTING: async (bdlSport, home, away, season, options) => {
    // For NBA, use player-aggregated base stats (BDL has no team_season_stats for NBA)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamBaseStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamBaseStats(away.id, season, isPostseasonOptions(options))
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
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: isPostseasonOptions(options) }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: isPostseasonOptions(options) })
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
  
  SCORING: async (bdlSport, home, away, season, options) => {
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

  ASSISTS: async (bdlSport, home, away, season, options) => {
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

  REBOUNDS: async (bdlSport, home, away, season, options) => {
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

  STEALS: async (bdlSport, home, away, season, options) => {
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

  BLOCKS: async (bdlSport, home, away, season, options) => {
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

  FG_PCT: async (bdlSport, home, away, season, options) => {
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
};
