// Serverless function to proxy requests to The Odds API
// This bypasses CORS restrictions when making API calls from the browser

import axios from 'axios';

export default async function handler(req, res) {
  // Set CORS headers to allow requests from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Get the API key from environment variables
    const apiKey = process.env.VITE_ODDS_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({
        error: 'API key is missing in environment variables'
      });
    }
    
    // Extract the endpoint and query params from the request
    const { endpoint } = req.query;
    
    if (!endpoint) {
      return res.status(400).json({
        error: 'Missing required parameter: endpoint'
      });
    }
    
    // Construct the URL to The Odds API
    const url = `https://api.the-odds-api.com/v4/${endpoint}`;
    
    // Forward the request to The Odds API
    const response = await axios.get(url, {
      params: {
        ...req.query,
        apiKey: apiKey
      }
    });
    
    // Return the API response
    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Error proxying to The Odds API:', error);
    
    // Return the error details
    return res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data || {}
    });
  }
}
