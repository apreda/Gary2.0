import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const apiKey = process.env.API_SPORTS_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing API_SPORTS_KEY on server' });

    // Required query: endpoint, sport (MLB|NBA|NHL)
    const { endpoint, sport = 'MLB', ...rest } = req.query;
    if (!endpoint) return res.status(400).json({ error: 'Missing required parameter: endpoint' });

    const base = sport === 'MLB'
      ? 'https://v1.baseball.api-sports.io'
      : sport === 'NBA'
      ? 'https://v1.basketball.api-sports.io'
      : sport === 'NHL'
      ? 'https://v1.hockey.api-sports.io'
      : 'https://v1.baseball.api-sports.io';
    const host = sport === 'MLB'
      ? 'v1.baseball.api-sports.io'
      : sport === 'NBA'
      ? 'v1.basketball.api-sports.io'
      : sport === 'NHL'
      ? 'v1.hockey.api-sports.io'
      : 'v1.baseball.api-sports.io';

    const url = `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const response = await axios.get(url, {
      params: rest,
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': host
      }
    });

    return res.status(200).json(response.data);
  } catch (error) {
    console.error('[API-SPORTS PROXY] Error:', error.message);
    return res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data || {}
    });
  }
}


