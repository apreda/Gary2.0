#!/usr/bin/env node
/**
 * Script to run results checking for daily_picks and weekly_nfl_picks
 * Usage: node scripts/run-results-for-date.js [YYYY-MM-DD]
 * Defaults to yesterday if no date provided
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
const PERPLEXITY_API_KEY = process.env.VITE_PERPLEXITY_API_KEY;
const ODDS_API_KEY = process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY;
const BDL_API_KEY = process.env.BALLDONTLIE_API_KEY || process.env.VITE_BALL_DONT_LIE_API_KEY || process.env.BALL_DONT_LIE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials. Please check your .env file.');
  process.exit(1);
}

console.log(`Using ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE' : 'ANON'} key`);
console.log(`Perplexity API: ${PERPLEXITY_API_KEY ? 'Available' : 'Not configured'}`);
console.log(`Odds API: ${ODDS_API_KEY ? 'Available' : 'Not configured'}`);
console.log(`BallDontLie API: ${BDL_API_KEY ? 'Available' : 'Not configured'}`);

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
const bdlScoresCache = new Map();

/**
 * Fetch game scores from BallDontLie API for any sport
 * Uses appropriate BDL endpoint based on league
 */
async function fetchScoresFromBDL(league, dateStr, checkAdjacentDays = true) {
  const leagueUpper = league.toUpperCase();
  const cacheKey = `${leagueUpper}-BDL-${dateStr}`;
  
  if (bdlScoresCache.has(cacheKey)) {
    return bdlScoresCache.get(cacheKey);
  }
  
  if (!BDL_API_KEY) {
    console.log('  ⚠️ BDL API key not configured');
    return null;
  }
  
  // Map league to BDL endpoint
  const endpointMap = {
    'NBA': 'nba/v1/games',
    'NHL': 'nhl/v1/games',
    'NCAAB': 'ncaab/v1/games',
    'NCAAF': 'ncaaf/v1/games',
    'NFL': 'nfl/v1/games',
    'MLB': 'mlb/v1/games'
  };
  
  const endpoint = endpointMap[leagueUpper];
  if (!endpoint) {
    console.log(`  ⚠️ BDL endpoint not configured for ${league}`);
    return null;
  }
  
  try {
    // Check target date and adjacent days (±1) to handle timezone issues
    const datesToCheck = [dateStr];
    if (checkAdjacentDays) {
      const targetDate = new Date(dateStr);
      const prevDate = new Date(targetDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      
      datesToCheck.push(
        prevDate.toISOString().split('T')[0],
        nextDate.toISOString().split('T')[0]
      );
    }
    
    console.log(`  📡 Fetching ${league} scores from BallDontLie for ${datesToCheck.join(', ')}...`);
    
    // Fetch games with pagination for all dates
    const allGames = [];
    for (const date of datesToCheck) {
      let cursor = null;
      let page = 0;
      const maxPages = 10;
      
      do {
        page++;
        let url = `https://api.balldontlie.io/${endpoint}?dates[]=${date}&per_page=100`;
        if (cursor) url += `&cursor=${cursor}`;
        
        const response = await fetch(url, {
          headers: { 'Authorization': BDL_API_KEY }
        });
        
        if (!response.ok) {
          if (response.status !== 404) {
            console.log(`  ⚠️ BDL ${league} games error: ${response.status}`);
          }
          break;
        }
        
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
          // Filter for completed games
          // BDL uses home_team_score/visitor_team_score for NBA, NFL, and some other sports
          // Some sports may use home_score/away_score as fallback
          const completed = data.data.filter(g => {
            const status = (g.status || '').toLowerCase();
            const hasTeamScores = (g.home_team_score !== null && g.home_team_score !== undefined && 
                                  g.visitor_team_score !== null && g.visitor_team_score !== undefined);
            const hasOtherScores = (g.home_score !== null && g.home_score !== undefined && 
                                   g.away_score !== null && g.away_score !== undefined);
            
            return status === 'final' || status === 'post' || status === 'f' || 
                   status.includes('final') || hasTeamScores || hasOtherScores;
          });
          allGames.push(...completed);
        }
        
        cursor = data.meta?.next_cursor;
        if (cursor) await new Promise(r => setTimeout(r, 100));
        
      } while (cursor && page < maxPages);
    }
    
    if (allGames.length === 0) {
      console.log(`  ℹ️ No completed ${league} games found`);
      return null;
    }
    
    // Transform to standard format
    // BDL uses home_team_score/visitor_team_score for NBA, NFL, and some other sports
    // Some sports may use home_score/away_score as fallback
    const scores = allGames.map(game => {
      // Try home_team_score/visitor_team_score first (NBA, NFL standard)
      // Fall back to home_score/away_score if not available
      const homeScore = (game.home_team_score !== undefined && game.home_team_score !== null) 
                       ? game.home_team_score 
                       : ((game.home_score !== undefined && game.home_score !== null) 
                          ? game.home_score : 0);
      const awayScore = (game.visitor_team_score !== undefined && game.visitor_team_score !== null) 
                       ? game.visitor_team_score 
                       : ((game.away_score !== undefined && game.away_score !== null) 
                          ? game.away_score : 0);
      
      return {
        home_team: game.home_team?.full_name || game.home_team?.name || '',
        away_team: game.visitor_team?.full_name || game.visitor_team?.name || '',
        homeScore: homeScore,
        awayScore: awayScore,
        game_id: game.id,
        game_date: game.date
      };
    });
    
    console.log(`  ✅ Found ${scores.length} completed ${league} games from BDL`);
    bdlScoresCache.set(cacheKey, scores);
    return scores;
    
  } catch (error) {
    console.log(`  ⚠️ BDL ${league} fetch error: ${error.message}`);
    return null;
  }
}

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
 * Normalize team name for matching - improved to handle more cases
 */
