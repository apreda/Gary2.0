/**
 * Anthropic API session adapter — the June-engine restoration's research tier
 * (Aug 18 2026). Runs `anthropic-*` model names (e.g. anthropic-claude-haiku-4-5)
 * against the metered Messages API with FULL tool-calling support — the piece
 * neither CLI bridge has (claudeCli/codexCli are tool-less by construction).
 * Built for the Flash-research role: 25+ fetch_stats calls per game on a cheap
 * dedicated tier, isolated from the subscription pools the brains ride.
 *
 * Same normalized session contract as the OpenAI/Gemini/CLI adapters
 * ({ content, toolCalls, finishReason, usage }) — sessionManager routes
 * `anthropic-*` names here and nothing upstream changes.
 *
 * Mechanics: stateful client-side history (the Messages API has no server-side
 * chaining) — every assistant response is appended VERBATIM (tool_use blocks
 * included) so replay stays valid. Tools convert from the pipeline's nested
 * {type:'function', function:{...}} shape to Anthropic's {name, description,
 * input_schema}. The big system prompt (scout report rides inside it for the
 * research role) takes a cache_control breakpoint — same economics as the
 * Jul 8 Gemini cache fix: one full-price pass, ~90%-off reuse across the
 * ~30 per-factor calls.
 *
 * Gemini-parity notes (same as the OpenAI adapter):
 *  - Function responses arrive as {name, content} and match pending tool_use
 *    blocks FIFO by NAME; Anthropic requires tool_use_id, so the adapter keeps
 *    the pending queue and maps name → id.
 *  - Anthropic 400s if any tool_use goes unanswered in the next user message —
 *    every send back-fills neutral outputs for calls the loop dedup'd away.
 *  - No extended thinking here: budget_tokens + tool replay adds fragility the
 *    research role doesn't need — the checklist is a diligence job.
 */

import { requestSignal } from '../requestCancellation.js';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL_PREFIX = 'anthropic-';

export function isAnthropicApiModel(modelName) {
  return typeof modelName === 'string' && modelName.startsWith(MODEL_PREFIX);
}

// 'anthropic-claude-haiku-4-5' → 'claude-haiku-4-5' (the real API model id)
function apiModelId(modelName) {
  return modelName.slice(MODEL_PREFIX.length);
}

// Pipeline tools are nested ({type:'function', function:{...}}); Anthropic
// wants {name, description, input_schema}.
function toAnthropicTools(tools = []) {
  return tools
    .filter((t) => t?.function || t?.name)
    .map((t) => (t.function
      ? { name: t.function.name, description: t.function.description, input_schema: t.function.parameters }
      : { name: t.name, description: t.description, input_schema: t.parameters || t.input_schema }));
}

export async function createAnthropicApiSession(options = {}) {
  const {
    modelName = 'anthropic-claude-haiku-4-5',
    systemPrompt = '',
    tools = [],
    thinkingLevel = 'high', // accepted for contract parity; unused (see header)
    maxOutputTokens = 16000,
    _costTracker = null,
  } = options;

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(`[Anthropic Session] ANTHROPIC_API_KEY is not set — cannot create ${modelName} session`);
  }

  const anthTools = toAnthropicTools(tools);
  console.log(`[Session] Created ${modelName} session via Anthropic API adapter (Messages API, tools: ${anthTools.length}, cache: system block)`);

  return {
    provider: 'anthropic-api',
    modelName,                    // full prefixed name — costTracker keys on this
    _apiModel: apiModelId(modelName),
    tools: anthTools,
    thinkingLevel,
    maxOutputTokens: Math.min(maxOutputTokens || 16000, 32000),
    _systemPrompt: systemPrompt,
    _messages: [],                // full client-side history (assistant blocks verbatim)
    _pendingUserBlocks: [],       // content blocks queued for the next user message
    _pendingToolUses: [],         // {id, name} awaiting {name, content} responses
    _costTracker,
  };
}

export function resetAnthropicApiSessionChat(session, seedHistory = []) {
  session._messages = [];
  session._pendingUserBlocks = [];
  session._pendingToolUses = [];
  // Seed history arrives in Gemini Content form ({role, parts:[{text}]}) from
  // the fresh-context retry path — flatten any text into one user preface block.
  const seedText = (seedHistory || [])
    .flatMap((h) => (h?.parts || []).map((p) => p.text).filter(Boolean))
    .join('\n\n');
  if (seedText) session._pendingUserBlocks.push({ type: 'text', text: seedText });
  return session;
}

