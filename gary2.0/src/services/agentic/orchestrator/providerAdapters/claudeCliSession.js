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
 * All tools are disallowed for brain calls — the desk is the entire evidence,
 * exactly like the API brains. claudeCliWebSearch() is the one exception:
 * WebSearch-only, for the desk's WORLD grounding.
 *
 * Failure mapping: a usage-cap / rate-limit refusal from the CLI sets
 * isQuotaError so the desk cascade escalates to the Gemini fallbacks —
 * a capped subscription degrades to pennies, never to a dark slate.
 */
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { isCliTripped, recordCliTimeout, recordCliSuccess, trippedError } from './cliCircuitBreaker.js';

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
const effortFor = (modelName, thinkingLevel) => {
  if (String(modelName).includes('sonnet')) return 'max';
  // Fable at its ceiling (founder, Aug 10 night: "Fable in Max so that way
  // we can fully rule out the model" — data/context now complete, so a miss
  // can't hide behind the desk or the effort dial).
  if (String(modelName).includes('fable')) return 'max';
  return CLI_EFFORT_LEVELS.has(thinkingLevel) ? thinkingLevel : 'xhigh';
};

export function isClaudeCliModel(modelName) {
  return typeof modelName === 'string' && modelName.startsWith('claude');
}

function runClaude(args, stdinText, timeoutMs = CALL_TIMEOUT_MS) {
  // A bridge that has already timed out repeatedly this run is not asked again.
  if (isCliTripped('claude')) return Promise.reject(trippedError('claude'));
  return new Promise((resolve, reject) => {
    // The claude CLI prefers ANTHROPIC_API_KEY over the founder's subscription
    // login when the env var is present. The key entered .env on Aug 18 for the
    // June-engine researcher (which reads process.env in-process) — every CLI
    // child MUST NOT see it, or the $0 sub bridge silently bills the API key
    // (caught Aug 18: props desk burned real credits all evening).
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const proc = spawn(CLAUDE_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'], cwd: neutralCwd(), env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      recordCliTimeout('claude');
      reject(new Error(`claude CLI timed out after ${Math.round(timeoutMs / 60000)}m`));
    }, timeoutMs);
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (e) => { clearTimeout(timer); recordCliSuccess('claude'); reject(e); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      // Any answer at all — even a non-zero exit — means the bridge is alive.
      recordCliSuccess('claude');
      resolve({ code, stdout, stderr });
    });
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
    modelName = 'claude-fable-5',
    systemPrompt = '',
    thinkingLevel = 'high', // informational only — Fable's thinking is always on
    _costTracker = null,
  } = options;
  console.log(`[Session] Created ${modelName} session via Claude Code CLI adapter (subscription bridge, tools: 0)`);
  return {
    provider: 'claude-cli',
    modelName,
    thinkingLevel,
    _systemPrompt: systemPrompt,
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

export async function sendToClaudeCliSession(session, message, _options = {}) {
  const startTime = Date.now();
  const text = typeof message === 'string' ? message : JSON.stringify(message);
  const body = session._seedText ? `${session._seedText}\n\n${text}` : text;
  session._seedText = null;

  const args = ['-p', '--model', session.modelName, '--effort', effortFor(session.modelName, session.thinkingLevel), '--output-format', 'json', '--disallowedTools', BRAIN_DISALLOWED_TOOLS];
  if (session.claudeSessionId) {
    args.push('--resume', session.claudeSessionId);
  } else if (session._systemPrompt) {
    args.push('--append-system-prompt', session._systemPrompt);
  }

  const { code, stdout, stderr } = await runClaude(args, body);
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

  session.claudeSessionId = data.session_id || session.claudeSessionId;

  const usage = {
    prompt_tokens: data.usage?.input_tokens || 0,
    completion_tokens: data.usage?.output_tokens || 0,
    total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    cached_tokens: data.usage?.cache_read_input_tokens || 0,
  };
  if (session._costTracker) session._costTracker.addUsage(session.modelName, usage);
  console.log(`[Session] Claude CLI response in ${duration}ms (tokens: ${usage.total_tokens}, cached: ${usage.cached_tokens}, subscription — $0 marginal)`);

  return {
    content: typeof data.result === 'string' ? data.result : '',
    toolCalls: null, // brain calls run tool-less by construction
    finishReason: 'stop',
    usage,
    raw: data,
  };
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
    const { code, stdout, stderr } = await runClaude(args, prompt, options.timeoutMs || 5 * 60 * 1000);
    if (code !== 0) throw toError(code, stdout, stderr);
    const data = JSON.parse(stdout);
    if (data.is_error) throw toError(code, data.result || stdout, stderr);
    const text = typeof data.result === 'string' ? data.result.trim() : '';
    console.log(`[Web Search] claude-cli (${model}) returned ${text.length} chars (subscription)`);
    return { success: text.length > 0, data: text, raw: data };
  } catch (e) {
    console.warn(`[Web Search] claude-cli failed: ${e.message}`);
    return { success: false, data: '', raw: null, error: e.message };
  }
}

export default { isClaudeCliModel, createClaudeCliSession, sendToClaudeCliSession, resetClaudeCliSessionChat, claudeCliWebSearch };
