import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const views = readFileSync(new URL('../../../ios/GaryApp/Views.swift', import.meta.url), 'utf8');

const compactPropRow = views.slice(
  views.indexOf('struct CompactPropRow: View'),
  views.indexOf('// MARK: - Floating Prop Detail Popup'),
);

describe('Winners prop-card content fit', () => {
  it('uses the exact Picks headline geometry on both finishes', () => {
    expect(compactPropRow).toContain('private var pf: CGFloat { premiumFinish ? 1.15 : 1 }');
    expect(compactPropRow).toContain('private var propHeroSize: CGFloat { 52 }');
    expect(compactPropRow).toContain('.font(GaryFonts.display(propHeroSize))');
    expect(compactPropRow).toContain('.frame(height: propHeroSize * 0.86, alignment: .leading)');
    expect(compactPropRow).toContain('private var heroTopPad: CGFloat { 12 - 0.22 * propHeroSize }');
    expect(compactPropRow).toContain('private var metaTopPad: CGFloat { 12 - 0.25 * propHeroSize }');
    expect(compactPropRow).not.toContain('premiumFinish ? 65 : 52');
    expect(compactPropRow).not.toContain('GaryFonts.display(propHeroSize * pf)');
  });

  it('preserves the Winners silver finish and result-state styling', () => {
    const winnersShelf = views.slice(
      views.indexOf('private func propShelfView'),
      views.indexOf('private var lockedGameBoards'),
    );

    expect(winnersShelf).toContain('premiumFinish: true');
    expect(compactPropRow).toContain('SilverBar.background()');
    expect(compactPropRow).toContain('.saturation(isSilverLost ? 0.8 : 1)');
    expect(compactPropRow).toContain('.brightness(isSilverLost ? -0.06 : 0)');
    expect(compactPropRow).toContain('if isSilverWon, payoutPer100 != nil');
    expect(compactPropRow).toContain('if isSilverLost {');
  });
});
