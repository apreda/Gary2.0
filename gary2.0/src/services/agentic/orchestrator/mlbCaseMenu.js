/**
 * THE CASE MENU (founder GO, Sep 1 2026): on a game where the favorite's
 * moneyline is heavier than the house limit, the bet is the run line (or
 * the underdog outright) — and Pass 1's opening line says so before the
 * read begins (Sep 2: the cases themselves argue who wins on every board). The Aug 28-31 ledger showed
 * every capped-favorite read finishing as "who wins" and being relabeled
 * onto -1.5 in Pass 2.5; 0 of 11 run-line rationales weighed the other
 * side of the 1.5. Menu language only — no factor, no direction.
 *
 * One source of truth for the headings: the Pass 1 builder and the
 * constitution's bilateral prompt (re-injected on stall/nudge paths) both
 * read from here, so Gary never sees two different pairs of headings in
 * one conversation.
 */
import { GAME_ML_CAP } from './orchestratorConfig.js';

const fmtPrice = (v) => (Number(v) > 0 ? `+${Number(v)}` : `${Number(v)}`);
const fmtMl = fmtPrice;
const priced = (v) => v != null && v !== '' && Number.isFinite(Number(v));
const fmtLine = (v) => `${Number(v) > 0 ? '+' : ''}${Number(v)}`;

/**
 * THE TICKET MENU — the one definition of what is a ticket on a board:
 * every priced moneyline not heavier than the cap, every priced spread/run
 * line. Used by the MLB desk, the football desk, and the Pass 1 headings.
 * Returns display strings; `dropped` names the capped moneylines.
 *
 * @returns {{ tickets: string[], dropped: string[], cap: number }}
 */
export function ticketMenu(game, homeTeam, awayTeam, cap = GAME_ML_CAP, order = 'home-first') {
  const sides = [
    { name: homeTeam, ml: game?.moneyline_home, sp: game?.spread_home, spOdds: game?.spread_home_odds },
    { name: awayTeam, ml: game?.moneyline_away, sp: game?.spread_away, spOdds: game?.spread_away_odds },
  ];
  if (order === 'away-first') sides.reverse();
  const tickets = [];
  const dropped = [];
  for (const s of sides) {
    if (priced(s.ml)) (Number(s.ml) < cap ? dropped : tickets).push(`${s.name} ${fmtMl(s.ml)}`);
    if (priced(s.sp) && priced(s.spOdds)) tickets.push(`${s.name} ${fmtLine(s.sp)} (${fmtPrice(s.spOdds)})`);
  }
  return { tickets, dropped, cap };
}

/** The desk's MENU TRUTH lines for a board: the capped price named, then the menu. */
export function menuTruthLines(game, homeTeam, awayTeam, { when = 'tonight', order = 'home-first' } = {}) {
  const { tickets, dropped, cap } = ticketMenu(game, homeTeam, awayTeam, GAME_ML_CAP, order);
  const lines = [];
  if (dropped.length) lines.push(`House limit: no moneyline heavier than ${cap}. ${dropped.join(' and ')} is past it and is not a ticket ${when}.`);
  if (tickets.length) lines.push(`Tickets on this game: ${tickets.join(' · ')}`);
  return lines;
}

/**
 * The capped menu for a game, or null when no moneyline is past the cap
 * (or the run line is unpriced — an unpriced line cannot be a ticket, so
 * the who-wins headings stand and the desk's MENU TRUTH line carries it).
 *
 * @returns {null | { fav, favLine, dog, dogLine, dogMl }} display strings
 */
export function mlbCappedMenu(game, homeTeam, awayTeam, cap = GAME_ML_CAP) {
  if (!game) return null;
  const sides = [
    { name: homeTeam, ml: game.moneyline_home, sp: game.spread_home, spOdds: game.spread_home_odds },
    { name: awayTeam, ml: game.moneyline_away, sp: game.spread_away, spOdds: game.spread_away_odds },
  ];
  const fav = sides.find((s) => priced(s.ml) && Number(s.ml) < cap);
  if (!fav) return null;
  const dog = sides.find((s) => s !== fav);
  if (!priced(fav.spOdds) || !priced(dog.spOdds) || !priced(dog.ml)) return null;
  if (Number(fav.sp) !== -1.5 || Number(dog.sp) !== 1.5) return null;
  return {
    fav: fav.name,
    favLine: `-1.5 (${fmtPrice(fav.spOdds)})`,
    dog: dog.name,
    dogLine: `+1.5 (${fmtPrice(dog.spOdds)})`,
    dogMl: fmtMl(dog.ml),
  };
}

/**
 * The two Pass 1 case headings, home first — who wins, on every board.
 * Sep 1 named the tickets on a capped game; founder, Sep 2 2026: a case
 * headed "+1.5" argued "it stays close" instead of the game (the Blue Jays
 * card). The cases argue who wins; the capped opener still says the
 * favorite's moneyline is not a ticket, and the run line or the dog outright
 * is chosen in Pass 2.5 with the board. `capped` still selects the opener.
 */
export function mlbCaseHeadings(homeTeam, awayTeam, game) {
  const H = (s) => String(s || '').toUpperCase();
  return {
    capped: Boolean(mlbCappedMenu(game, homeTeam, awayTeam)),
    home: `CASE FOR BACKING ${H(homeTeam)} TONIGHT:`,
    away: `CASE FOR BACKING ${H(awayTeam)} TONIGHT:`,
  };
}

/** Pass 1's opening sentence — the capped variant names the kind of bet, never the numbers. */
export function mlbPass1Opening(capped) {
  return capped
    ? "You're deciding what to bet on tonight's game below. The favorite's moneyline is past the house limit and is not a ticket, so the bet on this game is the run line, or the underdog outright. The tickets and their prices come at the end, after you've been through everything."
    : "You're deciding what to bet on tonight's game below. The betting options and their prices come at the end, after you've been through everything.";
}
