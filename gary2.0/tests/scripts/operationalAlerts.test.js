import { describe, it, expect } from 'vitest';
import { schedulerObservations, mergeDataFailures, easternLogTime, failureCategory, healthObservations, winnersPropsObservations, collectorReadObservation } from '../../scripts/lib/operationalAlerts.js';
const date = '2026-09-16';
const line = text => `[9/16/2026, 1:25:38 PM] ${text}`;
describe('non-AI operational observations', () => {
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
  it('clears a college prop incident after the exact prop was published', () => {
    const parsed = schedulerObservations('', date);
    const failure = { league: 'NCAAF', kind: 'props', game_id: '1', code: 'NCAAF_PROP_UNAVAILABLE', error: 'No live board', last_failed_at: '2026-09-16T17:24:00Z' };
    mergeDataFailures(parsed, [failure], date);
    expect(parsed.active.get(`${date}:props:1`).detail).toBe('No live board');
    mergeDataFailures(parsed, [{ ...failure, publication_blocked: false, resolved_at: '2026-09-16T17:25:00Z' }], date);
    expect(parsed.active.size).toBe(0);
  });
});

describe('Winners props incidents',()=>{
  const run=(id,status)=>({id,status,error:status==='failed'?'Provider unavailable':null,lease_until:'2026-09-16T17:00:00Z',input_snapshot:{candidates:[{league:'MLB',game_id:'1'}]}});
  it('reports one game incident and clears it on a completed comparison even with zero winners',()=>{
    expect(winnersPropsObservations([run(1,'failed'),run(2,'failed')],date)).toHaveLength(1);
    expect(winnersPropsObservations([run(1,'failed'),run(2,'completed')],date)).toEqual([]);
  });
  it('reports an expired lease, stays quiet for healthy work and preserves other failed games',()=>{
    expect(winnersPropsObservations([run(1,'selecting')],date,Date.parse('2026-09-16T16:59:00Z'))).toEqual([]);
    expect(winnersPropsObservations([run(1,'selecting')],date,Date.parse('2026-09-16T17:01:00Z'))).toHaveLength(1);
    const failed={...run(1,'failed'),input_snapshot:{candidates:[{league:'NFL',game_id:'2'}]}};
    expect(winnersPropsObservations([failed,run(2,'completed')],date)[0].key).toBe(`${date}:winners-props:NFL:2`);
  });
});
