import { describe, expect, it } from 'vitest';
import {
  constrainLiveScoreGateToWindow,
  evaluateLiveScoreSourceResults,
  isAuthoritativeSlateFullyFinal,
  resolveLiveScoreSourceGate,
  selectLiveScoreSources,
} from '../../supabase/functions/_shared/liveScoreSourceGate.js';

const LOCAL_SOURCES = ['MLB', 'NBA', 'NHL', 'NFL', 'NCAAF'];

describe('live-score daily_slate source gate', () => {
  it('runs only leagues present on the exact-date slate and counts their games', () => {
    const gate = resolveLiveScoreSourceGate({
      rows: [{ league: 'MLB' }, { league: 'nfl' }, { league: 'MLB' }],
      supportedLeagues: LOCAL_SOURCES,
    });

    expect(gate).toMatchObject({
      mode: 'daily-slate',
      authoritative: true,
      leagues: ['MLB', 'NFL'],
      counts: { MLB: 2, NBA: 0, NHL: 0, NFL: 1, NCAAF: 0 },
    });
  });

  it.each([
    { rows: [], error: null, mode: 'fallback-empty' },
    { rows: null, error: 'REST 503', mode: 'fallback-unavailable' },
    { rows: [{ league: null }], error: null, mode: 'fallback-malformed' },
  ])('fails open for $mode so scheduled football cannot be hidden', ({ rows, error, mode }) => {
    const gate = resolveLiveScoreSourceGate({ rows, error, supportedLeagues: LOCAL_SOURCES });
    expect(gate.authoritative).toBe(false);
    expect(gate.mode).toBe(mode);
    expect(gate.leagues).toEqual(LOCAL_SOURCES);
  });

  it('allows unrelated valid slate leagues alongside a supported league', () => {
    const gate = resolveLiveScoreSourceGate({
      rows: [{ league: 'WC' }, { league: 'NFL' }],
      supportedLeagues: LOCAL_SOURCES,
    });
    expect(gate.authoritative).toBe(true);
    expect(gate.leagues).toEqual(['NFL']);
  });

  it('treats a valid non-empty slate with no supported leagues as an off day', () => {
    const gate = resolveLiveScoreSourceGate({
      rows: [{ league: 'NBA' }],
      supportedLeagues: ['MLB', 'NFL', 'NCAAF'],
    });
    expect(gate).toMatchObject({
      mode: 'daily-slate',
      authoritative: true,
      leagues: [],
    });
    expect(selectLiveScoreSources(gate, [
      { name: 'MLB' }, { name: 'NFL' }, { name: 'NCAAF' },
    ])).toEqual([]);
  });

  it('selects lazy loaders without invoking absent-league providers', async () => {
    const calls = [];
    const sources = ['MLB', 'NFL', 'NCAAF'].map((name) => ({
      name,
      load: async () => { calls.push(name); return []; },
    }));
    const gate = resolveLiveScoreSourceGate({
      rows: [{ league: 'MLB' }, { league: 'NFL' }],
      supportedLeagues: sources.map((source) => source.name),
    });

    const selected = selectLiveScoreSources(gate, sources);
    expect(selected.map((source) => source.name)).toEqual(['MLB', 'NFL']);
    expect(calls).toEqual([]);
    await Promise.all(selected.map((source) => source.load()));
    expect(calls).toEqual(['MLB', 'NFL']);
  });
});

describe('live-score source result contract', () => {
  it('keeps successful rows while surfacing an expected source failure', () => {
    const gate = resolveLiveScoreSourceGate({
      rows: [{ league: 'MLB' }, { league: 'NFL' }],
      supportedLeagues: ['MLB', 'NFL', 'NCAAF'],
    });
    const sources = [{ name: 'MLB' }, { name: 'NFL' }];
    const result = evaluateLiveScoreSourceResults({
      gate,
      sources,
      settled: [
        { status: 'fulfilled', value: [{ league: 'MLB', game_id: '1' }] },
        { status: 'rejected', reason: new Error('BDL NFL 429') },
      ],
    });

    expect(result.items).toEqual([{ league: 'MLB', game_id: '1' }]);
    expect(result.requiredFailures).toEqual([
      { name: 'NFL', message: 'BDL NFL 429', required: true },
    ]);
  });

  it('preserves fulfilled leagues on a three-source mixed result', () => {
    const gate = resolveLiveScoreSourceGate({
      rows: [{ league: 'MLB' }, { league: 'NFL' }, { league: 'NCAAF' }],
      supportedLeagues: ['MLB', 'NFL', 'NCAAF'],
    });
    const result = evaluateLiveScoreSourceResults({
      gate,
      sources: [{ name: 'MLB' }, { name: 'NFL' }, { name: 'NCAAF' }],
      settled: [
        { status: 'fulfilled', value: [{ league: 'MLB', game_id: '1' }] },
        { status: 'rejected', reason: new Error('BDL NFL 429') },
        { status: 'fulfilled', value: [{ league: 'NCAAF', game_id: '3' }] },
      ],
    });

    expect(result.items.map((row) => row.league)).toEqual(['MLB', 'NCAAF']);
    expect(result.requiredFailures).toEqual([
      { name: 'NFL', message: 'BDL NFL 429', required: true },
    ]);
  });

  it('treats an empty authoritative source as a failure, not an off day', () => {
    const gate = resolveLiveScoreSourceGate({
      rows: [{ league: 'NFL' }, { league: 'NFL' }],
      supportedLeagues: ['NFL', 'NCAAF'],
    });
    const result = evaluateLiveScoreSourceResults({
      gate,
      sources: [{ name: 'NFL' }],
      settled: [{ status: 'fulfilled', value: [] }],
    });
    expect(result.requiredFailures[0].message).toContain('expects 2 game(s)');
  });

  it('does not invent an error for an empty fail-open off-day source', () => {
    const gate = resolveLiveScoreSourceGate({
      rows: [],
      supportedLeagues: ['NFL', 'NCAAF'],
    });
    const result = evaluateLiveScoreSourceResults({
      gate,
      sources: [{ name: 'NCAAF' }],
      settled: [{ status: 'fulfilled', value: [] }],
      alwaysRequiredLeagues: ['NFL', 'NCAAF'],
    });
    expect(result.failures).toEqual([]);
  });
});

