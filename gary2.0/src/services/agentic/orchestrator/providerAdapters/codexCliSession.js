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
 * A brain created WITH tools speaks the same protocol (founder, Sep 9 2026:
 * "full Gary with tools on the bridge, just like the June system").
 *
 * LOGINS (Sep 9 2026): each ChatGPT account is its own CODEX_HOME; a thread
 * is pinned to the login that started it, and new work takes the first login
 * with allowance (codexHomes.js).
 */
import { spawn } from 'child_process';
import { StringDecoder } from 'node:string_decoder';
import { isCliTripped, recordCliTimeout, recordCliSuccess, trippedError } from './cliCircuitBreaker.js';
import { abortError, requestSignal } from '../requestCancellation.js';
import { registerOwnedProcessGroup } from './ownedProcessGroups.js';
import { searchResponseProblem } from '../../searchResponseValidation.js';
import { renderCliToolProtocol, formatCliFunctionResponses, parseCliToolCalls } from './cliToolProtocol.js';
import { availableCodexHomes, markCodexHomeCapped, codexHomeLabel } from './codexHomes.js';

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

// The protocol text and parser are shared with the Claude bridge
// (cliToolProtocol.js); these names stay for existing callers and tests.
export const renderCodexToolProtocol = renderCliToolProtocol;
export const formatCodexFunctionResponses = formatCliFunctionResponses;
export const parseCodexToolCalls = (text) => parseCliToolCalls(text, { idPrefix: 'codex_call' });

