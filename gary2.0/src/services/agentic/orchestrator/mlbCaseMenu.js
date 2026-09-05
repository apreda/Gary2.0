/**
 * THE CASE MENU (founder GO, Sep 1 2026): on a game where the favorite's
 * moneyline is heavier than the house limit, the bet is the run line (or
 * the underdog outright) — and Pass 1's opening line says so before the
 * read begins (Sep 2: the cases themselves argue who wins on every board). The Aug 28-31 ledger showed
 * every capped-favorite read finishing as "who wins" and being relabeled
 * onto -1.5 in Pass 2; 0 of 11 run-line rationales weighed the other
 * side of the 1.5. Menu language only — no factor, no direction.
 *
 * One source of truth for the headings: the Pass 1 builder and the
 * constitution's bilateral prompt (re-injected on stall/nudge paths) both
 * read from here, so Gary never sees two different pairs of headings in
 * one conversation.
 */
import { GAME_ML_CAP } from './orchestratorConfig.js';
import { finiteMarketNumber, isAmericanPrice, footballMarketUnavailable } from '../../marketTruth.js';

const fmtPrice = (v) => (Number(v) > 0 ? `+${Number(v)}` : `${Number(v)}`);
const fmtMl = fmtPrice;
const priced = isAmericanPrice;
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
    if (finiteMarketNumber(s.sp) !== null && priced(s.spOdds)) tickets.push(`${s.name} ${fmtLine(s.sp)} (${fmtPrice(s.spOdds)})`);
  }
  return { tickets, dropped, cap };
}

/** Missing data cannot be repaired by switching models. Use the existing ticket
 * menu and house limit, then let a later scheduled attempt refresh the market. */
export function gameMarketUnavailable(game = {}, sport = '') {
  const football = footballMarketUnavailable(game, sport);
  if (football) return football;
  if (!/^(?:baseball_)?mlb$/i.test(sport) || ticketMenu(game, 'Home', 'Away').tickets.length) return null;
  return { error: 'No verified priced MLB ticket within the existing house limit. Refresh sportsbook data on the next scheduled attempt.',
    code: 'market_unavailable', retryModel: false };
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
 * THE CASE ORDER (founder GO, Sep 2 2026): which case is written last.
 * Home first on every game meant the away case was always the last thing
 * read before the bet — and the ledger showed the away side taken far more
 * often than the board suggests (Aug 18-Sep 1: the away favorite 82% of
 * the time it existed vs the home favorite 56%; away picks 49-54, home
 * 43-36). Alternate by game id, deterministically, so half the games read
 * home last; the ledger records which case was last and says in a week
 * whether "last case wins" is real. No id → home first.
 */
export function mlbCaseOrder(game) {
  const raw = game?.id ?? game?.bdl_game_id ?? game?.gamePk ?? null;
  if (raw == null || raw === '') return 'home-first';
  const n = Number(String(raw).replace(/\D/g, ''));
  if (!Number.isFinite(n)) return 'home-first';
  return n % 2 === 0 ? 'home-first' : 'away-first';
}

/**
 * The two Pass 1 case headings — the club's name on every board, in the
 * game's case order (`first`/`second`; `lastSide` names the club read last).
 * (Founder, Sep 2 2026: a heading that says "-1.5" or "+1.5" sends the case
 * hunting margin and one-run stats; the cases argue the game. On a run-line
 * game the OPENER names the tickets, the headings do not.)
 */
export function mlbCaseHeadings(homeTeam, awayTeam, game) {
  const H = (s) => String(s || '').toUpperCase();
  const g = mlbGameKind(game, homeTeam, awayTeam);
  const home = `CASE FOR BACKING ${H(homeTeam)} TONIGHT:`;
  const away = `CASE FOR BACKING ${H(awayTeam)} TONIGHT:`;
  const order = mlbCaseOrder(game);
  return {
    kind: g.kind,
    capped: g.kind === 'runline',
    fav: g.fav ?? null,
    dog: g.dog ?? null,
    home,
    away,
    order,
    first: order === 'home-first' ? home : away,
    second: order === 'home-first' ? away : home,
    lastSide: order === 'home-first' ? 'away' : 'home',
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
    return `You're deciding what to bet on tonight's game below. Tonight is a run-line game: ${headings.fav} -1.5 or ${headings.dog} +1.5. The board comes first; everything else follows.\n\n${MLB_PRICED_IN_SENTENCE}\n\n${MLB_WHERE_TO_LOOK}`;
  }
  return `You're deciding what to bet on tonight's game below. The board comes first; everything else follows.\n\n${MLB_PRICED_IN_SENTENCE}\n\n${MLB_WHERE_TO_LOOK}`;
}

/**
 * WHERE TO LOOK (founder GO, Sep 3 2026): the second half of the NBA change.
 * Feb 28's spread awareness came with a short list of what to look at for a
 * spread; the single sentence version that followed went 152-106. This is
 * the MLB list — where tonight lives on the desk. Investigation only: it
 * names places, never what a fact means for the bet.
 */
export const MLB_WHERE_TO_LOOK = "Where tonight lives on the desk: this starter against this lineup, by hand and by recent form; which arms in each pen can actually go tonight and who threw yesterday; who is out or back in the confirmed nine; the park and the weather tonight; and what the beat has reported today.";

/**
 * WHAT THE PRICE ALREADY HOLDS (founder GO, Sep 3 2026, wording verbatim).
 * The NBA precedent: one sentence naming what the spread was set after and
 * asking whether it accounted for those things correctly went 152-106
 * (+30u, ~2 SD) from Feb 28 to Apr 12 2026, after 162-146 without it, and
 * the single-sentence version beat the paragraphs. The MLB ledger (Aug 5 to
 * Sep 2) lost on favorites chosen for records, run differential and "the
 * better team" — the things already in the price. Awareness only: it names
 * what everyone can see and asks the question; no side, no factor, no word
 * about a price being cheap or expensive (a moneyline "is the price right"
 * leans to the dog; a spread leans nowhere).
 */
export const MLB_PRICED_IN_SENTENCE = 'The prices on the board were set after the starters, the records, the run differential, the season offense and pen numbers, and the park were known. The question is not whether those things exist, everyone can see them, but whether the price has accounted for them correctly for tonight\'s game. Records and run differential describe what has happened; they are not reasons for or against a price.';
