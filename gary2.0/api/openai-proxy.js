/**
 * OpenAI API Proxy for Vercel Serverless Functions
 * Handles CORS and API key management for OpenAI requests
 * Keeps API keys secure on the server side
 */

/**
 * Vercel serverless function handler for OpenAI API proxy
 */
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    console.log(`[OPENAI PROXY] Method ${req.method} not allowed`);
    return res.status(405).json({ 
      error: 'Method Not Allowed',
      message: 'Only POST requests are supported'
    });
  }

  const startTime = Date.now();
  console.log(`[OPENAI PROXY] Request started at ${new Date().toISOString()}`);

  try {
    // Parse the request body
    const { model, messages, temperature, max_tokens } = req.body;
    
    // Validate required parameters
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log('[OPENAI PROXY] Invalid request - missing messages array');
      return res.status(400).json({ 
        error: 'Missing required parameter: messages' 
      });
    }
    
    // Get API key from environment (server-side only, no VITE_ prefix)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[OPENAI PROXY] Missing API key in environment');
      console.error('[OPENAI PROXY] Please set OPENAI_API_KEY in Vercel environment variables');
      return res.status(500).json({ 
        error: 'Server configuration error: Missing API key' 
      });
    }
    
    console.log(`[OPENAI PROXY] Using API key: ${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`);
    
    // Prepare request to OpenAI API with optimized parameters
    const requestData = {
      model: model || 'gpt-4',
      messages,
      temperature: temperature || 0.5,
      max_tokens: Math.min(max_tokens || 800, 1000), // Limit tokens to prevent long responses
      stream: false // Ensure we don't use streaming
    };
    
    console.log(`[OPENAI PROXY] Forwarding request to OpenAI API with model: ${requestData.model}, max_tokens: ${requestData.max_tokens}`);
    
    // Send request to OpenAI API with timeout
    console.log('[OPENAI PROXY] Making request to OpenAI API...');
    
    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout
    
    try {
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const requestDuration = Date.now() - startTime;
      console.log(`[OPENAI PROXY] OpenAI API responded in ${requestDuration}ms`);
      
      // Check if the response is OK
      if (!openaiResponse.ok) {
        const errorData = await openaiResponse.json().catch(() => ({}));
        console.error(`[OPENAI PROXY] API error: ${openaiResponse.status}`, errorData);
        
        return res.status(openaiResponse.status).json({
          error: 'Error from OpenAI API',
          status: openaiResponse.status,
          data: errorData
        });
      }
      
      // Parse the response
      const responseData = await openaiResponse.json();
      console.log(`[OPENAI PROXY] Successfully received response from OpenAI API (${requestDuration}ms)`);
      
      // Forward the response back to the client
      return res.status(200).json(responseData);
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error('[OPENAI PROXY] Request timed out after 45 seconds');
        return res.status(504).json({
          error: 'Request timeout',
          message: 'OpenAI API request timed out'
        });
      }
      
      throw fetchError; // Re-throw other errors
    }
    
  } catch (error) {
    const requestDuration = Date.now() - startTime;
    console.error(`[OPENAI PROXY] Error after ${requestDuration}ms:`, error.message);
    
    return res.status(500).json({
      error: 'Error calling OpenAI API',
      message: error.message
    });
  }
} 