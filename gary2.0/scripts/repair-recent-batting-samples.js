#!/usr/bin/env node
// Preview-only unless --apply and the explicitly reviewed row IDs are supplied.
// Relabel today's ungraded MLB hot/cold sample units from the live provider
// window; counts never change. Originals are saved before any write.
import '../src/loadEnv.js';
import { resolve } from 'node:path';
import { getESTDate } from '../src/utils/dateUtils.js';
import { ballDontLieService as bdl } from '../src/services/ballDontLieService.js';
import { researchCopyCasArguments, saveResearchReceipt } from './lib/researchCopyStorage.js';
import { backupLegacyResearchRow } from './lib/legacyHubResearch.js';
import { recentBattingSampleRepair } from './lib/recentBattingSampleRepair.js';

const args = process.argv.slice(2), options = {};
if (args.includes('--help')) {
  console.log('Usage: node scripts/repair-recent-batting-samples.js --output PATH [--ids ID,ID] [--apply]\nPreview is the default. --apply requires explicit reviewed IDs. Only today’s ungraded MLB heat_check/cooling_off rows whose recent-window unit disagrees with the live provider window can change; counts are never altered.');
  process.exit(0);
}
for (let index = 0; index < args.length; index++) {
  const flag = args[index];
  if (flag === '--apply') { options.apply = true; continue; }
  if (!['--ids', '--output'].includes(flag) || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Invalid option: ${flag}`);
  options[flag.slice(2)] = args[++index];
}
if (!options.output) throw new Error('--output is required for the original-row audit and receipt');
if (options.apply && !options.ids) throw new Error('--apply requires the explicit reviewed --ids list');
const ids = options.ids?.split(',');
if (ids && (ids.some(id => !/^\d+$/.test(id)) || new Set(ids).size !== ids.length)) throw new Error('--ids must be distinct numeric IDs');
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
const scope = { date: `eq.${date}`, league: 'eq.MLB', category: 'in.(heat_check,cooling_off)', result: 'is.null', graded_at: 'is.null' };
const originals = await request({ ...scope, select: '*', order: 'id.asc', limit: '1000' });
if (originals.length >= 1000) throw new Error('Preview reached its row bound; no changes made');
// One live provider read per distinct player; the recent window is read by its exact name.
const season = Number(date.slice(0, 4));
const windows = new Map();
for (const playerId of new Set(originals.map(row => String(row.player_id)).filter(id => id !== 'null'))) {
  try {
    const splits = await bdl.getMlbPlayerSplits({ playerId: Number(playerId), season });
    const bucket = (Array.isArray(splits?.byDayMonth) ? splits.byDayMonth : [])
      .find(entry => String(entry?.split_name || '').trim().toLowerCase() === 'last 15 days') || null;
    windows.set(playerId, bucket);
  } catch (error) { windows.set(playerId, null); console.error(`[repair] player ${playerId}: ${error?.message || error}`); }
}
const repairFor = row => recentBattingSampleRepair(row, windows.get(String(row.player_id)) ?? null, date);
const inventory = originals.map(row => { const repair = repairFor(row); return { id: row.id, category: row.category, player_id: row.player_id,
  headline: row.headline, eligible: Boolean(repair.patch), reason: repair.reason, current: row.detail, proposed: repair.patch?.detail || null,
  source_window: windows.get(String(row.player_id)) ? { split_name: windows.get(String(row.player_id)).split_name,
    at_bats: windows.get(String(row.player_id)).at_bats, plate_appearances: windows.get(String(row.player_id)).plate_appearances ?? null } : null }; });
const selected = originals.filter(row => (!ids || ids.includes(String(row.id))) && repairFor(row).patch);
if (ids && selected.length !== ids.length) throw new Error('One or more reviewed IDs are no longer eligible; run a fresh preview');
const report = { captured_at: new Date().toISOString(), date, mode: options.apply ? 'apply' : 'preview',
  originals, inventory, selected_ids: selected.map(row => row.id), backups: [], applied: [], skipped: [] };
const save = () => saveResearchReceipt(options.output, report);
await save();
if (options.apply) {
  for (const row of selected) report.backups.push({ id: row.id, path: await backupLegacyResearchRow(row, `${resolve(options.output)}.originals`) });
  await save();
  for (const row of selected) {
    if (date !== getESTDate()) throw new Error('Eastern date changed; remaining rows were preserved');
    const { patch } = repairFor(row);
    const changed = await request({}, 'POST', researchCopyCasArguments(row, patch));
    if (changed.length !== 1) { report.skipped.push({ id: row.id, reason: 'concurrent_change' }); await save(); continue; }
    const [verified] = await request({ ...scope, id: `eq.${row.id}`, select: '*' });
    if (!verified || verified.detail !== patch.detail || verified.meta?.read !== patch.detail || verified.meta?.evidence !== patch.detail
      || verified.meta?.recent_sample?.unit !== patch.meta.recent_sample.unit || verified.meta?.recent_sample?.count !== patch.meta.recent_sample.count) throw new Error(`Publication readback failed for ${row.id}`);
    report.applied.push({ id: row.id, verified });
    await save();
  }
}
const reasons = inventory.reduce((counts, item) => { counts[item.reason] = (counts[item.reason] || 0) + 1; return counts; }, {});
console.log(JSON.stringify({ date, mode: report.mode, inspected: originals.length, eligible: inventory.filter(item => item.eligible).length,
  reasons, selected_ids: report.selected_ids, applied_ids: report.applied.map(item => item.id), skipped: report.skipped, receipt: resolve(options.output) }, null, 2));
