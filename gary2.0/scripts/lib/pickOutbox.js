/**
 * Pick outbox — write-ahead durability for generated picks (Aug 24 2026).
 *
 * Aug 23 post-mortem: a ~3-hour Supabase outage discarded five fully
 * generated MLB picks at the storage step, and the retry tiers re-ran the
 * ENTIRE research pipeline (7–23 min each) instead of just re-writing, which
 * starved the sequential MLB lane until later games' windows expired.
 *
 * The contract this module adds: a generated pick becomes durable ON DISK the
 * moment it exists, and is deleted only after the atomic RPC confirms it.
 * Storage dies mid-write, the child is SIGKILLed mid-retry, the laptop loses
 * power — the pick survives in logs/pick-outbox/ and the NEXT child run
 * flushes it straight to storage (seconds) instead of re-researching it.
 *
 * Boundaries (deliberate):
 *  - Real production runs only. Dry-run and --test runs never spool.
 *  - Flush is pregame-only: assertPicksStillPregame gates every flush, and an
 *    expired spool is dropped loudly. A bet never posts after first pitch.
 *  - Spools are keyed by lane + ET date + game ids, so a re-spool of the same
 *    failed batch overwrites instead of duplicating.
 *  - The atomic RPCs guard-skip already-present picks, so flushing a spool
 *    that (unbeknownst to us) DID land is harmless.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const here = dirname(fileURLToPath(import.meta.url));
export const OUTBOX_DIR = join(here, '..', '..', 'logs', 'pick-outbox');

export const OUTBOX_LANES = new Set(['daily', 'nfl_weekly']);

function spoolFileName(lane, dateStr, gameIds) {
  const idHash = createHash('sha256').update([...gameIds].sort().join(',')).digest('hex').slice(0, 12);
  return `${dateStr}__${lane}__${idHash}.json`;
}

function pickGameIds(picks) {
  return [...new Set(
    (picks || [])
      .map((p) => p?.bdl_game_id ?? p?.game_id)
      .filter((id) => id != null)
      .map(String),
  )];
}

/**
 * Persist a batch of generated picks before attempting storage.
 * Returns the spool path (or null when spooling itself failed — the spool is
 * defense-in-depth and must never block the live storage attempt).
 */
export function writeSpool(lane, dateStr, picks) {
  if (!OUTBOX_LANES.has(lane)) throw new Error(`Unknown outbox lane: ${lane}`);
  try {
    mkdirSync(OUTBOX_DIR, { recursive: true });
    const gameIds = pickGameIds(picks);
    const file = join(OUTBOX_DIR, spoolFileName(lane, dateStr, gameIds));
    // JSON round-trip = the exact sanitization the RPC path applies.
    writeFileSync(file, JSON.stringify({
      spooled_at: new Date().toISOString(),
      lane,
      date: dateStr,
      game_ids: gameIds,
      picks: JSON.parse(JSON.stringify(picks)),
    }, null, 2));
    return file;
  } catch (e) {
    console.warn(`⚠️ [Outbox] spool write failed (non-fatal): ${e.message}`);
    return null;
  }
}

/** Delete a spool after its picks are confirmed stored. Missing file is fine. */
export function removeSpool(file) {
  if (!file) return;
  try { unlinkSync(file); } catch { /* already gone — fine */ }
}

/** All spool files for one ET date (defaults to every pending file). */
export function listSpools(dateStr = null) {
  if (!existsSync(OUTBOX_DIR)) return [];
  return readdirSync(OUTBOX_DIR)
    .filter((name) => name.endsWith('.json'))
    .filter((name) => (dateStr ? name.startsWith(`${dateStr}__`) : true))
    .map((name) => join(OUTBOX_DIR, name));
}

export function readSpool(file) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (!OUTBOX_LANES.has(data?.lane) || !Array.isArray(data?.picks)) {
    throw new Error('malformed spool payload');
  }
  return data;
}

/**
 * Flush every pending spool for `dateStr` through the caller-provided
 * writers. Runs at child start (cheap no-op when the outbox is empty), so a
 * retry tier after a storage outage lands the rescued pick in seconds instead
 * of re-running research.
 *
 * @param {object} args
 * @param {string} args.dateStr ET date being processed
 * @param {(picks: object[]) => void} args.assertStillPregame throws when any pick's game started
 * @param {(picks: object[], dateStr: string) => Promise<{success: boolean, error?: string}>} args.storeDaily
 * @param {(picks: object[]) => Promise<{success: boolean, error?: string}>} args.storeNflWeekly
 * @returns {Promise<{flushed: string[], dropped: string[], failed: string[]}>} stored / expired-or-bad / still-pending game-id groups
 */
export async function flushOutbox({ dateStr, assertStillPregame, storeDaily, storeNflWeekly }) {
  const outcome = { flushed: [], dropped: [], failed: [] };
  const files = listSpools(dateStr);
  if (files.length === 0) return outcome;
  console.log(`📬 [Outbox] ${files.length} spooled pick batch(es) pending for ${dateStr} — flushing before new work`);

  for (const file of files) {
    let spool;
    try {
      spool = readSpool(file);
    } catch (e) {
      console.warn(`⚠️ [Outbox] dropping unreadable spool ${file}: ${e.message}`);
      removeSpool(file);
      outcome.dropped.push(file);
      continue;
    }
    const label = `${spool.lane} ${spool.game_ids.join(',') || '(no ids)'}`;
    try {
      assertStillPregame(spool.picks);
    } catch (e) {
      // The window is gone — a bet never posts after first pitch. Loud drop.
      console.warn(`⏭️ [Outbox] EXPIRED spool ${label}: ${e.message} — pick is lost, dropping spool`);
      removeSpool(file);
      outcome.dropped.push(label);
      continue;
    }
    try {
      const result = spool.lane === 'nfl_weekly'
        ? await storeNflWeekly(spool.picks)
        : await storeDaily(spool.picks, spool.date);
      if (!result?.success) throw new Error(result?.error || result?.message || 'writer returned failure');
      console.log(`✅ [Outbox] flushed spooled pick(s) for ${label}`);
      removeSpool(file);
      outcome.flushed.push(...spool.game_ids);
    } catch (e) {
      // Storage still down — keep the spool for the next tier's flush.
      console.warn(`⚠️ [Outbox] flush failed for ${label} (spool kept): ${e.message}`);
      outcome.failed.push(label);
    }
  }
  return outcome;
}

export default { writeSpool, removeSpool, listSpools, readSpool, flushOutbox, OUTBOX_DIR };
