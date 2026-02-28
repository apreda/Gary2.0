import { getCachedOrFetch, initApi, buildQuery, normalizeName, getCurrentNhlSeason, axios, BALLDONTLIE_API_BASE_URL, API_KEY } from './bdlCore.js';

export const teamStatsMethods = {
  /**
   * NCAAF Rankings
   * GET /ncaaf/v1/rankings?season=<season>
   * Returns AP Poll rankings
   * @param {number} season - Season year (calculated dynamically if not provided)
   * @param {number} week - Optional week number
   * @returns {Array} - Array of ranking objects
   */
  async getNcaafRankings(season = null, week = null, ttlMinutes = 60) {
    // Calculate dynamic NCAAF season: Aug-Feb spans years
    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month <= 7 ? year - 1 : year;
    }
    try {
      const cacheKey = `ncaaf_rankings_${season}_${week || 'current'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const params = { season };
        if (week) params.week = week;
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaaf/v1/rankings${buildQuery(params)}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] ncaaf getNcaafRankings error:', e.message);
      return [];
    }
  },

  /**
   * League leaders (per stat type/season)
   */
  async getLeaders(params = {}, ttlMinutes = 10) {
    try {
      if (!params?.stat_type || !params?.season) {
        throw new Error('stat_type and season are required for getLeaders');
      }
      const cacheKey = `leaders_${params.stat_type}_${params.season}_${JSON.stringify({ ...params, stat_type: undefined, season: undefined })}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/v1/leaders${buildQuery(params)}`;
        const resp = await fetch(url, { headers: { Authorization: API_KEY } });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getLeaders error:', e.message);
      return [];
    }
  },

  /**
   * Get NCAAB standings for specific conferences
   * @param {number} conferenceId - Conference ID from BDL
   * @param {number} season - Season year (e.g., 2024 for 2024-25 season)
   * @returns {Promise<Array>} - Array of standings for teams in that conference
   */
  async getNcaabStandings(conferenceId, season, ttlMinutes = 60) {
    try {
      if (!conferenceId || !season) return [];
      const cacheKey = `ncaab_standings_${conferenceId}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaab/v1/standings?conference_id=${conferenceId}&season=${season}`;
        console.log(`🏀 [Ball Don't Lie] Fetching NCAAB standings for conference ${conferenceId}, season ${season}`);
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return resp.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNcaabStandings error:', e.message);
      return [];
    }
  },

  /**
   * Get all NCAAB conferences with IDs and names
   * Endpoint: /ncaab/v1/conferences
   * @returns {Promise<Array>} - Array of { id, name, short_name }
   */
  async getNcaabConferences(ttlMinutes = 1440) {
    try {
      const cacheKey = 'ncaab_conferences';
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaab/v1/conferences`;
        console.log('🏀 [Ball Don\'t Lie] Fetching NCAAB conferences');
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return resp.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNcaabConferences error:', e.message);
      return [];
    }
  },

  /**
   * Get March Madness bracket data
   * Endpoint: /ncaab/v1/bracket
   * @param {number} season - Season year (e.g., 2024 for 2024-25 tournament)
   * @returns {Promise<Array>} - Array of bracket games with seeds, teams, scores, rounds
   */
  async getNcaabBracket(season, ttlMinutes = 60) {
    try {
      if (!season) return [];
      const cacheKey = `ncaab_bracket_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaab/v1/bracket?season=${season}`;
        console.log(`🏀 [Ball Don\'t Lie] Fetching NCAAB bracket for season ${season}`);
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return resp.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNcaabBracket error:', e.message);
      return [];
    }
  },

  /**
   * Get NCAAB team game-level box scores (per-game team stats)
   * Endpoint: /ncaab/v1/team_stats with date range
   * Returns: FGM, FGA, FG3M, FG3A, FTM, FTA, OREB, DREB, REB, AST, STL, BLK, TOV, FOULS per game
   * @param {number} teamId - BDL team ID
   * @param {number} numGames - Number of recent games to fetch (default 5)
   * @returns {Promise<Object>} - { games: [...], averages: {...}, teamId }
   */
  async getNcaabTeamGameLogs(teamId, numGames = 5, ttlMinutes = 15) {
    try {
      if (!teamId) return { games: [], averages: null, teamId };
      const cacheKey = `ncaab_team_game_logs_${teamId}_${numGames}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Use 45-day lookback to capture ~10-15 games at 2-3 games/week pace
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 45);
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        const url = `${BALLDONTLIE_API_BASE_URL}/ncaab/v1/team_stats?team_ids[]=${teamId}&start_date=${startStr}&end_date=${endStr}&per_page=50`;
        console.log(`🏀 [Ball Don\'t Lie] Fetching NCAAB team game logs for team ${teamId} (${startStr} to ${endStr})`);
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        const allGames = resp.data?.data || [];

        // Sort by date descending and take the most recent N games
        const sorted = allGames.sort((a, b) => new Date(b.game?.date || 0) - new Date(a.game?.date || 0));
        const games = sorted.slice(0, numGames);

        if (games.length === 0) return { games: [], averages: null, teamId };

        // Compute averages
        const sumField = (field) => games.reduce((s, g) => s + (g[field] || 0), 0);
        const n = games.length;
        const averages = {
          fgm: (sumField('fgm') / n).toFixed(1),
          fga: (sumField('fga') / n).toFixed(1),
          fg_pct: (sumField('fg_pct') / n).toFixed(1),
          fg3m: (sumField('fg3m') / n).toFixed(1),
          fg3a: (sumField('fg3a') / n).toFixed(1),
          fg3_pct: (sumField('fg3_pct') / n).toFixed(1),
          ftm: (sumField('ftm') / n).toFixed(1),
          fta: (sumField('fta') / n).toFixed(1),
          ft_pct: (sumField('ft_pct') / n).toFixed(1),
          oreb: (sumField('oreb') / n).toFixed(1),
          dreb: (sumField('dreb') / n).toFixed(1),
          reb: (sumField('reb') / n).toFixed(1),
          ast: (sumField('ast') / n).toFixed(1),
          stl: (sumField('stl') / n).toFixed(1),
          blk: (sumField('blk') / n).toFixed(1),
          tov: (sumField('turnovers') / n).toFixed(1),
          fouls: (sumField('fouls') / n).toFixed(1),
        };

        // Compute Four Factors from L5 averages
        const fgm = parseFloat(averages.fgm);
        const fga = parseFloat(averages.fga);
        const fg3m = parseFloat(averages.fg3m);
        const fta = parseFloat(averages.fta);
        const oreb = parseFloat(averages.oreb);
        const tov = parseFloat(averages.tov);
        averages.efgPct = fga > 0 ? ((fgm + 0.5 * fg3m) / fga * 100).toFixed(1) : null;
        averages.tovRate = fga > 0 ? (tov / (fga + 0.44 * fta + tov) * 100).toFixed(1) : null;
        averages.ftaRate = fga > 0 ? (fta / fga * 100).toFixed(1) : null;

        console.log(`🏀 [Ball Don't Lie] Got ${games.length} NCAAB team game logs for team ${teamId}`);
        return { games, averages, teamId };
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNcaabTeamGameLogs error:', e.message);
      return { games: [], averages: null, teamId };
    }
  },

  /**
   * Get NFL standings for a season
   * @param {number} season - Season year (e.g., 2025)
   * @returns {Promise<Array>} - Array of team standings with record, division, conference
   */
  async getNflStandings(season, ttlMinutes = 60) {
    try {
      if (!season) return [];
      const cacheKey = `nfl_standings_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/standings?season=${season}`;
        console.log(`🏈 [Ball Don't Lie] Fetching NFL standings for ${season} season`);
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return resp.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNflStandings error:', e.message);
      return [];
    }
  },

  /**
   * Get NFL playoff game history for teams this season
   * Returns previous playoff games with box scores for scout report context
   * @param {Array<number>} teamIds - Array of BDL team IDs (home and away)
   * @param {number} season - Season year (e.g., 2025)
   * @returns {Promise<Object>} - { games: [...], teamStats: {...} }
   */
  async getNflPlayoffHistory(teamIds, season, ttlMinutes = 30) {
    try {
      if (!teamIds || teamIds.length === 0 || !season) {
        return { games: [], teamStats: {} };
      }
      
      const cacheKey = `nfl_playoff_history_${teamIds.join('_')}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏈 [Ball Don't Lie] Fetching NFL playoff history for team IDs: ${teamIds.join(', ')} (${season} season)`);
        
        // Fetch playoff games for these teams
        // BDL uses "postseason=true" to filter playoff games
        const params = new URLSearchParams();
        teamIds.forEach(id => params.append('team_ids[]', id));
        params.append('seasons[]', season);
        params.append('postseason', 'true');
        params.append('per_page', '20');
        
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/games?${params.toString()}`;
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        const games = resp.data?.data || [];
        
        // Filter to completed games only (status === 'Final')
        const completedGames = games.filter(g => g.status === 'Final');
        console.log(`🏈 [Ball Don't Lie] Found ${completedGames.length} completed NFL playoff games`);
        
        if (completedGames.length === 0) {
          return { games: [], teamStats: {} };
        }
        
        // Fetch team stats (box scores) and player stats for each game
        const gameIds = completedGames.map(g => g.id);
        const [teamStats, playerStats] = await Promise.all([
          this.getNflTeamStatsByGameIds(gameIds),
          this.getNflPlayerStatsByGameIds(gameIds)
        ]);
        
        // Determine playoff round for each game
        const gamesWithRound = completedGames.map(game => ({
          ...game,
          playoffRound: this._getPlayoffRound(game)
        }));
        
        // Sort by date (most recent first)
        gamesWithRound.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        console.log(`🏈 [Ball Don't Lie] NFL playoff history ready: ${gamesWithRound.length} games with box scores and player stats`);
        
        return {
          games: gamesWithRound,
          teamStats: teamStats,
          playerStats: playerStats
        };
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNflPlayoffHistory error:', e.message);
      return { games: [], teamStats: {} };
    }
  },

  /**
   * Get NFL team stats (box scores) for specific game IDs
   * @param {Array<number>} gameIds - Array of game IDs
   * @returns {Promise<Object>} - Map of gameId -> { homeStats, awayStats }
   */
  async getNflTeamStatsByGameIds(gameIds, ttlMinutes = 30) {
    try {
      if (!gameIds || gameIds.length === 0) return {};
      
      const cacheKey = `nfl_team_stats_games_${gameIds.sort().join(',')}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏈 [Ball Don't Lie] Fetching NFL team stats for ${gameIds.length} games`);
        
        // Build query with game_ids array
        const params = new URLSearchParams();
        gameIds.forEach(id => params.append('game_ids[]', id));
        params.append('per_page', '100');
        
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/team_stats?${params.toString()}`;
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        const stats = resp.data?.data || [];
        
        // Group by game_id -> { home, away }
        const statsByGame = {};
        for (const stat of stats) {
          const gameId = stat.game?.id;
          if (!gameId) continue;
          
          if (!statsByGame[gameId]) {
            statsByGame[gameId] = {};
          }
          
          // Determine if home or away based on home_away field
          if (stat.home_away === 'home') {
            statsByGame[gameId].home = stat;
          } else if (stat.home_away === 'away') {
            statsByGame[gameId].away = stat;
          }
        }
        
        console.log(`🏈 [Ball Don't Lie] Retrieved team stats for ${Object.keys(statsByGame).length} games`);
        return statsByGame;
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNflTeamStatsByGameIds error:', e.message);
      return {};
    }
  },

  /**
   * Get NFL player stats for specific game IDs (for playoff box scores)
   * Returns key performers: QB, leading rusher, top receivers
   * @param {Array<number>} gameIds - Array of game IDs
   * @returns {Promise<Object>} - Map of gameId -> { teamId -> { qb, rb, receivers } }
   */
  async getNflPlayerStatsByGameIds(gameIds, ttlMinutes = 30) {
    try {
      if (!gameIds || gameIds.length === 0) return {};
      
      const cacheKey = `nfl_player_stats_games_${gameIds.sort().join(',')}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏈 [Ball Don't Lie] Fetching NFL player stats for ${gameIds.length} games`);
        
        // Build query with game_ids array
        const params = new URLSearchParams();
        gameIds.forEach(id => params.append('game_ids[]', id));
        params.append('per_page', '100');
        
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/stats?${params.toString()}`;
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        const stats = resp.data?.data || [];
        
        // Group by game_id -> team_id -> key players
        const statsByGame = {};
        
        for (const stat of stats) {
          const gameId = stat.game?.id;
          const teamId = stat.team?.id;
          const teamName = stat.team?.full_name;
          if (!gameId || !teamId) continue;
          
          if (!statsByGame[gameId]) statsByGame[gameId] = {};
          if (!statsByGame[gameId][teamId]) {
            statsByGame[gameId][teamId] = {
              teamName,
              qb: null,
              rushers: [],
              receivers: [],
              defenders: [],
              // Aggregate defensive stats for the team
              teamDefense: {
                sacks: 0,
                interceptions: 0,
                fumbleRecoveries: 0,
                passesDefended: 0,
                tacklesForLoss: 0
              }
            };
          }
          
          const teamStats = statsByGame[gameId][teamId];
          const playerName = `${stat.player?.first_name || ''} ${stat.player?.last_name || ''}`.trim();
          
          // QB: has passing attempts
          if (stat.passing_attempts > 0) {
            teamStats.qb = {
              name: playerName,
              completions: stat.passing_completions || 0,
              attempts: stat.passing_attempts || 0,
              yards: stat.passing_yards || 0,
              tds: stat.passing_touchdowns || 0,
              ints: stat.passing_interceptions || 0,
              rushYards: stat.rushing_yards || 0,
              rushAttempts: stat.rushing_attempts || 0,
              fumbles: stat.fumbles_lost || 0
            };
          }
          
          // Rushers: has rushing attempts (non-QB or significant volume)
          if (stat.rushing_attempts > 3 && (!teamStats.qb || playerName !== teamStats.qb.name)) {
            teamStats.rushers.push({
              name: playerName,
              attempts: stat.rushing_attempts || 0,
              yards: stat.rushing_yards || 0,
              tds: stat.rushing_touchdowns || 0,
              fumbles: stat.fumbles_lost || 0
            });
          }
          
          // Receivers: has receptions
          if (stat.receptions > 0) {
            teamStats.receivers.push({
              name: playerName,
              receptions: stat.receptions || 0,
              yards: stat.receiving_yards || 0,
              tds: stat.receiving_touchdowns || 0
            });
          }
          
          // Defensive playmakers: has interceptions, sacks, or significant tackles
          const hasDefensiveStats = (stat.defensive_interceptions > 0) || 
                                   (stat.defensive_sacks > 0) || 
                                   (stat.fumbles_recovered > 0) ||
                                   (stat.total_tackles >= 8);
          
          if (hasDefensiveStats) {
            teamStats.defenders.push({
              name: playerName,
              position: stat.player?.position_abbreviation || stat.player?.position || '?',
              tackles: stat.total_tackles || 0,
              soloTackles: stat.solo_tackles || 0,
              sacks: stat.defensive_sacks || 0,
              interceptions: stat.defensive_interceptions || 0,
              intYards: stat.interception_yards || 0,
              intTds: stat.interception_touchdowns || 0,
              passesDefended: stat.passes_defended || 0,
              tacklesForLoss: stat.tackles_for_loss || 0,
              fumblesRecovered: stat.fumbles_recovered || 0,
              qbHits: stat.qb_hits || 0
            });
          }
          
          // Aggregate team defensive stats
          teamStats.teamDefense.sacks += (stat.defensive_sacks || 0);
          teamStats.teamDefense.interceptions += (stat.defensive_interceptions || 0);
          teamStats.teamDefense.fumbleRecoveries += (stat.fumbles_recovered || 0);
          teamStats.teamDefense.passesDefended += (stat.passes_defended || 0);
          teamStats.teamDefense.tacklesForLoss += (stat.tackles_for_loss || 0);
        }
        
        // Sort and trim for each team
        for (const gameId of Object.keys(statsByGame)) {
          for (const teamId of Object.keys(statsByGame[gameId])) {
            const team = statsByGame[gameId][teamId];
            // Sort rushers by yards, keep top 2
            team.rushers = team.rushers.sort((a, b) => b.yards - a.yards).slice(0, 2);
            // Sort receivers by yards, keep top 3
            team.receivers = team.receivers.sort((a, b) => b.yards - a.yards).slice(0, 3);
            // Sort defenders by impact (INTs > sacks > tackles), keep top 3
            team.defenders = team.defenders.sort((a, b) => {
              // Prioritize INTs, then sacks, then tackles
              const aScore = (a.interceptions * 100) + (a.sacks * 50) + (a.fumblesRecovered * 50) + a.tackles;
              const bScore = (b.interceptions * 100) + (b.sacks * 50) + (b.fumblesRecovered * 50) + b.tackles;
              return bScore - aScore;
            }).slice(0, 3);
          }
        }
        
        console.log(`🏈 [Ball Don't Lie] Retrieved player stats for ${Object.keys(statsByGame).length} games`);
        return statsByGame;
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNflPlayerStatsByGameIds error:', e.message);
      return {};
    }
  },

  /**
   * Helper to determine NFL playoff round from game data
   * @param {Object} game - Game object from BDL
   * @returns {string} - Playoff round name
   */
  _getPlayoffRound(game) {
    if (!game || !game.postseason) return 'Regular Season';
    
    const date = new Date(game.date);
    const month = date.getMonth() + 1; // 1-12
    const day = date.getDate();
    const week = game.week;
    
    // Super Bowl is typically early February
    if (month === 2 && day >= 1 && day <= 15) return 'Super Bowl';
    
    // Conference Championship is late January (around Jan 25-30)
    if (month === 1 && day >= 24) return 'Conference Championship';
    
    // Divisional Round is mid January (around Jan 16-22)
    if (month === 1 && day >= 16 && day <= 23) return 'Divisional Round';
    
    // Wild Card is early January (around Jan 10-15)
    if (month === 1 && day >= 1 && day <= 15) return 'Wild Card';
    
    // Fallback: use week number if available
    if (week >= 22) return 'Super Bowl';
    if (week >= 21) return 'Conference Championship';
    if (week >= 20) return 'Divisional Round';
    if (week >= 19) return 'Wild Card';
    
    return 'Playoff Game';
  },

  /**
   * Fetch REAL team-level advanced stats from BDL team_season_averages endpoint.
   * Returns: { off_rating, def_rating, net_rating, pace, efg_pct, ts_pct, oreb_pct, dreb_pct, tm_tov_pct, gp, w, l, ... }
   * This is the CORRECT source for team ORtg/DRtg/NetRtg (NOT player weight-averaging).
   */
  async getTeamSeasonAdvanced(teamId, season, ttlMinutes = 30) {
    const cacheKey = `nba_team_season_advanced_${teamId}_${season}`;
    return await getCachedOrFetch(cacheKey, async () => {
      const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/team_season_averages/general?season=${season}&season_type=regular&type=advanced&team_ids[]=${teamId}`;
      const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
      const data = response.data?.data;
      if (!data || data.length === 0) return null;
      return data[0].stats;
    }, ttlMinutes);
  },

  /**
   * Fetch REAL team-level opponent stats from BDL team_season_averages endpoint.
   * Returns: { opp_fgm, opp_fga, opp_fg_pct, opp_fg3m, opp_fg3a, opp_fg3_pct, opp_ftm, opp_fta, opp_ft_pct,
   *            opp_pts, opp_reb, opp_oreb, opp_dreb, opp_ast, opp_tov, opp_stl, opp_blk, gp, ... }
   * This is the CORRECT source for opponent shooting/turnover/FT data (NOT proxy via DRtg or steals).
   */
  async getTeamOpponentStats(teamId, season, ttlMinutes = 30) {
    const cacheKey = `nba_team_opponent_stats_${teamId}_${season}`;
    return await getCachedOrFetch(cacheKey, async () => {
      const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/team_season_averages/general?season=${season}&season_type=regular&type=opponent&team_ids[]=${teamId}`;
      const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
      const data = response.data?.data;
      if (!data || data.length === 0) return null;
      return data[0].stats;
    }, ttlMinutes);
  },

  /**
   * Fetch REAL team-level defense stats from BDL team_season_averages endpoint.
   * Returns: { opp_pts_paint, opp_pts_fb, opp_pts_off_tov, opp_pts_2nd_chance, ... }
   * This gives paint defense, fast break points allowed, etc.
   */
  async getTeamDefenseStats(teamId, season, ttlMinutes = 30) {
    const cacheKey = `nba_team_defense_stats_${teamId}_${season}`;
    return await getCachedOrFetch(cacheKey, async () => {
      const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/team_season_averages/general?season=${season}&season_type=regular&type=defense&team_ids[]=${teamId}`;
      const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
      const data = response.data?.data;
      if (!data || data.length === 0) return null;
      return data[0].stats;
    }, ttlMinutes);
  },

  /**
   * Fetch REAL team-level base stats from BDL team_season_averages endpoint.
   * Returns: { pts, reb, ast, fg_pct, fg3_pct, ft_pct, fgm, fga, fg3m, fg3a, ftm, fta, oreb, dreb, tov, blk, stl, pf, gp, ... }
   * This is the CORRECT source for team-level shooting/counting stats (NOT player aggregation).
   */
  async getTeamBaseStats(teamId, season, ttlMinutes = 30) {
    const cacheKey = `nba_team_base_stats_${teamId}_${season}`;
    return await getCachedOrFetch(cacheKey, async () => {
      const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/team_season_averages/general?season=${season}&season_type=regular&type=base&team_ids[]=${teamId}`;
      const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
      const data = response.data?.data;
      if (!data || data.length === 0) return null;
      return data[0].stats;
    }, ttlMinutes);
  },

  /**
   * Fetch REAL team-level scoring stats from BDL team_season_averages endpoint.
   * Returns: { pct_pts_paint, pct_pts_3pt, pct_pts_ft, pct_pts_2pt, pct_pts_fb, pct_fga_2pt, pct_fga_3pt, pct_ast_fgm, pct_uast_fgm, ... }
   * This is the CORRECT source for team scoring distribution (NOT player weight-averaging).
   */
  async getTeamScoringStats(teamId, season, ttlMinutes = 30) {
    const cacheKey = `nba_team_scoring_stats_${teamId}_${season}`;
    return await getCachedOrFetch(cacheKey, async () => {
      const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/team_season_averages/general?season=${season}&season_type=regular&type=scoring&team_ids[]=${teamId}`;
      const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
      const data = response.data?.data;
      if (!data || data.length === 0) return null;
      return data[0].stats;
    }, ttlMinutes);
  },

  /**
   * Compute L5 team efficiency from player-level box score stats.
   * Returns efficiency metrics (eFG%, TS%, approx ORtg/DRtg/Net Rating) plus
   * per-game player participation for roster context.
   * Supports NBA and NCAAB (both have per-game player_stats endpoints).
   */
  async getTeamL5Efficiency(teamId, gameIds, sportKey = 'basketball_nba', ttlMinutes = 10) {
    try {
      if (!teamId || !gameIds || gameIds.length === 0) return null;

      const endpointMap = {
        basketball_nba: 'nba/v1/stats',
        basketball_ncaab: 'ncaab/v1/player_stats'
      };
      const endpoint = endpointMap[sportKey];
      if (!endpoint) return null;

      const cacheKey = `${sportKey}_l5_efficiency_${teamId}_${gameIds.sort().join('_')}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Fetch all player stats for these game IDs — must paginate (max 100/page, ~36 rows/game)
        let stats = [];
        let cursor = null;
        for (let page = 0; page < 5; page++) { // Safety cap: 5 pages max
          const params = { game_ids: gameIds, per_page: 100 };
          if (cursor) params.cursor = cursor;
          const url = `${BALLDONTLIE_API_BASE_URL}/${endpoint}${buildQuery(params)}`;
          const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
          const pageData = response.data?.data || [];
          stats = stats.concat(pageData);
          cursor = response.data?.meta?.next_cursor;
          if (!cursor || pageData.length === 0) break;
        }

        if (stats.length === 0) return null;

        // Separate team vs opponent stats + track per-game player participation
        const teamTotals = { fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pts: 0, oreb: 0, tov: 0, games: new Set() };
        const oppTotals = { fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pts: 0, oreb: 0, tov: 0, games: new Set() };
        const playersByGame = {}; // gameId → [{ name, playerId, minutes }]

        for (const s of stats) {
          const statTeamId = s.team?.id;
          const isTeam = statTeamId === teamId;
          const target = isTeam ? teamTotals : oppTotals;

          target.fgm += s.fgm || 0;
          target.fga += s.fga || 0;
          target.fg3m += s.fg3m || 0;
          target.fg3a += s.fg3a || 0;
          target.ftm += s.ftm || 0;
          target.fta += s.fta || 0;
          target.pts += s.pts || 0;
          target.oreb += s.oreb || 0;
          target.tov += s.turnover || 0;
          target.games.add(s.game?.id);

          // Track who played per game (team players only)
          if (isTeam) {
            const mins = parseInt(s.min) || 0;
            if (mins > 0) {
              const gid = s.game?.id;
              if (!playersByGame[gid]) playersByGame[gid] = [];
              playersByGame[gid].push({
                name: `${s.player?.first_name || ''} ${s.player?.last_name || ''}`.trim(),
                playerId: s.player?.id,
                minutes: mins
              });
            }
          }
        }

        const gp = teamTotals.games.size;
        if (gp === 0 || teamTotals.fga === 0) return null;

        // Estimate possessions: FGA + 0.44*FTA - OREB + TOV
        const possEst = teamTotals.fga + 0.44 * teamTotals.fta - teamTotals.oreb + teamTotals.tov;
        const oppPossEst = oppTotals.fga + 0.44 * oppTotals.fta - oppTotals.oreb + oppTotals.tov;

        return {
          efficiency: {
            games: gp,
            efg_pct: teamTotals.fga > 0 ? ((teamTotals.fgm + 0.5 * teamTotals.fg3m) / teamTotals.fga * 100).toFixed(1) : null,
            ts_pct: teamTotals.fga > 0 ? (teamTotals.pts / (2 * (teamTotals.fga + 0.44 * teamTotals.fta)) * 100).toFixed(1) : null,
            approx_ortg: possEst > 0 ? (teamTotals.pts / possEst * 100).toFixed(1) : null,
            approx_drtg: oppPossEst > 0 ? (oppTotals.pts / oppPossEst * 100).toFixed(1) : null,
            approx_net_rtg: (possEst > 0 && oppPossEst > 0) ? ((teamTotals.pts / possEst * 100) - (oppTotals.pts / oppPossEst * 100)).toFixed(1) : null,
            ppg: (teamTotals.pts / gp).toFixed(1),
            opp_ppg: (oppTotals.pts / gp).toFixed(1),
            opp_efg_pct: oppTotals.fga > 0 ? ((oppTotals.fgm + 0.5 * oppTotals.fg3m) / oppTotals.fga * 100).toFixed(1) : null,
            opp_fg3_pct: oppTotals.fg3a > 0 ? (oppTotals.fg3m / oppTotals.fg3a * 100).toFixed(1) : null,
            tov_per_game: (teamTotals.tov / gp).toFixed(1)
          },
          playersByGame
        };
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] getTeamL5Efficiency error for team ${teamId}:`, e.message);
      return null;
    }
  },

  async getTeamStats(sportKey, params = {}, ttlMinutes = 10) {
    try {
      const cacheKey = `${sportKey}_team_stats_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        const fn = sport?.getTeamStats || sport?.getStats;
        if (fn) {
          const resp = await fn.call(sport, params);
          return resp?.data || [];
        }
        // HTTP fallback for college sports where SDK may not expose team stats
        const endpointMap = {
          americanfootball_nfl: 'nfl/v1/team_stats',
          americanfootball_ncaaf: 'ncaaf/v1/team_stats',
          basketball_ncaab: 'ncaab/v1/team_stats'
        };
        const path = endpointMap[sportKey];
        if (!path) throw new Error('team stats not supported');
        const qs = buildQuery(params);
        const url = `https://api.balldontlie.io/${path}${qs}`;
        const resp = await fetch(url, {
          headers: { Authorization: API_KEY }
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getTeamStats error:`, e.message);
      return [];
    }
  },

  async getStandingsGeneric(sportKey, params = {}, ttlMinutes = 30) {
    try {
      // NCAAB/NCAAF standings require conference_id — use getNcaabStandings() instead
      if (sportKey === 'basketball_ncaab' || sportKey === 'americanfootball_ncaaf') {
        return [];
      }
      const cacheKey = `${sportKey}_standings_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        if (sport?.getStandings) {
          const resp = await sport.getStandings(params);
          return resp?.data || [];
        }
        // HTTP fallback
        const endpointMap = {
          basketball_nba: 'nba/v1/standings',
          basketball_ncaab: 'ncaab/v1/standings',
          icehockey_nhl: 'nhl/v1/standings',
          americanfootball_nfl: 'nfl/v1/standings',
          americanfootball_ncaaf: 'ncaaf/v1/standings',
          baseball_mlb: 'mlb/v1/standings'
        };
        const path = endpointMap[sportKey];
        if (!path) throw new Error('getStandings not supported');
        const qs = buildQuery(params);
        const url = `https://api.balldontlie.io/${path}${qs}`;
        const resp = await fetch(url, { headers: { Authorization: API_KEY } });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getStandings error:`, e.message);
      return [];
    }
  },

  /**
   * Team season stats by sport (HTTP fallbacks where needed)
   * NBA: use standings/leaders as proxy (no direct season stats endpoint documented)
   * NHL: /nhl/v1/teams/:id/season_stats
   * NFL: /nfl/v1/team_season_stats
   * NCAAB: /ncaab/v1/team_season_stats
   * NCAAF: not documented as team season stats; use team_stats and standings as proxy
   */
  async getTeamSeasonStats(sportKey, { teamId, season, postseason = false } = {}, ttlMinutes = 30) {
    try {
      const cacheKey = `${sportKey}_team_season_stats_${teamId}_${season}_${postseason}`;
      return await getCachedOrFetch(cacheKey, async () => {
        if (!teamId || !season) return [];
        // NHL team season stats
        // BDL returns array of {name, value} pairs - convert to flat object for consistency
        if (sportKey === 'icehockey_nhl') {
          const url = `https://api.balldontlie.io/nhl/v1/teams/${encodeURIComponent(teamId)}/season_stats${buildQuery({ season, postseason })}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${text}`);
          }
          const json = await resp.json().catch(() => ({}));
          const statsArray = Array.isArray(json?.data) ? json.data : [];
          
          // Convert [{name: 'goals_for_per_game', value: 3.1}, ...] to {goals_for_per_game: 3.1, ...}
          // This makes it consistent with other sports and easier to access in Tale of the Tape
          const statsObject = {};
          for (const stat of statsArray) {
            if (stat.name && stat.value !== undefined) {
              statsObject[stat.name] = stat.value;
            }
          }
          console.log(`[Ball Don't Lie] NHL team ${teamId} season stats: ${Object.keys(statsObject).length} fields loaded`);
          return statsObject;
        }
        // NFL team season stats
        if (sportKey === 'americanfootball_nfl') {
          const url = `https://api.balldontlie.io/nfl/v1/team_season_stats${buildQuery({ season, team_ids: [teamId], postseason })}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${text}`);
          }
          const json = await resp.json().catch(() => ({}));
          return Array.isArray(json?.data) ? json.data : [];
        }
        // NCAAB team season stats
        if (sportKey === 'basketball_ncaab') {
          const url = `https://api.balldontlie.io/ncaab/v1/team_season_stats${buildQuery({ season, team_ids: [teamId] })}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${text}`);
          }
          const json = await resp.json().catch(() => ({}));
          return Array.isArray(json?.data) ? json.data : [];
        }
        // NBA: merge from dedicated advanced + base methods
        if (sportKey === 'basketball_nba') {
          const [advanced, base] = await Promise.all([
            this.getTeamSeasonAdvanced(teamId, season),
            this.getTeamBaseStats(teamId, season)
          ]);
          return [{ ...base, ...advanced }];
        }
        // NCAAF: use dedicated team_season_stats per dev docs
        if (sportKey === 'americanfootball_ncaaf') {
          const url = `https://api.balldontlie.io/ncaaf/v1/team_season_stats${buildQuery({ season, team_ids: [teamId], per_page: 100 })}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${text}`);
          }
          const json = await resp.json().catch(() => ({}));
          return Array.isArray(json?.data) ? json.data : [];
        }
        return [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getTeamSeasonStats error:`, e.message);
      return [];
    }
  },

  /**
   * Team season stats - generic batch version for multiple team IDs
   * More flexible API that matches the MCP function signature
   * NFL: /nfl/v1/team_season_stats?team_ids[]=X&team_ids[]=Y&season=XXXX
   */
  async getTeamSeasonStatsGeneric(sportKey, { team_ids = [], season, postseason = false } = {}, ttlMinutes = 30) {
    try {
      if (!team_ids || team_ids.length === 0 || !season) {
        return [];
      }
      
      const cacheKey = `${sportKey}_team_season_stats_batch_${team_ids.join('_')}_${season}_${postseason}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Build query with team_ids array
        const params = new URLSearchParams();
        team_ids.forEach(id => params.append('team_ids[]', id));
        params.append('season', season);
        if (postseason) params.append('postseason', 'true');
        
        let endpoint = null;
        if (sportKey === 'americanfootball_nfl') {
          endpoint = 'nfl/v1/team_season_stats';
        } else if (sportKey === 'americanfootball_ncaaf') {
          endpoint = 'ncaaf/v1/team_season_stats';
        } else if (sportKey === 'basketball_ncaab') {
          endpoint = 'ncaab/v1/team_season_stats';
        } else {
          console.warn(`[Ball Don't Lie] getTeamSeasonStatsGeneric not supported for ${sportKey}`);
          return [];
        }
        
        const url = `https://api.balldontlie.io/${endpoint}?${params.toString()}`;
        console.log(`[Ball Don't Lie] Fetching team season stats: ${url}`);
        
        const resp = await fetch(url, { headers: { Authorization: API_KEY } });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getTeamSeasonStatsGeneric error:`, e.message);
      return [];
    }
  },

  /**
   * Leaders endpoints (NBA/NHL/NCAAB) via HTTP fallback
   */
  async getLeadersGeneric(sportKey, { season, type, postseason = false } = {}, ttlMinutes = 30) {
    try {
      const cacheKey = `${sportKey}_leaders_${season}_${type}_${postseason}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const endpointMap = {
          basketball_nba: 'nba/v1/leaders', // if available; otherwise use player_stats/leaders
          basketball_ncaab: 'ncaab/v1/player_stats/leaders',
          icehockey_nhl: 'nhl/v1/player_stats/leaders',
          icehockey_nhl_team: 'nhl/v1/team_stats/leaders'
        };
        let path = endpointMap[sportKey] || null;
        // Allow special alias for NHL team leaders
        if (!path && sportKey === 'icehockey_nhl_team') path = endpointMap.icehockey_nhl_team;
        if (!path) return [];
        const url = `https://api.balldontlie.io/${path}${buildQuery({ season, type, postseason })}`;
        const resp = await fetch(url, { headers: { Authorization: API_KEY } });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getLeaders error:`, e.message);
      return [];
    }
  },

  /**
   * Rankings endpoints (NCAAB) via HTTP fallback
   * Returns AP and Coaches poll rankings
   */
  async getRankingsGeneric(sportKey, { season, week } = {}, ttlMinutes = 30) {
    try {
      const cacheKey = `${sportKey}_rankings_${season}_${week || 'latest'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Only NCAAB has rankings endpoint
        if (sportKey !== 'basketball_ncaab') {
          console.log(`[Ball Don't Lie] Rankings not available for ${sportKey}`);
          return [];
        }
        const params = { season };
        if (week) params.week = week;
        const url = `https://api.balldontlie.io/ncaab/v1/rankings${buildQuery(params)}`;
        const resp = await fetch(url, { headers: { Authorization: API_KEY } });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getRankings error:`, e.message);
      return [];
    }
  },

  deriveNhlTeamRates(teamSeasonStats) {
    // teamSeasonStats is a flat object from getTeamSeasonStats (e.g. {goals_for_per_game: 3.1, ...})
    if (!teamSeasonStats || typeof teamSeasonStats !== 'object') return {};
    const map = teamSeasonStats;
    return {
      ppPct: map.power_play_percentage,
      pkPct: map.penalty_kill_percentage,
      shotsForPerGame: map.shots_for_per_game,
      shotsAgainstPerGame: map.shots_against_per_game,
      faceoffWinPct: map.faceoff_win_percentage,
      goalsForPerGame: map.goals_for_per_game,
      goalsAgainstPerGame: map.goals_against_per_game
    };
  },

  deriveNflTeamRates(teamSeason) {
    // teamSeason is array of season records fields; build map
    if (!Array.isArray(teamSeason) || teamSeason.length === 0) return {};
    const first = teamSeason[0];
    const map = {};
    // Flatten name/value pairs or direct fields
    if (first.name && typeof first.value !== 'undefined') {
      teamSeason.forEach(r => { map[r.name] = r.value; });
    } else {
      Object.assign(map, first);
    }
    // Derived
    // Yards per play with robust fallbacks
    const yppDirect = map.yards_per_play ?? map.offensive_yards_per_play ?? undefined;
    const yppNum = (num) => (typeof num === 'number' && isFinite(num)) ? num : undefined;
    let yardsPerPlay = yppNum(yppDirect);
    if (yardsPerPlay == null) {
      const totalY = map.net_total_offensive_yards ?? map.total_offensive_yards ?? map.total_yards;
      const plays = map.total_offensive_plays ?? map.offensive_plays ?? map.total_plays;
      yardsPerPlay = (typeof totalY === 'number' && typeof plays === 'number' && plays > 0) ? (totalY / plays) : undefined;
    }
    // Opponent yards per play
    const oppYppDirect = map.opp_yards_per_play ?? map.defensive_yards_per_play ?? undefined;
    let oppYardsPerPlay = yppNum(oppYppDirect);
    if (oppYardsPerPlay == null) {
      const oTotalY = map.opp_net_total_offensive_yards ?? map.opp_total_offensive_yards ?? map.opp_total_yards;
      const oPlays = map.opp_total_offensive_plays ?? map.opp_offensive_plays ?? map.opp_total_plays;
      oppYardsPerPlay = (typeof oTotalY === 'number' && typeof oPlays === 'number' && oPlays > 0) ? (oTotalY / oPlays) : undefined;
    }
    // Red-zone proxies if exposed by API
    // Red zone proxies (favor scoring percentage if provided)
    let redZoneOffProxy = undefined;
    if (typeof map.red_zone_scoring_percentage === 'number') redZoneOffProxy = map.red_zone_scoring_percentage;
    else if (typeof map.red_zone_scores !== 'undefined') redZoneOffProxy = (map.red_zone_scores / (map.red_zone_attempts || 1));
    let redZoneDefProxy = undefined;
    if (typeof map.opp_red_zone_scoring_percentage === 'number') redZoneDefProxy = map.opp_red_zone_scoring_percentage;
    else if (typeof map.opp_red_zone_scores !== 'undefined') redZoneDefProxy = (map.opp_red_zone_scores / (map.opp_red_zone_attempts || 1));
    // Very rough pass-proxy: sacks allowed per dropback ~ sacksAllowed / (passAttempts + sacksAllowed)
    const sacksAllowed = map.misc_sacks_allowed ?? map.sacks_allowed ?? map.offensive_sacks_allowed ?? undefined;
    const passAtt = map.passing_attempts ?? map.pass_attempts ?? map.offensive_pass_attempts ?? undefined;
    const sacksAllowedPerDropback = (typeof sacksAllowed === 'number' && typeof passAtt === 'number' && (passAtt + sacksAllowed) > 0)
      ? sacksAllowed / (passAtt + sacksAllowed)
      : undefined;
    // Very rough defensive pressure proxy: team sacks per opp dropback ~ sacks / (opp pass att + sacks)
    const defSacks = map.sacks ?? map.defensive_sacks ?? map.team_sacks ?? undefined;
    const oppPassAtt = map.opp_passing_attempts ?? map.opp_pass_attempts ?? map.defensive_opponent_pass_attempts ?? undefined;
    const defSackRateProxy = (typeof defSacks === 'number' && typeof oppPassAtt === 'number' && (oppPassAtt + defSacks) > 0)
      ? defSacks / (oppPassAtt + defSacks)
      : undefined;
    return {
      pointsPerGame: map.total_points_per_game,
      oppPointsPerGame: map.opp_total_points_per_game,
      yardsPerPlay,
      oppYardsPerPlay,
      thirdDownPct: map.misc_third_down_conv_pct ?? map.third_down_conversion_percentage ?? map.third_down_pct,
      fourthDownPct: map.misc_fourth_down_conv_pct ?? map.fourth_down_conversion_percentage ?? map.fourth_down_pct,
      redZoneProxy: redZoneOffProxy,
      redZoneDefProxy,
      turnoverDiff: map.misc_turnover_differential,
      sacksAllowedPerDropback,
      defSackRateProxy
    };
  },

  /**
   * Get NBA team standings for current season
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Array>} - Array of team standings
   */
  async getNbaStandings(season = new Date().getFullYear()) {
    // Caller is responsible for passing the correct season year
    // (e.g., 2025 for the 2024-25 NBA season)
    const actualSeason = season;

    try {
      const cacheKey = `nba_standings_${actualSeason}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏀 Fetching NBA standings for ${actualSeason} season`);
        const client = initApi();
        
        const response = await client.nba.getStandings({
          season: actualSeason
        });
        
        return response.data || [];
      }, 60); // Cache for 60 minutes
    } catch (error) {
      console.error('Error fetching NBA standings:', error);
      return [];
    }
  },

  /**
   * Get NHL team standings for current season
   * Uses BDL's /nhl/v1/standings endpoint
   * @param {number} season - Season year (defaults to current NHL season)
   * @returns {Promise<Array>} - Array of team standings with points, record, streaks
   */
  async getNhlStandings(season = getCurrentNhlSeason()) {
    try {
      const cacheKey = `nhl_standings_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏒 Fetching NHL standings for ${season} season`);
        
        const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/standings${buildQuery({ season })}`;
        const response = await axios.get(url, { headers: { Authorization: API_KEY } });
        
        return response.data?.data || [];
      }, 60); // Cache for 60 minutes
    } catch (error) {
      console.error('Error fetching NHL standings:', error.message);
      return [];
    }
  },
};
