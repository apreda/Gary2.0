/**
 * THE NFL PROP SHEETS (Sep 3 2026) — the football half of what THE PROP
 * SHEETS did for MLB on Sep 2: for every player on THE PROP BOARD, the exact
 * stat each of his markets settles on, printed as the numbers a bettor pulls
 * up before pricing it — his last games' actual values for that stat (newest
 * first), his per-game rate over that window, and his usage frame (attempts,
 * carries, targets a game).
 *
 * Two seasons, never merged. BDL publishes no rows for a season until its
 * first game is final, so a Week 1 board has nothing at all from the current
 * year; last year rides along under its own label and stays labeled all
 * season, so a September number can never read as this year's form.
 *
 * Numbers only, from the same summarized game rows the cleared counts use
 * (nflStatForProp is the one definition both read). Never a projection, never
 * a lean: the line is on the board, the history is here, the comparison is
 * Gary's.
 */
import { nflStatForProp } from '../agentic/nflPropsAgenticContext.js';

const norm = (s) => String(s || '').toLowerCase().trim();

const SHEET_GAMES = 10;

const fmtRate = (v) => (v == null ? null : (Math.round(v * 10) / 10).toFixed(1));

const fmtValue = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
};

const priceOf = (m) => {
  const f = (v) => (v == null ? null : (v > 0 ? `+${v}` : `${v}`));
  const over = f(m.over_odds);
  const under = f(m.under_odds);
  if (over != null && under != null) return `Over ${over} / Under ${under}`;
  if (over != null) return `Over ${over}`;
  if (under != null) return `Under ${under}`;
  return null;
};

const isTouchdownMarket = (propType) => /anytime_?(?:td|touchdown)/.test(norm(propType));

/** Games newest first, completed only — the shape summarizeNflPlayerGameLogs returns. */
const gamesOf = (logs) => {
  const games = Array.isArray(logs?.games) ? logs.games : Array.isArray(logs) ? logs : [];
  return games.slice(0, SHEET_GAMES);
};

/**
 * One season's clause for one market: the actual values newest first, how
 * many games they are, and the per-game rate over them.
 */
export function seasonClause(games, propType, label) {
  const values = (games || []).map((g) => nflStatForProp(g, propType)).filter((v) => v != null);
  if (!values.length) return null;
  const total = values.reduce((a, b) => a + Number(b || 0), 0);
  const printed = values.map(fmtValue).join(' ');
  if (isTouchdownMarket(propType)) {
    const scored = values.filter((v) => Number(v) > 0).length;
    return `${label}: ${printed} (${values.length} g, scored in ${scored})`;
  }
  return `${label}: ${printed} (${values.length} g, ${fmtRate(total / values.length)} per game)`;
}

/** One market's sheet line: the price, then each season that has numbers. */
export function marketLine(propType, line, priceText, clauses) {
  const kept = clauses.filter(Boolean);
  if (!kept.length) return null;
  return `${propType} ${line}${priceText ? ` (${priceText})` : ''} — ${kept.join(' · ')}`;
}

/** The usage frame: the volume behind every market a skill player is priced on. */
export function usageLine(games, label) {
  const rows = games || [];
  if (!rows.length) return null;
  const per = (key) => {
    const values = rows.map((g) => Number(g?.[key])).filter((v) => Number.isFinite(v));
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  };
  const parts = [];
  const passAtt = per('pass_att');
  const rushAtt = per('rush_att');
  const targets = per('targets');
  const receptions = per('receptions');
  if (passAtt != null && passAtt >= 5) parts.push(`${fmtRate(passAtt)} pass attempts`);
  if (rushAtt != null && rushAtt >= 1) parts.push(`${fmtRate(rushAtt)} carries`);
  if (targets != null && targets >= 1) parts.push(`${fmtRate(targets)} targets`);
  else if (receptions != null && receptions >= 1) parts.push(`${fmtRate(receptions)} catches`);
  if (!parts.length) return null;
  return `${parts.join(', ')} per game (${label})`;
}

