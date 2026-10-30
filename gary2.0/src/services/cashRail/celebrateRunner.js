/**
 * One celebrations pass: for each live or just-finished Cash Rail board, draw
 * the plays that qualify and are not drawn yet — the team backdrop (cached per
 * team and kind) and each pose of the play's dance, in the scorer's number and
 * team colors — store them, and mark the row ready. A play whose art fails is
 * marked failed so the app never shows half a celebration.
 * Adapters are injected: `db`, `bdl.player(id)`, `art({prompt, transparent, slug})`
 * returning image bytes, and `store` (exists/put/url).
 */
import { celebrationPlays, pickDance, DANCES, danceUniqueFrames, posePrompt, bgSpec, TEAM_LOOKS } from './celebrations.js';

/** @returns {Promise<number>} celebrations drawn this pass */
export async function runCelebrations({ db, bdl, art, store, limit = 2, log = () => {} }) {
  let drawn = 0;
  for (const board of await db.boards()) {
    const done = new Set(await db.existingPlayKeys(board.league, board.game_id));
    for (const p of celebrationPlays(board.hits)) {
      if (drawn >= limit) return drawn;
      if (done.has(p.playKey)) continue;
      const who = await bdl.player(p.playerId);
      const team = TEAM_LOOKS[who?.team] ? who.team : 'GB';
      const number = who?.number ? String(who.number) : '1';
      const dance = DANCES.find(d => d.id === pickDance(p.playKey));
      const row = {
        league: board.league, game_id: board.game_id, play_key: p.playKey, hit_key: p.hit.key,
        who: p.hit.who, market: p.hit.market, price: p.hit.price, when_label: p.hit.when, play: p.hit.play,
        kind: p.kind, dance: dance.id, team, number,
      };
      if (!(await db.claim(row))) continue;
      try {
        const bg = bgSpec(p.kind, team);
        const bgPath = `${bg.key}.webp`;
        if (!(await store.exists(bgPath))) await store.put(bgPath, await art({ prompt: bg.prompt, transparent: false, slug: 'bg' }));
        const frames = {};
        await Promise.all(danceUniqueFrames(dance).map(async f => {
          const bytes = await art({ prompt: posePrompt(f.pose, TEAM_LOOKS[team], number), transparent: true, slug: f.slug });
          frames[f.slug] = await store.put(`frames/${board.game_id}/${p.playKey}/${f.slug}.webp`, bytes);
        }));
        await db.markReady(p.playKey, { bg: store.url(bgPath), frames, seq: dance.seq, name: dance.name });
        drawn++;
        log(`celebration ${p.playKey}: ${p.hit.who} #${number} ${team} · ${dance.name}`);
      } catch (e) {
        await db.markFailed(p.playKey);
        log(`celebration ${p.playKey} failed: ${e.message}`);
      }
    }
  }
  return drawn;
}
