#!/usr/bin/env node
/**
 * Script to run results checking for daily_picks and weekly_nfl_picks
 * Usage: node scripts/run-results-for-date.js [YYYY-MM-DD]
 * Defaults to yesterday if no date provided
 */

import { createClient } from '@supabase/supabase-js';
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
const PERPLEXITY_API_KEY = process.env.VITE_PERPLEXITY_API_KEY;
const ODDS_API_KEY = process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials. Please check your .env file.');
  process.exit(1);
}

console.log(`Using ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE' : 'ANON'} key`);
console.log(`Perplexity API: ${PERPLEXITY_API_KEY ? 'Available' : 'Not configured'}`);
console.log(`Odds API: ${ODDS_API_KEY ? 'Available' : 'Not configured'}`);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Get date from command line or use yesterday
const getTargetDate = () => {
  const args = process.argv.slice(2);
  if (args.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[0])) {
    return args[0];
  }
  // Use local date instead of UTC to avoid timezone issues
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Cache for API scores to avoid repeated calls
const scoresCache = new Map();

/**
 * Fetch scores from The Odds API for a given sport and date
 */
async function fetchScoresFromOddsAPI(league, dateStr) {
  const cacheKey = `${league}-${dateStr}`;
  if (scoresCache.has(cacheKey)) {
    return scoresCache.get(cacheKey);
  }
  
  if (!ODDS_API_KEY) {
    console.log('  ⚠️ Odds API key not configured');
    return [];
  }
  
  const sportKeyMap = {
    'NBA': 'basketball_nba',
    'NHL': 'icehockey_nhl',
    'MLB': 'baseball_mlb',
    'NFL': 'americanfootball_nfl',
    'NCAAF': 'americanfootball_ncaaf',
    'NCAAB': 'basketball_ncaab'
  };
  
  const sportKey = sportKeyMap[league.toUpperCase()];
  if (!sportKey) {
    console.log(`  ⚠️ Unknown league: ${league}`);
    return [];
  }
  
  try {
    const apiDate = new Date(dateStr);
    apiDate.setUTCHours(0, 0, 0, 0);
    const commenceDateFrom = apiDate.toISOString();
    
    const endDate = new Date(apiDate);
    endDate.setDate(endDate.getDate() + 1);
    const commenceDateTo = endDate.toISOString();
    
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores?apiKey=${ODDS_API_KEY}&daysFrom=3`;
    console.log(`  📡 Fetching ${league} scores from Odds API...`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.log(`  ⚠️ Odds API error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (Array.isArray(data)) {
      const scores = data
        .filter(game => game.completed)
        .map(game => {
          // The Odds API returns scores array with team names
          let homeScore = 0, awayScore = 0;
          if (game.scores && Array.isArray(game.scores)) {
            for (const score of game.scores) {
              if (score.name === game.home_team) {
                homeScore = parseInt(score.score) || 0;
              } else if (score.name === game.away_team) {
                awayScore = parseInt(score.score) || 0;
              }
            }
          }
          return {
            home_team: game.home_team,
            away_team: game.away_team,
            homeScore,
            awayScore,
            commence_time: game.commence_time
          };
        });
      
      scoresCache.set(cacheKey, scores);
      console.log(`  📊 Found ${scores.length} completed ${league} games`);
      return scores;
    }
    
    return [];
  } catch (error) {
    console.log(`  ⚠️ Odds API error: ${error.message}`);
    return [];
  }
}

/**
 * Normalize team name for matching
 */
function normalizeTeamName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/state$/, 'st')
    .replace(/university$/, '');
}

/**
 * Find score for a specific game
 */
