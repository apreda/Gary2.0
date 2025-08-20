/**
 * OpenAI API Proxy for Next.js Pages Router
 * Handles CORS and API key management for OpenAI requests
 * Keeps API keys secure on the server side
 */

/**
 * Next.js API route handler for OpenAI API proxy
 */
export default async function handler(req, res) {
  // Set CORS headers
  const origin = req.headers.origin || '';
  const allowed = [
    'https://www.betwithgary.ai',
    'https://betwithgary.ai',
    'http://localhost:5173',
    'http://localhost:3000'
  ];
  const allowOrigin = allowed.includes(origin) ? origin : 'https://www.betwithgary.ai';
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
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
    
    // Do not log key fragments in production
    
    // Resolve and enforce gpt-5 unless explicitly allowed
    let resolvedModel = model || process.env.OPENAI_MODEL || 'gpt-5';
    if (!/^gpt-5/i.test(resolvedModel)) {
      console.warn(`[OPENAI PROXY] Overriding requested model '${resolvedModel}' -> 'gpt-5' (set ALLOW_LEGACY_MODELS=true to bypass)`);
      if (process.env.ALLOW_LEGACY_MODELS !== 'true') {
        resolvedModel = 'gpt-5';
      }
    }

    // Prepare request to OpenAI API
    const requestData = {
      model: resolvedModel,
      messages,
      temperature: temperature || 0.5,
      max_tokens: max_tokens || 800
    };
    
    console.log(`[OPENAI PROXY] Forwarding request to OpenAI API with model: ${requestData.model}`);
    
    // Try strict model then fallback to official GPT-5 tiers
    const candidates = Array.from(new Set([requestData.model, 'gpt-5-medium', 'gpt-5-high']));
    let lastErr = null;
    for (const m of candidates) {
      // Cap tokens per tier to reduce 400s from context/token limits
      let capped = requestData.max_tokens || 800;
      if (m === 'gpt-5-high') capped = Math.min(capped, 4096);
      else if (m === 'gpt-5-medium') capped = Math.min(capped, 2048);
      else capped = Math.min(capped, 2048);

      const payload = { ...requestData, model: m, max_tokens: capped };
      console.log(`[OPENAI PROXY] Trying model: ${m} with max_tokens: ${capped}`);
      try {
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        if (openaiResponse.ok) {
          const responseData = await openaiResponse.json();
          console.log(`[OPENAI PROXY] Success using model: ${m}`);
          return res.status(200).json(responseData);
        }
        const errorData = await openaiResponse.json().catch(() => ({}));
        console.warn(`[OPENAI PROXY] Model ${m} failed with ${openaiResponse.status}`, errorData);
        lastErr = { status: openaiResponse.status, data: errorData, model: m };
      } catch (e) {
        console.warn(`[OPENAI PROXY] Transport error with model ${m}: ${e.message}`);
        lastErr = { status: 502, data: { message: e.message }, model: m };
      }
    }
    const status = lastErr?.status || 502;
    return res.status(status).json({
      error: 'OpenAI request failed across all allowed models',
      status,
      lastTriedModel: lastErr?.model || null,
      data: lastErr?.data || null
    });
    
  } catch (error) {
    console.error('[OPENAI PROXY] Error:', error.message);
    
    return res.status(500).json({
      error: 'Error calling OpenAI API',
      message: error.message
    });
  }
} 