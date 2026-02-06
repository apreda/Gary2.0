#!/usr/bin/env node
/**
 * Script to run prop bet results checking
 * Usage: node scripts/run-prop-results-for-date.js [YYYY-MM-DD]
 * Defaults to yesterday if no date provided
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
// Load environment variables FIRST
import '../src/loadEnv.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const BDL_API_KEY = process.env.BALLDONTLIE_API_KEY || process.env.VITE_BALL_DONT_LIE_API_KEY || process.env.BALL_DONT_LIE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials. Please check your .env file.');
  process.exit(1);
}

if (!BDL_API_KEY) {
  console.error('Missing BallDontLie API key. Please check your .env file.');
  process.exit(1);
}

console.log(`🔑 Using ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE' : 'ANON'} key`);
console.log(`📡 BallDontLie API: ✅`);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

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

// Cache for box scores
const nbaBoxScoresCache = new Map();
const nhlBoxScoresCache = new Map();

/**
 * Fetch NBA box scores for a date (checks adjacent dates for timezone issues)
 */
async function fetchNBABoxScores(dateStr) {
  if (nbaBoxScoresCache.has(dateStr)) {
    return nbaBoxScoresCache.get(dateStr);
  }
  
  // Check target date and next day (games played late evening are often recorded next day)
  const targetDate = new Date(dateStr);
  const nextDate = new Date(targetDate);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().split('T')[0];
  
  const datesToCheck = [dateStr, nextDateStr];
  const allBoxScores = [];
  
  try {
    for (const date of datesToCheck) {
      console.log(`  📡 Fetching NBA box scores for ${date}...`);
      
      // Fetch with pagination
      let cursor = null;
      let page = 0;
      const maxPages = 10;
      
      do {
        page++;
        let url = `https://api.balldontlie.io/nba/v1/box_scores?date=${date}&per_page=100`;
        if (cursor) url += `&cursor=${cursor}`;
        
        const response = await fetch(url, {
          headers: { 'Authorization': BDL_API_KEY }
        });
        
        if (!response.ok) {
          console.log(`  ⚠️ NBA box scores error for ${date}: ${response.status}`);
          break;
        }
        
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
          allBoxScores.push(...data.data);
        }
        
        cursor = data.meta?.next_cursor;
        if (cursor) await new Promise(r => setTimeout(r, 100));
        
      } while (cursor && page < maxPages);
    }
    
    console.log(`  ✅ Found ${allBoxScores.length} total NBA box score entries`);
    nbaBoxScoresCache.set(dateStr, allBoxScores);
    return allBoxScores;
  } catch (error) {
    console.log(`  ⚠️ NBA box scores fetch error: ${error.message}`);
    return allBoxScores;
  }
}

/**
 * Fetch NHL box scores for a date
 */
