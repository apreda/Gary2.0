import { describe, it, expect, beforeAll } from 'vitest';
import { rolldown } from 'rolldown';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { isSocialServiceRequest } from '../../supabase/functions/post-single-tweet/authorization.ts';

const require = createRequire(import.meta.url);
const endpoints = ['post-single-tweet', 'post-quote-tweet', 'post-reply-tweet', 'post-tweet-media', 'post-delete-tweet', 'update-x-banner', 'get-tweet-metrics', 'reply-engine-scan', 'reply-engine-send', 'social-auto-post'];
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

function fixture(endpoint, { transport, service = serviceKey } = {}) {
  let handler;
  const calls = [];
  const background = [];
  const env = {
    SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: service,
    SUPABASE_ANON_KEY: 'fixture-anon-key', X_API_KEY: 'fixture-x-key',
    X_API_SECRET: 'fixture-x-secret', X_ACCESS_TOKEN: 'fixture-x-token',
    X_ACCESS_TOKEN_SECRET: 'fixture-x-token-secret',
  };
  const context = vm.createContext({
    Deno: { env: { get: name => env[name] }, serve: fn => { handler = fn; } },
    EdgeRuntime: { waitUntil: promise => background.push(promise) },
    fetch: async (input, init = {}) => {
      const url = new URL(input);
      const call = { url, method: init.method ?? 'GET', headers: new Headers(init.headers), body: init.body };
      calls.push(call);
      if (!transport) throw new Error('Unauthorized caller reached a dependency');
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
  it('a prepared pick rechecks the shared cadence reservation before sending its frozen copy',async()=>{
    const day='2026-09-19', now=Date.parse(day+'T10:00:00-04:00');
    const p={league:'MLB',game_id:1,awayTeam:'Cubs',homeTeam:'Brewers',pick:'Cubs ML',commence_time:day+'T12:00:00-04:00',
      rationale:'Gómez, Hoffman and Minter all sat Sunday after throwing seven, 17 and 18 pitches Saturday.'};
    const frozen={post_text:'Already prepared exact copy',pick_text:p.pick,commence_time:p.commence_time,thread_format:'standard'};
    const prepared={publication_key:'["MLB","id","1"]',state:'prepared',log_payload:frozen,reply_text:null};
    const f=fixture('social-auto-post',{transport:call=>{
      switch(call.url.pathname){
        case '/rest/v1/daily_picks':return Response.json([{picks:[p]}]);
        case '/rest/v1/weekly_nfl_picks':case '/rest/v1/prop_picks':case '/rest/v1/social_post_log':return Response.json([]);
        case '/rest/v1/social_publication_intents':return Response.json([prepared]);
        case '/rest/v1/daily_slate':return Response.json([{...p,away_team:p.awayTeam,home_team:p.homeTeam,bdl_game_id:1}]);
        case '/rest/v1/rpc/claim_social_publication':return Response.json([]); // another game owns this interval
        default:throw new Error('Unexpected send or dependency: '+call.url.pathname);
      }
    }});
    const result=await f.internal('runPickMode')(day,now,false);
    expect(result.posted).toBe(false);
    expect(result.results[0].reason).toBe('publication interval reserved');
    const mutations=f.calls.filter(c=>c.method!=='GET');
    expect(mutations).toHaveLength(1);
    expect(mutations[0].url.pathname).toBe('/rest/v1/rpc/claim_social_publication');
    expect(JSON.parse(mutations[0].body).p_payload).toEqual(frozen);
  });
  it.each([
    ['postTweet', ['Fixture single'], '/functions/v1/post-single-tweet'],
    ['postTweet', ['Fixture reply', '123'], '/functions/v1/post-reply-tweet'],
    ['postQuote', ['Fixture quote', '123'], '/functions/v1/post-quote-tweet'],
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

  it('authorized reply scanner reads configuration and mentions without fabricating queue work', async () => {
    const f = fixture('reply-engine-scan', { transport: call => {
      if (call.url.pathname === '/rest/v1/reply_engine_config') return Response.json({ daily_cap: 10 });
      if (call.url.pathname.endsWith('/mentions')) return Response.json({ data: [] });
      throw new Error('Unexpected scan request');
    } });
    const response = await f.handler(request('reply-engine-scan'));
    expect(response.status).toBe(200);
    expect(f.calls.map(c => c.method)).toEqual(['GET', 'GET']);
  });

  it('approved reply delivery uses the service bearer internally and only then records the returned id', async () => {
    const f = fixture('reply-engine-send', { transport: call => {
      if (call.url.pathname === '/rest/v1/reply_engine_config') return Response.json({ daily_cap: 10, per_account_cap: 1, spacing_minutes: 7 });
      if (call.url.pathname === '/rest/v1/reply_queue' && call.method === 'PATCH') return new Response(null, { status: 204 });
      if (call.url.pathname === '/rest/v1/reply_queue') return Response.json(call.url.searchParams.get('status') === 'eq.approved' ? [{ id: 1, target_author: 'fixture-author', target_tweet_id: '123', draft: 'Approved fixture' }] : []);
      if (call.url.pathname === '/functions/v1/post-reply-tweet') {
        expect(call.headers.get('Authorization')).toBe(`Bearer ${serviceKey}`);
        return Response.json({ success: true, tweetId: '456' });
      }
      throw new Error('Unexpected reply delivery request');
    } });
    const response = await f.handler(request('reply-engine-send'));
    expect(response.status).toBe(200);
    expect((await response.json()).posted).toBe(1);
    expect(f.calls.filter(c => c.method !== 'GET').map(c => [c.method, c.url.pathname])).toEqual([['POST', '/functions/v1/post-reply-tweet'], ['PATCH', '/rest/v1/reply_queue']]);
  });

  it('auto-post metrics continuation uses the service bearer and updates only the existing post', async () => {
    const f = fixture('social-auto-post', { transport: call => {
      if (call.url.pathname === '/rest/v1/social_publication_intents') return Response.json([]);
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
