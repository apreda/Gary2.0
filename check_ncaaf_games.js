import dotenv from 'dotenv';
dotenv.config({ path: 'gary2.0/.env' });
import { ballDontLieService } from './gary2.0/src/services/ballDontLieService.js';

async function run() {
  const today = '2025-12-31';
  console.log('Fetching games for:', today);
  try {
    const games = await ballDontLieService.getGames('americanfootball_ncaaf', { dates: [today] });
    console.log('Found', games.length, 'games:');
    games.forEach(g => {
      console.log(`- ${g.away_team} @ ${g.home_team} (${g.commence_time})`);
    });
  } catch (err) {
    console.error('Error:', err.message);
  }
}
run();
