import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizedPushRequest, deliverPickAlert, deviceKey, mergeAlertSources, nflWeek, pickAlerts, pushMessage, terminalPushState } from './delivery.ts';

const now = Date.parse('2026-09-09T20:00:00Z');
const pick = { league: 'NFL', game_id: 42, awayTeam: 'Away Club', homeTeam: 'Home Club',
  pick: 'Away Club +3', commence_time: '2026-09-09T21:00:00.000Z' };
const alert = () => pickAlerts([pick], '2026-09-09', now)[0];

test('public pick copy contains no invented timing, paid Winners claim or promised outcome', () => {
  const item = alert();
  assert.equal(item.title, 'NFL pick is ready');
  assert.equal(item.body, "Away Club @ Home Club: see Gary's pick and the reasoning.");
  assert.deepEqual(item.data, { destination: 'picks', league: 'NFL', game_id: '42', game_date: '2026-09-09', matchup: 'Away Club @ Home Club' });
});

test('strict pregame and identity gate rejects missing, invalid, started, prop and retired sports', () => {
  for (const patch of [{ commence_time: null }, { commence_time: 'invalid' }, { commence_time: '2026-09-09T21:00:00' }, { commence_time: '2026-09-09T20:00:00Z' },
    { commence_time: '2026-09-09T19:59:59Z' }, { game_id: null }, { game_id: '42.3' }, { game_id: 0 },
    { game_id: '9007199254740993' }, { type: 'prop' }, { pickType: 'prop' }, { league: 'NHL' }, { league: 'WC' },
    { awayTeam: '' }, { homeTeam: '' }, { pick: '' }]) {
    assert.equal(pickAlerts([{ ...pick, ...patch }], '2026-09-09', now).length, 0, JSON.stringify(patch));
  }
  for (const league of ['NFL','NCAAF','MLB','NBA']) assert.equal(pickAlerts([{ ...pick, league }], '2026-09-09', now).length, 1);
});

test('game ID distinguishes doubleheaders while duplicate ticket variants cannot double-alert', () => {
  const items = pickAlerts([pick, { ...pick, pick: 'Away Club ML' }, { ...pick, game_id: 43 }], '2026-09-09', now);
  assert.equal(items.length, 2);
  assert.notEqual(items[0].key, items[1].key);
});

test('FCM payload expires at kickoff and carries the dated exact target', () => {
  const message = pushMessage('fixture-token', alert()).message;
  assert.equal(message.apns.headers['apns-expiration'], '1788987600');
  assert.equal(message.apns.headers['apns-collapse-id'], '2026-09-09|NFL|42');
  assert.equal(message.data.game_id, '42');
  assert.equal(message.notification.title, alert().title);
});

test('send boundary rechecks kickoff even after an earlier valid claim', async () => {
  let calls = 0;
  const result = await deliverPickAlert('fixture','fixture','fixture',alert(), async () => { calls++; return new Response('{}'); }, () => Date.parse(pick.commence_time));
  assert.deepEqual(result, { status: 'expired', httpStatus: null });
  assert.equal(calls, 0);
});

test('accepted, known failed and ambiguous transport outcomes remain distinct', async () => {
  const send = (request: typeof fetch) => deliverPickAlert('fixture','fixture','fixture',alert(),request,() => now);
  assert.deepEqual(await send(async () => new Response('{}',{status:200})), { status:'sent',httpStatus:200 });
  assert.deepEqual(await send(async () => new Response('{}',{status:503})), { status:'failed',httpStatus:503 });
  assert.deepEqual(await send(async () => { throw new Error('timeout'); }), { status:'unknown',httpStatus:null });
  assert.equal(terminalPushState('unknown'),true);
  assert.equal(terminalPushState('sent'),true);
  assert.equal(terminalPushState('sending'),false);
  assert.equal(terminalPushState('failed'),false);
});

test('only definitive FCM UNREGISTERED can deactivate a token, not a generic404', async () => {
  const send = (body: unknown) => deliverPickAlert('fixture','fixture','fixture',alert(),
    async () => new Response(JSON.stringify(body),{status:404}), () => now);
  assert.equal((await send({ error:{status:'NOT_FOUND'} })).status,'failed');
  assert.equal((await send({ error:{details:[{'@type':'type.googleapis.com/google.firebase.fcm.v1.FcmError',errorCode:'UNREGISTERED'}]} })).status,'dead');
});

test('service authorization rejects anon, user, absent and empty service keys, including dry previews', () => {
  for (const token of ['', 'anon-fixture', 'user-fixture']) {
    const request = new Request('https://fixture.invalid/?dry=1', { headers:{authorization:`Bearer ${token}`} });
    assert.equal(authorizedPushRequest(request,'service-fixture'),false);
  }
  assert.equal(authorizedPushRequest(new Request('https://fixture.invalid'),''),false);
  assert.equal(authorizedPushRequest(new Request('https://fixture.invalid',{headers:{authorization:'Bearer service-fixture'}}),'service-fixture'),true);
});

test('delivery evidence stores stable hashes instead of raw device tokens', async () => {
  const key = await deviceKey('fixture-token');
  assert.match(key,/^[a-f0-9]{64}$/);
  assert.equal(key,await deviceKey('fixture-token'));
  assert.notEqual(key,await deviceKey('other-token'));
});

test('NFL uses Tuesday-Monday weeks and January games retain the prior season', () => {
  assert.deepEqual(nflWeek('2026-09-07'),{weekStart:'2026-09-01',season:2026});
  assert.deepEqual(nflWeek('2026-09-08'),{weekStart:'2026-09-08',season:2026});
  assert.deepEqual(nflWeek('2027-01-04'),{weekStart:'2026-12-29',season:2026});
  assert.throws(()=>nflWeek('2026-02-31'));
});

test('canonical weekly NFL replaces daily NFL and respects exact ET day and provider aliases', () => {
  const weekly = {...pick,game_id:undefined,bdl_game_id:43,league:undefined};
  const merged=mergeAlertSources([pick,{...pick,league:'MLB'}],[weekly]);
  const alerts=pickAlerts(merged,'2026-09-09',now);
  assert.deepEqual(alerts.map(item=>[item.data.league,item.data.game_id]),[['MLB','42'],['NFL','43']]);
  assert.equal(pickAlerts([{...pick,bdl_game_id:99}],'2026-09-09',now).length,0);
  assert.equal(pickAlerts([{...pick,commence_time:'2026-09-11T01:00:00Z'}],'2026-09-09',now).length,0);
  assert.equal(pickAlerts([{...pick,commence_time:'2026-09-10T01:00:00Z'}],'2026-09-09',now).length,1);
});

test('overnight college kickoff keeps its six-AM slate date, including after midnight', () => {
  const college = {...pick,league:'NCAAF',commence_time:'2026-09-10T06:00:00Z',_alertDate:'2026-09-09'};
  const beforeMidnight=pickAlerts([college],'2026-09-09',Date.parse('2026-09-10T03:00:00Z'));
  const afterMidnight=pickAlerts([college],'2026-09-10',Date.parse('2026-09-10T05:00:00Z'));
  assert.equal(beforeMidnight.length,1);assert.equal(afterMidnight.length,1);
  assert.equal(afterMidnight[0].data.game_date,'2026-09-09');
  assert.equal(afterMidnight[0].key,beforeMidnight[0].key);
  assert.equal(pickAlerts([{...college,_alertDate:'2026-09-10'}],'2026-09-10',now).length,0);
});