function queueFunctionResponses(session, message) {
  const responses = Array.isArray(message) ? message : [message];
  for (const fr of responses) {
    // Match by name, FIFO — Gemini semantics carried over.
    const idx = session._pendingToolUses.findIndex((c) => c.name === fr.name);
    const call = idx >= 0 ? session._pendingToolUses.splice(idx, 1)[0] : null;
    if (!call) {
      console.warn(`[Anthropic Session] ⚠️ function response "${fr.name}" had no pending tool_use — skipping`);
      continue;
    }
    session._pendingUserBlocks.push({
      type: 'tool_result',
      tool_use_id: call.id,
      content: typeof fr.content === 'string' ? fr.content : JSON.stringify(fr.content),
    });
  }
}

// Anthropic rejects a request if any tool_use from the previous assistant turn
// lacks a tool_result in the next user message — whatever the loop dedup'd or
// nudged past gets a neutral output.
function drainUnansweredCalls(session) {
  if (!session._pendingToolUses.length) return;
  console.log(`[Session] ⚠️ ${session._pendingToolUses.length} unanswered tool_use block(s) — back-filling neutral outputs`);
  for (const call of session._pendingToolUses.splice(0)) {
    session._pendingUserBlocks.push({
      type: 'tool_result',
      tool_use_id: call.id,
      content: 'No output for this call — superseded; follow the next user message.',
    });
  }
}

export async function sendToAnthropicApiSession(session, message, options = {}) {
  const signal = requestSignal(options.signal, session.signal);
  signal?.throwIfAborted();
  const { isFunctionResponse = false } = options;
  const startTime = Date.now();

  if (isFunctionResponse) {
    queueFunctionResponses(session, message);
    drainUnansweredCalls(session);
  } else {
    // Text nudge while calls are pending (dedup/stall paths) — tool_results
    // first, then the user text, all in the same user message.
    drainUnansweredCalls(session);
    session._pendingUserBlocks.push({ type: 'text', text: String(message) });
  }

  session._messages.push({ role: 'user', content: session._pendingUserBlocks });
  session._pendingUserBlocks = [];

  const body = {
    model: session._apiModel,
    max_tokens: session.maxOutputTokens,
    messages: session._messages,
  };
  // A session with no system prompt (content passes create these) must omit
  // the field entirely: Anthropic 400s an EMPTY text block carrying
  // cache_control ("cache_control cannot be set for empty text blocks").
  // Surfaced Sep 1 2026 when the model cascade moved from the CLI bridge
  // (which tolerated empty systems) to this API adapter.
  if (String(session._systemPrompt || '').trim()) {
    body.system = [{ type: 'text', text: session._systemPrompt, cache_control: { type: 'ephemeral' } }];
  }
  if (session.tools?.length) {
    body.tools = session.tools;
    body.tool_choice = { type: 'auto' };
  }

  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    signal,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  const duration = Date.now() - startTime;

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* body unreadable */ }
    const error = new Error(`Anthropic ${res.status}: ${detail || 'request failed'}`);
    error.status = res.status;
    if (res.status === 429 || res.status === 529) error.isQuotaError = true;
    // The failed user turn stays in _messages; a retry resends it — correct,
    // since the API never accepted it. The rails' resetSessionChat path covers
    // the fresh-context case.
    console.error(`[Session] Error after ${duration}ms:`, error.message);
    throw error;
  }

  const data = await res.json();
  signal?.throwIfAborted();

  // Append the assistant turn VERBATIM — tool_use blocks must replay intact.
  session._messages.push({ role: 'assistant', content: data.content || [] });

  const blocks = Array.isArray(data.content) ? data.content : [];
  const toolUses = blocks.filter((b) => b.type === 'tool_use');
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).filter(Boolean).join('');

  if (toolUses.length) {
    session._pendingToolUses.push(...toolUses.map((b) => ({ id: b.id, name: b.name })));
    console.log(`[Session] 🔧 ${toolUses.length} tool_use block(s) requested`);
  }

  const usage = {
    prompt_tokens: data.usage?.input_tokens || 0,
    completion_tokens: data.usage?.output_tokens || 0,
    total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    cached_tokens: data.usage?.cache_read_input_tokens || 0,
  };
  if (session._costTracker) {
    session._costTracker.addUsage(session.modelName, usage);
  }

  console.log(`[Session] Response in ${duration}ms (tokens: ${usage.total_tokens}, cached: ${usage.cached_tokens})`);

  // Re-normalize to the chat-completions toolCalls shape agentLoop consumes.
  const toolCalls = toolUses.map((b) => ({
    id: b.id,
    type: 'function',
    function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
  }));

  return {
    content: toolCalls.length ? (text || null) : text,
    toolCalls: toolCalls.length ? toolCalls : null,
    finishReason: data.stop_reason === 'max_tokens' ? 'max_tokens' : toolCalls.length ? 'tool_calls' : 'stop',
    usage,
    raw: data,
  };
}

export default { isAnthropicApiModel, createAnthropicApiSession, sendToAnthropicApiSession, resetAnthropicApiSessionChat };
