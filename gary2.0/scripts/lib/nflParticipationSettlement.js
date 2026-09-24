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

const RECEIVING_MARKETS = new Set(['receiving_yards', 'receptions']);
const RUSHING_MARKETS = new Set(['rushing_yards', 'rushing_attempts']);
export const NFL_BOXED_ZERO_MARKETS = new Set([...RECEIVING_MARKETS, ...RUSHING_MARKETS, 'rushing_receiving_yards']);

/**
 * A player who IS in the complete final box but has a blank rushing or
 * receiving line (Sep 24 2026: Jaxson Dart, rushing yards, sat pending for
 * three days). He played; the blank is a zero only when his team's totals are
 * fully accounted for by its other players:
 *   receiving — the team's completions and passing yards equal its players'
 *               receptions and receiving yards;
 *   rushing   — the team's rushing attempts (team box) equal its players'
 *               rushing attempts.
 * Proof, not absence: anything that does not reconcile stays pending.
 */
export function nflBoxedPlayerZero({ game, playerId, rows, teamStats, market }) {
  if (!NFL_BOXED_ZERO_MARKETS.has(market) || !isFinalGameStatus(game?.status) || playerId == null
    || !Array.isArray(rows) || !rows.length) return null;
  if (rows.some(row => row._football_box_complete !== true || String(row._game_id) !== String(game.id)
    || String(row.game?.id) !== String(game.id) || !isFinalGameStatus(row.game?.status))) return null;
  const mine = rows.filter(row => String(row.player?.id) === String(playerId));
  if (mine.length !== 1) return null;
  const row = mine[0];
  const teamRows = rows.filter(other => String(other.team?.id) === String(row.team?.id));
  const sum = (pool, key) => pool.reduce((total, other) => total + number(other[key]), 0);

  const receivingZero = () => {
    if (row.receptions != null || row.receiving_yards != null) return false;
    const passers = teamRows.filter(other => other.passing_attempts != null || other.passing_completions != null || other.passing_yards != null);
    const receivers = teamRows.filter(other => other.receptions != null || other.receiving_yards != null);
    if (!passers.length || passers.some(other => number(other.passing_completions) == null || number(other.passing_yards) == null)
      || receivers.some(other => number(other.receptions) == null || number(other.receiving_yards) == null)) return false;
    return sum(passers, 'passing_completions') === sum(receivers, 'receptions')
      && sum(passers, 'passing_yards') === sum(receivers, 'receiving_yards');
  };
  const rushingZero = () => {
    if (row.rushing_attempts != null || row.rushing_yards != null) return false;
    const team = (teamStats || []).filter(stat => String(stat.team?.id) === String(row.team?.id)
      && String(stat.game?.id ?? game.id) === String(game.id));
    if (team.length !== 1 || number(team[0].rushing_attempts) == null) return false;
    const rushers = teamRows.filter(other => other.rushing_attempts != null);
    if (rushers.some(other => number(other.rushing_attempts) == null)) return false;
    return sum(rushers, 'rushing_attempts') === number(team[0].rushing_attempts);
  };

  if (RECEIVING_MARKETS.has(market)) return receivingZero() ? 0 : null;
  if (RUSHING_MARKETS.has(market)) return rushingZero() ? 0 : null;
  // rushing + receiving yards: each half is either on the box or proven zero.
  const rushing = row.rushing_yards != null ? number(row.rushing_yards) : (rushingZero() ? 0 : null);
  const receiving = row.receiving_yards != null ? number(row.receiving_yards) : (receivingZero() ? 0 : null);
  return rushing == null || receiving == null ? null : rushing + receiving;
}
