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

  const startedAt = Date.now();
  const tool = {
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: 6,
    user_location: {
      type: 'approximate',
      country: 'US',
      timezone: 'America/New_York',
    },
  };
  const messages = [{
    role: 'user',
    content: buildPrompt({ homeTeam, awayTeam, sport, gameDate, now }),
  }];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const textParts = [];
  let successfulSearches = 0;
  const searchErrors = [];

  try {
    for (let continuation = 0; continuation <= MAX_PAUSE_CONTINUATIONS; continuation += 1) {
      const response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
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

      if (!response.ok) {
        console.warn(`[Football Grounding] Anthropic HTTP ${response.status}`);
        return null;
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
          console.warn('[Football Grounding] Anthropic pause_turn continuation cap exceeded');
          return null;
        }
        // Server search results contain encrypted fields. Preserve the entire
        // assistant turn and resend it unchanged, per Anthropic's continuation
        // contract.
        messages.push({ role: 'assistant', content: blocks });
        continue;
      }

      if (data.stop_reason !== 'end_turn') {
        console.warn(`[Football Grounding] Anthropic incomplete stop reason: ${data.stop_reason || 'missing'}`);
        return null;
      }

      if (successfulSearches < 1) {
        console.warn(`[Football Grounding] Anthropic returned no successful web search${searchErrors.length ? ` (${searchErrors.join(',')})` : ''}`);
        return null;
      }

      const cleaned = scrubFootballGroundingText(textParts.join('\n\n'));
      const lower = cleaned.toLowerCase();
      const mentionsHome = lower.includes(String(homeTeam || '').toLowerCase());
      const mentionsAway = lower.includes(String(awayTeam || '').toLowerCase());
      if (cleaned.length < 200 || !mentionsHome || !mentionsAway) {
        console.warn(`[Football Grounding] Anthropic narrative validation failed (chars=${cleaned.length}, home=${mentionsHome}, away=${mentionsAway})`);
        return null;
      }

      const duration = Date.now() - startedAt;
      console.log(`[Football Grounding] Anthropic web search OK (${successfulSearches} search result block(s), ${cleaned.length} chars, ${duration}ms)`);
      return {
        data: cleaned,
        provider: 'anthropic-web-search',
        searchCount: successfulSearches,
      };
    }
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : (error?.message || 'request failed');
    console.warn(`[Football Grounding] Anthropic request failed: ${reason}`);
    return null;
  } finally {
    clearTimeout(timer);
  }

  return null;
}

export default fetchAnthropicFootballCurrentState;
