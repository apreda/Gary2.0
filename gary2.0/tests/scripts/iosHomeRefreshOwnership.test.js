import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const read = name => readFileSync(new URL(`../../../ios/GaryApp/${name}.swift`, import.meta.url), 'utf8');
const home = read('HomeView'), api = read('SupabaseAPI');
const hasSwift = spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).status === 0;
function block(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing shipping declaration: ${marker}`);
  let depth = 0;
  for (let index = source.indexOf('{', start); index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed shipping declaration: ${marker}`);
}
function fixture(source) {
  const fullStart = source.indexOf('            let taskNonce = homeNonce');
  const taskStart = source.lastIndexOf('.task(id:', fullStart);
  const fullTask = block(source.slice(taskStart), '.task(id:');
  const full = 'func refreshFull() async ' + fullTask.slice(fullTask.indexOf('{'));
  const methods = [
    block(home, 'private var myTodayBets:'),
    block(home, 'private func isCurrentHomeRequest('),
    block(home, 'private func refreshMyTodayBets('),
    block(source, 'private func refreshRollingHomeContent('),
    block(home, 'private static func homeVisiblePicks('),
    block(home, 'private static func homeVisibleProps('), full,
  ].map(method => method.replace(/^private /, '')).join('\n');
  const clock = [block(api, 'static func todayEST(').replace('todayEST', 'slateDate'), block(api, 'private static func formatDateEST(')].join('\n');
  return readFileSync(new URL('../fixtures/ios/homeRefreshOwnership.swift', import.meta.url), 'utf8')
    .replace('/* SHIPPING_CLOCK */', clock).replace('/* SHIPPING_METHODS */', methods);
}
function runSwift(swift) {
  const directory = mkdtempSync(join(tmpdir(), 'gary-home-ownership-'));
  try {
    const path = join(directory, 'Fixture.swift'), binary = join(directory, 'fixture');
    writeFileSync(path, swift);
    execFileSync('swiftc', ['-swift-version', '5', '-parse-as-library', '-O', path, '-o', binary], { encoding: 'utf8', timeout: 60_000, stdio: 'pipe' });
    return spawnSync(binary, [], { encoding: 'utf8', timeout: 30_000 });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
describe('Home asynchronous request ownership', () => {
  it.skipIf(!hasSwift)('executes production full/rolling/private-book methods with suspended, stale and cross-cutoff transport responses', () => {
    const result = runSwift(fixture(home));
    expect(result.stderr, result.stdout).toBe('');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('PASS: shipping full/rolling/MyBets requests');
  }, 90_000);
  it.skipIf(!hasSwift)('detects the original stale-write behavior when full-load ownership guards are disabled', () => {
    const predicate = block(home, 'func canPublish() -> Bool');
    const unguarded = home.replace(predicate, 'func canPublish() -> Bool { true }');
    const result = runSwift(fixture(unguarded));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('FAILED: Stale full response changed newer content at record');
  }, 90_000);
  it('schedules account changes and avoids repeatedly restarting an in-flight rollover', () => {
    expect(home.match(/\.task\(id: homeTaskID\)/g)).toHaveLength(2);
    expect(home).toContain('@ObservedObject private var homeAuth = AuthManager.shared');
    expect(home).toContain('fullHomeRefreshDate != SupabaseAPI.todayEST() else { return }');
  });
});
