/**
 * Each NFL club's head coach this season, from ESPN's free feed (founder GO, Oct 14 2026). nflverse's coach column
 * for the season in progress is out of date for some clubs (Oct 14: Arizona read Jonathan Gannon for Mike LaFleur,
 * Buffalo Sean McDermott for Joe Brady, Atlanta Raheem Morris for Kevin Stefanski), and the desk printed it as this
 * season's coach. Read once per club and season, cached for six hours; null when ESPN has no answer.
 */
const TEAMS = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams';
const COACHES = (season, id) => `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/teams/${id}/coaches`;
const TTL_MS = 6 * 3600_000;
const memo = new Map();

async function getJson(url, fetchImpl) {
  // A plain request: ESPN refuses an unfamiliar custom agent name (403) and serves the default one.
  const response = await fetchImpl(url.replace(/^http:/, 'https:'), { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`ESPN unavailable (${response.status})`);
  return response.json();
}

export async function getNflHeadCoach(teamName, season, { fetchImpl = fetch } = {}) {
  const key = `${season}:${teamName}`;
  const hit = memo.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const teams = (await getJson(TEAMS, fetchImpl)).sports?.[0]?.leagues?.[0]?.teams?.map((t) => t.team) || [];
  const team = teams.find((t) => t.displayName === teamName);
  if (!team) return null;
  const ref = (await getJson(COACHES(season, team.id), fetchImpl)).items?.[0]?.$ref;
  const coach = ref ? await getJson(ref, fetchImpl) : null;
  const value = coach?.firstName && coach?.lastName ? `${coach.firstName} ${coach.lastName}` : null;
  memo.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}
