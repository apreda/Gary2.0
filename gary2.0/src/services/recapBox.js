import { buildBoxLine, buildFootballBoxLineFromPlays } from './gameRecap.js';

const count = value => Number.isInteger(value) && value >= 0;

export function recapBoxComplete(box, league) {
  const stat = league === 'MLB' ? 'hr' : ['NFL', 'NCAAF'].includes(league) ? 'td' : null;
  return ['away', 'home'].every(side => count(box?.[side]?.runs)
    && (!stat || count(box?.[side]?.[stat])));
}

/** Final scores remain available while a delayed stat feed is retried. */
export async function loadRecapBox({ league, gameId, awayTeam, homeTeam, awayScore, homeScore,
  mlbStats = null, apiKey, fetchImpl = fetch }) {
  if (!count(awayScore) || !count(homeScore)) return null;
  const scoreBox = { away: { runs: awayScore }, home: { runs: homeScore } };
  const sides = { awayTeam, homeTeam, awayScore, homeScore };
  if (league === 'MLB') return buildBoxLine({ mlbStats, ...sides }) ?? scoreBox;
  if (!['NFL', 'NCAAF'].includes(league) || !apiKey || gameId == null) return scoreBox;

  // Only a complete, exact-game play feed establishes total TDs (including
  // defensive/return scores). Player rushing + receiving omits those scores.
  try {
    const plays = [];
    const cursors = new Set();
    let cursor = null;
    for (let page = 0; page < 10; page++) {
      const params = new URLSearchParams({ game_id: String(gameId), per_page: '100' });
      if (cursor != null) params.set('cursor', String(cursor));
      const response = await fetchImpl(`https://api.balldontlie.io/${league.toLowerCase()}/v1/plays?${params}`, {
        headers: { Authorization: apiKey }, signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) return scoreBox;
      const payload = await response.json();
      if (!Array.isArray(payload.data) || !payload.data.length) return scoreBox;
      if (payload.data.some(play => String(play.game_id ?? play.game?.id) !== String(gameId))) return scoreBox;
      plays.push(...payload.data);
      cursor = payload.meta?.next_cursor ?? null;
      if (cursor == null) break;
      if (cursors.has(String(cursor))) return scoreBox;
      cursors.add(String(cursor));
    }
    if (cursor != null) return scoreBox;
    // NFL's cursor pages are chronological and use play IDs. College supplies
    // an explicit order. Their schemas are different, including TD markers.
    const ordered = league === 'NFL' ? plays : [...plays].sort((a, b) => a.order - b.order);
    const ids = ordered.map(play => league === 'NFL' ? play.id : play.order);
    if (ids.some(id => league === 'NFL' ? !/^\d+$/.test(String(id ?? '')) : !count(id))
      || new Set(ids.map(String)).size !== ids.length) return scoreBox;
    const last = ordered.at(-1);
    if (last?.away_score !== awayScore || last?.home_score !== homeScore) return scoreBox;
    return buildFootballBoxLineFromPlays({ plays: ordered, ...sides }) ?? scoreBox;
  } catch {
    return scoreBox;
  }
}