function normalizeTeamName(name) {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Keep spaces for multi-word matching
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bstate\b/g, 'st')
    .replace(/\buniversity\b/g, '')
    .replace(/\bcollege\b/g, '')
    .replace(/\buniv\b/g, '');
}

/**
 * Extract unique identifiers from team name (last word is usually mascot)
 */
function getTeamIdentifiers(name) {
  if (!name) return { words: [], lastWord: '', allWords: [] };
  
  const words = name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  return {
    words: words,
    lastWord: words[words.length - 1] || '', // Mascot (e.g., "Lakers", "Clippers")
    allWords: words
  };
}

/**
 * Find matching game from scores array with improved matching logic
 */
function findMatchingGame(scores, homeTeam, awayTeam, logMatch = false) {
  const homeIds = getTeamIdentifiers(homeTeam);
  const awayIds = getTeamIdentifiers(awayTeam);
  const normalizedHome = normalizeTeamName(homeTeam);
  const normalizedAway = normalizeTeamName(awayTeam);
  
  const matches = scores.map(game => {
    const gameHomeIds = getTeamIdentifiers(game.home_team);
    const gameAwayIds = getTeamIdentifiers(game.away_team);
    const gameHomeNorm = normalizeTeamName(game.home_team);
    const gameAwayNorm = normalizeTeamName(game.away_team);
    
    // Strategy 1: Exact normalized match (best)
    const exactHomeMatch = gameHomeNorm === normalizedHome;
    const exactAwayMatch = gameAwayNorm === normalizedAway;
    
    // Strategy 2: Mascot match (reliable for teams with same city)
    const mascotHomeMatch = homeIds.lastWord && gameHomeIds.lastWord === homeIds.lastWord;
    const mascotAwayMatch = awayIds.lastWord && gameAwayIds.lastWord === awayIds.lastWord;
    
    // Strategy 3: Contains match (fallback)
    const containsHomeMatch = gameHomeNorm.includes(normalizedHome) || normalizedHome.includes(gameHomeNorm);
    const containsAwayMatch = gameAwayNorm.includes(normalizedAway) || normalizedAway.includes(gameAwayNorm);
    
    // Strategy 4: Word overlap (for partial matches)
    const homeWordOverlap = homeIds.words.some(w => w.length > 3 && gameHomeIds.words.includes(w));
    const awayWordOverlap = awayIds.words.some(w => w.length > 3 && gameAwayIds.words.includes(w));
    
    // Calculate match score
    let homeScore = 0;
    let awayScore = 0;
    
    if (exactHomeMatch) homeScore += 10;
    else if (mascotHomeMatch) homeScore += 8;
    else if (containsHomeMatch) homeScore += 5;
    else if (homeWordOverlap) homeScore += 3;
    
    if (exactAwayMatch) awayScore += 10;
    else if (mascotAwayMatch) awayScore += 8;
    else if (containsAwayMatch) awayScore += 5;
    else if (awayWordOverlap) awayScore += 3;
    
    return {
      game,
      homeScore,
      awayScore,
      totalScore: homeScore + awayScore,
      homeMatch: homeScore > 0,
      awayMatch: awayScore > 0,
      bothMatch: homeScore > 0 && awayScore > 0
    };
  });
  
  // Find best match (both teams must match, prefer higher scores)
  const bestMatch = matches
    .filter(m => m.bothMatch)
    .sort((a, b) => b.totalScore - a.totalScore)[0];
  
  if (bestMatch && logMatch) {
    console.log(`     🎯 Matched: "${bestMatch.game.away_team}" @ "${bestMatch.game.home_team}"`);
    console.log(`        (Looking for: "${awayTeam}" @ "${homeTeam}")`);
    console.log(`        Match score: ${bestMatch.totalScore} (Home: ${bestMatch.homeScore}, Away: ${bestMatch.awayScore})`);
  }
  
  return bestMatch ? bestMatch.game : null;
}

