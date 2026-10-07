import { subscriptionSearch } from '../../orchestrator/subscriptionSearch.js';
import { codexCliWebSearch } from '../../orchestrator/providerAdapters/codexCliSession.js';
import { claudeCliWebSearch } from '../../orchestrator/providerAdapters/claudeCliSession.js';
import { takeMeteredSearch } from './meteredSearchBudget.js';

// CODEX FIRST (founder GO, Sep 1 2026): every football search lane — current
// state, recent coverage, and all six deep-read lanes — tries the $0 GPT Pro
// codex bridge first, under the SAME prompt and the SAME validation floor,
// and falls through to the metered Anthropic server search only on a miss.
// Measured live before wiring: one deep-read lane on codex = 83s / 6,025
// chars / both teams named (vs ~20s on Anthropic) — slower, free, and the
// desk builds are tier-staggered, so the gate below carries the load.
const CODEX_FIRST = process.env.GARY_FOOTBALL_SEARCH_CODEX_FIRST !== '0';
const CODEX_TIMEOUT_MS = Number(process.env.FOOTBALL_CODEX_SEARCH_TIMEOUT_MS) || 150_000;

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5';
const DEFAULT_TIMEOUT_MS = 360_000;
const MAX_PAUSE_CONTINUATIONS = 2;

function apiModelId(value) {
  const model = String(value || DEFAULT_MODEL).trim();
  return model.startsWith('anthropic-') ? model.slice('anthropic-'.length) : model;
}

function etDate(value, options) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    ...options,
  }).format(value);
}

