import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  attachDebutContext,
  isDebutStarter,
  milbLineFromStatsReply,
} from '../../src/services/starterDebut.js';

const tomorrowSrc = readFileSync(new URL('../../src/services/tomorrowService.js', import.meta.url), 'utf8');
const modelsSrc = readFileSync(new URL('../../../ios/GaryApp/Models.swift', import.meta.url), 'utf8');
const viewsSrc = readFileSync(new URL('../../../ios/GaryApp/Views.swift', import.meta.url), 'utf8');

// Aug 17 2026 (founder GO): a starter with zero MLB data — Kent Emanuel's
// blank plate — renders an honest empty state plus his labeled minor-league
// season line when MLB StatsAPI has one. Never fake zeros: a 0.00 ERA is a
// real stat, and absence must read as absence.

describe('isDebutStarter', () => {
  it('flags an MLB starter whose official MLB log is CONFIRMED empty', () => {
    expect(isDebutStarter({ league: 'MLB', era: null, mlb_log_confirmed_empty: true })).toBe(true);
  });

  it('never flags on mere absence of data — a lookup failure is not a debut', () => {
    // Finding-5 guard (Aug 18): an unresolvable name must not masquerade as
    // "No MLB starts"; the flag needs positive evidence from MLB's own log.
    expect(isDebutStarter({ league: 'MLB', era: null })).toBe(false);
  });

  it('never flags a starter with any MLB presence or a non-MLB row', () => {
    expect(isDebutStarter({ league: 'MLB', era: 3.6, mlb_log_confirmed_empty: true })).toBe(false);
    expect(isDebutStarter({ league: 'MLB', last_outing: { ip: '5.0' }, mlb_log_confirmed_empty: true })).toBe(false);
    expect(isDebutStarter({ league: 'MLB', l3: { gs: 2 }, mlb_log_confirmed_empty: true })).toBe(false);
    expect(isDebutStarter({ league: 'NFL', mlb_log_confirmed_empty: true })).toBe(false);
  });
});

describe('milbLineFromStatsReply', () => {
  const reply = {
    stats: [{ splits: [{ stat: { era: '4.12', inningsPitched: '89.0', strikeOuts: 92 } }] }],
  };

  it('extracts a labeled season line from a StatsAPI pitching reply', () => {
    expect(milbLineFromStatsReply(reply, 'AAA')).toEqual({
      level: 'AAA', era: 4.12, ip: '89.0', k: 92,
    });
  });

  it('returns null for an empty or malformed reply instead of inventing a line', () => {
    expect(milbLineFromStatsReply({ stats: [] }, 'AAA')).toBe(null);
    expect(milbLineFromStatsReply(null, 'AAA')).toBe(null);
    expect(milbLineFromStatsReply({ stats: [{ splits: [{ stat: {} }] }] }, 'AAA')).toBe(null);
  });
});

describe('attachDebutContext', () => {
  it('flags debut starters and attaches the first level with data', async () => {
    const starters = [
      { league: 'MLB', full_name: 'Kent Emanuel', person_id: 605288, era: null, mlb_log_confirmed_empty: true },
      { league: 'MLB', full_name: 'Quinn Mathews', person_id: 700000, era: 3.6 },
    ];
    const calls = [];
    await attachDebutContext(starters, {
      fetchLevel: async (personId, level) => {
        calls.push([personId, level]);
        if (level === 'AAA') return { level, era: 4.12, ip: '89.0', k: 92 };
        return null;
      },
    });
    expect(starters[0].no_mlb_starts).toBe(true);
    expect(starters[0].milb).toEqual({ level: 'AAA', era: 4.12, ip: '89.0', k: 92 });
    // The established starter is untouched.
    expect(starters[1].no_mlb_starts).toBeUndefined();
    expect(calls).toEqual([[605288, 'AAA']]);
  });

  it('falls through AAA to AA and stays honest-empty when neither has data', async () => {
    const starters = [{ league: 'MLB', full_name: 'Kent Emanuel', person_id: 605288, era: null, mlb_log_confirmed_empty: true }];
    await attachDebutContext(starters, { fetchLevel: async () => null });
    expect(starters[0].no_mlb_starts).toBe(true);
    expect(starters[0].milb).toBeUndefined();
  });

  it('keeps the flag when the fetch throws (honest-empty, never fatal)', async () => {
    const starters = [{ league: 'MLB', full_name: 'Kent Emanuel', person_id: 605288, era: null, mlb_log_confirmed_empty: true }];
    await attachDebutContext(starters, {
      fetchLevel: async () => { throw new Error('MiLB feed down'); },
    });
    expect(starters[0].no_mlb_starts).toBe(true);
    expect(starters[0].milb).toBeUndefined();
  });
});

describe('board and iOS wiring', () => {
  it('runs the debut pass in the board build after the outings enrich', () => {
    expect(tomorrowSrc).toContain('attachDebutContext(starters');
  });

  it('stamps confirmed-empty only from the official person_id log', () => {
    expect(tomorrowSrc).toContain('st.mlb_log_confirmed_empty = true');
  });

  it('decodes the debut fields on TomorrowPerson', () => {
    expect(modelsSrc).toContain('let no_mlb_starts: Bool?');
    expect(modelsSrc).toContain('let milb: TomorrowMilb?');
  });

  it('renders the honest empty state and the labeled MiLB line on the plate', () => {
    expect(viewsSrc).toContain('"No MLB starts"');
    expect(viewsSrc).toContain('milbLine(p)');
  });
});
