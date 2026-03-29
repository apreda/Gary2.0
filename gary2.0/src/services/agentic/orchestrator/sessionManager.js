import { CONFIG, GEMINI_SAFETY_SETTINGS, validateGeminiModel } from './orchestratorConfig.js';
import { getGeminiClient } from '../modelConfig.js';

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENT SESSION MANAGEMENT (Gemini 3 Thought Signatures)
// ═══════════════════════════════════════════════════════════════════════════
// Gemini 3 requires thought signatures to be preserved across multi-turn
// function calling. The SDK handles this automatically when using persistent
// chat sessions via startChat() + sendMessage().
//
// CRITICAL: Thought signatures are MODEL-SPECIFIC!
// - Cannot pass Flash signatures to Pro (causes 400 error)
// - When switching models, extract TEXTUAL content only
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a persistent Gemini chat session
 * SDK automatically handles thought signatures when using persistent sessions
 * 
 * @param {Object} options - Session configuration
 * @param {string} options.modelName - Model to use (gemini-3-flash-preview or gemini-3-pro-preview)
 * @param {string} options.systemPrompt - System instruction for the session
 * @param {Array} options.tools - Function calling tools (optional)
 * @param {string} options.thinkingLevel - Thinking level: 'low', 'medium', 'high' (default: 'high')
 * @returns {Object} - { chat, model, modelName } - Chat session and model reference
 */
export function createGeminiSession(options = {}) {
  const {
    modelName = 'gemini-3-flash-preview',
    systemPrompt = '',
    tools = [],
    thinkingLevel = 'high',
    maxOutputTokens = CONFIG.maxTokens,
    _costTracker = null
  } = options;
  
  const genAI = getGeminiClient({ beta: true });
  const validatedModel = validateGeminiModel(modelName);
  
  // Convert tool definitions to Gemini function declarations
  const functionDeclarations = tools
    .filter(tool => tool.type === 'function')
    .map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters
    }));
  
  // Build tools array (function calling OR grounding, not both)
  const geminiTools = [];
  if (functionDeclarations.length > 0) {
    geminiTools.push({ functionDeclarations });
  }
  
  // Create the model with configuration
  const model = genAI.getGenerativeModel({
    model: validatedModel,
    tools: geminiTools.length > 0 ? geminiTools : undefined,
    safetySettings: GEMINI_SAFETY_SETTINGS,
    generationConfig: {
      temperature: CONFIG.gemini.temperature, // Fixed at 1.0
      topP: CONFIG.gemini.topP,
      topK: 64, // Recommended for Gemini 3
      maxOutputTokens,
      thinkingConfig: {
        includeThoughts: true,
        thinkingLevel: thinkingLevel
      }
    }
  });
  
  // Start the chat session with system instruction
  const chat = model.startChat({
    history: [],
    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined
  });
  
  console.log(`[Session] Created ${validatedModel} session (thinkingLevel: ${thinkingLevel}, tools: ${functionDeclarations.length})`);
  
  return {
    chat,
    model,
    modelName: validatedModel,
    thinkingLevel,
    _costTracker
  };
}

/**
 * Send a message to a persistent chat session
 * Handles both text messages and function responses (single or batched)
 * SDK automatically preserves thought signatures
 *
 * @param {Object} session - Session from createGeminiSession
 * @param {string|Array} message - Text content OR array of function responses
 * @param {Object} options - Additional options
 * @param {boolean} options.isFunctionResponse - True if message contains function responses
 * @returns {Object} - Parsed response with content, toolCalls, usage
 */
