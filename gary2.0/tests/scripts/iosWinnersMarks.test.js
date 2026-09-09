import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const native = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
function block(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing shipping declaration: ${marker}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed shipping declaration: ${marker}`);
}

describe('Winners picks are Gary\'s record: Billfold scope and Home board mark', () => {
  it('decodes the graded Winners flag on game, NFL and prop results', () => {
    const models = native('Models.swift');
    for (const marker of ['struct GameResult', 'struct NFLResult', 'struct PropResult']) {
      const decl = block(models, marker);
      expect(decl).toContain('is_winners_pick');
      expect(decl).toContain('isWinnersPick');
    }
    expect(block(models, 'struct GameResult')).toMatch(/is_winners_pick: try container\.decodeIfPresent\(Bool\.self, forKey: \.is_winners_pick\)/);
  });

  it('defaults the Gary Billfold to Winners picks with an explicit all-picks filter, leaving You and Board alone', () => {
    const view = native('BillfoldView.swift');
    expect(view).toContain('@AppStorage("billfoldGaryScope") private var garyScope = "winners"');
    const scoped = block(view, '    private var gameResults: [GameResult]');
    expect(scoped).toContain('garyRecordIsWinnersOnly');
    expect(view).toContain('private var garyRecordIsWinnersOnly: Bool { garyScope == "winners" && billfoldScope != "you" && billfoldScope != "board" }');
    expect(scoped).toContain('allGameResults.filter { $0.isWinnersPick }');
    expect(block(view, '    private var propResults: [PropResult]')).toContain('allPropResults.filter { $0.isWinnersPick }');
    expect(view).toContain('allGameResults = snapshot.games');
    expect(view).toMatch(/passbookChip\(garyScope == "winners" \? "Winners" : "All picks"\)/);
    expect(view).toContain('.onChange(of: garyScope) { _ in recomputeCache()');
  });

  it('marks Winners picks on the Home board without changing the row layout', () => {
    const home = native('HomeView.swift');
    expect(block(home, '    struct HomeSheetRow: Identifiable')).toContain('var onWinnersBoard: Bool = false');
    expect(home).toContain('@State private var winnersBoardGameIDs: Set<Int> = []');
    expect(home).toContain('onWinnersBoard: g.bdl_game_id.map { winnersBoardGameIDs.contains($0) } ?? false');
    expect(home).toContain('SupabaseAPI.fetchWinnersBoard(date:');
    const row = block(native('HomeFrontPage.swift'), 'struct HomeSheetRowView: View');
    expect(row).toContain('if row.onWinnersBoard {');
    expect(row).toContain('Image(systemName: "star.fill")');
    expect(row).toContain('.accessibilityLabel("Winners pick")');
  });
});
