/**
 * Claude Code CLI adapter — the subscription bridge (founder GO, Jul 29 2026).
 *
 * Runs desk-brain calls through headless `claude -p` on the founder's own
 * Claude subscription instead of a metered API — the stopgap while API
 * balances are paused. Same normalized session contract the OpenAI and
 * Gemini adapters speak ({ content, toolCalls, finishReason, usage }), so
 * sessionManager routes `claude-*` model names here and nothing upstream
 * changes.
 *
 * Mechanics: prompt rides STDIN (a ~100KB desk would blow past comfort on
 * argv), `--output-format json` gives { result, session_id, usage }, and the
 * rails' corrective retry continues the SAME conversation via `--resume`.
 * The CLI's own tools (shell, files, web) stay disallowed on every brain and
 * research call. Gary's tools ride the text instead (founder, Sep 9 2026:
 * "full research assistant, full Gary with tools on the bridge, just like the
 * June system"): a session created WITH tools carries the catalog as the JSON
 * call protocol shared with the Codex bridge (cliToolProtocol.js), a
 * {"tool_calls":[…]} reply comes back as toolCalls, and the caller's function
 * responses go back on the same conversation as one TOOL RESULTS turn.
 * claudeCliWebSearch() is the one CLI-tool exception: WebSearch-only, for the
 * desk's WORLD grounding.
 *
 * Failure mapping: a usage-cap / rate-limit refusal from the CLI sets
 * isQuotaError so the desk cascade escalates to the Gemini fallbacks —
 * a capped subscription degrades to pennies, never to a dark slate.
 */