// The breaker is keyed per LANE, not per binary: a web search lane running
// under a deliberately short cap (football grounding: 150s across up to ten
// concurrent lanes) must never count as evidence that the zero-tool pick
// session is hanging. Two slow searches used to trip 'codex' for the whole
// process and push every remaining pick onto the metered cascade.
function runCodex(args, stdinText, timeoutMs = CALL_TIMEOUT_MS, breakerKey = 'codex', explicitSignal, home = null) {
  const signal = requestSignal(explicitSignal);
  signal?.throwIfAborted();
  // A bridge that has already timed out repeatedly this run is not asked again.
  if (isCliTripped(breakerKey)) return Promise.reject(trippedError(breakerKey));
  return new Promise((resolve, reject) => {
    // The CLI wrapper starts a native child. Give this invocation its own
    // process group so timeouts and parent shutdown also reach descendants
    // when the caller did not supply an explicit cancellation signal.
    const processGroup = process.platform !== 'win32';
    // Each ChatGPT login has its own CODEX_HOME (auth + thread store).
    const env = home ? { ...process.env, CODEX_HOME: home } : process.env;
    const proc = spawn(CODEX_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'], detached: processGroup, env });
    const releaseGroup = processGroup ? registerOwnedProcessGroup(proc.pid) : () => {};
    let stdout = '';
    let stderr = '';
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
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
    proc.stdout.on('data', (d) => { stdout += stdoutDecoder.write(typeof d === 'string' ? Buffer.from(d) : d); });
    proc.stderr.on('data', (d) => { stderr += stderrDecoder.write(typeof d === 'string' ? Buffer.from(d) : d); });
    proc.on('error', (e) => fail(e));
    proc.stdin.on('error', (e) => fail(e, { terminate: true }));
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      releaseGroup();
      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();
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
  let completed = false;
  for (const line of String(stdout).split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    let ev;
    try { ev = JSON.parse(t); } catch { continue; }
    if (ev.type === 'thread.started') threadId = ev.thread_id || threadId;
    if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && ev.item.text) {
      messages.push(ev.item.text);
    }
    if (ev.type === 'turn.started') completed = false;
    if (ev.type === 'turn.completed') {
      completed = true;
      usage = ev.usage || usage;
    }
    if (ev.type === 'turn.failed') failure = ev.error?.message || 'turn.failed';
    if (ev.type === 'error' && !failure) failure = ev.message || 'error event';
  }
  if (failure) throw toError(failure);
  // A successful process exit alone cannot establish a completed model turn.
  // Reject an interrupted/truncated event stream before exposing partial text.
  if (!completed) throw toError('Incomplete event stream: missing turn.completed receipt');
  return { threadId, text: messages.join('\n\n'), finalText: messages.at(-1) || '', usage };
}

/** The CLI's own failure line from a non-zero exit's event stream, if any. */
function failureMessageIn(stdout) {
  for (const line of String(stdout || '').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    let ev;
    try { ev = JSON.parse(t); } catch { continue; }
    if (ev.type === 'turn.failed' && ev.error?.message) return ev.error.message;
    if (ev.type === 'error' && ev.message) return ev.message;
  }
  return null;
}

const etClock = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * One turn on the first login with allowance. A login answering "usage
 * limit" is marked capped until the reset it names and the turn moves to the
 * next login; a resumed thread is pinned to the login that started it and
 * cannot move. Returns the parsed events plus which login answered.
 */
async function codexTurn(args, body, timeoutMs, breakerKey, signal, { preferred = null, pinned = null } = {}) {
  const homes = pinned !== null ? [pinned] : availableCodexHomes({ preferred });
  if (!homes.length) throw toError('every Codex login is at its usage limit — no login has allowance right now');
  let lastError = null;
  for (const home of homes) {
    try {
      const { code, stdout, stderr } = await runCodex(args, body, timeoutMs, breakerKey, signal, home || null);
      signal?.throwIfAborted();
      // A non-zero exit still carries the CLI's own event stream; its error
      // line ("You've hit your usage limit… try again at …") is the message,
      // not the thread.started line that happens to come first.
      if (code !== 0) throw toError(failureMessageIn(stdout) || stderr || stdout);
      return { ...parseEvents(stdout), stdout, home: home || '' };
    } catch (error) {
      signal?.throwIfAborted();
      if (error?.isQuotaError && home) {
        const until = markCodexHomeCapped(home, error.message);
        const moving = pinned === null;
        console.warn(`[Codex CLI] login "${codexHomeLabel(home)}" is at its usage limit until ${etClock(until)} ET${moving ? ' — trying the next login' : ' (this thread is pinned to it)'}`);
        if (moving) { lastError = error; continue; }
      }
      throw error;
    }
  }
  throw lastError;
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
  // A research session trips its own breaker lane; a brain, tools or not,
  // stays on the brain's lane.
  const breakerKey = options.breakerLane === 'research' ? 'codex-research' : 'codex';
  console.log(`[Session] Created ${modelName} session via Codex CLI adapter (ChatGPT bridge, tools: ${toolList ? toolList.length : 0}, lane: ${breakerKey})`);
  return {
    provider: 'codex-cli',
    modelName,
    thinkingLevel,
    breakerKey,
    codexHome: null, // the login that answered turn one; resume is pinned to it
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
      // A research session's turns are tool calls and findings, not the
      // pick: they run at GARY_RESEARCH_EFFORT (default medium) so eight
      // factors fit one budget and one login's allowance (Sep 9 2026 — Luna
      // at high spent 75-440 s a turn and timed out 28 of 30 games).
      '-c', `model_reasoning_effort="${effortFor(session.breakerKey === 'codex-research' ? (process.env.GARY_RESEARCH_EFFORT || 'medium') : session.thinkingLevel)}"`,
      '-',
    ];
    // No system flag on exec — the contract rides as a preamble on turn one.
    if (session._systemPrompt) body = `${session._systemPrompt}\n\n${body}`;
  }

  // A research session trips its own breaker lane, never the brain's. A new
  // thread takes the first login with allowance; a resumed thread is pinned.
  let turn;
  try {
    turn = await codexTurn(args, body, CALL_TIMEOUT_MS, session.breakerKey || 'codex', signal,
      session.codexThreadId ? { pinned: session.codexHome ?? '' } : { preferred: session.codexHome ?? null });
  } catch (error) {
    signal?.throwIfAborted();
    console.error(`[Session] Codex CLI error after ${Date.now() - startTime}ms:`, error.message);
    throw error;
  }
  const duration = Date.now() - startTime;
  const { threadId, text: content, usage: rawUsage, stdout, home } = turn;
  session.codexHome = home || session.codexHome || '';
  session.codexThreadId = threadId || session.codexThreadId;

  const usage = {
    prompt_tokens: rawUsage?.input_tokens || 0,
    completion_tokens: (rawUsage?.output_tokens || 0) + (rawUsage?.reasoning_output_tokens || 0),
    total_tokens: (rawUsage?.input_tokens || 0) + (rawUsage?.output_tokens || 0),
    cached_tokens: rawUsage?.cached_input_tokens || 0,
  };
  if (session._costTracker) session._costTracker.addUsage(session.modelName, usage);
  console.log(`[Session] Codex CLI response in ${duration}ms (tokens: ${usage.total_tokens}, cached: ${usage.cached_tokens}, login "${codexHomeLabel(session.codexHome)}" — $0 marginal)`);

  // Tools mode: a tool_calls reply comes back as toolCalls.
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
 * One agent run with Gary's tools served over MCP (founder, Sep 9 2026). The
 * Codex CLI spawns the local tools server from the -c overrides below and
 * the model calls the tools natively inside one exec; login routing and the
 * breaker lane are the same as every other Codex turn. Returns the final
 * text; what was fetched is in the MCP log the caller named.
 */
export async function codexCliAgentRun({ model = 'codex-gpt-5.6-luna', systemPrompt = '', prompt, mcp, effort = null, timeoutMs = CALL_TIMEOUT_MS, breakerKey = 'codex-research', signal, _costTracker = null }) {
  const level = effort || process.env.GARY_RESEARCH_EFFORT || 'medium';
  const toml = (s) => JSON.stringify(String(s)); // a TOML basic string; paths carry nothing JSON escapes differently
  const args = [
    'exec', '--skip-git-repo-check', '-s', 'read-only', '--json',
    '-m', cliModelOf(model),
    '-c', `model_reasoning_effort="${effortFor(level)}"`,
    '-c', `mcp_servers.gary.command=${toml(process.execPath)}`,
    '-c', `mcp_servers.gary.args=[${toml(mcp.serverPath)}]`,
    '-c', `mcp_servers.gary.env={GARY_MCP_CONTEXT=${toml(mcp.contextPath)},GARY_MCP_LOG=${toml(mcp.logPath)}}`,
    '-',
  ];
  const body = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
  const startTime = Date.now();
  const turn = await codexTurn(args, body, timeoutMs, breakerKey, requestSignal(signal));
  const usage = {
    prompt_tokens: turn.usage?.input_tokens || 0,
    completion_tokens: (turn.usage?.output_tokens || 0) + (turn.usage?.reasoning_output_tokens || 0),
    total_tokens: (turn.usage?.input_tokens || 0) + (turn.usage?.output_tokens || 0),
    cached_tokens: turn.usage?.cached_input_tokens || 0,
  };
  if (_costTracker) _costTracker.addUsage(model, usage);
  console.log(`[Agent Run] codex-cli ${cliModelOf(model)} (${effortFor(level)}, MCP tools) finished in ${Date.now() - startTime}ms (login "${codexHomeLabel(turn.home)}" — $0 marginal)`);
  return { text: turn.finalText || turn.text || '', usage, home: turn.home, raw: turn.stdout };
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
    const { text, finalText, stdout, home } = await codexTurn(args, prompt, options.timeoutMs || 8 * 60 * 1000, 'codex-search', options.signal);
    const clean = String(text || '').trim();
    const problem = searchResponseProblem(finalText);
    if (problem) {
      console.warn(`[Web Search] codex-cli search unusable: ${problem}`);
      return { success: false, data: '', raw: stdout, error: problem };
    }
    console.log(`[Web Search] codex-cli (${model}) returned ${clean.length} chars (login "${codexHomeLabel(home)}" — $0 marginal)`);
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
    const { text, usage, stdout, home } = await codexTurn(args, stdinText, options.timeoutMs || 6 * 60 * 1000, breakerKey, options.signal);
    const clean = String(text || '').trim();
    console.log(`[Codex one-shot] ${breakerKey} (${model}, ${effort}${options.search ? ', search' : ''}) returned ${clean.length} chars (login "${codexHomeLabel(home)}" — $0 marginal)`);
    return { success: clean.length > 0, data: clean, raw: stdout, usage: usage || null };
  } catch (e) {
    requestSignal(options.signal)?.throwIfAborted();
    console.warn(`[Codex one-shot] ${breakerKey} failed: ${e.message}`);
    return { success: false, data: '', raw: null, error: e.message };
  }
}

export default { isCodexCliModel, createCodexCliSession, sendToCodexCliSession, resetCodexCliSessionChat, codexCliWebSearch, codexCliOneShot, codexCliAgentRun };
