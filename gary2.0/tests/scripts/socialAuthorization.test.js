import { describe, it, expect, beforeAll } from 'vitest';
import { rolldown } from 'rolldown';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { isSocialServiceRequest } from '../../supabase/functions/post-single-tweet/authorization.ts';
import { easternDateOffset } from '../../supabase/functions/_shared/dateKeys.js';

const require = createRequire(import.meta.url);
const endpoints = ['post-single-tweet', 'post-quote-tweet', 'post-reply-tweet', 'post-tweet-media', 'post-delete-tweet', 'update-x-banner', 'get-tweet-metrics', 'social-auto-post'];
const bundled = new Map();
const serviceKey = 'fixture-service-key';

beforeAll(async () => {
  // Bundle actual entrypoints and the real Supabase SDK. Only Deno's declaration
  // import and npm: resolution need adaptation to Node; no handler is extracted
  // or substituted. Every runtime dependency call hits the fixture transport.
  for (const endpoint of endpoints) {
    const bundle = await rolldown({
      input: fileURLToPath(new URL(`../../supabase/functions/${endpoint}/index.ts`, import.meta.url)),
      platform: 'node', logLevel: 'silent',
      plugins: [{ name: 'edge-import-resolution',
        resolveId(id) {
          if (/^jsr:.*edge-runtime\.d\.ts$/.test(id)) return '\0edge-types';
          if (id === 'npm:@supabase/supabase-js@2') return require.resolve('@supabase/supabase-js');
        },
        load(id) { if (id === '\0edge-types') return ''; },
      }],
    });
    const result = await bundle.generate({ format: 'cjs' });
    bundled.set(endpoint, result.output[0].code);
    await bundle.close();
  }
}, 30000);

function fixture(endpoint, { transport, service = serviceKey, envValues = {} } = {}) {
  let handler;
  const calls = [];
  const background = [];
  const modelJobs = new Map();
  const env = {
    SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: service,
    SUPABASE_ANON_KEY: 'fixture-anon-key', X_API_KEY: 'fixture-x-key',
    X_API_SECRET: 'fixture-x-secret', X_ACCESS_TOKEN: 'fixture-x-token',
    X_ACCESS_TOKEN_SECRET: 'fixture-x-token-secret', ...envValues,
  };
  const context = vm.createContext({
    Deno: { env: { get: name => env[name] }, serve: fn => { handler = fn; } },
    EdgeRuntime: { waitUntil: promise => background.push(promise) },
    fetch: async (input, init = {}) => {
      const url = new URL(input);
      const call = { url, method: init.method ?? 'GET', headers: new Headers(init.headers), body: init.body };
      if (!transport) { calls.push(call); throw new Error('Unauthorized caller reached a dependency'); }
      if (url.pathname === '/rest/v1/subscription_model_jobs') {
        if (call.method === 'POST') {
          const id = String(modelJobs.size+1);
          const providerCall = { ...call, url:new URL('https://model-worker.invalid/v1/messages'), body:JSON.stringify(JSON.parse(call.body).request) };
          calls.push(providerCall);
          const result=await transport(providerCall);
          const payload=await result.json();
          modelJobs.set(id,result.ok?{status:'completed',response:payload}:{status:'failed',error:`Model provider ${result.status}: ${JSON.stringify(payload)}`});
          return Response.json([{id}]);
        }
        return Response.json([modelJobs.get(url.searchParams.get('id').replace('eq.',''))]);
      }
      calls.push(call);
      return transport(call);
    },
    Request, Response, Headers, URL, URLSearchParams, TextEncoder, TextDecoder,
    FormData, Blob, Buffer, AbortController, AbortSignal, crypto: webcrypto,
    WebSocket: class { constructor() { throw new Error('Unexpected fixture WebSocket'); } },
    atob, btoa, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    process, require, module: { exports: {} }, exports: {},
    console: { log() {}, warn() {}, error() {} },
  });
  vm.runInContext(bundled.get(endpoint), context);
  return { handler, calls, background, internal: name => vm.runInContext(name, context) };
}

