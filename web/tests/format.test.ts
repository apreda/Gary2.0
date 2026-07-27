import { describe, it, expect } from 'vitest';
import {
  etTime,
  leadSection,
  marketLine,
  oddsText,
  parseGameTime,
  parseScoutSections,
  pickDropTime,
  propCall,
  propLabel,
  scoutSectionsExcluding,
} from '@/lib/gary/format';

describe('parseGameTime', () => {
  // daily_slate hands back Postgres' own rendering, which Safari rejects
  // outright: space instead of T, and a two-digit offset.
  it('parses the Postgres timestamptz form', () => {
    expect(parseGameTime('2026-07-27 18:35:00+00')?.toISOString()).toBe('2026-07-27T18:35:00.000Z');
  });
  it('parses ISO from the picks JSON', () => {
    expect(parseGameTime('2026-07-27T18:35:00.000Z')?.toISOString()).toBe('2026-07-27T18:35:00.000Z');
  });
  it('returns null for junk', () => {
    expect(parseGameTime('not a time')).toBeNull();
    expect(parseGameTime(null)).toBeNull();
  });
});

describe('etTime', () => {
  it('renders ET, not UTC', () => {
    expect(etTime('2026-07-27 18:35:00+00')).toBe('2:35 PM');
  });
});

describe('pickDropTime', () => {
  it('is 90 minutes before first pitch', () => {
    expect(pickDropTime('2026-07-27 18:35:00+00')).toBe('1:05 PM');
  });
});

describe('oddsText', () => {
  it('signs positive odds', () => {
    expect(oddsText(135)).toBe('+135');
    expect(oddsText('135')).toBe('+135');
  });
  it('keeps negative odds', () => {
    expect(oddsText(-132)).toBe('-132');
    expect(oddsText('-132')).toBe('-132');
  });
  it('is null for empty input', () => {
    expect(oddsText(null)).toBeNull();
    expect(oddsText('')).toBeNull();
  });
});

describe('propLabel', () => {
  it('maps the raw column token', () => {
    expect(propLabel('total_bases 1.5')).toBe('Total Bases');
    expect(propLabel('home_runs 0.5')).toBe('Home Runs');
    expect(propLabel('hits_runs_rbis 1.5')).toBe('H+R+RBI');
  });
  it('title-cases unknown tokens instead of shouting them', () => {
    expect(propLabel('bunt_attempts 0.5')).toBe('Bunt Attempts');
  });
  it('is empty for nothing', () => {
    expect(propLabel(null)).toBe('');
  });
});

describe('propCall', () => {
  it('reads like a slip', () => {
    expect(propCall({ bet: 'over', line: '1.5', prop: 'total_bases 1.5' })).toBe('OVER 1.5 Total Bases');
  });
});

describe('marketLine', () => {
  const base = { total: '8', spread: '1.5', league: 'MLB', homeAbbr: 'Rangers', awayAbbr: 'Mariners' };
  it('lays the run line on the favourite (away)', () => {
    expect(marketLine({ ...base, mlHome: '112', mlAway: '-132' })).toBe('O/U 8 · RL Mariners -1.5');
  });
  it('lays the run line on the favourite (home)', () => {
    expect(marketLine({ ...base, mlHome: '-118', mlAway: '100' })).toBe('O/U 8 · RL Rangers -1.5');
  });
  it('never prints a positive run line from a negative spread', () => {
    expect(marketLine({ ...base, spread: '-1.5', mlHome: '-124', mlAway: '106' })).toContain('-1.5');
  });
  it('drops the run line when a price is missing', () => {
    expect(marketLine({ ...base, mlHome: null, mlAway: null })).toBe('O/U 8');
  });
  it('is null with nothing to say', () => {
    expect(marketLine({ total: null, spread: null })).toBeNull();
  });
});

describe('parseScoutSections', () => {
  const read = [
    'THE PICK: Dominic Canzone OVER 1.5 Total Bases (+135)',
    'MATCHUP: RHP Kumar Rocker (Throws: R) vs Dominic Canzone (Bats: L)',
    'THE RISK: Texas pulls Rocker early.',
  ].join('\n\n');

  it('splits the labelled blocks back out', () => {
    const s = parseScoutSections(read);
    expect(s.map(x => x.label)).toEqual(['MATCHUP', 'THE RISK']);
    expect(s[0].body).toContain('Kumar Rocker');
  });
  it('drops the label the chip already states', () => {
    expect(parseScoutSections(read).some(s => s.label === 'THE PICK')).toBe(false);
  });
  it('drops a bare restated pick line', () => {
    const s = parseScoutSections('Seattle looks live.\n\nPick: Mariners ML -131\n\nKirby has been sharp.');
    expect(s).toHaveLength(2);
  });
  it('keeps unlabelled paragraphs as paragraphs', () => {
    const s = parseScoutSections('One thought.\n\nAnother thought.');
    expect(s).toHaveLength(2);
    expect(s[0].label).toBeUndefined();
  });
  it('groups an unbroken blob instead of printing one wall', () => {
    const blob = Array.from({ length: 9 }, (_, i) => `Sentence number ${i}`).join('. ') + '.';
    expect(parseScoutSections(blob).length).toBeGreaterThan(1);
  });
  it('is empty for nothing', () => {
    expect(parseScoutSections('')).toEqual([]);
    expect(parseScoutSections(null)).toEqual([]);
  });
});

describe('leadSection', () => {
  it('prefers the reasoning over the matchup boilerplate', () => {
    const read = 'MATCHUP: RHP vs LHB\n\nTHE KEY FACTOR: Rocker cannot get lefties out.';
    expect(leadSection(read)).toBe('Rocker cannot get lefties out.');
  });
  it('falls back to the first block', () => {
    expect(leadSection('MATCHUP: RHP vs LHB')).toBe('RHP vs LHB');
  });
});

describe('scoutSectionsExcluding', () => {
  it('drops what the reader was already shown', () => {
    const plain = 'Seattle got a lift on Sunday, but the pitching decides this.\n\nI am taking the Mariners.';
    const full = 'Seattle got a lift on Sunday, but the pitching decides this.\n\nKirby has held Texas to .200.';
    const s = scoutSectionsExcluding(full, plain);
    expect(s).toHaveLength(1);
    expect(s[0].body).toContain('Kirby');
  });
  it('keeps everything when nothing overlaps', () => {
    expect(scoutSectionsExcluding('A brand new thought entirely here.', 'Nothing like it at all.')).toHaveLength(1);
  });
});
