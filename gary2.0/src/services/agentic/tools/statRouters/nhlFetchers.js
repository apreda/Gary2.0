import { getCurrentSeasonString, sportToBdlKey, normalizeSportName, findTeam, fmtNum, fmtPct, fetchBothTeamSeasonStats, fetchNBATeamScoringStats, fetchNBATeamAdvancedStats, fetchNBALeaders, fetchNBATeamBaseStats, fetchNBATeamOpponentStats, fetchNBATeamDefenseStats, fetchTopPlayersForTeam, formatRecentGames, buildPaceAnalysis, interpretTurnoverMargin, BDL_API_KEY, _nbaBaseStatsCache, _nbaAdvancedStatsCache, _nbaOpponentStatsCache, _nbaDefenseStatsCache, _nbaTeamScoringStatsCache, geminiGroundingSearch } from './statRouterCommon.js';
import { ballDontLieService } from '../../../ballDontLieService.js';
import { getTeamStats as getMoneyPuckTeamStats, getGoalieStats as getMoneyPuckGoalieStats } from '../../../moneyPuckService.js';
import { getTeamPercentages as getNhlApiPercentages } from '../../../nhlStatsApiService.js';

export const nhlFetchers = {

  // ===== NHL SPECIFIC FETCHERS (BETA) =====
  
  POWER_PLAY_PCT: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Power Play Percentage',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        power_play_pct: homeRates?.ppPct ? fmtPct(homeRates.ppPct) : 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        power_play_pct: awayRates?.ppPct ? fmtPct(awayRates.ppPct) : 'N/A'
      },
      note: 'League average PP% is ~20%.'
    };
  },

  PENALTY_KILL_PCT: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Penalty Kill Percentage',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        penalty_kill_pct: homeRates?.pkPct ? fmtPct(homeRates.pkPct) : 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        penalty_kill_pct: awayRates?.pkPct ? fmtPct(awayRates.pkPct) : 'N/A'
      },
      note: 'League average PK% is ~80%.'
    };
  },

  SPECIAL_TEAMS: async (bdlSport, home, away, season) => {
    // NFL branch: BDL NFL doesn't expose kicking/punting stats, return data_scope note
    if (bdlSport === 'americanfootball_nfl' || bdlSport === 'americanfootball_ncaaf') {
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
        ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
      ]);
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;

      return {
        category: 'Special Teams (Football)',
        data_scope: 'BDL does not expose kicking/punting/return stats for NFL/NCAAF — use Gemini Grounding for special teams data',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          note: 'Kicking/punting data unavailable from BDL'
        },
        away: {
          team: away.full_name || away.name,
          note: 'Kicking/punting data unavailable from BDL'
        }
      };
    }

    // NHL branch: use deriveNhlTeamRates for PP% and PK%
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);

    return {
      category: 'Special Teams (PP% + PK%)',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        power_play_pct: homeRates?.ppPct ? fmtPct(homeRates.ppPct) : 'N/A',
        penalty_kill_pct: homeRates?.pkPct ? fmtPct(homeRates.pkPct) : 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        power_play_pct: awayRates?.ppPct ? fmtPct(awayRates.ppPct) : 'N/A',
        penalty_kill_pct: awayRates?.pkPct ? fmtPct(awayRates.pkPct) : 'N/A'
      },
      interpretation: `Compare ${home.name} PP% vs ${away.name} PK% and vice versa for scoring edges`
    };
  },

  GOALS_FOR: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Goals For Per Game',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        goals_for_per_game: fmtNum(homeRates?.goalsForPerGame)
      },
      away: {
        team: away.full_name || away.name,
        goals_for_per_game: fmtNum(awayRates?.goalsForPerGame)
      }
    };
  },

  GOALS_AGAINST: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Goals Against Per Game',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        goals_against_per_game: fmtNum(homeRates?.goalsAgainstPerGame)
      },
      away: {
        team: away.full_name || away.name,
        goals_against_per_game: fmtNum(awayRates?.goalsAgainstPerGame)
      },
      note: 'Lower is better for defense'
    };
  },

  SHOTS_FOR: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Shots For Per Game (Possession Proxy)',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        shots_for_per_game: fmtNum(homeRates?.shotsForPerGame)
      },
      away: {
        team: away.full_name || away.name,
        shots_for_per_game: fmtNum(awayRates?.shotsForPerGame)
      },
      note: 'Shot volume data provided for comparison.'
    };
  },

  SHOTS_AGAINST: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Shots Against Per Game',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        shots_against_per_game: fmtNum(homeRates?.shotsAgainstPerGame)
      },
      away: {
        team: away.full_name || away.name,
        shots_against_per_game: fmtNum(awayRates?.shotsAgainstPerGame)
      },
      note: 'Goals against average provided for comparison.'
    };
  },

  SHOT_DIFFERENTIAL: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    const homeDiff = (homeRates?.shotsForPerGame || 0) - (homeRates?.shotsAgainstPerGame || 0);
    const awayDiff = (awayRates?.shotsForPerGame || 0) - (awayRates?.shotsAgainstPerGame || 0);
    
    return {
      category: 'Shot Differential (Corsi Proxy)',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        shots_for: fmtNum(homeRates?.shotsForPerGame),
        shots_against: fmtNum(homeRates?.shotsAgainstPerGame),
        differential: fmtNum(homeDiff, 1)
      },
      away: {
        team: away.full_name || away.name,
        shots_for: fmtNum(awayRates?.shotsForPerGame),
        shots_against: fmtNum(awayRates?.shotsAgainstPerGame),
        differential: fmtNum(awayDiff, 1)
      },
      interpretation: homeDiff > awayDiff 
        ? `${home.name} controls possession better (+${fmtNum(homeDiff - awayDiff, 1)} shots/game)`
        : `${away.name} controls possession better (+${fmtNum(awayDiff - homeDiff, 1)} shots/game)`
    };
  },

  FACEOFF_PCT: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Faceoff Win Percentage',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        faceoff_pct: homeRates?.faceoffWinPct ? fmtPct(homeRates.faceoffWinPct) : 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        faceoff_pct: awayRates?.faceoffWinPct ? fmtPct(awayRates.faceoffWinPct) : 'N/A'
      },
      note: 'Faceoff wins correlate with puck possession and zone time'
    };
  },

  GOALIE_STATS: async (bdlSport, home, away, season) => {
    // For NHL, try to get goalie stats from player leaders
    try {
      const leaders = await ballDontLieService.getLeadersGeneric(bdlSport, { season, type: 'save_pct' });
      
      // Find goalies for each team
      const homeGoalies = (leaders || []).filter(l => 
        l.player?.team?.id === home.id || l.team?.id === home.id
      );
      const awayGoalies = (leaders || []).filter(l => 
        l.player?.team?.id === away.id || l.team?.id === away.id
      );
      
      return {
        category: 'Goaltending Stats',
        data_scope: 'Save percentage only (GAA not available from BDL player leaders endpoint)',
        source: 'Ball Don\'t Lie API (Player Leaders)',
        home: {
          team: home.full_name || home.name,
          goalies: homeGoalies.length > 0
            ? homeGoalies.slice(0, 2).map(g => ({
                name: g.player?.full_name || `${g.player?.first_name} ${g.player?.last_name}`,
                save_pct: g.value ? fmtPct(g.value) : 'N/A'
              }))
            : [{ note: 'Goalie data unavailable - check scout report' }]
        },
        away: {
          team: away.full_name || away.name,
          goalies: awayGoalies.length > 0
            ? awayGoalies.slice(0, 2).map(g => ({
                name: g.player?.full_name || `${g.player?.first_name} ${g.player?.last_name}`,
                save_pct: g.value ? fmtPct(g.value) : 'N/A'
              }))
            : [{ note: 'Goalie data unavailable - check scout report' }]
        },
        note: 'Compare both goalies\' SV% — league avg is ~.910. Is there a significant gap between the starters?'
      };
    } catch (e) {
      return {
        category: 'Goaltending Stats',
        error: 'Goalie data unavailable',
        home: { team: home.full_name || home.name, note: 'Check scout report for goalie info' },
        away: { team: away.full_name || away.name, note: 'Check scout report for goalie info' }
      };
    }
  },

  GOAL_DIFFERENTIAL: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    const homeDiff = (homeRates?.goalsForPerGame || 0) - (homeRates?.goalsAgainstPerGame || 0);
    const awayDiff = (awayRates?.goalsForPerGame || 0) - (awayRates?.goalsAgainstPerGame || 0);
    
    return {
      category: 'Goal Differential',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        goals_for: fmtNum(homeRates?.goalsForPerGame),
        goals_against: fmtNum(homeRates?.goalsAgainstPerGame),
        differential: fmtNum(homeDiff, 2)
      },
      away: {
        team: away.full_name || away.name,
        goals_for: fmtNum(awayRates?.goalsForPerGame),
        goals_against: fmtNum(awayRates?.goalsAgainstPerGame),
        differential: fmtNum(awayDiff, 2)
      },
      interpretation: homeDiff > awayDiff 
        ? `${home.name} has stronger goal differential (+${fmtNum(homeDiff - awayDiff, 2)}/game)`
        : `${away.name} has stronger goal differential (+${fmtNum(awayDiff - homeDiff, 2)}/game)`
    };
  },


  // ===== NHL ENHANCED FETCHERS =====
  
  // NHL Standings with home/road records, streak, and playoff position
  NHL_STANDINGS: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'icehockey_nhl') return null;
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const findTeam = (teamId) => standings.find(s => s.team?.id === teamId);
      const homeStanding = findTeam(home.id);
      const awayStanding = findTeam(away.id);
      
      const formatStanding = (standing, team) => {
        if (!standing) return { team: team.full_name || team.name, error: 'Standings data unavailable' };
        return {
          team: team.full_name || team.name,
          record: `${standing.wins}-${standing.losses}-${standing.ot_losses || 0}`,
          points: standing.points || 0,
          points_pct: standing.points_pctg ? fmtPct(standing.points_pctg) : 'N/A',
          home_record: standing.home_record || 'N/A',
          road_record: standing.road_record || 'N/A',
          streak: standing.streak || 'N/A',
          goal_differential: standing.goal_differential || 0,
          division: standing.division_name || 'N/A',
          conference: standing.conference_name || 'N/A'
        };
      };
      
      return {
        category: 'NHL Standings & Records',
        source: 'Ball Don\'t Lie API',
        home: formatStanding(homeStanding, home),
        away: formatStanding(awayStanding, away),
        note: 'Home/road records and streaks are critical for NHL betting'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_STANDINGS:`, error.message);
      return { category: 'NHL Standings', error: 'Data unavailable' };
    }
  },

  
  // NHL Home/Away Splits from standings
  NHL_HOME_AWAY_SPLITS: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'icehockey_nhl') return null;
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const findTeam = (teamId) => standings.find(s => s.team?.id === teamId);
      const homeStanding = findTeam(home.id);
      const awayStanding = findTeam(away.id);
      
      // Parse record strings like "27-13-1"
      const parseRecord = (recordStr) => {
        if (!recordStr || recordStr === 'N/A') return { wins: 0, losses: 0, otl: 0 };
        const parts = recordStr.split('-').map(n => parseInt(n) || 0);
        return { wins: parts[0] || 0, losses: parts[1] || 0, otl: parts[2] || 0 };
      };
      
      const homeTeamHome = parseRecord(homeStanding?.home_record);
      const homeTeamRoad = parseRecord(homeStanding?.road_record);
      const awayTeamHome = parseRecord(awayStanding?.home_record);
      const awayTeamRoad = parseRecord(awayStanding?.road_record);
      
      // Key insight: home team's HOME record vs away team's ROAD record
      const homeAdvantage = homeTeamHome.wins - homeTeamHome.losses;
      const awayRoadStruggle = awayTeamRoad.wins - awayTeamRoad.losses;
      
      let interpretation = '';
      if (homeAdvantage > 5 && awayRoadStruggle < 0) {
        interpretation = `STRONG HOME EDGE: ${home.name} is ${homeStanding?.home_record} at home vs ${away.name}'s ${awayStanding?.road_record} on road`;
      } else if (awayRoadStruggle > 5) {
        interpretation = `ROAD WARRIOR: ${away.name} is ${awayStanding?.road_record} on the road - home ice less impactful`;
      } else {
        interpretation = `Standard splits - evaluate other factors`;
      }
      
      return {
        category: 'Home/Away Splits',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          home_record: homeStanding?.home_record || 'N/A',
          road_record: homeStanding?.road_record || 'N/A',
          note: 'Playing at HOME tonight'
        },
        away: {
          team: away.full_name || away.name,
          home_record: awayStanding?.home_record || 'N/A',
          road_record: awayStanding?.road_record || 'N/A',
          note: 'Playing on ROAD tonight'
        },
        interpretation,
        note: 'NHL home teams have last change advantage - investigate how each team performs home vs road'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_HOME_AWAY_SPLITS:`, error.message);
      return { category: 'Home/Away Splits', error: 'Data unavailable' };
    }
  },

  
  // NHL Recent Form with L5/L10 analysis including opponent quality
  NHL_RECENT_FORM: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'icehockey_nhl') return null;
    
    try {
      // Get last 45 days of games for both teams
      const today = new Date();
      const dates = [];
      for (let i = 0; i < 45; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
      }
      
      // Get standings for opponent quality context
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      const standingsMap = {};
      (standings || []).forEach(s => {
        if (s.team?.id) standingsMap[s.team.id] = s;
      });
      
      // Fetch games for both teams
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 100 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 100 })
      ]);
      
      const analyzeRecentForm = (games, teamId, teamName) => {
        if (!games || games.length === 0) return { team: teamName, error: 'No recent games found' };
        
        // Sort by date descending and filter completed games
        const completedGames = games
          .filter(g => g.game_state === 'OFF' || g.game_state === 'FINAL' || g.status === 'Final')
          .sort((a, b) => new Date(b.game_date || b.date) - new Date(a.game_date || a.date));
        
        const l5Games = completedGames.slice(0, 5);
        const l10Games = completedGames.slice(0, 10);
        
        const analyzeGames = (gameList) => {
          let wins = 0, losses = 0, otLosses = 0;
          let goalsFor = 0, goalsAgainst = 0;
          const gameDetails = [];
          
          gameList.forEach(g => {
            const isHome = g.home_team?.id === teamId;
            const teamScore = isHome ? g.home_score : g.away_score;
            const oppScore = isHome ? g.away_score : g.home_score;
            const oppTeam = isHome ? g.away_team : g.home_team;
            const oppStanding = standingsMap[oppTeam?.id];
            
            goalsFor += teamScore || 0;
            goalsAgainst += oppScore || 0;
            
            const margin = (teamScore || 0) - (oppScore || 0);
            let result = 'W';
            if (margin > 0) wins++;
            else if (margin < 0) {
              // Check if OT loss (need to infer from game data)
              losses++;
              result = 'L';
            }
            
            gameDetails.push({
              opponent: oppTeam?.full_name || oppTeam?.name || 'Unknown',
              result: `${result} ${teamScore}-${oppScore}`,
              margin,
              opponent_record: oppStanding ? `${oppStanding.wins}-${oppStanding.losses}-${oppStanding.ot_losses || 0}` : 'N/A',
              opponent_points: oppStanding?.points || 'N/A',
              home_away: isHome ? 'H' : 'A'
            });
          });
          
          const record = `${wins}-${losses}${otLosses > 0 ? `-${otLosses}` : ''}`;
          const avgGF = gameList.length > 0 ? (goalsFor / gameList.length).toFixed(1) : '0';
          const avgGA = gameList.length > 0 ? (goalsAgainst / gameList.length).toFixed(1) : '0';
          
          // Calculate opponent quality
          const avgOppPoints = gameDetails.reduce((sum, g) => sum + (g.opponent_points || 0), 0) / gameDetails.length;
          let scheduleStrength = 'AVERAGE';
          if (avgOppPoints > 90) scheduleStrength = 'TOUGH';
          else if (avgOppPoints < 70) scheduleStrength = 'SOFT';
          
          return { record, wins, losses, avgGF, avgGA, scheduleStrength, games: gameDetails };
        };
        
        const l5Analysis = analyzeGames(l5Games);
        const l10Analysis = analyzeGames(l10Games);
        
        // Trend analysis
        let trend = 'STABLE';
        if (l5Analysis.wins >= 4) trend = 'HOT';
        else if (l5Analysis.losses >= 4) trend = 'COLD';
        else if (l5Analysis.wins > l10Analysis.wins / 2) trend = 'IMPROVING';
        else if (l5Analysis.losses > l10Analysis.losses / 2) trend = 'DECLINING';
        
        return {
          team: teamName,
          l5: {
            record: l5Analysis.record,
            avg_goals_for: l5Analysis.avgGF,
            avg_goals_against: l5Analysis.avgGA,
            schedule_strength: l5Analysis.scheduleStrength,
            recent_games: l5Analysis.games.slice(0, 5)
          },
          l10: {
            record: l10Analysis.record,
            avg_goals_for: l10Analysis.avgGF,
            avg_goals_against: l10Analysis.avgGA,
            schedule_strength: l10Analysis.scheduleStrength
          },
          trend
        };
      };
      
      const homeForm = analyzeRecentForm(homeGames, home.id, home.full_name || home.name);
      const awayForm = analyzeRecentForm(awayGames, away.id, away.full_name || away.name);
      
      return {
        category: 'Recent Form (L5 & L10)',
        source: 'Ball Don\'t Lie API',
        home: homeForm,
        away: awayForm,
        interpretation: `${home.name}: ${homeForm.trend} (L5: ${homeForm.l5?.record || 'N/A'}) | ${away.name}: ${awayForm.trend} (L5: ${awayForm.l5?.record || 'N/A'})`,
        note: 'L5 and L10 trends with opponent quality context provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_RECENT_FORM:`, error.message);
      return { category: 'Recent Form', error: 'Data unavailable' };
    }
  },

  
  // NHL Hot Players using box scores
  NHL_HOT_PLAYERS: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'icehockey_nhl') return null;
    
    try {
      // Get last 14 days of box scores
      const today = new Date();
      const dates = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
      }
      
      // Fetch box scores for both teams
      const boxScores = await ballDontLieService.getNhlRecentBoxScores(dates, {
        team_ids: [home.id, away.id]
      });
      
      if (!boxScores || boxScores.length === 0) {
        return { category: 'Hot Players', error: 'No recent box score data available' };
      }
      
      // Aggregate player stats
      const playerStats = {};
      boxScores.forEach(bs => {
        const playerId = bs.player?.id;
        const teamId = bs.team?.id;
        if (!playerId) return;
        
        if (!playerStats[playerId]) {
          playerStats[playerId] = {
            name: bs.player?.full_name || `${bs.player?.first_name} ${bs.player?.last_name}`,
            position: bs.position || bs.player?.position_code,
            teamId,
            games: 0,
            goals: 0,
            assists: 0,
            points: 0,
            shots: 0,
            plusMinus: 0
          };
        }
        
        playerStats[playerId].games++;
        playerStats[playerId].goals += bs.goals || 0;
        playerStats[playerId].assists += bs.assists || 0;
        playerStats[playerId].points += bs.points || 0;
        playerStats[playerId].shots += bs.shots_on_goal || 0;
        playerStats[playerId].plusMinus += bs.plus_minus || 0;
      });
      
      // Convert to array and calculate PPG
      const players = Object.values(playerStats).map(p => ({
        ...p,
        ppg: p.games > 0 ? (p.points / p.games).toFixed(2) : '0.00'
      }));
      
      // Filter by team and sort by points
      const homeHotPlayers = players
        .filter(p => p.teamId === home.id && p.games >= 3 && p.position !== 'G')
        .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
        .slice(0, 5);
      
      const awayHotPlayers = players
        .filter(p => p.teamId === away.id && p.games >= 3 && p.position !== 'G')
        .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
        .slice(0, 5);
      
      const formatPlayer = (p) => ({
        name: p.name,
        position: p.position,
        games: p.games,
        goals: p.goals,
        assists: p.assists,
        points: p.points,
        ppg: p.ppg,
        plus_minus: p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus.toString()
      });
      
      return {
        category: 'Hot Players (Last 14 Days)',
        source: 'Ball Don\'t Lie API (Box Scores)',
        home: {
          team: home.full_name || home.name,
          hot_players: homeHotPlayers.map(formatPlayer),
          note: homeHotPlayers.length > 0 && parseFloat(homeHotPlayers[0].ppg) >= 1.0
            ? `${homeHotPlayers[0].name} is HOT (${homeHotPlayers[0].ppg} PPG)`
            : 'No standout hot players'
        },
        away: {
          team: away.full_name || away.name,
          hot_players: awayHotPlayers.map(formatPlayer),
          note: awayHotPlayers.length > 0 && parseFloat(awayHotPlayers[0].ppg) >= 1.0
            ? `${awayHotPlayers[0].name} is HOT (${awayHotPlayers[0].ppg} PPG)`
            : 'No standout hot players'
        },
        note: 'Players with 1.0+ PPG over last 14 days are considered "hot"'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_HOT_PLAYERS:`, error.message);
      return { category: 'Hot Players', error: 'Data unavailable' };
    }
  },

  
  // NHL Head-to-Head History
  NHL_H2H_HISTORY: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'icehockey_nhl') return null;
    
    try {
      // Get games between these two teams (current + last season)
      const seasons = [season, season - 1];
      const games = await ballDontLieService.getGames(bdlSport, {
        team_ids: [home.id],
        seasons,
        per_page: 100
      });
      
      // Filter to only games between these two teams
      const h2hGames = (games || [])
        .filter(g => {
          const isH2H = (g.home_team?.id === home.id && g.away_team?.id === away.id) ||
                        (g.home_team?.id === away.id && g.away_team?.id === home.id);
          const isComplete = g.game_state === 'OFF' || g.game_state === 'FINAL' || g.status === 'Final';
          return isH2H && isComplete;
        })
        .sort((a, b) => new Date(b.game_date || b.date) - new Date(a.game_date || a.date))
        .slice(0, 5);
      
      if (h2hGames.length === 0) {
        return {
          category: 'Head-to-Head History',
          h2h_available: false,
          home: { team: home.full_name || home.name },
          away: { team: away.full_name || away.name },
          note: `NO H2H DATA: ${home.full_name || home.name} and ${away.full_name || away.name} have no recent H2H games in our data.`,
          ANTI_HALLUCINATION: 'CRITICAL: You have ZERO H2H data. DO NOT claim historical records, winning streaks, or dominance narratives.'
        };
      }
      
      let homeWins = 0, awayWins = 0;
      const meetings = h2hGames.map(g => {
        const homeInGame = g.home_team?.id === home.id;
        const homeScore = homeInGame ? g.home_score : g.away_score;
        const awayScore = homeInGame ? g.away_score : g.home_score;
        
        if (homeScore > awayScore) homeWins++;
        else awayWins++;
        
        return {
          date: g.game_date || g.date,
          venue: homeInGame ? 'Home' : 'Away',
          score: `${home.name} ${homeScore} - ${awayScore} ${away.name}`,
          winner: homeScore > awayScore ? home.name : away.name,
          margin: Math.abs(homeScore - awayScore)
        };
      });
      
      // Calculate average margin
      const avgMargin = meetings.reduce((sum, m) => sum + m.margin, 0) / meetings.length;
      
      // ===== NHL SWEEP CONTEXT DETECTION =====
      // Detect when one team is sweeping an elite opponent (3-0 or better)
      // Uses points percentage instead of win% (NHL has OT losses worth 1 point)
      let sweepContext = null;
      const gamesPlayed = meetings.length;
      const isCompleteSweep = (homeWins === gamesPlayed && gamesPlayed >= 3) || 
                              (awayWins === gamesPlayed && gamesPlayed >= 3);
      
      if (isCompleteSweep) {
        try {
          // Determine dominant and swept teams
          const dominantTeam = homeWins === gamesPlayed ? home : away;
          const dominantTeamName = homeWins === gamesPlayed ? home.full_name || home.name : away.full_name || away.name;
          const sweptTeam = homeWins === gamesPlayed ? away : home;
          const sweptTeamName = homeWins === gamesPlayed ? away.full_name || away.name : home.full_name || home.name;
          
          // Fetch NHL standings to get points percentage
          const standings = await ballDontLieService.getNhlStandings(season);
          
          const sweptTeamStanding = standings?.find(s => s.team?.id === sweptTeam.id);
          const dominantTeamStanding = standings?.find(s => s.team?.id === dominantTeam.id);
          
          if (sweptTeamStanding) {
            // NHL uses points percentage: points / (games * 2) * 100
            // Some APIs provide points directly, others provide wins/losses/ot_losses
            const sweptPoints = sweptTeamStanding.points || 
              ((sweptTeamStanding.wins || 0) * 2 + (sweptTeamStanding.ot_losses || 0));
            const sweptGamesPlayed = sweptTeamStanding.games_played || 
              ((sweptTeamStanding.wins || 0) + (sweptTeamStanding.losses || 0) + (sweptTeamStanding.ot_losses || 0));
            
            if (sweptGamesPlayed > 0) {
              const sweptPointsPct = (sweptPoints / (sweptGamesPlayed * 2)) * 100;
              const sweptRecord = `${sweptTeamStanding.wins || 0}-${sweptTeamStanding.losses || 0}-${sweptTeamStanding.ot_losses || 0}`;
              
              // Check if division rivals
              const sweptDivision = sweptTeamStanding?.division_name || sweptTeamStanding?.team?.division;
              const dominantDivision = dominantTeamStanding?.division_name || dominantTeamStanding?.team?.division;
              const isDivisionRival = sweptDivision && dominantDivision && sweptDivision === dominantDivision;
              
              // NHL Sweep Context thresholds:
              // - 65%+ points pct: STRONG trap alert
              // - 58-65% (or 58%+ for division rivals): CAUTION flag
              const strongThreshold = 65;
              const cautionThreshold = isDivisionRival ? 58 : 65;
              
              // Margin context for NHL (goals, not points)
              const marginNote = avgMargin >= 3 
                ? `Dominant margins (avg +${avgMargin.toFixed(1)} goals) — but goaltending variance and line adjustments typically intervene.`
                : avgMargin >= 1.5
                ? `Solid margins (avg +${avgMargin.toFixed(1)} goals) — real edge, but NHL games are tight.`
                : `Close games (avg +${avgMargin.toFixed(1)} goals) — series has been competitive.`;
              
              let alertLevel = null;
              let sweepNote = null;
              
              if (sweptPointsPct >= strongThreshold) {
                alertLevel = 'STRONG';
                sweepNote = `NHL SWEEP CONTEXT: ${sweptTeamName} is ${sweptRecord} (${sweptPointsPct.toFixed(1)}% points)${isDivisionRival ? ' and a division rival' : ''} but 0-${gamesPlayed} vs ${dominantTeamName}. ${marginNote}`;
              } else if (sweptPointsPct >= cautionThreshold) {
                alertLevel = 'CAUTION';
                sweepNote = `NHL SWEEP CONTEXT: ${sweptTeamName} is ${sweptRecord} (${sweptPointsPct.toFixed(1)}% points)${isDivisionRival ? ' — a division rival' : ''} and 0-${gamesPlayed} vs ${dominantTeamName}. Playoff-caliber teams rarely get swept. ${marginNote}`;
              }
              
              if (alertLevel) {
                sweepContext = {
                  triggered: true,
                  alert_level: alertLevel,
                  sport: 'NHL',
                  games_in_sweep: gamesPlayed,
                  dominant_team: dominantTeamName,
                  swept_team: sweptTeamName,
                  swept_team_record: sweptRecord,
                  swept_team_points_pct: `${sweptPointsPct.toFixed(1)}%`,
                  is_division_rival: isDivisionRival,
                  division: isDivisionRival ? sweptDivision : null,
                  avg_margin: avgMargin.toFixed(1),
                  margin_context: marginNote,
                  sweep_note: sweepNote
                };
                console.log(`[Stat Router] NHL SWEEP CONTEXT (${alertLevel}): ${dominantTeamName} is ${gamesPlayed}-0 vs ${sweptTeamName} (${sweptPointsPct.toFixed(1)}% points${isDivisionRival ? ', division rival' : ''})`);
              }
            }
          }
        } catch (sweepErr) {
          console.log(`[Stat Router] NHL sweep context check failed (non-fatal): ${sweepErr.message}`);
        }
      }
      
      return {
        category: 'Head-to-Head History',
        source: 'Ball Don\'t Lie API',
        h2h_available: true,
        games_found: meetings.length,
        home: {
          team: home.full_name || home.name,
          h2h_record: `${homeWins}-${awayWins}`,
          h2h_wins: homeWins
        },
        away: {
          team: away.full_name || away.name,
          h2h_record: `${awayWins}-${homeWins}`,
          h2h_wins: awayWins
        },
        recent_meetings: meetings,
        avg_margin: avgMargin.toFixed(1),
        sweep_context: sweepContext,
        interpretation: homeWins > awayWins
          ? `${home.name} has won ${homeWins} of last ${meetings.length} meetings`
          : awayWins > homeWins 
            ? `${away.name} has won ${awayWins} of last ${meetings.length} meetings`
            : `Series is even at ${homeWins}-${awayWins}`,
        note: 'H2H meetings provided for comparison.',
        ANTI_HALLUCINATION: `DATA BOUNDARY: You have ONLY ${meetings.length} verified H2H game(s). You may cite these specific games. DO NOT claim historical streaks or multi-year records beyond this data.`
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_H2H_HISTORY:`, error.message);
      return { 
        category: 'Head-to-Head History', 
        h2h_available: false,
        error: 'Data unavailable',
        ANTI_HALLUCINATION: 'CRITICAL: H2H fetch FAILED. DO NOT mention H2H in your analysis.'
      };
    }
  },


  // ===== NHL ADVANCED STATS (REAL DATA - via Gemini Grounding) =====

  // CORSI FOR PERCENTAGE (Real Possession Metric)
  // SOURCE: MoneyPuck CSV (primary), NHL API (cross-validation)
  CORSI_FOR_PCT: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching CORSI_FOR_PCT for ${awayName} @ ${homeName}`);

    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Corsi For %', note: 'Only available for NHL' };
    }

    try {
      const [homeMP, awayMP, homeNHL, awayNHL] = await Promise.all([
        getMoneyPuckTeamStats(homeName),
        getMoneyPuckTeamStats(awayName),
        getNhlApiPercentages(homeName),
        getNhlApiPercentages(awayName),
      ]);

      // Cross-validate MoneyPuck vs NHL API
      if (homeMP && homeNHL && Math.abs(homeMP.corsi_pct - homeNHL.corsi_pct) > 2) {
        console.warn(`[Stat Router] CORSI cross-validation warning for ${homeName}: MoneyPuck=${homeMP.corsi_pct}, NHL API=${homeNHL.corsi_pct}`);
      }

      const formatTeam = (mp, nhlApi, name) => {
        if (!mp) return { team: name, error: 'MoneyPuck data unavailable' };
        return {
          team: name,
          corsi_for_pct: `${mp.corsi_pct}%`,
          fenwick_pct: `${mp.fenwick_pct}%`,
          shot_attempts_for: mp.shot_attempts_for,
          shot_attempts_against: mp.shot_attempts_against,
          shot_attempt_diff: mp.shot_attempts_for - mp.shot_attempts_against,
          // Game-state splits from NHL API
          corsi_pct_ahead: nhlApi?.corsi_pct_ahead ? `${nhlApi.corsi_pct_ahead}%` : null,
          corsi_pct_behind: nhlApi?.corsi_pct_behind ? `${nhlApi.corsi_pct_behind}%` : null,
          corsi_pct_close: nhlApi?.corsi_pct_close ? `${nhlApi.corsi_pct_close}%` : null,
        };
      };

      return {
        category: 'Corsi For % (Possession)',
        source: 'MoneyPuck / NHL API (5v5)',
        home: formatTeam(homeMP, homeNHL, homeName),
        away: formatTeam(awayMP, awayNHL, awayName),
        comparison: `Corsi differentials measure puck possession but don't distinguish shot quality from shot volume. What competing scenarios does this possession data support for each team on tonight's moneyline?`,
        note: 'League average is 50%. CF% is the best possession proxy in hockey.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching CORSI_FOR_PCT:`, error.message);
      return { category: 'Corsi For %', error: 'Data unavailable' };
    }
  },


  // EXPECTED GOALS (xG) - Real Metric
  // SOURCE: MoneyPuck CSV (5v5 data)
  EXPECTED_GOALS: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching EXPECTED_GOALS for ${awayName} @ ${homeName}`);

    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Expected Goals', note: 'Only available for NHL' };
    }

    try {
      const [homeMP, awayMP] = await Promise.all([
        getMoneyPuckTeamStats(homeName),
        getMoneyPuckTeamStats(awayName),
      ]);

      const formatTeam = (mp, name) => {
        if (!mp) return { team: name, error: 'MoneyPuck data unavailable' };
        return {
          team: name,
          xg_for: mp.xg_for,
          xg_against: mp.xg_against,
          xg_pct: `${mp.xg_pct}%`,
          actual_goals_for: mp.goals_for,
          actual_goals_against: mp.goals_against,
          goals_above_expected: mp.goals_above_expected,
          goals_allowed_above_expected: mp.goals_allowed_above_expected,
        };
      };

      return {
        category: 'Expected Goals (xG)',
        source: 'MoneyPuck (5v5)',
        home: formatTeam(homeMP, homeName),
        away: formatTeam(awayMP, awayName),
        comparison: `The gap between expected and actual goals can reflect goaltending, finishing talent, or regression candidates. What competing narratives could this xG data support for each side?`,
        note: 'xG accounts for shot location and type. Season cumulative totals at 5v5.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching EXPECTED_GOALS:`, error.message);
      return { category: 'Expected Goals', error: 'Data unavailable' };
    }
  },


  // PDO (Luck Indicator) - Real Metric
  // SOURCE: NHL API (primary), MoneyPuck CSV (backup)
  PDO: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching PDO for ${awayName} @ ${homeName}`);

    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'PDO', note: 'Only available for NHL' };
    }

    try {
      const [homeNHL, awayNHL] = await Promise.all([
        getNhlApiPercentages(homeName),
        getNhlApiPercentages(awayName),
      ]);

      const formatTeam = (nhlApi, name) => {
        if (!nhlApi) return { team: name, error: 'NHL API data unavailable' };
        return {
          team: name,
          pdo: nhlApi.pdo,
          shooting_pct_5v5: `${nhlApi.shooting_pct_5v5}%`,
          save_pct_5v5: `${nhlApi.save_pct_5v5}%`,
          zone_start_pct_5v5: nhlApi.zone_start_pct_5v5 ? `${nhlApi.zone_start_pct_5v5}%` : null,
        };
      };

      return {
        category: 'PDO (Luck/Regression Indicator)',
        source: 'NHL API (5v5)',
        home: formatTeam(homeNHL, homeName),
        away: formatTeam(awayNHL, awayName),
        comparison: `PDO extremes can signal regression or genuine talent — elite goalies sustain high save percentages, elite shooters sustain high shooting percentages. What competing interpretations does this PDO data support for each team?`,
        note: 'PDO baseline is 1.000 (shooting% + save%). Values provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching PDO:`, error.message);
      return { category: 'PDO', error: 'Data unavailable' };
    }
  },


  // HIGH DANGER CHANCES - Real Metric
  // SOURCE: MoneyPuck CSV (5v5 data)
  HIGH_DANGER_CHANCES: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching HIGH_DANGER_CHANCES for ${awayName} @ ${homeName}`);

    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'High Danger Chances', note: 'Only available for NHL' };
    }

    try {
      const [homeMP, awayMP] = await Promise.all([
        getMoneyPuckTeamStats(homeName),
        getMoneyPuckTeamStats(awayName),
      ]);

      const formatTeam = (mp, name) => {
        if (!mp) return { team: name, error: 'MoneyPuck data unavailable' };
        const hdTotal = mp.hd_shots_for + mp.hd_shots_against;
        return {
          team: name,
          hd_shots_for: mp.hd_shots_for,
          hd_shots_against: mp.hd_shots_against,
          hd_pct: hdTotal > 0 ? `${((mp.hd_shots_for / hdTotal) * 100).toFixed(1)}%` : 'N/A',
          hd_goals_for: mp.hd_goals_for,
          hd_goals_against: mp.hd_goals_against,
          hd_xg_for: mp.hd_xg_for,
          hd_xg_against: mp.hd_xg_against,
        };
      };

      return {
        category: 'High Danger Scoring Chances',
        source: 'MoneyPuck (5v5)',
        home: formatTeam(homeMP, homeName),
        away: formatTeam(awayMP, awayName),
        comparison: `High-danger chance generation reflects offensive scheme and zone entry, while suppression reflects defensive structure. What competing scenarios does this data support for each team on tonight's moneyline?`,
        note: 'HDCF% baseline is 50%. Season cumulative totals at 5v5.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching HIGH_DANGER_CHANCES:`, error.message);
      return { category: 'High Danger Chances', error: 'Data unavailable' };
    }
  },


  // NHL GSAx (Goals Saved Above Expected)
  // SOURCE: MoneyPuck CSV (goalies, 5v5)
  NHL_GSAX: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching NHL_GSAX for ${awayName} @ ${homeName}`);

    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'GSAx', note: 'Only available for NHL' };
    }

    try {
      const [homeGoalies, awayGoalies] = await Promise.all([
        getMoneyPuckGoalieStats(homeName),
        getMoneyPuckGoalieStats(awayName),
      ]);

      const formatGoalies = (goalies, name) => {
        if (!goalies || goalies.length === 0) return { team: name, error: 'Goalie data unavailable' };
        return {
          team: name,
          goalies: goalies.map(g => ({
            name: g.name,
            games_played: g.games_played,
            gsax: g.gsax,
            xg_against: g.xg_against,
            goals_against: g.goals_against,
            save_pct: g.save_pct,
          })),
        };
      };

      return {
        category: 'Goals Saved Above Expected (GSAx)',
        source: 'MoneyPuck (5v5)',
        home: formatGoalies(homeGoalies, homeName),
        away: formatGoalies(awayGoalies, awayName),
        comparison: 'GSAx captures goalie performance above or below expected, but sample size and shot quality context matter. What competing narratives could this goalie data support for each side?'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_GSAX:`, error.message);
      return { category: 'GSAx', error: 'Data unavailable' };
    }
  },


  // NHL Goalie Recent Form - Computed from BDL box scores
  // SOURCE: Ball Don't Lie API (box scores)
  NHL_GOALIE_RECENT_FORM: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'icehockey_nhl') return null;

    try {
      // Get goalies for both teams
      const goalieData = await ballDontLieService.getNhlTeamGoalies([home.id, away.id], season);

      // Get last 21 days of box scores for both teams
      const today = new Date();
      const dates = [];
      for (let i = 0; i < 21; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
      }

      const boxScores = await ballDontLieService.getNhlRecentBoxScores(dates, {
        team_ids: [home.id, away.id]
      });

      if (!boxScores || boxScores.length === 0) {
        return { category: 'Goalie Recent Form', error: 'No recent box score data available' };
      }

      // Aggregate goalie stats from box scores
      const goalieStats = {};
      boxScores.forEach(bs => {
        const playerId = bs.player?.id;
        const position = bs.position || bs.player?.position_code;
        if (!playerId || position !== 'G') return;

        // Only count games where goalie actually played (time_on_ice > 0)
        const toi = bs.time_on_ice || '00:00';
        if (toi === '00:00' || toi === '0:00') return;

        if (!goalieStats[playerId]) {
          goalieStats[playerId] = {
            name: bs.player?.full_name || `${bs.player?.first_name} ${bs.player?.last_name}`,
            teamId: bs.team?.id,
            games: [],
          };
        }

        goalieStats[playerId].games.push({
          date: bs.game?.date,
          saves: bs.saves || 0,
          shots_against: bs.shots_against || 0,
          goals_against: bs.goals_against || 0,
          time_on_ice: toi,
          win: bs.win || false,
          loss: bs.loss || false,
          ot_loss: bs.ot_loss || false
        });
      });

      // Build summary for each goalie
      const formatGoalie = (stats) => {
        const games = stats.games.sort((a, b) => new Date(b.date) - new Date(a.date));
        const totalSaves = games.reduce((sum, g) => sum + g.saves, 0);
        const totalSA = games.reduce((sum, g) => sum + g.shots_against, 0);
        const totalGA = games.reduce((sum, g) => sum + g.goals_against, 0);
        const wins = games.filter(g => g.win).length;
        const losses = games.filter(g => g.loss).length;
        const otLosses = games.filter(g => g.ot_loss).length;

        return {
          name: stats.name,
          recent_games: games.length,
          record: `${wins}-${losses}-${otLosses}`,
          save_pct: totalSA > 0 ? (totalSaves / totalSA).toFixed(3) : 'N/A',
          gaa: totalSA > 0 ? (totalGA / games.length).toFixed(2) : 'N/A',
          total_saves: totalSaves,
          total_shots_against: totalSA,
          last_5: games.slice(0, 5).map(g => ({
            date: g.date,
            saves: g.saves,
            shots_against: g.shots_against,
            goals_against: g.goals_against,
            result: g.win ? 'W' : g.ot_loss ? 'OTL' : 'L'
          }))
        };
      };

      // Get likely starters (most games started from getNhlTeamGoalies)
      const homeGoalies = goalieData?.[home.id] || [];
      const awayGoalies = goalieData?.[away.id] || [];
      const homeStarterName = homeGoalies[0]?.name;
      const awayStarterName = awayGoalies[0]?.name;

      // Find goalies from box scores matching each team
      const homeTeamGoalies = Object.values(goalieStats)
        .filter(g => g.teamId === home.id)
        .map(formatGoalie)
        .sort((a, b) => b.recent_games - a.recent_games);

      const awayTeamGoalies = Object.values(goalieStats)
        .filter(g => g.teamId === away.id)
        .map(formatGoalie)
        .sort((a, b) => b.recent_games - a.recent_games);

      return {
        category: 'Goalie Recent Form (Last 21 Days)',
        source: 'Ball Don\'t Lie API (Box Scores)',
        home: {
          team: home.full_name || home.name,
          likely_starter: homeStarterName || 'Unknown',
          goalies: homeTeamGoalies
        },
        away: {
          team: away.full_name || away.name,
          likely_starter: awayStarterName || 'Unknown',
          goalies: awayTeamGoalies
        },
        comparison: 'Recent goalie form can reflect hot/cold streaks, workload effects, or opponent quality changes. What competing scenarios does this form data support for each team on tonight\'s moneyline?'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_GOALIE_RECENT_FORM:`, error.message);
      return { category: 'Goalie Recent Form', error: 'Data unavailable' };
    }
  },


  // NHL High Danger Save Percentage
  // SOURCE: MoneyPuck CSV (goalies, 5v5)
  NHL_HIGH_DANGER_SV_PCT: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching NHL_HIGH_DANGER_SV_PCT for ${awayName} @ ${homeName}`);

    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'High Danger SV%', note: 'Only available for NHL' };
    }

    try {
      const [homeGoalies, awayGoalies] = await Promise.all([
        getMoneyPuckGoalieStats(homeName),
        getMoneyPuckGoalieStats(awayName),
      ]);

      const formatGoalies = (goalies, name) => {
        if (!goalies || goalies.length === 0) return { team: name, error: 'Goalie data unavailable' };
        return {
          team: name,
          goalies: goalies.map(g => ({
            name: g.name,
            games_played: g.games_played,
            hd_sv_pct: g.hd_sv_pct != null ? `${(g.hd_sv_pct * 100).toFixed(1)}%` : 'N/A',
            hd_shots: g.hd_shots,
            hd_goals: g.hd_goals,
            overall_sv_pct: g.save_pct,
          })),
        };
      };

      return {
        category: 'High Danger Save Percentage',
        source: 'MoneyPuck (5v5)',
        home: formatGoalies(homeGoalies, homeName),
        away: formatGoalies(awayGoalies, awayName),
        comparison: 'High-danger save percentage isolates goalie performance on the toughest shots, but small samples amplify variance. What competing narratives could this data support for each side?'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_HIGH_DANGER_SV_PCT:`, error.message);
      return { category: 'High Danger SV%', error: 'Data unavailable' };
    }
  },


  // LINE COMBINATIONS - Dynamic Grounding
  // SOURCE: Daily Faceoff, Left Wing Lock, NHL.com (projected lines, PP units, expected starters)
  LINE_COMBINATIONS: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching LINE_COMBINATIONS for ${awayName} @ ${homeName}`);

    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Line Combinations', note: 'Only available for NHL' };
    }

    try {
      const seasonStr = getCurrentSeasonString();
      const query = `${seasonStr} NHL projected line combinations ${homeName} ${awayName}.
        Search Daily Faceoff, Left Wing Lock, or NHL.com for current projected lineups.
        Return whatever lineup data is available: forward lines, defense pairings, PP units, expected starting goalies.
        Return ONLY factual lineup data found.`;

      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'Return whatever current NHL lineup and line combination data you find for both teams. Include forward lines, defense pairings, power play units, and expected starting goalies if available. Return ONLY the data.',
        maxTokens: 2500
      });

      return {
        category: 'Line Combinations & Projected Lineups',
        source: 'Gemini Grounding (Daily Faceoff / Left Wing Lock / NHL.com)',
        home: { team: homeName },
        away: { team: awayName },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        comparison: `Line combination stability affects chemistry and deployment predictability, while changes can signal coaching adjustments or injury adaptation. What competing scenarios does this lineup data support for each side?`,
        note: 'Projected lineups — confirm with game-day sources.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching LINE_COMBINATIONS:`, error.message);
      return { category: 'Line Combinations', error: 'Data unavailable' };
    }
  },


  // OVERTIME RECORD - Calculated
  OVERTIME_RECORD: async (bdlSport, home, away, season) => {
    const homeNameOT = home?.full_name || home?.name || 'Unknown Home';
    const awayNameOT = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching OVERTIME_RECORD for ${awayNameOT} @ ${homeNameOT}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Overtime Record', note: 'Only available for NHL' };
    }
    
    try {
      // Get season games for both teams
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 50 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 50 })
      ]);
      
      const calcOTRecord = (games, teamId) => {
        let otWins = 0, otLosses = 0, soWins = 0, soLosses = 0;
        
        for (const g of games || []) {
          if (g.game_state !== 'OFF' && g.game_state !== 'FINAL' && g.status !== 'Final') continue;
          
          // Check if OT game (period > 3)
          const isOT = g.period > 3 || g.overtime;
          if (!isOT) continue;
          
          const isHome = g.home_team?.id === teamId;
          const teamScore = isHome ? g.home_score : g.away_score;
          const oppScore = isHome ? g.away_score : g.home_score;
          const won = teamScore > oppScore;
          
          // Check if shootout (could check specific SO indicator if available)
          const isSO = g.period > 4 || g.shootout;
          
          if (isSO) {
            if (won) soWins++;
            else soLosses++;
          } else {
            if (won) otWins++;
            else otLosses++;
          }
        }
        
        return {
          ot_wins: otWins,
          ot_losses: otLosses,
          so_wins: soWins,
          so_losses: soLosses,
          total_extra_time: otWins + otLosses + soWins + soLosses,
          ot_win_pct: (otWins + otLosses) > 0 ? `${((otWins / (otWins + otLosses)) * 100).toFixed(0)}%` : 'N/A'
        };
      };
      
      const homeOT = calcOTRecord(homeGames, home.id);
      const awayOT = calcOTRecord(awayGames, away.id);
      
      return {
        category: 'Overtime & Shootout Record',
        source: 'Ball Don\'t Lie API (calculated)',
        home: {
          team: home.full_name || home.name,
          ...homeOT,
          rating: homeOT.ot_wins >= 3 ? 'CLUTCH in extras' : 'Average in extras'
        },
        away: {
          team: away.full_name || away.name,
          ...awayOT,
          rating: awayOT.ot_wins >= 3 ? 'CLUTCH in extras' : 'Average in extras'
        },
        comparison: `OT/SO records reflect 3-on-3 skill depth and goalie shootout performance, but small samples make these volatile. What competing narratives could this extra-time data support for each team?`,
        note: 'Overtime and shootout records provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching OVERTIME_RECORD:`, error.message);
      return { category: 'Overtime Record', error: 'Data unavailable' };
    }
  },


  // LUCK_INDICATORS - Combined luck metrics
  // SOURCE: NHL API (PDO) + MoneyPuck CSV (xG deltas)
  LUCK_INDICATORS: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching LUCK_INDICATORS for ${awayName} @ ${homeName}`);

    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Luck Indicators', note: 'Only available for NHL' };
    }

    try {
      const [homeNHL, awayNHL, homeMP, awayMP] = await Promise.all([
        getNhlApiPercentages(homeName),
        getNhlApiPercentages(awayName),
        getMoneyPuckTeamStats(homeName),
        getMoneyPuckTeamStats(awayName),
      ]);

      const formatTeam = (nhlApi, mp, name) => {
        const result = { team: name };

        if (nhlApi) {
          result.pdo = nhlApi.pdo;
          result.shooting_pct_5v5 = `${nhlApi.shooting_pct_5v5}%`;
          result.save_pct_5v5 = `${nhlApi.save_pct_5v5}%`;
          // Label for data presentation only
          result.pdo_zone = nhlApi.pdo > 1.01 ? 'High PDO' : nhlApi.pdo < 0.99 ? 'Low PDO' : 'Neutral';
        }

        if (mp) {
          result.xg_delta_for = mp.goals_above_expected;
          result.xg_delta_against = mp.goals_allowed_above_expected;
        }

        if (!nhlApi && !mp) result.error = 'Data unavailable';
        return result;
      };

      return {
        category: 'Luck Indicators (Regression Watch)',
        source: 'NHL API + MoneyPuck (5v5)',
        home: formatTeam(homeNHL, homeMP, homeName),
        away: formatTeam(awayNHL, awayMP, awayName),
        comparison: `Combined luck indicators reveal whether a team's results are sustainable or candidates for regression. What competing scenarios does this regression data support for each side on tonight's moneyline?`,
        note: 'PDO baseline is 1.000. League avg shooting ~9%, save ~91%.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching LUCK_INDICATORS:`, error.message);
      return { category: 'Luck Indicators', error: 'Data unavailable' };
    }
  },


  // ===== NEW NHL FETCHERS (Standings Context, Depth, Variance) =====

  // POINTS_PCT - Points percentage from BDL standings
  POINTS_PCT: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching POINTS_PCT for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Points Percentage', note: 'Only available for NHL' };
    }
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const findTeam = (teamId) => standings.find(s => s.team?.id === teamId);
      const homeStanding = findTeam(home.id);
      const awayStanding = findTeam(away.id);
      
      const formatStanding = (standing, team) => {
        if (!standing) return { team: team.name, error: 'Standing not found' };
        const pointsPct = standing.points_pctg || standing.points_pct || 
          (standing.points / ((standing.games_played || 82) * 2));
        return {
          team: team.full_name || team.name,
          points: standing.points,
          points_pct: `${(pointsPct * 100).toFixed(1)}%`,
          games_played: standing.games_played,
          regulation_wins: standing.regulation_wins,
          ot_losses: standing.ot_losses,
          goal_diff: standing.goal_differential || (standing.goals_for - standing.goals_against),
          playoff_position: pointsPct >= 0.550 ? 'Playoff pace' : pointsPct >= 0.500 ? 'Bubble' : 'Below playoff line'
        };
      };
      
      return {
        category: 'Points Percentage (Playoff Context)',
        source: 'Ball Don\'t Lie API',
        home: formatStanding(homeStanding, home),
        away: formatStanding(awayStanding, away),
        comparison: `Points percentage reflects overall team quality but doesn't distinguish regulation dominance from OT/SO point accumulation. What competing narratives could this standing data support for each team?`,
        note: 'NHL uses points percentage (not win%) due to OT losses worth 1 point.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching POINTS_PCT:`, error.message);
      return { category: 'Points Percentage', error: 'Data unavailable' };
    }
  },


  // STREAK - Current win/loss streak
  STREAK: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching STREAK for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Current Streak', note: 'Only available for NHL' };
    }
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const findTeam = (teamId) => standings.find(s => s.team?.id === teamId);
      const homeStanding = findTeam(home.id);
      const awayStanding = findTeam(away.id);
      
      return {
        category: 'Current Streak',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          streak: homeStanding?.streak || 'N/A',
          hot_cold: homeStanding?.streak?.startsWith('W') && parseInt(homeStanding?.streak?.slice(1)) >= 3
            ? 'HOT' : homeStanding?.streak?.startsWith('L') && parseInt(homeStanding?.streak?.slice(1)) >= 3
            ? 'COLD' : 'Neutral'
        },
        away: {
          team: away.full_name || away.name,
          streak: awayStanding?.streak || 'N/A',
          hot_cold: awayStanding?.streak?.startsWith('W') && parseInt(awayStanding?.streak?.slice(1)) >= 3
            ? 'HOT' : awayStanding?.streak?.startsWith('L') && parseInt(awayStanding?.streak?.slice(1)) >= 3
            ? 'COLD' : 'Neutral'
        },
        note: 'Current streak data provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching STREAK:`, error.message);
      return { category: 'Current Streak', error: 'Data unavailable' };
    }
  },


  // PLAYOFF_POSITION - Playoff race context
  PLAYOFF_POSITION: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching PLAYOFF_POSITION for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Playoff Position', note: 'Only available for NHL' };
    }
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      // Group by division/conference for playoff context
      const divisionGroups = {};
      for (const s of standings) {
        const div = s.division_name || 'Unknown';
        if (!divisionGroups[div]) divisionGroups[div] = [];
        divisionGroups[div].push(s);
      }
      
      // Sort each division by points
      for (const div of Object.keys(divisionGroups)) {
        divisionGroups[div].sort((a, b) => (b.points || 0) - (a.points || 0));
      }
      
      const getPlayoffContext = (teamId) => {
        for (const [div, teams] of Object.entries(divisionGroups)) {
          const idx = teams.findIndex(t => t.team?.id === teamId);
          if (idx !== -1) {
            const team = teams[idx];
            const rank = idx + 1;
            const pointsBehind = rank > 1 ? (teams[0].points || 0) - (team.points || 0) : 0;
            return {
              division: div,
              division_rank: rank,
              points_behind_leader: pointsBehind,
              playoff_spot: rank <= 3 ? 'Division spot' : rank <= 5 ? 'Wild card race' : 'Outside looking in',
              home_record: team.home_record,
              road_record: team.road_record
            };
          }
        }
        return { error: 'Team not found in standings' };
      };
      
      return {
        category: 'Playoff Position Context',
        source: 'Ball Don\'t Lie API',
        home: { team: home.full_name || home.name, ...getPlayoffContext(home.id) },
        away: { team: away.full_name || away.name, ...getPlayoffContext(away.id) },
        comparison: `Playoff positioning affects motivation — desperate teams play harder, but clinched teams may rest starters or experiment. What competing scenarios does this positional context support for each side on tonight's moneyline?`,
        note: 'Top 3 in each division + 2 wild cards per conference make playoffs.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching PLAYOFF_POSITION:`, error.message);
      return { category: 'Playoff Position', error: 'Data unavailable' };
    }
  },


  // ONE_GOAL_GAMES - Close game record (1-goal margins)
  ONE_GOAL_GAMES: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching ONE_GOAL_GAMES for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'One-Goal Games', note: 'Only available for NHL' };
    }
    
    try {
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 50 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 50 })
      ]);
      
      const calcOneGoalRecord = (games, teamId) => {
        let wins = 0, losses = 0, total = 0;
        
        for (const g of games || []) {
          if (g.game_state !== 'OFF' && g.game_state !== 'FINAL' && g.status !== 'Final') continue;
          
          const margin = Math.abs((g.home_score || 0) - (g.away_score || 0));
          if (margin !== 1) continue; // Only 1-goal games
          
          total++;
          const isHome = g.home_team?.id === teamId;
          const teamScore = isHome ? g.home_score : g.away_score;
          const oppScore = isHome ? g.away_score : g.home_score;
          
          if (teamScore > oppScore) wins++;
          else losses++;
        }
        
        const winPct = total > 0 ? ((wins / total) * 100).toFixed(0) : 0;
        return {
          one_goal_record: `${wins}-${losses}`,
          one_goal_games: total,
          one_goal_win_pct: `${winPct}%`,
          clutch_rating: winPct >= 60 ? 'CLUTCH' : winPct <= 40 ? 'Struggles in close games' : 'Average'
        };
      };
      
      return {
        category: 'One-Goal Game Record',
        source: 'Ball Don\'t Lie API (calculated)',
        home: { team: home.full_name || home.name, ...calcOneGoalRecord(homeGames, home.id) },
        away: { team: away.full_name || away.name, ...calcOneGoalRecord(awayGames, away.id) },
        comparison: `One-goal game records reflect clutch performance but are highly susceptible to regression — extreme records rarely sustain. What competing narratives could this close-game data support for each team?`,
        note: 'One-goal game records provided for comparison. 50% is the baseline.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching ONE_GOAL_GAMES:`, error.message);
      return { category: 'One-Goal Games', error: 'Data unavailable' };
    }
  },


  // REGULATION_WIN_PCT - Regulation wins vs total wins
  REGULATION_WIN_PCT: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching REGULATION_WIN_PCT for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Regulation Win %', note: 'Only available for NHL' };
    }
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const findTeam = (teamId) => standings.find(s => s.team?.id === teamId);
      const homeStanding = findTeam(home.id);
      const awayStanding = findTeam(away.id);
      
      const calcRegWinPct = (standing, team) => {
        if (!standing) return { team: team.name, error: 'Standing not found' };
        const regWins = standing.regulation_wins || 0;
        const totalWins = standing.wins || 0;
        const otLosses = standing.ot_losses || 0;
        const regWinPct = totalWins > 0 ? ((regWins / totalWins) * 100).toFixed(0) : 0;
        
        return {
          team: team.full_name || team.name,
          regulation_wins: regWins,
          total_wins: totalWins,
          ot_losses: otLosses,
          reg_win_pct: `${regWinPct}%`,
          dominance: regWinPct >= 75 ? 'Dominant - wins in regulation' :
                    regWinPct <= 50 ? 'Relies on extras' : 'Average'
        };
      };
      
      return {
        category: 'Regulation Win Percentage',
        source: 'Ball Don\'t Lie API',
        home: calcRegWinPct(homeStanding, home),
        away: calcRegWinPct(awayStanding, away),
        comparison: `Regulation win percentage separates dominant teams from those padding records in OT/SO — it's the NHL's truest quality signal. What competing scenarios does this data support for each side?`,
        note: 'ROW (Regulation + OT Wins) is used as playoff tiebreaker.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching REGULATION_WIN_PCT:`, error.message);
      return { category: 'Regulation Win %', error: 'Data unavailable' };
    }
  },


  // MARGIN_VARIANCE - Goal differential consistency
  MARGIN_VARIANCE: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching MARGIN_VARIANCE for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Margin Variance', note: 'Only available for NHL' };
    }
    
    try {
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 30 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 30 })
      ]);
      
      const calcVariance = (games, teamId) => {
        const margins = [];
        let blowoutWins = 0, blowoutLosses = 0;
        
        for (const g of games || []) {
          if (g.game_state !== 'OFF' && g.game_state !== 'FINAL' && g.status !== 'Final') continue;
          
          const isHome = g.home_team?.id === teamId;
          const teamScore = isHome ? g.home_score : g.away_score;
          const oppScore = isHome ? g.away_score : g.home_score;
          const margin = teamScore - oppScore;
          margins.push(margin);
          
          if (margin >= 3) blowoutWins++;
          else if (margin <= -3) blowoutLosses++;
        }
        
        if (margins.length === 0) return { error: 'No games found' };
        
        const avgMargin = margins.reduce((a, b) => a + b, 0) / margins.length;
        const variance = margins.reduce((sum, m) => sum + Math.pow(m - avgMargin, 2), 0) / margins.length;
        const stdDev = Math.sqrt(variance);
        
        return {
          avg_margin: avgMargin.toFixed(1),
          std_deviation: stdDev.toFixed(2),
          blowout_wins: blowoutWins,
          blowout_losses: blowoutLosses,
          games_analyzed: margins.length,
          profile: stdDev >= 2.5 ? 'HIGH VARIANCE - boom or bust' :
                  stdDev <= 1.5 ? 'CONSISTENT - tight margins' : 'Average variance'
        };
      };
      
      return {
        category: 'Margin Variance (Consistency)',
        source: 'Ball Don\'t Lie API (calculated)',
        home: { team: home.full_name || home.name, ...calcVariance(homeGames, home.id) },
        away: { team: away.full_name || away.name, ...calcVariance(awayGames, away.id) },
        comparison: `High variance teams produce unpredictable margins — they can blow out anyone or lose to anyone. Low variance teams play tight games consistently. What competing narratives could this consistency data support for each team on tonight's moneyline?`,
        note: 'Margin variance and standard deviation provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching MARGIN_VARIANCE:`, error.message);
      return { category: 'Margin Variance', error: 'Data unavailable' };
    }
  },


  // SHOOTING_REGRESSION - Team shooting % regression indicators
  // SOURCE: MoneyPuck CSV + NHL API (5v5)
  SHOOTING_REGRESSION: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching SHOOTING_REGRESSION for ${awayName} @ ${homeName}`);

    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Shooting Regression', note: 'Only available for NHL' };
    }

    try {
      const [homeMP, awayMP, homeNHL, awayNHL] = await Promise.all([
        getMoneyPuckTeamStats(homeName),
        getMoneyPuckTeamStats(awayName),
        getNhlApiPercentages(homeName),
        getNhlApiPercentages(awayName),
      ]);

      const formatTeam = (mp, nhlApi, name) => {
        const result = { team: name };

        if (nhlApi) {
          result.shooting_pct_5v5 = `${nhlApi.shooting_pct_5v5}%`;
          result.save_pct_5v5 = `${nhlApi.save_pct_5v5}%`;
        }

        if (mp) {
          result.goals_above_expected = mp.goals_above_expected;
          result.goals_allowed_above_expected = mp.goals_allowed_above_expected;
          result.xg_pct = `${mp.xg_pct}%`;
        }

        if (!nhlApi && !mp) result.error = 'Data unavailable';
        return result;
      };

      return {
        category: 'Shooting % Regression Watch',
        source: 'NHL API + MoneyPuck (5v5)',
        home: formatTeam(homeMP, homeNHL, homeName),
        away: formatTeam(awayMP, awayNHL, awayName),
        comparison: `Team shooting percentages above ~9% can reflect elite finishing talent or unsustainable hot streaks. What competing scenarios does this shooting data support for each side?`,
        note: 'League average 5v5 shooting% is ~9%, save% ~91%.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching SHOOTING_REGRESSION:`, error.message);
      return { category: 'Shooting Regression', error: 'Data unavailable' };
    }
  },

};
