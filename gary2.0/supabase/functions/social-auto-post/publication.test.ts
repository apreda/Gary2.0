import test from 'node:test';
import assert from 'node:assert/strict';
import { publishIntent } from './publication.js';
import { publicationKey, hasLoggedTicket } from './pickSources.js';

const at = Date.parse('2026-09-07T17:00:00Z');
function fixture(reply: string | null = 'Read the full reasoning.') {
  let row: any = { id: 'intent', state: 'prepared', post_date: '2026-09-07', publication_key: 'game-1', reply_text: reply,
    log_payload: { post_text: 'A real pick.', commence_time: '2026-09-07T18:00:00Z' } };
  const sends: any[] = [], logs: any[] = [];
  const store = {
    async advance(before: any, state: string, extra: any) {
      if (row.state !== before.state) return null;
      row = { ...row, state, ...extra }; return structuredClone(row);
    },
    async log(record: any) { logs.push(structuredClone(record)); },
  };
  const send = async (text: string, replyTo?: string) => { sends.push({ text, replyTo }); return `tweet-${sends.length}`; };
  return { get row() { return structuredClone(row); }, store, send, sends, logs, now: () => at };
}
test('concurrent workers attempt each root/reply once and retain the original receipt', async () => {
  const f = fixture(), original = f.row;
  await Promise.all([publishIntent(original, f), publishIntent(original, f)]);
  assert.equal(f.row.state, 'completed');
  assert.deepEqual(f.sends, [{ text: 'A real pick.', replyTo: undefined }, { text: 'Read the full reasoning.', replyTo: 'tweet-1' }]);
  assert.equal(f.logs[0].hook_tweet_id, 'tweet-1');
  assert.equal(f.logs[0].reply_tweet_id, undefined);
  assert.equal(f.logs[1].reply_tweet_id, 'tweet-2');
});
test('lost log response repairs next invocation without resending root or backdating', async () => {
  const f = fixture(); let fail = true; const log = f.store.log;
  f.store.log = async row => { if (fail) { fail = false; throw new Error('POST_LOG_WRITE_FAILED'); } await log(row); };
  assert.deepEqual(await publishIntent(f.row, f), { posted: true, error: 'Error: POST_LOG_WRITE_FAILED' });
  assert.equal(f.row.state, 'root_sent');
  const stamp = f.row.root_posted_at;
  await publishIntent(f.row, f);
  assert.equal(f.sends.length, 2);
  assert.equal(f.row.state, 'completed');
  assert.equal(f.logs[0].root_posted_at, stamp);
});
test('uncertain root outcome never auto-retries even on a later invocation', async () => {
  const f = fixture(); let calls = 0;
  const send = async () => { calls++; throw new Error('network timed out after acceptance'); };
  await publishIntent(f.row, { ...f, send });
  assert.equal(f.row.state, 'root_sending');
  assert.match((await publishIntent(f.row, { ...f, send })).error!, /PUBLICATION_SEND_UNCERTAIN/);
  assert.equal(calls, 1); assert.equal(f.logs.length, 0);
});
test('root receipt write failure blocks reply and leaves a visible uncertain send', async () => {
  const f = fixture(), advance = f.store.advance;
  f.store.advance = async (row, state, extra) => { if (state === 'root_sent') throw new Error('DB unavailable'); return advance(row, state, extra); };
  await publishIntent(f.row, f); await publishIntent(f.row, f);
  assert.equal(f.sends.length, 1); assert.equal(f.row.state, 'root_sending');
});
test('uncertain reply leaves the confirmed root logged and never republishes either stage', async () => {
  const f = fixture(); let calls = 0;
  const send = async (text: string, replyTo?: string) => { calls++; if (replyTo) throw new Error('reply timeout'); return 'root'; };
  await publishIntent(f.row, { ...f, send });
  assert.equal(f.row.state, 'reply_sending'); assert.equal(f.logs[0].hook_tweet_id, 'root');
  assert.match((await publishIntent(f.row, { ...f, send })).error!, /PUBLICATION_REPLY_UNCERTAIN/);
  assert.equal(calls, 2);
});
test('confirmed reply survives failed final logging without another X write', async () => {
  const f = fixture(), log = f.store.log; let fail = true;
  f.store.log = async row => { if (row.reply_tweet_id && fail) { fail = false; throw new Error('log failed'); } await log(row); };
  await publishIntent(f.row, f); assert.equal(f.row.state, 'reply_sent');
  await publishIntent(f.row, f); assert.equal(f.sends.length, 2); assert.equal(f.row.state, 'completed');
});
test('late recovery repairs root log only; it never sends a late pick or reply', async () => {
  const f = fixture(), advance = f.store.advance;
  await advance(f.row, 'root_sent', { hook_tweet_id: 'existing', root_posted_at: new Date(at).toISOString() });
  await publishIntent(f.row, { ...f, now: () => at + 86400000 });
  assert.equal(f.sends.length, 0); assert.equal(f.logs.length, 1); assert.equal(f.row.state, 'completed');
  const g = fixture(); await publishIntent(g.row, { ...g, now: () => at + 3600000 });
  assert.equal(g.sends.length, 0); assert.equal(g.row.state, 'expired');
});
test('metrics-only reconciliation saves the root while deferring its still-timely reply', async () => {
  const f = fixture(); await f.store.advance(f.row, 'root_sent', { hook_tweet_id: 'existing', root_posted_at: new Date(at).toISOString() });
  await publishIntent(f.row, { ...f, allowSend: false });
  assert.equal(f.sends.length, 0); assert.equal(f.row.state, 'root_sent'); assert.equal(f.logs.length, 1);
});
test('deadline is checked again after composition, and an unconfirmed claim never sends', async () => {
  const f = fixture(); let clock = at;
  f.store.advance = async () => null;
  await publishIntent(f.row, { ...f, now: () => clock });
  assert.equal(f.sends.length, 0);
  clock += 56 * 60000;
  await publishIntent(f.row, { ...f, now: () => clock }); assert.equal(f.sends.length, 0);
});
test('a slow database claim cannot push the actual send past the pregame deadline', async () => {
  const f = fixture(), advance = f.store.advance; let clock = at;
  f.store.advance = async (row, state, extra) => {
    const result = await advance(row,state,extra);
    if (state === 'root_sending') clock += 56 * 60000;
    return result;
  };
  await publishIntent(f.row, { ...f, now: () => clock });
  assert.equal(f.sends.length, 0); assert.equal(f.row.state, 'expired');
});
test('game keys distinguish identical-ticket doubleheaders and resist price/start corrections', () => {
  const p = { league: 'MLB', game_id: 1, pick: 'Cubs ML', commence_time: '2026-09-07T18:00:00Z', awayTeam: 'Cubs', homeTeam: 'Mets' };
  const logs = [{ publication_key: publicationKey(p), pick_text: p.pick }];
  assert.equal(hasLoggedTicket({ ...p, game_id: 2 }, logs), false);
  assert.equal(hasLoggedTicket({ ...p, pick: 'Cubs ML -125', commence_time: '2026-09-07T19:00:00Z' }, logs), true);
  assert.equal(hasLoggedTicket({ ...p, game_id: 2 }, [{ pick_text: p.pick }]), true);
  assert.notEqual(publicationKey({ ...p, game_id: undefined }), publicationKey({ ...p, game_id: undefined, commence_time: '2026-09-07T19:00:00Z' }));
});
