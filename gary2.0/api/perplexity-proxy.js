/**
 * Perplexity API Proxy for Vercel Serverless Functions
 * Handles CORS and API key management for Perplexity requests
 */

// Define supported models (updated for 2025)
const SUPPORTED_MODELS = [
  'llama-3.1-sonar-small-128k-online',
  'llama-3.1-sonar-large-128k-online',
  'llama-3.1-sonar-huge-128k-online',
  'llama-3-sonar-online',
  'llama-3-70b-online',
  'pplx-7b-online',
  'pplx-70b-online',
  'mixtral-8x7b-instruct',
  'mistral-7b-instruct'
];

/**
 * Vercel serverless function handler for Perplexity API proxy
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
    console.log(`[PERPLEXITY PROXY] Method ${req.method} not allowed`);
    return res.status(405).json({ 
      error: 'Method Not Allowed',
      message: 'Only POST requests are supported'
    });
  }

  try {
    // Parse the request body
    const { model, messages } = req.body;
    
    // Validate required parameters
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log('[PERPLEXITY PROXY] Invalid request - missing messages array');
      return res.status(400).json({ 
        error: 'Missing required parameter: messages' 
      });
    }
    
    // Select and validate model
    const selectedModel = model || 'llama-3.1-sonar-small-128k-online';
    if (!SUPPORTED_MODELS.includes(selectedModel)) {
      console.log(`[PERPLEXITY PROXY] Invalid model requested: ${selectedModel}`);
      return res.status(400).json({
        error: 'Invalid model',
        message: `Model '${selectedModel}' is not supported. Please use one of: ${SUPPORTED_MODELS.join(', ')}`
      });
    }
    
    // Get API key from environment (check both variants)
    const apiKey = process.env.PERPLEXITY_API_KEY || process.env.VITE_PERPLEXITY_API_KEY;
    if (!apiKey) {
      console.error('[PERPLEXITY PROXY] Missing API key in environment');
      console.error('[PERPLEXITY PROXY] Checked: PERPLEXITY_API_KEY and VITE_PERPLEXITY_API_KEY');
      return res.status(500).json({ 
        error: 'Server configuration error: Missing API key' 
      });
    }
    
    console.log(`[PERPLEXITY PROXY] Using API key: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`);
    
    // Prepare request to Perplexity API
    const requestData = {
      model: selectedModel,
      messages,
      max_tokens: 512
    };
    
    console.log(`[PERPLEXITY PROXY] Forwarding request to Perplexity API with model: ${selectedModel}`);
    
    // Send request to Perplexity API
    console.log('[PERPLEXITY PROXY] Making request to Perplexity API...');
    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    // Check if the response is OK
    if (!perplexityResponse.ok) {
      const errorData = await perplexityResponse.json().catch(() => ({}));
      console.error(`[PERPLEXITY PROXY] API error: ${perplexityResponse.status}`, errorData);
      
      return res.status(perplexityResponse.status).json({
        error: 'Error from Perplexity API',
        status: perplexityResponse.status,
        data: errorData
      });
    }
    
    // Parse the response
    const responseData = await perplexityResponse.json();
    console.log('[PERPLEXITY PROXY] Successfully received response from Perplexity API');
    
    // Forward the response back to the client
    return res.status(200).json(responseData);
    
  } catch (error) {
    console.error('[PERPLEXITY PROXY] Error:', error.message);
    
    return res.status(500).json({
      error: 'Error calling Perplexity API',
      message: error.message
    });
  }
} 