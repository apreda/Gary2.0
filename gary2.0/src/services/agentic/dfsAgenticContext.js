/**
 * DFS Agentic Context Builder
 *
 * Data Sources:
 * - Tank01 Fantasy Stats API (RapidAPI): Real DFS salaries for FanDuel/DraftKings
 * - Ball Don't Lie (BDL) API: Player stats, team data, accurate rosters
 * - RapidAPI: NBA injury status (source of truth)
 * - Gemini Grounding: Narrative context (slate analysis)
 */

import { ballDontLieService } from '../ballDontLieService.js';
import {
  fetchDfsSalaries,
  fetchNbaRostersForTeams,
  extractPlayerEnrichment,
  fetchNbaTeamDefenseStats,
  getPlayerDvP,
  fetchNbaProjections,
  fetchNbaNews,
  matchNewsToPlayers
} from '../tank01DfsService.js';
// RotoWire Puppeteer scraper removed — DK uses structured API, FD uses Gemini Grounding
import { discoverDFSSlates as discoverSlatesWithService } from './dfsSlateDiscoveryService.js';
// Import DFS constitution for Sharp Gambler framework
// getConstitutionWithBaseRules removed — DFS constitution now in dfs/constitution/dfsAgenticConstitution.js
import { inferPlayerRole } from './nbaStackingRules.js';
import { fetchAllInjuries as fetchNbaInjuriesFromRapidApi } from '../nbaInjuryReportService.js';

// ═══════════════════════════════════════════════════════════════════════════
// MODULE-LEVEL INJURY CACHE
// ═══════════════════════════════════════════════════════════════════════════
// Allows mergePlayerData to check injury status by name
// Populated by fetchPlayerStatsFromBDL (RapidAPI injuries)
// Necessary because Tank01 and BDL may use different player IDs
// ═══════════════════════════════════════════════════════════════════════════
let _injuryNameCache = new Map(); // normalized name -> { status, description }

// ═══════════════════════════════════════════════════════════════════════════
// DFS FANTASY POINT CALCULATORS
// ═══════════════════════════════════════════════════════════════════════════

function calculateDkNbaFpts(stats) {
  const pts = stats.pts || 0;
  const reb = stats.reb || 0;
  const ast = stats.ast || 0;
  const stl = stats.stl || 0;
  const blk = stats.blk || 0;
  const tov = stats.tov || 0;
  const fg3m = stats.fg3m || 0;
  let fpts = pts + reb * 1.25 + ast * 1.5 + stl * 2 + blk * 2 - tov * 0.5 + fg3m * 0.5;
  const doubles = [pts >= 10, reb >= 10, ast >= 10, stl >= 10, blk >= 10].filter(Boolean).length;
  if (doubles >= 2) fpts += 1.5;
  if (doubles >= 3) fpts += 3;
  return Math.round(fpts * 10) / 10;
}

function calculateFdNbaFpts(stats) {
  const pts = stats.pts || 0;
  const reb = stats.reb || 0;
  const ast = stats.ast || 0;
  const stl = stats.stl || 0;
  const blk = stats.blk || 0;
  const tov = stats.tov || 0;
  return Math.round((pts + reb * 1.2 + ast * 1.5 + stl * 3 + blk * 3 - tov) * 10) / 10;
}

function setInjuryNameCache(injuries) {
  _injuryNameCache = new Map();
  for (const inj of injuries) {
    const playerName = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
    const normalizedName = normalizePlayerName(playerName);
    const status = (inj.status || '').toUpperCase();
    if (normalizedName && status) {
      _injuryNameCache.set(normalizedName, { 
        status, 
        description: inj.description || '',
        returnDate: inj.return_date 
      });
    }
  }
  console.log(`[DFS Context] 📋 Injury name cache populated with ${_injuryNameCache.size} entries`);
}

function getInjuryByName(playerName) {
  const normalizedName = normalizePlayerName(playerName);
  return _injuryNameCache.get(normalizedName);
}



/**
 * Discover DFS slates for a given sport and platform
 * Uses the DFS Slate Discovery Service which prioritizes Gemini Grounding
 * 
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} slateDate - Date string (e.g., '2025-01-05')
 * @returns {Array} List of discovered slates with teams
 */
export async function discoverDFSSlates(sport, platform, slateDate) {
  return await discoverSlatesWithService(sport, platform, slateDate);
}

// Slate discovery uses DK structured API and FD Gemini Grounding (see dfsSlateDiscoveryService.js)


/**
 * Fetch ACTIVE players from BDL with current team assignments
 * This is the source of truth for rosters - more accurate than Gemini search
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {Array} teamIds - Team IDs to filter by
 * @returns {Array} Active players with current teams
 */
async function fetchActivePlayersFromBDL(sport, teamIds = []) {
  const sportKey = sport === 'NBA' ? 'basketball_nba' : 'americanfootball_nfl';
  
  try {
    console.log(`[DFS Context] 📋 Fetching ACTIVE ${sport} players from BDL (team_ids: ${teamIds.join(', ')})`);
    
    let allPlayers = [];
    let nextCursor = undefined;
    let pageCount = 0;
    const maxPages = 20; // Increased to 20 for full coverage (approx 2000 players)
    
    do {
      const params = {
        team_ids: teamIds,
        per_page: 100
      };
      if (nextCursor) params.cursor = nextCursor;
      
      const response = await ballDontLieService.getPlayersActive(sportKey, params);
      
      // BDL SDK/Service might return array directly or object with data/meta
      // After our fix in ballDontLieService, it returns { data, meta } if meta exists
      const players = Array.isArray(response) ? response : (response?.data || []);
      const meta = response?.meta;
      
      allPlayers = allPlayers.concat(players);
      nextCursor = meta?.next_cursor;
      pageCount++;
      
      console.log(`[DFS Context]   - Page ${pageCount}: Got ${players.length} players (Total: ${allPlayers.length})`);
      
      // If we got a full page but no cursor, BDL may have stopped providing pagination.
      // Log and break — we have what we have.
      if (!nextCursor && players.length === 100 && pageCount < 10) {
        console.warn(`[DFS Context] Got full page (100 players) but no next_cursor — BDL may have more pages. Total so far: ${allPlayers.length}`);
        break;
      }
      
    } while (nextCursor && pageCount < maxPages);
    
    console.log(`[DFS Context] ✅ Found ${allPlayers.length} total active players`);
    return allPlayers;
  } catch (error) {
    console.error(`[DFS Context] Active players fetch failed: ${error.message}`);
    return [];
  }
}


/**
 * Fetch player stats from Ball Don't Lie API
 * Uses ACTIVE PLAYERS endpoint for accurate current team assignments
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} dateStr - Date string YYYY-MM-DD
 * @param {string[]} slateTeams - Optional slate team abbreviations to filter by (avoids fetching non-slate teams)
 * @returns {Array} Player stats with accurate team info
 */
