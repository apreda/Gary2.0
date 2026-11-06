/**
 * One celebrations pass: for each live or just-finished Cash Rail board, draw
 * the plays that qualify and are not drawn yet — the team backdrop (cached per
 * team and kind) and each pose of the play's dance, in the scorer's number and
 * team colors — store them, and mark the row ready. A play whose art fails is
 * marked failed so the app never shows half a celebration.
 * Adapters are injected: `db`, `bdl.plays(gameId)`, `bdl.player(id)`, `art({prompt, transparent, slug})`
 * returning image bytes, and `store` (exists/put/url).
 */
import { celebrationPlays, cardWords, pickDance, DANCES, danceUniqueFrames, posePrompt, bgSpec, TEAM_LOOKS } from './celebrations.js';

const FRESH_GAME_SECONDS = 300;

/** @returns {Promise<number>} celebrations drawn this pass */
export async function runCelebrations({ db, bdl, art, store, limit = 2, log = () => {} }) {
  let drawn = 0;
  for (const board of await db.boards()) {
    const done = new Set(await db.existingPlayKeys(board.league, board.game_id));
    // Latest first: when a pass can't draw every play, the app only pops up the latest.
    // Only plays from the last five minutes of game clock: a celebration that
    // lands a quarter late is old news (and a finished game's backlog never draws).
    const fresh = p => board.elapsed_s == null || board.elapsed_s - p.elapsed <= FRESH_GAME_SECONDS;
    const plays = celebrationPlays(await bdl.plays(board.game_id), board.hits).filter(fresh).sort((a, b) => b.elapsed - a.elapsed);
    for (const p of plays) {
      if (drawn >= limit) return drawn;
      if (done.has(p.playKey)) continue;
      const who = await bdl.player(p.playerId);
      // Unplaced stays undrawn for the next pass: never another team's colors.
      if (!TEAM_LOOKS[who?.team]) continue;
      const team = who.team;
      const number = who?.number ? String(who.number) : '1';
      const other = p.otherId != null ? await bdl.player(p.otherId) : null;
      const { stat, ...words } = cardWords(p, who.name, other?.name);
      const dance = DANCES.find(d => d.id === pickDance(p.playKey, p.kind));
      const row = {
        league: board.league, game_id: board.game_id, play_key: p.playKey, hit_key: p.hit?.key ?? null,
        ...words, price: p.hit?.price ?? null, when_label: p.when,
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
        await db.markReady(p.playKey, { bg: store.url(bgPath), frames, seq: dance.seq, name: dance.name,
          ...(dance.prop ? { prop: dance.prop } : {}), ...(stat ? { stat } : {}) }, p.hit ? 'ready' : 'ready_nobet');
        drawn++;
        log(`celebration ${p.playKey}: ${words.who} #${number} ${team} · ${p.kind} · ${dance.name}`);
      } catch (e) {
        await db.markFailed(p.playKey);
        log(`celebration ${p.playKey} failed: ${e.message}`);
      }
    }
  }
  return drawn;
}
