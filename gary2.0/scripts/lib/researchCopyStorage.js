import { writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/** Metadata/detail CAS belongs in the POST body: legacy metadata can exceed the
 * HTTP URL/header limit. The database also enforces today's date and identity. */
export function researchCopyCasArguments(row, patch) {
  const id = (typeof row?.id === 'number' || typeof row?.id === 'string') ? Number(row.id) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0 || row?.league !== 'MLB'
    || row.generated_by !== 'insights-cli' || row.result !== null || row.graded_at != null
    || typeof row.detail !== 'string' || !row.meta || typeof row.meta !== 'object'
    || !patch || Object.keys(patch).some(key => !['detail', 'meta'].includes(key))
    || typeof patch.detail !== 'string' || patch.meta?.read !== patch.detail
    || patch.meta?.evidence !== patch.detail) throw new Error('Invalid research snapshot or patch');
  const identity = value => value == null ? null : String(value);
  return { p_id: id, p_date: row.date, p_league: row.league, p_category: row.category,
    p_generated_by: row.generated_by, p_game_id: identity(row.game_id), p_team_id: identity(row.team_id),
    p_player_id: identity(row.player_id), p_expected_detail: row.detail,
    p_expected_meta: row.meta, p_patch: patch };
}

/** Originals live in immutable content-addressed files. A receipt replacement
 * is atomic, so interruption cannot truncate the last complete audit state. */
export async function saveResearchReceipt(path, report) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(report, null, 2), { flag: 'wx' });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}
