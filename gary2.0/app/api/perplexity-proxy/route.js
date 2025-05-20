/**
 * Perplexity API Proxy using App Router format
 * This implements the pattern from Next.js 13+ App Router
 */

// Define supported models
const SUPPORTED_MODELS = [
  'pplx-7b-online',
  'pplx-70b-online',
  'mixtral-8x7b-instruct',
  'mistral-7b-instruct',
  'llama-3-sonar-online', 
  'llama-3-70b-online'
];

/**
 * Handle POST requests to the Perplexity API proxy
 */
export async function POST(req) {
  // Set CORS headers for response
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  try {
    // Parse the request body
    const body = await req.json();
    
    // Validate required parameters
    const { model, messages } = body;
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log('[PERPLEXITY PROXY] Invalid request - missing messages array');
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: messages' }), 
        { status: 400, headers: corsHeaders }
      );
    }
    
    // Select and validate model
    const selectedModel = model || 'pplx-7b-online';
    if (!SUPPORTED_MODELS.includes(selectedModel)) {
      console.log(`[PERPLEXITY PROXY] Invalid model requested: ${selectedModel}`);
      return new Response(
        JSON.stringify({
          error: 'Invalid model',
          message: `Model '${selectedModel}' is not supported. Please use one of: ${SUPPORTED_MODELS.join(', ')}`
        }),
        { status: 400, headers: corsHeaders }
      );
    }
    
    // Get API key from environment
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      console.error('[PERPLEXITY PROXY] Missing API key in environment');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Missing API key' }),
        { status: 500, headers: corsHeaders }
      );
    }
    
    // Prepare request to Perplexity API
    const requestData = {
      model: selectedModel,
      messages,
      max_tokens: 512 // Increased from 256 to match preferred configuration
    };
    
    console.log(`[PERPLEXITY PROXY] Forwarding request to Perplexity API with model: ${selectedModel}`);
    
    // Send request to Perplexity API
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
      
      return new Response(
        JSON.stringify({
          error: 'Error from Perplexity API',
          status: perplexityResponse.status,
          data: errorData
        }),
        { status: perplexityResponse.status, headers: corsHeaders }
      );
    }
    
    // Parse the response
    const responseData = await perplexityResponse.json();
    console.log('[PERPLEXITY PROXY] Successfully received response from Perplexity API');
    
    // Forward the response back to the client
    return new Response(
      JSON.stringify(responseData),
      { status: 200, headers: corsHeaders }
    );
    
  } catch (error) {
    console.error('[PERPLEXITY PROXY] Error:', error.message);
    
    return new Response(
      JSON.stringify({
        error: 'Error calling Perplexity API',
        message: error.message
      }),
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