const request = (endpoint, { authorization = `Bearer ${serviceKey}`, query = '', method = 'POST', body = {} } = {}) => new Request(`https://fixture.invalid/${endpoint}${query}`, {
  method, headers: { ...(authorization ? { Authorization: authorization } : {}), 'Content-Type': 'application/json' },
  ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
});

describe('X service endpoints reject untrusted callers at the real entrypoint', () => {
  it.each([undefined, '', 'different-key'])('fails closed for a missing or wrong configured service key: %s', key => {
    expect(isSocialServiceRequest(request('post-single-tweet'), key)).toBe(false);
  });
  it.each(endpoints)('%s denies anon/user/malformed credentials before all effects', async endpoint => {
    const f = fixture(endpoint);
    for (const authorization of [null, 'Bearer fixture-anon-key', 'Bearer fixture-user-token', `Basic ${serviceKey}`, `Bearer ${serviceKey}-suffix`]) {
      for (const query of ['', '?preview=1&dry_run=1&force_mode=pick', '?metrics_only=1', '?batch=50']) {
        const response = await f.handler(request(endpoint, { authorization, query, body: { text: 'Should never publish', tweetId: '123', replyToId: '123', quoteTweetId: '123', banner_base64: 'YQ==', images_base64: ['YQ=='] } }));
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ ok: false, error: 'Service authorization required' });
      }
    }
    const get = await f.handler(request(endpoint, { authorization: 'Bearer fixture-anon-key', method: 'GET', query: '?ids=123&dry_run=1' }));
    expect(get.status).toBe(403);
    expect(f.calls).toEqual([]);
    expect(f.background).toEqual([]);
  });
});

