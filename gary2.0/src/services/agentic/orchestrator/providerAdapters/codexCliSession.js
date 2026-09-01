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
 */
import { spawn } from 'child_process';
import { isCliTripped, recordCliTimeout, recordCliSuccess, trippedError } from './cliCircuitBreaker.js';

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

function runCodex(args, stdinText, timeoutMs = CALL_TIMEOUT_MS) {
  // A bridge that has already timed out repeatedly this run is not asked again.
  if (isCliTripped('codex')) return Promise.reject(trippedError('codex'));
  return new Promise((resolve, reject) => {
    const proc = spawn(CODEX_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      recordCliTimeout('codex');
      reject(new Error(`codex CLI timed out after ${Math.round(timeoutMs / 60000)}m`));
    }, timeoutMs);
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (e) => { clearTimeout(timer); recordCliSuccess('codex'); reject(e); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      // Any answer at all — even a non-zero exit — means the bridge is alive.
      recordCliSuccess('codex');
      resolve({ code, stdout, stderr });
    });
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
  } = options;
  console.log(`[Session] Created ${modelName} session via Codex CLI adapter (GPT Pro bridge, tools: 0)`);
  return {
    provider: 'codex-cli',
    modelName,
    thinkingLevel,
    _systemPrompt: systemPrompt,
    codexThreadId: null, // set after the first send; `exec resume` continues it
    _costTracker,
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

export async function sendToCodexCliSession(session, message, _options = {}) {
  const startTime = Date.now();
  const text = typeof message === 'string' ? message : JSON.stringify(message);
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

  const { code, stdout, stderr } = await runCodex(args, body);
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

  return {
    content,
    toolCalls: null, // brain calls run tool-less by construction
    finishReason: 'stop',
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
    const { code, stdout, stderr } = await runCodex(args, prompt, options.timeoutMs || 5 * 60 * 1000);
    if (code !== 0) throw toError(stderr || stdout);
    const { text } = parseEvents(stdout);
    const clean = String(text || '').trim();
    console.log(`[Web Search] codex-cli (${model}) returned ${clean.length} chars (GPT Pro — $0 marginal)`);
    return { success: clean.length > 0, data: clean, raw: stdout };
  } catch (e) {
    console.warn(`[Web Search] codex-cli search failed: ${e.message}`);
    return { success: false, data: '', raw: null, error: e.message };
  }
}

export default { isCodexCliModel, createCodexCliSession, sendToCodexCliSession, resetCodexCliSessionChat, codexCliWebSearch };
