import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildNflPlaySettlement, nflPlayActualForProp, NFL_PLAY_SETTLEMENT_MARKETS } from '../../scripts/lib/nflPlaySettlement.js';

const saved = JSON.parse(readFileSync(new URL('../fixtures/nfl/bdl-game-1393562-settlement.json', import.meta.url), 'utf8'));
const sample = () => structuredClone(saved);
const value = (evidence, playerId, propType) => nflPlayActualForProp(evidence, { playerId, propType });
const box = (fixture, playerId) => fixture.playerStats.find(row => row.player.id === playerId);
const play = (fixture, playId) => fixture.plays.find(row => row.id === playId);
const fagnano = 33936794;
const lane = 33934304;
const fumbleId = '4018732842566';

describe('NFL exact play settlement against the saved complete provider response', () => {
  it('recovers the four exact scorer totals and six independent quarterback maxima', () => {
    const evidence = buildNflPlaySettlement(sample());
    expect(evidence.issues).toEqual([]);
    expect(Object.fromEntries(Object.entries(evidence.anytimeTouchdowns).filter(([, touchdowns]) => touchdowns > 0))).toEqual({
      670: 1, 281839: 1, 33934150: 1, 33934304: 1,
    });
    expect(evidence.longestCompletions).toEqual({
      77: 8, 80: 29, 279805: 13, 281839: 11, 33934186: 17, 33936794: 19,
    });
    expect(evidence.interceptions).toEqual({ 77: 0, 80: 0, 279805: 0, 281839: 0, 33934186: 0, 33936794: 1 });
    // The passer of a TD does not score an anytime TD himself.
    expect(value(evidence, fagnano, 'passing_touchdowns')).toBe(1);
    expect(value(evidence, fagnano, 'anytime_touchdown')).toBe(0);
    expect(value(evidence, lane, 'rushing_touchdowns')).toBe(0);
    expect(value(evidence, lane, 'receiving_touchdowns')).toBe(1);
    expect(value(evidence, 77, 'passing_touchdowns')).toBe(0);
    expect(box(saved, lane).rushing_touchdowns).toBeNull();
    expect(box(saved, lane).punt_return_touchdowns).toBeNull();
  });

  it('recovers the completed-pass fumble using credited pass gain, not recovery gain', () => {
    const fixture = sample();
    const fumble = play(fixture, fumbleId);
    expect(fumble.participants.map(row => row.type)).toEqual(['recoverer', 'fumbler']);
    expect(fumble.stat_yardage).toBe(0);
    expect(fumble.short_text).toContain('Joe Fagnano Pass Complete for 12 Yds');
    expect(fumble.team.id).toBe(18); // recovery team, not the passer's team
    // Recovery yardage has no bearing on this QB's credited completed pass.
    fumble.stat_yardage = 35;
    expect(value(buildNflPlaySettlement(fixture), fagnano, 'longest_completion')).toBe(19);
  });

  it('uses the final overturned play type instead of the earlier TD words in full text', () => {
    const fixture = sample();
    const overturned = play(fixture, '401873284493');
    expect(overturned.text).toContain('TOUCHDOWN');
    expect(overturned.text).toContain('REVERSED');
    expect(overturned.scoring_play).toBe(false);
    expect(overturned.type_slug).toBe('pass-incompletion');
    const evidence = buildNflPlaySettlement(fixture);
    expect(Object.values(evidence.anytimeTouchdowns).reduce((total, count) => total + count, 0)).toBe(4);
    expect(value(evidence, 77, 'longest_completion')).toBe(8);
  });

  it('counts multiple actual scoring events and preserves passing/scoring separation', () => {
    const fixture = sample();
    const rush = fixture.plays.find(row => row.type_slug === 'rushing-touchdown');
    rush.participants.find(row => row.type === 'rusher').player_id = lane;
    box(fixture, 33934150).rushing_touchdowns = 0;
    box(fixture, lane).rushing_touchdowns = 1;
    const evidence = buildNflPlaySettlement(fixture);
    expect(value(evidence, lane, 'anytime_touchdown')).toBe(2);
    expect(value(evidence, lane, 'rushing_touchdowns')).toBe(1);
    expect(value(evidence, lane, 'receiving_touchdowns')).toBe(1);
  });

  it('works with the complete player box without an additional team-stats request', () => {
    const fixture = sample();
    delete fixture.teamStats;
    expect(buildNflPlaySettlement(fixture)).toEqual(buildNflPlaySettlement(sample()));
  });

  it('does not invent records for absent players or support unrelated markets', () => {
    const evidence = buildNflPlaySettlement(sample());
    // Actual participant Fred Johnson has no stats contributor row.
    expect(saved.plays.some(row => row.participants?.some(participant => participant.player_id === 77014))).toBe(true);
    expect(saved.playerStats.some(row => row.player.id === 77014)).toBe(false);
    expect(value(evidence, 77014, 'anytime_touchdown')).toBeNull();
    expect(value(evidence, fagnano, 'passing_yards')).toBeNull();
    expect(value(evidence, null, 'longest_completion')).toBeNull();
    expect(NFL_PLAY_SETTLEMENT_MARKETS.has('longest_completion')).toBe(true);
  });
});

