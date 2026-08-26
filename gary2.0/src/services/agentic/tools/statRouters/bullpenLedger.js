/**
 * Bullpen-ledger helpers (Aug 17 2026, founder-authorized Aug 15 KC fix).
 *
 * Two defects lived inline in MLB_BULLPEN_WORKLOAD:
 *  - Ledger dates came from the UTC `gameDate` instant, so any 8pm+ ET game
 *    was stamped with the NEXT day's date. `officialDate` is MLB's own
 *    calendar date for the game and is authoritative.
 *  - Relievers were "everyone after pitchers[0]" with no position check, so a
 *    position player mopping up a blowout inflated the pen's arms-used count.
 */

import { etDateStr } from '../../../insights/shared.js';

/**
 * The official calendar date a game belongs to. Prefers MLB's `officialDate`;
 * falls back to the ET calendar date of the UTC start instant. Never a raw
 * UTC slice, and never an invented date.
 * @param {{ officialDate?: string, gameDate?: string } | null | undefined} game
 */
export function bullpenLedgerDate(game) {
  const official = String(game?.officialDate ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(official)) return official;
  if (game?.gameDate) return etDateStr(game.gameDate);
  return null;
}

/** Boxscore position codes that mean "this player is actually a pitcher".
 *  '1' = P; 'Y' / 'TWP' = two-way player (may legitimately pitch). */
function isPitcherPosition(position) {
  if (!position || (position.code == null && !position.abbreviation)) {
    // Absence of position data is not evidence of a position player — fail
    // open so a malformed record never hides real pen workload.
    return true;
  }
  const code = String(position.code ?? '');
  const abbr = String(position.abbreviation ?? '').toUpperCase();
  return code === '1' || code === 'Y' || abbr === 'P' || abbr === 'TWP';
}

/**
 * Relief appearances from one boxscore side, in appearance order.
 * pitchers[0] is the starter (appearance order); everyone after is relief —
 * but only entries whose box record is actually a pitcher count as pen arms.
 * @param {{ pitchers?: unknown, players?: Record<string, any> } | null | undefined} side
 * @returns {Array<{ pid: number, player: any }>}
 */
export function relieverBoxEntries(side) {
  const pitcherIds = Array.isArray(side?.pitchers) ? side.pitchers : [];
  const players = side?.players || {};
  const entries = [];
  for (const pid of pitcherIds.slice(1)) {
    const player = players[`ID${pid}`];
    if (!player) continue;
    if (!isPitcherPosition(player.position)) continue;
    entries.push({ pid, player });
  }
  return entries;
}

// (The Aug-26 pen-window composition and leverage-arms devices were retired
// the same day they shipped — founder duplication audit: composed prose
// restated the appearance ledger, and the game stories carry the pen's
// narrative. outsToIp stays: the ledger's own arithmetic.)

/** Outs → MLB "X.Y" innings string (Y = leftover outs). */
export function outsToIp(outs) {
  const o = Math.max(0, Math.trunc(Number(outs) || 0));
  return `${Math.floor(o / 3)}.${o % 3}`;
}
