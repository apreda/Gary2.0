import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const hasSwiftCompiler = spawnSync('swiftc', ['--version']).status === 0;

/** Compile shipping files as a module with a fixture entry point. No source slicing. */
export function runSwiftFixture(files, fixture, { timeout = 60_000 } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'gary-native-fixture-'));
  try {
    const entry = join(directory, 'main.swift');
    const executable = join(directory, 'fixture');
    writeFileSync(entry, fixture);
    const sources = files.map(file => fileURLToPath(new URL(`../../../ios/GaryApp/${file}`, import.meta.url)));
    execFileSync('swiftc', ['-swift-version', '5', ...sources, entry, '-o', executable], { timeout, stdio: 'pipe' });
    return execFileSync(executable, { encoding: 'utf8', timeout });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
