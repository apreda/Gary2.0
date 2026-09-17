#!/usr/bin/env node
import '../src/loadEnv.js';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { schedulerObservations, mergeDataFailures, healthObservations, winnersPropsObservations } from './lib/operationalAlerts.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const logRoot = resolve(homedir(), 'Library/Logs/Gary2.0');
const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Operational reporting requires service credentials');
const read = path => {
  if (statSync(path).size > 16 * 1024 * 1024) throw new Error('Operational input exceeds bounded read');
  return readFileSync(path, 'utf8');
};
const observations = [];
let complete = true;
try {
  const scheduler = resolve(root, 'logs/scheduler', `scheduler-${date}.log`);
  // Missing/unreadable logs cannot become an empty healthy observation.
  const parsed = schedulerObservations(read(scheduler), date);
  const failureDir = resolve(root, 'logs/data-readiness-failures');
  const nextUtcDate = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
  const files = existsSync(failureDir) ? readdirSync(failureDir).filter(f =>
    (f.startsWith(`${date}__`) || f.startsWith(`${nextUtcDate}__`)) && f.endsWith('.json')) : [];
  const failures = files.map(f => JSON.parse(read(resolve(failureDir, f)))).filter(row =>
    new Date(row.last_failed_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === date);
  mergeDataFailures(parsed, failures, date);
  observations.push(...parsed.active.values());
} catch {
  complete = false;
  observations.push({ key: 'collector:read', title: 'Failure records unreadable', detail: 'The collector could not read complete scheduler/data incident records; previous incidents remain open.' });
}
let schedulerAt = null;
try { schedulerAt = new Date(Number(read(resolve(logRoot, 'scheduler/heartbeat')).split(' ')[0])).toISOString(); } catch { /* reported below */ }
if (!schedulerAt || Date.now() - Date.parse(schedulerAt) > 3 * 60000) {
  observations.push({ key: 'scheduler:stalled', title: 'Gary scheduler heartbeat stopped', detail: 'No scheduler heartbeat for over three minutes. The existing watchdog owns recovery.' });
}
let health;
try { health = JSON.parse(read(resolve(logRoot, 'host-health-latest.json'))); } catch { /* unverified */ }
observations.push(...healthObservations(health));
try {
  const params = new URLSearchParams({ select: 'id,status,error,lease_until,input_snapshot', game_date: `eq.${date}`, order: 'id.asc', limit: '500' });
  const response = await fetch(`${url}/rest/v1/winners_props_health?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Prop selection ledger HTTP ${response.status}`);
  const runs = await response.json();
  if (!Array.isArray(runs) || runs.length >= 500) throw new Error('Incomplete prop selection ledger');
  observations.push(...winnersPropsObservations(runs, date));
  // Starting a retry is not recovery. Preserve existing incidents until the
  // comparison completes or records its next failure.
  if (runs.some(run => run.status === 'selecting')) complete = false;
} catch {
  complete = false;
  observations.push({ key: 'collector:winners-props', title: 'Winners prop monitoring unavailable', detail: 'The collector could not read the prop selection ledger; previous failure incidents remain open.' });
}
if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({ date, complete, scheduler_at: schedulerAt, observations }, null, 2));
} else {
  const response = await fetch(`${url}/rest/v1/rpc/report_operational_health`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_date: date, p_scheduler_at: schedulerAt, p_observations: observations, p_complete: complete }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Operational reporting HTTP ${response.status}; previous cloud state retained`);
  console.log(JSON.stringify({ reported_at: new Date().toISOString(), active: observations.length, complete }));
}