describe('authorized X operations retain their existing behavior against recording HTTP fixtures', () => {
  // THE FREE PICK (Sep 29 2026: @BetwithGary is a brand account; the every-game threads, the week tape and
  // the verdict quote-tweets are retired). The scheduled poster posts the day's streak pick once, as text,
  // in the Oct 10 layout: a first line saying what it is, one fact from Gary's published case, the bet alone,
  // then the matchup and start. The Opus writer picks the fact and says the ticket the way a fan does; code
  // checks its words against the ticket's line and side and keeps the exact ticket when they drift.
  const FREE_PICK_HEADER = "Gary's Free Pick of the Day";
  const LINK_REPLY = 'The full breakdown is free in the app: betwithgary.ai/c/xpick';
  const day = '2026-10-12';
  const streakPick = { candidate_id: 'cand-1', league: 'MLB', kind: 'game', pick_text: 'Los Angeles Angels ML +120', odds: 120,
    matchup: 'Los Angeles Angels @ Milwaukee Brewers', commence_time: day + 'T19:05:00-04:00', player: null, prop: null, bet: null };
  const opening = 'Every Angels reliever had yesterday off.';
  const closing = 'Sánchez has allowed a .737 OPS to right-handed hitters compared with .357 to lefties.';
  const rationale = `${opening} ${closing}`;
  const written = { pick_words: 'Angels ML', matchup_words: 'Angels @ Brewers', opening_source: rationale, closing_source: rationale, opening, closing };
  const writerReply = input => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'write_hook', input }] });
  const expectedText = `${FREE_PICK_HEADER}\n\n${opening}\n\nAngels ML\n\nAngels @ Brewers 7:05pm EST`;
  /** One free pick day's dependencies; an override answers its path ahead of the defaults. */
  const freePickTransport = (overrides = {}, { today = day, pick = streakPick, source = rationale } = {}) => call => {
    const path = call.url.pathname;
    if (overrides[path]) return overrides[path](call);
    switch (path) {
      case '/rest/v1/streak_picks':
        expect(call.url.searchParams.get('game_date')).toBe('eq.' + today);
        return Response.json([pick]);
      case '/rest/v1/social_post_log':
        if (call.method !== 'GET') return new Response(null, { status: call.method === 'POST' ? 201 : 204 });
        expect(call.url.searchParams.get('post_date')).toBe('eq.' + today);
        expect(call.url.searchParams.get('pick_text')).toBe('eq.FREE PICK ' + today);
        return Response.json([]);
      case '/rest/v1/winners_candidates':
        expect(call.url.searchParams.get('id')).toBe('eq.' + pick.candidate_id);
        return Response.json([{ rationale: source }]);
      case '/v1/messages': return writerReply(written);
      default: throw new Error('Unexpected send or dependency: ' + path);
    }
  };
  const mutations = f => f.calls.filter(c => c.url.hostname === 'fixture.invalid' && c.method !== 'GET').map(c => [c.method, c.url.pathname]);

  it.each(['ok', 'ticket-drift', 'rate-limit', 'invalid-output', 'empty-source', 'transport-error'])('the free pick writer reads the whole published case and code keeps the ticket: %s', async scenario => {
    const f = fixture('social-auto-post', { transport: freePickTransport({
      '/v1/messages': call => {
        const body = JSON.parse(call.body);
        expect(body.model).toBe('claude-opus-5-5');
        expect(body.tool_choice).toEqual({ type: 'tool', name: 'write_hook', disable_parallel_tool_use: true });
        expect(body.tools[0].input_schema.required).toEqual(['pick_words', 'matchup_words', 'opening_source', 'closing_source', 'opening', 'closing']);
        expect(body.system).toContain('Do not turn an opposing-case fact into support');
        expect(body.system).toContain('Also write pick_words');
        expect(JSON.parse(body.messages[0].content)).toEqual({ pick: streakPick.pick_text, matchup: streakPick.matchup, league: 'MLB', maximum_characters_per_block: 80, rationale });
        if (scenario === 'rate-limit') return Response.json({ error: { type: 'rate_limit_error' } }, { status: 429 });
        if (scenario === 'transport-error') throw new TypeError('fixture connection failure');
        if (scenario === 'invalid-output') return writerReply({ ...written, closing: '' });
        if (scenario === 'ticket-drift') return writerReply({ ...written, pick_words: 'Brewers ML' });
        return writerReply(written);
      },
    }, { source: scenario === 'empty-source' ? '' : rationale }) });
    const result = await f.internal('runFreePickMode')(day, Date.parse(day + 'T16:00:00-04:00'), true);
    expect(result).toMatchObject({ posted: false, dry_run: true, pick: streakPick.pick_text, lead_min: 185, reply: LINK_REPLY });
    expect(result.error).toBeUndefined();
    const game = 'Angels @ Brewers 7:05pm EST';
    if (scenario === 'ok') expect(result).toMatchObject({ text: expectedText, writer: 'writer' });
    else if (scenario === 'ticket-drift') expect(result).toMatchObject({ text: `${FREE_PICK_HEADER}\n\n${opening}\n\nLos Angeles Angels ML\n\n${game}`, writer: 'fact, ticket words' });
    else {
      // A failed writer never drops the post: the exact ticket goes out alone, and the run names the code.
      const code = { 'rate-limit': 'HOOK_PROVIDER_UNAVAILABLE', 'invalid-output': 'HOOK_OUTPUT_INVALID', 'empty-source': 'HOOK_SOURCE_MISSING', 'transport-error': 'HOOK_PROVIDER_UNAVAILABLE' }[scenario];
      expect(result.text).toBe(`${FREE_PICK_HEADER}\n\nLos Angeles Angels ML\n\n${game}`);
      expect(result.writer).toMatch(/^none \(/);
      expect(result.writer).toContain(code);
    }
    expect(f.calls.filter(c => c.url.pathname === '/v1/messages')).toHaveLength(scenario === 'empty-source' ? 0 : 1);
    expect(mutations(f)).toEqual([]);
  });

  const failedCopyExamples = JSON.parse(readFileSync(new URL('../fixtures/social-rationales-2026-09-16.json', import.meta.url), 'utf8'));
  it.each(failedCopyExamples)('sends the previously blocked $pick rationale to the free pick writer intact and permits condensation', async source => {
    const sp = { candidate_id: source.game_id, league: 'MLB', kind: 'game', pick_text: source.pick, matchup: `${source.away_team} @ ${source.home_team}`, commence_time: source.commence_time };
    const tigers = source.pick.startsWith('Tigers');
    const open = tigers ? 'Scherzer has allowed an .848 OPS to lefties, versus .624 to righties.' : 'The Cardinals’ starter has a 5.53 ERA and 1.49 WHIP across 143.1 IP.';
    const close = tigers ? 'Montero has allowed a .570 OPS to righties, versus .672 to lefties.' : 'The Giants’ second hitter has an .880 OPS against left-handed pitching in 118 AB.';
    const f = fixture('social-auto-post', { transport: freePickTransport({
      '/v1/messages': call => {
        const body = JSON.parse(call.body);
        expect(JSON.parse(body.messages[0].content).rationale).toBe(source.rationale);
        expect(body.system).toContain('Do not turn an opposing-case fact into support');
        return writerReply({ pick_words: source.pick.replace(/ [+-]\d+$/, ''), matchup_words: sp.matchup, opening_source: source.rationale, closing_source: source.rationale, opening: open, closing: close });
      },
    }, { today: '2026-09-16', pick: sp, source: source.rationale }) });
    const result = await f.internal('runFreePickMode')('2026-09-16', Date.parse('2026-09-16T16:00:00Z'), true);
    expect(result.text).toBe([FREE_PICK_HEADER, open, source.pick.replace(/ [+-]\d+$/, ''), `${sp.matchup} ${tigers ? '3:07pm EST' : '1:15pm EST'}`].join('\n\n'));
    expect(f.calls.filter(c => c.url.pathname === '/v1/messages')).toHaveLength(1);
    expect(mutations(f)).toEqual([]);
  });

  it.each(['accepted', 'refused'])('the free pick is claimed in the log before the send and the claim is released when X refuses it: %s', async outcome => {
    const f = fixture('social-auto-post', { transport: freePickTransport({
      '/functions/v1/post-single-tweet': call => {
        expect(call.headers.get('Authorization')).toBe(`Bearer ${serviceKey}`);
        expect(JSON.parse(call.body)).toEqual({ text: expectedText });
        return outcome === 'accepted' ? Response.json({ success: true, tweetId: '777' }) : Response.json({ success: false, error: 'fixture X refused' });
      },
      '/functions/v1/post-reply-tweet': call => {
        expect(call.headers.get('Authorization')).toBe(`Bearer ${serviceKey}`);
        expect(JSON.parse(call.body)).toEqual({ text: LINK_REPLY, replyToId: '777' });
        return Response.json({ success: true, tweetId: '778' });
      },
    }) });
    const result = await f.internal('runFreePickMode')(day, Date.parse(day + 'T16:00:00-04:00'), false);
    const claim = f.calls.find(c => c.method === 'POST' && c.url.pathname === '/rest/v1/social_post_log');
    expect(JSON.parse(claim.body)).toEqual({ post_date: day, slot: 'free_pick', league: 'MLB', pick_text: 'FREE PICK ' + day, pick_id: 'cand-1', commence_time: streakPick.commence_time, thread_format: 'free_pick' });
    expect(f.calls.indexOf(claim)).toBeLessThan(f.calls.findIndex(c => c.url.pathname === '/v1/messages'));
    const health = f.internal('socialRunHealth')({ results: [result] });
    if (outcome === 'accepted') {
      expect(result).toEqual({ posted: true, pick: streakPick.pick_text, thread_url: 'https://x.com/BetwithGary/status/777', writer: 'writer' });
      expect(mutations(f)).toEqual([['POST', '/rest/v1/social_post_log'], ['POST', '/functions/v1/post-single-tweet'], ['POST', '/functions/v1/post-reply-tweet'], ['PATCH', '/rest/v1/social_post_log']]);
      const record = f.calls.find(c => c.method === 'PATCH');
      expect(JSON.parse(record.body)).toMatchObject({ hook_tweet_id: '777', cta_tweet_id: '778', thread_url: 'https://x.com/BetwithGary/status/777', post_text: expectedText });
      expect(record.url.searchParams.get('pick_text')).toBe('eq.FREE PICK ' + day);
      expect(health).toMatchObject({ status: 'ok', posted_picks: 1, failed_posts: 0 });
    } else {
      expect(result).toMatchObject({ posted: false, pick: streakPick.pick_text });
      expect(result.error).toContain('post-single-tweet failed');
      expect(mutations(f)).toEqual([['POST', '/rest/v1/social_post_log'], ['POST', '/functions/v1/post-single-tweet'], ['DELETE', '/rest/v1/social_post_log']]);
      const release = f.calls.find(c => c.method === 'DELETE');
      expect(release.url.searchParams.get('post_date')).toBe('eq.' + day);
      expect(release.url.searchParams.get('pick_text')).toBe('eq.FREE PICK ' + day);
      expect(health).toMatchObject({ status: 'degraded', failed_posts: 1, posted_picks: 0 });
    }
  });

  it.each([
    { name: 'its game is under five minutes away', now: day + 'T19:02:00-04:00', reason: "free pick's game starts in 3 min; too late to post", calls: ['/rest/v1/streak_picks'] },
    { name: 'it is already in the log today', overrides: { '/rest/v1/social_post_log': () => Response.json([{ id: 1 }]) }, reason: 'free pick already posted today', calls: ['/rest/v1/streak_picks', '/rest/v1/social_post_log'] },
    { name: 'the day has no streak pick yet', overrides: { '/rest/v1/streak_picks': () => Response.json([]) }, reason: "today's free pick is not chosen yet", calls: ['/rest/v1/streak_picks'] },
    { name: 'another run claimed the log row first', overrides: { '/rest/v1/social_post_log': call => call.method === 'POST' ? Response.json({ code: '23505', message: 'duplicate key' }, { status: 409 }) : Response.json([]) }, reason: 'free pick claimed by another run', calls: ['/rest/v1/streak_picks', '/rest/v1/social_post_log', '/rest/v1/social_post_log'] },
  ])('the free pick is not posted when $name', async ({ now = day + 'T16:00:00-04:00', overrides = {}, reason, calls }) => {
    const f = fixture('social-auto-post', { transport: freePickTransport(overrides) });
    expect(await f.internal('runFreePickMode')(day, Date.parse(now), false)).toEqual({ posted: false, reason });
    expect(f.calls.map(c => c.url.pathname)).toEqual(calls);
  });

  it("Sunday's extra free picks post under their own ticket and skip a game already under way", async () => {
    const morning = { ...streakPick, candidate_id: 'cand-nfl-1', league: 'NFL', pick_text: 'Jacksonville Jaguars +3.5 -110', matchup: 'Jacksonville Jaguars @ Kansas City Chiefs', commence_time: day + 'T09:30:00-04:00' };
    const started = { ...morning, candidate_id: 'cand-nfl-0', pick_text: 'Buffalo Bills -2.5 -105', commence_time: day + 'T07:00:00-04:00' };
    const f = fixture('social-auto-post', { transport: freePickTransport({
      '/rest/v1/rpc/free_pick_extras': call => { expect(JSON.parse(call.body)).toEqual({ p_date: day }); return Response.json([started, morning]); },
      '/rest/v1/social_post_log': call => { expect(call.url.searchParams.get('pick_text')).toBe('eq.' + morning.pick_text); return Response.json([]); },
      '/v1/messages': call => {
        expect(JSON.parse(JSON.parse(call.body).messages[0].content)).toMatchObject({ pick: morning.pick_text, matchup: morning.matchup, league: 'NFL' });
        return writerReply({ ...written, pick_words: 'Jaguars +3.5', matchup_words: 'Jaguars @ Chiefs' });
      },
    }, { pick: morning }) });
    const results = await f.internal('runSundayFreePicks')(day, Date.parse(day + 'T08:00:00-04:00'), true);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ dry_run: true, pick: morning.pick_text, text: `${FREE_PICK_HEADER}\n\n${opening}\n\nJaguars +3.5\n\nJaguars @ Chiefs 9:30am EST`, writer: 'writer' });
    expect(f.calls.filter(c => c.url.pathname === '/v1/messages')).toHaveLength(1);
    expect(mutations(f)).toEqual([['POST', '/rest/v1/rpc/free_pick_extras']]);
  });

  it("the morning result replies once under yesterday's free pick, from 8 AM ET, claimed before the send", async () => {
    const early = fixture('social-auto-post');
    expect(await early.internal('runFreePickResult')(Date.parse('2026-10-12T07:59:00-04:00'), false)).toEqual([{ replied: false, reason: 'the result posts from 8 AM ET' }]);
    expect(early.calls).toEqual([]);
    const yesterday = easternDateOffset(-1);
    const f = fixture('social-auto-post', { transport: call => {
      const path = call.url.pathname;
      if (path === '/rest/v1/social_post_log' && call.method === 'GET') {
        expect(call.url.searchParams.get('post_date')).toBe('eq.' + yesterday);
        expect(call.url.searchParams.get('slot')).toBe('eq.free_pick');
        expect(call.url.searchParams.get('result_tweet_id')).toBe('is.null');
        return Response.json([{ id: 7, league: 'MLB', pick_text: 'FREE PICK ' + yesterday, hook_tweet_id: '777' }]);
      }
      if (path === '/rest/v1/rpc/streak_pick_day') { expect(JSON.parse(call.body)).toEqual({ p_day: yesterday }); return Response.json({ result: 'WON' }); }
      if (path === '/rest/v1/social_post_log' && call.method === 'PATCH') {
        const body = JSON.parse(call.body);
        expect(call.url.searchParams.get('id')).toBe('eq.7');
        if (body.result_tweet_id === 'pending') { expect(call.url.searchParams.get('result_tweet_id')).toBe('is.null'); return Response.json([{ id: 7 }]); }
        expect(body).toEqual({ result_tweet_id: '779' });
        return new Response(null, { status: 204 });
      }
      if (path === '/functions/v1/post-reply-tweet') { expect(JSON.parse(call.body)).toEqual({ text: 'Won.', replyToId: '777' }); return Response.json({ success: true, tweetId: '779' }); }
      throw new Error('Unexpected send or dependency: ' + path);
    } });
    expect(await f.internal('runFreePickResult')(Date.parse('2026-10-12T08:00:00-04:00'), false)).toEqual([{ replied: true, result: 'won', tweet: '779' }]);
    expect(mutations(f)).toEqual([['POST', '/rest/v1/rpc/streak_pick_day'], ['PATCH', '/rest/v1/social_post_log'], ['POST', '/functions/v1/post-reply-tweet'], ['PATCH', '/rest/v1/social_post_log']]);
  });

  it('returns HTTP 503 for a failed dependency rather than a healthy HTTP 200', async () => {
    const f = fixture('social-auto-post', { transport: call => {
      if (call.url.pathname === '/rest/v1/social_post_log') return Response.json({ message: 'fixture read rejected' }, { status: 400 });
      throw new Error('Unexpected dependency');
    } });
    const response = await f.handler(request('social-auto-post', { query: '?metrics_only=1' }));
    expect(response.status).toBe(503);
    expect((await response.json()).health.status).toBe('degraded');
  });
  it.each([
    ['postTweet', ['Fixture single'], '/functions/v1/post-single-tweet'],
    ['postTweet', ['Fixture reply', '123'], '/functions/v1/post-reply-tweet'],
  ])('auto-post %s passes service authorization to %s', async (name, args, path) => {
    const f = fixture('social-auto-post', { transport: () => Response.json({ success: true, tweetId: '456' }) });
    expect(await f.internal(name)(...args)).toBe('456');
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url.pathname).toBe(path);
    expect(f.calls[0].headers.get('Authorization')).toBe(`Bearer ${serviceKey}`);
  });
  it.each([
    ['post-single-tweet', { text: 'Fixture pick' }, 'POST', '/2/tweets'],
    ['post-quote-tweet', { text: 'Fixture quote', quoteTweetId: '123' }, 'POST', '/2/tweets'],
    ['post-reply-tweet', { text: 'Fixture reply', replyToId: '123' }, 'POST', '/2/tweets'],
    ['post-delete-tweet', { tweetId: '123' }, 'DELETE', '/2/tweets/123'],
    ['update-x-banner', { banner_base64: 'YQ==' }, 'POST', '/1.1/account/update_profile_banner.json'],
    ['get-tweet-metrics', { tweetIds: ['123'] }, 'GET', '/2/tweets'],
  ])('%s reaches only its intended provider request', async (endpoint, body, method, path) => {
    const f = fixture(endpoint, { transport: () => Response.json({ data: endpoint === 'get-tweet-metrics' ? [] : { id: '456', deleted: true } }) });
    const response = await f.handler(request(endpoint, { body }));
    expect(response.status).toBe(200);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url.pathname).toBe(path);
    expect(f.calls[0].method).toBe(method);
    expect(f.calls[0].headers.get('Authorization')).toMatch(/^OAuth /);
    if (endpoint === 'post-quote-tweet') expect(JSON.parse(f.calls[0].body).quote_tweet_id).toBe('123');
    if (endpoint === 'post-reply-tweet') expect(JSON.parse(f.calls[0].body).reply.in_reply_to_tweet_id).toBe('123');
  });

  it('authorized media uploads before attaching the returned media id', async () => {
    const f = fixture('post-tweet-media', { transport: call => Response.json(call.url.pathname.includes('upload') ? { media_id_string: 'media-fixture' } : { data: { id: '456' } }) });
    expect((await f.handler(request('post-tweet-media', { body: { text: 'Fixture media', images_base64: ['YQ=='], replyToId: '123' } }))).status).toBe(200);
    expect(f.calls.map(c => c.url.hostname)).toEqual(['upload.twitter.com', 'api.x.com']);
    expect(JSON.parse(f.calls[1].body)).toEqual({ text: 'Fixture media', media: { media_ids: ['media-fixture'] }, reply: { in_reply_to_tweet_id: '123' } });
  });

  it('auto-post metrics continuation uses the service bearer and updates only the existing post', async () => {
    const f = fixture('social-auto-post', { transport: call => {
      if (call.url.pathname === '/rest/v1/social_post_log') return call.method === 'PATCH' ? new Response(null, { status: 204 }) : Response.json([{ id: 1, hook_tweet_id: '123', thread_tweet_ids: ['123'], post_date: '2026-09-06' }]);
      if (call.url.pathname === '/functions/v1/get-tweet-metrics') {
        expect(call.headers.get('Authorization')).toBe(`Bearer ${serviceKey}`);
        return Response.json({ success: true, tweets: [{ id: '123', impressions: 10, likes: 1 }] });
      }
      throw new Error(`Unexpected metrics request ${call.url.pathname}`);
    } });
    const response = await f.handler(request('social-auto-post', { query: '?metrics_only=1' }));
    expect(response.status).toBe(200);
    expect((await response.json()).metrics.updated).toBe(1);
    expect(f.calls.filter(c => c.method !== 'GET').map(c => [c.method, c.url.pathname])).toEqual([['POST', '/functions/v1/get-tweet-metrics'], ['PATCH', '/rest/v1/social_post_log']]);
  });
});
