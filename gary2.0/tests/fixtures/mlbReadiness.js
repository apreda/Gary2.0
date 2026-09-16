import { assertMlbScoutReadiness } from '../../src/services/mlbDataReadiness.js';

export function mlbScoutFixture(game) {
  const home = game.homeTeam || game.home_team, away = game.awayTeam || game.away_team;
  const players = team => Array.from({ length: 9 }, (_, i) => `${team} Hitter ${i + 1}`);
  const lineup = team => `${team}:\n${players(team).map((name, i) => `  ${i + 1}. ${name} (CF) [Bats: R]`).join('\n')}\n  SP: ${team} Starter (Throws: R)`;
  const roster = team => `${team} (10 players)\nPosition Players: ${players(team).map(name => `${name} (CF)`).join(', ')}\nPitchers: ${team} Starter (P)`;
  return `MATCHUP: ${away} @ ${home}\n\n═══ CONFIRMED LINEUPS ═══\n${lineup(home)}\n\n${lineup(away)}\n\n═══ ROSTERS ═══\n${roster(home)}\n\n${roster(away)}`;
}

export function withMlbReadiness(pick) {
  if (!/^(MLB|baseball_mlb)$/i.test(pick.league || '')) return pick;
  return { ...pick, input_readiness: assertMlbScoutReadiness(mlbScoutFixture(pick), pick, {
    checkedAt: new Date(Date.parse(pick.commence_time) - 3600000).toISOString(),
  }) };
}
