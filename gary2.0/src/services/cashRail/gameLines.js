/**
 * Cash Rail game lines, the same in every sport (split from settle.js, Oct 30 2026): the game total's over
 * cashes on the score that takes it past the line; the spreads and moneylines cash at the final. Gary's own
 * pick on the game is marked.
 */

export const MINUS = '−';
export const minusSign = s => String(s).replace(/^-/, MINUS);

/** True for the board market that is Gary's pick on the game. */
export function isGaryMarket(key, garyPick) {
  if (!garyPick) return false;
  if (garyPick.type === 'spread') return key === `game|spread|${garyPick.side}|${garyPick.line}`;
  if (garyPick.type === 'ml') return key === `game|ml|${garyPick.side}`;
  if (garyPick.type === 'total') return key === `game|total|over|${garyPick.line}`;
  return false;
}

/**
 * @param {{markets: object[], totalCash: Map<string, {play: object, pts: number}>, final: boolean,
 *          home: number, away: number, homeName: string, awayName: string, finalElapsed: number,
 *          garyPick: object|null, elapsedOf: Function, whenOf: Function}} input
 * @returns {object[]} hits
 */
export function gameLineHits({ markets, totalCash, final, home, away, homeName, awayName, finalElapsed, garyPick, elapsedOf, whenOf }) {
  const withGary = (key, h) => (isGaryMarket(key, garyPick) ? { ...h, gary: true } : h);
  const hits = [];
  for (const [key, c] of totalCash) {
    const m = markets.find(x => x.key === key);
    hits.push(withGary(key, { key, who: 'Game total', market: `Over ${m.line}`, price: m.price,
      elapsed: elapsedOf(c.play), when: whenOf(c.play), play: `Made it ${c.pts} points` }));
  }
  if (!final) return hits;
  const finalText = `Final ${Math.max(home, away)}–${Math.min(home, away)}`;
  for (const m of markets) {
    const side = m.propType.endsWith('_home') ? 'home' : m.propType.endsWith('_away') ? 'away' : null;
    if (!side) continue;
    const margin = side === 'home' ? home - away : away - home;
    const who = side === 'home' ? homeName : awayName;
    if (m.kind === 'spread' && margin + m.line > 0) {
      hits.push(withGary(m.key, { key: m.key, who, market: `Spread ${minusSign(m.label)}`, price: m.price,
        elapsed: finalElapsed, when: 'FINAL', play: finalText }));
    } else if (m.kind === 'ml' && margin > 0) {
      hits.push(withGary(m.key, { key: m.key, who, market: 'Moneyline', price: m.price,
        elapsed: finalElapsed, when: 'FINAL', play: finalText }));
    }
  }
  return hits;
}
