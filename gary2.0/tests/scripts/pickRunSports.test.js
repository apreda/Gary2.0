import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { selectPickSports } from '../../scripts/lib/pickRunSports.js';

describe('game-pick sport selection', () => {
  it('includes MLB and pinned NBA in all supported lanes without retired sports', () => {
    expect(selectPickSports(['--all'])).toEqual(['nba', 'nfl', 'ncaaf', 'mlb']);
  });

  it('keeps explicit selections limited to the requested sports', () => {
    expect(selectPickSports(['--mlb', '--nfl', '--game-id', '123', '--date', '2026-09-04']))
      .toEqual(['nfl', 'mlb']);
    expect(selectPickSports(['--nba'])).toEqual(['nba']);
    expect(selectPickSports(['--ncaaf'])).toEqual(['ncaaf']);
  });

  it('runs a sport once when its flag is repeated or combined with all', () => {
    expect(selectPickSports(['--mlb', '--mlb'])).toEqual(['mlb']);
    expect(selectPickSports(['--all', '--mlb'])).toEqual(['nba', 'nfl', 'ncaaf', 'mlb']);
  });

  it('leaves an invocation without a sport selection for the usage screen', () => {
    expect(selectPickSports([])).toEqual([]);
    expect(selectPickSports(['--help'])).toEqual([]);
  });

  it.each(['--nhl', '--ncaab'])('rejects retired %s even alongside a supported selection', flag => {
    expect(() => selectPickSports([flag])).toThrow(/Retired pick lanes/);
    expect(() => selectPickSports(['--all', flag])).toThrow(/Retired pick lanes/);
    expect(() => selectPickSports(['--mlb', flag])).toThrow(/Retired pick lanes/);
  });

  it('keeps public all-sport and MLB npm aliases consistent with direct CLI selection', () => {
    const { scripts } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    for (const alias of ['picks:all', 'gary']) {
      expect(selectPickSports(scripts[alias].split(' ').slice(2))).toEqual(['nba', 'nfl', 'ncaaf', 'mlb']);
    }
    for (const alias of ['picks:mlb', 'gary:mlb']) {
      expect(selectPickSports(scripts[alias].split(' ').slice(2))).toEqual(['mlb']);
    }
    expect(scripts).not.toHaveProperty('picks:ncaab');
    expect(scripts).not.toHaveProperty('gary:ncaab');
  });
});
