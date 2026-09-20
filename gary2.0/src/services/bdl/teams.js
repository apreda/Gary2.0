import { getCachedOrFetch, buildQuery, API_KEY, BDL_TIMEOUT_MS, BALLDONTLIE_API_BASE_URL, bdlHttp, initApi } from './transport.js';
import { recordPickDataFailure } from '../pickDataIntegrity.js';
import { resolveTeamIdentity } from '../teamIdentity.js';
import { fetchFootballTeamSeasonStatsBatched } from './footballBatching.js';

// Endpoint methods execute on the shared public service (preserving this calls).
export const teamsMethods = {

  /**
   * Generic helpers (multi-sport)
   */
  async getTeams(sportKey, params = {}) {
    try {
      const cacheKey = `${sportKey}_teams_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        // Prefer SDK if available
        if (sport?.getTeams) {
          const resp = await sport.getTeams(params);
          return resp?.data || [];
        }
        // Fallback to direct HTTP for sports where SDK lacks getTeams
        const endpointMap = {
          americanfootball_ncaaf: 'ncaaf/v1/teams',
          basketball_ncaab: 'ncaab/v1/teams',
          icehockey_nhl: 'nhl/v1/teams',
          americanfootball_nfl: 'nfl/v1/teams',
          baseball_mlb: 'mlb/v1/teams'
        };
        const path = endpointMap[sportKey];
        if (!path) throw new Error('getTeams not supported');

        const qs = Object.keys(params).length > 0 ? buildQuery(params) : '';
        const url = `https://api.balldontlie.io/${path}${qs}`;
        const resp = await fetch(url, {
          headers: { Authorization: API_KEY },
          signal: AbortSignal.timeout(BDL_TIMEOUT_MS)
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, 60);
    } catch (e) {
      recordPickDataFailure('BDL:getTeams', e);
      console.error(`[Ball Don't Lie] ${sportKey} getTeams error:`, e.message);
      return [];
    }
  },

  async getTeamByNameGeneric(sportKey, nameOrId) {
    try {
      if (nameOrId == null || nameOrId === '') return null;
      const nameStr = String(nameOrId).toLowerCase();
      const idNum = !isNaN(Number(nameStr)) ? Number(nameStr) : null;
      let teams = await this.getTeams(sportKey);
      // HTTP fallback if SDK path empty
      if (!Array.isArray(teams) || teams.length === 0) {
        const endpointMap = {
          americanfootball_ncaaf: 'ncaaf/v1/teams',
          basketball_ncaab: 'ncaab/v1/teams',
          icehockey_nhl: 'nhl/v1/teams',
          americanfootball_nfl: 'nfl/v1/teams',
          basketball_nba: 'nba/v1/teams',
          baseball_mlb: 'mlb/v1/teams'
        };
        const path = endpointMap[sportKey];
        if (path) {
          const url = `https://api.balldontlie.io/${path}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY }, signal: AbortSignal.timeout(BDL_TIMEOUT_MS) });
          if (resp.ok) {
            const json = await resp.json().catch(() => ({}));
            teams = Array.isArray(json?.data) ? json.data : [];
          }
        }
      }
      if (!Array.isArray(teams) || teams.length === 0) return null;
      if (idNum !== null) {
        const byId = teams.find(t => t.id === idNum);
        if (byId) return byId;
      }
      return resolveTeamIdentity(teams, nameOrId);
    } catch (e) {
      recordPickDataFailure('BDL:getTeamByNameGeneric', e);
      console.error(`[Ball Don't Lie] ${sportKey} getTeamByName error:`, e.message);
      return null;
    }
  },

  /**
   * Fetch REAL team-level advanced stats from BDL team_season_averages endpoint.
   * Returns: { off_rating, def_rating, net_rating, pace, efg_pct, ts_pct, oreb_pct, dreb_pct, tm_tov_pct, gp, w, l, ... }
   * This is the CORRECT source for team ORtg/DRtg/NetRtg (NOT player weight-averaging).
   */
  async getTeamSeasonAdvanced(teamId, season, postseason = false, ttlMinutes = 30) {
    const seasonType = postseason ? 'postseason' : 'regular';
    const cacheKey = `nba_team_season_advanced_${teamId}_${season}_${seasonType}`;
    return await getCachedOrFetch(cacheKey, async () => {
      const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/team_season_averages/general?season=${season}&season_type=${seasonType}&type=advanced&team_ids[]=${teamId}`;
      const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
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
  async getTeamOpponentStats(teamId, season, postseason = false, ttlMinutes = 30) {
    const seasonType = postseason ? 'postseason' : 'regular';
    const cacheKey = `nba_team_opponent_stats_${teamId}_${season}_${seasonType}`;
    return await getCachedOrFetch(cacheKey, async () => {
      const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/team_season_averages/general?season=${season}&season_type=${seasonType}&type=opponent&team_ids[]=${teamId}`;
      const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
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
  async getTeamDefenseStats(teamId, season, postseason = false, ttlMinutes = 30) {
    const seasonType = postseason ? 'postseason' : 'regular';
    const cacheKey = `nba_team_defense_stats_${teamId}_${season}_${seasonType}`;
    return await getCachedOrFetch(cacheKey, async () => {
      const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/team_season_averages/general?season=${season}&season_type=${seasonType}&type=defense&team_ids[]=${teamId}`;
      const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
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
  async getTeamBaseStats(teamId, season, postseason = false, ttlMinutes = 30) {
    const seasonType = postseason ? 'postseason' : 'regular';
    const cacheKey = `nba_team_base_stats_${teamId}_${season}_${seasonType}`;
    return await getCachedOrFetch(cacheKey, async () => {
      const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/team_season_averages/general?season=${season}&season_type=${seasonType}&type=base&team_ids[]=${teamId}`;
      const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
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
  async getTeamScoringStats(teamId, season, postseason = false, ttlMinutes = 30) {
    const seasonType = postseason ? 'postseason' : 'regular';
    const cacheKey = `nba_team_scoring_stats_${teamId}_${season}_${seasonType}`;
    return await getCachedOrFetch(cacheKey, async () => {
      const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/team_season_averages/general?season=${season}&season_type=${seasonType}&type=scoring&team_ids[]=${teamId}`;
      const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
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
          const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
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

        // Compute full L-stats from the raw totals (not just efficiency)
        const t = teamTotals;
        const o = oppTotals;

        return {
          efficiency: {
            games: gp,
            // Shooting
            efg_pct: t.fga > 0 ? ((t.fgm + 0.5 * t.fg3m) / t.fga * 100).toFixed(1) : null,
            ts_pct: t.fga > 0 ? (t.pts / (2 * (t.fga + 0.44 * t.fta)) * 100).toFixed(1) : null,
            fg_pct: t.fga > 0 ? (t.fgm / t.fga * 100).toFixed(1) : null,
            fg3_pct: t.fg3a > 0 ? (t.fg3m / t.fg3a * 100).toFixed(1) : null,
            ft_pct: t.fta > 0 ? (t.ftm / t.fta * 100).toFixed(1) : null,
            // Volume per game
            ppg: (t.pts / gp).toFixed(1),
            fga_pg: (t.fga / gp).toFixed(1),
            fg3a_pg: (t.fg3a / gp).toFixed(1),
            fta_pg: (t.fta / gp).toFixed(1),
            oreb_pg: (t.oreb / gp).toFixed(1),
            tov_pg: (t.tov / gp).toFixed(1),
            // Four Factors
            tov_rate: (t.fga + 0.44 * t.fta + t.tov) > 0 ? (t.tov / (t.fga + 0.44 * t.fta + t.tov) * 100).toFixed(1) : null,
            ft_rate: t.fga > 0 ? (t.fta / t.fga).toFixed(3) : null,
            // Ratings
            approx_ortg: possEst > 0 ? (t.pts / possEst * 100).toFixed(1) : null,
            approx_drtg: oppPossEst > 0 ? (o.pts / oppPossEst * 100).toFixed(1) : null,
            approx_net_rtg: (possEst > 0 && oppPossEst > 0) ? ((t.pts / possEst * 100) - (o.pts / oppPossEst * 100)).toFixed(1) : null,
            approx_pace: gp > 0 ? ((possEst + oppPossEst) / 2 / gp).toFixed(1) : null,
            // Opponent stats
            opp_ppg: (o.pts / gp).toFixed(1),
            opp_efg_pct: o.fga > 0 ? ((o.fgm + 0.5 * o.fg3m) / o.fga * 100).toFixed(1) : null,
            opp_fg_pct: o.fga > 0 ? (o.fgm / o.fga * 100).toFixed(1) : null,
            opp_fg3_pct: o.fg3a > 0 ? (o.fg3m / o.fg3a * 100).toFixed(1) : null,
            opp_tov_pg: (o.tov / gp).toFixed(1),
            opp_fta_pg: (o.fta / gp).toFixed(1),
          },
          playersByGame
        };
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getTeamL5Efficiency', e);
      console.error(`[Ball Don't Lie] getTeamL5Efficiency error for team ${teamId}:`, e.message);
      return null;
    }
  },

  async getTeamStats(sportKey, params = {}, ttlMinutes = 10) {
    try {
      const cacheKey = `${sportKey}_team_stats_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        // NFL's SDK `getStats` is the PLAYER box-score endpoint. Treating it as
        // a fallback for team stats returns one row per player and can silently
        // turn the first player row for each team/game into a fake team box.
        // Football has a dedicated /team_stats HTTP route below, so only use an
        // SDK method when the client actually exposes `getTeamStats`.
        const isFootball = sportKey === 'americanfootball_nfl' || sportKey === 'americanfootball_ncaaf';
        const fn = sport?.getTeamStats || (!isFootball ? sport?.getStats : null);
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
          headers: { Authorization: API_KEY },
          signal: AbortSignal.timeout(BDL_TIMEOUT_MS)
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getTeamStats', e);
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
      if (sportKey === 'americanfootball_nfl' && !(await this.nflStandingsCountable(params?.season))) {
        console.log(`🏈 [Ball Don't Lie] NFL ${params?.season} standings withheld — the regular season is not underway, the feed is preseason results`);
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
        const resp = await fetch(url, { headers: { Authorization: API_KEY }, signal: AbortSignal.timeout(BDL_TIMEOUT_MS) });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getStandingsGeneric', e);
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
        // Football team-season endpoints accept multiple team_ids[]. The home
        // and away profile reads start together, so combine their transport
        // while retaining the existing per-team cache keys and return shape.
        if (sportKey === 'americanfootball_nfl' || sportKey === 'americanfootball_ncaaf') {
          const path = sportKey === 'americanfootball_nfl'
            ? 'nfl/v1/team_season_stats'
            : 'ncaaf/v1/team_season_stats';
          const fetchRows = async (teamIds) => {
            const params = { season, team_ids: teamIds };
            if (sportKey === 'americanfootball_nfl') params.postseason = postseason;
            if (sportKey === 'americanfootball_ncaaf') params.per_page = 100;
            const url = `https://api.balldontlie.io/${path}${buildQuery(params)}`;
            const resp = await fetch(url, { headers: { Authorization: API_KEY }, signal: AbortSignal.timeout(BDL_TIMEOUT_MS) });
            if (!resp.ok) {
              const text = await resp.text().catch(() => '');
              throw new Error(`HTTP ${resp.status} ${text}`);
            }
            const json = await resp.json().catch(() => ({}));
            return Array.isArray(json?.data) ? json.data : [];
          };
          return fetchFootballTeamSeasonStatsBatched(
            sportKey,
            teamId,
            season,
            postseason,
            fetchRows
          );
        }
        // NHL team season stats
        // BDL returns array of {name, value} pairs - convert to flat object for consistency
        if (sportKey === 'icehockey_nhl') {
          const url = `https://api.balldontlie.io/nhl/v1/teams/${encodeURIComponent(teamId)}/season_stats${buildQuery({ season, postseason })}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY }, signal: AbortSignal.timeout(BDL_TIMEOUT_MS) });
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
        // NCAAB team season stats
        if (sportKey === 'basketball_ncaab') {
          const url = `https://api.balldontlie.io/ncaab/v1/team_season_stats${buildQuery({ season, team_ids: [teamId] })}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY }, signal: AbortSignal.timeout(BDL_TIMEOUT_MS) });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${text}`);
          }
          const json = await resp.json().catch(() => ({}));
          return Array.isArray(json?.data) ? json.data : [];
        }
        // MLB team season stats — batting + pitching + fielding aggregates
        if (sportKey === 'baseball_mlb') {
          const params = { season };
          if (teamId) params.team_id = teamId;
          if (postseason) params.postseason = postseason;
          const url = `https://api.balldontlie.io/mlb/v1/teams/season_stats${buildQuery(params)}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY }, signal: AbortSignal.timeout(BDL_TIMEOUT_MS) });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${text}`);
          }
          const json = await resp.json().catch(() => ({}));
          const data = Array.isArray(json?.data) ? json.data : [];
          // If teamId specified, return the matching team's stats object
          if (teamId && data.length > 0) {
            const match = data.find(d => d.team?.id === teamId) || data[0];
            console.log(`[Ball Don't Lie] MLB team ${teamId} season stats loaded: ${match.gp || 0} GP, batting_avg=${match.batting_avg}, pitching_era=${match.pitching_era}`);
            return match;
          }
          return data;
        }
        // NBA: no direct team season stats; caller should use standings/leaders.
        return [];
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getTeamSeasonStats', e);
      console.error(`[Ball Don't Lie] ${sportKey} getTeamSeasonStats error:`, e.message);
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
        const resp = await fetch(url, { headers: { Authorization: API_KEY }, signal: AbortSignal.timeout(BDL_TIMEOUT_MS) });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getLeadersGeneric', e);
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
        const resp = await fetch(url, { headers: { Authorization: API_KEY }, signal: AbortSignal.timeout(BDL_TIMEOUT_MS) });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getRankingsGeneric', e);
      console.error(`[Ball Don't Lie] ${sportKey} getRankings error:`, e.message);
      return [];
    }
  },

  /**
   * Compute simple derived metrics
   */
  deriveBasketballFourFactors(teamSeasonRow) {
    // Expecting season aggregates; many leagues expose percentages directly
    const safeNum = (v) => (typeof v === 'number' && !isNaN(v) ? v : 0);
    return {
      effectiveFgPct: safeNum(teamSeasonRow?.fg_pct), // proxy
      turnoverRate: safeNum(teamSeasonRow?.turnovers_per_game) || 0,
      offensiveRebRate: safeNum(teamSeasonRow?.oreb_per_game) || 0,
      freeThrowRate: safeNum(teamSeasonRow?.ftm) && safeNum(teamSeasonRow?.fga) ? teamSeasonRow.ftm / teamSeasonRow.fga : 0
    };
  },
  
  /**
   * Get team by name, abbreviation, or ID
   * @param {string|number} nameOrId - Team name, abbreviation, or ID
   * @returns {Promise<Object>} - Team details or null if not found
   */
  async getTeamByName(nameOrId) {
    try {
      // Validate input - prevent toString() errors
      if (nameOrId == null || nameOrId === '') {
        console.warn('getTeamByName: Invalid input provided (null/undefined/empty)');
        return null;
      }
      
      // Convert input to string for consistency
      const nameOrIdStr = String(nameOrId).toLowerCase();
      const idNum = typeof nameOrId === 'number' ? nameOrId : (!isNaN(Number(nameOrIdStr)) ? Number(nameOrIdStr) : null);
      
      // Use different cache keys based on input type
      const cacheKey = idNum !== null ? `team_by_id_${idNum}` : `team_by_name_${nameOrIdStr}`;
      
      return getCachedOrFetch(cacheKey, async () => {
        // Always get full teams list - the API doesn't have a getTeamById method
        const client = initApi();
        const response = await client.nba.getTeams();
        const teams = response.data || [];
        
        // If we have a numeric ID, search by ID first
        if (idNum !== null) {
          const teamById = teams.find(team => team.id === idNum);
          if (teamById) return teamById;
        }
        
        // If no numeric ID or team not found by ID, try string matching
        if (typeof nameOrId === 'string' || !idNum) {
          // Try to find by exact name or abbreviation
          const team = teams.find(
            team => 
              team.name.toLowerCase() === nameOrIdStr || 
              team.full_name.toLowerCase() === nameOrIdStr ||
              team.abbreviation.toLowerCase() === nameOrIdStr
          );
          
          if (team) return team;
          
          // Try to find by partial name match
          const partialMatch = teams.find(
            team => 
              team.name.toLowerCase().includes(nameOrIdStr) || 
              team.full_name.toLowerCase().includes(nameOrIdStr) ||
              team.abbreviation.toLowerCase().includes(nameOrIdStr)
          );
          
          if (partialMatch) return partialMatch;
        }
        
        // If no match found, return null
        return null;
      });
    } catch (error) {
      recordPickDataFailure('BDL:getTeamByName', error);
      console.error(`Error getting team by name/id ${nameOrId}:`, error);
      return null;
    }
  },
};
