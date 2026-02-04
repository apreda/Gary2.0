import 'dotenv/config';

const TANK01_BASE_URL = 'https://tank01-fantasy-stats.p.rapidapi.com';
const TANK01_HOST = 'tank01-fantasy-stats.p.rapidapi.com';

async function checkTank01Raw() {
  const apiKey = process.env.TANK01_RAPIDAPI_KEY;
  console.log('API Key set:', Boolean(apiKey));

  // Try Feb 3rd
  const url = TANK01_BASE_URL + '/getNBADFS?date=20260203';
  console.log('Fetching:', url);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': TANK01_HOST
    }
  });

  console.log('Status:', response.status);
  const data = await response.json();
  console.log('Response keys:', Object.keys(data));
  console.log('Body keys:', Object.keys(data.body || {}));
  console.log('DraftKings players:', data.body?.draftkings?.length || 0);
  console.log('FanDuel players:', data.body?.fanduel?.length || 0);

  // Sample player
  if (data.body?.draftkings?.length > 0) {
    console.log('\nDK Sample player:', JSON.stringify(data.body.draftkings[0], null, 2));
  }
  if (data.body?.fanduel?.length > 0) {
    console.log('\nFD Sample player:', JSON.stringify(data.body.fanduel[0], null, 2));
  }
}

checkTank01Raw().catch(console.error);
