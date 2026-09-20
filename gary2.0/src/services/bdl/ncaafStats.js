import { getCachedOrFetch, BALLDONTLIE_API_BASE_URL, buildQuery, bdlHttp, API_KEY, BDL_TIMEOUT_MS } from './transport.js';
import { recordPickDataFailure } from '../pickDataIntegrity.js';
import { fetchBdlPages } from '../bdlPagination.js';

// Endpoint methods execute on the shared public service (preserving this calls).
export const ncaafStatsMethods = {

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
        const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNcaafRankings', e);
      console.error('[Ball Don\'t Lie] ncaaf getNcaafRankings error:', e.message);
      return [];
    }
  },

  /**
   * NCAAF standings — ONE conference per call, the way the route answers
   * (GET /ncaaf/v1/standings?season=&conference_id=). The college standings
   * lane reads the slate's conferences one at a time; getStandingsGeneric
   * deliberately refuses NCAAF. Season + conference are both required —
   * without them the route would answer for nobody in particular.
   * @returns {Array} rows { team, conference, wins, losses, home_record, away_record, conference_record, ... }
   */
  async getNcaafStandings(season, conferenceId, ttlMinutes = 60) {
    // Number(null) is 0 — an absent id must never read as conference 0.
    if (season == null || conferenceId == null) return [];
    const seasonNum = Number(season);
    const confNum = Number(conferenceId);
    if (!Number.isInteger(seasonNum) || !Number.isInteger(confNum) || confNum <= 0) return [];
    try {
      const cacheKey = `ncaaf_standings_${seasonNum}_${confNum}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaaf/v1/standings${buildQuery({ season: seasonNum, conference_id: confNum })}`;
        const resp = await fetch(url, { headers: { Authorization: API_KEY }, signal: AbortSignal.timeout(BDL_TIMEOUT_MS) });
        if (!resp.ok) {
          const err = new Error(`HTTP ${resp.status}`);
          err.status = resp.status;
          throw err;
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNcaafStandings', e);
      console.error('[Ball Don\'t Lie] ncaaf getNcaafStandings error:', e.message);
      return [];
    }
  },

  /**
   * NCAAF player season stats (single season, optional player filter)
   */
  /**
   * Keep only rows the provider actually stamped with the season we asked for.
   * BDL's college stat endpoints ignore a filter written in the wrong form and
   * answer 200 OK with the oldest rows in the table, so a silent mis-filter
   * reads as real data everywhere downstream (Sep 4 2026).
   */
  _onlySeason(rows, season, label) {
    const list = Array.isArray(rows) ? rows : [];
    const want = Number(season);
    if (!Number.isFinite(want)) return list;
    const kept = list.filter((row) => Number(row?.season ?? row?.game?.season) === want);
    if (kept.length !== list.length) {
      console.warn(`[Ball Don't Lie] ncaaf ${label}: dropped ${list.length - kept.length} row(s) outside season ${want} — the provider ignored the season filter.`);
    }
    return kept;
  },

  async getNcaafPlayerSeasonStats({ playerIds, playerId, teamIds, teamId, season } = {}, ttlMinutes = 10) {
    try {
      if (!season) return [];
      const pidArr = playerIds || (playerId ? [playerId] : undefined);
      const tidArr = teamIds || (teamId ? [teamId] : undefined);
      if ((!pidArr || pidArr.length === 0) && (!tidArr || tidArr.length === 0)) {
        return [];
      }
      const cacheKey = `ncaaf_player_season_stats_${(pidArr || []).join('-')}_${(tidArr || []).join('-')}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // THE SCALAR `season`, not `seasons[]` (verified live Sep 4 2026).
        // The two college player endpoints take OPPOSITE forms and neither
        // errors on the wrong one — they silently return the oldest rows in
        // the table. On /player_season_stats, `seasons[]=2026` came back as
        // 2004-2006, which is how Ray Rice and Calvin Johnson reached the
        // college Fantasy Corner as this week's waiver wire. (/player_stats
        // is the mirror image and wants seasons[] — see the method below.)
        const query = { season, per_page: 100 };
        if (Array.isArray(pidArr) && pidArr.length) {
          query['player_ids[]'] = pidArr.slice(0, 100);
        }
        if (Array.isArray(tidArr) && tidArr.length) {
          query['team_ids[]'] = tidArr.slice(0, 100);
        }
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaaf/v1/player_season_stats${buildQuery(query)}`;
        const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        // The rows carry their own season, so the filter is CHECKED, never
        // trusted: a provider flip back to the other form can shorten this
        // lane, but it can no longer publish a player from twenty years ago.
        return this._onlySeason(response.data?.data, season, 'player_season_stats');
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNcaafPlayerSeasonStats', e);
      console.error('[Ball Don\'t Lie] ncaaf getNcaafPlayerSeasonStats error:', e.message);
      return [];
    }
  },

  /**
   * Per-GAME NCAAF player stat lines (endpoint: ncaaf/v1/player_stats).
   *
   * This method was called by the NCAAF starting-QB fallback in
   * scoutReport/sports/nfl.js but had never been defined — the call sat inside
   * a try/catch, so the TypeError was swallowed and every NCAAF quarterback
   * silently got zero game logs. Added Aug 25 2026.
   *
   * Each row carries `game` (date, week, teams, scores) and `player`, so the
   * caller can build a dated, opponent-attributed log.
   */
  /**
   * Per-game NCAAF team boxes for a set of games.
   *
   * A game_ids query returns BOTH teams' rows for each game, which is how the
   * turnover lane gets "forced" as well as "committed" without a second call.
   * seasons[] rides along deliberately: the documented BDL trap is that
   * game_ids[] can be IGNORED without it, returning an unfiltered page rather
   * than an error (see memory bdl-football-team-stats-filters). Verified
   * Aug 25 2026 that the NFL endpoint currently filters correctly either way;
   * sending it costs nothing and removes the dependency on that staying true.
   */
  async getNcaafTeamStatsByGameIds(gameIds, season, ttlMinutes = 30) {
    try {
      if (!Array.isArray(gameIds) || gameIds.length === 0 || !season) return [];
      const cacheKey = `ncaaf_team_stats_games_${season}_${[...gameIds].sort().join(',')}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const params = new URLSearchParams();
        params.append('seasons[]', String(season));
        for (const id of gameIds) params.append('game_ids[]', String(id));
        params.append('per_page', '100');
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaaf/v1/team_stats?${params.toString()}`;
        const resp = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        return resp.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNcaafTeamStatsByGameIds', e);
      console.error('[Ball Don\'t Lie] ncaaf getNcaafTeamStatsByGameIds error:', e.message);
      return [];
    }
  },

  async getNcaafPlayerGameStats({ playerIds, playerId, teamIds, teamId, season, throwOnError = false } = {}, ttlMinutes = 15) {
    try {
      if (!season) return [];
      const pidArr = playerIds || (playerId ? [playerId] : undefined);
      const tidArr = teamIds || (teamId ? [teamId] : undefined);
      if ((!pidArr || pidArr.length === 0) && (!tidArr || tidArr.length === 0)) {
        return [];
      }
      const cacheKey = `ncaaf_player_game_stats_v2_${(pidArr || []).join('-')}_${(tidArr || []).join('-')}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // `seasons[]` must be an ARRAY. The scalar `season` that
        // getNcaafPlayerSeasonStats uses returns ZERO rows here the moment
        // team_ids rides along — same silent-filter family as /team_stats
        // needing seasons[] beside game_ids[].
        const baseQuery = { 'seasons[]': [season], per_page: 100 };
        if (Array.isArray(pidArr) && pidArr.length) {
          baseQuery['player_ids[]'] = pidArr;
        }
        if (Array.isArray(tidArr) && tidArr.length) {
          baseQuery['team_ids[]'] = tidArr;
        }

        // A whole team's season does NOT fit in one page: a single page of 100
        // rows covered only weeks 1-4, 6-7 for one team, so leaders computed
        // from it were drawn from a truncated season and the "last 5" was
        // missing the most recent games entirely. Follow the cursor.
        const rows = await fetchBdlPages(async cursor => {
          const query = cursor != null ? { ...baseQuery, cursor } : baseQuery;
          const url = `${BALLDONTLIE_API_BASE_URL}/ncaaf/v1/player_stats${buildQuery(query)}`;
          return (await bdlHttp.get(url, { headers: { Authorization: API_KEY } })).data;
        }, { label: 'NCAAF player game stats' });
        // Same check as its sibling: this endpoint wants seasons[] today, and
        // the wrong form here would also answer with 2004 rather than an error.
        return this._onlySeason(rows, season, 'player_stats');
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNcaafPlayerGameStats', e);
      console.error('[Ball Don\'t Lie] ncaaf getNcaafPlayerGameStats error:', e.message);
      if (throwOnError) throw e;
      return [];
    }
  },
};
