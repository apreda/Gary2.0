// Vercel API route to proxy requests to Perplexity API
// This avoids CORS issues in browser environments
import axios from 'axios';

// Configure axios with appropriate defaults
axios.defaults.timeout = 58000; // 58 second timeout since Vercel Pro supports up to 60s

// Enable CORS for all origins
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  // Handle OPTIONS request (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    console.log(`❌ Method ${req.method} not allowed, only POST is supported`);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  
  console.log('✅ Perplexity proxy received a valid POST request');

  try {
    // Get the API key from environment variables - check both with and without VITE_ prefix
    const apiKey = process.env.VITE_PERPLEXITY_API_KEY || process.env.PERPLEXITY_API_KEY;
    
    if (!apiKey) {
      console.error('❌ Neither VITE_PERPLEXITY_API_KEY nor PERPLEXITY_API_KEY environment variable is set');
      return res.status(500).json({ error: 'API key not configured on server' });
    }
    
    console.log('✅ Found Perplexity API key in environment variables');
    
    // Log the request structure (without sensitive data)
    console.log('📝 Request body structure:', {
      hasModel: !!req.body?.model,
      hasMessages: Array.isArray(req.body?.messages),
      messageCount: req.body?.messages?.length || 0,
      hasTemperature: typeof req.body?.temperature !== 'undefined',
      hasMaxTokens: typeof req.body?.max_tokens !== 'undefined'
    });

    console.log('📤 Forwarding request to Perplexity API...');
    
    try {
      console.log('🕒 Starting Perplexity API request with truncated prompt length:', 
        req.body?.messages?.[0]?.content?.length || 'unknown');

      // Make the request to Perplexity API with shorter timeout
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        req.body,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 58000 // Vercel Pro supports up to 60s execution time
        }
      );
      
      console.log('✅ Successfully received response from Perplexity API');
      console.log('📊 Response status:', response.status);
      console.log('📊 Response has data:', !!response.data);

      // Return the response from Perplexity - add a shorter cache hint
      res.setHeader('Cache-Control', 'public, max-age=120'); // Cache for 2 minutes to reduce load
      return res.status(200).json(response.data);
    } catch (apiError) {
      // Special handling for timeout errors
      if (apiError.code === 'ECONNABORTED' || apiError.message.includes('timeout')) {
        console.error('⏱️ Request to Perplexity API timed out after 20 seconds');
        return res.status(504).json({
          error: 'Gateway Timeout',
          message: 'Perplexity API request timed out - try again or reduce prompt complexity',
          timestamp: new Date().toISOString()
        });
      }
      console.error('❌ Error making request to Perplexity API:', apiError.message);
      
      if (apiError.response) {
        console.error('📊 Error status:', apiError.response.status);
        console.error('📊 Error data:', JSON.stringify(apiError.response.data || {}));
      }
      
      throw apiError; // Let the outer catch handle this
    }
  } catch (error) {
    console.error('❌ Error in Perplexity proxy:', error.message);
    
    // Return appropriate error response
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';
    
    console.log('📤 Responding with error status:', statusCode);
    
    return res.status(statusCode).json({ 
      error: errorMessage,
      details: error.response?.data || null,
      message: 'Error proxying request to Perplexity API',
      timestamp: new Date().toISOString(),
      path: req.url
    });
  }
}
