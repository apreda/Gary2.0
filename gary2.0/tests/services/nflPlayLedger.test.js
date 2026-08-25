import { describe, expect, it } from 'vitest';
import { _internals, teamLedger, starterTimeline } from '../../src/services/nflPlayLedger.js';
import { SPLITS } from '../../src/services/nflPlayLedger.js';

/**
 * THE SEASON PLAY LEDGER.
 *
 * This is the spine under goal-line, two-minute, early-down, real EPA, real
 * success rate, explosive rate, pressure, and roster continuity. If it
 * miscounts, eleven lanes lie at once — so what is guarded here is the
 * counting, not the plumbing.
 *
 * The failure this file is shaped around: a filter that looks right and
 * silently matches almost nothing. The first version of the garbage-time
 * split used an INCLUSION list of ['rush','pass'] against a hyphenated
 * vocabulary (pass-reception, rushing-touchdown) and matched only plain
 * rushes — dropping every pass in the game while reporting a confident rate.
 */

const HEADER = [
  'game_id', 'week', 'season_type', 'posteam', 'defteam', 'play_type',
  'down', 'ydstogo', 'yardline_100', 'goal_to_go', 'half_seconds_remaining',
  'qtr', 'score_differential', 'epa', 'wpa', 'success', 'wp',
  'qb_dropback', 'qb_hit', 'sack', 'pass_oe', 'penalty',
  'passer_player_name', 'rusher_player_name', 'receiver_player_name',
  'yards_gained', 'touchdown', 'interception', 'fumble_lost',
  'third_down_converted', 'fourth_down_converted', 'shotgun', 'no_huddle'
];

describe('CSV parsing refuses to lose a row', () => {
  it('splits quoted fields containing commas', () => {
    const cells = _internals.splitLine('a,"b,c",d');
    expect(cells).toEqual(['a', 'b,c', 'd']);
  });

  it('handles a doubled quote inside a quoted field', () => {
    expect(_internals.splitLine('a,"he said ""go""",c')).toEqual(['a', 'he said "go"', 'c']);
  });

  it('detects a line that ends mid-quote, so a wrapped record is rejoined', () => {
    // nflverse does not currently wrap records, but assuming it never will is
    // how a season quietly loses rows when an upstream export changes.
    expect(_internals.unbalanced('a,"b')).toBe(true);
    expect(_internals.unbalanced('a,"b",c')).toBe(false);
  });
});

describe('the split definitions', () => {
  it('every split has a key, a label and a predicate', () => {
    for (const split of SPLITS) {
      expect(typeof split.key).toBe('string');
      expect(typeof split.label).toBe('string');
      expect(typeof split.test).toBe('function');
    }
  });

  it('names the situations the desk actually asks about', () => {
    const keys = SPLITS.map((s) => s.key);
    for (const wanted of ['goal_to_go', 'short_yardage', 'two_minute', 'early_down', 'third_and_long', 'red_zone']) {
      expect(keys).toContain(wanted);
    }
  });

  it('goal-to-go reads the flag, not a yardline guess', () => {
    const split = SPLITS.find((s) => s.key === 'goal_to_go');
    expect(split.test({ goalToGo: true })).toBe(true);
    // First-and-goal from the 8 and first-and-10 from the 8 are different
    // situations; only the flag distinguishes them.
    expect(split.test({ goalToGo: false, yardline100: 8 })).toBe(false);
  });

  it('short yardage includes 0 to go rather than treating it as missing', () => {
    const split = SPLITS.find((s) => s.key === 'short_yardage');
    // `(ydstogo || 99) <= 2` reads 0 as falsy and excludes the shortest
    // yardage there is. The predicate must test the number, not its truthiness.
    expect(split.test({ ydstogo: 0 })).toBe(true);
    expect(split.test({ ydstogo: 2 })).toBe(true);
    expect(split.test({ ydstogo: 3 })).toBe(false);
    expect(split.test({ ydstogo: null })).toBe(false);
  });

  it('competitive is decided by win probability, not by score margin', () => {
    const split = SPLITS.find((s) => s.key === 'competitive');
    expect(split.test({ wp: 0.5 })).toBe(true);
    expect(split.test({ wp: 0.97 })).toBe(false);
    expect(split.test({ wp: 0.02 })).toBe(false);
  });
});

describe('aggregation counts what it was given', () => {
  const play = (over = {}) => ({
    playType: 'pass', down: 1, ydstogo: 10, yardline100: 50, goalToGo: false,
    halfSecs: 900, scoreDiff: 0, epa: 0.1, success: 1, wp: 0.5, yards: 12,
    dropback: true, qbHit: false, sack: false, passOe: 0, shotgun: false,
    noHuddle: false, interception: false, fumbleLost: false, penalty: false,
    ...over
  });

  it('an explosive pass is 20 yards, an explosive run is 10', () => {
    const acc = _internals.emptyAccumulator();
    _internals.addPlay(acc, play({ playType: 'pass', yards: 19 }));
    _internals.addPlay(acc, play({ playType: 'pass', yards: 21 }));
    _internals.addPlay(acc, play({ playType: 'run', yards: 11, dropback: false }));
    const out = _internals.finishSide(acc);
    expect(out.overall.plays).toBe(3);
    expect(out.overall.explosive_rate).toBeCloseTo(2 / 3, 3);
  });

  it('QB hit rate is per dropback, so pass volume cannot distort it', () => {
    const acc = _internals.emptyAccumulator();
    for (let i = 0; i < 10; i += 1) _internals.addPlay(acc, play({ qbHit: i < 3 }));
    // Runs must not enter the denominator.
    for (let i = 0; i < 40; i += 1) _internals.addPlay(acc, play({ playType: 'run', dropback: false }));
    const out = _internals.finishSide(acc);
    expect(out.dropbacks).toBe(10);
    expect(out.qb_hit_rate).toBeCloseTo(0.3, 5);
  });

  it('a split with no snaps says so instead of disappearing', () => {
    const acc = _internals.emptyAccumulator();
    _internals.addPlay(acc, play());
    const out = _internals.finishSide(acc);
    // An absent key reads as "no tendency". A zero-play note reads as "no
    // snaps", which is the truth and a different statement.
    expect(out.splits.goal_to_go.plays).toBe(0);
    expect(out.splits.goal_to_go.note).toMatch(/No snaps/);
  });

  it('a null EPA is excluded from the average rather than counted as zero', () => {
    const acc = _internals.emptyAccumulator();
    _internals.addPlay(acc, play({ epa: 1 }));
    _internals.addPlay(acc, play({ epa: null }));
    const out = _internals.finishSide(acc);
    expect(out.overall.plays).toBe(2);
    // Two plays, one measurable: the mean is 1.0, not 0.5.
    expect(out.overall.epa_per_play).toBeCloseTo(1, 5);
  });
});

