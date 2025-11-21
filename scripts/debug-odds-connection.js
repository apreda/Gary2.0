// Set env var BEFORE import
process.env.BALLDONTLIE_API_KEY = '970a977f-60b9-4cfc-9c84-9ea3d08fe26c';

import { ballDontLieService } from '../gary2.0/src/services/ballDontLieService.js';

async function test() {
  const today = '2025-11-21';
  console.log(`\nFetching by "Today": ${today} with AUTO-PAGINATION`);
  // We expect it to fetch multiple pages now
  const byToday = await ballDontLieService.getOddsV2({ dates: [today] }, 'nba');
  console.log('Result:', byToday.length > 0 ? `Found ${byToday.length} rows` : 'No rows');
  
  if (byToday.length > 0) {
    const gameIds = new Set(byToday.map(r => r.game_id));
    console.log('Unique Game IDs found:', gameIds.size);
    console.log('Game IDs with odds:', Array.from(gameIds).sort().join(', '));
    
    const problemId = 18447057;
    if (gameIds.has(problemId)) {
      console.log(`✅ Problem Game ID ${problemId} IS present in the odds!`);
    } else {
      console.log(`❌ Problem Game ID ${problemId} is NOT in the returned odds.`);
    }
  }
}

test();

