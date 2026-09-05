/**
 * Codex CLI adapter — the GPT Pro subscription bridge (founder GO, Aug 6 2026).
 *
 * The second tank: when the Claude subscription taps out mid-slate, the desk
 * cascade lands here — the same gpt-5.6-sol brain the API era ran, now drawn
 * from the founder's ChatGPT Pro subscription at $0 marginal instead of the
 * metered API. Same normalized session contract as the Claude/OpenAI/Gemini
 * adapters ({ content, toolCalls, finishReason, usage }); sessionManager
 * routes `codex-*` model names here and nothing upstream changes.
 *
 * Mechanics (proven live, Aug 6): prompt rides STDIN; `--json` emits JSONL —
 * thread.started carries the thread_id, agent_message items carry the text,
 * turn.completed carries usage. Multi-turn continues the SAME conversation
 * via `codex exec resume <thread_id>` (codeword recall verified). The exec
 * subcommand takes -s/-m; resume inherits the session's settings. There is
 * no system-prompt flag in exec — the brain's system prompt rides as a
 * preamble on the first message, which for a tool-less text brain is the
 * same thing. Sandbox is read-only and no tools are enabled: the desk stays
 * the entire evidence, exactly like every other brain.
 *
 * Failure mapping: usage-cap / rate-limit text sets isQuotaError so the desk
 * cascade escalates onward (Gemini last) — two capped subscriptions still
 * never mean a dark slate.
 *
 * TOOLS MODE (founder, Sep 3 2026: "go from 12 cents a game to free"): the
 * research assistant is a tool loop, and the CLI has no function calling.
 * When a session is created WITH tools, the catalog rides the first message
 * as a strict JSON call protocol; a reply that is a {"tool_calls":[…]} object
 * comes back to the caller in the same chat-completions toolCalls shape the
 * API adapters return, and the caller's function responses go back on the
 * same thread as a TOOL RESULTS message. The research prompt, factor plan and
 * tool executors do not change — only the model call moves onto the sub.
 * Brains stay tool-less: a session created without tools is unchanged.
 */
import { spawn } from 'child_process';
import { isCliTripped, recordCliTimeout, recordCliSuccess, trippedError } from './cliCircuitBreaker.js';
import { abortError, requestSignal } from '../requestCancellation.js';
import { registerOwnedProcessGroup } from './ownedProcessGroups.js';

const CODEX_BIN = process.env.CODEX_CLI_PATH || 'codex';
// Measured Aug 25 2026 over 2,596 logged CLI responses: median 2.3m, p90 5.8m,
// p99 9.2m, max 14.6m. Ten minutes clears p99 while abandoning a hung bridge a
// third sooner. The circuit breaker below is what bounds a bad night.
const CALL_TIMEOUT_MS = Number(process.env.GARY_CLI_TIMEOUT_MS) || 10 * 60 * 1000;

// Effort is PINNED per call, same lesson as the Claude bridge (Jul 29: headless
// runs silently inherited the interactive default). Codex takes it as a config
// override; the OpenAI ladder reaches xhigh.
const CODEX_EFFORT_LEVELS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh']);
const effortFor = (thinkingLevel) =>
  (CODEX_EFFORT_LEVELS.has(thinkingLevel) ? thinkingLevel : 'xhigh');

/** `codex-gpt-5.6-sol` → runs gpt-5.6-sol through the Codex CLI. */
export function isCodexCliModel(modelName) {
  return typeof modelName === 'string' && modelName.startsWith('codex-');
}
const cliModelOf = (modelName) => String(modelName).replace(/^codex-/, '');

/** The tool catalog as text: name, purpose, parameters (JSON schema). */
export function renderCodexToolProtocol(tools = []) {
  const catalog = (tools || []).map((t) => {
    const f = t?.function || t;
    return `- ${f.name}: ${String(f.description || '').replace(/\s+/g, ' ').trim()}\n  parameters: ${JSON.stringify(f.parameters || {})}`;
  }).join('\n');
  return `## TOOLS (call protocol)
This is not a coding session: there is no shell, no file system and no repository here. The ONLY tools are the ones listed below, and they run outside this conversation. To call one or more, reply with ONLY a JSON object — no prose before or after, no code fence — shaped exactly like this:
{"tool_calls":[{"name":"fetch_stats","arguments":{"token":"EXAMPLE_TOKEN"}}]}
Each call names a tool and gives its arguments as an object. You may put several calls in one reply. The results come back in the next message under TOOL RESULTS. When you have what you need, reply with your normal answer as text (no "tool_calls" key).
RULE: whenever you are asked to investigate a factor, your FIRST reply is the tool_calls object fetching what that factor needs — never findings written from memory or from the report alone. Write the findings only after the TOOL RESULTS arrive.

${catalog}`;
}

