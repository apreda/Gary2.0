import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  etDayBounds,
  formatPropRunOutcome,
  parsePropRunOutcome,
  propGameDiscoveryOptions,
  propGameRejectionReason,
  propPickDedupeKey,
  reconcilePropTeam,
  samePropGame,
} from '../../scripts/lib/propsRunReliability.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');
const src = (rel) => readFileSync(path.join(root, rel), 'utf8');

describe('MLB props pregame gate', () => {
  const base = {
    useESTDayFiltering: true,
    todayStart: Date.parse('2026-08-15T04:00:00Z'),
    tomorrowStart: Date.parse('2026-08-16T04:00:00Z'),
    windowMs: 24 * 60 * 60 * 1000,
  };

  it('rejects a started game even when it belongs to the current ET day', () => {
    const game = { id: 42, commence_time: '2026-08-15T17:00:00Z' };
    expect(propGameRejectionReason(game, { ...base, now: Date.parse('2026-08-15T17:00:00Z') })).toBe('started');
    expect(propGameRejectionReason(game, { ...base, now: Date.parse('2026-08-15T17:01:00Z') })).toBe('started');
  });

  it('accepts the exact upcoming game in ET-day mode', () => {
    const game = { id: 42, commence_time: '2026-08-15T17:00:00Z', home_team: 'Cubs', away_team: 'Cardinals' };
    expect(propGameRejectionReason(game, {
      ...base,
      now: Date.parse('2026-08-15T16:59:59Z'),
      gameIdFilter: '42',
    })).toBeNull();
  });
});

describe('props game discovery scope', () => {
  it('uses exact provider transport for NFL and NCAAF game-id retries', () => {
    expect(propGameDiscoveryOptions({
      sportKey: 'americanfootball_nfl',
      nocache: true,
      gameIdFilter: '1393560',
      etDate: '2026-08-15',
    })).toEqual({ nocache: true, targetDate: '2026-08-15', gameId: '1393560' });
    expect(propGameDiscoveryOptions({
      sportKey: 'americanfootball_ncaaf',
      nocache: true,
      gameIdFilter: '5059617',
      etDate: '2026-08-15',
    })).toEqual({ nocache: true, targetDate: '2026-08-15', gameId: '5059617' });
  });

  it('keeps non-football exact retries on their established ET-date path', () => {
    expect(propGameDiscoveryOptions({
      sportKey: 'baseball_mlb',
      nocache: true,
      gameIdFilter: '42',
      etDate: '2026-08-15',
    })).toEqual({ nocache: true, targetDate: '2026-08-15' });
  });

  it('preserves the sport runner discovery window without a game id', () => {
    expect(propGameDiscoveryOptions({
      sportKey: 'americanfootball_nfl',
      nocache: false,
      gameIdFilter: null,
      etDate: '2026-08-15',
    })).toEqual({ nocache: false });
    expect(propGameDiscoveryOptions({
      sportKey: 'americanfootball_ncaaf',
      nocache: true,
      gameIdFilter: null,
      etDate: '2026-08-15',
    })).toEqual({ nocache: true });
  });

  it('wires the exact-game discovery policy into the shared props runner', () => {
    const cli = src('scripts/run-agentic-props-cli.js');
    expect(cli).toContain('getUpcomingGames(sportKey, propGameDiscoveryOptions({');
    expect(cli).toContain('sportKey,\n    nocache,\n    gameIdFilter,\n    etDate: getESTDate(),');
  });
});

