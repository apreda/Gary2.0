/**
 * OpenAI API Proxy for Next.js App Router
 * Handles CORS and API key management for OpenAI requests
 * Keeps API keys secure on the server side
 */

export async function POST(request) {
  try {
    // Parse the request body
    const { model, messages, temperature, max_tokens } = await request.json();
    
    // Validate required parameters
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log('[OPENAI PROXY] Invalid request - missing messages array');
      return Response.json({ 
        error: 'Missing required parameter: messages' 
      }, { status: 400 });
    }
    
    // Get API key from environment (server-side only, no VITE_ prefix)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[OPENAI PROXY] Missing API key in environment');
      console.error('[OPENAI PROXY] Please set OPENAI_API_KEY in Vercel environment variables');
      return Response.json({ 
        error: 'Server configuration error: Missing API key' 
      }, { status: 500 });
    }
    
    console.log(`[OPENAI PROXY] Using API key: ${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`);
    
    // Prepare request to OpenAI API
    const requestData = {
      model: model || 'gpt-4',
      messages,
      temperature: temperature || 0.5,
      max_tokens: max_tokens || 800
    };
    
    console.log(`[OPENAI PROXY] Forwarding request to OpenAI API with model: ${requestData.model}`);
    
    // Send request to OpenAI API
    console.log('[OPENAI PROXY] Making request to OpenAI API...');
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    // Check if the response is OK
    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json().catch(() => ({}));
      console.error(`[OPENAI PROXY] API error: ${openaiResponse.status}`, errorData);
      
      return Response.json({
        error: 'Error from OpenAI API',
        status: openaiResponse.status,
        data: errorData
      }, { status: openaiResponse.status });
    }
    
    // Parse the response
    const responseData = await openaiResponse.json();
    console.log('[OPENAI PROXY] Successfully received response from OpenAI API');
    
    // Forward the response back to the client
    return Response.json(responseData);
    
  } catch (error) {
    console.error('[OPENAI PROXY] Error:', error.message);
    
    return Response.json({
      error: 'Error calling OpenAI API',
      message: error.message
    }, { status: 500 });
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
} 