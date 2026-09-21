import { oddsMethods } from './bdl/odds.js';
import { nflPlayersMethods } from './bdl/nflPlayers.js';
import { nflAdvancedStatsMethods } from './bdl/nflAdvancedStats.js';
import { nflTeamsMethods } from './bdl/nflTeams.js';
import { nhlTeamsMethods } from './bdl/nhlTeams.js';
import { nhlPlayerStatsMethods } from './bdl/nhlPlayerStats.js';
import { ncaafStatsMethods } from './bdl/ncaafStats.js';
import { playersMethods } from './bdl/players.js';
import { nbaPlayerStatsMethods } from './bdl/nbaPlayerStats.js';
import { nbaTeamsMethods } from './bdl/nbaTeams.js';
import { collegeBasketballMethods } from './bdl/collegeBasketball.js';
import { teamsMethods } from './bdl/teams.js';
import { gamesMethods } from './bdl/games.js';
import { mlbMarketsMethods } from './bdl/mlbMarkets.js';
import { mlbGamesMethods } from './bdl/mlbGames.js';
import { mlbPlayersMethods } from './bdl/mlbPlayers.js';
import { clearCache, initApi, getCachedOrFetch, bdlHttp, BALLDONTLIE_API_BASE_URL, buildQuery, API_KEY, BDL_TIMEOUT_MS } from './bdl/transport.js';
import { fetchBdlPages } from './bdlPagination.js';
import { recordPickDataFailure } from './pickDataIntegrity.js';

/** Public BDL compatibility facade. Non-injury endpoints live in ./bdl/.
 * Injury and availability implementations remain here under the founder lock. */
