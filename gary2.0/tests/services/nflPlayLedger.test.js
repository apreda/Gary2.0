import { describe, expect, it } from 'vitest';
import { _internals, teamLedger, starterTimeline } from '../../src/services/sports/nfl/nflPlayLedger.js';
import { SPLITS } from '../../src/services/sports/nfl/nflPlayLedger.js';

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
  'third_down_converted', 'fourth_down_converted', 'shotgun', 'no_huddle',
  'fumble', 'fumbled_1_team', 'fumble_recovery_1_team', 'td_team', 'safety',
  'field_goal_result', 'kick_distance', 'extra_point_result', 'punt_blocked', 'own_kickoff_recovery',
  'return_team', 'return_yards', 'penalty_team', 'penalty_yards',
  'fixed_drive', 'fixed_drive_result', 'drive_first_downs', 'drive_inside20', 'drive_start_yard_line',
  'posteam_score', 'posteam_score_post', 'roof', 'temp', 'wind', 'stadium', 'weather',
  'home_team', 'away_team', 'total_home_score', 'total_away_score', 'rusher_player_id',
  'time', 'td_player_name', 'kicker_player_name', 'drive_time_of_possession'
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
      fumble: '0', fumbled_1_team: '', fumble_recovery_1_team: '', td_team: '', safety: '0',
      field_goal_result: '', kick_distance: '', extra_point_result: '', punt_blocked: '0', own_kickoff_recovery: '0',
      return_team: '', return_yards: '0', penalty_team: '', penalty_yards: '0',
      fixed_drive: '1', fixed_drive_result: 'Punt', drive_first_downs: '0', drive_inside20: '0', drive_start_yard_line: 'AAA 25',
      posteam_score: '0', posteam_score_post: '0', roof: 'outdoors', temp: '60', wind: '8', stadium: 'Test Field', weather: 'Rain Temp: 60° F',
      home_team: 'BBB', away_team: 'AAA', total_home_score: '0', total_away_score: '0', rusher_player_id: '',
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

  it('records how each game was won or lost beyond the scrimmage plays (Oct 12 2026)', async () => {
    const body = [HEADER.join(','),
      // AAA fumbles twice: keeps one (out of bounds), loses one to BBB.
      row({ play_type: 'run', fumble: '1', fumbled_1_team: 'AAA', fumble_recovery_1_team: '', fumble_lost: '0' }),
      row({ play_type: 'run', fumble: '1', fumbled_1_team: 'AAA', fumble_recovery_1_team: 'BBB', fumble_lost: '1' }),
      // A pick-six: AAA throws it, BBB scores.
      row({ interception: '1', touchdown: '1', td_team: 'BBB' }),
      // AAA misses a 48-yard field goal and makes one; BBB returns a punt 41 yards.
      row({ play_type: 'field_goal', field_goal_result: 'missed', kick_distance: '48' }),
      row({ play_type: 'field_goal', field_goal_result: 'made', kick_distance: '30' }),
      row({ play_type: 'punt', return_team: 'BBB', return_yards: '41' }),
      // An enforced penalty on AAA; a decided-game snap that is not a contest.
      row({ penalty: '1', penalty_team: 'AAA', penalty_yards: '15' }),
      row({ wp: '0.99' }),
    ].join('\n');
    const fetchImpl = async () => ({ ok: true, status: 200, body: streamOf(body) });
    const led = await _internals.streamAndAggregate(2025, { fetchImpl });
    const a = led.games[0].lines.AAA;
    const b = led.games[0].lines.BBB;
    expect([a.fumbles, a.fumbles_lost, a.interceptions_thrown, a.giveaways_returned_for_td]).toEqual([2, 1, 1, 1]);
    expect(b.defensive_tds).toBe(1);
    expect([a.fg_made, a.fg_att, a.fg_missed_distances]).toEqual([1, 2, [48]]);
    expect(b.long_returns).toEqual([{ kind: 'punt', yards: 41 }]);
    expect([a.penalties, a.penalty_yards]).toEqual([1, 15]);
    // Five scrimmage snaps: four at a 50% win probability, one at 99%.
    expect(a.offense_plays).toBe(5);
    expect(a.contest_plays).toBe(4);
  });

  it('counts drives by how they ended and the points each one scored (Oct 12 2026)', async () => {
    const body = [HEADER.join(','),
      // Drive 1, AAA: a touchdown drive from its own 25 that reached the red zone, 7 points with the extra point.
      row({ fixed_drive: '1', fixed_drive_result: 'Touchdown', drive_first_downs: '3', drive_inside20: '1', drive_start_yard_line: 'AAA 25', posteam_score: '0', posteam_score_post: '6' }),
      row({ fixed_drive: '1', fixed_drive_result: 'Touchdown', drive_first_downs: '3', drive_inside20: '1', drive_start_yard_line: 'AAA 25', play_type: 'extra_point', posteam_score: '6', posteam_score_post: '7' }),
      // Drive 2, BBB: a three-and-out from the AAA 40 (the opponent's 40, so 60 yards from its own goal).
      row({ fixed_drive: '2', posteam: 'BBB', defteam: 'AAA', fixed_drive_result: 'Punt', drive_first_downs: '0', drive_start_yard_line: 'AAA 40' }),
      // Drive 3, AAA: a kneel to end the half is left out of the drives and counted on its own.
      row({ fixed_drive: '3', fixed_drive_result: 'End of half', drive_start_yard_line: 'AAA 30', play_type: 'qb_kneel' }),
    ].join('\n');
    const fetchImpl = async () => ({ ok: true, status: 200, body: streamOf(body) });
    const led = await _internals.streamAndAggregate(2025, { fetchImpl });
    const a = led.games[0].lines.AAA;
    const b = led.games[0].lines.BBB;
    expect([a.drives, a.drive_points, a.drive_tds, a.red_zone_trips, a.red_zone_tds, a.avg_drive_start]).toEqual([1, 7, 1, 1, 1, 25]);
    expect([b.drives, b.three_and_outs, b.avg_drive_start]).toEqual([1, 1, 60]);
    // Oct 23 2026 data audit: the half's last kneel is its own count, and BBB's drive from the AAA 40 began in AAA's territory.
    expect([a.drive_end_of_half, a.opp_territory_drives, b.opp_territory_drives, b.opp_territory_points]).toEqual([1, 0, 1, 0]);
    expect([led.games[0].roof, led.games[0].temp, led.games[0].wind, led.games[0].conditions]).toEqual(['outdoors', 60, 8, 'Rain']);
  });

  it('scores each quarter from the running score, and counts kneel-downs by who took them (Oct 23 2026)', async () => {
    const body = [HEADER.join(','),
      // Q1: AAA (away) scores 7.
      row({ qtr: '1', total_away_score: '7' }),
      // Q2 has only an end-of-quarter row with no team on it; BBB (home) scored 3 in it.
      row({ qtr: '2', posteam: '', defteam: '', play_type: '', total_away_score: '7', total_home_score: '3' }),
      // Q3: nothing scored. Q4: AAA kneels.
      row({ qtr: '3', total_away_score: '7', total_home_score: '3' }),
      row({ qtr: '4', total_away_score: '7', total_home_score: '3', play_type: 'qb_kneel', rusher_player_id: '00-1' }),
    ].join('\n');
    const fetchImpl = async () => ({ ok: true, status: 200, body: streamOf(body) });
    const led = await _internals.streamAndAggregate(2025, { fetchImpl });
    const g = led.games[0];
    expect(g.quarters).toEqual({ AAA: [7, 0, 0, 0], BBB: [0, 3, 0, 0] });
    expect(g.lines.AAA.kneels).toEqual({ '00-1': 1 });
  });

  it('keeps the scoring in order with the score after each try, the largest leads, and the third and fourth downs (Oct 29 2026)', async () => {
    const body = [HEADER.join(','),
      row({ down: '3', ydstogo: '4', third_down_converted: '1', time: '12:01' }),
      row({ down: '3', ydstogo: '9', time: '11:30', success: '0' }),
      // AAA (away) scores a touchdown, then its extra point; then BBB a field goal; then AAA goes for it on 4th & 2.
      row({ touchdown: '1', td_team: 'AAA', td_player_name: 'B.Catcher', yards_gained: '25', total_away_score: '6', time: '09:10' }),
      row({ play_type: 'extra_point', extra_point_result: 'good', total_away_score: '7', time: '09:06' }),
      row({ play_type: 'kickoff', total_away_score: '7', time: '09:06' }),
      row({ posteam: 'BBB', defteam: 'AAA', play_type: 'field_goal', field_goal_result: 'made', kick_distance: '44', kicker_player_name: 'C.Kicker', total_away_score: '7', total_home_score: '3', qtr: '2', time: '01:00' }),
      row({ down: '4', ydstogo: '2', yardline_100: '35', fourth_down_converted: '1', score_differential: '4', total_away_score: '7', total_home_score: '3', qtr: '3', time: '05:00' }),
    ].join('\n');
    const fetchImpl = async () => ({ ok: true, status: 200, body: streamOf(body) });
    const led = await _internals.streamAndAggregate(2025, { fetchImpl });
    const g = led.games[0];
    expect(g.flow.events.map((e) => [e.team, e.how, e.away, e.home])).toEqual([['AAA', 'TD, B.Catcher 25-yd pass from A.Passer', 7, 0], ['BBB', 'C.Kicker 44-yd FG', 7, 3]]);
    expect(g.flow.lead.away.by).toBe(7);
    expect(g.flow.lead.home).toBe(null);
    expect(g.lines.AAA.third_downs).toEqual([{ togo: 4, made: true }, { togo: 9, made: false }]);
    expect(g.lines.AAA.fourth_downs).toMatchObject([{ togo: 2, made: true, yardline: 35, diff: 4, q: 3 }]);
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
