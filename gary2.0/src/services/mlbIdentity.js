import { MlbRequiredDataError } from './mlbDataReadiness.js';

/** StatsAPI identity only. BDL IDs must never enter these comparisons. */
export function mlbGameSide(game, teamId) {
  const matches = ['home', 'away'].filter(side => teamId != null
    && String(game?.teams?.[side]?.team?.id) === String(teamId));
  if (matches.length !== 1) throw new MlbRequiredDataError(`game ${game?.gamePk}: MLB team ${teamId} has ${matches.length} sides`);
  return matches[0];
}

export function mlbMatchup(game, homeId, awayId, eitherVenue = false) {
  const home = String(game?.teams?.home?.team?.id ?? '');
  const away = String(game?.teams?.away?.team?.id ?? '');
  if (homeId == null || awayId == null || String(homeId) === String(awayId)) return false;
  return (home === String(homeId) && away === String(awayId))
    || (eitherVenue && home === String(awayId) && away === String(homeId));
}

export function selectMlbScheduledGame(schedule, { homeId, awayId, startTime, gamePk }) {
  const date = new Date(startTime).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const candidates = schedule.filter(game => mlbMatchup(game, homeId, awayId)
    && (game.officialDate || new Date(game.gameDate).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })) === date);
  const exact = candidates.filter(game => gamePk != null ? String(game.gamePk) === String(gamePk)
    : Date.parse(game.gameDate) === Date.parse(startTime));
  const matches = exact.length ? exact : gamePk != null ? [] : candidates;
  if (matches.length !== 1) throw new MlbRequiredDataError(`MLB schedule ${date}: ${awayId}@${homeId} resolved to ${matches.length} games`);
  return matches[0];
}

/** Savant carries MLBAM player_id. Never assign a same-surname player's stats. */
export function findMlbPlayerStats(rows, playerId) {
  if (playerId == null) return null;
  const matches = (rows || []).filter(row => String(row.player_id ?? row.id) === String(playerId));
  if (matches.length > 1) throw new MlbRequiredDataError(`duplicate MLB player stats for ${playerId}`);
  return matches[0] || null;
}

export function partitionMlbPitchers(rows) {
  const pitchers = rows.filter(row => row.ip != null || Number(row.games_started) === 1);
  const starters = pitchers.filter(row => Number(row.games_started) === 1);
  if (starters.length !== 1 || pitchers.some(row => ![0, 1].includes(row.games_started))) {
    throw new MlbRequiredDataError('box score does not identify exactly one starting pitcher');
  }
  return { starter: starters[0], relievers: pitchers.filter(row => row !== starters[0]) };
}

/** Exact full-name crosswalk when the two providers use different player IDs. */
export function findMlbNamedPlayerStats(rows, playerName) {
  const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const key = normalize(playerName);
  const matches = (rows || []).filter(row => {
    const player=row.player || row;
    return key && normalize(player.full_name || player.fullName || `${player.first_name || ''} ${player.last_name || ''}`) === key;
  });
  if (matches.length > 1) throw new Error(`Ambiguous MLB player identity: ${playerName}`);
  return matches[0] || null;
}
