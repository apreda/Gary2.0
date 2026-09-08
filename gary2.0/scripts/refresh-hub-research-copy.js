#!/usr/bin/env node
// Preview-only unless --apply and the explicitly reviewed row IDs are supplied.
// Restore eligible original measurements; no model/provider calls or new rows.
import '../src/loadEnv.js';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { getESTDate } from '../src/utils/dateUtils.js';
import { researchCopyCasArguments, saveResearchReceipt } from './lib/researchCopyStorage.js';
import { legacyResearchUpgradeDecision, legacyResearchUpgradePatch, hasVisibleResearchRecommendation, backupLegacyResearchRow } from './lib/legacyHubResearch.js';
import { reviewedFreshOneRunPatch } from './lib/freshHubResearch.js';

const args = process.argv.slice(2), options = {};
if (args.includes('--help')) {
  console.log('Usage: node scripts/refresh-hub-research-copy.js --output PATH [--ids ID,ID] [--fresh-source PATH] [--apply]\nPreview is the default. --apply requires explicit reviewed IDs. --fresh-source is a separately reviewed one-run source artifact and requires exactly its target ID. Immutable originals are saved alongside the atomic receipt before any write. Only today’s eligible ungraded MLB observations can change.');
  process.exit(0);
}
for (let index = 0; index < args.length; index++) {
  const flag = args[index];
  if (flag === '--apply') { options.apply = true; continue; }
  if (!['--ids', '--output', '--fresh-source'].includes(flag) || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Invalid option: ${flag}`);
  options[flag.slice(2)] = args[++index];
}
if (!options.output) throw new Error('--output is required for the original-row audit and receipt');
if (options.apply && !options.ids) throw new Error('--apply requires the explicit reviewed --ids list');
const ids = options.ids?.split(',');
if (ids && (ids.some(id => !/^\d+$/.test(id)) || new Set(ids).size !== ids.length)) throw new Error('--ids must be distinct numeric IDs');
const freshSource = options['fresh-source'] ? JSON.parse(await readFile(options['fresh-source'], 'utf8')) : null;
if (freshSource && (!ids || ids.length !== 1 || ids[0] !== String(freshSource.target_row_id))) throw new Error('--fresh-source requires exactly its reviewed target --ids value');
const host = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!host || !key) throw new Error('Existing service-role connection is required');
const date = getESTDate();
const request = async (filters, method = 'GET', body) => {
  const url = new URL(body ? '/rest/v1/rpc/replace_current_hub_research' : '/rest/v1/insight_connections', host);
  url.search = new URLSearchParams(filters).toString();
  const response = await fetch(url, { method, headers: { apikey: key, Authorization: `Bearer ${key}`,
    ...(body ? { 'Content-Type': 'application/json', Prefer: 'return=representation' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`Research ${method} failed with HTTP ${response.status}`);
  return response.json();
};
const scope = { date: `eq.${date}`, league: 'eq.MLB', result: 'is.null', graded_at: 'is.null' };
const originals = await request({ ...scope, select: '*', order: 'id.asc', limit: '1000' });
if (originals.length >= 1000) throw new Error('Preview reached its row bound; no changes made');
const patchFor = row => freshSource ? reviewedFreshOneRunPatch(row, freshSource, date) : legacyResearchUpgradePatch(row, date);
const inventory = originals.map(row => ({ id: row.id, category: row.category, headline: row.headline,
  ...(freshSource ? { eligible: Boolean(patchFor(row)), reason: patchFor(row) ? 'reviewed_fresh_source_measurements' : 'outside_reviewed_fresh_source' } : legacyResearchUpgradeDecision(row, date)),
  flagged_visible_preference: hasVisibleResearchRecommendation(row), proposed: patchFor(row)?.detail || null }));
const selected = originals.filter(row => (!ids || ids.includes(String(row.id))) && patchFor(row));
if (ids && selected.length !== ids.length) throw new Error('One or more reviewed IDs are no longer eligible; run a fresh preview');
const report = { captured_at: new Date().toISOString(), date, mode: options.apply ? 'apply' : 'preview',
  ...(freshSource ? { reviewed_fresh_source_path: resolve(options['fresh-source']), reviewed_fresh_source: freshSource } : {}),
  originals, inventory, selected_ids: selected.map(row => row.id), backups: [], applied: [], skipped: [] };
const save = () => saveResearchReceipt(options.output, report);
await save();
if (options.apply) {
  // Finish every immutable original before the first mutation. Mutable receipts
  // never serve as the sole copy of pre-publication evidence.
  for (const row of selected) report.backups.push({ id: row.id,
    path: await backupLegacyResearchRow(row, `${resolve(options.output)}.originals`) });
  await save();
  for (const row of selected) {
    if (date !== getESTDate()) throw new Error('Eastern date changed; remaining rows were preserved');
    const patch = patchFor(row);
    const changed = await request({}, 'POST', researchCopyCasArguments(row, patch));
    if (changed.length !== 1) { report.skipped.push({ id: row.id, reason: 'concurrent_change' }); await save(); continue; }
    const [verified] = await request({ ...scope, id: `eq.${row.id}`, select: '*' });
    if (!verified || verified.detail !== patch.detail || verified.meta?.read !== patch.detail
      || verified.meta?.evidence !== patch.detail || verified.meta?.research_copy_version !== patch.meta.research_copy_version) throw new Error(`Publication readback failed for ${row.id}`);
    report.applied.push({ id: row.id, verified });
    await save();
  }
}
const skippedReasons = inventory.filter(item => !item.eligible).reduce((counts, item) => {
  counts[item.reason] = (counts[item.reason] || 0) + 1; return counts;
}, {});
console.log(JSON.stringify({ date, mode: report.mode, inspected: originals.length, eligible: inventory.filter(item => item.eligible).length,
  selected_ids: report.selected_ids, applied_ids: report.applied.map(item => item.id), skipped: report.skipped,
  skipped_reasons: skippedReasons,
  flagged_outside_eligible: inventory.filter(item => !item.eligible && item.flagged_visible_preference).map(item => ({ id: item.id, category: item.category, reason: item.reason })),
  output: options.output }, null, 2));
if (report.skipped.length) process.exitCode = 1;
