import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const view = readFileSync(new URL('../../../ios/GaryApp/WinnersView.swift', import.meta.url), 'utf8');
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;
function declaration(start, indent = '') {
  const begin = view.indexOf(start), end = view.indexOf(`\n${indent}}`, begin);
  if (begin < 0 || end < 0) throw new Error(`Missing actual declaration: ${start}`);
  return view.slice(begin, end + indent.length + 2);
}

describe('Winners foreground rollover', () => {
  it.skipIf(!hasSwift)('executes actual date ownership and retained-board header across 6AM', () => {
    const fixture = readFileSync(new URL('../../../ios/Tests/WinnersBoardDatesTests.swift', import.meta.url), 'utf8')
      .replace('HEADER_FUNCTION', declaration('    private var headerDateLabel:', '    '));
    const dir = mkdtempSync(join(tmpdir(), 'gary-winners-rollover-'));
    try {
      const file = join(dir, 'Fixture.swift');
      writeFileSync(file, `import Foundation
${declaration('enum WinnersBoardDates')}
enum SupabaseAPI { static func todayEST() -> String { "2026-09-08" } }
${fixture}`);
      expect(execFileSync('swift', ['-swift-version', '5', file], { encoding: 'utf8', timeout: 30000 }))
        .toContain('PASS 32 actual Swift Winners board-date checks');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 40000);

  it('rechecks slate ownership on the visible timer and anchors prop grades to the loaded snapshot', () => {
    const timer = view.slice(view.indexOf('.onReceive(Timer.publish(every: 30'), view.indexOf('.onChange(of: selectedTab)'));
    expect(timer).toContain('selectedDate == nil');
    expect(timer).toContain('WinnersBoardDates.shouldRefresh');
    expect(timer).toContain('requestedBoardDate = today');
    expect(timer).toContain('lastBoardAttemptAt = now');
    expect(timer).toContain('Task { await reload() }');
    expect(declaration('    private func propShelfDay(', '    ')).toContain('loadedDate: loadedBoardDate');
    const load = declaration('    private func loadAdmittedBoard(', '    ');
    expect(load).toContain('requestedBoardDate = date');
    expect(load).toContain('if boardLoadToken == token { requestedBoardDate = nil }');
    expect(load).toContain('loading = loadedBoardDate != date');
    expect(load).not.toContain('loading = loadedBoardDate != date || !hasContent');
    expect(load).toContain('let retainingThisDate = loadedBoardDate == date');
    expect(load).toContain('admittedBoardCache[date] ?? SupabaseAPI.WinnersBoardSnapshot()');
    expect(load).toContain('loadedBoardDate = date');
    expect(load).toContain('(selectedDate ?? SupabaseAPI.todayEST()) == date');
    expect(load).toContain('boardDataFailed = admissionFailed');
  });
});
