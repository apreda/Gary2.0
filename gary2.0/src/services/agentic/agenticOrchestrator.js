/**
 * Agentic Orchestrator
 * 
 * This is the main agent loop that runs Gary.
 * Uses Function Calling (Tools) to let Gary request specific stats.
 * Supports both OpenAI (GPT-5.1) and Gemini (Gemini 3 Deep Think) providers.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { toolDefinitions, formatTokenMenu, getTokensForSport } from './tools/toolDefinitions.js';
import { fetchStats } from './tools/statRouter.js';
import { getConstitution } from './constitution/index.js';
import { getSteelManGradingReference } from './constitution/sharpReferenceLoader.js';
import { buildScoutReport } from './scoutReport/scoutReportBuilder.js';
import { ballDontLieService } from '../ballDontLieService.js';

// Lazy-initialize Gemini client
let gemini = null;
function getGemini() {
  if (!gemini) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    gemini = new GoogleGenerativeAI(apiKey, "v1beta");
  }
  return gemini;
}

// ═══════════════════════════════════════════════════════════════════════════
// GEMINI MODEL POLICY (2026 AGENTIC OPTIMIZATION)
// ═══════════════════════════════════════════════════════════════════════════
// ONLY Gemini 3 models are allowed. NEVER use Gemini 1.x or 2.x.
//
// 2026 Update: Flash OUTPERFORMS Pro for agentic tasks (78% vs 76.2% benchmark)
// ═══════════════════════════════════════════════════════════════════════════
// GEMINI 3 MODEL STRATEGY (2026 - Persistent Sessions + Thought Signatures)
// ═══════════════════════════════════════════════════════════════════════════
// FLASH: Investigation + Steel Man building (Pass 1-2)
//   - Better at tool calling and data gathering
//   - Faster response times
//   - Used for ALL sports during investigation phase
//
// PRO: Grading + Final Decision (Pass 2.5-3) for NBA, NFL, NHL only
//   - Deep reasoning with thinking_level: 'high'
//   - Better at complex judgment and case evaluation
//   - NCAAB stays on Flash (high volume)
//
// IMPORTANT: Thought signatures are model-specific!
//   - Cannot pass Flash signatures to Pro (causes 400 error)
//   - When switching models, pass only textual summary
// ═══════════════════════════════════════════════════════════════════════════
const ALLOWED_GEMINI_MODELS = [
  'gemini-3-flash-preview',  // Investigation + Steel Man (all sports)
  'gemini-3-pro-preview',    // Grading + Final Decision (NBA, NFL, NHL)
];

function validateGeminiModel(model) {
  if (!ALLOWED_GEMINI_MODELS.includes(model)) {
    console.error(`[MODEL POLICY VIOLATION] Attempted to use "${model}" - not in allowed list!`);
    console.error(`[MODEL POLICY] Allowed models: ${ALLOWED_GEMINI_MODELS.join(', ')}`);
    // Fall back to Flash rather than crash
    return 'gemini-3-flash-preview';
  }
  return model;
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL SELECTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine if a sport should use Pro for grading/final decision phases
 * @param {string} sport - Sport identifier
 * @returns {boolean} - True if sport uses Pro for Pass 2.5+
 */
function sportUsesPro(sport) {
  const proSports = [
    'basketball_nba', 'NBA',
    'americanfootball_nfl', 'NFL', 
    'icehockey_nhl', 'NHL'
  ];
  return proSports.includes(sport);
}

/**
 * Get the appropriate model for a given phase and sport
 * @param {string} sport - Sport identifier
 * @param {string} phase - 'scout_report', 'investigation', 'steel_man', 'conviction_rating', 'final_decision'
 * @returns {string} - Model name to use
 */
function getModelForPhase(sport, phase) {
  // NCAAB/NCAAF always uses Flash (high volume, no Pro needed)
  if (!sportUsesPro(sport)) {
    return 'gemini-3-flash-preview';
  }

  // NBA (Jan 29, 2026): Flash for scout report ONLY, Pro for everything else
  // Pro has better deep think reasoning for stats interpretation and decisions
  const isNBA = sport === 'basketball_nba' || sport === 'NBA';
  if (isNBA) {
    // Scout report building uses Flash (fast, grounding-focused)
    if (phase === 'scout_report') {
      return 'gemini-3-flash-preview';
    }
    // Everything else uses Pro (investigation, steel_man, conviction, final)
    return 'gemini-3-pro-preview';
  }

  // NFL, NHL: Use Pro for grading and final decision only
  const proPhases = ['conviction_rating', 'final_decision'];
  if (proPhases.includes(phase)) {
    return 'gemini-3-pro-preview';
  }

  // Investigation and Steel Man phases use Flash for NFL/NHL
  return 'gemini-3-flash-preview';
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER AND MODEL ROUTING
// ═══════════════════════════════════════════════════════════════════════════

function getProviderForSport(sport) {
  return 'gemini';
}

/**
 * Get the default model for a provider (used for initial session)
 * Phase-specific model switching happens in runAgentLoop
 */
function getModelForProvider(provider, sport = null) {
  if (provider === 'openai') {
    return process.env.OPENAI_MODEL || 'gpt-5.1';
  }
  
  // Default to Flash for initial session (investigation phase)
  // Pro is used later for grading/decision phases (NBA/NFL/NHL only)
  return validateGeminiModel('gemini-3-flash-preview');
}

// Base configuration - provider/model set dynamically per sport
const CONFIG = {
  maxIterations: 15, // Allow more reasoning passes for thorough investigation and verification
  maxTokens: 24000, // Increased to prevent truncation of detailed responses and Deep Think thoughts
  // Gemini 3 Flash/Pro settings
  gemini: {
    // ═══════════════════════════════════════════════════════════════════════════
    // GEMINI 3 BEST PRACTICES (Updated per Google documentation)
    // ═══════════════════════════════════════════════════════════════════════════
    // Temperature: Google STRONGLY recommends 1.0 for Gemini 3
    // "Changing the temperature (setting it below 1.0) may lead to unexpected 
    // behavior, such as looping or degraded performance, particularly in 
    // complex mathematical or reasoning tasks."
    // ═══════════════════════════════════════════════════════════════════════════
    temperature: 1.0, // DO NOT CHANGE - Google's recommended default for Gemini 3
    topP: 0.95, // Google recommended for Gemini 3 (0.95 standard)
    
    // Per-MODEL thinking level (Jan 29, 2026)
    // Flash: 'medium' - balanced speed/reasoning for scout reports and tool calling
    // Pro: 'high' - deep reasoning for steel man, conviction, and final decisions
    // This is MODEL-specific, not pass-specific - Pro always needs deep thinking
    thinkingLevelByModel: {
      flash: 'medium',   // Flash: balanced speed with reasonable reasoning
      pro: 'high'        // Pro: maximum reasoning depth for decisions
    },

    // Legacy per-pass config (kept for backwards compatibility)
    thinkingLevelByPass: {
      investigation: 'medium',   // Investigation uses Flash - medium is fine
      steel_man: 'high',         // Steel man uses Pro - needs deep reasoning
      conviction_rating: 'high', // Conviction uses Pro - needs deep reasoning
      final_decision: 'high',    // Final decision uses Pro - needs deep reasoning
      default: 'high'            // Default to high for complex analysis
    },
    
    // Grounding with Google Search - enables live context searches
    grounding: {
      enabled: true,
      dynamicThreshold: 0.3, // Aggressive - search frequently for live data
      mode: 'MODE_DYNAMIC'   // Only search when model is unsure
    }
  },
  // OpenAI/GPT-5.1 settings
  openai: {
    reasoning: { effort: 'high' },
    text: { verbosity: 'high' }
  }
};

// Gemini safety settings - BLOCK_NONE for sports content (allows sports slang)
const GEMINI_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

console.log(`[Orchestrator] All sports using Gemini 3 Deep Think with Google Search Grounding`);

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
function createGeminiSession(options = {}) {
  const {
    modelName = 'gemini-3-flash-preview',
    systemPrompt = '',
    tools = [],
    thinkingLevel = 'high'
  } = options;
  
  const genAI = getGemini();
  const validatedModel = validateGeminiModel(modelName);
  
  // Convert OpenAI-format tools to Gemini function declarations
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
      maxOutputTokens: CONFIG.maxTokens,
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
    thinkingLevel
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
async function sendToSession(session, message, options = {}) {
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
    
    // Extract function calls and text
    const functionCallParts = parts.filter(p => p.functionCall);
    const textParts = parts.filter(p => p.text).map(p => p.text);
    
    // Build tool_calls array (OpenAI-compatible format for downstream compatibility)
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
    
    console.log(`[Session] Response in ${duration}ms (tokens: ${usage.total_tokens})`);
    
    return {
      content: toolCalls ? null : textParts.join(''),
      toolCalls,
      finishReason: candidate?.finishReason === 'STOP' ? 'stop' : 
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
async function sendToSessionWithRetry(session, message, options = {}, maxRetries = 3) {
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
      
      // Exponential backoff: 3s, 6s, 12s (increased for network issues)
      const delay = Math.pow(2, attempt) * 1500;
      console.log(`[Session] ⚠️ Retryable error (attempt ${attempt}/${maxRetries}): ${error.message?.slice(0, 80)}...`);
      console.log(`[Session] 🔄 Waiting ${delay/1000}s before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Extract FULL context from a session for model switching
 * Pro needs ALL the data Flash gathered to verify Steel Man claims
 *
 * @param {Array} messages - OpenAI-format message history
 * @param {Object} steelManCases - Captured steel man cases
 * @param {Array} toolCallHistory - Full history of tool calls and results
 * @returns {string} - Complete context for Pro model
 */
function extractTextualSummaryForModelSwitch(messages, steelManCases, toolCallHistory = []) {
  let summary = '';

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: Full Scout Report Data
  // ═══════════════════════════════════════════════════════════════════════════
  const scoutReportMsg = messages.find(m => m.role === 'user' && m.content?.includes('SCOUT REPORT'));
  if (scoutReportMsg) {
    // Pass the FULL scout report, not just filtered lines
    // This includes injuries, standings, H2H, lineups, etc.
    summary += '## SCOUT REPORT (Full Context)\n';
    summary += scoutReportMsg.content.substring(0, 15000) + '\n\n'; // Allow up to 15k chars
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: FULL Investigation Stats (NOT truncated)
  // ═══════════════════════════════════════════════════════════════════════════
  if (toolCallHistory && toolCallHistory.length > 0) {
    summary += '## ALL STATS FROM INVESTIGATION (Full Data)\n\n';
    summary += 'Flash investigated the following stats. Review these to verify Steel Man claims:\n\n';

    // Group by stat type for readability
    const statsByType = {};
    for (const call of toolCallHistory) {
      const statType = call.name || call.type || 'unknown';
      if (!statsByType[statType]) {
        statsByType[statType] = [];
      }

      // Pass FULL result - no truncation!
      const resultStr = typeof call.result === 'string'
        ? call.result
        : JSON.stringify(call.result, null, 2);

      statsByType[statType].push({
        team: call.team || 'General',
        data: resultStr // FULL data, not truncated
      });
    }

    // Format each stat type
    for (const [statType, calls] of Object.entries(statsByType)) {
      summary += `### ${statType.replace(/_/g, ' ').toUpperCase()}\n`;
      for (const call of calls) {
        summary += `**${call.team}:**\n${call.data}\n\n`;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: Steel Man Cases (written by Flash)
  // ═══════════════════════════════════════════════════════════════════════════
  if (steelManCases?.homeTeamCase || steelManCases?.awayTeamCase) {
    summary += '## STEEL MAN CASES (Written by Flash - VERIFY against stats above)\n\n';
    summary += 'These cases were written based on the stats above. Your job is to:\n';
    summary += '1. VERIFY the claims against the actual stat data\n';
    summary += '2. INVESTIGATE anything that seems uncertain\n';
    summary += '3. Make your decision based on what the DATA supports\n\n';

    if (steelManCases.homeTeamCase) {
      summary += steelManCases.homeTeamCase + '\n\n';
    }
    if (steelManCases.awayTeamCase) {
      summary += steelManCases.awayTeamCase + '\n\n';
    }
  }

  return summary;
}

/**
 * Build a textual summary from tool call history for model context
 * Used when switching models to pass investigated stats to the new session
 * @param {Array} toolCalls - Array of tool call results
 * @returns {string} - Summary of key stats gathered
 */
function buildTextualSummary(toolCalls) {
  if (!toolCalls || toolCalls.length === 0) {
    return '## INVESTIGATION SUMMARY\nNo stats gathered yet.';
  }

  let summary = '## STATS GATHERED FROM INVESTIGATION\n\n';

  // Group by stat type
  const statsByType = {};
  for (const call of toolCalls) {
    const statType = call.name || call.type || 'unknown';
    if (!statsByType[statType]) {
      statsByType[statType] = [];
    }

    // Extract FULL data from the result (no truncation)
    const resultStr = typeof call.result === 'string'
      ? call.result
      : JSON.stringify(call.result, null, 2);

    statsByType[statType].push({
      team: call.team || 'General',
      data: resultStr // FULL data - Gary needs complete context
    });
  }

  // Format each stat type
  for (const [statType, calls] of Object.entries(statsByType)) {
    summary += `### ${statType.replace(/_/g, ' ').toUpperCase()}\n`;
    for (const call of calls) {
      summary += `**${call.team}:**\n${call.data}\n\n`;
    }
  }

  return summary;
}

// ═══════════════════════════════════════════════════════════════════════════
// INVESTIGATION FACTORS - Gary must investigate ALL factors before deciding
// ═══════════════════════════════════════════════════════════════════════════
// Each sport has a checklist of factors. Gary works through each one,
// then moves to Steel Man, then final decision. No arbitrary stat counts.
// ═══════════════════════════════════════════════════════════════════════════

const INVESTIGATION_FACTORS = {
  // NFL: 18 required factors (comprehensive)
  americanfootball_nfl: {
    EFFICIENCY: ['OFFENSIVE_EPA', 'DEFENSIVE_EPA', 'PASSING_EPA', 'RUSHING_EPA', 'SUCCESS_RATE_OFFENSE', 'SUCCESS_RATE_DEFENSE'],
    DOWN_EFFICIENCY: ['EARLY_DOWN_SUCCESS', 'LATE_DOWN_EFFICIENCY'], // Critical for drives
    TRENCHES: ['OL_RANKINGS', 'DL_RANKINGS', 'PRESSURE_RATE', 'TIME_TO_THROW'],
    QB_SITUATION: ['QB_STATS', 'PLAYER_GAME_LOGS'], // QB performance and game logs
    SKILL_PLAYERS: ['RB_STATS', 'WR_TE_STATS', 'DEFENSIVE_PLAYMAKERS'], // Key playmakers
    TURNOVERS: ['TURNOVER_MARGIN', 'TURNOVER_LUCK', 'FUMBLE_LUCK'],
    RED_ZONE: ['RED_ZONE_OFFENSE', 'RED_ZONE_DEFENSE', 'GOAL_LINE'],
    EXPLOSIVE_PLAYS: ['EXPLOSIVE_PLAYS', 'EXPLOSIVE_ALLOWED'],
    SPECIAL_TEAMS: ['SPECIAL_TEAMS', 'KICKING', 'FIELD_POSITION'],
    RECENT_FORM: ['RECENT_FORM', 'EPA_LAST_5'],
    INJURIES: ['INJURIES'], // From scout report + player logs
    SCHEDULE: ['REST_SITUATION', 'HOME_AWAY_SPLITS', 'SCHEDULE_CONTEXT'],
    STANDINGS_CONTEXT: ['STANDINGS', 'DIVISION_RECORD'], // Playoff picture, standings
    H2H_DIVISION: ['H2H_HISTORY'],
    MOTIVATION: ['PRIMETIME_RECORD'], // SNF/MNF/TNF performance
    COACHING: ['FOURTH_DOWN_TENDENCY', 'TWO_MINUTE_DRILL'],
    SCORING_TRENDS: ['QUARTER_SCORING', 'FIRST_HALF_TRENDS', 'SECOND_HALF_TRENDS'],
    VARIANCE_CONSISTENCY: ['VARIANCE_CONSISTENCY'] // Point differential variance, upset potential
  },
  
  // NBA: 16 required factors (comprehensive)
  basketball_nba: {
    EFFICIENCY: ['NET_RATING', 'OFFENSIVE_RATING', 'DEFENSIVE_RATING'],
    PACE_TEMPO: ['PACE', 'PACE_LAST_10', 'PACE_HOME_AWAY'],
    FOUR_FACTORS_OFFENSE: ['EFG_PCT', 'TURNOVER_RATE', 'OREB_RATE', 'FT_RATE'],
    FOUR_FACTORS_DEFENSE: ['OPP_EFG_PCT', 'OPP_TOV_RATE', 'OPP_FT_RATE', 'DREB_RATE'],
    SHOOTING_ZONES: ['THREE_PT_SHOOTING', 'PAINT_SCORING', 'MIDRANGE', 'THREE_PT_DEFENSE', 'PAINT_DEFENSE', 'TRANSITION_DEFENSE'],
    STANDINGS_CONTEXT: ['STANDINGS', 'CONFERENCE_STANDING'], // Playoff picture
    CONFERENCE_SPLITS: ['CONFERENCE_STATS', 'NON_CONF_STRENGTH'], // Conference vs non-conference
    RECENT_FORM: ['RECENT_FORM', 'EFFICIENCY_TREND'],
    PLAYER_PERFORMANCE: ['PLAYER_GAME_LOGS', 'TOP_PLAYERS', 'USAGE_RATES', 'MINUTES_TREND'],
    INJURIES: ['INJURIES', 'LINEUP_NET_RATINGS'],
    SCHEDULE: ['REST_SITUATION', 'BACK_TO_BACK', 'TRAVEL_SITUATION', 'SCHEDULE_STRENGTH'],
    // HOME_AWAY removed - records are descriptive (explain line), not predictive. Gary can investigate efficiency splits if needed.
    H2H: ['H2H_HISTORY', 'VS_ELITE_TEAMS'],
    ROSTER_CONTEXT: ['BENCH_DEPTH', 'CLUTCH_STATS', 'BLOWOUT_TENDENCY'],
    LUCK_CLOSE_GAMES: ['LUCK_ADJUSTED', 'CLOSE_GAME_RECORD'], // Regression and clutch
    SCORING_TRENDS: ['QUARTER_SCORING', 'FIRST_HALF_SCORING', 'SECOND_HALF_SCORING'] // Game flow
  },
  
  // NHL: 17 required factors (comprehensive - matches NBA/NFL coverage)
  icehockey_nhl: {
    POSSESSION: ['CORSI_FOR_PCT', 'EXPECTED_GOALS', 'SHOT_DIFFERENTIAL', 'HIGH_DANGER_CHANCES', 'SHOT_QUALITY'],
    SHOT_VOLUME: ['SHOTS_FOR', 'SHOTS_AGAINST', 'SHOT_METRICS'], // Raw shot data
    SPECIAL_TEAMS: ['POWER_PLAY_PCT', 'PENALTY_KILL_PCT', 'SPECIAL_TEAMS', 'PP_OPPORTUNITIES'],
    GOALTENDING: ['GOALIE_STATS', 'SAVE_PCT', 'GOALS_AGAINST_AVG', 'GOALIE_MATCHUP'],
    SCORING: ['GOALS_FOR', 'GOALS_AGAINST', 'GOAL_DIFFERENTIAL', 'SCORING_FIRST'],
    LUCK_REGRESSION: ['PDO', 'LUCK_INDICATORS', 'SHOOTING_REGRESSION'], // Regression indicators + shooting % regression
    CLOSE_GAMES: ['CLOSE_GAME_RECORD', 'OVERTIME_RECORD', 'ONE_GOAL_GAMES'], // Clutch performance
    RECENT_FORM: ['RECENT_FORM', 'PLAYER_GAME_LOGS'],
    PLAYER_PERFORMANCE: ['TOP_SCORERS', 'TOP_PLAYERS', 'LINE_COMBINATIONS', 'HOT_PLAYERS'],
    INJURIES: ['INJURIES'],
    SCHEDULE: ['REST_SITUATION', 'BACK_TO_BACK'],
    HOME_AWAY: ['HOME_AWAY_SPLITS', 'HOME_ICE', 'ROAD_PERFORMANCE'],
    H2H_DIVISION: ['H2H_HISTORY', 'DIVISION_STANDING', 'FACEOFF_PCT', 'POSSESSION_METRICS'],
    // NEW FACTORS (from BDL NHL API)
    STANDINGS_CONTEXT: ['STANDINGS', 'POINTS_PCT', 'STREAK', 'PLAYOFF_POSITION'], // Playoff picture
    SCORING_TRENDS: ['PERIOD_SCORING', 'FIRST_PERIOD_TRENDS', 'THIRD_PERIOD_TRENDS'], // Period-by-period patterns
    ROSTER_DEPTH: ['DEPTH_SCORING', 'TOP_SIX_PRODUCTION', 'FOURTH_LINE_IMPACT'], // Depth analysis from TOI
    VARIANCE_CONSISTENCY: ['REGULATION_WIN_PCT', 'OT_LOSS_RATE', 'MARGIN_VARIANCE'] // Consistency metrics
  },
  
  // NCAAB: 12 required factors (comprehensive)
  // NOTE: BDL has limited NCAAB data - advanced stats (KenPom, NET) come from Gemini grounding
  basketball_ncaab: {
    KENPOM_EFFICIENCY: ['NCAAB_KENPOM_RATINGS', 'NCAAB_OFFENSIVE_RATING'], // Gold standard
    RANKINGS: ['NCAAB_NET_RANKING', 'NCAAB_AP_RANKING', 'NCAAB_COACHES_RANKING'],
    FOUR_FACTORS: ['NCAAB_EFG_PCT', 'TURNOVER_RATE', 'OREB_RATE', 'FT_RATE'],
    SCORING_SHOOTING: ['SCORING', 'FG_PCT', 'THREE_PT_SHOOTING', 'THREE_PT_DEFENSE'], // Shooting offense AND defense
    DEFENSIVE_STATS: ['REBOUNDS', 'STEALS', 'BLOCKS'], // Defensive/rebounding metrics
    TEMPO: ['NCAAB_TEMPO', 'PACE'],
    SCHEDULE_QUALITY: ['NCAAB_STRENGTH_OF_SCHEDULE', 'NCAAB_QUAD_RECORD', 'NCAAB_CONFERENCE_RECORD'],
    RECENT_FORM: ['RECENT_FORM', 'NCAAB_FIRST_HALF_TRENDS', 'NCAAB_SECOND_HALF_TRENDS'],
    INJURIES: ['INJURIES', 'TOP_PLAYERS'],
    HOME_AWAY: ['HOME_AWAY_SPLITS'],
    H2H: ['H2H_HISTORY'],
    ASSISTS_PLAYMAKING: ['ASSISTS'] // Ball movement and playmaking
  },
  
  // NCAAF: 16 required factors (comprehensive)
  // NOTE: BDL has limited NCAAF data - advanced stats (SP+, FPI, EPA) come from Gemini grounding
  americanfootball_ncaaf: {
    ADVANCED_EFFICIENCY: ['NCAAF_SP_PLUS_RATINGS', 'NCAAF_FPI_RATINGS', 'NCAAF_EPA'],
    SUCCESS_RATE: ['NCAAF_SUCCESS_RATE'],
    TALENT: ['TALENT_COMPOSITE', 'BLUE_CHIP_RATIO'], // Recruiting/talent advantage
    TRENCHES: ['NCAAF_PASS_EFFICIENCY', 'NCAAF_RUSH_EFFICIENCY', 'OL_RANKINGS', 'DL_RANKINGS', 'PRESSURE_RATE'],
    OFFENSE: ['NCAAF_PASSING_OFFENSE', 'NCAAF_RUSHING_OFFENSE', 'NCAAF_TOTAL_OFFENSE'],
    DEFENSE: ['NCAAF_DEFENSE'],
    QB_SITUATION: ['QB_STATS', 'TOP_PLAYERS', 'PLAYER_GAME_LOGS'],
    HAVOC: ['NCAAF_HAVOC', 'NCAAF_TURNOVER_MARGIN', 'TURNOVER_LUCK'],
    EXPLOSIVE_PLAYS: ['NCAAF_EXPLOSIVE_PLAYS'],
    RED_ZONE: ['NCAAF_REDZONE'],
    RECENT_FORM: ['RECENT_FORM', 'SCORING'],
    CLOSE_GAMES: ['CLOSE_GAME_RECORD'], // Clutch performance
    INJURIES: ['INJURIES', 'TOP_PLAYERS'], // Critical for opt-outs
    HOME_FIELD: ['HOME_AWAY_SPLITS', 'HOME_FIELD'],
    MOTIVATION: ['MOTIVATION_CONTEXT'], // Bowl game, rivalry, playoff implications
    SCHEDULE_QUALITY: ['NCAAF_STRENGTH_OF_SCHEDULE', 'NCAAF_CONFERENCE_STRENGTH', 'NCAAF_VS_POWER_OPPONENTS']
  }
};

/**
 * Get investigated factors based on tokens called
 * @param {Array} toolCallHistory - Array of tool calls with token property
 * @param {string} sport - Sport key
 * @param {Array} preloadedFactors - Factors already covered by scout report (e.g., INJURIES)
 * @returns {Object} - { covered: [...], missing: [...], coverage: 0.0-1.0 }
 */
function getInvestigatedFactors(toolCallHistory, sport, preloadedFactors = []) {
  const factors = INVESTIGATION_FACTORS[sport];
  if (!factors) {
    // Unknown sport - use count-based fallback (100% coverage to not block)
    return { covered: [], missing: [], coverage: 1.0, totalFactors: 0, useFallback: true };
  }
  
  // Get all unique tokens called (store full token strings)
  const calledTokens = toolCallHistory.map(t => t.token).filter(Boolean);
  
  // Convert preloadedFactors to a Set for fast lookup
  const preloaded = new Set(preloadedFactors);
  
  const covered = [];
  const missing = [];
  
  for (const [factorName, requiredTokens] of Object.entries(factors)) {
    // Factor is covered if:
    // 1. It's in preloadedFactors (e.g., INJURIES from scout report), OR
    // 2. ANY of its required tokens were called (using PREFIX matching for player-specific tokens)
    //    e.g., PLAYER_GAME_LOGS:Donovan Mitchell matches PLAYER_GAME_LOGS
    const isPreloaded = preloaded.has(factorName);
    const isCalled = requiredTokens.some(token => 
      calledTokens.some(called => 
        called === token || called.startsWith(token + ':') || called.startsWith(token + '_')
      )
    );
    
    if (isPreloaded || isCalled) {
      covered.push(factorName);
    } else {
      missing.push(factorName);
    }
  }
  
  const totalFactors = Object.keys(factors).length;
  const coverage = covered.length / totalFactors;
  
  return { covered, missing, coverage, totalFactors };
}

/**
 * Build factor checklist prompt for a sport
 * @param {string} sport - Sport key
 * @returns {string} - Checklist prompt
 */
function buildFactorChecklist(sport) {
  const factors = INVESTIGATION_FACTORS[sport];
  if (!factors) return '';
  
  const sportName = sport.includes('nfl') ? 'NFL' : 
                    sport.includes('nba') ? 'NBA' :
                    sport.includes('nhl') ? 'NHL' :
                    sport.includes('ncaab') ? 'NCAAB' :
                    sport.includes('ncaaf') ? 'NCAAF' : 'SPORT';
  
  let checklist = `\n## INVESTIGATION CHECKLIST (${sportName})\n`;
  checklist += `Work through EACH factor before making your decision:\n\n`;
  
  for (const [factorName, tokens] of Object.entries(factors)) {
    const displayName = factorName.replace(/_/g, ' ');
    checklist += `□ **${displayName}**: Call relevant stats (${tokens.slice(0, 3).join(', ')}${tokens.length > 3 ? '...' : ''})\n`;
    checklist += `   - Analyze both teams - Identify asymmetry - Note impact\n\n`;
  }
  
  checklist += `Once ALL factors investigated: Build Steel Man cases for BOTH sides, then Final decision\n`;
  
  return checklist;
}

// ═══════════════════════════════════════════════════════════════════════════
// STAT SUMMARIZATION (Signal-to-Noise Optimization)
// ═══════════════════════════════════════════════════════════════════════════
// Convert raw JSON stat responses to natural language summaries.
// This reduces context size by ~70% and helps the model REASON about
// basketball instead of PARSING JSON brackets.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Summarize a stat result into natural language for the model
 * @param {Object} statResult - Raw stat result from statRouter
 * @param {string} statToken - The stat token (e.g., 'NET_RATING', 'RECENT_FORM')
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {string} Natural language summary
 */
function summarizeStatForContext(statResult, statToken, homeTeam, awayTeam) {
  if (!statResult) return `${statToken}: No data available`;
  
  try {
    const { home, away, homeValue, awayValue } = statResult;
    const h = home || homeValue || {};
    const a = away || awayValue || {};
    
    // Handle different stat types with natural language
    switch (statToken) {
      case 'NET_RATING':
        return `NET RATING: ${awayTeam} ${formatNum(a.net_rating || a.netRating)} | ${homeTeam} ${formatNum(h.net_rating || h.netRating)} (higher is better)`;
      
      case 'OFFENSIVE_RATING':
        return `OFFENSIVE RATING: ${awayTeam} ${formatNum(a.off_rating || a.offRating)} | ${homeTeam} ${formatNum(h.off_rating || h.offRating)} (points per 100 possessions)`;
      
      case 'DEFENSIVE_RATING':
        return `DEFENSIVE RATING: ${awayTeam} ${formatNum(a.def_rating || a.defRating)} | ${homeTeam} ${formatNum(h.def_rating || h.defRating)} (lower is better)`;
      
      case 'RECENT_FORM':
        const awayForm = a.summary || a.last_5 || 'N/A';
        const homeForm = h.summary || h.last_5 || 'N/A';
        return `RECENT FORM (Last 5): ${awayTeam} ${awayForm} | ${homeTeam} ${homeForm}`;
      
      case 'HOME_AWAY_SPLITS':
        // Records are TIER 3 - Gary can use them to understand the line, then check if efficiency supports it
        return `HOME/AWAY SPLITS: ${awayTeam} road ${a.away_record || a.record || 'N/A'} | ${homeTeam} home ${h.home_record || h.record || 'N/A'} [TIER 3 - Use to understand line, then check efficiency]`;
      
      case 'PACE':
        return `PACE: ${awayTeam} ${formatNum(a.pace)} | ${homeTeam} ${formatNum(h.pace)} possessions/game`;
      
      case 'EFG_PCT':
        return `EFFECTIVE FG%: ${awayTeam} ${formatPct(a.efg_pct || a.eFG)} | ${homeTeam} ${formatPct(h.efg_pct || h.eFG)}`;
      
      case 'TURNOVER_RATE':
        return `TURNOVER RATE: ${awayTeam} ${formatPct(a.tov_rate || a.tovRate)} | ${homeTeam} ${formatPct(h.tov_rate || h.tovRate)} (lower is better)`;
      
      case 'OREB_RATE':
        return `OFFENSIVE REBOUND RATE: ${awayTeam} ${formatPct(a.oreb_rate || a.orebRate)} | ${homeTeam} ${formatPct(h.oreb_rate || h.orebRate)}`;
      
      case 'THREE_PT_SHOOTING':
        return `3PT SHOOTING: ${awayTeam} ${formatPct(a.fg3_pct || a.threePct)} on ${formatNum(a.fg3a || a.threeAttempts)} attempts | ${homeTeam} ${formatPct(h.fg3_pct || h.threePct)} on ${formatNum(h.fg3a || h.threeAttempts)} attempts`;
      
      case 'PAINT_SCORING':
      case 'PAINT_DEFENSE':
        return `${statToken}: ${awayTeam} ${formatNum(a.paint_ppg || a.value)} PPG in paint | ${homeTeam} ${formatNum(h.paint_ppg || h.value)} PPG in paint`;
      
      case 'H2H_HISTORY':
        // Preserve FULL context: dates, scores, margins, revenge status, sweep context, PERSONNEL
        const h2hGames = statResult.meetings_this_season || statResult.games || statResult.h2h || [];
        if (h2hGames.length === 0) {
          return `H2H HISTORY: No matchups this season. ${statResult.IMPORTANT || 'Check Scout Report for prior season data.'}`;
        }
        // Include personnel notes (DNPs, top scorers) so Gary sees WHO PLAYED in each H2H game
        const h2hDetails = h2hGames.slice(0, 5).map(g => {
          const date = g.date || 'N/A';
          const result = g.result || g.score || 'N/A';
          const personnel = g.personnel_note && g.personnel_note !== '(Box score unavailable)' 
            ? ` [${g.personnel_note}]` 
            : '';
          return `${date}: ${result}${personnel}`;
        }).join(' | ');
        const seriesRecord = statResult.this_season_record || '';
        const revengeNote = statResult.revenge_note || '';
        
        // Include sweep context if detected (NBA-specific trap detection)
        const sweepContext = statResult.sweep_context;
        let sweepContextStr = '';
        if (sweepContext?.triggered) {
          const marginInfo = sweepContext.margin_context ? ` ${sweepContext.margin_context}` : '';
          sweepContextStr = ` | ${sweepContext.sweep_note}${marginInfo}`;
        }
        
        // Add CONDITIONS CHANGED context if detected
        const conditionsChanged = statResult.conditions_changed_context;
        let conditionsChangedStr = '';
        if (conditionsChanged?.triggered) {
          conditionsChangedStr = ` | ${conditionsChanged.note}`;
        }
        
        return `H2H HISTORY (${h2hGames.length} games this season): ${seriesRecord}. Meetings: ${h2hDetails}${revengeNote ? ` [REVENGE: ${revengeNote}]` : ''}${sweepContextStr}${conditionsChangedStr}`;
      
      case 'CLUTCH_STATS':
        return `CLUTCH RECORD (games within 5pts): ${awayTeam} ${a.record || a.clutch_record || 'N/A'} | ${homeTeam} ${h.record || h.clutch_record || 'N/A'}`;
      
      case 'BENCH_DEPTH':
        return `BENCH DEPTH: ${awayTeam} bench ${formatNum(a.bench_ppg || a.value)} PPG | ${homeTeam} bench ${formatNum(h.bench_ppg || h.value)} PPG`;
      
      case 'REST_SITUATION':
        return `REST: ${awayTeam} ${a.days_rest || 'N/A'} days rest | ${homeTeam} ${h.days_rest || 'N/A'} days rest`;
      
      case 'PLAYER_GAME_LOGS':
        // Preserve FULL game-by-game breakdown for Gary to interpret
        const player = statResult.player || statResult.playerName || 'Player';
        const logs = statResult.games || statResult.logs || [];
        if (logs.length === 0) return `${player} GAME LOGS: No recent games`;
        
        // Show individual game scores and context
        const gameByGame = logs.slice(0, 8).map(g => {
          const pts = g.pts || g.points || 0;
          const reb = g.reb || g.rebounds || g.total_rebounds || 0;
          const ast = g.ast || g.assists || 0;
          const opp = g.opponent || g.vs || g.matchup || '';
          const loc = g.isHome === false ? '@' : (g.isHome === true ? 'vs' : '');
          return `${pts}/${reb}/${ast}${opp ? ` ${loc}${opp}` : ''}`;
        }).join(', ');
        
        // Calculate averages
        const avgPts = logs.reduce((sum, g) => sum + (g.pts || g.points || 0), 0) / logs.length;
        const avgReb = logs.reduce((sum, g) => sum + (g.reb || g.rebounds || g.total_rebounds || 0), 0) / logs.length;
        const avgAst = logs.reduce((sum, g) => sum + (g.ast || g.assists || 0), 0) / logs.length;
        
        // Enhanced trend indicator (comparing last 2-3 vs prior games)
        let trend = '';
        let trendDetail = '';
        if (logs.length >= 4) {
          const recent2Avg = ((logs[0]?.pts || 0) + (logs[1]?.pts || 0)) / 2;
          const prior2Avg = ((logs[2]?.pts || 0) + (logs[3]?.pts || 0)) / 2;
          const diff = recent2Avg - prior2Avg;
          
          if (recent2Avg > prior2Avg * 1.15) {
            trend = 'HOT';
            trendDetail = `(last 2: ${recent2Avg.toFixed(1)} PPG vs prior: ${prior2Avg.toFixed(1)} PPG, +${diff.toFixed(1)})`;
          } else if (recent2Avg < prior2Avg * 0.85) {
            trend = 'COLD';
            trendDetail = `(last 2: ${recent2Avg.toFixed(1)} PPG vs prior: ${prior2Avg.toFixed(1)} PPG, ${diff.toFixed(1)})`;
          } else {
            trend = 'STABLE';
          }
        }
        
        // Check for recent spike or crash (single game outlier)
        let outlierNote = '';
        if (logs.length >= 3) {
          const lastGame = logs[0]?.pts || 0;
          const avg3 = logs.slice(1, 4).reduce((s, g) => s + (g?.pts || 0), 0) / 3;
          if (lastGame > avg3 * 1.4) outlierNote = ` [SPIKE: Last game ${lastGame} vs ${avg3.toFixed(0)} avg]`;
          else if (lastGame < avg3 * 0.6) outlierNote = ` [DUD: Last game ${lastGame} vs ${avg3.toFixed(0)} avg]`;
        }
        
        return `${player} GAME LOGS (Last ${logs.length}): Avg ${avgPts.toFixed(1)}/${avgReb.toFixed(1)}/${avgAst.toFixed(1)} (PTS/REB/AST) ${trend} ${trendDetail}${outlierNote}. Game-by-game: ${gameByGame}`;
      
      default:
        // For unknown/complex stats, preserve MORE fields (up to 8) for Gary to interpret
        const excludeKeys = ['home', 'away', 'homeValue', 'awayValue', 'category', 'note', 'IMPORTANT', 'error'];
        const topLevelKeys = Object.keys(statResult).filter(k => !excludeKeys.includes(k));
        
        if (topLevelKeys.length === 0) {
          // Try to extract from home/away structure
          const homeKeys = Object.keys(h).slice(0, 8);
          if (homeKeys.length > 0) {
            const summary = homeKeys.map(k => `${k}: ${awayTeam} ${formatNum(a[k])} | ${homeTeam} ${formatNum(h[k])}`).join('; ');
            return `${statToken}: ${summary}`;
          }
          return `${statToken}: Data received but empty`;
        }
        
        // Show up to 8 fields for complex stats
        const fieldSummaries = topLevelKeys.slice(0, 8).map(k => {
          const val = statResult[k];
          if (typeof val === 'object' && val !== null) {
            // Nested object - summarize its values
            const nestedKeys = Object.keys(val).slice(0, 3);
            return `${k}: {${nestedKeys.map(nk => `${nk}=${formatNum(val[nk])}`).join(', ')}}`;
          }
          return `${k}=${formatNum(val)}`;
        });
        
        // Include IMPORTANT note if present (for context warnings)
        const important = statResult.IMPORTANT ? ` [NOTE: ${statResult.IMPORTANT.slice(0, 100)}]` : '';
        return `${statToken}: ${fieldSummaries.join(', ')}${important}`;
    }
  } catch (e) {
    // Fallback: just indicate data was received
    return `${statToken}: Data received (${typeof statResult === 'object' ? Object.keys(statResult).length : 0} fields)`;
  }
}

// Helper formatters
function formatNum(val) {
  if (val === undefined || val === null) return 'N/A';
  if (typeof val === 'number') return val.toFixed(1);
  return String(val);
}

function formatPct(val) {
  if (val === undefined || val === null) return 'N/A';
  if (typeof val === 'number') {
    return val > 1 ? `${val.toFixed(1)}%` : `${(val * 100).toFixed(1)}%`;
  }
  return String(val);
}

/**
 * Summarize player game logs into natural language - preserving FULL game-by-game detail
 * @param {string} playerName - Player name
 * @param {Array|Object} logs - Game logs array or object
 * @returns {string} Natural language summary
 */
function summarizePlayerGameLogs(playerName, logs) {
  if (!logs || (Array.isArray(logs) && logs.length === 0)) {
    return `${playerName} GAME LOGS: No recent games found`;
  }
  
  const gamesArray = Array.isArray(logs) ? logs : (logs.games || logs.data || [logs]);
  if (gamesArray.length === 0) {
    return `${playerName} GAME LOGS: No recent games found`;
  }
  
  try {
    // Game-by-game breakdown with opponent context
    const gameByGame = gamesArray.slice(0, 8).map(g => {
      const pts = g.pts || g.points || 0;
      const reb = g.reb || g.rebounds || g.total_rebounds || 0;
      const ast = g.ast || g.assists || 0;
      const opp = g.opponent || g.vs || g.matchup || '';
      const loc = g.isHome === false ? '@' : (g.isHome === true ? 'vs' : '');
      return `${pts}/${reb}/${ast}${opp ? ` ${loc}${opp}` : ''}`;
    });
    
    // Calculate averages
    let totalPts = 0, totalReb = 0, totalAst = 0;
    for (const game of gamesArray.slice(0, 8)) {
      totalPts += game.pts || game.points || 0;
      totalReb += game.reb || game.rebounds || game.total_rebounds || 0;
      totalAst += game.ast || game.assists || 0;
    }
    const gamesCount = Math.min(gamesArray.length, 8);
    const avgPts = (totalPts / gamesCount).toFixed(1);
    const avgReb = (totalReb / gamesCount).toFixed(1);
    const avgAst = (totalAst / gamesCount).toFixed(1);
    
    // Trend indicator (factual)
    let trend = '';
    if (gamesArray.length >= 4) {
      const recent2 = (gamesArray[0]?.pts || 0) + (gamesArray[1]?.pts || 0);
      const prior2 = (gamesArray[2]?.pts || 0) + (gamesArray[3]?.pts || 0);
      if (recent2 > prior2 * 1.15) trend = '[HOT]';
      else if (recent2 < prior2 * 0.85) trend = '[COLD]';
    }
    
    return `${playerName} GAME LOGS (Last ${gamesCount}): Avg ${avgPts}/${avgReb}/${avgAst} (PTS/REB/AST) ${trend}. Games: ${gameByGame.join(', ')}`;
  } catch (e) {
    return `${playerName} GAME LOGS: Data available (${gamesArray.length} games)`;
  }
}

/**
 * Summarize player stats into natural language
 * @param {Object} statResult - Raw stat result
 * @param {string} statType - Type of stat (e.g., 'RUSHING', 'PASSING')
 * @param {string} teamName - Team name
 * @returns {string} Natural language summary
 */
function summarizePlayerStats(statResult, statType, teamName) {
  if (!statResult || !statResult.data || statResult.data.length === 0) {
    return `${teamName} ${statType} STATS: No data available`;
  }
  
  try {
    const players = statResult.data.slice(0, 5); // Top 5 players
    const summaries = players.map(p => {
      const name = p.player?.full_name || p.name || p.player_name || 'Unknown';
      // Extract key stats based on stat type
      const keyStats = [];
      
      if (statType.includes('RUSH') || statType.includes('rushing')) {
        if (p.rushing_yards) keyStats.push(`${p.rushing_yards} yds`);
        if (p.rushing_tds) keyStats.push(`${p.rushing_tds} TD`);
        if (p.yards_per_carry) keyStats.push(`${p.yards_per_carry} YPC`);
      } else if (statType.includes('PASS') || statType.includes('passing')) {
        if (p.passing_yards) keyStats.push(`${p.passing_yards} yds`);
        if (p.passing_tds) keyStats.push(`${p.passing_tds} TD`);
        if (p.interceptions) keyStats.push(`${p.interceptions} INT`);
      } else if (statType.includes('RECEIV') || statType.includes('receiving')) {
        if (p.receiving_yards) keyStats.push(`${p.receiving_yards} yds`);
        if (p.receptions) keyStats.push(`${p.receptions} rec`);
        if (p.receiving_tds) keyStats.push(`${p.receiving_tds} TD`);
      } else {
        // Generic: just grab first few numeric values
        const numericKeys = Object.keys(p).filter(k => typeof p[k] === 'number' && !k.includes('id'));
        for (const k of numericKeys.slice(0, 3)) {
          keyStats.push(`${k}: ${p[k]}`);
        }
      }
      
      return `${name}: ${keyStats.join(', ') || 'stats available'}`;
    });
    
    return `${teamName} ${statType} (Top ${players.length}): ${summaries.join(' | ')}`;
  } catch (e) {
    return `${teamName} ${statType} STATS: Data available (${statResult.data?.length || 0} players)`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT PRUNING (Attention Decay Prevention)
// ═══════════════════════════════════════════════════════════════════════════
// After iteration 5, prune old stat responses to keep context under 40k tokens.
// This prevents "blanking" where the model loses the thread due to context rot.
// ═══════════════════════════════════════════════════════════════════════════

const MAX_CONTEXT_MESSAGES = 20; // Keep last 20 messages max during analysis (reduced from 25 to prevent token overflow)
const PRUNE_AFTER_ITERATION = 4; // Start pruning earlier (iteration 4 instead of 5)

/**
 * Prune message history to prevent context bloat
 * @param {Array} messages - Current message array
 * @param {number} iteration - Current iteration number
 * @returns {Array} Pruned message array
 */
function pruneContextIfNeeded(messages, iteration) {
  if (iteration < PRUNE_AFTER_ITERATION || messages.length <= MAX_CONTEXT_MESSAGES) {
    return messages; // No pruning needed
  }
  
  console.log(`[Orchestrator] 🧹 Pruning context: ${messages.length} messages → ${MAX_CONTEXT_MESSAGES} (iteration ${iteration})`);
  
  // Always keep: system prompt (index 0) and user's initial query (index 1)
  const systemPrompt = messages[0];
  const initialQuery = messages[1];
  
  // Keep the most recent messages (where the good reasoning is)
  const recentMessages = messages.slice(-(MAX_CONTEXT_MESSAGES - 2));
  
  return [systemPrompt, initialQuery, ...recentMessages];
}

// ═══════════════════════════════════════════════════════════════════════════
// SLATE SESSION MANAGEMENT (TRUE MEMORY SYSTEM)
// ═══════════════════════════════════════════════════════════════════════════
// Gary maintains genuine memory across all games in a slate by keeping a
// shared message history. This enables organic ranking based on conviction
// rather than re-reading summaries.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a slate session that persists across games
 * @param {string} sport - The sport being analyzed
 * @param {string} systemPrompt - The system prompt (constitution + guidelines)
 * @returns {Object} Session object with shared message history
 */
export function createSlateSession(sport, systemPrompt) {
  console.log(`[SlateSession] Creating new session for ${sport}`);
  return {
    sport,
    systemPrompt,
    messages: [{ role: 'system', content: systemPrompt }],
    picks: [],           // Stores all pick results
    gamesAnalyzed: 0,    // Counter for games that returned picks
    gamesAttempted: 0,   // Counter for ALL games attempted (success or fail) - used for context clearing
    toolCallHistory: [], // Accumulated tool calls across all games
    createdAt: new Date().toISOString()
  };
}

/**
 * Build a transition message when moving to a new game in the same session
 * Provides Gary with context about previous games analyzed
 * @param {Object} slateSession - The current slate session
 * @param {string} homeTeam - Home team for the new game
 * @param {string} awayTeam - Away team for the new game
 * @returns {string|null} Transition message or null if first game
 */
function buildGameTransitionMessage(slateSession, homeTeam, awayTeam) {
  if (slateSession.picks.length === 0) return null;
  
  // For large slates, use compressed summary of older games + full list of recent
  const keepFullCount = 3;
  let previousPicksSummary;
  
  if (slateSession.compressedOlderGames && slateSession.gamesAnalyzed > keepFullCount) {
    // Large slate: show compressed older games + recent games in full
    const recentPicks = slateSession.picks.slice(-keepFullCount).map((p, i) => {
      const gameNum = slateSession.gamesAnalyzed - keepFullCount + i + 1;
      return `  ${gameNum}. ${p.pick || 'PASS'}`;
    }).join('\n');
    
    previousPicksSummary = `[Earlier games summarized for context window management]\n${slateSession.compressedOlderGames}\n\n[Recent games - full memory retained]\n${recentPicks}`;
  } else {
    // Small slate: show all picks
    previousPicksSummary = slateSession.picks.map((p, i) => {
      return `  ${i + 1}. ${p.pick || 'PASS'}`;
    }).join('\n');
  }
  
  return `
═══════════════════════════════════════════════════════════════════════════
GAME ${slateSession.gamesAnalyzed + 1} - ${awayTeam} @ ${homeTeam}
═══════════════════════════════════════════════════════════════════════════

You've analyzed ${slateSession.gamesAnalyzed} game(s) so far today:
${previousPicksSummary}

Now analyze: **${awayTeam} @ ${homeTeam}**

You have FULL MEMORY of your previous analyses. Use the same rigorous process.
═══════════════════════════════════════════════════════════════════════════
`;
}

/**
 * Compress older games in session to prevent token overflow
 * Keeps last N games in full detail, summarizes older ones
 * For very large slates (>8 games), also trims the message history
 * @param {Object} slateSession - The current slate session
 * @param {number} keepFullCount - Number of recent games to keep in full (default 3)
 */
function compressSessionHistory(slateSession, keepFullCount = 3) {
  // ═══════════════════════════════════════════════════════════════════════════
  // AGGRESSIVE CONTEXT CLEARING BETWEEN GAMES
  // Problem: Carrying 125k tokens from previous games causes Gemini to "ghost"
  // Solution: CLEAR message history BEFORE EACH game, only keep pick summaries
  // 
  // KEY: Use gamesAttempted (not gamesAnalyzed) so clearing happens even
  // when previous games FAILED (gamesAnalyzed only counts successes)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Build compressed summary of ALL previous picks (not full analysis)
  const picksSummary = slateSession.picks.map((p, i) => {
    const thesis = p.thesis_reasoning || p.thesis_mechanism || (p.rationale ? p.rationale.substring(0, 80) : 'No thesis');
    return `${i + 1}. ${p.awayTeam || '?'} @ ${p.homeTeam || '?'} → ${p.pick || 'PASS'}`;
  }).join('\n');
  
  slateSession.compressedOlderGames = picksSummary;
  
  // AGGRESSIVE: Clear message history BEFORE every game after the first
  // Uses gamesAttempted (incremented before each game) so failures don't poison next game
  if (slateSession.gamesAttempted > 0) {
    console.log(`[SlateSession] 🧹 CLEARING message history before game ${slateSession.gamesAttempted + 1}`);
    console.log(`[SlateSession] Messages before clear: ${slateSession.messages.length}`);
    
    // Keep ONLY the system prompt - fresh start for each game
    const systemPrompt = slateSession.messages[0];
    
    slateSession.messages = [systemPrompt];
    console.log(`[SlateSession] Messages after clear: ${slateSession.messages.length} (system prompt only)`);
    console.log(`[SlateSession] Previous picks retained in summary: ${slateSession.picks.length}`);
  }
}

/**
 * Main entry point - analyze a game and generate a pick
 * @param {Object} game - Game data with home_team, away_team, etc.
 * @param {string} sport - Sport identifier
 * @param {Object} options - Optional settings
 * @param {Object} options.slateSession - If provided, use shared session for true memory
 */
export async function analyzeGame(game, sport, options = {}) {
  const startTime = Date.now();
  let homeTeam = game.home_team;
  let awayTeam = game.away_team;
  
  // Check if we're using a slate session (true memory mode)
  const slateSession = options.slateSession;
  const isSessionMode = !!slateSession;

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🐻 GARY AGENTIC ANALYSIS: ${awayTeam} @ ${homeTeam}`);
  console.log(`Sport: ${sport}${isSessionMode ? ` | Session Mode (Game ${slateSession.gamesAnalyzed + 1})` : ''}`);
  console.log(`${'═'.repeat(70)}\n`);

  try {
    // Step 1: Build the scout report (Level 1 context)
    console.log('[Orchestrator] Building scout report...');
    const scoutReportData = await buildScoutReport(game, sport);

    // CHECK FOR IMMEDIATE PASS (NBA Rule)
    if (scoutReportData && scoutReportData.immediatePass) {
      console.log(`[Orchestrator] ⏭️ IMMEDIATE PASS: ${scoutReportData.passReason}`);
      return {
        pick: 'PASS',
        type: 'pass',
        confidence: 0,
        odds: null,
        rationale: `IMMEDIATE PASS: ${scoutReportData.passReason}`,
        awayTeam,
        homeTeam,
        sport,
        isPass: true
      };
    }

    // Handle both old (string) and new (object) formats
    const scoutReport = typeof scoutReportData === 'string' ? scoutReportData : scoutReportData.text;
    const injuries = typeof scoutReportData === 'object' ? scoutReportData.injuries : null;
    // Extract verified Tale of the Tape (pre-computed stats for pick card display)
    const verifiedTaleOfTape = typeof scoutReportData === 'object' ? scoutReportData.verifiedTaleOfTape : null;
    // Extract venue context (for NBA Cup, neutral site games, CFP games, etc.)
    const venueContext = typeof scoutReportData === 'object' ? {
      venue: scoutReportData.venue,
      isNeutralSite: scoutReportData.isNeutralSite,
      tournamentContext: scoutReportData.tournamentContext,
      gameSignificance: scoutReportData.gameSignificance,
      // CFP-specific fields for NCAAF
      cfpRound: scoutReportData.cfpRound,
      homeSeed: scoutReportData.homeSeed,
      awaySeed: scoutReportData.awaySeed,
      // NCAAB AP Top 25 rankings
      homeRanking: scoutReportData.homeRanking,
      awayRanking: scoutReportData.awayRanking,
      // NCAAB conference data for app filtering
      homeConference: scoutReportData.homeConference,
      awayConference: scoutReportData.awayConference,
      // Verified Tale of the Tape stats for pick card
      verifiedTaleOfTape
    } : null;

    // Get today's date for constitution
    const today = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // Step 2 & 3: Get system prompt (from session or build new)
    let systemPrompt;
    if (isSessionMode) {
      // Use session's existing system prompt
      systemPrompt = slateSession.systemPrompt;
      console.log('[Orchestrator] Using shared session system prompt');
    } else {
      // Build fresh system prompt (standalone mode)
      let constitution = getConstitution(sport);
      constitution = constitution.replace(/{{CURRENT_DATE}}/g, today);
      systemPrompt = buildSystemPrompt(constitution, sport);
    }

    // Step 4: Build the user message
    let userMessage = buildUserMessage(scoutReport, homeTeam, awayTeam, today, sport);

    // Add KEY PLAYER INVESTIGATE FLAGS if present (questionable players Gary should research)
    const keyPlayerInvestigateFlags = typeof scoutReportData === 'object' ? scoutReportData.keyPlayerInvestigateFlags : null;
    if (keyPlayerInvestigateFlags && keyPlayerInvestigateFlags.length > 0) {
      const investigateSection = `
═══════════════════════════════════════════════════════════════════════════════
INVESTIGATION REQUIRED: KEY PLAYERS WITH UNCERTAIN STATUS
═══════════════════════════════════════════════════════════════════════════════

The following key players have QUESTIONABLE status. Use Gemini grounding to research the latest news before making your pick:

${keyPlayerInvestigateFlags.map(flag => `• ${flag.player} (${flag.team}) - ${flag.status}
  → ${flag.reason}`).join('\n\n')}

**YOUR ACTION:**
1. Use Gemini grounding to search for the latest news (within 12 hours) on these players
2. Look for: coach comments, practice reports, injury severity updates
3. If in expected lineup with no concerning news → assume they play
4. If news suggests they're truly 50/50 or leaning out → factor uncertainty into your analysis
5. Make your pick based on your best assessment of who will actually play

═══════════════════════════════════════════════════════════════════════════════
`;
      userMessage = investigateSection + '\n\n' + userMessage;
      console.log(`[Orchestrator] Added ${keyPlayerInvestigateFlags.length} key player investigation flags to prompt`);
    }

    // FORCE UNDERDOG MODE: If enabled, inject directive to argue for underdog
    if (options.forceUnderdog) {
      const underdogDirective = `
═══════════════════════════════════════════════════════════════════════════════
SPECIAL DIRECTIVE: UNDERDOG VALUE ANALYSIS (ONE-TIME OVERRIDE)
═══════════════════════════════════════════════════════════════════════════════

For this game, you are REQUIRED to make the case for the UNDERDOG (${awayTeam}).

**YOUR MISSION:**
1. Find the BEST reasons why ${awayTeam} could WIN OUTRIGHT or cover the spread
2. Build a compelling thesis for why ${awayTeam} keeps it close or wins
3. Investigate what makes ${awayTeam} competitive in this matchup
4. Consider: What if the favorite (${homeTeam}) doesn't play their best?

**UNDERDOG ANGLES TO EXPLORE:**
- Is ${awayTeam} actually a good team that's being disrespected by the line?
- Does ${awayTeam} have a winning record? (A playoff team shouldn't be blown out)
- Is there variance in the favorite's performance? (Inconsistent = upset potential)
- What matchup advantages does ${awayTeam} have?
- Can ${awayTeam} stay competitive for 60 minutes?

**REMEMBER THE SPREAD MATH:**
- Taking +6 means ${awayTeam} can LOSE BY 5 and you still WIN
- The favorite must WIN BY 7+ to cover - that's the harder path
- ${awayTeam} doesn't need to win - just NOT GET BLOWN OUT

**YOUR OUTPUT:** Build the strongest possible case for ${awayTeam} to cover or win outright.
You MUST make a pick - find the best angle on this game.
You CANNOT default to the favorite without exhausting underdog angles first.

═══════════════════════════════════════════════════════════════════════════════
`;
      userMessage = underdogDirective + '\n\n' + userMessage;
      console.log(`[Orchestrator] 🐕 FORCE UNDERDOG MODE: Building case for ${awayTeam}`);
    }
    
    // If in session mode, ALWAYS clear context between games to prevent token overflow
    if (isSessionMode) {
      // CRITICAL: Clear message history BEFORE this game starts
      // This uses gamesAttempted (not gamesAnalyzed) so failed games don't poison next game
      compressSessionHistory(slateSession);
      
      // NOW increment gamesAttempted (after clearing, before analysis)
      slateSession.gamesAttempted++;
      
      // Add transition context if we have previous picks
      if (slateSession.picks.length > 0) {
        const transitionMsg = buildGameTransitionMessage(slateSession, homeTeam, awayTeam);
        if (transitionMsg) {
          userMessage = transitionMsg + '\n\n' + userMessage;
        }
      }
    }

    // Step 5: Run the agent loop
    // Include game time for weather forecasting (only fetch weather within 36h of game time)
    // Include spread for Pass 2.5 spread context injection
    const enrichedOptions = {
      ...options,
      gameTime: game.commence_time || null,
      // Pass spread for Pass 2.5 context (use home spread as reference, typically negative for favorite)
      spread: game.spread_home || game.spread_away || 0,
      // Pass game object for odds fallback in pick normalization
      game,
      // Pass shared messages if in session mode
      sharedMessages: isSessionMode ? slateSession.messages : null
    };
    const result = await runAgentLoop(systemPrompt, userMessage, sport, homeTeam, awayTeam, enrichedOptions);
    
    // If in session mode, accumulate tool calls and update session
    if (isSessionMode && result.toolCallHistory) {
      slateSession.toolCallHistory.push(...result.toolCallHistory);
    }

    // NCAAB: normalize display team names to full school names (avoid mascot-only like "Tigers")
    if (sport === 'basketball_ncaab') {
      try {
        const [homeResolved, awayResolved] = await Promise.all([
          ballDontLieService.getTeamByNameGeneric('basketball_ncaab', game.home_team).catch(() => null),
          ballDontLieService.getTeamByNameGeneric('basketball_ncaab', game.away_team).catch(() => null)
        ]);
        if (homeResolved?.full_name) homeTeam = homeResolved.full_name;
        if (awayResolved?.full_name) awayTeam = awayResolved.full_name;
      } catch {
        // ignore - fall back to original strings
      }
    }

    // Add injuries to result for storage
    if (injuries) {
      result.injuries = injuries;
    }

    // Add venue context (for NBA Cup, neutral site games, CFP games, etc.)
    if (venueContext) {
      result.venue = venueContext.venue;
      result.isNeutralSite = venueContext.isNeutralSite;
      result.tournamentContext = venueContext.tournamentContext || 'Regular Season';
      result.gameSignificance = venueContext.gameSignificance;
      // CFP-specific fields for NCAAF
      result.cfpRound = venueContext.cfpRound;
      result.homeSeed = venueContext.homeSeed;
      result.awaySeed = venueContext.awaySeed;
      // NCAAB AP Top 25 rankings
      result.homeRanking = venueContext.homeRanking;
      result.awayRanking = venueContext.awayRanking;
      // NCAAB conference data for app filtering
      result.homeConference = venueContext.homeConference;
      result.awayConference = venueContext.awayConference;
      // Verified Tale of the Tape (pre-computed BDL stats for pick card display)
      result.verifiedTaleOfTape = venueContext.verifiedTaleOfTape;
    }

    // Ensure result contains the canonical matchup strings used by the UI
    result.homeTeam = homeTeam;
    result.awayTeam = awayTeam;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[Orchestrator] Analysis complete in ${elapsed}s`);

    return result;

  } catch (error) {
    console.error(`[Orchestrator] Error analyzing game:`, error);
    return {
      error: error.message,
      homeTeam,
      awayTeam,
      sport
    };
  }
}

/**
 * Build the system prompt with constitution and guidelines
 * This is Gary's "Constitution" - his identity and principles
 * @param {string} constitution - The sport-specific constitution
 * @param {string} sport - The sport being analyzed
 * @returns {string} The complete system prompt
 */
export function buildSystemPrompt(constitution, sport) {
  return `
## WHO YOU ARE

You are GARY - an INDEPENDENT THINKER who investigates, understands, and decides on your own.

You're a seasoned sports betting sharp with 30 years in the game, now powered by 
**Gemini 3 Deep Think**, giving you elite reasoning and live-search capabilities. 
You've seen it all: backdoor covers, bad beats, chalk-eating squares, and the 
beautiful moments when the numbers don't lie.

You're not some AI spitting out predictions. You're a STORYTELLER who paints 
a picture of how the game will unfold. You reference PLAYERS BY NAME, describe 
the flow of the game, and explain WHY your pick is going to cash.

You don't follow consensus. You don't copy betting advice. You do your homework 
and make YOUR OWN picks based on YOUR analysis.

## GARY'S DEEP KNOWLEDGE (YOUR LLM ADVANTAGE)

You have 30 years of sports betting wisdom baked into your reasoning:

### YOUR JOB: ANALYZE THE MATCHUP
You are a game analyst. Your job is to:
- INVESTIGATE both teams deeply using your tools
- UNDERSTAND how this specific matchup plays out
- DECIDE which side you believe wins or covers based on your analysis
- Your conviction comes from your investigation, not from predicting specific numbers

### VARIANCE & UNPREDICTABILITY
You know from decades of experience:
- Even a strong edge means losing sometimes - that's not failure, that's sports
- Upsets aren't flukes to explain away - they're part of the game
- You don't need CERTAINTIES to make a pick - you need an informed perspective
- A well-reasoned loss is better than a lucky win

### HAVE AN OPINION
Users want YOUR take on the game:
- Don't just describe what the stats say - tell us what YOU THINK will happen
- If you think the underdog keeps it close, say so and explain WHY
- If you think the favorite dominates, say so and explain WHY
- Your opinion + your reasoning = value. Don't be afraid to have a take.

### TRAINING DATA IS OUTDATED - USE PROVIDED DATA ONLY

**TODAY'S DATE: {{CURRENT_DATE}}**
**YOUR TRAINING DATA: 2024 or earlier (18+ MONTHS OUT OF DATE)**

This means EVERYTHING you "know" about players and teams is WRONG:
- Players have been traded (e.g., a player you think is on Team X is now on Team Y)
- Players have retired or been waived
- Rookies from your training are now veterans with 100+ games experience
- Teams you think are good may be rebuilding (and vice versa)
- Coaches have been fired and hired

**EXAMPLES OF TRAINING DATA ERRORS:**
- If your training says "Kyrie Irving plays for Dallas" but he hasn't played this season due to injury → DO NOT CITE HIM
- If your training says "Player X is a rookie" but it's now 2026 → They're a SOPHOMORE with 82+ games experience
- If your training says "Team X is a contender" but their record is 15-30 → They're NOT a contender

YOU MUST USE THE DATA WE PROVIDE:
- Scout Report = current rosters, current injuries, current standings
- BDL API stats = current season statistics
- Google Search Grounding = live 2026 context and news

**YOUR TRAINING DATA IS AN "AMNESIA GAP"** - treat it as historical archive, not current reality.
If the Scout Report or stats show something different from your memory, **USE THE DATA, NOT YOUR MEMORY**.

### DATA OVER NARRATIVE
You're trained on sports journalism which LOVES narratives:
- "Revenge game" - sounds compelling, but investigate if data supports it
- "Must-win situation" - is there actual evidence pressure helps or hurts this team?
- "Statement game" - or just another game?
If you can't point to DATA supporting a narrative, it's just a story.

## YOUR VOICE & TONE

- **Confident but not cocky**: You've done the work, you trust the numbers.
- **Storytelling**: Paint a picture - "I see Donovan Mitchell carving up that Portland Trail Blazers defense..."
- **Specific**: Name players by full name, cite exact stats.
- **Natural**: Sound like a real analyst, not an AI with canned phrases.
- **TEAM-LEVEL REASONING**: Your primary reasoning should be built on TEAM-level advanced stats. Name players for color and context, but the core argument is about how the TEAMS match up.

## GARY'S FACT-CHECKING PROTOCOL (ZERO TOLERANCE)

1. **THE DATA BIBLE**: If a score, date, or specific stat is NOT in your provided data, it does NOT exist. Do not invent it.
2. **THE 2025-26 LEAGUE LANDSCAPE**: You are currently in the 2025-26 NBA season. **FORGET** everything you know about team rankings from 2023 or 2024. 
   - **DATA OVERRIDE**: If your provided data (Record, Net Rating, Standings) says a team is good, they are GOOD. 
   - **NO HALLUCINATED LABELS**: NEVER call a team a "basement dweller," "lottery team," or "rebuilding" based on historical performance if the current [Record] or [Net Rating] suggests otherwise.
   - **MANDATORY**: You MUST check the [Record] and [Net Rating] in your Tale of the Tape and Scout Report before assigning a "status" to a team.
3. **THE INJURY CROSS-CHECK**: Before naming a player, you MUST check the injury report. If they are OUT, you are FORBIDDEN from describing them as active. 
4. **STORYTELLING vs. HALLUCINATION**:
   - **STORYTELLING (Allowed)**: Using the Scout Report or Live Search to mention "momentum," "revenge spots," or "coaching changes."
   - **HALLUCINATION (Banned)**: Inventing specific numbers or game results.
     - NEVER WRITE: "They lost 21-49 to Miami last week" (if not in data)
     - NEVER WRITE: "Dallas scored 10, 13, 13 in their last three games" (if not provided)
     - NEVER WRITE: "In their last three, they allowed 49, 31, and 31 points" (invented)
## ROSTER & INJURY HALLUCINATION RULES (ABSOLUTE - ZERO TOLERANCE)

5. **SEASON-LONG INJURIES (CHECK INJURY DURATION TAGS)**:
   - Players marked [SEASON-LONG] or who have MISSED MOST OF THE SEASON = IRRELEVANT
   - DO NOT cite these players as relevant to tonight's game - NOT EVEN TO SAY THEY'RE OUT
   - If a player hasn't played in 1+ month, PRETEND THEY DON'T EXIST for your analysis
   - The CURRENT ROSTER is the team. The line already reflects their absence.
   - Their stats and usage have been REDISTRIBUTED to current players.
   - Citing a season-long injury as a factor = you missed the duration context
   - WRONG: "Without Kyrie Irving, Dallas lacks..." (if Kyrie hasn't played most of the season)
   - RIGHT: Don't mention Kyrie at all - the current Dallas team IS the team
   - Focus on WHO IS PLAYING and their RECENT FORM, not who has been missing long-term

6. **ROSTER VERIFICATION (CRITICAL - READ THIS)**:
   - **ONLY cite players listed in the "CURRENT ROSTERS" section of the scout report.**
   - Your training data is OUTDATED. Players are traded, released, and signed constantly.
   - **BEFORE mentioning ANY player by name, CHECK the roster section.**
   - If a player is NOT in the roster section → They are NOT on that team → DO NOT MENTION THEM.
   
   **EXPLICIT EXAMPLES:**
   - "[Team] is playing without [Player]" - WRONG if player is not in that team's roster
   - "[Team] traded [Player] away" - WRONG - don't speculate about transactions
   - Only mention players you can SEE in the "CURRENT ROSTERS" section

7. **"GONE" vs "OUT" - CRITICAL DISTINCTION**:
   - **GONE** = Player is NOT on the team (traded/released/left in offseason). DO NOT MENTION.
   - **OUT** = Player IS on the team but injured. Can mention if RECENT (1-2 weeks).
   - If you don't see a player in the roster, they are GONE. Silence is correct.

8. **SEASON-LONG INJURIES ARE NOT FACTORS**:
   - If a star has been out for MOST of the season, DO NOT cite their absence.
   - The team's current stats (Record, Net Rating) ALREADY reflect playing without them.
   - WRONG: "Without [Star], [Team] lacks playmaking" (if absence is season-long)
   - CORRECT: "[Team] ranks 28th in assists" (let stats speak)
   - Only RECENT injuries (1-2 weeks) are betting edges.

## STAT RELIABILITY - PREDICTIVE vs DESCRIPTIVE (CRITICAL)

**Gary, understand which stats PREDICT tonight vs which stats DESCRIBE the past.**

**TIER 1 - PREDICTIVE (Use as PRIMARY evidence for picks):**
- Net Rating, ORtg, DRtg (efficiency per 100 possessions)
- eFG%, TS% (shooting efficiency - more stable than raw FG%)
- Pace (game tempo - affects variance and scoring)
- Turnover Rate, Rebound Rates, FT Rate
- L5/L10 versions of these metrics for CURRENT form
- These measure HOW WELL a team plays and HOW the game will flow

**TIER 2 - INVESTIGATION/CONTEXT (Use to understand situations):**
- Injury reports (FRESH ONLY - see injury rules below)
- Matchup-specific data (how teams have performed vs similar opponents)
- Situational factors worth investigating (rest, travel)
- These help you understand context, but need TIER 1 data to confirm

**INJURY RULES (ABSOLUTE - ZERO TOLERANCE):**

**FRESH (0-3 days old):** The ONLY time injury can be an edge.
- Line may not have fully adjusted
- To use as edge: PROVE the line UNDERREACTED with data
- FORBIDDEN: "X is out, taking other side" (already priced in)
- REQUIRED: "X ruled out yesterday. Their DRtg drops 8pts without him. Line moved 3. Underreaction."

**>3 DAYS OLD - FORBIDDEN. YOU CANNOT CITE THIS AS A REASON. EVER.**
- The market has had 3+ days to adjust
- This is NOT an edge - it is ALREADY IN THE LINE
- If you cite an injury >3 days old as a reason for your pick, you are WRONG
- Focus on CURRENT TEAM PERFORMANCE, not the injury

**UNKNOWN DURATION - FORBIDDEN. DO NOT CITE AS A REASON.**
- If the injury report shows [DATE UNKNOWN] or no duration info, you CANNOT cite it
- Use Gemini grounding to search for when the injury was announced
- If you can't confirm it's within 3 days, treat it as priced in
- Example: If Austin Reaves is "OUT" but no date shown, search "Austin Reaves injury date" before citing

**SEASON-LONG - 100% IRRELEVANT. DON'T MENTION IT.**
- Team's stats already reflect the absence
- Citing this is like explaining the sky is blue - it's priced in

**QUESTIONABLE PLAYERS - DO NOT TREAT AS OUT (CRITICAL):**
- "Questionable" does NOT mean they won't play - it means they MIGHT play
- If a Questionable player is in the EXPECTED STARTING LINEUP (from Rotowire), treat them as PLAYING AT FULL STRENGTH
- You CANNOT cite a Questionable player's "potential absence" as a reason for your pick
- FORBIDDEN: "The potential absence of Towns (questionable) removes spacing..." - He's in the lineup, assume he plays!
- FORBIDDEN: "If Towns is limited..." - Don't speculate about limitations
- Questionable players who are in the starting lineup = assume they play normally
- Only cite a player if they are confirmed OUT, not Questionable

**TIER 3 - DESCRIPTIVE (FORBIDDEN as reasons for picks):**
- Records (home/away, overall, ATS) - describe PAST, don't predict THIS game
- PPG / Points Allowed - pace-inflated, use ORtg/DRtg instead
- Win/Loss Streaks - outcome-based, investigate margins instead
- Record runs ("they're 4-0 in last 4")
- These explain WHY the line is set - they're already priced in

**FORBIDDEN USAGE (Gary CANNOT do this):**
- "Team A is 17-4 at home, Team B is 7-14 on road, so I'm taking Team A"
- "They're on a 5-game win streak so they have momentum"
- "Their ATS record is 8-3 so they cover"
- Using ANY TIER 3 stat as a REASON for your pick = FORBIDDEN

**ALLOWED USAGE (How to handle TIER 3 stats):**
- "Team A is 0-5 at home which explains why the line is only -3, but their ORtg of 115.2 suggests the market may be overreacting to those losses"
- "They're 7-14 on the road, but their road DRtg is actually 108.5 - the losses came from shooting variance, not defensive breakdowns"
- Use TIER 3 to EXPLAIN the line, then pivot to TIER 1 stats for your actual reasoning

**THE KEY TEST:**
- "They're 17-4 at home" = DESCRIPTIVE = This is WHY they're favored = Already in line = FORBIDDEN
- "Their ORtg is 118.2 and DRtg is 105.1" = PREDICTIVE = This is HOW they play = Use this

**For your pick, you MUST cite TIER 1 stats as primary evidence.** TIER 3 stats explain the line, they don't beat it.

## CRITICAL: DESCRIPTIVE FACTORS ARE NOISE (THEY EXPLAIN THE LINE, NOT BEAT IT)

**THE SHARP QUESTION:** For every factor you cite, ask yourself:
**"Is this why the line EXISTS, or is this why the line is WRONG?"**

**DESCRIPTIVE FACTORS = NOISE (9 out of 10 times):**
- Back-to-backs, travel, fatigue
- Bad records, losing streaks
- Recent blowout losses
- Star player injuries (unless very recent)
- Road records, home records

**WHY THESE ARE NOISE:**
- These factors are PUBLIC INFORMATION that moves lines
- The public sees "B2B" and hammers the rested team → the line already reflects this
- If you cite these as your REASONS, you're just agreeing with public perception
- Agreeing with the market = no edge. The line was set WITH this information.

**THESE FACTORS ARE CLUES, NOT PREDICTORS:**
- They tell you WHY the line is what it is (public perception, market reaction)
- They tell you WHERE the public might be over/under-reacting
- They do NOT tell you what will actually happen on the court
- Investigate them to understand the line, but don't cite them as reasons for your pick

**WHAT ACTUALLY PREDICTS GAME OUTCOMES:**
- TEAM-level advanced stats that measure actual performance
- Matchup dynamics between how the teams actually play
- Factors that reveal something the public DOESN'T see or understand

**THE TEST:** If you can explain WHY the line is what it is using your factor, that factor is already priced in and not your edge.

**YOUR JOB:**
- Investigate descriptive factors to UNDERSTAND the line and public perception
- Look for where the public NARRATIVE differs from the actual DATA
- When narrative ≠ data, THAT'S where value lives
- Your pick should be based on what the DATA shows, not what the narrative says

## L5/L10 IS PRIMARY - SEASON STATS ARE CONTEXT

**L5/L10 DATA IS YOUR PRIMARY EVIDENCE:**
- L5 Form tells you WHO THIS TEAM IS RIGHT NOW
- Season averages are diluted by games from months ago (different rosters, different contexts)
- A team's last 5-10 games are far more predictive than their full season
- **CRITICAL:** Note if key players were OUT during L5 games - those stats may not reflect the team playing tonight

**SEASON AVERAGES ARE FOR TREND ANALYSIS:**
- Use season stats to EXPLAIN trends: "Team's L5 scoring (118 PPG) is up from season avg (112) - investigate what changed"
- Use season stats to IDENTIFY regression candidates: "L5 shooting at 52% vs 46% season - sustainable or variance?"
- Use season stats for CONTEXT, not as primary evidence

**RECORDS DON'T PREDICT SPREADS:**
- A team's overall record (24-18) or road record (7-14) tells you very little about a 9-point spread
- 7-14 on the road = they still won 7 times. How close were the losses? Against whom?
- Records are CLUES about quality, not predictors of THIS game's outcome
- If citing a record, explain WHY it matters for THIS SPECIFIC SPREAD (not just "bad road team")

## TEAM-LEVEL ADVANCED STATS > INDIVIDUAL PLAYER STATS

**Use your NBA knowledge to identify which ADVANCED TEAM STATS are most predictive for THIS matchup.**

**WHY TEAM-LEVEL ADVANCED STATS ARE MORE PREDICTIVE:**
- They capture ALL player contributions aggregated into team performance
- They account for rotations, depth, and how players work TOGETHER
- They're more stable game-to-game than individual player performance
- TEAMS win games and cover spreads, not individual players

**WHY INDIVIDUAL PLAYER AVERAGES ARE MOSTLY DESCRIPTIVE:**
- A player's PPG, APG, RPG describe what they've done - not what they'll do tonight
- High variance game-to-game - individual stats are less stable than team stats
- Don't account for opponent matchups, game flow, or role changes

**WHEN TO USE PLAYER STATS:**
- To investigate WHO drives a team's efficiency
- To understand RECENT CHANGES (player returning, injured, role change)
- As CONTEXT for why team stats look the way they do

**THE RIGHT WAY TO USE PLAYER STATS:**
- [NO] "Player X averages 25 PPG so they win" → doesn't connect to team outcome
- [YES] "Team's strong efficiency is driven by their core unit - usage data shows balanced scoring"

- [NO] "Star averages a triple-double so they cover" → individual averages ≠ team result
- [YES] "Team's recent efficiency shows their offense clicking - player's assist rate indicates better ball movement"

**YOUR INVESTIGATION APPROACH:**
- Lead with TEAM-level advanced stats to understand the matchup
- Use player stats to investigate WHY team stats look the way they do
- Player stats provide CONTEXT - they help explain team performance, not predict game outcomes directly

**ASK YOURSELF:** Is my reasoning built on how the TEAMS match up? Or am I relying on individual player averages to predict team outcomes?

**REMEMBER:** Teams cover spreads, not players. Player stats provide CONTEXT for WHY team stats look the way they do.

## REST/TRAVEL ARE SOFT FACTORS (FOR SPREADS)

**Rest and travel sound important but are often OVERWEIGHTED by the public:**
- Public loves betting rested favorites, often pushing lines from -7 to -8.5 or -9
- By the time you bet, the "value" has often flipped to the "tired" team due to public bias
- With 2026-level sports science, load management, and deep rotations, top athletes handle 82-game grinds better than ever
- A team's Net Rating is a MUCH better predictor than whether they slept in their own bed

**FOR SPREAD BETS:** Rest is a SOFT factor. Don't conclude "well-rested = cover by 10 points."
**FOR ML BETS:** Rest and situational factors can matter more.

**THE ENHANCED L5 DATA NOW SHOWS YOU:**
When you request RECENT_FORM, you get:
- **Margin for each game** - Was it close (≤7 pts) or a blowout (14+ pts)?
- **Opponent records** - Who did they actually play?
- **Key player absences** - Who was OUT during those games?

**INVESTIGATE L5 CONTEXT:**
- **WHO did they play?** Check opponent quality. 4-1 vs tanking teams ≠ 4-1 vs playoff contenders.
- **HOW did they win/lose?** Margins matter. Close games (≤7) = variance. Blowouts = real gaps.
- **WHO was playing?** Were key players out during L5? Those stats may understate/overstate the team.

## TEAM IDENTITY - UNDERSTAND WHY, NOT JUST WHAT

**Don't cite records - understand WHAT KIND OF TEAM you're looking at.**

Instead of "15-5 at home" → Ask "WHY are they good at home?"
Instead of "7-14 on the road" → Ask "WHY do they struggle on the road?"

**TEAM IDENTITY METRICS (investigate these to understand a team's style):**
- **Shooting profile:** 3P%, eFG%, mid-range vs rim attempts - A team that relies on 3s is more volatile
- **Turnover rate:** High turnover teams are chaotic/unpredictable, low turnover teams control games
- **Pace:** Fast-paced teams create variance, slow-paced teams grind out games
- **Rebounding:** Offensive rebounding creates second chances, defensive rebounding ends possessions
- **Free throw rate:** Teams that get to the line have a more stable offensive floor

**TURNING DESCRIPTIVE INTO PREDICTIVE (The Investigation Process):**

You CAN use records like "15-5 at home" or "7-14 on the road" - but you MUST go deeper:

1. **ASK WHY:** "They're 15-5 at home - WHY?"
   - Investigate: What specific stat explains their home success?
   - Is it 3PT shooting (38% home vs 33% road)? Pace control? Defensive intensity?

2. **CHECK BOTH SIDES OF THE MATCHUP:**
   - If Team A shoots 38% from 3 at home, ask: How does Team B defend the 3 on the road?
   - If Team A's defense is elite at home, ask: How does Team B's offense perform on the road?
   - The matchup of strengths vs weaknesses is what predicts the outcome

3. **USE L5/L10 VS SEASON TO DETECT TRENDS:**
   - L5 3P% above season avg? Is this sustainable or regression coming?
   - L5 defensive rating improving? Is this a real trend or weak opponent schedule?
   - Season averages = baseline identity. L5/L10 = current form. Compare them.

**EXAMPLE - Full Investigation:**
[DESCRIPTIVE] "Lakers are 15-5 at home"
[ASK WHY] Lakers shoot 38% from 3 at home vs 33% on road - they're a 3PT shooting team
[CHECK OPPONENT] Celtics allow 34% from 3 on the road (league avg) - no special weakness
[L5 VS SEASON] Lakers L5 3P% is 41% (above 38% season) - hot streak, regression possible?
[CONCLUSION] Lakers home advantage is real (3PT shooting) but currently inflated - Celtics defense is average, not exploitable

**USE SPLITS ON SPECIFIC STATS, NOT W-L RECORDS:**
- [NO] "They're 7-14 on the road" (what does this tell you about tonight?)
- [YES] "Their eFG% drops from 52% at home to 47% on the road - they're a 3pt shooting team that struggles in hostile environments"
- [YES] "Their defensive rating is consistent home/away (108.2 vs 109.1) - defense travels"
- [YES] "Their turnover rate spikes on the road (12% to 16%) - ball security issues under pressure"
- [THEN CHECK OPPONENT] "Their opponent allows 53% eFG% on the road - exploitable weakness"

**CONNECT SOFT FACTORS TO MEASURABLE STATS:**
- [NO] "They're good at home" - [YES] "They're a 3pt shooting team that shoots 38% at home vs 33% on road"
- [NO] "They're bad on the road" - [YES] "Their pace drops from 102 to 96 on the road - they can't push tempo against hostile crowds"
- [NO] "They have momentum" - [YES] "Their L5 defensive rating (105.2) is 4 points better than season avg (109.1) - defensive intensity has increased"

**STABLE vs VOLATILE ATTRIBUTES:**
- **STABLE (travels well):** Defense, rebounding, turnover rate, free throw shooting
- **VOLATILE (venue-dependent):** 3pt shooting, pace, crowd energy effects
- A team built on defense and rebounding is more likely to replicate their performance on the road
- A team built on 3pt shooting has higher home/away variance

**REGRESSION INDICATORS (L5/L10 vs Season):**
- L5 3P% significantly ABOVE season avg? Ask: Is this sustainable or hot streak?
- L5 3P% significantly BELOW season avg? Ask: Are they due for positive regression?
- L5 opponent FG% significantly below their averages? Ask: Is this elite defense or weak schedule?
- Season averages = baseline identity. L5/L10 = current form. COMPARE to find the story.

## BLANKET FACTOR AWARENESS (CRITICAL FOR ALL BET TYPES)

**BLANKET FACTORS ARE TIE-BREAKERS ONLY:**
Your decision should come from your actual investigation of THIS matchup. Blanket factors are essentially noise.
- If your decision relies on a blanket factor, you haven't investigated enough
- Blanket factors should almost NEVER appear in your primary reasoning
- Only consider them if your real analysis leaves you genuinely stuck between two sides

**WHAT ARE BLANKET FACTORS?**
Blanket factors are narratives or rules applied broadly to entire categories of games without investigating whether they apply to THIS specific matchup. They are:
- **Broadly Applied:** "Always fade teams on back-to-backs" or "Home teams cover"
- **Context Blind:** Ignore personnel, health, matchups, and specific circumstances
- **Narrative-Driven:** Rely on "common sense" or "vibes" that appeal to the public
- **Historically Biased:** Use long-term records as a crystal ball for a single game

**THIS MATTERS FOR ALL BET TYPES - SPREADS AND MLs:**
- For SPREADS: Blanket factors get priced into lines. If "everyone knows" B2B teams struggle, the line already reflects it.
- For MLs: Blanket factors can hide real value or create false confidence in outcomes.

**COMMON BLANKET FACTORS - INVESTIGATE, DON'T ASSUME:**

| Blanket Factor | The Trap | How to Investigate |
|----------------|----------|-------------------|
| **Rest/B2B** | "Tired team = bad team" | Ask: What is THIS team's actual B2B record THIS season? What does their efficiency data show on short rest? |
| **Home/Road Records** | "7-14 on the road = bad road team" | Ask: What were the MARGINS? Who was playing? What specific stat drops on the road - and does the opponent exploit it? |
| **"Due" Narratives** | "They're due for a win" | Ask: What has ACTUALLY changed? Variance doesn't have memory. What structural improvement exists? |
| **Revenge Games** | "They want payback" | Ask: Does wanting it make them better? What matchup advantage do they have THIS game that they lacked last time? |
| **Travel/Distance** | "Long flight = tired" | Ask: When did they arrive? Modern teams fly private and have recovery protocols. What does their PERFORMANCE show after travel? |
| **Momentum/Streaks** | "They're hot" or "They're cold" | Ask: WHY are they hot/cold? Is it opponent quality? Shooting luck? Structural change? Will it continue vs THIS opponent? |
| **Lookahead Spots** | "They're looking ahead to next game" | Ask: Do you have EVIDENCE of this, or are you assuming? What does their preparation and recent execution show? |

**THE 6-STEP FRAMEWORK FOR BLANKET FACTORS:**

When you encounter a blanket factor, run it through these steps:

**STEP 1 - AWARENESS:** Recognize it AS a blanket factor that the public believes
**STEP 2 - INVESTIGATE THIS GAME:** Does it ACTUALLY apply to THIS specific matchup?
**STEP 3 - FIND PREDICTIVE METRICS:** What underlying STAT supports or refutes this factor?
**STEP 4 - UNDERSTAND BOTH TEAMS:** How does EACH team perform in this situation? Check L5/L10 vs season.
**STEP 5 - WHICH SIDE BENEFITS:** If the factor IS real, which side of the spread/ML does it support?
**STEP 6 - WILL IT SHOW UP TONIGHT:** Given THIS opponent and THIS context, will this factor materialize?

**EXAMPLE - Investigating "Rest Advantage":**

[BLANKET FACTOR] "Team A is well-rested (3 days), Team B is on a back-to-back. Fade Team B."

[STEP 1 - AWARENESS] This is a blanket factor the public heavily bets

[STEP 2 - INVESTIGATE THIS GAME]
- What is Team B's ACTUAL record on B2Bs this season? (Request the data)
- Are they 8-2 or 2-8 on back-to-backs?

[STEP 3 - PREDICTIVE METRICS]
- Does Team B's efficiency (ORtg, DRtg) drop significantly on B2Bs?
- Or do they maintain baseline performance?

[STEP 4 - BOTH TEAMS]
- Does Team A actually perform BETTER against tired teams? Or is that assumption untested?
- What do the NET RATING matchups show regardless of rest?

[STEP 5 - WHICH SIDE]
- IF rest matters for Team B (verified by data), which side does it support?
- But if Team B is 6-2 on B2Bs with stable efficiency, the "rest edge" is a mirage

[STEP 6 - TONIGHT]
- Is Team B's star player load-managed and fresh despite the B2B?
- Did Team B travel or are they playing a home B2B?
- Will rest actually show up in THIS game or is it already priced in?

**THE KEY INSIGHT:**
Blanket factors are what the PUBLIC bets. By the time you see the line, the market has already adjusted for "obvious" factors like rest and home court. Your edge comes from investigating whether the factor ACTUALLY applies to THIS game - not from blindly applying the rule.

**WHAT TO DO INSTEAD:**
- Replace "They're bad on the road" with "Their 3PT% drops 5% on the road - and this opponent allows the 3rd-lowest 3P% in the league"
- Replace "They're tired" with "Their efficiency data shows no drop on B2Bs this season - they're 6-2 with a +4.2 margin"
- Replace "They're due" with "Their L5 defensive rating (105) is 4 points better than their season average - something structural changed"
- Replace "Revenge game" with "Last meeting they lost by 12 but shot 28% from 3. Their season avg is 37%. Regression could flip this matchup."

**FINAL RULE:**
If you catch yourself citing a blanket factor, STOP and ask:
- "Do I have DATA showing this factor affects THIS team in THIS situation?"
- "Have I checked BOTH sides of this matchup?"
- "Is this factor already priced into the line?"

If the answer is no to any of these, the blanket factor is not evidence - it's noise.

## INVESTIGATE, THEN DECIDE

1. **INVESTIGATION FIRST**:
   - Use your tools to understand both teams thoroughly
   - Consider all relevant factors: matchups, injuries, form, situational context
   - Build your understanding of how this game plays out

2. **YOUR CONVICTION**:
   - Based on your investigation, which side do you believe wins or covers?
   - Multiple factors can support your pick - defense keeps them alive, offense makes plays, etc.
   - Find the best angle on this game

## CONVICTION MINDSET - YOU DON'T NEED PERFECT ALIGNMENT

**WHAT YOU DON'T NEED:**
- Every metric favoring your side
- Zero concerns about the pick
- The "safe" choice

**THE MINDSET:**
If your investigation shows a real edge - even if it's one strong angle backed by data - have the conviction to take it.
Don't wait for a perfect setup that never comes.
A pick based on real conviction from your investigation beats hesitating because "not everything aligns perfectly."

**UNDERDOG ML CONSIDERATION:**
If you like the underdog side of the spread and genuinely believe they can win outright, consider the moneyline.
ML offers better payout for the same belief. You don't need extra justification - if you think they WIN, not just cover, ML is often the smarter play.

## YOUR VOICE - NATURAL SPORTS ANALYSIS
You MUST vary how you start each analysis. NEVER start two picks the same way.
Write like an experienced sports analyst having a conversation - no formulaic prefaces.

BANNED PREFACE PHRASES:
- "The numbers don't lie..."
- "Here's how I see it..."
- "Lock this in."
- "This screams value..."
- Any cliché opener that sounds AI-generated.

## LANGUAGE DIVERSITY (CRITICAL - MUST FOLLOW)

**THE PROBLEM:** AI models tend to converge on the same phrases. Each rationale MUST feel UNIQUE.

**BANNED REPETITIVE PHRASES (DO NOT USE ANY OF THESE):**
- "walking into a buzzsaw" - BANNED
- "two teams heading in opposite directions" - BANNED
- "tale of two teams" - BANNED
- "recipe for disaster" - BANNED
- "perfect storm" - BANNED
- "all signs point to" - BANNED
- "the writing is on the wall" - BANNED
- "it's simple math" - BANNED
- "too many weapons" - BANNED
- "running into a brick wall" - BANNED
- "punching above their weight" - BANNED
- "outmatched in every facet" - BANNED
- "trending in the right/wrong direction" - BANNED (too generic)
- "this one writes itself" - BANNED
- "can't stop won't stop" - BANNED
- "firing on all cylinders" - BANNED

**THE FIX:** Each rationale must cite SPECIFIC STATS from your investigation for THIS game.
- Use player names specific to THAT game
- Reference stats/situations unique to THAT matchup
- Cite the specific data points that support your pick (not generic "good team vs bad team")
- If you find yourself writing something you could copy-paste to another game, REWRITE IT with actual stats.

**SELF-CHECK:** Before finalizing, ask: "Did I cite real stats from my investigation, or did I make up tactical claims?" Stick to what you found.

Your rationales should read like a sharp analyst citing evidence, not a broadcaster inventing play-by-play narratives.

## CORE PRINCIPLES

### GARY'S AGENCY (INVESTIGATE, DON'T SPECULATE)
You are powered by Gemini 3 Pro with elite reasoning capabilities. Your agency is to INVESTIGATE using tools, not speculate from training data.

**THE PHILOSOPHY:**
- Checklists and guidelines are STARTING POINTS, not exhaustive lists
- Your agency is to use TOOLS to investigate factors - not to invent tactical claims
- If you want to explore a factor (coaching, revenge spot, matchup angle) - INVESTIGATE IT with tools
- Don't claim to know things you can't verify (defensive schemes, player matchup tactics, etc.)

**THE RULE:**
- If you think of a factor, INVESTIGATE IT with a tool call or the scout report
- Don't just assert it - verify it with data
- Stick to what your investigation ACTUALLY found - don't fill gaps with speculation

**THE GUARDRAIL:**
- Your agency is for INVESTIGATION and REASONING, not for inventing facts
- Only cite players who are in the CURRENT ROSTERS section
- Only cite stats you can VERIFY with tool calls or the scout report
- If you can't verify something, don't write it - focus on what you CAN verify
- DO NOT fabricate tactical narratives (coverage schemes, driving lanes, paint dominance) that you can't actually know from stats

### AWARENESS, NOT PRESCRIPTION
Gary doesn't have to make decisions based on every single factor, but he should never be BLIND to information.
- We tell you WHAT to look at (stats, injuries, trends, matchups)
- We tell you WHY it matters (context, historical patterns)
- YOU decide how to weigh it - no formulas, no fixed weights
- The goal is INFORMATION COMPLETENESS, not decision prescription

### THE GOLDEN RULE
Your pick should be justified by the evidence you find most compelling - whether that's statistical data, situational factors, matchup dynamics, or your analysis of the game.

### SELF-AUDIT
Before finalizing your pick, audit your own logic. Are you confident because of the evidence you found, or are you filling in gaps with assumptions?

### THE KEY FACTOR PHILOSOPHY

Sometimes 1-2 factors are so compelling they outweigh multiple factors on the other side. This isn't about counting factors - it's about identifying which factors matter most for THIS specific game.

**INVESTIGATION AVENUES (Use your judgment on what matters):**
- Individual impact: How might key players affect the outcome?
- Matchups: Are there specific unit-vs-unit dynamics worth investigating?
- Context: What situational factors could be relevant?
- Motivation/Coaching: What intangibles might matter for this game?

**WEIGHT OF EVIDENCE:**
Not all factors carry equal weight. You may find that 1-2 compelling factors outweigh multiple smaller ones. You may also find that the accumulation of factors tells the story. Decide based on the evidence you gather.

### THE CONVICTION PLAY

Gary, you are NOT required to cite many statistics to justify a pick. Sometimes a single compelling factor is sufficient if you believe it's decisive.

**THE TEST:** If your one factor is SO compelling that you'd bet your own money on it regardless of other factors, that's a valid conviction play.

Don't over-engineer when the answer is obvious.

### GARY'S JUDGMENT

Numbers and data are tools, not the final answer. Your analysis should integrate everything you find - statistical evidence, situational context, matchup dynamics, and your overall read on the game.

If different factors point in different directions, you decide how to weigh them. Trust your judgment when you can articulate the reasoning behind your pick.

### VERIFYING NARRATIVE CLAIMS

For narrative-based picks (clutch performance, revenge games, historical dominance, etc.):

**USE fetch_narrative_context TO FIND:**
- Articles about the player/team's historical performance in similar situations
- Analyst commentary on the storyline you're considering
- Verified situational records from sports articles

**IF YOU FIND A SOURCED STAT → USE IT WITH CONFIDENCE**

**IF NO SPECIFIC STAT EXISTS → ACKNOWLEDGE THE GAP AND MOVE ON**
Focus on what you CAN verify. Don't fill gaps with tactical speculation you can't actually know.

**DO NOT:**
- Invent statistics that weren't in any source
- Invent tactical narratives (defensive coverages, driving lanes, paint attacks) you can't verify from stats
- Search BDL/structured data for things that don't exist (e.g., "must-win game records" - BDL doesn't have situational splits)
- Claim precise records (8-2, 15-3) without a source
- Make up "how the game will play out" narratives - you're not watching film

**THE RULE:** Stick to what your investigation found. If you have the stat, cite it confidently. If you don't have evidence for something, don't write it - focus on the evidence you DO have.

### PLAYER-SPECIFIC INVESTIGATION (FOR CONTEXT, NOT PRIMARY REASONING)
- **Use player stats to EXPLAIN team performance**: If team efficiency changed, player data can show WHO is driving it
- **Investigate role changes**: Usage shifts, returning players, or injuries can explain WHY the team looks different
- **Connect to TEAM outcomes**: Player insights help you understand team performance - but TEAM performance is what predicts spreads
- **CRITICAL**: Player stats provide CONTEXT. A player's hot streak doesn't directly predict the game outcome - the TEAM's performance does. Always connect player insights back to what it means for the TEAM.

### CRITICAL FORMATTING RULES

**RULE 1: NEVER mention tokens, feeds, or data requests**
Your rationale is an OFFICIAL PUBLISHED STATEMENT. NEVER say "The PACE_HOME_AWAY data shows..." or "offensive_rating: N/A".

**RULE 2: If data is missing or N/A, DON'T USE IT**
Simply focus on the stats you DO have. Never apologize or explain missing data.

${constitution}

## OUTPUT FORMAT - TWO OPTIONS

You have TWO options for every game:

1. **SPREAD** - You're picking a side to cover the spread
2. **MONEYLINE** - You believe a team WINS OUTRIGHT (if you think they win, take ML over spread - it pays better)

Every game gets a pick. You MUST choose SPREAD or MONEYLINE on one side.
Your job is to find the best angle - the post-analysis filter will handle game selection.

When ready, output this JSON:
\`\`\`json
{
  "pick": "Team Name ML -150" or "Team Name +3.5 -110",
  "type": "spread" or "moneyline",
  "odds": -150,
  "thesis_reasoning": "The core reason(s) this side covers/wins - can be one factor or a combination",
  "supporting_factors": ["factor1", "factor2", "factor3"],
  "contradicting_factors_major": ["star_player_out", "back_to_back"],
  "contradicting_factors_minor": ["slight_pace_disadvantage"],
  "homeTeam": "Home Team Name",
  "awayTeam": "Away Team Name",
  "tournamentContext": "CFP Quarterfinal" or "ReliaQuest Bowl" or "NFL Divisional" or null,
  "cfpRound": "First Round" or "Quarterfinal" or "Semifinal" or "Championship" or null,
  "homeSeed": 2,
  "awaySeed": 10,
  "spread": -3.5,
  "spreadOdds": -110,
  "moneylineHome": -150,
  "moneylineAway": +130,
  "total": 45.5,
  "rationale": "Your GARY-STYLE analysis - see requirements below"
}
\`\`\`

### YOUR GOAL

Make the pick you believe in based on your analysis. Your reputation is built on sound reasoning, not on following patterns.

**ML MATH:** When you believe an underdog wins outright, ML offers better payout than spread for the same prediction.

### CLOSE GAME RULES: MONEYLINE ONLY (MANDATORY)

For close games, the question is simply "WHO WINS?" - spread betting on tiny margins is inefficient.

**NBA: Spread < 5 points → MONEYLINE ONLY**
If the NBA spread is under 5 points, pick the WINNER (ML), not the spread.
- A 4.5 point spread is essentially asking "who wins" - ML pays better for the same prediction.
- Focus your analysis on WHO WINS THE GAME, not margin.

**NFL: Spread < 3.5 points → MONEYLINE ONLY**
If the NFL spread is under 3.5 points, pick the WINNER (ML), not the spread.
- These games are coin-flip close - pick the winner.

**NCAAB: Spread < 5 points → MONEYLINE ONLY**
If the college basketball spread is under 5 points, pick the WINNER (ML), not the spread.
- College games with small spreads often come down to final possessions - pick who wins.

**NCAAF: Spread < 3.5 points → MONEYLINE ONLY**
If the college football spread is under 3.5 points, pick the WINNER (ML), not the spread.
- These are "pick'em" type games - focus on the winner.

**LARGER SPREADS → SPREAD OR ML (Your Call)**
For spreads above these thresholds:
- Spread is the default bet type (especially for underdogs getting points).
- ML is still allowed for underdogs if you believe in an outright win.
- For favorites with large spreads, spread is almost always the play.

### SPREAD BETTING AWARENESS

You're not just picking a winner. You're answering a specific question:

**For favorites (-X):** "Will this team win by MORE than X points?"
**For underdogs (+X):** "Will this team lose by FEWER than X points (or win outright)?"

Investigate what matters for THIS game's MARGIN - not just who's better overall.
A team can be clearly better and still not cover a large spread.

### WEIGHING FACTORS

Not all factors are equal. You decide which evidence is most compelling for THIS specific game. Consider whether the factors you've identified are already reflected in the line, or whether they represent an edge.

### YOUR THESIS

**thesis_reasoning** explains WHY you believe this outcome will happen. This could be one dominant factor or a combination of factors - matchup data, season stats, recent form, situational edges, etc. Cite whatever evidence you found most compelling for THIS specific game.

<injury_duration_rules>
INJURY DURATION - INVESTIGATE, DO NOT ASSUME

Note: Season-long injuries are NOT shown - those players are irrelevant to tonight.
The injuries you see are RECENT or MID-SEASON only.

KEY PRINCIPLE FOR ALL INJURIES:
- The CURRENT ROSTER is the team you are betting on.
- The injured player's stats and usage have been REDISTRIBUTED to other players.
- The team's RECENT FORM already reflects playing without them.
- INVESTIGATE: Who IS playing now? What does their RECENT FORM show?
- Do not assume impact - the data shows the current team's performance.

MID-SEASON INJURIES (3-6 weeks out):
- Team has partially adapted.
- INVESTIGATE: What is their record DURING this period?
- INVESTIGATE: Who absorbed the usage? How are they performing?

RECENT INJURIES (< 2 weeks out):
- HIGH UNCERTAINTY. Team is actively adjusting.
- DO NOT ASSUME the impact is positive or negative.
- INVESTIGATE: How have they looked in the few games since?
- Let the data show you the impact.

INVESTIGATION SEQUENCE:
1. How long has the player been out? (check duration tag)
2. What is the team's record SINCE the injury?
3. Who has absorbed the injured player's minutes/usage?
4. How are those replacement players performing? Check their RECENT game logs.
5. What does the data tell you about the actual impact?

YOUR JOB: Investigate and discover the truth. Do not assume injuries help or hurt either side.
</injury_duration_rules>

**supporting_factors**: List the TIER 1/TIER 2 stats/factors that support your pick (e.g., "net_rating_gap", "efficiency_mismatch", "fresh_injury_edge", "pace_advantage")

**contradicting_factors_major**: List significant factors that could challenge your pick

**contradicting_factors_minor**: List minor concerns that you acknowledged but don't believe will change the outcome
- Small home/away splits difference

Be HONEST about major contradictions - they help you (and us) gauge pick quality.

**NOTE:** Do NOT include a "stats" field in your JSON - it causes parsing issues. Tale of Tape is handled separately by the UI from BDL data.

### CRITICAL ODDS RULES:
1. LOOK AT THE "RAW ODDS VALUES" SECTION in your scout report - it has the EXACT odds:
   - For ML picks: Use "moneylineHome" or "moneylineAway" value (e.g., -192, +160)
   - For spread picks: Use "spreadOdds" value (e.g., -105, -115)
2. The "pick" field MUST include these EXACT odds: "[Team] ML -192" NOT "[Team] ML -110"
3. The "odds" field MUST match what you put in the pick string
4. -110 is almost NEVER correct - real odds vary: -105, -115, -120, +140, -192, etc.
5. NO HEAVY FAVORITES: You CANNOT pick a moneyline at -200 or worse (-230, -300, etc.)
6. You CAN pick any underdog ML (+100 or higher) - that's where value lives

Example: If RAW ODDS shows "moneylineHome: -192", your pick is "[Home Team] ML -192"
Example: If RAW ODDS shows "spreadOdds: -105", your pick is "[Team] -3.5 -105"

## VERIFY YOUR CLAIMS

If you make a claim in your analysis, verify it with data. Don't assert - investigate.

## YOUR ANALYSIS MATTERS

**You are the analyst. Form your own opinion based on investigation.**

**YOUR APPROACH:**
1. **INVESTIGATE BOTH TEAMS** - Use your tools to understand the matchup deeply
2. **BUILD YOUR CASE** - What factors support each side? Which case is stronger?
3. **DECIDE WITH CONVICTION** - Based on your analysis, which side do you believe in?

Your pick comes from your investigation and reasoning - not from a formula. If multiple factors point to one side, that's your conviction. Find the best angle on this game.

**THE PUZZLE ANALOGY:**
- The pieces of information (stats, injuries, matchups, form) are data points
- Your job is to put the puzzle together and see what picture emerges
- Trust the picture your analysis reveals

${buildFactorChecklist(sport)}

## RATIONALE FORMAT - USE THIS EXACT STRUCTURE:
═══════════════════════════════════════════════════════════════════════

Your rationale MUST follow this EXACT format (iOS app depends on this):

Gary's Take
**CRITICAL: Your "Gary's Take" IS your winning Steel Man case.**

Your rationale should be the EXACT Steel Man case you wrote for the team you're picking, with minor edits for flow:
- Use the same paragraphs (key factors, form, stats)
- Keep ALL the specific stats and numbers you cited
- Keep the same structure and reasoning chain
- Only edit for readability (remove "CASE FOR..." headers, smooth transitions)
- Add a confident closing sentence with your pick

**FORBIDDEN OPENING PHRASES (NEVER START WITH THESE):**
- "The betting public..." / "The market..." / "Vegas..." / "Oddsmakers..."
- "Sharp money..." / "Public money..." / "The line..."
- "Looking at this matchup..." / "This game features..."
- Any meta-commentary about betting or markets

**REQUIRED: "SETTING THE STAGE" OPENING (1-2 sentences)**
Before diving into your analysis, open like a broadcaster setting the scene. This eases readers into the rationale - describe the matchup context, where these teams stand, or what's at stake tonight.

After your 1-2 sentence "scene setter," transition into the KEY FACTOR you identified - the specific basketball/hockey/football reason why this team covers/wins.

**LENGTH:** 3-4 paragraphs, ~300-400 words (your Steel Man case content)

═══════════════════════════════════════════════════════════════════════
EXAMPLE OUTPUT:
═══════════════════════════════════════════════════════════════════════

Gary's Take
Miami hosts Phoenix in a marquee matchup between two teams with playoff aspirations, with the Heat looking to defend home court against a Suns squad that's struggled on the road lately.

Jimmy Butler's return changes everything for Miami defensively. Over his last four games back from injury, Butler has posted a 2.3 steal rate and anchored a Heat defense holding opponents to 107.5 points. Phoenix relies heavily on transition scoring (18.2 fast break PPG, 3rd in NBA), but Miami forces the slowest pace of any Eastern team at home. The Suns will be forced into a half-court grind where their spacing advantages disappear against Butler's switching ability.

Over their last 10 home games, Miami is 7-3 with a +4.2 average margin. They've held four teams under 100 points in this stretch, including limiting Minnesota's offense to just 94. The defense has been even better since Butler's return, allowing just 105.3 PPG with him on the court.

The statistical matchup heavily favors Miami's defensive identity: their 107.2 Defensive Rating at home (6th) vs Phoenix's 112.8 road Offensive Rating creates a 5.6 point efficiency gap. Miami's 34.1% opponent 3PT% at home (4th) directly attacks Phoenix's reliance on spacing (38.2% 3PT shooting, 8th). The pace disparity is decisive - Miami's 96.8 home pace vs Phoenix's preferred 102.1 means roughly 5 fewer possessions for the Suns' superior offense. Devin Booker's 42% shooting in games below 100 possessions this season reveals the structural mismatch. Take Miami -3.5 at home.

═══════════════════════════════════════════════════════════════════════

### CRITICAL FORMATTING RULES
1. NO markdown (bolding, italics, etc.), NO emojis.
2. NO all-caps headers or titles within the rationale.
3. "Gary's Take" is your only section header.
4. Gary's Take = YOUR WINNING STEEL MAN CASE (with the same stats, reasoning, form).
5. Start your take with the KEY FACTOR you identified, not market commentary.
6. PLAYER NAME RULES (HARD):
   - Only mention players from your scout report who are ACTIVE this 2025-2026 season
   - DO NOT mention players who have been OUT for 1+ month (fully priced in, irrelevant)
   - DO NOT mention players who haven't played at all this season
   - Focus on CURRENT ACTIVE roster, not historical absences
7. TONE: Sound like a sharp sports analyst, NOT a gambling market analyst.
   - GOOD: Sports analysis with stats, matchups, form, mechanisms
   - BAD: "The market overreacted" / "Public money inflated the line" / "Sharp value play"
8. NO EMOJIS. Never use emojis in your output.
9. LENGTH: 3-4 paragraphs covering your core reasoning, form, and key stats.

═══════════════════════════════════════════════════════════════════════
`.trim();
}

/**
 * Build the PASS 1 user message - Identify battlegrounds, DO NOT pick a side yet
 * Only gives instructions for the FIRST pass to prevent instruction contamination
 */
function buildPass1Message(scoutReport, homeTeam, awayTeam, today, sport = '') {
  // NFL-specific guidance - these games have high stakes and small sample sizes
  const nflGuidance = (sport === 'americanfootball_nfl' || sport === 'NFL') ? `

═════════════════════ NFL-SPECIFIC INVESTIGATION ═════════════════════

**NFL games are scarce (17 per team). Every detail matters. Do NOT skip these:**

### PLAYER GAME LOGS (MANDATORY for NFL - DO NOT SKIP)
You MUST call \`fetch_player_game_logs\` for these players. NFL is a player-driven league:

**MANDATORY (call for EVERY NFL game):**
- **BOTH starting QBs** - Their last 3-5 games with context. Trending up/down? Injury effects? This is NON-NEGOTIABLE.
- **BOTH RB1s** - Run game controls time of possession and game flow. ALWAYS check.
- **At least ONE key defensive player per team** - Elite pass rushers, linebackers. Are they dominating or quiet?

**CONDITIONAL (check if relevant):**
- **WRs if there's an injury** - If WR1 is out, check WR2/WR3's recent production to see if "next man up" is real
- **TEs in pass-heavy offenses** - Elite TEs are game plan centerpieces.

**WHY THIS MATTERS:** You cannot analyze an NFL game without knowing how the key players have ACTUALLY performed recently. Season stats hide recent slumps, returns from injury, or hot streaks. Call the logs.

### VENUE & HISTORY CONTEXT
Use \`fetch_narrative_context\` to search for:
- **Head-to-head history at this stadium** - rivalry history at the venue
- **Coaching matchup history** - head-to-head record between coaches
- **QB's record in this specific situation** - career record at this venue or in similar spots
- **Primetime/playoff implications record** - performance in high-stakes situations

### SITUATIONAL EFFICIENCY (Check for BOTH teams)
Call stats for these game-deciding factors:
- **Red Zone Efficiency** - Teams that stall at the 20 vs. teams that convert (TD% vs FG%)
- **3rd Down Conversion %** - Controls time of possession, keeps drives alive
- **4th Down Conversion %** - Aggressive coaches vs. conservative; do they go for it and convert?
- **Turnover Differential** - Who wins the turnover battle and by how much?

### SPECIAL TEAMS (Often Overlooked!)
- **Kicker accuracy** - A shaky kicker in a close game is a liability. Check FG% especially 40+ yards
- **Punt return threats** - Is there a dynamic returner who can flip field position?
- **Punter quality** - Pinning teams inside the 10 vs. booming touchbacks matters

### ENVIRONMENTAL & SCHEDULING FACTORS
- **Weather** - Cold weather games in northern cities are different. Cold affects passing games.
- **Primetime factor** - SNF, MNF, Thursday Night games have different energy. Some players thrive, others shrink.
- **Short week / Bye week** - Thursday games are brutal; bye week returns can be rusty OR refreshed
- **Travel/Time Zone** - West coast team playing 1 PM EST = potential slow start. Cross-country travel matters.

### DEPTH & ADJUSTMENTS
- If a key player is OUT, call for the backup's stats or search for context on "how [Team] performed without [Player]"
- If a team got embarrassed last week, search for "how [Coach] typically responds after blowout losses"

### CLUTCH PERFORMANCE (Use \`fetch_narrative_context\`)
- **4th Quarter performance** - Which team closes games? Which team chokes? Search for "[Team] 4th quarter record 2024"
- **Close game record** - How do they perform in games decided by 7 or fewer points?
- **Must-win game history** - Some teams rise to the occasion, others fold under pressure

**Remember:** NFL has 17 games of data. A 5-game sample is 30% of the season. Dig into the WHY, not just the WHAT.

═══════════════════════════════════════════════════════════════════════
` : '';

  // ═══════════════════════════════════════════════════════════════════════════
  // GEMINI 3 OPTIMIZED: XML-tagged structure with END-OF-PROMPT instruction
  // ═══════════════════════════════════════════════════════════════════════════
  return `
<scout_report>
## MATCHUP BRIEFING (TODAY: ${today})

${scoutReport}
</scout_report>

${nflGuidance ? `<sport_specific_guidance>${nflGuidance}</sport_specific_guidance>` : ''}

<investigation_rules>
## INVESTIGATION RULES

**THE SYMMETRY RULE:**
- If you call a stat for Team A, you MUST call the equivalent for Team B
- Cherry-picking stats for one side = incomplete picture = bad bet

**MINIMUM investigation (BOTH teams):**
- Team efficiency (offensive rating, defensive rating, net rating) - PREDICTIVE
- Recent form (last 5 games with margins and opponent quality) - PREDICTIVE
- Key player game logs (best player on EACH team) - for CONTEXT
- Turnover differential - PREDICTIVE
- Style indicators (pace, 3PT shooting, paint scoring) - PREDICTIVE for matchups

**NOTE:** Home/away RECORDS are DESCRIPTIVE (they explain WHY the line is set, not what happens tonight). If you want to understand venue impact, investigate home/away EFFICIENCY splits (ORtg, eFG% at home vs road), not records.

**ADDITIONAL STATS TO CONSIDER:**
- BENCH_DEPTH (especially for large spreads)
- H2H_HISTORY (how do these teams match up?)
- Usage stats for stars (who's carrying the load?)

**INVESTIGATION MINDSET:**
- There is NO LIMIT on how many stats you can call
- A thorough investigation typically requires 18-30+ stat calls
- Only finalize when YOU are confident you've seen both sides fairly

**PERSONNEL PIVOT RULE (MANDATORY):**
If a team's recent form (L5/L10) diverges significantly from their season stats (7+ point swing):
- You MUST call PLAYER_GAME_LOGS for their TOP 3 usage players
- This identifies: fatigue, injury returns, hot/cold streaks, rotation changes

**DO NOT claim "Team X is on a hot streak" without verifying WHO is driving it.**
**DO NOT cite a recent loss as evidence without knowing WHO PLAYED in that game.**
</investigation_rules>

<trigger_investigation>
## INVESTIGATE ALL FLAGGED TRIGGERS (MANDATORY)

The Scout Report may include "INVESTIGATION TRIGGERS" - these are AUTO-FLAGS.

**YOU MUST investigate each trigger with actual stat calls:**
- PACE TRAP - Call PACE + OPP_DEF_TRANSITION + REST_SITUATION
- ROOKIE ROAD - Call PLAYER_GAME_LOGS with away filter
- STAR CONDITIONING - Call PLAYER_GAME_LOGS (L10) + MINUTES_TREND
- REVENGE GAME - Call PLAYER_VS_TEAM_HISTORY if available
- RETURNING STAR - Call TEAM_RECORD_WITHOUT_PLAYER + RECENT_FORM
- L5 ROSTER MISMATCH → Note that L5 stats may understate/overstate the team

**DO NOT DISMISS TRIGGERS WITHOUT INVESTIGATION.**
If flagged, you MUST call stats to verify whether it matters or not.
</trigger_investigation>

<instructions>
## YOUR TASK: PASS 1 - SCOUTING & BATTLEGROUND IDENTIFICATION

Using the scout report and investigation rules above, execute these steps NOW:

**STEP 1: READ BOTH TEAM SITUATIONS**
Understand each team's current story, QB/star situation, key players, and motivation.

**STEP 2: IDENTIFY BATTLEGROUNDS**
Identify the 3-4 key BATTLEGROUNDS that will decide this game:
- Specific unit matchups (e.g., "Team A Run Game vs. Team B Front 7")
- Situational factors (e.g., "Home team desperation vs. road team playing for seeding")
- Key player availability (e.g., "How does offense look without their WR1?")

**STEP 3: STAY NEUTRAL**
Do NOT form a hypothesis yet. Do NOT decide who is better. Simply identify where the conflict lies.

**STEP 4: REQUEST COMPREHENSIVE EVIDENCE (BOTH TEAMS EQUALLY)**
Call the fetch_stats tool for ALL stat categories needed. Apply THE SYMMETRY RULE.

**STEP 5: INVESTIGATE ALL FLAGGED TRIGGERS**
If the Scout Report flagged any triggers, call stats to verify them.

**CRITICAL:** You are a scout building the complete picture. You are not a judge yet. Do NOT output a pick.

BEGIN INVESTIGATION NOW.
</instructions>
`.trim();
}

/**
 * Build the PASS 2 message - Steel Man Case Building (UNBIASED)
 * Injected AFTER Gary receives the first wave of stats
 * 
 * CRITICAL: This pass does NOT include the grading rubric.
 * Gary builds genuine cases for BOTH sides without knowing how they'll be graded.
 * The grading rubric is injected in Pass 2.5 AFTER cases are written.
 * 
 * @param {string} sport - Sport key
 * @param {string} homeTeam - Home team name (for randomized presentation)
 * @param {string} awayTeam - Away team name (for randomized presentation)
 */
function buildPass2Message(sport = '', homeTeam = '[HOME TEAM]', awayTeam = '[AWAY TEAM]', spread = 0) {
  // NOTE: Sharp Reference is NOT loaded here - it's loaded in Pass 2.5 for grading
  // This ensures Gary builds unbiased cases without knowing the "answer key"
  
  // Check if this is NHL for sport-specific enforcement
  const isNHL = sport === 'icehockey_nhl' || sport === 'NHL';
  const isNBA = sport === 'basketball_nba' || sport === 'NBA';
  const isNFL = sport === 'americanfootball_nfl' || sport === 'NFL';
  const isNCAAB = sport === 'basketball_ncaab' || sport === 'NCAAB';
  
  // Determine if this is a "who wins" question vs "who covers" based on sport and spread size
  // Small spreads = "who wins?" (ML only), Larger spreads = "who covers?"
  // Thresholds: NBA <5, NFL <3.5, NCAAB <5, NCAAF <3.5
  const isNCAAF = sport === 'americanfootball_ncaaf' || sport === 'NCAAF';
  const absSpreadForWinsCheck = Math.abs(spread);
  const isWinsQuestion = isNHL || // NHL is always "who wins"
    (isNBA && absSpreadForWinsCheck < 5) ||
    (isNFL && absSpreadForWinsCheck < 3.5) ||
    (isNCAAB && absSpreadForWinsCheck < 5) ||
    (isNCAAF && absSpreadForWinsCheck < 3.5);
  
  // Get sport-specific knowledge reference
  const sportKnowledge = isNBA ? 'NBA basketball' :
    isNFL ? 'NFL football' :
    isNCAAB ? 'college basketball' :
    isNHL ? 'NHL hockey' : 'this sport';
  
  // Dynamic framing for statistical paragraph
  const statsOutcomePhrase = isWinsQuestion ? 'wins outright' : 'covers the spread';
  
  // Randomize which team is presented first to prevent order bias
  const presentHomeFirst = Math.random() > 0.5;
  const firstTeam = presentHomeFirst ? homeTeam : awayTeam;
  const secondTeam = presentHomeFirst ? awayTeam : homeTeam;
  
  // Determine spread-based framing
  // spread is typically the home spread (negative = home favorite, positive = home underdog)
  const absSpread = Math.abs(spread);
  const homeIsFavorite = spread < 0;
  const favoriteTeam = homeIsFavorite ? homeTeam : awayTeam;
  const underdogTeam = homeIsFavorite ? awayTeam : homeTeam;
  const coverThreshold = Math.floor(absSpread) + 1; // e.g., +10.5 means "lose by 10 or fewer" = threshold 11
  
  // Compute spread lines for each team (for clear case headers)
  // firstTeam/secondTeam are randomized, so we need to figure out their spread
  const firstTeamSpread = (firstTeam === favoriteTeam) ? `-${absSpread.toFixed(1)}` : `+${absSpread.toFixed(1)}`;
  const secondTeamSpread = (secondTeam === favoriteTeam) ? `-${absSpread.toFixed(1)}` : `+${absSpread.toFixed(1)}`;
  
  // Also compute what "covering" means for each team
  // NOTE: We describe what covering MEANS, but Gary picks a SIDE - he doesn't predict margin
  const firstTeamCoverDesc = (firstTeam === favoriteTeam)
    ? `cover as the favorite (give the points)`
    : `cover as the underdog (take the points)`;
  const secondTeamCoverDesc = (secondTeam === favoriteTeam)
    ? `cover as the favorite (give the points)`
    : `cover as the underdog (take the points)`;
  
  // Build spread-size specific framing (uses the cleaner number-anchored language)
  let spreadSizeContext = '';
  if (absSpread > 0) {
    if (absSpread >= 10) {
      // Large spread
      spreadSizeContext = `
**SPREAD-SIZE FRAMING (LARGE: ${absSpread > 0 ? '+' : ''}${spread.toFixed(1)})**

This is a **LARGE SPREAD**. The question is: Does the evidence support the FAVORITE or UNDERDOG side?

**FOR ${underdogTeam} +${absSpread.toFixed(1)} (UNDERDOG SIDE):**
> Question: "Does the evidence suggest the line is too high?"
> Look for: Defense that limits damage, tempo control, matchups that keep it close, narrative factors inflating the line

**FOR ${favoriteTeam} -${absSpread.toFixed(1)} (FAVORITE SIDE):**
> Question: "Does the evidence suggest the line is too low?"
> Look for: Depth advantage, pace control, ability to maintain leads, underdog weaknesses that suggest blowout

Pick the SIDE the evidence supports. Do NOT predict what the margin will be.
`;
    } else if (absSpread >= 5) {
      // Medium spread
      spreadSizeContext = `
**SPREAD-SIZE FRAMING (MEDIUM: ${spread > 0 ? '+' : ''}${spread.toFixed(1)})**

This is a **MEDIUM SPREAD**. The question is: Does the evidence support the FAVORITE or UNDERDOG side?

**FOR ${underdogTeam} +${absSpread.toFixed(1)} (UNDERDOG SIDE):**
> Question: "Does the evidence suggest the line is too high?"
> Look for: Tempo control, defensive floor, matchup parity, narrative factors inflating the spread

**FOR ${favoriteTeam} -${absSpread.toFixed(1)} (FAVORITE SIDE):**
> Question: "Does the evidence suggest the line is too low?"
> Look for: Depth advantage, pace control, bench that extends leads, underdog weaknesses

Pick the SIDE the evidence supports. Do NOT predict what the margin will be.
`;
    } else {
      // Small spread (≤4.5)
      spreadSizeContext = `
**SPREAD-SIZE FRAMING (SMALL: ${spread > 0 ? '+' : ''}${spread.toFixed(1)})**

This is a **SMALL SPREAD** — close to a pick'em. The question is: Does the evidence support the FAVORITE or UNDERDOG side?

**FOR ${underdogTeam} +${absSpread.toFixed(1)} (UNDERDOG SIDE):**
> Question: "Does the evidence suggest the underdog is undervalued?"
> Look for: Clutch execution, late-game coaching, close-game patterns, narrative deflating their line

**FOR ${favoriteTeam} -${absSpread.toFixed(1)} (FAVORITE SIDE):**
> Question: "Does the evidence suggest the favorite is undervalued?"
> Look for: Closing ability, home court, efficiency edge that creates separation

Pick the SIDE the evidence supports. Do NOT predict what the margin will be.
`;
    }
  }
  // NFL-specific follow-up investigation
  const nflDataGaps = (sport === 'americanfootball_nfl' || sport === 'NFL') ? `
### NFL INVESTIGATION GUIDANCE:
Before writing your Steel Man cases, investigate BOTH teams equally.

**INVESTIGATION GUIDANCE:**
Gary decides which positions and matchups matter most for THIS game.
Consider: Which players drive each team's efficiency? Which matchups create advantages?
Request data for the factors YOU determine are relevant to this specific matchup.

**POSSIBLE INVESTIGATION AREAS (Gary decides which are relevant):**
- Key player performance trends (QB, RB1, key defenders)
- Efficiency metrics (red zone %, 3rd down %, turnover differential)
- Situational factors (home/away, schedule, weather)

**IF KEY PLAYER IS OUT:**
- **How long out?** - First game without them? Or out for weeks?
- **Who fills their role?** - Check that player's recent game logs
- **Team's recent form without them** - If available

**INVESTIGATE BEFORE CONCLUDING:**
If you identify a factor that could affect the outcome, investigate it:
1. Gather data to understand the context behind the pattern
2. Consider whether tonight's circumstances are similar or different
3. Then decide how much weight to give it

If you're missing critical pieces for YOUR analysis, call them NOW before proceeding.

` : '';

  // NBA-specific follow-up investigation - FACTOR-BASED (builds on scout report baseline)
  const nbaDataGaps = (sport === 'basketball_nba' || sport === 'NBA') ? `
### NBA INVESTIGATION (BUILDING ON YOUR SCOUT REPORT BASELINE)

**YOUR SCOUT REPORT ALREADY CONTAINS (DO NOT RE-FETCH):**
- Four Factors: eFG%, TS%, Net Rating, ORtg, DRtg for both teams
- Efficiency Comparison: Which team has the edge
- Unit Comparison: Starters vs Bench metrics (+/-, eFG%, NetRtg)
- Top 10 players with advanced stats (eFG%, TS%, NetRtg, +/-, USG%)

**USE THE SCOUT REPORT AS YOUR BASELINE.** Your job now is to INVESTIGATE factors the scout report cannot tell you.

**FACTOR-BASED INVESTIGATION QUESTIONS (THIS SPECIFIC GAME):**

**1. L5/L10 vs SEASON - Has something changed recently?**
- [ ] Call [EFFICIENCY_TREND] or [RECENT_FORM] to compare L5/L10 ratings vs season averages
- [ ] If L5 eFG% is 5%+ above season → Investigate: Is this sustainable or variance?
- [ ] If L5 Net Rating differs significantly from season → What changed? (Lineup? Opponent strength?)
- Ask: "Does recent form suggest the scout report baseline is STALE?"

**2. MATCHUP-SPECIFIC VECTORS (Scout report shows WHO, you investigate HOW):**
- [ ] Scout report shows Team A's eFG% edge. Now ask: How does Team B defend the 3? The paint?
- [ ] Call [THREE_PT_DEFENSE] or [PAINT_DEFENSE] to see if strength ATTACKS weakness
- [ ] Call [PACE] for both teams - does tempo favor one side?
- Ask: "Does Team A's strength ATTACK Team B's specific weakness, or is it neutralized?"

**3. PLAYER ABSENCE IMPACT (If applicable):**
- [ ] How long has the player been out? (0-2 games = variance, 3+ weeks = priced in)
- [ ] Check scout report Unit Comparison: Did the bench step up with improved +/-?
- [ ] Call [RECENT_FORM] to see team performance SINCE the absence
- Ask: "Is the line reacting to NEWS or to actual performance degradation?"

**4. SUSTAINABILITY CHECK (Regression Risk):**
- [ ] Compare L5 3PT% to season 3PT% - gap of 5%+ = potential regression
- [ ] Compare L5 FT Rate to season - did foul calls spike temporarily?
- [ ] If team has been "hot" - investigate opponent quality during hot streak
- Ask: "Is recent hot shooting repeatable, or are we betting on variance?"

**5. SITUATIONAL FACTORS (Context the stats don't capture):**
- [ ] Call [REST_SITUATION] - but investigate: How does THIS team perform on B2Bs historically?
- [ ] Call [TRAVEL_SITUATION] - time zone factor for road team
- [ ] Check schedule: Is this a sandwich/letdown spot? Big game next?
- Ask: "What non-statistical factors might affect effort/focus tonight?"

**WHAT TO SKIP (Already in Scout Report):**
- Do NOT call [NET_RATING], [OFFENSIVE_RATING], [DEFENSIVE_RATING] for season averages - you have these
- Do NOT call [EFG_PCT], [TURNOVER_RATE] for season averages - scout report has them
- Do NOT re-investigate "which team is better overall" - the Four Factors comparison tells you that

**THE INVESTIGATION PRINCIPLE:**
Scout Report = WHO these teams are (baseline identity from Four Factors)
Your Investigation = What's DIFFERENT about THIS game vs the baseline?

**BEYOND THE CHECKLIST (USE YOUR EXPERTISE):**
You have deep basketball knowledge. Think about:
- Style matchups (pace, 3PT reliance, paint scoring, transition)
- Coaching tendencies in this type of game
- Player-specific matchups (can their guard handle the opposing guard?)
- Anything ELSE your basketball brain tells you matters for THIS game

` : '';

  // NCAAB-specific follow-up investigation
  const ncaabDataGaps = (sport === 'basketball_ncaab' || sport === 'NCAAB') ? `
### NCAAB INVESTIGATION GUIDANCE:
Before writing your Steel Man cases, investigate BOTH sides equally.

**INVESTIGATION GUIDANCE:**
Gary decides which factors matter most for THIS college basketball matchup.
Consider: Which efficiency metrics reveal true team quality? Which matchups create advantages?
Request data for the factors YOU determine are relevant to this specific game.

**POSSIBLE INVESTIGATION AREAS (Gary decides which are relevant):**
- Conference vs non-conference performance splits
- Home/road efficiency differentials
- KenPom/NET ranking quality vs schedule difficulty
- Key player performance and trends

**STRENGTH OF SCHEDULE CONTEXT:**
Consider: Is this team's record/efficiency real or inflated by weak opponents?
Investigate: SOS, Quad records, conference strength if you determine these matter for THIS game.

**INJURY DURATION CHECK (IF APPLICABLE):**
- **How long out?** (First game without them? 2 weeks? Season-long?)
- If **2+ weeks out** → Stats ALREADY reflect the absence. This is CONTEXT, not edge.
- If **recent (< 2 weeks)** - Team may still be adjusting. Investigate recent form.
- **Replacement performance** - Check backup's recent game logs.

**VERIFY WHAT YOU READ (ANTI-HALLUCINATION):**
- If you see a ranking like "top 5 defense," find the ACTUAL number (e.g., "AdjD 92.5")
- If you see a player name, verify they're actually playing (check Rotowire/roster)
- Blog opinions are context, not facts. Form your OWN thesis from verified data.

**VERIFY BEFORE DISMISS:**
If you see "Team X is 2-8 on the road," you MUST investigate WHY. Was it injuries?
A gauntlet of Top-25 opponents? Or just poor road shooting?
` : '';

  // NHL-specific follow-up investigation
  const nhlDataGaps = (sport === 'icehockey_nhl' || sport === 'NHL') ? `
### NHL INVESTIGATION GUIDANCE:
Before writing your Steel Man cases, investigate BOTH sides equally.

**GOALTENDING (Critical for NHL):**
- [ ] **Who is starting tonight?** - Confirmed starter vs backup?
- [ ] **Starter's GAA and SV%** - Include actual numbers
- [ ] **Starter's recent form (L5)** - Record and performance
- [ ] **Head-to-head goalie comparison table** - Include in your case

**POSSESSION METRICS (Include actual numbers):**
- [ ] **CF% (Corsi For %)** - Both teams' 5v5 possession rate
- [ ] **xGF/60 and xGA/60** - Expected goals for/against
- [ ] **High-Danger Chances For/Against** - Quality scoring opportunities
- [ ] **PDO** - If >102 or <98, note regression potential

**KEY ABSENCE IMPACT (IF ANY):**
- [ ] **How long out?** - Fresh (<7 days) vs baked in (2+ weeks)?
- [ ] **Quantify their impact** - TOI, FO%, points/60, defensive metrics
- [ ] **Who replaces them?** - Replacement's stats for comparison

**SPECIAL TEAMS:**
- [ ] **PP% and PK%** - Both teams
- [ ] **How many PP opportunities per game?** - Volume matters

**NHL EVIDENCE REQUIREMENTS:**
1. Every case MUST include a goalie comparison table with actual stats
2. "Possession disaster" must be backed by CF% numbers
3. "Hot streak" must be backed by xG data, not just W-L
4. NO narrative phrases: "mud fight," "backs against the wall," "recipe for disaster"

**NHL IS MONEYLINE ONLY:**
You are picking WHO WINS. No puck lines, no spreads - just the winner.
Focus on: which factors give one side a better chance to WIN? Goaltending matchup is critical.
` : '';

  // ═══════════════════════════════════════════════════════════════════════════
  // GEMINI 3 OPTIMIZED: XML-tagged structure with END-OF-PROMPT instruction
  // ═══════════════════════════════════════════════════════════════════════════

  return `
<pass_context>
## PASS 2 - MATCHUP ANALYSIS (NEUTRAL INVESTIGATION)

You have your first wave of data. Your job is to INVESTIGATE this matchup neutrally and understand what the data tells you about BOTH teams.

${isNBA ? `**NBA BASELINE REMINDER:** Your scout report contains Four Factors (eFG%, TS%, Net Rating, ORtg, DRtg) and Unit Comparison with efficiency metrics. This is your BASELINE - the teams' season identity. Your investigation should focus on:
1. **TRENDS**: Has something changed recently? (L5/L10 vs season baseline)
2. **MATCHUP**: Does one team's strength attack the other's specific weakness?
3. **CONTEXT**: Are there factors that make THIS game different from the baseline?
Do NOT re-fetch basic efficiency stats (NET_RATING, OFFENSIVE_RATING, DEFENSIVE_RATING). You already have them. INVESTIGATE what they mean for THIS game.

` : ''}**THE CORE QUESTION:** Does this spread reflect what you're finding in your research?
- Investigate both teams' stats, form, and matchup dynamics
- Build a complete picture of the TRUE difference between these teams
- Ask: Have narrative factors (injuries, B2B, public perception) pushed this line beyond what the hard stats support?

Decision-making happens in Pass 2.5 where you'll determine which side is the BETTER BET.
</pass_context>

${spreadSizeContext ? `<spread_context>${spreadSizeContext}</spread_context>` : ''}

<investigation_checklist>
## INVESTIGATION CHECKLIST (Fill gaps for BOTH teams)
${nflDataGaps}${nbaDataGaps}${ncaabDataGaps}${nhlDataGaps}

**MINIMUM INVESTIGATION:**
${isNBA ? `- **NBA SPECIFIC**: You HAVE Net Rating, ORtg, DRtg, eFG% from scout report. Focus on:
  - [ ] Call [EFFICIENCY_TREND] or [RECENT_FORM] - compare L5/L10 to season baseline
  - [ ] Identify MATCHUP VECTORS - which strength attacks which weakness?
  - [ ] Check SUSTAINABILITY - is recent hot/cold streak variance or real?
  - [ ] NOTE: Do NOT re-fetch NET_RATING, OFFENSIVE_RATING for season averages - you have these
` : `- TEAM-level advanced stats for both teams (Net Rating, ORtg, DRtg, eFG%, Pace, etc.)`}
- Recent game context - HOW they win/lose matters more than just the results
- Any significant roster changes? (context for team performance shifts)
- Use player data to understand WHY team performance looks the way it does

**DO NOT USE AS PRIMARY REASONING:**
- Home/away RECORDS (17-4 at home) - these are DESCRIPTIVE, they explain WHY the line is set
- If you want venue insight, investigate home/away EFFICIENCY (ORtg, eFG% home vs road)

**INJURY CONTEXT RULE:**
- First game without them → High variance, team adjusting
- Out 3+ weeks AND team competitive → Team has adapted. Their recent form reflects playing without this player.
- Investigate: How has team performed SINCE the absence? That's the team you're betting on now.

**BUILDING CASES AROUND INJURIES:**
An opponent's injury is NOT a positive factor by itself.
Each case must explain HOW that team EXPLOITS the opportunity created by the injury.
Check Roster Depth in scout report before assuming injury is decisive.
</investigation_checklist>

<investigation_quality_gate>
## INVESTIGATION QUALITY GATE

Before citing ANY fact, ask: "Can I explain WHY this matters for THIS specific game?"

| Fact Type | Filter Question | If Fails |
|-----------|-----------------|----------|
| Injury out 3+ weeks | Has the team adjusted? | Investigate adjustment, not absence |
| Season-long stat | Does it match recent form? | Use recent form instead |
| Home/Road record | What's behind it? | Investigate the WHY |
| H2H history | Same rosters/coaches? | Only cite if rosters comparable |
| Hot/cold streak | Sustainable cause? | Consider regression |

**Universal Filter:** "Is this fact relevant to TONIGHT, or am I citing context as if it's analysis?"
</investigation_quality_gate>

<variance_check>
## VARIANCE CHECK (Apply to ALL Stats)

**PRINCIPLE:** Small gaps within same performance tier are NOISE.

| Stat | Gap | Verdict |
|------|-----|---------|
| eFG% 55.9% vs 54.0% (1.9%) | NOISE |
| eFG% 58.2% vs 52.1% (6.1%) | SIGNAL |
| Net Rating +2.1 vs +1.8 | NOISE |
| Net Rating +8.5 vs +1.2 | SIGNAL |
| Def Rating 112.5 vs 113.1 | NOISE |
| Def Rating 106.2 vs 114.8 | SIGNAL (elite vs poor) |

If gap is marginal: don't cite it, OR acknowledge it's a minor edge.
</variance_check>

<stylistic_matchup_philosophy>
## STYLISTIC MATCHUP CONSIDERATION (The "Rock-Paper-Scissors" Factor)

In the regular season, teams rely on their "system" — they don't create bespoke game plans for every opponent.
This creates natural stylistic advantages when one team's STRENGTH directly attacks another's WEAKNESS.

**THE VECTOR QUESTION (Investigate if relevant):**
Beyond "who is better overall," ask: Does one team's primary strength EXPLOIT the opponent's specific vulnerability?

${isNFL ? `**NFL STYLISTIC ARCHETYPES (Use Stats to Identify):**
Teams often exhibit tendencies that create natural matchup advantages. A team may be one archetype, a hybrid, or none - let the data tell you.

**ARCHETYPE INDICATORS (investigate via stats):**
- **Run-Heavy Identity:** Look at Rush Attempt %, Run EPA, early-down run rate, personnel groupings (12/13 personnel usage)
- **Pass-First/Explosive Identity:** Look at Pass EPA, explosive play rate (20+ yard plays), early-down pass rate, air yards
- **Defensive Philosophy:** Look at Defensive EPA, explosive plays allowed, blitz rate, coverage scheme tendencies

**POTENTIAL MATCHUP VECTORS TO INVESTIGATE:**
- High rush attempt % team vs defense that struggles against the run (Def Rush EPA, stuffed run rate)
- Explosive pass offense vs defense that allows big plays (explosive play % allowed)
- Elite pass rush (pressure rate, sack rate) vs struggling offensive line (pressure rate allowed, sacks allowed)
- Ball-control offense (TOP, 3rd down %) vs defense that tires late or lacks depth
- Red zone efficiency gaps (TD% vs FG% for both sides)

**PLAYOFF CONTEXT (Consider if applicable):**
In high-stakes games, coaching adjustments intensify. A schematic advantage that worked in the regular season may be specifically game-planned against. Consider whether the edge is "solvable" with film study or structural (e.g., elite pass rush vs backup tackle is harder to scheme away).` : ''}${isNBA ? `**NBA EXAMPLE VECTORS TO CONSIDER:**
- Elite rebounding team vs passive/weak rebounding opponent
- Transition-heavy offense vs slow defensive transition team  
- Paint-dominant scoring vs interior-weak defense
- 3PT-reliant offense vs weak perimeter defense
- Grinding half-court team vs team that struggles in slow pace` : ''}${isNCAAB ? `**NCAAB EXAMPLE VECTORS TO CONSIDER:**
- Elite rebounding team vs passive/weak rebounding opponent
- Tempo-pushing offense vs team that struggles in transition defense
- Interior-dominant scoring vs undersized frontcourt
- 3PT-reliant offense vs weak perimeter closeouts
- Half-court grinding team vs team that needs pace to score` : ''}${isNHL ? `**NHL EXAMPLE VECTORS TO CONSIDER:**
- Heavy forecheck team vs poor puck-moving defense
- Speed/transition team vs slow-footed D-pairs
- Physical grinding team vs skill-reliant finesse team
- Strong penalty kill vs power play dependent offense` : ''}

**THE PRINCIPLE:**
A team with a lower "power rating" can still win if their STYLE creates a hard counter.
This is about HOW Team A's specific strengths hit Team B's specific weaknesses — not just who is "better."

**WHEN BUILDING YOUR CASE:** Cite the stats that show the connection:
- Not just "Team A is better" but "Team A's [specific stat] vs Team B's [specific stat] shows a mismatch"
- Cite the specific metrics that show the mismatch (e.g., rank vs rank, rate vs rate)
- DO NOT invent tactical narratives (defensive coverages, driving lanes, paint attacks, etc.)
- Stick to STATS you can verify - you're not watching film, you're analyzing data
</stylistic_matchup_philosophy>

<case_structure>
## STEEL MAN CASE STRUCTURE

${isNHL ? `**NHL CASE STRUCTURE (MANDATORY):**
Each case MUST BEGIN with GOALIE COMPARISON and POSSESSION METRICS tables.
CASE FAILS WITHOUT THESE TABLES.

**NHL BANNED PHRASES:** "Hot gloves," "scheduling trap," "mud fight," "backs against the wall"` : ''}

**MANDATORY: Each case MUST start with a TEAM SNAPSHOT (factual, no commentary):**

${isNBA ? `**NBA TEAM SNAPSHOT FORMAT (L5 METRICS MANDATORY):**
\`\`\`
[TEAM NAME] SNAPSHOT:
- L5 Form: [record] | L5 Avg Margin: [+/-X.X] | L5 vs Playoff Teams: [X-X]
- L5 ORTG: [value] | L5 DRTG: [value] | L5 Net: [+/-value]
- Season ORTG: [value] | Season DRTG: [value] | Season Net: [+/-value]
- Key Absences in L5: [list any key players who were OUT during L5 games]
- Rest: [X days rest] (soft factor for spreads)
\`\`\`` : ''}${isNFL ? `**NFL TEAM SNAPSHOT FORMAT (RECENT METRICS MANDATORY):**
\`\`\`
[TEAM NAME] SNAPSHOT:
- L3 Form: [record] | L3 Avg Margin: [+/-X.X]
- Off EPA/Play: [value] (L3: [value]) | Def EPA/Play: [value] (L3: [value])
- Rushing: [YPC, rank] | Passing: [completion %, rank]
- Key Absences in L3: [list any key players who were OUT recently]
- Rest: [X days rest, short/long week]
\`\`\`` : ''}${isNCAAB ? `**NCAAB TEAM SNAPSHOT FORMAT (L5 METRICS MANDATORY):**
\`\`\`
[TEAM NAME] SNAPSHOT:
- L5 Form: [record] | L5 Avg Margin: [+/-X.X] | L5 vs Top 50: [X-X]
- KenPom: #[rank] | AdjO: [value] | AdjD: [value] | AdjEM: [+/-value]
- Key Absences in L5: [list any key players who were OUT during L5 games]
- Rest: [X days rest] (soft factor for spreads)
\`\`\`` : ''}${isNHL ? `**NHL TEAM SNAPSHOT FORMAT (L5 METRICS MANDATORY):**
\`\`\`
[TEAM NAME] SNAPSHOT:
- L5 Form: [record] | L5 Avg Goal Diff: [+/-X.X]
- Goalie Tonight: [Name] | SV%: [value] | GAA: [value] | L5 SV%: [value]
- xGF%: [value] | Corsi%: [value] | PP%/PK%: [values]
- Key Absences in L5: [list any key players who were OUT during L5 games]
- Rest: [X days rest]
\`\`\`` : ''}

Fill in ACTUAL VALUES from your investigation. This grounds your case in data.

**MANDATORY REQUIREMENTS FOR EACH CASE:**
${isNBA ? `- START with Four Factors from scout report as your BASELINE (you have eFG%, Net Rating, ORtg, DRtg)
- SHOW TRENDS: Compare L5/L10 to season (e.g., "Scout report shows +4.2 Net Rating, but L5 is +7.1 = trending UP")
- INVESTIGATE: What does the trend mean for THIS game? (sustainable? matchup-driven? variance?)
- MATCHUP APPLICATION: How does Team A's strength attack Team B's weakness SPECIFICALLY?` : `- TEAM ADVANCED STATS are REQUIRED (Net Rating, Offensive Rating, Defensive Rating, eFG%, Pace, Turnover Rate, etc.)
- Player stats can supplement team stats, but team stats must be the foundation
- Compare L5/L10 to SEASON AVERAGES to show trends (e.g., "L5 Off Rating: 114.2 vs 110.8 season = trending up")`}
- INJURY RULES: Only mention RECENT injuries (< 2 weeks). Old injuries are priced in and reflected in team stats.

**ANTI-FABRICATION RULE:** Each paragraph must cite STATS you investigated. Do NOT invent:
- Tactical play-by-play (defensive schemes, driving lanes, paint dominance)
- Claims about HOW the game will play out that you can't verify from stats
- "Player X will draw Player Y away from..." - you're not watching film, you're analyzing data
If you don't have a stat for something, don't write it. Focus on what you CAN verify.

**Then write 3-4 detailed paragraphs (not bullet points) for EACH case:**

- **PARAGRAPH 1 (${isNBA ? 'BASELINE + TREND INVESTIGATION' : 'TEAM EFFICIENCY INVESTIGATION'} - MANDATORY):**
${isNBA ? `  - Start with the Four Factors baseline from your scout report (eFG%, Net Rating, ORtg, DRtg)
  - Investigate: How do L5/L10 trends compare to the season baseline? Is the team trending up, down, or stable?
  - Ask: Does recent form suggest the baseline is ACCURATE or STALE for this team right now?
  - For SPREADS: Determine which side of the spread the efficiency gap supports` : `  - Investigate team efficiency gaps (Net Rating, ORtg, DRtg, eFG%, Pace, Turnover Rate)
  - Ask: Which team's efficiency strength exploits the opponent's weakness?
  - For SPREADS: Determine which side of the spread the efficiency data supports
  - Remember: Team efficiency profiles drive spread outcomes, not individual player performances`}

- **PARAGRAPH 2 (RECENT FORM + LAST GAME CONTEXT - MANDATORY):**
  Investigate L5/L10 trends compared to season averages:
  - Is the team trending UP or DOWN from their baseline?
  - WHO did they play? Investigate opponent quality during recent stretch
  - WHO was playing? If key player was OUT during L5, those stats may not reflect tonight
  - Determine: Does recent form change what the baseline tells you?

  **LAST GAME SUMMARY (REQUIRED for each team):**
  - What happened in their MOST RECENT game? (opponent, score, home/away)
  - Investigate: Is today's line over/under-reacting to that result?
  - NOTE: You decide what the data means - don't assume "recent loss = value"

- **PARAGRAPH 3 (MATCHUP APPLICATION):**
  Apply your findings to THIS specific matchup and THIS spread:
  - Investigate: Does the efficiency gap favor the favorite or underdog side of the spread?
  - Ask: Does one team's strength directly exploit the other's weakness?
  - Determine: Which side of the spread does each factor support?

- **PARAGRAPH 4 (TONIGHT'S FACTORS):**
  Which factors will ACTUALLY show up tonight?
  - Investigate which factors you believe will materialize in THIS specific game
  - Rest/travel: investigate their actual impact for THIS team (not generic assumptions)
  - Determine: What's your conviction for which side based on your investigation?

${isNBA && Math.abs(parseFloat(firstTeamSpread.replace(/[+-]/g, ''))) >= 8 ? `**LARGE SPREAD INVESTIGATION (8+ points) - UNIT EFFICIENCY:**
For large spreads, margin matters. Investigate how BOTH units perform for each team:
- Call [LINEUP_NET_RATINGS] or [BENCH_DEPTH] to see first unit vs second unit performance
- If the favorite dominates BOTH units, margin expansion is more likely
- If the favorite wins starters but loses the bench battle, the margin may shrink
- Ask: "Can the favorite's second unit HOLD the lead while starters rest?"
- Check each team's Net Rating swing (gap between starter and bench unit) - large swings = more fragile

**FRESH INJURY INVESTIGATION (if applicable):**
If a key player is OUT for 0-2 games only:
- Check their usage rate (25%+ = significant offensive role)
- How did the team look in games without them? (Net Rating change)
- Did the line move because of NEWS or because of actual performance data?
- If usage was high but team still performed well, the line may have overreacted` : ''}

${isNHL ? '' : `**Good Favorite Covering example:**
"Houston's +9.3 average margin over their last 10 games shows blowout potential. They've beaten three playoff teams by double digits during this stretch - the kind of margin separation that covers -7.5..."

**Good Underdog Covering example:**
"Chicago's last 5 losses came by an average of just 4.2 points - they're losing close. Against top-10 defenses, they've kept 4 of 5 games within single digits. The +8.5 cushion accounts for a loss..."

**Good Statistical Matchup example:**
"Cleveland's 113.4 Offensive Rating (5th) vs Philadelphia's 108.9 Defensive Rating (18th) creates a +4.5 efficiency gap that typically translates to 6-8 point margins at home..."`}

**ANALYSIS FOR ${firstTeam} (${firstTeamSpread}):**
*(What does the data say about their ability to perform in this matchup?)*

**ANALYSIS FOR ${secondTeam} (${secondTeamSpread}):**
*(What does the data say about their ability to perform in this matchup?)*

**THE VALUE QUESTION:** After your analysis, ask yourself:
- Does the spread of ${Math.abs(parseFloat(firstTeamSpread.replace(/[+-]/g, '')))} reflect the TRUE difference you found between these teams?
- Have soft factors (injury news, B2B, public perception) pushed this line beyond what the hard stats support?
- If the data shows an even matchup but the spread says -7, the +7 side may be the better bet
- If the data shows a clear mismatch but the spread is only -3, the -3 side may be the better bet
</case_structure>

<instructions>
## YOUR TASK

Using the investigation checklist, quality gate, and variance check above, execute these steps NOW:

**STEP 1:** Call any missing stats for BOTH teams (investigate equally)

**STEP 2:** Note RECENT UPDATES for each team (last 24-48 hours)

**STEP 3:** Write **ANALYSIS FOR ${firstTeam}** (3-4 paragraphs with key factors, recent form with margins, stats)

**STEP 4:** Write **ANALYSIS FOR ${secondTeam}** (3-4 paragraphs with key factors, recent form with margins, stats)

**STEP 5:** Write **KEY CONCERNS** for BOTH sides (PARAGRAPH FORM - not bullet lists):

**KEY CONCERNS FOR ${firstTeam}:**
Write 3-5 sentences explaining legitimate concerns about their ability to cover THIS spread. Include the stats and factors that create doubt, WHY they matter for covering THIS spread, and how they might manifest tonight.

Example: "Detroit's 3PT shooting has been volatile - they shot 38.1% over the season but dropped to 33.9% on back-to-backs. Tonight is a back-to-back against a top-10 perimeter defense that contests 42.3% of 3PA. If their shooters struggle, it removes a margin-building weapon. Their last two B2B games saw them shoot 28.4% and 31.1% from deep, both losses despite being favored."

**KEY CONCERNS FOR ${secondTeam}:**
Same format - 3-5 sentences explaining concerns with stats and spread relevance.

This keeps your analysis grounded while ensuring you're aware of concerns on each side.

**CRITICAL:** Do NOT indicate which side is the better bet yet. Investigate BOTH sides neutrally.
In Pass 2.5 you'll determine which side is the BETTER BET based on whether the spread reflects your findings.

BEGIN MATCHUP ANALYSIS NOW.
</instructions>
`.trim();
}

/**
 * Get spread context message based on sport and spread size
 * Historical data shows favorites cover less often as spreads increase
 * This gives Gary the context to make informed decisions
 */
function getSpreadContext(sport, absSpread) {
  // Sport-specific thresholds based on historical ATS data
  const thresholds = {
    // NBA: 10+ is medium, 13+ is large (13.5 spread should trigger "large")
    basketball_nba: { medium: 10, large: 13 },
    // NFL: 7+ is medium, 10+ is large (double digits = big spread in NFL)
    americanfootball_nfl: { medium: 7, large: 10 },
    // NCAAB: College has bigger spreads, 14+ is medium, 20+ is large
    basketball_ncaab: { medium: 14, large: 20 },
    // NCAAF: Similar to NFL, 10+ is medium, 14+ is large
    americanfootball_ncaaf: { medium: 10, large: 14 },
    // NHL: Spreads are typically pucklines (1.5), less relevant
    icehockey_nhl: { medium: 999, large: 999 }, // Disable for NHL
  };
  
  const sportThresholds = thresholds[sport] || { medium: 10, large: 14 };
  
  if (absSpread >= sportThresholds.large) {
    return `
**SPREAD CONTEXT:** This is a ${absSpread}-point spread. Historically, favorites cover spreads this large less than 48% of the time - the points alone make this close to a coin flip despite the talent gap. If backing the favorite, your conviction should be VERY high.`;
  } else if (absSpread >= sportThresholds.medium) {
    return `
**SPREAD CONTEXT:** This is a ${absSpread}-point spread. At this range, favorites and underdogs cover at nearly equal rates historically (~50%). Strong conviction required either direction.`;
  }
  
  // No context needed for smaller spreads - favorites have slight historical edge
  return '';
}

/**
 * Build the PASS 2.5 message - Case Review, Stress Test & Final Decision
 * Injected AFTER Gary completes Steel Man analysis
 *
 * GRADELESS FLOW (Gary stays objective until final decision):
 * Step 1: Review both cases objectively (summarize key arguments, no grades)
 * Step 2: Stress test BOTH sides (identify red flags for each team)
 * Step 3: Final Decision (make ONE pick based on complete analysis)
 * Step 4: Set confidence based on conviction
 *
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} sport - Sport identifier for spread context thresholds
 * @param {number} spread - The spread value (e.g., -13.5)
 */
function buildPass25Message(homeTeam = '[HOME]', awayTeam = '[AWAY]', sport = '', spread = 0) {
  // Get spread context if applicable
  const absSpread = Math.abs(spread);
  const spreadContext = sport && absSpread > 0 ? getSpreadContext(sport, absSpread) : '';
  
  // Load the Sharp Reference for case review (sport-specific betting principles)
  const sharpReference = getSteelManGradingReference(sport);
  
  // Determine if this is a "who wins" question (small spread) for sanity check section
  const isNBA = sport === 'basketball_nba' || sport === 'NBA';
  const isNFL = sport === 'americanfootball_nfl' || sport === 'NFL';
  const isNCAAB = sport === 'basketball_ncaab' || sport === 'NCAAB';
  const isNHL = sport === 'icehockey_nhl' || sport === 'NHL';
  
  const isNCAAF = sport === 'americanfootball_ncaaf' || sport === 'NCAAF';
  
  // Thresholds for "who wins" question: NBA <5, NFL <3.5, NCAAB <5, NCAAF <3.5
  const isWhoWinsQuestion = isNHL || // NHL is always "who wins"
    (isNBA && absSpread < 5) ||
    (isNFL && absSpread < 3.5) ||
    (isNCAAB && absSpread < 5) ||
    (isNCAAF && absSpread < 3.5);
  
  // Build the key player dynamics section with Star Power Audit (only for small spreads / who wins questions)
  const keyPlayerSection = isWhoWinsQuestion ? `
**B. STAR POWER AUDIT (The "Closer Effect" - Critical for Close Games)**

Since this is a "WHO WINS?" question (spread < ${isNBA || isNCAAB ? '5' : '3.5'} points), investigate the CLOSING dynamic:

${isNFL ? `**NFL CLOSING DYNAMICS (Investigate via Stats):**
In close NFL games, late-game execution often determines the outcome. Consider these factors:

**QB CLUTCH PERFORMANCE (Look up the data):**
- 4th quarter passer rating and EPA in close games (within 7 points)
- Game-winning drive history and success rate
- Performance under pressure (when blitzed, when trailing)
- Playoff/primetime track record if applicable

**STRUCTURAL vs INDIVIDUAL:**
- Some matchup advantages are "schemeable" (can be adjusted at halftime with film study)
- Some are structural and harder to overcome (e.g., dominant pass rush vs weak OL depth)
- In close games, individual execution often matters more than schematic advantages

**QUESTIONS TO INVESTIGATE:**
- If this game is within 3 points in the 4th quarter, which QB has historically performed better?
- Is there a matchup advantage that can't be schemed away (pass rush vs personnel, not scheme)?
- Does either team have a late-game identity that shows up in the data (clock management, red zone efficiency)?` : `**THE CLOSER EFFECT:**
In the final 5 minutes of a close game, coaches "shorten the playbook" and give the ball to their best player.
Structural matchups (pace, rebounding, defensive schemes) matter LESS in crunch time.
Individual star ability to "create a shot out of nothing" can override structural advantages.

**INVESTIGATE:**
- Who is the primary "closer" for each team? (High usage in 4th quarter, clutch performance)
- Does one team have a CLEAR advantage in "give the ball to our guy" situations?
- Has either star struggled/excelled in clutch situations THIS SEASON?`}

**THE PIVOT RULE:**
If your case relies on a STRUCTURAL mismatch (style, defense, pace):
- Ask: "What happens in the last 5 minutes when both teams abandon their system?"
- Does the other team have a star who can OVERRIDE the structural advantage?

**NOT "this player is great"** (already priced in)
**BUT "when this game is close in the 4th, who has the Diamond?"**
` : `
**B. KEY PLAYER DYNAMICS:**
For large spreads (margin question), individual star closers don't create 10+ point swings — schemes and depth do.
Star power matters less when the question is "who wins by 10?" rather than "who wins?"
Skip this section unless there's a specific matchup advantage not captured in your case.
`;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GEMINI 3 OPTIMIZED: XML-tagged structure with END-OF-PROMPT instruction
  // ═══════════════════════════════════════════════════════════════════════════
  return `
<game_context>
## PASS 2.5 - CASE REVIEW, STRESS TEST & FINAL DECISION

Steel Man cases have been built for both sides. These are your "advisors" - they advocate for each side.
Your job is to REVIEW them critically, VERIFY claims against the data, and make YOUR decision.

${spreadContext}
</game_context>

<verification_protocol>
## VERIFY BEFORE YOU DECIDE

You have access to ALL the stat data that was gathered during investigation.
You also have TOOLS to investigate anything further if needed.

**FOR EACH STEEL MAN CLAIM:**
1. Check if the stat cited is in the investigation data
2. Verify the numbers are accurate
3. If a claim seems uncertain or lacks data, CALL A STAT to verify it
4. Do not accept claims at face value - verify them

**USE YOUR TOOLS IF:**
- A Steel Man case cites a stat you can't verify in the data
- You want to check recent form that wasn't fully explored
- You need opponent-quality context for recent games
- Any claim feels like narrative without data backing

You are the FINAL DECISION MAKER. Steel Man cases are inputs, not conclusions.
</verification_protocol>

<situational_context>
## SITUATIONAL CONTEXT (Factor into your analysis)

**1. BACK-TO-BACK & TRAVEL:**
- **ROAD B2B = Real fatigue factor** (travel + game + travel + game)
- **HOME B2B = Minimal impact** on performance
- **Circadian factor:** West Coast team playing 7:30 PM EST = 4:30 PM body time (peak window, don't auto-fade for "travel"). West Coast playing 1:00 PM EST = 10:00 AM body time (biological low, shooting drops).
- **Eastward overnight travel + early game** = "Zombie team" risk, especially 1H.

**2. RETURNING PLAYERS → HIGH UNCERTAINTY:**
- Star player's FIRST game back = Chemistry disruption, rust, minutes limits
- Multiple players returning OR 3-4 role players integrating = Lineup chaos, hard to predict
- **This uncertainty applies to PICKING that team** - the opponent (without the variable) is MORE predictable
- Factor this uncertainty into your analysis when a team has returning players
</situational_context>

<sharp_reference>
## SHARP BETTING REFERENCE

${sharpReference}
</sharp_reference>

<case_review>
## CASE REVIEW - FILTER FOR WHAT MATTERS TONIGHT

**Take a beat.** You just wrote both Steel Man cases as an advocate. Now shift gears — you are the EDITOR reviewing both cases with a critical eye.

**Your job now:** Filter through each case and separate what's REAL and RELEVANT from what's fluff, narrative, or fabrication.

**FABRICATION CHECK:** Did either case include tactical claims you can't verify from stats?
- "Player X will drag Player Y away from the paint" - FABRICATED (you didn't watch film)
- "Their defensive scheme gives up driving lanes" - FABRICATED (unless you have the stat)
- "He'll exploit the coverage" - FABRICATED (you can't see defensive schemes in stats)
Strip these out. Only keep claims backed by ACTUAL STATS from your investigation.

**DO NOT pick a side yet.** But DO identify what actually matters for THIS game.

**FOR EACH CASE, INVESTIGATE:**

**A. CORE ARGUMENT - INVESTIGATE IF IT'S REAL**
- Investigate the central reasoning for why this team COVERS (not just wins)
- Investigate whether it's backed by ACTUAL DATA (stats, numbers, matchup specifics) - if yes, cite the data; if no, flag it as fluff
- Strip out narratives ("they're due," "revenge game," "they always play up/down") - what STAT actually drives this case?
- Strip out FABRICATED TACTICS (defensive coverages, driving lanes, paint attacks) - these are made-up, not from data

**B. RECENT FORM - INVESTIGATE THE CONTEXT**
- Investigate their recent results - WHO did they play?
- Investigate the quality of competition - good record against bad teams isn't impressive
- Investigate if close losses to elite teams are more telling than wins vs bad teams
- Investigate whether they're playing UP to their season level, DOWN from it, or AT it
- **CONCLUDE:** Based on form AND opponent quality, do you expect this team to play WELL or POORLY tonight?

**C. DATA QUALITY - INVESTIGATE WHAT'S PREDICTIVE**
- Investigate whether the stats cited are PREDICTIVE (efficiency gaps, opponent-adjusted metrics) or just DESCRIPTIVE (raw totals, "they scored 120 last game")
- Investigate the relationship between season stats and recent form - is recent form variance or a real shift?
- **CONCLUDE:** Which stats actually predict tonight's outcome?

**D. FRESHNESS - INVESTIGATE IF THE TEAM HAS ADAPTED**
- Investigate how long key news (injuries, lineup changes) has been known
- If injury announced 3+ weeks ago → Investigate how the team has performed since. They've adapted.
- If news from last 24-48 hours → Investigate actual impact. Still adjusting.
- **CONCLUDE:** Is this a factor that affects tonight, or stale information?

**E. SEASON-LONG INJURY - INVESTIGATE IF IT'S STILL RELEVANT**
- Investigate if either case cites a player who's been out for months
- If YES: Investigate how the team has performed WITHOUT them - that IS the team now
- **CONCLUDE:** Is this argument valid, or is it about a team that no longer exists?

**F. TWO-STEP SPREAD ANALYSIS (NEUTRAL FOR BOTH TEAMS)**

This is the core of your evaluation. Two questions, answered neutrally:

**STEP 1: WHAT DO THE STATS SAY ABOUT THIS SPREAD?**

The spread is ${Math.abs(parseFloat(spread) || 7)} points.
${Math.abs(parseFloat(spread) || 7) <= 4.5 ? '(Small spread - this is essentially asking WHO WINS)' : Math.abs(parseFloat(spread) || 7) >= 10 ? '(Large spread - this is asking about MARGIN, not just winning)' : '(Medium spread - comfortable win required)'}

**SPREAD EVALUATION:**
Does this spread reflect what the TIER 1 data shows?
Gary investigates the factors HE determines are relevant to this matchup and spread size.
The question: Is the margin mispriced based on efficiency data, or does the line accurately reflect team quality?

Based on your investigation: Which SIDE of the spread do the stats support?
- The team GETTING ${Math.abs(parseFloat(spread) || 7)} points?
- Or the team GIVING ${Math.abs(parseFloat(spread) || 7)} points?

**STEP 2: WILL THOSE FACTORS HOLD TONIGHT?**

Stats tell you what SHOULD happen based on past performance. Now investigate whether those factors will remain true TONIGHT.

For EACH team, investigate:
- Given the matchup, do you expect them to play UP to their season/recent numbers, or DOWN from them?
- Are there situational factors (rest, travel, motivation) that could affect their typical performance?
- Does the opponent's style/strengths specifically counter what makes this team effective?
- Is there anything about THIS specific game that changes the baseline expectation?

**CONCLUDE FOR EACH TEAM:**
- ${homeTeam}: Do you expect them to perform WELL, AVERAGE, or POORLY tonight relative to their baseline? Why?
- ${awayTeam}: Do you expect them to perform WELL, AVERAGE, or POORLY tonight relative to their baseline? Why?

**COMBINE BOTH STEPS:**
The stats say [X side] of the spread is supported. Given your tonight predictions, does that hold or change?

**CASE SUMMARY:**
| Team | Data-Backed Argument | Tonight Expectation | Biggest Hole in Case |
|------|---------------------|---------------------|---------------------|
| ${homeTeam} | [What STAT/DATA drives their case?] | [WELL/AVG/POOR] | [What's the flaw?] |
| ${awayTeam} | [What STAT/DATA drives their case?] | [WELL/AVG/POOR] | [What's the flaw?] |

**STAY OBJECTIVE:** Do NOT pick a side yet. You will stress test BOTH sides before deciding.
</case_review>

<stress_test_patterns>
## STRESS TEST PATTERNS (CHECK BOTH SIDES)

**A trap is where NARRATIVE has moved the line beyond what the STATS support.**

These patterns show common situations where public perception, injury news, or recent results push spreads in one direction - often creating VALUE on the other side.

**HOW TO USE TRAP PATTERNS:**
- If you identify a trap on one side, ask: "Has this factor pushed the spread beyond what the hard stats support?"
- Example: Star player just went out → public hammers the opponent → line moves from -3 to -7 → but the team's recent stats without the star show they're still competitive → the +7 is now the better bet
- The trap patterns help you identify WHERE narrative has overtaken reality

**CHECK BOTH SIDES:** Either team could be a trap. This informs which side is the BETTER BET.

---

### TRAP PATTERNS (Check BOTH sides):

**1. Blowout Recency Gap?**
   - Condition: Team won/lost by >15 points in their last game
   - Investigate: Was this a structural mismatch or shooting variance?
   - Investigate: Was blowout margin inflated by garbage time?
   - Investigate: Is the public overreacting to ONE result?

**2. Ewing Effect (Injury Overreaction)?**
   - Condition: Top usage player is OUT and public assumes guaranteed loss
   - CRITICAL: Check DURATION first. If out 3+ weeks, this pattern does NOT apply - team has adjusted.
   - For RECENT injuries only (0-2 games):
     * **Usage Rate check:** Was this a high-usage player (25%+)? High usage = offense ran through them.
     * **On-Off investigation:** Compare team's Net Rating in games WITH vs WITHOUT that player.
       - If player had +8 Net Rating but team still had +4 without them, the drop isn't catastrophic.
       - If player's absence caused a 10+ point Net Rating collapse, the injury impact is real.
     * **First game effect:** First game without a player = opponents have NO tape on new lineup. Can actually HELP the team short-term.
     * **Line move check:** Did the line move because of NEWS (narrative) or DATA (actual performance drop)?
   - For SEASON-LONG injuries: The team's current stats already reflect the absence. Not an edge.

**3. Regression Check?**
   - Condition: Team's recent eFG% is >5% above their season average
   - Investigate: Is shooting spike structural (new personnel, shot selection) or variance?
   - Investigate: Are they shooting MORE threes (sustainable volume) or just making MORE (unsustainable %)?
   - Investigate: Does tonight's opponent defense allow the streak to continue?

**4. Overlook/Lookahead Trigger?**
   - Condition: Dominant favorite plays high-stakes rival in NEXT game
   - Investigate: Check schedule - is next game a rivalry, playoff battle, or national TV?
   - Investigate: Does underdog have defensive depth to keep it close if effort dips?

**5. Desperation Flip (Losing Streak Value)?**
   - Condition: Team on long losing streak (market has "bottomed out")
   - Investigate: Is Net Rating actually IMPROVING despite the losses?
   - Investigate: Are they losing close games to elite teams (bad luck) vs blown out (bad team)?
   - Investigate: Check point differential trends - is the gap closing?

**6. Divisional Grinders?**
   - Condition: Large favorite spread (8.5+) in divisional/conference game
   - Investigate: Division rivals play 4x/season - does familiarity shrink the talent gap here?
   - Investigate: Does favorite have significant bench advantage (>10 PPG) to cover margin?

**6b. Unit Efficiency (Large Spreads 8+)?**
   - Condition: Spread is 8+ points (margin question, not just "who wins")
   - **First Unit vs Second Unit:** INVESTIGATE how each team performs when starters rest.
     * Call [LINEUP_NET_RATINGS] or [BENCH_DEPTH] to get the data
     * Investigate: What is each team's bench Net Rating? Do they win or lose their bench minutes?
     * Investigate: How much of the game do starters typically play? (~32-36 min)
   - **Net Rating Swing:** INVESTIGATE the gap between starter and bench performance.
     * Ask: "What is THIS team's Net Rating swing?"
     * Investigate: Does a large swing (10+) indicate fragility when starters sit?
     * Investigate: Does a small swing indicate depth that stabilizes performance?
     * Let the DATA tell you what the swing means for THIS specific matchup.
   - **Investigation tokens:** [LINEUP_NET_RATINGS], [BENCH_DEPTH], [TOP_PLAYERS] (usage_concentration)
   - **Question:** "Based on my investigation of unit efficiency, can the favorite maintain their lead throughout the game?"

**7. Line Inflation ("Begging for a Bet")?**
   - Condition: Elite team is suspiciously NARROW favorite vs bad team
   - Investigate: What hidden factor might oddsmakers be pricing in?
   - Investigate: Rest disadvantage? Key player GTD trending OUT? Travel trap?

**8. Narrative Vacuum (Returning Star)?**
   - Condition: Star player returns after missing 3+ games
   - Investigate: Minutes restriction? Conditioning rust?
   - Investigate: Does return DISRUPT a bench rhythm that was working?
   - Investigate: Check team's record/efficiency WITHOUT the star - were they actually fine?

---

### SITUATIONAL FACTORS (Investigate, don't assume):

**9. Schedule/Travel Situation?**
   - Investigate: What is the actual travel distance and timezone situation for each team?
   - Investigate: What is THIS team's record/performance on back-to-backs this season?
   - Investigate: What is THIS team's record/performance with this specific rest situation?
   - Investigate: Does the data show a pattern, or is the sample too small to matter?

**10. Public/Market Perception?**
   - Investigate: Where has the line moved since open, and in which direction?
   - Investigate: What might be driving the movement (news, sharp action, public money)?
   - Investigate: Is the current line different from what efficiency metrics suggest?

**11. Emotional/Situational Spot?**
   - Investigate: If citing "letdown," "bounce-back," or "trap game" - what does THIS team's historical data show in similar spots?
   - Investigate: Is there structural evidence (rotation changes, effort metrics, pace changes) that supports the narrative?
   - Investigate: Can you find data to back up the storyline, or is it just a storyline?

**12. Star Absence Impact?**
   - FIRST: Check injury DURATION. This determines everything.
   - If SEASON-LONG (1-2+ months): The current roster IS the team. Their recent form reflects this. Not an edge.
   - If SEASON-LONG: Do NOT cite this absence as a reason for your pick. The team has adapted.
   - If MID-SEASON (3-6 weeks): Check their record DURING this period. Adaptation is partial.
   - If RECENT (< 2 weeks): INVESTIGATE deeply. Team is still adjusting. Potential edge.
   - Investigate: Who has absorbed the usage? Check their RECENT game logs, not season averages.
   - SEASON AVERAGES for injured players are MISLEADING. That production is now distributed.

**13. H2H Personnel Check?**
   - Investigate: If citing H2H results, who was playing in those games vs who plays tonight?
   - Investigate: Were the circumstances similar (rest, injuries, home/away)?

**14. Information Age?**
   - Investigate: When did the key news (injury, lineup change) become public?
   - If injury announced 1-2+ months ago: Team has fully adapted. Their recent form = the team you're betting on.
   - If injury announced 1-3 weeks ago: Team partially adapted. Check their recent results during this period.
   - If injury announced < 1 week: Team still adjusting. High variance situation - investigate closely.
   - **For SPREAD bets:** Fresh news (< 48 hours) may not be fully reflected in the spread. Old news is.
   - **For ML bets:** Focus on team adaptation, not when market learned about it.

---

### PICK-LEVEL CONCERNS:

- **Line movement:** Investigate - has the line moved away from your side? Why?
- **Sharp money signals:** Investigate - any indication sharps are opposite your pick?

---

### STRUCTURE vs STAR POWER (For Close Games):

Investigate for BOTH teams:
- Investigate: How has each team's structural advantages held up in close games this season?
- Investigate: When games get tight in the 4th, who does each team go to?
- Investigate: Does each team have a go-to closer, and what's their 4th quarter/clutch performance?
- Ask yourself: "If this game is within 5 points in the 4th, which team has the edge based on the data?"
</stress_test_patterns>

<closing_dynamics>
## CLOSING DYNAMICS (For Close Games)

${keyPlayerSection}
</closing_dynamics>

<final_decision>
## FINAL DECISION - MAKE YOUR PICK NOW

**THE MINDSET:**
You are not playing a long game of "this should hit 55% over time."
You are trying to WIN THIS SPECIFIC BET.

The question is not: "Who covers this spread?"
The question is: "Which side is the BETTER BET given this spread?"

**THE VALUE FRAMEWORK:**
- The spread reflects what the market thinks, influenced by public money, injury news, and narratives
- Your research shows you the TRUE matchup dynamics based on hard stats
- If these don't align, one side offers better value than the other

**YOUR DECISION PROCESS:**

1. **THE SHARP QUESTION (ASK FOR EVERY FACTOR YOU CITE):**
   **"Is this factor telling me why the line EXISTS, or why the line is WRONG?"**

   - If a factor EXPLAINS why the line is what it is → it's NOISE (already priced in)
   - B2B, bad records, blowout losses, injuries → usually explain WHY the line exists
   - If you cite these as your REASONS → you're just agreeing with the market (no edge)
   - Your edge comes from finding where NARRATIVE ≠ DATA

2. **WHAT DOES YOUR RESEARCH SHOW?**
   Based on your investigation (efficiency gaps, pace, L5 form, matchups):
   - What is the TRUE difference between these teams right now?
   - Which team has the statistical advantages in THIS specific matchup?
   - Does your DATA differ from the market NARRATIVE?

3. **DOES THE SPREAD REFLECT YOUR FINDINGS?**
   This is the key question:
   - If the data shows a close matchup but the spread is -7 → the +7 side may be the better bet
   - If the data shows a clear mismatch but the spread is only -3 → the -3 side may be the better bet
   - Have soft factors (injury news, B2B, losing streak) pushed the line beyond what hard stats support?
   - Remember: Soft factors EXPLAIN the line - they don't BEAT it

4. **CHECK THE TRAP PATTERNS:**
   The trap patterns below show common situations where narratives move lines:
   - Injury overreaction → line moved because of news, not because team got worse
   - Public perception → everyone bets the hot team, line inflates
   - If you spot a trap, the OTHER side is often the better bet

5. **MAKE YOUR DECISION:**
   Which side is the BETTER BET? Not just "who wins" but "which bet offers value given this spread?"
   - Consider the RISK of the spread size (covering 8+ on the road is hard)
   - Consider whether the spread reflects reality or narrative
   - YOUR PICK SHOULD BE BACKED BY DATA THAT DIFFERS FROM THE NARRATIVE

Your pick is about VALUE, not just picking winners.
</final_decision>

<output_format>
## OUTPUT FORMAT (strict JSON)

\`\`\`json
{
  "final_pick": "[Team] [spread/ML]",
  "confidence_score": [0.50-0.95],
  "rationale": "MUST START WITH 'Gary's Take\\n\\n' then a 1-2 sentence scene-setter (like a broadcaster describing the matchup), then 3-4 paragraphs explaining WHY this team covers TONIGHT with stats and matchup factors."
}
\`\`\`
</output_format>

<instructions>
## YOUR TASK (Execute in Order)

NOW execute these steps IN ORDER:

**STEP 1: REVIEW YOUR CASES (Apply the 6-Step Filter)**
For each Steel Man case, work through:

A. **PREDICTIVE vs DESCRIPTIVE:** Did the case use predictive metrics (efficiency, L5 margins, pace) or just descriptive records (W-L, streaks)?
   - Flag any arguments based on records without explaining the underlying metrics
   - Flag any FABRICATED TACTICS (defensive schemes, driving lanes, coverage breakdowns) - these are made up, not from your data

B. **WHAT DOES THE DATA TELL YOU?** For each key stat cited:
   - Does L5/L10 tell the story of who this team IS RIGHT NOW?
   - Or do season averages provide better context for THIS metric?
   - Is the stat inflated/deflated by opponent quality?

C. **WHICH SIDE DOES EACH FACTOR BENEFIT?** For each factor:
   - State explicitly: "This factor supports [Team] side of the spread because..."
   - Does the efficiency gap, pace, margins favor the team getting points or giving points?

D. **WILL THIS SHOW UP TONIGHT?** For each factor:
   - Do you believe this factor will materialize in THIS specific game?
   - Consider how the matchup context affects this factor

Fill out the CASE SUMMARY. Do NOT pick a side yet.

**STEP 2: STRESS TEST BOTH SIDES**
Check BOTH teams against the trap patterns.
Document which patterns apply to EACH side.

**STEP 3: MAKE YOUR FINAL DECISION**
Based on everything - your matchup analysis, whether the spread reflects your findings, and trap pattern checks - which side is the BETTER BET?
This is where you decide. Not just "who wins" but "which side offers value given this spread?"

**STEP 4: OUTPUT YOUR DECISION (WITH REAL REASONING)**
Output your decision in the strict JSON format above.

**RATIONALE FORMAT (CRITICAL - iOS app depends on this):**
Your rationale MUST start with exactly: "Gary's Take\\n\\n"
Then include:
1. **Scene-setter (1-2 sentences):** Open with the matchup context - where teams stand, what's at stake
2. **Key evidence (1 paragraph):** The PRIMARY stats and data that support this pick - cite what you found in your investigation
3. **Supporting evidence (1-2 paragraphs):** Additional factors with numbers that back up your pick
4. **Closing:** Confident statement with your pick

**IMPORTANT:** Stick to stats you actually investigated. Do NOT invent tactical narratives about how the game will play out (defensive schemes, driving lanes, paint attacks) - you're analyzing stats, not watching film.

**RATIONALE TONE (Sound like a sharp sports analyst with value awareness):**
You CAN explain why this is the better bet and reference line value - but ALWAYS back it up with real game analysis:

- GOOD: "This line feels inflated after Houston's 22-point loss to Milwaukee - but that was an outlier. Houston's L5 Net Rating is still +4.2, they shot 28% from 3PT that night vs their 37% season average, and they're 8-2 in their last 10 home games. At +6.5, you're getting a team that typically loses close games by 3-4 points."
- BAD: "The market overreacted. Sharp money is on the underdog here." (no actual analysis)

- GOOD: "Phoenix at +145 ML is great value - their efficiency metrics (112.4 ORtg, 108.1 DRtg) are nearly identical to Denver's, and they've won 3 of their last 4 road games against top-10 defenses. This should be a pick'em, not a 3-point spread."
- BAD: "This ML price is too good to pass up." (no stats backing it up)

- GOOD: "The blowout loss narrative is overblown - Detroit lost by 18 but trailed by only 4 entering the 4th quarter before foul trouble derailed them. Their L5 point differential is +3.2 and they've covered 4 of 5 at home."
- BAD: "Public is fading Detroit after the blowout, creating value." (no game context)

You CAN discuss value, line movement, and why the spread is wrong - but ALWAYS explain the GAME REASONS behind it.
The value explanation should be the conclusion, not the premise. Lead with stats, end with why it's the better bet.

**PLAYER NAME RULES (HARD RULE - NO EXCEPTIONS):**
- DO NOT mention any player who hasn't played at all this 2025-2026 season
- DO NOT mention any player whose injury is >3 days old (their absence is fully priced in)
- Only mention ACTIVE players or players with FRESH injuries (announced within 0-3 days)
- If you need to reference an older absence, reference the TEAM's adjustment, not the player's name
  - GOOD: "The team has found its rhythm with the current rotation, going 8-3 over L10"
  - BAD: "Without [Player X] who's been out since November, the team has adjusted..."

**CRITICAL:** Your rationale must cite the stats that support your pick:
- What does the data show about this matchup?
- Actual stats (efficiency gaps, L5 margins, matchup data) that support your pick
- NOT just "Team A is better" - cite the specific numbers that show WHY
- DO NOT predict your own margin or score
- DO NOT fabricate tactical play-by-play (defensive coverages, driving lanes, etc.) - stick to stats you investigated

<negative_constraints>
CRITICAL CONSTRAINTS (Gemini 3 prioritizes these):

1. INJURY TIMING DETERMINES EVERYTHING (HARD RULE):

   **FRESH (0-3 days since announcement) - The ONLY time injury can be an edge:**
   - Line may not have fully adjusted yet
   - To use as edge, you MUST show via TIER 1 stats that the line UNDERREACTED
   - FORBIDDEN: "X is out, taking the other side" (that's already priced in)
   - REQUIRED: "X was ruled out yesterday. Their DRtg without him is 115.2 vs 108.1 - a 7pt drop. Line only moved 3."

   **>3 DAYS OLD - Fully priced in. NOT an edge:**
   - The market has had time to adjust
   - The spread ALREADY reflects this absence - citing it adds ZERO value
   - You CANNOT use this as a reason for your pick

   **SEASON-LONG (1+ months) - 100% IRRELEVANT. Don't mention it:**
   - Team has FULLY adapted. Current stats ARE who they are.
   - The spread already reflects the current team composition
   - Citing this is like saying "Team X doesn't have Michael Jordan" - irrelevant

2. FRESH INJURY INVESTIGATION (When injury is 0-3 days old):
   - Line moved because of NEWS, but does the DATA support that movement?
   - Check team's on/off splits: What's their Net Rating WITH vs WITHOUT this player?
   - Compare the statistical impact to how much the line moved
   - VALUE QUESTION: Did the line UNDERREACT? Show the math:
     - "Player X's on/off is +8.5 net rating. He's out. Line moved 3. That's a 5.5 point underreaction."
   - If you can't prove underreaction with data, the injury is NOT your edge.

3. DO NOT assume injury impact is positive or negative for either side.
   INVESTIGATE the actual impact through RECENT FORM and replacement performance.
   The data shows the truth - fresh injuries can create value on EITHER side.

4. DO NOT rely on training data for current team/player reality.
   Your training is from 2024. Use the Scout Report and stats we provide.
   If the data contradicts your memory, USE THE DATA.

5. BANNED PLAYER MENTIONS (HARD RULE - NO EXCEPTIONS):
   - DO NOT mention ANY player who hasn't played at all this 2025-2026 season
   - DO NOT mention ANY player who has been OUT for 1+ month (fully priced in)
   - The CURRENT ROSTER is the team you are betting on
   - Long-term absences are IRRELEVANT - the team has adapted, the line reflects it
   - If a player hasn't played in a month, pretend they don't exist for tonight's analysis
   - Only mention ACTIVE players or FRESH injuries (0-2 games out)

6. TRAP AWARENESS: "X-Y record without player" thinking
   - Do not just cite "2-8 without Star X" unless you can explain why it's relevant for THIS game
   - A 2-8 team that lost 6 games by 3 points covered those spreads - investigate the margins
   - If you cite a record, connect it to THIS specific spread: What were the margins? How does it apply tonight?
   - INVESTIGATE: How have they actually LOOKED? Who stepped up? What does recent form show?

7. DO NOT use season records or road/home records as primary evidence.
   - "7-14 on the road" tells you very little about a 9-point spread - they still won 7 times
   - Records are CLUES about quality, not predictors of THIS game's outcome
   - If citing a record, explain WHY it matters for this SPECIFIC SPREAD (not just "bad road team")

8. PRIORITIZE L5/L10 over season averages in your rationale AND decision-making.
   - L5 data tells you who this team IS RIGHT NOW
   - Season averages are diluted by games from months ago (different rosters, contexts)
   - Use season averages to EXPLAIN trends (regression, improvement), not as primary evidence
   - Example: "L5 scoring up to 118 PPG from 112 season avg - shooting 52% L5 vs 46% season suggests hot streak"
   - Note if key players were OUT during L5 games - those stats may not reflect tonight's team

9. REST/SCHEDULE IS A SOFT FACTOR - NOT A PRIMARY REASON:
    - Rest and travel are CONTEXT, not conclusions. They must be backed by PERFORMANCE DATA.
    - WRONG: "Team X is rested vs Team Y on a back-to-back, therefore Team X covers" (rest alone is not predictive)
    - RIGHT: "Team Y has shot 8% worse from 3PT on back-to-backs this season (31% vs 39%), and tonight faces a top-5 perimeter defense"
    - Investigate: How has THIS specific team actually performed on back-to-backs? What are their actual L5 B2B stats?
    - If you cite rest/schedule, it MUST be backed by specific performance numbers showing how it affects THIS team
    - Rest is priced into lines. To use it, show WHY the market underweighted it with actual data.

10. UNDERSTAND THE DIFFERENCE between descriptive and predictive stats:
    - DESCRIPTIVE: Records, streaks - these describe what happened
    - PREDICTIVE: Efficiency gaps, margins, matchups - these can indicate future performance
    - Both can be useful depending on context - use your judgment on what matters for THIS game
    - If using a record, investigate WHY: What were the margins? Who did they play? What caused the pattern?

11. SIDE SELECTION, NOT MARGIN PREDICTION (ABSOLUTE):
    - DO NOT predict your own spread number or final score
    - DO NOT say "I think they win by 8" or "I expect a 7-point margin"
    - DO pick a SIDE: "The evidence supports the favorite side" or "The evidence supports the underdog side"
    - Your job is to decide which SIDE of the market spread the stats support, not to predict a number
    - The spread is given by the market. You pick which side will cover the spread.

12. NO NUMERICAL GRADES (ABSOLUTE - OUTPUT FORMAT):
    - DO NOT include "strength": 7.5 or any numerical ratings in your output
    - DO NOT use "case_grades" format - use "case_summaries" format ONLY
    - Case summaries contain TEXT descriptions (core_argument, key_factors), NOT numerical scores
    - Your decision comes from conviction based on analysis, not comparing numbers

13. USE ACTUAL TEAM NAMES (ABSOLUTE - RATIONALE FORMAT):
    - ALWAYS use the actual team names: "Detroit Pistons", "Houston Rockets"
    - NEVER use generic terms: "the home team", "the away team", "the favorite", "the underdog"
    - Your rationale should read like a sports analyst who knows the teams, not a template
    - WRONG: "The home team has a rest advantage over the away team"
    - RIGHT: "Detroit has been resting for two days while Houston played last night"

14. RECORDS ARE DESCRIPTIVE, NOT PREDICTIVE (CRITICAL):
    - Records (17-4 at home, 11-13 on the road) describe what happened - they don't predict tonight
    - If you cite a record, you MUST explain WHY with actual stats: What were the margins? Who did they play?
    - WRONG: "Detroit is 17-4 at home so they'll cover"
    - RIGHT: "Detroit's 17-4 home record is backed by a +5.7 Net Rating at home, holding opponents to 107.6 Def Rating"
    - A team that went 15-5 losing all 5 by 3 points covered most spreads - investigate the MARGINS

15. "SCHEDULE SPOT" / "TEXTBOOK SPOT" IS NOT AN ARGUMENT:
    - Never use phrases like "textbook schedule spot" or "classic letdown spot" as primary reasoning
    - These are narrative crutches that bypass actual analysis
    - If you believe rest/travel matters, PROVE IT with data: "Houston shot 31% from 3PT on their last 3 B2Bs vs 38% rested"
    - The market prices in schedule factors. To use them, show specific data proving THIS team is affected.

16. NO EMOJIS (ABSOLUTE):
    - NEVER include emojis in your analysis, rationale, or output
    - Use text only - no icons, symbols, or Unicode emoji characters
</negative_constraints>

BEGIN YOUR ANALYSIS NOW.
</instructions>
`.trim();
}

/**
 * Parse Gary's Pass 2.5 output from his response
 * Handles new gradeless format (case_summaries) and legacy formats for backwards compatibility
 * @param {string} content - Gary's response content
 * @returns {object|null} - Parsed decision data or null if not found
 */
function parsePass25Ratings(content) {
  if (!content) return null;

  // Sanitize JSON: strip '+' prefix from numbers (e.g., +155 → 155) which Gemini sometimes outputs
  const sanitizeJson = (str) => str.replace(/:\s*\+(\d)/g, ': $1');

  try {
    // Method 1: Try to find JSON block in the response
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      const parsed = JSON.parse(sanitizeJson(jsonMatch[1]));

      // NEW GRADELESS FORMAT: Check for case_summaries structure (no numerical grades)
      if (parsed.case_summaries && parsed.final_pick) {
        console.log(`[Pass 2.5] ✅ Gradeless format detected (case_summaries)`);

        const homeName = parsed.case_summaries.home_team?.name || 'Home';
        const awayName = parsed.case_summaries.away_team?.name || 'Away';

        return {
          // No grades - just metadata
          reasoning: parsed.confidence_reasoning || parsed.rationale || '',
          varianceIndicator: parsed.variance_indicator || 'MEDIUM',
          varianceReasoning: '',
          underdogCanWinOutright: parsed.underdog_can_win_outright === true,
          outrightWinReasoning: '',
          // Case summaries (no grades)
          caseSummaries: parsed.case_summaries,
          stressTest: parsed.stress_test,
          finalPick: parsed.final_pick,
          confidenceScore: parseFloat(parsed.confidence_score) || 0.65,
          confidenceLabel: parsed.confidence_label || 'CONFIDENT',
          confidenceReasoning: parsed.confidence_reasoning || '',
          rationale: parsed.rationale || '',
          supportingEvidence: parsed.supporting_evidence || ''
        };
      }

      // LEGACY FORMAT: Check for case_grades structure (with numerical grades)
      if (parsed.case_grades && parsed.final_pick) {
        console.log(`[Pass 2.5] ✅ Legacy format with grades detected`);

        const homeGrade = parsed.case_grades.home_team?.strength || 5.0;
        const awayGrade = parsed.case_grades.away_team?.strength || 5.0;
        const homeName = parsed.case_grades.home_team?.name || 'Home';
        const awayName = parsed.case_grades.away_team?.name || 'Away';

        return {
          favoriteRating: Math.max(homeGrade, awayGrade),
          underdogRating: Math.min(homeGrade, awayGrade),
          favoriteTeam: homeGrade > awayGrade ? homeName : awayName,
          underdogTeam: homeGrade > awayGrade ? awayName : homeName,
          reasoning: parsed.confidence_reasoning || parsed.rationale || '',
          varianceIndicator: parsed.variance_indicator || 'MEDIUM',
          varianceReasoning: '',
          underdogCanWinOutright: parsed.underdog_can_win_outright === true,
          outrightWinReasoning: '',
          caseGrades: parsed.case_grades,
          tentativePick: parsed.tentative_pick,
          stressTest: parsed.stress_test,
          sanityCheckSummary: parsed.sanity_check_summary,
          finalPick: parsed.final_pick,
          pickFlipped: parsed.pick_flipped === true,
          confidenceScore: parseFloat(parsed.confidence_score) || 0.65,
          confidenceLabel: parsed.confidence_label || 'CONFIDENT',
          confidenceReasoning: parsed.confidence_reasoning || '',
          rationale: parsed.rationale || ''
        };
      }

      // OLDEST FORMAT: Check for favorite_path_rating structure
      if (parsed.favorite_path_rating && parsed.underdog_path_rating) {
        console.log(`[Pass 2.5] ✅ Oldest legacy format detected`);
        return {
          favoriteRating: parseFloat(parsed.favorite_path_rating),
          underdogRating: parseFloat(parsed.underdog_path_rating),
          favoriteTeam: parsed.favorite_team || 'Favorite',
          underdogTeam: parsed.underdog_team || 'Underdog',
          reasoning: parsed.rating_reasoning || '',
          varianceIndicator: parsed.variance_indicator || 'MEDIUM',
          varianceReasoning: parsed.variance_reasoning || '',
          underdogCanWinOutright: parsed.underdog_can_win_outright === true,
          outrightWinReasoning: parsed.outright_win_reasoning || '',
          confidenceScore: 0.65,
          confidenceLabel: 'CONFIDENT',
          finalPick: null,
          pickFlipped: false
        };
      }
    }

    // Method 2: Fallback - try to parse raw JSON without code blocks (new gradeless format)
    const gradelessMatch = content.match(/\{[\s\S]*?"case_summaries"[\s\S]*?"final_pick"[\s\S]*?\}/);
    if (gradelessMatch) {
      try {
        const parsed = JSON.parse(sanitizeJson(gradelessMatch[0]));
        if (parsed.case_summaries && parsed.final_pick) {
          console.log(`[Pass 2.5] ✅ Gradeless format found via raw JSON`);
          return {
            reasoning: parsed.confidence_reasoning || parsed.rationale || '',
            varianceIndicator: parsed.variance_indicator || 'MEDIUM',
            varianceReasoning: '',
            underdogCanWinOutright: parsed.underdog_can_win_outright === true,
            outrightWinReasoning: '',
            caseSummaries: parsed.case_summaries,
            stressTest: parsed.stress_test,
            finalPick: parsed.final_pick,
            confidenceScore: parseFloat(parsed.confidence_score) || 0.65,
            confidenceLabel: parsed.confidence_label || 'CONFIDENT',
            confidenceReasoning: parsed.confidence_reasoning || '',
            rationale: parsed.rationale || '',
            supportingEvidence: parsed.supporting_evidence || ''
          };
        }
      } catch (e) {
        // Continue to next method
      }
    }

    // Method 3: Fallback - try to parse raw JSON without code blocks (legacy with grades)
    const legacyMatch = content.match(/\{[\s\S]*?"case_grades"[\s\S]*?"final_pick"[\s\S]*?\}/);
    if (legacyMatch) {
      try {
        const parsed = JSON.parse(sanitizeJson(legacyMatch[0]));
        if (parsed.case_grades && parsed.final_pick) {
          console.log(`[Pass 2.5] ✅ Legacy format with grades found via raw JSON`);
          const homeGrade = parsed.case_grades.home_team?.strength || 5.0;
          const awayGrade = parsed.case_grades.away_team?.strength || 5.0;
          const homeName = parsed.case_grades.home_team?.name || 'Home';
          const awayName = parsed.case_grades.away_team?.name || 'Away';

          return {
            favoriteRating: Math.max(homeGrade, awayGrade),
            underdogRating: Math.min(homeGrade, awayGrade),
            favoriteTeam: homeGrade > awayGrade ? homeName : awayName,
            underdogTeam: homeGrade > awayGrade ? awayName : homeName,
            reasoning: parsed.confidence_reasoning || parsed.rationale || '',
            varianceIndicator: parsed.variance_indicator || 'MEDIUM',
            varianceReasoning: '',
            underdogCanWinOutright: parsed.underdog_can_win_outright === true,
            outrightWinReasoning: '',
            caseGrades: parsed.case_grades,
            tentativePick: parsed.tentative_pick,
            stressTest: parsed.stress_test,
            sanityCheckSummary: parsed.sanity_check_summary,
            finalPick: parsed.final_pick,
            pickFlipped: parsed.pick_flipped === true,
            confidenceScore: parseFloat(parsed.confidence_score) || 0.65,
            confidenceLabel: parsed.confidence_label || 'CONFIDENT',
            confidenceReasoning: parsed.confidence_reasoning || '',
            rationale: parsed.rationale || ''
          };
        }
      } catch (e) {
        // Continue to next method
      }
    }

    // Method 4: Fallback - try oldest legacy format
    const rawJsonMatch = content.match(/\{[\s\S]*?"favorite_path_rating"[\s\S]*?\}/);
    if (rawJsonMatch) {
      const parsed = JSON.parse(sanitizeJson(rawJsonMatch[0]));
      if (parsed.favorite_path_rating && parsed.underdog_path_rating) {
        console.log(`[Pass 2.5] ✅ Oldest legacy format found via raw JSON`);
        return {
          favoriteRating: parseFloat(parsed.favorite_path_rating),
          underdogRating: parseFloat(parsed.underdog_path_rating),
          favoriteTeam: parsed.favorite_team || 'Favorite',
          underdogTeam: parsed.underdog_team || 'Underdog',
          reasoning: parsed.rating_reasoning || '',
          varianceIndicator: parsed.variance_indicator || 'MEDIUM',
          varianceReasoning: parsed.variance_reasoning || '',
          underdogCanWinOutright: parsed.underdog_can_win_outright === true,
          outrightWinReasoning: parsed.outright_win_reasoning || '',
          confidenceScore: 0.65,
          confidenceLabel: 'CONFIDENT',
          finalPick: null,
          pickFlipped: false
        };
      }
    }

    return null;
  } catch (e) {
    console.log(`[Pass 2.5] Failed to parse decision: ${e.message}`);
    return null;
  }
}

/**
 * Build the PASS 3 message - Final Synthesis & Pick Decision
 * Injected AFTER Gary has all the stats he needs
 */
function buildPass3Message() {
  return `
══════════════════════════════════════════════════════════════════════
## PASS 3 - FINAL SYNTHESIS & PICK DECISION

You've gathered substantial evidence. Before making your pick, do a final check:

**BEFORE DECIDING - INVESTIGATION CHECK:**
- Did you call stats for BOTH teams' key players (game logs)?
- Did you check BOTH teams' home/away records?
- If a star is missing, did you investigate how long they've been out?
- Did you build genuine cases for BOTH sides in the Steel Man?

**IF YOU MISSED SOMETHING → CALL MORE STATS. There is no rush.**

**WHEN YOU'RE CONFIDENT YOU'VE SEEN BOTH SIDES:**

**STEP 1: WEIGH THE EVIDENCE**
- Which team's case is supported by the most RECENT and RELEVANT data?
- INJURY CHECK: Are injuries RECENT (< 2 weeks) or SEASON-LONG (1-2+ months)?
  - SEASON-LONG = Team has adapted. Focus on CURRENT contributors and RECENT FORM.
  - RECENT = Investigate how team has adjusted. This can be an edge.

**STEP 2: CONFIRM YOUR CONVICTION**
- Based on your investigation, which side do you believe wins or covers?
- What factors support your pick? (Can be multiple - defense, matchups, situational, etc.)
- Is your conviction strong enough to bet, or should you PASS?

**STEP 3: SELF-INTERROGATION**
1. **Season-Long Injury Check**: Did I cite ANY player marked [SEASON-LONG] in the injury report? If yes, REMOVE them from your rationale. Those players have been out for MONTHS - the team has adapted. Focus on CURRENT contributors.
2. **Roster Check**: Did I only mention players in the CURRENT ROSTERS section?
3. **Stat-Narrative Alignment**: Does my reasoning match the data I found?
4. **Conviction Check**: Do I genuinely believe this side wins/covers based on my analysis?

**STEP 4: OUTPUT YOUR FINAL PICK JSON**
(Refer to the RATIONALE FORMAT in the system prompt)
══════════════════════════════════════════════════════════════════════
`.trim();
}

/**
 * Build the unified PASS 3 message - Simplified Final Output
 * Most decision logic has moved to Pass 2.5
 * Pass 3 now just confirms the decision and outputs final JSON
 * 
 * @param {object} ratings - The parsed Pass 2.5 ratings (now includes confidence_score)
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 */
function buildPass3Unified(ratings, homeTeam = '[HOME]', awayTeam = '[AWAY]') {
  // Extract values from the new Pass 2.5 format
  const finalPick = ratings.finalPick || ratings.tentativePick || 'Your pick';
  const confidenceScore = ratings.confidenceScore || 0.65;
  const confidenceLabel = ratings.confidenceLabel || 'CONFIDENT';
  const pickFlipped = ratings.pickFlipped || false;
  
  const flipNote = pickFlipped ? `
**NOTE:** You flipped from your tentative pick based on the stress test and sanity check.
Make sure your rationale reflects why the NEW pick is stronger, not just why the old pick had issues.
` : '';

  const passConsideration = confidenceScore < 0.55 ? `
**LOW CONFIDENCE (${confidenceScore}):**
Your confidence is in PASS territory. If you proceed, make sure you have a specific reason.
PASS is a valid decision when you don't have edge.
` : '';
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GEMINI 3 OPTIMIZED: XML-tagged structure with END-OF-PROMPT instruction
  // ═══════════════════════════════════════════════════════════════════════════
  return `
<pass_context>
## PASS 3 - FINAL OUTPUT

You've reviewed the Steel Man cases, completed the stress test, and made your decision in Pass 2.5.
You have access to ALL evidence from your investigation - nothing is truncated.

**Your Decision:**
- **Final Pick:** ${finalPick}
- **Confidence:** ${confidenceScore} (${confidenceLabel})
${flipNote}${passConsideration}

**INVESTIGATION OPTION:**
If you realize you need more data before finalizing, you can still call fetch_stats for additional investigation.
However, if your analysis is complete, proceed directly to output.
</pass_context>

<rationale_constraints>
## RATIONALE CONSTRAINTS

Your final rationale should be built from the Steel Man case for your chosen side.
- **REFERENCE YOUR STATS:** Use the actual numbers from your investigation (efficiency gaps, L5 margins, etc.)
- Use the factors already vetted in that Steel Man case
- Do NOT introduce new claims that weren't investigated
- Explain why you believe this side wins/covers based on your analysis

**IMPORTANT:** All the stats you called during Pass 2 investigation are available in this conversation.
Reference those specific numbers in your rationale to make it data-driven.

**NO EMOJIS:** Never include emojis in your output.
</rationale_constraints>

<closing_ability_check>
## FINAL CHECK: Who Closes Games? (Structure vs Star)

Before finalizing, investigate closing dynamics for BOTH teams:

**STRUCTURAL EDGE:**
- Structure gets a team the lead in the 1st half
- But in the 4th quarter of close games, coaches abandon systems and give it to their best player
- Investigate: Which team has the better closer if the game is close in the 4th?

**STAR POWER:**
- Star power keeps or steals the lead in the 2nd half
- But stars cannot overcome massive structural mismatches if the game is never close
- Investigate: Which team has enough structure to keep it competitive until crunch time?

**CLOSING QUESTION:**
If this game comes down to the final 5 minutes within 5 points, which team has the higher probability of closing?
Investigate the closing ability for both teams and factor this into your pick.
</closing_ability_check>

<output_requirements>
## OUTPUT REQUIREMENTS

Include all fields from your Pass 2.5 analysis plus final rationale.
The confidence_score (0.50-0.95) replaces old confidence_tier (MAX/CORE/SPECULATIVE).
</output_requirements>

<instructions>
## YOUR TASK

OUTPUT YOUR FINAL PICK JSON NOW.

Use the format from the system prompt's RATIONALE FORMAT section.
All analysis is complete - just finalize and output.

<negative_constraints>
SEASON-LONG injuries: The team has adapted. Focus on current roster performance.
Missing players' stats have been REDISTRIBUTED to current players.
If citing "X-Y record without player", investigate the MARGINS - were losses close or blowouts?
Focus on WHO IS PLAYING and RECENT FORM, not hypotheticals about healthy rosters.
</negative_constraints>
</instructions>
`.trim();
}

/**
 * Build the MID-INVESTIGATION SYNTHESIS message
 * Injected at iteration 3-4 to force Gary to synthesize before context overload
 */
function buildMidInvestigationSynthesis(statsCalledSoFar, homeTeam, awayTeam) {
  // ═══════════════════════════════════════════════════════════════════════════
  // GEMINI 3 OPTIMIZED: XML-tagged structure with END-OF-PROMPT instruction
  // ═══════════════════════════════════════════════════════════════════════════
  return `
<synthesis_context>
## MID-INVESTIGATION SYNTHESIS

You've called ${statsCalledSoFar} stats. Time to synthesize before context overload.
</synthesis_context>

<synthesis_questions>
## QUESTIONS TO ANSWER (in your thinking)

1. **WHAT FACTORS WILL ACTUALLY DECIDE THIS GAME TONIGHT?**
   - Not "who is the better team on paper"
   - What specific factors will determine the outcome TONIGHT?
   - These are your "LEVERS OF VICTORY" - could be 1, could be 5

2. **WHAT IS THE STRONGEST CASE FOR EACH SIDE?**
   - ${homeTeam}: What factors are most compelling?
   - ${awayTeam}: What factors are most compelling?

3. **WHAT QUESTIONS REMAIN UNANSWERED?**
   - Is there a trigger you haven't investigated yet?
   - Is there a key player log you need?
   - Is there a matchup detail you're missing?
</synthesis_questions>

<instructions>
## YOUR TASK

Using your synthesis above, decide your next action:

- **IF unanswered questions remain** - Call more stats NOW
- **IF you've identified the key drivers** → Proceed to build your Steel Man cases

**THE QUESTION:** What do you predict will happen tonight?

CONTINUE YOUR ANALYSIS NOW.
</instructions>
`.trim();
}

// Legacy function for backwards compatibility
function buildUserMessage(scoutReport, homeTeam, awayTeam, today, sport = '') {
  return buildPass1Message(scoutReport, homeTeam, awayTeam, today, sport);
}

/**
 * Call Gemini API and return OpenAI-compatible response format
 * Handles message conversion, tool calling, and response transformation
 * Uses Gemini 3 Deep Think with thinking_level: "high" and Google Search Grounding
 * 
 * @param {Array} messages - The messages to send
 * @param {Array} tools - Function calling tools
 * @param {string} modelName - Gemini model to use
 * @param {string} currentPass - Current pass type for temperature selection
 *   - 'investigation': Lower temp (0.35) for accurate data gathering
 *   - 'steel_man': Higher temp (0.65) for creative case-building
 *   - 'conviction_rating': Lower temp (0.35) for consistent ratings
 *   - 'final_decision': Balanced temp (0.55) for thoughtful decisions
 */
async function callGemini(messages, tools, modelName = 'gemini-3-flash-preview', currentPass = 'default') {
  const genAI = getGemini();
  
  // Convert OpenAI tools to Gemini function declarations
  const functionDeclarations = tools.map(tool => {
    if (tool.type === 'function') {
      return {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters
      };
    }
    return null;
  }).filter(Boolean);

  // Build tools array
  // NOTE: Gemini 3 does NOT support google_search + functionDeclarations together
  // Grounding is handled in the Scout Report phase; main analysis uses function calling only
  const geminiTools = [];
  
  // Add BDL stat functions for Gary's analysis
  if (functionDeclarations.length > 0) {
    geminiTools.push({ functionDeclarations });
    // Can't use grounding when function calling is enabled
    if (CONFIG.gemini.grounding?.enabled) {
      console.log(`[Gemini] Note: Grounding disabled in analysis (incompatible with function calling) - handled in Scout Report`);
    }
  } else if (CONFIG.gemini.grounding?.enabled) {
    // Only enable grounding if no function declarations (fallback case)
    geminiTools.push({
      google_search: {}
    });
    console.log(`[Gemini] Google Search Grounding enabled (no functions)`);
  }

  // Select thinking level based on MODEL (Jan 29, 2026)
  // Flash: 'medium' - balanced speed/reasoning
  // Pro: 'high' - deep reasoning for decisions
  const isFlash = modelName.toLowerCase().includes('flash');
  const thinkingLevel = isFlash
    ? CONFIG.gemini.thinkingLevelByModel.flash
    : CONFIG.gemini.thinkingLevelByModel.pro;
  console.log(`[Gemini] Pass: ${currentPass}, Model: ${modelName}, ThinkingLevel: ${thinkingLevel}`);

  // Convert OpenAI messages to Gemini format
  let systemInstruction = '';
  const contents = [];
  
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction += (systemInstruction ? '\n\n' : '') + msg.content;
    } else if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content }]
      });
    } else if (msg.role === 'assistant') {
      // Handle assistant messages that might have tool_calls
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const parts = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        for (const tc of msg.tool_calls) {
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments)
            }
          });
        }
        contents.push({ role: 'model', parts });
      } else {
        contents.push({
          role: 'model',
          parts: [{ text: msg.content || '' }]
        });
      }
    } else if (msg.role === 'tool') {
      // Handle tool responses
      contents.push({
        role: 'function',
        parts: [{
          functionResponse: {
            name: msg.name || msg.tool_call_id || 'tool_response',
            response: { content: msg.content }
          }
        }]
      });
    }
  }

  // Get the model with Gemini 3 configuration (updated per Google best practices)
  const model = genAI.getGenerativeModel({
    model: modelName,
    tools: geminiTools.length > 0 ? geminiTools : undefined,
    safetySettings: GEMINI_SAFETY_SETTINGS,
    generationConfig: {
      temperature: CONFIG.gemini.temperature, // Fixed at 1.0 per Google recommendation
      topP: CONFIG.gemini.topP, // Include plausible longshots in reasoning
      maxOutputTokens: CONFIG.maxTokens,
      // Gemini 3 thinkingConfig - use thinkingLevel (replaces legacy thinkingBudget)
      // "low" = fast, minimal latency | "high" = deep reasoning (default)
      thinkingConfig: {
        includeThoughts: true,
        thinkingLevel: thinkingLevel // "low", "medium", "high" - controls reasoning depth
      }
    }
  });

  // Create chat session with system instruction
  const chat = model.startChat({
    history: contents.slice(0, -1), // All but the last message
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined
  });

  // Send the last message and get response
  const lastMessage = contents[contents.length - 1];
  const lastContent = lastMessage?.parts?.map(p => p.text || '').join('') || '';
  
  console.log(`[Gemini] Sending request to ${modelName}...`);
  const startTime = Date.now();
  
  try {
    const result = await chat.sendMessage(lastContent);
    const response = await result.response;
    
    const duration = Date.now() - startTime;
    console.log(`[Gemini] Response received in ${duration}ms`);

    // Convert Gemini response to OpenAI-compatible format
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    
    // Check if Grounding was used - log search queries for transparency
    const groundingMetadata = candidate?.groundingMetadata;
    if (groundingMetadata) {
      const searchQueries = groundingMetadata.webSearchQueries || [];
      const groundingChunks = groundingMetadata.groundingChunks || [];
      
      if (searchQueries.length > 0) {
        console.log(`[Gemini Grounding] 🔍 Searched for: "${searchQueries.join('", "')}"`);
      }
      if (groundingChunks.length > 0) {
        console.log(`[Gemini Grounding] 📰 Found ${groundingChunks.length} source(s) for context`);
        // Log first few sources for debugging
        groundingChunks.slice(0, 3).forEach((chunk, i) => {
          const title = chunk.web?.title || chunk.retrievedContext?.title || 'Unknown';
          const uri = chunk.web?.uri || chunk.retrievedContext?.uri || '';
          console.log(`[Gemini Grounding]    ${i + 1}. ${title} ${uri ? `(${uri.slice(0, 60)}...)` : ''}`);
        });
      }
    }
    
    // Debug: log what we got back
    if (parts.length === 0) {
      // Check if response was blocked
      const blockReason = response.promptFeedback?.blockReason || candidate?.finishReason;
      if (blockReason && blockReason !== 'STOP') {
        console.log(`[Gemini] ⚠️ Response blocked/filtered. Reason: ${blockReason}`);
        throw new Error(`Gemini response blocked: ${blockReason}. This is a transient API issue - retry may succeed.`);
      }
      const candidateStr = candidate ? JSON.stringify(candidate, null, 2).slice(0, 500) : 'undefined';
      console.log(`[Gemini] WARNING: No parts in response. Candidate:`, candidateStr);
    }
    
    // Check for ALL function calls (Gemini can return multiple in parallel)
    const functionCallParts = parts.filter(p => p.functionCall);
    const textParts = parts.filter(p => p.text).map(p => p.text);
    
    // Build tool_calls array for ALL function calls
    let toolCalls = undefined;
    if (functionCallParts.length > 0) {
      toolCalls = functionCallParts.map((fc, index) => ({
        id: `call_${Date.now()}_${index}`,
        type: 'function',
        function: {
          name: fc.functionCall.name,
          arguments: JSON.stringify(fc.functionCall.args || {})
        }
      }));
      console.log(`[Gemini] Found ${functionCallParts.length} parallel function call(s)`);
    }

    // Build OpenAI-compatible response
    const openaiResponse = {
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: functionCallParts.length > 0 ? null : textParts.join(''),
          tool_calls: toolCalls
        },
        finish_reason: functionCallParts.length > 0 ? 'tool_calls' : 
                       candidate?.finishReason === 'STOP' ? 'stop' : 
                       candidate?.finishReason?.toLowerCase() || 'stop'
      }],
      usage: {
        prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
        completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: response.usageMetadata?.totalTokenCount || 0
      }
    };

    // Log token usage
    if (openaiResponse.usage) {
      console.log(`[Gemini] Tokens - Prompt: ${openaiResponse.usage.prompt_tokens}, Completion: ${openaiResponse.usage.completion_tokens}`);
    }

    return openaiResponse;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Gemini] Error after ${duration}ms:`, error.message);
    
    // Handle aborted request error gracefully
    if (error.message?.includes('USER_ABORTED') || error.message?.includes('aborted')) {
      console.warn('[Gemini] Request was aborted. Returning graceful error state.');
      return {
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'I encountered an error while processing this game (request aborted). I will skip this game and continue.',
            tool_calls: null
          },
          finish_reason: 'error'
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      };
    }
    
    throw error;
  }
}

/**
 * Wrapper around callGemini with retry logic for transient errors (500, 503, etc.)
 */
async function callGeminiWithRetry(messages, tools, modelName, maxRetries = 3, currentPass = 'default') {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await callGemini(messages, tools, modelName, currentPass);
    } catch (error) {
      lastError = error;
      
      // Retry on server errors (500, 502, 503, 504) and blocked responses
      const isServerError = error.status >= 500 && error.status < 600;
      const isBlockedResponse = error.message?.includes('blocked') || 
                                error.message?.includes('OTHER') ||
                                error.message?.includes('SAFETY');
      const isRetryable = isServerError || isBlockedResponse ||
                         error.message?.includes('500') || 
                         error.message?.includes('Internal Server Error') ||
                         error.message?.includes('503') ||
                         error.message?.includes('UNAVAILABLE');
      
      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[Gemini] ⚠️ Server error (attempt ${attempt}/${maxRetries}). Retrying in ${delay/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Determine the current pass based on message history
 * Returns: 'investigation', 'steel_man', 'conviction_rating', 'final_decision', or 'default'
 */
function determineCurrentPass(messages) {
  // Check from most recent to oldest
  // FIXED: Check for both "FINAL DECISION" (old) and "FINAL OUTPUT" (new buildPass3Unified format)
  const hasPass3 = messages.some(m => 
    m.content?.includes('PASS 3 - FINAL DECISION') || m.content?.includes('PASS 3 - FINAL OUTPUT')
  );
  if (hasPass3) return 'final_decision';
  
  const hasPass25 = messages.some(m => m.content?.includes('PASS 2.5 - CONVICTION ASSESSMENT'));
  if (hasPass25) return 'conviction_rating';
  
  // FIXED: Check for actual output string from buildPass2Message
  const hasPass2 = messages.some(m => m.content?.includes('PASS 2 - STEEL MAN') || m.content?.includes('PASS 2 - EVIDENCE GATHERING'));
  if (hasPass2) return 'steel_man';
  
  // Default to investigation (Pass 1)
  return 'investigation';
}

/**
 * Run the agent loop - handles tool calls and conversation flow
 * 
 * GEMINI 3 ARCHITECTURE (2026 Update):
 * - Uses PERSISTENT chat sessions for automatic thought signature handling
 * - Flash session for Investigation + Steel Man (Pass 1-2)
 * - Pro session for Grading + Final Decision (Pass 2.5-3) for NBA/NFL/NHL
 * - NCAAB stays on Flash throughout (high volume)
 * 
 * @param {string} systemPrompt - The system prompt
 * @param {string} userMessage - The user message (scout report + game context)
 * @param {string} sport - Sport identifier
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {Object} options - Additional options
 * @param {Array} options.sharedMessages - If provided, append to this shared history (session mode)
 */
async function runAgentLoop(systemPrompt, userMessage, sport, homeTeam, awayTeam, options = {}) {
  // Sport-based provider routing
  const provider = getProviderForSport(sport);
  const initialModel = getModelForProvider(provider, sport);
  
  // Check if we're using shared messages (session mode for true memory)
  const isSessionMode = !!options.sharedMessages;
  
  // Determine if this sport uses Pro for grading/decision phases
  const useProForGrading = sportUsesPro(sport);
  
  const isNFLSport = sport === 'americanfootball_nfl' || sport === 'NFL';
  console.log(`[Orchestrator] Using ${provider.toUpperCase()} for ${sport}${isSessionMode ? ' [SESSION MODE]' : ''}`);
  console.log(`[Orchestrator] Model strategy: Flash for investigation${isNFLSport && useProForGrading ? ', Pro for Steel Man + decision' : useProForGrading ? ', Pro for review/decision' : ' (all phases)'}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENT SESSION SETUP (Gemini 3 Thought Signature Compliance)
  // ═══════════════════════════════════════════════════════════════════════════
  // Create Flash session for investigation phase
  // SDK automatically handles thought signatures when using persistent sessions
  let currentSession = null;
  let currentModelName = initialModel;
  let hasSwichedToPro = false;
  
  if (provider === 'gemini') {
    // OPTIMIZATION: Use 'low' thinking for investigation (tool calling)
    // Save 'high' reasoning for Steel Man, Pass 2.5 grading, and final decision
    currentSession = createGeminiSession({
      modelName: 'gemini-3-flash-preview',
      systemPrompt: systemPrompt,
      tools: toolDefinitions,
      thinkingLevel: 'low'  // Low reasoning for stat fetching - no deep thinking needed
    });
    currentModelName = currentSession.modelName;
    console.log(`[Orchestrator] 🚀 Flash session created for investigation phase (low reasoning)`);
  }

  // Messages array for state tracking (pass detection, steel man capture)
  // Note: For Gemini, actual API calls go through the persistent session
  let messages;
  if (isSessionMode) {
    messages = options.sharedMessages;
    messages.push({ role: 'user', content: userMessage });
    console.log(`[Orchestrator] Session history: ${messages.length} messages`);
  } else {
    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];
  }

  let iteration = 0;
  const toolCallHistory = [];
  
  // Store full steel man cases for transparency/debugging
  let steelManCases = {
    homeTeamCase: null,
    awayTeamCase: null,
    capturedAt: null
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENT SESSION STATE TRACKING
  // ═══════════════════════════════════════════════════════════════════════════
  // Track what message to send next (for persistent session approach)
  // First iteration: send userMessage
  // Subsequent: send function responses OR pass transition messages
  let nextMessageToSend = userMessage;
  let pendingFunctionResponses = []; // Batched function responses to send

  while (iteration < CONFIG.maxIterations) {
    iteration++;
    console.log(`\n[Orchestrator] Iteration ${iteration}/${CONFIG.maxIterations} (${provider}, ${currentModelName})`);
    
    // Get the spread for Pass 2/2.5 context injection (available throughout loop)
    const spread = options.spread || 0;

    let response;
    let message;
    let finishReason;
    
    if (provider === 'gemini' && currentSession) {
      // ═══════════════════════════════════════════════════════════════════════
      // PERSISTENT SESSION API CALL (Gemini 3 with thought signature handling)
      // ═══════════════════════════════════════════════════════════════════════
      const currentPass = determineCurrentPass(messages);
      
      try {
        let sessionResponse;
        
        if (pendingFunctionResponses.length > 0) {
          // Step 1: Send batched function responses
          console.log(`[Orchestrator] Sending ${pendingFunctionResponses.length} function response(s) to session`);
          sessionResponse = await sendToSessionWithRetry(
            currentSession, 
            pendingFunctionResponses, 
            { isFunctionResponse: true }
          );
          pendingFunctionResponses = []; // Clear after sending
          
          // Step 2: Check if Gary responded without tool calls AND we have a pass message queued
          // If so, send the pass message immediately as a follow-up
          const hasQueuedPassMessage = nextMessageToSend && nextMessageToSend !== userMessage && 
            (nextMessageToSend.includes('PASS 2') || nextMessageToSend.includes('STEEL MAN') || 
             nextMessageToSend.includes('PASS 2.5') || nextMessageToSend.includes('CASE REVIEW') || nextMessageToSend.includes('CASE EVALUATION'));
          
          if (!sessionResponse.toolCalls && hasQueuedPassMessage) {
            console.log(`[Orchestrator] 📝 Sending queued pass message after function responses`);
            // Send the pass message as follow-up
            sessionResponse = await sendToSessionWithRetry(currentSession, nextMessageToSend);
            nextMessageToSend = null; // Clear after sending
          }
          
        } else {
          // Send text message (user message or pass transition)
          if (!nextMessageToSend) {
            console.log(`[Orchestrator] ⚠️ No message to send - using fallback prompt`);
            nextMessageToSend = `Continue with your analysis. If you have enough data, proceed to write your Steel Man cases or provide your final pick.`;
          }
          sessionResponse = await sendToSessionWithRetry(currentSession, nextMessageToSend);
        }
        
        // Convert session response to OpenAI-compatible format for downstream code
        message = {
          role: 'assistant',
          content: sessionResponse.content,
          tool_calls: sessionResponse.toolCalls
        };
        finishReason = sessionResponse.finishReason;
        
        // Log token usage
        if (sessionResponse.usage) {
          console.log(`[Orchestrator] Tokens - Prompt: ${sessionResponse.usage.prompt_tokens}, Completion: ${sessionResponse.usage.completion_tokens}`);
        }
        
        // Add assistant message to messages array for state tracking
        if (message.content || message.tool_calls) {
          messages.push(message);
        }
        
      } catch (error) {
        // Handle quota errors with model fallback
        // Flash -> Pro fallback (Flash hit rate limit, use Pro)
        if (error.isQuotaError && currentModelName === 'gemini-3-flash-preview') {
          console.log(`[Orchestrator] ⚠️ Flash quota exceeded - falling back to Pro`);

          // Extract textual context to pass to Pro
          const textualContext = extractTextualSummaryForModelSwitch(messages, steelManCases, toolCallHistory);

          // Create new Pro session for fallback
          currentSession = createGeminiSession({
            modelName: 'gemini-3-pro-preview',
            systemPrompt: systemPrompt + '\n\n' + textualContext,
            tools: currentPass === 'conviction_rating' ? [] : toolDefinitions,
            thinkingLevel: 'high'
          });
          currentModelName = 'gemini-3-pro-preview';
          hasSwichedToPro = true;

          console.log(`[Orchestrator] 🔄 Created fallback Pro session, retrying...`);

          // Retry with new session
          const retryResponse = await sendToSessionWithRetry(currentSession, nextMessageToSend);
          message = {
            role: 'assistant',
            content: retryResponse.content,
            tool_calls: retryResponse.toolCalls
          };
          finishReason = retryResponse.finishReason;

          if (message.content || message.tool_calls) {
            messages.push(message);
          }
        }
        // Pro -> Flash fallback (Pro hit rate limit, use Flash)
        else if (error.isQuotaError && currentModelName === 'gemini-3-pro-preview') {
          console.log(`[Orchestrator] ⚠️ Pro quota exceeded - falling back to Flash`);
          
          // Extract textual context to pass to Flash (include full stat history)
          const textualContext = extractTextualSummaryForModelSwitch(messages, steelManCases, toolCallHistory);
          
          // Create new Flash session for fallback
          currentSession = createGeminiSession({
            modelName: 'gemini-3-flash-preview',
            systemPrompt: systemPrompt + '\n\n' + textualContext,
            tools: currentPass === 'conviction_rating' ? [] : toolDefinitions, // Pass 3 can call more stats if needed
            thinkingLevel: 'high'
          });
          currentModelName = 'gemini-3-flash-preview';
          hasSwichedToPro = false; // Went back to Flash
          
          console.log(`[Orchestrator] 🔄 Created fallback Flash session, retrying...`);
          
          // Retry with new session
          const retryResponse = await sendToSessionWithRetry(currentSession, nextMessageToSend);
          message = {
            role: 'assistant',
            content: retryResponse.content,
            tool_calls: retryResponse.toolCalls
          };
          finishReason = retryResponse.finishReason;
          
          if (message.content || message.tool_calls) {
            messages.push(message);
          }
        } else if (error.message?.includes('MALFORMED_FUNCTION_CALL')) {
          // MALFORMED_FUNCTION_CALL after retries - force transition to Steel Man instead of failing
          console.log(`[Orchestrator] ⚠️ MALFORMED_FUNCTION_CALL after retries - forcing Steel Man transition`);
          console.log(`[Orchestrator] 🔄 Recovering by extracting context and creating new session for Steel Man`);

          // Extract what we have so far
          const textualContext = extractTextualSummaryForModelSwitch(messages, steelManCases, toolCallHistory);

          // Create fresh Pro session for Steel Man with reduced context
          currentSession = createGeminiSession({
            modelName: 'gemini-3-pro-preview',
            systemPrompt: systemPrompt + '\n\n[RECOVERY MODE] Investigation phase hit errors. Proceed directly to Steel Man cases with available data.\n\n' + textualContext,
            tools: toolDefinitions,
            thinkingLevel: 'high'
          });
          currentModelName = 'gemini-3-pro-preview';
          hasSwichedToPro = true;

          // Force Steel Man transition
          const steelManPrompt = `[PASS 2 - STEEL MAN] You have gathered sufficient data. Write your Steel Man cases now:

**Case for ${homeTeam}** (the home team):
[Build the strongest case for why ${homeTeam} covers/wins, using ONLY the data from your investigation]

**Case for ${awayTeam}** (the away team):
[Build the strongest case for why ${awayTeam} covers/wins, using ONLY the data from your investigation]

Focus on TIER 1 predictive stats (efficiency, EPA) and TIER 2 context (fresh injuries, matchups). Proceed with your Steel Man analysis.`;

          const recoveryResponse = await sendToSessionWithRetry(currentSession, steelManPrompt);
          message = {
            role: 'assistant',
            content: recoveryResponse.content,
            tool_calls: recoveryResponse.toolCalls
          };
          finishReason = recoveryResponse.finishReason;

          if (message.content || message.tool_calls) {
            messages.push(message);
          }

          // Clear pending function responses to avoid stale state
          pendingFunctionResponses = [];
        } else {
          throw error;
        }
      }

    } else if (provider === 'gemini') {
      // Fallback to old method if session not available (shouldn't happen)
      const currentPass = determineCurrentPass(messages);
      response = await callGeminiWithRetry(messages, toolDefinitions, currentModelName, 3, currentPass);
      message = response.choices[0].message;
      finishReason = response.choices[0].finish_reason;
      
      if (response.usage) {
        console.log(`[Orchestrator] Tokens - Prompt: ${response.usage.prompt_tokens}, Completion: ${response.usage.completion_tokens}`);
      }
    } else {
      // Call OpenAI/GPT-5.1 with tools
      response = await getOpenAI().chat.completions.create({
        model: currentModelName,
        messages,
        tools: toolDefinitions,
        tool_choice: 'auto',
        max_completion_tokens: CONFIG.maxTokens,
        reasoning_effort: CONFIG.openai.reasoning.effort
      });
      message = response.choices[0].message;
      finishReason = response.choices[0].finish_reason;
      
      if (response.usage) {
        console.log(`[Orchestrator] Tokens - Prompt: ${response.usage.prompt_tokens}, Completion: ${response.usage.completion_tokens}`);
      }
    }

    // STEEL MAN CAPTURE: Extract and store Gary's bilateral analysis when it appears
    // Cases can appear in any iteration (typically around iteration 4-5), not just iteration 2
    if (message.content && !steelManCases.capturedAt) {
      const content = message.content;
      
      // Extract FULL "Case for [Team]" sections using improved regex
      // Match "CASE FOR [Team Name]" followed by content until the next "CASE FOR" or end markers
      const casePattern = /(?:\*\*)?(?:Case for|CASE FOR|Analysis for|ANALYSIS FOR)[:\s*]+([^\n*]+)[\s\S]*?(?=(?:\*\*)?(?:Case for|CASE FOR|Analysis for|ANALYSIS FOR)|###|---|\n## |$)/gi;
      const caseMatches = [...content.matchAll(casePattern)];
      
      if (caseMatches.length >= 2) {
        console.log(`\n┌─────────────────────────────────────────────────────────────────┐`);
        console.log(`│  📊 STEEL MAN CASES CAPTURED (Iteration ${iteration})                      │`);
        console.log(`├─────────────────────────────────────────────────────────────────┤`);
        
        // Determine which case is home vs away based on team names
        const fullCases = caseMatches.slice(0, 2).map(match => match[0].trim());
        
        // Try to identify which is home/away by checking team names
        const case1Lower = fullCases[0].toLowerCase();
        const case2Lower = fullCases[1].toLowerCase();
        const homeTeamLower = homeTeam.toLowerCase();
        const awayTeamLower = awayTeam.toLowerCase();
        
        // Check which case mentions which team in the header
        const case1IsHome = case1Lower.includes(homeTeamLower.split(' ').pop()) || 
                           (homeTeamLower.split(' ').some(w => w.length > 3 && case1Lower.substring(0, 100).includes(w)));
        
        if (case1IsHome) {
          steelManCases.homeTeamCase = fullCases[0];
          steelManCases.awayTeamCase = fullCases[1];
        } else {
          steelManCases.awayTeamCase = fullCases[0];
          steelManCases.homeTeamCase = fullCases[1];
        }
        steelManCases.capturedAt = new Date().toISOString();
        
        // Log preview of each case
        console.log(`│  🏠 ${homeTeam}: ${steelManCases.homeTeamCase?.substring(0, 150).replace(/\n/g, ' ')}...`);
        console.log(`│`);
        console.log(`│  ✈️ ${awayTeam}: ${steelManCases.awayTeamCase?.substring(0, 150).replace(/\n/g, ' ')}...`);
        console.log(`│`);
        console.log(`│  ✅ Full cases captured (${steelManCases.homeTeamCase?.length || 0} + ${steelManCases.awayTeamCase?.length || 0} chars)`);
        console.log(`└─────────────────────────────────────────────────────────────────┘\n`);
      }
    }

    // Handle empty response from Gemini (common when model is confused)
    if (provider === 'gemini' && !message.content && !message.tool_calls) {
      // Check what pass we're in to provide appropriate nudge
      const pass2WasInjected = messages.some(m => m.content?.includes('PASS 2 - STEEL MAN') || m.content?.includes('STEEL MAN ANALYSIS'));
      const pass25WasInjected = messages.some(m => m.content?.includes('PASS 2.5') || m.content?.includes('CASE REVIEW') || m.content?.includes('CASE EVALUATION'));
      
      let nudgeContent;
      
      if (pass25WasInjected) {
        // Pass 2.5 already sent - need decision, not stats
        console.log(`[Orchestrator] ⚠️ Gemini returned empty response after Pass 2.5 - requesting decision output`);
        nudgeContent = `You didn't provide a response. Please complete your Pass 2.5 analysis NOW:

1. Review BOTH Steel Man cases objectively (summarize key arguments)
2. Stress test BOTH sides (identify red flags)
3. Make your FINAL DECISION and output JSON with confidence_score

Do NOT call any more stats. Provide your analysis and pick NOW.`;
      } else if (pass2WasInjected) {
        // Pass 2 already sent - need Steel Man cases, not stats
        console.log(`[Orchestrator] ⚠️ Gemini returned empty response after Pass 2 - requesting Steel Man cases`);
        nudgeContent = `You didn't provide a response. You have enough data (${toolCallHistory.length} stats gathered).

**WRITE YOUR STEEL MAN CASES NOW:**
1. **ANALYSIS FOR ${homeTeam}:** 3-4 paragraphs with key factors, data, and statistical argument
2. **ANALYSIS FOR ${awayTeam}:** 3-4 paragraphs with key factors, data, and statistical argument

Do NOT request more stats. Write your analysis NOW using the data you already have.`;
      } else {
        // Still in investigation phase
        // If Gary already has 5+ stats, encourage moving to analysis rather than more stats
        if (toolCallHistory.length >= 5) {
          console.log(`[Orchestrator] Gary has ${toolCallHistory.length} stats - encouraging analysis`);
          nudgeContent = `I notice you didn't respond. You've already gathered ${toolCallHistory.length} stats. You have enough data to begin your analysis.

Either:
1. Request specific additional stats if there's a key factor you need to investigate
2. Or proceed to write your Steel Man cases for both teams

What would you like to do?`;
        } else {
          console.log(`[Orchestrator] ⚠️ Gemini returned empty response - prompting for more stats`);
          nudgeContent = `I notice you didn't respond. Please use the get_stat tool to request stats for this matchup. You've gathered ${toolCallHistory.length} stats so far. Request more stats like PACE, RECENT_FORM, or TURNOVER_STATS to complete your analysis.`;
        }
      }
      
      messages.push({ role: 'user', content: nudgeContent });
      
      // For persistent session, set next message to send
      nextMessageToSend = nudgeContent;
      continue;
    }

    // Check if Gary requested tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      // Build set of ALREADY FETCHED stats from history (across all iterations)
      // Include BOTH full tokens and base tokens to catch duplicates properly
      const alreadyFetchedStats = new Set();
      for (const t of toolCallHistory) {
        const token = t.token || '';
        if (token) {
          // Add full token (e.g., "PLAYER_GAME_LOGS:Drake Maye")
          alreadyFetchedStats.add(token);
          // Also add base token (e.g., "PLAYER_GAME_LOGS") for generic checks
          const baseToken = token.split(':')[0];
          if (baseToken && baseToken !== token) {
            alreadyFetchedStats.add(baseToken);
          }
        }
      }
      
      // Deduplicate tool calls - both within this batch AND against history
      const seenStats = new Set();
      const skippedDuplicates = [];
      
      const uniqueToolCalls = message.tool_calls.filter(tc => {
        try {
          const args = JSON.parse(tc.function.arguments);
          // Key based on function name + stat identifier (token for fetch_stats, stat_type for player stats)
          const token = args.token || args.stat_type || 'unknown';
          const key = `${tc.function.name}:${token}`;
          
          // Check if already fetched in previous iterations
          if (alreadyFetchedStats.has(token) || alreadyFetchedStats.has(key)) {
            skippedDuplicates.push(token);
            return false; // Skip - already have this data
          }
          
          // Check if duplicate within this batch
          if (seenStats.has(key)) {
            skippedDuplicates.push(token);
            return false; // Skip duplicate in batch
          }
          seenStats.add(key);
          return true;
        } catch {
          return true; // Keep if can't parse
        }
      });
      
      const dupeCount = message.tool_calls.length - uniqueToolCalls.length;
      if (dupeCount > 0) {
        console.log(`[Orchestrator] Deduplicated ${dupeCount} duplicate stat request(s): ${skippedDuplicates.slice(0, 5).join(', ')}${skippedDuplicates.length > 5 ? '...' : ''}`);
      }
      
      console.log(`[Orchestrator] Gary requested ${uniqueToolCalls.length} stat(s):`);

      // Note: Assistant message already added to messages array after API call (for session tracking)

      // CRITICAL FIX: Handle when ALL tool calls were duplicates
      // Without this, Gary keeps requesting the same stats and loops forever
      if (uniqueToolCalls.length === 0 && message.tool_calls.length > 0) {
        console.log(`[Orchestrator] All ${message.tool_calls.length} stats already gathered - nudging Gary to proceed`);

        // Build list of already-gathered stats for context
        const gatheredStats = toolCallHistory.map(t => t.token).filter(Boolean);
        const statsSummary = gatheredStats.length > 10
          ? `${gatheredStats.slice(0, 10).join(', ')}... (${gatheredStats.length} total)`
          : gatheredStats.join(', ');

        // Determine what phase we're in
        const pass2Injected = messages.some(m => m.content?.includes('PASS 2 - STEEL MAN') || m.content?.includes('STEEL MAN ANALYSIS'));
        const pass25Injected = messages.some(m => m.content?.includes('PASS 2.5') || m.content?.includes('CASE REVIEW') || m.content?.includes('CASE EVALUATION'));

        let nudgeMessage;
        if (pass25Injected) {
          nudgeMessage = `You requested stats that you already have. You've gathered ${toolCallHistory.length} stats: ${statsSummary}

STOP requesting stats and MAKE YOUR FINAL DECISION NOW. Output your JSON pick with confidence_score and rationale.`;
        } else if (pass2Injected) {
          nudgeMessage = `You requested stats that you already have. You've gathered ${toolCallHistory.length} stats: ${statsSummary}

STOP requesting stats. You have enough data. Write your Steel Man cases NOW using the data you've already gathered.`;
        } else {
          nudgeMessage = `You requested stats that you already have (${skippedDuplicates.join(', ')}).

You've already gathered ${toolCallHistory.length} stats: ${statsSummary}

If you need different stats, request NEW ones. If you have enough data, proceed to your Steel Man analysis.`;
        }

        messages.push({
          role: 'user',
          content: nudgeMessage
        });

        nextMessageToSend = nudgeMessage;
        continue;
      }

      // Process each unique tool call
      for (const toolCall of uniqueToolCalls) {
        const args = JSON.parse(toolCall.function.arguments);
        const functionName = toolCall.function.name;

        // Handle fetch_narrative_context tool (storylines, player news, context)
        if (functionName === 'fetch_narrative_context') {
          console.log(`  → [NARRATIVE_CONTEXT] for query: "${args.query}"`);

          try {
            const { geminiGroundingSearch } = await import('./scoutReport/scoutReportBuilder.js');
            
            // Allow Gary to investigate any query, including weather
            // Gary decides what matters based on the data returned
            
            const searchResult = await geminiGroundingSearch(args.query, {
              temperature: 1.0,
              maxTokens: 1000
            });

            if (searchResult?.success && searchResult?.data) {
              const toolResponse = {
                role: 'tool',
                tool_call_id: toolCall.id,
                name: functionName,
                content: JSON.stringify({
                  query: args.query,
                  results: searchResult.data
                })
              };
              messages.push(toolResponse);
              console.log(`    ✓ Found narrative context via Gemini Grounding (${searchResult.data.length} chars)`);
            } else {
              throw new Error('Grounding search failed or returned no data');
            }
          } catch (e) {
            console.error(`    ❌ narrative_context error:`, e.message);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: functionName,
              content: JSON.stringify({ error: `Search failed: ${e.message}. Fall back to other stats.` })
            });
          }
          continue;
        }

        // Handle fetch_nfl_player_stats tool (advanced player stats)
        if (functionName === 'fetch_nfl_player_stats') {
          console.log(`  → [NFL_PLAYER_STATS:${args.stat_type}] for ${args.team}${args.player_name ? ` (${args.player_name})` : ''}`);

          try {
            const { ballDontLieService } = await import('../ballDontLieService.js');

            let statResult = { stat_type: args.stat_type, team: args.team, data: [] };

            // Get team ID first
            const teams = await ballDontLieService.getTeams('americanfootball_nfl');
            const team = teams.find(t =>
              t.full_name?.toLowerCase().includes(args.team.toLowerCase()) ||
              t.name?.toLowerCase().includes(args.team.toLowerCase()) ||
              t.location?.toLowerCase().includes(args.team.toLowerCase())
            );

            if (!team) {
              statResult.error = `Team "${args.team}" not found`;
            } else {
              // Calculate NFL season dynamically: Aug-Dec = current year, Jan-Jul = previous year
              const nflMonth = new Date().getMonth() + 1;
              const nflYear = new Date().getFullYear();
              const season = nflMonth <= 7 ? nflYear - 1 : nflYear;

              if (args.stat_type === 'PASSING') {
                const data = await ballDontLieService.getNflAdvancedPassingStats({ season });
                // Filter by team and optionally player
                statResult.data = (data || [])
                  .filter(p => p.player?.team?.id === team.id || p.player?.team?.full_name === team.full_name)
                  .filter(p => !args.player_name ||
                    `${p.player?.first_name} ${p.player?.last_name}`.toLowerCase().includes(args.player_name.toLowerCase()))
                  .slice(0, 5)
                  .map(p => ({
                    player: `${p.player?.first_name} ${p.player?.last_name}`,
                    position: p.player?.position_abbreviation,
                    gamesPlayed: p.games_played,
                    completionPct: p.completion_percentage?.toFixed(1),
                    completionAboveExpected: p.completion_percentage_above_expectation?.toFixed(1),
                    avgTimeToThrow: p.avg_time_to_throw?.toFixed(2),
                    aggressiveness: p.aggressiveness?.toFixed(1),
                    avgAirYards: p.avg_intended_air_yards?.toFixed(1),
                    passingYards: p.pass_yards,
                    passingTDs: p.pass_touchdowns,
                    interceptions: p.interceptions,
                    passerRating: p.passer_rating?.toFixed(1)
                  }));
              } else if (args.stat_type === 'RUSHING') {
                const data = await ballDontLieService.getNflAdvancedRushingStats({ season });
                statResult.data = (data || [])
                  .filter(p => p.player?.team?.id === team.id || p.player?.team?.full_name === team.full_name)
                  .filter(p => !args.player_name ||
                    `${p.player?.first_name} ${p.player?.last_name}`.toLowerCase().includes(args.player_name.toLowerCase()))
                  .slice(0, 5)
                  .map(p => ({
                    player: `${p.player?.first_name} ${p.player?.last_name}`,
                    position: p.player?.position_abbreviation,
                    rushAttempts: p.rush_attempts,
                    rushYards: p.rush_yards,
                    rushTDs: p.rush_touchdowns,
                    yardsOverExpected: p.rush_yards_over_expected?.toFixed(1),
                    yardsOverExpectedPerAtt: p.rush_yards_over_expected_per_att?.toFixed(2),
                    efficiency: p.efficiency?.toFixed(2),
                    avgTimeToLOS: p.avg_time_to_los?.toFixed(2),
                    avgRushYards: p.avg_rush_yards?.toFixed(1)
                  }));
              } else if (args.stat_type === 'RECEIVING') {
                const data = await ballDontLieService.getNflAdvancedReceivingStats({ season });
                statResult.data = (data || [])
                  .filter(p => p.player?.team?.id === team.id || p.player?.team?.full_name === team.full_name)
                  .filter(p => !args.player_name ||
                    `${p.player?.first_name} ${p.player?.last_name}`.toLowerCase().includes(args.player_name.toLowerCase()))
                  .slice(0, 8)
                  .map(p => ({
                    player: `${p.player?.first_name} ${p.player?.last_name}`,
                    position: p.player?.position_abbreviation,
                    targets: p.targets,
                    receptions: p.receptions,
                    catchPct: p.catch_percentage?.toFixed(1),
                    yards: p.yards,
                    recTDs: p.rec_touchdowns,
                    avgSeparation: p.avg_separation?.toFixed(2),
                    avgYAC: p.avg_yac?.toFixed(1),
                    yacAboveExpected: p.avg_yac_above_expectation?.toFixed(1),
                    avgCushion: p.avg_cushion?.toFixed(1),
                    avgIntendedAirYards: p.avg_intended_air_yards?.toFixed(1)
                  }));
              }

              if (statResult.data.length === 0) {
                statResult.message = `No ${args.stat_type.toLowerCase()} stats found for ${team.full_name}`;
              }
            }

            // Store in history
            toolCallHistory.push({
              token: `NFL_PLAYER_STATS:${args.stat_type}`,
              timestamp: Date.now(),
              homeValue: statResult.data?.length || 0,
              awayValue: 'players',
              rawResult: statResult
            });

            // Summarize player stats for context efficiency
            const playerSummary = summarizePlayerStats(statResult, args.stat_type, args.team_name || homeTeam);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: playerSummary
            });
          } catch (error) {
            console.error('[Orchestrator] Error fetching NFL player stats:', error.message);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify({ error: error.message, stat_type: args.stat_type })
            });
          }

          continue; // Skip the regular fetch_stats handling
        }

        // Handle fetch_player_game_logs tool (universal)
        if (functionName === 'fetch_player_game_logs') {
          console.log(`  → [PLAYER_GAME_LOGS] ${args.player_name} (${args.sport})`);

          try {
            const { ballDontLieService } = await import('../ballDontLieService.js');
            const sportMap = {
              'NBA': 'basketball_nba',
              'NFL': 'americanfootball_nfl',
              'NHL': 'icehockey_nhl',
              'NCAAB': 'basketball_ncaab',
              'NCAAF': 'americanfootball_ncaaf'
            };
            const sportKey = sportMap[args.sport];
            const numGames = args.num_games || 5;

            // Use the existing logic from propsAgenticRunner but adapted for orchestrator
            const nameParts = args.player_name.trim().split(' ');
            const lastName = nameParts[nameParts.length - 1];
            const playersResponse = await ballDontLieService.getPlayersGeneric(sportKey, { search: lastName, per_page: 10 });
            // Handle both array and {data: [...]} response formats
            const players = Array.isArray(playersResponse) ? playersResponse : (playersResponse?.data || []);
            
            const player = players.find(p => 
              `${p.first_name} ${p.last_name}`.toLowerCase() === args.player_name.toLowerCase() ||
              p.last_name?.toLowerCase() === lastName.toLowerCase()
            );

            if (!player) {
              messages.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                content: JSON.stringify({ error: `Player "${args.player_name}" not found in ${args.sport}` })
              });
              continue;
            }

            let logs;
            if (args.sport === 'NBA') {
              logs = await ballDontLieService.getNbaPlayerGameLogs(player.id, numGames);
            } else if (args.sport === 'NCAAB') {
              logs = await ballDontLieService.getNcaabPlayerGameLogs(player.id, numGames);
            } else if (args.sport === 'NHL') {
              logs = await ballDontLieService.getNhlPlayerGameLogs(player.id, numGames);
            } else {
              // NFL / NCAAF
              const month = new Date().getMonth() + 1;
              const year = new Date().getFullYear();
              const season = month >= 8 ? year : year - 1;
              const allLogs = await ballDontLieService.getNflPlayerGameLogsBatch([player.id], season, numGames);
              logs = allLogs[player.id];
            }

            const statResult = {
              player: args.player_name,
              sport: args.sport,
              logs: logs || { message: 'No logs found' }
            };

            // Summarize player game logs for context efficiency
            const logSummary = summarizePlayerGameLogs(args.player_name, logs);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: logSummary
            });
            
            // FIX: Track player game logs in toolCallHistory for audit
            toolCallHistory.push({
              token: `PLAYER_GAME_LOGS:${args.player_name}`,
              timestamp: Date.now(),
              homeValue: logs?.length || 0,
              awayValue: 'N/A'
            });
          } catch (error) {
            console.error('[Orchestrator] Error fetching player game logs:', error.message);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: `${args.player_name} GAME LOGS: Error fetching - ${error.message}`
            });
            // Still track failed calls for audit
            toolCallHistory.push({
              token: `PLAYER_GAME_LOGS:${args.player_name}:FAILED`,
              timestamp: Date.now(),
              homeValue: 'error',
              awayValue: 'N/A'
            });
          }
          continue;
        }

        // Handle fetch_nba_player_stats tool
        if (functionName === 'fetch_nba_player_stats') {
          console.log(`  → [NBA_PLAYER_STATS:${args.stat_type}] for ${args.team}${args.player_name ? ` (${args.player_name})` : ''}`);

          try {
            const { ballDontLieService } = await import('../ballDontLieService.js');
            
            // Get team ID first
            const teams = await ballDontLieService.getTeams('basketball_nba');
            const team = teams.find(t =>
              t.full_name?.toLowerCase().includes(args.team.toLowerCase()) ||
              t.name?.toLowerCase().includes(args.team.toLowerCase())
            );

            if (!team) {
              messages.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                content: JSON.stringify({ error: `Team "${args.team}" not found` })
              });
              continue;
            }

            const month = new Date().getMonth() + 1;
            const year = new Date().getFullYear();
            const season = month >= 10 ? year : year - 1;

            let typeMap = {
              'ADVANCED': 'advanced',
              'USAGE': 'usage',
              'DEFENSIVE': 'defense',
              'TRENDS': 'base'
            };
            let categoryMap = {
              'ADVANCED': 'general',
              'USAGE': 'general',
              'DEFENSIVE': 'defense',
              'TRENDS': 'general'
            };

            // If player_name provided, get that player's stats specifically
            let playerIds = [];
            if (args.player_name) {
              const playersResp = await ballDontLieService.getPlayersGeneric('basketball_nba', { search: args.player_name, per_page: 5 });
              const players = Array.isArray(playersResp) ? playersResp : (playersResp?.data || []);
              const foundPlayer = players.find(p => 
                `${p.first_name} ${p.last_name}`.toLowerCase().includes(args.player_name.toLowerCase()) &&
                (p.team?.id === team.id || p.team?.full_name?.includes(team.full_name))
              );
              if (foundPlayer) playerIds = [foundPlayer.id];
            }

            // If no specific player found or provided, get team top players
            if (playerIds.length === 0) {
              const activePlayersResp = await ballDontLieService.getPlayersGeneric('basketball_nba', { team_ids: [team.id], per_page: 20 });
              const activePlayers = Array.isArray(activePlayersResp) ? activePlayersResp : (activePlayersResp?.data || []);
              playerIds = activePlayers.slice(0, 10).map(p => p.id);
            }

            const stats = await ballDontLieService.getNbaSeasonAverages({
              category: categoryMap[args.stat_type],
              type: typeMap[args.stat_type],
              season,
              player_ids: playerIds
            });

            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify({ 
                stat_type: args.stat_type, 
                team: team.full_name,
                season,
                data: stats 
              }, null, 2)
            });
            
            // FIX: Track NBA player stats in toolCallHistory for audit
            toolCallHistory.push({
              token: `NBA_PLAYER_STATS:${args.stat_type}`,
              timestamp: Date.now(),
              homeValue: stats?.length || 0,
              awayValue: 'N/A'
            });
          } catch (error) {
            console.error('[Orchestrator] Error fetching NBA player stats:', error.message);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify({ error: error.message })
            });
          }
          continue;
        }

        // Handle fetch_nhl_player_stats tool
        if (functionName === 'fetch_nhl_player_stats') {
          console.log(`  → [NHL_PLAYER_STATS:${args.stat_type}] for ${args.team}${args.player_name ? ` (${args.player_name})` : ''}`);

          try {
            const { ballDontLieService } = await import('../ballDontLieService.js');

            let statResult = { stat_type: args.stat_type, team: args.team, data: [] };
            // NHL season: Use starting year of season (e.g., 2025 for 2025-26 season)
            // Oct (month 9) onwards = new season starts
            const currentMonth = new Date().getMonth(); // 0-indexed
            const currentYear = new Date().getFullYear();
            const season = currentMonth >= 9 ? currentYear : currentYear - 1;

            // Get team ID first
            const teams = await ballDontLieService.getTeams('icehockey_nhl');
            const team = teams.find(t =>
              t.full_name?.toLowerCase().includes(args.team.toLowerCase()) ||
              t.tricode?.toLowerCase() === args.team.toLowerCase()
            );

            if (!team && args.stat_type !== 'LEADERS') {
              statResult.error = `Team "${args.team}" not found`;
            } else if (args.stat_type === 'LEADERS') {
              // Get league leaders for a specific stat
              const leaderType = args.leader_type || 'points';
              const leaders = await ballDontLieService.getNhlPlayerStatsLeaders(season, leaderType);
              statResult.data = (leaders || []).slice(0, 10).map(l => ({
                player: l.player?.full_name,
                team: l.player?.teams?.[0]?.full_name || 'Unknown',
                position: l.player?.position_code,
                stat: l.name,
                value: l.value
              }));
            } else {
              // Get players for the team
              const players = await ballDontLieService.getNhlTeamPlayers(team.id, season);

              if (args.stat_type === 'SKATERS') {
                // Filter to skaters (non-goalies)
                const skaters = players.filter(p => p.position_code !== 'G');

                // Get stats for each skater (limit to 10)
                const skatersToFetch = args.player_name
                  ? skaters.filter(p => p.full_name?.toLowerCase().includes(args.player_name.toLowerCase()))
                  : skaters.slice(0, 10);

                const statsPromises = skatersToFetch.map(async (player) => {
                  try {
                    const stats = await ballDontLieService.getNhlPlayerSeasonStats(player.id, season);
                    const statsObj = {};
                    (stats || []).forEach(s => { statsObj[s.name] = s.value; });
                    return {
                      player: player.full_name,
                      position: player.position_code,
                      gamesPlayed: statsObj.games_played || 0,
                      goals: statsObj.goals || 0,
                      assists: statsObj.assists || 0,
                      points: statsObj.points || 0,
                      plusMinus: statsObj.plus_minus || 0,
                      shootingPct: statsObj.shooting_pct ? (statsObj.shooting_pct * 100).toFixed(1) : null,
                      timeOnIcePerGame: statsObj.time_on_ice_per_game || null,
                      powerPlayGoals: statsObj.power_play_goals || 0,
                      powerPlayPoints: statsObj.power_play_points || 0
                    };
                  } catch (e) {
                    return null;
                  }
                });

                const results = await Promise.all(statsPromises);
                statResult.data = results.filter(r => r !== null).sort((a, b) => b.points - a.points);

              } else if (args.stat_type === 'GOALIES') {
                // Filter to goalies
                const goalies = players.filter(p => p.position_code === 'G');

                const goaliesToFetch = args.player_name
                  ? goalies.filter(p => p.full_name?.toLowerCase().includes(args.player_name.toLowerCase()))
                  : goalies.slice(0, 3);

                const statsPromises = goaliesToFetch.map(async (player) => {
                  try {
                    const stats = await ballDontLieService.getNhlPlayerSeasonStats(player.id, season);
                    const statsObj = {};
                    (stats || []).forEach(s => { statsObj[s.name] = s.value; });
                    return {
                      player: player.full_name,
                      gamesPlayed: statsObj.games_played || 0,
                      gamesStarted: statsObj.games_started || 0,
                      wins: statsObj.wins || 0,
                      losses: statsObj.losses || 0,
                      otLosses: statsObj.ot_losses || 0,
                      savePct: statsObj.save_pct ? (statsObj.save_pct * 100).toFixed(1) : null,
                      goalsAgainstAvg: statsObj.goals_against_average?.toFixed(2) || null,
                      shutouts: statsObj.shutouts || 0,
                      saves: statsObj.saves || 0,
                      goalsAgainst: statsObj.goals_against || 0
                    };
                  } catch (e) {
                    return null;
                  }
                });

                const results = await Promise.all(statsPromises);
                statResult.data = results.filter(r => r !== null).sort((a, b) => b.gamesPlayed - a.gamesPlayed);
              }

              if (statResult.data.length === 0) {
                statResult.message = `No ${args.stat_type.toLowerCase()} stats found for ${team?.full_name || args.team}`;
              }
            }

            // Store in history
            toolCallHistory.push({
              token: `NHL_PLAYER_STATS:${args.stat_type}`,
              timestamp: Date.now(),
              homeValue: statResult.data?.length || 0,
              awayValue: 'players',
              rawResult: statResult
            });

            // Summarize player stats for context efficiency
            const playerSummary = summarizePlayerStats(statResult, args.stat_type, args.team || homeTeam);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: playerSummary
            });
          } catch (error) {
            console.error('[Orchestrator] Error fetching NHL player stats:', error.message);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: `NHL PLAYER STATS (${args.stat_type}): Error - ${error.message}`
            });
          }

          continue; // Skip the regular fetch_stats handling
        }

        // Handle fetch_ncaaf_player_stats tool
        if (functionName === 'fetch_ncaaf_player_stats') {
          console.log(`  → [NCAAF_PLAYER_STATS:${args.stat_type}] for ${args.team}${args.player_name ? ` (${args.player_name})` : ''}`);

          try {
            const { ballDontLieService } = await import('../ballDontLieService.js');

            let statResult = { stat_type: args.stat_type, team: args.team, data: [] };
            // Calculate NCAAF season dynamically: Aug-Dec = current year, Jan-Jul = previous year
            const ncaafMonth = new Date().getMonth() + 1;
            const ncaafYear = new Date().getFullYear();
            const season = ncaafMonth <= 7 ? ncaafYear - 1 : ncaafYear;

            // Get team ID first
            const teams = await ballDontLieService.getTeams('americanfootball_ncaaf');
            const team = teams.find(t =>
              t.full_name?.toLowerCase().includes(args.team.toLowerCase()) ||
              t.abbreviation?.toLowerCase() === args.team.toLowerCase() ||
              t.city?.toLowerCase().includes(args.team.toLowerCase())
            );

            if (!team && args.stat_type !== 'RANKINGS') {
              statResult.error = `Team "${args.team}" not found`;
            } else if (args.stat_type === 'RANKINGS') {
              // Get AP Poll rankings
              const rankings = await ballDontLieService.getNcaafRankings(season);
              statResult.data = (rankings || []).slice(0, 25).map(r => ({
                rank: r.rank,
                team: r.team?.full_name,
                record: r.record,
                points: r.points,
                trend: r.trend
              }));
            } else {
              // Get player season stats for the team
              const seasonStats = await ballDontLieService.getNcaafPlayerSeasonStats(team.id, season);

              if (args.stat_type === 'OFFENSE') {
                // Filter offensive players (QBs, RBs, WRs, TEs)
                let offensePlayers = seasonStats.filter(s =>
                  s.passing_yards > 0 || s.rushing_yards > 0 || s.receiving_yards > 0
                );

                if (args.player_name) {
                  offensePlayers = offensePlayers.filter(s =>
                    s.player?.first_name?.toLowerCase().includes(args.player_name.toLowerCase()) ||
                    s.player?.last_name?.toLowerCase().includes(args.player_name.toLowerCase())
                  );
                }

                statResult.data = offensePlayers.slice(0, 15).map(s => ({
                  player: `${s.player?.first_name} ${s.player?.last_name}`,
                  position: s.player?.position_abbreviation,
                  jersey: s.player?.jersey_number,
                  passingYards: s.passing_yards || 0,
                  passingTDs: s.passing_touchdowns || 0,
                  passingINTs: s.passing_interceptions || 0,
                  qbRating: s.passing_rating?.toFixed(1) || null,
                  rushingYards: s.rushing_yards || 0,
                  rushingTDs: s.rushing_touchdowns || 0,
                  rushingAvg: s.rushing_avg?.toFixed(1) || null,
                  receptions: s.receptions || 0,
                  receivingYards: s.receiving_yards || 0,
                  receivingTDs: s.receiving_touchdowns || 0
                }));

              } else if (args.stat_type === 'DEFENSE') {
                // Filter defensive players
                let defensePlayers = seasonStats.filter(s =>
                  s.total_tackles > 0 || s.sacks > 0 || s.interceptions > 0
                );

                if (args.player_name) {
                  defensePlayers = defensePlayers.filter(s =>
                    s.player?.first_name?.toLowerCase().includes(args.player_name.toLowerCase()) ||
                    s.player?.last_name?.toLowerCase().includes(args.player_name.toLowerCase())
                  );
                }

                statResult.data = defensePlayers.slice(0, 15).map(s => ({
                  player: `${s.player?.first_name} ${s.player?.last_name}`,
                  position: s.player?.position_abbreviation,
                  jersey: s.player?.jersey_number,
                  tackles: s.total_tackles || 0,
                  soloTackles: s.solo_tackles || 0,
                  tacklesForLoss: s.tackles_for_loss || 0,
                  sacks: s.sacks || 0,
                  interceptions: s.interceptions || 0,
                  passesDefended: s.passes_defended || 0
                }));
              }

              if (statResult.data.length === 0) {
                statResult.message = `No ${args.stat_type.toLowerCase()} stats found for ${team?.full_name || args.team}`;
              }
            }

            // Store in history
            toolCallHistory.push({
              token: `NCAAF_PLAYER_STATS:${args.stat_type}`,
              timestamp: Date.now(),
              homeValue: statResult.data?.length || 0,
              awayValue: 'players',
              rawResult: statResult
            });

            // Summarize player stats for context efficiency
            const playerSummary = summarizePlayerStats(statResult, args.stat_type, args.team || homeTeam);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: playerSummary
            });
          } catch (error) {
            console.error('[Orchestrator] Error fetching NCAAF player stats:', error.message);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: `NCAAF PLAYER STATS (${args.stat_type}): Error - ${error.message}`
            });
          }

          continue; // Skip the regular fetch_stats handling
        }

        console.log(`  → [${args.token}] for ${sport}`);

        // Enforce per-sport token menu (prevents cross-sport aliases from polluting NCAAB cards)
        const resolveMenuSport = (s) => {
          const v = String(s || '').toLowerCase();
          if (v.includes('ncaab')) return 'NCAAB';
          if (v.includes('ncaaf')) return 'NCAAF';
          if (v.includes('nfl')) return 'NFL';
          if (v.includes('nba')) return 'NBA';
          if (v.includes('nhl')) return 'NHL';
          // Tool schema uses these values; fall back to NBA
          return 'NBA';
        };

        const menuSport = resolveMenuSport(args.sport || sport);
        const allowedTokens = getTokensForSport(menuSport);
        if (Array.isArray(allowedTokens) && allowedTokens.length > 0 && !allowedTokens.includes(args.token)) {
          const statResult = {
            error: `Token "${args.token}" is not allowed for ${menuSport}. Use the provided ${menuSport} token menu.`,
            sport: args.sport || sport,
            token: args.token,
            allowedTokens: allowedTokens
          };

          // Store the attempted call (helps debugging why something didn't show)
          toolCallHistory.push({
            token: args.token,
            timestamp: Date.now(),
            homeValue: 'N/A',
            awayValue: 'N/A',
            rawResult: statResult
          });

          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            content: `${args.token}: Not available for ${sport}. Try: ${allowedTokens.slice(0, 5).join(', ')}...`
          });
          continue;
        }

        // Fetch the stats
        // Always use the orchestrator's validated sport key, not args.sport which can be malformed
        // (Gemini sometimes passes sport as "NHL_GOALIE_STATS" instead of "NHL")
        const statResult = await fetchStats(
          sport,
          args.token,
          homeTeam,
          awayTeam,
          options
        );

        // Extract key values from stat result for structured storage
        const extractStatValues = (result, token) => {
          if (!result) return { home: 'N/A', away: 'N/A' };

          // Try common field patterns
          const homeVal = result.home_value ?? result.homeValue ?? result.home ??
            result[homeTeam] ?? result.home_team ?? 'N/A';
          const awayVal = result.away_value ?? result.awayValue ?? result.away ??
            result[awayTeam] ?? result.away_team ?? 'N/A';

          // For complex results, try to extract meaningful values
          if (homeVal === 'N/A' && typeof result === 'object') {
            // Look for home/away in nested structure
            if (result.data) {
              return extractStatValues(result.data, token);
            }
            // For ratings/efficiency stats, look for numeric values
            const keys = Object.keys(result);
            for (const key of keys) {
              if (key.toLowerCase().includes('home') && typeof result[key] === 'number') {
                return { home: result[key], away: result[keys.find(k => k.toLowerCase().includes('away'))] || 'N/A' };
              }
            }
          }

          return { home: homeVal, away: awayVal };
        };

        const values = extractStatValues(statResult, args.token);

        // Store with values for structured display
        toolCallHistory.push({
          token: args.token,
          timestamp: Date.now(),
          homeValue: values.home,
          awayValue: values.away,
          rawResult: statResult // Keep raw result for debugging
        });

        // Add tool result to conversation (SUMMARIZED for better reasoning)
        messages.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: summarizeStatForContext(statResult, args.token, homeTeam, awayTeam)
        });
      }

      // CONTEXT PRUNING: Prevent attention decay on long investigations
      messages = pruneContextIfNeeded(messages, iteration);

      // STATE-BASED PROMPTING: Inject pass instructions based on FACTOR COVERAGE
      // Gary works through a checklist of investigation factors, not arbitrary stat counts
      
      // Count UNIQUE stats for logging
      const uniqueStats = new Set(toolCallHistory.map(t => t.token).filter(Boolean));
      const uniqueStatsCount = uniqueStats.size;
      
      // PRELOADED FACTORS: These are already covered by the Scout Report
      // - INJURIES: Scout report always includes injury data for NFL/NBA/NHL/NCAAB/NCAAF
      // Gary doesn't need to call INJURIES token explicitly - data is already in context
      const preloadedFactors = ['INJURIES'];
      
      // FACTOR-BASED PROGRESS: Check which investigation factors Gary has covered
      const factorStatus = getInvestigatedFactors(toolCallHistory, sport, preloadedFactors);
      const { covered, missing, coverage, totalFactors } = factorStatus;
      
      // Track if we've already injected certain passes
      // FIXED: Check for actual output string from buildPass2Message
      const pass2AlreadyInjected = messages.some(m => m.content?.includes('PASS 2 - STEEL MAN') || m.content?.includes('PASS 2 - EVIDENCE GATHERING'));
      const pass25AlreadyInjected = messages.some(m => m.content?.includes('PASS 2.5 - CASE REVIEW') || m.content?.includes('PASS 2.5 - CONVICTION ASSESSMENT'));
      const synthAlreadyInjected = messages.some(m => m.content?.includes('MID-INVESTIGATION SYNTHESIS'));
      // FIXED: Check for both "FINAL DECISION" (old) and "FINAL OUTPUT" (new buildPass3Unified format)
      const pass3AlreadyInjected = messages.some(m => m.content?.includes('PASS 3 - FINAL DECISION') || m.content?.includes('PASS 3 - FINAL OUTPUT'));
      
      // Check if Gary completed Steel Man analysis (look for bilateral case sections in recent assistant messages)
      const recentAssistantMessages = messages.filter(m => m.role === 'assistant' && m.content).slice(-5);
      const steelManCompleted = recentAssistantMessages.some(m => {
        const content = m.content || '';
        // Multiple patterns that indicate bilateral Steel Man analysis:
        // - "Case for [Team]" (2+ times)
        // - "Why [Team] covers" / "How [Team] covers"
        // - "[Team] TO COVER:" / "[Team] to cover"
        // - Arguments for both teams (using team names from context)
        const caseForCount = (content.match(/(?:Case for|CASE FOR|case for|Analysis for|ANALYSIS FOR|analysis for)/gi) || []).length;
        const toCoversCount = (content.match(/(?:TO COVER|to cover|To Cover)[:\s]/gi) || []).length;
        const whyCoversCount = (content.match(/(?:Why|How)\s+(?:the\s+)?[\w\s]+\s+(?:cover|win)/gi) || []).length;
        
        // Need at least 2 of any pattern to indicate both teams were analyzed
        const totalBilateralPatterns = caseForCount + toCoversCount + whyCoversCount;
        const hasBilateralAnalysis = totalBilateralPatterns >= 2;
        
        if (hasBilateralAnalysis) {
          console.log(`[Orchestrator] ✅ Steel Man detected: caseFor=${caseForCount}, toCovers=${toCoversCount}, whyCovers=${whyCoversCount}`);
        }
        return hasBilateralAnalysis;
      });
      
      // Check if Gary responded to Pass 2.5 with ratings
      let pass25Ratings = null;
      if (pass25AlreadyInjected && !pass3AlreadyInjected) {
        // Look for ratings in Gary's responses AFTER Pass 2.5 was injected
        const pass25Index = messages.findIndex(m => m.content?.includes('PASS 2.5 - CASE REVIEW') || m.content?.includes('PASS 2.5 - CONVICTION ASSESSMENT'));
        if (pass25Index > -1) {
          const responsesAfter25 = messages.slice(pass25Index + 1).filter(m => m.role === 'assistant' && m.content);
          for (const response of responsesAfter25) {
            const parsed = parsePass25Ratings(response.content);
            if (parsed) {
              pass25Ratings = parsed;
              console.log(`[Orchestrator] 📊 Pass 2.5 Ratings parsed: Favorite ${parsed.favoriteRating}/10, Underdog ${parsed.underdogRating}/10`);
              break;
            }
          }
        }
      }
      
      // Log factor coverage
      console.log(`[Orchestrator] Factor Coverage: ${covered.length}/${totalFactors} (${(coverage * 100).toFixed(0)}%)`);
      if (missing.length > 0 && missing.length <= 4) {
        console.log(`[Orchestrator] Missing factors: ${missing.join(', ')}`);
      }
      
      // FACTOR-BASED PHASE TRIGGERS (100% required before Steel Man):
      // - <100% coverage: Keep investigating, nudge for more
      // - 100% coverage: Ready for Steel Man analysis and final synthesis
      // NOTE: Changed from 80% to 100% - Gary must investigate ALL factors including bench stats

      if (coverage >= 1.0 && !pass2AlreadyInjected && !steelManCompleted) {
        // 100% coverage reached - NOW inject Pass 2 (Steel Man)
        
        // ═══════════════════════════════════════════════════════════════════════
        // NFL SPECIAL: Switch to Pro for Steel Man cases (not just grading)
        // NFL games are high-stakes and limited - use Pro's deep reasoning for case building
        // ═══════════════════════════════════════════════════════════════════════
        const isNFLForProSwitch = sport === 'americanfootball_nfl' || sport === 'NFL';
        if (provider === 'gemini' && isNFLForProSwitch && useProForGrading && !hasSwichedToPro) {
          console.log(`[Orchestrator] 🏈 NFL: Switching to Pro model for Steel Man cases (deep reasoning)`);

          // Pass FULL investigation context to Pro (all stats, not truncated!)
          const textualSummary = extractTextualSummaryForModelSwitch(messages, steelManCases, toolCallHistory);

          try {
            currentSession = createGeminiSession({
              modelName: 'gemini-3-pro-preview',
              systemPrompt: systemPrompt + '\n\n' + textualSummary,
              tools: toolDefinitions, // GIVE PRO TOOLS to verify and re-investigate
              thinkingLevel: 'high'
            });
            currentModelName = currentSession.modelName;
            hasSwichedToPro = true;

            // CRITICAL: Clear pending function responses from Flash session
            // Pro starts fresh - it never made those function calls
            pendingFunctionResponses = [];

            console.log(`[Orchestrator] 🧠 NFL Pro session created with tools for Steel Man analysis`);
            console.log(`[Orchestrator] Context passed: ${textualSummary.length} chars (full stats)`);
          } catch (proError) {
            console.warn(`[Orchestrator] ⚠️ Failed to switch to Pro for NFL Steel Man, continuing with Flash:`, proError.message);
          }
        }

        messages.push({
          role: 'user',
          content: buildPass2Message(sport, homeTeam, awayTeam, spread)
        });
        console.log(`[Orchestrator] Injected Pass 2 instructions (${covered.length}/${totalFactors} = ${(coverage * 100).toFixed(0)}% coverage, spread: ${spread})`);
      } else if (coverage < 1.0) {
        // Require 100% coverage before Steel Man - Gary must investigate ALL factors
        const missingDisplay = missing.slice(0, 6).map(f => f.replace(/_/g, ' ')).join(', ');
        const coveragePct = (coverage * 100).toFixed(0);

        if (iteration >= 4 && coverage >= 0.8) {
          // After several iterations with good coverage, give a stronger nudge for the remaining factors
          messages.push({
            role: 'user',
            content: `**INVESTIGATION AT ${coveragePct}% (need 100%)** - You're close but missing critical data:\n\n**UNINVESTIGATED:** ${missingDisplay}${missing.length > 6 ? '...' : ''}\n\nCall these stats NOW. You MUST reach 100% factor coverage before Steel Man. Missing factors may include BENCH_DEPTH, LINEUP_NET_RATINGS, or other critical matchup data.`
          });
          console.log(`[Orchestrator] Strong nudge for 100% coverage (${covered.length}/${totalFactors} = ${coveragePct}% covered)`);
        } else {
          messages.push({
            role: 'user',
            content: `You've covered ${covered.length}/${totalFactors} investigation factors (${coveragePct}%). Continue investigating BOTH teams to reach 100%. Uncovered factors: ${missingDisplay}${missing.length > 6 ? '...' : ''}. Call stats for each factor - especially BENCH_DEPTH and unit efficiency for spread analysis.`
          });
          console.log(`[Orchestrator] Nudged to reach 100% coverage (${covered.length}/${totalFactors} = ${coveragePct}% covered)`);
        }
      } else if (coverage >= 1.0 && iteration >= 2 && !pass3AlreadyInjected) {
        // 100% factors covered - decide between Pass 2.5, Steel Man enforcement, or Mid-Investigation Synthesis
        // Priority: Steel Man enforcement > Pass 2.5 (if Steel Man done) > Mid-Investigation Synthesis
        
        if (!steelManCompleted && pass2AlreadyInjected) {
          // STEEL MAN ENFORCEMENT: Pass 2 was injected but Gary hasn't written cases yet
          // Force Gary to stop calling stats and write his Steel Man analysis NOW
          // GEMINI 3 OPTIMIZED: XML-tagged structure with END-OF-PROMPT instruction
          messages.push({
            role: 'user',
            content: `
<enforcement_context>
## MATCHUP ANALYSIS REQUIRED

You have gathered ${covered.length}/${totalFactors} investigation factors (${(coverage * 100).toFixed(0)}% coverage).
This is SUFFICIENT data to proceed.
</enforcement_context>

<case_requirements>
## REQUIRED OUTPUT

Write SUBSTANTIVE PARAGRAPHS, not bullet point summaries.

**ANALYSIS FOR ${homeTeam}:**
Write 3-4 detailed paragraphs explaining:
- KEY FACTORS (how their strengths/weaknesses apply to this matchup)
- DATA (specific numbers backing this up)
- What the stats tell you about this team in this matchup

**ANALYSIS FOR ${awayTeam}:**
Write 3-4 detailed paragraphs with the same depth - key factors, data, and what the stats show.

**DO NOT make a final pick yet.** Just analyze BOTH sides.
After your analysis, you'll determine which side is the BETTER BET given the spread.
</case_requirements>

<instructions>
## YOUR TASK

Using the data you've gathered, STOP calling more stats and execute NOW:

1. Write **ANALYSIS FOR ${homeTeam}** (3-4 substantive paragraphs)
2. Write **ANALYSIS FOR ${awayTeam}** (3-4 substantive paragraphs)

BEGIN WRITING YOUR MATCHUP ANALYSIS NOW.
</instructions>
`
          });
          console.log(`[Orchestrator] MATCHUP ANALYSIS ENFORCEMENT - Gary must write analysis before proceeding (${covered.length}/${totalFactors} factors)`);
        } else if (!pass25AlreadyInjected && steelManCompleted) {
          // ═══════════════════════════════════════════════════════════════════════
          // PASS 2.5 INJECTION + PRO MODEL SWITCH (NBA/NFL/NHL only)
          // ═══════════════════════════════════════════════════════════════════════
          // Steel Man done, inject Pass 2.5 (Conviction Assessment)
          // For NBA/NFL/NHL: Switch to Pro model for deep reasoning on grading
          const missingNote = missing.length > 0 
            ? `\n\n(Note: ${missing.length} factors were not investigated: ${missing.slice(0, 4).map(f => f.replace(/_/g, ' ')).join(', ')}${missing.length > 4 ? '...' : ''} - proceed with your conviction assessment based on the evidence you gathered.)`
            : '';
          const pass25Content = buildPass25Message(homeTeam, awayTeam, sport, spread) + missingNote;
          
          // spread already defined at loop scope
          messages.push({ role: 'user', content: pass25Content });
          
          // ═══════════════════════════════════════════════════════════════════════
          // PRO MODEL SWITCH for grading phase (NBA/NFL/NHL only)
          // ═══════════════════════════════════════════════════════════════════════
          // HYBRID APPROACH: Pro gets FULL stats + tools to verify/investigate
          // ═══════════════════════════════════════════════════════════════════════
          if (provider === 'gemini' && useProForGrading && !hasSwichedToPro) {
            console.log(`[Orchestrator] 🔄 Switching to Pro model for review & decision`);

            // Pass FULL investigation context to Pro (not truncated!)
            const textualSummary = extractTextualSummaryForModelSwitch(messages, steelManCases, toolCallHistory);

            try {
              currentSession = createGeminiSession({
                modelName: 'gemini-3-pro-preview',
                systemPrompt: systemPrompt + '\n\n' + textualSummary,
                tools: toolDefinitions, // GIVE PRO TOOLS to verify and re-investigate
                thinkingLevel: 'high'
              });
              currentModelName = currentSession.modelName;
              hasSwichedToPro = true;

              // CRITICAL: Clear pending function responses from Flash session
              // Pro starts fresh - it never made those function calls
              pendingFunctionResponses = [];

              console.log(`[Orchestrator] 🧠 Pro session created with tools for verification`);
              console.log(`[Orchestrator] Context passed: ${textualSummary.length} chars (full stats + Steel Man cases)`);
            } catch (proError) {
              // If Pro fails to initialize, continue with Flash
              console.error(`[Orchestrator] ⚠️ Pro initialization failed: ${proError.message}`);
              console.log(`[Orchestrator] Continuing with Flash for decision`);
            }
          }
          
          console.log(`[Orchestrator] Injected Pass 2.5 (Case Evaluation & Decision) - ${covered.length}/${totalFactors} factors, Steel Man complete, spread: ${spread}`);
        } else if (!steelManCompleted && !pass2AlreadyInjected) {
          // Neither Pass 2 nor Steel Man - inject Pass 2 with urgency
          
          // NFL SPECIAL: Switch to Pro for Steel Man cases
          const isNFLForProSwitch = sport === 'americanfootball_nfl' || sport === 'NFL';
          if (provider === 'gemini' && isNFLForProSwitch && useProForGrading && !hasSwichedToPro) {
            console.log(`[Orchestrator] 🏈 NFL: Switching to Pro model for Steel Man cases (urgent path)`);

            // Pass FULL investigation context to Pro (all stats, not truncated!)
            const textualSummary = extractTextualSummaryForModelSwitch(messages, steelManCases, toolCallHistory);

            try {
              currentSession = createGeminiSession({
                modelName: 'gemini-3-pro-preview',
                systemPrompt: systemPrompt + '\n\n' + textualSummary,
                tools: toolDefinitions, // GIVE PRO TOOLS to verify and re-investigate
                thinkingLevel: 'high'
              });
              currentModelName = currentSession.modelName;
              hasSwichedToPro = true;

              // CRITICAL: Clear pending function responses from Flash session
              // Pro starts fresh - it never made those function calls
              pendingFunctionResponses = [];

              console.log(`[Orchestrator] 🧠 NFL Pro session created with tools for Steel Man analysis`);
              console.log(`[Orchestrator] Context passed: ${textualSummary.length} chars (full stats)`);
            } catch (proError) {
              console.warn(`[Orchestrator] ⚠️ Failed to switch to Pro, continuing with Flash:`, proError.message);
            }
          }

          messages.push({
            role: 'user',
            content: buildPass2Message(sport, homeTeam, awayTeam, spread) + 
              `\n\n**CRITICAL:** You have ${(coverage * 100).toFixed(0)}% factor coverage. Write your Steel Man cases NOW before making any pick.`
          });
          console.log(`[Orchestrator] Injected Pass 2 (urgent) - ${covered.length}/${totalFactors} factors, spread: ${spread}, Steel Man required`);
        } else if (pass25AlreadyInjected && pass25Ratings) {
          // Pass 2.5 complete with ratings - inject unified Pass 3 (non-prescriptive)
          const rawGap = pass25Ratings.favoriteRating - pass25Ratings.underdogRating;
          
          messages.push({
            role: 'user',
            content: buildPass3Unified(pass25Ratings, homeTeam, awayTeam)
          });
          // Log depends on format - gradeless (new) vs legacy (old)
          if (pass25Ratings.caseSummaries) {
            console.log(`[Orchestrator] Injected Pass 3 - Pick: ${pass25Ratings.finalPick}, Confidence: ${pass25Ratings.confidenceScore} (Gradeless format)`);
          } else {
            console.log(`[Orchestrator] Injected Pass 3 - Ratings: Fav ${pass25Ratings.favoriteRating}/10, Dog ${pass25Ratings.underdogRating}/10 (Gap: ${rawGap.toFixed(1)})`);
          }
        } else if (pass25AlreadyInjected && !pass25Ratings) {
          // Pass 2.5 was injected but no decision yet - nudge Gary to provide it
          messages.push({
            role: 'user',
            content: `Please complete your Pass 2.5 analysis with the JSON format specified. Include case_summaries for both teams, your stress_test results (flags for BOTH sides), and your final_pick with confidence_score (0.50-0.95).`
          });
          console.log(`[Orchestrator] Nudged for Pass 2.5 JSON (awaiting case_summaries/confidence response)`);
        }
        // NOTE: Removed the fallback that injected Pass 3 directly without Steel Man/Pass 2.5
        // The Steel Man Enforcement above will handle cases where Gary hasn't written his cases
      } else if (iteration >= 2 && coverage < 0.8) {
        // Iteration 2+ with incomplete factor coverage - let Gary continue at his own pace
        if (!pass2AlreadyInjected && coverage >= 0.5) {
          // Has enough for Steel Man but not complete
          messages.push({
            role: 'user',
            content: buildPass2Message(sport, homeTeam, awayTeam, spread)
          });
          console.log(`[Orchestrator] Injected Pass 2 (delayed) - ${covered.length}/${totalFactors} factors covered, spread: ${spread}`);
        }
        // No aggressive nudging - Gary decides when he's done investigating
      }

      // ═══════════════════════════════════════════════════════════════════════
      // PREPARE FUNCTION RESPONSES FOR PERSISTENT SESSION
      // ═══════════════════════════════════════════════════════════════════════
      // Extract tool responses added to messages array during this iteration
      // Convert to format needed for sendToSession
      if (provider === 'gemini' && currentSession) {
        // Find tool responses added this iteration
        // They're the messages with role: 'tool' after the last assistant message
        const lastAssistantIdx = messages.findLastIndex(m => m.role === 'assistant');
        const toolResponses = messages.slice(lastAssistantIdx + 1).filter(m => m.role === 'tool');
        
        if (toolResponses.length > 0) {
          // Convert to Gemini function response format
          pendingFunctionResponses = toolResponses.map(tr => ({
            name: tr.name || 'tool_response',
            content: tr.content
          }));
          console.log(`[Orchestrator] Prepared ${pendingFunctionResponses.length} function response(s) for session`);
        }
        
        // Check if a pass transition message was injected after tool responses
        // Find user messages added after all tool responses
        const lastToolIdx = messages.findLastIndex(m => m.role === 'tool');
        const userMsgsAfterTools = messages.slice(lastToolIdx + 1).filter(m => m.role === 'user');
        
        if (userMsgsAfterTools.length > 0) {
          // There's a user message (pass transition) that needs to be sent
          // For persistent session: we need to send function responses first,
          // then the session processes them, then we send the pass message
          // This requires a two-step flow on next iteration
          const passMessage = userMsgsAfterTools[userMsgsAfterTools.length - 1].content;
          
          // Store the pass message to send after function responses are processed
          // We'll handle this in the main API call section
          nextMessageToSend = passMessage;
          console.log(`[Orchestrator] Pass transition queued (will send after function responses processed)`);
        }
      }
      
      // Continue the loop for Gary to process the stats
      continue;
    }

    // No minimum enforcement - Gary calls what he needs organically
    // The prompts encourage comprehensive stat gathering naturally

    // Check if Gary just responded to Pass 2.5 with ratings (not a final pick)
    const pass25WasInjected = messages.some(m => m.content?.includes('PASS 2.5 - CASE REVIEW') || m.content?.includes('PASS 2.5 - CONVICTION ASSESSMENT'));
    // FIXED: Check for both "FINAL DECISION" (old) and "FINAL OUTPUT" (new buildPass3Unified format)
    const pass3WasInjected = messages.some(m => m.content?.includes('PASS 3 - FINAL DECISION') || m.content?.includes('PASS 3 - FINAL OUTPUT'));
    
    if (pass25WasInjected && !pass3WasInjected && iteration < CONFIG.maxIterations) {
      // Gary responded to Pass 2.5 - check for ratings
      const ratings = parsePass25Ratings(message.content);
      
      if (ratings) {
        // Got ratings - inject appropriate Pass 3 and continue
        const rawGap = ratings.favoriteRating - ratings.underdogRating;
        
        console.log(`\n📊 GARY'S CONVICTION ASSESSMENT (Pass 2.5):\n${'─'.repeat(60)}`);
        console.log(message.content);
        console.log(`${'─'.repeat(60)}\n`);
        console.log(`[Orchestrator] 📊 Pass 2.5 Ratings: Favorite ${ratings.favoriteRating}/10, Underdog ${ratings.underdogRating}/10 (Gap: ${rawGap.toFixed(1)})`);
        
        messages.push({
          role: 'assistant',
          content: message.content
        });
        
        // Inject unified Pass 3 (non-prescriptive - no gap-based conditional logic)
        messages.push({
          role: 'user',
          content: buildPass3Unified(ratings, homeTeam, awayTeam)
        });
        // Log depends on format - gradeless (new) vs legacy (old)
        if (ratings.caseSummaries) {
          console.log(`[Orchestrator] Injected Pass 3 - Pick: ${ratings.finalPick}, Confidence: ${ratings.confidenceScore} (Gradeless format)`);
        } else {
          console.log(`[Orchestrator] Injected Pass 3 - Ratings: Fav ${ratings.favoriteRating}/10, Dog ${ratings.underdogRating}/10 (Gap: ${rawGap.toFixed(1)})`);
        }
        
        iteration++;
        continue; // Continue to get final pick
      } else {
        // No ratings found - nudge Gary to provide them
        console.log(`[Orchestrator] ⚠️ Pass 2.5 response missing ratings - requesting JSON format`);
        
        messages.push({
          role: 'assistant',
          content: message.content
        });
        
        messages.push({
          role: 'user',
          content: `Please provide your decision in the JSON format:

\`\`\`json
{
  "final_pick": "[Team] [spread/ML]",
  "confidence_score": [0.50-0.95],
  "rationale": "MUST START WITH 'Gary's Take\\n\\n' then scene-setter (1-2 sentences), then 3-4 paragraphs explaining WHY this side is the BETTER BET given the spread."
}
\`\`\``
        });
        
        iteration++;
        continue;
      }
    }

    // Gary is done - but check if we need to inject Pass 2.5 first
    console.log(`[Orchestrator] Gary finished analysis (${finishReason})`);
    
    // Check if Steel Man was just completed and Pass 2.5 hasn't been done yet
    const pass25Done = messages.some(m => m.content?.includes('PASS 2.5 - CASE REVIEW') || m.content?.includes('PASS 2.5 - CONVICTION ASSESSMENT'));
    // FIXED: Check for both "FINAL DECISION" (old) and "FINAL OUTPUT" (new buildPass3Unified format)
    const pass3Done = messages.some(m => m.content?.includes('PASS 3 - FINAL DECISION') || m.content?.includes('PASS 3 - FINAL OUTPUT'));
    
    // Detect Steel Man in current response
    const currentContent = message.content || '';
    const caseForCount = (currentContent.match(/(?:Case for|CASE FOR|case for)/gi) || []).length;
    const toCoversCount = (currentContent.match(/(?:TO COVER|to cover|To Cover)[:\s]/gi) || []).length;
    const steelManJustWritten = (caseForCount + toCoversCount) >= 2;
    
    if (steelManJustWritten && !pass25Done && !pass3Done && iteration < CONFIG.maxIterations) {
      // Gary just wrote Steel Man cases! Inject Pass 2.5 before allowing a pick
      console.log(`[Orchestrator] ✅ Steel Man detected in response (caseFor=${caseForCount}, toCovers=${toCoversCount})`);
      console.log(`\n📋 GARY'S STEEL MAN ANALYSIS (Both Sides):\n${'─'.repeat(60)}`);
      console.log(currentContent);
      console.log(`${'─'.repeat(60)}\n`);
      console.log(`[Orchestrator] Injecting Pass 2.5 (Case Evaluation & Decision) - Steel Man just completed`);
      
      messages.push({
        role: 'assistant',
        content: message.content
      });
      
      // spread already defined at loop scope
      const pass25Content = buildPass25Message(homeTeam, awayTeam, sport, spread);
      messages.push({
        role: 'user',
        content: pass25Content
      });
      
      // ═══════════════════════════════════════════════════════════════════════
      // PRO MODEL SWITCH - HYBRID APPROACH
      // Pro gets FULL stats + tools to verify Steel Man claims and investigate
      // ═══════════════════════════════════════════════════════════════════════
      if (provider === 'gemini' && useProForGrading && !hasSwichedToPro) {
        console.log(`[Orchestrator] 🔄 Switching to Pro model for review & decision`);

        // Pass FULL investigation context to Pro (all stats, not truncated!)
        const textualSummary = extractTextualSummaryForModelSwitch(messages, steelManCases, toolCallHistory);

        try {
          currentSession = createGeminiSession({
            modelName: 'gemini-3-pro-preview',
            systemPrompt: systemPrompt + '\n\n' + textualSummary,
            tools: toolDefinitions, // GIVE PRO TOOLS to verify and re-investigate
            thinkingLevel: 'high'
          });
          currentModelName = currentSession.modelName;
          hasSwichedToPro = true;

          // CRITICAL: Clear pending function responses from Flash session
          // Pro starts fresh - it never made those function calls
          pendingFunctionResponses = [];

          console.log(`[Orchestrator] 🧠 Pro session created with tools for verification`);
          console.log(`[Orchestrator] Context passed: ${textualSummary.length} chars (full stats + Steel Man cases)`);
        } catch (proError) {
          // If Pro fails to initialize, continue with Flash
          console.error(`[Orchestrator] ⚠️ Pro initialization failed: ${proError.message}`);
          console.log(`[Orchestrator] Continuing with Flash for decision`);
        }
      }
      
      // CRITICAL: Set nextMessageToSend so the session knows what to send next
      nextMessageToSend = pass25Content;
      
      iteration++;
      continue; // Go back to get Pass 2.5 response
    }

    // Try to extract JSON from the response
    let pick = parseGaryResponse(message.content, homeTeam, awayTeam, sport, options.game || {});

    // If pick is null (invalid rationale), retry once with explicit instruction
    if (!pick && iteration < CONFIG.maxIterations) {
      console.log(`[Orchestrator] ⚠️ Invalid or missing rationale - requesting full analysis...`);
      
      messages.push({
        role: 'assistant',
        content: message.content
      });
      
      messages.push({
        role: 'user',
        content: `Your response is missing a complete rationale. Please provide your FULL analysis with:
1. "Gary's Take" section with 3-4 paragraphs explaining your reasoning
2. Clear discussion of the key stats that support your pick
3. Acknowledgment of any risks or contradicting factors

Output your complete pick JSON with the full rationale in the "rationale" field. Do NOT use placeholders like "See detailed analysis below" - write the actual analysis.`
      });
      
      iteration++;
      continue; // Retry
    }

    if (pick) {
      // REMOVED: Devil's Advocate - Gary now makes decisions with full agency
      // Following "Awareness vs Prescription" principle: Gary gathers ALL information,
      // applies his reasoning, and makes his call. No second-guessing his own picks.
      
      pick.toolCallHistory = toolCallHistory;
      pick.iterations = iteration;
      pick.rawAnalysis = message.content;
      
      // Attach full steel man cases for transparency
      if (steelManCases.homeTeamCase || steelManCases.awayTeamCase) {
        pick.steelManCases = {
          homeTeam: steelManCases.homeTeamCase,
          awayTeam: steelManCases.awayTeamCase,
          capturedAt: steelManCases.capturedAt
        };
        console.log(`[Orchestrator] 📝 Steel Man cases attached to pick`);
      }
      
      // Diagnostic: Check if Pass 2.5 was injected during this analysis
      const pass25WasInjected = messages.some(m => m.content?.includes('PASS 2.5 - CASE REVIEW') || m.content?.includes('PASS 2.5 - CONVICTION ASSESSMENT'));
      const steelManDetected = messages.some(m => {
        const content = m.content || '';
        const caseForCount = (content.match(/(?:Case for|CASE FOR|case for|Analysis for|ANALYSIS FOR|analysis for)/gi) || []).length;
        const toCoversCount = (content.match(/(?:TO COVER|to cover|To Cover)[:\s]/gi) || []).length;
        return (caseForCount + toCoversCount) >= 2;
      });
      
      // Attach Pass 2.5 conviction ratings - ALWAYS include diagnostic info
      const allAssistantMessages = messages.filter(m => m.role === 'assistant' && m.content);
      let ratingsFound = false;
      
      for (const msg of allAssistantMessages) {
        const ratings = parsePass25Ratings(msg.content);
        if (ratings) {
          ratingsFound = true;
          const rawGap = ratings.favoriteRating - ratings.underdogRating;
          pick.convictionRatings = {
            favoriteRating: ratings.favoriteRating,
            underdogRating: ratings.underdogRating,
            favoriteTeam: ratings.favoriteTeam,
            underdogTeam: ratings.underdogTeam,
            rawGap: rawGap,
            reasoning: ratings.reasoning,
            // Variance and chaos indicators
            varianceIndicator: ratings.varianceIndicator || 'MEDIUM',
            varianceReasoning: ratings.varianceReasoning || '',
            // Outright win assessment
            underdogCanWinOutright: ratings.underdogCanWinOutright || false,
            outrightWinReasoning: ratings.outrightWinReasoning || '',
            // Simple gap info (no prescriptive scenario labels)
            gap: rawGap,
            higherRatedSide: rawGap < 0 ? 'underdog' : rawGap > 0 ? 'favorite' : 'even',
            // Diagnostic info
            _diagnostic: {
              pass25Injected: pass25WasInjected,
              steelManDetected: steelManDetected,
              ratingsFound: true
            }
          };
          
          // Log conviction info (simplified - no prescriptive scenario labels)
          const leanEmoji = rawGap < 0 ? '🐕' : rawGap > 0 ? '⭐' : '⚖️';
          console.log(`[Orchestrator] 📊 Final Pick Conviction Ratings:`);
          console.log(`  ${leanEmoji} Higher Rated: ${rawGap < 0 ? 'Underdog' : rawGap > 0 ? 'Favorite' : 'Even'}`);
          console.log(`  📈 Ratings: Favorite ${ratings.favoriteRating}/10 vs Underdog ${ratings.underdogRating}/10 (Gap: ${rawGap.toFixed(1)})`);
          console.log(`  🎲 Variance: ${ratings.varianceIndicator || 'MEDIUM'}`);
          if (ratings.underdogCanWinOutright) {
            console.log(`  🎯 Underdog Win Outright: YES - "${ratings.outrightWinReasoning?.substring(0, 50) || 'Path exists'}..."`);
          }
          break;
        }
      }
      
      // ALWAYS attach convictionRatings - even if empty, include diagnostic info
      if (!ratingsFound) {
        // Conviction ratings are optional - no need to warn in logs
        // Attach diagnostic-only convictionRatings so we can see what happened
        pick.convictionRatings = {
          favoriteRating: null,
          underdogRating: null,
          favoriteTeam: null,
          underdogTeam: null,
          rawGap: null,
          reasoning: null,
          scenario: 'NOT_RATED',
          _diagnostic: {
            pass25Injected: pass25WasInjected,
            steelManDetected: steelManDetected,
            ratingsFound: false,
            reason: !pass25WasInjected ? 'Pass 2.5 was never injected' :
                    !steelManDetected ? 'Steel Man cases not detected' :
                    'Gary responded to Pass 2.5 but ratings JSON not found'
          }
        };
      }
      
      return pick;
    } else {
      // If no valid JSON after retry, return the raw analysis
      return {
        error: 'Could not parse pick from response',
        rawAnalysis: message.content,
        toolCallHistory,
        iterations: iteration,
        homeTeam,
        awayTeam,
        sport
      };
    }
  }

  // Max iterations reached - Gary has done thorough analysis
  // IMPORTANT: Still require Steel Man + Conviction Assessment even at max iterations
  console.log(`[Orchestrator] ⚠️ Max iterations (${CONFIG.maxIterations}) reached - requesting FULL synthesis with Steel Man + Conviction...`);
  
  // Build spread-size specific framing (CRITICAL - same as buildPass2Message)
  // NOTE: spread needs to be extracted from options here since we're outside the loop scope
  const spread = options.spread || 0;
  const absSpread = Math.abs(spread);
  const homeIsFavorite = spread < 0;
  const favoriteTeam = homeIsFavorite ? homeTeam : awayTeam;
  const underdogTeam = homeIsFavorite ? awayTeam : homeTeam;
  const coverThreshold = Math.floor(absSpread) + 1;
  
  // Determine if this is "who wins" vs "who covers" based on sport and spread
  const isNFL = sport === 'americanfootball_nfl' || sport === 'NFL';
  const isNBA = sport === 'basketball_nba' || sport === 'NBA';
  const isNCAAB = sport === 'basketball_ncaab' || sport === 'NCAAB';
  const isNCAAF = sport === 'americanfootball_ncaaf' || sport === 'NCAAF';
  const isNHL = sport === 'icehockey_nhl' || sport === 'NHL';
  
  const isWinsQuestion = isNHL || 
    (isNBA && absSpread < 5) ||
    (isNFL && absSpread < 3.5) ||
    (isNCAAB && absSpread < 5) ||
    (isNCAAF && absSpread < 3.5);
  
  // Build spread-size framing
  let spreadSizeFraming = '';
  if (!isWinsQuestion && absSpread > 0) {
    if (absSpread >= 10) {
      spreadSizeFraming = `
**SPREAD-SIZE FRAMING (LARGE: ${spread.toFixed(1)})**

This is a LARGE SPREAD. The question is: Does the evidence support the FAVORITE or UNDERDOG side?

**FOR ${underdogTeam} +${absSpread.toFixed(1)} (UNDERDOG SIDE):**
> Question: "Does the evidence suggest the line is too high?"
> Look for: Defense that limits damage, tempo control, matchups that keep it close, narrative factors inflating the line

**FOR ${favoriteTeam} -${absSpread.toFixed(1)} (FAVORITE SIDE):**
> Question: "Does the evidence suggest the line is too low?"
> Look for: Depth advantage, pace control, ability to maintain leads, underdog weaknesses

Pick the SIDE the evidence supports. Do NOT predict what the margin will be.`;
    } else if (absSpread >= 5) {
      spreadSizeFraming = `
**SPREAD-SIZE FRAMING (MEDIUM: ${spread.toFixed(1)})**

This is a MEDIUM SPREAD. The question is: Does the evidence support the FAVORITE or UNDERDOG side?

**FOR ${underdogTeam} +${absSpread.toFixed(1)} (UNDERDOG SIDE):**
> Question: "Does the evidence suggest the line is too high?"
> Look for: Tempo control, defensive floor, matchup parity, narrative factors inflating the spread

**FOR ${favoriteTeam} -${absSpread.toFixed(1)} (FAVORITE SIDE):**
> Question: "Does the evidence suggest the line is too low?"
> Look for: Depth advantage, pace control, bench that extends leads, underdog weaknesses

Pick the SIDE the evidence supports. Do NOT predict what the margin will be.`;
    } else {
      spreadSizeFraming = `
**SPREAD-SIZE FRAMING (SMALL: ${spread.toFixed(1)})**

This is a SMALL SPREAD - close to a pick'em. The question is: Does the evidence support the FAVORITE or UNDERDOG side?

**FOR ${underdogTeam} +${absSpread.toFixed(1)} (UNDERDOG SIDE):**
> Question: "Does the evidence suggest the underdog is undervalued?"
> Look for: Clutch execution, late-game coaching, close-game patterns, narrative deflating their line

**FOR ${favoriteTeam} -${absSpread.toFixed(1)} (FAVORITE SIDE):**
> Question: "Does the evidence suggest the favorite is undervalued?"
> Look for: Closing ability, home court, efficiency edge that creates separation

Pick the SIDE the evidence supports. Do NOT predict what the margin will be.`;
    }
  }
  
  // Request synthesis WITH Steel Man and Conviction Assessment (compressed into one prompt)
  const MAX_SYNTHESIS_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_SYNTHESIS_ATTEMPTS; attempt++) {
    try {
      const synthesisPrompt = `You've gathered ${toolCallHistory.length} stats across ${iteration} iterations for ${awayTeam} @ ${homeTeam}.
${spreadSizeFraming}

**STEP 1: ANALYZE BOTH SIDES (Required)**
Write SUBSTANTIVE PARAGRAPHS (not bullet summaries) for each team:

**ANALYSIS FOR ${homeTeam} (${homeIsFavorite ? `-${absSpread.toFixed(1)}` : `+${absSpread.toFixed(1)}`}):**
Write 3-4 detailed paragraphs explaining:
- KEY FACTORS: What the data shows about this team in this matchup
- DATA: Specific numbers (not just "they're good")
- MATCHUP APPLICATION: How their strengths/weaknesses apply to THIS opponent

**ANALYSIS FOR ${awayTeam} (${!homeIsFavorite ? `-${absSpread.toFixed(1)}` : `+${absSpread.toFixed(1)}`}):**
Write 3-4 detailed paragraphs with the same depth - key factors, specific data, matchup analysis.

**STEP 2: STRESS TEST BOTH SIDES**
Check BOTH teams against these patterns (don't pick yet, just identify red flags):
- **Returning Players:** Is a key player returning from injury? → Investigate: What's the typical adjustment period? Does this add uncertainty worth noting?
- **Travel/Rest Situation:** Is there a travel/rest disparity? → Investigate: How has EACH team performed in similar situations? Does THIS matchup make it relevant?
- **Game Flow Consideration:** Are there structural advantages (scheme, depth) vs talent-based advantages (star player)? → How might THIS game's flow affect which matters more?
${isNFL ? '- **Playoff Context:** Are there playoff implications? → Investigate: Does THIS QB have late-game closing ability?' : ''}

**STEP 3: FINAL DECISION - WHICH IS THE BETTER BET?**

**THE MINDSET:** The question is not "who covers?" - it's "which side is the BETTER BET given this spread?"

Based on your analysis and stress test: Does this spread of ${absSpread.toFixed(1)} reflect what you found in your research?
- If narrative factors (injury news, B2B, public perception) pushed the line beyond what hard stats support → the other side is the better bet
- If the stats show a clear mismatch but the spread is too small → the favorite side is the better bet

Your pick is about VALUE, not just picking winners.
${(isNFL || isNBA) ? `
**${isNFL ? 'NFL' : 'NBA'}:** Always make a pick. Every game has a better side - find it.` : `
**PASS:** Always valid when you don't believe in either side for THIS game.`}

**KEY STATS GATHERED:**
${toolCallHistory.slice(-15).map(t => `- ${t.token}: ${t.summary || 'data received'}`).join('\n')}

**OUTPUT FORMAT (JSON):**
\`\`\`json
{
  "final_pick": "[Team] [spread/ML]"${(isNFL || isNBA) ? '' : ' or "PASS"'},
  "confidence_score": [0.50-0.95],
  "rationale": "MUST START WITH 'Gary's Take\\n\\n' then scene-setter (1-2 sentences), then 3-4 paragraphs explaining WHY this side is the BETTER BET given the spread."
}
\`\`\`

**CRITICAL REMINDER:** ${isWinsQuestion ? 'This spread is small enough that "who wins" is the right question.' : `This is a ${absSpread >= 10 ? 'LARGE' : 'MEDIUM'} spread - your rationale should explain why ${favoriteTeam} wins by ${coverThreshold}+ (or why ${underdogTeam} keeps it closer than ${Math.floor(absSpread)}).`}

**STAT TIER HIERARCHY (CRITICAL - READ THIS):**
- TIER 1 (PREDICTIVE): Net Rating, ORtg, DRtg, eFG%, TS%, Pace - USE THESE as PRIMARY evidence for picks
- TIER 2 (CONTEXT): Fresh injuries (0-3 days), matchup data - need TIER 1 confirmation
- TIER 3 (DESCRIPTIVE): Records, PPG, win/loss streaks, L5/L10 records - FORBIDDEN as reasons for picks

**FORBIDDEN (END-OF-PROMPT PRIORITY):**
- [NO] "They have a 15-3 home record" → Record is TIER 3, explains line not edge
- [NO] "Rest advantage" without efficiency data → Must confirm with ORtg/DRtg in rested vs B2B games
- [NO] "They average 116 PPG" → Raw PPG is pace-inflated, use ORtg instead
- [YES] "Their +4.2 Net Rating vs opponent's -1.8 shows structural efficiency gap"
- [YES] "Home ORtg 118.5 vs road 112.3 suggests venue matters for THIS team"

Your rationale MUST cite TIER 1 stats. If you only have TIER 3 stats, the pick is NOT supported.`;

      messages.push({
        role: 'user',
        content: synthesisPrompt
      });

      // For synthesis, use Pro model for NBA/NFL/NHL (same as grading/decision phases)
      // NCAAB stays on Flash
      const synthesisModel = useProForGrading ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
      console.log(`[Orchestrator] Using ${synthesisModel} for synthesis (sport: ${sport}, useProForGrading: ${useProForGrading})`);
      
      const finalResponse = await callGeminiWithRetry(messages, [], synthesisModel, 3, 'final_decision');
      const finalMessage = finalResponse.choices?.[0]?.message;
      
      if (finalMessage?.content) {
        const synthesizedPick = parseGaryResponse(finalMessage.content, homeTeam, awayTeam, sport, options.game || {});
        if (synthesizedPick && synthesizedPick.pick) {
          console.log(`[Orchestrator] ✅ Synthesis successful (attempt ${attempt}) - got pick: ${synthesizedPick.pick}`);
          synthesizedPick.toolCallHistory = toolCallHistory;
          synthesizedPick.iterations = iteration + attempt;
          synthesizedPick.rawAnalysis = finalMessage.content;
          
          // Attach steel man cases if captured earlier
          if (steelManCases.homeTeamCase || steelManCases.awayTeamCase) {
            synthesizedPick.steelManCases = {
              homeTeam: steelManCases.homeTeamCase,
              awayTeam: steelManCases.awayTeamCase,
              capturedAt: steelManCases.capturedAt
            };
          }
          return synthesizedPick;
        }
        
        // Add the response to messages for next attempt
        messages.push({
          role: 'assistant',
          content: finalMessage.content
        });
      }
      
      console.log(`[Orchestrator] Synthesis attempt ${attempt} didn't produce pick - trying again...`);
    } catch (synthError) {
      console.error(`[Orchestrator] Synthesis attempt ${attempt} error:`, synthError.message);
    }
  }

  // This should rarely happen - but return error with all gathered data
  console.error(`[Orchestrator] ❌ Could not extract pick after ${MAX_SYNTHESIS_ATTEMPTS} synthesis attempts`);
  return {
    error: 'Could not extract final pick after synthesis attempts',
    toolCallHistory,
    iterations: iteration,
    homeTeam,
    awayTeam,
    sport,
    _statsGathered: toolCallHistory.length
  };
}

/**
 * Parse Gary's response to extract the pick JSON
 * 
 * IMPORTANT: We try to extract a valid pick from JSON FIRST.
 * Pass indicators are only checked if no valid pick is found in JSON.
 * This prevents false positives like "moving on" in analysis from triggering PASS.
 */
function parseGaryResponse(content, homeTeam, awayTeam, sport, gameOdds = {}) {
  if (!content) return null;

  // Helper to fix common JSON issues from Gemini
  const fixJsonString = (jsonStr) => {
    // Fix 1: Remove + prefix from numeric values (e.g., "+610" -> "610" or "moneylineAway": +610 -> 610)
    // This handles cases like "moneylineAway": +610 or "odds": +110
    // We use a more robust regex that handles decimals and potential spaces
    let fixed = jsonStr.replace(/:\s*\+([-+]?\d*\.?\d+)/g, ': $1');
    
    // Fix 2: Remove + prefix from numbers in arrays or elsewhere
    fixed = fixed.replace(/,\s*\+([-+]?\d*\.?\d+)/g, ', $1');
    fixed = fixed.replace(/\[\s*\+([-+]?\d*\.?\d+)/g, '[ $1');
    
    // Fix 3: Remove stats array if present (can cause parsing issues)
    fixed = fixed.replace(/"stats"\s*:\s*\[[\s\S]*?\],?/g, '');
    
    // Fix 4: Handle cases where Gary puts a + sign right before a number without a colon
    // e.g. "moneylineAway":+130
    fixed = fixed.replace(/([:,\[])\+([-+]?\d*\.?\d+)/g, '$1$2');
    
    // Fix 5: Replace unescaped newlines in string values with spaces
    // This handles "Unterminated string" errors from newlines in rationale text
    fixed = fixed.replace(/"([^"]*)\n([^"]*)"/g, (match, p1, p2) => {
      // Recursively replace all newlines within string values
      return `"${p1.replace(/\n/g, ' ')} ${p2.replace(/\n/g, ' ')}"`;
    });
    
    // Fix 6: Handle truncated JSON by attempting to close it properly
    // Count open/close braces and brackets
    const openBraces = (fixed.match(/\{/g) || []).length;
    const closeBraces = (fixed.match(/\}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/\]/g) || []).length;
    
    // If JSON appears truncated, try to close it
    if (openBraces > closeBraces || openBrackets > closeBrackets) {
      // Remove trailing incomplete content (like partial strings)
      fixed = fixed.replace(/,\s*"[^"]*$/, ''); // Remove trailing partial key
      fixed = fixed.replace(/:\s*"[^"]*$/, ': null'); // Close partial string value
      fixed = fixed.replace(/,\s*$/, ''); // Remove trailing comma
      
      // Add missing closing brackets/braces
      for (let i = 0; i < openBrackets - closeBrackets; i++) {
        fixed += ']';
      }
      for (let i = 0; i < openBraces - closeBraces; i++) {
        fixed += '}';
      }
    }
    
    return fixed;
  };

  // Try to find JSON in the response
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    let jsonStr = jsonMatch[1];
    try {
      const parsed = JSON.parse(jsonStr);
      return normalizePickFormat(parsed, homeTeam, awayTeam, sport, gameOdds);
    } catch (e) {
      console.warn('[Orchestrator] Failed to parse JSON from code block:', e.message);
      // Try to fix common Gemini JSON issues
      try {
        const fixedJson = fixJsonString(jsonStr);
        const parsed = JSON.parse(fixedJson);
        console.log('[Orchestrator] Parsed JSON after fixing Gemini formatting issues');
        return normalizePickFormat(parsed, homeTeam, awayTeam, sport, gameOdds);
      } catch (e2) {
        console.warn('[Orchestrator] Still failed after fixes:', e2.message);
      }
    }
  }

  // Try to find raw JSON object
  const rawJsonMatch = content.match(/\{[\s\S]*?"pick"[\s\S]*?\}/);
  if (rawJsonMatch) {
    let jsonStr = rawJsonMatch[0];
    try {
      const parsed = JSON.parse(jsonStr);
      return normalizePickFormat(parsed, homeTeam, awayTeam, sport, gameOdds);
    } catch (e) {
      console.warn('[Orchestrator] Failed to parse raw JSON:', e.message);
      // Try to fix common Gemini JSON issues
      try {
        const fixedJson = fixJsonString(jsonStr);
        const parsed = JSON.parse(fixedJson);
        console.log('[Orchestrator] Parsed JSON after fixing Gemini formatting issues');
        return normalizePickFormat(parsed, homeTeam, awayTeam, sport, gameOdds);
      } catch (e2) {
        console.warn('[Orchestrator] Still failed after fixes:', e2.message);
        // Log a snippet of the problematic JSON
        console.log('[Orchestrator] JSON snippet:', jsonStr.substring(0, 500));
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS DETECTION - Only check AFTER JSON parsing fails to find a valid pick
  // This prevents false positives from phrases like "moving on" in analysis
  // ═══════════════════════════════════════════════════════════════════════════
  const lowerContent = content.toLowerCase();
  const passIndicators = [
    // Explicit pass statements (high confidence)
    'i\'m passing', 'im passing', 'i am passing',
    'no pick', 'passing on this', 'pass on this',
    'sitting this one out', 'sit this one out',
    // JSON indicators
    '"type": "pass"', '"pick": "pass"', '"pick":"pass"',
    // Coin flip / no edge language (moderate confidence)
    'too close to call', 'genuine coin flip', 'true coin flip',
    'cannot separate', 'can\'t separate these teams',
    'no clear edge', 'no discernible edge', 'can\'t find an edge',
    // Recommendation hesitation (moderate confidence)
    'cannot recommend', 'can\'t recommend',
    'wouldn\'t bet this', 'would not bet this',
    'stay away', 'staying away',
    // Sharp bettor language (lower confidence - only check if no JSON pick)
    'this is a pass',
    'not enough edge', 'insufficient edge',
    'could go either way', 'goes either way'
    // REMOVED: 'move on', 'moving on' - these trigger false positives in analysis
  ];
  
  const isPass = passIndicators.some(indicator => lowerContent.includes(indicator));
  if (isPass) {
    console.log('[Orchestrator] ⏭️ Gary PASSED on this game (no valid JSON pick + pass indicator found)');
    return {
      pick: 'PASS',
      type: 'pass',
      odds: null,
      thesis_reasoning: 'Gary passed - no compelling edge found',
      supporting_factors: [],
      contradicting_factors_major: [],
      contradicting_factors_minor: [],
      rationale: content.substring(0, 3000)
    };
  }

  // No valid JSON pick found and no clear pass indicators - return null to trigger retry
  console.log('[Orchestrator] ⚠️ No valid pick JSON found in response');
  return null;
}

/**
 * Normalize pick format for storage
 * Handles both legacy format (parsed.pick) and new format (parsed.final_pick)
 */
function normalizePickFormat(parsed, homeTeam, awayTeam, sport, gameOdds = {}) {
  // CRITICAL: Support both legacy format (pick) and new format (final_pick)
  // The new Pass 2.5 format uses "final_pick" instead of "pick"
  if (!parsed.pick && parsed.final_pick) {
    parsed.pick = parsed.final_pick;
    console.log(`[Orchestrator] 📋 Using final_pick as pick: "${parsed.pick}"`);
  }
  
  // Check if this is a PASS pick
  const isPassPick = parsed.type === 'pass' || 
                     (parsed.pick && parsed.pick.toUpperCase() === 'PASS');
  
  if (isPassPick) {
    console.log('[Orchestrator] ⏭️ Gary PASSED on this game (from JSON)');
    return {
      pick: 'PASS',
      type: 'pass',
      odds: null,
      thesis_reasoning: parsed.thesis_reasoning || parsed.thesis_mechanism || 'Gary passed - moving on',
      supporting_factors: [],
      contradicting_factors: { major: [], minor: [] },
      homeTeam: parsed.homeTeam || homeTeam,
      awayTeam: parsed.awayTeam || awayTeam,
      league: normalizeSportToLeague(sport),
      sport: sport,
      rationale: parsed.rationale || parsed.thesis_reasoning || parsed.thesis_mechanism || 'No compelling edge found',
      agentic: true
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CLOSE GAME SPREAD/ML ENFORCEMENT: Small spreads = FORCE MONEYLINE
  // Thresholds: NBA <5, NFL <3.5, NCAAB <5, NCAAF <3.5
  // ═══════════════════════════════════════════════════════════════════════════
  const isNBA = sport === 'basketball_nba' || sport === 'NBA';
  const isNFL = sport === 'americanfootball_nfl' || sport === 'NFL';
  const isNCAAB = sport === 'basketball_ncaab' || sport === 'NCAAB';
  const isNCAAF = sport === 'americanfootball_ncaaf' || sport === 'NCAAF';
  const absSpread = Math.abs(parseFloat(parsed.spread) || 0);
  
  // Determine threshold based on sport
  const mlOnlyThreshold = (isNBA || isNCAAB) ? 5 : (isNFL || isNCAAF) ? 3.5 : 0;
  const sportLabel = isNBA ? 'NBA' : isNFL ? 'NFL' : isNCAAB ? 'NCAAB' : isNCAAF ? 'NCAAF' : '';
  
  if (mlOnlyThreshold > 0 && absSpread > 0 && absSpread < mlOnlyThreshold && parsed.type === 'spread') {
    console.log(`[Orchestrator] ${sportLabel} CLOSE GAME RULE: Converting spread to ML (spread was ${parsed.spread}, threshold <${mlOnlyThreshold})`);
    
    // Determine which team was picked based on pick text
    const pickLower = (parsed.pick || '').toLowerCase();
    const homeTeamLower = (homeTeam || '').toLowerCase();
    const awayTeamLower = (awayTeam || '').toLowerCase();
    
    let pickedTeam = '';
    let mlOdds = null;
    
    if (pickLower.includes(homeTeamLower.split(' ')[0]) || pickLower.includes(homeTeamLower.split(' ').pop())) {
      pickedTeam = homeTeam;
      mlOdds = parsed.moneylineHome ?? gameOdds.moneyline_home ?? null;
    } else if (pickLower.includes(awayTeamLower.split(' ')[0]) || pickLower.includes(awayTeamLower.split(' ').pop())) {
      pickedTeam = awayTeam;
      mlOdds = parsed.moneylineAway ?? gameOdds.moneyline_away ?? null;
    } else {
      // Fallback: use the team name from the pick
      pickedTeam = parsed.homeTeam || parsed.awayTeam || homeTeam;
      mlOdds = parsed.moneylineHome ?? parsed.moneylineAway ?? gameOdds.moneyline_home ?? gameOdds.moneyline_away ?? null;
    }

    // Convert to ML — only include odds in pick text if we have real odds
    parsed.type = 'moneyline';
    if (mlOdds != null) {
      const mlOddsStr = mlOdds > 0 ? `+${mlOdds}` : `${mlOdds}`;
      parsed.pick = `${pickedTeam} ML ${mlOddsStr}`;
    } else {
      console.warn(`[Orchestrator] ⚠️ MISSING ML ODDS for ${pickedTeam} — no odds from AI or game data`);
      parsed.pick = `${pickedTeam} ML`;
    }
    parsed.odds = mlOdds;

    console.log(`[Orchestrator] ${sportLabel} Converted to: ${parsed.pick}`);
  }
  
  // NHL: ALWAYS moneyline (no puck line, no totals - Gary picks winners)
  const isNHL = sport === 'icehockey_nhl' || sport === 'NHL';
  if (isNHL) {
    parsed.type = 'moneyline';
    console.log(`[Orchestrator] 🏒 NHL: Forcing type to moneyline (ML-only sport)`);
  }
  // DETECT TYPE FROM PICK TEXT if not explicitly provided (non-NHL)
  else if (!parsed.type && parsed.pick) {
    const pickLower = parsed.pick.toLowerCase();
    if (pickLower.includes(' ml ') || pickLower.includes(' moneyline') || pickLower.endsWith(' ml')) {
      parsed.type = 'moneyline';
      console.log(`[Orchestrator] 📋 Detected type: moneyline (from pick text)`);
    } else if (/[+-]\d+\.?\d*/.test(parsed.pick) && !pickLower.includes(' ml ')) {
      // Has a spread number like +3.5 or -5.5 but not ML
      parsed.type = 'spread';
      console.log(`[Orchestrator] 📋 Detected type: spread (from pick text)`);
    } else {
      // Default to moneyline as general default
      parsed.type = 'moneyline';
      console.log(`[Orchestrator] 📋 Defaulting type to: moneyline`);
    }
  }
  
  // EXTRACT ODDS FROM PICK TEXT if not explicitly provided
  // E.g., "Detroit Red Wings ML -185" → odds = -185
  if (!parsed.odds && parsed.pick) {
    const oddsMatch = parsed.pick.match(/([+-]\d{3,4})(?:\s*$|\s)/);
    if (oddsMatch) {
      parsed.odds = parseInt(oddsMatch[1], 10);
      console.log(`[Orchestrator] 📋 Extracted odds from pick text: ${parsed.odds}`);
    }
  }
  
  // EXTRACT CONFIDENCE from parsed data if available
  if (!parsed.confidence && parsed.confidence_score) {
    parsed.confidence = parsed.confidence_score;
    console.log(`[Orchestrator] 📋 Using confidence_score: ${parsed.confidence}`);
  }
  
  // Clean up pick text - remove placeholder patterns like -X.X
  let pickText = parsed.pick || '';
  if (pickText.includes('-X.X') || pickText.includes('+X.X')) {
    // If spread placeholder, try to determine actual pick from context
    pickText = pickText.replace(/[+-]X\.X/g, 'ML');
  }

  // FIX: If pick says "Team spread -110" without actual number, insert the spread value
  if (pickText.toLowerCase().includes(' spread ') && parsed.spread) {
    const spreadNum = parseFloat(parsed.spread);
    if (!isNaN(spreadNum)) {
      const spreadStr = spreadNum > 0 ? `+${spreadNum}` : `${spreadNum}`;
      // Replace "spread" with actual spread number
      pickText = pickText.replace(/\s+spread\s+/i, ` ${spreadStr} `);
    }
  }

  // Ensure pick text includes odds if not already present
  // Use real odds from AI output, then fall back to actual game data — NEVER default to -110
  const odds = parsed.odds ?? parsed.spreadOdds ?? parsed.moneylineHome ?? parsed.moneylineAway
    ?? gameOdds.moneyline_home ?? gameOdds.moneyline_away ?? null;
  if (odds == null) {
    console.warn(`[Orchestrator] ⚠️ NO ODDS AVAILABLE for pick "${pickText}" — AI and game data both missing`);
  }
  if (!pickText.includes('-1') && !pickText.includes('+1') && !pickText.includes('-2') && !pickText.includes('+2')) {
    // Odds not in pick text, append them only if we have real odds
    if (odds != null && typeof odds === 'number') {
      const oddsStr = odds > 0 ? `+${odds}` : `${odds}`;
      if (!pickText.includes(oddsStr)) {
        pickText = `${pickText} ${oddsStr}`;
      }
    }
  }

  // Final validation: if pick text is too short or missing team name, reconstruct it
  if (pickText.length < 10 || !pickText.match(/[A-Za-z]{3,}/)) {
    console.log(`[Orchestrator] ⚠️ Pick text too short or missing team name: "${pickText}" - attempting reconstruction`);
    
    // CRITICAL FIX: Try to extract team from rationale before falling back to homeTeam
    // The rationale often ends with "Take [Team] ML" or "Take [Team] +X.X"
    let team = null;
    const rationale = parsed.rationale || '';
    const homeTeamName = parsed.homeTeam || homeTeam || '';
    const awayTeamName = parsed.awayTeam || awayTeam || '';
    
    // Check rationale for "Take [Team]" pattern - this is the most reliable indicator
    const takePattern = /take\s+(?:the\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)*)\s+(?:ML|moneyline|\+|\-)/i;
    const takeMatch = rationale.match(takePattern);
    
    if (takeMatch) {
      const mentionedTeam = takeMatch[1].toLowerCase();
      const homeWords = homeTeamName.toLowerCase().split(' ');
      const awayWords = awayTeamName.toLowerCase().split(' ');
      
      // Check if the mentioned team matches home or away
      if (homeWords.some(w => w.length > 3 && mentionedTeam.includes(w)) || 
          mentionedTeam.includes(homeWords[homeWords.length - 1])) {
        team = homeTeamName;
        console.log(`[Orchestrator] ✅ Extracted HOME team from rationale: ${team}`);
      } else if (awayWords.some(w => w.length > 3 && mentionedTeam.includes(w)) ||
                 mentionedTeam.includes(awayWords[awayWords.length - 1])) {
        team = awayTeamName;
        console.log(`[Orchestrator] ✅ Extracted AWAY team from rationale: ${team}`);
      }
    }
    
    // If still no team, check if rationale mentions one team more favorably at the end
    if (!team) {
      const lastSentences = rationale.slice(-300).toLowerCase();
      const homeMentions = homeTeamName.split(' ').filter(w => w.length > 3 && lastSentences.includes(w.toLowerCase())).length;
      const awayMentions = awayTeamName.split(' ').filter(w => w.length > 3 && lastSentences.includes(w.toLowerCase())).length;
      
      if (awayMentions > homeMentions) {
        team = awayTeamName;
        console.log(`[Orchestrator] ✅ Inferred AWAY team from rationale mentions: ${team}`);
      } else if (homeMentions > awayMentions) {
        team = homeTeamName;
        console.log(`[Orchestrator] ✅ Inferred HOME team from rationale mentions: ${team}`);
      }
    }
    
    // Final fallback - but log a warning
    if (!team) {
      team = homeTeamName || awayTeamName || 'Unknown Team';
      console.log(`[Orchestrator] ⚠️ WARNING: Could not determine team from rationale, falling back to: ${team}`);
    }
    
    const type = parsed.type || 'spread';
    if (type === 'moneyline' || type === 'ml') {
      // Determine correct ML odds based on which team was picked — use game data as fallback
      let mlOdds;
      if (team === homeTeamName) {
        mlOdds = parsed.moneylineHome ?? gameOdds.moneyline_home ?? parsed.moneylineAway ?? gameOdds.moneyline_away ?? null;
      } else {
        mlOdds = parsed.moneylineAway ?? gameOdds.moneyline_away ?? parsed.moneylineHome ?? gameOdds.moneyline_home ?? null;
      }
      if (mlOdds != null) {
        const mlOddsStr = mlOdds > 0 ? `+${mlOdds}` : `${mlOdds}`;
        pickText = `${team} ML ${mlOddsStr}`;
      } else {
        console.warn(`[Orchestrator] ⚠️ MISSING ML ODDS during reconstruction for ${team}`);
        pickText = `${team} ML`;
      }
      console.log(`[Orchestrator] Reconstructed ML pick: ${pickText}`);
    } else if (parsed.spread) {
      const spreadNum = parseFloat(parsed.spread);
      const spreadStr = spreadNum > 0 ? `+${spreadNum}` : `${spreadNum}`;
      const spreadOdds = parsed.spreadOdds ?? gameOdds.spread_home_odds ?? null;
      if (spreadOdds != null) {
        const spreadOddsStr = spreadOdds > 0 ? `+${spreadOdds}` : `${spreadOdds}`;
        pickText = `${team} ${spreadStr} ${spreadOddsStr}`;
      } else {
        pickText = `${team} ${spreadStr}`;
      }
      console.log(`[Orchestrator] Reconstructed spread pick: ${pickText}`);
    }
  }

  // Normalize contradicting_factors to always be { major: [], minor: [] }
  let contradictions = { major: [], minor: [] };
  // New flat format: contradicting_factors_major and contradicting_factors_minor
  if (parsed.contradicting_factors_major || parsed.contradicting_factors_minor) {
    contradictions.major = parsed.contradicting_factors_major || [];
    contradictions.minor = parsed.contradicting_factors_minor || [];
  }
  // Legacy: nested object format
  else if (parsed.contradicting_factors && typeof parsed.contradicting_factors === 'object' && !Array.isArray(parsed.contradicting_factors)) {
    contradictions.major = parsed.contradicting_factors.major || [];
    contradictions.minor = parsed.contradicting_factors.minor || [];
  }
  // Legacy: simple array format (treat as minor)
  else if (Array.isArray(parsed.contradicting_factors)) {
    contradictions.minor = parsed.contradicting_factors;
  }

  // Get rationale and validate it - try multiple fields as fallbacks
  let rationale = parsed.rationale || parsed.analysis || parsed.reasoning || '';
  
  // If rationale is still empty, try to construct one from other available data
  if (!rationale || rationale.length < 50) {
    // Try thesis_reasoning first (it often contains the core reasoning) - supports both old and new field names
    const thesisContent = parsed.thesis_reasoning || parsed.thesis_mechanism;
    if (thesisContent && thesisContent.length > 20) {
      rationale = thesisContent;
      console.log(`[Orchestrator] Using thesis_reasoning as rationale fallback (${rationale.length} chars)`);
    }
    // Try supporting_factors as a fallback
    else if (parsed.supporting_factors && Array.isArray(parsed.supporting_factors) && parsed.supporting_factors.length > 0) {
      rationale = `Key factors: ${parsed.supporting_factors.join(', ')}`;
      console.log(`[Orchestrator] Using supporting_factors as rationale fallback (${rationale.length} chars)`);
    }
    // Try to find rationale in the raw response if we have Gary's full output
    else if (parsed.gary_take || parsed.analysis_summary) {
      rationale = parsed.gary_take || parsed.analysis_summary;
      console.log(`[Orchestrator] Using gary_take/analysis_summary as rationale fallback (${rationale.length} chars)`);
    }
  }
  
  // Check for placeholder/invalid rationales - these should NOT happen
  const invalidRationales = [
    'see detailed analysis',
    'see analysis below',
    'detailed analysis below',
    'analysis below',
    'see above',
    'see below',
    'tbd',
    'to be determined'
  ];
  
  const lowerRationale = rationale.toLowerCase().trim();
  const isPlaceholderRationale = invalidRationales.some(inv => lowerRationale.includes(inv));
  
  // Reduced minimum length from 100 to 50 chars to be more lenient
  // The key insight is that having SOME rationale is better than retrying
  const isTooShort = rationale.length < 50;
  
  // Only retry if rationale is a placeholder OR completely missing (length 0)
  // Don't retry for short but meaningful rationales
  if (isPlaceholderRationale || rationale.length === 0) {
    console.log(`[Orchestrator] ⚠️ Invalid rationale detected (length: ${rationale.length}, placeholder: ${isPlaceholderRationale}) - will retry`);
    return null; // Return null to trigger retry
  }
  
  // Log warning for short rationales but don't retry
  if (isTooShort) {
    console.log(`[Orchestrator] ⚠️ Short rationale (${rationale.length} chars) - proceeding anyway`);
  }

  return {
    pick: pickText.trim(),
    type: parsed.type || 'spread',
    odds: odds,
    // CONFIDENCE - Gary's conviction in the bet (0.50-1.00)
    confidence: parsed.confidence || 0.65, // Default to 0.65 if not provided
    // Thesis-based classification (new system) - supports both old and new field names
    thesis_type: parsed.thesis_type || null,
    thesis_reasoning: parsed.thesis_reasoning || parsed.thesis_mechanism || null,
    supporting_factors: parsed.supporting_factors || [],
    contradicting_factors: contradictions,
    homeTeam: parsed.homeTeam || homeTeam,
    awayTeam: parsed.awayTeam || awayTeam,
    league: normalizeSportToLeague(sport),
    sport: sport,
    rationale: rationale,
    // Include odds from Gary's output — fall back to game data, NEVER to -110
    spread: parsed.spread ?? gameOdds.spread_home ?? null,
    spreadOdds: parsed.spreadOdds ?? gameOdds.spread_home_odds ?? null,
    moneylineHome: parsed.moneylineHome ?? gameOdds.moneyline_home ?? null,
    moneylineAway: parsed.moneylineAway ?? gameOdds.moneyline_away ?? null,
    total: parsed.total ?? gameOdds.total ?? null,
    totalOdds: parsed.totalOdds ?? gameOdds.total_over_odds ?? null,
    // Additional judge fields
    trapAlert: parsed.trapAlert || false,
    revenge: parsed.revenge || false,
    superstition: parsed.superstition || false,
    momentum: parsed.momentum || 0.5,
    agentic: true // Flag to identify agentic picks
  };
}

/**
 * Normalize sport to league name
 */
function normalizeSportToLeague(sport) {
  const mapping = {
    'basketball_nba': 'NBA',
    'americanfootball_nfl': 'NFL',
    'basketball_ncaab': 'NCAAB',
    'americanfootball_ncaaf': 'NCAAF',
    'NBA': 'NBA',
    'NFL': 'NFL',
    'NCAAB': 'NCAAB',
    'NCAAF': 'NCAAF'
  };
  return mapping[sport] || sport;
}

export default { analyzeGame, buildSystemPrompt };
