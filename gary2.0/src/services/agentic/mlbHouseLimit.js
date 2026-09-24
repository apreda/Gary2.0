// MLB HOUSE LIMIT (founder, Sep 24 2026). MLB is the one sport whose
// moneyline limit is -200: a moneyline up to and including -200 is a ticket;
// the favorite's moneyline past it is not. On such a game that price is not
// on Gary's board at all (the desk's odds line and the odds tool), so his
// options are simply what the board shows: the favorite's run line, the
// underdog's moneyline and run line. Nothing is explained to him and nothing
// is swapped after he decides (the June parser's rewrite onto -1.5 is gone).
// A moneyline past the limit fails the game with no retry and an alert.
// Every other sport keeps GAME_ML_CAP; the Winners review keeps -179.

export const MLB_ML_CAP = -200;
export const MLB_HOUSE_LIMIT_CODE = 'mlb_house_limit';

const price = v => (v === null || v === undefined || v === '' ? NaN : Number(v));
const signed = v => `${Number(v) > 0 ? '+' : ''}${Number(v)}`;

/** 'home' | 'away' when that side's moneyline on the board is past the limit, else null. */
export function mlbCappedSide(game, cap = MLB_ML_CAP) {
  const home = price(game?.moneyline_home);
  const away = price(game?.moneyline_away);
  if (Number.isFinite(home) && home < cap) return 'home';
  if (Number.isFinite(away) && away < cap) return 'away';
  return null;
}

/** The desk's moneyline line: both prices, or only the underdog's when the favorite is past the limit. */
export function mlbMoneylineBoardLine(game, homeTeam, awayTeam) {
  const capped = mlbCappedSide(game);
  if (capped === 'home') return `Moneyline: ${awayTeam} ${signed(game.moneyline_away)}`;
  if (capped === 'away') return `Moneyline: ${homeTeam} ${signed(game.moneyline_home)}`;
  return `Moneyline: ${homeTeam} ${signed(game.moneyline_home)} / ${awayTeam} ${signed(game.moneyline_away)}`;
}

/** True when a decision is a moneyline priced past the limit. */
export function mlbMoneylinePastLimit(decision, cap = MLB_ML_CAP) {
  if (!decision?.pick || !/moneyline|^ml$/i.test(String(decision.type || ''))) return false;
  const direct = Number(decision.odds);
  if (Number.isFinite(direct) && direct !== 0) return direct < cap;
  const m = String(decision.pick).match(/(-\d{3,4})\s*\)?\s*$/);
  return m ? parseInt(m[1], 10) < cap : false;
}
