import { describe, expect, it } from 'vitest';
import { assertGamePickPublication, assertAtomicPickReceipt, assertExistingGamePublications, isPublishedGamePick } from '../../src/services/gamePickPublication.js';

const pick = overrides => ({ league: 'MLB', game_id: 42, pick: 'Boston Red Sox ML -120', type: 'moneyline', odds: -120,
  homeTeam: 'Boston Red Sox', awayTeam: 'New York Yankees', rationale: 'The supplied matchup evidence supports this ticket.',
  commence_time: '2026-09-06T23:00:00Z', confidence: null, ...overrides });

describe('game publication contract', () => {
  it.each([null, [], {}, { pick: ' ' }, { pick: 'PENDING' }, { pick: 'NO PICK' }, { pick: 'PASS' },
    { pick: 'Boston ML', type: 'prop' }, { pick: 'Boston ML', pickType: 'PROP' }])('does not count %j as a published game ticket', value => {
    expect(isPublishedGamePick(value)).toBe(false);
  });
  it('keeps a usable legacy ticket readable without requiring newer optional metadata', () => {
    expect(isPublishedGamePick({ pick: 'Boston ML -120' })).toBe(true);
  });
  it.each([{ league: null }, { game_id: null }, { homeTeam: '' }, { awayTeam: 'Boston Red Sox' }, { type: 'pending' },
    { odds: '-120' }, { odds: 12 }, { odds: Infinity }, { rationale: '' }, { commence_time: null },
    { confidence: '0.73' }, { confidence: {} }, { confidence: NaN }, { moneylineHome: '-120' },
    { type: 'spread', spread: null }])('rejects structurally incomplete new publication %j', fields => {
    expect(() => assertGamePickPublication(pick(fields))).toThrow();
  });
  it('preserves Gary’s stated number exactly and accepts intentional null confidence', () => {
    for (const confidence of [null, 0, 0.738, 1]) {
      const value = pick({ confidence });
      expect(() => assertGamePickPublication(value)).not.toThrow();
      expect(value.confidence).toBe(confidence);
    }
  });
  it('accepts a legal zero-insert conflict receipt but verifies the original exact league/game ticket', () => {
    const incoming = pick();
    const original = pick({ pick: 'New York Yankees ML +110', odds: 110, league: 'baseball_mlb' });
    expect(() => assertAtomicPickReceipt({ added: 0, skipped: 1, total: 3, game_ids: [], mode: 'append' }, [incoming])).not.toThrow();
    expect(() => assertExistingGamePublications([original], [incoming])).not.toThrow();
    expect(original.pick).toBe('New York Yankees ML +110');
    expect(() => assertExistingGamePublications([{ ...original, league: 'NCAAF' }], [incoming])).toThrow('unconfirmed');
    expect(() => assertExistingGamePublications([{ ...original, pick: 'PENDING' }], [incoming])).toThrow('original record preserved');
  });
  it('honors daily SQL aliases and idless legacy team guards without confusing a different game ID', () => {
    const incoming = pick();
    for (const original of [
      { pick: 'Boston ML -125', sport: 'baseball_mlb', bdlGameId: 42 },
      { pick: 'Boston ML -125', sport_key: 'baseball_mlb', gameId: '42' },
      { pick: 'Boston ML -125', league: 'MLB', home_team: incoming.homeTeam, away_team: incoming.awayTeam },
    ]) expect(() => assertExistingGamePublications([original], [incoming])).not.toThrow();
    expect(() => assertExistingGamePublications([pick({ game_id: 43 })], [incoming])).toThrow('unconfirmed');
  });
  it('uses the NFL table scope for a valid legacy original without a league, but never a prop', () => {
    const incoming = pick({ league: 'NFL' });
    const original = { pick: 'Original team +3 -110', game_id: 42 };
    expect(() => assertExistingGamePublications([original], [incoming], { ledger: 'nfl_weekly' })).not.toThrow();
    expect(() => assertExistingGamePublications([{ ...original, type: 'prop' }], [incoming], { ledger: 'nfl_weekly' })).toThrow('unconfirmed');
    expect(() => assertExistingGamePublications([{ pick: original.pick, homeTeam: incoming.homeTeam, awayTeam: incoming.awayTeam }], [incoming], { ledger: 'nfl_weekly' })).not.toThrow();
  });
  it.each([
    { added: '1', skipped: 0, total: 1, game_ids: [42], mode: 'insert' },
    { added: 1, skipped: 1, total: 1, game_ids: [42], mode: 'append' },
    { added: 1, skipped: 0, total: 0, game_ids: [42], mode: 'insert' },
    { added: 1, skipped: 0, total: 1, game_ids: [], mode: 'insert' },
  ])('rejects inconsistent successful-looking receipt %j', receipt => {
    expect(() => assertAtomicPickReceipt(receipt, [pick()])).toThrow('Invalid atomic');
  });
  it('does not let a duplicate receipt ID stand in for another game, while allowing cross-sport ID collisions', () => {
    const receipt = { added: 2, skipped: 0, total: 2, game_ids: ['42', '42'], mode: 'insert' };
    expect(() => assertAtomicPickReceipt(receipt, [pick(), pick({ game_id: 43 })])).toThrow('Invalid atomic');
    expect(() => assertAtomicPickReceipt(receipt, [pick(), pick({ league: 'NCAAF' })])).not.toThrow();
  });
});
