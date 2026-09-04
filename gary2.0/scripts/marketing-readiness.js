#!/usr/bin/env node
/**
 * Read-only daily marketing readout using the existing authenticated Supabase
 * CLI and linked production database. Never invokes the poster or X APIs.
 * node scripts/marketing-readiness.js [--json]
 * Exit 0: observed health ready; 1: action required; 2: evidence unavailable.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluateMarketingReadiness, formatMarketingReadiness } from './lib/marketingReadiness.js';

const json = process.argv.includes('--json');
try {
  if (process.argv.slice(2).some((arg) => arg !== '--json')) throw new Error('Usage: node scripts/marketing-readiness.js [--json]');
  const backend = fileURLToPath(new URL('../', import.meta.url));
  const linkedProject = readFileSync(new URL('../supabase/.temp/project-ref', import.meta.url), 'utf8').trim();
  if (linkedProject !== 'xuttubsfgdcjfgmskcol') throw new Error('The checkout is not linked to the expected production project');
  let output;
  try {
    output = execFileSync('npx', ['--no-install', 'supabase', 'db', 'query', '--linked', '--output', 'json',
      '--file', fileURLToPath(new URL('./lib/marketingReadiness.sql', import.meta.url))],
    { cwd: backend, encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    // CLI errors can contain connection details; do not echo credentials or
    // raw database responses into a shareable daily report.
    throw new Error('Read-only database inspection failed; check Supabase CLI authentication and linked-project access');
  }
  const parsed = JSON.parse(output);
  const snapshot = parsed.rows?.[0]?.snapshot;
  if (!snapshot) throw new Error('Database returned no readiness snapshot');
  const report = evaluateMarketingReadiness(snapshot);
  console.log(json ? JSON.stringify(report, null, 2) : formatMarketingReadiness(report));
  process.exitCode = report.exit_code;
} catch (error) {
  const report = { status: 'unverified', exit_code: 2, error: error.message };
  console.error(json ? JSON.stringify(report) : `MARKETING READINESS UNVERIFIED: ${report.error}`);
  process.exitCode = 2;
}
