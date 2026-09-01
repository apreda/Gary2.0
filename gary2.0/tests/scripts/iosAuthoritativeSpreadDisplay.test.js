import { describe, expect, it } from 'vitest';
import { readIosViewsSource } from '../helpers/iosViewsSource.js';
import { readFileSync } from 'node:fs';

const views = readIosViewsSource();
const helper = views.slice(
  views.indexOf('extension GaryPick {\n    /// Formatted pick text'),
  views.indexOf('// MARK: - Compact Pick Row'),
);

describe('iOS authoritative spread display', () => {
  it('prefers the server-elected spread over the first raw sportsbook row', () => {
    expect(helper).toContain('self.spread ?? self.sportsbook_odds?.compactMap({ $0.spread }).first');
    expect(helper).toContain('let correctSign = displaySpread >= 0 ? "+" : "-"');
    expect(helper).toContain('let num = abs(displaySpread)');
    expect(helper).not.toContain('let firstSpread = books.compactMap');
  });
});
