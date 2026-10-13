/**
 * BEFORE THE FIRST GAME (founder, Oct 13 2026). Until a team has played this season there are no numbers for it,
 * as there are none for any fan: "we have to try to come up with a solution so Gary still has context of the teams
 * and the matchup without having stats". For each team, last season in one line (record, conference finish, how the
 * playoffs ended) and this season's roster, newcomers marked. No last-season stats, and no list of who left ("I also
 * don't really want Gary worried about who's not on the team").
 *
 * Last season's rosters come from BDL box scores (scripts/build-nba-season-rosters.js writes
 * data/nba/season-rosters-<season>.json); without that file the roster prints unmarked.
 */
import { readFile } from 'node:fs/promises';
import { ballDontLieService } from './ballDontLieService.js';
import { findTeam } from './agentic/scoutReport/shared/utilities.js';

const seasonName = (season) => `${season}-${String(season + 1).slice(2)}`;
const ordinal = (n) => `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}`;
const ROUNDS = ['the first round', 'the conference semifinals', 'the conference finals', 'the NBA Finals'];

async function lastSeasonRosters(season) {
  try {
    return JSON.parse(await readFile(new URL(`../../data/nba/season-rosters-${season}.json`, import.meta.url), 'utf8'));
  } catch {
    return null;
  }
}

/** How a team's postseason went, from its postseason games in date order. */
export function playoffStory(games, teamId) {
  const series = [];
  for (const g of [...games].sort((a, b) => Date.parse(a.datetime || a.date) - Date.parse(b.datetime || b.date))) {
    const home = g.home_team?.id === teamId;
    const opponent = home ? g.visitor_team : g.home_team;
    const mine = home ? g.home_team_score : g.visitor_team_score;
    const theirs = home ? g.visitor_team_score : g.home_team_score;
    if (mine == null || theirs == null || !opponent) continue;
    const last = series.at(-1);
    const current = last && last.opponent.id === opponent.id ? last : (series.push({ opponent, won: 0, lost: 0 }), series.at(-1));
    if (mine > theirs) current.won += 1; else current.lost += 1;
  }
  let round = 0;
  return series.map((s) => {
    const name = `the ${s.opponent.full_name}`;
    if (Math.max(s.won, s.lost) < 4 && s.won + s.lost <= 2 && round === 0) return `${s.won > s.lost ? 'won' : 'lost'} a play-in game against ${name}`;
    const stage = ROUNDS[round] || 'a later round';
    round += 1;
    return s.won === 4 ? `beat ${name} ${s.won}-${s.lost} in ${stage}` : s.lost === 4 ? `lost to ${name} ${s.won}-${s.lost} in ${stage}` : `${s.won}-${s.lost} against ${name} in ${stage}`;
  });
}

async function lastSeasonLine(team, season) {
  const standings = await ballDontLieService.getNbaStandings(season).catch(() => []);
  const row = (standings || []).find((r) => r.team?.id === team.id);
  const record = row ? `${row.wins}-${row.losses}${row.conference_rank ? `, ${ordinal(Number(row.conference_rank))} in the ${row.team?.conference || team.conference}` : ''}` : 'record unavailable';
  const postseason = await ballDontLieService.getGames('basketball_nba', { team_ids: [team.id], seasons: [season], postseason: true, per_page: 100 })
    .then((games) => (games || []).filter((g) => /final/i.test(String(g.status || ''))))
    .catch(() => null);
  const story = postseason == null ? 'playoffs unavailable' : postseason.length ? `Playoffs: ${playoffStory(postseason, team.id).join('; ')}` : 'Missed the playoffs';
  return `Last season (${seasonName(season)}): ${record}. ${story}.`;
}

function rosterLine(roster, data, teamId, season) {
  const name = (p) => `${p.first_name} ${p.last_name}`.trim();
  if (!data) return `This season's roster: ${roster.map(name).join(', ')}`;
  const lastTeam = data.teams[teamId]?.players || {};
  const back = roster.filter((p) => lastTeam[p.id]);
  const fresh = roster.filter((p) => !lastTeam[p.id]).map((p) => {
    let from = null;
    for (const t of Object.values(data.teams)) if (t.players[p.id] && (!from || t.players[p.id].minutes > from.minutes)) from = { team: t.name, minutes: t.players[p.id].minutes };
    if (from) return `${name(p)} (${seasonName(data.season)} with the ${from.team})`;
    return `${name(p)} (${Number(p.draft_year) === season + 1 ? 'rookie' : `no NBA games in ${seasonName(data.season)}`})`;
  });
  return `This season's roster: back from last season: ${back.map(name).join(', ') || 'none'}; new: ${fresh.join(', ') || 'none'}`;
}

/** The BEFORE THE FIRST GAME section for a game whose teams have not both played this season. */
export async function nbaOpeningNightSection(homeTeam, awayTeam, season) {
  const teams = await ballDontLieService.getTeams('basketball_nba');
  const data = await lastSeasonRosters(season - 1);
  const blocks = [];
  for (const [tag, teamName] of [['[HOME]', homeTeam], ['[AWAY]', awayTeam]]) {
    const team = findTeam(teams, teamName);
    if (!team) { blocks.push(`${tag} ${teamName}: unavailable`); continue; }
    const roster = await ballDontLieService.getActivePlayersComplete('basketball_nba', team.id).catch(() => []);
    blocks.push([`${tag} ${teamName}`, `  ${await lastSeasonLine(team, season - 1)}`,
      `  ${roster.length ? rosterLine(roster, data, team.id, season - 1) : 'This season\'s roster: unavailable'}`].join('\n'));
  }
  const rule = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  return `BEFORE THE FIRST GAME — LAST SEASON'S FINISH AND THIS SEASON'S ROSTER\n${rule}\n${blocks.join('\n\n')}\n${rule}`;
}
