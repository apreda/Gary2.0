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
  const origin = req.headers.origin || '';
  const allowed = [
    'https://www.betwithgary.ai',
    'https://betwithgary.ai',
    'http://localhost:5173',
    'http://localhost:3000'
  ];
  const allowOrigin = allowed.includes(origin) ? origin : 'https://www.betwithgary.ai';
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  
  // Health check GET
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, endpoint: 'api/openai-proxy' });
  }

  // Only allow POST for completions
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
    
    // Do not log key fragments
    
    // Prepare request to OpenAI API with optimized parameters
    // Resolve model and hard-enforce gpt-5 unless explicitly allowed
    let resolvedModel = model || process.env.OPENAI_MODEL || 'gpt-5';
    if (!/^gpt-5/i.test(resolvedModel)) {
      console.warn(`[OPENAI PROXY] Overriding requested model '${resolvedModel}' -> 'gpt-5' (set ALLOW_LEGACY_MODELS=true to bypass)`);
      if (process.env.ALLOW_LEGACY_MODELS !== 'true') {
        resolvedModel = 'gpt-5';
      }
    }

    const baseMax = Math.min(max_tokens || 800, 1000);
    const requestData = {
      model: resolvedModel,
      messages,
      temperature: 1, // Force default temperature for GPT-5 family
      // GPT-5 expects max_completion_tokens; leave max_tokens off
      stream: false // Ensure we don't use streaming
    };
    
    console.log(`[OPENAI PROXY] Forwarding request to OpenAI API with model: ${requestData.model}, max_tokens: ${requestData.max_tokens}`);
    
    // Send request to OpenAI API with timeout
    console.log('[OPENAI PROXY] Making request to OpenAI API...');
    
    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout
    
    try {
      const models = Array.from(new Set([requestData.model, 'gpt-5-mini', 'gpt-5-nano']))
      let lastErr = null;
      for (const m of models) {
        // Cap tokens per model to reduce 400s from context/token limits
        const base = baseMax;
        const capped = m === 'gpt-5-nano' ? Math.min(base, 512) : (m === 'gpt-5-mini' ? Math.min(base, 1024) : Math.min(base, 2048));
        let payload = { ...requestData, model: m, max_completion_tokens: capped, response_format: { type: 'json_object' } };
        console.log(`[OPENAI PROXY] Trying model: ${m} with max_completion_tokens: ${capped}, temperature: 1 (json_object mode)`);
        try {
          const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          if (openaiResponse.ok) {
            clearTimeout(timeoutId);
            const requestDuration = Date.now() - startTime;
            console.log(`[OPENAI PROXY] OpenAI API responded in ${requestDuration}ms using model: ${m}`);
            const responseData = await openaiResponse.json();
            const content = responseData?.choices?.[0]?.message?.content;
            if (typeof content === 'string' && content.trim().length > 0) {
              return res.status(200).json(responseData);
            }
            // Fallback: empty content – retry via Responses API with json_object
            const input = messages.map(msg => `${msg.role.toUpperCase()}: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`).join('\n\n');
            const respPayload = { model: m, input, max_output_tokens: capped, response_format: { type: 'json_object' } };
            console.log(`[OPENAI PROXY] Empty content; retrying via Responses API for model: ${m}`);
            const resp = await fetch('https://api.openai.com/v1/responses', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(respPayload),
              signal: controller.signal
            });
            if (resp.ok) {
              const data2 = await resp.json();
              return res.status(200).json(data2);
            }
            // Return original even if empty to aid client diagnostics
            return res.status(200).json(responseData);
          }

          const errorData = await openaiResponse.json().catch(() => ({}));
          console.warn(`[OPENAI PROXY] Model ${m} failed with ${openaiResponse.status}`, errorData);

          // If JSON mode unsupported, retry once without response_format
          if (errorData?.error?.code === 'unsupported_parameter' && errorData?.error?.param === 'response_format') {
            const fallbackPayload = { ...requestData, model: m, max_completion_tokens: capped };
            console.log(`[OPENAI PROXY] Retrying model: ${m} without response_format`);
            const resp2 = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(fallbackPayload),
              signal: controller.signal
            });
            if (resp2.ok) {
              clearTimeout(timeoutId);
              const requestDuration2 = Date.now() - startTime;
              console.log(`[OPENAI PROXY] Success using model: ${m} without response_format in ${requestDuration2}ms`);
              const data2 = await resp2.json();
              return res.status(200).json(data2);
            }
          }

          // If chat/completions rejects 'messages', retry via Responses API using 'input'
          if (openaiResponse.status === 400 && errorData?.error?.code === 'unsupported_parameter' && errorData?.error?.param === 'messages') {
            const input = messages.map(msg => `${msg.role.toUpperCase()}: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`).join('\n\n');
            const respPayload = { model: m, input, temperature: 1, max_output_tokens: capped };
            console.log(`[OPENAI PROXY] Retrying via Responses API for model: ${m} with max_output_tokens: ${capped}`);
            const resp = await fetch('https://api.openai.com/v1/responses', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(respPayload),
              signal: controller.signal
            });
            if (resp.ok) {
              clearTimeout(timeoutId);
              const requestDuration = Date.now() - startTime;
              console.log(`[OPENAI PROXY] Responses API success in ${requestDuration}ms using model: ${m}`);
              const data = await resp.json();
              return res.status(200).json(data);
            }
            const err2 = await resp.json().catch(() => ({}));
            console.warn(`[OPENAI PROXY] Responses API failed for model ${m} with ${resp.status}`, err2);
            lastErr = { status: resp.status, data: err2, model: m };
          } else {
            lastErr = { status: openaiResponse.status, data: errorData, model: m };
          }
          // continue to next fallback
        } catch (innerErr) {
          console.warn(`[OPENAI PROXY] Transport error with model ${m}:`, innerErr.message);
          lastErr = { status: 502, data: { message: innerErr.message }, model: m };
          // continue
        }
      }

      clearTimeout(timeoutId);
      const status = lastErr?.status || 502;
      return res.status(status).json({
        error: 'OpenAI request failed across all allowed models',
        status,
        lastTriedModel: lastErr?.model || null,
        data: lastErr?.data || null
      });

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