import { spawn } from 'child_process';
import { requestSignal, abortError } from '../requestCancellation.js';
import { registerOwnedProcessGroup } from './ownedProcessGroups.js';
import { mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { isCliTripped, recordCliTimeout, recordCliSuccess, trippedError } from './cliCircuitBreaker.js';
import { renderCliToolProtocol, formatCliFunctionResponses, parseCliToolCalls } from './cliToolProtocol.js';

// NEUTRAL GROUND (Aug 12 2026 — the Baz press-refusal autopsy): headless
// `claude -p` auto-loads the project memory (CLAUDE.md, memory index) of its
// working directory. Launched from this repo, every bridge call — including
// the PICK BRAIN — silently carried Gary's own project docs and ledger notes
// as context: an accidental steering channel the no-steering law exists to
// forbid, and the trigger for grounding calls refusing legitimate press asks
// as "prompt injection." Every spawn now runs from an empty temp directory:
// the stdin prompt and the desk are the ENTIRE context, as designed.
const NEUTRAL_CWD = join(tmpdir(), 'gary-claude-neutral');
let neutralReady = false;
function neutralCwd() {
  if (!neutralReady) {
    try { mkdirSync(NEUTRAL_CWD, { recursive: true }); neutralReady = true; } catch { return tmpdir(); }
  }
  return NEUTRAL_CWD;
}

const CLAUDE_BIN = process.env.CLAUDE_CLI_PATH || 'claude';
// Measured Aug 25 2026 over 2,596 logged CLI responses: median 2.3m, p90 5.8m,
// p99 9.2m, max 14.6m. Ten minutes sits just above p99, so real desk turns
// still finish while a hung bridge is abandoned a third sooner. Cutting to the
// p90 would strand roughly one call in ten. Override per-run if a lane needs
// more; the circuit breaker below is what actually bounds a bad night.
const CALL_TIMEOUT_MS = Number(process.env.GARY_CLI_TIMEOUT_MS) || 10 * 60 * 1000;
const BRAIN_DISALLOWED_TOOLS = 'Task,Bash,Glob,Grep,Read,Edit,Write,MultiEdit,NotebookEdit,WebFetch,WebSearch,TodoWrite,WebSearchTool';

// Effort is PINNED per call — headless `claude -p` otherwise inherits the
// founder's interactive default (settings effortLevel), which drifts with his
// /effort usage (caught Jul 29: bridge picks silently ran at "medium").
// Founder policy: Fable brains at xhigh (the Sol-era bar); Sonnet lanes at
// max ("sonnet is the one — but then we need max reasoning") — its separate
// weekly bucket makes the extra depth free.
const CLI_EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const effortFor = (modelName, thinkingLevel, { research = false, researchEffort = null } = {}) => {
  // The research assistant's factor turns run at the level the researcher
  // asks for (high): eight factors, two or three turns each, inside one
  // 20-minute budget. The pins below are the brain's bar.
  if (research) {
    const level = researchEffort || process.env.GARY_RESEARCH_EFFORT || 'medium';
    return CLI_EFFORT_LEVELS.has(level) ? level : 'medium';
  }
  if (String(modelName).includes('sonnet')) return 'max';
  // Fable 5.1 at xhigh (founder, Sep 9 2026: "fallback to Claude Bridge
  // Fable 5.1 on XHigh"). The Aug 10 "Fable in Max" pin was a diagnostic for
  // ruling out Fable 5 while the desk was still being built; the cascade
  // rung runs at the Sol-era bar.
  if (String(modelName).includes('fable')) return 'xhigh';
  return CLI_EFFORT_LEVELS.has(thinkingLevel) ? thinkingLevel : 'xhigh';
};

export function isClaudeCliModel(modelName) {
  return typeof modelName === 'string' && modelName.startsWith('claude');
}

function runClaude(args, stdinText, timeoutMs = CALL_TIMEOUT_MS, breakerKey = 'claude', explicitSignal) {
  const signal = requestSignal(explicitSignal);
  signal?.throwIfAborted();
  if (isCliTripped(breakerKey)) return Promise.reject(trippedError(breakerKey));
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const processGroup = process.platform !== 'win32';
    const proc = spawn(CLAUDE_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'], cwd: neutralCwd(), env, detached: processGroup });
    const releaseGroup = processGroup ? registerOwnedProcessGroup(proc.pid) : () => {};
    let stdout = '', stderr = '', settled = false, timer;
    const kill = (kind) => {
      if (!proc.pid) return;
      try { if (processGroup) process.kill(-proc.pid, kind); else proc.kill(kind); }
      catch (error) { if (error.code !== 'ESRCH') console.warn(`[Claude CLI] Could not terminate request: ${error.message}`); }
    };
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
    const fail = (error, terminate = false, timedOut = false) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (timedOut) recordCliTimeout(breakerKey);
      if (terminate) {
        kill('SIGTERM');
        setTimeout(() => { kill('SIGKILL'); releaseGroup(); }, 1000).unref();
      } else releaseGroup();
      reject(error);
    };
    const onAbort = () => fail(signal.reason || abortError('Claude request cancelled'), true);
    timer = setTimeout(() => fail(new Error(`claude CLI timed out after ${Math.round(timeoutMs / 60000)}m`), true, true), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', e => fail(e));
    proc.stdin.on('error', e => fail(e, true));
    proc.on('close', code => {
      if (settled) return;
      settled = true;
      cleanup();
      releaseGroup();
      recordCliSuccess(breakerKey);
      resolve({ code, stdout, stderr });
    });
    if (signal?.aborted) { onAbort(); return; }
    proc.stdin.write(stdinText);
    proc.stdin.end();
  });
}

const CAP_PATTERNS = /usage limit|weekly limit|hit your.*limit|rate limit|out of.*(usage|credits)|limit reached|too many requests|\b429\b/i;
// 529/5xx "Overloaded" is Anthropic saying its SERVERS are momentarily busy —
// a transient state, not a subscription cap. It used to live in CAP_PATTERNS,
// so one 529 read as "quota exhausted" and the cascade permanently handed the
// game to a fallback brain (Aug 12 2026: the debut's first pick). The brain
// retries the same model on isOverloaded before surrendering.
const OVERLOAD_PATTERNS = /overloaded|\b(?:529|503|502)\b|server-side issue/i;

