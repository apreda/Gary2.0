#!/usr/bin/env node

// Detached worker for the existing local live-score lifecycle. It preserves
// the 15-minute football proof cadence without blocking two-minute score polls.

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER_DEADLINE_MS = 12 * 60 * 1000;
let activeChild = null;

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function marker(date, league) {
  return `/tmp/gary-football-proof-${date}-${league.toLowerCase()}.success`;
}

const deadline = setTimeout(() => {
  console.error('[football-proof] refresh exceeded 12 minutes; terminating its active child');
  if (activeChild?.pid) {
    try { process.kill(-activeChild.pid, 'SIGTERM'); } catch { /* already exited */ }
    setTimeout(() => {
      try { process.kill(-activeChild.pid, 'SIGKILL'); } catch { /* already exited */ }
    }, 5000).unref();
  } else {
    process.exit(124);
  }
}, WORKER_DEADLINE_MS);

function runProof(date, leagues) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      'run-football-proof.js',
      '--date', date,
      '--league', leagues.join(','),
    ], {
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
      else reject(new Error(`run-football-proof.js exited ${code ?? signal ?? 'without a status'}`));
    });
  });
}

async function run() {
  const date = argValue('--date');
  const leagues = String(argValue('--league') || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value === 'NFL' || value === 'NCAAF');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !leagues.length) {
    throw new Error('Live football proof worker requires --date and NFL/NCAAF --league');
  }

  await runProof(date, [...new Set(leagues)]);
  for (const league of new Set(leagues)) writeFileSync(marker(date, league), String(Date.now()));
  console.log(`[football-proof] refresh complete for ${[...new Set(leagues)].join(',')}`);
}

run()
  .then(() => { process.exitCode = 0; })
  .catch((error) => {
    console.error(`[football-proof] refresh failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(deadline);
  });
