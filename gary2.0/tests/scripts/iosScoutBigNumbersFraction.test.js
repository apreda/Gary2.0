import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const views = readFileSync(new URL('../../../ios/GaryApp/Views.swift', import.meta.url), 'utf8');
const bigNumbers = views.slice(
  views.indexOf('fileprivate struct ScoutBigNumbersSection: View'),
  views.indexOf('struct PicksGamePage: View'),
);
const trioData = views.slice(
  views.indexOf('fileprivate struct ScoutTrioData'),
  views.indexOf('fileprivate struct ScoutArmsSection'),
);

describe('iOS Scout first-inning Big Number', () => {
  it('leads with the dominant scoring-side fraction and superscripts the denominator', () => {
    expect(bigNumbers).toContain('fractionNumerator: max(a, h), fractionDenominator: 10');
    expect(bigNumbers).toContain('Text("\\(numerator)/")\n                                        .font(GaryFonts.display(40))');
    expect(bigNumbers).toContain('Text("\\(denominator)")\n                                        .font(GaryFonts.display(20))\n                                        .padding(.top, 2)');
  });

  it('preserves the full explanatory comparison and market label with odds', () => {
    expect(bigNumbers).toContain('oddsBit = " — \\(label) \\(Self.american(Double(price)))"');
    expect(bigNumbers).toContain('bold: "First innings: \\(d.awayName) \\(a)/10 · \\(d.homeName) \\(h)/10 scoring in the 1st"');
    expect(bigNumbers).toContain('rest: oddsBit,');
  });
});

describe('iOS Scout doubleheader weather identity', () => {
  it('requires a same-time forecast and never falls back to the twin game', () => {
    expect(trioData).toContain('let weatherCandidates = (board?.weather ?? []).filter');
    expect(trioData).toContain('if isDoubleheader {');
    expect(trioData).toContain('if let myBucket = PicksCarouselView.timeBucket(commence)');
    expect(trioData).toContain('PicksCarouselView.timeBucket(parseISO8601($0.commence_time ?? "")) == myBucket');
    expect(trioData).toContain('} else {\n                w = nil\n            }');
    expect(trioData).toContain('} else {\n            w = weatherCandidates.first\n        }');
  });
});
