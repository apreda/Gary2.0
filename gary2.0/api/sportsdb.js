import axios from 'axios';

// Cache storage with expiration
const cache = new Map();
const CACHE_TTL = 3600000; // 1 hour in milliseconds

export default async function handler(req, res) {
  try {
    // Set CORS headers to allow requests from your domain
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Or specific domains like 'https://www.betwithgary.ai'
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get the endpoint and parameters from query
    const { endpoint } = req.query;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint parameter is required' });
    }

    // Construct the TheSportsDB URL with your API key
    const API_KEY = '943802'; // Your paid tier API key
    
    // Remove endpoint from query params to avoid duplication
    const params = { ...req.query };
    delete params.endpoint;
    
    // Construct cache key from endpoint and parameters
    const cacheKey = `${endpoint}:${JSON.stringify(params)}`;
    
    // Check if we have a valid cached response
    if (cache.has(cacheKey)) {
      const cachedData = cache.get(cacheKey);
      if (Date.now() < cachedData.expiry) {
        console.log(`Cache hit for ${cacheKey}`);
        return res.status(200).json(cachedData.data);
      } else {
        // Remove expired cache entry
        cache.delete(cacheKey);
      }
    }
    
    // Construct base URL for API version
    let baseUrl;
    if (endpoint.startsWith('v1/')) {
      baseUrl = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/${endpoint.slice(3)}`;
    } else if (endpoint.startsWith('v2/')) {
      baseUrl = `https://www.thesportsdb.com/api/v2/json/${API_KEY}/${endpoint.slice(3)}`;
    } else {
      // Default to v1 if not specified
      baseUrl = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/${endpoint}`;
    }
    
    console.log(`Proxying request to TheSportsDB: ${baseUrl}`);
    
    // Make the request to TheSportsDB
    const response = await axios.get(baseUrl, { params });
    
    // Cache the response
    cache.set(cacheKey, {
      data: response.data,
      expiry: Date.now() + CACHE_TTL
    });
    
    // Return the data
    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Error proxying to TheSportsDB:', error);
    
    // Return appropriate error response
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || error.message || 'Internal server error';
    
    return res.status(status).json({ error: message });
  }
}
