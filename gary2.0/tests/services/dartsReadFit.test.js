import { describe, it, expect } from 'vitest';
import { trimRead, gamesInRead, fitBlocks } from '../../src/services/gary/darts/readFit.js';

const game = (d) => `  ${d} · @ Somewhere\n      flow: about 90 possessions each\n      box: ${'x'.repeat(200)}`;
const read = (tag) => ['WHO IS PLAYING', `${tag} lineups`, '', 'THIS SEASON, GAME BY GAME', 'Team A (3-1), newest first:', game('Sun, Nov 8'), game('Fri, Nov 6'), game('Wed, Nov 4'), game('Mon, Nov 2'), '',
  'Team B (2-2), newest first:', game('Sun, Nov 8'), game('Fri, Nov 6'), game('Wed, Nov 4'), '', 'SCHEDULE AND TRAVEL', 'Nothing unusual.'].join('\n');

describe('game reads fit to one dart ask', () => {
  it('keeps each team\'s newest games, says how many it left off, and leaves every other section whole', () => {
    const t = trimRead(read('x'), 2);
    expect(gamesInRead(read('x'))).toBe(4);
    expect(t).toContain('Sun, Nov 8');
    expect(t).not.toContain('Wed, Nov 4');
    expect(t).toContain('  (its 2 games before these are not shown here)');
    expect(t).toContain('  (its 1 game before these is not shown here)');
    expect(t).toContain('SCHEDULE AND TRAVEL\nNothing unusual.');
    expect(t).toContain('WHO IS PLAYING\nx lineups');
    expect(trimRead(read('x'), 9)).toBe(read('x'));
  });
  it('leaves the blocks alone when the ask fits, trims every game in it alike when it does not, and never touches a short frame', () => {
    const blocks = new Map([['1', read('a')], ['2', read('b')], ['3', 'GAME 3 · a short frame']]);
    const full = read('a').length * 2;
    expect(fitBlocks(blocks, ['1', '2'], { target: 1e6, most: 1e6 })).toBe(blocks);
    const fit = fitBlocks(blocks, ['1', '2'], { target: full - 300, most: full });
    expect(gamesInRead(fit.get('1'))).toBe(gamesInRead(fit.get('2')));
    expect(gamesInRead(fit.get('1'))).toBe(3);
    expect(fit.get('3')).toBe('GAME 3 · a short frame');
    expect(fitBlocks(blocks, ['3'], { target: 5, most: 5 })).toBe(blocks);
    // The list and the sheets count against the ask too.
    expect(gamesInRead(fitBlocks(blocks, ['1', '2'], { used: 400, target: full + 300, most: full + 300 }).get('1'))).toBe(3);
  });
  it('keeps one game a team while the ask stays within the most it may hold, and only tonight past that', () => {
    const blocks = new Map([['1', read('a')], ['2', read('b')]]);
    const one = trimRead(read('a'), 1).length * 2;
    expect(gamesInRead(fitBlocks(blocks, ['1', '2'], { target: 100, most: one }).get('1'))).toBe(1);
    const none = fitBlocks(blocks, ['1', '2'], { target: 100, most: one - 1 }).get('1');
    expect(gamesInRead(none)).toBe(0);
    expect(none).toContain('  (its 4 games are not shown here)');
    expect(none).toContain('SCHEDULE AND TRAVEL\nNothing unusual.');
  });
});