/**
 * Build the sheets for one football game.
 *
 * @param {object} args
 * @param {Array}  args.markets           the board's primary markets
 * @param {Map}    args.gamesByName       normalized name → current-season games (newest first)
 * @param {Map}    args.priorGamesByName  normalized name → prior-season games (newest first)
 * @param {Map}    args.positionByName    normalized name → position label
 * @param {string} args.seasonLabel       e.g. "2026"
 * @param {string} args.priorSeasonLabel  e.g. "2025"
 * @param {string} args.homeTeam
 * @param {string} args.awayTeam
 * @returns {{ text: string, players: number }}
 */
export function buildFootballPropSheets({
  markets,
  gamesByName,
  priorGamesByName = null,
  positionByName = null,
  seasonLabel = '',
  priorSeasonLabel = '',
  homeTeam = '',
  awayTeam = '',
}) {
  const byPlayer = new Map();
  for (const m of markets || []) {
    if (!m?.player || !m?.prop_type) continue;
    const key = norm(m.player);
    if (!byPlayer.has(key)) byPlayer.set(key, { name: m.player, team: m.team ?? null, markets: [] });
    byPlayer.get(key).markets.push(m);
  }
  if (!byPlayer.size) return { text: '', players: 0 };

  const teamMatches = (playerTeam, side) => {
    const a = norm(playerTeam).replace(/[^a-z0-9]/g, '');
    const b = norm(side).replace(/[^a-z0-9]/g, '');
    if (!a || !b) return false;
    return a.includes(b) || b.includes(a);
  };

  const blocks = [];
  const placed = new Set();
  let players = 0;

  const sheetFor = (key, entry) => {
    const current = gamesOf(gamesByName?.get(key));
    const prior = gamesOf(priorGamesByName?.get(key));
    if (!current.length && !prior.length) return null;
    const lines = [];
    for (const m of entry.markets) {
      const line = marketLine(m.prop_type, m.line, priceOf(m), [
        seasonClause(current, m.prop_type, seasonLabel || 'this season'),
        seasonClause(prior, m.prop_type, priorSeasonLabel || 'last season'),
      ]);
      if (line) lines.push(`   ${line}`);
    }
    if (!lines.length) return null;
    const usage = current.length
      ? usageLine(current, seasonLabel || 'this season')
      : usageLine(prior, priorSeasonLabel || 'last season');
    const position = positionByName?.get(key);
    const head = [`${entry.name}${position ? ` (${position})` : ''}`, usage].filter(Boolean).join(' · ');
    return [head, ...lines];
  };

  for (const side of [{ label: awayTeam, tag: 'away' }, { label: homeTeam, tag: 'home' }]) {
    const lines = [];
    for (const [key, entry] of byPlayer) {
      if (placed.has(key) || !teamMatches(entry.team, side.label)) continue;
      const sheet = sheetFor(key, entry);
      if (!sheet) continue;
      placed.add(key);
      players += 1;
      lines.push(...sheet);
    }
    if (lines.length) blocks.push(`${String(side.label).toUpperCase()} (${side.tag})\n${lines.join('\n')}`);
  }

  // Board players no side claimed (a team name the book spells its own way).
  const leftovers = [];
  for (const [key, entry] of byPlayer) {
    if (placed.has(key)) continue;
    const sheet = sheetFor(key, entry);
    if (!sheet) continue;
    players += 1;
    leftovers.push(...sheet);
  }
  if (leftovers.length) blocks.push(`ALSO ON THE BOARD\n${leftovers.join('\n')}`);

  if (!blocks.length) return { text: '', players: 0 };
  return {
    text: `═══ THE PROP SHEETS — the numbers each market settles on, newest first ═══\n${blocks.join('\n\n')}`,
    players,
  };
}

export default { buildFootballPropSheets };
