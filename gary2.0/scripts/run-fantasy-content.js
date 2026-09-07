#!/usr/bin/env node
// One hourly Fantasy owner on the existing Mac. Each league child has a bounded
// process group; its shared kernel lock also excludes concurrent manual runs.
import '../src/loadEnv.js';
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fantasyContentStages, fantasyContentRunBudgetMs, runDailyContent } from './lib/dailyContentPipeline.js';
import { createContentDatabaseGate } from './lib/contentDatabaseGate.js';
import { fantasyPartition } from '../src/services/insights/fantasyStorage.js';

const args = process.argv.slice(2);
const value = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--date') { if (!args[++i] || args[i].startsWith('--')) throw new Error('Missing Fantasy date'); }
  else if (!['--plan', '--scheduled'].includes(args[i])) throw new Error('Expected --date, --plan or --scheduled');
}
const now = new Date();
const date = value('--date') || now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
fantasyPartition(date, 'MLB');
const stages = fantasyContentStages(date, process.env, now);
const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (args.includes('--plan')) {
  console.log(JSON.stringify({ date, scheduled_hours_et: { MLB: '06:00–23:00 hourly', NFL: 'Every hour, including overnight' }, owner_timeout_ms: fantasyContentRunBudgetMs(stages), stages }, null, 2));
} else {
  const journal = resolve(homedir(), 'Library/Logs/Gary2.0/fantasy-content-stages.jsonl');
  mkdirSync(dirname(journal), { recursive: true });
  const runId = `${now.toISOString()}-${process.pid}`;
  const onEvent = event => {
    const row = { run_id: runId, date, ...event };
    console.log(`[fantasy-content] ${JSON.stringify(row)}`);
    appendFileSync(journal, `${JSON.stringify(row)}\n`);
  };
  const controller = new AbortController();
  const stop = () => controller.abort(new Error('Fantasy owner cancelled'));
  const timer = setTimeout(() => controller.abort(new Error('Fantasy owner exceeded its runtime budget')), fantasyContentRunBudgetMs(stages));
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  onEvent({ event: 'run-start', at: now.toISOString(), stages: stages.map(stage => stage.id) });
  try {
    // The hourly retry is already scheduled. A brief storage outage gets two
    // minutes to recover; a dead database must not consume the next hour's slot.
    const databaseReady = createContentDatabaseGate({ signal: controller.signal, onEvent, maxWaitMs: 2 * 60_000 });
    const results = await runDailyContent(stages, { cwd, signal: controller.signal, onEvent, databaseReady });
    const failed = results.filter(result => result.status !== 'ok');
    onEvent({ event: 'run-end', at: new Date().toISOString(), status: failed.length ? 'failed' : 'ok', failed_stages: failed.map(result => result.stage) });
    process.exitCode = failed.length ? 1 : 0;
  } catch (error) {
    onEvent({ event: 'run-end', at: new Date().toISOString(), status: controller.signal.aborted ? 'cancelled' : 'failed', error: error.message });
    process.exitCode = controller.signal.aborted ? 130 : 1;
  } finally {
    clearTimeout(timer);
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
  }
}
