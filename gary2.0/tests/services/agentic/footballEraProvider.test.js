import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const temporaryRoots = [];
afterEach(() => temporaryRoots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gary-football-era-'));
  temporaryRoots.push(root);
  const services = join(root, 'src/services');
  const orchestrator = join(services, 'agentic/orchestrator');
  const providers = join(services, 'bdl');
  mkdirSync(orchestrator, { recursive: true });
  mkdirSync(providers, { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  const modulePath = join(orchestrator, 'footballPromptSha.js');
  copyFileSync(new URL('../../../src/services/agentic/orchestrator/footballPromptSha.js', import.meta.url), modulePath);
  const hashes = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { pathToFileURL } from 'node:url';
    const { footballPromptSha } = await import(pathToFileURL(process.argv[1]));
    console.log(JSON.stringify(['NFL', 'NCAAF'].map(footballPromptSha)));
  `, modulePath], { encoding: 'utf8' }));
  return { providers, hashes };
}

describe('football era follows extracted provider evidence', () => {
  it('changes both football eras when provider code changes, appears or disappears', () => {
    const { providers, hashes } = fixture();
    const original = hashes();
    const modulePath = join(providers, 'footballBatching.js');
    writeFileSync(modulePath, 'export const season = 2025;');
    const added = hashes();
    expect(added[0]).not.toBe(original[0]);
    expect(added[1]).not.toBe(original[1]);
    writeFileSync(modulePath, 'export const season = 2026;');
    const changed = hashes();
    expect(changed[0]).not.toBe(added[0]);
    expect(changed[1]).not.toBe(added[1]);
    rmSync(modulePath);
    expect(hashes()).toEqual(original);
  });

  it('ignores provider documentation and directory insertion order', () => {
    const first = fixture();
    const second = fixture();
    for (const name of ['transport.js', 'games.js']) writeFileSync(join(first.providers, name), name);
    for (const name of ['games.js', 'transport.js']) writeFileSync(join(second.providers, name), name);
    expect(first.hashes()).toEqual(second.hashes());
    writeFileSync(join(second.providers, 'README.md'), 'Documentation only.');
    expect(first.hashes()).toEqual(second.hashes());
  });
});