describe('incomplete or contradictory game evidence', () => {
  it.each([
    ['unfinished plays', fixture => { fixture.playsComplete = false; }],
    ['unfinished box', fixture => { fixture.boxComplete = false; }],
    ['wrong game', fixture => { fixture.gameId = 1393563; }],
    ['foreign play', fixture => { fixture.plays[2].game.id = 1393563; }],
    ['foreign box', fixture => { fixture.playerStats[2].game.id = 1393563; }],
    ['non-final play', fixture => { fixture.plays[2].game.status_state = 'in'; }],
    ['contradictory final status', fixture => { fixture.plays[2].game.status = 'Halftime'; }],
    ['duplicate play', fixture => { fixture.plays.push(structuredClone(fixture.plays[2])); }],
    ['duplicate player', fixture => { fixture.playerStats.push(structuredClone(fixture.playerStats[2])); }],
    ['missing final', fixture => { fixture.plays = fixture.plays.filter(row => row.type_slug !== 'end-of-game'); }],
    ['premature first-quarter final', fixture => { fixture.plays.find(row => row.type_slug === 'end-of-game').period = 1; }],
    ['premature third-quarter final', fixture => { fixture.plays.find(row => row.type_slug === 'end-of-game').period = 3; }],
    ['plays after terminal period', fixture => { fixture.plays[0].period = 5; }],
    ['multiple terminal markers', fixture => {
      const duplicate = structuredClone(fixture.plays.find(row => row.type_slug === 'end-of-game'));
      duplicate.id += 'extra'; fixture.plays.push(duplicate);
    }],
    ['one-team box', fixture => { fixture.playerStats = fixture.playerStats.filter(row => row.team.id === 6); }],
    ['malformed score', fixture => { fixture.plays[2].home_score = ''; }],
    ['malformed period', fixture => { fixture.plays[2].period = null; }],
  ])('rejects %s before offering a result', (_label, change) => {
    const fixture = sample(); change(fixture);
    const evidence = buildNflPlaySettlement(fixture);
    expect(evidence.anytimeTouchdowns).toEqual({});
    expect(evidence.longestCompletions).toEqual({});
    expect(evidence.issues.length).toBeGreaterThan(0);
  });

  it.each([
    ['missing TD', fixture => { fixture.plays = fixture.plays.filter(row => row.id !== '4018732841328'); }],
    ['missing FG', fixture => { fixture.plays = fixture.plays.filter(row => row.type_slug !== 'field-goal-good'); }],
    ['unknown return scorer', fixture => { play(fixture, '4018732843011').type_slug = 'punt-return-touchdown'; }],
    ['TD with no exact receiver', fixture => { play(fixture, '4018732841328').participants = []; }],
    ['TD scorer on wrong team', fixture => { play(fixture, '4018732841328').participants[0].player_id = 670; }],
    ['TD called back', fixture => { play(fixture, '4018732841328').text += ' No Play.'; }],
    ['TD called back in short text', fixture => { play(fixture, '4018732841328').short_text += ' No Play.'; }],
    ['TD with lateral ambiguity', fixture => { play(fixture, '4018732841328').text += ' Lateral to another player.'; }],
    ['contradictory measured scorer', fixture => { box(fixture, lane).receiving_touchdowns = 2; }],
    ['corrupt measured scorer', fixture => { box(fixture, lane).receiving_touchdowns = true; }],
    ['unflagged score transition', fixture => { play(fixture, '4018732841328').scoring_play = false; }],
  ])('keeps all TD totals pending for %s', (_label, change) => {
    const fixture = sample(); change(fixture);
    const evidence = buildNflPlaySettlement(fixture);
    expect(evidence.anytimeTouchdowns).toEqual({});
    expect(evidence.touchdownComponents).toEqual({});
    expect(evidence.issues).toContain('unreconciled_scoring_ledger');
  });
});

