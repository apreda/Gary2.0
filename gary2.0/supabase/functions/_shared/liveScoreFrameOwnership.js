/**
 * Live-score FRAME ownership (single-home decision, Aug 17 2026).
 *
 * The cloud live-scores edge function (pg_cron, ~1 min) is the SOLE writer of
 * MLB/NFL/NCAAF score frames. The local poller keeps every duty the cloud
 * function does not have: NBA/NHL frames, MLB outs/bases + cashed-prop events
 * (surgical PATCH so frame writers can never clobber them), grading queues,
 * football proof, and phantom-row cleanup.
 *
 * An unknown or missing league is LOCAL by default: the cloud function only
 * knows its three leagues, so failing open to the local writer is the side
 * that cannot silently lose coverage.
 */

export const CLOUD_OWNED_FRAME_LEAGUES = new Set(['MLB', 'NFL', 'NCAAF']);

/** @param {unknown} league */
export function isCloudOwnedFrameLeague(league) {
  return CLOUD_OWNED_FRAME_LEAGUES.has(String(league ?? '').trim().toUpperCase());
}

/**
 * Rows the LOCAL poller may upsert as score frames.
 * @param {Array<{ league?: unknown }>} rows
 */
export function localFrameRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => !isCloudOwnedFrameLeague(row?.league));
}
