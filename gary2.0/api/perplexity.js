// Vercel API route to proxy requests to Perplexity API
// This avoids CORS issues in browser environments
import axios from 'axios';

// Configure axios with appropriate defaults
axios.defaults.timeout = 20000; // Limit to 20 seconds to avoid Vercel Edge Network timeout issues

// Cache for successful API responses - keep in memory as this is a serverless function
const RESPONSE_CACHE = new Map();

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
        // Generate cache key based on request body with sensitive parts removed
    const generateCacheKey = (body) => {
      const { messages, model, temperature } = body || {};
      return JSON.stringify({
        model,
        temperature,
        messages: messages?.map(m => ({ role: m.role, content_hash: m.content?.substring(0, 100) || '' }))
      });
    };
    
    // Create cache key from the request
    const cacheKey = generateCacheKey(req.body);
    
    // Check cache first
    if (RESPONSE_CACHE.has(cacheKey)) {
      console.log('✅ Cache hit! Returning cached response for this query');
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
      return res.status(200).json(RESPONSE_CACHE.get(cacheKey));
    }
    
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

      // Use valid Perplexity Pro models
      // Get the original model from the request or use a default
      const originalModel = req.body?.model || 'sonar-medium-online';
      
      // Create a modified request body with valid parameter values
      const optimizedBody = {
        ...req.body,
        // Use valid model names from Perplexity docs
        model: originalModel === 'sonar-small-online' ? 'sonar-small-chat' : 
               originalModel === 'sonar-medium-online' ? 'sonar-medium-chat' : 
               originalModel === 'sonar-pro' ? 'sonar-medium-chat' : originalModel,
        max_tokens: Math.min(req.body.max_tokens || 1000, 500), // Limit output size
        temperature: Math.min(req.body.temperature || 0.7, 0.5), // Lower temperature for faster responses
      };
      
      console.log('🔄 Using optimized parameters for faster responses');
      
      // Make the request to Perplexity API with shorter timeout
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        optimizedBody,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000 // Shorter timeout for faster responses
        }
      );
      
      console.log('✅ Successfully received response from Perplexity API');
      console.log('📊 Response status:', response.status);
      console.log('📊 Response has data:', !!response.data);

      // Cache the response for future requests
      RESPONSE_CACHE.set(cacheKey, response.data);
      
      // Clean up cache if it gets too large
      if (RESPONSE_CACHE.size > 100) {
        const keysIterator = RESPONSE_CACHE.keys();
        RESPONSE_CACHE.delete(keysIterator.next().value); // Remove oldest entry
      }
      
      // Return the response from Perplexity with caching headers
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
      return res.status(200).json(response.data);
    } catch (apiError) {
      // Special handling for timeout errors
      if (apiError.code === 'ECONNABORTED' || apiError.message.includes('timeout')) {
        console.error('⏱️ Request to Perplexity API timed out after 15 seconds');
        return res.status(504).json({
          error: 'Gateway Timeout',
          message: 'Perplexity API request timed out - try again or reduce prompt complexity',
          timestamp: new Date().toISOString()
        });
      }
      // Special handling for 400 Bad Request errors (usually invalid model or parameters)
      else if (apiError.response?.status === 400) {
        console.error('❌ Bad Request error from Perplexity API:', apiError.response?.data || 'No error details');
        // If we encounter a 400 error, try with the most reliable model
        try {
          console.log('🔄 Retrying with standard model (mistral-7b-instruct)...');
          const fallbackBody = {
            ...req.body,
            model: 'mistral-7b-instruct',  // Use most widely available model
            temperature: 0.3,
            max_tokens: 300
          };
          
          const retryResponse = await axios.post(
            'https://api.perplexity.ai/chat/completions',
            fallbackBody,
            {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: 15000
            }
          );
          
          // Cache the successful retry
          RESPONSE_CACHE.set(cacheKey, retryResponse.data);
          
          console.log('✅ Retry successful with standard model');
          res.setHeader('X-Cache', 'RETRY');
          res.setHeader('Cache-Control', 'public, max-age=300');
          return res.status(200).json(retryResponse.data);
          
        } catch (retryError) {
          console.error('❌ Retry also failed:', retryError.message);
          return res.status(400).json({
            error: 'Invalid Request Parameters',
            message: 'The Perplexity API rejected the request parameters. Check the model name and other settings.',
            originalError: apiError.response?.data || apiError.message,
            timestamp: new Date().toISOString()
          });
        }
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
