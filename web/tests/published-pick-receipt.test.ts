import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublishedPickReceipt } from '@/components/PublishedPickReceipt';
import type { GaryPick, GameResultRow } from '@/lib/gary/types';

const pick: GaryPick = { league: 'MLB', awayTeam: 'Cubs', homeTeam: 'Reds', pick: 'Cubs -1.5 +136', odds: -162 };
const result: GameResultRow = { league: 'MLB', game_date: '2026-09-16', matchup: 'Cubs @ Reds', pick_text: 'Cubs -1.5 +136', result: 'lost', final_score: '3-4', confidence: 0.6 };
const render = (p = pick, rows = [result], ambiguous = false) => renderToStaticMarkup(createElement(PublishedPickReceipt, {pick: p, results: rows, ambiguous}));

describe('public game receipts', () => {
  it('uses the published ticket price, including a losing outcome, over conflicting metadata', () => {
    const html = render();
    expect(html).toContain('+136');
    expect(html).not.toContain('-162');
    expect(html).toContain('Lost');
    expect(html).toContain('3-4');
  });
  it('does not invent odds from metadata when the original ticket has none', () => {
    expect(render({ ...pick, pick: 'Cubs -1.5' })).toContain('Not retained in the published ticket');
  });
  it('does not attach another market’s winning grade', () => {
    const html = render(pick, [{ ...result, pick_text: 'Cubs ML +136', result: 'won' }]);
    expect(html).toContain('Awaiting grade');
    expect(html).not.toContain('>Won<');
    expect(html).not.toContain('3-4');
  });
  it('leaves duplicate result rows and repeated game identities unresolved', () => {
    for (const html of [render(pick, [result, { ...result, result: 'won' }]), render(pick, [result], true)]) {
      expect(html).toContain('Game identity unresolved');
      expect(html).not.toContain('3-4');
    }
  });
});
