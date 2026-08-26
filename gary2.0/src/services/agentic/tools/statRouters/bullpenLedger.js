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

// ─────────────────────────────────────────────────────────────────────────────
// Pen-window composition + leverage arms (Aug 26 2026, founder GO — the 6-8
// autopsy: the 7-game pen ERA decided eight picks and predicted nothing,
// because the number hid WHO threw those innings, how many came in blowout
// spots, and whether tonight's decisive arm is even in the sample).
// ─────────────────────────────────────────────────────────────────────────────

/** Outs → MLB "X.Y" innings string (Y = leftover outs). */
export function outsToIp(outs) {
  const o = Math.max(0, Math.trunc(Number(outs) || 0));
  return `${Math.floor(o / 3)}.${o % 3}`;
}

/**
 * One line stating what the window's ERA is actually made of: the arms by
 * innings, and how much of the work came in low-leverage (blowout-entry)
 * spots. Facts only — what that means for tonight is the brain's call.
 * @param {Array<{name: string, outs: number, margins?: Array<number|null>, marginOuts?: Array<{margin: number|null, outs: number}>}>} arms
 * @param {{ blowoutMargin?: number, topArms?: number }} [opts]
 */
export function penWindowComposition(arms, { blowoutMargin = 4, topArms = 5 } = {}) {
  const list = (arms || []).filter((a) => a && Number(a.outs) > 0);
  if (!list.length) return null;
  const totalOuts = list.reduce((s, a) => s + Number(a.outs), 0);
  const byIp = [...list].sort((a, b) => Number(b.outs) - Number(a.outs));
  const named = byIp.slice(0, topArms).map((a) => `${a.name} ${outsToIp(a.outs)}IP`);
  const rest = byIp.length - named.length;

  let blowoutOuts = 0;
  let unknownOuts = 0;
  for (const a of list) {
    for (const seg of a.marginOuts || []) {
      const o = Number(seg.outs) || 0;
      if (seg.margin == null) unknownOuts += o;
      else if (Math.abs(seg.margin) >= blowoutMargin) blowoutOuts += o;
    }
  }

  const parts = [
    `arms: ${named.join(', ')}${rest > 0 ? `, +${rest} more` : ''}`,
    `${outsToIp(blowoutOuts)} of ${outsToIp(totalOuts)} IP entered with a margin of ${blowoutMargin}+ (blowout innings count the same in the ERA above)`,
  ];
  if (unknownOuts > 0) parts.push(`entry context unknown for ${outsToIp(unknownOuts)} IP`);
  return parts.join('; ');
}

/**
 * The arms most used in close spots across the window — the likely late-game
 * arms tonight, ranked by close-entry appearances (margin ≤ closeMargin),
 * then total pitches. Returns the raw records; the caller formats and may
 * attach season stats. Never invents an arm: only what the window recorded.
 * @param {Array<{pid?: number, name: string, outs: number, er?: number, pitches?: number, dates?: string[], marginOuts?: Array<{margin: number|null, outs: number}>}>} arms
 * @param {{ closeMargin?: number, top?: number }} [opts]
 */
export function penLeverageArms(arms, { closeMargin = 2, top = 3 } = {}) {
  const scored = (arms || [])
    .filter((a) => a && Number(a.outs) > 0)
    .map((a) => ({
      ...a,
      closeApps: (a.marginOuts || []).filter((s) => s.margin != null && Math.abs(s.margin) <= closeMargin).length,
    }))
    .filter((a) => a.closeApps > 0);
  scored.sort((a, b) => (b.closeApps - a.closeApps) || ((b.pitches || 0) - (a.pitches || 0)));
  return scored.slice(0, top);
}
