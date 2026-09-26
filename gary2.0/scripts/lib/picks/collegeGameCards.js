// A COLLEGE GAME'S DATA LANDS WITH ITS PICK (founder, Sep 26 2026: "if a pick
// runs ... the data can't fill in later, it needs to be there before or when
// the pick hits"). The day's insight passes work a 42-game Saturday a few games
// at a time, so a noon pick could publish over a game page whose quarterbacks
// read DATA FAILED. The pick run now runs its own game's pass once Gary has
// decided and before the pick is stored: the budgeted college lanes
// (quarterbacks, availability) and the game's player cards, one game. The pass
// reads the dated research the pick's desk just collected (shared research
// cache), so it adds seconds, not a second search. The pick waits for it up to
// a cap; a slow or failed pass never holds a pick back.
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const LANES = ['computeNcaafQbWatch', 'computeNcaafAvailability'];
const HARD_CAP_MS = 15 * 60_000;

export function startCollegeGameCards({ gameId, date, log = console } = {}) {
  if (gameId == null || !date) return { wait: async () => false };
  let settle;
  const done = new Promise((resolve) => { settle = resolve; });
  try {
    const dir = join(ROOT, 'logs', 'game-cards');
    mkdirSync(dir, { recursive: true });
    const out = createWriteStream(join(dir, `${date}---ncaaf---${gameId}.log`), { flags: 'a' });
    const child = spawn(process.execPath, [
      join(ROOT, 'run-insight-connections.js'), '--date', date, '--league', 'NCAAF',
      '--lanes', LANES.join(','), '--games', String(gameId),
    ], { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(out);
    child.stderr.pipe(out);
    const timer = setTimeout(() => { try { child.kill('SIGTERM'); } catch {} }, HARD_CAP_MS);
    timer.unref?.();
    child.on('error', (err) => { clearTimeout(timer); log.warn(`[GameCards] ${gameId}: ${err.message}`); settle(false); });
    child.on('exit', (code) => { clearTimeout(timer); settle(code === 0); });
    log.log(`🗂️  [GameCards] ${gameId}: quarterbacks, availability and player cards started beside the pick`);
  } catch (err) {
    log.warn(`[GameCards] ${gameId}: could not start (${err.message})`);
    settle(false);
  }
  return {
    /** Resolves true once the game's pass finished, false on failure or after maxMs. */
    wait: (maxMs) => new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), maxMs);
      done.then((ok) => { clearTimeout(timer); resolve(ok); });
    }),
  };
}
