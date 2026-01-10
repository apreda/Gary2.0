#!/usr/bin/env node
/**
 * Script to run ALL results checking:
 * - Daily picks (NBA, NHL, NCAAB, etc.)
 * - Weekly NFL picks
 * - Prop bets
 * 
 * Usage: node scripts/run-all-results.js [YYYY-MM-DD]
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

console.log(`🔑 Using ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE' : 'ANON'} key`);
console.log(`📡 Perplexity API: ${PERPLEXITY_API_KEY ? '✅' : '❌'}`);
console.log(`📡 Odds API: ${ODDS_API_KEY ? '✅' : '❌'}`);
console.log(`📡 BallDontLie API: ${BDL_API_KEY ? '✅' : '❌'}`);

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
 */
async function fetchScoresFromBDL(league, dateStr, checkAdjacentDays = true) {
  const leagueUpper = league.toUpperCase();
  const cacheKey = `${leagueUpper}-BDL-${dateStr}`;
  
  if (bdlScoresCache.has(cacheKey)) {
    return bdlScoresCache.get(cacheKey);
  }
  
  if (!BDL_API_KEY) {
    return null;
  }
  
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
    return null;
  }
  
  try {
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
        
        if (!response.ok) break;
        
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
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
      return null;
    }
    
    const scores = allGames.map(game => {
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
    
    bdlScoresCache.set(cacheKey, scores);
    return scores;
    
  } catch (error) {
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
    return [];
  }
  
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores?apiKey=${ODDS_API_KEY}&daysFrom=3`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    
    if (Array.isArray(data)) {
      const scores = data
        .filter(game => game.completed)
        .map(game => {
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
      return scores;
    }
    
    return [];
  } catch (error) {
    return [];
  }
}

/**
 * Normalize team name for matching
 */
function normalizeTeamName(name) {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bstate\b/g, 'st')
    .replace(/\buniversity\b/g, '')
    .replace(/\bcollege\b/g, '')
    .replace(/\buniv\b/g, '');
}

/**
 * Extract unique identifiers from team name
 */
function getTeamIdentifiers(name) {
  if (!name) return { words: [], lastWord: '', allWords: [] };
  
  const words = name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  return {
    words: words,
    lastWord: words[words.length - 1] || '',
    allWords: words
  };
}

/**
 * Find matching game from scores array
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
    
    const exactHomeMatch = gameHomeNorm === normalizedHome;
    const exactAwayMatch = gameAwayNorm === normalizedAway;
    
    const mascotHomeMatch = homeIds.lastWord && gameHomeIds.lastWord === homeIds.lastWord;
    const mascotAwayMatch = awayIds.lastWord && gameAwayIds.lastWord === awayIds.lastWord;
    
    const containsHomeMatch = gameHomeNorm.includes(normalizedHome) || normalizedHome.includes(gameHomeNorm);
    const containsAwayMatch = gameAwayNorm.includes(normalizedAway) || normalizedAway.includes(gameAwayNorm);
    
    const homeWordOverlap = homeIds.words.some(w => w.length > 3 && gameHomeIds.words.includes(w));
    const awayWordOverlap = awayIds.words.some(w => w.length > 3 && gameAwayIds.words.includes(w));
    
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
  
  const bestMatch = matches
    .filter(m => m.bothMatch)
    .sort((a, b) => b.totalScore - a.totalScore)[0];
  
  return bestMatch ? bestMatch.game : null;
}

/**
 * Find score for a specific game
 */
async function fetchGameScore(league, homeTeam, awayTeam, dateStr) {
  const leagueUpper = league.toUpperCase();
  
  // Try BallDontLie first
  const bdlScores = await fetchScoresFromBDL(leagueUpper, dateStr, true);
  
  if (bdlScores && bdlScores.length > 0) {
    const matchedGame = findMatchingGame(bdlScores, homeTeam, awayTeam);
    
    if (matchedGame) {
      return {
        homeScore: matchedGame.homeScore,
        awayScore: matchedGame.awayScore,
        final_score: `${matchedGame.awayScore}-${matchedGame.homeScore}`,
        source: 'BallDontLie'
      };
    }
  }
  
  // Fallback to Odds API
  const scores = await fetchScoresFromOddsAPI(league, dateStr);
  
  if (scores && scores.length > 0) {
    const matchedGame = findMatchingGame(scores, homeTeam, awayTeam);
    
    if (matchedGame) {
      return {
        homeScore: matchedGame.homeScore,
        awayScore: matchedGame.awayScore,
        final_score: `${matchedGame.awayScore}-${matchedGame.homeScore}`,
        source: 'OddsAPI'
      };
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
  let spreadMatch = pickText.match(/([+-]\d{1,2}\.5)/);
  
  if (!spreadMatch) {
    spreadMatch = pickText.match(/([+-]\d{1,2})(?!\d)/);
  }
  
  if (!spreadMatch) return null;
  
  const spread = parseFloat(spreadMatch[1]);
  const pickLower = pickText.toLowerCase();
  const homeLower = homeTeam.toLowerCase();
  const awayLower = awayTeam.toLowerCase();
  
  const homeWords = homeLower.split(' ').filter(w => w.length > 2);
  const awayWords = awayLower.split(' ').filter(w => w.length > 2);
  const homeUnique = homeWords[homeWords.length - 1];
  const awayUnique = awayWords[awayWords.length - 1];
  
  const isHomePick = pickLower.includes(homeUnique) && !pickLower.includes(awayUnique);
  const isAwayPick = pickLower.includes(awayUnique) && !pickLower.includes(homeUnique);
  
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
  
  const homeWords = homeLower.split(' ').filter(w => w.length > 2);
  const awayWords = awayLower.split(' ').filter(w => w.length > 2);
  const homeUnique = homeWords[homeWords.length - 1];
  const awayUnique = awayWords[awayWords.length - 1];
  
  const isHomePick = pickLower.includes(homeUnique) && !pickLower.includes(awayUnique);
  const isAwayPick = pickLower.includes(awayUnique) && !pickLower.includes(homeUnique);
  
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
  
  const { data: dailyPicksRows, error: picksError } = await supabase
    .from('daily_picks')
    .select('*')
    .eq('date', dateStr);
  
  if (picksError || !dailyPicksRows?.length) {
    console.log(`  ❌ No daily picks found for ${dateStr}`);
    return { processed: 0, won: 0, lost: 0, push: 0, errors: 0 };
  }
  
  const { data: existingResults } = await supabase
    .from('game_results')
    .select('pick_text')
    .eq('game_date', dateStr);
  
  const existingPickTexts = new Set((existingResults || []).map(r => r.pick_text));
  
  const results = { processed: 0, won: 0, lost: 0, push: 0, errors: 0, details: [] };
  
  for (const row of dailyPicksRows) {
    const picks = typeof row.picks === 'string' ? JSON.parse(row.picks) : row.picks;
    
    for (const pick of picks) {
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
      
      let scoreData = await fetchGameScore(pick.league, pick.homeTeam, pick.awayTeam, dateStr);
      
      if (!scoreData) {
        scoreData = await fetchScoreFromPerplexity(pick.league, pick.homeTeam, pick.awayTeam, dateStr);
      }
      
      if (!scoreData) {
        console.log(`  ❌ Could not find score`);
        results.errors++;
        continue;
      }
      
      const { homeScore, awayScore, final_score, source } = scoreData;
      
      if (typeof homeScore !== 'number' || typeof awayScore !== 'number' || 
          isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
        console.log(`  ❌ Invalid scores: ${awayScore}-${homeScore} (from ${source || 'unknown'})`);
        results.errors++;
        continue;
      }
      
      console.log(`     Score: ${pick.awayTeam} ${awayScore} - ${pick.homeTeam} ${homeScore} (${source})`);
      
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
 */
function getNFLWeekStart(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setHours(12, 0, 0, 0);
  const dayOfWeek = d.getDay();
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
  
  const weekStart = getNFLWeekStart(dateStr);
  console.log(`  NFL Week starting: ${weekStart}`);
  
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
  
  const { data: existingResults } = await supabase
    .from('game_results')
    .select('pick_text')
    .eq('league', 'NFL')
    .gte('game_date', weekStart);
  
  const existingPickTexts = new Set((existingResults || []).map(r => r.pick_text));
  
  const results = { processed: 0, won: 0, lost: 0, push: 0, errors: 0, skipped: 0, details: [] };
  
  for (const pick of picks) {
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
    
    let scoreData = await fetchGameScore('NFL', pick.homeTeam, pick.awayTeam, dateStr);
    
    if (!scoreData) {
      scoreData = await fetchScoreFromPerplexity('NFL', pick.homeTeam, pick.awayTeam, dateStr);
    }
    
    if (!scoreData) {
      console.log(`  ⏳ Game not played yet or score not available`);
      results.skipped++;
      continue;
    }
    
    const { homeScore, awayScore, final_score, source } = scoreData;
    
    if (typeof homeScore !== 'number' || typeof awayScore !== 'number' || 
        isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
      console.log(`  ❌ Invalid scores: ${awayScore}-${homeScore} (from ${source || 'unknown'})`);
      results.errors++;
      continue;
    }
    
    console.log(`     Score: ${pick.awayTeam} ${awayScore} - ${pick.homeTeam} ${homeScore} (${source})`);
    
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
 * Process prop bet results
 */
async function processPropResults(dateStr) {
  console.log(`\n🎯 Processing PROP BETS for ${dateStr}...`);
  
  const { data: propRows, error: propsError } = await supabase
    .from('prop_picks')
    .select('*')
    .eq('date', dateStr);
  
  if (propsError || !propRows?.length) {
    console.log(`  ℹ️ No prop picks found for ${dateStr}`);
    return { processed: 0, won: 0, lost: 0, push: 0, errors: 0 };
  }
  
  const { data: existingResults } = await supabase
    .from('prop_results')
    .select('pick_text')
    .eq('game_date', dateStr);
  
  const existingPickTexts = new Set((existingResults || []).map(r => r.pick_text));
  
  const results = { processed: 0, won: 0, lost: 0, push: 0, errors: 0, skipped: 0, details: [] };
  
  for (const row of propRows) {
    const props = typeof row.props === 'string' ? JSON.parse(row.props) : row.props;
    if (!props || !Array.isArray(props)) continue;
    
    for (const prop of props) {
      if (existingPickTexts.has(prop.pick || prop.description)) {
        results.skipped++;
        continue;
      }
      
      // Props require external stat lookup which is complex
      // For now, just log them
      console.log(`  📊 ${prop.league || 'UNKNOWN'}: ${prop.player_name || prop.pick || 'Unknown prop'}`);
    }
  }
  
  console.log(`  ℹ️ Prop results require manual verification or stat API integration`);
  console.log(`  ℹ️ Found ${propRows.length} prop pick batches`);
  
  return results;
}

/**
 * Main function
 */
async function main() {
  const dateStr = getTargetDate();
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🎯 GARY'S ALL RESULTS CHECKER`);
  console.log(`📅 Target Date: ${dateStr}`);
  console.log(`${'═'.repeat(60)}`);
  
  // Process daily picks
  const dailyResults = await processDailyPicks(dateStr);
  
  // Process NFL picks
  const nflResults = await processWeeklyNFLPicks(dateStr);
  
  // Process prop bets
  const propResults = await processPropResults(dateStr);
  
  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 RESULTS SUMMARY`);
  console.log(`${'═'.repeat(60)}`);
  
  console.log(`\n📋 Daily Picks:`);
  console.log(`   Processed: ${dailyResults.processed}`);
  console.log(`   Won: ${dailyResults.won} | Lost: ${dailyResults.lost} | Push: ${dailyResults.push}`);
  console.log(`   Errors: ${dailyResults.errors}`);
  
  console.log(`\n🏈 NFL Picks:`);
  console.log(`   Processed: ${nflResults.processed}`);
  console.log(`   Won: ${nflResults.won} | Lost: ${nflResults.lost} | Push: ${nflResults.push}`);
  console.log(`   Skipped (not played): ${nflResults.skipped || 0}`);
  console.log(`   Errors: ${nflResults.errors}`);
  
  console.log(`\n🎯 Prop Bets:`);
  console.log(`   Processed: ${propResults.processed}`);
  console.log(`   Won: ${propResults.won} | Lost: ${propResults.lost} | Push: ${propResults.push}`);
  
  const totalProcessed = dailyResults.processed + nflResults.processed + propResults.processed;
  const totalWon = dailyResults.won + nflResults.won + propResults.won;
  const totalLost = dailyResults.lost + nflResults.lost + propResults.lost;
  const totalPush = dailyResults.push + nflResults.push + propResults.push;
  
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📈 TOTAL RECORD: ${totalWon}-${totalLost}${totalPush > 0 ? `-${totalPush}` : ''}`);
  if (totalProcessed > 0 && (totalWon + totalLost) > 0) {
    const winPct = ((totalWon / (totalWon + totalLost)) * 100).toFixed(1);
    console.log(`   Win Rate: ${winPct}%`);
  }
  
  console.log(`${'═'.repeat(60)}\n`);
  
  return { dailyResults, nflResults, propResults };
}

// Run
main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
