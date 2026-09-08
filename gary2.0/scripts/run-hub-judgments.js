#!/usr/bin/env node
import '../src/loadEnv.js';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { runDailyContent } from './lib/dailyContentPipeline.js';
import { hubJudgmentRefreshStages } from './lib/hubJudgmentRefresh.js';

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const now = new Date();
const date = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const stages = hubJudgmentRefreshStages(date, now);
if (process.argv.includes('--plan')) {
  console.log(JSON.stringify({ date, stages }, null, 2));
} else if (stages.length) {
  const journal = resolve(homedir(), 'Library/Logs/Gary2.0/hub-judgment-refresh.jsonl');
  mkdirSync(dirname(journal), { recursive: true });
  const runID = `${now.toISOString()}-${process.pid}`;
  const onEvent = event => {
    const row = { run_id: runID, date, ...event };
    console.log(`[hub-judgments] ${JSON.stringify(row)}`);
    appendFileSync(journal, `${JSON.stringify(row)}\n`);
  };
  const controller = new AbortController();
  const stop = () => controller.abort(new Error('Hub refresh stopped'));
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  const deadline = setTimeout(() => controller.abort(new Error('Hub refresh exceeded its run budget')), 34 * 60_000);
  onEvent({ event: 'run-start', at: now.toISOString(), stages: stages.map(stage => stage.id) });
  try {
    const results = await runDailyContent(stages, { cwd, signal: controller.signal, onEvent });
    const failed = results.filter(result => result.status !== 'ok');
    onEvent({ event: 'run-end', at: new Date().toISOString(), status: failed.length ? 'failed' : 'ok',
      failed_stages: failed.map(result => result.stage) });
    process.exitCode = failed.length ? 1 : 0;
  } catch (error) {
    onEvent({ event: 'run-end', at: new Date().toISOString(), status: 'failed', error: error.message });
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
  }
}
