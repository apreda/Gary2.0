import { gamePagePaths, gameSlug, teamSlug, type PickIndexRow } from './gamepage';
import { normalizeLeague, sportByCode } from './leagues';

// A team's page lasts where a game page ends at the final: its latest pick and
// every pick on its games this season. A page exists once a team has three
// games, so nothing thin is published. Leagues in order, this season only.

const SEASON_START: Record<string, string> = {
  NFL: '2026-09-01',
  NCAAF: '2026-08-01',
  NBA: '2026-10-01',
  MLB: '2026-03-01',
};
export const TEAM_LEAGUES = Object.keys(SEASON_START);
const MIN_GAMES = 3;
/** All-Star sides are in the index as teams; they aren't. */
const NOT_TEAMS = new Set(['AL', 'NL']);

export interface TeamEntry {
  sport: string;
  code: string;
  name: string;
  slug: string;
  games: number;
  lastDate: string;
}

export interface TeamGame {
  date: string;
  away: string;
  home: string;
  path: string;
}

function seasonRows(rows: PickIndexRow[]) {
  return rows.flatMap(r => {
    const code = normalizeLeague(r.league, r.sport);
    const start = code ? SEASON_START[code] : undefined;
    return code && start && r.date >= start && r.away_team && r.home_team
      ? [{ code, date: r.date, away: r.away_team, home: r.home_team }]
      : [];
  });
}

/** The teams with a page, by league, then by name. */
export function teamsFromIndex(rows: PickIndexRow[]): TeamEntry[] {
  const teams = new Map<string, TeamEntry>();
  const seen = new Set<string>();
  for (const r of seasonRows(rows)) {
    const game = `${r.code}|${r.date}|${gameSlug(r.away, r.home)}`;
    if (seen.has(game)) continue;
    seen.add(game);
    for (const name of [r.away, r.home]) {
      if (NOT_TEAMS.has(name)) continue;
      const slug = teamSlug(name);
      const key = `${r.code}|${slug}`;
      const team = teams.get(key) ?? { sport: sportByCode(r.code)!.slug, code: r.code, name, slug, games: 0, lastDate: r.date };
      team.games += 1;
      if (r.date > team.lastDate) team.lastDate = r.date;
      teams.set(key, team);
    }
  }
  return [...teams.values()]
    .filter(t => t.games >= MIN_GAMES)
    .sort((a, b) => TEAM_LEAGUES.indexOf(a.code) - TEAM_LEAGUES.indexOf(b.code) || a.name.localeCompare(b.name));
}

/** The team's games this season, newest first, each once. */
export function teamGames(rows: PickIndexRow[], team: Pick<TeamEntry, 'code' | 'sport' | 'slug'>): TeamGame[] {
  const seen = new Set<string>();
  const games: TeamGame[] = [];
  for (const r of seasonRows(rows)) {
    if (r.code !== team.code || (teamSlug(r.away) !== team.slug && teamSlug(r.home) !== team.slug)) continue;
    const slug = gameSlug(r.away, r.home);
    const key = `${r.date}|${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    games.push({ date: r.date, away: r.away, home: r.home, path: `/picks/${team.sport}/${r.date}/${slug}` });
  }
  return games.sort((a, b) => b.date.localeCompare(a.date));
}

export const teamPath = (t: Pick<TeamEntry, 'sport' | 'slug'>) => `/teams/${t.sport}/${t.slug}`;

/** Only games the site can render, so a team page never links to a missing page. */
export function renderableTeamGames(rows: PickIndexRow[], team: Pick<TeamEntry, 'code' | 'sport' | 'slug'>, today?: string): TeamGame[] {
  const paths = new Set(gamePagePaths(rows, today).map(p => `/picks/${p.sport}/${p.date}/${p.slug}`));
  return teamGames(rows, team).filter(g => paths.has(g.path));
}
