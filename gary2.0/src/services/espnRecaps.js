/**
 * ESPN's free game feed for a game's AP recap: college football's last-game
 * fallback (founder, Oct 10 2026: "keep it flexible so if ESPN doesn't have
 * it we still can get it") and the NBA's first source for each team's last
 * game and the last meeting (Oct 13 2026: 246 of 246 regular-season games in a
 * three-team sample carried the AP recap). Only the recap is read: ESPN's
 * previews are the automated, odds-led template, and its predictor, odds and
 * against-the-spread blocks never reach Gary.
 */
const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

const words = (name) => String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/[’'.]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** ESPN's college team (displayName "Pittsburgh Panthers", location "Pittsburgh") is this team name. */
export function espnTeamIs(espnTeam, name) {
  const target = words(name);
  return Boolean(target) && [espnTeam?.displayName, espnTeam?.location, espnTeam?.shortDisplayName].some((n) => words(n) === target);
}

/**
 * ESPN's NBA team is this team name. Matched on the nickname, which is unique in the league: ESPN says
 * "LA Clippers" where the odds feed says "Los Angeles Clippers", and "Nets" must not match "Hornets".
 */
export function espnNbaTeamIs(espnTeam, name) {
  const target = words(name);
  const nickname = words(espnTeam?.name || espnTeam?.shortDisplayName);   // the schedule feed carries only shortDisplayName
  return Boolean(target && nickname) && (target === nickname || target.endsWith(` ${nickname}`));
}

const LEAGUES = {
  'college-football': { path: 'football/college-football', board: '&groups=80&limit=300', teamIs: espnTeamIs, web: 'college-football' },
  nba: { path: 'basketball/nba', board: '', teamIs: espnNbaTeamIs, web: 'nba' },
};

const etDay = (instant) => new Date(instant).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');

async function getJson(url, fetchImpl) {
  // A plain request: ESPN refuses an unfamiliar custom agent name (403) and serves the default one.
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`ESPN unavailable (${response.status})`);
  return response.json();
}

const plainText = (html) => String(html)
  .replace(/<\/(p|h\d|li|blockquote)>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, '’').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
  .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();

/** The AP recap of one ESPN event, or null. Returns { title, body, publishedAt, url, author, source, gameDate }. */
async function recapOfEvent(eventId, league, fetchImpl) {
  const { path, web } = LEAGUES[league];
  const summary = await getJson(`${BASE}/${path}/summary?event=${eventId}`, fetchImpl);
  const article = summary.article;
  if (!article || String(article.type || '').toLowerCase() !== 'recap' || !article.story) return null;
  return {
    title: article.headline || summary.header?.competitions?.[0]?.name || null,
    body: plainText(article.story),
    publishedAt: article.published || null,
    url: article.links?.web?.href?.replace(/^http:/, 'https:') || `https://www.espn.com/${web}/recap/_/gameId/${eventId}`,
    author: article.byline || null,
    source: article.source || 'ESPN',
    gameDate: summary.header?.competitions?.[0]?.date || null,
  };
}

/**
 * The AP recap of the game between `team` and `opponent` played on `date`,
 * or null. Returns { title, body, publishedAt, url, author, source, gameDate }.
 */
export async function espnRecap({ team, opponent, date }, { fetchImpl = fetch, league = 'college-football' } = {}) {
  if (!team || !opponent || !date) return null;
  const { path, board: boardQuery, teamIs } = LEAGUES[league];
  const tip = Date.parse(date);
  if (!Number.isFinite(tip)) return null;
  // The provider's date can sit on either side of midnight ET for a late start.
  const days = [...new Set([etDay(tip), etDay(tip - 86_400_000), etDay(tip + 86_400_000)])];
  for (const day of days) {
    const board = await getJson(`${BASE}/${path}/scoreboard?dates=${day}${boardQuery}`, fetchImpl);
    const event = (board.events || []).find((e) => {
      const teams = (e.competitions?.[0]?.competitors || []).map((c) => c.team);
      return teams.some((t) => teamIs(t, team)) && teams.some((t) => teamIs(t, opponent));
    });
    if (!event) continue;
    if (event.competitions?.[0]?.status?.type?.completed === false) return null;
    return recapOfEvent(event.id, league, fetchImpl);
  }
  return null;
}

/** ESPN's NBA season for an instant: the year the season ends (Oct 2026 → 2027). */
const nbaSeasonOf = (instant) => {
  const d = new Date(instant);
  return d.getUTCMonth() >= 7 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
};

/**
 * The AP recap of the last completed NBA meeting between `team` and `opponent` before `before`, from this season
 * (regular season and playoffs), or null. `lookBack` seasons before this one widen it; the desk uses none (founder,
 * Oct 13 2026: last season's meetings have nothing to do with this year).
 */
export async function espnNbaLastMeeting({ team, opponent, before = Date.now(), lookBack = 0 }, { fetchImpl = fetch } = {}) {
  if (!team || !opponent) return null;
  const { path, teamIs } = LEAGUES.nba;
  const teams = await getJson(`${BASE}/${path}/teams`, fetchImpl);
  const espnTeam = (teams.sports?.[0]?.leagues?.[0]?.teams || []).map((t) => t.team).find((t) => teamIs(t, team));
  if (!espnTeam?.id) return null;
  const season = nbaSeasonOf(before);
  const meetings = [];
  for (const year of Array.from({ length: lookBack + 1 }, (_, i) => season - i)) {
    for (const type of [2, 3]) {
      const schedule = await getJson(`${BASE}/${path}/teams/${espnTeam.id}/schedule?season=${year}&seasontype=${type}`, fetchImpl);
      for (const event of schedule.events || []) {
        const competition = event.competitions?.[0];
        const played = Date.parse(competition?.date || event.date);
        if (!Number.isFinite(played) || played >= before || competition?.status?.type?.completed === false) continue;
        if ((competition?.competitors || []).some((c) => teamIs(c.team, opponent))) meetings.push({ id: event.id, played });
      }
    }
    if (meetings.length) break;
  }
  const last = meetings.sort((a, b) => b.played - a.played)[0];
  return last ? recapOfEvent(last.id, 'nba', fetchImpl) : null;
}
