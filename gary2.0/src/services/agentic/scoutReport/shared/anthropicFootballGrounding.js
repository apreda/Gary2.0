const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5';
const DEFAULT_TIMEOUT_MS = 90_000;
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

  return `<date_anchor>
Current ET system date: ${systemDate}.
Target game date: ${targetGameDate}.
These dates are distinct. If the target date is later than the system date, call it an upcoming game, never "tonight."
</date_anchor>

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
const MAX_CONCURRENT_SEARCHES = Number(process.env.FOOTBALL_SEARCH_CONCURRENCY) || 6;
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

/** Test seam: current gate state. */
export function _searchGateState() {
  return { active: activeSearches, queued: searchQueue.length, max: MAX_CONCURRENT_SEARCHES };
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

async function runFootballSearch({
  apiKey, fetchImpl, timeoutMs, label, prompt, maxUses = 6,
  mustMention = [], minChars = 200, failures = null,
}) {
  // Existing callers pass no sink and keep the old null-on-failure contract.
  const fail = (reason) => { if (failures) failures.push(reason); return null; };
  const startedAt = Date.now();
  const tool = {
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: maxUses,
    user_location: { type: 'approximate', country: 'US', timezone: 'America/New_York' },
  };
  const messages = [{ role: 'user', content: prompt }];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const textParts = [];
  let successfulSearches = 0;
  const searchErrors = [];

  await acquireSearchSlot();
  try {
    for (let continuation = 0; continuation <= MAX_PAUSE_CONTINUATIONS; continuation += 1) {
      let response = null;
      for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt += 1) {
        response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model: apiModelId(process.env.ANTHROPIC_GROUNDING_MODEL),
            max_tokens: 6000,
            messages,
            tools: [tool],
          }),
          signal: controller.signal,
        });
        // 429 and 5xx are "ask again", not "there is nothing to find".
        if (response.status !== 429 && response.status < 500) break;
        if (attempt === RATE_LIMIT_RETRIES) break;
        const wait = retryDelayMs(response, attempt);
        console.warn(`[${label}] Anthropic HTTP ${response.status} — retrying in ${wait}ms (attempt ${attempt + 1}/${RATE_LIMIT_RETRIES})`);
        await sleep(wait);
      }

      if (!response.ok) {
        console.warn(`[${label}] Anthropic HTTP ${response.status}`);
        return fail(response.status === 429
          ? `rate limited by the search API (HTTP 429) after ${RATE_LIMIT_RETRIES} retries — this is NOT a finding that no coverage exists`
          : `search API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const blocks = Array.isArray(data?.content) ? data.content : [];
      textParts.push(...blocks
        .filter((block) => block?.type === 'text' && block.text)
        .map((block) => block.text));
      const status = searchResultStatus(blocks);
      successfulSearches += status.successfulSearches;
      searchErrors.push(...status.errors);

      if (data.stop_reason === 'pause_turn') {
        if (continuation === MAX_PAUSE_CONTINUATIONS) {
          console.warn(`[${label}] Anthropic pause_turn continuation cap exceeded`);
          return fail('the search ran past its continuation cap before finishing');
        }
        // Server search results contain encrypted fields. Preserve the entire
        // assistant turn and resend it unchanged, per Anthropic's contract.
        messages.push({ role: 'assistant', content: blocks });
        continue;
      }

      if (data.stop_reason !== 'end_turn') {
        console.warn(`[${label}] Anthropic incomplete stop reason: ${data.stop_reason || 'missing'}`);
        return fail(`the search ended incompletely (${data.stop_reason || 'no stop reason'})`);
      }

      if (successfulSearches < 1) {
        console.warn(`[${label}] Anthropic returned no successful web search${searchErrors.length ? ` (${searchErrors.join(',')})` : ''}`);
        return null;
      }

      const cleaned = scrubFootballGroundingText(stripSearchNarration(textParts.join('\n\n')));
      const lower = cleaned.toLowerCase();
      const missing = mustMention.filter((name) => !mentionsTeam(lower, name));
      if (cleaned.length < minChars || missing.length > 0) {
        console.warn(`[${label}] narrative validation failed (chars=${cleaned.length}, missing=${missing.join('|') || 'none'})`);
        return fail(missing.length
          ? `the search returned text that did not mention ${missing.join(' or ')}`
          : `the search returned only ${cleaned.length} characters`);
      }

      console.log(`[${label}] Anthropic web search OK (${successfulSearches} search block(s), ${cleaned.length} chars, ${Date.now() - startedAt}ms)`);
      return { data: cleaned, provider: 'anthropic-web-search', searchCount: successfulSearches };
    }
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : (error?.message || 'request failed');
    console.warn(`[${label}] Anthropic request failed: ${reason}`);
    return fail(`the search request failed (${reason})`);
  } finally {
    releaseSearchSlot();
    clearTimeout(timer);
  }
  return null;
}

