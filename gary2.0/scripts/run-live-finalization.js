#!/usr/bin/env node

// Detached worker for poll-live-scores. The poller remains short-lived and
// keeps scores fresh; this worker drains the persistent final-grade request.
// Failed work leaves the request intact so the next two-minute poll retries it.

import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_LIVE_GRADE_QUEUE_DIR,
  normalizeGradeRequest,
} from './lib/liveGradeQueue.js';

const PROJECT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRADE_QUEUE_DIR = DEFAULT_LIVE_GRADE_QUEUE_DIR;
const WORKER_DEADLINE_MS = 55 * 60 * 1000;
let activeChild = null;

const deadline = setTimeout(() => {
  console.error('[live-grade] finalization exceeded 55 minutes; terminating its active child');
  if (activeChild?.pid) {
    try { process.kill(-activeChild.pid, 'SIGTERM'); } catch { /* already exited */ }
    setTimeout(() => {
      try { process.kill(-activeChild.pid, 'SIGKILL'); } catch { /* already exited */ }
    }, 5000).unref();
  } else {
    process.exit(124);
  }
}, WORKER_DEADLINE_MS);

function recoverInterruptedClaims() {
  mkdirSync(GRADE_QUEUE_DIR, { recursive: true });
  for (const name of readdirSync(GRADE_QUEUE_DIR).filter((value) => value.includes('.work-'))) {
    const claimed = join(GRADE_QUEUE_DIR, name);
    const original = join(GRADE_QUEUE_DIR, name.replace(/\.work-\d+$/, ''));
    if (!existsSync(original)) renameSync(claimed, original);
  }
}

function claimPendingRequests() {
  recoverInterruptedClaims();
  const claimed = [];
  for (const name of readdirSync(GRADE_QUEUE_DIR).filter((value) => value.endsWith('.json'))) {
    const original = join(GRADE_QUEUE_DIR, name);
    const work = `${original}.work-${process.pid}`;
    renameSync(original, work);
    const request = normalizeGradeRequest(JSON.parse(readFileSync(work, 'utf8')));
    claimed.push({ original, work, request });
  }
  return claimed;
}

function runNodeScript(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: PROJECT_DIR,
      detached: true,
      stdio: 'inherit',
      env: process.env,
    });
    activeChild = child;
    child.once('error', reject);
    child.once('close', (code, signal) => {
      activeChild = null;
      if (code === 0) resolve();
      else reject(new Error(`${script} exited ${code ?? signal ?? 'without a status'}`));
    });
  });
}

async function run() {
  const claimed = claimPendingRequests();
  if (!claimed.length) return;
  const dates = [...new Set(claimed.map(({ request }) => request.date))];
  try {
    for (const date of dates) {
      const requests = claimed
        .map(({ request }) => request)
        .filter((request) => request.date === date);
      const exactGames = requests.flatMap((request) => request.games);
      const footballLeagues = [...new Set(requests.flatMap((request) => request.leagues)
        .filter((league) => league === 'NFL' || league === 'NCAAF'))];
      const exactLabels = exactGames.map((game) => `${game.league}:${game.game_id}`);
      console.log(
        `[live-grade] grading ${date} — picks + props${exactLabels.length
          ? ` for ${exactLabels.join(', ')}`
          : ''}, then proof + the insight board…`,
      );
      await runNodeScript('scripts/run-all-results.js', [date]);
      if (footballLeagues.length) {
        await runNodeScript('scripts/run-live-football-proof.js', [
          '--date', date,
          '--league', footballLeagues.join(','),
        ]);
      }
      await runNodeScript('run-grade-insights.js', ['--date', date]);
    }
    for (const item of claimed) unlinkSync(item.work);
  } catch (error) {
    // Restore only this worker's atomic claims. New queue files written while it
    // ran are different paths and can never be deleted by this completion.
    for (const item of claimed) {
      if (existsSync(item.work) && !existsSync(item.original)) renameSync(item.work, item.original);
    }
    throw error;
  }
}

run()
  .then(() => {
    console.log('[live-grade] retained finalization complete');
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error(`[live-grade] retained finalization failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(deadline);
  });
