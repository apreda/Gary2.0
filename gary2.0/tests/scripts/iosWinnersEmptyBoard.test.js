import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const read = name => readFileSync(new URL(`../../../ios/GaryApp/${name}`, import.meta.url), 'utf8');
const view = read('WinnersView.swift');
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;
function declaration(source, start, indent = '') {
  const begin = source.indexOf(start);
  if (begin < 0) throw new Error(`Missing actual Swift declaration: ${start}`);
  const end = source.indexOf(`\n${indent}}`, begin);
  if (end < 0) throw new Error(`Unclosed actual Swift declaration: ${start}`);
  return source.slice(begin, end + indent.length + 2);
}

describe('dated Winners empty-board lifecycle', () => {
  it.skipIf(!hasSwift)('executes real Swift schedule models, phase resolver and 6AM date boundary', () => {
    const api = read('SupabaseAPI.swift');
    const fixture = readFileSync(new URL('../../../ios/Tests/WinnersEmptyBoardTests.swift', import.meta.url), 'utf8');
    const directory = mkdtempSync(join(tmpdir(), 'gary-winners-empty-'));
    try {
      const file = join(directory, 'Fixture.swift');
      writeFileSync(file, `import Foundation
${declaration(read('Models.swift'), 'struct DailySlateRow:')}
${declaration(view, 'enum WinnersEmptyBoardPhase:')}
enum SupabaseAPI {
${api.match(/static let slateRolloverHourET = \d+/)[0]}
${declaration(api, '    static func todayEST(', '    ')}
${declaration(api, '    private static func formatDateEST(', '    ')}
}
${fixture}`);
      const output = execFileSync('swift', ['-swift-version', '5', file], { encoding: 'utf8', timeout: 30000 });
      expect(output).toContain('PASS 39 actual Swift Winners empty-board checks');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 40000);

  it('uses the lifecycle for empty game/prop shelves and preserves admission source/date', () => {
    const shelf = declaration(view, '    private func emptyTodayShelf(', '    ');
    expect(shelf).toContain('if phase == .pending');
    expect(shelf).toContain('Text(phase.message(league: league))');
    expect(shelf).not.toContain('tonight');
    for (const start of ['    private var emptyState:', '    private var emptyTodayIntro:', '    private var propsEmptyState:', '    private func propPlaceholderRow(', '    private func placeholderRow(']) {
      expect(declaration(view, start, '    ')).toContain('emptyBoardPhase(');
    }
    const load = declaration(view, '    private func loadAdmittedBoard(', '    ');
    expect(load).toContain('SupabaseAPI.fetchWinnersBoard(date: date)');
    expect(load).toContain('SupabaseAPI.fetchDailySlateWithStatus(date: date)');
    expect(load).toContain('todaySlateSucceeded = slate.succeeded');
    expect(load).toContain('(isToday && !slate.succeeded)');
    expect(load).toContain('(selectedDate ?? SupabaseAPI.todayEST()) == date');
    expect(view).toContain('emptyStateNow = now');
    expect(view).not.toContain("No props posted yet — they'll appear here with the slate.");
  });
});
