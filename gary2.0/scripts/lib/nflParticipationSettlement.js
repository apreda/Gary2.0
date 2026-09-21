import { nflverseCode } from '../../src/services/nflverseService.js';
import { isFinalGameStatus } from './resultsGradingReliability.js';

const name = value => String(value ?? '').normalize('NFKC').replace(/[’‘]/g, "'").toLowerCase().trim().replace(/\s+/g, ' ');
const number = value => value == null || typeof value === 'boolean' || String(value).trim() === '' ? null
  : Number.isFinite(Number(value)) ? Number(value) : null;

/** A zero requires positive participation AND a complete, reconciled receiving box. */
export function nflParticipatingReceiverZero({ game, player, pick, rows, snaps, market }) {
  if (!['receiving_yards', 'receptions'].includes(market) || !isFinalGameStatus(game?.status)
    || !pick?.player_id || String(player?.id) !== String(pick.player_id)
    || name(`${player.first_name} ${player.last_name}`) !== name(pick.player ?? pick.player_name)
    || !Array.isArray(rows) || !rows.length || !Array.isArray(snaps)) return null;
  const sides = [game.visitor_team, game.home_team];
  const team = sides.find(team => String(team?.id) === String(player.team?.id));
  if (!team || sides.some(side => !nflverseCode(side?.full_name))) return null;
  const teamCode = nflverseCode(team.full_name);
  const opponentCode = nflverseCode(sides.find(side => side.id !== team.id).full_name);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(game.date));
  const expectedGame = `${game.season}_${String(game.week).padStart(2, '0')}_${nflverseCode(game.visitor_team.full_name)}_${nflverseCode(game.home_team.full_name)}`;
  const inGame = snaps.filter(row => row.game_id === expectedGame && Number(row.season) === game.season
    && Number(row.week) === game.week && row.pfr_game_id?.startsWith(day.replaceAll('-', ''))
    && row.game_type === 'REG' && row.team === teamCode && row.opponent === opponentCode);
  const participant = inGame.filter(row => name(row.player) === name(pick.player ?? pick.player_name));
  if (inGame.length < 20 || participant.length !== 1 || !(number(participant[0].offense_snaps) > 0)) return null;
  if (rows.some(row => row._football_box_complete !== true || String(row._game_id) !== String(game.id)
    || String(row.game?.id) !== String(game.id) || !isFinalGameStatus(row.game?.status))) return null;
  if (rows.some(row => String(row.player?.id) === String(player.id)
    || name(`${row.player?.first_name} ${row.player?.last_name}`) === name(pick.player ?? pick.player_name))) return null;
  const teamRows = rows.filter(row => row.team?.id === team.id);
  const passers = teamRows.filter(row => row.passing_attempts != null || row.passing_completions != null || row.passing_yards != null);
  const receivers = teamRows.filter(row => row.receptions != null || row.receiving_yards != null);
  if (!passers.length || !receivers.length
    || passers.some(row => number(row.passing_completions) == null || number(row.passing_yards) == null)
    || receivers.some(row => number(row.receptions) == null || number(row.receiving_yards) == null)) return null;
  const sum = (pool, key) => pool.reduce((total, row) => total + number(row[key]), 0);
  if (sum(passers, 'passing_completions') !== sum(receivers, 'receptions')
    || sum(passers, 'passing_yards') !== sum(receivers, 'receiving_yards')) return null;
  return 0;
}
