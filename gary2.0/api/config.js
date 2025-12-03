// API endpoint for retrieving environment configuration securely
export default function handler(req, res) {
  // Only GET method is allowed
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Send back the environment configuration
  res.status(200).json({
    odds_api_key: process.env.VITE_ODDS_API_KEY || ''
  });
}
