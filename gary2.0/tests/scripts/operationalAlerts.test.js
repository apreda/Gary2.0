import { describe, it, expect } from 'vitest';
import { schedulerObservations, mergeDataFailures, easternLogTime, failureCategory, healthObservations } from '../../scripts/lib/operationalAlerts.js';
const date = '2026-09-16';
const line = text => `[9/16/2026, 1:25:38 PM] ${text}`;
describe('non-AI operational observations', () => {
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
    expect(healthObservations({checked_at:new Date().toISOString(),checks:[{id:'a',status:'fail',evidence:'SECRET'}]})[0].detail).not.toContain('SECRET');
  });
});
