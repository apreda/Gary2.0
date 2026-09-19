#!/usr/bin/env node
import '../src/loadEnv.js';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { schedulerObservations, mergeDataFailures, withoutPublishedGameFailures, healthObservations, winnersPropsObservations, collectorReadObservation } from './lib/operationalAlerts.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const logRoot = resolve(homedir(), 'Library/Logs/Gary2.0');
const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Operational reporting requires service credentials');
const read = path => {
  if (statSync(path).size > 16 * 1024 * 1024) throw Object.assign(new Error('Operational input exceeds bounded read'), { code: 'EINPUTSIZE' });
  return readFileSync(path, 'utf8');
};
const observations = [];
let complete = true;
let schedulerAt = null;
try { schedulerAt = new Date(Number(read(resolve(logRoot, 'scheduler/heartbeat')).split(' ')[0])).toISOString(); } catch { /* reported below */ }
let readSource = 'scheduler';
try {
  const scheduler = resolve(root, 'logs/scheduler', `scheduler-${date}.log`);
  // Missing/unreadable logs cannot become an empty healthy observation.
  const parsed = schedulerObservations(read(scheduler), date);
  readSource = 'data';
  const failureDir = resolve(root, 'logs/data-readiness-failures');
  const nextUtcDate = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
  const files = existsSync(failureDir) ? readdirSync(failureDir).filter(f =>
    (f.startsWith(`${date}__`) || f.startsWith(`${nextUtcDate}__`)) && f.endsWith('.json')) : [];
  const failures = files.map(f => JSON.parse(read(resolve(failureDir, f)))).filter(row =>
    new Date(row.last_failed_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === date);
  mergeDataFailures(parsed, failures, date);
  observations.push(...parsed.active.values());
} catch (error) {
  complete = false;
  const failure = collectorReadObservation(error, readSource, date, schedulerAt);
  if (failure) observations.push(failure);
}
if (!schedulerAt || Date.now() - Date.parse(schedulerAt) > 3 * 60000) {
  observations.push({ key: 'scheduler:stalled', title: 'Gary scheduler heartbeat stopped', detail: 'No scheduler heartbeat for over three minutes. The existing watchdog owns recovery.' });
}
let health;
try { health = JSON.parse(read(resolve(logRoot, 'host-health-latest.json'))); } catch { /* unverified */ }
const unresolved = withoutPublishedGameFailures(observations, health, date);
observations.splice(0, observations.length, ...unresolved);
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
try {
 const params=new URLSearchParams({select:'id,lane,status,error,created_at,expires_at',status:'neq.completed',limit:'500'});
 const r=await fetch(`${url}/rest/v1/subscription_model_jobs?${params}`,{headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error(`HTTP ${r.status}`);
 const jobs=await r.json();
 if(jobs.length>=500)throw new Error('Incomplete job observation');
 for(const job of jobs)if(job.status==='failed'||(job.status!=='completed'&&Date.parse(job.expires_at)<Date.now())) observations.push({key:`model-job:${job.id}`,title:`Model worker failure: ${job.lane}`,detail:job.error||'No subscription worker result before deadline',at:job.created_at});
} catch(error) { complete=false;observations.push({key:'collector:model-jobs',title:'Model worker monitoring failed',detail:error.message}); }
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
