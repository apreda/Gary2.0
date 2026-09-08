#!/usr/bin/env node
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { profileSafetyReadQuery, profileSafetyDecisionQuery } from './lib/profileSafetyAdmin.js';

const usage = `Gary profile support

  node scripts/profile-safety.js status
  node scripts/profile-safety.js queue
  node scripts/profile-safety.js show REPORT_UUID
  node scripts/profile-safety.js hide REPORT_UUID --reviewer NAME --note-file PATH [--apply]
  node scripts/profile-safety.js dismiss REPORT_UUID --reviewer NAME --note-file PATH [--apply]
  node scripts/profile-safety.js restore PROFILE_UUID --reviewer NAME --note-file PATH [--apply]

Reads use the authenticated Supabase CLI and the linked project. Report details
are private: inspect them locally and keep them out of public logs and commits.
Decisions preview by default; --apply invokes the existing audited review RPC.
Restore requires a profile UUID and a reviewed appeal, not a report UUID.
`;

function main(args) {
  if (args.includes('--help') || args.includes('-h')) { console.log(usage); return; }
  const command = args.shift() || 'status';
  const reference = args[0] && !args[0].startsWith('--') ? args.shift() : undefined;
  const options = {};
  while (args.length) {
    const flag = args.shift();
    if (flag === '--apply') { options.apply = true; continue; }
    if (!['--reviewer', '--note-file'].includes(flag) || !args[0] || args[0].startsWith('--')) {
      throw new Error(`Unknown or incomplete option: ${flag}`);
    }
    options[flag.slice(2)] = args.shift();
  }
  let query;
  if (['hide', 'dismiss', 'restore'].includes(command)) {
    if (!options['note-file']) throw new Error('Supply a private --note-file with the factual decision reason.');
    const note = readFileSync(resolve(options['note-file']), 'utf8');
    query = profileSafetyDecisionQuery({ action: command, reference, reviewer: options.reviewer, note });
    if (!options.apply) {
      console.log(JSON.stringify({ action: command, reference, reviewer: options.reviewer, noteCharacters: Array.from(note.trim()).length, applied: false }, null, 2));
      console.log('Review the report and note. Add --apply to record this decision.');
      return;
    }
  } else {
    if (Object.keys(options).length) throw new Error('Read commands do not accept decision options.');
    if (command !== 'show' && reference) throw new Error('Only show accepts a report UUID.');
    query = profileSafetyReadQuery(command, reference);
  }
  const temporary = mkdtempSync(join(tmpdir(), 'gary-profile-review-'));
  try {
    const sql = join(temporary, 'request.sql');
    writeFileSync(sql, query, { mode: 0o600 });
    const result = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '--output', 'json', '--file', sql], {
      cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
      encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024,
    });
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.status !== 0) throw new Error(`Supabase query failed (${result.status}); no successful decision is claimed.`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

try { main(process.argv.slice(2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