function buildPrompt({ homeTeam, awayTeam, sport, gameDate, now }) {
  const isNcaaf = sport === 'NCAAF' || sport === 'americanfootball_ncaaf';
  const league = isNcaaf ? 'college football' : 'NFL';
  const systemDate = etDate(now, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const fallbackGameDate = etDate(now, { month: 'long', day: 'numeric', year: 'numeric' });
  const targetGameDate = String(gameDate || fallbackGameDate);
  const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
  const recentWindow = `${etDate(sevenDaysAgo, { month: 'long', day: 'numeric' })} through ${etDate(now, { month: 'long', day: 'numeric', year: 'numeric' })}`;

  return `Today (US Eastern time) is ${systemDate}.
Target game date: ${targetGameDate}.
These dates are distinct. If the target date is later than today, call it an upcoming game, never "tonight."

Use live web search to produce a factual current-state report for ${awayTeam} at ${homeTeam} in ${league}. Search both teams independently and the matchup. The team-news window is ${recentWindow}; prioritize items published in the last 48 hours for breaking or game-day plans, and preserve publication dates/source timing.

Apply exactly the same categories and evidence standard to BOTH ${homeTeam} and ${awayTeam}:
- recent completed-game trajectory and last-game context;
- current roster moves, role changes, coach statements, and verified playing-time plans;
- the phase of this game (preseason, regular season, postseason${isNcaaf ? ', bowl, or CFP' : ''});
- for preseason, distinguish verified starter-phase plans from verified reserve-phase plans. Do not project either phase across four quarters;
- matchup context and what is at stake;
- weather only if severe: sustained wind of at least 25 mph, temperature below 15°F, blizzard conditions, or heavy rain. Omit ordinary weather and indoor games.

BOUNDARIES:
- Do not report injuries or injury statuses; a separate official injury feed handles those.
- Do not include odds, spreads, moneylines, totals, ATS records, cover trends, betting trends, pick articles, expert picks, projections, leans, winner selections, or betting recommendations.
- Do not use internal-memory facts to fill gaps. Use only facts supported by this request's live searches.
- Do not turn missing information or uncertainty into support for either team.
- Write separate clearly labeled sections for ${homeTeam}, ${awayTeam}, and matchup context. Do not choose a side.`;
}

function searchResultStatus(blocks) {
  let successfulSearches = 0;
  const errors = [];
  for (const block of blocks || []) {
    if (block?.type !== 'web_search_tool_result') continue;
    if (Array.isArray(block.content)) {
      if (block.content.some((item) => item?.type === 'web_search_result')) {
        successfulSearches += 1;
      }
    } else if (block.content?.type === 'web_search_tool_result_error') {
      errors.push(block.content.error_code || 'unknown_search_error');
    }
  }
  return { successfulSearches, errors };
}

/**
 * Server-side web search narrates itself — "I'll search for…", "Let me search
 * for…", "Perfect. Now I have all the information I need." That is the model
 * talking about its own process, not reporting, and it reached the desk as if
 * it were content. Cut everything before the first real section heading.
 */
export function stripSearchNarration(text) {
  const str = String(text || '');
  // The first markdown heading or a bare TEAM NAME line is where reporting starts.
  const heading = str.search(/^\s*(#{1,4}\s+\S|\*\*[A-Z])/m);
  if (heading > 0) return str.slice(heading).trim();
  // No heading: drop leading first-person process lines.
  return str
    .split(/\n\n+/)
    .filter((para) => !/^\s*(I'll |I will |Let me |Now I |I can see|I found|I need to|Perfect[.,]|Good[—-]|Let's )/i.test(para))
    .join('\n\n')
    .trim();
}

export function scrubFootballGroundingText(text) {
  const bettingLine = /^[^\n]*(?:\bATS\b|against the spread|cover(?:s|ed|ing)?\s+(?:the\s+)?spread|betting\s+trend|public\s+betting|expert\s+pick|our\s+pick|best\s+bet|moneyline|\bspread\b|\btotal\b|\bover\/under\b|\blean\b)[^\n]*$/gim;
  return String(text || '')
    .replace(bettingLine, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Football-only current-state recovery using Anthropic's server-side web
 * search. Returns null on any contained provider/validation failure.
 */
/**
 * One Anthropic web-search turn, shared by every football grounding pass.
 *
 * Extracted Aug 25 2026 when the recent-games coverage pass was added. Copying
 * this loop for the second caller would have created exactly the fork that
 * rots — the pause_turn continuation contract, the "no successful search"
 * guard and the validation floor all have to stay identical, and a duplicate
 * only ever gets fixed on one side.
 */


/**
 * A GLOBAL CEILING ON IN-FLIGHT SEARCHES (Aug 26 2026).
 *
 * (The deep read this was written for was removed on Oct 7 2026, when football's
 * press moved to the article readers that print each article whole; the gate now
 * covers the current-state search. The arithmetic below is its history.)
 *
 * The deep read fans one game out into six lanes, and the NCAAF scheduler
 * runs up to twelve games concurrently — so a Saturday could put SEVENTY-TWO
 * web searches in flight at once against an endpoint with no limiter on this
 * path at all. The BDL 429 work does not cover it; that is a different client.
 *
 * Worse than the storm is how it would have read. A 429 returned null, and a
 * null lane rendered as "No coverage found for this lane" — rate-limited
 * presented as nothing-was-written, across a whole slate, with every log line
 * green. That is the exact silent-blank failure this audit exists to remove,
 * introduced by the fan-out itself.
 *
 * The gate is global rather than per-game because the pressure is global.
 *
 * THE MEASURED ARITHMETIC, so the trade-off is visible rather than implied.
 * A lane is ONE gated API call that internally spends up to six searches, and
 * a lane takes ~20s. The biggest 2025 college Saturday carried 114 games:
 *
 *     114 games x 6 lanes = 684 gated calls
 *     684 / 6 concurrent x 20s  =  ~38 minutes for the whole slate
 *
 * That is the deep read's total contribution to an NCAAF Saturday, spread
 * across the twelve game workers rather than added to each. Raising the gate
 * shortens it linearly and raises 429 exposure linearly; FOOTBALL_SEARCH_
 * CONCURRENCY exists so that is a config change, not a code change. NFL runs
 * at most three games at once, so it never approaches the ceiling.
 */
// Default raised 6 → 10 on Sep 1 2026: the gate now mostly meters codex lanes
// (~83s each) rather than ~20s Anthropic calls, and Anthropic — the 429 the
// ceiling protected against — is the rare fallback rung.
const MAX_CONCURRENT_SEARCHES = Number(process.env.FOOTBALL_SEARCH_CONCURRENCY) || 10;
const RATE_LIMIT_RETRIES = 3;

let activeSearches = 0;
const searchQueue = [];

function acquireSearchSlot() {
  if (activeSearches < MAX_CONCURRENT_SEARCHES) {
    activeSearches += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => searchQueue.push(resolve));
}

function releaseSearchSlot() {
  const next = searchQueue.shift();
  if (next) next();
  else activeSearches = Math.max(0, activeSearches - 1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Honour Retry-After when the server sends it; back off exponentially if not. */
function retryDelayMs(response, attempt) {
  const header = Number(response?.headers?.get?.('retry-after'));
  // RFC 7231 allows a retry-after of 0, meaning retry now — a `> 0` guard
  // silently ignored the server's own instruction and backed off anyway.
  // A small floor keeps that from becoming a hot loop.
  if (Number.isFinite(header) && header >= 0) {
    return Math.min(Math.max(header * 1000, 250), 30_000);
  }
  return Math.min(1000 * (2 ** attempt), 30_000);
}

/**
 * Does this writing refer to that team?
 *
 * Requiring the literal full name is wrong and it silently threw away good
 * coverage: press accounts say "the Lions", not "the Detroit Lions", so a
 * 3,198-character head-to-head report on exactly the right game was discarded
 * as off-topic. The validation exists to catch a lane that answered about
 * something else, not to enforce a house style on beat writers.
 *
 * A team counts as named if the text carries its full name, its nickname, or
 * its city/school. Short fragments are ignored so "New York" cannot be matched
 * by "new" and a two-letter school cannot match at random.
 */
export function mentionsTeam(lowerText, teamName) {
  const full = String(teamName || '').toLowerCase().trim();
  if (!full) return true;
  if (lowerText.includes(full)) return true;
  const words = full.split(/\s+/);
  if (words.length < 2) return false;
  const nickname = words[words.length - 1];
  const place = words.slice(0, -1).join(' ');
  return (nickname.length >= 4 && lowerText.includes(nickname))
    || (place.length >= 4 && lowerText.includes(place));
}

/**
 * A draft that is the model declining is not reporting. Seen live Sep 2 2026
 * on a Week-1 desk built eight days out: "I apologize, but I cannot provide
 * the coverage you've requested…" and "## FINDINGS — I cannot provide the
 * analysis…" named both teams, cleared the length floor, and were printed
 * on the desk as THE SKILL PLAYERS and THE DEFENSES. An empty lane is an
 * absent module, never a placeholder — and never an apology.
 */
// Sep 9 2026: a lane pasted "UNABLE TO FULFILL REQUEST — the request cannot be
// completed as specified" into THE DEFENSES on the first regular-season desk;
// the headline forms join the first-person ones.
const REFUSAL = /\b(?:I apologi[sz]e|I(?:'m| am) (?:sorry|unable to)|I can(?:not|'t) (?:provide|fulfil|fulfill|complete|find)|I(?:'d| would) be happy to (?:provide|help)|Let me search|unable to (?:fulfil|fulfill|complete) (?:the |this |your )?request|(?:request|task) cannot be (?:completed|fulfilled)|to fulfill this request,? I would need)\b/i;
export function isSearchRefusal(text) {
  return REFUSAL.test(String(text || ''));
}

/** The one validation floor every provider's draft must clear. */
function validateNarrative(rawText, { mustMention, minChars }) {
  const cleaned = scrubFootballGroundingText(stripSearchNarration(rawText));
  if (isSearchRefusal(cleaned)) {
    return { ok: false, cleaned, missing: [], reason: 'the search answered with a refusal instead of coverage' };
  }
  const lower = cleaned.toLowerCase();
  const missing = mustMention.filter((name) => !mentionsTeam(lower, name));
  if (cleaned.length < minChars || missing.length > 0) {
    return { ok: false, cleaned, missing };
  }
  return { ok: true, cleaned, missing: [] };
}

async function runFootballSearch({
  timeoutMs, label, prompt,
  mustMention = [], minChars = 200, failures = null,
}) {
  // Existing callers pass no sink and keep the old null-on-failure contract.
  const fail = (reason) => { if (failures) failures.push(reason); return null; };
  let result;
  await acquireSearchSlot();
  try { result = await subscriptionSearch(prompt, { timeoutMs }); } finally { releaseSearchSlot(); }
  if (!result.success) return fail(result.error);
  const checked = validateNarrative(result.data, { mustMention, minChars });
  if (!checked.ok) return fail(`${label}: source narrative failed validation; missing ${checked.missing.join(', ')}`);
  return { data: checked.cleaned, provider: result.transport, searchCount: null };
}

export async function fetchAnthropicFootballCurrentState({
  homeTeam,
  awayTeam,
  sport,
  gameDate,
  now = new Date(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  return runFootballSearch({
    timeoutMs,
    label: 'Football Grounding',
    prompt: buildPrompt({ homeTeam, awayTeam, sport, gameDate, now }),
    mustMention: [homeTeam, awayTeam],
  });
}

export default fetchAnthropicFootballCurrentState;
