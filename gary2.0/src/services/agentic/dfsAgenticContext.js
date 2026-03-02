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
} from '../tank01DfsService.js';
import { discoverDFSSlates as discoverSlatesWithService } from './dfsSlateDiscoveryService.js';
import { inferPlayerRole } from './nbaStackingRules.js';
import { fetchAllInjuries as fetchNbaInjuriesFromRapidApi } from '../nbaInjuryReportService.js';
import { normalizePlayerName } from './sharedUtils.js';

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
async function fetchPlayerStatsFromBDL(sport, dateStr, slateTeams = []) {
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

      // Log probable players (playing but worth noting — Gary should be aware)
      const probablePlayers = injuries.filter(i => {
        const st = (i.status || '').toUpperCase();
        return st === 'PROBABLE' || st === 'PROB';
      });
      if (probablePlayers.length > 0) {
        console.log(`[DFS Context] ✅ PROBABLE (expected to play): ${probablePlayers.map(i => `${i.player?.first_name} ${i.player?.last_name} (${i.description || i.status})`).join(', ')}`);
      }

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
      // Get last 5 games for each player for trend analysis
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
        // Top 100 by PPG PLUS any player with salary >= $3500 (punt plays may rank low by PPG
        // but are critical DFS differentiators if they've recently gained opportunity)
        const salaryPlayerIds = new Set();
        for (const p of players) {
          if (p.id && (p.salary || 0) >= 3500) salaryPlayerIds.add(p.id);
        }
        const top100ByPpg = [...playerIds]
          .sort((a, b) => (playerPpgMap.get(b) || 0) - (playerPpgMap.get(a) || 0))
          .slice(0, 100);
        const trendBatchIds = [...new Set([...top100ByPpg, ...salaryPlayerIds])];
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
            topg: stats.tov || null,
            mpg: stats.min ? parseFloat(stats.min) : 0,
            fpts: null, // nba_fantasy_pts not available in type:base -- pipeline uses dkFpts/fdFpts
            fgPct: stats.fg_pct || null,
            fg3Pct: stats.fg3_pct || null,
            ftPct: stats.ft_pct || null,
            fga: stats.fga || null,
            oreb: stats.oreb || null,
            dreb: stats.dreb || null,
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
          // Gary has raw L5 vs season data — he assesses form himself
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
      
      // ═══════════════════════════════════════════════════════════════════════════
      // NFL INJURIES: Use BDL player_injuries endpoint
      // BDL NFL injuries come from official practice participation reports
      // ═══════════════════════════════════════════════════════════════════════════
      let nflInjuries = [];
      try {
        console.log(`[DFS Context] Fetching NFL injuries from BDL...`);
        nflInjuries = await ballDontLieService.getNflPlayerInjuries(Array.from(teamIds));
        console.log(`[DFS Context] BDL NFL injuries: ${nflInjuries.length} entries`);
      } catch (injErr) {
        console.error(`[DFS Context] NFL injury fetch failed: ${injErr.message}`);
      }

      // Build injury lookup by player ID and by name
      const nflInjuryById = new Map();
      const nflInjuryByName = new Map();
      for (const inj of nflInjuries) {
        const status = (inj.status || '').toUpperCase();
        if (!status) continue;
        if (inj.player?.id) nflInjuryById.set(inj.player.id, { status, comment: inj.comment || '' });
        const fullName = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim().toLowerCase();
        if (fullName) nflInjuryByName.set(fullName, { status, comment: inj.comment || '' });
      }

      // Populate module-level injury cache for NFL (same pattern as NBA)
      const nflInjuriesForCache = nflInjuries.map(inj => ({
        player: { first_name: inj.player?.first_name || '', last_name: inj.player?.last_name || '' },
        status: inj.status || '',
        description: inj.comment || ''
      }));
      setInjuryNameCache(nflInjuriesForCache);

      // ═══════════════════════════════════════════════════════════════════════════
      // NFL L5 GAME LOGS: Recent form via BDL getNflPlayerGameLogsBatch
      // Provides game-by-game stats, form trends, target trends, usage trends
      // ═══════════════════════════════════════════════════════════════════════════
      let nflGameLogs = {};
      try {
        // Only fetch game logs for players with season stats (active contributors)
        const activePlayerIds = players
          .filter(p => p.id && statsMap.has(p.id))
          .map(p => p.id);

        if (activePlayerIds.length > 0) {
          console.log(`[DFS Context] Fetching NFL L5 game logs for ${activePlayerIds.length} active players`);
          nflGameLogs = await ballDontLieService.getNflPlayerGameLogsBatch(activePlayerIds, season, 5);
          console.log(`[DFS Context] NFL game logs: ${Object.keys(nflGameLogs).length}/${activePlayerIds.length} players`);
        }
      } catch (logErr) {
        console.warn(`[DFS Context] NFL game logs fetch failed: ${logErr.message}`);
      }

      const playerList = players.map(p => {
        const stats = statsMap.get(p.id) || {};
        const position = (p.position_abbreviation || p.position || '').toUpperCase();

        // Check injury status (ID first, then name fallback)
        let injuryStatus = null;
        const injById = nflInjuryById.get(p.id);
        if (injById) {
          injuryStatus = injById.status;
        } else {
          const pName = `${p.first_name} ${p.last_name}`.trim().toLowerCase();
          const injByName = nflInjuryByName.get(pName);
          if (injByName) injuryStatus = injByName.status;
        }

        // Get L5 game log data if available
        const gameLogs = nflGameLogs[p.id] || null;

        // Map BDL NFL stats to our DFS format
        return {
          id: p.id,
          name: `${p.first_name} ${p.last_name}`,
          team: p.team?.abbreviation || p.team?.name || 'UNK',
          position: position === 'QUARTERBACK' ? 'QB' :
                   position === 'RUNNING BACK' ? 'RB' :
                   position === 'WIDE RECEIVER' ? 'WR' :
                   position === 'TIGHT END' ? 'TE' :
                   position || 'FLEX',
          status: injuryStatus || 'ACTIVE',
          injured: !!injuryStatus,
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
          },
          // L5 game logs with form/target/usage trends
          l5Stats: gameLogs ? {
            gamesAnalyzed: gameLogs.gamesAnalyzed,
            averages: gameLogs.averages,
            consistency: gameLogs.consistency,

            targetTrend: gameLogs.targetTrend,
            usageTrend: gameLogs.usageTrend,
            splits: gameLogs.splits,
            lastGame: gameLogs.lastGame,
            games: gameLogs.games
          } : null
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
  if (l5Games === 0 && seasonMpg < 12 && p.l5Stats != null) {
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
function mergePlayerData(bdlPlayers, groundedPlayers) {
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
        excludedPlayers.push({ name: p.name, team: p.team, status: playerStatus, reason: 'Injury status (BDL)', bdlId: p.id });
        continue; // Skip this player - too risky for DFS!
      }

      // ⭐ CHECK ROTATION RISK - Catch players like Hunter Tyson who don't play
      const rotationRisk = checkRotationRisk(p);
      if (rotationRisk.exclude) {
        excludedPlayers.push({ name: p.name, team: p.team, status: playerStatus, reason: rotationRisk.reason, bdlId: p.id });
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
  let skippedNoMatch = 0;
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
      // Use normalizePlayerName for all strategies (strips Jr./Sr./II/III/IV, accents, etc.)
      const pNormalized = normalizePlayerName(p.name);
      const pNameParts = pNormalized.split(' ');
      const pFirstName = pNameParts[0] || '';
      const pLastName = pNameParts[pNameParts.length - 1] || '';

      // Strategy 1: Exact normalized name match
      let bdlMatch = bdlPlayers.find(b => normalizePlayerName(b.name) === pNormalized);

      // Strategy 2: First 2 chars of first name + full last name (normalized)
      if (!bdlMatch && pFirstName.length >= 2 && pLastName.length >= 3) {
        bdlMatch = bdlPlayers.find(b => {
          const bNorm = normalizePlayerName(b.name);
          const bParts = bNorm.split(' ');
          const bFirstName = bParts[0] || '';
          const bLastName = bParts[bParts.length - 1] || '';
          return bFirstName.startsWith(pFirstName.slice(0, 2)) && bLastName === pLastName;
        });
      }

      // Strategy 3: Last name + same team (normalized)
      if (!bdlMatch && pLastName.length >= 3) {
        bdlMatch = bdlPlayers.find(b => {
          const bNorm = normalizePlayerName(b.name);
          const bLastName = bNorm.split(' ').pop() || '';
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
        skippedNoMatch++;
        // merged.push() intentionally omitted - don't add players without stats
      }
    }
  }

  // Log stats coverage - ALL players should have real BDL stats now
  console.log(`[DFS Context] 📊 Stats coverage: ${merged.length} players with REAL BDL stats`);
  if (skippedNoMatch > 0) {
    console.warn(`[DFS Context] ⚠️ ${skippedNoMatch} players skipped (no BDL match) — check name matching`);
  }
  if (addedFromSalaryData > 0) {
    console.log(`[DFS Context] ✅ Added ${addedFromSalaryData} Tank01 players with BDL stats matched`);
  }
  
  // Log excluded players — split by reason for clarity
  if (excludedPlayers.length > 0) {
    const injuryExcluded = excludedPlayers.filter(p => (p.reason || '').includes('Injury status'));
    const rotationExcluded = excludedPlayers.filter(p => !(p.reason || '').includes('Injury status'));
    if (injuryExcluded.length > 0) {
      console.log(`[DFS Context] ❌ EXCLUDED ${injuryExcluded.length} players (Injury: OUT/DOUBTFUL/QUESTIONABLE/GTD):`);
      injuryExcluded.forEach(p => console.log(`   - ${p.name}: ${p.status}`));
    }
    if (rotationExcluded.length > 0) {
      console.log(`[DFS Context] ❌ EXCLUDED ${rotationExcluded.length} players (Rotation risk: low minutes/DNP):`);
      rotationExcluded.forEach(p => console.log(`   - ${p.name}: ${p.reason || p.status}`));
    }
  }
  
  console.log(`[DFS Context] Merged ${merged.length} players (${directMatches} exact + ${fuzzyMatches} fuzzy matches from ${groundedPlayers.length} grounded, ${bdlPlayers.length} BDL)`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SALARY DATA CHECK — HARD FAIL if insufficient real salaries
  // ═══════════════════════════════════════════════════════════════════════════
  // DFS salaries change daily and are set by DraftKings/FanDuel.
  // Estimated salaries are unreliable and defeat the purpose of lineup
  // optimization. If Tank01 salary data is missing or incomplete, the lineup
  // should FAIL with a diagnostic so the root cause can be fixed.
  // ═══════════════════════════════════════════════════════════════════════════

  if (merged.length < 30 && bdlPlayers.length > merged.length) {
    const diagnostic = [
      `[DFS Context] SALARY DATA FAILURE`,
      `  Players with REAL salaries: ${merged.length}`,
      `  Players from BDL (no salary): ${bdlPlayers.length}`,
      `  Minimum required: 30 players with real salaries`,
      `  Root cause: Tank01 salary data missing or incomplete for this slate`,
      `  Action: Check Tank01 API key, verify slate exists on Tank01, check date format`,
    ].join('\n');
    throw new Error(diagnostic);
  }
  
  // Return both merged players AND excluded players for teammate opportunity analysis
  return { merged, excludedPlayers };
}


/**
 * Get teams playing on a specific date
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} dateStr - Date YYYY-MM-DD
 * @returns {Array} Team names
 */
async function getTeamsPlayingToday(sport, dateStr) {
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
  let bdlGameIdMap = new Map(); // teamAbbr (uppercase) → BDL game ID (for player props fetch)
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

      // Capture team IDs and game IDs from BDL games
      if (g.home_team?.id) bdlTeamIdMap.set(home, g.home_team.id);
      if (g.visitor_team?.id) bdlTeamIdMap.set(away, g.visitor_team.id);
      if (g.id) {
        bdlGameIdMap.set(home, g.id);
        bdlGameIdMap.set(away, g.id);
      }

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

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM BASE STATS, DEFENSE BREAKDOWN, SCORING PROFILE (NBA only)
  // Mirrors the game picks pipeline — gives Gary team-level context for DFS
  // ═══════════════════════════════════════════════════════════════════════════
  let teamBaseStatsMap = new Map();   // teamAbbr → { pts, reb, ast, fg_pct, fg3_pct, ft_pct, oreb, dreb, tov, blk, stl }
  let teamDefenseBreakdownMap = new Map(); // teamAbbr → { opp_pts_paint, opp_pts_fb, opp_pts_off_tov, opp_pts_2nd_chance }
  let teamScoringProfileMap = new Map();   // teamAbbr → { pct_pts_paint, pct_pts_3pt, pct_pts_ft, pct_fga_2pt, pct_fga_3pt, pct_ast_fgm }
  let standingsData = null;           // Array of team standings

  if (isNBA && bdlTeamIdMap.size > 0) {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const season = currentMonth >= 10 ? currentYear : currentYear - 1;

      const slateTeamEntries = Array.from(bdlTeamIdMap.entries()).filter(([abbr]) =>
        games.some(g => g.homeTeam === abbr || g.awayTeam === abbr)
      );

      // Fetch all three team stat types + standings in parallel using Promise.allSettled
      const [baseResults, defenseResults, scoringResults, standingsResult] = await Promise.allSettled([
        // Team Base Stats for all slate teams
        Promise.all(slateTeamEntries.map(async ([abbr, teamId]) => {
          const stats = await ballDontLieService.getTeamBaseStats(teamId, season).catch(() => null);
          return { abbr, stats };
        })),
        // Team Defense Breakdown for all slate teams
        Promise.all(slateTeamEntries.map(async ([abbr, teamId]) => {
          const stats = await ballDontLieService.getTeamDefenseStats(teamId, season).catch(() => null);
          return { abbr, stats };
        })),
        // Team Scoring Profile for all slate teams
        Promise.all(slateTeamEntries.map(async ([abbr, teamId]) => {
          const stats = await ballDontLieService.getTeamScoringStats(teamId, season).catch(() => null);
          return { abbr, stats };
        })),
        // Standings (once, not per team)
        ballDontLieService.getNbaStandings(season)
      ]);

      // Process base stats
      if (baseResults.status === 'fulfilled') {
        for (const { abbr, stats } of baseResults.value) {
          if (stats) teamBaseStatsMap.set(abbr, stats);
        }
      } else {
        console.warn('[DFS Context] Team base stats fetch failed:', baseResults.reason?.message);
      }

      // Process defense breakdown
      if (defenseResults.status === 'fulfilled') {
        for (const { abbr, stats } of defenseResults.value) {
          if (stats) teamDefenseBreakdownMap.set(abbr, stats);
        }
      } else {
        console.warn('[DFS Context] Team defense breakdown fetch failed:', defenseResults.reason?.message);
      }

      // Process scoring profile
      if (scoringResults.status === 'fulfilled') {
        for (const { abbr, stats } of scoringResults.value) {
          if (stats) teamScoringProfileMap.set(abbr, stats);
        }
      } else {
        console.warn('[DFS Context] Team scoring profile fetch failed:', scoringResults.reason?.message);
      }

      // Process standings
      if (standingsResult.status === 'fulfilled' && standingsResult.value) {
        standingsData = standingsResult.value;
      } else {
        console.warn('[DFS Context] Standings fetch failed:', standingsResult.reason?.message);
      }

      console.log(`[DFS Context] Team stats: base ${teamBaseStatsMap.size > 0 ? '\u2713' : '\u2717'}, defense ${teamDefenseBreakdownMap.size > 0 ? '\u2713' : '\u2717'}, scoring ${teamScoringProfileMap.size > 0 ? '\u2713' : '\u2717'}, standings ${standingsData ? '\u2713' : '\u2717'}`);
    } catch (e) {
      console.warn(`[DFS Context] BDL team stats fetch failed (${e.message}) — continuing without supplementary team data`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NFL STANDINGS (weekly sport — no B2B, no pace, but standings matter)
  // ═══════════════════════════════════════════════════════════════════════════
  const isNFL = sport.toUpperCase() === 'NFL';
  if (isNFL && !standingsData) {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const nflSeason = currentMonth >= 9 ? currentYear : currentYear - 1;
      standingsData = await ballDontLieService.getNflStandings(nflSeason);
      if (standingsData) {
        console.log(`[DFS Context] NFL standings: ${standingsData.length} teams`);
      }
    } catch (e) {
      console.warn(`[DFS Context] NFL standings fetch failed (${e.message})`);
    }
  }

  // Build game list with O/U, spread, implied totals, blowout risk, and defense enrichment
  const gameList = games.map(g => {
    const key = `${g.awayTeam}@${g.homeTeam}`;
    const odds = bdlGameOddsMap.get(key);
    const total = odds?.total || null;
    const spread = odds?.spread || null; // Home spread (negative = home favored)

    // Implied team totals: Home = (Total - Spread) / 2, Away = (Total + Spread) / 2
    // Spread is home spread (negative = home favored). Subtracting negative increases home total.
    const impliedHomeTotal = (total != null && spread != null) ? parseFloat(((total - spread) / 2).toFixed(1)) : null;
    const impliedAwayTotal = (total != null && spread != null) ? parseFloat(((total + spread) / 2).toFixed(1)) : null;

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
      game_pace: gamePace,
      home_b2b: b2bTeams.has(g.homeTeam),
      away_b2b: b2bTeams.has(g.awayTeam),
      home_defense: teamDefenseProfiles.get(g.homeTeam) || null,
      away_defense: teamDefenseProfiles.get(g.awayTeam) || null,
      // Team base stats (pts, reb, ast, shooting splits, tov, etc.)
      home_base_stats: teamBaseStatsMap.get(g.homeTeam) || null,
      away_base_stats: teamBaseStatsMap.get(g.awayTeam) || null,
      // Team defense breakdown (paint pts allowed, fast break pts, etc.)
      home_defense_breakdown: teamDefenseBreakdownMap.get(g.homeTeam) || null,
      away_defense_breakdown: teamDefenseBreakdownMap.get(g.awayTeam) || null,
      // Team scoring profile (% pts from paint/3pt/FT, shot distribution)
      home_scoring_profile: teamScoringProfileMap.get(g.homeTeam) || null,
      away_scoring_profile: teamScoringProfileMap.get(g.awayTeam) || null
    };
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STAGGERED FETCH: Tank01 API (rate-limited) + BDL stats + Narrative context
  // ═══════════════════════════════════════════════════════════════════════════
  // Tank01 calls are staggered in three waves to avoid rate limits (429 errors).
  // Wave 1: salaries only (1 call)
  // Wave 2: rosters (batched 4 teams at a time with 300ms delay)
  // Wave 3: defense + projections (2 calls parallel)
  // Non-Tank01 calls (BDL) run in parallel alongside all Tank01 waves.
  const [bdlPlayers, tank01Results] = await Promise.all([
    fetchPlayerStatsFromBDL(sport, dateStr, slateTeams),
    // Tank01 calls in staggered waves to avoid rate limits
    (async () => {
      // Wave 1: Salaries first (single call, completes fast)
      const salaryData = await fetchDfsSalaries(sport, dateStr, platform);
      // Wave 2: Rosters (batched 4 teams at a time with 300ms delay between batches)
      const rosterData = isNBA ? await fetchNbaRostersForTeams(slateTeams) : new Map();
      // Wave 3: Defense + Projections (2 calls parallel, after rosters done)
      const [teamDefenseStats, tank01Projections] = isNBA
        ? await Promise.all([
            fetchNbaTeamDefenseStats(),
            fetchNbaProjections(dateStr),
          ])
        : [new Map(), new Map()];
      return { salaryData, rosterData, teamDefenseStats, tank01Projections };
    })()
  ]);
  const { salaryData, rosterData, teamDefenseStats, tank01Projections } = tank01Results;
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
    // Build a roster name lookup: normalizedName → roster player
    const rosterNameMap = new Map();
    for (const [teamAbv, players] of rosterData) {
      for (const rp of players) {
        const normName = normalizePlayerName(rp.longName || '');
        if (normName) {
          rosterNameMap.set(normName, rp);
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

    let enrichedCount = 0;
    for (const player of mergedPlayers) {
      const normName = normalizePlayerName(player.name);
      const rosterPlayer = rosterNameMap.get(normName);

      // Player enrichment (TS%, eFG%, minutes, games played)
      if (rosterPlayer) {
        const enrichment = extractPlayerEnrichment(rosterPlayer);
        if (enrichment) {
          player.tsPercent = enrichment.tsPercent;
          player.efgPercent = enrichment.efgPercent;
          player.avgMinutes = enrichment.avgMinutes;
          player.gamesPlayed = enrichment.gamesPlayed;
          enrichedCount++;
        }
      }

      // Change 6: DvP matchup context + opponent field
      const playerTeam = (player.team || '').toUpperCase();
      const opponent = teamToOpponent.get(playerTeam);
      if (opponent) {
        player.opponent = opponent;
        if (teamDefenseStats.size > 0) {
          const dvp = getPlayerDvP(opponent, player.position, teamDefenseStats);
          if (dvp) {
            player.matchupDvP = dvp;
          }
        }
      }

    }

    console.log(`[DFS Context] Tank01 enriched ${enrichedCount}/${mergedPlayers.length} players (TS%, eFG%, DvP)`);
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

  // ═══════════════════════════════════════════════════════════════════════════
  // ADVANCED + SCORING + PLAYTYPE + TRACKING STATS (NBA only)
  // Fetches 4 high-signal BDL stat categories in parallel:
  // 1. Advanced (off_rating, def_rating, net_rating, pace, pie)
  // 2. Scoring profile (% pts from paint, 3pt, FT, fastbreak)
  // 3. Roll-man playtype (PnR roll man production — high DFS signal)
  // 4. Drives tracking (drive frequency and efficiency)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isNBA) {
    try {
      const playerIds = mergedPlayers.map(p => p.id).filter(Boolean);
      if (playerIds.length > 0) {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const statSeason = currentMonth >= 10 ? currentYear : currentYear - 1;

        // Helper: fetch one category/type for all players in batches of 100
        const fetchStatCategory = async (category, type) => {
          let allStats = [];
          const batchSize = 100;
          for (let i = 0; i < playerIds.length; i += batchSize) {
            const batchIds = playerIds.slice(i, i + batchSize);
            const batch = await ballDontLieService.getNbaSeasonAverages({
              category,
              type,
              season: statSeason,
              player_ids: batchIds
            });
            if (Array.isArray(batch)) allStats.push(...batch);
          }
          // Index by player_id
          const map = new Map();
          for (const entry of allStats) {
            const pid = entry?.player?.id || entry?.player_id;
            if (pid && entry.stats) map.set(pid, entry.stats);
          }
          return map;
        };

        // Fetch all 4 categories in parallel
        const [advancedMap, scoringMap, rollManMap, drivesMap] = await Promise.all([
          fetchStatCategory('general', 'advanced'),
          fetchStatCategory('general', 'scoring'),
          fetchStatCategory('playtype', 'prrollman'),
          fetchStatCategory('tracking', 'drives')
        ]);

        // Attach to players
        let advCount = 0, scorCount = 0, rollCount = 0, driveCount = 0;
        for (const player of mergedPlayers) {
          if (!player.id) continue;

          if (advancedMap.has(player.id)) {
            const a = advancedMap.get(player.id);
            player.advancedStats = {
              off_rating: a.off_rating ?? null,
              def_rating: a.def_rating ?? null,
              net_rating: a.net_rating ?? null,
              pace: a.pace ?? null,
              pie: a.pie ?? null
            };
            advCount++;
          }

          if (scoringMap.has(player.id)) {
            const s = scoringMap.get(player.id);
            player.scoringProfile = {
              pct_pts_paint: s.pct_pts_paint ?? null,
              pct_pts_3pt: s.pct_pts_3pt ?? null,
              pct_pts_ft: s.pct_pts_ft ?? null,
              pct_pts_fb: s.pct_pts_fb ?? null,
              pct_fga_2pt: s.pct_fga_2pt ?? null,
              pct_fga_3pt: s.pct_fga_3pt ?? null
            };
            scorCount++;
          }

          if (rollManMap.has(player.id)) {
            player.rollManStats = rollManMap.get(player.id);
            rollCount++;
          }

          if (drivesMap.has(player.id)) {
            player.driveStats = drivesMap.get(player.id);
            driveCount++;
          }
        }

        console.log(`[DFS Context] ✅ BDL advanced stats: ${advCount}/${mergedPlayers.length} players enriched`);
        console.log(`[DFS Context] ✅ BDL scoring profile: ${scorCount}/${mergedPlayers.length} players enriched`);
        console.log(`[DFS Context] ✅ BDL roll-man playtype: ${rollCount}/${mergedPlayers.length} players enriched`);
        console.log(`[DFS Context] ✅ BDL drives tracking: ${driveCount}/${mergedPlayers.length} players enriched`);
      }
    } catch (e) {
      console.warn(`[DFS Context] BDL advanced/scoring/playtype/tracking fetch failed (${e.message}) — players will have limited stat profiles`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYER PROPS (NBA only — Vegas prop lines for PTS, REB, AST, etc.)
  // Uses BDL game IDs captured during odds fetch to get per-game prop lines.
  // Gives Gary awareness of what Vegas expects from each player.
  // ═══════════════════════════════════════════════════════════════════════════
  if (isNBA && bdlGameIdMap.size > 0) {
    try {
      const uniqueGameIds = [...new Set(bdlGameIdMap.values())];
      const allProps = [];
      for (const gid of uniqueGameIds) {
        const props = await ballDontLieService.getNbaPlayerProps(gid);
        if (Array.isArray(props)) allProps.push(...props);
      }

      // Index by player_id → array of prop objects (deduplicated by prop_type, keep first vendor)
      const propsMap = new Map();
      for (const prop of allProps) {
        const pid = prop.player_id;
        if (!pid) continue;
        if (!propsMap.has(pid)) propsMap.set(pid, new Map());
        const playerProps = propsMap.get(pid);
        // Keep first vendor per prop_type (avoid duplicates across vendors)
        if (!playerProps.has(prop.prop_type)) {
          playerProps.set(prop.prop_type, {
            type: prop.prop_type,
            line: parseFloat(prop.line_value) || 0,
            overOdds: prop.market?.over_odds ?? null,
            underOdds: prop.market?.under_odds ?? null
          });
        }
      }

      // Attach to players by BDL player ID
      let propsCount = 0;
      for (const player of mergedPlayers) {
        if (player.id && propsMap.has(player.id)) {
          player.playerProps = [...propsMap.get(player.id).values()];
          propsCount++;
        }
      }
      console.log(`[DFS Context] ✅ BDL player props: ${propsCount}/${mergedPlayers.length} players with prop lines (${allProps.length} total props from ${uniqueGameIds.length} games)`);
    } catch (e) {
      console.warn(`[DFS Context] BDL player props fetch failed (${e.message}) — players will have no prop lines`);
    }
  }

  // ⚠️ Filter out late scratches
  const finalMergedPlayers = mergedPlayers.filter(p => p.status !== 'OUT' && p.status !== 'INACTIVE');
  console.log(`[DFS Context] Final slate player pool: ${finalMergedPlayers.length}`);
  
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
        injury: getInjuryByName(p.name)?.description || '',
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
      injury: getInjuryByName(p.name)?.description || '',
    });
  }
  if (Object.keys(injuryMap).length > 0) {
    console.log(`[DFS Context] 🏥 Injury map built: ${Object.keys(injuryMap).length} teams with injuries`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOLVE INJURY DURATION (how long has each OUT player been out?)
  // Uses BDL game logs to find each OUT player's last game.
  // This gives Gary FACTUAL duration data so he can investigate whether
  // salaries have adjusted for the absence.
  // ═══════════════════════════════════════════════════════════════════════════
  if (sport?.toUpperCase() === 'NBA') {
    const outPlayersWithIds = excludedPlayers.filter(p => {
      const st = (p.status || '').toUpperCase();
      return p.bdlId && (st.includes('OUT') || st === 'OFS' || st.includes('DOUBTFUL') || st.includes('SUSPENDED'));
    });

    if (outPlayersWithIds.length > 0) {
      console.log(`[DFS Context] Resolving injury duration for ${outPlayersWithIds.length} OUT players...`);
      try {
        // ═══════════════════════════════════════════════════════════════════
        // STEP 1: Fetch player stats to find each OUT player's last game
        // ═══════════════════════════════════════════════════════════════════
        const lookbackDate = new Date(dateStr + 'T12:00:00');
        lookbackDate.setDate(lookbackDate.getDate() - 45);
        const lookbackStr = lookbackDate.toISOString().split('T')[0];
        const outPlayerIds = outPlayersWithIds.map(p => p.bdlId);

        const DURATION_BATCH_SIZE = 15;
        const allOutStats = [];
        for (let i = 0; i < outPlayerIds.length; i += DURATION_BATCH_SIZE) {
          const batchIds = outPlayerIds.slice(i, i + DURATION_BATCH_SIZE);
          const batchStats = await ballDontLieService.getPlayerStats('basketball_nba', {
            player_ids: batchIds,
            start_date: lookbackStr,
            end_date: dateStr,
            per_page: 100
          });
          if (Array.isArray(batchStats)) {
            allOutStats.push(...batchStats);
          }
        }

        // Find each player's last game date (where they had minutes > 0)
        const playerLastGame = new Map();
        for (const stat of allOutStats) {
          const pid = stat.player?.id;
          const gameDate = stat.game?.date;
          const minutes = parseInt(stat.min) || 0;
          if (!pid || !gameDate || minutes === 0) continue;
          const existing = playerLastGame.get(pid);
          if (!existing || new Date(gameDate) > new Date(existing)) {
            playerLastGame.set(pid, gameDate);
          }
        }

        // ═══════════════════════════════════════════════════════════════════
        // STEP 2: Fetch team game schedules to count GAMES MISSED (not days)
        // This matches the game picks box-score method — games missed is more
        // meaningful than calendar days because it measures how much the team
        // has actually played and adapted without the player.
        // ═══════════════════════════════════════════════════════════════════
        const teamsWithOutPlayers = new Set(outPlayersWithIds.map(p => (p.team || '').toUpperCase()));
        const teamGamesMap = new Map(); // team abbr → sorted array of game dates

        for (const teamAbbr of teamsWithOutPlayers) {
          const teamBdlId = bdlTeamIdMap.get(teamAbbr);
          if (!teamBdlId) continue;
          const teamGames = await ballDontLieService.getGames('basketball_nba', {
            team_ids: [teamBdlId],
            start_date: lookbackStr,
            end_date: dateStr,
            per_page: 50
          });
          if (Array.isArray(teamGames)) {
            const gameDates = teamGames
              .map(g => g.date || g.datetime)
              .filter(Boolean)
              .map(d => new Date(d))
              .sort((a, b) => a - b);
            teamGamesMap.set(teamAbbr, gameDates);
          }
        }

        // ═══════════════════════════════════════════════════════════════════
        // STEP 3: Tag each OUT player with games missed + duration label
        // ═══════════════════════════════════════════════════════════════════
        for (const ep of outPlayersWithIds) {
          const lastGame = playerLastGame.get(ep.bdlId);
          const team = (ep.team || '').toUpperCase();
          const teamInjuries = injuryMap[team];
          if (!teamInjuries) continue;

          const injEntry = teamInjuries.find(i =>
            (i.player || '').toLowerCase() === (ep.name || '').toLowerCase()
          );
          if (!injEntry) continue;

          const teamGames = teamGamesMap.get(team) || [];

          if (lastGame) {
            const lastDate = new Date(lastGame);
            // Count team games AFTER this player's last appearance
            const gamesMissed = teamGames.filter(gd => gd > lastDate).length;
            const daysSince = Math.floor((Date.now() - lastDate) / (1000 * 60 * 60 * 24));
            injEntry.gamesMissed = gamesMissed;
            injEntry.daysSince = daysSince;
            injEntry.lastGameDate = lastGame.split('T')[0];
            // Both games missed AND calendar days matter for freshness.
            // During schedule breaks (All-Star, bye weeks), a player can miss
            // few games over many calendar days — the market still adjusts.
            const STALE_DAYS_THRESHOLD = 5; // 5+ calendar days = market has adjusted
            if (gamesMissed <= 2 && daysSince < STALE_DAYS_THRESHOLD) {
              injEntry.duration = 'FRESH';
            } else if (gamesMissed <= 10) {
              injEntry.duration = 'ESTABLISHED';
            } else {
              injEntry.duration = 'LONG-TERM';
            }
          } else {
            // No games in 45 days — long-term absence
            injEntry.gamesMissed = teamGames.length;
            injEntry.duration = 'LONG-TERM';
            injEntry.lastGameDate = null;
          }
        }

        const resolved = outPlayersWithIds.filter(p => {
          const team = (p.team || '').toUpperCase();
          return injuryMap[team]?.find(i => i.player?.toLowerCase() === p.name?.toLowerCase() && i.duration);
        });
        console.log(`[DFS Context] ✓ Resolved duration for ${resolved.length}/${outPlayersWithIds.length} OUT players`);
        for (const ep of outPlayersWithIds) {
          const team = (ep.team || '').toUpperCase();
          const inj = injuryMap[team]?.find(i => i.player?.toLowerCase() === ep.name?.toLowerCase());
          if (inj?.duration) {
            const suspTag = (ep.status || '').toUpperCase().includes('SUSPENDED') ? ' (suspension)' : '';
            console.log(`[DFS Context]   ${ep.name} (${ep.team})${suspTag}: ${inj.duration} — ${inj.gamesMissed} team games missed, ${inj.daysSince ?? '?'}d ago (last played ${inj.lastGameDate || 'none in 45d'})`);
          }
        }

        // HARD FAIL: If any OUT/Doubtful player has unresolved duration, throw with diagnostic
        // Per CLAUDE.md: 'UNKNOWN is never acceptable' -- process should fail so root cause can be fixed
        const unresolved = outPlayersWithIds.filter(p => {
          const team = (p.team || '').toUpperCase();
          const inj = injuryMap[team]?.find(i => i.player?.toLowerCase() === p.name?.toLowerCase());
          return !inj?.duration;
        });
        if (unresolved.length > 0) {
          const diagnostics = unresolved.map(p =>
            `  - ${p.name} (${p.team}) [BDL ID: ${p.bdlId}] -- status: ${p.status}, attempted: BDL game-log query (45d lookback)`
          ).join('\n');
          throw new Error(
            `[DFS Context] HARD FAIL: ${unresolved.length} OUT/Doubtful player(s) have unresolved injury duration.\n` +
            `Diagnostic report:\n${diagnostics}\n` +
            `Root cause: BDL game-log query returned no minutes data for these players.\n` +
            `Fix: Verify player IDs are correct in BDL, or check if player was recently traded/signed.`
          );
        }
      } catch (durationErr) {
        // Re-throw diagnostic errors (our HARD FAIL)
        if (durationErr.message?.includes('HARD FAIL')) {
          throw durationErr;
        }
        // Infrastructure failures (API down, network error) also hard fail
        throw new Error(
          `[DFS Context] HARD FAIL: Injury duration resolution failed -- ${durationErr.message}\n` +
          `Cannot proceed without injury duration data. Fix the underlying issue.`
        );
      }
    }
  }

  const duration = Date.now() - start;
  console.log(`[DFS Context] Context built in ${duration}ms`);

  // Count how many players have estimated vs real salaries (use finalMergedPlayers — the filtered pool)
  const estimatedSalaryCount = finalMergedPlayers.filter(p => p.estimatedSalary).length;
  const realSalaryCount = finalMergedPlayers.length - estimatedSalaryCount;
  const salaryDataQuality = realSalaryCount >= finalMergedPlayers.length * 0.7 ? 'good'
    : realSalaryCount >= finalMergedPlayers.length * 0.4 ? 'partial'
    : 'poor';

  // Log salary data quality
  if (salaryDataQuality === 'poor') {
    console.error(`[DFS Context] SALARY WARNING: Only ${realSalaryCount}/${finalMergedPlayers.length} players have real salaries`);
    console.error(`[DFS Context] Lineup may be inaccurate - ${estimatedSalaryCount} players have estimated salaries`);
  } else if (salaryDataQuality === 'partial') {
    console.warn(`[DFS Context] Partial salary data: ${realSalaryCount}/${finalMergedPlayers.length} real, ${estimatedSalaryCount} estimated`);
  }

  return {
    platform,
    sport,
    date: dateStr,
    slateDate,
    players: finalMergedPlayers,
    gamesCount: games.length,
    games: gameList,
    // Team-level injuries (for GET_TEAM_INJURIES tool)
    injuries: injuryMap,
    // B2B teams (played yesterday — fatigue awareness)
    b2bTeams: Array.from(b2bTeams),
    // NBA standings (conference rank, record, streaks)
    standings: standingsData || null,
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


