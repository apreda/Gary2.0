import 'dotenv/config';
import { ballDontLieService } from '../src/services/ballDontLieService.js';

const getTodayESTDate = () => {
  const now = new Date();
  const estOptions = { timeZone: 'America/New_York' };
  const estDateString = now.toLocaleDateString('en-US', estOptions);
  const [month, day, year] = estDateString.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

async function run() {
  try {
    const dateStr = getTodayESTDate();
    console.log(`Fetching Ball Don't Lie odds for ${dateStr}...`);
    const rows = await ballDontLieService.getOddsV2({ dates: [dateStr], per_page: 100 }, 'nba');
    const count = Array.isArray(rows) ? rows.length : 0;
    console.log(`✅ Retrieved ${count} odds rows from BDL v2.`);
    if (count > 0) {
      const sample = rows.slice(0, 3);
      sample.forEach((row, idx) => {
        console.log(`--- Odds #${idx + 1} ---`);
        console.log(`Game ID: ${row.game_id}`);
        console.log(`Vendor: ${row.vendor}`);
        console.log(`Moneyline Home: ${row.moneyline_home_odds}, Away: ${row.moneyline_away_odds}`);
        console.log(`Spread Home: ${row.spread_home_value} (${row.spread_home_odds}), Away: ${row.spread_away_value} (${row.spread_away_odds})`);
        console.log(`Total: ${row.total_value} (Over ${row.total_over_odds} / Under ${row.total_under_odds})`);
      });
    } else {
      console.warn('⚠️ No odds returned for today. Try specifying a known game date where odds are published.');
    }
  } catch (error) {
    console.error('❌ Failed to fetch BDL odds:', error);
    process.exit(1);
  }
}

run();