export async function sendToSession(session, message, options = {}) {
  const { isFunctionResponse = false } = options;
  const startTime = Date.now();
  
  try {
    let result;
    
    if (isFunctionResponse && Array.isArray(message)) {
      // Send batched function responses
      // Gemini expects array of: { functionResponse: { name, response: { content } } }
      const functionResponseParts = message.map(fr => ({
        functionResponse: {
          name: fr.name,
          response: { content: typeof fr.content === 'string' ? fr.content : JSON.stringify(fr.content) }
        }
      }));
      result = await session.chat.sendMessage(functionResponseParts);
    } else if (isFunctionResponse) {
      // Single function response (legacy support)
      const functionResponseParts = [{
        functionResponse: {
          name: message.name,
          response: { content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content) }
        }
      }];
      result = await session.chat.sendMessage(functionResponseParts);
    } else {
      // Send text message
      result = await session.chat.sendMessage(message);
    }
    
    const response = await result.response;
    const duration = Date.now() - startTime;
    
    // Parse the response
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    
    // Check for blocked response or malformed function call
    const blockReason = response.promptFeedback?.blockReason || candidate?.finishReason;
    if (blockReason && blockReason !== 'STOP' && parts.length === 0) {
      // Enhanced diagnostics for specific block reasons
      if (blockReason === 'MALFORMED_FUNCTION_CALL') {
        // This happens when the model generates invalid function call JSON
        // Possible causes: complex context, ambiguous schemas, or model confusion
        const tokenCount = response.usageMetadata?.promptTokenCount || 'unknown';
        console.log(`[Session] ⚠️ MALFORMED_FUNCTION_CALL detected`);
        console.log(`[Session]    Context size: ${tokenCount} tokens`);
        console.log(`[Session]    This is a model-side issue (invalid function call JSON) - retrying`);

        // Check if candidate has any partial data we can log for debugging
        if (candidate?.content) {
          const partialContent = JSON.stringify(candidate.content).slice(0, 200);
          console.log(`[Session]    Partial response: ${partialContent}...`);
        }
      } else if (blockReason === 'UNEXPECTED_TOOL_CALL') {
        // This happens when the model tries to make tool calls when none were expected
        // Often occurs when sending function responses and model wants more data
        const tokenCount = response.usageMetadata?.promptTokenCount || 'unknown';
        console.log(`[Session] ⚠️ UNEXPECTED_TOOL_CALL detected`);
        console.log(`[Session]    Context size: ${tokenCount} tokens`);
        console.log(`[Session]    Model tried to call tools when not expected - retrying with fresh context`);
      } else {
        console.log(`[Session] ⚠️ Response blocked/filtered: ${blockReason}`);
      }
      throw new Error(`Gemini response blocked: ${blockReason}. Retry may succeed.`);
    }
    
    // Extract function calls and text (exclude thinking parts — Gemini 3 marks them with thought: true)
    const functionCallParts = parts.filter(p => p.functionCall);
    const textParts = parts.filter(p => p.text && !p.thought).map(p => p.text);
    
    // Build tool_calls array (normalized format for downstream code)
    let toolCalls = null;
    if (functionCallParts.length > 0) {
      toolCalls = functionCallParts.map((fc, index) => ({
        id: `call_${Date.now()}_${index}`,
        type: 'function',
        function: {
          name: fc.functionCall.name,
          arguments: JSON.stringify(fc.functionCall.args || {})
        },
        // Note: thought signatures are handled internally by SDK
        _hasSignature: !!fc.thoughtSignature
      }));
      console.log(`[Session] 🔧 ${toolCalls.length} function call(s) requested`);
    }
    
    const usage = {
      prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
      completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: response.usageMetadata?.totalTokenCount || 0
    };

    // Feed cost tracker if attached to session
    if (session._costTracker) {
      session._costTracker.addUsage(session.modelName, usage);
    }

    console.log(`[Session] Response in ${duration}ms (tokens: ${usage.total_tokens})`);
    
    return {
      content: toolCalls ? null : textParts.join(''),
      toolCalls,
      finishReason: candidate?.finishReason === 'MAX_TOKENS' ? 'max_tokens' :
                    candidate?.finishReason === 'STOP' ? 'stop' :
                    functionCallParts.length > 0 ? 'tool_calls' : 'stop',
      usage,
      raw: response
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Session] Error after ${duration}ms:`, error.message);
    
    // Check for quota errors (429)
    if (error.status === 429 || error.message?.includes('429') || error.message?.includes('quota')) {
      error.isQuotaError = true;
    }
    
    throw error;
  }
}

/**
 * Retry wrapper for sendToSession with exponential backoff
 * @param {Object} session - Gemini session
 * @param {string|Array} message - Message to send
 * @param {Object} options - Options for sendToSession
 * @param {number} maxRetries - Max retry attempts (default 3)
 * @returns {Object} - Response from sendToSession
 */
export async function sendToSessionWithRetry(session, message, options = {}, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await sendToSession(session, message, options);
    } catch (error) {
      lastError = error;

      // Don't retry quota errors - they need manual intervention or fallback
      if (error.isQuotaError) {
        throw error;
      }

      // Retry on server errors (500, 503), blocked responses, malformed function calls, AND network failures
      // MALFORMED_FUNCTION_CALL: Model generated invalid function call JSON - transient, retry usually succeeds
      // Network failures include: fetch failed, ECONNRESET, ETIMEDOUT, ENOTFOUND, socket hang up
      const errorMsg = error.message?.toLowerCase() || '';
      const isRetryable =
        error.status >= 500 ||
        error.message?.includes('500') ||
        error.message?.includes('503') ||
        error.message?.includes('blocked') ||
        error.message?.includes('MALFORMED_FUNCTION_CALL') || // Explicit check for malformed function calls
        error.message?.includes('UNEXPECTED_TOOL_CALL') || // Model tried to call tools when not expected
        error.message?.includes('UNAVAILABLE') ||
        // Network-level failures (transient, should be retried)
        errorMsg.includes('fetch failed') ||
        errorMsg.includes('econnreset') ||
        errorMsg.includes('etimedout') ||
        errorMsg.includes('enotfound') ||
        errorMsg.includes('socket hang up') ||
        errorMsg.includes('network') ||
        errorMsg.includes('connection') ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'UND_ERR_CONNECT_TIMEOUT';

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff: 2s, 5s, 15s
      const backoffDelays = [2000, 5000, 15000];
      const delay = backoffDelays[attempt - 1] || 60000;
      console.log(`[Session] ⚠️ Retryable error (attempt ${attempt}/${maxRetries}): ${error.message?.slice(0, 80)}...`);
      console.log(`[Session] 🔄 Waiting ${delay/1000}s before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