/** Caller's function responses → one TOOL RESULTS turn on the thread. */
export function formatCodexFunctionResponses(responses = []) {
  const blocks = (responses || []).map((r) => `### ${r.name}\n${typeof r.content === 'string' ? r.content : JSON.stringify(r.content)}`);
  return `TOOL RESULTS\n\n${blocks.join('\n\n')}\n\nContinue: reply with another JSON tool_calls object if you need more, or write your answer as text.`;
}

/** A reply that is a tool_calls object → chat-completions toolCalls; else null. */
export function parseCodexToolCalls(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let obj;
  try { obj = JSON.parse(unfenced.slice(start, end + 1)); } catch { return null; }
  if (!obj || !Array.isArray(obj.tool_calls) || obj.tool_calls.length === 0) return null;
  const calls = obj.tool_calls
    .filter((c) => c && typeof c.name === 'string' && c.name.trim())
    .map((c, i) => ({
      id: `codex_call_${Date.now()}_${i}`,
      type: 'function',
      function: { name: c.name.trim(), arguments: JSON.stringify(c.arguments && typeof c.arguments === 'object' ? c.arguments : (c.args && typeof c.args === 'object' ? c.args : {})) },
    }));
  return calls.length ? calls : null;
}

// The breaker is keyed per LANE, not per binary: a web search lane running
// under a deliberately short cap (football grounding: 150s across up to ten
// concurrent lanes) must never count as evidence that the zero-tool pick
// session is hanging. Two slow searches used to trip 'codex' for the whole
// process and push every remaining pick onto the metered cascade.
function runCodex(args, stdinText, timeoutMs = CALL_TIMEOUT_MS, breakerKey = 'codex', explicitSignal) {
  const signal = requestSignal(explicitSignal);
  signal?.throwIfAborted();
  // A bridge that has already timed out repeatedly this run is not asked again.
  if (isCliTripped(breakerKey)) return Promise.reject(trippedError(breakerKey));
  return new Promise((resolve, reject) => {
    // The CLI wrapper starts a native child. Give this invocation its own
    // process group so cancellation reaches both, without touching other games.
    const processGroup = !!signal && process.platform !== 'win32';
    const proc = spawn(CODEX_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'], detached: processGroup });
    const releaseGroup = processGroup ? registerOwnedProcessGroup(proc.pid) : () => {};
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;
    const killOwnedGroup = (killSignal) => {
      if (!proc.pid) return;
      try {
        if (processGroup) process.kill(-proc.pid, killSignal);
        else proc.kill(killSignal);
      } catch (error) {
        if (error.code !== 'ESRCH') console.warn(`[Codex CLI] Could not terminate request: ${error.message}`);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const fail = (error, { terminate = false, timedOut = false } = {}) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (timedOut) recordCliTimeout(breakerKey);
      if (terminate) {
        killOwnedGroup('SIGTERM');
        // The wrapper may close before a stubborn descendant. Keep the hard
        // kill scheduled for the group even after the wrapper's close event.
        setTimeout(() => { killOwnedGroup('SIGKILL'); releaseGroup(); }, 1000).unref();
      } else {
        releaseGroup();
      }
      reject(error);
    };
    const onAbort = () => fail(signal.reason || abortError('Codex request cancelled'), { terminate: true });
    timer = setTimeout(() => fail(new Error(`codex CLI timed out after ${Math.round(timeoutMs / 60000)}m`), { terminate: true, timedOut: true }), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (e) => fail(e));
    proc.stdin.on('error', (e) => fail(e, { terminate: true }));
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      releaseGroup();
      // Any answer at all — even a non-zero exit — means the bridge is alive.
      // A killed request closing is not an answer and cannot erase a timeout.
      recordCliSuccess(breakerKey);
      resolve({ code, stdout, stderr });
    });
    if (signal?.aborted) { onAbort(); return; }
    proc.stdin.write(stdinText);
    proc.stdin.end();
  });
}

const CAP_PATTERNS = /usage limit|rate limit|too many requests|429|quota|plan limit|limit reached/i;

function toError(detailText) {
  const detail = String(detailText || '').slice(0, 300);
  const error = new Error(`codex CLI: ${detail}`);
  if (CAP_PATTERNS.test(detail)) error.isQuotaError = true;
  return error;
}

