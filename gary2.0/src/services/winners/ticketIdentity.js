// @ts-check
/** Exact stored ticket identity for prospective accounting; no current-price substitution. */
/** @param {unknown} value */
export const normalizeTicketText = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
/** @param {unknown} value */
export const storedTicketNumber = value => value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
/** Format check for historical rows, not calendar validation. @param {unknown} value */
export const storedTicketDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : null;

/** @param {import('../../contracts/boundaries.js').GameTicketFields} ticket */
export function gameTicketIdentity({ game_date, league, game_id, pick_text }) {
  const parts = [storedTicketDate(game_date), normalizeTicketText(league), normalizeTicketText(game_id), normalizeTicketText(pick_text)];
  return parts.every(Boolean) ? JSON.stringify(parts) : null;
}

/** @param {import('../../contracts/boundaries.js').PropTicketFields} ticket */
export function propTicketIdentity({ game_date, sport, game_id, player_name, prop_type, line_value, bet }) {
  /** @type {[unknown, string, string, string, string, number | null, string]} */
  const parts = [storedTicketDate(game_date), normalizeTicketText(sport), normalizeTicketText(game_id), normalizeTicketText(player_name), normalizeTicketText(prop_type), storedTicketNumber(line_value), normalizeTicketText(bet)];
  if (parts.some((part, index) => index === 5 ? part === null : !part)) return null;
  if (!['over', 'under'].includes(parts[6])) return null;
  return JSON.stringify(parts);
}

