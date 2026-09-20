import { getCachedOrFetch, initApi, BALLDONTLIE_API_BASE_URL, buildQuery, bdlHttp, API_KEY } from './transport.js';
import { recordPickDataFailure } from '../pickDataIntegrity.js';

// Endpoint methods execute on the shared public service (preserving this calls).
export const nbaTeamsMethods = {

  /**
   * Get NBA roster depth for two teams - top 10 players per team with base + advanced stats
   * Used for scout report to show Gary the full rotation (starters + key bench)
   * Includes: base stats (PPG, RPG, APG) + advanced stats (eFG%, TS%, +/-, net_rating, usage)
   * @param {string} homeTeamName - Home team name
   * @param {string} awayTeamName - Away team name
   * @param {number} season - Season year (e.g., 2025 for 2025-26 season)
   * @returns {Promise<Object>} - { home: [...], away: [...] } arrays of player stats with advanced metrics
   */
  async getNbaRosterDepth(homeTeamName, awayTeamName, season, ttlMinutes = 30) {
    try {
      console.log(`🏀 [Ball Don't Lie] Fetching NBA roster depth for ${awayTeamName} @ ${homeTeamName} (${season} season)`);

      // Get team IDs first
      const [homeTeam, awayTeam] = await Promise.all([
        this.getTeamByName(homeTeamName),
        this.getTeamByName(awayTeamName)
      ]);

      if (!homeTeam?.id || !awayTeam?.id) {
        console.warn(`[Ball Don't Lie] Could not find team IDs for ${homeTeamName} or ${awayTeamName}`);
        return { home: [], away: [] };
      }

      console.log(`🏀 [Ball Don't Lie] Team IDs: ${homeTeam.full_name} (${homeTeam.id}) vs ${awayTeam.full_name} (${awayTeam.id})`);

      const cacheKey = `nba_roster_depth_${homeTeam.id}_${awayTeam.id}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const [homePlayers, awayPlayers] = await Promise.all([
          this.getActivePlayersComplete('basketball_nba', homeTeam.id),
          this.getActivePlayersComplete('basketball_nba', awayTeam.id),
        ]);
        if (!homePlayers.length || !awayPlayers.length) throw new Error('NBA active roster missing for one or both teams');

        const allPlayers = [...homePlayers, ...awayPlayers];
        console.log(`🏀 [Ball Don't Lie] Found ${allPlayers.length} active players (${homePlayers.length} + ${awayPlayers.length})`);

        // Get all player IDs for season averages fetch
        const allPlayerIds = allPlayers.map(p => p.id);

        if (allPlayerIds.length === 0) {
          return { home: [], away: [] };
        }

        // Fetch base, advanced, AND usage season averages in parallel
        console.log(`🏀 [Ball Don't Lie] Fetching base + advanced + usage season averages for ${allPlayerIds.length} players...`);
        const [baseAverages, advancedAverages, usageAverages] = await Promise.all([
          // Base stats: pts, reb, ast, min, fg_pct, etc.
          this.getNbaSeasonAverages({
            category: 'general',
            type: 'base',
            season,
            season_type: 'regular',
            player_ids: allPlayerIds
          }),
          // Advanced stats: efg_pct, ts_pct, off_rating, def_rating, net_rating, usg_pct, pace, pie
          this.getNbaSeasonAverages({
            category: 'general',
            type: 'advanced',
            season,
            season_type: 'regular',
            player_ids: allPlayerIds
          }),
          // Usage/team-share stats: pct_pts, pct_fga, pct_reb, pct_ast, pct_stl, pct_blk, pct_tov, pct_fta
          this.getNbaSeasonAverages({
            category: 'general',
            type: 'usage',
            season,
            season_type: 'regular',
            player_ids: allPlayerIds
          })
        ]);

        // Filter out players with 0 games played (haven't actually played this season)
        const relevantBaseAverages = baseAverages.filter(avg => (avg.stats?.gp ?? 0) > 0);
        console.log(`🏀 [Ball Don't Lie] Got base averages for ${relevantBaseAverages.length} players, advanced for ${advancedAverages.length} players, usage for ${(usageAverages || []).length} players`);

        // Build maps of player ID -> stats
        const baseStatsMap = {};
        for (const avg of relevantBaseAverages) {
          if (avg.player?.id) {
            baseStatsMap[avg.player.id] = {
              pts: avg.stats?.pts ?? 0,
              reb: avg.stats?.reb ?? 0,
              ast: avg.stats?.ast ?? 0,
              min: avg.stats?.min ?? 0,
              stl: avg.stats?.stl ?? 0,
              blk: avg.stats?.blk ?? 0,
              fg_pct: avg.stats?.fg_pct ?? 0,
              fg3_pct: avg.stats?.fg3_pct || 0,
              fgm: avg.stats?.fgm ?? 0,
              fga: avg.stats?.fga ?? 0,
              fg3m: avg.stats?.fg3m || 0,
              fta: avg.stats?.fta ?? 0,
              ftm: avg.stats?.ftm ?? 0,
              tov: avg.stats?.turnover ?? avg.stats?.tov ?? 0,
              oreb: avg.stats?.oreb ?? 0,
              dreb: avg.stats?.dreb ?? 0,
              gp: avg.stats?.gp ?? 0,
              plus_minus: avg.stats?.plus_minus ?? 0
            };
          }
        }

        // Build advanced stats map
        const advStatsMap = {};
        for (const avg of advancedAverages) {
          if (avg.player?.id) {
            advStatsMap[avg.player.id] = {
              efg_pct: avg.stats?.efg_pct ?? 0,
              ts_pct: avg.stats?.ts_pct ?? 0,
              off_rating: avg.stats?.off_rating ?? avg.stats?.offensive_rating ?? 0,
              def_rating: avg.stats?.def_rating ?? avg.stats?.defensive_rating ?? 0,
              net_rating: avg.stats?.net_rating ?? 0,
              usg_pct: avg.stats?.usg_pct ?? avg.stats?.usage_pct ?? 0,
              pace: avg.stats?.pace ?? 0,
              pie: avg.stats?.pie ?? 0
            };
          }
        }

        // Build usage/team-share stats map (pct_pts, pct_fga, pct_reb, pct_ast, etc.)
        const usageStatsMap = {};
        for (const avg of (usageAverages || [])) {
          if (avg.player?.id) {
            usageStatsMap[avg.player.id] = {
              pct_pts: avg.stats?.pct_pts ?? 0,
              pct_fga: avg.stats?.pct_fga ?? 0,
              pct_reb: avg.stats?.pct_reb ?? 0,
              pct_ast: avg.stats?.pct_ast ?? 0,
              pct_stl: avg.stats?.pct_stl ?? 0,
              pct_blk: avg.stats?.pct_blk ?? 0,
              pct_tov: avg.stats?.pct_tov ?? 0,
              pct_fta: avg.stats?.pct_fta ?? 0
            };
          }
        }

        // Helper to format player with base + advanced + usage stats
        const formatPlayer = (player) => {
          const base = baseStatsMap[player.id] || {};
          const adv = advStatsMap[player.id] || {};
          const usg = usageStatsMap[player.id] || {};

          // Calculate eFG% if not provided: eFG% = (FGM + 0.5 * FG3M) / FGA
          let efgPct = adv.efg_pct ?? null;
          if (!efgPct && base.fga > 0) {
            efgPct = (base.fgm + 0.5 * base.fg3m) / base.fga;
          }

          return {
            source_records: {
              player, season,
              base: baseAverages.find(row => row.player?.id === player.id) ?? null,
              advanced: advancedAverages.find(row => row.player?.id === player.id) ?? null,
              usage: usageAverages.find(row => row.player?.id === player.id) ?? null,
            },
            id: player.id,
            name: `${player.first_name} ${player.last_name}`,
            position: player.position || '?',
            jersey: player.jersey_number || '?',
            // Base stats
            pts: base.pts ?? null,
            reb: base.reb ?? null,
            ast: base.ast ?? null,
            min: base.min ?? null,
            stl: base.stl ?? null,
            blk: base.blk ?? null,
            fg_pct: base.fg_pct ?? null,
            fg3_pct: base.fg3_pct || 0,
            gp: base.gp ?? null,
            plus_minus: base.plus_minus ?? null,
            tov: base.tov ?? null,
            oreb: base.oreb ?? null,
            // Advanced stats
            efg_pct: efgPct,
            ts_pct: adv.ts_pct ?? null,
            off_rating: adv.off_rating ?? null,
            def_rating: adv.def_rating ?? null,
            net_rating: adv.net_rating ?? null,
            usg_pct: adv.usg_pct ?? null,
            pace: adv.pace ?? null,
            pie: adv.pie ?? null,
            // Team-share percentages (from type=usage endpoint)
            pct_pts: usg.pct_pts ?? null,
            pct_fga: usg.pct_fga ?? null,
            pct_reb: usg.pct_reb ?? null,
            pct_ast: usg.pct_ast ?? null,
            pct_stl: usg.pct_stl ?? null,
            pct_blk: usg.pct_blk ?? null,
            pct_tov: usg.pct_tov ?? null,
            pct_fta: usg.pct_fta ?? null
          };
        };

        // Format, filter players with actual minutes (>5 min avg), and sort by minutes (top 10 per team)
        const homeRoster = homePlayers
          .map(formatPlayer)
          .filter(p => p.min > 5 || p.gp > 0) // Must have some playing time
          .sort((a, b) => b.min - a.min);

        const awayRoster = awayPlayers
          .map(formatPlayer)
          .filter(p => p.min > 5 || p.gp > 0) // Must have some playing time
          .sort((a, b) => b.min - a.min);

        console.log(`🏀 [Ball Don't Lie] Roster depth ready: ${homeTeam.name} (${homeRoster.length} players), ${awayTeam.name} (${awayRoster.length} players)`);

        return {
          home: homeRoster,
          away: awayRoster,
          homeTeamName: homeTeam.full_name,
          awayTeamName: awayTeam.full_name,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id
        };
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNbaRosterDepth', e);
      console.error('[Ball Don\'t Lie] getNbaRosterDepth error:', e.message);
      return { home: [], away: [] };
    }
  },
  
  /**
   * Get all NBA teams
   * @returns {Promise<Array>} - Array of NBA team objects
   */
  async getNbaTeams() {
    try {
      const cacheKey = 'nba_teams';
      return await getCachedOrFetch(cacheKey, async () => {
        console.log('Fetching NBA teams from BallDontLie API');
        const client = initApi();
        const response = await client.nba.getTeams();
        return response.data || [];
      }, 60); // Cache for 60 minutes since teams don't change often
    } catch (error) {
      recordPickDataFailure('BDL:getNbaTeams', error);
      console.error('Error fetching NBA teams:', error);
      return [];
    }
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
      recordPickDataFailure('BDL:getNbaStandings', error);
      console.error('Error fetching NBA standings:', error);
      return [];
    }
  },

  /**
   * Get NBA games for a specific date to find game IDs
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of NBA game objects with IDs
   */
  async getNbaGamesForDate(dateStr) {
    try {
      const cacheKey = `nba_games_${dateStr}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/games${buildQuery({ dates: [dateStr], per_page: 50 })}`;
        console.log(`[Ball Don't Lie] Fetching NBA games for ${dateStr}`);

        const response = await bdlHttp.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const games = response.data?.data || [];
        console.log(`[Ball Don't Lie] Found ${games.length} NBA games for ${dateStr}`);
        return games;
      }, 5); // Cache for 5 minutes
    } catch (error) {
      recordPickDataFailure('BDL:getNbaGamesForDate', error);
      console.error(`[Ball Don't Lie] NBA games error:`, error?.response?.data || error.message);
      return [];
    }
  },
};
