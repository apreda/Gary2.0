// Netlify serverless function to proxy requests to Perplexity API
// This avoids CORS issues in browser environments
const axios = require('axios');

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  try {
    // Parse the incoming request body
    const payload = JSON.parse(event.body);
    
    // Get the API key from environment variables
    const apiKey = process.env.PERPLEXITY_API_KEY;
    
    if (!apiKey) {
      console.error('PERPLEXITY_API_KEY environment variable is not set');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'API key not configured on server' }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    // Make the request to Perplexity API
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 45000 // 45 second timeout for server-side requests
      }
    );

    // Return the response from Perplexity
    return {
      statusCode: 200,
      body: JSON.stringify(response.data),
      headers: { 'Content-Type': 'application/json' }
    };
  } catch (error) {
    console.error('Error proxying request to Perplexity API:', error);
    
    // Return appropriate error response
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';
    
    return {
      statusCode,
      body: JSON.stringify({ 
        error: errorMessage,
        details: error.response?.data || null
      }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
};
