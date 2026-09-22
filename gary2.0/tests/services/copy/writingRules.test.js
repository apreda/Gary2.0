import { describe, expect, it } from 'vitest';
import { WRITING_RULES, readerCopyTells, readerCopyIsClean } from '../../../src/services/copy/writingRules.js';

// Adam, Sep 21 2026: "I hate those dashes. They are big-time AI slop errors."
// The catalog follows Wikipedia's Signs of AI writing, the humanizer skill,
// sloptells and slopdetector, cut to short sports copy (writing.md).
describe('reader copy tells', () => {
  it.each([
    ['em dash', 'That 2-6 record is San Francisco\'s mark — it reflects the lineup around him.', 'dash'],
    ['en dash', 'A 3.11 ERA – his best stretch of the year.', 'dash'],
    ['spaced hyphen as a dash', 'He has a 3.11 ERA - his best stretch of the year.', 'dash'],
    ['arrow', 'The number went -118 → -130 by first pitch.', 'arrow'],
    ['closing disclaimer', 'Read it as context on how these games have gone, not a forecast for tonight.', 'disclaimer'],
    ['treat it as', 'Treat it as a footnote rather than a lean.', 'disclaimer'],
    ['not X but Y', 'This is not a slump but a platoon problem.', 'not-x-but-y'],
    ['it\'s not X, it\'s Y', 'It\'s not the arm, it\'s the defense behind him.', 'not-x-but-y'],
    ['not because X, because Y', 'Not because he is tired. Because the lineup is.', 'not-x-but-y'],
    ['that said', 'That said, the bullpen has been steady.', 'hedge'],
    ['worth noting', 'It is worth noting the sample is eight starts.', 'hedge'],
    ['genuinely', 'He has genuinely been better on the road.', 'hedge'],
    ['sounds deep', 'The real question is whether the lineup shows up.', 'aphorism'],
    ['staged run-up', 'Here\'s the thing: the Giants have not scored for him.', 'staging'],
    ['inflated significance', 'His fastball stands as a testament to the new grip.', 'inflation'],
    ['-ing rider', 'He struck out nine, underscoring how sharp the slider was.', 'ing-rider'],
    ['formal connector opener', 'Additionally, the bullpen threw 5 innings last night.', 'connector'],
    ['machine date', 'He has not pitched since 2026-09-14.', 'machine-date'],
    ['emoji', 'Big night for the Twins bats 🔥', 'emoji'],
    ['chatbot residue', 'I hope this helps frame the total.', 'residue'],
  ])('flags %s', (_name, text, tell) => {
    expect(readerCopyTells(text)).toContain(tell);
    expect(readerCopyIsClean(text)).toBe(false);
  });

  it.each([
    'The Giants are 2-6 in his last 8 starts, and he is a right-hander with a 4.40 ERA.',
    'Ryan Jeffers is 10-for-32 over the last 15 days. He hits righties at a .824 clip this season.',
    'Minnesota opened at -118 and sits at -130 now.',
    'Eight starts is a small sample: two of the losses came against Los Angeles.',
    'He walked four in 2.1 innings on Sep 14 and the bullpen covered the rest.',
    'Kansas City allows 5.4 yards a play; Indianapolis averages 6.1.',
  ])('passes plain copy: %s', text => {
    expect(readerCopyTells(text)).toEqual([]);
    expect(readerCopyIsClean(text)).toBe(true);
  });

  it('carries the prompt block without a single dash of its own', () => {
    expect(WRITING_RULES).toContain('No dashes as punctuation');
    expect(WRITING_RULES).not.toMatch(/[—–]/);
    expect(WRITING_RULES).toContain('the way you would say it out loud');
  });
});