async function fetchGameScore(league, homeTeam, awayTeam, dateStr) {
  const scores = await fetchScoresFromOddsAPI(league, dateStr);
  
  if (!scores || scores.length === 0) {
    return null;
  }
  
  const normalizedHome = normalizeTeamName(homeTeam);
  const normalizedAway = normalizeTeamName(awayTeam);
  
  // Find matching game
  const matchedGame = scores.find(game => {
    const gameHome = normalizeTeamName(game.home_team);
    const gameAway = normalizeTeamName(game.away_team);
    
    // Try various matching strategies
    const homeMatch = gameHome.includes(normalizedHome) || normalizedHome.includes(gameHome) ||
                     homeTeam.toLowerCase().split(' ').some(word => gameHome.includes(word.toLowerCase()));
    const awayMatch = gameAway.includes(normalizedAway) || normalizedAway.includes(gameAway) ||
                     awayTeam.toLowerCase().split(' ').some(word => gameAway.includes(word.toLowerCase()));
    
    return homeMatch && awayMatch;
  });
  
  if (matchedGame) {
    return {
      homeScore: matchedGame.homeScore,
      awayScore: matchedGame.awayScore,
      final_score: `${matchedGame.awayScore}-${matchedGame.homeScore}`,
      source: 'OddsAPI'
    };
  }
  
  return null;
}

/**
 * Fetch final score using Perplexity API as fallback
 */
