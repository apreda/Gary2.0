/** Legacy fallback retrieval through the authorized subscription search boundary. */
async function defaultSubscriptionSearch(...args) {
  const { subscriptionSearch } = await import('../../../src/services/agentic/orchestrator/subscriptionSearch.js');
  return subscriptionSearch(...args);
}

export function createResultsGrounding({ subscriptionSearch = defaultSubscriptionSearch, console = globalThis.console } = {}) {
  /** Result retrieval uses the same authorized subscription account order. */
  async function groundedSearch(query) {
    const result = await subscriptionSearch(query, {timeoutMs: 3 * 60 * 1000});
    if (!result.success) { console.warn(`[Results source retrieval failed] ${result.error}`); return null; }
    return result.data;
  }

  async function getScoreGrounding(league, teamA, teamB, date) {
    // Ask for scores by team name — avoids errors when pick's home/away doesn't match reality.
    // Grounding must NEVER settle a game that isn't over: demand a FINAL score and take "null"
    // for anything in progress/postponed/suspended/scheduled. The caller also gates this to
    // games the box-score provider lacks; this prompt guard is defense in depth.
    const query = `What was the FINAL score of the ${league} game between ${teamA} and ${teamB} on ${date}? Only answer if the game is already COMPLETED/FINAL. If it is still in progress, postponed, suspended, scheduled, or has not finished, respond ONLY "null". Respond ONLY as "${teamA} score"-"${teamB} score" (e.g. 115-102 means ${teamA} scored 115 and ${teamB} scored 102). If unknown or not final, say "null".`;
    const text = await groundedSearch(query);
    if (!text || text.toLowerCase().includes('null')) return null;
    const match = text.match(/(\d+)-(\d+)/);
    // h = teamA's score (pick's homeTeam), v = teamB's score (pick's awayTeam)
    return match ? { h: parseInt(match[1]), v: parseInt(match[2]) } : null;
  }

  async function getPropGrounding(sport, player, type, date) {
    const query = `In the ${sport} game on ${date}, what was ${player}'s exact total for ${type}? Respond ONLY with the number. If unknown, say "null".`;
    const text = await groundedSearch(query);
    if (!text || text.toLowerCase().includes('null')) return null;
    // Only accept a clean number at the start of the response — prevents date/noise concatenation
    const match = text.trim().match(/^\d+\.?\d*/);
    const num = match ? parseFloat(match[0]) : NaN;
    return isNaN(num) ? null : num;
  }

  return { getScoreGrounding, getPropGrounding };
}
