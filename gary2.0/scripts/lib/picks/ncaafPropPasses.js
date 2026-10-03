// College props run inside the game lane, so a later game retry must remember
// the accepted prop pass that NFL's separate scheduler lane already retains.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../../../logs/ncaaf-prop-passes/', import.meta.url));

function passIdentity(pick, game, date) {
  return createHash('sha256').update(JSON.stringify([
    'ncaaf-prop-pass-v1', date, String(game.bdl_game_id ?? game.game_id ?? game.id),
    game.commence_time, pick.pick, pick.rationale, pick.model, pick.prompt_sha,
  ])).digest('hex');
}

export async function readNcaafPropPass(pick, game, date) {
  const key = passIdentity(pick, game, date);
  let receipt;
  try { receipt = JSON.parse(await readFile(`${directory}${key}.json`, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (receipt.status !== 'pass' || receipt.source_hash !== key
    || !Number.isFinite(Date.parse(receipt.decided_at))
    || Date.parse(receipt.decided_at) >= Date.parse(game.commence_time)) {
    throw new Error('College prop pass receipt is invalid');
  }
  return receipt;
}

export async function storeNcaafPropPass(pick, game, date, { model = null, decidedAt = new Date().toISOString() } = {}) {
  if (!Number.isFinite(Date.parse(decidedAt)) || Date.parse(decidedAt) >= Date.parse(game.commence_time)) {
    throw new Error('College prop pass was not decided before kickoff');
  }
  const key = passIdentity(pick, game, date);
  const receipt = { status: 'pass', source_hash: key, game_date: date,
    game_id: String(game.bdl_game_id ?? game.game_id ?? game.id),
    kickoff: game.commence_time, decided_at: decidedAt, model };
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = `${directory}${key}.json`, temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(receipt) + '\n', { mode: 0o600 });
    await rename(temporary, destination);
  } finally { await rm(temporary, { force: true }); }
  return receipt;
}
