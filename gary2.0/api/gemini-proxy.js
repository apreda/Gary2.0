/**
 * Gemini API Proxy for Vercel Serverless Functions
 * Handles CORS and API key management for Gemini 3 Deep Think requests
 * Keeps API keys secure on the server side
 */

/**
 * Safety settings - BLOCK_NONE for all categories
 * Critical for sports content to prevent Gary from being blocked
 */
const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

/**
 * Vercel serverless function handler for Gemini API proxy
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
    return res.status(200).json({ ok: true, endpoint: 'api/gemini-proxy', provider: 'gemini-3-deep-think' });
  }

  // Only allow POST for completions
  if (req.method !== 'POST') {
    console.log(`[GEMINI PROXY] Method ${req.method} not allowed`);
    return res.status(405).json({ 
      error: 'Method Not Allowed',
      message: 'Only POST requests are supported'
    });
  }

  const startTime = Date.now();
  console.log(`[GEMINI PROXY] Request started at ${new Date().toISOString()}`);

  try {
    // Parse the request body - accept OpenAI-style format for compatibility
    const { model, messages, temperature = 1.0, max_tokens, tools } = req.body;
    
    // Validate required parameters
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log('[GEMINI PROXY] Invalid request - missing messages array');
      return res.status(400).json({ 
        error: 'Missing required parameter: messages' 
      });
    }
    
    // Get API key from environment
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[GEMINI PROXY] Missing API key in environment');
      console.error('[GEMINI PROXY] Please set GEMINI_API_KEY in Vercel environment variables');
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Gemini API key' 
      });
    }
    
    // Resolve model - default to Gemini 3 Pro Preview (Deep Think)
    const resolvedModel = model || process.env.GEMINI_MODEL || 'gemini-3-pro-preview';
    
    // Convert OpenAI-style messages to Gemini format
    // Gemini uses 'contents' array with 'role' and 'parts'
    let systemInstruction = '';
    const contents = [];
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        // Gemini handles system prompts separately
        systemInstruction += (systemInstruction ? '\n\n' : '') + msg.content;
      } else if (msg.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }]
        });
      } else if (msg.role === 'assistant') {
        contents.push({
          role: 'model',
          parts: [{ text: msg.content }]
        });
      } else if (msg.role === 'tool') {
        // Handle tool responses
        contents.push({
          role: 'function',
          parts: [{ 
            functionResponse: {
              name: msg.tool_call_id || 'tool_response',
              response: { content: msg.content }
            }
          }]
        });
      }
    }

    // Build generation config with Gemini 3 Deep Think settings
    const generationConfig = {
      temperature: Math.min(Math.max(temperature, 0), 2), // Clamp 0-2, default 1.0 for Gemini 3
      maxOutputTokens: max_tokens || 8192,
      responseMimeType: 'application/json', // Request JSON output
      // Gemini 3 Deep Think - enable high reasoning
      thinkingConfig: {
        thinkingBudget: 24576 // Allow deep thinking for complex sports analysis
      }
    };

    // Convert OpenAI tools to Gemini function declarations if provided
    let functionDeclarations = null;
    if (tools && Array.isArray(tools) && tools.length > 0) {
      functionDeclarations = tools.map(tool => {
        if (tool.type === 'function') {
          return {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters
          };
        }
        return null;
      }).filter(Boolean);
    }

    // Build the request payload
    const geminiPayload = {
      contents,
      generationConfig,
      safetySettings: SAFETY_SETTINGS,
    };

    // Add system instruction if present
    if (systemInstruction) {
      geminiPayload.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    // Add tools if present
    if (functionDeclarations && functionDeclarations.length > 0) {
      geminiPayload.tools = [{
        functionDeclarations
      }];
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${apiKey}`;
    
    console.log(`[GEMINI PROXY] Forwarding request to Gemini API with model: ${resolvedModel}`);
    console.log(`[GEMINI PROXY] Temperature: ${generationConfig.temperature}, MaxTokens: ${generationConfig.maxOutputTokens}`);
    
    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 180 second timeout for deep thinking
    
    try {
      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(geminiPayload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const requestDuration = Date.now() - startTime;

      if (!geminiResponse.ok) {
        const errorData = await geminiResponse.json().catch(() => ({}));
        console.error(`[GEMINI PROXY] Gemini API error ${geminiResponse.status}:`, errorData);
        return res.status(geminiResponse.status).json({
          error: 'Gemini API error',
          status: geminiResponse.status,
          data: errorData
        });
      }

      const responseData = await geminiResponse.json();
      console.log(`[GEMINI PROXY] Gemini API responded in ${requestDuration}ms`);

      // Convert Gemini response to OpenAI-compatible format
      const candidate = responseData.candidates?.[0];
      if (!candidate) {
        console.error('[GEMINI PROXY] No candidates in response');
        return res.status(500).json({
          error: 'No response from Gemini',
          data: responseData
        });
      }

      // Check for function calls
      const functionCall = candidate.content?.parts?.find(p => p.functionCall);
      
      // Build OpenAI-compatible response
      const openaiCompatibleResponse = {
        id: `gemini-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: resolvedModel,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: functionCall ? null : (candidate.content?.parts?.map(p => p.text).join('') || ''),
            tool_calls: functionCall ? [{
              id: `call_${Date.now()}`,
              type: 'function',
              function: {
                name: functionCall.functionCall.name,
                arguments: JSON.stringify(functionCall.functionCall.args || {})
              }
            }] : undefined
          },
          finish_reason: candidate.finishReason === 'STOP' ? 'stop' : 
                        functionCall ? 'tool_calls' : 
                        candidate.finishReason?.toLowerCase() || 'stop'
        }],
        usage: {
          prompt_tokens: responseData.usageMetadata?.promptTokenCount || 0,
          completion_tokens: responseData.usageMetadata?.candidatesTokenCount || 0,
          total_tokens: responseData.usageMetadata?.totalTokenCount || 0
        }
      };

      console.log(`[GEMINI PROXY] Response content length: ${openaiCompatibleResponse.choices[0].message.content?.length || 0}`);
      console.log(`[GEMINI PROXY] Has tool calls: ${!!openaiCompatibleResponse.choices[0].message.tool_calls}`);

      return res.status(200).json(openaiCompatibleResponse);

    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error('[GEMINI PROXY] Request timed out after 180 seconds');
        return res.status(504).json({
          error: 'Request timeout',
          message: 'Gemini API request timed out'
        });
      }
      
      throw fetchError;
    }
    
  } catch (error) {
    const requestDuration = Date.now() - startTime;
    console.error(`[GEMINI PROXY] Error after ${requestDuration}ms:`, error.message);
    
    return res.status(500).json({
      error: 'Error calling Gemini API',
      message: error.message
    });
  }
}

