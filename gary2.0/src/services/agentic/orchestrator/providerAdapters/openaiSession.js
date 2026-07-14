/**
 * OpenAI session adapter — model bake-off harness (Jul 6 2026; Responses API port Jul 7).
 *
 * The orchestrator speaks OpenAI chat-completions shapes natively: tools are
 * {type:'function', function:{name, description, parameters}} and agentLoop
 * consumes the normalized {content, toolCalls, finishReason, usage} response
 * that sessionManager produces. This adapter implements that exact contract
 * over the RESPONSES API (/v1/responses) so GARY_MODEL_OVERRIDE=gpt-5.5 swaps
 * the decision brain per run with zero agentLoop changes. Research
 * (flashAdvisor) stays on Gemini for every brain — only the Gary session moves.
 *
 * Why /v1/responses: gpt-5.5 rejects function tools + reasoning_effort on
 * /v1/chat/completions ("Please use /v1/responses instead" — verified live
 * Jul 7 2026). On the Responses API, reasoning depth rides `reasoning.effort`
 * and tools use the FLAT {type:'function', name, ...} form.
 *
 * State model: previous_response_id chaining (store:true default). Each request
 * sends ONLY the new input items; conversation + reasoning state stay
 * server-side, which is the supported path for gpt-5-family function calling
 * (stateless resend would require echoing encrypted reasoning items).
 *
 * Gemini-parity notes:
 *  - Gemini matches function responses by NAME; the Responses API requires
 *    call_id. The adapter queues pending function_call items and matches
 *    {name, content} responses FIFO per name.
 *  - resetSessionChat drops the chain (fresh-context retry); seed history is
 *    flattened to a user item prefacing the next send.
 *  - toolCalls are re-normalized to the chat-completions nested shape agentLoop
 *    already consumes: {id, type:'function', function:{name, arguments}}.
 */

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

// gpt-5 family (reasoning models): thinking depth maps to reasoning.effort.
// xhigh = gpt-5.6's top tier (founder order, Jul 14: WC specials run there).
const EFFORT_BY_THINKING_LEVEL = { xhigh: 'xhigh', high: 'high', medium: 'medium', low: 'low' };

export function isOpenAiModel(modelName) {
  return typeof modelName === 'string' && modelName.startsWith('gpt-');
}

// Pipeline tools arrive nested ({type:'function', function:{...}}); the
// Responses API wants them flat. Accept either so hand-built tools also work.
function toResponsesTools(tools = []) {
  return tools.map((t) => (t?.function
    ? { type: 'function', name: t.function.name, description: t.function.description, parameters: t.function.parameters }
    : t));
}

export async function createOpenAISession(options = {}) {
  const {
    modelName = 'gpt-5.5',
    systemPrompt = '',
    tools = [],
    thinkingLevel = 'high',
    maxOutputTokens = 65536,
    _costTracker = null,
  } = options;

  console.log(`[Session] Created ${modelName} session via OpenAI adapter (Responses API, reasoning effort: ${EFFORT_BY_THINKING_LEVEL[thinkingLevel] || 'high'}, tools: ${tools.length})`);

  return {
    provider: 'openai',
    modelName,
    tools,
    thinkingLevel,
    maxOutputTokens,
    previousResponseId: null,
    _systemPrompt: systemPrompt,
    _pendingInput: [],     // input items queued for the next request (seed text, function outputs)
    _pendingToolCalls: [], // function_call items awaiting {name, content} responses
    _costTracker,
  };
}

export function resetOpenAISessionChat(session, seedHistory = []) {
  session.previousResponseId = null;
  session._pendingInput = [];
  session._pendingToolCalls = [];
  // Seed history arrives in Gemini Content form ({role, parts:[{text}]}) from
  // the fresh-context retry path — flatten any text into one user preface item.
  const seedText = (seedHistory || [])
    .flatMap((h) => (h?.parts || []).map((p) => p.text).filter(Boolean))
    .join('\n\n');
  if (seedText) session._pendingInput.push({ role: 'user', content: seedText });
  return session;
}

function queueFunctionResponses(session, message) {
  const responses = Array.isArray(message) ? message : [message];
  for (const fr of responses) {
    // Match by name, FIFO — Gemini semantics carried over.
    const idx = session._pendingToolCalls.findIndex((c) => c.name === fr.name);
    const call = idx >= 0 ? session._pendingToolCalls.splice(idx, 1)[0] : null;
    if (!call) {
      console.warn(`[OpenAI Session] ⚠️ function response "${fr.name}" had no pending function call — skipping`);
      continue;
    }
    session._pendingInput.push({
      type: 'function_call_output',
      call_id: call.call_id,
      output: typeof fr.content === 'string' ? fr.content : JSON.stringify(fr.content),
    });
  }
}