describe('failures are stated, never empty', () => {
  it('a season with no file is reported as unpublished, not as a team with no tendencies', async () => {
    const fetchImpl = async () => ({ status: 404, ok: false });
    const r = await _internals.streamAndAggregate(2099, { fetchImpl });
    expect(r.unavailable).toBe(true);
    expect(r.reason).toMatch(/has not published/);
    expect(r.teams).toBeUndefined();
  });

  it('a network failure is not an empty season', async () => {
    const fetchImpl = async () => { throw new Error('socket hang up'); };
    const r = await _internals.streamAndAggregate(2025, { fetchImpl });
    expect(r.unavailable).toBe(true);
    expect(r.reason).toMatch(/Could not reach nflverse/);
  });

  it('a missing column fails loudly rather than reading undefined for every play', async () => {
    const body = `${HEADER.filter((h) => h !== 'epa').join(',')}\n`;
    const fetchImpl = async () => ({ ok: true, status: 200, body: streamOf(body) });
    const r = await _internals.streamAndAggregate(2025, { fetchImpl });
    expect(r.unavailable).toBe(true);
    expect(r.reason).toMatch(/missing the column "epa"/);
  });
});

describe('a parsed season', () => {
  const row = (over = {}) => {
    const base = {
      game_id: '2025_01_AAA_BBB', week: '1', season_type: 'REG',
      posteam: 'AAA', defteam: 'BBB', play_type: 'pass',
      down: '1', ydstogo: '10', yardline_100: '50', goal_to_go: '0',
      half_seconds_remaining: '900', qtr: '1', score_differential: '0',
      epa: '0.5', wpa: '0.01', success: '1', wp: '0.5',
      qb_dropback: '1', qb_hit: '0', sack: '0', pass_oe: '2', penalty: '0',
      passer_player_name: 'A.Passer', rusher_player_name: '', receiver_player_name: 'B.Catcher',
      yards_gained: '25', touchdown: '0', interception: '0', fumble_lost: '0',
      third_down_converted: '0', fourth_down_converted: '0', shotgun: '1', no_huddle: '0',
      ...over
    };
    return HEADER.map((h) => base[h]).join(',');
  };

  it('builds both sides of every play from one row', async () => {
    const body = [HEADER.join(','), row(), row({ goal_to_go: '1', yards_gained: '2' })].join('\n');
    const fetchImpl = async () => ({ ok: true, status: 200, body: streamOf(body) });
    const led = await _internals.streamAndAggregate(2025, { fetchImpl });

    expect(led.plays_parsed).toBe(2);
    expect(led.malformed_rows).toBe(0);
    // The same play is offence for one team and defence for the other.
    expect(teamLedger(led, 'AAA').offense.overall.plays).toBe(2);
    expect(teamLedger(led, 'BBB').defense.overall.plays).toBe(2);
    expect(teamLedger(led, 'AAA').offense.splits.goal_to_go.plays).toBe(1);
  });

  it('records who started at quarterback, per game', async () => {
    const body = [HEADER.join(','), row(), row({ passer_player_name: 'A.Passer' })].join('\n');
    const fetchImpl = async () => ({ ok: true, status: 200, body: streamOf(body) });
    const led = await _internals.streamAndAggregate(2025, { fetchImpl });
    const timeline = starterTimeline(led, 'AAA');
    expect(timeline).toHaveLength(1);
    expect(timeline[0].qb).toBe('A.Passer');
  });

  it('carries a per-game line, not only the season aggregate', async () => {
    const body = [HEADER.join(','), row({ epa: '1' }), row({ epa: '-1' })].join('\n');
    const fetchImpl = async () => ({ ok: true, status: 200, body: streamOf(body) });
    const led = await _internals.streamAndAggregate(2025, { fetchImpl });
    const line = led.games[0].lines.AAA;
    expect(line.offense_plays).toBe(2);
    expect(line.offense_epa_per_play).toBeCloseTo(0, 5);
  });

  it('kicks and punts are excluded from scrimmage splits', async () => {
    const body = [HEADER.join(','), row(), row({ play_type: 'punt' }), row({ play_type: 'kickoff' })].join('\n');
    const fetchImpl = async () => ({ ok: true, status: 200, body: streamOf(body) });
    const led = await _internals.streamAndAggregate(2025, { fetchImpl });
    expect(teamLedger(led, 'AAA').offense.overall.plays).toBe(1);
  });
});

/** A ReadableStream of one string, matching the shape fetch returns. */
function streamOf(text) {
  const bytes = new TextEncoder().encode(text);
  let sent = false;
  return {
    getReader() {
      return {
        async read() {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: bytes };
        }
      };
    }
  };
}
