// Vercel API route to proxy requests to Perplexity API
// This avoids CORS issues in browser environments
import axios from 'axios';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Get the API key from environment variables
    const apiKey = process.env.PERPLEXITY_API_KEY;
    
    if (!apiKey) {
      console.error('PERPLEXITY_API_KEY environment variable is not set');
      return res.status(500).json({ error: 'API key not configured on server' });
    }

    // Make the request to Perplexity API
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      req.body,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 45000 // 45 second timeout for server-side requests
      }
    );

    // Return the response from Perplexity
    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Error proxying request to Perplexity API:', error);
    
    // Return appropriate error response
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';
    
    return res.status(statusCode).json({ 
      error: errorMessage,
      details: error.response?.data || null
    });
  }
}
