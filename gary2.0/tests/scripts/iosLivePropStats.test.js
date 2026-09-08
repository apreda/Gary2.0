import { expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hasSwift = process.platform === 'darwin' && spawnSync('swiftc', ['--version']).status === 0;
it.skipIf(!hasSwift)('executes the real MLB live-prop cache against HTTP fixtures', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gary-live-props-'));
  try {
    const source = readFileSync(new URL('../../../ios/GaryApp/SharedStores.swift', import.meta.url), 'utf8');
    const start = source.indexOf('@MainActor\nfinal class LivePropStatsCache:');
    const end = source.indexOf('\nfinal class LiveScoreCache:', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const fixture = readFileSync(new URL('../fixtures/livePropStats.swift', import.meta.url), 'utf8');
    const script = join(directory, 'LiveProps.swift'), binary = join(directory, 'LiveProps');
    const api = readFileSync(new URL('../../../ios/GaryApp/SupabaseAPI.swift', import.meta.url), 'utf8');
    const requestStart = api.indexOf('    static func mlbLiveBattingRequest(');
    const requestEnd = api.indexOf('    /// Read exactly one stored provider game/date.', requestStart);
    expect(requestStart).toBeGreaterThan(0);
    expect(requestEnd).toBeGreaterThan(requestStart);
    writeFileSync(script, fixture.replace('// ACTUAL_CACHE_SOURCE', source.slice(start, end))
      .replace('// ACTUAL_REQUEST_SOURCE', api.slice(requestStart, requestEnd)));
    execFileSync('swiftc', ['-parse-as-library', script, '-o', binary], { encoding: 'utf8', timeout: 60_000 });
    expect(execFileSync(binary, [], { encoding: 'utf8', timeout: 20_000 })).toContain('Live prop HTTP regressions passed');
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 90_000);