export async function fetchAnthropicFootballCurrentState({
  homeTeam,
  awayTeam,
  sport,
  gameDate,
  now = new Date(),
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || typeof fetchImpl !== 'function') {
    console.warn('[Football Grounding] Anthropic web search unavailable (missing API key or fetch)');
    return null;
  }
  return runFootballSearch({
    apiKey,
    fetchImpl,
    timeoutMs,
    label: 'Football Grounding',
    prompt: buildPrompt({ homeTeam, awayTeam, sport, gameDate, now }),
    maxUses: 6,
    mustMention: [homeTeam, awayTeam],
  });
}

export default fetchAnthropicFootballCurrentState;

/**
 * WHAT THE PRESS WROTE ABOUT THE LAST FEW GAMES.
 *
 * The founder's ask, Aug 25: "the same way, after a game is over, you could go
 * online and read articles and articles about what happened — that's what we
 * have to be giving Gary."
 *
 * MLB gets this free: statsapi publishes an editorial recap per game, ~4,500
 * characters of real writing. Football has no equivalent feed, so the writing
 * has to be found rather than fetched.
 *
 * This is deliberately NOT another stat lane. Play-by-play already gives the
 * scoring and the win-probability swings; what it cannot give is the thing
 * only a person who watched writes down — that the 50-yard catch was nearly
 * intercepted and fell into the receiver's lap, that a line was getting beaten
 * all afternoon, that a score flattered a team that had been outplayed.
 *
 * Same boundaries as the current-state pass: no injuries (the official feed
 * owns those), no odds, no picks, no predictions.
 */