describe('exact passer count, attempt and gain reconciliation', () => {
  it.each([null, undefined, '', true, 'NaN', -1])('does not coerce invalid completion count %s', bad => {
    const fixture = sample(); box(fixture, fagnano).passing_completions = bad;
    expect(value(buildNflPlaySettlement(fixture), fagnano, 'longest_completion')).toBeNull();
  });

  it.each([
    ['missing catch/fumble', fixture => { fixture.plays = fixture.plays.filter(row => row.id !== fumbleId); }],
    ['initial-only passer name', fixture => { play(fixture, fumbleId).short_text = play(fixture, fumbleId).short_text.replace('Joe Fagnano', 'J.Fagnano'); }],
    ['wrong structured fumbler', fixture => { play(fixture, fumbleId).participants[1].player_id = lane; }],
    ['wrong recovery team', fixture => { play(fixture, fumbleId).team.id = 6; }],
    ['lateral catch/fumble', fixture => { play(fixture, fumbleId).text += ' Lateral to a teammate.'; }],
    ['lateral catch/fumble short text', fixture => { play(fixture, fumbleId).short_text += ' Lateral to a teammate.'; }],
    ['corrected catch/fumble', fixture => { play(fixture, fumbleId).text += ' The play was REVERSED.'; }],
    ['wrong credited yardage', fixture => { play(fixture, fumbleId).short_text = play(fixture, fumbleId).short_text.replace('12 Yds', '24 Yds'); }],
    ['mismatched measured yards', fixture => { box(fixture, fagnano).passing_yards = 225; }],
    ['mismatched attempts', fixture => { box(fixture, fagnano).passing_attempts = 29; }],
    ['ambiguous full name', fixture => {
      const duplicate = structuredClone(box(fixture, fagnano)); duplicate.player.id = 999999;
      for (const key of Object.keys(duplicate)) if (!['game', 'team', 'player'].includes(key)) duplicate[key] = null;
      fixture.playerStats.push(duplicate);
    }],
  ])('does not borrow a team maximum for %s', (_label, change) => {
    const fixture = sample(); change(fixture); delete fixture.teamStats;
    const evidence = buildNflPlaySettlement(fixture);
    expect(value(evidence, fagnano, 'longest_completion')).toBeNull();
    expect(value(evidence, 80, 'longest_completion')).toBe(29);
  });

  it('refuses lateral ambiguity even when the unaltered numeric totals still match', () => {
    const fixture = sample();
    const completion = fixture.plays.find(row => row.type_slug === 'pass-reception' && row.participants.some(participant => participant.player_id === 80 && participant.type === 'passer'));
    completion.text += ' Lateral to another receiver.';
    expect(value(buildNflPlaySettlement(fixture), 80, 'longest_completion')).toBeNull();
  });

  it.each(['Lateral to another receiver.', 'Fumble recovered by a teammate.'])('rejects ambiguity present only in the ordinary completion short text: %s', suffix => {
    const fixture = sample();
    const completion = fixture.plays.find(row => row.type_slug === 'pass-reception' && row.participants.some(participant => participant.player_id === 80 && participant.type === 'passer'));
    completion.short_text += ` ${suffix}`;
    expect(value(buildNflPlaySettlement(fixture), 80, 'longest_completion')).toBeNull();
  });

  it('retains negative credited completion gains instead of clamping a maximum to zero', () => {
    const fixture = sample(); delete fixture.teamStats;
    const completions = fixture.plays.filter(row => row.type_slug === 'pass-reception' && row.participants.some(participant => participant.player_id === 77 && participant.type === 'passer'));
    expect(completions).toHaveLength(3);
    completions.forEach((row, index) => { row.stat_yardage = [-2, -4, -5][index]; });
    box(fixture, 77).passing_yards = -11;
    expect(value(buildNflPlaySettlement(fixture), 77, 'longest_completion')).toBe(-2);
  });

  it.each(['passing_completions', 'passing_attempts', 'net_passing_yards'])('rejects contradictory team %s when that evidence is provided', field => {
    const fixture = sample(); fixture.teamStats[0][field] += 1;
    const evidence = buildNflPlaySettlement(fixture);
    expect(evidence.longestCompletions).toEqual({});
    expect(evidence.issues).toContain('unreconciled_team_passing');
  });
});

