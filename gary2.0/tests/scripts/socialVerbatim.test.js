import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  fallbackReasonPair,
  fallbackVerbatimPair,
  isVerbatimSnippet,
  reasonCandidates,
  splitSentences,
} from '../../supabase/functions/_shared/verbatimSnippets.js';

const composerSrc = readFileSync(
  new URL('../../supabase/functions/social-auto-post/index.ts', import.meta.url),
  'utf8',
);

// Founder directive (Aug 17 2026): pick tweets use ONLY Gary's own words —
// whole sentences copied verbatim from the stored pick rationale. The model
// SELECTS sentences; it never writes, edits, shortens, or paraphrases. The
// app and the feed are literally the same Gary.

const RATIONALE = [
  'Saturday night in Anaheim, the marine layer settling over the outfield and two last-place clubs playing loose.',
  'St. Louis scored 19 runs over two games and Kent Emanuel carries a 3.21 ERA at AAA.',
  'These teams are too close for the Royals to be priced like a 41% proposition, so I’m taking the full plus-money swing.',
].join('\n\n');

describe('splitSentences', () => {
  it('never splits on St., decimals, or other abbreviation periods', () => {
    const s = splitSentences(RATIONALE);
    expect(s).toHaveLength(3);
    expect(s[1]).toBe('St. Louis scored 19 runs over two games and Kent Emanuel carries a 3.21 ERA at AAA.');
  });

  it('splits normal multi-sentence paragraphs and drops empties', () => {
    expect(splitSentences('One here. Two there! Three?')).toEqual(['One here.', 'Two there!', 'Three?']);
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences(null)).toEqual([]);
  });
});

describe('isVerbatimSnippet', () => {
  it('accepts exact sentences and tolerates only whitespace differences', () => {
    expect(isVerbatimSnippet(RATIONALE, 'St. Louis scored 19 runs over two games and Kent Emanuel carries a 3.21 ERA at AAA.')).toBe(true);
    expect(isVerbatimSnippet(RATIONALE, 'St. Louis scored 19 runs  over two games and Kent Emanuel carries a 3.21 ERA at AAA.')).toBe(true);
  });

  it('rejects any rewording, however close', () => {
    expect(isVerbatimSnippet(RATIONALE, 'St. Louis scored 19 runs over two games and has the fresher bullpen.')).toBe(false);
    expect(isVerbatimSnippet(RATIONALE, '')).toBe(false);
  });
});

describe('fallbackVerbatimPair', () => {
  it('returns two distinct verbatim sentences within the budget', () => {
    const pair = fallbackVerbatimPair(RATIONALE, 260);
    expect(pair).not.toBe(null);
    expect(isVerbatimSnippet(RATIONALE, pair.opening)).toBe(true);
    expect(isVerbatimSnippet(RATIONALE, pair.closing)).toBe(true);
    expect(pair.opening).not.toBe(pair.closing);
    expect(pair.opening.length + pair.closing.length).toBeLessThanOrEqual(260);
  });

  it('falls back to a single sentence when no pair fits, and never truncates', () => {
    const pair = fallbackVerbatimPair(RATIONALE, 120);
    expect(pair).not.toBe(null);
    expect(pair.closing).toBe('');
    expect(isVerbatimSnippet(RATIONALE, pair.opening)).toBe(true);
  });

  it('returns null when nothing fits rather than inventing or cutting words', () => {
    expect(fallbackVerbatimPair(RATIONALE, 10)).toBe(null);
    expect(fallbackVerbatimPair('', 260)).toBe(null);
  });
});

describe('reasonCandidates', () => {
  const R = [
    'Monday night at PNC Park, overcast sky, light breeze toward right, and two clubs trying to keep a fading playoff path alive.',
    'Tarik Skubal has allowed two earned runs over his last 19 innings and the Pirates are hitting .211 against lefties.',
    'The -153 is too much for an Angels team that has lost all six of his latest starts.',
    'At -105, I\u2019ll put the $100 on Detroit to win outright.',
  ].join('\n\n');

  it('drops stake and wager-declaration sentences — the pick line already says the bet', () => {
    const kept = reasonCandidates(R);
    expect(kept.some((s) => s.includes('$100'))).toBe(false);
    expect(kept.some((s) => s.includes('put the'))).toBe(false);
  });

  it('keeps price-critique sentences — a wrong price IS a reason', () => {
    const kept = reasonCandidates(R);
    expect(kept.some((s) => s.startsWith('The -153 is too much'))).toBe(true);
  });

  it('fallbackReasonPair prefers stat-bearing reasons over the scene-setting opener', () => {
    const pair = fallbackReasonPair(R, 300);
    expect(pair).not.toBe(null);
    expect(pair.opening.includes('PNC Park')).toBe(false);
    expect(pair.opening.includes('19 innings') || pair.closing.includes('19 innings')).toBe(true);
    expect(isVerbatimSnippet(R, pair.opening)).toBe(true);
    expect(pair.closing === '' || isVerbatimSnippet(R, pair.closing)).toBe(true);
  });

  it('never truncates: an unfittable candidate set falls back rather than cutting words', () => {
    expect(fallbackReasonPair(R, 10)).toBe(null);
  });

  it('the argument leads (founder, Aug 19): a stance sentence opens, the stat-dense reason closes', () => {
    const card = [
      'The rubber match is set at PNC Park, with two arms carrying very different certainty.',
      'Skenes has held left-handed hitters to a .649 OPS, an important matchup against a lineup with five left-handed bats.',
      'I’m backing Pittsburgh on the moneyline because the starting-pitching advantage is substantial enough without asking for a run line.',
      'Jobe has worked only 8.2 innings in two starts, producing a 6.23 ERA.',
    ].join('\n\n');
    const pair = fallbackReasonPair(card, 400);
    expect(pair.opening.startsWith('I’m backing Pittsburgh')).toBe(true);
    expect(pair.closing.includes('8.2 innings') || pair.closing.includes('.649 OPS')).toBe(true);
    expect(pair.opening.includes('PNC Park')).toBe(false);
  });
});

describe('composer wiring', () => {
  it('selects verbatim sentences instead of writing angle/edge prose', () => {
    expect(composerSrc).toContain('VERBATIM_RULES');
    expect(composerSrc).toContain('isVerbatimSnippet(');
    expect(composerSrc).toContain('reasonCandidates(');
    expect(composerSrc).toContain('fallbackReasonPair(');
    expect(composerSrc).not.toContain('PICK_HOOK_SCHEMA');
    expect(composerSrc).not.toContain('Write the hook for a single bet');
  });
});