function buildRecentGamesPrompt({ homeTeam, awayTeam, sport, now }) {
  const isNcaaf = sport === 'NCAAF' || sport === 'americanfootball_ncaaf';
  const league = isNcaaf ? 'college football' : 'NFL';
  const today = etDate(now, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return `<date_anchor>Current ET date: ${today}.</date_anchor>

Use live web search to find what was WRITTEN about the last two completed games for each of ${homeTeam} and ${awayTeam} in ${league}. Search each team separately.

For each of those games, report what the coverage actually said happened — the kind of detail a box score cannot carry:
- how the game was won or lost, in the writer's account;
- plays that decided it, and whether they were earned or fortunate (a tipped ball, a dropped interception, a spot or review that went one way);
- how a unit actually performed as described — a line being beaten, a secondary being picked on, a quarterback under pressure all afternoon;
- anything a final score misrepresents: a team outplayed that still won, a scoreline flattered by late points, a comeback that stalled;
- what coaches or players said afterwards, attributed.

RULES:
- Attribute each account to its outlet.
- Facts and reported observation only. No predictions, no betting angles, no odds, no picks, no ATS or cover talk.
- Do NOT report injuries or injury status — a separate official feed owns those. A player leaving a game may be mentioned only as part of what happened in it.
- Do not use internal memory to fill gaps. Only what this request's searches support.
- If coverage for a game cannot be found, say so for that game rather than inferring what probably happened.
- Write one clearly labelled section per team. Do not compare them and do not favour either.`;
}

/**
 * Recent-games press coverage for both sides. Returns null on any contained
 * failure — narrative is context, never a reason to lose a pick.
 */
export async function fetchFootballRecentGameCoverage({
  homeTeam,
  awayTeam,
  sport,
  now = new Date(),
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || typeof fetchImpl !== 'function') {
    console.warn('[Football Coverage] Anthropic web search unavailable (missing API key or fetch)');
    return null;
  }
  return runFootballSearch({
    apiKey,
    fetchImpl,
    timeoutMs,
    label: 'Football Coverage',
    prompt: buildRecentGamesPrompt({ homeTeam, awayTeam, sport, now }),
    maxUses: 8,
    mustMention: [homeTeam, awayTeam],
    minChars: 400,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// THE DEEP READ — one combined search becomes six focused ones (Aug 25 2026)
//
// The founder's ask: "having Gary read through a ton of articles to fully
// understand what happened last game, or last 3 games, or last time these
// teams played, or for a QB or WR or defensive context."
//
// One prompt covering all of that returns a paragraph per team and loses the
// specifics — a single search budget spread across six subjects finds the
// shallowest version of each. Six lanes, each with its own budget, come back
// with what a beat writer actually wrote about that one subject.
//
// KNOWN-OLD CONTEXT. Every lane is handed the facts we already hold — the
// scores, the accounts, the play-by-play story — and told to add what those
// do NOT say. Without that, a search lane re-reports the box score as though
// it were discovering it, which is the recurring failure of search lanes in
// this pipeline (see run-wire-items.js for the same pattern in the wire).
//
// COST IS REAL AND IS NOT HIDDEN. Six lanes at up to six searches each is
// roughly 30-36 searches per game against the metered Anthropic API, where
// the previous single pass ran seven. That is a deliberate trade the founder
// made explicitly ("i dont care about costs really"), and the lane count is a
// parameter so it can be cut back without a code change.
// ═══════════════════════════════════════════════════════════════════════════

const DEEP_RULES = `
RULES (identical for every lane):
- Attribute each account to its outlet.
- Reported fact and observation only. No predictions, no betting angles, no odds, no picks, no ATS or cover talk.
- Do NOT report injuries or injury status — a separate official feed owns those. A player leaving a game may be mentioned only as part of what happened in it.
- Do not use internal memory to fill gaps. Only what this request's searches support.
- If the coverage cannot be found, say so plainly rather than inferring what probably happened.
- Do not compare the two teams and do not favour either.`;

/**
 * The lanes. Each is a separate search with its own budget.
 *
 * `known` is the structured account we already hold, passed in so the lane
 * spends its searches on what we do not have.
 */
export const DEEP_COVERAGE_LANES = [
  {
    key: 'last_game',
    label: 'THE LAST GAME, AS WRITTEN',
    maxUses: 6,
    build: ({ homeTeam, awayTeam, league, known }) => `Use live web search to find what was WRITTEN about the single most recent completed game for each of ${homeTeam} and ${awayTeam} in ${league}. Search each team separately.
${known}
For each of those two games, report what the coverage said happened that the box score cannot carry:
- how the game was actually won or lost in the writer's account;
- the plays that decided it, and whether each was earned or fortunate — a tipped ball, a dropped interception, a ball that nearly got picked and fell into the receiver's lap, a spot or a review that went one way;
- what the final score misrepresents, if anything: a team outplayed that still won, a scoreline flattered by late points, a comeback that stalled short;
- what coaches or players said afterwards, attributed.
${DEEP_RULES}
Write one clearly labelled section per team.`
  },
  {
    key: 'recent_run',
    label: 'THE RUN BEFORE IT',
    maxUses: 6,
    build: ({ homeTeam, awayTeam, league, known }) => `Use live web search to find what was written about the SECOND and THIRD most recent completed games for each of ${homeTeam} and ${awayTeam} in ${league} — the games BEFORE their latest one. Search each team separately.
${known}
For each game, report how it went in the writer's account, and then say what the three games together showed: whether the team has been playing the same way each week or differently, and what changed between them if anything did.
${DEEP_RULES}
Write one clearly labelled section per team.`
  },
  {
    key: 'head_to_head',
    label: 'THE LAST TIME THEY PLAYED',
    maxUses: 5,
    build: ({ homeTeam, awayTeam, league }) => `Use live web search to find coverage of the most recent games played BETWEEN ${homeTeam} and ${awayTeam} in ${league} — their head-to-head history, most recent first, going back no further than three meetings.

For each meeting, report the date, the result, and what the coverage said about how it was decided. Then say plainly which parts of those meetings still apply and which do not — different coach, different quarterback, different roster, a different season.
${DEEP_RULES}
If these two teams have not played each other recently, say so rather than substituting a different matchup.`
  },
  {
    key: 'quarterback',
    label: 'THE QUARTERBACKS',
    maxUses: 6,
    build: ({ homeTeam, awayTeam, league, known }) => `Use live web search to find what has been written about how the starting quarterbacks for ${homeTeam} and ${awayTeam} have been PLAYING over their last few games in ${league}. Search each separately.
${known}
Report, per quarterback:
- how his recent games were described — decisive, erratic, protected by the scheme, carrying the offence;
- how he has handled pressure and what coverage says teams are doing to him;
- any change in his role, the play-calling around him, or who is starting;
- attributed comment from coaches or the quarterback.
${DEEP_RULES}
Write one clearly labelled section per quarterback, and name the quarterback in the heading.`
  },
  {
    key: 'skill_players',
    label: 'THE SKILL PLAYERS',
    maxUses: 5,
    build: ({ homeTeam, awayTeam, league }) => `Use live web search to find what has been written about the receivers, tight ends and running backs for ${homeTeam} and ${awayTeam} in ${league} over their last few games.

Report who is actually being used and how — who the offence is going to in the situations that matter, whose role has grown or shrunk, who has been dropping the ball or breaking tackles, and any change in the backfield split. Say who the coverage treats as the team's primary threat.
${DEEP_RULES}
Write one clearly labelled section per team.`
  },
  {
    key: 'defense',
    label: 'THE DEFENCES',
    maxUses: 6,
    build: ({ homeTeam, awayTeam, league, known }) => `Use live web search to find what has been written about how the DEFENCES of ${homeTeam} and ${awayTeam} have been playing over their last few games in ${league}. Search each separately.
${known}
Report, per defence:
- what opponents have been doing to it successfully, in the writer's account — where it is being attacked and by what kind of play;
- which individual defenders are being targeted, and which are winning;
- how the pass rush has actually looked, beyond the sack count;
- any scheme or personnel change described by the coverage — a coordinator adjustment, a corner moving inside, a rookie taking snaps.
${DEEP_RULES}
Write one clearly labelled section per team.`
  }
];

/** Render what we already hold, so a lane does not spend searches rediscovering it. */
function knownBlock(knownAccounts) {
  if (!knownAccounts || !String(knownAccounts).trim()) return '';
  return `
<already_known>
These facts are ALREADY on file and do not need to be found again. Treat them as known and spend your searches on what they do NOT say:
${String(knownAccounts).trim()}
</already_known>
`;
}

/**
 * Run the deep read.
 *
 * @param {object}   opts
 * @param {string[]} opts.lanes          lane keys to run (default: all)
 * @param {string}   opts.knownAccounts  facts already held, passed to each lane
 * @returns {Promise<{text:string, lanes:object[], searches:number}|null>}
 */
export async function fetchFootballDeepCoverage({
  homeTeam,
  awayTeam,
  sport,
  now = new Date(),
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  lanes = null,
  knownAccounts = null
} = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || typeof fetchImpl !== 'function') {
    console.warn('[Football Deep Read] Anthropic web search unavailable (missing API key or fetch)');
    return null;
  }

  const isNcaaf = sport === 'NCAAF' || sport === 'americanfootball_ncaaf';
  const league = isNcaaf ? 'college football' : 'NFL';
  const today = etDate(now, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const known = knownBlock(knownAccounts);
  const selected = lanes
    ? DEEP_COVERAGE_LANES.filter((l) => lanes.includes(l.key))
    : DEEP_COVERAGE_LANES;

  // Lanes are independent, so they run together. One lane failing must never
  // take the others with it — narrative is context, never a reason to lose a
  // pick.
  // One failure sink per lane, so a lane that came back empty can say WHY.
  const sinks = selected.map(() => []);
  const settled = await Promise.allSettled(selected.map((lane, i) => runFootballSearch({
    apiKey,
    fetchImpl,
    timeoutMs,
    label: `Deep Read ${lane.key}`,
    prompt: `<date_anchor>Current ET date: ${today}.</date_anchor>\n\n`
      + lane.build({ homeTeam, awayTeam, league, known }),
    maxUses: lane.maxUses,
    mustMention: [homeTeam, awayTeam],
    minChars: 300,
    failures: sinks[i]
  })));

  const done = [];
  for (let i = 0; i < selected.length; i += 1) {
    const lane = selected[i];
    const outcome = settled[i];
    const value = outcome.status === 'fulfilled' ? outcome.value : null;
    // runFootballSearch returns { data, provider, searchCount } — NOT
    // { text, searches }. Reading the wrong keys made every successful lane
    // look empty, which is the silent-blank class this whole audit is about.
    if (value && value.data) {
      done.push({ key: lane.key, label: lane.label, text: value.data, searches: value.searchCount ?? null });
    } else {
      // A lane that found nothing is REPORTED as having found nothing — and
      // WHY. "No coverage found" and "we were rate limited" are completely
      // different statements, and collapsing them is how a throttled slate
      // reads as a quiet news week.
      const why = outcome.status === 'rejected'
        ? `This lane failed: ${outcome.reason?.message || 'unknown error'}`
        : (sinks[i][0] ? `This lane returned nothing because ${sinks[i][0]}.` : 'No coverage was found for this lane.');
      done.push({ key: lane.key, label: lane.label, text: null, searches: 0, note: why });
    }
  }

  const withText = done.filter((l) => l.text);
  const searches = done.reduce((sum, l) => sum + (Number(l.searches) || 0), 0);

  const body = done.map((lane) => (
    lane.text
      ? `${lane.label}\n${lane.text}`
      : `${lane.label}\n(${lane.note})`
  )).join('\n\n');

  if (withText.length === 0) {
    // EVERY lane empty is itself a finding, and returning null buried it: the
    // section vanished from the report and the desk could not tell a quiet
    // news week from a throttled one. If any lane failed for a technical
    // reason, say so; if they genuinely found nothing, that is also worth
    // stating rather than silently omitting.
    const technical = done.some((l) => /rate limited|HTTP|request failed|incompletely|continuation cap/i.test(l.note || ''));
    if (!technical) return null;
    console.warn(`[Football Deep Read] all ${selected.length} lanes empty — reporting the reason rather than omitting the section`);
    return {
      text: `No press coverage could be retrieved for this game. This is a retrieval failure, NOT a finding that the games were unremarkable — do not treat the absence as information.\n\n${body}`,
      lanes: done,
      searches,
      allFailed: true
    };
  }

  const text = body;

  console.log(`[Football Deep Read] ${withText.length}/${selected.length} lanes returned, ${searches} searches, ${text.length} chars`);
  return { text, lanes: done, searches };
}
