#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { recoverLaunchdJob } from './lib/launchdRecovery.js';

const lane = process.argv[2];
const logRoot = resolve(homedir(), 'Library/Logs/Gary2.0');
const config = {
  scheduler: { label: 'com.gary.scheduler', marker: 'scheduler/heartbeat', log: 'scheduler/watchdog.log', staleSeconds: 300, protectPickWorkers: true },
  'live-scores': { label: 'com.gary2.live-scores', marker: 'live-scores-launchd.log', log: 'live-scores-watchdog.log', staleSeconds: 480 },
}[lane];
if (!config) throw new Error('Expected scheduler or live-scores');
const log = text => appendFileSync(resolve(logRoot, config.log), `${new Date().toISOString()} ${lane}: ${text}\n`);
const run = (file, args) => {
  try {
    return { status: 0, stdout: execFileSync(file, args, { encoding: 'utf8', timeout: 10_000, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    // Never log error.message or a process-list response: they can include
    // launchd environment variables and credential-bearing process titles.
    return { status: error.status ?? -1, stderr: file === '/bin/launchctl' ? String(error.stderr || '') : '' };
  }
};
try {
  let mtime = 0;
  try { mtime = statSync(resolve(logRoot, config.marker)).mtimeMs; }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read freshness marker; recovery withheld'); }
  const result = await recoverLaunchdJob({
    ...config, domain: `gui/${process.getuid()}`,
    plist: resolve(homedir(), `Library/LaunchAgents/${config.label}.plist`),
    ageSeconds: (Date.now() - mtime) / 1000,
  }, { run });
  if (result.action !== 'fresh') log(JSON.stringify(result));
} catch (error) {
  log(error.message);
  process.exitCode = 1;
}