function toError(code, stdout, stderr) {
  // On quota failures the CLI exits non-zero but writes a JSON result whose
  // useful message (for example "weekly limit") is near the END. Truncating
  // the raw JSON first hid that message, so the provider cascade never knew
  // it should fail over. Pull the structured result out before truncation.
  let detail = stderr || stdout || '';
  try {
    const parsed = JSON.parse(String(stdout || ''));
    if (parsed?.result) {
      detail = `${parsed.result}${parsed.api_error_status ? ` (HTTP ${parsed.api_error_status})` : ''}`;
    }
  } catch {
    // Plain-text CLI failures keep their original stderr/stdout detail.
  }
  detail = String(detail).slice(0, 500);
  const error = new Error(`claude CLI exit ${code}: ${detail}`);
  // Overload wins the tie: "529 Overloaded" must never read as a cap.
  if (OVERLOAD_PATTERNS.test(detail)) error.isOverloaded = true;
  else if (CAP_PATTERNS.test(detail)) error.isQuotaError = true;
  return error;
}

export async function createClaudeCliSession(options = {}) {
  const {
    modelName = 'claude-fable-5-1',
    systemPrompt = '',
    thinkingLevel = 'high', // the brain's effort is pinned per model; research honors this
    _costTracker = null,
    tools = null,
    browse = false,
  } = options;
  const toolList = Array.isArray(tools) && tools.length ? tools : null;
  const breakerKey = options.breakerLane === 'research' ? 'claude-research' : 'claude';
  console.log(`[Session] Created ${modelName} session via Claude Code CLI adapter (subscription bridge, tools: ${toolList ? toolList.length : 0}, lane: ${breakerKey}${browse ? ', web: reading' : ''})`);
  return {
    provider: 'claude-cli',
    modelName,
    thinkingLevel,
    researchEffort: options.researchEffort || null,
    signal: requestSignal(options.signal),
    breakerKey,
    // GARY READS THE WEB (founder, Sep 9 2026: "I trust Gary to go to the
    // internet and do some research and reading"): the CLI's own WebSearch and
    // WebFetch stay open on this session; everything else of the CLI's stays shut.
    browse: Boolean(browse),
    // Tools mode: the catalog rides with the system prompt on turn one.
    _systemPrompt: toolList ? `${systemPrompt}\n\n${renderCliToolProtocol(toolList)}` : systemPrompt,
    tools: toolList,
    claudeSessionId: null, // set after the first send; --resume continues it
    _costTracker,
  };
}

export function resetClaudeCliSessionChat(session, seedHistory = []) {
  session.claudeSessionId = null; // fresh-context retry: next send starts a new conversation
  const seedText = (seedHistory || [])
    .flatMap((h) => (h?.parts || []).map((p) => p.text).filter(Boolean))
    .join('\n\n');
  session._seedText = seedText || null;
  return session;
}

