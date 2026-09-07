#!/usr/bin/env node
// Read-only coverage and disk checks. No provider/model calls or restarts.
// The existing launchd watchdog serializes invocations; each read has a cap.
import { readFileSync, writeFileSync, renameSync, mkdirSync, statfsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diskHealth, healthSignature, HOST_CHECK_INTERVAL_MS } from './lib/hostHealth.js';

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(homedir(), 'Library/Logs/Gary2.0/host-health-latest.json');
let previous;
try { previous = JSON.parse(readFileSync(destination, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') console.error(`[host-health] Previous report unreadable: ${error.message}`); }
const now = new Date();
const elapsed = now - Date.parse(previous?.checked_at);
if (!process.argv.includes('--force') && elapsed >= 0 && elapsed < HOST_CHECK_INTERVAL_MS) process.exit(0);
const checks = [];
try {
  const disk = statfsSync(cwd);
  checks.push(diskHealth(disk.bavail * disk.bsize));
} catch (error) { checks.push({ id: 'host:internal-disk', status: 'fail', evidence: `Cannot verify disk: ${error.message}` }); }
const read = await new Promise(resolve => {
  execFile(process.execPath, ['scripts/morning-health.js', '--json'], {
    cwd, timeout: 60_000, maxBuffer: 2 * 1024 * 1024,
  }, (error, stdout) => resolve({ error, stdout }));
});
let coverage;
try {
  coverage = JSON.parse(read.stdout);
  if (!Array.isArray(coverage.checks) || read.error?.killed) throw new Error('Incomplete or timed-out coverage read');
  checks.push(...coverage.checks);
} catch {
  checks.push({ id: 'host:coverage-read', status: 'fail', evidence: read.error?.killed ? 'Coverage read exceeded 60 seconds' : 'Coverage check did not return a valid report' });
}
const report = {
  checked_at: now.toISOString(), runtime: process.version,
  status: checks.some(c => c.status === 'fail') ? 'fail' : checks.some(c => c.status === 'warn') ? 'warn' : 'ok',
  checks, coverage,
};
const changed = !previous || healthSignature(previous) !== healthSignature(report);
mkdirSync(dirname(destination), { recursive: true });
const temp = `${destination}.${process.pid}.tmp`;
writeFileSync(temp, JSON.stringify(report, null, 2));
renameSync(temp, destination);
if (changed) console.log(`[host-health] ${JSON.stringify({ checked_at: report.checked_at, status: report.status, checks: checks.filter(c => ['warn', 'fail'].includes(c.status)) })}`);
process.exitCode = report.status === 'fail' ? 1 : 0;
