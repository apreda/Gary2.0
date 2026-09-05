import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { ignoreCommand } = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
let directory: string;
let deployedBeforeWeb: string;
let deployedAfterWeb: string;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'gary-vercel-ignore-'));
  const git = (...args: string[]) => execFileSync('git', [
    '-c', 'user.name=Deploy fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args,
  ], { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--template=');
  mkdirSync(join(directory, 'web'));
  writeFileSync(join(directory, 'web/page.txt'), 'Old deployed page');
  git('add', '.'); git('commit', '-m', 'Deployed baseline');
  deployedBeforeWeb = git('rev-parse', 'HEAD');
  writeFileSync(join(directory, 'web/page.txt'), 'Updated page');
  git('add', '.'); git('commit', '-m', 'Change web page');
  deployedAfterWeb = git('rev-parse', 'HEAD');
  writeFileSync(join(directory, 'HANDOFF.md'), 'Documentation after the web change');
  git('add', '.'); git('commit', '-m', 'Record handoff');
});

afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

// Vercel runs this command from the web root: zero skips, nonzero builds.
function ignoreStatus(previousSha: string) {
  return spawnSync('/bin/sh', ['-c', ignoreCommand], {
    cwd: join(directory, 'web'),
    env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: previousSha },
    timeout: 5000,
  }).status;
}

it('builds earlier web changes when a multi-commit push ends with documentation', () => {
  expect(ignoreStatus(deployedBeforeWeb)).toBe(1);
});

it('skips when only files outside web changed since the successful deployment', () => {
  expect(ignoreStatus(deployedAfterWeb)).toBe(0);
});

it('builds when no successful deployment is known', () => {
  expect(ignoreStatus('')).toBe(1);
});

it('builds when the deployed commit is unavailable in a shallow checkout', () => {
  expect(ignoreStatus('f'.repeat(40))).toBeGreaterThan(0);
});
