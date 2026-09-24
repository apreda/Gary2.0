// MLB HOUSE LIMIT (founder, Sep 24 2026). MLB is the one sport whose
// moneyline limit is -200: a moneyline up to and including -200 is a ticket;
// the favorite's moneyline past it is not. On such a game the desk names the
// game's tickets before Gary reads anything (the favorite's run line, the
// underdog's run line, the underdog's moneyline), the same way the main
// system's desk names them. Nothing is ever swapped after Gary decides: the
// June parser's rewrite of a heavy moneyline onto -1.5 is gone. A moneyline
// past the limit fails the game with no retry and an operational alert.
// Every other sport keeps GAME_ML_CAP; the Winners review keeps -179.

import { ticketMenu } from './orchestrator/mlbCaseMenu.js';

export const MLB_ML_CAP = -200;
export const MLB_HOUSE_LIMIT_CODE = 'mlb_house_limit';

/**
 * The desk's ticket lines for a board where a moneyline is past the limit,
 * or [] when every moneyline is a ticket (the desk is unchanged then).
 */
export function mlbTicketLines(game, homeTeam, awayTeam, cap = MLB_ML_CAP) {
  const { tickets, dropped } = ticketMenu(game, homeTeam, awayTeam, cap, 'home-first');
  if (!dropped.length) return [];
  const lines = [`House limit: no moneyline heavier than ${cap}. ${dropped.join(' and ')} is past it and is not a ticket on this game.`];
  if (tickets.length) lines.push(`Tickets on this game: ${tickets.join(' · ')}`);
  return lines;
}

/** True when a decision is a moneyline priced past the limit. */
export function mlbMoneylinePastLimit(decision, cap = MLB_ML_CAP) {
  if (!decision?.pick || !/moneyline|^ml$/i.test(String(decision.type || ''))) return false;
  const direct = Number(decision.odds);
  if (Number.isFinite(direct) && direct !== 0) return direct < cap;
  const m = String(decision.pick).match(/(-\d{3,4})\s*\)?\s*$/);
  return m ? parseInt(m[1], 10) < cap : false;
}
