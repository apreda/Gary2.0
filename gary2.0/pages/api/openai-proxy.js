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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  
  // Health check GET
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, endpoint: 'pages/api/openai-proxy' });
  }

  // Only allow POST for completions
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

    // Prepare request to OpenAI API (GPT-5 uses max_completion_tokens)
    const baseMax = max_tokens || 2000;
    const requestData = {
      model: resolvedModel,
      messages,
      temperature: 1 // Force default temp for GPT-5 family
    };
    
    console.log(`[OPENAI PROXY] Forwarding request to OpenAI API with model: ${requestData.model}`);
    
    // Try strict model then fallback to compact tiers
    const candidates = Array.from(new Set([requestData.model, 'gpt-5-mini', 'gpt-5-nano']));
    let lastErr = null;
    for (const m of candidates) {
      // Cap tokens per model and use max_completion_tokens for GPT-5 family
      let capped = baseMax;
      if (m === 'gpt-5-nano') capped = Math.min(capped, 1024);
      else if (m === 'gpt-5-mini') capped = Math.min(capped, 2048);
      else capped = Math.min(capped, 4096);

      let payload = { ...requestData, model: m, temperature: 1, max_completion_tokens: capped, response_format: { type: 'json_object' } };
      console.log(`[OPENAI PROXY] Trying model: ${m} with max_completion_tokens: ${capped}, temperature: 1 (json_object mode)`);
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
          const msg = responseData?.choices?.[0]?.message || {};
          console.log(`[OPENAI PROXY] message keys: ${Object.keys(msg || {}).join(',')} | contentLen: ${(msg.content||'').length} | tool_calls: ${Array.isArray(msg.tool_calls)} | refusal: ${msg.refusal ? 'yes' : 'no'}`);
          const content = msg?.content;
          if (typeof content === 'string' && content.trim().length > 0) {
            console.log(`[OPENAI PROXY] Success using model: ${m}`);
            return res.status(200).json(responseData);
          }
          // Fallback: empty content – first, retry Chat Completions with higher cap
          if (capped < 4096) {
            const bump = Math.min(4096, capped * 2);
            const retryPayload = { ...requestData, model: m, temperature: 1, max_completion_tokens: bump, response_format: { type: 'json_object' } };
            console.log(`[OPENAI PROXY] Empty content. Retrying Chat Completions with higher cap: ${bump}`);
            const retry = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(retryPayload)
            });
            if (retry.ok) {
              const retryData = await retry.json();
              const retryContent = retryData?.choices?.[0]?.message?.content;
              if (typeof retryContent === 'string' && retryContent.trim().length > 0) {
                console.log('[OPENAI PROXY] Higher-cap retry succeeded');
                return res.status(200).json(retryData);
              }
            }
          }

          // Then, retry with Responses API to coerce JSON
          const input = messages.map(msg => `${msg.role.toUpperCase()}: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`).join('\n\n');
          const respPayload = {
            model: m,
            input,
            temperature: 1,
            max_output_tokens: Math.max(capped, 1024),
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'AnyJSON',
                schema: { type: 'object', additionalProperties: true },
                strict: true
              }
            }
          };
          console.log(`[OPENAI PROXY] Empty content from Chat Completions. Retrying via Responses API for model: ${m}`);
          const resp = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(respPayload)
          });
          if (resp.ok) {
            const data2 = await resp.json();
            console.log(`[OPENAI PROXY] Responses API success using model: ${m}`);
            return res.status(200).json(data2);
          }
          const err2 = await resp.json().catch(() => ({}));
          console.warn(`[OPENAI PROXY] Responses API fallback failed for model ${m} with ${resp.status}`, err2);
          return res.status(200).json(responseData); // Return original even if empty to aid debugging client-side
        }
        const errorData = await openaiResponse.json().catch(() => ({}));
        console.warn(`[OPENAI PROXY] Model ${m} failed with ${openaiResponse.status}`, errorData);
        // If JSON mode unsupported, retry once without response_format
        if (errorData?.error?.code === 'unsupported_parameter' && errorData?.error?.param === 'response_format') {
          const fallbackPayload = { ...requestData, model: m, temperature: 1, max_completion_tokens: capped };
          console.log(`[OPENAI PROXY] Retrying model: ${m} without response_format`);
          const resp2 = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(fallbackPayload)
          });
          if (resp2.ok) {
            const data2 = await resp2.json();
            console.log(`[OPENAI PROXY] Success using model: ${m} without response_format`);
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
            body: JSON.stringify(respPayload)
          });
          if (resp.ok) {
            const data = await resp.json();
            console.log(`[OPENAI PROXY] Responses API success using model: ${m}`);
            return res.status(200).json(data);
          }
          const err2 = await resp.json().catch(() => ({}));
          console.warn(`[OPENAI PROXY] Responses API failed for model ${m} with ${resp.status}`, err2);
          lastErr = { status: resp.status, data: err2, model: m };
        } else {
          lastErr = { status: openaiResponse.status, data: errorData, model: m };
        }
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