/** Parse the JSONL event stream into { threadId, text, usage } or throw. */
function parseEvents(stdout) {
  let threadId = null;
  const messages = [];
  let usage = null;
  let failure = null;
  for (const line of String(stdout).split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    let ev;
    try { ev = JSON.parse(t); } catch { continue; }
    if (ev.type === 'thread.started') threadId = ev.thread_id || threadId;
    if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && ev.item.text) {
      messages.push(ev.item.text);
    }
    if (ev.type === 'turn.completed') usage = ev.usage || usage;
    if (ev.type === 'turn.failed') failure = ev.error?.message || 'turn.failed';
    if (ev.type === 'error' && !failure) failure = ev.message || 'error event';
  }
  if (failure) throw toError(failure);
  return { threadId, text: messages.join('\n\n'), usage };
}

export async function createCodexCliSession(options = {}) {
  const {
    modelName = 'codex-gpt-5.6-sol',
    systemPrompt = '',
    thinkingLevel = 'high',
    _costTracker = null,
    tools = null,
  } = options;
  const toolList = Array.isArray(tools) && tools.length ? tools : null;
  console.log(`[Session] Created ${modelName} session via Codex CLI adapter (GPT Pro bridge, tools: ${toolList ? toolList.length : 0})`);
  return {
    provider: 'codex-cli',
    modelName,
    thinkingLevel,
    // Tools mode: the catalog rides the first message with the system prompt.
    _systemPrompt: toolList ? `${systemPrompt}\n\n${renderCodexToolProtocol(toolList)}` : systemPrompt,
    tools: toolList,
    codexThreadId: null, // set after the first send; `exec resume` continues it
    _costTracker,
    signal: requestSignal(options.signal),
  };
}

export function resetCodexCliSessionChat(session, seedHistory = []) {
  session.codexThreadId = null; // fresh-context retry: next send starts a new thread
  const seedText = (seedHistory || [])
    .flatMap((h) => (h?.parts || []).map((p) => p.text).filter(Boolean))
    .join('\n\n');
  session._seedText = seedText || null;
  return session;
}

export async function sendToCodexCliSession(session, message, options = {}) {
  const signal = requestSignal(options.signal, session.signal);
  signal?.throwIfAborted();
  const startTime = Date.now();
  // Tools mode: the caller's function responses ride as one TOOL RESULTS turn.
  const text = (session.tools && options.isFunctionResponse && Array.isArray(message))
    ? formatCodexFunctionResponses(message)
    : (typeof message === 'string' ? message : JSON.stringify(message));
  let body = session._seedText ? `${session._seedText}\n\n${text}` : text;
  session._seedText = null;

  let args;
  if (session.codexThreadId) {
    // resume inherits the original session's model/effort/sandbox.
    args = ['exec', 'resume', '--skip-git-repo-check', '--json', session.codexThreadId, '-'];
  } else {
    args = [
      'exec', '--skip-git-repo-check', '-s', 'read-only', '--json',
      '-m', cliModelOf(session.modelName),
      '-c', `model_reasoning_effort="${effortFor(session.thinkingLevel)}"`,
      '-',
    ];
    // No system flag on exec — the contract rides as a preamble on turn one.
    if (session._systemPrompt) body = `${session._systemPrompt}\n\n${body}`;
  }

  // A research (tools) session trips its own breaker lane, never the brain's.
  const { code, stdout, stderr } = await runCodex(args, body, CALL_TIMEOUT_MS, session.tools ? 'codex-research' : 'codex', signal);
  signal?.throwIfAborted();
  const duration = Date.now() - startTime;
  if (code !== 0) {
    const error = toError(stderr || stdout);
    console.error(`[Session] Codex CLI error after ${duration}ms:`, error.message);
    throw error;
  }

  const { threadId, text: content, usage: rawUsage } = parseEvents(stdout);
  session.codexThreadId = threadId || session.codexThreadId;

  const usage = {
    prompt_tokens: rawUsage?.input_tokens || 0,
    completion_tokens: (rawUsage?.output_tokens || 0) + (rawUsage?.reasoning_output_tokens || 0),
    total_tokens: (rawUsage?.input_tokens || 0) + (rawUsage?.output_tokens || 0),
    cached_tokens: rawUsage?.cached_input_tokens || 0,
  };
  if (session._costTracker) session._costTracker.addUsage(session.modelName, usage);
  console.log(`[Session] Codex CLI response in ${duration}ms (tokens: ${usage.total_tokens}, cached: ${usage.cached_tokens}, GPT Pro — $0 marginal)`);

  // Tools mode: a tool_calls reply comes back as toolCalls; brains stay tool-less.
  const toolCalls = session.tools ? parseCodexToolCalls(content) : null;
  return {
    content: toolCalls ? null : content,
    toolCalls,
    finishReason: toolCalls ? 'tool_calls' : 'stop',
    usage,
    raw: stdout,
  };
}

