// Restore vetted original collector text on current, ungraded MLB research.
// This is a copy migration, not a new factual computation. Never treat a
// computed_detail field as inherently factual: older templates include opinions.
import { researchCopyIsSupported, HUB_RESEARCH_COPY_VERSION } from '../../src/services/insights/researchCopyPolicy.js';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OBSERVATIONAL_CATEGORIES = new Set([
  'heat_check', 'cooling_off', 'starter_team_record', 'starter_form',
  'head_to_head', 'rest_fatigue', 'first_inning',
  'streaking', 'regression_watch', 'owned',
]);

// These are observed interpretation patterns in the retired collector copy,
// plus explicit predictions/preferences. Unknown categories stay outside the
// migration; this finite screen is not a claim to verify arbitrary prose.
const interpretation = /\b(?:i|we)\s+(?:like|want|trust|expect|think|believe|give|prefer|would|lean)|\b(?:should|could|may|might|must|will|would|likely|unavailable|gassed|tired|vulnerable|sustainable|unsustainable|guaranteed|predict|prediction)\b|\b(?:revenge spot|free pass|different pitcher|soft matchups|best chance|wrong catcher|best bet|lines? still price|lines? price|line is doing|knocks down|says carry|is getting thrown out|has not caught up|hasn't caught up|lines up his way|makes? sense|needs? to|need him|I['’]m|my pick|he starts tonight|is starting tonight|confirmed starter)\b/i;

export function legacyResearchComputedCopy(row) {
  const computed = row?.meta?.computed_detail;
  // A probable starter is not a confirmed assignment. For this known template
  // only, omit its exact terminal assertion; every historical record and number
  // stays untouched. No generic sentence stripping or status substitution.
  return typeof computed === 'string' && row.category === 'starter_team_record'
    ? computed.replace(/ He starts tonight\.$/, '') : computed;
}

export function legacyResearchUpgradeDecision(row, today) {
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today) || row?.date !== today) return { eligible: false, reason: 'outside_current_date' };
  if (row?.league !== 'MLB' || !Object.hasOwn(row, 'result') || row.result !== null || row.graded_at != null) return { eligible: false, reason: 'outside_ungraded_mlb' };
  if (!['number', 'string'].includes(typeof row.id) || !Number.isSafeInteger(Number(row.id)) || Number(row.id) <= 0) return { eligible: false, reason: 'missing_stored_identity' };
  if (row.generated_by !== 'insights-cli' || !OBSERVATIONAL_CATEGORIES.has(row.category)
    || /fantasy|pick_rationale|daily_picks/i.test(String(row.meta?.source || ''))
    || /fantasy|pick_rationale/i.test(String(row.meta?.kind || ''))
    || row.meta?.pick_id != null || row.meta?.source_pick_id != null) return { eligible: false, reason: 'outside_observation_scope' };
  if (row.meta?.research_copy_version != null) return { eligible: false, reason: 'already_versioned' };
  const computed = legacyResearchComputedCopy(row);
  if (typeof computed !== 'string' || computed.trim().length < 25 || !/\d/.test(computed)) return { eligible: false, reason: 'missing_original_measurements' };
  if (typeof row.detail !== 'string' || row.detail === computed) return { eligible: false, reason: 'already_original_or_missing_detail' };
  if (!researchCopyIsSupported(computed, computed) || interpretation.test(computed)) return { eligible: false, reason: 'original_contains_interpretation' };
  return { eligible: true, reason: 'restore_original_measurements' };
}

export function legacyResearchUpgradePatch(row, today, upgradedAt = new Date().toISOString()) {
  if (!legacyResearchUpgradeDecision(row, today).eligible) return null;
  const detail = legacyResearchComputedCopy(row);
  return { detail, meta: { ...row.meta, read: detail, evidence: detail,
    research_copy_version: HUB_RESEARCH_COPY_VERSION,
    research_copy_source: 'original_computed_detail', research_copy_upgraded_at: upgradedAt,
    ...(detail !== row.meta.computed_detail ? { research_copy_omission: 'unconfirmed_starter_sentence' } : {}) } };
}

/** Report visible explicit preferences without pretending to detect every
 * opinion. This is for the preview/receipt's honest remaining-scope inventory. */
export function hasVisibleResearchRecommendation(row) {
  const visible = [row?.headline, row?.detail, row?.meta?.read].filter(value => typeof value === 'string').join(' ');
  return !researchCopyIsSupported(visible, visible) || /\b(?:I (?:trust|give|expect|think|believe)|makes? (?:the )?.{0,24}prop|positioned to|best route|best chance|can(?:not|'t|’t) afford|should (?:win|score|cover|clear|hit|throw|allow))\b/i.test(visible);
}

/** Local audit backup only: old prose is not reintroduced into public metadata.
 * The content hash makes retries idempotent and distinct source snapshots safe.
 * A backup failure must stop the corresponding publication. */
export async function backupLegacyResearchRow(row, directory) {
  const body = JSON.stringify(row, null, 2);
  const digest = createHash('sha256').update(body).digest('hex');
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${digest}.json`);
  try { await writeFile(path, body, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST' || await readFile(path, 'utf8') !== body) throw error;
  }
  return path;
}