describe('live-score polling window', () => {
  const now = Date.parse('2026-08-15T16:00:00Z');
  const baseGate = resolveLiveScoreSourceGate({
    rows: [{ league: 'MLB' }, { league: 'NFL' }],
    supportedLeagues: ['MLB', 'NFL', 'NCAAF'],
  });

  it('spends no provider requests when every game is still outside the imminent window', () => {
    const gate = constrainLiveScoreGateToWindow(baseGate, {
      nowMs: now,
      rows: [
        { league: 'MLB', bdl_game_id: 1, commence_time: '2026-08-15T17:10:00Z' },
        { league: 'NFL', bdl_game_id: 2, commence_time: '2026-08-15T17:00:00Z' },
      ],
    });
    expect(gate.leagues).toEqual([]);
    expect(gate.mode).toBe('daily-slate-window');
  });

  it('selects only the league with an imminent nonfinal game', () => {
    const gate = constrainLiveScoreGateToWindow(baseGate, {
      nowMs: now,
      rows: [
        { league: 'MLB', bdl_game_id: 1, commence_time: '2026-08-15T16:15:00Z' },
        { league: 'NFL', bdl_game_id: 2, commence_time: '2026-08-15T17:00:00Z' },
      ],
    });
    expect(gate.leagues).toEqual(['MLB']);
  });

  it('does not poll an already-final game and reactivates the league for its next game', () => {
    const rows = [
      { league: 'NFL', bdl_game_id: 2, commence_time: '2026-08-15T15:00:00Z' },
      { league: 'NFL', bdl_game_id: 3, commence_time: '2026-08-15T19:00:00Z' },
    ];
    const settled = constrainLiveScoreGateToWindow(baseGate, {
      nowMs: now,
      rows,
      storedRows: [{ league: 'NFL', game_id: '2', status: 'final' }],
    });
    expect(settled.leagues).toEqual([]);

    const nextKickoff = constrainLiveScoreGateToWindow(baseGate, {
      nowMs: Date.parse('2026-08-15T18:45:00Z'),
      rows,
      storedRows: [{ league: 'NFL', game_id: '2', status: 'final' }],
    });
    expect(nextKickoff.leagues).toEqual(['NFL']);
  });

  it('fails open for a malformed commence time in an authoritative league', () => {
    const gate = constrainLiveScoreGateToWindow(baseGate, {
      nowMs: now,
      rows: [{ league: 'NFL', bdl_game_id: 2, commence_time: null }],
    });
    expect(gate.leagues).toEqual(['NFL']);
  });

  it('does not call an all-final early window the final slate while a later league is pending', () => {
    const rows = [
      { league: 'MLB', bdl_game_id: 1, commence_time: '2026-08-15T15:00:00Z' },
      { league: 'NFL', bdl_game_id: 2, commence_time: '2026-08-15T23:00:00Z' },
    ];
    const gate = constrainLiveScoreGateToWindow(resolveLiveScoreSourceGate({
      rows,
      supportedLeagues: ['MLB', 'NFL', 'NCAAF'],
    }), {
      rows,
      storedRows: [{ league: 'MLB', game_id: '1', status: 'final' }],
      nowMs: now,
    });

    expect(gate.leagues).toEqual([]);
    expect(isAuthoritativeSlateFullyFinal({
      gate,
      slateRows: rows,
      storedRows: [{ league: 'MLB', game_id: '1', status: 'final' }],
    })).toBe(false);

    const laterWindow = constrainLiveScoreGateToWindow(resolveLiveScoreSourceGate({
      rows,
      supportedLeagues: ['MLB', 'NFL', 'NCAAF'],
    }), {
      rows,
      storedRows: [{ league: 'MLB', game_id: '1', status: 'final' }],
      nowMs: Date.parse('2026-08-15T22:45:00Z'),
    });
    expect(laterWindow.leagues).toEqual(['NFL']);
  });

  it('allows the cheap exit only after every exact authoritative game is final', () => {
    const rows = [
      { league: 'MLB', bdl_game_id: 1, commence_time: '2026-08-15T15:00:00Z' },
      { league: 'NFL', bdl_game_id: 2, commence_time: '2026-08-15T23:00:00Z' },
    ];
    const gate = resolveLiveScoreSourceGate({
      rows,
      supportedLeagues: ['MLB', 'NFL', 'NCAAF'],
    });
    expect(isAuthoritativeSlateFullyFinal({
      gate,
      slateRows: rows,
      storedRows: [
        { league: 'MLB', game_id: '1', status: 'final' },
        { league: 'NFL', game_id: '2', status: 'final' },
      ],
    })).toBe(true);
    expect(isAuthoritativeSlateFullyFinal({
      gate,
      slateRows: [{ league: 'NFL', bdl_game_id: null }],
      storedRows: [{ league: 'NFL', game_id: '2', status: 'final' }],
    })).toBe(false);
  });
});