/**
 * One-shot grounded web search on the GPT Pro subscription (founder GO,
 * Sep 1 2026: "not use Claude CLI at all... since codex is free too") —
 * the $0 first rung for every pick-lane search. Same { success, data, raw }
 * contract as the old claudeCliWebSearch rung. Mechanics verified live
 * Sep 1: `exec -c tools.web_search=true` fires native Responses web_search
 * events on the ChatGPT sub; search runs at LOW effort — retrieval quality
 * is search-bound, and deep thinking on a news lookup just risks the timeout.
 */
export async function codexCliWebSearch(prompt, options = {}) {
  const model = options.model || process.env.GARY_GROUNDING_CODEX_MODEL || 'gpt-5.6-sol';
  try {
    const args = [
      'exec', '--skip-git-repo-check', '-s', 'read-only', '--json',
      '-m', model,
      '-c', 'tools.web_search=true',
      '-c', 'model_reasoning_effort="low"',
      '-',
    ];
    // 8 minutes: the Sep 1 NFL Week-1 smoke showed heavy multi-part football
    // queries running past the old 5m cap (3 of 4 timed out) while completed
    // ones landed 6-17K chars — and with the metered fallback rung subject to
    // wallet balance, the $0 rung finishing is worth the extra headroom.
    const { code, stdout, stderr } = await runCodex(args, prompt, options.timeoutMs || 8 * 60 * 1000, 'codex-search', options.signal);
    if (code !== 0) throw toError(stderr || stdout);
    const { text } = parseEvents(stdout);
    const clean = String(text || '').trim();
    console.log(`[Web Search] codex-cli (${model}) returned ${clean.length} chars (GPT Pro — $0 marginal)`);
    return { success: clean.length > 0, data: clean, raw: stdout };
  } catch (e) {
    requestSignal(options.signal)?.throwIfAborted();
    console.warn(`[Web Search] codex-cli search failed: ${e.message}`);
    return { success: false, data: '', raw: null, error: e.message };
  }
}

/**
 * One-shot ask on the subscription: a single prompt, one answer, optional
 * web search, its own breaker lane (founder GO, Sep 2 2026 — THE WINNERS
 * REVIEWER rides this: "a GPT model that is cheaper... still a smart brain").
 * A system prompt, when given, leads the stdin text; `exec` has no separate
 * system slot. Same { success, data, raw } contract as codexCliWebSearch.
 */
export async function codexCliOneShot(prompt, options = {}) {
  const model = options.model || 'gpt-5.6-sol';
  const effort = String(options.effort || 'high').replace(/[^a-z]/g, '');
  const breakerKey = options.breakerKey || 'codex-oneshot';
  try {
    const args = [
      'exec', '--skip-git-repo-check', '-s', 'read-only', '--json',
      '-m', model,
      ...(options.search ? ['-c', 'tools.web_search=true'] : []),
      '-c', `model_reasoning_effort="${effort}"`,
      '-',
    ];
    const stdinText = options.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt;
    const { code, stdout, stderr } = await runCodex(args, stdinText, options.timeoutMs || 6 * 60 * 1000, breakerKey, options.signal);
    if (code !== 0) throw toError(stderr || stdout);
    const { text, usage } = parseEvents(stdout);
    const clean = String(text || '').trim();
    console.log(`[Codex one-shot] ${breakerKey} (${model}, ${effort}${options.search ? ', search' : ''}) returned ${clean.length} chars (GPT Pro — $0 marginal)`);
    return { success: clean.length > 0, data: clean, raw: stdout, usage: usage || null };
  } catch (e) {
    requestSignal(options.signal)?.throwIfAborted();
    console.warn(`[Codex one-shot] ${breakerKey} failed: ${e.message}`);
    return { success: false, data: '', raw: null, error: e.message };
  }
}

export default { isCodexCliModel, createCodexCliSession, sendToCodexCliSession, resetCodexCliSessionChat, codexCliWebSearch, codexCliOneShot };
