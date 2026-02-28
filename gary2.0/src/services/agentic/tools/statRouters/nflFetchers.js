import { getCurrentSeasonString, sportToBdlKey, normalizeSportName, findTeam, fmtNum, fmtPct, fetchBothTeamSeasonStats, fetchNBATeamScoringStats, fetchNBATeamAdvancedStats, fetchNBALeaders, fetchNBATeamBaseStats, fetchNBATeamOpponentStats, fetchNBATeamDefenseStats, fetchTopPlayersForTeam, formatRecentGames, buildPaceAnalysis, interpretTurnoverMargin, BDL_API_KEY, _nbaBaseStatsCache, _nbaAdvancedStatsCache, _nbaOpponentStatsCache, _nbaDefenseStatsCache, _nbaTeamScoringStatsCache, geminiGroundingSearch, getGroundedWeather, isGameCompleted } from './statRouterCommon.js';
import { ballDontLieService } from '../../../ballDontLieService.js';

export const nflFetchers = {
  OFFENSIVE_EPA: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    // Extract first element from array response
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    // NCAAF uses different field names than NFL
    if (bdlSport === 'americanfootball_ncaaf') {
      const homeTotalYpg = (homeStats?.passing_yards_per_game || 0) + (homeStats?.rushing_yards_per_game || 0);
      const awayTotalYpg = (awayStats?.passing_yards_per_game || 0) + (awayStats?.rushing_yards_per_game || 0);
      const homeTotalTds = (homeStats?.passing_touchdowns || 0) + (homeStats?.rushing_touchdowns || 0);
      const awayTotalTds = (awayStats?.passing_touchdowns || 0) + (awayStats?.rushing_touchdowns || 0);
      
      return {
        category: 'Offensive Production',
        data_scope: 'Season yards and touchdowns (not EPA)',
        home: {
          team: home.full_name || home.name,
          total_yards_per_game: fmtNum(homeTotalYpg),
          passing_ypg: fmtNum(homeStats?.passing_yards_per_game),
          rushing_ypg: fmtNum(homeStats?.rushing_yards_per_game),
          total_tds: homeTotalTds.toString()
        },
        away: {
          team: away.full_name || away.name,
          total_yards_per_game: fmtNum(awayTotalYpg),
          passing_ypg: fmtNum(awayStats?.passing_yards_per_game),
          rushing_ypg: fmtNum(awayStats?.rushing_yards_per_game),
          total_tds: awayTotalTds.toString()
        }
      };
    }
    
    // NFL and other sports
    // Calculate yards per play correctly using season totals
    const homeGamesPlayed = homeStats?.games_played || 1;
    const awayGamesPlayed = awayStats?.games_played || 1;
    const homeTotalYards = homeStats?.total_offensive_yards || (homeStats?.total_offensive_yards_per_game * homeGamesPlayed);
    const awayTotalYards = awayStats?.total_offensive_yards || (awayStats?.total_offensive_yards_per_game * awayGamesPlayed);
    const homeTotalPlays = (homeStats?.passing_attempts || 0) + (homeStats?.rushing_attempts || 0);
    const awayTotalPlays = (awayStats?.passing_attempts || 0) + (awayStats?.rushing_attempts || 0);
    
    return {
      category: 'Offensive Efficiency',
      data_scope: 'Season yards and points (not EPA)',
      home: {
        team: home.full_name || home.name,
        points_per_game: fmtNum(homeStats?.total_points_per_game),
        yards_per_game: fmtNum(homeStats?.total_offensive_yards_per_game),
        yards_per_play: fmtNum(homeTotalPlays > 0 ? homeTotalYards / homeTotalPlays : 0, 1)
      },
      away: {
        team: away.full_name || away.name,
        points_per_game: fmtNum(awayStats?.total_points_per_game),
        yards_per_game: fmtNum(awayStats?.total_offensive_yards_per_game),
        yards_per_play: fmtNum(awayTotalPlays > 0 ? awayTotalYards / awayTotalPlays : 0, 1)
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
    
    // NCAAF uses different field names
    if (bdlSport === 'americanfootball_ncaaf') {
      const homeOppYards = (homeStats?.opp_passing_yards || 0) + (homeStats?.opp_rushing_yards || 0);
      const awayOppYards = (awayStats?.opp_passing_yards || 0) + (awayStats?.opp_rushing_yards || 0);
      
      return {
        category: 'Defensive Production',
        data_scope: 'Season yards allowed (not EPA)',
        home: {
          team: home.full_name || home.name,
          opp_total_yards: fmtNum(homeOppYards),
          opp_passing_yards: fmtNum(homeStats?.opp_passing_yards),
          opp_rushing_yards: fmtNum(homeStats?.opp_rushing_yards)
        },
        away: {
          team: away.full_name || away.name,
          opp_total_yards: fmtNum(awayOppYards),
          opp_passing_yards: fmtNum(awayStats?.opp_passing_yards),
          opp_rushing_yards: fmtNum(awayStats?.opp_rushing_yards)
        }
      };
    }
    
    // NFL and other sports
    return {
      category: 'Defensive Efficiency',
      data_scope: 'Season yards and points allowed (not EPA)',
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

  RED_ZONE_OFFENSE: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name;
    const awayName = away.full_name || away.name;
    
    // NCAAF: BDL doesn't provide red zone data, return N/A
    if (bdlSport === 'americanfootball_ncaaf') {
      return {
        category: 'Red Zone Efficiency',
        home: { team: homeName, red_zone_td_pct: 'N/A' },
        away: { team: awayName, red_zone_td_pct: 'N/A' },
        note: 'NCAAF red zone data unavailable from BDL'
      };
    }
    
    // Try to get actual red zone data from recent games (NFL)
    const [homeGames, awayGames] = await Promise.all([
      ballDontLieService.getTeamStats ? 
        ballDontLieService.getTeamStats(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 10 }) : [],
      ballDontLieService.getTeamStats ? 
        ballDontLieService.getTeamStats(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 10 }) : []
    ]);
    
    // Aggregate red zone stats from games
    const aggregateRedZone = (games, teamId) => {
      let rzScores = 0, rzAttempts = 0;
      const teamGames = (games || []).filter(g => g.team?.id === teamId);
      teamGames.forEach(g => {
        rzScores += g.red_zone_scores || 0;
        rzAttempts += g.red_zone_attempts || 0;
      });
      return {
        scores: rzScores,
        attempts: rzAttempts,
        pct: rzAttempts > 0 ? ((rzScores / rzAttempts) * 100).toFixed(1) + '%' : 'N/A',
        games: teamGames.length
      };
    };
    
    const homeRZ = aggregateRedZone(homeGames, home.id);
    const awayRZ = aggregateRedZone(awayGames, away.id);
    
    // If we got real red zone data, use it
    if (homeRZ.attempts > 0 || awayRZ.attempts > 0) {
      return {
        category: 'Red Zone Scoring Efficiency',
        home: {
          team: homeName,
          red_zone_td_pct: homeRZ.pct,
          red_zone_scores: homeRZ.scores.toString(),
          red_zone_attempts: homeRZ.attempts.toString()
        },
        away: {
          team: awayName,
          red_zone_td_pct: awayRZ.pct,
          red_zone_scores: awayRZ.scores.toString(),
          red_zone_attempts: awayRZ.attempts.toString()
        },
        note: `Aggregated from ${homeRZ.games} home games, ${awayRZ.games} away games`
      };
    }
    
    // Red zone data unavailable — return error instead of substituting a different stat
    return {
      category: 'Red Zone Scoring Efficiency',
      error: 'Red zone data unavailable from BDL for this game',
      home: { team: homeName, red_zone_td_pct: 'N/A', red_zone_scores: 'N/A', red_zone_attempts: 'N/A' },
      away: { team: awayName, red_zone_td_pct: 'N/A', red_zone_scores: 'N/A', red_zone_attempts: 'N/A' },
      note: 'Red zone game data not available. Use Gemini grounding to investigate red zone efficiency if needed.'
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


  // ===== NFL-SPECIFIC STATS (unique data for each token) =====
  
  SUCCESS_RATE_OFFENSE: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Offensive Success Rate (3rd/4th Down)',
      data_scope: 'Third and fourth down conversion rates (not per-play success rate)',
      home: {
        team: home.full_name || home.name,
        third_down_pct: fmtPct(homeStats?.misc_third_down_conv_pct / 100),
        fourth_down_pct: fmtPct(homeStats?.misc_fourth_down_conv_pct / 100),
        third_down_att: fmtNum(homeStats?.misc_third_down_conv_att, 0),
        third_down_made: fmtNum(homeStats?.misc_third_down_conv_made, 0)
      },
      away: {
        team: away.full_name || away.name,
        third_down_pct: fmtPct(awayStats?.misc_third_down_conv_pct / 100),
        fourth_down_pct: fmtPct(awayStats?.misc_fourth_down_conv_pct / 100),
        third_down_att: fmtNum(awayStats?.misc_third_down_conv_att, 0),
        third_down_made: fmtNum(awayStats?.misc_third_down_conv_made, 0)
      }
    };
  },

  SUCCESS_RATE_DEFENSE: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Defensive Success Rate (Opp 3rd/4th Down)',
      data_scope: 'Third and fourth down conversion rates (not per-play success rate)',
      home: {
        team: home.full_name || home.name,
        opp_third_down_pct: fmtPct(homeStats?.opp_third_down_conv_pct / 100),
        opp_fourth_down_pct: fmtPct(homeStats?.opp_fourth_down_conv_pct / 100)
      },
      away: {
        team: away.full_name || away.name,
        opp_third_down_pct: fmtPct(awayStats?.opp_third_down_conv_pct / 100),
        opp_fourth_down_pct: fmtPct(awayStats?.opp_fourth_down_conv_pct / 100)
      }
    };
  },

  EXPLOSIVE_PLAYS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    // BDL doesn't have actual explosive play data (plays > 20 yards)
    // Use longest plays and yards per attempt as proxies for explosiveness
    return {
      category: 'Explosive Play Potential',
      home: {
        team: home.full_name || home.name,
        longest_pass: fmtNum(homeStats?.passing_long, 0),
        longest_rush: fmtNum(homeStats?.rushing_long, 0),
        yards_per_catch: fmtNum(homeStats?.receiving_yards_per_reception, 1),
        yards_per_carry: fmtNum(homeStats?.rushing_yards_per_rush_attempt, 1)
      },
      away: {
        team: away.full_name || away.name,
        longest_pass: fmtNum(awayStats?.passing_long, 0),
        longest_rush: fmtNum(awayStats?.rushing_long, 0),
        yards_per_catch: fmtNum(awayStats?.receiving_yards_per_reception, 1),
        yards_per_carry: fmtNum(awayStats?.rushing_yards_per_rush_attempt, 1)
      }
    };
  },

  PRESSURE_RATE: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Pressure/Sack Stats',
      home: {
        team: home.full_name || home.name,
        sacks_made: fmtNum(homeStats?.defense_sacks, 0),
        sacks_allowed: fmtNum(homeStats?.passing_sacks_allowed, 0),
        qb_hits: fmtNum(homeStats?.defense_qb_hits, 0)
      },
      away: {
        team: away.full_name || away.name,
        sacks_made: fmtNum(awayStats?.defense_sacks, 0),
        sacks_allowed: fmtNum(awayStats?.passing_sacks_allowed, 0),
        qb_hits: fmtNum(awayStats?.defense_qb_hits, 0)
      }
    };
  },

  EPA_LAST_5: async (bdlSport, home, away, season) => {
    // Fetch last 5 completed games for each team to compute actual L5 scoring
    const [homeGamesRaw, awayGamesRaw] = await Promise.all([
      ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 25 }),
      ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 25 })
    ]);

    const calcL5Scoring = (games, teamId) => {
      if (!games || games.length === 0) return null;
      // Filter to completed games, sort by date descending, take last 5
      const completed = games
        .filter(g => isGameCompleted(g.status))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);
      if (completed.length === 0) return null;

      let totalPts = 0, totalOppPts = 0;
      for (const g of completed) {
        const isHome = (g.home_team?.id || g.home_team_id) === teamId;
        const teamScore = isHome
          ? (g.home_team_score ?? g.home_score ?? 0)
          : (g.visitor_team_score ?? g.away_score ?? 0);
        const oppScore = isHome
          ? (g.visitor_team_score ?? g.away_score ?? 0)
          : (g.home_team_score ?? g.home_score ?? 0);
        totalPts += teamScore;
        totalOppPts += oppScore;
      }
      const count = completed.length;
      const ppg = totalPts / count;
      const oppPpg = totalOppPts / count;
      return {
        games_used: count,
        ppg: fmtNum(ppg, 1),
        opp_ppg: fmtNum(oppPpg, 1),
        point_diff: fmtNum(ppg - oppPpg, 1)
      };
    };

    const homeL5 = calcL5Scoring(homeGamesRaw, home.id);
    const awayL5 = calcL5Scoring(awayGamesRaw, away.id);

    return {
      category: 'Last 5 Games Scoring Efficiency',
      data_scope: 'Actual L5 game scores (not per-play EPA)',
      home: {
        team: home.full_name || home.name,
        ...(homeL5 || { note: 'No completed games found' })
      },
      away: {
        team: away.full_name || away.name,
        ...(awayL5 || { note: 'No completed games found' })
      }
    };
  },

  RED_ZONE_DEFENSE: async (bdlSport, home, away, season) => {
    // Try to get actual red zone defense data from recent games (opponent stats)
    const [homeGames, awayGames] = await Promise.all([
      ballDontLieService.getTeamStats ? 
        ballDontLieService.getTeamStats(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 10 }) : [],
      ballDontLieService.getTeamStats ? 
        ballDontLieService.getTeamStats(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 10 }) : []
    ]);
    
    // For defense, we need opponent's red zone stats when playing against this team
    // This requires getting opponent stats from games, which is complex
    // For now, fall back to defensive efficiency metrics
    
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Defensive Efficiency Summary',
      data_scope: 'General defensive stats (red zone specific data unavailable from BDL)',
      home: {
        team: home.full_name || home.name,
        opp_ppg: fmtNum(homeStats?.opp_total_points_per_game),
        opp_yards_per_game: fmtNum(homeStats?.opp_total_offensive_yards_per_game),
        takeaways: fmtNum((homeStats?.defense_interceptions || 0) + (homeStats?.defense_fumble_recoveries || 0), 0),
        sacks: fmtNum(homeStats?.opp_passing_sacks || homeStats?.defense_sacks, 0)
      },
      away: {
        team: away.full_name || away.name,
        opp_ppg: fmtNum(awayStats?.opp_total_points_per_game),
        opp_yards_per_game: fmtNum(awayStats?.opp_total_offensive_yards_per_game),
        takeaways: fmtNum((awayStats?.defense_interceptions || 0) + (awayStats?.defense_fumble_recoveries || 0), 0),
        sacks: fmtNum(awayStats?.opp_passing_sacks || awayStats?.defense_sacks, 0)
      }
    };
  },

  WR_TE_STATS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Receiving/Passing Attack',
      home: {
        team: home.full_name || home.name,
        receiving_yards_per_game: fmtNum(homeStats?.passing_yards_per_game),
        receiving_tds: fmtNum(homeStats?.passing_touchdowns, 0),
        yards_per_catch: fmtNum(homeStats?.passing_yards / (homeStats?.passing_completions || 1)),
        completion_pct: fmtPct(homeStats?.passing_completion_pct / 100)
      },
      away: {
        team: away.full_name || away.name,
        receiving_yards_per_game: fmtNum(awayStats?.passing_yards_per_game),
        receiving_tds: fmtNum(awayStats?.passing_touchdowns, 0),
        yards_per_catch: fmtNum(awayStats?.passing_yards / (awayStats?.passing_completions || 1)),
        completion_pct: fmtPct(awayStats?.passing_completion_pct / 100)
      }
    };
  },

  DEFENSIVE_PLAYMAKERS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Defensive Playmaking',
      home: {
        team: home.full_name || home.name,
        interceptions: fmtNum(homeStats?.defense_interceptions, 0),
        fumble_recoveries: fmtNum(homeStats?.defense_fumble_recoveries, 0),
        sacks: fmtNum(homeStats?.defense_sacks, 0),
        total_takeaways: fmtNum((homeStats?.defense_interceptions || 0) + (homeStats?.defense_fumble_recoveries || 0), 0)
      },
      away: {
        team: away.full_name || away.name,
        interceptions: fmtNum(awayStats?.defense_interceptions, 0),
        fumble_recoveries: fmtNum(awayStats?.defense_fumble_recoveries, 0),
        sacks: fmtNum(awayStats?.defense_sacks, 0),
        total_takeaways: fmtNum((awayStats?.defense_interceptions || 0) + (awayStats?.defense_fumble_recoveries || 0), 0)
      }
    };
  },

  TURNOVER_LUCK: async (bdlSport, home, away, season) => {
    try {
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
        ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
      ]);
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;

      if (!homeStats || !awayStats) {
        return { category: 'Turnover Analysis', error: 'Data unavailable — BDL returned no stats for one or both teams' };
      }

      const homeTakeaways = (homeStats.defense_interceptions || 0) + (homeStats.defense_fumble_recoveries || 0);
      const homeGiveaways = (homeStats.passing_interceptions || 0) + (homeStats.offense_fumbles_lost || 0);
      const awayTakeaways = (awayStats.defense_interceptions || 0) + (awayStats.defense_fumble_recoveries || 0);
      const awayGiveaways = (awayStats.passing_interceptions || 0) + (awayStats.offense_fumbles_lost || 0);

      return {
        category: 'Turnover Analysis',
        home: {
          team: home.full_name || home.name,
          takeaways: fmtNum(homeTakeaways, 0),
          giveaways: fmtNum(homeGiveaways, 0),
          turnover_diff: fmtNum(homeTakeaways - homeGiveaways, 0)
        },
        away: {
          team: away.full_name || away.name,
          takeaways: fmtNum(awayTakeaways, 0),
          giveaways: fmtNum(awayGiveaways, 0),
          turnover_diff: fmtNum(awayTakeaways - awayGiveaways, 0)
        }
      };
    } catch (err) {
      console.error(`[Stat Router] TURNOVER_LUCK error: ${err.message}`);
      return { category: 'Turnover Analysis', error: 'Data unavailable' };
    }
  },


  // ===== NFL EARLY/LATE DOWN & EXPLOSIVENESS STATS =====

  EARLY_DOWN_SUCCESS: async (bdlSport, home, away, season) => {
    // Early downs (1st & 2nd down) success rate - BDL doesn't have this directly
    // Use Gemini Grounding to get actual early down success rate from PFR/FO
    console.log(`[Stat Router] Fetching EARLY_DOWN_SUCCESS for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Early Down Success', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:pro-football-reference.com OR site:footballoutsiders.com
        ${seasonStr} NFL early down success rate first down second down efficiency ${home.name} ${away.name}.
        For each team:
        1. First down success rate (% of 1st downs gaining 4+ yards)
        2. Second down success rate
        3. Early down EPA (if available)
        4. Yards per first down
        5. Negative play rate on early downs`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from Pro Football Reference or Football Outsiders. Provide exact early down success metrics for both teams.'
      });
      
      return {
        category: 'Early Down Success Rate',
        source: 'Pro-Football-Reference / Football Outsiders via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        comparison: `How do early down success rates compare between these teams?`,
        note: 'League average early down success rate is ~48%.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching EARLY_DOWN_SUCCESS:`, error.message);
      return { category: 'Early Down Success', error: 'Data unavailable' };
    }
  },

  LATE_DOWN_EFFICIENCY: async (bdlSport, home, away, season) => {
    // Late downs (3rd & 4th) - BDL has this!
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Late Down Efficiency (3rd & 4th Down)',
      home: {
        team: home.full_name || home.name,
        third_down_pct: fmtPct(homeStats?.misc_third_down_conv_pct / 100),
        fourth_down_pct: fmtPct(homeStats?.misc_fourth_down_conv_pct / 100),
        third_down_att: fmtNum(homeStats?.misc_third_down_conv_att, 0),
        third_down_made: fmtNum(homeStats?.misc_third_down_conv_made, 0),
        fourth_down_att: fmtNum(homeStats?.misc_fourth_down_conv_att, 0),
        fourth_down_made: fmtNum(homeStats?.misc_fourth_down_conv_made, 0)
      },
      away: {
        team: away.full_name || away.name,
        third_down_pct: fmtPct(awayStats?.misc_third_down_conv_pct / 100),
        fourth_down_pct: fmtPct(awayStats?.misc_fourth_down_conv_pct / 100),
        third_down_att: fmtNum(awayStats?.misc_third_down_conv_att, 0),
        third_down_made: fmtNum(awayStats?.misc_third_down_conv_made, 0),
        fourth_down_att: fmtNum(awayStats?.misc_fourth_down_conv_att, 0),
        fourth_down_made: fmtNum(awayStats?.misc_fourth_down_conv_made, 0)
      },
      comparison: `How do 3rd down conversion rates compare between these teams?`,
      note: 'League average 3rd down conversion is ~40%.'
    };
  },

  EXPLOSIVE_ALLOWED: async (bdlSport, home, away, season) => {
    // Defensive version - how many explosive plays does each team ALLOW?
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Explosive Plays Allowed (Defense)',
      home: {
        team: home.full_name || home.name,
        opp_longest_pass: fmtNum(homeStats?.opp_passing_long, 0),
        opp_longest_rush: fmtNum(homeStats?.opp_rushing_long, 0),
        opp_yards_per_catch: fmtNum(homeStats?.opp_receiving_yards_per_reception, 1),
        opp_yards_per_carry: fmtNum(homeStats?.opp_rushing_yards_per_rush_attempt, 1)
      },
      away: {
        team: away.full_name || away.name,
        opp_longest_pass: fmtNum(awayStats?.opp_passing_long, 0),
        opp_longest_rush: fmtNum(awayStats?.opp_rushing_long, 0),
        opp_yards_per_catch: fmtNum(awayStats?.opp_receiving_yards_per_reception, 1),
        opp_yards_per_carry: fmtNum(awayStats?.opp_rushing_yards_per_rush_attempt, 1)
      },
      comparison: `How do the explosive plays allowed compare between these defenses?`,
      note: 'Compare to EXPLOSIVE_PLAYS to see offensive vs defensive matchup.'
    };
  },

  FUMBLE_LUCK: async (bdlSport, home, away, season) => {
    // Fumble luck - fumbles forced vs fumbles lost (regression indicator)
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    // Fumble recovery rate is ~50% over time - deviations indicate luck
    const homeFumblesLost = homeStats?.offense_fumbles_lost || 0;
    const homeFumblesTotal = homeStats?.offense_fumbles || homeFumblesLost; // If no total, use lost
    const homeFumblesRecovered = homeFumblesTotal - homeFumblesLost;
    const homeRecoveryRate = homeFumblesTotal > 0 ? (homeFumblesRecovered / homeFumblesTotal) : 0.5;
    
    const awayFumblesLost = awayStats?.offense_fumbles_lost || 0;
    const awayFumblesTotal = awayStats?.offense_fumbles || awayFumblesLost;
    const awayFumblesRecovered = awayFumblesTotal - awayFumblesLost;
    const awayRecoveryRate = awayFumblesTotal > 0 ? (awayFumblesRecovered / awayFumblesTotal) : 0.5;
    
    // Defensive fumbles
    const homeDefForcedFumbles = homeStats?.defense_forced_fumbles || 0;
    const homeDefRecoveries = homeStats?.defense_fumble_recoveries || 0;
    const awayDefForcedFumbles = awayStats?.defense_forced_fumbles || 0;
    const awayDefRecoveries = awayStats?.defense_fumble_recoveries || 0;
    
    return {
      category: 'Fumble Luck Analysis',
      home: {
        team: home.full_name || home.name,
        off_fumbles_lost: fmtNum(homeFumblesLost, 0),
        off_fumbles_total: fmtNum(homeFumblesTotal, 0),
        off_recovery_rate: fmtPct(homeRecoveryRate),
        def_forced_fumbles: fmtNum(homeDefForcedFumbles, 0),
        def_recoveries: fmtNum(homeDefRecoveries, 0),
        luck_indicator: homeRecoveryRate > 0.55 ? 'LUCKY (may regress)' : homeRecoveryRate < 0.45 ? 'UNLUCKY (may improve)' : 'Average'
      },
      away: {
        team: away.full_name || away.name,
        off_fumbles_lost: fmtNum(awayFumblesLost, 0),
        off_fumbles_total: fmtNum(awayFumblesTotal, 0),
        off_recovery_rate: fmtPct(awayRecoveryRate),
        def_forced_fumbles: fmtNum(awayDefForcedFumbles, 0),
        def_recoveries: fmtNum(awayDefRecoveries, 0),
        luck_indicator: awayRecoveryRate > 0.55 ? 'LUCKY (may regress)' : awayRecoveryRate < 0.45 ? 'UNLUCKY (may improve)' : 'Average'
      },
      comparison: `How do the fumble recovery rates compare to the ~50% long-term baseline?`,
      note: 'Long-term fumble recovery rate baseline is ~50%.'
    };
  },

  PASSING_EPA: async (bdlSport, home, away, season) => {
    // Passing efficiency metrics from BDL
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    // Calculate passer rating components
    const homeYPA = homeStats?.passing_yards_per_pass_attempt || 0;
    const homeTDPct = homeStats?.passing_touchdowns && homeStats?.passing_attempts 
      ? (homeStats.passing_touchdowns / homeStats.passing_attempts * 100) : 0;
    const homeINTPct = homeStats?.passing_interceptions && homeStats?.passing_attempts
      ? (homeStats.passing_interceptions / homeStats.passing_attempts * 100) : 0;
    
    const awayYPA = awayStats?.passing_yards_per_pass_attempt || 0;
    const awayTDPct = awayStats?.passing_touchdowns && awayStats?.passing_attempts
      ? (awayStats.passing_touchdowns / awayStats.passing_attempts * 100) : 0;
    const awayINTPct = awayStats?.passing_interceptions && awayStats?.passing_attempts
      ? (awayStats.passing_interceptions / awayStats.passing_attempts * 100) : 0;
    
    return {
      category: 'Passing Efficiency',
      data_scope: 'Season passing stats (not per-play EPA)',
      home: {
        team: home.full_name || home.name,
        yards_per_attempt: fmtNum(homeYPA, 1),
        completion_pct: fmtPct(homeStats?.passing_completion_pct / 100),
        td_pct: fmtPct(homeTDPct / 100),
        int_pct: fmtPct(homeINTPct / 100),
        passing_yards_per_game: fmtNum(homeStats?.passing_yards_per_game, 0),
        passing_tds: fmtNum(homeStats?.passing_touchdowns, 0),
        interceptions: fmtNum(homeStats?.passing_interceptions, 0),
        sacks_allowed: fmtNum(homeStats?.passing_times_sacked, 0)
      },
      away: {
        team: away.full_name || away.name,
        yards_per_attempt: fmtNum(awayYPA, 1),
        completion_pct: fmtPct(awayStats?.passing_completion_pct / 100),
        td_pct: fmtPct(awayTDPct / 100),
        int_pct: fmtPct(awayINTPct / 100),
        passing_yards_per_game: fmtNum(awayStats?.passing_yards_per_game, 0),
        passing_tds: fmtNum(awayStats?.passing_touchdowns, 0),
        interceptions: fmtNum(awayStats?.passing_interceptions, 0),
        sacks_allowed: fmtNum(awayStats?.passing_times_sacked, 0)
      },
      comparison: `QBs' YPA comparison — league avg is ~7.0.`,
      note: 'Each QB\'s TD%/INT% comparison against the opposing pass defense is relevant.'
    };
  },

  RUSHING_EPA: async (bdlSport, home, away, season) => {
    // Rushing efficiency metrics from BDL
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Rushing Efficiency',
      data_scope: 'Season rushing stats (not per-play EPA)',
      home: {
        team: home.full_name || home.name,
        yards_per_carry: fmtNum(homeStats?.rushing_yards_per_rush_attempt, 1),
        rushing_yards_per_game: fmtNum(homeStats?.rushing_yards_per_game, 0),
        rushing_tds: fmtNum(homeStats?.rushing_touchdowns, 0),
        rush_attempts_per_game: fmtNum(homeStats?.rushing_attempts_per_game, 1),
        longest_rush: fmtNum(homeStats?.rushing_long, 0)
      },
      away: {
        team: away.full_name || away.name,
        yards_per_carry: fmtNum(awayStats?.rushing_yards_per_rush_attempt, 1),
        rushing_yards_per_game: fmtNum(awayStats?.rushing_yards_per_game, 0),
        rushing_tds: fmtNum(awayStats?.rushing_touchdowns, 0),
        rush_attempts_per_game: fmtNum(awayStats?.rushing_attempts_per_game, 1),
        longest_rush: fmtNum(awayStats?.rushing_long, 0)
      },
      comparison: `Teams' YPC comparison — league avg is ~4.3. Each rushing attack vs opposing run defense.`,
      note: 'High rush volume teams (25+ att/game) have a distinct identity that affects this matchup.'
    };
  },


  // ===== NFL MISSING STATS (Real Data via Gemini Grounding) =====

  // SOURCE: PFF (Pro Football Focus), Football Outsiders, ESPN
  OL_RANKINGS: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching OL_RANKINGS for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Offensive Line Rankings', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:nextgenstats.nfl.com OR site:pff.com OR site:footballoutsiders.com
        ${seasonStr} NFL offensive line rankings pass block win rate run blocking grades ${home.name} ${away.name}.
        For each team's offensive line:
        1. Pass block win rate (Next Gen Stats)
        2. Overall OL ranking/grade (PFF)
        3. Run blocking grade/efficiency
        4. Sacks allowed this season
        5. Adjusted Line Yards (Football Outsiders)`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from NFL Next Gen Stats for pass block win rate, and PFF/Football Outsiders for grades. Provide exact offensive line rankings and grades for both teams.'
      });
      
      return {
        category: 'Offensive Line Rankings',
        source: 'NFL Next Gen Stats / PFF / Football Outsiders via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        comparison: `OL rankings vs opposing DL — mismatches in pass protection or run blocking are relevant.`,
        note: 'Each OL\'s performance under pressure — sack rate and pressure rate allowed reveal the matchup.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching OL_RANKINGS:`, error.message);
      return { category: 'OL Rankings', error: 'Data unavailable' };
    }
  },


  // SOURCE: PFF, Football Outsiders, Pro Football Reference
  DL_RANKINGS: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching DL_RANKINGS for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Defensive Line Rankings', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:nextgenstats.nfl.com OR site:pff.com OR site:footballoutsiders.com
        ${seasonStr} NFL defensive line pass rush win rate pressure rate ${home.name} ${away.name}.
        For each team's defensive line:
        1. Pass rush win rate (Next Gen Stats)
        2. Overall DL ranking/grade (PFF)
        3. Pressure rate and sacks
        4. Run defense grade/Adjusted Line Yards allowed
        5. Key pass rushers and their individual win rates`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from NFL Next Gen Stats for pass rush win rate, and PFF/Football Outsiders for grades. Provide exact defensive line rankings and pass rush data for both teams.'
      });
      
      return {
        category: 'Defensive Line Rankings',
        source: 'NFL Next Gen Stats / PFF / Football Outsiders via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        comparison: `DL pressure rates vs opposing OL — sack rates reveal the trench matchup.`,
        note: 'Pass rush performance varies against quality OLs vs weak OLs. Pressure rate and sack rate are the metrics.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching DL_RANKINGS:`, error.message);
      return { category: 'DL Rankings', error: 'Data unavailable' };
    }
  },


  // SOURCE: Next Gen Stats (NFL.com), PFF, Pro Football Reference
  TIME_TO_THROW: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching TIME_TO_THROW for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Time to Throw', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:nfl.com/stats OR site:nextgenstats.nfl.com OR site:pro-football-reference.com
        ${seasonStr} NFL time to throw average QB release time ${home.name} ${away.name}.
        What is each QB's average time to throw?
        Include: average release time, % of quick throws (<2.5s), % of deep drops (>3s).
        Next Gen Stats data preferred.`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from NFL Next Gen Stats or Pro Football Reference. Provide exact time to throw data for both teams QBs.'
      });
      
      return {
        category: 'Time to Throw',
        source: 'NFL Next Gen Stats / Pro-Football-Reference via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        comparison: `How does each QB's release time interact with the opposing pass rush?`,
        note: 'League average time to throw is ~2.6 seconds.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching TIME_TO_THROW:`, error.message);
      return { category: 'Time to Throw', error: 'Data unavailable' };
    }
  },


  // SOURCE: Pro Football Reference, Football Outsiders
  GOAL_LINE: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching GOAL_LINE for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Goal Line', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:pro-football-reference.com OR site:footballoutsiders.com
        ${seasonStr} NFL red zone efficiency goal to go inside 5 yard line ${home.name} ${away.name}.
        For each team:
        1. Goal line TD conversion rate (inside 5/10)
        2. Red zone TD % (offense and defense)
        3. Short yardage conversion rate (3rd/4th and 1-2)
        4. Stuffed rate on goal line`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from Pro Football Reference or Football Outsiders. Provide exact goal line and short yardage efficiency for both teams.'
      });
      
      return {
        category: 'Goal Line Efficiency',
        source: 'Pro-Football-Reference / Football Outsiders via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        comparison: `How do goal line conversion rates compare between these teams?`,
        note: 'Goal line conversion data provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching GOAL_LINE:`, error.message);
      return { category: 'Goal Line', error: 'Data unavailable' };
    }
  },


  // SOURCE: Pro Football Reference, ESPN
  TWO_MINUTE_DRILL: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching TWO_MINUTE_DRILL for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Two Minute Drill', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:pro-football-reference.com OR site:espn.com
        ${seasonStr} NFL two minute drill efficiency end of half scoring ${home.name} ${away.name}.
        For each team:
        1. Points scored in final 2 minutes of halves
        2. Two minute drill scoring rate
        3. QB performance in hurry-up/no-huddle
        4. Game-winning drives this season`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from Pro Football Reference or ESPN. Provide exact two minute drill efficiency for both teams.'
      });
      
      return {
        category: 'Two Minute Drill',
        source: 'Pro-Football-Reference / ESPN via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        comparison: `How do these teams perform in end-of-half situations?`,
        note: 'Points scored in final 2 minutes often decide games.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching TWO_MINUTE_DRILL:`, error.message);
      return { category: 'Two Minute Drill', error: 'Data unavailable' };
    }
  },


  // SOURCE: Pro Football Reference, ESPN
  KICKING: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching KICKING for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Kicking', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:pro-football-reference.com OR site:espn.com
        ${seasonStr} NFL kicking stats field goal percentage by distance ${home.name} ${away.name}.
        For each team's kicker:
        1. FG percentage overall
        2. FG percentage 40-49 yards
        3. FG percentage 50+ yards
        4. Punting average and inside 20 %
        5. Kicker name and any recent misses`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from Pro Football Reference or ESPN. Provide exact kicking and punting stats for both teams.'
      });
      
      return {
        category: 'Kicking & Special Teams',
        source: 'Pro-Football-Reference / ESPN via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        comparison: `How do the kicking stats compare between these teams?`,
        note: 'Kicking stats provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching KICKING:`, error.message);
      return { category: 'Kicking', error: 'Data unavailable' };
    }
  },


  // SOURCE: Football Outsiders (DVOA), Pro Football Reference
  FIELD_POSITION: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching FIELD_POSITION for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Field Position', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:footballoutsiders.com OR site:pro-football-reference.com
        ${seasonStr} NFL average starting field position special teams ${home.name} ${away.name}.
        For each team:
        1. Average starting field position (offense)
        2. Average opponent starting field position (defense)
        3. Kickoff return average and TDs
        4. Punt return average
        5. Special Teams DVOA (if available)`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from Football Outsiders or Pro Football Reference. Provide exact field position and return game data for both teams.'
      });
      
      return {
        category: 'Field Position Battle',
        source: 'Football Outsiders / Pro-Football-Reference via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        comparison: `Average starting field position comparison — significant gaps affect scoring opportunity.`,
        note: 'Each team\'s field position correlates with their scoring opportunities.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching FIELD_POSITION:`, error.message);
      return { category: 'Field Position', error: 'Data unavailable' };
    }
  },


  // SOURCE: Pro Football Reference, ESPN
  PRIMETIME_RECORD: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching PRIMETIME_RECORD for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Primetime Record', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:pro-football-reference.com OR site:espn.com
        ${seasonStr} NFL primetime record Sunday Night Monday Night Thursday Night ${home.name} ${away.name}.
        For each team:
        1. Record in primetime games this season and last 3 years
        2. QB primetime record and stats
        3. Points per game in primetime vs regular games
        4. Any notable primetime wins/losses`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from Pro Football Reference or ESPN. Provide exact primetime game performance for both teams.'
      });
      
      return {
        category: 'Primetime Performance',
        source: 'Pro-Football-Reference / ESPN via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        comparison: `What are each team's primetime records and splits?`,
        note: 'Primetime games have different dynamics - more rest, national audience, different prep time.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching PRIMETIME_RECORD:`, error.message);
      return { category: 'Primetime Record', error: 'Data unavailable' };
    }
  },


  // SOURCE: Pro Football Reference, ESPN - 4th Down Decision Analytics
  FOURTH_DOWN_TENDENCY: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching FOURTH_DOWN_TENDENCY for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Fourth Down Tendency', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:nextgenstats.nfl.com OR site:pro-football-reference.com OR site:nfl.com/stats
        ${seasonStr} NFL fourth down decisions go-for-it rate conversion percentage ${home.name} ${away.name}.
        For each team's coach/offense:
        1. 4th down GO rate (how often they go for it vs punt/FG)
        2. 4th down conversion percentage when they go
        3. 4th down attempts inside opponent territory
        4. Aggressiveness rank compared to league average
        5. 4th down behavior when trailing vs leading`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from NFL Next Gen Stats, Pro Football Reference, or NFL.com. Provide exact 4th down decision rates and conversion percentages for both teams. Include coaching tendencies on aggressiveness.'
      });
      
      return {
        category: 'Fourth Down Tendency',
        source: 'NFL Next Gen Stats / Pro-Football-Reference via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        comparison: `How does each team's 4th down approach compare? What does the data show?`,
        CONTEXT_NOTE: `League average GO rate is ~20%. Compare each team's tendencies.`
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching FOURTH_DOWN_TENDENCY:`, error.message);
      return { category: 'Fourth Down Tendency', error: 'Data unavailable' };
    }
  },


  // SOURCE: ESPN, NFL.com - Upcoming Schedule Context for Trap/Sandwich Game Analysis
  SCHEDULE_CONTEXT: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching SCHEDULE_CONTEXT for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Schedule Context', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:espn.com OR site:nfl.com
        ${seasonStr} NFL schedule ${home.name} next 2 games upcoming opponents AND ${away.name} next 2 games upcoming opponents.
        For each team:
        1. What was their LAST game (opponent, result, was it a big game?)
        2. What is their NEXT game after this one (opponent, date, significance)
        3. Is the next game a divisional rivalry or marquee matchup?
        4. Any bye week coming up soon?
        5. Are they playing a much tougher or much weaker opponent next week?`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL schedule analyst. Use ESPN or NFL.com schedule data. Identify if either team has a TRAP GAME scenario (big game next week causing potential look-ahead) or SANDWICH SPOT (between two marquee matchups). Be specific about opponent names and dates.'
      });
      
      return {
        category: 'Schedule Context (Trap/Sandwich Analysis)',
        source: 'ESPN / NFL.com via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATION_PROMPTS: {
          trap_game: `Does either team play a bigger game next week?`,
          sandwich_spot: `Is this game between two marquee matchups for either team?`,
          letdown_spot: `Did either team just win a big emotional game last week?`
        },
        CONTEXT_NOTE: `Trap games are NOT automatic fades - investigate if RECENT_FORM shows the team actually plays down in these spots.`,
        AWARENESS: `Schedule context is a SOFT factor. Use it to investigate, not prescribe.`
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching SCHEDULE_CONTEXT:`, error.message);
      return { category: 'Schedule Context', error: 'Data unavailable' };
    }
  },

  DIVISION_RECORD: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching DIVISION_RECORD for ${away.name} @ ${home.name}`);
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const homeSt = standings?.find(s => s.team?.id === home.id);
      const awaySt = standings?.find(s => s.team?.id === away.id);
      
      const sameDivision = homeSt?.team?.division === awaySt?.team?.division;
      
      return {
        category: 'Division Record',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          division: homeSt?.team?.division || 'N/A',
          division_record: homeSt?.division_record || 'N/A',
          conference_record: homeSt?.conference_record || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          division: awaySt?.team?.division || 'N/A',
          division_record: awaySt?.division_record || 'N/A',
          conference_record: awaySt?.conference_record || 'N/A'
        },
        is_division_game: sameDivision,
        comparison: sameDivision
          ? `Division game. How have these teams performed against each other?`
          : `Non-division game. How do division records compare?`,
        note: 'Division and overall records provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching DIVISION_RECORD:`, error.message);
      return { category: 'Division Record', error: 'Data unavailable' };
    }
  },

  
  // ===== DERIVED STATS (single-value for clean display) =====
  PASSING_TDS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Passing Touchdowns',
      home: {
        team: home.full_name || home.name,
        passing_tds: fmtNum(homeStats?.passing_touchdowns, 0)
      },
      away: {
        team: away.full_name || away.name,
        passing_tds: fmtNum(awayStats?.passing_touchdowns, 0)
      }
    };
  },

  INTERCEPTIONS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Interceptions Thrown',
      home: {
        team: home.full_name || home.name,
        interceptions: fmtNum(homeStats?.passing_interceptions, 0)
      },
      away: {
        team: away.full_name || away.name,
        interceptions: fmtNum(awayStats?.passing_interceptions, 0)
      }
    };
  },

  RUSHING_TDS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Rushing Touchdowns',
      home: {
        team: home.full_name || home.name,
        rushing_tds: fmtNum(homeStats?.rushing_touchdowns, 0)
      },
      away: {
        team: away.full_name || away.name,
        rushing_tds: fmtNum(awayStats?.rushing_touchdowns, 0)
      }
    };
  },

  TOTAL_TDS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    const homeTotalTds = (homeStats?.passing_touchdowns || 0) + (homeStats?.rushing_touchdowns || 0);
    const awayTotalTds = (awayStats?.passing_touchdowns || 0) + (awayStats?.rushing_touchdowns || 0);
    
    return {
      category: 'Total Touchdowns',
      home: {
        team: home.full_name || home.name,
        total_tds: homeTotalTds.toString()
      },
      away: {
        team: away.full_name || away.name,
        total_tds: awayTotalTds.toString()
      }
    };
  },

  PASSING_YPG: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Passing Yards Per Game',
      home: {
        team: home.full_name || home.name,
        passing_ypg: fmtNum(homeStats?.passing_yards_per_game)
      },
      away: {
        team: away.full_name || away.name,
        passing_ypg: fmtNum(awayStats?.passing_yards_per_game)
      }
    };
  },


  // ===== WEATHER (NFL/NCAAF) - Returns weather data for Gary to evaluate =====
  WEATHER: async (bdlSport, home, away, season, options = {}) => {
    const homeName = home.full_name || home.name;
    const awayName = away.full_name || away.name;
    
    // Only applicable for football
    if (bdlSport !== 'americanfootball_nfl' && bdlSport !== 'americanfootball_ncaaf') {
      return {
        category: 'Weather',
        note: 'Weather data is primarily relevant for outdoor football games.',
        home: { team: homeName },
        away: { team: awayName }
      };
    }

    const sport = bdlSport === 'americanfootball_ncaaf' ? 'NCAAF' : 'NFL';
    console.log(`[Stat Router] WEATHER check for ${awayName} @ ${homeName} (${sport})`);

    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const weather = await getGroundedWeather(homeName, awayName, dateStr);

      if (!weather) {
        console.log(`[Stat Router] WEATHER: No data available`);
        return {
          category: 'Weather',
          note: 'Weather data unavailable for this game.',
          home: { team: homeName },
          away: { team: awayName }
        };
      }

      // Dome games
      if (weather.is_dome) {
        return {
          category: 'Weather',
          conditions: 'Indoor/Dome Stadium',
          note: 'Indoor stadium - controlled environment.',
          home: { team: homeName },
          away: { team: awayName }
        };
      }

      const temp = weather.temperature;
      const wind = weather.wind_speed;
      const conditions = (weather.conditions || 'Clear').toLowerCase();

      // Flag notably cold or windy conditions for context
      const notableConditions = [];
      if (temp && temp < 25) notableConditions.push(`Cold: ${temp}°F`);
      if (wind && wind >= 15) notableConditions.push(`Wind: ${wind} mph`);
      if (conditions.includes('snow') || conditions.includes('rain') || conditions.includes('storm')) {
        notableConditions.push(`Precipitation: ${weather.conditions}`);
      }

      console.log(`[Stat Router] WEATHER: ${temp}°F, ${wind || 'light'} mph wind, ${conditions}`);

      // Determine forecast certainty based on conditions
      // Rain/snow forecasts are less reliable than temperature/wind
      const isPrecipitationForecast = conditions.includes('rain') || conditions.includes('snow') || conditions.includes('storm');
      const forecastNote = isPrecipitationForecast 
        ? 'FORECAST UNCERTAINTY: Precipitation forecasts can change. If your analysis relies heavily on rain/snow, acknowledge this uncertainty - conditions may differ at game time.'
        : 'Current forecast for game time. Temperature and wind forecasts are generally more reliable than precipitation.';

      // Return weather data for Gary to evaluate
      return {
        category: 'Weather',
        temperature: temp ? `${temp}°F` : 'N/A',
        wind_speed: wind ? `${wind} mph` : 'Light',
        conditions: weather.conditions || 'Clear',
        notable_conditions: notableConditions.length > 0 ? notableConditions : null,
        forecast_reliability: isPrecipitationForecast ? 'UNCERTAIN' : 'MODERATE',
        note: forecastNote,
        home: { team: homeName },
        away: { team: awayName }
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching weather:`, error.message);
      return {
        category: 'Weather',
        note: 'Weather data unavailable.',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== QB WEATHER HISTORY (NFL only - uses Gemini Grounding) =====
  QB_WEATHER_HISTORY: async (bdlSport, home, away, season, options = {}) => {
    // Only applicable for NFL
    if (bdlSport !== 'americanfootball_nfl') {
      return {
        category: 'QB Weather History',
        note: 'Only available for NFL games',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }

    console.log(`[Stat Router] Fetching QB_WEATHER_HISTORY for ${away.name} @ ${home.name}`);

    try {
      // First, get weather for the game via Gemini Grounding
      const dateStr = new Date().toISOString().slice(0, 10);
      const weather = await getGroundedWeather(
        home.full_name || home.name,
        away.full_name || away.name,
        dateStr
      );

      if (!weather || weather.isDome) {
        return {
          category: 'QB Weather History',
          note: weather?.isDome ? 'Indoor/dome stadium - weather not a factor' : 'Weather data unavailable',
          home: { team: home.full_name || home.name },
          away: { team: away.full_name || away.name },
          weather_conditions: weather?.isDome ? 'Indoor' : 'Unknown'
        };
      }

      // Check if weather is adverse enough to matter
      const temp = weather.temperature;
      const windStr = weather.wind || '';
      const windSpeed = parseInt((windStr.match(/(\d+)/) || [])[1]) || 0;
      const conditions = (weather.conditions || '').toLowerCase();
      const isAdverse = (temp && temp < 40) || 
                        (windSpeed > 15) || 
                        conditions.includes('snow') || 
                        conditions.includes('rain');

      if (!isAdverse) {
        return {
          category: 'QB Weather History',
          note: 'Weather conditions are normal - no significant impact expected',
          home: { team: home.full_name || home.name },
          away: { team: away.full_name || away.name },
          weather_conditions: `${temp}°F, ${windStr}, ${weather.conditions}`,
          impact: 'minimal'
        };
      }

      // Use Gemini Grounding for QB weather performance history
      const qbQuery = `NFL QB weather performance history for ${away.full_name || away.name} @ ${home.full_name || home.name}:

Weather conditions: ${temp}°F, ${windStr}, ${conditions}

For each team's starting QB:
1. Name of current starting QB
2. Career games in similar conditions (cold/snow/rain/wind)
3. Career record in adverse weather
4. Completion percentage in cold/adverse weather
5. Assessment: Does this QB perform better or worse in bad weather?

Be factual with historical stats where available.`;

      const qbResult = await geminiGroundingSearch(qbQuery, { temperature: 1.0, maxTokens: 1500 });

      return {
        category: 'QB Cold/Adverse Weather History',
        weather_conditions: `${temp}°F, ${windStr}, ${weather.conditions}`,
        home: {
          team: home.full_name || home.name,
          analysis: qbResult?.success ? qbResult.data : 'Weather analysis unavailable'
        },
        away: {
          team: away.full_name || away.name,
          analysis: qbResult?.success ? qbResult.data : 'Weather analysis unavailable'
        },
        note: 'Historical QB performance in similar weather conditions via Gemini Grounding'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching QB weather history:`, error.message);
      return {
        category: 'QB Weather History',
        error: error.message,
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        note: 'Unable to fetch QB weather performance data'
      };
    }
  }

};
