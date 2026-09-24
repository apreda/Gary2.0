// A SEARCH REQUEST IN PLAIN WORDS (founder GO, Sep 24 2026). Every desk search
// used to arrive wrapped in tags that imitate system messages
// (<date_anchor> "System Date", <grounding_instructions> "MANDATORY",
// "CRITICAL REMINDER"). Claude read that as a prompt injection and answered
// about the wrapper instead of the game (27 MLB desks Sep 17-23), and the Claude
// Code search lane introduced itself as a coding assistant, so it often
// answered without searching at all (118 "no retrieval receipts" on Sep 23).
// The request now reads as what it is. The rules are the same ones: today's
// date, search the live web, trust search over memory, a freshness window,
// no stale stat lines, date any number, say "unverified", facts only.

import { describeSportsCalendar } from '../utils/dateUtils.js';

const ET = 'America/New_York';
const longDate = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: ET });
const shortDate = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: ET });
const windowWords = (hours) => (hours % 24 === 0 ? `${hours / 24} day${hours === 24 ? '' : 's'}` : `${hours} hours`);

/** The Claude search lane's role (its default one is a coding assistant). */
export const SEARCH_ROLE = 'You are a sports research assistant for a sports-betting information app. '
  + 'Each message is a research request about real games, teams and players. '
  + 'Answer it by searching the live web with your search tools before you write anything, '
  + 'then report what current, dated sources say, naming the outlet and date for each item. '
  + 'Report facts only: no picks, predictions or betting advice.';

/**
 * A dated web-search request. `freshnessHours` is the window current reporting
 * must come from (48 by default); a request about how a season has gone asks
 * for a longer one.
 */
export function freshSearchRequest(query, { freshnessHours = 48, now = new Date() } = {}) {
  const today = longDate(now);
  const since = shortDate(new Date(now.getTime() - freshnessHours * 60 * 60 * 1000));
  return [
    `Today is ${today} (US Eastern time). Sports calendar: ${describeSportsCalendar(now)}.`,
    '',
    'Please search the live web and report what current reporting says about:',
    query,
    '',
    'How to report it:',
    "- Search the web for this rather than answering from memory. Rosters, injuries and roles change during a season, so where a search result disagrees with what you remember (a trade, a signing, a new role), go with the search result.",
    `- Use reporting from the last ${windowWords(freshnessHours)} (published since ${since}). An older article cannot establish current status. If an article says "tonight" or "returns tonight", check that it is dated ${today}.`,
    '- For injuries and today\'s availability, the newest reporting (the last 24 hours) wins.',
    '- Do not pass along records, streaks or stat lines from articles as current numbers; they go stale within hours. Storylines, previews, roster moves and injury news are what is wanted. When a number is essential (an injury date, a posted line, a figure the request asks for), give the article\'s date beside it.',
    '- If you cannot confirm something, say it is unverified.',
    '- No picks, predictions, betting advice or expert projections; facts only.',
  ].join('\n');
}