describe('interceptions with complete exact passer evidence', () => {
  it('resolves a provider-null active passer category from the complete reconciled final plays', () => {
    const fixture = sample();
    box(fixture, 77).passing_interceptions = null;
    box(fixture, fagnano).passing_interceptions = null;
    const evidence = buildNflPlaySettlement(fixture);
    expect(value(evidence, 77, 'interceptions')).toBe(0);
    expect(value(evidence, fagnano, 'interceptions')).toBe(1);
    expect(NFL_PLAY_SETTLEMENT_MARKETS.has('interceptions')).toBe(true);
  });

  it.each([
    ['missing exact returner', fixture => { play(fixture, '4018732841883').participants.shift(); }],
    ['returner on passing team', fixture => { play(fixture, '4018732841883').participants[0].player_id = lane; }],
    ['wrong return team', fixture => { play(fixture, '4018732841883').team.id = 6; }],
    ['contradictory direct count', fixture => { box(fixture, fagnano).passing_interceptions = 0; }],
    ['called back interception', fixture => { play(fixture, '4018732841883').short_text += ' No Play.'; }],
  ])('keeps an ambiguous INT pending: %s', (_label, change) => {
    const fixture = sample(); change(fixture);
    expect(value(buildNflPlaySettlement(fixture), fagnano, 'interceptions')).toBeNull();
  });

  it('requires a measured positive attempt count before supplying an absent INT category', () => {
    const fixture = sample(); delete fixture.teamStats;
    box(fixture, 77).passing_attempts = null;
    box(fixture, 77).passing_interceptions = null;
    expect(value(buildNflPlaySettlement(fixture), 77, 'interceptions')).toBeNull();
  });

  it.each([
    ['contradictory team', row => { row.team.id = 6; }],
    ['invalid team', row => { row.team.id = null; }],
    ['short-text no play', row => { row.short_text += ' No Play.'; }],
    ['ambiguous receiver roles', row => { row.participants.push({ player_id: 670, type: 'receiver' }); }],
  ])('rejects an ordinary incompletion with %s', (_label, change) => {
    const fixture = sample(); change(play(fixture, '401873284560'));
    const evidence = buildNflPlaySettlement(fixture);
    expect(value(evidence, 77, 'interceptions')).toBeNull();
    expect(value(evidence, 77, 'longest_completion')).toBeNull();
  });
});