describe('ET calendar boundaries', () => {
  it('uses a 23-hour day when daylight saving time starts', () => {
    const { start, end } = etDayBounds('2026-03-08');
    expect(new Date(start).toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(new Date(end).toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect(end - start).toBe(23 * 60 * 60 * 1000);
  });

  it('uses a 25-hour day when daylight saving time ends', () => {
    const { start, end } = etDayBounds('2026-11-01');
    expect(new Date(start).toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(new Date(end).toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(end - start).toBe(25 * 60 * 60 * 1000);
  });
});

describe('props game identity', () => {
  it('keeps doubleheader games separate even when matchup text is identical', () => {
    const gameOne = { game_id: 1001, matchup: 'Cardinals @ Cubs', player: 'A', prop: 'hits 0.5' };
    const gameTwo = { game_id: 1002, matchup: 'Cardinals @ Cubs', player: 'A', prop: 'hits 0.5' };
    expect(samePropGame(gameOne, gameTwo)).toBe(false);
    expect(propPickDedupeKey(gameOne)).not.toBe(propPickDedupeKey(gameTwo));
  });

  it('uses matchup only when both records are legacy rows without game ids', () => {
    expect(samePropGame(
      { matchup: 'Cardinals @ Cubs' },
      { matchup: 'cardinals @ cubs' },
    )).toBe(true);
    expect(samePropGame(
      { game_id: 1002, matchup: 'Cardinals @ Cubs' },
      { matchup: 'Cardinals @ Cubs' },
    )).toBe(false);
  });
});

describe('provider identity reconciliation', () => {
  it('uses the provider team when present and falls back to the model only when absent', () => {
    expect(reconcilePropTeam('Model Yankees', 'New York Yankees')).toBe('New York Yankees');
    expect(reconcilePropTeam('New York Yankees', null)).toBe('New York Yankees');
    expect(reconcilePropTeam('New York Yankees', 'MLB')).toBe('New York Yankees');
    expect(reconcilePropTeam('', '')).toBeNull();
  });

  it('the storage mapping takes the team from the matched provider row', () => {
    expect(src('scripts/run-agentic-props-cli.js')).toContain('team: reconcilePropTeam(pick.team, _oddsRow?.team)');
  });
});

describe('scheduler-readable props outcomes', () => {
  it('round-trips stored and explicit-pass outcomes', () => {
    const stored = { status: 'stored', game_ids: ['42'], pick_count: 2 };
    const passed = { status: 'pass', game_ids: ['43'], pick_count: 0 };
    expect(parsePropRunOutcome(`noise\n${formatPropRunOutcome(stored)}\n`)).toEqual(stored);
    expect(parsePropRunOutcome(formatPropRunOutcome(passed))).toEqual(passed);
  });

  it('rejects absent, malformed, and unknown outcome markers', () => {
    expect(parsePropRunOutcome('ordinary log')).toBeNull();
    expect(parsePropRunOutcome('@@GARY_PROP_OUTCOME@@{bad')).toBeNull();
    expect(parsePropRunOutcome('@@GARY_PROP_OUTCOME@@{"status":"unknown"}')).toBeNull();
  });
});

describe('technical failures stay failures', () => {
  it('invalid model JSON throws into the provider cascade', () => {
    const brain = src('src/services/pickdesk/propsBrain.js');
    expect(brain).toContain("throw new Error('parse: no valid picks JSON after re-ask')");
    expect(brain).not.toContain("return { error: 'parse: no valid picks JSON after re-ask' }");
  });

  it('line, processing, credential, read, and write failures throw', () => {
    const cli = src('scripts/run-agentic-props-cli.js');
    expect(cli).toContain('No${hrOnly ? \' HR\' : \'\'} prop lines available');
    expect(cli).toContain('throw new Error(`Props processing failed for ${matchup}');
    expect(cli).toContain("throw new Error('Missing Supabase credentials')");
    expect(cli).toContain('Could not read existing ${testTableName} row');
    expect(cli).toContain('Could not store ${testTableName} row');
  });

  it('menu snapshots read and update by BDL game id, not matchup', () => {
    const brain = src('src/services/pickdesk/propsBrain.js');
    expect(brain).toContain('&bdl_game_id=eq.${encodeURIComponent(gameId)}');
    expect(brain).toContain("method: existingId == null ? 'POST' : 'PATCH'");
    expect(brain).not.toContain('&matchup=eq.${encodeURIComponent(matchup)}');
  });
});