// Gemini-parity tolerance: the loop dedups duplicate tool calls before
// executing (so a turn's responses can be a subset of its calls) and answers
// some turns with a text nudge instead of outputs. Gemini forgives both; the
// Responses API 400s on ANY unanswered call ("No tool output found for
// function call…"). Every send must therefore answer every pending call —
// whatever the loop didn't answer gets a neutral output.
function drainUnansweredCalls(session) {
  if (!session._pendingToolCalls.length) return;
  console.log(`[Session] ⚠️ ${session._pendingToolCalls.length} unanswered function call(s) — back-filling neutral outputs`);
  for (const call of session._pendingToolCalls.splice(0)) {
    session._pendingInput.push({
      type: 'function_call_output',
      call_id: call.call_id,
      output: 'No output for this call — superseded; follow the next user message.',
    });
  }
}

export async function sendToOpenAISession(session, message, options = {}) {
  const { isFunctionResponse = false } = options;
  const startTime = Date.now();

  if (isFunctionResponse) {
    queueFunctionResponses(session, message);
    drainUnansweredCalls(session);
  } else {
    // Text nudge while calls are pending (dedup/stall paths) — drain first,
    // then the user text.
    drainUnansweredCalls(session);
    session._pendingInput.push({ role: 'user', content: String(message) });
  }

  const body = {
    model: session.modelName,
    instructions: session._systemPrompt,
    input: session._pendingInput,
    max_output_tokens: session.maxOutputTokens,
    reasoning: { effort: EFFORT_BY_THINKING_LEVEL[session.thinkingLevel] || 'high' },
  };
  if (session.previousResponseId) body.previous_response_id = session.previousResponseId;
  if (session.tools?.length) {
    body.tools = toResponsesTools(session.tools);
    body.tool_choice = 'auto';
  }

  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const duration = Date.now() - startTime;

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* body unreadable */ }
    const error = new Error(`OpenAI ${res.status}: ${detail || 'request failed'}`);
    error.status = res.status;
    if (res.status === 429) error.isQuotaError = true;
    console.error(`[Session] Error after ${duration}ms:`, error.message);
    throw error;
  }

  const data = await res.json();

  // Request accepted: the queued items are now part of the server-side chain.
  session._pendingInput = [];
  session.previousResponseId = data.id || session.previousResponseId;

  const outputItems = Array.isArray(data.output) ? data.output : [];
  const functionCalls = outputItems.filter((o) => o.type === 'function_call');
  const text = outputItems
    .filter((o) => o.type === 'message')
    .flatMap((o) => (o.content || []).map((c) => c.text).filter(Boolean))
    .join('');

  if (functionCalls.length) {
    session._pendingToolCalls.push(...functionCalls);
    console.log(`[Session] 🔧 ${functionCalls.length} function call(s) requested`);
  }

  const usage = {
    prompt_tokens: data.usage?.input_tokens || 0,
    completion_tokens: data.usage?.output_tokens || 0,
    total_tokens: data.usage?.total_tokens || 0,
    cached_tokens: data.usage?.input_tokens_details?.cached_tokens || 0,
  };
  if (session._costTracker) {
    session._costTracker.addUsage(session.modelName, usage);
  }

  console.log(`[Session] Response in ${duration}ms (tokens: ${usage.total_tokens}, cached: ${usage.cached_tokens})`);

  // Re-normalize to the chat-completions toolCalls shape agentLoop consumes.
  const toolCalls = functionCalls.map((c) => ({
    id: c.call_id,
    type: 'function',
    function: { name: c.name, arguments: c.arguments },
  }));

  const hitMaxTokens = data.status === 'incomplete' && data.incomplete_details?.reason === 'max_output_tokens';

  return {
    content: functionCalls.length ? (text || null) : text,
    toolCalls: toolCalls.length ? toolCalls : null,
    finishReason: hitMaxTokens ? 'max_tokens' : toolCalls.length ? 'tool_calls' : 'stop',
    usage,
    raw: data,
  };
}

export default { isOpenAiModel, createOpenAISession, sendToOpenAISession, resetOpenAISessionChat };