const ballDontLieService = {
  /**
   * Clear all cached data - useful for ensuring fresh injury/lineup data
   */
  clearCache() {
    clearCache();
  },

  /**
   * Get sport-specific client from the SDK
   */
  _getSportClient(sportKey) {
    const client = initApi();
    if (!client) return null;
    const map = {
      basketball_nba: 'nba',
      icehockey_nhl: 'nhl',
      americanfootball_nfl: 'nfl',
      americanfootball_ncaaf: 'ncaaf',
      basketball_ncaab: 'ncaab',
      baseball_mlb: 'mlb'
    };
    const prop = map[sportKey] || sportKey;
    return client[prop] || null;
  },

  /**
   * NCAAF Team Players (Roster)
   * GET /ncaaf/v1/players?team_ids[]=<ID>
   * Returns players for a specific team
   * @param {number} teamId - BDL team ID
   * @returns {Array} - Player objects with position, name, etc.
   */
  async getNcaafTeamPlayers(teamId, ttlMinutes = 30) {
    try {
      if (!teamId) return [];
      const cacheKey = `ncaaf_team_players_${teamId}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // A COLLEGE ROSTER IS BIGGER THAN ONE PAGE (Sep 4 2026). This read the
        // first 100 and stopped, so the tail of every roster — the linemen and
        // defensive backs an injury report is mostly about — did not exist as
        // far as the app was concerned, and their Hub rows could never open a
        // card. San José State returned exactly 100 with four named players
        // missing.
        return fetchBdlPages(async cursor => {
          const query = { team_ids: [teamId], per_page: 100, ...(cursor != null ? { cursor } : {}) };
          const response = await bdlHttp.get(`${BALLDONTLIE_API_BASE_URL}/ncaaf/v1/players/active${buildQuery(query)}`, { headers: { Authorization: API_KEY } });
          return response.data;
        }, { label: 'NCAAF active roster' });
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNcaafTeamPlayers', e);
      console.error('[Ball Don\'t Lie] ncaaf getNcaafTeamPlayers error:', e.message);
      return [];
    }
  },

  /**
   * Get NCAAB roster depth for two teams - top 9 players with season stats
   * Used for scout report to show Gary the full rotation
   * @param {string} homeTeamName - Home team name
   * @param {string} awayTeamName - Away team name
   * @param {number} season - Season year (e.g., 2024 for 2024-25 season)
   * @returns {Promise<Object>} - { home: [...], away: [...], homeTeamName, awayTeamName }
   */
  async getNcaabRosterDepth(homeTeamName, awayTeamName, season, ttlMinutes = 30) {
    try {
      console.log(`🏀 [Ball Don't Lie] Fetching NCAAB roster depth for ${awayTeamName} @ ${homeTeamName} (${season} season)`);
      
      // Get team IDs first (NCAAB teams)
      const [homeTeam, awayTeam] = await Promise.all([
        this.getTeamByNameGeneric('basketball_ncaab', homeTeamName),
        this.getTeamByNameGeneric('basketball_ncaab', awayTeamName)
      ]);
      
      if (!homeTeam?.id || !awayTeam?.id) {
        console.warn(`[Ball Don't Lie] Could not find NCAAB team IDs for ${homeTeamName} or ${awayTeamName}`);
        return { home: [], away: [] };
      }
      
      console.log(`🏀 [Ball Don't Lie] Team IDs: ${homeTeam.full_name || homeTeam.name} (${homeTeam.id}) vs ${awayTeam.full_name || awayTeam.name} (${awayTeam.id})`);
      
      const cacheKey = `ncaab_roster_depth_${homeTeam.id}_${awayTeam.id}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Fetch active players for both teams (limit to 25 total, we only need top 9 per team)
        const activePlayersUrl = `${BALLDONTLIE_API_BASE_URL}/ncaab/v1/players/active?team_ids[]=${homeTeam.id}&team_ids[]=${awayTeam.id}&per_page=25`;
        const playersResp = await bdlHttp.get(activePlayersUrl, { headers: { 'Authorization': API_KEY } });
        const allPlayers = Array.isArray(playersResp?.data?.data) ? playersResp.data.data : [];
        
        if (allPlayers.length === 0) {
          console.warn('[Ball Don\'t Lie] No active NCAAB players found');
          return { home: [], away: [] };
        }
        
        console.log(`🏀 [Ball Don't Lie] Found ${allPlayers.length} active NCAAB players`);
        
        // Separate by team
        const homePlayers = allPlayers.filter(p => p.team?.id === homeTeam.id);
        const awayPlayers = allPlayers.filter(p => p.team?.id === awayTeam.id);
        
        // Fetch season stats for both teams
        console.log(`🏀 [Ball Don't Lie] Fetching NCAAB player season stats...`);
        const [homeStats, awayStats] = await Promise.all([
          this.getNcaabPlayerSeasonStats({ teamId: homeTeam.id, season }),
          this.getNcaabPlayerSeasonStats({ teamId: awayTeam.id, season })
        ]);
        
        // Build stats map
        const statsMap = {};
        for (const stat of [...homeStats, ...awayStats]) {
          if (stat.player?.id) {
            statsMap[stat.player.id] = stat;
          }
        }
        
        // Format player with stats
        const formatPlayer = (player) => {
          const stats = statsMap[player.id] || {};
          const gp = stats.games_played || 1;
          const fgm = stats.fgm || 0;
          const fga = stats.fga || 0;
          const fg3m = stats.fg3m || 0;
          const fta = stats.fta || 0;
          const efgPct = fga > 0 ? ((fgm + 0.5 * fg3m) / fga * 100).toFixed(1) : null;
          const tsa = 2 * (fga + 0.44 * fta);
          const tsPct = tsa > 0 ? ((stats.pts || 0) / tsa * 100).toFixed(1) : null;
          const fgaPg = gp > 0 ? (fga / gp).toFixed(1) : '0.0';
          return {
            id: player.id,
            name: `${player.first_name} ${player.last_name}`,
            position: player.position || '?',
            jersey: player.jersey_number || '?',
            gp: stats.games_played || 0,
            pts: stats.pts || (gp > 0 ? (stats.pts || 0) / gp : 0),
            ppg: gp > 0 ? ((stats.pts || 0) / gp).toFixed(1) : '0.0',
            reb: gp > 0 ? ((stats.reb || 0) / gp).toFixed(1) : '0.0',
            ast: gp > 0 ? ((stats.ast || 0) / gp).toFixed(1) : '0.0',
            min: stats.min ? parseFloat(stats.min).toFixed(1) : '0.0',
            fgPct: stats.fg_pct ? stats.fg_pct.toFixed(1) : 'N/A',
            fg3Pct: stats.fg3_pct ? stats.fg3_pct.toFixed(1) : 'N/A',
            efgPct,
            tsPct,
            fgaPg
          };
        };
        
        // Sort by PPG (total points as proxy for importance) and take top 9
        const homeRoster = homePlayers
          .map(formatPlayer)
          .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
          .slice(0, 9);
          
        const awayRoster = awayPlayers
          .map(formatPlayer)
          .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
          .slice(0, 9);
        
        console.log(`🏀 [Ball Don't Lie] NCAAB roster depth ready: ${homeTeam.full_name || homeTeam.name} (${homeRoster.length} players), ${awayTeam.full_name || awayTeam.name} (${awayRoster.length} players)`);

        // Build GP map for ALL players (not just top 9) — used by narrative scrubber
        // to distinguish "never played this season" (gp=0) from "played but now injured"
        const gpMap = {};
        for (const player of allPlayers) {
          const name = `${player.first_name} ${player.last_name}`.trim();
          const stats = statsMap[player.id] || {};
          gpMap[name] = stats.games_played || 0;
        }

        // Compute team-level Four Factors from team_season_stats (per-game averages)
        // player_season_stats does NOT have oreb/dreb — only team_season_stats does
        // team_season_stats returns per-game averages, so ratios (eFG%, TOV Rate, etc.) work directly
        const [homeTeamSeasonStats, awayTeamSeasonStats] = await Promise.all([
          this.getTeamSeasonStats('basketball_ncaab', { teamId: homeTeam.id, season }),
          this.getTeamSeasonStats('basketball_ncaab', { teamId: awayTeam.id, season })
        ]);

        // Compute Four Factors using Dean Oliver formulas (Basketball Reference)
        // eFG% = (FGM + 0.5 * FG3M) / FGA
        // TOV% = TOV / (FGA + 0.44 * FTA + TOV)
        // FTA Rate = FTA / FGA (KenPom convention — measures getting to the line)
        // ORB% = Team_ORB / (Team_ORB + Opponent_DRB) — requires cross-referencing both teams
        const computeTeamFourFactors = (teamStatsArr, opponentStatsArr) => {
          const ts = Array.isArray(teamStatsArr) ? teamStatsArr[0] : teamStatsArr;
          const opp = Array.isArray(opponentStatsArr) ? opponentStatsArr[0] : opponentStatsArr;
          if (!ts) return { efgPct: null, tovRate: null, ftaRate: null, orebPct: null };
          const fgm = ts.fgm || 0;
          const fga = ts.fga || 0;
          const fg3m = ts.fg3m || 0;
          const fta = ts.fta || 0;
          const oreb = ts.oreb || 0;
          const tov = ts.turnover || 0;
          // ORB% uses opponent's DRB (correct formula), falls back to own DRB if opponent data unavailable
          const oppDreb = opp ? (opp.dreb || 0) : (ts.dreb || 0);
          const orebDenom = oreb + oppDreb;
          return {
            efgPct: fga > 0 ? ((fgm + 0.5 * fg3m) / fga * 100).toFixed(1) : null,
            tovRate: fga > 0 ? (tov / (fga + 0.44 * fta + tov) * 100).toFixed(1) : null,
            ftaRate: fga > 0 ? (fta / fga * 100).toFixed(1) : null,
            orebPct: orebDenom > 0 ? (oreb / orebDenom * 100).toFixed(1) : null,
          };
        };

        const homeTeamFourFactors = computeTeamFourFactors(homeTeamSeasonStats, awayTeamSeasonStats);
        const awayTeamFourFactors = computeTeamFourFactors(awayTeamSeasonStats, homeTeamSeasonStats);

        return {
          home: homeRoster,
          away: awayRoster,
          homeTeamName: homeTeam.full_name || homeTeam.name,
          awayTeamName: awayTeam.full_name || awayTeam.name,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          homeConferenceId: homeTeam.conference_id,
          awayConferenceId: awayTeam.conference_id,
          gpMap,
          homeTeamFourFactors,
          awayTeamFourFactors
        };
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNcaabRosterDepth', e);
      console.error('[Ball Don\'t Lie] getNcaabRosterDepth error:', e.message);
      return { home: [], away: [] };
    }
  },

  /**
   * Get NFL roster depth for two teams - top players by position with stats
   * Uses team roster endpoint (depth chart)
   * @param {string} homeTeamName - Home team name
   * @param {string} awayTeamName - Away team name
   * @param {number} season - Season year (e.g., 2025)
   * @returns {Promise<Object>} - { home: [...], away: [...] }
   */
  async getNflRosterDepth(homeTeamName, awayTeamName, season, ttlMinutes = 30) {
    try {
      console.log(`🏈 [Ball Don't Lie] Fetching NFL roster depth for ${awayTeamName} @ ${homeTeamName} (${season} season)`);
      
      // Get team IDs first (NFL teams)
      const [homeTeam, awayTeam] = await Promise.all([
        this.getTeamByNameGeneric('americanfootball_nfl', homeTeamName),
        this.getTeamByNameGeneric('americanfootball_nfl', awayTeamName)
      ]);
      
      if (!homeTeam?.id || !awayTeam?.id) {
        console.warn(`[Ball Don't Lie] Could not find NFL team IDs for ${homeTeamName} or ${awayTeamName}`);
        return { home: [], away: [] };
      }
      
      console.log(`🏈 [Ball Don't Lie] Team IDs: ${homeTeam.full_name} (${homeTeam.id}) vs ${awayTeam.full_name} (${awayTeam.id})`);
      
      const cacheKey = `nfl_roster_depth_${homeTeam.id}_${awayTeam.id}_${season}_unique_players_v2`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Fetch team rosters (depth charts)
        console.log(`🏈 [Ball Don't Lie] Fetching NFL team rosters...`);
        
        // Starting-QB and key-player discovery already use this cached roster
        // method. Reuse it here instead of issuing the same two HTTP requests
        // again under the roster-depth cache key.
        const [homeRoster, awayRoster] = await Promise.all([
          this.getNflTeamRoster(homeTeam.id, season, ttlMinutes),
          this.getNflTeamRoster(awayTeam.id, season, ttlMinutes)
        ]);
        
        // Format player from depth chart
        const formatPlayer = (entry) => {
          const player = entry.player || {};
          return {
            id: player.id,
            name: `${player.first_name} ${player.last_name}`,
            position: (entry.position || player.position_abbreviation || '?').toUpperCase().replace(/^WR-\d+$/, 'WR'),
            depth: entry.depth || 1,
            jersey: player.jersey_number || '?',
            college: player.college || '',
            experience: player.experience || '',
            injuryStatus: entry.injury_status || null
          };
        };
        
        // Get key skill position players (depth 1-2 only for QB, RB, WR, TE)
        const keyPositions = ['QB', 'RB', 'WR', 'TE'];
        const filterKeyPlayers = (roster) => {
          const seenPlayers = new Set();
          return roster
            .map(formatPlayer)
            .filter(player => keyPositions.includes(player.position) && player.depth <= 2)
            .sort((a, b) => {
              // Sort by position order, then depth
              const posOrder = { QB: 1, RB: 2, WR: 3, TE: 4 };
              if (posOrder[a.position] !== posOrder[b.position]) {
                return (posOrder[a.position] || 99) - (posOrder[b.position] || 99);
              }
              return a.depth - b.depth;
            })
            .filter(player => {
              const identity = `${player.id ?? player.name.toLowerCase()}:${player.position}`;
              if (seenPlayers.has(identity)) return false;
              seenPlayers.add(identity);
              return true;
            })
            .slice(0, 12); // Top 12 skill players
        };
        
        const homeKeyPlayers = filterKeyPlayers(homeRoster);
        const awayKeyPlayers = filterKeyPlayers(awayRoster);
        
        console.log(`🏈 [Ball Don't Lie] NFL roster depth ready: ${homeTeam.full_name} (${homeKeyPlayers.length} key players), ${awayTeam.full_name} (${awayKeyPlayers.length} key players)`);
        
        return {
          home: homeKeyPlayers,
          away: awayKeyPlayers,
          homeTeamName: homeTeam.full_name,
          awayTeamName: awayTeam.full_name
        };
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNflRosterDepth', e);
      console.error('[Ball Don\'t Lie] getNflRosterDepth error:', e.message);
      return { home: [], away: [] };
    }
  },

  /**
   * Get the starting QB from team roster/depth chart (PREFERRED METHOD)
   * Uses BDL's /teams/<ID>/roster endpoint which has depth chart positions
   * depth=1 is the starter, depth=2 is backup, etc.
   * Also checks injury_status to automatically promote backup if starter is out
   * 
   * @param {number} teamId - BDL team ID
   * @param {number} season - Season year (calculated dynamically if not provided)
   * @param {string} sportKey - Sport key ('americanfootball_nfl' or 'americanfootball_ncaaf')
   * @returns {Object|null} - { id, name, firstName, lastName, team, depth, injuryStatus, isBackup }
   */
  async getStartingQBFromDepthChart(teamId, season = null, sportKey = 'americanfootball_nfl', { officialInjuries = [] } = {}) {
    // Calculate dynamic NFL/NCAAF season: Aug-Feb spans years
    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month <= 7 ? year - 1 : year;
    }
    try {
      if (!teamId) return null;
      
      // Get the team roster with depth chart - use correct roster function for sport
      const isNCAAF = sportKey === 'americanfootball_ncaaf' || sportKey === 'NCAAF';
      let roster;
      if (isNCAAF) {
        // NCAAF uses getNcaafTeamPlayers (BDL doesn't have depth chart for NCAAF)
        roster = await this.getNcaafTeamPlayers(teamId);
      } else {
        // NFL has proper depth chart roster
        roster = await this.getNflTeamRoster(teamId, season);
      }
      if (!roster || roster.length === 0) {
        console.warn(`[Ball Don't Lie] No roster data for team ${teamId}`);
        return null;
      }
      
      // Filter to QBs only
      const qbs = roster.filter(entry => 
        entry.position === 'QB' || 
        entry.player?.position_abbreviation === 'QB' ||
        entry.player?.position === 'Quarterback'
      ).map(entry => {
        if (isNCAAF) return entry;
        const name = `${entry.player?.first_name || ''} ${entry.player?.last_name || ''}`.trim().toLowerCase();
        const reports = officialInjuries.filter(injury => {
          if (injury.freshness !== 'FRESH' || !Number.isFinite(injury.daysSinceReport)
            || injury.daysSinceReport < 0 || injury.daysSinceReport > 10 || !String(injury.status || '').trim()
            || /^unknown$/i.test(injury.status)) return false;
          if (injury.player?.id != null && entry.player?.id != null) return String(injury.player.id) === String(entry.player.id);
          const reportedName = `${injury.player?.first_name || ''} ${injury.player?.last_name || ''}`.trim().toLowerCase();
          return !!name && name === reportedName;
        }).sort((a, b) => (Date.parse(b.reportDate) || 0) - (Date.parse(a.reportDate) || 0));
        return reports.length ? { ...entry, injury_status: reports[0].status } : entry;
      });
      
      if (qbs.length === 0) {
        console.warn(`[Ball Don't Lie] No QBs found in roster for team ${teamId}`);
        return null;
      }
      
      // Sort by depth (1 = starter, 2 = backup, 3 = 3rd string, etc.)
      qbs.sort((a, b) => (a.depth || 99) - (b.depth || 99));
      
      // Injury statuses that mean the player is OUT
      // BDL uses single-letter codes: "O" = Out, "D" = Doubtful, "Q" = Questionable, "IR" = Injured Reserve
      const isOut = (status) => {
        if (!status) return false;
        const s = status.toLowerCase().trim();
        // Doubtful and questionable still describe uncertain availability;
        // neither report establishes that the next QB will start.
        if (!isNCAAF) return /^(?:o|out|(?:ir|pup|nfi)(?:-r)?|reserve\/(?:injured|pup|nfi)|injured reserve|physically unable to perform|non-football injury|inactive|suspended)$/.test(s);
        // Single letter codes
        if (s === 'o' || s === 'd' || s === 'ir') return true;
        // Full word matches
        return s.includes('out') || s.includes('ir') || s.includes('injured reserve') || 
               s.includes('doubtful') || s.includes('pup');
      };
      
      // Find the first HEALTHY QB in the depth chart
      // Iterate through depth=1, depth=2, depth=3, etc. until we find one not injured
      let selectedQB = null;
      let isBackupStarting = false;
      const injuredQBs = [];
      
      for (const qb of qbs) {
        const qbName = `${qb.player?.first_name} ${qb.player?.last_name}`;
        
        if (isOut(qb.injury_status)) {
          injuredQBs.push({ name: qbName, status: qb.injury_status, depth: qb.depth });
          console.log(`[Ball Don't Lie] ⚠️ Depth ${qb.depth} QB ${qbName} is ${qb.injury_status} - checking next`);
          continue;
        }
        
        // Found a healthy (or at least not OUT) QB
        selectedQB = qb;
        isBackupStarting = qb.depth > 1;
        
        if (isBackupStarting) {
          const depthLabel = qb.depth === 2 ? 'Backup' : `${qb.depth}${qb.depth === 3 ? 'rd' : 'th'} String`;
          console.log(`[Ball Don't Lie] ✓ Using ${depthLabel} QB: ${qbName} (depth=${qb.depth})`);
        }
        break;
      }
      
      // A list of ruled-out QBs cannot satisfy the scout's required-QB gate.
      if (!selectedQB) {
        console.log(`[Ball Don't Lie] ⚠️ All QBs appear injured:`, injuredQBs.map(q => `${q.name} (${q.status})`).join(', '));
        if (!isNCAAF) return null;
        selectedQB = qbs[0]; // Use depth=1 even if injured
        console.log(`[Ball Don't Lie] ⚠️ Using depth=1 ${selectedQB?.player?.first_name} ${selectedQB?.player?.last_name} despite injury`);
      }
      
      if (!selectedQB) {
        console.warn(`[Ball Don't Lie] Could not determine starting QB for team ${teamId}`);
        return null;
      }
      
      const player = selectedQB.player;
      const result = {
        id: player?.id,
        firstName: player?.first_name,
        lastName: player?.last_name,
        name: `${player?.first_name} ${player?.last_name}`,
        position: player?.position || 'Quarterback',
        positionAbbr: player?.position_abbreviation || 'QB',
        team: player?.team?.full_name || player?.team?.name,
        teamAbbr: player?.team?.abbreviation,
        teamId: teamId,
        jerseyNumber: player?.jersey_number,
        college: player?.college,
        experience: player?.experience,
        age: player?.age,
        depth: selectedQB.depth,
        injuryStatus: selectedQB.injury_status,
        isBackup: isBackupStarting,
        // Note: Depth chart doesn't have stats - need to fetch separately
        passingYards: null,
        passingTds: null,
        gamesPlayed: null
      };
      
      const statusLabel = isBackupStarting ? 'BACKUP Starting QB' : 'Starting QB';
      const injuryNote = selectedQB.injury_status ? ` (${selectedQB.injury_status})` : '';
      console.log(`[Ball Don't Lie] ${statusLabel} from depth chart for team ${teamId}: ${result.name}${injuryNote}`);
      
      return result;
    } catch (e) {
      recordPickDataFailure('BDL:getStartingQBFromDepthChart', e);
      console.error(`[Ball Don't Lie] getStartingQBFromDepthChart error for team ${teamId}:`, e.message);
      return null;
    }
  },


  // BDL injury endpoints by sport. NCAAF is absent on purpose: BDL has no
  // college injuries endpoint, and grounded search supplies opt-out/injury
  // context on the desk instead.
  _injuryEndpoint(sportKey) {
    return {
      basketball_nba: 'nba/v1/player_injuries',
      americanfootball_nfl: 'nfl/v1/player_injuries',
      icehockey_nhl: 'nhl/v1/player_injuries',
      baseball_mlb: 'mlb/v1/player_injuries'
    }[sportKey] || null;
  },

  // Issue the injuries request over plain HTTP and KEEP the response body.
  // @balldontlie/sdk's APIError carries only `status`, discarding the JSON body
  // that names the offending parameter — which is how a repeating 400 logged
  // 250 identical, unactionable lines a day (Sep 17 2026 audit).
  async _fetchInjuriesHttp(path, params) {
    try {
      const url = `${BALLDONTLIE_API_BASE_URL}/${path}${buildQuery(params)}`;
      const resp = await fetch(url, {
        headers: { Authorization: API_KEY },
        signal: AbortSignal.timeout(BDL_TIMEOUT_MS)
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        return { ok: false, status: resp.status, body: String(body).slice(0, 400) };
      }
      const json = await resp.json().catch(() => ({}));
      return { ok: true, data: Array.isArray(json?.data) ? json.data : [] };
    } catch (e) {
      return { ok: false, status: 0, body: e?.message || String(e) };
    }
  },

  async getInjuriesGeneric(sportKey, params = {}, ttlMinutes = 5) {
    const path = this._injuryEndpoint(sportKey);
    if (!path) return [];

    const cacheKey = `${sportKey}_injuries_${JSON.stringify(params)}`;
    try {
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        const fn = sport?.getPlayerInjuries || sport?.getInjuries;
        if (fn) {
          try {
            const resp = await fn.call(sport, params);
            return resp?.data || [];
          } catch (sdkError) {
            // Recover the reason the SDK threw away. buildQuery also drops
            // null/undefined array members, which the SDK crashes on.
            const detail = await this._fetchInjuriesHttp(path, params);
            if (detail.ok) return detail.data;
            throw new Error(
              `${path} HTTP ${detail.status || sdkError?.status || '?'} ` +
              `${detail.body || sdkError?.message || '(no response body)'} ` +
              `[params ${JSON.stringify(params)}]`
            );
          }
        }
        const direct = await this._fetchInjuriesHttp(path, params);
        if (!direct.ok) {
          throw new Error(
            `${path} HTTP ${direct.status} ${direct.body || '(no response body)'} ` +
            `[params ${JSON.stringify(params)}]`
          );
        }
        return direct.data;
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getInjuriesGeneric', e);
      // A failed fetch is NOT an empty injury list. Returning [] here told every
      // caller "nobody is hurt" whenever the request broke. Throw instead; each
      // call site decides how to degrade, and can say the data is unavailable.
      throw new Error(`[Ball Don't Lie] ${sportKey} injuries unavailable: ${e.message}`);
    }
  },

  /**
   * Initialize the service
   */
  initialize() {
    if (!API_KEY) {
      console.warn('[BDL] No API key found — set BALLDONTLIE_API_KEY');
      return;
    }
    const client = initApi();
    if (!client) {
      console.warn('[BDL] Client initialization failed');
    }
  },

  /**
   * Get NFL player injuries from BDL (official practice report data)
   * @param {Array} teamIds - Array of NFL team IDs to check for injuries
   * @returns {Promise<Array>} - Array of player injury data with status (Questionable/Doubtful/Out)
   */
  async getNflPlayerInjuries(teamIds = []) {
    try {
      const cacheKey = `nfl_player_injuries_${teamIds.join('_') || 'all'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏈 Fetching NFL player injuries for teams: ${teamIds.length > 0 ? teamIds.join(', ') : 'ALL'}`);

        // Use HTTP endpoint directly (SDK may have issues)
        let allInjuries = [];
        let cursor = null;
        let page = 1;
        const maxPages = 10;

        do {
          const params = new URLSearchParams();
          params.append('per_page', '100');
          if (cursor) params.append('cursor', cursor);
          // Add team_ids if specified
          for (const tid of teamIds) {
            params.append('team_ids[]', tid);
          }

          const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/player_injuries?${params.toString()}`;
          console.log(`🏈 Fetching NFL player injuries (page ${page})`);

          const response = await bdlHttp.get(url, {
            headers: { 'Authorization': API_KEY }
          });

          const injuries = response.data?.data || [];
          allInjuries = allInjuries.concat(injuries);
          cursor = response.data?.meta?.next_cursor;
          page++;
        } while (cursor && page <= maxPages);

        console.log(`🏈 Found ${allInjuries.length} NFL player injuries (${page - 1} pages)`);

        // Log injury breakdown
        const outPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'OUT');
        const doubtfulPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'DOUBTFUL');
        const questionablePlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'QUESTIONABLE');

        if (outPlayers.length > 0) {
          console.log(`🏈 OUT (${outPlayers.length}): ${outPlayers.slice(0, 10).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${outPlayers.length > 10 ? '...' : ''}`);
        }
        if (doubtfulPlayers.length > 0) {
          console.log(`🏈 DOUBTFUL (${doubtfulPlayers.length}): ${doubtfulPlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${doubtfulPlayers.length > 5 ? '...' : ''}`);
        }
        if (questionablePlayers.length > 0) {
          console.log(`🏈 QUESTIONABLE (${questionablePlayers.length}): ${questionablePlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${questionablePlayers.length > 5 ? '...' : ''}`);
        }

        return allInjuries;
      }, 30); // Cache for 30 minutes - NFL injury reports update less frequently than NBA
    } catch (error) {
      recordPickDataFailure('BDL:getNflPlayerInjuries', error);
      console.error('Error fetching NFL player injuries:', error);
      return [];
    }
  },

  /**
   * Get NHL Player Injuries from BDL
   * Endpoint: GET https://api.balldontlie.io/nhl/v1/player_injuries
   * Returns: player info, status, injury_type, return_date, comment
   *
   * IMPORTANT FOR INJURY INTERPRETATION:
   * - Use return_date to determine if injury is FRESH (0-3 days) or PRICED IN (>3 days)
   * - status: IR, IR-LT, IR-NR, DTD, OUT, LTIR
   * - comment contains detailed injury description
   *
   * @param {Array} teamIds - Array of NHL team IDs to filter (optional)
   * @returns {Promise<Array>} - Array of player injury data
   */
  /**
   * Every play of one NFL game (BDL /nfl/v1/plays, cursor-paged). Final
   * games never change, so the cache holds a week. Used for the explosive-
   * play fact sheet (founder, Sep 21 2026: "get the play-level data").
   */
  async getNflPlays(gameId, ttlMinutes = 10080) {
    if (gameId == null) return [];
    try {
      const cacheKey = `nfl_plays_${gameId}`;
      return await getCachedOrFetch(cacheKey, async () => {
        let all = [];
        let cursor = null;
        let page = 1;
        const maxPages = 6;
        do {
          const params = new URLSearchParams();
          params.append('game_id', String(gameId));
          params.append('per_page', '100');
          if (cursor) params.append('cursor', cursor);
          const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/plays?${params.toString()}`;
          const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
          all = all.concat(response.data?.data || []);
          cursor = response.data?.meta?.next_cursor;
          page++;
        } while (cursor && page <= maxPages);
        console.log(`🏈 NFL plays for game ${gameId}: ${all.length} (${page - 1} pages)`);
        return all;
      }, ttlMinutes);
    } catch (error) {
      console.warn(`[Ball Don't Lie] NFL plays unavailable for game ${gameId}: ${error?.message || error}`);
      return [];
    }
  },

  async getNhlPlayerInjuries(teamIds = []) {
    try {
      const cacheKey = `nhl_player_injuries_${teamIds.join('_') || 'all'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏒 Fetching NHL player injuries for teams: ${teamIds.length > 0 ? teamIds.join(', ') : 'ALL'}`);

        let allInjuries = [];
        let cursor = null;
        let page = 1;
        const maxPages = 10;

        do {
          const params = new URLSearchParams();
          params.append('per_page', '100');
          if (cursor) params.append('cursor', cursor);
          // Add team_ids if specified
          for (const tid of teamIds) {
            params.append('team_ids[]', tid);
          }

          const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/player_injuries?${params.toString()}`;
          console.log(`🏒 Fetching NHL player injuries (page ${page})`);

          const response = await bdlHttp.get(url, {
            headers: { 'Authorization': API_KEY }
          });

          const injuries = response.data?.data || [];
          allInjuries = allInjuries.concat(injuries);
          cursor = response.data?.meta?.next_cursor;
          page++;
        } while (cursor && page <= maxPages);

        console.log(`🏒 Found ${allInjuries.length} NHL player injuries (${page - 1} pages)`);

        // Log injury breakdown by status
        const irPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'IR');
        const irLtPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'IR-LT' || i.status?.toUpperCase() === 'LTIR');
        const dtdPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'DTD' || i.status?.toUpperCase() === 'DAY-TO-DAY');
        const outPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'OUT');

        if (irPlayers.length > 0) {
          console.log(`🏒 IR (${irPlayers.length}): ${irPlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${irPlayers.length > 5 ? '...' : ''}`);
        }
        if (irLtPlayers.length > 0) {
          console.log(`🏒 IR-LT/LTIR (${irLtPlayers.length}): ${irLtPlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${irLtPlayers.length > 5 ? '...' : ''}`);
        }
        if (dtdPlayers.length > 0) {
          console.log(`🏒 DTD (${dtdPlayers.length}): ${dtdPlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${dtdPlayers.length > 5 ? '...' : ''}`);
        }
        if (outPlayers.length > 0) {
          console.log(`🏒 OUT (${outPlayers.length}): ${outPlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${outPlayers.length > 5 ? '...' : ''}`);
        }

        return allInjuries;
      }, 30); // Cache for 30 minutes
    } catch (error) {
      recordPickDataFailure('BDL:getNhlPlayerInjuries', error);
      console.error('Error fetching NHL player injuries:', error);
      return [];
    }
  },

  ...oddsMethods,
  ...nflPlayersMethods,
  ...nflAdvancedStatsMethods,
  ...nflTeamsMethods,
  ...nhlTeamsMethods,
  ...nhlPlayerStatsMethods,
  ...ncaafStatsMethods,
  ...playersMethods,
  ...nbaPlayerStatsMethods,
  ...nbaTeamsMethods,
  ...collegeBasketballMethods,
  ...teamsMethods,
  ...gamesMethods,
  ...mlbMarketsMethods,
  ...mlbGamesMethods,
  ...mlbPlayersMethods,
};

ballDontLieService.initialize();

export { ballDontLieService };
export { BALLDONTLIE_API_BASE_URL, getApiKey, isTransientNetworkError, getCachedOrFetch } from './bdl/transport.js';
export { summarizeNflPlayerGameLogs } from './bdl/nflLogSummary.js';
