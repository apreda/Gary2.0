#!/usr/bin/env node
// Existing com.gary2.daily-insights job; no pick generation or scheduler restart.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { dailyContentStages, collegeCardStages, runDailyContent, selectContentStages } from './lib/dailyContentPipeline.js';

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const date = args[args.indexOf('--date') + 1] && args.includes('--date')
  ? args[args.indexOf('--date') + 1]
  : new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Expected --date YYYY-MM-DD');
const phase = args.includes('--phase') ? args[args.indexOf('--phase') + 1] : 'daily';
if (!['daily', 'college-cards'].includes(phase)) throw new Error('Expected --phase daily or college-cards');
const availableStages = phase === 'college-cards' ? collegeCardStages(date) : dailyContentStages(date);
const stages = selectContentStages(availableStages, args.includes('--stages') ? (args[args.indexOf('--stages') + 1] || '') : undefined);
if (args.includes('--plan')) {
  console.log(JSON.stringify({ date, phase, stages }, null, 2));
} else {
  const journal = process.env.GARY_CONTENT_JOURNAL || resolve(homedir(), 'Library/Logs/Gary2.0/daily-content-stages.jsonl');
  mkdirSync(dirname(journal), { recursive: true });
  const runId = `${new Date().toISOString()}-${process.pid}`;
  const onEvent = event => {
    const row = { run_id: runId, date, phase, ...event };
    console.log(`[daily-content] ${JSON.stringify(row)}`);
    appendFileSync(journal, `${JSON.stringify(row)}\n`);
  };
  const controller = new AbortController();
  const stop = () => controller.abort(new Error('Daily content job stopped'));
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  onEvent({ event: 'run-start', at: new Date().toISOString(), stages: stages.map(stage => stage.id) });
  try {
    const results = await runDailyContent(stages, { cwd, signal: controller.signal, onEvent });
    const failed = results.filter(r => r.status !== 'ok');
    onEvent({ event: 'run-end', at: new Date().toISOString(), status: failed.length ? 'failed' : 'ok', failed_stages: failed.map(r => r.stage) });
    process.exitCode = failed.length ? 1 : 0;
  } catch (error) {
    onEvent({ event: 'run-end', at: new Date().toISOString(), status: controller.signal.aborted ? 'cancelled' : 'failed', error: error.message });
    process.exitCode = controller.signal.aborted ? 130 : 1;
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
  }
}
