import { describe, it, expect } from 'vitest';
import { sliceDeskForNews, buildNewsAsk, parseNews, newsAdjustment, readLateNews, FACT_POINTS } from '../../../src/services/shadow/newsReader.js';
import { adjust, DEFAULT_WEIGHTS } from '../../../src/services/shadow/marketModel.js';

const HOME = 'Boston Red Sox';
const AWAY = 'Seattle Mariners';

describe('newsReader — slicing the desk', () => {
  it('keeps the storylines section and every paragraph with an availability word, drops the rest', () => {
    const desk = [
      'Season OPS .742, 78-61, run differential +40.',
      'Chapman threw 28 pitches yesterday and the manager said he is unavailable tonight.',
      'The park plays neutral in September.',
      '— THE STORYLINES —\n### Mariners\nBryce Miller is on a 75-pitch limit in his return from the IL.',
    ].join('\n\n');
    const s = sliceDeskForNews(desk);
    expect(s).toContain('unavailable tonight');
    expect(s).toContain('THE STORYLINES');
    expect(s).toContain('75-pitch limit');
    expect(s).not.toContain('Season OPS');
    expect(s).not.toContain('plays neutral');
    expect(sliceDeskForNews('')).toBe('');
  });

  it('the ask names the game, asks for typed facts only, and carries the contract', () => {
    const ask = buildNewsAsk({ homeTeam: HOME, awayTeam: AWAY, todayEt: '2026-09-03', deskSlice: 'SLICE' });
    expect(ask).toContain('Seattle Mariners at Boston Red Sox');
    expect(ask).toContain('SLICE');
    expect(ask).toContain('Typed facts only');
    expect(ask).toContain('closer_unavailable|reliever_unavailable|starter_pitch_limit');
    expect(ask).toContain('do not say who will win');
    expect(ask).not.toMatch(/recommend|value|edge/i);
  });
});

describe('newsReader — parsing and points', () => {
  const answer = JSON.stringify({ facts: [
    { club: 'Red Sox', type: 'closer_unavailable', player: 'Aroldis Chapman', detail: 'manager said he is down tonight', source: 'Boston Globe', when: 'today 1 PM', confidence: 'high' },
    { club: 'Mariners', type: 'starter_pitch_limit', player: 'Bryce Miller', detail: 'capped at 75 pitches', source: 'Seattle Times', confidence: 'medium' },
    { club: 'Mariners', type: 'lineup_scratch', player: 'Cal Raleigh', detail: 'scratched, back', source: 'beat', confidence: 'high' },
    { club: 'Yankees', type: 'lineup_scratch', player: 'X', detail: 'wrong game', source: '', confidence: 'high' },
    { club: 'Red Sox', type: 'weather_risk', player: '', detail: 'rain 40%', source: 'NWS', confidence: 'low' },
  ] });

  it('maps clubs to sides, drops unknown clubs, keeps types', () => {
    const p = parseNews('```json\n' + answer + '\n```', HOME, AWAY);
    expect(p.facts).toHaveLength(4);
    expect(p.facts[0]).toMatchObject({ side: 'home', type: 'closer_unavailable', player: 'Aroldis Chapman', confidence: 'high' });
    expect(p.facts[1].side).toBe('away');
    expect(parseNews('nothing', HOME, AWAY)).toBeNull();
  });

  it('turns facts into points toward home, with confidence and the news weight, and records drivers', () => {
    const { facts } = parseNews(answer, HOME, AWAY);
    const features = { home: { pen: { down: [] }, lineup: { missing: [] }, leash: { short: false } }, away: { pen: { down: [] }, lineup: { missing: [] }, leash: { short: false } } };
    const a = newsAdjustment(facts, features, { news: 1.0 });
    // home closer down: -0.8; away pitch limit medium: +0.75; away scratch high: +0.8; weather: 0
    expect(a.pts).toBe(0.8); // -0.8 + 0.75 + 0.8 = 0.75, rounded to a tenth
    expect(a.drivers.map((d) => d.name)).toEqual(['home news: closer unavailable', 'away news: starter pitch limit', 'away news: lineup scratch']);
    expect(newsAdjustment(facts, features, { news: 0 }).pts).toBe(0);
  });

  it('never counts a fact the feeds already carried', () => {
    const { facts } = parseNews(answer, HOME, AWAY);
    const features = {
      home: { pen: { down: ['Aroldis Chapman (28 pitches yesterday)'] }, lineup: { missing: [] }, leash: { short: false } },
      away: { pen: { down: [] }, lineup: { missing: ['Cal Raleigh'] }, leash: { short: true } },
    };
    const a = newsAdjustment(facts, features, { news: 1.0 });
    expect(a.pts).toBe(0);
    expect(a.drivers).toHaveLength(0);
  });

  it('caps lineup scratches at two a side and rides into the model adjustment', () => {
    const many = { facts: Array.from({ length: 4 }, (_, i) => ({ side: 'home', type: 'lineup_scratch', player: `P${i}`, detail: 'out', source: '', confidence: 'high' })) };
    const a = newsAdjustment(many.facts, { home: {}, away: {} }, { news: 1.0 });
    expect(a.pts).toBeCloseTo(-2 * FACT_POINTS.lineup_scratch, 5);
    const full = adjust({ home: { pen: { score: 1, available: 4, of: 4 }, lineup: { count: 0 }, leash: {} }, away: { pen: { score: 1, available: 4, of: 4 }, lineup: { count: 0 }, leash: {} }, news: a }, DEFAULT_WEIGHTS);
    expect(full.pts).toBe(-1.6);
    expect(full.drivers).toHaveLength(2);
  });
});

describe('newsReader — readLateNews (fail-soft)', () => {
  it('returns typed facts from a good call with search on, and empty facts on any failure', async () => {
    let seen = null;
    const good = async (prompt, opts) => { seen = { prompt, opts }; return { success: true, data: JSON.stringify({ facts: [{ club: HOME, type: 'opener_bulk', player: 'A', detail: 'opener', source: 's', confidence: 'high' }] }) }; };
    const r = await readLateNews({ homeTeam: HOME, awayTeam: AWAY, todayEt: '2026-09-03', deskText: 'x' }, { oneShot: good });
    expect(r.facts).toHaveLength(1);
    expect(seen.opts).toMatchObject({ search: true, breakerKey: 'codex-news' });
    expect((await readLateNews({ homeTeam: HOME, awayTeam: AWAY, todayEt: '2026-09-03', deskText: 'x' }, { oneShot: async () => ({ success: false, error: 'down' }) })).facts).toEqual([]);
    expect((await readLateNews({ homeTeam: HOME, awayTeam: AWAY, todayEt: '2026-09-03', deskText: 'x' }, { oneShot: async () => { throw new Error('boom'); } })).error).toBe('boom');
  });
});
