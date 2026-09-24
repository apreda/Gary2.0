#!/usr/bin/env node
// Existing com.gary2.daily-insights job; no pick generation or scheduler restart.
import '../src/loadEnv.js';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { dailyContentStages, collegeCardStages, collegeCardRunBudgetMs, runDailyContent, selectContentStages } from './lib/dailyContentPipeline.js';
import { createContentDatabaseGate } from './lib/contentDatabaseGate.js';

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const date = args[args.indexOf('--date') + 1] && args.includes('--date')
  ? args[args.indexOf('--date') + 1]
  : new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Expected --date YYYY-MM-DD');
const phase = args.includes('--phase') ? args[args.indexOf('--phase') + 1] : 'daily';
if (!['daily', 'college-cards'].includes(phase)) throw new Error('Expected --phase daily or college-cards');
const availableStages = phase === 'college-cards' ? collegeCardStages(date) : dailyContentStages(date);
const selectedStages = selectContentStages(availableStages, args.includes('--stages') ? (args[args.indexOf('--stages') + 1] || '') : undefined);
const journal = process.env.GARY_CONTENT_JOURNAL || resolve(homedir(), 'Library/Logs/Gary2.0/daily-content-stages.jsonl');

// Fill gaps, don't redo (founder, Sep 23 2026; Sep 24: "we basically need
// this done once a day"). The job runs at 6 AM and noon. A scheduled run
// skips a stage that finished ok in the last two hours, and the once-a-day
// stages (football lanes, player cards: their numbers move only after games)
// skip once they finished ok today. A failed or partial stage still runs, so
// noon retries whatever the morning missed and refreshes the slate, the
// board, the Wire and the MLB lanes (lineups, scratches, news).
const FRESH_MS = 2 * 60 * 60 * 1000;
const ALWAYS = new Set(['card-watch', 'morning-health']);
const ONCE_A_DAY = new Set(['mlb-cards', 'nfl-cards', 'ncaaf-cards', 'nfl-insights', 'ncaaf-insights', 'ncaaf-card-subjects']);
function completedToday() {
  if (phase !== 'daily' || args.includes('--date') || args.includes('--stages') || args.includes('--full')) return new Map();
  let rows = [];
  try { rows = readFileSync(journal, 'utf8').trim().split('\n').slice(-2000).map(line => { try { return JSON.parse(line); } catch { return null; } }); } catch { return new Map(); }
  const done = new Map();
  for (const row of rows) {
    if (row?.date !== date || row.phase !== 'daily' || row.event !== 'stage-end' || row.status !== 'ok') continue;
    const at = Date.parse(row.at);
    if (Number.isFinite(at) && at > (done.get(row.stage) ?? 0)) done.set(row.stage, at);
  }
  return done;
}
const done = completedToday();
const now = Date.now();
const fresh = new Set([...done].filter(([id, at]) => ONCE_A_DAY.has(id) || now - at < FRESH_MS).map(([id]) => id));
const stages = selectedStages.filter(stage => ALWAYS.has(stage.id) || !fresh.has(stage.id));
if (args.includes('--plan')) {
  console.log(JSON.stringify({ date, phase, stages }, null, 2));
} else {
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
  // Explicit dated backfills keep their per-stage caps. The scheduled overnight
  // phase must release this LaunchAgent before its 6AM daily publication.
  const overnightTimer = phase === 'college-cards' && !args.includes('--date')
    ? setTimeout(() => controller.abort(new Error('Overnight cards reached the 05:45 ET cutoff before daily publication')), collegeCardRunBudgetMs())
    : undefined;
  onEvent({ event: 'run-start', at: new Date().toISOString(), stages: stages.map(stage => stage.id), ...(fresh.size ? { skipped_fresh: [...fresh].filter(id => !ALWAYS.has(id)) } : {}) });
  try {
    const databaseReady = createContentDatabaseGate({ signal: controller.signal, onEvent });
    const results = await runDailyContent(stages, { cwd, signal: controller.signal, onEvent, databaseReady });
    // A writer that preserved part of its output (exit 2, e.g. the Wire with
    // some leagues stored and the rest deferred) is journaled, not failed.
    const failed = results.filter(r => r.status !== 'ok' && r.status !== 'partial');
    const partial = results.filter(r => r.status === 'partial');
    onEvent({ event: 'run-end', at: new Date().toISOString(), status: failed.length ? 'failed' : 'ok', failed_stages: failed.map(r => r.stage), ...(partial.length ? { partial_stages: partial.map(r => r.stage) } : {}) });
    process.exitCode = failed.length ? 1 : 0;
  } catch (error) {
    onEvent({ event: 'run-end', at: new Date().toISOString(), status: controller.signal.aborted ? 'cancelled' : 'failed', error: error.message });
    process.exitCode = controller.signal.aborted ? 130 : 1;
  } finally {
    clearTimeout(overnightTimer);
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
  }
}