export async function sendToClaudeCliSession(session, message, options = {}) {
  const signal = requestSignal(options.signal, session.signal);
  signal?.throwIfAborted();
  const startTime = Date.now();
  const research = session.breakerKey === 'claude-research';
  // Tools mode: the caller's function responses ride as one TOOL RESULTS turn.
  const text = (session.tools && options.isFunctionResponse && Array.isArray(message))
    ? formatCliFunctionResponses(message)
    : (typeof message === 'string' ? message : JSON.stringify(message));
  let body = session._seedText ? `${session._seedText}\n\n${text}` : text;

  const disallowed = session.browse
    ? BRAIN_DISALLOWED_TOOLS.split(',').filter((t) => !['WebSearch', 'WebFetch', 'WebSearchTool'].includes(t)).join(',')
    : BRAIN_DISALLOWED_TOOLS;
  const args = ['-p', '--model', session.modelName, '--effort', effortFor(session.modelName, session.thinkingLevel, { research, researchEffort: session.researchEffort }), '--output-format', 'json', '--disallowedTools', disallowed];
  if (session.claudeSessionId) {
    args.push('--resume', session.claudeSessionId);
  } else if (session._systemPrompt && research) {
    // A research session's contract carries the whole scout report — far too
    // long for argv. It rides stdin as the preamble of turn one, as on Codex.
    body = `${session._systemPrompt}\n\n${body}`;
  } else if (session._systemPrompt) {
    args.push('--append-system-prompt', session._systemPrompt);
  }
  if (session.browse) args.push('--allowedTools', 'WebSearch', 'WebFetch');

  const { code, stdout, stderr } = await runClaude(args, body, CALL_TIMEOUT_MS, session.breakerKey || 'claude', signal);
  const duration = Date.now() - startTime;
  if (code !== 0) {
    const error = toError(code, stdout, stderr);
    console.error(`[Session] Claude CLI error after ${duration}ms:`, error.message);
    throw error;
  }

  let data;
  try {
    data = JSON.parse(stdout);
  } catch {
    // Some CLI failure modes print plain text on exit 0 — treat as provider error.
    throw toError(code, stdout, stderr);
  }
  if (data.is_error) throw toError(code, data.result || stdout, stderr);

  session._seedText = null;
  session.claudeSessionId = data.session_id || session.claudeSessionId;

  const usage = {
    prompt_tokens: data.usage?.input_tokens || 0,
    completion_tokens: data.usage?.output_tokens || 0,
    total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    cached_tokens: data.usage?.cache_read_input_tokens || 0,
  };
  if (session._costTracker) session._costTracker.addUsage(session.modelName, usage);
  console.log(`[Session] Claude CLI response in ${duration}ms (tokens: ${usage.total_tokens}, cached: ${usage.cached_tokens}, subscription — $0 marginal)`);

  // Tools mode: a tool_calls reply comes back as toolCalls.
  const content = typeof data.result === 'string' ? data.result : '';
  const toolCalls = session.tools ? parseCliToolCalls(content, { idPrefix: 'claude_call' }) : null;
  return {
    content: toolCalls ? null : content,
    transcriptText: content,
    toolCalls,
    finishReason: toolCalls ? 'tool_calls' : 'stop',
    usage,
    raw: data,
  };
}

/**
 * One agent run with Gary's tools served over MCP (founder, Sep 9 2026: "do
 * the MCP upgrade ASAP"). The CLI spawns the local tools server, the model
 * calls fetch_stats and friends with its own native tool calling, and the
 * whole loop runs inside ONE process — no JSON-in-text protocol, no spawn per
 * tool turn. The contract rides stdin (a research contract carries the
 * whole scout report). Returns the final text; what was fetched is in the
 * MCP log the caller named.
 */