export async function fetchPlayerStatsFromBDL(sport, dateStr, slateTeams = []) {
  try {
    if (sport === 'NBA') {
      // Get today's games
      const games = await ballDontLieService.getGames('basketball_nba', { dates: [dateStr] }, 5);

      if (!games || games.length === 0) {
        console.log('[DFS Context] No NBA games found for today');
        return [];
      }

      // Get team IDs from games — filter to slate teams if provided
      const slateTeamSet = slateTeams.length > 0 ? new Set(slateTeams.map(t => t.toUpperCase())) : null;
      const teamIds = [];
      const teamAbbreviations = new Map();
      for (const game of games) {
        if (game.home_team?.id) {
          const abbr = game.home_team.abbreviation;
          if (!slateTeamSet || slateTeamSet.has(abbr?.toUpperCase())) {
            teamIds.push(game.home_team.id);
            teamAbbreviations.set(game.home_team.id, abbr);
          }
        }
        if (game.visitor_team?.id) {
          const abbr = game.visitor_team.abbreviation;
          if (!slateTeamSet || slateTeamSet.has(abbr?.toUpperCase())) {
            teamIds.push(game.visitor_team.id);
            teamAbbreviations.set(game.visitor_team.id, abbr);
          }
        }
      }

      console.log(`[DFS Context] ${slateTeamSet ? 'Slate' : 'All'} teams for BDL fetch: ${[...teamAbbreviations.values()].join(', ')}`);
      
      // ⭐ Use ACTIVE PLAYERS endpoint - this has CURRENT team assignments after trades
      const players = await fetchActivePlayersFromBDL('NBA', teamIds);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // NBA INJURIES: Use RapidAPI (same source as game picks) — NOT BDL
      // RapidAPI is updated 3x daily from official NBA injury reports
      // BDL injury data can be stale — RapidAPI is the source of truth for status
      // ═══════════════════════════════════════════════════════════════════════════
      let injuries = [];
      try {
        console.log(`[DFS Context] 🏥 Fetching NBA injuries from RapidAPI...`);
        const rapidApiEntries = await fetchNbaInjuriesFromRapidApi(dateStr);

        // Filter to actionable injuries (skip "Available" and G-League)
        // and map to BDL-compatible shape for downstream code
        const teamNameSet = new Set([...teamAbbreviations.values()].map(t => t.toUpperCase()));
        for (const entry of rapidApiEntries) {
          const status = (entry.status || '').toLowerCase();
          if (status === 'available') continue;
          const reason = (entry.reason || '').toLowerCase();
          if (reason.includes('g league') || reason.includes('g-league')) continue;

          const fullName = (entry.player || '').trim();
          const nameParts = fullName.split(/\s+/);
          const first_name = nameParts[0] || '';
          const last_name = nameParts.slice(1).join(' ') || '';

          injuries.push({
            player: { first_name, last_name },
            status: entry.status,
            description: entry.reason || '',
            return_date: null
          });
        }
        console.log(`[DFS Context] ✅ RapidAPI: ${injuries.length} actionable injuries found`);
      } catch (rapidApiErr) {
        console.error(`[DFS Context] ❌ RapidAPI injury fetch failed: ${rapidApiErr.message}`);
        console.error(`[DFS Context] No fallback — BDL injury data is unreliable for DFS status`);
        // Continue with empty injuries — Gary will see no injury data rather than wrong injury data
      }

      // ⭐ CRITICAL: Populate module-level injury cache for use in mergePlayerData
      // This allows Tank01 players to be checked by name even if their IDs don't match BDL
      setInjuryNameCache(injuries);

      // Create injury maps for player matching
      const playerInjuryStatusMap = new Map(); // ID -> status (for BDL players)
      const playerInjuryNameMap = _injuryNameCache; // Name-based lookup (for Tank01 ID mismatches)

      // Match injuries to BDL players by name for ID-based lookup
      for (const inj of injuries) {
        const injName = `${inj.player?.first_name} ${inj.player?.last_name}`.toLowerCase().trim();
        const status = (inj.status || '').toUpperCase();
        if (!injName || !status) continue;

        // Find matching BDL player by name
        const matchedPlayer = players.find(p => {
          const pName = `${p.first_name} ${p.last_name}`.toLowerCase().trim();
          return pName === injName || pName.includes(injName) || injName.includes(pName);
        });
        if (matchedPlayer?.id) {
          playerInjuryStatusMap.set(matchedPlayer.id, status);
        }
      }

      // Count by status type for logging
      const outCount = [...playerInjuryStatusMap.values()].filter(s => s === 'OUT').length;
      const questionableCount = [...playerInjuryStatusMap.values()].filter(s => s === 'QUESTIONABLE' || s.includes('GTD') || s.includes('DAY')).length;
      const doubtfulCount = [...playerInjuryStatusMap.values()].filter(s => s === 'DOUBTFUL').length;

      console.log(`[DFS Context] 🏥 Injuries: ${outCount} OUT, ${doubtfulCount} DOUBTFUL, ${questionableCount} QUESTIONABLE/GTD`);

      // Log OUT players specifically (these are CRITICAL to exclude)
      const outPlayers = injuries.filter(i => (i.status || '').toUpperCase() === 'OUT');
      if (outPlayers.length > 0) {
        console.log(`[DFS Context] 🚫 OUT PLAYERS (will exclude): ${outPlayers.map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}`);
      }

      // Log questionable players (included in pool with flag)
      const questionablePlayers = injuries.filter(i => {
        const st = (i.status || '').toUpperCase();
        return st === 'QUESTIONABLE' || st.includes('GTD') || st.includes('DAY');
      });
      if (questionablePlayers.length > 0) {
        console.log(`[DFS Context] ⚠️ QUESTIONABLE/GTD (included with flag): ${questionablePlayers.map(i => `${i.player?.first_name} ${i.player?.last_name} (${i.status})`).join(', ')}`);
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // GEMINI GROUNDING INJURY CHECK - Catch last-minute scratches RapidAPI might miss
      // ═══════════════════════════════════════════════════════════════════════════
      // RapidAPI is our injury source of truth — no Grounding needed

      // Get current NBA season (consistent with rest of codebase: 1-indexed months)
      // NBA season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // 1-indexed for consistency
      const season = currentMonth >= 10 ? currentYear : currentYear - 1;
      
      console.log(`[DFS Context] Fetching NBA season ${season}-${season + 1} stats`);
      
      // Fetch season averages from BDL for ALL players in batches
      const playerIds = players.map(p => p.id).filter(Boolean);
      let seasonAverages = [];
      const statsBatchSize = 100;
      
      for (let i = 0; i < playerIds.length; i += statsBatchSize) {
        const batchIds = playerIds.slice(i, i + statsBatchSize);
        console.log(`[DFS Context] Fetching NBA season averages for batch ${Math.floor(i/statsBatchSize) + 1} (${batchIds.length} players)`);
        const batchAverages = await ballDontLieService.getNbaSeasonAverages({
          season,
          player_ids: batchIds
        });
        if (Array.isArray(batchAverages)) {
          seasonAverages.push(...batchAverages);
        }
      }
      
      console.log(`[DFS Context] Retrieved ${seasonAverages.length} total player season averages`);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // FETCH L5 GAME LOGS FOR TREND ANALYSIS
      // ═══════════════════════════════════════════════════════════════════════════
      // Get last 5 games for each player to calculate hot/cold streaks
      // This provides REAL data instead of relying on Gemini search
      const l5StatsMap = new Map();
      try {
        // ⭐ FIX: Use start_date instead of seasons to get RECENT games only
        // Query last 14 days to ensure we capture at least 5 games per player
        // NOTE: `dateStr` is the parameter passed to fetchPlayerStatsFromBDL (YYYY-MM-DD format)
        const targetDate = new Date(dateStr + 'T12:00:00'); // Parse the date string
        const fourteenDaysAgo = new Date(targetDate);
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const l5StartDate = fourteenDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD
        
        // Fetch L5 for top players by season PPG (most likely to be rostered).
        // Deep bench players (low PPG) rarely appear in DFS lineups.
        // Use season averages (already fetched) to identify top candidates.
        const playerPpgMap = new Map();
        for (const entry of seasonAverages) {
          const pid = entry?.player?.id;
          const ppg = entry?.stats?.pts || entry?.pts || 0;
          if (pid) playerPpgMap.set(pid, ppg);
        }
        const trendBatchIds = [...playerIds]
          .sort((a, b) => (playerPpgMap.get(b) || 0) - (playerPpgMap.get(a) || 0))
          .slice(0, 80); // Top 80 players by PPG — covers all rosterable candidates
        const L5_BATCH_SIZE = 15; // 15 players * ~6 games = ~90 records per batch
        console.log(`[DFS Context] Fetching L5 trends for top ${trendBatchIds.length}/${playerIds.length} players by PPG (from ${l5StartDate} to ${dateStr})`);
        
        const allRecentStats = [];
        for (let i = 0; i < trendBatchIds.length; i += L5_BATCH_SIZE) {
          const batchIds = trendBatchIds.slice(i, i + L5_BATCH_SIZE);
          const batchStats = await ballDontLieService.getPlayerStats('basketball_nba', {
            player_ids: batchIds,
            start_date: l5StartDate,
            end_date: dateStr,
            per_page: 100
          });
          if (Array.isArray(batchStats)) {
            allRecentStats.push(...batchStats);
          }
        }
        
        console.log(`[DFS Context] Retrieved ${allRecentStats.length} recent game stats`);
        
        // Group by player and take last 5 games
        const playerGames = new Map();
        allRecentStats.forEach(stat => {
          const pid = stat.player?.id;
          if (!pid) return;
          if (!playerGames.has(pid)) playerGames.set(pid, []);
          playerGames.get(pid).push(stat);
        });
        
        // Build player ID → team ID map for opponent detection
        const playerTeamIdMap = new Map();
        for (const p of players) {
          if (p.id && p.team?.id) playerTeamIdMap.set(p.id, p.team.id);
        }

        // Calculate L5 averages for each player
        for (const [pid, games] of playerGames) {
          // Sort by game date descending and take last 5
          const sortedGames = games
            .filter(g => g.game?.date)
            .sort((a, b) => new Date(b.game.date) - new Date(a.game.date))
            .slice(0, 5);
          
          if (sortedGames.length >= 3) { // Need at least 3 games for meaningful trend
            // Build individual game rows with context (opponent, date, DFS FPTS)
            const gameRows = sortedGames.map(g => {
              // Compare against player's TEAM id (not player id) to determine opponent
              const playerTeamId = playerTeamIdMap.get(pid);
              const opp = g.game?.home_team_id === playerTeamId
                ? g.game?.visitor_team?.abbreviation
                : g.game?.home_team?.abbreviation;
              return {
                date: g.game?.date || null,
                opponent: opp || null,
                pts: g.pts || 0,
                reb: g.reb || 0,
                ast: g.ast || 0,
                stl: g.stl || 0,
                blk: g.blk || 0,
                tov: g.tov || 0,
                fg3m: g.fg3m || 0,
                min: parseFloat(g.min) || 0,
                pf: g.pf || 0,
                dkFpts: calculateDkNbaFpts(g),
                fdFpts: calculateFdNbaFpts(g)
              };
            });

            const n = sortedGames.length;
            const l5 = {
              games: n,
              gameRows,
              ppg: sortedGames.reduce((sum, g) => sum + (g.pts || 0), 0) / n,
              rpg: sortedGames.reduce((sum, g) => sum + (g.reb || 0), 0) / n,
              apg: sortedGames.reduce((sum, g) => sum + (g.ast || 0), 0) / n,
              spg: sortedGames.reduce((sum, g) => sum + (g.stl || 0), 0) / n,
              bpg: sortedGames.reduce((sum, g) => sum + (g.blk || 0), 0) / n,
              fpg: sortedGames.reduce((sum, g) => sum + (g.pf || 0), 0) / n,
              mpg: sortedGames.reduce((sum, g) => sum + (parseFloat(g.min) || 0), 0) / n,
              bestPts: Math.max(...sortedGames.map(g => g.pts || 0)),
              worstPts: Math.min(...sortedGames.map(g => g.pts || 0)),
              dkFptsAvg: Math.round(gameRows.reduce((sum, g) => sum + g.dkFpts, 0) / n * 10) / 10,
              fdFptsAvg: Math.round(gameRows.reduce((sum, g) => sum + g.fdFpts, 0) / n * 10) / 10,
              bestDkFpts: Math.max(...gameRows.map(g => g.dkFpts)),
              worstDkFpts: Math.min(...gameRows.map(g => g.dkFpts))
            };
            l5StatsMap.set(pid, l5);
          }
        }
        
        console.log(`[DFS Context] 📈 Fetched L5 trends for ${l5StatsMap.size} players`);
      } catch (err) {
        console.warn(`[DFS Context] L5 fetch failed (non-critical): ${err.message}`);
      }
      
      // Merge stats with players
      // BDL season averages structure: { player: {...}, season: 2025, stats: { pts, reb, ast, ... } }
      const statsMap = new Map();
      (seasonAverages || []).forEach(entry => {
        const pid = entry?.player?.id;
        // ⭐ FIX: Stats are nested under entry.stats, not entry directly
        if (pid && entry.stats) statsMap.set(pid, entry.stats);
      });
      
      // Return players with ACCURATE team from BDL Active Players
      return players.map(p => {
        const stats = statsMap.get(p.id) || {};
        const l5 = l5StatsMap.get(p.id);
        
        // ⭐ Get injury status from BDL injury report - check BOTH ID and NAME
        // This includes OUT, DOUBTFUL, QUESTIONABLE, GTD - all risky for DFS
        let bdlInjuryStatus = playerInjuryStatusMap.get(p.id) || null;
        
        // Fallback: check by name if ID didn't match (covers Tank01/BDL ID mismatches)
        if (!bdlInjuryStatus) {
          const normalizedName = normalizePlayerName(`${p.first_name} ${p.last_name}`);
          const nameInjury = playerInjuryNameMap.get(normalizedName);
          if (nameInjury) {
            bdlInjuryStatus = nameInjury.status;
            console.log(`[DFS Context] 🏥 Injury found by name: ${p.name} → ${bdlInjuryStatus}`);
          }
        }
        
        // ⭐ FIX: Map position for DFS flex slots
        // NBA positions: PG, SG, SF, PF, C
        // Some players listed as "G" (guard) or "F" (forward) - normalize
        let position = (p.position || 'G').toUpperCase();
        if (position === 'G' || position === 'GUARD') position = 'PG';
        if (position === 'F' || position === 'FORWARD') position = 'SF';
        if (position === 'F-C' || position === 'C-F') position = 'PF'; // Power forward/center
        if (position === 'G-F' || position === 'F-G') position = 'SG'; // Combo guard/forward
        
        // Calculate trend (hot/cold) from L5 vs season
        const seasonPpg = stats.pts || 0;
        const l5Ppg = l5?.ppg || seasonPpg;
        let recentForm = 'neutral';
        if (seasonPpg > 0) {
          const pctDiff = ((l5Ppg - seasonPpg) / seasonPpg) * 100;
          if (pctDiff >= 15) recentForm = 'hot';      // 15%+ above season avg
          else if (pctDiff <= -15) recentForm = 'cold'; // 15%+ below season avg
        }
        
        return {
          id: p.id,
          name: `${p.first_name} ${p.last_name}`,
          // ⭐ Team comes from ACTIVE PLAYERS - this is accurate after trades
          team: p.team?.abbreviation || p.team?.name || 'UNK',
          position: position,
          injured: bdlInjuryStatus ? true : false,
          // ⭐ CRITICAL: Set actual injury status for DFS filtering
          // This will be checked by shouldExcludePlayer() to filter QUESTIONABLE/GTD
          status: bdlInjuryStatus || 'ACTIVE',
          // ⭐ Season stats
          seasonStats: {
            ppg: stats.pts || 0,
            rpg: stats.reb || 0,
            apg: stats.ast || 0,
            spg: stats.stl || 0,
            bpg: stats.blk || 0,
            tpg: stats.fg3m || 0,
            topg: stats.tov || 1.5,
            mpg: stats.min ? parseFloat(stats.min) : 0,
            fpts: stats.nba_fantasy_pts || 0,
            dkFpts: calculateDkNbaFpts(stats),
            fdFpts: calculateFdNbaFpts(stats)
          },
          l5Stats: l5 ? {
            ppg: Math.round(l5.ppg * 10) / 10,
            rpg: Math.round(l5.rpg * 10) / 10,
            apg: Math.round(l5.apg * 10) / 10,
            spg: Math.round(l5.spg * 10) / 10,
            bpg: Math.round(l5.bpg * 10) / 10,
            fpg: Math.round(l5.fpg * 10) / 10,
            mpg: Math.round(l5.mpg * 10) / 10,
            bestPts: l5.bestPts,
            worstPts: l5.worstPts,
            dkFptsAvg: l5.dkFptsAvg,
            fdFptsAvg: l5.fdFptsAvg,
            bestDkFpts: l5.bestDkFpts,
            worstDkFpts: l5.worstDkFpts,
            games: l5.games,
            gameRows: l5.gameRows
          } : null,
          recentForm: recentForm // 'hot', 'cold', or 'neutral'
        };
      });
      // ⚠️ DON'T filter injured players here! Let mergePlayerData handle it.
      // If we filter here, Tank01 will re-add them as "missing" players.
      
    } else if (sport === 'NFL') {
      // Get NFL games for today
      const allGames = await ballDontLieService.getGames('americanfootball_nfl', { dates: [dateStr] }, 5);
      
      if (!allGames || allGames.length === 0) {
        console.log('[DFS Context] No NFL games found for today');
        return [];
      }
      
      // ⭐ Filter to ONLY games actually on this specific date
      // BDL returns all Week 17 games, but status field has actual date like "12/27 - 4:30 PM EST"
      const targetMonth = dateStr.split('-')[1].replace(/^0/, ''); // "1" instead of "01"
      const targetDay = dateStr.split('-')[2].replace(/^0/, ''); // "4" instead of "04"
      const targetDateStr = `${targetMonth}/${targetDay}`; // "1/4"
      
      const games = allGames.filter(game => {
        // Check if game date matches dateStr (YYYY-MM-DD)
        // Or if status contains today's date (e.g., "1/4 - 1:00 PM EST")
        const gameDate = game.date || '';
        const status = game.status || '';
        return gameDate.startsWith(dateStr) || status.includes(targetDateStr);
      });
      
      console.log(`[DFS Context] Filtered to ${games.length} NFL games actually on ${targetDateStr} (from ${allGames.length} total week games)`);
      
      if (games.length === 0) {
        console.log('[DFS Context] No NFL games found for TODAY specifically');
        // List what games are available
        allGames.forEach(g => {
          console.log(`  - ${g.visitor_team?.abbreviation} @ ${g.home_team?.abbreviation}: ${g.status}`);
        });
        return [];
      }
      
      // Log today's games
      console.log(`[DFS Context] Today's NFL games:`);
      games.forEach(g => {
        console.log(`  - ${g.visitor_team?.abbreviation} @ ${g.home_team?.abbreviation}: ${g.status}`);
      });
      
      // Get team IDs from TODAY's games only
      const teamIds = new Set();
      for (const game of games) {
        if (game.home_team?.id) teamIds.add(game.home_team.id);
        if (game.visitor_team?.id) teamIds.add(game.visitor_team.id);
        if (game.away_team?.id) teamIds.add(game.away_team.id);
      }
      
      // Fetch active players for these teams with pagination
      let allPlayers = [];
      let nextCursor = undefined;
      let pageCount = 0;
      const maxPages = 5;
      
      do {
        const params = {
          team_ids: Array.from(teamIds),
          per_page: 100
        };
        if (nextCursor) params.cursor = nextCursor;
        
        const response = await ballDontLieService.getPlayersGeneric('americanfootball_nfl', params);
        
        const players = Array.isArray(response) ? response : (response?.data || []);
        const meta = response?.meta;
        
        allPlayers = allPlayers.concat(players);
        nextCursor = meta?.next_cursor;
        pageCount++;
        
        console.log(`[DFS Context]   - Page ${pageCount}: Got ${players.length} players (Total: ${allPlayers.length})`);
        
      } while (nextCursor && pageCount < maxPages);
      
      const players = allPlayers;
      
      // Get current NFL season (2025 season runs Sept 2025 - Feb 2026)
      // NFL season starts in September, so Sept-Dec = current year, Jan-Jul = previous year
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // 1-indexed for consistency
      // NFL: Sept(9)-Dec(12) = current year, Jan(1)-Jul(7) = previous year
      const season = currentMonth >= 9 ? currentYear : currentYear - 1;
      
      console.log(`[DFS Context] Fetching NFL ${season} season stats`);
      
      // Fetch NFL season stats from BDL
      // BDL NFL Season Stats provides: passing_yards, rushing_yards, receiving_yards, 
      // passing_touchdowns, rushing_touchdowns, receiving_touchdowns, receptions, etc.
      const playerIds = players.map(p => p.id).filter(Boolean);
      let seasonStats = [];
      
      try {
        // BDL NFL season_stats endpoint - fetch in parallel batches for ALL players
        const batchSize = 10;
        console.log(`[DFS Context] Fetching NFL season stats for ${playerIds.length} players in batches of ${batchSize}`);
        
        for (let i = 0; i < playerIds.length; i += batchSize) {
          const batch = playerIds.slice(i, i + batchSize);
          const batchResults = await Promise.all(
            batch.map(pid => 
              ballDontLieService.getNflPlayerSeasonStats?.({ playerId: pid, season })
                .catch(() => [])
            )
          );
          seasonStats.push(...batchResults.flat());
        }
      } catch (e) {
        console.warn(`[DFS Context] NFL season stats fetch failed: ${e.message}`);
      }
      
      // Create stats map
      const statsMap = new Map();
      (seasonStats || []).forEach(entry => {
        const pid = entry?.player?.id;
        if (pid) statsMap.set(pid, entry);
      });
      
      const playerList = players.map(p => {
        const stats = statsMap.get(p.id) || {};
        const position = (p.position_abbreviation || p.position || '').toUpperCase();
        
        // Map BDL NFL stats to our DFS format
        // Fields from BDL docs: passing_yards_per_game, passing_touchdowns, passing_interceptions,
        // rushing_yards_per_game, rushing_touchdowns, receptions, receiving_yards_per_game, etc.
        return {
          name: `${p.first_name} ${p.last_name}`,
          team: p.team?.abbreviation || p.team?.name || 'UNK',
          position: position === 'QUARTERBACK' ? 'QB' :
                   position === 'RUNNING BACK' ? 'RB' :
                   position === 'WIDE RECEIVER' ? 'WR' :
                   position === 'TIGHT END' ? 'TE' :
                   position || 'FLEX',
          seasonStats: {
            // QB stats
            passing_yards_per_game: stats.passing_yards_per_game || 0,
            passing_touchdowns: stats.passing_touchdowns || 0,
            passing_interceptions: stats.passing_interceptions || 0,
            passing_completion_pct: stats.passing_completion_pct || 0,
            // Rushing stats
            rushing_yards_per_game: stats.rushing_yards_per_game || 0,
            rushing_touchdowns: stats.rushing_touchdowns || 0,
            rushing_attempts: stats.rushing_attempts || 0,
            rushing_fumbles_lost: stats.rushing_fumbles_lost || 0,
            // Receiving stats
            receptions: stats.receptions || 0,
            receiving_yards_per_game: stats.receiving_yards_per_game || 0,
            receiving_touchdowns: stats.receiving_touchdowns || 0,
            receiving_targets: stats.receiving_targets || 0,
            receiving_fumbles_lost: stats.receiving_fumbles_lost || 0,
            // Games played
            games_played: stats.games_played || 0
          }
        };
      });
      
      // ⭐ Add DST entries for each team playing
      const teamAbbrs = [...new Set(playerList.map(p => p.team))];
      const dstEntries = teamAbbrs.map(team => ({
        name: `${team} DST`,
        team: team,
        position: 'DST',
        seasonStats: { isDST: true },
        isDST: true
      }));
      
      console.log(`[DFS Context] Added ${dstEntries.length} DST entries for teams: ${teamAbbrs.join(', ')}`);
      
      // ⭐ Fetch kickers from team rosters (BDL has them as "PK" position in roster)
      // Note: Only FanDuel NFL uses kickers (DraftKings NFL doesn't have K position)
      const kickerEntries = [];
      try {
        for (const teamId of teamIds) {
          // getNflTeamRoster returns array directly, not {data: []}
          const roster = await ballDontLieService.getNflTeamRoster(teamId, season);
          if (roster && roster.length > 0) {
            // Find kickers (PK position in roster depth chart)
            const kickers = roster.filter(r => 
              r.position === 'PK' || 
              r.player?.position_abbreviation === 'PK' ||
              r.player?.position === 'Place Kicker' ||
              r.player?.position === 'Kicker'
            );
            for (const k of kickers) {
              if (k.depth === 1) { // Only get starter
                // Get team abbreviation from the game data
                const teamAbbr = k.player?.team?.abbreviation || 
                  games.find(g => g.home_team?.id === teamId)?.home_team?.abbreviation ||
                  games.find(g => g.visitor_team?.id === teamId)?.visitor_team?.abbreviation ||
                  'UNK';
                kickerEntries.push({
                  name: k.player_name || `${k.player?.first_name} ${k.player?.last_name}`,
                  team: teamAbbr,
                  position: 'K',
                  seasonStats: { isKicker: true },
                  isKicker: true,
                  id: k.player?.id
                });
              }
            }
          }
        }
        if (kickerEntries.length > 0) {
          console.log(`[DFS Context] Added ${kickerEntries.length} kickers: ${kickerEntries.map(k => `${k.name} (${k.team})`).join(', ')}`);
        }
      } catch (e) {
        console.warn(`[DFS Context] Could not fetch kickers from rosters: ${e.message}`);
      }
      
      return [...playerList, ...dstEntries, ...kickerEntries];
    }
    
    return [];
  } catch (error) {
    console.error(`[DFS Context] BDL fetch error: ${error.message}`);
    return [];
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INJURY STATUS FILTERING FOR DFS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * HARD EXCLUDE (definitely not playing):
 * - OUT: Confirmed not playing
 * - DOUBTFUL: Very unlikely (<25% chance)
 * - IR/PUP/SUSPENDED: Extended absence
 *
 * INCLUDE WITH FLAG (risky but playable — Gary decides):
 * - QUESTIONABLE: May or may not play — Gary uses only if ceiling justifies risk
 * - GTD/DTD/DAY-TO-DAY: Game-time decision — same as questionable
 * - Gary must NEVER roster a questionable player AND their backup
 *
 * INCLUDE (safe for DFS):
 * - PROBABLE: Likely to play (>75% chance)
 * - HEALTHY: Playing
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */
const HARD_EXCLUDE_STATUSES = ['OUT', 'DOUBTFUL', 'IR', 'PUP', 'SUSPENDED'];

/**
 * Check if a player should be excluded based on rotation risk (DNP-CD)
 * Gary hates "dead air" - players who haven't played in weeks but still have a salary.
 * 
 * Third-string players are DFS poison:
 * - They need TWO injuries to become relevant
 * - Their upside is capped by garbage time only
 * - Example: Kevon Looney (3rd string behind Derik Queen and Yves Missi)
 * 
 * @param {Object} p - The player object with stats
 * @returns {Object} { exclude: boolean, reason: string }
 */
function checkRotationRisk(p) {
  // NBA-specific rotation logic
  const l5Games = p.l5Stats?.games || 0;
  const l5Mpg = p.l5Stats?.mpg || 0;
  const seasonMpg = p.seasonStats?.mpg || 0;
  const seasonPpg = p.seasonStats?.ppg || 0;
  const salary = p.salary || 0;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CASE 0: ZERO MINUTES PLAYED - Player exists in BDL but has NEVER played
  // These are roster players who haven't seen the court (DNP-CD every game)
  // Examples: Enrique Freeman, Rocco Zikarsky, Tristen Newton
  // ═══════════════════════════════════════════════════════════════════════════
  if (seasonMpg === 0 && l5Mpg === 0) {
    return { exclude: true, reason: 'DNP-CD (0 minutes played this season)' };
  }
  
  // Case 1: Deep bench player who hasn't played in last 5 games
  if (l5Games === 0 && seasonMpg < 12 && p.l5Stats !== undefined) {
    return { exclude: true, reason: 'DNP-CD Risk (Out of rotation - 0 games in L5)' };
  }
  
  // Case 2: Deep bench player with effectively 0 minutes
  if (seasonMpg < 5 && l5Mpg < 5 && (seasonMpg > 0 || l5Mpg > 0)) {
    return { exclude: true, reason: 'Deep Bench (Insufficient minutes)' };
  }
  
  // Case 3: Third-string player - low minutes AND low production
  // These players only see garbage time and shouldn't be in optimal lineups
  // Threshold: <12 MPG season AND <6 PPG = backup's backup territory
  if (seasonMpg < 12 && seasonPpg < 6 && salary < 4500 && seasonMpg > 0) {
    return { exclude: true, reason: 'Third-String Risk (Low MPG + Low PPG at punt salary)' };
  }
  
  // Case 4: Minutes trending DOWN - player losing rotation spot
  // If L5 MPG is significantly less than season MPG, they're being phased out
  if (l5Mpg > 0 && seasonMpg > 0 && l5Mpg < seasonMpg * 0.6 && seasonMpg < 20) {
    return { exclude: true, reason: 'Rotation Shrinking (L5 MPG down 40%+ from season)' };
  }

  return { exclude: false };
}

/**
 * Check if a player should be excluded based on injury status
 */
function shouldExcludePlayer(status) {
  if (!status) return false;
  const upperStatus = status.toUpperCase();

  // Catch phrases like "Two weeks away" or "Out for season"
  const specialOutPhrases = ['WEEKS AWAY', 'FOR SEASON', 'INDEFINITE', 'SURGERY'];
  if (specialOutPhrases.some(phrase => upperStatus.includes(phrase))) return true;

  return HARD_EXCLUDE_STATUSES.some(excluded => upperStatus.includes(excluded));
}

/**
 * Merge BDL stats with Grounding salary data
 * BDL is SOURCE OF TRUTH for: team, position, stats
 * Grounding provides: salary, ownership, DFS context, injury status
 * 
 * ⚠️ CRITICAL: Excludes OUT and DOUBTFUL players from lineup consideration
 * 
 * @param {Array} bdlPlayers - Players with stats from BDL (accurate teams/stats)
 * @param {Array} groundedPlayers - Players with salaries from Grounding
 * @returns {Array} Merged player pool (excluding OUT/DOUBTFUL)
 */
export function mergePlayerData(bdlPlayers, groundedPlayers) {
  // Create lookup maps for grounded players - multiple keys for better matching
  const salaryMap = new Map();
  const lastNameMap = new Map(); // Secondary lookup by last name + team
  
  // Track excluded players for logging
  const excludedPlayers = [];
  
  // ⭐ CRITICAL: Check injury status by name for Tank01 players
  // This catches players like Josh Giddey who may have different IDs in Tank01 vs BDL
  // Uses the module-level injury cache populated during fetchPlayerStatsFromBDL
  const checkInjuryByName = (playerName) => {
    const injury = getInjuryByName(playerName);
    if (injury && injury.status) {
      return injury.status.toUpperCase();
    }
    return null;
  };
  
  for (const p of groundedPlayers) {
    const key = normalizePlayerName(p.name);
    const salaryEntry = {
      salary: p.salary,
      position: p.position,
      positions: p.positions,
      status: p.status,
      notes: p.notes,
      ownership: p.ownership,
      dvpRank: p.dvpRank,
      recentForm: p.recentForm,
      originalName: p.name
    };
    salaryMap.set(key, salaryEntry);
    
    // Also create last name + team key for fuzzy matching
    const nameParts = p.name.split(' ');
    if (nameParts.length >= 2 && p.team) {
      const lastName = nameParts[nameParts.length - 1].toLowerCase();
      const lastNameKey = `${lastName}_${(p.team || '').toLowerCase()}`;
      lastNameMap.set(lastNameKey, salaryEntry);
    }
  }
  
  // Merge data - BDL is source of truth for team/position/stats
  const merged = [];
  let directMatches = 0;
  let fuzzyMatches = 0;
  
  for (const p of bdlPlayers) {
    const key = normalizePlayerName(p.name);
    let salaryData = salaryMap.get(key);
    
    // Fuzzy match: try last name + team if exact match failed
    if (!salaryData && p.team) {
      const nameParts = p.name.split(' ');
      if (nameParts.length >= 2) {
        const lastName = nameParts[nameParts.length - 1].toLowerCase();
        const lastNameKey = `${lastName}_${(p.team || '').toLowerCase()}`;
        salaryData = lastNameMap.get(lastNameKey);
        if (salaryData) fuzzyMatches++;
      }
    } else if (salaryData) {
      directMatches++;
    }
    
    if (salaryData && salaryData.salary > 0) {
      // ⭐ CHECK INJURY STATUS - BDL is source of truth for injuries!
      // ALWAYS prefer p.status (from BDL) over salaryData.status (from Tank01)
      // This ensures we catch QUESTIONABLE/GTD players that Tank01 might miss
      const playerStatus = p.status || salaryData.status || 'HEALTHY';
      if (shouldExcludePlayer(playerStatus)) {
        excludedPlayers.push({ name: p.name, team: p.team, status: playerStatus, reason: 'Injury status (BDL)' });
        continue; // Skip this player - too risky for DFS!
      }
      
      // ⭐ CHECK ROTATION RISK - Catch players like Hunter Tyson who don't play
      const rotationRisk = checkRotationRisk(p);
      if (rotationRisk.exclude) {
        excludedPlayers.push({ name: p.name, team: p.team, status: playerStatus, reason: rotationRisk.reason });
        continue;
      }
      
      const playerWithSalary = {
        ...p,
        salary: salaryData.salary,
        position: salaryData.position || p.position,
        positions: salaryData.positions || [salaryData.position || p.position]
      };

      merged.push({
        // BDL provides accurate: name, team, seasonStats, l5Stats
        name: p.name,
        team: p.team,  // ALWAYS use BDL team (accurate after trades)
        // ⭐ CRITICAL: Use Tank01/platform position FIRST (DK/FD have different positions than real life)
        position: salaryData.position || p.position,
        positions: salaryData.positions || [salaryData.position || p.position],
        role: inferPlayerRole(playerWithSalary),
        seasonStats: p.seasonStats,
        l5Stats: p.l5Stats,  // ⭐ PRESERVE L5 data from BDL
        recentForm: p.recentForm || salaryData.recentForm,  // Use BDL's hot/cold calc
        id: p.id,
        // Grounding provides: salary and DFS context
        salary: salaryData.salary,
        status: playerStatus,
        notes: salaryData.notes || '',
        ownership: salaryData.ownership,
        dvpRank: salaryData.dvpRank
      });
    }
  }
  
  // ⭐ CRITICAL: Create set of excluded player names BEFORE Tank01 loop
  // This prevents Tank01 from re-adding players that BDL excluded due to injury
  const excludedPlayerNames = new Set(excludedPlayers.map(p => normalizePlayerName(p.name)));
  
  // Add Tank01/grounded players not in BDL (DST, K, OR players BDL missed)
  // These players get salary-based projection estimates from dfsLineupService
  // This ensures we have enough players for all positions, especially PF/SF which share F players
  let addedFromSalaryData = 0;
  for (const p of groundedPlayers) {
    const key = normalizePlayerName(p.name);
    const exists = merged.some(m => normalizePlayerName(m.name) === key);
    
    // ⭐ CRITICAL: Check if this player was already excluded by BDL injury status!
    // Tank01 might not have injury info, but BDL does - BDL is source of truth
    if (excludedPlayerNames.has(key)) {
      console.log(`[DFS Context] 🚫 Skipping ${p.name} from Tank01 - already excluded by BDL injury`);
      continue;
    }
    
    // ⭐ DOUBLE-CHECK: Look up injury by name (catches ID mismatches)
    const injuryByName = checkInjuryByName(p.name);
    if (injuryByName && shouldExcludePlayer(injuryByName)) {
      console.log(`[DFS Context] 🚫 Skipping ${p.name} from Tank01 - BDL injury by name: ${injuryByName}`);
      excludedPlayers.push({ name: p.name, team: p.team, status: injuryByName, reason: 'Injury status (BDL by name)' });
      continue;
    }
    
    // ⭐ CHECK INJURY STATUS for grounded-only players too (in case Tank01 has status)
    if (shouldExcludePlayer(p.status)) {
      excludedPlayers.push({ name: p.name, team: p.team, status: p.status, reason: 'Injury status (Tank01)' });
      continue;
    }
    
    // ⭐ EXPANDED: Add ANY player with salary who isn't in BDL merged list
    // Try to find their BDL stats first - NEVER fall back to salary-based projections
    if (!exists && p.salary > 0 && p.position) {
      // ═══════════════════════════════════════════════════════════════════════
      // 🔍 BDL LOOKUP: Search for this player in BDL by name (fuzzy match)
      // Use their REAL stats instead of salary-based fallback
      // ═══════════════════════════════════════════════════════════════════════
      let validatedTeam = p.team;
      let foundStats = null;
      
      // Look for this player name in BDL data - try multiple matching strategies
      const pNameLower = p.name?.toLowerCase() || '';
      const pNameParts = pNameLower.split(' ');
      const pFirstName = pNameParts[0] || '';
      const pLastName = pNameParts[pNameParts.length - 1] || '';
      
      // Strategy 1: Exact normalized name match
      let bdlMatch = bdlPlayers.find(b => normalizePlayerName(b.name) === normalizePlayerName(p.name));
      
      // Strategy 2: First 2 chars of first name + full last name
      if (!bdlMatch && pFirstName.length >= 2 && pLastName.length >= 3) {
        bdlMatch = bdlPlayers.find(b => {
          const bName = (b.name || '').toLowerCase();
          const bParts = bName.split(' ');
          const bFirstName = bParts[0] || '';
          const bLastName = bParts[bParts.length - 1] || '';
          return bFirstName.startsWith(pFirstName.slice(0, 2)) && bLastName === pLastName;
        });
      }
      
      // Strategy 3: Last name + same team
      if (!bdlMatch && pLastName.length >= 3) {
        bdlMatch = bdlPlayers.find(b => {
          const bName = (b.name || '').toLowerCase();
          const bLastName = bName.split(' ').pop() || '';
          return bLastName === pLastName && (b.team || '').toUpperCase() === (p.team || '').toUpperCase();
        });
      }
      
      if (bdlMatch) {
        // ⭐ CRITICAL: Use BDL's REAL stats, not salary-based fallback!
        console.log(`[DFS Context] ✅ Found BDL match for ${p.name} → ${bdlMatch.name} (${bdlMatch.team})`);
        validatedTeam = bdlMatch.team || p.team;
        foundStats = bdlMatch.seasonStats;
        
        // Add with REAL BDL stats
        merged.push({
          id: bdlMatch.id,
          name: p.name,
          team: validatedTeam,
          position: p.position || bdlMatch.position,
          positions: p.positions || [p.position || bdlMatch.position],
          salary: p.salary,
          status: bdlMatch.status || p.status || 'HEALTHY',
          notes: p.notes || '',
          ownership: p.ownership,
          // ⭐ Use REAL BDL stats
          seasonStats: foundStats || bdlMatch.seasonStats || { mpg: 0, ppg: 0 },
          l5Stats: bdlMatch.l5Stats, // Include L5 if available
          recentForm: bdlMatch.recentForm,
          fromSalaryDataOnly: false, // Has REAL stats
          teamValidated: true
        });
        addedFromSalaryData++;
      } else {
        // ═══════════════════════════════════════════════════════════════════════
        // 🐛 BUG: NO BDL MATCH - This should NOT happen
        // BDL has stats for ALL players including rookies (via Game Player Stats)
        // This is a name matching bug that needs fixing
        // ═══════════════════════════════════════════════════════════════════════
        console.error(`[DFS Context] 🐛 BUG: Cannot find ${p.name} (${p.team}) in BDL!`);
        console.error(`[DFS Context]    → Tank01 has: "${p.name}" salary=$${p.salary}`);
        console.error(`[DFS Context]    → Check: 1) Name spelling  2) Team abbreviation  3) BDL search`);
        
        // ⚠️ DO NOT add this player to the pool - we cannot use players without real stats
        // Log what we would have added so developers can debug
        console.error(`[DFS Context]    → SKIPPING this player until BDL matching is fixed`);
        // Count as skipped, not added
        // merged.push() intentionally omitted - don't add players without stats
      }
    }
  }
  
  // Log stats coverage - ALL players should have real BDL stats now
  console.log(`[DFS Context] 📊 Stats coverage: ${merged.length} players with REAL BDL stats`);
  if (addedFromSalaryData > 0) {
    console.log(`[DFS Context] ✅ Added ${addedFromSalaryData} Tank01 players with BDL stats matched`);
  }
  
  // Log excluded players
  if (excludedPlayers.length > 0) {
    console.log(`[DFS Context] ❌ EXCLUDED ${excludedPlayers.length} players (OUT/DOUBTFUL/QUESTIONABLE/GTD):`);
    excludedPlayers.forEach(p => console.log(`   - ${p.name}: ${p.status}`));
  }
  
  console.log(`[DFS Context] Merged ${merged.length} players (${directMatches} exact + ${fuzzyMatches} fuzzy matches from ${groundedPlayers.length} grounded, ${bdlPlayers.length} BDL)`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SALARY DATA CHECK - We need REAL salaries for accurate DFS optimization
  // ═══════════════════════════════════════════════════════════════════════════
  // DFS salaries change daily and are set by DraftKings/FanDuel.
  // Estimated salaries can be wildly inaccurate and defeat the purpose of lineup optimization.
  // 
  // If we have too few real salaries, we WARN the user prominently but still
  // add players (some lineup is better than no lineup, but user should know).
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (merged.length < 30 && bdlPlayers.length > merged.length) {
    console.error(`[DFS Context] ════════════════════════════════════════════════════════`);
    console.error(`[DFS Context] ❌ SALARY DATA ISSUE: Only ${merged.length}/${bdlPlayers.length} players have REAL salaries`);
    console.error(`[DFS Context] ❌ Tank01 salary data missing or incomplete for this slate`);
    console.error(`[DFS Context] ❌ Adding remaining players with ESTIMATED salaries`);
    console.error(`[DFS Context] ❌ WARNING: Estimated salaries are unreliable — lineup may be invalid`);
    console.error(`[DFS Context] ════════════════════════════════════════════════════════`);
    
    // Determine if this is a small slate (limited games = tighter salary distribution)
    const isSmallSlate = bdlPlayers.length < 80;
    console.log(`[DFS Context] Slate type: ${isSmallSlate ? 'SMALL (2-4 games)' : 'MAIN (5+ games)'}`);
    
    for (const p of bdlPlayers) {
      const key = normalizePlayerName(p.name);
      const alreadyMerged = merged.some(m => normalizePlayerName(m.name) === key);
      
      // Check if player has valid stats (NBA: ppg, NFL: passing/rushing/receiving)
      const hasNBAStats = p.seasonStats?.ppg > 0;
      // NFL stats use snake_case from BDL: passing_yards_per_game, rushing_touchdowns, etc.
      const hasNFLStats = (p.seasonStats?.passing_yards_per_game > 0 || 
                          p.seasonStats?.rushing_yards_per_game > 0 || 
                          p.seasonStats?.receiving_yards_per_game > 0 || 
                          p.seasonStats?.passing_touchdowns > 0 ||
                          p.seasonStats?.rushing_touchdowns > 0 ||
                          p.seasonStats?.receiving_touchdowns > 0 ||
                          p.seasonStats?.receptions > 0);
      
      // Handle DST and Kicker entries separately (no traditional stats)
      const isDST = p.position === 'DST' || p.isDST;
      const isKicker = p.position === 'K' || p.isKicker;
      
      // ⭐ Check if this player was already excluded due to injury status from grounding
      const normalizedName = normalizePlayerName(p.name);
      if (excludedPlayerNames.has(normalizedName)) {
        continue; // Skip players already marked OUT/DOUBTFUL from grounding
      }
      
      // Also check injury status on the BDL player object itself
      const playerStatus = p.status || 'HEALTHY';
      if (shouldExcludePlayer(playerStatus)) {
        continue; // Skip OUT/DOUBTFUL players
      }
      
      // Include ALL players - even those without stats get minimum salary
      // This ensures we have full position coverage on small slates
      const hasAnyStats = hasNBAStats || hasNFLStats;
      const isSpecialPosition = isDST || isKicker;
      const isRelevantPosition = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'PG', 'SG', 'SF', 'PF', 'C', 'G', 'F'].includes((p.position || '').toUpperCase());
      
      if (!alreadyMerged && (hasAnyStats || isSpecialPosition || isRelevantPosition)) {
        let fpts, estimatedSalary;
        const position = (p.position || '').toUpperCase();
        
        if (isDST) {
          // DST average fantasy points per game (typical range: 5-12)
          fpts = 8;
          estimatedSalary = isSmallSlate ? 4000 : 3500;
        } else if (isKicker) {
          // Kicker average fantasy points per game (typical range: 6-10)
          fpts = 8;
          estimatedSalary = isSmallSlate ? 4500 : 4000;
        } else if (hasNBAStats) {
          // NBA fantasy points estimation
          fpts = p.seasonStats.fpts || (p.seasonStats.ppg + p.seasonStats.rpg * 1.2 + p.seasonStats.apg * 1.5);
        } else {
          // ═══════════════════════════════════════════════════════════════════
          // NFL Fantasy Points Estimation - CORRECT PER-GAME FORMULA
          // ═══════════════════════════════════════════════════════════════════
          // BDL provides:
          // - *_yards_per_game = already per-game (e.g., 233 pass ypg)
          // - *_touchdowns = SEASON TOTAL (e.g., 25 TDs)
          // - receptions = SEASON TOTAL (e.g., 65 receptions)
          //
          // DraftKings scoring (Full PPR):
          // - Passing: 0.04 pts/yd, 4 pts/TD, -1 pts/INT
          // - Rushing: 0.1 pts/yd, 6 pts/TD
          // - Receiving: 0.1 pts/yd, 6 pts/TD, 1 pt/reception
          // ═══════════════════════════════════════════════════════════════════
          
          const stats = p.seasonStats || {};
          const gamesPlayed = stats.games_played || 16;
          
          // Yards per game (already per-game from BDL)
          const passYpg = stats.passing_yards_per_game || 0;
          const rushYpg = stats.rushing_yards_per_game || 0;
          const recYpg = stats.receiving_yards_per_game || 0;
          
          // Convert season totals to per-game
          const passTdPg = (stats.passing_touchdowns || 0) / gamesPlayed;
          const intsPg = (stats.passing_interceptions || 0) / gamesPlayed;
          const rushTdPg = (stats.rushing_touchdowns || 0) / gamesPlayed;
          const recTdPg = (stats.receiving_touchdowns || 0) / gamesPlayed;
          const recPg = (stats.receptions || 0) / gamesPlayed;
          
          // Calculate per-game fantasy points (DraftKings Full PPR)
          fpts = (passYpg * 0.04) + (passTdPg * 4) - (intsPg * 1) + 
                 (rushYpg * 0.1) + (rushTdPg * 6) + 
                 (recYpg * 0.1) + (recTdPg * 6) + recPg;
        }
        
        // ═══════════════════════════════════════════════════════════════════
        // SALARY ESTIMATION - Position-aware for NFL, small slate adjustment
        // ═══════════════════════════════════════════════════════════════════
        // Small slates have TIGHTER salary distribution to prevent stacking all stars
        // Elite players cost MORE on small slates to force tough decisions
        // ═══════════════════════════════════════════════════════════════════
        
        if (!isDST && !isKicker) {
          if (hasNFLStats || (!hasNBAStats && isRelevantPosition && ['QB', 'RB', 'WR', 'TE'].includes(position))) {
            // NFL position-specific salary estimation
            // For players without stats, use position-based minimum salary
            if (!hasNFLStats) {
              // Minimum salary for NFL players without stats
              const minSalaries = { QB: 4500, RB: 4000, WR: 3500, TE: 3000 };
              fpts = 0;
              estimatedSalary = minSalaries[position] || 3000;
            } else if (position === 'QB') {
              // Elite QB (Herbert): 20+ fpts/game = $7,500-$8,500
              // Mid-tier QB: 15-20 fpts = $6,000-$7,500
              // Backup QB: <15 fpts = $4,500-$6,000
              if (fpts >= 20) {
                estimatedSalary = isSmallSlate ? 7800 + (fpts - 20) * 70 : 7000 + (fpts - 20) * 100;
              } else if (fpts >= 15) {
                estimatedSalary = isSmallSlate ? 6500 + (fpts - 15) * 260 : 5500 + (fpts - 15) * 300;
              } else {
                estimatedSalary = isSmallSlate ? 5000 + fpts * 100 : 4500 + fpts * 70;
              }
            } else if (position === 'RB') {
              // Elite RB (Henry/Jacobs): 18+ fpts = $7,200-$8,400
              // Starter RB: 12-18 fpts = $5,500-$7,200
              // Backup RB: <12 fpts = $4,000-$5,500
              if (fpts >= 18) {
                estimatedSalary = isSmallSlate ? 7500 + (fpts - 18) * 90 : 7000 + (fpts - 18) * 100;
              } else if (fpts >= 12) {
                estimatedSalary = isSmallSlate ? 5800 + (fpts - 12) * 285 : 5200 + (fpts - 12) * 300;
              } else {
                estimatedSalary = isSmallSlate ? 4200 + fpts * 130 : 4000 + fpts * 100;
              }
            } else if (position === 'WR') {
              // Elite WR (Nico Collins): 16+ fpts = $6,800-$8,000
              // WR2: 10-16 fpts = $5,000-$6,800
              // WR3: <10 fpts = $3,500-$5,000
              if (fpts >= 16) {
                estimatedSalary = isSmallSlate ? 7000 + (fpts - 16) * 100 : 6500 + (fpts - 16) * 100;
              } else if (fpts >= 10) {
                estimatedSalary = isSmallSlate ? 5200 + (fpts - 10) * 300 : 4800 + (fpts - 10) * 285;
              } else {
                estimatedSalary = isSmallSlate ? 3800 + fpts * 140 : 3500 + fpts * 130;
              }
            } else if (position === 'TE') {
              // Elite TE (Andrews): 12+ fpts = $6,000-$7,000
              // Mid TE: 8-12 fpts = $4,500-$6,000
              // Backup TE: <8 fpts = $3,000-$4,500
              if (fpts >= 12) {
                estimatedSalary = isSmallSlate ? 6200 + (fpts - 12) * 100 : 5800 + (fpts - 12) * 100;
              } else if (fpts >= 8) {
                estimatedSalary = isSmallSlate ? 4800 + (fpts - 8) * 350 : 4300 + (fpts - 8) * 375;
              } else {
                estimatedSalary = isSmallSlate ? 3200 + fpts * 200 : 3000 + fpts * 165;
              }
            } else {
              // Default NFL position
              estimatedSalary = 4500 + fpts * 150;
            }
          } else {
            // NBA salary estimation (existing logic)
            if (fpts >= 50) {
              estimatedSalary = 10000 + (fpts - 50) * 100;
            } else if (fpts >= 35) {
              estimatedSalary = 7000 + (fpts - 35) * 200;
            } else if (fpts >= 20) {
              estimatedSalary = 4500 + (fpts - 20) * 167;
            } else {
              estimatedSalary = 3500 + fpts * 50;
            }
          }
          
          // Round to nearest $100
          estimatedSalary = Math.round(estimatedSalary / 100) * 100;
        }
        
        // Determine note for player type
        let playerNote = 'Estimated salary';
        if (isDST) playerNote = 'Defense/Special Teams';
        else if (isKicker) playerNote = 'Place Kicker';
        
        merged.push({
          name: p.name,
          team: p.team,
          position: p.position,
          seasonStats: p.seasonStats || {},
          id: p.id,
          salary: Math.min(12500, Math.max(3000, estimatedSalary)), // Cap between $3000-$12500
          status: p.status || 'HEALTHY',
          notes: playerNote,
          estimatedSalary: true, // Flag so we know this is estimated
          isDST: isDST,
          isKicker: isKicker
        });
      }
    }
    
    const estimatedCount = merged.filter(p => p.estimatedSalary).length;
    const realCount = merged.length - estimatedCount;
    console.log(`[DFS Context] After salary estimation: ${merged.length} players (${realCount} real salaries, ${estimatedCount} ESTIMATED)`);
  }
  
  // Return both merged players AND excluded players for teammate opportunity analysis
  return { merged, excludedPlayers };
}

/**
 * Normalize player name for matching
 * Handles: accents, apostrophes, Jr/Sr/III, hyphens, etc.
 */
function normalizePlayerName(name) {
  if (!name) return '';
  
  return name
    .toLowerCase()
    // Remove accents/diacritics (Dončić → Doncic, etc.)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Remove suffixes (Jr., Sr., III, II)
    .replace(/\s+(jr\.?|sr\.?|iii|ii|iv)$/i, '')
    // Replace hyphens with spaces (Karl-Anthony → Karl Anthony)
    .replace(/-/g, ' ')
    // Remove apostrophes (O'Neale → ONeale)
    .replace(/'/g, '')
    // Remove periods (P.J. → PJ)
    .replace(/\./g, '')
    // Remove all non-alphanumeric except spaces
    .replace(/[^a-z0-9\s]/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/* extractOwnershipFromText, fetchComprehensiveDFSContext, fetchOwnershipProjections removed — dead Grounding code */

/**
 * Get teams playing on a specific date
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} dateStr - Date YYYY-MM-DD
 * @returns {Array} Team names
 */
export async function getTeamsPlayingToday(sport, dateStr) {
  try {
    const sportKey = sport === 'NBA' ? 'basketball_nba' : 'americanfootball_nfl';
    let games = await ballDontLieService.getGames(sportKey, { dates: [dateStr] }, 5);
    
    // For NFL, filter to only games actually on this date (BDL returns whole week)
    if (sport === 'NFL' && games?.length > 0) {
      const targetMonth = dateStr.split('-')[1];
      const targetDay = dateStr.split('-')[2];
      const targetDateStr = `${targetMonth}/${targetDay}`;
      
      games = games.filter(game => {
        const status = game.status || '';
        return status.includes(targetDateStr);
      });
    }
    
    const teams = new Set();
    for (const game of games || []) {
      if (game.home_team?.abbreviation) teams.add(game.home_team.abbreviation);
      if (game.home_team?.name) teams.add(game.home_team.name);
      if (game.visitor_team?.abbreviation) teams.add(game.visitor_team.abbreviation);
      if (game.visitor_team?.name) teams.add(game.visitor_team.name);
      if (game.away_team?.abbreviation) teams.add(game.away_team.abbreviation);
      if (game.away_team?.name) teams.add(game.away_team.name);
    }
    
    return Array.from(teams);
  } catch (error) {
    console.error(`[DFS Context] Failed to get teams: ${error.message}`);
    return [];
  }
}

/**
 * Build complete DFS context for lineup generation
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} dateStr - Date YYYY-MM-DD
 * @param {Object} slate - Optional slate info { teams: [], games: [], name: '' }
 * @returns {Object} Complete player pool with salaries and stats
 */
export async function buildDFSContext(platform, sport, dateStr, slate = null) {
  const start = Date.now();
  console.log(`\n[DFS Context] Building ${platform} ${sport} context for ${dateStr} ${slate ? `(${slate.name})` : '(Main Slate)'}`);
  
  // Format date for display
  const dateObj = new Date(dateStr + 'T12:00:00');
  const slateDate = dateObj.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });
  
  // Get teams - STRICT: Must have slate-specific teams, no fallback to all teams
  // If no slate is provided (Main slate case), we'll derive teams from games later
  let teams = slate?.teams || [];

  // For Main slate with no explicit teams, get all teams as initial pool
  // This will be validated later against actual filtered games
  if (teams.length === 0 && !slate) {
    teams = await getTeamsPlayingToday(sport, dateStr);
  }

  console.log(`[DFS Context] Initial teams: ${teams.join(', ') || 'Will derive from games'}`);

  // Don't fail here yet - we'll validate after game filtering

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD GAMES FROM SLATE (DK/FD slate discovery is source of truth for games)
  // No BDL getGames() call — slate.games has exact matchups from DK API
  // ═══════════════════════════════════════════════════════════════════════════
  const slateGames = slate?.games || slate?.matchups || [];

  if (slateGames.length === 0 && !slate) {
    // No slate provided at all — need to discover first
    throw new Error('[DFS Context] No slate provided. Run slate discovery first to get game matchups.');
  }

  if (slateGames.length === 0 && slate) {
    throw new Error(`[DFS Context] Slate "${slate?.name}" has no games defined. Fix slate discovery.`);
  }

  // Parse matchup strings ("ATL@CHA") into game objects
  const games = slateGames.map(matchup => {
    const parts = matchup.split('@');
    if (parts.length !== 2) return null;
    const [away, home] = parts.map(t => t.trim().toUpperCase());
    return { homeTeam: home, awayTeam: away, matchup };
  }).filter(Boolean);

  console.log(`[DFS Context] ✅ ${games.length} games from slate "${slate?.name || 'Main'}": ${slateGames.join(', ')}`);

  // Derive teams from games
  const derivedTeams = new Set();
  games.forEach(g => {
    derivedTeams.add(g.homeTeam);
    derivedTeams.add(g.awayTeam);
  });
  const slateTeams = Array.from(derivedTeams);
  teams = slateTeams;
  console.log(`[DFS Context] ✅ Teams in this slate: ${slateTeams.join(', ')}`);

  // Try to enrich games with O/U and spread from BDL
  const sportKey = sport === 'NBA' ? 'basketball_nba' : 'americanfootball_nfl';
  const oddsDate = dateStr || new Date().toISOString().split('T')[0];

  // BDL odds are keyed by game_id — need to fetch games first to get IDs + team names,
  // then join with odds rows. Use getGames (date-only format) + getOddsV2.
  let bdlGameOddsMap = new Map(); // homeTeam+awayTeam → { total, spread }
  let bdlTeamIdMap = new Map(); // teamAbbr (uppercase) → BDL team ID (for opponent stats fetch)
  try {
    const [bdlGames, oddsRows] = await Promise.all([
      ballDontLieService.getGames(sportKey, { dates: [oddsDate] }).catch(() => []),
      ballDontLieService.getOddsV2({ dates: [oddsDate], per_page: 100 }, sportKey).catch(() => [])
    ]);

    // Index odds by game_id (pick first vendor per game)
    const oddsByGameId = new Map();
    for (const row of (oddsRows || [])) {
      if (!oddsByGameId.has(row.game_id)) {
        oddsByGameId.set(row.game_id, row);
      }
    }

    // Match games to odds by game_id, index by team abbreviation pair
    // Also capture team IDs for opponent stats fetching
    for (const g of (bdlGames || [])) {
      const home = (g.home_team?.abbreviation || '').toUpperCase();
      const away = (g.visitor_team?.abbreviation || '').toUpperCase();
      if (!home || !away) continue;

      // Capture team IDs from BDL games
      if (g.home_team?.id) bdlTeamIdMap.set(home, g.home_team.id);
      if (g.visitor_team?.id) bdlTeamIdMap.set(away, g.visitor_team.id);

      const odds = oddsByGameId.get(g.id);
      if (odds) {
        bdlGameOddsMap.set(`${away}@${home}`, {
          total: odds.total_value != null ? parseFloat(odds.total_value) : null,
          spread: odds.spread_home_value != null ? parseFloat(odds.spread_home_value) : null
        });
      }
    }
    if (bdlGameOddsMap.size > 0) {
      console.log(`[DFS Context] ✅ BDL odds enrichment: ${bdlGameOddsMap.size} games with O/U and spread`);
    }
    if (bdlTeamIdMap.size > 0) {
      console.log(`[DFS Context] ✅ BDL team IDs captured: ${bdlTeamIdMap.size} teams`);
    }
  } catch (e) {
    console.warn(`[DFS Context] BDL odds fetch failed (${e.message}) — games will have no O/U or spread`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BACK-TO-BACK DETECTION
  // Teams that played yesterday have fatigue risk — starters may rest or play
  // fewer minutes. This is awareness for Gary, not a hard rule.
  // ═══════════════════════════════════════════════════════════════════════════
  const isNBA = sport.toUpperCase() === 'NBA';
  const b2bTeams = new Set();
  if (isNBA) {
    try {
      const yesterdayDate = new Date(dateStr + 'T12:00:00');
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
      const yesterdayGames = await ballDontLieService.getGames(sportKey, { dates: [yesterdayStr] }).catch(() => []);
      for (const g of (yesterdayGames || [])) {
        const home = (g.home_team?.abbreviation || '').toUpperCase();
        const away = (g.visitor_team?.abbreviation || '').toUpperCase();
        if (home && slateTeams.includes(home)) b2bTeams.add(home);
        if (away && slateTeams.includes(away)) b2bTeams.add(away);
      }
      if (b2bTeams.size > 0) {
        console.log(`[DFS Context] ⚠️ B2B teams detected: ${Array.from(b2bTeams).join(', ')}`);
      }
    } catch (e) {
      console.warn(`[DFS Context] B2B detection failed (${e.message}) — skipping`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OPPONENT DEFENSE PROFILES (NBA only)
  // Fetches real BDL opponent stats + advanced stats per team for game environment
  // ═══════════════════════════════════════════════════════════════════════════
  let teamDefenseProfiles = new Map(); // teamAbbr → { opp_pts, opp_efg_pct, opp_fg3_pct, opp_ft_rate, pace }
  if (isNBA && bdlTeamIdMap.size > 0) {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const season = currentMonth >= 10 ? currentYear : currentYear - 1;

      // Fetch opponent stats + advanced stats for all slate teams in parallel
      const slateTeamEntries = Array.from(bdlTeamIdMap.entries()).filter(([abbr]) =>
        games.some(g => g.homeTeam === abbr || g.awayTeam === abbr)
      );

      const defensePromises = slateTeamEntries.map(async ([abbr, teamId]) => {
        const [oppStats, advStats] = await Promise.all([
          ballDontLieService.getTeamOpponentStats(teamId, season).catch(() => null),
          ballDontLieService.getTeamSeasonAdvanced(teamId, season).catch(() => null)
        ]);
        return { abbr, oppStats, advStats };
      });

      const defenseResults = await Promise.all(defensePromises);

      for (const { abbr, oppStats, advStats } of defenseResults) {
        if (!oppStats) continue;
        // Calculate eFG% allowed: (opp_fgm + 0.5 * opp_fg3m) / opp_fga * 100
        const oppEfgPct = (oppStats.opp_fga > 0)
          ? ((oppStats.opp_fgm + 0.5 * oppStats.opp_fg3m) / oppStats.opp_fga * 100)
          : null;
        // Calculate FT rate allowed: opp_fta / opp_fga
        const oppFtRate = (oppStats.opp_fga > 0)
          ? (oppStats.opp_fta / oppStats.opp_fga)
          : null;

        teamDefenseProfiles.set(abbr, {
          opp_pts: oppStats.opp_pts ?? null,
          opp_efg_pct: oppEfgPct != null ? parseFloat(oppEfgPct.toFixed(1)) : null,
          opp_fg3_pct: oppStats.opp_fg3_pct != null ? parseFloat((oppStats.opp_fg3_pct * 100).toFixed(1)) : null,
          opp_ft_rate: oppFtRate != null ? parseFloat(oppFtRate.toFixed(3)) : null,
          pace: advStats?.pace != null ? parseFloat(advStats.pace.toFixed(1)) : null
        });
      }

      if (teamDefenseProfiles.size > 0) {
        console.log(`[DFS Context] ✅ BDL opponent defense profiles: ${teamDefenseProfiles.size} teams`);
      }
    } catch (e) {
      console.warn(`[DFS Context] BDL opponent defense fetch failed (${e.message}) — games will have no defense profiles`);
    }
  }

  // Build game list with O/U, spread, implied totals, blowout risk, and defense enrichment
  const gameList = games.map(g => {
    const key = `${g.awayTeam}@${g.homeTeam}`;
    const odds = bdlGameOddsMap.get(key);
    const total = odds?.total || null;
    const spread = odds?.spread || null; // Home spread (negative = home favored)

    // Implied team totals: Home = (Total + Spread) / 2, Away = (Total - Spread) / 2
    const impliedHomeTotal = (total != null && spread != null) ? parseFloat(((total + spread) / 2).toFixed(1)) : null;
    const impliedAwayTotal = (total != null && spread != null) ? parseFloat(((total - spread) / 2).toFixed(1)) : null;

    // Blowout risk: |spread| >= 10 means starters may sit late
    const blowoutRisk = spread != null ? Math.abs(spread) >= 10 : false;

    // Game-level pace: average of both teams' pace (possessions per game)
    const homePace = teamDefenseProfiles.get(g.homeTeam)?.pace;
    const awayPace = teamDefenseProfiles.get(g.awayTeam)?.pace;
    const gamePace = (homePace != null && awayPace != null) ? parseFloat(((homePace + awayPace) / 2).toFixed(1)) : (homePace || awayPace || null);

    return {
      home_team: g.homeTeam,
      visitor_team: g.awayTeam,
      away_team: g.awayTeam,
      total,
      spread,
      implied_home_total: impliedHomeTotal,
      implied_away_total: impliedAwayTotal,
      blowout_risk: blowoutRisk,
      game_pace: gamePace,
      home_b2b: b2bTeams.has(g.homeTeam),
      away_b2b: b2bTeams.has(g.awayTeam),
      home_defense: teamDefenseProfiles.get(g.homeTeam) || null,
      away_defense: teamDefenseProfiles.get(g.awayTeam) || null
    };
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STAGGERED FETCH: Tank01 API (rate-limited) + BDL stats + Narrative context
  // ═══════════════════════════════════════════════════════════════════════════
  // Tank01 calls are staggered in three waves to avoid rate limits (429 errors).
  // Wave 1: salaries only (1 call)
  // Wave 2: rosters (batched 4 teams at a time with 300ms delay)
  // Wave 3: defense + projections + news (3 calls parallel)
  // Non-Tank01 calls (BDL) run in parallel alongside all Tank01 waves.
  const [bdlPlayers, tank01Results] = await Promise.all([
    fetchPlayerStatsFromBDL(sport, dateStr, slateTeams),
    // Tank01 calls in staggered waves to avoid rate limits
    (async () => {
      // Wave 1: Salaries first (single call, completes fast)
      const salaryData = await fetchDfsSalaries(sport, dateStr, platform);
      // Wave 2: Rosters (batched 4 teams at a time with 300ms delay between batches)
      const rosterData = isNBA ? await fetchNbaRostersForTeams(slateTeams) : new Map();
      // Wave 3: Defense + Projections + News (3 calls parallel, after rosters done)
      const [teamDefenseStats, tank01Projections, tank01News] = isNBA
        ? await Promise.all([
            fetchNbaTeamDefenseStats(),
            fetchNbaProjections(dateStr),
            fetchNbaNews(30)
          ])
        : [new Map(), new Map(), []];
      return { salaryData, rosterData, teamDefenseStats, tank01Projections, tank01News };
    })()
  ]);
  const { salaryData, rosterData, teamDefenseStats, tank01Projections, tank01News } = tank01Results;
  // Ownership projections removed — no reliable free source exists.
  
  const bdlCount = bdlPlayers.length;
  const salaryCount = salaryData.players?.length || 0;
  
  console.log(`[DFS Context] BDL players (all): ${bdlCount}`);
  console.log(`[DFS Context] Tank01 salary data (all): ${salaryCount} players`);

  // Filter player stats and salaries to ONLY include teams in this slate
  // This is critical - using the derived teams from filtered games
  const slateTeamSet = new Set(teams.map(t => t.toUpperCase()));
  console.log(`[DFS Context] Filtering players to teams: ${Array.from(slateTeamSet).join(', ')}`);

  const filteredBdlPlayers = bdlPlayers.filter(p => slateTeamSet.has(p.team?.toUpperCase()));
  const filteredSalaryPlayers = (salaryData.players || []).filter(p => slateTeamSet.has(p.team?.toUpperCase()));

  console.log(`[DFS Context] ✅ Filtered BDL players: ${filteredBdlPlayers.length} (from ${bdlCount})`);
  console.log(`[DFS Context] ✅ Filtered salary players: ${filteredSalaryPlayers.length} (from ${salaryCount})`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INTEGRATE BENCHMARKS
  // ═══════════════════════════════════════════════════════════════════════════
  // Benchmark projections: Tank01 for NBA — no fallback (Grounding hallucinates numbers)
  let benchmarkProjections = new Map();
  if (isNBA && tank01Projections.size > 0) {
    for (const [name, proj] of tank01Projections) {
      benchmarkProjections.set(normalizePlayerName(proj.longName || name), proj.projFpts);
    }
    console.log(`[DFS Context] Tank01 benchmark projections: ${benchmarkProjections.size} players`);
  } else if (isNBA) {
    console.warn(`[DFS Context] Tank01 projections unavailable — no benchmarks (no fallback to Grounding)`);
  }

  console.log(`[DFS Context] Integrated: ${benchmarkProjections.size} benchmark projections`);
  
  // Merge data sources (Tank01 salaries + BDL stats)
  // Also get excluded players for teammate opportunity analysis
  const { merged: mergedPlayersRaw, excludedPlayers } = mergePlayerData(filteredBdlPlayers, filteredSalaryPlayers);
  let mergedPlayers = mergedPlayersRaw;
  
  // Apply metadata to merged players
  for (const player of mergedPlayers) {
    const key = normalizePlayerName(player.name);
    
    // Benchmark Projection (Tank01 for NBA)
    if (benchmarkProjections.has(key)) {
      player.benchmarkProjection = benchmarkProjections.get(key);
    }

    // B2B flag — team played yesterday
    if (b2bTeams.has(player.team?.toUpperCase())) {
      player.isB2B = true;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TANK01 ENRICHMENT (NBA only — Changes 5, 6, 9)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isNBA) {
    // Build Tank01 playerID → playerName map for news matching
    const tank01PlayerIdMap = new Map();

    // Build a roster name lookup: normalizedName → roster player
    const rosterNameMap = new Map();
    for (const [teamAbv, players] of rosterData) {
      for (const rp of players) {
        const normName = normalizePlayerName(rp.longName || '');
        if (normName) {
          rosterNameMap.set(normName, rp);
          if (rp.playerID) {
            tank01PlayerIdMap.set(String(rp.playerID), rp.longName);
          }
        }
      }
    }

    // Build game lookup: team → opponent (for DvP)
    const teamToOpponent = new Map();
    for (const game of gameList) {
      const home = (game.home_team || '').toUpperCase();
      const away = (game.visitor_team || game.away_team || '').toUpperCase();
      if (home && away) {
        teamToOpponent.set(home, away);
        teamToOpponent.set(away, home);
      }
    }

    // Match news to players
    const newsMap = matchNewsToPlayers(tank01News, tank01PlayerIdMap);

    let enrichedCount = 0;
    for (const player of mergedPlayers) {
      const normName = normalizePlayerName(player.name);
      const rosterPlayer = rosterNameMap.get(normName);

      // Change 5: Player enrichment (TS%, eFG%, injury context, lastGamePlayed)
      if (rosterPlayer) {
        const enrichment = extractPlayerEnrichment(rosterPlayer);
        if (enrichment) {
          player.tsPercent = enrichment.tsPercent;
          player.efgPercent = enrichment.efgPercent;
          player.avgMinutes = enrichment.avgMinutes;
          player.gamesPlayed = enrichment.gamesPlayed;
          player.injuryContext = enrichment.injuryDescription;
          player.injuryReturnDate = enrichment.injuryReturnDate;
          player.lastGamePlayed = enrichment.lastGamePlayed;
          enrichedCount++;
        }
      }

      // Change 6: DvP matchup context
      const playerTeam = (player.team || '').toUpperCase();
      const opponent = teamToOpponent.get(playerTeam);
      if (opponent && teamDefenseStats.size > 0) {
        const dvp = getPlayerDvP(opponent, player.position, teamDefenseStats);
        if (dvp) {
          player.matchupDvP = dvp;
        }
      }

      // Change 9: News context
      if (newsMap.has(rosterPlayer?.longName)) {
        player.newsContext = newsMap.get(rosterPlayer.longName);
      }
    }

    console.log(`[DFS Context] Tank01 enriched ${enrichedCount}/${mergedPlayers.length} players (TS%, eFG%, injury, DvP, news)`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYER USAGE STATS (NBA only — BDL season_averages/general?type=usage)
  // Shows each player's team share: % of PTS, FGA, USG rate
  // Critical for DFS: volume share tells Gary who gets the touches
  // ═══════════════════════════════════════════════════════════════════════════
  if (isNBA) {
    try {
      const playerIds = mergedPlayers.map(p => p.id).filter(Boolean);
      if (playerIds.length > 0) {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const usageSeason = currentMonth >= 10 ? currentYear : currentYear - 1;

        // Fetch in batches of 100 (BDL limit)
        let allUsageStats = [];
        const usageBatchSize = 100;
        for (let i = 0; i < playerIds.length; i += usageBatchSize) {
          const batchIds = playerIds.slice(i, i + usageBatchSize);
          const batchUsage = await ballDontLieService.getNbaSeasonAverages({
            type: 'usage',
            season: usageSeason,
            player_ids: batchIds
          });
          if (Array.isArray(batchUsage)) {
            allUsageStats.push(...batchUsage);
          }
        }

        // Index usage by player_id
        const usageMap = new Map();
        for (const entry of allUsageStats) {
          const pid = entry?.player?.id || entry?.player_id;
          if (pid && entry.stats) {
            usageMap.set(pid, entry.stats);
          }
        }

        // Attach to merged players
        let usageEnrichedCount = 0;
        for (const player of mergedPlayers) {
          if (player.id && usageMap.has(player.id)) {
            const usg = usageMap.get(player.id);
            player.usageStats = {
              pct_pts: usg.pct_pts ?? null,
              pct_fga: usg.pct_fga ?? null,
              pct_reb: usg.pct_reb ?? null,
              pct_ast: usg.pct_ast ?? null,
              usg_pct: usg.usg_pct ?? null
            };
            usageEnrichedCount++;
          }
        }
        console.log(`[DFS Context] ✅ BDL usage stats: ${usageEnrichedCount}/${mergedPlayers.length} players enriched`);
      }
    } catch (e) {
      console.warn(`[DFS Context] BDL usage stats fetch failed (${e.message}) — players will have no usage data`);
    }
  }

  // ⚠️ Filter out late scratches
  const finalMergedPlayers = mergedPlayers.filter(p => p.status !== 'OUT' && p.status !== 'INACTIVE');
  console.log(`[DFS Context] Final slate player pool: ${finalMergedPlayers.length}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TEAMMATE USAGE CONTEXT - Dynamic Role Awareness
  // ═══════════════════════════════════════════════════════════════════════════
  // When high-usage players are OUT, their teammates inherit opportunity.
  // Gary investigates who benefits rather than applying fixed rules.
  // 
  // This is AWARENESS not prescription - Gary knows to look for these situations:
  // - Star PG out → backup PG and wing players see usage spike
  // - Star scorer out → secondary options become primary
  // - Big man out → small ball opportunities, guard rebounds
  // ═══════════════════════════════════════════════════════════════════════════
  const outPlayers = excludedPlayers.filter(p => 
    p.status === 'OUT' || p.status === 'OUT FOR SEASON' || p.status === 'DOUBTFUL'
  );
  
  // Group out players by team to find teammate opportunities
  const outByTeam = {};
  outPlayers.forEach(p => {
    if (!outByTeam[p.team]) outByTeam[p.team] = [];
    // Look up their projection/salary to estimate impact
    const salaryPlayer = filteredSalaryPlayers.find(sp => 
      normalizePlayerName(sp.name) === normalizePlayerName(p.name)
    );
    outByTeam[p.team].push({
      name: p.name,
      status: p.status,
      salary: salaryPlayer?.salary || 0,
      isHighUsage: (salaryPlayer?.salary || 0) >= 8000 // High-salary = high-usage assumption
    });
  });
  
  // For each team with high-usage players out, flag teammates for investigation
  const teamsWithOpportunity = Object.entries(outByTeam)
    .filter(([team, players]) => players.some(p => p.isHighUsage))
    .map(([team, players]) => ({
      team,
      outStars: players.filter(p => p.isHighUsage).map(p => p.name),
      totalOut: players.length
    }));
  
  if (teamsWithOpportunity.length > 0) {
    console.log(`[DFS Context] 🎯 USAGE OPPORTUNITY DETECTED:`);
    teamsWithOpportunity.forEach(({ team, outStars, totalOut }) => {
      console.log(`   ${team}: ${outStars.join(', ')} OUT - teammates may see usage spike`);
      
      // Flag active teammates with expanded role awareness
      mergedPlayers.forEach(player => {
        if (player.team === team && !player.status?.includes('OUT')) {
          // Mark as potential expanded role - not automatic boost, just awareness
          player.teammateOpportunity = {
            outStars,
            totalTeammatesOut: totalOut,
            reason: `${outStars[0]} OUT - investigate usage redistribution`
          };
          // If player is already a target from narrative, reinforce it
          if (player.narrative_type === 'injury_boost' || player.rotation_status === 'expanded_role') {
            player.usageChange = (player.usageChange || 0) + 5; // Signal increased opportunity
            player.isBreakoutCandidate = true;
          }
        }
      });
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD TEAM-LEVEL INJURY MAP (for GET_TEAM_INJURIES tool)
  // ═══════════════════════════════════════════════════════════════════════════
  const injuryMap = {};
  // Include active players with non-healthy status (QUESTIONABLE, GTD, DOUBTFUL)
  for (const p of mergedPlayers) {
    if (p.status && p.status !== 'ACTIVE' && p.status !== 'HEALTHY') {
      const team = (p.team || '').toUpperCase();
      if (!team) continue;
      if (!injuryMap[team]) injuryMap[team] = [];
      injuryMap[team].push({
        player: p.name,
        status: p.status,
        injury: p.injuryContext || '',
      });
    }
  }
  // Include excluded (OUT) players — these are filtered from the player pool
  for (const p of excludedPlayers) {
    const team = (p.team || '').toUpperCase();
    if (!team) continue;
    if (!injuryMap[team]) injuryMap[team] = [];
    injuryMap[team].push({
      player: p.name,
      status: p.status || 'OUT',
      injury: p.injuryContext || '',
    });
  }
  if (Object.keys(injuryMap).length > 0) {
    console.log(`[DFS Context] 🏥 Injury map built: ${Object.keys(injuryMap).length} teams with injuries`);
  }

  const duration = Date.now() - start;
  console.log(`[DFS Context] Context built in ${duration}ms`);

  // Count how many players have estimated vs real salaries
  const estimatedSalaryCount = mergedPlayers.filter(p => p.estimatedSalary).length;
  const realSalaryCount = mergedPlayers.length - estimatedSalaryCount;
  const salaryDataQuality = realSalaryCount >= mergedPlayers.length * 0.7 ? 'good' 
    : realSalaryCount >= mergedPlayers.length * 0.4 ? 'partial' 
    : 'poor';
  
  // Log salary data quality
  if (salaryDataQuality === 'poor') {
    console.error(`[DFS Context] ⚠️ SALARY WARNING: Only ${realSalaryCount}/${mergedPlayers.length} players have real salaries`);
    console.error(`[DFS Context] ⚠️ Lineup may be inaccurate - ${estimatedSalaryCount} players have estimated salaries`);
  } else if (salaryDataQuality === 'partial') {
    console.warn(`[DFS Context] ⚠️ Partial salary data: ${realSalaryCount}/${mergedPlayers.length} real, ${estimatedSalaryCount} estimated`);
  }
  
  return {
    platform,
    sport,
    date: dateStr,
    slateDate,
    players: mergedPlayers,
    gamesCount: games.length,
    games: gameList,
    // Team-level injuries (for GET_TEAM_INJURIES tool)
    injuries: injuryMap,
    // B2B teams (played yesterday — fatigue awareness)
    b2bTeams: Array.from(b2bTeams),
    // Metadata
    salarySource: salaryData.source || 'Tank01 API',
    buildTimeMs: duration,
    // Salary data quality info
    salaryDataInfo: {
      realCount: realSalaryCount,
      estimatedCount: estimatedSalaryCount,
      quality: salaryDataQuality,
      fetchTimeMs: salaryData.fetchTimeMs,
      warning: salaryDataQuality === 'poor' 
        ? `⚠️ Only ${realSalaryCount} players have real salaries - lineup may be inaccurate` 
        : null
    },
    // Diagnostic info (for debugging when things fail)
    bdlPlayersCount: bdlCount,
    tank01PlayersCount: salaryCount,
    error: mergedPlayers.length === 0 
      ? (salaryCount === 0 ? 'Tank01 API failed - no salary data' : 'BDL fetch failed')
      : null
  };
}

export default {
  fetchPlayerStatsFromBDL,
  mergePlayerData,
  getTeamsPlayingToday,
  buildDFSContext,
  // Re-export Tank01 service for direct access if needed
  fetchDfsSalaries
};

