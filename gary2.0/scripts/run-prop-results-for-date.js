#!/usr/bin/env node
/**
 * Script to run prop results checking for a specific date
 * Usage: node scripts/run-prop-results-for-date.js [YYYY-MM-DD]
 * Defaults to yesterday if no date provided
 * 
 * Uses BallDontLie API as primary source, Perplexity as fallback
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables FIRST
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const BDL_API_KEY = process.env.BALLDONTLIE_API_KEY || process.env.VITE_BALL_DONT_LIE_API_KEY || process.env.BALL_DONT_LIE_API_KEY;
const PERPLEXITY_API_KEY = process.env.VITE_PERPLEXITY_API_KEY || process.env.PERPLEXITY_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials. Please check your .env file.');
  process.exit(1);
}

console.log(`Using ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE' : 'ANON'} key`);
console.log(`BallDontLie API: ${BDL_API_KEY ? '✅ Available' : '❌ Not configured'}`);
console.log(`Perplexity API: ${PERPLEXITY_API_KEY ? '✅ Available (fallback)' : '❌ Not configured'}`);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Cache for box scores to avoid repeated API calls
const boxScoreCache = {
  NBA: null,
  NFL: null,
  NHL: null,
  NCAAB: null,
  NCAAF: null,
  EPL: null
};
const nflFirstTDScorers = {}; // { gameId: "First TD Scorer Text" }

// Helper to match player name in play text (e.g. "J.Taylor" matches "Jonathan Taylor")
function matchesFirstTD(playerName, playText) {
  if (!playText) return false;
  const lowerText = playText.toLowerCase();
  const lowerName = playerName.toLowerCase();
  
  // Direct match
  if (lowerText.includes(lowerName)) return true;
  
  // Initial.LastName match (e.g. "J.Taylor" for "Jonathan Taylor")
  const parts = playerName.trim().split(/\s+/);
  if (parts.length >= 2) {
    const lastName = parts[parts.length - 1];
    const initialMatch = `${parts[0][0]}.${lastName}`.toLowerCase();
    if (lowerText.includes(initialMatch)) return true;
  }
  
  return false;
}

// Get date from command line or use yesterday
const getTargetDate = () => {
  const args = process.argv.slice(2);
  if (args.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[0])) {
    return args[0];
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper for name matching (handles "First Last" vs "F. Last" etc)
function normalizePlayerName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[.']/g, '')  // Remove periods and apostrophes
    .replace(/\s+/g, ' ')  // Normalize spaces
    .trim();
}

function namesMatch(name1, name2) {
  const n1 = normalizePlayerName(name1);
  const n2 = normalizePlayerName(name2);
  
  // Exact match
  if (n1 === n2) return true;
  
  // Check if last names match and first initial matches
  const parts1 = n1.split(' ');
  const parts2 = n2.split(' ');
  
  if (parts1.length >= 2 && parts2.length >= 2) {
    const lastName1 = parts1[parts1.length - 1];
    const lastName2 = parts2[parts2.length - 1];
    const firstName1 = parts1[0];
    const firstName2 = parts2[0];
    
    // Last names must match
    if (lastName1 === lastName2) {
      // First names match or first initial matches
      if (firstName1 === firstName2) return true;
      if (firstName1[0] === firstName2[0]) return true;
    }
  }
  
  // Check if one name contains the other (for nicknames)
  if (n1.includes(n2) || n2.includes(n1)) return true;
  
  return false;
}

// ============================================================================
// NBA - Using Box Scores Endpoint
// ============================================================================
async function fetchNBABoxScores(dateStr) {
  if (boxScoreCache.NBA) return boxScoreCache.NBA;
  
  if (!BDL_API_KEY) {
    console.log('  ⚠️ BDL API key not configured');
    return null;
  }
  
  try {
    console.log(`  📡 Fetching NBA box scores for ${dateStr}...`);
    const url = `https://api.balldontlie.io/v1/box_scores?date=${dateStr}`;
    const response = await fetch(url, {
      headers: { 'Authorization': BDL_API_KEY }
    });
    
    if (!response.ok) {
      console.log(`  ⚠️ NBA box scores error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.data || data.data.length === 0) {
      console.log(`  ℹ️ No NBA games found for ${dateStr}`);
      return null;
    }
    
    // Extract all player stats from all games
    const allPlayerStats = [];
    for (const game of data.data) {
      // Get players from home team
      if (game.home_team?.players) {
        for (const p of game.home_team.players) {
          allPlayerStats.push({
            player_name: `${p.player.first_name} ${p.player.last_name}`,
            team: game.home_team.full_name,
            pts: p.pts || 0,
            reb: p.reb || 0,
            ast: p.ast || 0,
            stl: p.stl || 0,
            blk: p.blk || 0,
            fg3m: p.fg3m || 0,
            to: p.turnover || 0,
            min: p.min || '0'
          });
        }
      }
      // Get players from visitor team
      if (game.visitor_team?.players) {
        for (const p of game.visitor_team.players) {
          allPlayerStats.push({
            player_name: `${p.player.first_name} ${p.player.last_name}`,
            team: game.visitor_team.full_name,
            pts: p.pts || 0,
            reb: p.reb || 0,
            ast: p.ast || 0,
            stl: p.stl || 0,
            blk: p.blk || 0,
            fg3m: p.fg3m || 0,
            to: p.turnover || 0,
            min: p.min || '0'
          });
        }
      }
    }
    
    console.log(`  ✅ Found ${allPlayerStats.length} player stats from ${data.data.length} NBA games`);
    boxScoreCache.NBA = allPlayerStats;
    return allPlayerStats;
    
  } catch (error) {
    console.log(`  ⚠️ NBA fetch error: ${error.message}`);
    return null;
  }
}

async function getNBAPlayerStats(playerName, dateStr) {
  const boxScores = await fetchNBABoxScores(dateStr);
  
  // If BDL returned null, no games found - don't use Perplexity (games may not have happened)
  if (boxScores === null) {
    console.log(`     ⚠️ No NBA games on ${dateStr} - skipping Perplexity (games may not have happened)`);
    return null;
  }
  
  if (boxScores && boxScores.length > 0) {
    // Find player in box scores
    const playerStats = boxScores.find(p => namesMatch(p.player_name, playerName));
    
    if (playerStats) {
      return {
        player: playerName,
        pts: playerStats.pts,
        reb: playerStats.reb,
        ast: playerStats.ast,
        stl: playerStats.stl,
        blk: playerStats.blk,
        fg3m: playerStats.fg3m,
        to: playerStats.to,
        pra: playerStats.pts + playerStats.reb + playerStats.ast,
        pts_rebs: playerStats.pts + playerStats.reb,
        pts_asts: playerStats.pts + playerStats.ast,
        rebs_asts: playerStats.reb + playerStats.ast,
        source: 'BallDontLie'
      };
    }
    
    // BDL has games but player not found - use Perplexity as fallback
    console.log(`     ⚠️ Player not found in BDL data, trying Perplexity...`);
    return await fetchPlayerStatsViaPerplexity(playerName, dateStr, 'NBA');
  }
  
  return null;
}

// ============================================================================
// NFL - Using Stats Endpoint with Games
// NOTE: MNF games that start at 8:15pm EST may be logged as the next day in UTC
// ============================================================================
async function fetchNFLStats(dateStr) {
  if (boxScoreCache.NFL) return boxScoreCache.NFL;
  
  if (!BDL_API_KEY) {
    console.log('  ⚠️ BDL API key not configured');
    return null;
  }
  
  try {
    // Check both the target date AND the next day (for MNF games that start late)
    const targetDate = new Date(dateStr);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split('T')[0];
    
    console.log(`  📡 Fetching NFL games for ${dateStr} and ${nextDayStr} (for late games)...`);
    
    let allGameIds = [];
    
    // Fetch games for target date
    const gamesUrl1 = `https://api.balldontlie.io/nfl/v1/games?dates[]=${dateStr}`;
    const gamesResponse1 = await fetch(gamesUrl1, {
      headers: { 'Authorization': BDL_API_KEY }
    });
    
    if (gamesResponse1.ok) {
      const gamesData1 = await gamesResponse1.json();
      if (gamesData1.data) {
        allGameIds = allGameIds.concat(gamesData1.data.map(g => g.id));
        console.log(`  ✅ Found ${gamesData1.data.length} NFL games on ${dateStr}`);
      }
    }
    
    // Also fetch games for next day (catches MNF games logged in UTC)
    const gamesUrl2 = `https://api.balldontlie.io/nfl/v1/games?dates[]=${nextDayStr}`;
    const gamesResponse2 = await fetch(gamesUrl2, {
      headers: { 'Authorization': BDL_API_KEY }
    });
    
    if (gamesResponse2.ok) {
      const gamesData2 = await gamesResponse2.json();
      if (gamesData2.data) {
        // Only include games that started on the target date (checking the date in the API response)
        for (const game of gamesData2.data) {
          // MNF games start around 1:15 UTC (8:15pm EST), so they're logged as next day
          // Include them if they're from the day after our target
          if (!allGameIds.includes(game.id)) {
            allGameIds.push(game.id);
            console.log(`  ✅ Found late game on ${nextDayStr}: ${game.visitor_team?.abbreviation} @ ${game.home_team?.abbreviation}`);
          }
        }
      }
    }
    
    if (allGameIds.length === 0) {
      console.log(`  ℹ️ No NFL games found for ${dateStr}`);
      return null;
    }
    
    console.log(`  📊 Total NFL games to process: ${allGameIds.length}`);
    
    // Now fetch stats for these games
    const allPlayerStats = [];
    for (const gameId of allGameIds) {
      // 1. Fetch Stats
      const statsUrl = `https://api.balldontlie.io/nfl/v1/stats?game_ids[]=${gameId}&per_page=100`;
      const statsResponse = await fetch(statsUrl, {
        headers: { 'Authorization': BDL_API_KEY }
      });
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        if (statsData.data) {
          for (const stat of statsData.data) {
            allPlayerStats.push({
              player_name: `${stat.player.first_name} ${stat.player.last_name}`,
              team: stat.team?.full_name || '',
              game_id: gameId,
              pass_yds: stat.passing_yards ?? 0,
              pass_tds: stat.passing_touchdowns ?? 0,
              pass_att: stat.passing_attempts ?? 0,
              pass_comp: stat.passing_completions ?? 0,
              rush_yds: stat.rushing_yards ?? 0,
              rush_tds: stat.rushing_touchdowns ?? 0,
              rush_att: stat.rushing_attempts ?? 0,
              rec_yds: stat.receiving_yards ?? 0,
              rec_tds: stat.receiving_touchdowns ?? 0,
              receptions: stat.receptions ?? 0,
              targets: stat.receiving_targets ?? 0,
              sacks: stat.sacks ?? 0,
              tackles: stat.tackles ?? 0,
              interceptions: stat.interceptions ?? 0
            });
          }
        }
      }

      // 2. Fetch Plays (to find First TD)
      const playsUrl = `https://api.balldontlie.io/nfl/v1/plays?game_id=${gameId}&per_page=100`;
      const playsResponse = await fetch(playsUrl, {
        headers: { 'Authorization': BDL_API_KEY }
      });
      
      if (playsResponse.ok) {
        const playsData = await playsResponse.json();
        if (playsData.data) {
          // Sort by wallclock if available, or just take first in sequence
          const sortedPlays = playsData.data.sort((a, b) => {
            if (a.wallclock && b.wallclock) return new Date(a.wallclock) - new Date(b.wallclock);
            return parseInt(a.id) - parseInt(b.id);
          });

          for (const play of sortedPlays) {
            if (play.scoring_play && (play.type_slug?.includes('touchdown') || play.text?.includes('TOUCHDOWN'))) {
              nflFirstTDScorers[gameId] = play.text;
              console.log(`     🎯 First TD in game ${gameId}: ${play.text.substring(0, 60)}...`);
              break;
            }
          }
        }
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`  ✅ Found ${allPlayerStats.length} NFL player stats`);
    boxScoreCache.NFL = allPlayerStats;
    return allPlayerStats;
    
  } catch (error) {
    console.log(`  ⚠️ NFL fetch error: ${error.message}`);
    return null;
  }
}

async function getNFLPlayerStats(playerName, dateStr) {
  const allStats = await fetchNFLStats(dateStr);
  
  // If BDL returned null, it means no games were found for this date
  // Don't fallback to Perplexity in this case - the games likely haven't happened
  if (allStats === null) {
    console.log(`     ⚠️ No NFL games on ${dateStr} - skipping Perplexity (games may not have happened)`);
    return null;
  }
  
  if (allStats && allStats.length > 0) {
    const playerStats = allStats.find(p => namesMatch(p.player_name, playerName));
    
    if (playerStats) {
      // Calculate total TDs for anytime TD props - explicitly handle null/undefined
      const rushTds = playerStats.rush_tds ?? 0;
      const recTds = playerStats.rec_tds ?? 0;
      const passTds = playerStats.pass_tds ?? 0;
      const totalTds = rushTds + recTds + passTds;
      
      console.log(`     📊 ${playerName} TDs: Rush=${rushTds}, Rec=${recTds}, Pass=${passTds}, Total=${totalTds}, PassAtt=${playerStats.pass_att ?? 0}, Sacks=${playerStats.sacks ?? 0}`);
      
      // Determine if they scored the first TD
      const gameId = playerStats.game_id;
      const firstTDText = nflFirstTDScorers[gameId];
      const isFirstTD = matchesFirstTD(playerName, firstTDText);
      if (isFirstTD) {
        console.log(`     🔥 ${playerName} scored the FIRST TD of the game!`);
      }
      
      return {
        player: playerName,
        pass_yds: playerStats.pass_yds ?? 0,
        pass_tds: passTds,
        pass_att: playerStats.pass_att ?? 0,
        pass_comp: playerStats.pass_comp ?? 0,
        rush_yds: playerStats.rush_yds ?? 0,
        rush_tds: rushTds,
        rush_att: playerStats.rush_att ?? 0,
        rec_yds: playerStats.rec_yds ?? 0,
        rec_tds: recTds,
        receptions: playerStats.receptions ?? 0,
        targets: playerStats.targets ?? 0,
        total_tds: totalTds,
        is_first_td_scored: isFirstTD ? 1 : 0,
        sacks: playerStats.sacks ?? 0,
        tackles: playerStats.tackles ?? 0,
        interceptions: playerStats.interceptions ?? 0,
        source: 'BallDontLie'
      };
    }
    
    // BDL has games but player not found - use Perplexity as fallback
    console.log(`     ⚠️ Player not found in BDL data, trying Perplexity...`);
    return await fetchPlayerStatsViaPerplexity(playerName, dateStr, 'NFL');
  }
  
  return null;
}

// ============================================================================
// NHL - Using Box Scores Endpoint with Pagination
// ============================================================================
async function fetchNHLBoxScores(dateStr) {
  if (boxScoreCache.NHL) return boxScoreCache.NHL;
  
  if (!BDL_API_KEY) {
    console.log('  ⚠️ BDL API key not configured');
    return null;
  }
  
  try {
    console.log(`  📡 Fetching NHL box scores for ${dateStr}...`);
    
    // Fetch all box scores with pagination
    const allPlayerStats = [];
    let cursor = null;
    let page = 0;
    const maxPages = 10; // Safety limit
    
    do {
      page++;
      let url = `https://api.balldontlie.io/nhl/v1/box_scores?dates[]=${dateStr}&per_page=100`;
      if (cursor) url += `&cursor=${cursor}`;
      
      const response = await fetch(url, {
        headers: { 'Authorization': BDL_API_KEY }
      });
      
      if (!response.ok) {
        console.log(`  ⚠️ NHL box scores error: ${response.status}`);
        break;
      }
      
      const data = await response.json();
      
      if (data.data && data.data.length > 0) {
        // Extract player stats from this page
        for (const stat of data.data) {
          allPlayerStats.push({
            player_name: stat.player?.full_name || `${stat.player?.first_name} ${stat.player?.last_name}`,
            team: stat.team?.full_name || '',
            team_tricode: stat.team?.tricode || '',
            goals: stat.goals || 0,
            assists: stat.assists || 0,
            points: stat.points || 0,
            sog: stat.shots_on_goal || 0,
            plus_minus: stat.plus_minus || 0,
            hits: stat.hits || 0,
            blocked_shots: stat.blocked_shots || 0,
            pim: stat.penalty_minutes || 0
          });
        }
        console.log(`  📄 Page ${page}: ${data.data.length} stats`);
      }
      
      cursor = data.meta?.next_cursor;
      
      // Small delay to avoid rate limiting
      if (cursor) await new Promise(resolve => setTimeout(resolve, 100));
      
    } while (cursor && page < maxPages);
    
    if (allPlayerStats.length === 0) {
      console.log(`  ℹ️ No NHL stats found for ${dateStr}`);
      return null;
    }
    
    console.log(`  ✅ Found ${allPlayerStats.length} NHL player stats total`);
    boxScoreCache.NHL = allPlayerStats;
    return allPlayerStats;
    
  } catch (error) {
    console.log(`  ⚠️ NHL fetch error: ${error.message}`);
    return null;
  }
}

async function getNHLPlayerStats(playerName, dateStr) {
  const allStats = await fetchNHLBoxScores(dateStr);
  
  // If BDL returned null, no games found - don't use Perplexity (games may not have happened)
  if (allStats === null) {
    console.log(`     ⚠️ No NHL games on ${dateStr} - skipping Perplexity (games may not have happened)`);
    return null;
  }
  
  if (allStats && allStats.length > 0) {
    const playerStats = allStats.find(p => namesMatch(p.player_name, playerName));
    
    if (playerStats) {
      return {
        player: playerName,
        goals: playerStats.goals,
        assists_nhl: playerStats.assists,
        points: playerStats.points,
        sog: playerStats.sog,
        hits: playerStats.hits,
        blocked_shots: playerStats.blocked_shots,
        source: 'BallDontLie'
      };
    }
    
    // BDL has games but player not found - use Perplexity as fallback
    console.log(`     ⚠️ Player not found in BDL data, trying Perplexity...`);
    return await fetchPlayerStatsViaPerplexity(playerName, dateStr, 'NHL');
  }
  
  return null;
}

// ============================================================================
// NCAAB - Using Player Stats Endpoint
// ============================================================================
async function fetchNCAABStats(dateStr) {
  if (boxScoreCache.NCAAB) return boxScoreCache.NCAAB;
  
  if (!BDL_API_KEY) {
    console.log('  ⚠️ BDL API key not configured');
    return null;
  }
  
  try {
    console.log(`  📡 Fetching NCAAB player stats for ${dateStr}...`);
    const url = `https://api.balldontlie.io/ncaab/v1/player_stats?dates[]=${dateStr}&per_page=100`;
    const response = await fetch(url, {
      headers: { 'Authorization': BDL_API_KEY }
    });
    
    if (!response.ok) {
      console.log(`  ⚠️ NCAAB stats error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.data || data.data.length === 0) {
      console.log(`  ℹ️ No NCAAB stats found for ${dateStr}`);
      return null;
    }
    
    const allPlayerStats = data.data.map(stat => ({
      player_name: `${stat.player?.first_name} ${stat.player?.last_name}`,
      team: stat.team?.full_name || '',
      pts: stat.pts || 0,
      reb: stat.reb || 0,
      ast: stat.ast || 0,
      stl: stat.stl || 0,
      blk: stat.blk || 0,
      fg3m: stat.fg3m || 0,
      to: stat.turnover || 0
    }));
    
    console.log(`  ✅ Found ${allPlayerStats.length} NCAAB player stats`);
    boxScoreCache.NCAAB = allPlayerStats;
    return allPlayerStats;
    
  } catch (error) {
    console.log(`  ⚠️ NCAAB fetch error: ${error.message}`);
    return null;
  }
}

async function getNCAABPlayerStats(playerName, dateStr) {
  const allStats = await fetchNCAABStats(dateStr);
  
  // If BDL returned null, no games found
  if (allStats === null) {
    console.log(`     ⚠️ No NCAAB games on ${dateStr} - skipping Perplexity`);
    return null;
  }
  
  if (allStats && allStats.length > 0) {
    const playerStats = allStats.find(p => namesMatch(p.player_name, playerName));
    
    if (playerStats) {
      return {
        player: playerName,
        pts: playerStats.pts,
        reb: playerStats.reb,
        ast: playerStats.ast,
        stl: playerStats.stl,
        blk: playerStats.blk,
        fg3m: playerStats.fg3m,
        to: playerStats.to,
        pra: playerStats.pts + playerStats.reb + playerStats.ast,
        pts_rebs: playerStats.pts + playerStats.reb,
        pts_asts: playerStats.pts + playerStats.ast,
        rebs_asts: playerStats.reb + playerStats.ast,
        source: 'BallDontLie'
      };
    }
    
    // BDL has games but player not found - use Perplexity as fallback
    console.log(`     ⚠️ Player not found in BDL data, trying Perplexity...`);
    return await fetchPlayerStatsViaPerplexity(playerName, dateStr, 'NCAAB');
  }
  
  return null;
}

// ============================================================================
// NCAAF - Using Player Stats Endpoint
// ============================================================================
async function fetchNCAAFStats(dateStr) {
  if (boxScoreCache.NCAAF) return boxScoreCache.NCAAF;
  
  if (!BDL_API_KEY) {
    console.log('  ⚠️ BDL API key not configured');
    return null;
  }
  
  try {
    console.log(`  📡 Fetching NCAAF player stats for ${dateStr}...`);
    const url = `https://api.balldontlie.io/ncaaf/v1/player_stats?dates[]=${dateStr}&per_page=100`;
    const response = await fetch(url, {
      headers: { 'Authorization': BDL_API_KEY }
    });
    
    if (!response.ok) {
      console.log(`  ⚠️ NCAAF stats error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.data || data.data.length === 0) {
      console.log(`  ℹ️ No NCAAF stats found for ${dateStr}`);
      return null;
    }
    
    const allPlayerStats = data.data.map(stat => ({
      player_name: `${stat.player?.first_name} ${stat.player?.last_name}`,
      team: stat.team?.full_name || '',
      pass_yds: stat.passing_yards || 0,
      pass_tds: stat.passing_touchdowns || 0,
      rush_yds: stat.rushing_yards || 0,
      rush_tds: stat.rushing_touchdowns || 0,
      rec_yds: stat.receiving_yards || 0,
      rec_tds: stat.receiving_touchdowns || 0,
      receptions: stat.receptions || 0
    }));
    
    console.log(`  ✅ Found ${allPlayerStats.length} NCAAF player stats`);
    boxScoreCache.NCAAF = allPlayerStats;
    return allPlayerStats;
    
  } catch (error) {
    console.log(`  ⚠️ NCAAF fetch error: ${error.message}`);
    return null;
  }
}

async function getNCAAFPlayerStats(playerName, dateStr) {
  const allStats = await fetchNCAAFStats(dateStr);
  
  // If BDL returned null, no games found
  if (allStats === null) {
    console.log(`     ⚠️ No NCAAF games on ${dateStr} - skipping Perplexity`);
    return null;
  }
  
  if (allStats && allStats.length > 0) {
    const playerStats = allStats.find(p => namesMatch(p.player_name, playerName));
    
    if (playerStats) {
      return {
        player: playerName,
        pass_yds: playerStats.pass_yds,
        pass_tds: playerStats.pass_tds,
        rush_yds: playerStats.rush_yds,
        rush_tds: playerStats.rush_tds,
        rec_yds: playerStats.rec_yds,
        rec_tds: playerStats.rec_tds,
        receptions: playerStats.receptions,
        source: 'BallDontLie'
      };
    }
    
    // BDL has games but player not found - use Perplexity as fallback
    console.log(`     ⚠️ Player not found in BDL data, trying Perplexity...`);
    return await fetchPlayerStatsViaPerplexity(playerName, dateStr, 'NCAAF');
  }
  
  return null;
}

// ============================================================================
// EPL (Soccer) - Using Games + Game Player Stats Endpoints
// ============================================================================
async function fetchEPLStats(dateStr) {
  if (boxScoreCache.EPL) return boxScoreCache.EPL;
  
  if (!BDL_API_KEY) {
    console.log('  ⚠️ BDL API key not configured');
    return null;
  }
  
  try {
    // Get current season (EPL season starts in August, so if month < 8, use previous year)
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const season = month >= 8 ? year : year - 1;
    
    console.log(`  📡 Fetching EPL games for ${dateStr} (season ${season})...`);
    
    // First, get all games for this season and filter by date
    // EPL API doesn't support date filtering directly, so we fetch by season
    const gamesUrl = `https://api.balldontlie.io/epl/v1/games?season=${season}&per_page=100`;
    const gamesResponse = await fetch(gamesUrl, {
      headers: { 'Authorization': BDL_API_KEY }
    });
    
    if (!gamesResponse.ok) {
      console.log(`  ⚠️ EPL games error: ${gamesResponse.status}`);
      return null;
    }
    
    const gamesData = await gamesResponse.json();
    
    if (!gamesData.data || gamesData.data.length === 0) {
      console.log(`  ℹ️ No EPL games found for season ${season}`);
      return null;
    }
    
    // Filter games that occurred on the target date
    const targetDate = dateStr; // YYYY-MM-DD format
    const matchingGames = gamesData.data.filter(game => {
      if (!game.kickoff) return false;
      const gameDate = game.kickoff.split('T')[0];
      return gameDate === targetDate && game.status === 'C'; // C = Completed
    });
    
    if (matchingGames.length === 0) {
      console.log(`  ℹ️ No completed EPL games on ${dateStr}`);
      return null;
    }
    
    console.log(`  ✅ Found ${matchingGames.length} EPL games on ${dateStr}`);
    
    // Fetch player stats for each game
    const allPlayerStats = [];
    for (const game of matchingGames) {
      try {
        const statsUrl = `https://api.balldontlie.io/epl/v1/games/${game.id}/player_stats`;
        const statsResponse = await fetch(statsUrl, {
          headers: { 'Authorization': BDL_API_KEY }
        });
        
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          
          if (statsData.data?.players) {
            for (const playerData of statsData.data.players) {
              // Convert stats array to object
              const statsObj = {};
              if (playerData.stats) {
                for (const stat of playerData.stats) {
                  statsObj[stat.name] = stat.value;
                }
              }
              
              // We need to look up player name from player_id
              // For now, store player_id and stats
              allPlayerStats.push({
                player_id: playerData.player_id,
                team_id: playerData.team_id,
                goals: statsObj.goals || 0,
                assists: statsObj.goal_assist || 0,
                shots: statsObj.total_scoring_att || 0,
                shots_on_target: statsObj.ontarget_scoring_att || 0,
                saves: statsObj.saves || 0,
                tackles: statsObj.total_tackle || 0,
                fouls: statsObj.fouls || 0,
                yellow_card: statsObj.yellow_card || 0,
                red_card: statsObj.red_card || 0
              });
            }
          }
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        console.log(`  ⚠️ Error fetching stats for game ${game.id}: ${e.message}`);
      }
    }
    
    // Now we need to get player names for the player_ids
    // Fetch players for the season
    const playersUrl = `https://api.balldontlie.io/epl/v1/players?season=${season}&per_page=100`;
    const playersResponse = await fetch(playersUrl, {
      headers: { 'Authorization': BDL_API_KEY }
    });
    
    if (playersResponse.ok) {
      const playersData = await playersResponse.json();
      const playerMap = {};
      
      if (playersData.data) {
        for (const player of playersData.data) {
          playerMap[player.id] = player.name || `${player.first_name} ${player.last_name}`;
        }
      }
      
      // Add player names to stats
      for (const stat of allPlayerStats) {
        stat.player_name = playerMap[stat.player_id] || `Player ${stat.player_id}`;
      }
    }
    
    console.log(`  ✅ Found ${allPlayerStats.length} EPL player stats`);
    boxScoreCache.EPL = allPlayerStats;
    return allPlayerStats;
    
  } catch (error) {
    console.log(`  ⚠️ EPL fetch error: ${error.message}`);
    return null;
  }
}

async function getEPLPlayerStats(playerName, dateStr) {
  const allStats = await fetchEPLStats(dateStr);
  
  // If BDL returned null, no games found
  if (allStats === null) {
    console.log(`     ⚠️ No EPL games on ${dateStr} - skipping Perplexity`);
    return null;
  }
  
  if (allStats && allStats.length > 0) {
    const playerStats = allStats.find(p => namesMatch(p.player_name, playerName));
    
    if (playerStats) {
      return {
        player: playerName,
        goals: playerStats.goals,
        assists: playerStats.assists,
        shots: playerStats.shots,
        shots_on_target: playerStats.shots_on_target,
        saves: playerStats.saves,
        tackles: playerStats.tackles,
        source: 'BallDontLie'
      };
    }
    
    // BDL has games but player not found - use Perplexity as fallback
    console.log(`     ⚠️ Player not found in BDL data, trying Perplexity...`);
    return await fetchPlayerStatsViaPerplexity(playerName, dateStr, 'EPL');
  }
  
  return null;
}

// ============================================================================
// Perplexity Fallback
// ============================================================================
async function fetchPlayerStatsViaPerplexity(playerName, dateStr, sport) {
  if (!PERPLEXITY_API_KEY) {
    console.log('     ⚠️ No Perplexity API key for fallback');
    return null;
  }
  
  const gameDate = new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });
  
  let query;
  if (sport === 'NBA' || sport === 'NCAAB') {
    query = `What were ${playerName}'s exact stats on ${gameDate}? Respond with ONLY: PTS:X REB:Y AST:Z 3PM:W (replace X,Y,Z,W with actual numbers, no extra text)`;
  } else if (sport === 'NFL' || sport === 'NCAAF') {
    query = `What were ${playerName}'s exact stats on ${gameDate}? Respond with ONLY the key stat values in format - PASS_YDS:X RUSH_YDS:Y REC:Z REC_YDS:W RUSH_TDS:A REC_TDS:B (replace with actual numbers, use 0 if stat doesn't apply)`;
  } else if (sport === 'NHL') {
    query = `What were ${playerName}'s exact stats on ${gameDate}? Respond with ONLY: G:X A:Y SOG:Z (goals, assists, shots on goal) replacing with actual numbers`;
  } else if (sport === 'EPL') {
    query = `What were ${playerName}'s exact stats in their EPL match on ${gameDate}? Respond with ONLY: GOALS:X ASSISTS:Y SHOTS:Z SOT:W (goals, assists, shots, shots on target) replacing with actual numbers`;
  } else {
    query = `What were ${playerName}'s exact stats on ${gameDate}? Respond with only the key stat numbers.`;
  }
  
  try {
    console.log('     📡 Querying Perplexity for stats...');
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: query }],
        temperature: 0.1,
        max_tokens: 300
      })
    });
    
    if (!response.ok) {
      console.log(`     ⚠️ Perplexity error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    console.log(`     📄 Perplexity: ${text.slice(0, 100)}`);
    
    // Parse stats from various formats
    const stats = { player: playerName, source: 'Perplexity' };
    let foundStats = false;
    
    // NBA/NCAAB patterns
    const ptsMatch = text.match(/PTS[:\s]*(\d+)/i);
    const rebMatch = text.match(/REB(?:OUNDS?)?[:\s]*(\d+)/i);
    const astMatch = text.match(/AST(?:ISTS?)?[:\s]*(\d+)/i);
    const fg3mMatch = text.match(/3PM[:\s]*(\d+)/i);
    
    if (ptsMatch) { stats.pts = parseInt(ptsMatch[1]); foundStats = true; }
    if (rebMatch) { stats.reb = parseInt(rebMatch[1]); foundStats = true; }
    if (astMatch) { stats.ast = parseInt(astMatch[1]); foundStats = true; }
    if (fg3mMatch) { stats.fg3m = parseInt(fg3mMatch[1]); foundStats = true; }
    
    // NFL/NCAAF patterns
    const passYdsMatch = text.match(/PASS(?:ING)?[_\s]*(?:YDS|YARDS?)[:\s]*(\d+)/i);
    const rushYdsMatch = text.match(/RUSH(?:ING)?[_\s]*(?:YDS|YARDS?)[:\s]*(\d+)/i);
    const recYdsMatch = text.match(/REC(?:EIVING)?[_\s]*(?:YDS|YARDS?)[:\s]*(\d+)/i);
    const recMatch = text.match(/\bREC(?:EPTIONS)?[:\s]*(\d+)/i);
    
    // Also try "X carries, Y yards" format
    const rushAltMatch = text.match(/(\d+)\s*carr(?:ies|y),?\s*(\d+)\s*yards?/i);
    // And "X/Y, Z yards" passing format
    const passAltMatch = text.match(/(\d+)\/(\d+),?\s*(\d+)\s*yards?/i);
    
    if (passYdsMatch) { stats.pass_yds = parseInt(passYdsMatch[1]); foundStats = true; }
    else if (passAltMatch) { stats.pass_yds = parseInt(passAltMatch[3]); foundStats = true; }
    
    if (rushYdsMatch) { stats.rush_yds = parseInt(rushYdsMatch[1]); foundStats = true; }
    else if (rushAltMatch) { stats.rush_yds = parseInt(rushAltMatch[2]); foundStats = true; }
    
    if (recYdsMatch) { stats.rec_yds = parseInt(recYdsMatch[1]); foundStats = true; }
    if (recMatch) { stats.receptions = parseInt(recMatch[1]); foundStats = true; }
    
    // NFL/NCAAF TD patterns
    const rushTdsMatch = text.match(/RUSH(?:ING)?[_\s]*(?:TD|TDS|TOUCHDOWNS?)[:\s]*(\d+)/i);
    const recTdsMatch = text.match(/REC(?:EIVING)?[_\s]*(?:TD|TDS|TOUCHDOWNS?)[:\s]*(\d+)/i);
    const passTdsMatch = text.match(/PASS(?:ING)?[_\s]*(?:TD|TDS|TOUCHDOWNS?)[:\s]*(\d+)/i);
    const tdsMatch = text.match(/\bTD[S]?[:\s]*(\d+)/i);
    
    if (rushTdsMatch) { stats.rush_tds = parseInt(rushTdsMatch[1]); foundStats = true; }
    if (recTdsMatch) { stats.rec_tds = parseInt(recTdsMatch[1]); foundStats = true; }
    if (passTdsMatch) { stats.pass_tds = parseInt(passTdsMatch[1]); foundStats = true; }
    
    // Calculate total_tds for NFL
    if (sport === 'NFL' || sport === 'NCAAF') {
      stats.rush_tds = stats.rush_tds || 0;
      stats.rec_tds = stats.rec_tds || 0;
      stats.pass_tds = stats.pass_tds || 0;
      stats.total_tds = stats.rush_tds + stats.rec_tds + stats.pass_tds;
      // If we only found a generic TD match, use that
      if (tdsMatch && stats.total_tds === 0) {
        stats.total_tds = parseInt(tdsMatch[1]);
        foundStats = true;
      }
    }
    
    // NHL patterns
    const goalsMatch = text.match(/\bG(?:OALS)?[:\s]*(\d+)/i);
    const assistsNhlMatch = text.match(/\bA(?:SSISTS)?[:\s]*(\d+)/i);
    const sogMatch = text.match(/SOG[:\s]*(\d+)/i);

    if (goalsMatch) { stats.goals = parseInt(goalsMatch[1]); foundStats = true; }
    if (assistsNhlMatch) { stats.assists_nhl = parseInt(assistsNhlMatch[1]); foundStats = true; }
    if (sogMatch) { stats.sog = parseInt(sogMatch[1]); foundStats = true; }
    
    // Calculate NHL points (goals + assists)
    if (sport === 'NHL' && (stats.goals !== undefined || stats.assists_nhl !== undefined)) {
      stats.points = (stats.goals || 0) + (stats.assists_nhl || 0);
    }
    
    // EPL (Soccer) patterns
    const eplAssistsMatch = text.match(/ASSISTS?[:\s]*(\d+)/i);
    const sotMatch = text.match(/(?:SOT|SHOTS?\s*ON\s*TARGET)[:\s]*(\d+)/i);
    const shotsMatch = text.match(/SHOTS?[:\s]*(\d+)/i);
    const savesMatch = text.match(/SAVES?[:\s]*(\d+)/i);
    
    if (eplAssistsMatch) { stats.assists = parseInt(eplAssistsMatch[1]); foundStats = true; }
    if (sotMatch) { stats.shots_on_target = parseInt(sotMatch[1]); foundStats = true; }
    if (shotsMatch && !sotMatch) { stats.shots = parseInt(shotsMatch[1]); foundStats = true; }
    if (savesMatch) { stats.saves = parseInt(savesMatch[1]); foundStats = true; }

    // Calculate combo stats for basketball
    if (stats.pts !== undefined) {
      stats.pra = (stats.pts || 0) + (stats.reb || 0) + (stats.ast || 0);
      stats.pts_rebs = (stats.pts || 0) + (stats.reb || 0);
      stats.pts_asts = (stats.pts || 0) + (stats.ast || 0);
      stats.rebs_asts = (stats.reb || 0) + (stats.ast || 0);
    }
    
    if (foundStats) {
      return stats;
    }
    
    console.log('     ⚠️ Could not parse stats from Perplexity response');
    return null;
    
  } catch (error) {
    console.log(`     ⚠️ Perplexity error: ${error.message}`);
    return null;
  }
}

// ============================================================================
// Main Logic
// ============================================================================

// Map prop types to stat fields
const propToStatField = {
  // NBA / NCAAB
  'points': 'pts',
  'pts': 'pts',
  'rebounds': 'reb',
  'rebs': 'reb',
  'reb': 'reb',  // Handle abbreviated "reb" prop type
  'assists': 'ast',
  'asts': 'ast',
  'ast': 'ast',  // Handle abbreviated "ast" prop type
  'threes': 'fg3m',
  '3pm': 'fg3m',
  'threepointers': 'fg3m',
  'steals': 'stl',
  'blocks': 'blk',
  'turnovers': 'to',
  'pra': 'pra',
  'pts_rebs': 'pts_rebs',
  'pts_asts': 'pts_asts',
  'rebs_asts': 'rebs_asts',
  'points_rebounds_assists': 'pra',
  'points_rebounds': 'pts_rebs',
  'points_assists': 'pts_asts',
  'rebounds_assists': 'rebs_asts',
  'pointsreboundsassists': 'pra',
  'pointsrebounds': 'pts_rebs',
  'pointsassists': 'pts_asts',
  'reboundsassists': 'rebs_asts',
  // NFL / NCAAF
  'pass_yds': 'pass_yds',
  'passing_yards': 'pass_yds',
  'passingyards': 'pass_yds',
  'passyards': 'pass_yds',
  'rush_yds': 'rush_yds',
  'rushing_yards': 'rush_yds',
  'rushingyards': 'rush_yds',
  'rushyards': 'rush_yds',
  'rec_yds': 'rec_yds',
  'receiving_yards': 'rec_yds',
  'receivingyards': 'rec_yds',
  'recyards': 'rec_yds',
  'reception_yds': 'rec_yds',
  'receptionyds': 'rec_yds',
  'receptions': 'receptions',
  'rec': 'receptions',
  // NFL Attempts and other stats
  'pass_attempts': 'pass_att',
  'passattempts': 'pass_att',
  'passing_attempts': 'pass_att',
  'passingattempts': 'pass_att',
  'pass_att': 'pass_att',
  'pass_completions': 'pass_comp',
  'passcompletions': 'pass_comp',
  'completions': 'pass_comp',
  'rush_attempts': 'rush_att',
  'rushattempts': 'rush_att',
  'rushing_attempts': 'rush_att',
  'rushingattempts': 'rush_att',
  'rush_att': 'rush_att',
  'carries': 'rush_att',
  'sacks': 'sacks',
  'sack': 'sacks',
  'tackles_nfl': 'tackles',
  'interceptions': 'interceptions',
  'int': 'interceptions',
  'ints': 'interceptions',
  // NFL Anytime TD props
  'anytimetd': 'total_tds',
  'anytime_td': 'total_tds',
  'tds_over': 'total_tds',
  'firsttd': 'is_first_td_scored',
  'first_td': 'is_first_td_scored',
  'td': 'total_tds',
  'touchdown': 'total_tds',
  'touchdowns': 'total_tds',
  // NHL
  'goals': 'goals',
  'assists_nhl': 'assists_nhl',
  'sog': 'sog',
  'shots': 'shots',
  'shots_on_goal': 'sog',
  'shotsgoal': 'sog',
  'shotsongoal': 'sog',
  'points_nhl': 'points',
  // EPL (Soccer)
  'anytime_goal': 'goals',
  'anytimegoal': 'goals',
  'goal': 'goals',
  'assists': 'assists',
  'assist': 'assists',
  'goal_assist': 'assists',
  'goalassist': 'assists',
  'shots_on_target': 'shots_on_target',
  'shotsontarget': 'shots_on_target',
  'sot': 'shots_on_target',
  'saves': 'saves',
  'tackles': 'tackles'
};

// Sport-specific field overrides (since some prop names are ambiguous)
const sportSpecificFields = {
  'NBA': { 'assists': 'ast', 'points': 'pts' },
  'NCAAB': { 'assists': 'ast', 'points': 'pts' },
  'CBB': { 'assists': 'ast', 'points': 'pts' },
  'NHL': { 'points': 'points', 'pts': 'points', 'assists': 'assists_nhl' },
  'NFL': { 'tackles': 'tackles', 'interceptions': 'interceptions', 'firsttd': 'is_first_td_scored', 'first_td': 'is_first_td_scored', 'tds_over': 'total_tds' },
  'NCAAF': { 'tackles': 'tackles', 'interceptions': 'interceptions', 'firsttd': 'is_first_td_scored', 'first_td': 'is_first_td_scored', 'tds_over': 'total_tds' },
  'EPL': { 'points': 'goals', 'tackles': 'tackles' }  // Soccer doesn't really have points prop
};

// Get player stats based on sport
async function getPlayerStats(playerName, dateStr, sport) {
  switch (sport) {
    case 'NBA':
      return await getNBAPlayerStats(playerName, dateStr);
    case 'NFL':
      return await getNFLPlayerStats(playerName, dateStr);
    case 'NHL':
      return await getNHLPlayerStats(playerName, dateStr);
    case 'NCAAB':
    case 'CBB':
      return await getNCAABPlayerStats(playerName, dateStr);
    case 'NCAAF':
    case 'CFB':
      return await getNCAAFPlayerStats(playerName, dateStr);
    case 'EPL':
    case 'SOCCER':
      return await getEPLPlayerStats(playerName, dateStr);
    default:
      // Fallback to Perplexity for unsupported sports
      return await fetchPlayerStatsViaPerplexity(playerName, dateStr, sport);
  }
}

// Grade a prop pick
function gradeProp(pick, actualValue) {
  if (actualValue === null || actualValue === undefined) return null;
  
  const line = parseFloat(pick.line) || 0;
  const bet = (pick.bet || '').toLowerCase();
  
  if (bet === 'over') {
    if (actualValue > line) return 'won';
    if (actualValue < line) return 'lost';
    return 'push';
  } else if (bet === 'under') {
    if (actualValue < line) return 'won';
    if (actualValue > line) return 'lost';
    return 'push';
  }
  
  return null;
}

async function processPropPicks(dateStr) {
  console.log(`\n📋 Processing PROP PICKS for ${dateStr}...`);
  
  // Clear cache for fresh data
  boxScoreCache.NBA = null;
  boxScoreCache.NFL = null;
  boxScoreCache.NHL = null;
  boxScoreCache.NCAAB = null;
  boxScoreCache.NCAAF = null;
  boxScoreCache.EPL = null;
  
  // Get prop picks
  const { data: propPicksRows, error: picksError } = await supabase
    .from('prop_picks')
    .select('*')
    .eq('date', dateStr);
  
  if (picksError || !propPicksRows?.length) {
    console.log(`  ❌ No prop picks found for ${dateStr}`);
    return { processed: 0, won: 0, lost: 0, push: 0, errors: 0 };
  }
  
  // Check existing results
  const { data: existingResults } = await supabase
    .from('prop_results')
    .select('player_name, prop_type')
    .eq('game_date', dateStr);
  
  const existingKeys = new Set((existingResults || []).map(r => `${r.player_name}-${r.prop_type}`));
  
  const results = { processed: 0, won: 0, lost: 0, push: 0, errors: 0, skipped: 0, details: [] };
  const supportedSports = ['NBA', 'NFL', 'NHL', 'NCAAB', 'NCAAF', 'CBB', 'CFB', 'EPL', 'SOCCER'];
  
  for (const row of propPicksRows) {
    const picks = typeof row.picks === 'string' ? JSON.parse(row.picks) : row.picks;
    
    for (const pick of picks) {
      const pickKey = `${pick.player}-${pick.prop}`;
      
      // Skip if already recorded
      if (existingKeys.has(pickKey)) {
        console.log(`  ⏭️ Already recorded: ${pick.player} ${pick.prop}`);
        results.skipped++;
        continue;
      }
      
      // Only process supported sports
      if (!supportedSports.includes(pick.sport)) {
        console.log(`  ⏭️ Skipping ${pick.sport}: ${pick.player} (unsupported sport)`);
        results.skipped++;
        continue;
      }
      
      console.log(`\n  🔍 ${pick.sport}: ${pick.player}`);
      console.log(`     Prop: ${pick.bet?.toUpperCase()} ${pick.prop} (line: ${pick.line})`);
      
      // Fetch player stats
      const stats = await getPlayerStats(pick.player, dateStr, pick.sport);
      
      if (!stats) {
        console.log(`  ❌ Could not find player stats`);
        results.errors++;
        continue;
      }
      
      console.log(`     Source: ${stats.source}`);
      
      // Get the relevant stat value (remove numbers and special chars, keep only letters and underscores)
      const propType = pick.prop?.toLowerCase().replace(/[^a-z_]/g, '') || '';
      
      // Check for sport-specific field overrides first
      const sportOverrides = sportSpecificFields[pick.sport] || {};
      let statField = sportOverrides[propType] || propToStatField[propType];
      
      // If still not found, and propType doesn't exist in mapping, log and skip
      if (!statField || !(statField in stats)) {
        console.log(`  ❌ Unknown prop type: ${propType} (field: ${statField})`);
        console.log(`     Available stats: ${Object.keys(stats).join(', ')}`);
        results.errors++;
        continue;
      }
      
      const actualValue = stats[statField];
      console.log(`     Actual: ${actualValue} (needed: ${pick.bet?.toUpperCase()} ${pick.line})`);
      
      // Grade the pick
      const result = gradeProp(pick, actualValue);
      
      if (!result) {
        console.log(`  ❌ Could not grade pick`);
        results.errors++;
        continue;
      }
      
      const emoji = result === 'won' ? '✅' : result === 'push' ? '🟡' : '❌';
      console.log(`     Result: ${emoji} ${result.toUpperCase()}`);
      
      // Insert result
      const { error: insertError } = await supabase
        .from('prop_results')
        .insert({
          prop_pick_id: row.id,
          game_date: dateStr,
          player_name: pick.player,
          prop_type: pick.prop,
          line_value: pick.line,
          actual_value: actualValue,
          result: result,
          bet: pick.bet,
          odds: pick.odds,
          pick_text: `${pick.player} ${pick.bet?.toUpperCase()} ${pick.prop}`,
          matchup: pick.matchup || `${pick.team || ''} Game`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (insertError) {
        console.log(`  ❌ DB Error: ${insertError.message}`);
        results.errors++;
        continue;
      }
      
      results.processed++;
      results[result]++;
      results.details.push({ player: pick.player, prop: pick.prop, result, actual: actualValue, source: stats.source });
    }
  }
  
  return results;
}

async function main() {
  const dateStr = getTargetDate();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎯 Prop Results Checker (BDL + Perplexity Fallback)`);
  console.log(`📅 Target Date: ${dateStr}`);
  console.log(`${'='.repeat(60)}`);
  
  const propResults = await processPropPicks(dateStr);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 PROP RESULTS SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  
  console.log(`   Processed: ${propResults.processed}`);
  console.log(`   Won: ${propResults.won} | Lost: ${propResults.lost} | Push: ${propResults.push}`);
  console.log(`   Skipped: ${propResults.skipped}`);
  console.log(`   Errors: ${propResults.errors}`);
  
  if (propResults.processed > 0) {
    const totalDecided = propResults.won + propResults.lost;
    const winPct = totalDecided > 0 ? ((propResults.won / totalDecided) * 100).toFixed(1) : '0.0';
    console.log(`\n📈 RECORD: ${propResults.won}-${propResults.lost}${propResults.push > 0 ? `-${propResults.push}` : ''}`);
    console.log(`   Win Rate: ${winPct}%`);
    
    // Show source breakdown
    const bdlCount = propResults.details.filter(d => d.source === 'BallDontLie').length;
    const perplexityCount = propResults.details.filter(d => d.source === 'Perplexity').length;
    console.log(`\n📡 Data Sources:`);
    console.log(`   BallDontLie: ${bdlCount}`);
    console.log(`   Perplexity: ${perplexityCount}`);
  }
  
  console.log(`\n${'='.repeat(60)}`);
  
  return propResults;
}

// Run
main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

