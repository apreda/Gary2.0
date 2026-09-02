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
 * THE GAME KIND (founder, Sep 2 2026): decided before any data is read.
 * A game is a MONEYLINE game (the question is who wins) or a RUN-LINE game
 * (the favorite's moneyline is past the house limit and the run line is
 * priced both sides at 1.5 — the tickets are the favorite -1.5 or the
 * underdog +1.5). Gary never sees the house limit or the menu mechanics;
 * he sees which game it is, the cases follow it, and the bet question is
 * the same in both: what's your bet, and what are the reasons why.
 *
 * @returns {{ kind: 'moneyline' } | { kind: 'runline', fav: string, dog: string }}
 */
export function mlbGameKind(game, homeTeam, awayTeam) {
  const menu = mlbCappedMenu(game, homeTeam, awayTeam);
  return menu ? { kind: 'runline', fav: menu.fav, dog: menu.dog } : { kind: 'moneyline' };
}

/**
 * The two Pass 1 case headings, home first — the club's name on every board.
 * (Founder, Sep 2 2026: a heading that says "-1.5" or "+1.5" sends the case
 * hunting margin and one-run stats; the cases argue the game. On a run-line
 * game the OPENER names the tickets, the headings do not.)
 */
export function mlbCaseHeadings(homeTeam, awayTeam, game) {
  const H = (s) => String(s || '').toUpperCase();
  const g = mlbGameKind(game, homeTeam, awayTeam);
  return {
    kind: g.kind,
    capped: g.kind === 'runline',
    fav: g.fav ?? null,
    dog: g.dog ?? null,
    home: `CASE FOR BACKING ${H(homeTeam)} TONIGHT:`,
    away: `CASE FOR BACKING ${H(awayTeam)} TONIGHT:`,
  };
}

/**
 * Pass 1's opening sentence: which game this is. THE BOARD COMES FIRST
 * (founder GO, Sep 2 2026): the price is the first thing on the desk, so
 * the read is an argument with the number from the first line — prices-last
 * produced reads with no question to answer.
 */
export function mlbPass1Opening(headings) {
  if (headings && headings.kind === 'runline') {
    return `You're deciding what to bet on tonight's game below. Tonight is a run-line game: ${headings.fav} -1.5 or ${headings.dog} +1.5. The board comes first; everything else follows.`;
  }
  return "You're deciding what to bet on tonight's game below. The board comes first; everything else follows.";
}
