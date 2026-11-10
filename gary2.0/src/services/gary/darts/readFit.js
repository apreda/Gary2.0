/**
 * THE GAME READS, FIT TO ONE ASK (founder, Nov 10 2026: every dart reads the game around the player). A game read runs
 * about 90,000 characters and one ask can carry a dozen games, which is past what one ask holds. When the games in an
 * ask run over the budget, every read in it keeps its newest games and drops the same number of its oldest, team by
 * team, and says how many it left off. Nothing else in a read is cut, and the players' own sheets are never cut.
 */
// What one ask aims to hold and the most it may hold, in characters, everything in it counted (the list he chose from,
// the reads, the sheets). About 3.6 characters to a token: 440,000 is near 122,000 tokens, 540,000 near 150,000.
export const ASK_TARGET_CHARS = Number(process.env.GARY_DARTS_ASK_TARGET_CHARS) || 440_000;
export const ASK_MOST_CHARS = Number(process.env.GARY_DARTS_ASK_MOST_CHARS) || 540_000;

const SECTION = /^THIS SEASON, GAME BY GAME/;
const TEAM_HEAD = /^\S.*newest first:\s*$/;
// A game's first line: two spaces, then the day. The count of games left off is not a game.
const GAME_START = /^ {2}(?!\(its \d+ games? (?:before these )?(?:is|are) not shown here\))\S/;

/** How many games the longest team log in a read holds; 0 for a block that is not a game read. */
export function gamesInRead(text) {
  let most = 0, n = 0, inside = false;
  for (const line of String(text || '').split('\n')) {
    if (SECTION.test(line)) { inside = true; continue; }
    if (!inside) continue;
    if (TEAM_HEAD.test(line)) { n = 0; continue; }
    if (/^\S/.test(line)) { inside = false; continue; }
    if (GAME_START.test(line)) most = Math.max(most, ++n);
  }
  return most;
}

/** The read with each team's newest `keep` games; the games left off are counted under the team. */
export function trimRead(text, keep) {
  const out = [];
  let inside = false, n = 0, dropped = 0, skipping = false;
  const close = () => { if (dropped) { while (out.length && out.at(-1) === '') out.pop(); out.push(`  (its ${dropped} game${dropped === 1 ? '' : 's'}${keep > 0 ? ' before these' : ''} ${dropped === 1 ? 'is' : 'are'} not shown here)`, ''); } dropped = 0; skipping = false; };
  for (const line of String(text || '').split('\n')) {
    if (SECTION.test(line)) { inside = true; out.push(line); continue; }
    if (!inside) { out.push(line); continue; }
    if (TEAM_HEAD.test(line)) { close(); n = 0; out.push(line); continue; }
    if (/^\S/.test(line)) { close(); inside = false; out.push(line); continue; }
    if (GAME_START.test(line)) { n += 1; skipping = n > keep; if (skipping) dropped += 1; }
    if (!skipping) out.push(line);
  }
  if (inside) close();
  return out.join('\n').replace(/\n+$/, '');
}

/**
 * The blocks of the games in one ask, fit to it: as they are when the ask stays within its target, otherwise every read at
 * the most games per team that does. One game per team is kept as long as the ask stays within the most it may hold;
 * past that the reads keep everything about tonight and leave the game logs off. `used` = the rest of the ask, in
 * characters (the list he chose from and the players' sheets).
 */
export function fitBlocks(blocks, gameIds, { used = 0, target = ASK_TARGET_CHARS, most = ASK_MOST_CHARS } = {}) {
  const ids = [...new Set((gameIds || []).map(String))].filter((k) => blocks.get(k));
  const size = (m) => used + ids.reduce((a, k) => a + String(m.get(k)).length, 0);
  if (size(blocks) <= target) return blocks;
  const games = Math.max(0, ...ids.map((k) => gamesInRead(blocks.get(k))));
  if (!games) return blocks;
  const at = (keep) => { const m = new Map(blocks); for (const k of ids) m.set(k, trimRead(blocks.get(k), keep)); return m; };
  for (let keep = games - 1; keep >= 1; keep--) { const m = at(keep); if (size(m) <= (keep === 1 ? most : target)) return m; }
  return at(0);
}
