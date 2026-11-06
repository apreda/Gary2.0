import { describe, expect, it } from 'vitest';
import { noDashes } from '../../../supabase/functions/_shared/noDashes.js';

describe('noDashes', () => {
  it('swaps a dash between words for a comma', () => {
    expect(noDashes('Boston is good — and rested')).toBe('Boston is good, and rested');
    expect(noDashes('one—two – three - four')).toBe('one, two, three, four');
  });
  it('keeps numbers, lines and hyphenated words', () => {
    expect(noDashes('won 34 — 31, a 7–3 run')).toBe('won 34-31, a 7-3 run');
    expect(noDashes('Bills -3.5 -110, a right-hander')).toBe('Bills -3.5 -110, a right-hander');
  });
  it('leaves line structure and other values alone', () => {
    expect(noDashes("Gary's Take\n\n- first\n- second")).toBe("Gary's Take\n\n- first\n- second");
    expect(noDashes(null)).toBe(null);
  });
});
