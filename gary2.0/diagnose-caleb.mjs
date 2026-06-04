import { ballDontLieService } from './src/services/ballDontLieService.js';

async function diagnose() {
  console.log('=== SEARCHING ACTIVE NBA PLAYERS FOR CALEB LOVE ===');
  // BDL active players endpoint - search by cursor pagination with search param
  const API_KEY = process.env.BALLDONTLIE_API_KEY;
  
  // Direct API call to search for Caleb Love
  const searchUrl = `https://api.balldontlie.io/nba/v1/players/active?search=caleb+love`;
  const resp = await fetch(searchUrl, { headers: { Authorization: API_KEY } });
  const json = await resp.json();
  console.log('Search result:', JSON.stringify(json, null, 2));

  if (!json.data || json.data.length === 0) {
    console.log('Caleb Love NOT in active players via search!');
    
    // Also check general players
    const genUrl = `https://api.balldontlie.io/nba/v1/players?search=caleb+love`;
    const genResp = await fetch(genUrl, { headers: { Authorization: API_KEY } });
    const genJson = await genResp.json();
    console.log('\nGeneral player search result:', JSON.stringify(genJson, null, 2));
    return;
  }

  const caleb = json.data[0];
  console.log('\nFound:', caleb.first_name, caleb.last_name, '| ID:', caleb.id, '| Team:', caleb.team?.abbreviation);

  // Season averages
  console.log('\n=== SEASON AVERAGES (2025) ===');
  const avgUrl = `https://api.balldontlie.io/nba/v1/season_averages/general?season=2025&player_ids[]=${caleb.id}`;
  const avgResp = await fetch(avgUrl, { headers: { Authorization: API_KEY } });
  const avgJson = await avgResp.json();
  console.log(JSON.stringify(avgJson, null, 2));

  // Game logs last 45 days
  console.log('\n=== GAME LOGS (2026-02-06 to 2026-03-23) ===');
  const statsUrl = `https://api.balldontlie.io/nba/v1/stats?player_ids[]=${caleb.id}&start_date=2026-02-06&end_date=2026-03-23&per_page=100`;
  const statsResp = await fetch(statsUrl, { headers: { Authorization: API_KEY } });
  const statsJson = await statsResp.json();
  console.log('Games in last 45 days:', statsJson.data?.length || 0);
  for (const g of (statsJson.data || [])) {
    console.log(`  ${g.game?.date} | min: ${g.min} | pts: ${g.pts} | reb: ${g.reb}`);
  }

  // All season game logs
  console.log('\n=== ALL SEASON LOGS (2025-10-01 to 2026-03-23) ===');
  const allUrl = `https://api.balldontlie.io/nba/v1/stats?player_ids[]=${caleb.id}&start_date=2025-10-01&end_date=2026-03-23&per_page=100`;
  const allResp = await fetch(allUrl, { headers: { Authorization: API_KEY } });
  const allJson = await allResp.json();
  console.log('Total games this season:', allJson.data?.length || 0);
  for (const g of (allJson.data || [])) {
    console.log(`  ${g.game?.date} | min: ${g.min} | pts: ${g.pts}`);
  }
}

diagnose().catch(e => console.error('ERROR:', e.message, e.stack));
