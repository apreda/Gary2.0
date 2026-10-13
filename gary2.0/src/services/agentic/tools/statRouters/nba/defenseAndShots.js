/** NBA stat tools: What each team allows and where its points come from: opponent rates, paint, midrange, transition, lineups. (split from nbaFetchers.js, Oct 13 2026). */
import { getCurrentSeasonString, fetchNBATeamAdvancedStats, fetchNBATeamBaseStats, fetchNBATeamOpponentStats, fetchNBATeamDefenseStats, groundedWebSearch, isPostseasonOptions } from '../statRouterCommon.js';
import { ballDontLieService } from '../../../../ballDontLieService.js';

export const defenseAndShotsFetchers = {


  // ===== DEFENSIVE REBOUNDING (REAL DATA — DREB% from advanced + opponent OREB context) =====
  DREB_RATE: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching DREB_RATE for ${away.name} @ ${home.name}`);

    if (bdlSport !== 'basketball_nba') {
      // NCAAB: Use team_season_stats which has dreb per game
      try {
        const [homeStats, awayStats] = await Promise.all([
          ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: isPostseasonOptions(options) }),
          ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: isPostseasonOptions(options) })
        ]);
        const hs = Array.isArray(homeStats) ? homeStats[0] : homeStats;
        const as = Array.isArray(awayStats) ? awayStats[0] : awayStats;
        return {
          category: 'Defensive Rebounding',
          source: 'Ball Don\'t Lie API (Team Season Stats)',
          home: { team: home.full_name || home.name, dreb_per_game: hs?.dreb ? hs.dreb.toFixed(1) : 'N/A', oreb_per_game: hs?.oreb ? hs.oreb.toFixed(1) : 'N/A', reb_per_game: hs?.reb ? hs.reb.toFixed(1) : 'N/A' },
          away: { team: away.full_name || away.name, dreb_per_game: as?.dreb ? as.dreb.toFixed(1) : 'N/A', oreb_per_game: as?.oreb ? as.oreb.toFixed(1) : 'N/A', reb_per_game: as?.reb ? as.reb.toFixed(1) : 'N/A' }
        };
      } catch (e) {
        return { category: 'Defensive Rebounding', home: { team: home.full_name || home.name }, away: { team: away.full_name || away.name }, note: 'Data unavailable' };
      }
    }

    try {
      const [homeAdvanced, awayAdvanced, homeOpp, awayOpp, homeBase, awayBase] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamAdvancedStats(away.id, season, isPostseasonOptions(options)),
        fetchNBATeamOpponentStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamOpponentStats(away.id, season, isPostseasonOptions(options)),
        fetchNBATeamBaseStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamBaseStats(away.id, season, isPostseasonOptions(options))
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


  // ===== THREE POINT DEFENSE (REAL DATA — opponent 3PT% + volume from BDL) =====
  THREE_PT_DEFENSE: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching THREE_PT_DEFENSE for ${away.name} @ ${home.name}`);
    const [homeOpp, awayOpp] = await Promise.all([
      fetchNBATeamOpponentStats(home.id, season, isPostseasonOptions(options)),
      fetchNBATeamOpponentStats(away.id, season, isPostseasonOptions(options))
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
  OPP_FT_RATE: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching OPP_FT_RATE for ${away.name} @ ${home.name}`);

    try {
      const [homeOpp, awayOpp] = await Promise.all([
        fetchNBATeamOpponentStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamOpponentStats(away.id, season, isPostseasonOptions(options))
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
  OPP_EFG_PCT: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching OPP_EFG_PCT for ${away.name} @ ${home.name}`);
    const [homeOpp, awayOpp] = await Promise.all([
      fetchNBATeamOpponentStats(home.id, season, isPostseasonOptions(options)),
      fetchNBATeamOpponentStats(away.id, season, isPostseasonOptions(options))
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
  OPP_TOV_RATE: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching OPP_TOV_RATE for ${away.name} @ ${home.name}`);
    const [homeOpp, awayOpp] = await Promise.all([
      fetchNBATeamOpponentStats(home.id, season, isPostseasonOptions(options)),
      fetchNBATeamOpponentStats(away.id, season, isPostseasonOptions(options))
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
  PACE_LAST_10: async (bdlSport, home, away, season, options) => {
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
        fetchNBATeamAdvancedStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamAdvancedStats(away.id, season, isPostseasonOptions(options))
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
  PACE_HOME_AWAY: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching PACE_HOME_AWAY for ${away.name} @ ${home.name}`);

    if (bdlSport !== 'basketball_nba') {
      return { category: 'Pace Splits', note: 'Only available for NBA' };
    }

    try {
      const seasonStart = new Date(season, 9, 1); // BDL season=2025 means 2025-26
      const today = new Date();

      const [homeGames, awayGames, homeAdvanced, awayAdvanced] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 100
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 100
        }),
        fetchNBATeamAdvancedStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamAdvancedStats(away.id, season, isPostseasonOptions(options))
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
  PAINT_SCORING: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching PAINT_SCORING (real zone data) for ${away.name} @ ${home.name}`);
    const [homeAdvanced, awayAdvanced] = await Promise.all([
      fetchNBATeamAdvancedStats(home.id, season, isPostseasonOptions(options)),
      fetchNBATeamAdvancedStats(away.id, season, isPostseasonOptions(options))
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
  MIDRANGE: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching MIDRANGE (real zone data) for ${away.name} @ ${home.name}`);

    try {
      const [homeAdvanced, awayAdvanced] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamAdvancedStats(away.id, season, isPostseasonOptions(options))
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
  PAINT_DEFENSE: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching PAINT_DEFENSE for ${away.name} @ ${home.name}`);
    const [homeAdvanced, awayAdvanced, homeBase, awayBase, homeDefense, awayDefense] = await Promise.all([
      fetchNBATeamAdvancedStats(home.id, season, isPostseasonOptions(options)),
      fetchNBATeamAdvancedStats(away.id, season, isPostseasonOptions(options)),
      fetchNBATeamBaseStats(home.id, season, isPostseasonOptions(options)),
      fetchNBATeamBaseStats(away.id, season, isPostseasonOptions(options)),
      fetchNBATeamDefenseStats(home.id, season, isPostseasonOptions(options)),
      fetchNBATeamDefenseStats(away.id, season, isPostseasonOptions(options))
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
  TRANSITION_DEFENSE: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching TRANSITION_DEFENSE for ${away.name} @ ${home.name}`);

    if (bdlSport === 'basketball_nba') {
      const [homeDefense, awayDefense, homeAdvanced, awayAdvanced] = await Promise.all([
        fetchNBATeamDefenseStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamDefenseStats(away.id, season, isPostseasonOptions(options)),
        fetchNBATeamAdvancedStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamAdvancedStats(away.id, season, isPostseasonOptions(options))
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
  LINEUP_NET_RATINGS: async (bdlSport, home, away, season, options) => {
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
      
      const groundingResult = await groundedWebSearch(query, {
        systemMessage: 'You are an NBA lineup analyst. Provide lineup net ratings for starters, bench, and key 5-man combinations for both teams.'
      });
      
      return {
        category: 'Lineup Net Ratings (First & Second Unit)',
        source: 'grounded search (Live Search)',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        // Jul 8 2026 fix: groundedWebSearch returns {success, data, raw} —
        // the old .content read always fell through to 'Data unavailable'.
        grounding_data: groundingResult?.data || 'Data unavailable',
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
};
