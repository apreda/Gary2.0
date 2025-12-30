import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const { ballDontLieService } = await import('./src/services/ballDontLieService.js');

async function checkStandings() {
  const standings = await ballDontLieService.getStandingsGeneric('basketball_nba', { season: 2025 });
  
  if (standings && standings.length > 0) {
    console.log('--- FIRST STANDING ENTRY ---');
    console.log(JSON.stringify(standings[0], null, 2));
  }
}

checkStandings().catch(console.error);