export async function claudeCliAgentRun({ model = 'claude-sonnet-5', systemPrompt = '', prompt, mcp, effort = null, timeoutMs = CALL_TIMEOUT_MS, breakerKey = 'claude-research', maxTurns = 30, _costTracker = null }) {
  const level = effort || process.env.GARY_RESEARCH_EFFORT || 'medium';
  const cfgPath = join(neutralCwd(), `mcp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  writeFileSync(cfgPath, JSON.stringify({ mcpServers: { gary: { command: process.execPath, args: [mcp.serverPath], env: { GARY_MCP_CONTEXT: mcp.contextPath, GARY_MCP_LOG: mcp.logPath } } } }));
  const allowed = (mcp.tools || []).map((t) => `mcp__gary__${t}`);
  const args = ['-p', '--model', model, '--effort', CLI_EFFORT_LEVELS.has(level) ? level : 'medium', '--output-format', 'json',
    '--mcp-config', cfgPath, '--strict-mcp-config', '--max-turns', String(maxTurns),
    '--allowedTools', ...allowed, '--disallowedTools', BRAIN_DISALLOWED_TOOLS];
  const body = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
  const startTime = Date.now();
  try {
    const { code, stdout, stderr } = await runClaude(args, body, timeoutMs, breakerKey);
    if (code !== 0) throw toError(code, stdout, stderr);
    let data;
    try { data = JSON.parse(stdout); } catch { throw toError(code, stdout, stderr); }
    if (data.is_error) throw toError(code, data.result || stdout, stderr);
    const usage = {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      cached_tokens: data.usage?.cache_read_input_tokens || 0,
    };
    if (_costTracker) _costTracker.addUsage(model, usage);
    console.log(`[Agent Run] claude-cli ${model} (${level}, MCP tools: ${allowed.length}) finished in ${Date.now() - startTime}ms — ${data.num_turns ?? '?'} turns (subscription — $0 marginal)`);
    return { text: typeof data.result === 'string' ? data.result : '', usage, turns: data.num_turns ?? null, raw: data };
  } finally {
    try { unlinkSync(cfgPath); } catch { /* best effort */ }
  }
}

/**
 * One one-word turn to learn whether this model answers right now (the
 * brain preflight, Sep 9 2026). A capped subscription refuses instantly and
 * free; its own breaker lane so a ping never counts against the brain.
 */
export async function claudeCliPing(model = 'claude-fable-5-1', { timeoutMs = 60 * 1000 } = {}) {
  try {
    const args = ['-p', '--model', model, '--effort', 'low', '--output-format', 'json', '--disallowedTools', BRAIN_DISALLOWED_TOOLS];
    const { code, stdout, stderr } = await runClaude(args, 'Reply with the single word OK.', timeoutMs, 'claude-preflight');
    if (code !== 0) throw toError(code, stdout, stderr);
    const data = JSON.parse(stdout);
    if (data.is_error) throw toError(code, data.result || stdout, stderr);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message, isQuotaError: Boolean(e.isQuotaError) };
  }
}

/**
 * Grounded web search on the subscription — WebSearch tool only, nothing else.
 * Same return contract as openaiWebSearch/groundedWebSearch:
 * { success, data, raw }. Defaults to Sonnet (its own weekly bucket) so news
 * lookups don't eat the all-models cap the Fable brains draw from.
 */
export async function claudeCliWebSearch(prompt, options = {}) {
  const model = options.model || process.env.GARY_GROUNDING_CLAUDE_MODEL || 'claude-sonnet-5';
  try {
    // Grounding runs at high, not max — retrieval quality is search-bound,
    // and max-depth thinking on every news lookup just risks the timeout.
    const args = ['-p', '--model', model, '--effort', 'high', '--output-format', 'json', '--allowedTools', 'WebSearch'];
    // Its own breaker lane (Sep 9 2026): two slow press searches tripped the
    // shared 'claude' breaker and disabled the BRAIN for the rest of the NFL
    // rehearsal. A search lane's timeouts are never evidence about the pick.
    const { code, stdout, stderr } = await runClaude(args, prompt, options.timeoutMs || 5 * 60 * 1000, 'claude-search', options.signal);
    if (code !== 0) throw toError(code, stdout, stderr);
    const data = JSON.parse(stdout);
    if (data.is_error) throw toError(code, data.result || stdout, stderr);
    const text = typeof data.result === 'string' ? data.result.trim() : '';
    console.log(`[Web Search] claude-cli (${model}) returned ${text.length} chars (subscription)`);
    return { success: text.length > 0, data: text, raw: data };
  } catch (e) {
    requestSignal(options.signal)?.throwIfAborted();
    console.warn(`[Web Search] claude-cli failed: ${e.message}`);
    return { success: false, data: '', raw: null, error: e.message };
  }
}

export default { isClaudeCliModel, createClaudeCliSession, sendToClaudeCliSession, resetClaudeCliSessionChat, claudeCliWebSearch, claudeCliAgentRun };
