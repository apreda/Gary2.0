import { describe, it, expect } from 'vitest';
import { schedulerObservations, mergeDataFailures, withoutPublishedGameFailures, easternLogTime, failureCategory, healthObservations, collectorReadObservation } from '../../scripts/lib/operationalAlerts.js';
import { footballMarketUnavailable } from '../../src/services/marketTruth.js';
const date = '2026-09-16';
const line = text => `[9/16/2026, 1:25:38 PM] ${text}`;
describe('non-AI operational observations', () => {
  it('uses published output to clear manual recoveries and withdrawn college games', () => {
    const now = Date.parse('2026-09-16T17:30:00Z');
    const observations = ['1','2','3'].map(game_id => ({kind:'game', league:'NCAAF', game_id}));
    const report = {checked_at:new Date(now).toISOString(),coverage:{date},checks:[{id:'picks:NCAAF',published_game_ids:[1],slate_game_ids:[1,2]}]};
    expect(withoutPublishedGameFailures(observations,report,date,now).map(r=>r.game_id)).toEqual(['2']);
    expect(withoutPublishedGameFailures(observations,report,date,now+16*60000).map(r=>r.game_id)).toEqual(['2','3']);
  });
  it('retains published evidence during an outage without clearing another sport or day', () => {
    const observations = [{kind:'game',league:'NCAAF',game_id:'1'}, {kind:'game',league:'NFL',game_id:'1'}, {kind:'game',league:'NCAAF',game_id:'2'}];
    const report = {checks:[{id:'read:picks',status:'fail'}],published_games:{date,leagues:{NCAAF:{game_ids:['1']}}}};
    expect(withoutPublishedGameFailures(observations,report,date)).toEqual(observations.slice(1));
    expect(withoutPublishedGameFailures(observations,report,'2026-09-17')).toEqual(observations);
  });
  it('does not revive a withdrawn game, while retaining failures newer than the last known slate', () => {
    const old = {kind:'game',league:'NCAAF',game_id:'3',last_at:'2026-09-16T17:00:00Z'};
    const newer = {...old,last_at:'2026-09-16T18:00:00Z'};
    const report = {published_games:{date,leagues:{NCAAF:{observed_at:'2026-09-16T17:30:00Z',game_ids:[],slate_game_ids:['1','2']}}}};
    expect(withoutPublishedGameFailures([old,newer],report,date)).toEqual([newer]);
  });
  it('allows only the brief midnight handover with a fresh pre-midnight heartbeat', () => {
    const missing = Object.assign(new Error('PRIVATE PATH'), { code: 'ENOENT' });
    const now = Date.parse('2026-09-17T04:00:15Z');
    const read = (source, heartbeat, at = now) => collectorReadObservation(missing, source, '2026-09-17', heartbeat, at);
    expect(read('scheduler', '2026-09-17T03:59:55Z')).toBeNull();
    expect(read('scheduler', '2026-09-17T04:00:10Z')?.key).toBe('collector:read');
    expect(read('scheduler', '2026-09-17T03:55:00Z')?.key).toBe('collector:read');
    expect(read('scheduler', null)?.key).toBe('collector:read');
    expect(read('scheduler', '2026-09-17T03:59:55Z', Date.parse('2026-09-17T04:01:00Z'))?.key).toBe('collector:read');
    expect(read('data', '2026-09-17T03:59:55Z')?.key).toBe('collector:read');
    expect(collectorReadObservation(missing, 'scheduler', '2027-01-17', '2027-01-17T04:59:55Z', Date.parse('2027-01-17T05:00:15Z'))).toBeNull();
  });
  it('keeps real read errors actionable without exposing private paths or messages', () => {
    const now = Date.parse('2026-09-17T04:00:15Z');
    const heartbeat = '2026-09-17T03:59:55Z';
    for (const [error, expected] of [
      [Object.assign(new Error('SECRET'), { code: 'EACCES' }), 'access was denied'],
      [Object.assign(new Error('SECRET'), { code: 'EINPUTSIZE' }), 'bounded read limit'],
      [new SyntaxError('SECRET'), 'invalid JSON'],
      [new Error('SECRET'), 'could not be read completely'],
    ]) {
      const result = collectorReadObservation(error, 'scheduler', '2026-09-17', heartbeat, now);
      expect(result.detail).toContain(expected);
      expect(result.detail).toContain('Previous incidents remain open');
      expect(JSON.stringify(result)).not.toContain('SECRET');
    }
  });
  it('correlates exact game IDs, retains failures, and clears only accepted outcomes', () => {
    const input = [
      line('🎯 Props: Yankees @ Twins [retry T-15] (id 5060045)'),
      line('❌ Props failed: Yankees @ Twins [retry T-15]: Exit code 1'),
      line('🎯 Props: Tigers @ Blue Jays [retry T-60] (id 5060046)'),
      line('🧾 Props outcome: stored for Tigers @ Blue Jays (0 pick(s))'),
      line('✅ Done'),
    ];
    expect([...schedulerObservations(input.join('\n'), date).active.keys()]).toEqual([`${date}:props:5060045`]);
    input.push(line('🧾 Props outcome: pass for Yankees @ Twins (0 pick(s))'));
    expect(schedulerObservations(input.join('\n'), date).active.size).toBe(0);
  });
  it('keeps a doubleheader failure distinct from a later game with identical teams', () => {
    const text = [line('📊 Game picks: A @ B [primary T-90] (id 1)'),
      line('❌ Game picks failed: A @ B [primary T-90]: timeout'),
      line('📊 Game picks: A @ B [primary T-90] (id 2)'),
      line('🧾 Game-pick outcome: stored for A @ B')].join('\n');
    expect([...schedulerObservations(text,date).active.keys()]).toEqual([`${date}:game:1`]);
  });
  it('preserves a final missed outcome without depending on a start line', () => {
    const parsed = schedulerObservations(line('⚠️ MISSED PROPS: MLB Yankees @ Twins — no accepted stored/pass outcome after all retry tiers (id 5060045): Exit code 1'),date);
    expect(parsed.active.get(`${date}:props:5060045`).detail).toContain('Final retry');
  });
  it('uses real Eastern summer and winter timestamps independent of host timezone', () => {
    expect(easternLogTime('9/16/2026, 1:25:38 PM')).toBe('2026-09-16T17:25:38.000Z');
    expect(easternLogTime('1/16/2026, 12:05:00 AM')).toBe('2026-01-16T05:05:00.000Z');
  });
  it('does not resurrect an old data incident after a verified successful retry', () => {
    const parsed = schedulerObservations([line('🎯 Props: A @ B [primary T-90] (id 1)'),line('🧾 Props outcome: stored for A @ B (2 pick(s))')].join('\n'),date);
    mergeDataFailures(parsed,[{league:'MLB',kind:'props',game_id:'1',last_failed_at:'2026-09-16T17:24:00Z'}],date);
    expect(parsed.active.size).toBe(0);
    mergeDataFailures(parsed,[{league:'MLB',kind:'props',game_id:'1',error:'refresh token revoked PRIVATESECRET',last_failed_at:'2026-09-16T17:26:00Z'}],date);
    expect(parsed.active.get(`${date}:props:1`).detail).toBe('Provider sign-in failed');
    expect(JSON.stringify([...parsed.active.values()])).not.toContain('PRIVATESECRET');
  });
  it('does not email raw provider errors and ignores healthy or pending coverage', () => {
    expect(failureCategory('private raw token')).not.toContain('private raw token');
    expect(healthObservations({checked_at:new Date().toISOString(),checks:[{id:'a',status:'pending'},{id:'b',status:'ok'}]})).toEqual([]);
    expect(healthObservations(null)[0].key).toBe('coverage:unverified');
    expect(healthObservations({checked_at:new Date().toISOString(),checks:[{id:'read:provider',status:'fail',evidence:'SECRET'}]})[0].detail).not.toContain('SECRET');
  });
  it('replaces a generic exit failure with the actual missing football market reason', () => {
    const parsed = schedulerObservations([
      line('📊 Game picks: Fresno State @ San Jose State [primary T-240] (id 457975)'),
      line('❌ Game picks failed: Fresno State @ San Jose State [primary T-240]: Exit code 1'),
    ].join('\n'), date);
    mergeDataFailures(parsed, [{ ...footballMarketUnavailable({}, 'NCAAF'), league: 'NCAAF',
      game_id: '457975', last_failed_at: '2026-09-16T17:25:38Z' }], date);
    expect(parsed.active.size).toBe(1);
    expect(parsed.active.get(`${date}:game:457975`).detail).toContain('No verified sportsbook spread and price');
    expect(parsed.active.get(`${date}:game:457975`).detail).not.toContain('private run log');
    expect(failureCategory('market_unavailable No verified MLB moneyline')).not.toContain('spread');
  });
  it('names a required-data block by its own reason instead of pointing at the private run log', () => {
    const parsed = schedulerObservations([
      line('🎯 Props: Nationals @ Tigers [primary T-90] (id 5060113)'),
      line('❌ Props failed: Nationals @ Tigers [primary T-90]: Exit code 1'),
    ].join('\n'), date);
    mergeDataFailures(parsed, [{ league: 'MLB', kind: 'props', game_id: '5060113', code: 'pick_failed', publication_blocked: true,
      error: 'MLB prop history is empty for confirmed participant river ryan (3856)', last_failed_at: '2026-09-16T19:27:40Z' }], date);
    const detail = parsed.active.get(`${date}:props:5060113`).detail;
    expect(detail).toContain('Required sports data unavailable');
    expect(detail).toContain('river ryan');
    expect(detail).not.toContain('private run log');
    expect(failureCategory('pick_failed no completed starts for DJ Herz')).toBe('Required sports data unavailable');
  });
  it('names a prop withheld because its line moved, instead of pointing at the private run log', () => {
    const parsed = schedulerObservations([line('🎯 Props: New York Giants @ Los Angeles Rams [retry T-150] (id 1392247)'),
      line('❌ Props failed: New York Giants @ Los Angeles Rams [retry T-150]: Exit code 1')].join('\n'), date);
    mergeDataFailures(parsed, [{ league: 'NFL', kind: 'props', game_id: '1392247', code: 'pick_failed', publication_blocked: true,
      error: 'Selected standard prop line moved or is no longer corroborated; fresh analysis required', last_failed_at: '2026-09-16T21:43:23Z' }], date);
    const detail = parsed.active.get(`${date}:props:1392247`).detail;
    expect(detail).toContain('Market changed before publication');
    expect(detail).toContain('line moved');
    expect(detail).not.toContain('private run log');
  });
  it('clears a college prop incident after the exact prop was published', () => {
    const parsed = schedulerObservations('', date);
    const failure = { league: 'NCAAF', kind: 'props', game_id: '1', code: 'NCAAF_PROP_UNAVAILABLE', error: 'No live board', last_failed_at: '2026-09-16T17:24:00Z' };
    mergeDataFailures(parsed, [failure], date);
    expect(parsed.active.get(`${date}:props:1`).detail).toBe('No live board');
    mergeDataFailures(parsed, [{ ...failure, publication_blocked: false, resolved_at: '2026-09-16T17:25:00Z' }], date);
    expect(parsed.active.size).toBe(0);
  });
});
