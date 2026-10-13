import { describe, expect, it } from 'vitest';
import { readIosViewsSource } from '../helpers/iosViewsSource.js';
import { readFileSync } from 'node:fs';

const views = readIosViewsSource();
// The helper lives under its MARK header in PickCards.swift; since 43a686b5
// the extension opens with the pattern built once, ahead of the doc comment.
const helper = views.slice(
  views.indexOf('// MARK: - Pick Text Helper (shared spread-sign fix)'),
  views.indexOf('// MARK: - Compact Pick Row'),
);

describe('iOS authoritative spread display', () => {
  it('prefers the server-elected spread over the first raw sportsbook row', () => {
    expect(helper).toContain('extension GaryPick {');
    expect(helper).toContain('private static let trailingSpread');
    expect(helper).toContain('self.spread ?? self.sportsbook_odds?.compactMap({ $0.spread }).first');
    expect(helper).toContain('let correctSign = displaySpread >= 0 ? "+" : "-"');
    expect(helper).toContain('let num = abs(displaySpread)');
    expect(helper).not.toContain('let firstSpread = books.compactMap');
  });
});
