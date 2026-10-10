/**
 * ESPN's free college game feed as a fallback for a team's last-game story
 * (founder, Oct 10 2026: "keep it flexible so if ESPN doesn't have it we
 * still can get it", and the reverse). Each finished FBS game carries the
 * AP recap. Only the recap is read: ESPN's previews are the automated,
 * odds-led template, and its predictor, odds and against-the-spread blocks
 * never reach Gary.
 */
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';

const words = (name) => String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/[’'.]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** ESPN's team (displayName "Pittsburgh Panthers", location "Pittsburgh") is this team name. */
export function espnTeamIs(espnTeam, name) {
  const target = words(name);
  return Boolean(target) && [espnTeam?.displayName, espnTeam?.location, espnTeam?.shortDisplayName].some((n) => words(n) === target);
}

const etDay = (instant) => new Date(instant).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');

async function getJson(url, fetchImpl) {
  // A plain request: ESPN refuses an unfamiliar custom agent name (403) and serves the default one.
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`ESPN unavailable (${response.status})`);
  return response.json();
}

/**
 * The AP recap of the game between `team` and `opponent` played on `date`,
 * or null. Returns { title, body, publishedAt, url, author, source }.
 */
export async function espnRecap({ team, opponent, date }, { fetchImpl = fetch } = {}) {
  if (!team || !opponent || !date) return null;
  const kickoff = Date.parse(date);
  if (!Number.isFinite(kickoff)) return null;
  // The provider's date can sit on either side of midnight ET for a late kickoff.
  const days = [...new Set([etDay(kickoff), etDay(kickoff - 86_400_000), etDay(kickoff + 86_400_000)])];
  for (const day of days) {
    const board = await getJson(`${BASE}/scoreboard?dates=${day}&groups=80&limit=300`, fetchImpl);
    const event = (board.events || []).find((e) => {
      const teams = (e.competitions?.[0]?.competitors || []).map((c) => c.team);
      return teams.some((t) => espnTeamIs(t, team)) && teams.some((t) => espnTeamIs(t, opponent));
    });
    if (!event) continue;
    if (event.competitions?.[0]?.status?.type?.completed === false) return null;
    const summary = await getJson(`${BASE}/summary?event=${event.id}`, fetchImpl);
    const article = summary.article;
    if (!article || String(article.type || '').toLowerCase() !== 'recap' || !article.story) return null;
    const body = String(article.story)
      .replace(/<\/(p|h\d|li|blockquote)>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, '’').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
      .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return {
      title: article.headline || event.name,
      body,
      publishedAt: article.published || null,
      url: article.links?.web?.href?.replace(/^http:/, 'https:') || `https://www.espn.com/college-football/recap/_/gameId/${event.id}`,
      author: article.byline || null,
      source: article.source || 'ESPN',
    };
  }
  return null;
}
