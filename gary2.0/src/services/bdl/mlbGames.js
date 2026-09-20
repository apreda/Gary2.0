import { getCachedOrFetch, BALLDONTLIE_API_BASE_URL, buildQuery, bdlHttp, API_KEY } from './transport.js';
import { recordPickDataFailure } from '../pickDataIntegrity.js';
import { fetchBdlPages } from '../bdlPagination.js';

// Endpoint methods execute on the shared public service (preserving this calls).
export const mlbGamesMethods = {

  /**
   * Get MLB games for a specific date
   */
  async getMlbGamesForDate(dateStr, { throwOnError = false } = {}) {
    try {
      const cacheKey = `mlb_games_${dateStr}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/mlb/v1/games${buildQuery({ dates: [dateStr], per_page: 50 })}`;
        console.log(`[BDL] Fetching MLB games for ${dateStr}`);
        const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        const games = response.data?.data || [];
        console.log(`[BDL] Found ${games.length} MLB games for ${dateStr}`);
        return games;
      }, 5);
    } catch (error) {
      recordPickDataFailure('BDL:getMlbGamesForDate', error);
      console.error(`[BDL] MLB games error:`, error?.response?.data || error.message);
      // A failed fetch is not an empty slate: strict callers must see the failure.
      if (throwOnError) throw error;
      return [];
    }
  },

  /**
   * MLB games whose real ET calendar date === dateStr. BDL indexes games by UTC
   * instant, so an 8pm+ ET (incl. West-Coast) game files under TOMORROW's UTC date;
   * a single-date fetch drops those late games AND leaks last night's late games in.
   * Fetch BOTH UTC days, dedupe by id, and keep only games whose ET date matches.
   * (Same fix as poll-live-scores.js / generateInsightConnections.js — the shared
   * home so every slate-anchored caller stays in sync.)
   */
  async getMlbGamesForETDate(dateStr, { throwOnError = false } = {}) {
    const next = new Date(`${dateStr}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const nextStr = next.toISOString().slice(0, 10);
    const [d1, d2] = await Promise.all([
      this.getMlbGamesForDate(dateStr, { throwOnError }),
      this.getMlbGamesForDate(nextStr, { throwOnError }),
    ]);
    const seen = new Set();
    const out = [];
    for (const g of [...(d1 || []), ...(d2 || [])]) {
      if (!g || g.id == null || seen.has(g.id)) continue;
      const iso = g.date;
      if (!iso) continue;
      if (new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) !== dateStr) continue;
      seen.add(g.id);
      out.push(g);
    }
    return out;
  },

  /**
   * Get MLB pre-game lineups (batting order + probable pitchers) from BDL.
   * Returns { home: { batters: [...], pitcher: {...} }, away: { ... } }
   * Batters include: name, position, battingOrder, batsThrows
   * Pitcher includes: name, batsThrows, position
   */
  /**
   * THE TAPE (Jul 26 2026): a finished game's scoring flow — every play where
   * the score changed, with inning and running score. Sourced from the Games
   * endpoint's curated `scoring_summary` field (one request; replaced the
   * original 14-page plays crawl the same day once the docs showed the field
   * rides on game rows). Final games are immutable → cached for a week.
   */
  async getMlbGameScoringFlow(gameId) {
    if (!gameId) return null;
    const cacheKey = `mlb_scoring_flow_v3_${gameId}`;
    return await getCachedOrFetch(cacheKey, async () => {
      const url = `${BALLDONTLIE_API_BASE_URL}/mlb/v1/games/${gameId}`;
      const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
      const summary = response.data?.data?.scoring_summary;
      if (!Array.isArray(summary) || summary.length === 0) return [];
      return summary.map(p => {
        const half = String(p.inning || '').toLowerCase().startsWith('t') ? 'T' : 'B';
        const num = String(p.period || '').replace(/\D/g, '') || '?';
        return `[${half}${num}] ${String(p.play || '').trim()} (${p.away_score}-${p.home_score})`;
      });
    }, 7 * 24 * 60); // final games never change
  },

  /**
   * Get MLB team standings (GOAT tier)
   * Returns: W-L, home/away, L10, streak, division GB, wildcard, win%, etc.
   */
  async getMlbStandings(season, ttlMinutes = 30) {
    try {
      if (!season) season = new Date().getFullYear();
      const cacheKey = `mlb_standings_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/mlb/v1/standings${buildQuery({ season })}`;
        console.log(`[BDL] Fetching MLB standings for ${season}`);
        const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        const standings = response.data?.data || [];
        console.log(`[BDL] MLB standings: ${standings.length} teams`);
        return standings;
      }, ttlMinutes);
    } catch (error) {
      recordPickDataFailure('BDL:getMlbStandings', error);
      console.error(`[BDL] MLB standings error:`, error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * Get MLB per-game player stats (box score data)
   * Returns: AB, H, HR, RBI, BB, K, AVG, OBP, SLG + pitching stats for pitchers
   */
  async getMlbGameStats({ gameIds, playerIds, seasons, throwOnError = false } = {}, ttlMinutes = 30) {
    try {
      const params = {};
      if (gameIds?.length) params.game_ids = gameIds;
      if (playerIds?.length) params.player_ids = playerIds;
      if (seasons?.length) params.seasons = seasons;
      const cacheKey = `mlb_game_stats_v2_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const stats = await fetchBdlPages(async cursor => {
          const pageParams = { ...params, per_page: 100 };
          if (cursor != null) pageParams.cursor = cursor;
          const url = `${BALLDONTLIE_API_BASE_URL}/mlb/v1/stats${buildQuery(pageParams)}`;
          return (await bdlHttp.get(url, { headers: { Authorization: API_KEY } })).data;
        }, { label: 'MLB game stats' });
        console.log(`[BDL] MLB game stats: ${stats.length} records`);
        return stats;
      }, ttlMinutes);
    } catch (error) {
      recordPickDataFailure('BDL:getMlbGameStats', error);
      console.error(`[BDL] MLB game stats error:`, error?.response?.data || error.message);
      if (throwOnError) throw error;
      return [];
    }
  },

  /**
   * Season game index: game_id -> { date, status, seasonType, postseason }.
   * /mlb/v1/stats rows carry only game_id (no date), and /mlb/v1/games
   * IGNORES ids[] filters (verified live June 3 2026 — it returned year-2000
   * spring games), so chronology joins go through this one cached index.
   */
  /**
   * All of one team's games across several seasons (Jul 22 2026, fan-parity:
   * historic head-to-head). Cursor-paginated; prior seasons are immutable so
   * the cache TTL is long. Rows come back raw (season_type includes
   * spring_training — callers filter).
   */
  async getMlbTeamGamesForSeasons(teamId, seasons, ttlMinutes = 720) {
    if (!teamId || !seasons?.length) return [];
    try {
      const cacheKey = `mlb_team_games_${teamId}_${seasons.join('_')}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const out = [];
        let cursor;
        for (let page = 0; page < 20; page++) {
          const qs = new URLSearchParams();
          qs.append('team_ids[]', String(teamId));
          for (const yr of seasons) qs.append('seasons[]', String(yr));
          qs.append('per_page', '100');
          if (cursor != null) qs.append('cursor', String(cursor));
          const url = `${BALLDONTLIE_API_BASE_URL}/mlb/v1/games?${qs.toString()}`;
          const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
          out.push(...(response.data?.data || []));
          cursor = response.data?.meta?.next_cursor;
          if (cursor == null) break;
        }
        console.log(`[BDL] MLB team ${teamId} games for ${seasons.join(',')}: ${out.length} rows`);
        return out;
      }, ttlMinutes);
    } catch (error) {
      recordPickDataFailure('BDL:getMlbTeamGamesForSeasons', error);
      console.error(`[BDL] MLB team-season games error:`, error?.response?.data || error.message);
      return [];
    }
  },

  async getMlbSeasonGameIndex(season, ttlMinutes = 60, { throwOnError = false } = {}) {
    try {
      const cacheKey = `mlb_game_index_v2_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const games = await fetchBdlPages(async cursor => {
          const params = { seasons: [season], per_page: 100 };
          if (cursor != null) params.cursor = cursor;
          const url = `${BALLDONTLIE_API_BASE_URL}/mlb/v1/games${buildQuery(params)}`;
          return (await bdlHttp.get(url, { headers: { Authorization: API_KEY } })).data;
        }, { label: 'MLB season game index', maxPages: 80 });
        const index = new Map();
        for (const g of games) {
            index.set(g.id, {
              date: g.date,
              status: g.status,
              seasonType: g.season_type,
              postseason: !!g.postseason,
              // Team ids + final runs — lets team-record angles (e.g.
              // starterTeamRecord) derive W/L from the SAME id space the
              // chrono game-log uses. (getGames is first-page-only / unusable.)
              homeId: g.home_team?.id,
              awayId: g.away_team?.id,
              homeRuns: g.home_team_data?.runs,
              awayRuns: g.away_team_data?.runs
            });
          }
        console.log(`[BDL] MLB game index ${season}: ${index.size} games`);
        return index;
      }, ttlMinutes);
    } catch (error) {
      recordPickDataFailure('BDL:getMlbSeasonGameIndex', error);
      console.error(`[BDL] MLB game index error:`, error?.response?.data || error.message);
      if (throwOnError) throw error;
      return new Map();
    }
  },

  /**
   * Get MLB plate appearances with Statcast data (GOAT tier)
   * Returns: exit_velocity, launch_angle, expected_batting_average, is_barrel, pitch_type, spin_rate, etc.
   */
  async getMlbPlateAppearances(gameId, ttlMinutes = 120) {
    try {
      if (!gameId) return [];
      const cacheKey = `mlb_plate_appearances_${gameId}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/mlb/v1/plate_appearances${buildQuery({ game_id: gameId })}`;
        console.log(`[BDL] Fetching MLB plate appearances (Statcast) for game ${gameId}`);
        const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        const data = response.data?.data || [];
        console.log(`[BDL] MLB plate appearances: ${data.length} records`);
        return data;
      }, ttlMinutes);
    } catch (error) {
      recordPickDataFailure('BDL:getMlbPlateAppearances', error);
      console.error(`[BDL] MLB plate appearances error:`, error?.response?.data || error.message);
      return [];
    }
  },
};
