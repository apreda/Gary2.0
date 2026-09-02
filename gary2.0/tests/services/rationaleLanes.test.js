import { describe, it, expect } from 'vitest';
import { tagRationale, sideOfPick, laneRowFor, summarizeLanes, summarizeWinners } from '../../src/services/agentic/rationaleLanes.js';
import { formatLineHistory } from '../../src/services/oddsSnapshots.js';
import { summarizeCaseOrder } from '../../src/services/agentic/rationaleLanes.js';

describe('tagRationale', () => {
  it('tags the lanes a rationale leans on, by desk section', () => {
    const lanes = tagRationale('The bullpen is the separator: current arms 3.07 ERA. Over the last ten days 1.24. Wacha has a 3.89 road ERA and a 3.86 ERA over his last three starts. Cleveland starts five left-handed hitters against him.');
    expect(lanes).toEqual(expect.arrayContaining(['bullpen_any', 'bullpen_season_unit', 'bullpen_recent_days', 'bullpen_named_separator', 'starter_home_road', 'starter_last_three', 'lineup_hand_count']));
    expect(lanes).not.toContain('story_or_press');
  });
  it('recognizes stories, price talk, and line history', () => {
    expect(tagRationale('As written, the beat described his stuff as flat.')).toContain('story_or_press');
    expect(tagRationale('At +124 the plus money is worth it.')).toContain('price_as_value');
    expect(tagRationale('The line opened at -150 and moved to -170.')).toContain('line_history');
  });
});

describe('sideOfPick', () => {
  const base = { homeTeam: 'Braves', awayTeam: 'Rockies', moneylineHome: -230, moneylineAway: 210 };
  it('reads fav/dog from the picked side', () => {
    expect(sideOfPick({ ...base, pick: 'Braves -1.5 -111' })).toBe('fav');
    expect(sideOfPick({ ...base, pick: 'Rockies ML +210' })).toBe('dog');
    expect(sideOfPick({ ...base, pick: 'Braves ML -104', moneylineHome: -104, moneylineAway: -104 })).toBe('pick-em');
    expect(sideOfPick({ ...base, pick: 'Braves ML', moneylineHome: null })).toBe('unknown');
  });
});

describe('laneRowFor + summarizeLanes', () => {
  it('builds a ledger row and a per-lane record', () => {
    const pick = { league: 'MLB', game_id: 123, pick: 'Braves -1.5 -111', type: 'spread', odds: '-111', homeTeam: 'Braves', awayTeam: 'Rockies', moneylineHome: -230, moneylineAway: 210, prompt_sha: 'abc', rationale: 'The bullpen is the separator.' };
    const row = laneRowFor('2026-08-29', pick, { result: 'lost' });
    expect(row).toMatchObject({ game_date: '2026-08-29', league: 'MLB', game_id: '123', bet_type: 'spread', odds: -111, side: 'fav', result: 'lost', prompt_sha: 'abc' });
    expect(row.lanes).toContain('bullpen_named_separator');
    const sum = summarizeLanes([row, { ...row, result: 'won' }]);
    expect(sum.find((s) => s.lane === 'bullpen_any')).toEqual({ lane: 'bullpen_any', cited: 2, of: 2, record: '1-1' });
  });
});

describe('formatLineHistory', () => {
  const first = { moneyline_home: -215, moneyline_away: 180, spread_home: -1.5, spread_home_odds: 100, spread_away: 1.5, spread_away_odds: -120, seen_at: '2026-09-01T09:00:00.000Z' };
  it('says unchanged when the board has not moved, with the day in the stamp', () => {
    const now = { moneyline_home: -215, moneyline_away: 180, spread_home: -1.5, spread_home_odds: 100, spread_away: 1.5, spread_away_odds: -120 };
    expect(formatLineHistory({ first, latest: first, boards: 1 }, now, 'Rangers', 'Athletics')).toBe('Line history today: unchanged since first seen Tue 5:00 AM ET.');
  });
  it('prints the open and the move when it has, in the caller\'s window', () => {
    const now = { moneyline_home: -220, moneyline_away: 184, spread_home: -1.5, spread_home_odds: 104, spread_away: 1.5, spread_away_odds: -125 };
    const line = formatLineHistory({ first, latest: now, boards: 2 }, now, 'Rangers', 'Athletics', 'this week');
    expect(line).toContain('Line history this week: first seen Tue 5:00 AM ET — moneyline Rangers -215 / Athletics +180; now Rangers -220 / Athletics +184');
    expect(line).toContain('line opened Rangers -1.5 (+100) / Athletics +1.5 (-120), now Rangers -1.5 (+104) / Athletics +1.5 (-125)');
  });
  it('never calls two books\' prices a move', () => {
    const fd = { ...first, line_vendor: 'fanduel' };
    const now = { moneyline_home: -158, moneyline_away: 140, spread_home: -1.5, spread_home_odds: 100, spread_away: 1.5, spread_away_odds: -120, line_vendor: 'draftkings' };
    const line = formatLineHistory({ first: fd, latest: now, boards: 2 }, now, 'Rangers', 'Athletics');
    expect(line).toContain('at Fanduel');
    expect(line).toContain('now shows Draftkings');
    expect(line).toContain('Different books; not a like-for-like move');
    expect(line).not.toContain('; now Rangers');
  });
  it('is null with no history', () => {
    expect(formatLineHistory(null, {}, 'A', 'B')).toBeNull();
  });
  it('covers only the game\'s own tickets when asked (MLB, Sep 2)', () => {
    const first = { seen_at: '2026-09-01T09:00:00Z', moneyline_home: -134, moneyline_away: 116, spread_home: -1.5, spread_home_odds: 155, spread_away: 1.5, spread_away_odds: -180 };
    const now = { moneyline_home: -138, moneyline_away: 118, spread_home: -1.5, spread_home_odds: 150, spread_away: 1.5, spread_away_odds: -175 };
    const ml = formatLineHistory({ first, latest: now, boards: 2 }, now, 'Red Sox', 'Mariners', 'today', 'moneyline');
    expect(ml).toContain('moneyline Red Sox -134 / Mariners +116; now Red Sox -138 / Mariners +118');
    expect(ml).not.toContain('-1.5');
    const rl = formatLineHistory({ first, latest: now, boards: 2 }, now, 'Red Sox', 'Mariners', 'today', 'runline');
    expect(rl).toContain('line Red Sox -1.5 (+155) / Mariners +1.5 (-180); now Red Sox -1.5 (+150) / Mariners +1.5 (-175)');
    expect(rl).not.toContain('moneyline');
    const same = formatLineHistory({ first, latest: { ...now, moneyline_home: -134, moneyline_away: 116 }, boards: 2 }, { ...now, moneyline_home: -134, moneyline_away: 116 }, 'Red Sox', 'Mariners', 'today', 'moneyline');
    expect(same).toContain('unchanged since first seen');
  });
});