async function fetchNHLBoxScores(dateStr) {
  if (nhlBoxScoresCache.has(dateStr)) {
    return nhlBoxScoresCache.get(dateStr);
  }
  
  try {
    console.log(`  📡 Fetching NHL box scores for ${dateStr}...`);
    const url = `https://api.balldontlie.io/nhl/v1/box_scores?dates[]=${dateStr}&per_page=100`;
    
    const response = await fetch(url, {
      headers: { 'Authorization': BDL_API_KEY }
    });
    
    if (!response.ok) {
      console.log(`  ⚠️ NHL box scores error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const boxScores = data.data || [];
    console.log(`  ✅ Found ${boxScores.length} NHL box score entries`);
    nhlBoxScoresCache.set(dateStr, boxScores);
    return boxScores;
  } catch (error) {
    console.log(`  ⚠️ NHL box scores fetch error: ${error.message}`);
    return [];
  }
}

/**
 * Normalize player name for matching
 */
function normalizePlayerName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find player stats in NBA box scores
 * Box scores structure: array of games, each with home_team.players and visitor_team.players
 */
function findNBAPlayerStats(boxScores, playerName) {
  const normalizedSearch = normalizePlayerName(playerName);
  const searchParts = normalizedSearch.split(' ');
  
  for (const game of boxScores) {
    // Check both home and visitor team players
    const allPlayers = [
      ...(game.home_team?.players || []),
      ...(game.visitor_team?.players || [])
    ];
    
    for (const playerStats of allPlayers) {
      const player = playerStats.player;
      if (!player) continue;
      
      const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
      const normalizedFull = normalizePlayerName(fullName);
      
      // Exact match
      if (normalizedFull === normalizedSearch) {
        return {
          player: fullName,
          stats: playerStats,
          game: game
        };
      }
      
      // Last name match (if search has 2+ parts)
      if (searchParts.length >= 2) {
        const lastName = normalizePlayerName(player.last_name || '');
        const searchLast = searchParts[searchParts.length - 1];
        if (lastName === searchLast) {
          // Check first name initial or partial match
          const firstName = normalizePlayerName(player.first_name || '');
          const searchFirst = searchParts[0];
          if (firstName.startsWith(searchFirst) || searchFirst.startsWith(firstName)) {
            return {
              player: fullName,
              stats: playerStats,
              game: game
            };
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * Find player stats in NHL box scores
 */
function findNHLPlayerStats(boxScores, playerName) {
  const normalizedSearch = normalizePlayerName(playerName);
  const searchParts = normalizedSearch.split(' ');
  
  for (const entry of boxScores) {
    const player = entry.player;
    if (!player) continue;
    
    const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
    const normalizedFull = normalizePlayerName(fullName);
    
    // Exact match
    if (normalizedFull === normalizedSearch) {
      return {
        player: fullName,
        stats: entry,
        game: entry.game
      };
    }
    
    // Last name match
    if (searchParts.length >= 2) {
      const lastName = normalizePlayerName(player.last_name || '');
      const searchLast = searchParts[searchParts.length - 1];
      if (lastName === searchLast) {
        const firstName = normalizePlayerName(player.first_name || '');
        const searchFirst = searchParts[0];
        if (firstName.startsWith(searchFirst) || searchFirst.startsWith(firstName)) {
          return {
            player: fullName,
            stats: entry,
            game: entry.game
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Get stat value from NBA box score based on prop type
 */
function getNBAStatValue(stats, propType) {
  const propLower = propType.toLowerCase();
  
  if (propLower.includes('point')) {
    return stats.pts ?? stats.points ?? null;
  }
  if (propLower.includes('rebound')) {
    return stats.reb ?? stats.rebounds ?? null;
  }
  if (propLower.includes('assist')) {
    return stats.ast ?? stats.assists ?? null;
  }
  if (propLower.includes('steal')) {
    return stats.stl ?? stats.steals ?? null;
  }
  if (propLower.includes('block')) {
    return stats.blk ?? stats.blocks ?? null;
  }
  if (propLower.includes('turnover')) {
    return stats.turnover ?? stats.turnovers ?? stats.to ?? null;
  }
  if (propLower.includes('three') || propLower.includes('3pt') || propLower.includes('3-pt')) {
    return stats.fg3m ?? stats.three_pointers_made ?? null;
  }
  // PRA (Points + Rebounds + Assists)
  if (propLower.includes('pra') || propLower.includes('pts+reb+ast')) {
    const pts = stats.pts ?? stats.points ?? 0;
    const reb = stats.reb ?? stats.rebounds ?? 0;
    const ast = stats.ast ?? stats.assists ?? 0;
    return pts + reb + ast;
  }
  // PR (Points + Rebounds)
  if (propLower.includes('pts+reb') || propLower === 'pr') {
    const pts = stats.pts ?? stats.points ?? 0;
    const reb = stats.reb ?? stats.rebounds ?? 0;
    return pts + reb;
  }
  // PA (Points + Assists)
  if (propLower.includes('pts+ast') || propLower === 'pa') {
    const pts = stats.pts ?? stats.points ?? 0;
    const ast = stats.ast ?? stats.assists ?? 0;
    return pts + ast;
  }
  // RA (Rebounds + Assists)
  if (propLower.includes('reb+ast') || propLower === 'ra') {
    const reb = stats.reb ?? stats.rebounds ?? 0;
    const ast = stats.ast ?? stats.assists ?? 0;
    return reb + ast;
  }
  
  return null;
}

/**
 * Get stat value from NHL box score based on prop type
 */
function getNHLStatValue(stats, propType) {
  const propLower = propType.toLowerCase();
  
  if (propLower.includes('goal')) {
    return stats.goals ?? null;
  }
  if (propLower.includes('assist')) {
    return stats.assists ?? null;
  }
  if (propLower.includes('point')) {
    // Points in hockey = goals + assists
    const goals = stats.goals ?? 0;
    const assists = stats.assists ?? 0;
    return goals + assists;
  }
  if (propLower.includes('shot') || propLower.includes('sog')) {
    return stats.shots_on_goal ?? stats.shots ?? null;
  }
  if (propLower.includes('save')) {
    return stats.saves ?? null;
  }
  if (propLower.includes('block')) {
    return stats.blocked_shots ?? stats.blocks ?? null;
  }
  
  return null;
}

/**
 * Grade a prop bet
 */
function gradeProp(actualValue, line, bet) {
  if (actualValue === null || actualValue === undefined) {
    return null;
  }
  
  const betLower = bet.toLowerCase();
  
  if (betLower === 'over') {
    if (actualValue > line) return 'won';
    if (actualValue < line) return 'lost';
    return 'push';
  } else if (betLower === 'under') {
    if (actualValue < line) return 'won';
    if (actualValue > line) return 'lost';
    return 'push';
  }
  
  return null;
}

/**
 * Process prop picks for a date
 */
async function processPropPicks(dateStr) {
  console.log(`\n🎯 Processing PROP PICKS for ${dateStr}...`);
  
  // Fetch prop picks from database
  const { data: propRows, error: propsError } = await supabase
    .from('prop_picks')
    .select('*')
    .eq('date', dateStr);
  
  if (propsError || !propRows?.length) {
    console.log(`  ❌ No prop picks found for ${dateStr}`);
    return { processed: 0, won: 0, lost: 0, push: 0, errors: 0, skipped: 0 };
  }
  
  console.log(`  📋 Found ${propRows.length} prop pick batch(es)`);
  
  // Check existing results
  const { data: existingResults } = await supabase
    .from('prop_results')
    .select('player_name, prop_type, line_value')
    .eq('game_date', dateStr);
  
  const existingKeys = new Set((existingResults || []).map(r => 
    `${normalizePlayerName(r.player_name)}-${r.prop_type}-${r.line_value}`
  ));
  
  // Fetch box scores for both sports
  const nbaBoxScores = await fetchNBABoxScores(dateStr);
  const nhlBoxScores = await fetchNHLBoxScores(dateStr);
  
  const results = { processed: 0, won: 0, lost: 0, push: 0, errors: 0, skipped: 0, details: [] };
  
  for (const row of propRows) {
    const picks = typeof row.picks === 'string' ? JSON.parse(row.picks) : row.picks;
    if (!picks || !Array.isArray(picks)) continue;
    
    for (const prop of picks) {
      const playerName = prop.player;
      const propType = prop.prop;
      const line = prop.line;
      const bet = prop.bet;
      const sport = (prop.sport || '').toUpperCase();
      
      if (!playerName || !propType || line === undefined || !bet) {
        results.errors++;
        continue;
      }
      
      // Check if already recorded
      const key = `${normalizePlayerName(playerName)}-${propType}-${line}`;
      if (existingKeys.has(key)) {
        console.log(`  ⏭️ Already recorded: ${playerName} ${propType} ${bet} ${line}`);
        results.skipped++;
        continue;
      }
      
      console.log(`\n  🔍 ${sport}: ${playerName}`);
      console.log(`     Prop: ${bet.toUpperCase()} ${propType} ${line}`);
      
      let playerStats = null;
      let actualValue = null;
      
      if (sport === 'NBA') {
        playerStats = findNBAPlayerStats(nbaBoxScores, playerName);
        if (playerStats) {
          actualValue = getNBAStatValue(playerStats.stats, propType);
        }
      } else if (sport === 'NHL') {
        playerStats = findNHLPlayerStats(nhlBoxScores, playerName);
        if (playerStats) {
          actualValue = getNHLStatValue(playerStats.stats, propType);
        }
      } else {
        console.log(`     ⚠️ Unsupported sport: ${sport}`);
        results.errors++;
        continue;
      }
      
      if (!playerStats) {
        console.log(`     ❌ Player stats not found`);
        results.errors++;
        continue;
      }
      
      if (actualValue === null) {
        console.log(`     ❌ Could not find stat type: ${propType}`);
        results.errors++;
        continue;
      }
      
      console.log(`     Actual: ${actualValue} | Line: ${line}`);
      
      const result = gradeProp(actualValue, line, bet);
      
      if (!result) {
        console.log(`     ❌ Could not grade prop`);
        results.errors++;
        continue;
      }
      
      const emoji = result === 'won' ? '✅' : result === 'push' ? '🟡' : '❌';
      console.log(`     Result: ${emoji} ${result.toUpperCase()}`);
      
      // Build pick text for display
      const pickText = `${playerName} ${bet.toUpperCase()} ${line} ${propType}`;
      
      // Insert result
      const { error: insertError } = await supabase
        .from('prop_results')
        .insert({
          prop_pick_id: row.id,
          game_date: dateStr,
          player_name: playerName,
          prop_type: propType,
          line_value: line,
          actual_value: actualValue,
          result: result,
          odds: prop.odds?.toString() || null,
          pick_text: pickText,
          matchup: prop.matchup || null,
          bet: bet,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (insertError) {
        console.log(`     ⚠️ DB Error: ${insertError.message}`);
        results.errors++;
        continue;
      }
      
      results.processed++;
      results[result]++;
      results.details.push({ 
        player: playerName, 
        prop: propType, 
        line, 
        actual: actualValue, 
        result 
      });
    }
  }
  
  return results;
}

/**
 * Main function
 */
async function main() {
  const dateStr = getTargetDate();
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🎯 GARY'S PROP RESULTS CHECKER`);
  console.log(`📅 Target Date: ${dateStr}`);
  console.log(`${'═'.repeat(60)}`);
  
  const results = await processPropPicks(dateStr);
  
  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 PROP RESULTS SUMMARY`);
  console.log(`${'═'.repeat(60)}`);
  
  console.log(`\n🎯 Prop Bets:`);
  console.log(`   Processed: ${results.processed}`);
  console.log(`   Won: ${results.won} | Lost: ${results.lost} | Push: ${results.push}`);
  console.log(`   Skipped (already recorded): ${results.skipped}`);
  console.log(`   Errors (no stats found): ${results.errors}`);
  
  if (results.processed > 0 && (results.won + results.lost) > 0) {
    const winPct = ((results.won / (results.won + results.lost)) * 100).toFixed(1);
    console.log(`\n📈 RECORD: ${results.won}-${results.lost}${results.push > 0 ? `-${results.push}` : ''}`);
    console.log(`   Win Rate: ${winPct}%`);
  }
  
  console.log(`\n${'═'.repeat(60)}\n`);
  
  return results;
}

// Run
main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
