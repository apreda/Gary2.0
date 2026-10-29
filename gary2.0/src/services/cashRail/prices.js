/**
 * Cash Rail price board (Oct 29 2026): the pregame prices a game's bets are
 * shown at, frozen from the last snapshot before kickoff. One market per rung
 * (player + prop type + kind + line); its price is the best any book offered,
 * because that is what a fan could actually have gotten. Over/unders keep only
 * the over side: the board never shows an under.
 */

const BASE_TYPES = new Set([
  'anytime_td', 'first_td',
  'receiving_yards', 'rushing_yards', 'passing_yards', 'rushing_receiving_yards',
  'receptions', 'passing_tds', 'passing_completions', 'passing_attempts', 'rushing_attempts',
  'interceptions', 'longest_reception', 'longest_rush', 'longest_pass',
]);
const WINDOWS = ['_1q', '_1h', '_2h'];

/** True for a prop type the settlement engine can grade from plays. */
export function settleableType(propType) {
  if (BASE_TYPES.has(propType)) return true;
  const w = WINDOWS.find(s => propType.endsWith(s));
  return Boolean(w) && BASE_TYPES.has(propType.slice(0, -w.length)) && propType !== 'first_td' + w;
}

export const decimalOdds = p => (p > 0 ? 1 + p / 100 : 1 + 100 / -p);
const finitePrice = p => (Number.isFinite(p) && p !== 0 ? p : null);
const fmtLine = n => (Number.isInteger(n) ? String(n) : String(n));

function milestoneLabel(propType, line) {
  if (propType.startsWith('first_td')) return 'First TD';
  return `${fmtLine(line)}+`;
}

/**
 * @param {object[]} propRows BDL /nfl/v1/odds/player_props rows
 * @param {object[]} gameOdds BDL game odds rows (one per book)
 * @returns {{ markets: Array<{key:string, playerId:number|null, propType:string, kind:string, line:number|null, label:string, price:number}> }}
 */
export function freezeBoard(propRows = [], gameOdds = []) {
  const markets = new Map();
  const offer = (m) => {
    if (m.price == null) return;
    const have = markets.get(m.key);
    if (!have || decimalOdds(m.price) > decimalOdds(have.price)) markets.set(m.key, have ? { ...have, price: m.price } : m);
  };

  for (const r of propRows) {
    const propType = r?.prop_type;
    const line = Number(r?.line_value);
    if (!propType || !settleableType(propType) || !Number.isFinite(line)) continue;
    const playerId = r.player_id ?? null;
    if (r.market?.type === 'milestone') {
      offer({ key: `${playerId}|${propType}|milestone|${fmtLine(line)}`, playerId, propType, kind: 'milestone', line,
        label: milestoneLabel(propType, line), price: finitePrice(r.market.odds) });
    } else if (r.market?.type === 'over_under') {
      offer({ key: `${playerId}|${propType}|over|${fmtLine(line)}`, playerId, propType, kind: 'over', line,
        label: `O ${fmtLine(line)}`, price: finitePrice(r.market.over_odds) });
    }
  }

  for (const g of gameOdds) {
    const total = Number(g.total_value);
    if (Number.isFinite(total)) {
      offer({ key: `game|total|over|${fmtLine(total)}`, playerId: null, propType: 'game_total', kind: 'over', line: total,
        label: `O ${fmtLine(total)}`, price: finitePrice(g.total_over_odds) });
    }
    for (const side of ['home', 'away']) {
      const sv = Number(g[`spread_${side}_value`]);
      if (Number.isFinite(sv)) {
        offer({ key: `game|spread|${side}|${fmtLine(sv)}`, playerId: null, propType: `game_spread_${side}`, kind: 'spread', line: sv,
          label: sv > 0 ? `+${fmtLine(sv)}` : fmtLine(sv), price: finitePrice(g[`spread_${side}_odds`]) });
      }
      offer({ key: `game|ml|${side}`, playerId: null, propType: `game_ml_${side}`, kind: 'ml', line: null,
        label: 'ML', price: finitePrice(g[`moneyline_${side}_odds`]) });
    }
  }

  return { markets: [...markets.values()] };
}
