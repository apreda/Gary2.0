/**
 * ROSTER CHANGES SINCE LAST SEASON (founder, Oct 13 2026: on opening night a fan thinks about "who's on the roster
 * this year, what pieces did they add in the offseason, and what type of core is back versus whether this is a new
 * team"). For each team: how much of last season's minutes are back, who returned, who arrived (with last season's
 * team and line, or no NBA games), and who left (with his team now). Last season's rosters come from BDL box scores
 * (scripts/build-nba-season-rosters.js writes data/nba/season-rosters-<season>.json); today's from BDL's active
 * players. Facts only: what Gary makes of them is his.
 */
import { readFile } from 'node:fs/promises';
import { ballDontLieService } from './ballDontLieService.js';
import { findTeam } from './agentic/scoutReport/shared/utilities.js';

const DEPARTURE_MIN_GAMES = 5;   // a player with fewer games last season is not listed as a departure

const seasonName = (season) => `${season}-${String(season + 1).slice(2)}`;
const line = (p) => `${p.games} games, ${(p.minutes / p.games).toFixed(1)} min, ${(p.pts / p.games).toFixed(1)} pts, ${(p.reb / p.games).toFixed(1)} reb, ${(p.ast / p.games).toFixed(1)} ast`;

async function lastSeasonRosters(season) {
  try {
    return JSON.parse(await readFile(new URL(`../../data/nba/season-rosters-${season}.json`, import.meta.url), 'utf8'));
  } catch {
    return null;
  }
}

/** A player's main team last season (most minutes) and his line there. */
function lastSeasonOf(data, playerId) {
  let best = null;
  for (const [teamId, team] of Object.entries(data.teams)) {
    const p = team.players[playerId];
    if (p && (!best || p.minutes > best.p.minutes)) best = { teamId: Number(teamId), team: team.name, p };
  }
  return best;
}

export function teamChanges(data, teamId, roster, nowTeamOf) {
  const last = data.teams[teamId];
  if (!last) return null;
  const onRoster = new Set(roster.map((p) => p.id));
  const players = Object.entries(last.players).map(([id, p]) => ({ id: Number(id), ...p })).sort((a, b) => b.minutes - a.minutes);
  const returning = players.filter((p) => onRoster.has(p.id));
  const departed = players.filter((p) => !onRoster.has(p.id) && p.games >= DEPARTURE_MIN_GAMES);
  const arrived = roster.filter((p) => !last.players[p.id]).map((p) => ({ name: `${p.first_name} ${p.last_name}`.trim(), before: lastSeasonOf(data, p.id) }))
    .sort((a, b) => (b.before?.p.minutes || 0) - (a.before?.p.minutes || 0));
  const back = returning.reduce((s, p) => s + p.minutes, 0) / (last.minutes || 1);
  return {
    share: Math.round(back * 100),
    returning: returning.map((p) => `${p.name} (${line(p)})`),
    arrived: arrived.map((a) => (a.before ? `${a.name} (${seasonName(data.season)} with the ${a.before.team}: ${line(a.before.p)})` : `${a.name} (no NBA games in ${seasonName(data.season)})`)),
    departed: departed.map((p) => `${p.name} (${nowTeamOf(p.id) ? `now ${nowTeamOf(p.id)}` : 'not on an NBA roster'}; ${line(p)})`),
  };
}

/** The ROSTER CHANGES section for a game, or a line saying it is unavailable. */
export async function nbaRosterChangesSection(homeTeam, awayTeam, season) {
  const data = await lastSeasonRosters(season - 1);
  const title = `ROSTER CHANGES SINCE LAST SEASON (${seasonName(season - 1)} regular season, from box scores; today's active rosters)`;
  const rule = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  if (!data) return `${title}\n${rule}\nUnavailable: last season's rosters have not been built (scripts/build-nba-season-rosters.js).\n${rule}`;
  const teams = await ballDontLieService.getTeams('basketball_nba');
  const league = await ballDontLieService.getAllActiveNbaPlayers();
  const teamName = new Map(teams.map((t) => [t.id, t.full_name]));
  const nowTeam = new Map(league.map((p) => [p.id, teamName.get(p.team?.id ?? p.team_id) || null]));
  const blocks = [];
  for (const [tag, name] of [['[HOME]', homeTeam], ['[AWAY]', awayTeam]]) {
    const team = findTeam(teams, name);
    const roster = league.filter((p) => (p.team?.id ?? p.team_id) === team?.id);
    const changes = team && roster.length ? teamChanges(data, team.id, roster, (id) => nowTeam.get(id)) : null;
    if (!changes) { blocks.push(`${tag} ${name}: unavailable`); continue; }
    blocks.push([
      `${tag} ${name}: ${changes.share}% of last season's minutes are back`,
      `  Returning: ${changes.returning.join('; ') || 'none'}`,
      `  Arrived: ${changes.arrived.join('; ') || 'none'}`,
      `  Departed: ${changes.departed.join('; ') || 'none'}`,
    ].join('\n'));
  }
  return `${title}\n${rule}\n${blocks.join('\n\n')}\n${rule}`;
}
