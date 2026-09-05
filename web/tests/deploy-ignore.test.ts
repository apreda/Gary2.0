import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { ignoreCommand } = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
let repo: string;
let base: string;
let sameWeb: string;

function git(...args: string[]) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'gary-deploy-ignore-'));
  git('init');
  git('config', 'user.name', 'Local QA');
  git('config', 'user.email', 'qa@example.invalid');
  mkdirSync(join(repo, 'web'));
  writeFileSync(join(repo, 'web', 'page.txt'), 'initial');
  git('add', '.'); git('commit', '-m', 'Fixture base');
  base = git('rev-parse', 'HEAD');
  writeFileSync(join(repo, 'handoff.txt'), 'documentation only');
  git('add', '.'); git('commit', '-m', 'Fixture documentation');
  sameWeb = git('rev-parse', 'HEAD');
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

function decision(previous: string) {
  return spawnSync('/bin/sh', ['-c', ignoreCommand], {
    cwd: join(repo, 'web'),
    env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: previous },
  });
}

describe('Vercel ignored build decision', () => {
  it('skips when a known comparison proves the web tree is unchanged', () => {
    expect(decision(base).status).toBe(0);
  });

  it.each(['', 'f97de41a8af66828b477f51d8abc1e40b8e77ed3'])(
    'builds when the previous commit is absent or unavailable (%s)', previous => {
      expect(decision(previous).status).toBe(1);
    },
  );

  it('builds when web content has changed', () => {
    writeFileSync(join(repo, 'web', 'page.txt'), 'updated board');
    git('add', '.'); git('commit', '-m', 'Fixture web update');
    expect(decision(sameWeb).status).toBe(1);
  });
});
