import { completedGameStatus, numericStat } from './playerGameLogFacts.js';

const fields = ['passing_yards', 'passing_touchdowns', 'passing_attempts', 'passing_completions',
  'passing_interceptions', 'rushing_yards', 'rushing_attempts', 'rushing_touchdowns',
  'receiving_yards', 'receptions', 'receiving_targets', 'receiving_touchdowns'];

/** Filter the full season before choosing the recent window. Never average
 * duplicate or conflicting versions of the same player's game as new games. */
export function eligibleNflPlayerRows(raw, { asOf = new Date(), season, playerId } = {}) {
  const cutoff = new Date(asOf).getTime();
  if (!Number.isFinite(cutoff)) throw new Error('Invalid NFL player-log cutoff');
  const accepted = new Map();
  const conflicts = new Set();
  for (const row of raw || []) {
    const game = row?.game || {};
    const time = Date.parse(game.date || game.datetime || '');
    if (!Number.isFinite(time) || time >= cutoff || !completedGameStatus(game.status)) continue;
    const pid = row.player?.id ?? row.player_id;
    if (playerId != null && String(pid) !== String(playerId)) continue;
    if (season != null) {
      const stated = [game.season, row.season].filter(value => value != null);
      if (stated.some(value => Number(value) !== Number(season))) continue;
      // Preseason can begin in late July; January/February belong to the
      // preceding football season, never to the new calendar year's sample.
      if (time < Date.parse(`${season}-07-01`) || time >= Date.parse(`${Number(season) + 1}-07-01`)) continue;
    }
    const key = String(game.id ?? row.game_id ?? time);
    const identity = [row.team?.id ?? row.team_id, game.home_team?.id ?? game.home_team_id,
      game.visitor_team?.id ?? game.visitor_team_id ?? game.away_team?.id ?? game.away_team_id];
    const signature = JSON.stringify([time, ...identity, ...fields.map(field => numericStat(row[field]))]);
    if (accepted.has(key) && accepted.get(key).signature !== signature) conflicts.add(key);
    else if (!accepted.has(key)) accepted.set(key, { row, signature });
  }
  return [...accepted].filter(([key]) => !conflicts.has(key)).map(([, value]) => value.row);
}
