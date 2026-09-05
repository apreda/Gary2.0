#!/usr/bin/env node
// No models, provider calls, mutations, repairs, or scheduler restarts.
import '../src/loadEnv.js';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { etDate, loadMorningHealth, evaluateMorningHealth } from './lib/morningHealth.js';

const args = process.argv.slice(2);
const flag = name => args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1)
  || (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const date = flag('--date') || etDate();
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Expected --date YYYY-MM-DD');
const url = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Supabase read credentials unavailable; health unverified');
const snapshot = await loadMorningHealth({ url, key, date });
const report = evaluateMorningHealth({ date, ...snapshot });
// These are observations of completed attempts, not instructions to restart.
// Bound the log read to the most recent records; older history remains on disk.
try {
  const path = process.env.GARY_CONTENT_JOURNAL || resolve(homedir(), 'Library/Logs/Gary2.0/daily-content-stages.jsonl');
  const rows = readFileSync(path, 'utf8').trim().split('\n').slice(-500).map(line => JSON.parse(line));
  const latest = new Map();
  for (const row of rows) if (row.date === date && row.event === 'stage-end' && row.stage !== 'morning-health') latest.set(row.stage, row);
  report.stages = [...latest.values()];
  const failed = report.stages.filter(stage => stage.status !== 'ok');
  if (failed.length) {
    report.status = 'fail';
    report.checks.push({ id: 'content-stages', status: 'fail', evidence: failed.map(stage => `${stage.stage}: ${stage.status} at ${stage.at}`).join('; ') });
  }
} catch (error) {
  report.stage_history = error.code === 'ENOENT' ? 'No timestamped stage journal yet; historical launchd logs are separate.' : `Stage history unavailable: ${error.message}`;
}
if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`MORNING HEALTH ${date} — ${report.status.toUpperCase()} — ${report.checked_at}`);
  for (const check of report.checks) console.log(`${check.status.toUpperCase().padEnd(7)} ${check.id}: ${check.evidence}`);
  if (report.stage_history) console.log(report.stage_history);
  console.log('A stale lane does not prove the scheduler stopped. Inspect the owning stage and provider error before any restart.');
}
process.exitCode = report.status === 'fail' ? 1 : 0;