/**
 * Find score for a specific game
 * Priority: BDL (most reliable) -> Odds API -> Perplexity (last resort)
 */
async function fetchGameScore(league, homeTeam, awayTeam, dateStr) {
  const leagueUpper = league.toUpperCase();
  
  // Step 1: Try BallDontLie first (most reliable source)
  const bdlScores = await fetchScoresFromBDL(leagueUpper, dateStr, true);
  
  if (bdlScores && bdlScores.length > 0) {
    const matchedGame = findMatchingGame(bdlScores, homeTeam, awayTeam, true);
    
    if (matchedGame) {
      console.log(`     ✅ Score from BDL: ${matchedGame.awayScore}-${matchedGame.homeScore}`);
      return {
        homeScore: matchedGame.homeScore,
        awayScore: matchedGame.awayScore,
        final_score: `${matchedGame.awayScore}-${matchedGame.homeScore}`,
        source: 'BallDontLie'
      };
    } else {
      console.log(`     ⚠️ BDL found ${bdlScores.length} games but none matched "${awayTeam}" @ "${homeTeam}"`);
    }
  }
  
  // Step 2: Fallback to Odds API
  const scores = await fetchScoresFromOddsAPI(league, dateStr);
  
  if (scores && scores.length > 0) {
    const matchedGame = findMatchingGame(scores, homeTeam, awayTeam, true);
    
    if (matchedGame) {
      console.log(`     ✅ Score from Odds API: ${matchedGame.awayScore}-${matchedGame.homeScore}`);
      return {
        homeScore: matchedGame.homeScore,
        awayScore: matchedGame.awayScore,
        final_score: `${matchedGame.awayScore}-${matchedGame.homeScore}`,
        source: 'OddsAPI'
      };
    } else {
      console.log(`     ⚠️ Odds API found ${scores.length} games but none matched "${awayTeam}" @ "${homeTeam}"`);
    }
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
        temperature: 1.0
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
  // Match spread pattern: +/- followed by number, with optional .5
  // Must have a sign to distinguish from team numbers (49ers, 76ers) and odds (-102, -110)
  // Spread format: "+2.5", "-3", "+7.5", "-6.5"
  // Odds format: "-102", "-110", "+150" (typically 3 digits)
  // We want spreads which are typically 1-2 digits before optional .5
  
  // First try to match spread with .5 (most specific)
  let spreadMatch = pickText.match(/([+-]\d{1,2}\.5)/);
  
  // If no .5 spread, look for whole number spread (1-2 digits with sign, not 3 digits which are odds)
  if (!spreadMatch) {
    // Match +/- followed by 1-2 digits, not followed by more digits (to exclude odds like -102)
    spreadMatch = pickText.match(/([+-]\d{1,2})(?!\d)/);
  }
  
  if (!spreadMatch) return null;
  
  const spread = parseFloat(spreadMatch[1]);
  const pickLower = pickText.toLowerCase();
  const homeLower = homeTeam.toLowerCase();
  const awayLower = awayTeam.toLowerCase();
  
  // Determine which team was picked - use LAST word (mascot/unique identifier) to avoid conflicts
  // e.g., "Los Angeles Lakers" vs "Los Angeles Clippers" - check for "lakers" vs "clippers"
  const homeWords = homeLower.split(' ').filter(w => w.length > 2); // Filter out short words like "la", "ny"
  const awayWords = awayLower.split(' ').filter(w => w.length > 2);
  const homeUnique = homeWords[homeWords.length - 1]; // Last word is usually the mascot
  const awayUnique = awayWords[awayWords.length - 1];
  
  // Check for unique identifier first (most reliable)
  const isHomePick = pickLower.includes(homeUnique) && !pickLower.includes(awayUnique);
  const isAwayPick = pickLower.includes(awayUnique) && !pickLower.includes(homeUnique);
  
  // Fallback: if both match or neither match, check full team name
  const finalIsHomePick = isHomePick || (!isAwayPick && pickLower.includes(homeLower));
  
  if (finalIsHomePick) {
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
  const awayLower = awayTeam.toLowerCase();
  
  // Use LAST word (mascot/unique identifier) to avoid conflicts
  const homeWords = homeLower.split(' ').filter(w => w.length > 2);
  const awayWords = awayLower.split(' ').filter(w => w.length > 2);
  const homeUnique = homeWords[homeWords.length - 1];
  const awayUnique = awayWords[awayWords.length - 1];
  
  // Check for unique identifier first
  const isHomePick = pickLower.includes(homeUnique) && !pickLower.includes(awayUnique);
  const isAwayPick = pickLower.includes(awayUnique) && !pickLower.includes(homeUnique);
  
  // Fallback: if both match or neither match, check full team name
  const finalIsHomePick = isHomePick || (!isAwayPick && pickLower.includes(homeLower));
  
  const homeWon = homeScore > awayScore;
  
  if (finalIsHomePick) {
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
      
      const { homeScore, awayScore, final_score, source } = scoreData;
      
      // Validate scores are valid numbers
      if (typeof homeScore !== 'number' || typeof awayScore !== 'number' || 
          isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
        console.log(`  ❌ Invalid scores: ${awayScore}-${homeScore} (from ${source || 'unknown'})`);
        results.errors++;
        continue;
      }
      
      console.log(`     Score: ${pick.awayTeam} ${awayScore} - ${pick.homeTeam} ${homeScore} (${source || 'unknown'})`);
      
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
function getNFLWeekStart(dateStr) {
  // Use a regex to parse the date to avoid timezone shifts
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setHours(12, 0, 0, 0); // Noon to avoid rollover issues
  const dayOfWeek = d.getDay();
  // Sunday (0) -> go back 6 days to Monday
  // Monday (1) -> stay
  // Tuesday (2) -> go back 1 day
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - daysToSubtract);
  
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

/**
 * Process weekly NFL picks
 */
async function processWeeklyNFLPicks(dateStr) {
  console.log(`\n🏈 Processing WEEKLY NFL PICKS...`);
  
  // Get the NFL week for the target date
  const weekStart = getNFLWeekStart(dateStr);
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
  if (!picks || !Array.isArray(picks) || picks.length === 0) {
    console.log(`  ❌ No valid NFL picks found for week starting ${weekStart}`);
    return { processed: 0, won: 0, lost: 0, push: 0, errors: 0 };
  }
  
  console.log(`  Found ${picks.length} NFL picks for Week ${nflRow.week_number}`);
  
  // Check existing results in game_results table (unified table)
  const { data: existingResults } = await supabase
    .from('game_results')
    .select('pick_text')
    .eq('league', 'NFL')
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
    
    const { homeScore, awayScore, final_score, source } = scoreData;
    
    // Validate scores are valid numbers
    if (typeof homeScore !== 'number' || typeof awayScore !== 'number' || 
        isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
      console.log(`  ❌ Invalid scores: ${awayScore}-${homeScore} (from ${source || 'unknown'})`);
      results.errors++;
      continue;
    }
    
    console.log(`     Score: ${pick.awayTeam} ${awayScore} - ${pick.homeTeam} ${homeScore} (${source || 'unknown'})`);
    
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
    
    // Insert result into game_results table (unified with daily picks)
    const { error: insertError } = await supabase
      .from('game_results')
      .insert({
        pick_id: nflRow.id,
        game_date: dateStr,
        league: 'NFL',
        result: result,
        final_score: final_score,
        pick_text: pick.pick,
        matchup: `${pick.awayTeam} @ ${pick.homeTeam}`,
        confidence: pick.confidence,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
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
