import { getMlbTeams, getTeamRoster } from '../../src/services/mlbStatsApiService.js';

const normalized = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const teamName = team => typeof team === 'string' ? team : team?.full_name || team?.name;

/** Restore the MLBAM team objects June's roster/recent-game readers expect.
 * Odds discovery supplies names, and BDL IDs are a different namespace. Resolve
 * both clubs against MLB's current directory; never pass a BDL ID to StatsAPI.
 * Keep this transport repair outside the frozen June prompts and decision code.
 */
export async function prepareMlbScoutInput(game, {
  getTeams = getMlbTeams, getRoster = getTeamRoster, signal,
} = {}) {
  signal?.throwIfAborted();
  const teams = await getTeams();
  const resolved = ['home', 'away'].map(side => {
    const name = teamName(game[`${side}_team`]);
    const key = normalized(name);
    const matches = teams.filter(team => key && [team.name, team.teamName, team.shortName, team.abbreviation]
      .some(alias => normalized(alias) === key));
    if (matches.length !== 1 || !Number.isInteger(matches[0].id) || matches[0].id <= 0) {
      throw new Error(`MLB_SCOUT_TEAM_ID: ${side} team ${name || '(missing)'} resolved to ${matches.length} MLB teams`);
    }
    return matches[0];
  });
  if (resolved[0].id === resolved[1].id) throw new Error('MLB_SCOUT_TEAM_ID: home and away resolve to the same club');
  // The frozen report catches roster errors. Check its exact dependency first
  // so a failed/empty feed is visible instead of silently becoming "Roster unavailable".
  await Promise.all(resolved.map(async team => {
    const roster = await getRoster(team.id);
    if (!Array.isArray(roster) || !roster.length || roster.some(player => !player.id || !player.name?.trim())) {
      throw new Error(`MLB_SCOUT_ROSTER: ${team.name} has no complete named roster`);
    }
  }));
  signal?.throwIfAborted();
  return {
    ...game,
    home_team_data: { ...game.home_team_data, ...resolved[0] },
    away_team_data: { ...game.away_team_data, ...resolved[1] },
  };
}