async function fetchScoreFromPerplexity(league, homeTeam, awayTeam, dateStr) {
  if (!PERPLEXITY_API_KEY) {
    return null;
  }
  
  const formattedDate = new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });
  
  const query = `What was the final score of the ${league} game between ${awayTeam} and ${homeTeam} on ${formattedDate}? Respond with ONLY the format: [AwayTeam] [AwayScore] - [HomeTeam] [HomeScore]`;
  
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [{ role: 'user', content: query }],
        temperature: 0.1
      })
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    
    const scoreMatch = text.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (scoreMatch) {
      const firstScore = parseInt(scoreMatch[1]);
      const secondScore = parseInt(scoreMatch[2]);
      const awayFirst = text.toLowerCase().indexOf(awayTeam.toLowerCase().split(' ')[0]) < 
                       text.toLowerCase().indexOf(homeTeam.toLowerCase().split(' ')[0]);
      
      return {
        awayScore: awayFirst ? firstScore : secondScore,
        homeScore: awayFirst ? secondScore : firstScore,
        final_score: `${awayFirst ? firstScore : secondScore}-${awayFirst ? secondScore : firstScore}`,
        source: 'Perplexity'
      };
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Grade a spread pick
 */
function gradeSpreadPick(pickText, homeTeam, awayTeam, homeScore, awayScore) {
  const spreadMatch = pickText.match(/([+-]?\d+\.?\d*)/);
  if (!spreadMatch) return null;
  
  const spread = parseFloat(spreadMatch[1]);
  const pickLower = pickText.toLowerCase();
  const homeLower = homeTeam.toLowerCase();
  const awayLower = awayTeam.toLowerCase();
  
  // Determine which team was picked
  const isHomePick = pickLower.includes(homeLower.split(' ')[0]) || 
                    pickLower.includes(homeLower.split(' ').pop());
  
  if (isHomePick) {
    const homeWithSpread = homeScore + spread;
    if (homeWithSpread > awayScore) return 'won';
    if (homeWithSpread < awayScore) return 'lost';
    return 'push';
  } else {
    const awayWithSpread = awayScore + spread;
    if (awayWithSpread > homeScore) return 'won';
    if (awayWithSpread < homeScore) return 'lost';
    return 'push';
  }
}

/**
 * Grade a moneyline pick
 */
function gradeMoneylinePick(pickText, homeTeam, awayTeam, homeScore, awayScore) {
  const pickLower = pickText.toLowerCase();
  const homeLower = homeTeam.toLowerCase();
  
  const isHomePick = pickLower.includes(homeLower.split(' ')[0]) || 
                    pickLower.includes(homeLower.split(' ').pop());
  
  const homeWon = homeScore > awayScore;
  
  if (isHomePick) {
    return homeWon ? 'won' : 'lost';
  } else {
    return !homeWon ? 'won' : 'lost';
  }
}

/**
 * Grade a total (over/under) pick
 */
function gradeTotalPick(pickText, homeScore, awayScore) {
  const totalMatch = pickText.match(/(?:over|under)\s+(\d+\.?\d*)/i);
  if (!totalMatch) return null;
  
  const line = parseFloat(totalMatch[1]);
  const actualTotal = homeScore + awayScore;
  const isOver = pickText.toLowerCase().includes('over');
  
  if (isOver) {
    if (actualTotal > line) return 'won';
    if (actualTotal < line) return 'lost';
    return 'push';
  } else {
    if (actualTotal < line) return 'won';
    if (actualTotal > line) return 'lost';
    return 'push';
  }
}

/**
 * Process daily picks for a date
 */
async function processDailyPicks(dateStr) {
  console.log(`\n📋 Processing DAILY PICKS for ${dateStr}...`);
  
  // Get daily picks
  const { data: dailyPicksRows, error: picksError } = await supabase
    .from('daily_picks')
    .select('*')
    .eq('date', dateStr);
  
  if (picksError || !dailyPicksRows?.length) {
    console.log(`  ❌ No daily picks found for ${dateStr}`);
    return { processed: 0, won: 0, lost: 0, push: 0, errors: 0 };
  }
  
  // Check existing results
  const { data: existingResults } = await supabase
    .from('game_results')
    .select('pick_text')
    .eq('game_date', dateStr);
  
  const existingPickTexts = new Set((existingResults || []).map(r => r.pick_text));
  
  const results = { processed: 0, won: 0, lost: 0, push: 0, errors: 0, details: [] };
  
  for (const row of dailyPicksRows) {
    const picks = typeof row.picks === 'string' ? JSON.parse(row.picks) : row.picks;
    
    for (const pick of picks) {
      // Skip if already recorded
      if (existingPickTexts.has(pick.pick)) {
        console.log(`  ⏭️ Already recorded: ${pick.pick.slice(0, 50)}`);
        continue;
      }
      
      if (!pick.homeTeam || !pick.awayTeam) {
        console.log(`  ⚠️ Missing team info: ${pick.pick}`);
        results.errors++;
        continue;
      }
      
      console.log(`\n  🔍 ${pick.league}: ${pick.awayTeam} @ ${pick.homeTeam}`);
      console.log(`     Pick: ${pick.pick}`);
      
      // Fetch score - try Odds API first, then Perplexity as fallback
      let scoreData = await fetchGameScore(pick.league, pick.homeTeam, pick.awayTeam, dateStr);
      
      if (!scoreData) {
        console.log(`     Trying Perplexity fallback...`);
        scoreData = await fetchScoreFromPerplexity(pick.league, pick.homeTeam, pick.awayTeam, dateStr);
      }
      
      if (!scoreData) {
        console.log(`  ❌ Could not find score`);
        results.errors++;
        continue;
      }
      
      const { homeScore, awayScore, final_score } = scoreData;
      console.log(`     Score: ${pick.awayTeam} ${awayScore} - ${pick.homeTeam} ${homeScore}`);
      
      // Grade the pick
      let result;
      const pickLower = pick.pick.toLowerCase();
      
      if (pickLower.includes('ml') || pick.type === 'moneyline') {
        result = gradeMoneylinePick(pick.pick, pick.homeTeam, pick.awayTeam, homeScore, awayScore);
      } else if (pickLower.includes('over') || pickLower.includes('under')) {
        result = gradeTotalPick(pick.pick, homeScore, awayScore);
      } else if (pick.pick.match(/[+-]\d/)) {
        result = gradeSpreadPick(pick.pick, pick.homeTeam, pick.awayTeam, homeScore, awayScore);
      } else {
        result = gradeSpreadPick(pick.pick, pick.homeTeam, pick.awayTeam, homeScore, awayScore);
      }
      
      if (!result) {
        console.log(`  ❌ Could not grade pick`);
        results.errors++;
        continue;
      }
      
      const emoji = result === 'won' ? '✅' : result === 'push' ? '🟡' : '❌';
      console.log(`     Result: ${emoji} ${result.toUpperCase()}`);
      
      // Insert result
      const { error: insertError } = await supabase
        .from('game_results')
        .insert({
          pick_id: row.id,
          game_date: dateStr,
          league: pick.league,
          result: result,
          final_score: final_score,
          pick_text: pick.pick,
          matchup: `${pick.awayTeam} @ ${pick.homeTeam}`,
          confidence: pick.confidence,
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
      results.details.push({ pick: pick.pick, result, score: final_score });
    }
  }
  
  return results;
}

/**
 * Get NFL Week start (Monday) for a given date
 * NFL week runs Monday to Sunday, so we find the previous Monday
 */
function getNFLWeekStart(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  // Sunday (0) -> go back 6 days to Monday
  // Monday (1) -> stay
  // Tuesday (2) -> go back 1 day
  // etc.
  const daysToSubtract = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - daysToSubtract);
  return d.toISOString().split('T')[0];
}

/**
 * Process weekly NFL picks
 */
async function processWeeklyNFLPicks(dateStr) {
  console.log(`\n🏈 Processing WEEKLY NFL PICKS...`);
  
  // Get the NFL week for the target date
  const weekStart = getNFLWeekStart(new Date(dateStr));
  console.log(`  NFL Week starting: ${weekStart}`);
  
  // Get weekly NFL picks
  const { data: nflRow, error: nflError } = await supabase
    .from('weekly_nfl_picks')
    .select('*')
    .eq('week_start', weekStart)
    .single();
  
  if (nflError || !nflRow) {
    console.log(`  ❌ No NFL picks found for week starting ${weekStart}`);
    return { processed: 0, won: 0, lost: 0, push: 0, errors: 0 };
  }
  
  const picks = typeof nflRow.picks === 'string' ? JSON.parse(nflRow.picks) : nflRow.picks;
  console.log(`  Found ${picks.length} NFL picks for Week ${nflRow.week_number}`);
  
  // Check existing results in nfl_results table
  const { data: existingResults } = await supabase
    .from('nfl_results')
    .select('pick_text')
    .gte('game_date', weekStart);
  
  const existingPickTexts = new Set((existingResults || []).map(r => r.pick_text));
  
  const results = { processed: 0, won: 0, lost: 0, push: 0, errors: 0, skipped: 0, details: [] };
  
  for (const pick of picks) {
    // Skip if already recorded
    if (existingPickTexts.has(pick.pick)) {
      console.log(`  ⏭️ Already recorded: ${pick.pick}`);
      results.skipped++;
      continue;
    }
    
    if (!pick.homeTeam || !pick.awayTeam) {
      console.log(`  ⚠️ Missing team info: ${pick.pick}`);
      results.errors++;
      continue;
    }
    
    console.log(`\n  🔍 NFL: ${pick.awayTeam} @ ${pick.homeTeam}`);
    console.log(`     Pick: ${pick.pick}`);
    
    // Fetch score - try Odds API first, then Perplexity as fallback
    let scoreData = await fetchGameScore('NFL', pick.homeTeam, pick.awayTeam, dateStr);
    
    if (!scoreData) {
      console.log(`     Trying Perplexity fallback...`);
      scoreData = await fetchScoreFromPerplexity('NFL', pick.homeTeam, pick.awayTeam, dateStr);
    }
    
    if (!scoreData) {
      // Game might not have been played yet
      console.log(`  ⏳ Game not played yet or score not available`);
      results.skipped++;
      continue;
    }
    
    const { homeScore, awayScore, final_score } = scoreData;
    console.log(`     Score: ${pick.awayTeam} ${awayScore} - ${pick.homeTeam} ${homeScore}`);
    
    // Grade the pick
    let result;
    const pickLower = pick.pick.toLowerCase();
    
    if (pickLower.includes('ml') || pick.type === 'moneyline') {
      result = gradeMoneylinePick(pick.pick, pick.homeTeam, pick.awayTeam, homeScore, awayScore);
    } else if (pickLower.includes('over') || pickLower.includes('under')) {
      result = gradeTotalPick(pick.pick, homeScore, awayScore);
    } else if (pick.pick.match(/[+-]\d/)) {
      result = gradeSpreadPick(pick.pick, pick.homeTeam, pick.awayTeam, homeScore, awayScore);
    } else {
      result = gradeSpreadPick(pick.pick, pick.homeTeam, pick.awayTeam, homeScore, awayScore);
    }
    
    if (!result) {
      console.log(`  ❌ Could not grade pick`);
      results.errors++;
      continue;
    }
    
    const emoji = result === 'won' ? '✅' : result === 'push' ? '🟡' : '❌';
    console.log(`     Result: ${emoji} ${result.toUpperCase()}`);
    
    // Insert result into nfl_results table (separate from game_results)
    // Convert confidence to integer percentage (0.67 -> 67)
    const confidenceInt = pick.confidence ? Math.round(parseFloat(pick.confidence) * 100) : null;
    
    const { error: insertError } = await supabase
      .from('nfl_results')
      .upsert({
        nfl_pick_id: nflRow.id,
        game_date: dateStr,
        week_number: nflRow.week_number,
        season: nflRow.season || 2025,
        result: result,
        final_score: final_score,
        pick_text: pick.pick,
        matchup: `${pick.awayTeam} @ ${pick.homeTeam}`,
        confidence: confidenceInt,
        home_team: pick.homeTeam,
        away_team: pick.awayTeam,
        home_score: scoreData.homeScore,
        away_score: scoreData.awayScore,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'pick_text,game_date'
      });
    
    if (insertError) {
      console.log(`  ⚠️ DB Error: ${insertError.message}`);
      // Still count the result even if we can't save it
      results.processed++;
      results[result]++;
      results.details.push({ pick: pick.pick, result, score: final_score, saved: false });
      continue;
    }
    
    results.processed++;
    results[result]++;
    results.details.push({ pick: pick.pick, result, score: final_score });
  }
  
  return results;
}

/**
 * Main function
 */
async function main() {
  const dateStr = getTargetDate();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎯 Results Checker`);
  console.log(`📅 Target Date: ${dateStr}`);
  console.log(`${'='.repeat(60)}`);
  
  // Process daily picks
  const dailyResults = await processDailyPicks(dateStr);
  
  // Process NFL picks
  const nflResults = await processWeeklyNFLPicks(dateStr);
  
  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 RESULTS SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  
  console.log(`\n📋 Daily Picks:`);
  console.log(`   Processed: ${dailyResults.processed}`);
  console.log(`   Won: ${dailyResults.won} | Lost: ${dailyResults.lost} | Push: ${dailyResults.push}`);
  console.log(`   Errors: ${dailyResults.errors}`);
  
  console.log(`\n🏈 NFL Picks:`);
  console.log(`   Processed: ${nflResults.processed}`);
  console.log(`   Won: ${nflResults.won} | Lost: ${nflResults.lost} | Push: ${nflResults.push}`);
  console.log(`   Skipped (not played): ${nflResults.skipped || 0}`);
  console.log(`   Errors: ${nflResults.errors}`);
  
  const totalProcessed = dailyResults.processed + nflResults.processed;
  const totalWon = dailyResults.won + nflResults.won;
  const totalLost = dailyResults.lost + nflResults.lost;
  const totalPush = dailyResults.push + nflResults.push;
  
  console.log(`\n📈 TOTAL RECORD: ${totalWon}-${totalLost}${totalPush > 0 ? `-${totalPush}` : ''}`);
  if (totalProcessed > 0) {
    const winPct = ((totalWon / (totalWon + totalLost)) * 100).toFixed(1);
    console.log(`   Win Rate: ${winPct}%`);
  }
  
  console.log(`\n${'='.repeat(60)}`);
  
  return { dailyResults, nflResults };
}

// Run
main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