describe('summarizeCaseOrder — does the bet follow the case written last?', () => {
  it('splits by the club read last and skips rows without a stamp', () => {
    const rows = [
      { pick_is_home: true, case_last: 'home', result: 'won' },   // bet the last case (home last)
      { pick_is_home: false, case_last: 'home', result: 'lost' }, // bet the first case
      { pick_is_home: false, case_last: 'away', result: 'won' },  // bet the last case (away last)
      { pick_is_home: false, case_last: 'away', result: 'lost' }, // bet the last case
      { pick_is_home: true, case_last: null, result: 'won' },     // unstamped: skipped
      { pick_is_home: null, case_last: 'home', result: 'won' },   // unknown side: skipped
    ];
    const o = summarizeCaseOrder(rows);
    expect(o.n).toBe(4);
    expect(o.pickedLast).toBe(3);
    expect(o.pickedLastRecord).toBe('2-1');
    expect(o.pickedFirst).toBe(1);
    expect(o.pickedFirstRecord).toBe('0-1');
    expect(o.byLast).toEqual({ home: { n: 2, pickedLast: 1 }, away: { n: 2, pickedLast: 2 } });
  });
});

describe('laneRowFor + summarizeWinners — the Winners board beside the result', () => {
  const pick = (over) => ({ pick: 'Boston Red Sox ML', homeTeam: 'Boston Red Sox', awayTeam: 'Seattle Mariners', league: 'MLB', game_id: '1', odds: -120, rationale: 'x', ...over });

  it('a row with no review row is unstamped, never off-the-board', () => {
    const row = laneRowFor('2026-09-02', pick(), { result: 'won' });
    expect(row.winners_on_board).toBeNull();
    expect(row.winners_reason).toBeNull();
    expect(row.winners_verdict).toBeNull();
    const row2 = laneRowFor('2026-09-02', pick(), { result: 'won' }, { on_board: true, reason: 'first_dog', verdict: 'WEAK' });
    expect(row2).toMatchObject({ winners_on_board: true, winners_reason: 'first_dog', winners_verdict: 'WEAK' });
  });

  it('counts the board vs off, by why and by verdict, with units from the odds', () => {
    const rows = [
      laneRowFor('d', pick({ odds: 130 }), { result: 'won' }, { on_board: true, reason: 'first_dog', verdict: 'WEAK' }),
      laneRowFor('d', pick({ odds: -150, game_id: '2' }), { result: 'lost' }, { on_board: true, reason: 'review', verdict: 'STRONG' }),
      laneRowFor('d', pick({ odds: -110, game_id: '3' }), { result: 'won' }, { on_board: false, reason: null, verdict: 'WEAK' }),
      laneRowFor('d', pick({ odds: -110, game_id: '4' }), { result: 'push' }, { on_board: true, reason: 'big_game', verdict: null }),
      laneRowFor('d', pick({ odds: -110, game_id: '5' }), { result: 'won' }),
    ];
    const s = summarizeWinners(rows);
    expect(s.stamped).toBe(3);
    expect(s.on).toEqual({ n: 2, w: 1, l: 1, record: '1-1', units: 0.3 });
    expect(s.off).toEqual({ n: 1, w: 1, l: 0, record: '1-0', units: 0.91 });
    expect(s.byReason.first_dog.record).toBe('1-0');
    expect(s.byReason.review.record).toBe('0-1');
    expect(s.byVerdict.STRONG.record).toBe('0-1');
    expect(s.byVerdict.WEAK.record).toBe('2-0');
    expect(summarizeWinners([]).stamped).toBe(0);
  });
});
