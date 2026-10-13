/** NBA stat tools: The game situation and finer splits: rest, travel, clutch, luck, usage, the schedule, bench depth, turnover margin. (split from nbaFetchers.js, Oct 13 2026). */
import { fmtNum, fetchNBATeamAdvancedStats, isPostseasonOptions } from '../statRouterCommon.js';
import { ballDontLieService } from '../../../../../providers/ballDontLieService.js';
import { recentSeasonGames } from './recentSeasonGames.js';

export const situationFetchers = {


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


  // ===== CLUTCH STATS (Close Game Record) =====
  CLUTCH_STATS: async (bdlSport, home, away, season, options) => {
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
          clutch_record: adv.w != null && adv.l != null ? `${adv.w}-${adv.l}` : 'N/A',
          clutch_win_pct: adv.w_pct ? `${(adv.w_pct * 100).toFixed(1)}%` : 'N/A',
          clutch_games: adv.gp ?? 'N/A',
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
  LUCK_ADJUSTED: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching LUCK_ADJUSTED (Pythagorean expected wins) for ${away.name} @ ${home.name}`);
    
    try {
      // The season's record and the season's scoring, one sample (audit, Oct 13 2026: the season record over 20
      // games' points reversed both 2025-26 signs).
      const [standings, homeGames, awayGames] = await Promise.all([
        ballDontLieService.getNbaStandings(season),
        recentSeasonGames(bdlSport, home.id, season, 200),
        recentSeasonGames(bdlSport, away.id, season, 200)
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
  USAGE_RATES: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching USAGE_RATES for ${away.name} @ ${home.name}`);

    try {
      // Use fetchNBATeamAdvancedStats which already fetches usage data from BDL
      // season_averages/general?type=scoring (pct_pts_paint, etc.) and type=usage (usg_pct)
      const [homeAdvanced, awayAdvanced] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamAdvancedStats(away.id, season, isPostseasonOptions(options))
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
  VS_ELITE_TEAMS: async (bdlSport, home, away, season, options) => {
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
      const seasonStart = new Date(season, 9, 1); // Oct 1 of season year (BDL season=2025 means 2025-26)
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
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
          recent_results: eliteGames.slice(-5).reverse()
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
  SCHEDULE_STRENGTH: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching SCHEDULE_STRENGTH for ${away.name} @ ${home.name}`);
    
    // Works for NBA, NHL, and college sports
    const isNba = bdlSport === 'basketball_nba';
    
    try {
      // Get standings to know each team's record
      let standings = [];
      if (isNba) {
        standings = await ballDontLieService.getNbaStandings(season);
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
      const seasonStart = new Date(season, 9, 1); // Oct 1 of season year (BDL season=2025 means 2025-26)
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
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
  BENCH_DEPTH: async (bdlSport, home, away, season, options) => {


    // NBA only
    if (bdlSport !== 'basketball_nba') {
      return { category: 'Bench Depth', note: 'Only available for NBA', error: 'Sport not supported' };
    }

    console.log(`[Stat Router] Fetching BENCH_DEPTH for ${away.name} @ ${home.name}`);
    
    try {
      // Recent window (last 45 days) sized so a single page contains every
      // recent game — the old full-season window with per_page:15 returned
      // the FIRST 15 games of the season (October) and labeled them
      // "Last 10 Games" (June 3 2026 audit).
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - 45);
      const today = new Date();

      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: windowStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 100
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: windowStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 100
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
        ballDontLieService.getNbaGameStats(homeGameIds),
        ballDontLieService.getNbaGameStats(awayGameIds)
      ]);
      
      // Calculate bench depth for a team
      const calcBenchDepth = (playerStats, teamId, numGames) => {
        // Filter to only this team's players
        const teamStats = (playerStats || []).filter(s => s.team?.id === teamId);
        
        if (teamStats.length === 0) {
          return { error: 'No player stats available' };
        }
        
        // Parse minutes (format: "32" or "32:45")
        const minutesOf = (stat) => parseInt(String(stat.min || '0').split(':')[0]) || 0;

        // The five with the most minutes in each game started it (audit, Oct 13 2026: ranking minutes across a
        // partial page called De'Aaron Fox and Chet Holmgren bench players). A player's role is the one he held
        // in most of his games.
        const byGame = new Map();
        for (const stat of teamStats) {
          const gameId = stat.game?.id;
          if (gameId == null || !stat.player?.id) continue;
          if (!byGame.has(gameId)) byGame.set(gameId, []);
          byGame.get(gameId).push(stat);
        }
        const startedIn = new Set();
        for (const [gameId, rows] of byGame) {
          [...rows].sort((a, b) => minutesOf(b) - minutesOf(a)).slice(0, 5).forEach((r) => startedIn.add(`${gameId}:${r.player.id}`));
        }

        // Aggregate stats by player
        const playerAgg = {};
        for (const stat of teamStats) {
          const playerId = stat.player?.id;
          if (!playerId || stat.game?.id == null) continue;
          
          if (!playerAgg[playerId]) {
            playerAgg[playerId] = {
              name: `${stat.player?.first_name || ''} ${stat.player?.last_name || ''}`.trim(),
              games: 0,
              starts: 0,
              minutes: 0,
              points: 0,
              plusMinus: 0
            };
          }
          
          playerAgg[playerId].games++;
          if (startedIn.has(`${stat.game.id}:${playerId}`)) playerAgg[playerId].starts++;
          playerAgg[playerId].minutes += minutesOf(stat);
          playerAgg[playerId].points += stat.pts || 0;
          playerAgg[playerId].plusMinus += stat.plus_minus || 0;
        }
        
        const players = Object.entries(playerAgg)
          .map(([id, data]) => ({
            id,
            ...data,
            mpg: data.games > 0 ? data.minutes / data.games : 0,
            ppg: data.games > 0 ? data.points / data.games : 0,
            avgPlusMinus: data.games > 0 ? data.plusMinus / data.games : 0
          }))
          .sort((a, b) => b.mpg - a.mpg);
        
        const starters = players.filter((p) => p.starts * 2 > p.games);
        const bench = players.filter((p) => p.starts * 2 <= p.games);
        
        // Calculate aggregates
        // Per game, from each game's own five starters and its bench.
        let starterPts = 0, benchPts = 0, starterMin = 0, benchMin = 0;
        for (const stat of teamStats) {
          if (stat.game?.id == null || !stat.player?.id) continue;
          if (startedIn.has(`${stat.game.id}:${stat.player.id}`)) { starterPts += stat.pts || 0; starterMin += minutesOf(stat); }
          else { benchPts += stat.pts || 0; benchMin += minutesOf(stat); }
        }
        const gamesRead = Math.max(byGame.size, 1);
        const starterPPG = starterPts / gamesRead;
        const benchPPG = benchPts / gamesRead;
        const starterMPG = starterMin / gamesRead;
        const benchMPG = benchMin / gamesRead;
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
          games_analyzed: byGame.size
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

  TURNOVER_MARGIN: async (bdlSport, home, away, season, options) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: isPostseasonOptions(options) }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: isPostseasonOptions(options) })
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
  REST_SITUATION: async (bdlSport, home, away, season, options = {}) => {
    // The router passes its options fifth (audit, Oct 13 2026: the old (gameId, gameDate) signature left the
    // game's date undefined, so rest was measured from the clock).
    const gameDate = options?.gameTime || options?.gameDate;
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
      // BDL season=2025 means 2025-26 season, which starts Oct 2025
      const seasonStart = new Date(season, 9, 1); // Oct 1 of season year
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
      } else if (bdlSport === 'americanfootball_nfl') {
        // BDL's NFL games endpoint ignores start_date/end_date and pages from 2002 (round 2 audit, Oct 13 2026: the
        // tool reported 8,726 days of rest). The season is read whole and the windows are kept here.
        const within = (games, from) => (games || []).filter((g) => {
          const t = Date.parse(g.date || g.datetime || '');
          return Number.isFinite(t) && t >= Date.parse(from) && t < targetDate.getTime();
        });
        const [homeAll, awayAll] = await Promise.all([
          ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 100 }),
          ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 100 }),
        ]);
        // Every earlier game, not a 10-day window: a team off its bye last played two weeks ago.
        homeRecentGames = within(homeAll, '1970-01-01'); awayRecentGames = within(awayAll, '1970-01-01');
        homeSeasonGames = within(homeAll, '1970-01-01'); awaySeasonGames = within(awayAll, '1970-01-01');
      } else {
        // NBA/NCAAB support start_date/end_date
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
            per_page: 100
          }),
          ballDontLieService.getGames(bdlSport, {
            team_ids: [away.id],
            start_date: seasonStartStr,
            end_date: endDateStr,
            per_page: 100
          })
        ]);
      }

      // Use recent games for current rest calculation
      const homeGames = homeRecentGames;
      const awayGames = awayRecentGames;
      
      // Calculate rest for each team
      const calculateRest = (games, teamId, targetDateObj) => {
        const targetDateStr = targetDateObj.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        
        // Helper to get game date (handles both NBA's "date" and NHL's "game_date"). A kickoff timestamp (NFL) is
        // dated in Eastern time: a Sunday night game is Monday in UTC.
        const getGameDateStr = (g) => {
          const raw = String(g.game_date || g.date || '');
          return raw.includes('T') && Number.isFinite(Date.parse(raw))
            ? new Date(raw).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : raw.split('T')[0];
        };
        
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
      // Unknown when either side's rest is unknown, never EVEN by default (audit, Oct 13 2026).
      let restAdvantage = null;
      if (homeRest.daysRest !== null && awayRest.daysRest !== null) {
        restAdvantage = 'EVEN';
        if (homeRest.daysRest > awayRest.daysRest + 1) restAdvantage = 'HOME';
        else if (awayRest.daysRest > homeRest.daysRest + 1) restAdvantage = 'AWAY';
      }
      
      // Format status strings
      const formatStatus = (rest) => {
        if (rest.daysRest === null) return 'No recent games found';
        // A football week is not a basketball night: four days is a short week, not "well-rested".
        if (bdlSport === 'americanfootball_nfl') return `${rest.daysRest} days since the last game`;
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
  // DEFAULT removed Jul 6 2026 — the neutral unknown-token handler lives in
  // statRouters/index.js (per-sport DEFAULTs collided in the merged map).
};
