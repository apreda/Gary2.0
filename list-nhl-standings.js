import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ballDontLieService } from './gary2.0/src/services/ballDontLieService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, 'gary2.0', '.env') });

async function checkStandings() {
  const standings = await ballDontLieService.getStandingsGeneric('basketball_nba', { season: 2025 });
  const sorted = standings.sort((a, b) => a.conference_rank - b.conference_rank);
  
  console.log('--- NBA STANDINGS 2025 ---');
  standings.forEach(s => {
    if (['Pistons', 'Spurs', 'Celtics', 'Jazz'].some(name => s.team.name.includes(name))) {
      console.log(`${s.team.full_name}: Rank ${s.conference_rank} in ${s.conference}, Record: ${s.overall_record}`);
    }
  });
}

checkStandings().catch(console.error);

