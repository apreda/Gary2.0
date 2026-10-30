/**
 * Cash Rail price board (Oct 29 2026): the pregame prices a game's bets are
 * shown at, frozen from the last snapshot before kickoff. One market per rung
 * (player + prop type + kind + line); its price is the best any book offered,
 * because that is what a fan could actually have gotten. Over/unders keep only
 * the over side: the board never shows an under. Prediction markets are not
 * books: their "odds" are contract prices, so they never set a price here.
 */

const BASE_TYPES = new Set([
  'anytime_td', 'first_td',
  'receiving_yards', 'rushing_yards', 'passing_yards', 'rushing_receiving_yards',
  'receptions', 'passing_tds',
  'interceptions', 'longest_reception', 'longest_rush', 'longest_pass',
]);
const WINDOWS = ['_1q', '_1h', '_2h'];

/** True for a prop type the settlement engine can grade from plays. */
export function settleableType(propType) {
  if (BASE_TYPES.has(propType)) return true;
  const w = WINDOWS.find(s => propType.endsWith(s));
  // Quarter and half windows only for touchdowns: a 1st-quarter yards line is
  // the same story as the game's ladder, told again at a shorter price.
  return Boolean(w) && propType.slice(0, -w.length) === 'anytime_td';
}

const PREDICTION_MARKETS = new Set(['polymarket', 'kalshi']);
const isBook = r => !PREDICTION_MARKETS.has(String(r?.vendor || '').toLowerCase());

export const decimalOdds = p => (p > 0 ? 1 + p / 100 : 1 + 100 / -p);
const FLOOR_DECIMAL = 1.5; // −200: shorter than that is the obvious stuff
const finitePrice = p => (Number.isFinite(p) && p !== 0 ? p : null);
const fmtLine = n => (Number.isInteger(n) ? String(n) : String(n));

function milestoneLabel(propType, line) {
  if (propType.startsWith('first_td')) return 'First TD';
  if (propType === 'double_double' || propType === 'triple_double') return 'Yes';
  return `${fmtLine(line)}+`;
}

/**
 * @param {object[]} propRows BDL player prop rows (NFL or NBA)
 * @param {object[]} gameOdds BDL game odds rows (one per book)
 * @param {{settleable?: (propType: string) => boolean}} [opts] the sport's gradeable prop types (NFL by default)
 * @returns {{ markets: Array<{key:string, playerId:number|null, propType:string, kind:string, line:number|null, label:string, price:number}> }}
 */
export function freezeBoard(propRows = [], gameOdds = [], { settleable = settleableType } = {}) {
  propRows = propRows.filter(isBook);
  gameOdds = gameOdds.filter(isBook);
  const markets = new Map();
  const offer = (m) => {
    if (m.price == null) return;
    // A rung nobody would bet (shorter than −200) is not worth a line on the board.
    if (m.playerId != null && decimalOdds(m.price) < FLOOR_DECIMAL) return;
    const have = markets.get(m.key);
    if (!have || decimalOdds(m.price) > decimalOdds(have.price)) markets.set(m.key, have ? { ...have, price: m.price } : m);
  };
  /** Every book hangs its own main line: keep the one most books hang (ties: the lower line). */
  const mainLine = (rows, lineOf) => {
    const counts = new Map();
    for (const r of rows) { const l = lineOf(r); if (Number.isFinite(l)) counts.set(l, (counts.get(l) ?? 0) + 1); }
    return [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]))[0]?.[0];
  };

  const overGroups = new Map();
  for (const r of propRows) {
    const propType = r?.prop_type;
    const line = Number(r?.line_value);
    if (!propType || !settleable(propType) || !Number.isFinite(line)) continue;
    const playerId = r.player_id ?? null;
    if (r.market?.type === 'milestone') {
      // "0.5" means one or more: a half-line milestone is the next whole number.
      const at = Number.isInteger(line) ? line : Math.ceil(line);
      offer({ key: `${playerId}|${propType}|milestone|${fmtLine(at)}`, playerId, propType, kind: 'milestone', line: at,
        label: milestoneLabel(propType, at), price: finitePrice(r.market.odds) });
    } else if (r.market?.type === 'over_under') {
      const g = `${playerId}|${propType}`;
      if (!overGroups.has(g)) overGroups.set(g, []);
      overGroups.get(g).push(r);
    }
  }
  for (const rows of overGroups.values()) {
    const line = mainLine(rows, r => Number(r.line_value));
    const { player_id: playerId, prop_type: propType } = rows[0];
    for (const r of rows.filter(x => Number(x.line_value) === line)) {
      offer({ key: `${playerId}|${propType}|over|${fmtLine(line)}`, playerId, propType, kind: 'over', line,
        label: `O ${fmtLine(line)}`, price: finitePrice(r.market.over_odds) });
    }
  }

  const total = mainLine(gameOdds, g => Number(g.total_value));
  for (const g of gameOdds.filter(x => Number(x.total_value) === total)) {
    offer({ key: `game|total|over|${fmtLine(total)}`, playerId: null, propType: 'game_total', kind: 'over', line: total,
      label: `O ${fmtLine(total)}`, price: finitePrice(g.total_over_odds) });
  }
  for (const side of ['home', 'away']) {
    const spread = mainLine(gameOdds, g => Number(g[`spread_${side}_value`]));
    for (const g of gameOdds.filter(x => Number(x[`spread_${side}_value`]) === spread)) {
      offer({ key: `game|spread|${side}|${fmtLine(spread)}`, playerId: null, propType: `game_spread_${side}`, kind: 'spread', line: spread,
        label: spread > 0 ? `+${fmtLine(spread)}` : fmtLine(spread), price: finitePrice(g[`spread_${side}_odds`]) });
    }
    for (const g of gameOdds) {
      offer({ key: `game|ml|${side}`, playerId: null, propType: `game_ml_${side}`, kind: 'ml', line: null,
        label: 'ML', price: finitePrice(g[`moneyline_${side}_odds`]) });
    }
  }

  return { markets: [...markets.values()] };
}
