import { isFinalSettlementStatus } from './gameSettlement.js';

// Shared MLB settlement evidence. Missing measurements stay unavailable; a
// pitcher's market never borrows the batter's field on a two-way player row.
export function mlbStatNumber(value) {
  if (value == null || !['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function mlbPropActual(token, row) {
  if (!row || typeof row !== 'object') return null;
  const t = String(token ?? '').toLowerCase();
  const read = (...keys) => {
    for (const key of keys) if (row[key] != null) return mlbStatNumber(row[key]);
    return null;
  };
  const sum = (...keys) => {
    const values = keys.map(key => read(key));
    if (values.some(value => value == null)) return null;
    const total = values.reduce((a, b) => a + b, 0);
    return Number.isSafeInteger(total) ? total : null;
  };

  if (t.includes('hits_runs_rbi') || t.includes('h+r+rbi')) return sum('hits', 'runs', 'rbi');
  // These tokens contain their batter cousins, so all pitching routes come first.
  if (t.includes('pitcher_walk') || t.includes('walks_allowed')) return read('p_bb');
  if (t.includes('pitcher_hit') || t.includes('hits_allowed')) return read('p_hits');
  if (t.includes('pitcher_home_run') || t.includes('home_runs_allowed')) return read('p_hr');
  if (t.includes('pitcher_earned') || t.includes('earned_run')) return read('er');
  if (t.includes('pitcher_out') || t.includes('outs_recorded')) {
    if (row.ip == null || !['number', 'string'].includes(typeof row.ip)) return null;
    const match = String(row.ip).trim().match(/^(\d+)(?:\.([012]))?$/);
    if (!match) return null;
    const outs = Number(match[1]) * 3 + Number(match[2] ?? 0);
    return Number.isSafeInteger(outs) ? outs : null;
  }
  if (t.includes('strikeout')) return t.includes('pitcher') ? read('p_k') : read('k');
  if (t.includes('hit') && !t.includes('run') && !t.includes('allow') && !t.includes('pitcher')) return read('hits');
  if (t.includes('home_run') || t.includes('homer')) return read('hr', 'home_runs');
  if (t.includes('total_base')) return read('total_bases');
  if (t.includes('rbi') || t.includes('runs_batted')) return read('rbi');
  if (t.includes('runs_scored') || t === 'runs') return read('runs');
  if (t.includes('walk') || t.includes('bases_on_ball')) return read('bb');
  if (t.includes('stolen_base') || t.includes('steal')) return read('stolen_bases', 'sb');
  if (t.includes('triple')) return read('triples');
  if (t.includes('double') && !t.includes('play')) return read('doubles');
  if (t.includes('single')) {
    const parts = [read('hits'), read('doubles'), read('triples'), read('hr', 'home_runs')];
    if (parts.some(value => value == null)) return null;
    const singles = parts[0] - parts[1] - parts[2] - parts[3];
    return singles >= 0 ? singles : null;
  }
  return null;
}

const scalar = value => value != null && ['number', 'string'].includes(typeof value)
  && String(value).trim() !== '' ? String(value).trim() : null;
const normalizedName = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
const playerName = player => normalizedName(player?.full_name || `${player?.first_name || ''} ${player?.last_name || ''}`);

/** An exact id is authoritative. Otherwise prefer exact names before a unique abbreviation. */
export function findMlbSettlementPlayer(rows, { playerId = null, name = '' } = {}) {
  const id = scalar(playerId);
  const target = normalizedName(name);
  let matches;
  if (id) matches = rows.filter(row => scalar(row.player?.id) === id);
  else {
    matches = rows.filter(row => playerName(row.player) === target && target !== '');
    if (!matches.length && target) {
      const parts = target.split(' ');
      // Only a genuinely abbreviated input may fall back to initial/surname.
      // Full but different names are different people, even with the same initial.
      if (parts[0].length === 1 && parts.length > 1) {
        matches = rows.filter(row => {
          const full = playerName(row.player).split(' ');
          return full[0]?.startsWith(parts[0]) && full.slice(1).join(' ') === parts.slice(1).join(' ');
        });
      }
    }
  }
  if (matches.length === 1) return { status: 'found', row: matches[0] };
  return { status: matches.length ? 'ambiguous' : 'missing', row: null };
}

/** Reject mixed-game or malformed rows before they can become stats or a DNP claim. */
export function validateMlbSettlementBox(rows, gameId) {
  if (!Array.isArray(rows)) throw new Error('MLB settlement box is not an array');
  const id = scalar(gameId);
  if (!id) throw new Error('MLB settlement requires an exact game id');
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || scalar(row.game_id ?? row.game?.id) !== id || !scalar(row.player?.id)
      || (row.game_id != null && row.game?.id != null && scalar(row.game_id) !== scalar(row.game.id))) {
      throw new Error('MLB settlement box contains an invalid game/player identity');
    }
    const status = row.game?.status;
    if (status != null && !isFinalSettlementStatus(status)) {
      throw new Error('MLB settlement box contains a non-final game row');
    }
    const key = scalar(row.player.id);
    if (seen.has(key)) throw new Error('MLB settlement box contains duplicate player rows');
    seen.add(key);
  }
  return rows;
}

// Pagination completion alone cannot establish absence from a suspiciously thin
// box. MLB needs two lineups; fewer than 18 players or either missing team stays pending.
export function canConfirmMlbAbsence(rows) {
  const players = new Set(rows.map(row => scalar(row.player?.id)).filter(Boolean));
  const teams = new Set(rows.map(row => scalar(row.team?.id)).filter(Boolean));
  return players.size >= 18 && teams.size === 2;
}

/** Collect every page for one game; no caller may cache a partial box as complete. */
export async function fetchMlbSettlementBox(gameId, fetchPage) {
  const rows = [];
  const seen = new Set();
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    const response = await fetchPage(cursor);
    if (!Array.isArray(response?.data)) throw new Error('MLB settlement returned a malformed data page');
    rows.push(...response.data);
    const next = response?.meta?.next_cursor;
    if (next == null) return validateMlbSettlementBox(rows, gameId);
    if (!['number', 'string'].includes(typeof next) || String(next).trim() === ''
      || !response.data.length || seen.has(String(next))) {
      throw new Error('MLB settlement returned incomplete or repeated pagination');
    }
    seen.add(String(next));
    cursor = String(next);
  }
  throw new Error('MLB settlement pagination exceeded 50 pages');
}
