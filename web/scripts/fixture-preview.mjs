/** Local, read-only fixture API + the real Next app. No production configuration. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { todayEST, hubGradedDateEST } from '../lib/gary/dates.ts';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--check' && !/^--port=\d+$/.test(arg))) {
  throw new Error('Usage: npm run preview -- [--port=3100] [--check]');
}
const check = args.includes('--check');
const port = Number(args.find(arg => arg.startsWith('--port='))?.slice(7) ?? 3100);
assert(port > 0 && port < 65536, 'Port must be between 1 and 65535');
const web = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const nextCli = require.resolve('next/dist/bin/next');
for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  if (existsSync(new URL(`../${name}`, import.meta.url))) {
    throw new Error(`Fixture preview requires a worktree without web/${name}; use a fresh worktree.`);
  }
}

const date = todayEST();
const gradedDate = hubGradedDateEST();
const pick = {
  pick_id: 'local-qa-cubs', league: 'MLB', type: 'game', pick: 'Cubs ML -110',
  awayTeam: 'Chicago Cubs', homeTeam: 'Cincinnati Reds', odds: -110, confidence: 0.65,
  commence_time: `${date}T23:00:00Z`, venue: 'Local QA ballpark',
  rationale: 'Local QA fixture. This sample verifies the full pick card and is not a published pick.',
};
const mlbResult = {
  game_date: gradedDate, league: 'MLB', matchup: 'Cubs at Reds',
  pick_text: 'Cubs ML -110', result: 'won', final_score: '4-2', confidence: 0.65,
};
const nflResult = {
  game_date: gradedDate, matchup: 'Chiefs at Bills', pick_text: 'Chiefs ML -120',
  result: 'lost', final_score: '17-21', confidence: 0.60, season_type: 2,
};
// The legacy market stores its line in the name. An alternate winning line
// comes first in the results, but this published Over 5.5 call lost with 5.
const prop = {
  player: 'Local QA Pitcher', prop: 'pitcher_strikeouts 5.5', bet: 'Over',
  league: 'MLB', matchup: 'Chicago Cubs @ Cincinnati Reds', odds: -110,
  rationale: 'Local QA legacy prop: five strikeouts loses the published Over 5.5 call.',
};
const propResult = {
  game_date: date, player_name: prop.player, prop_type: 'pitcher_strikeouts',
  bet: prop.bet, matchup: prop.matchup, sport: 'MLB', odds: '-110', actual_value: 5,
};
const tables = {
  daily_picks: [{ id: 'local-qa', date, picks: [pick] }],
  weekly_nfl_picks: [],
  pick_page_index: [{ row_key: pick.pick_id, date, league: 'MLB', sport: null,
    away_team: pick.awayTeam, home_team: pick.homeTeam }],
  pick_day_index: [{ date, league: 'MLB', sport: null }],
  archive_day_index: [{ date, published_at: `${date}T12:00:00Z`, game_count: 1,
    prop_count: 1, research_count: 1 }],
  insight_connections: [{ id: 1, date, headline: 'Local QA archive research',
    detail: 'Local QA fixture research accompanies the stored Cubs pick for archive discovery verification.' }],
  prop_picks: [{ id: 'local-qa-prop', date, picks: [prop] }],
  daily_slate: [{ date, league: 'MLB', away_team: pick.awayTeam, home_team: pick.homeTeam,
    commence_time: pick.commence_time, venue: pick.venue, ml_away: '-110', ml_home: '+100' }],
  game_results: [mlbResult, { ...nflResult, league: 'NFL', result: 'won' }],
  nfl_results: [nflResult, { ...nflResult, matchup: 'Preseason QA game', season_type: 1, result: 'won' }],
  prop_results: [
    { ...propResult, line_value: 4.5, result: 'won', pick_text: 'Local QA Pitcher Over 4.5 Strikeouts -110' },
    { ...propResult, line_value: 5.5, result: 'lost', pick_text: 'Local QA Pitcher Over 5.5 Strikeouts -110' },
  ],
  live_scores: [{ date, league: 'MLB', game_id: 'local-qa', away_abbr: 'CHC', home_abbr: 'CIN',
    away_score: 2, home_score: 1, status: 'live', detail: 'TOP 5' }],
};
const unexpected = new Set();
const observedTables = new Set();
const api = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', `http://127.0.0.1:${port}`);
  res.setHeader('Access-Control-Allow-Headers', 'apikey, authorization, content-type, content-profile, x-client-info');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const url = new URL(req.url, 'http://127.0.0.1');
  // This one POST is a public read RPC; mutations remain unavailable.
  if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/your_book_leaderboard_v3') {
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 8192) { res.writeHead(413).end(); return; }
      }
      const args = JSON.parse(body);
      assert(['7d', '30d', 'season'].includes(args.p_window));
      assert(['streak', 'units', 'wins', 'record'].includes(args.p_sort));
      assert(['all', 'MLB', 'NFL', 'NBA', 'NCAAF'].includes(args.p_league));
      observedTables.add('your_book_leaderboard_v3');
      res.end(JSON.stringify({ rows: [], me: null, qualified_count: 0, min_decided: 5,
        my_decided: 0, has_more: false, window: args.p_window, sort: args.p_sort, league: args.p_league }));
    } catch {
      unexpected.add(`${req.method} ${url.pathname}: invalid fixture arguments`);
      res.writeHead(400).end(JSON.stringify({ error: 'Invalid rankings fixture request' }));
    }
    return;
  }
  const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
  if (req.method !== 'GET' || !Object.hasOwn(tables, table)) {
    unexpected.add(`${req.method} ${url.pathname}`);
    res.writeHead(req.method === 'GET' ? 404 : 405).end(JSON.stringify({ error: 'No fixture for this request' }));
    return;
  }
  observedTables.add(table);
  let rows = tables[table];
  for (const field of ['date', 'game_date']) {
    const filter = url.searchParams.get(field);
    if (filter?.startsWith('eq.')) rows = rows.filter(row => row[field] === filter.slice(3));
    else if (filter?.startsWith('in.(')) {
      const dates = filter.slice(4, -1).split(',');
      rows = rows.filter(row => dates.includes(row[field]));
    }
  }
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number(url.searchParams.get('limit') ?? rows.length);
  res.end(JSON.stringify(rows.slice(offset, offset + limit)));
});
api.listen(0, '127.0.0.1');
await once(api, 'listening');
const apiUrl = `http://127.0.0.1:${api.address().port}`;
const origin = `http://127.0.0.1:${port}`;
// Keep only runtime/terminal settings; application credentials are never inherited.
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'LANG', 'TERM']
  .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
Object.assign(env, {
  NEXT_PUBLIC_SUPABASE_URL: apiUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-qa-anon-key',
  NEXT_TELEMETRY_DISABLED: '1',
  GARY_FIXTURE_ORIGIN: origin,
  NODE_OPTIONS: `--import=${new URL('./fixture-fetch-guard.mjs', import.meta.url).href}`,
});
const child = spawn(process.execPath, [nextCli, 'dev', '--webpack',
  '--hostname', '127.0.0.1', '--port', String(port)], { cwd: web, env, stdio: 'inherit' });
const stopped = once(child, 'exit');
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    await Promise.race([stopped, delay(3000, undefined, { ref: false })]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  api.closeAllConnections();
  api.close();
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => { await close(); process.exit(signal === 'SIGINT' ? 130 : 143); });
}

console.log(`\nLOCAL QA FIXTURES: ${origin}/picks\nRead-only fixture API: ${apiUrl}\n`);
try {
  if (!check) {
    const [code] = await stopped;
    process.exitCode = code ?? 1;
  } else {
    const deadline = Date.now() + 90_000;
    // A successful socket connection is enough for readiness; HTTP failures
    // below are then reported as failures, never retried into a false pass.
    while (true) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('Next exited before readiness');
      try { await fetch(`${origin}/favicon.ico`, { signal: AbortSignal.timeout(5000) }); break; }
      catch (error) { if (Date.now() >= deadline) throw error; await delay(250); }
    }
    for (const [path, expected] of [
      ['/', 'Free sports picks.'], ['/picks', 'Local QA fixture.'],
      ['/results', 'Sports picks results and track record'],
      ['/leaderboard', 'Earn your place.'],
    ]) {
      const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(90_000) });
      assert.equal(response.status, 200, `${path} status`);
      const html = await response.text();
      const main = html.match(/<main\b[\s\S]*?<\/main>/)?.[0] ?? '';
      assert(main.includes(expected), `${path} must render fixture content in main`);
      if (path === '/picks') {
        const text = main.replace(/<[^>]+>/g, '');
        assert.match(text, /Yesterday\s*1-1/, 'The rendered Yesterday receipt must count authoritative NFL results');
        assert(main.includes(`href="/picks/mlb/${date}/chicago-cubs-at-cincinnati-reds"`),
          'Published cards must expose a permanent analysis anchor in server-rendered HTML');
      }
      console.log(`PASS ${path}: real server-rendered page contains expected content`);
    }
    const matchup = `/picks/mlb/${date}/chicago-cubs-at-cincinnati-reds`;
    for (const [path, expected] of [
      ['/picks/mlb', `href="${matchup}"`],
      [matchup, 'Local QA fixture.'],
      [`/archive/${date}`, `href="${matchup}"`],
      ['/archive/sitemap.xml', `<loc>https://www.betwithgary.ai/archive/${date}</loc>`],
      ['/picks/sitemap/0.xml', `<loc>https://www.betwithgary.ai${matchup}</loc>`],
      ['/sitemap-index.xml', '<loc>https://www.betwithgary.ai/archive/sitemap.xml</loc>'],
      ['/feed.xml', `<link>https://www.betwithgary.ai${matchup}</link>`],
    ]) {
      const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(90_000) });
      assert.equal(response.status, 200, `${path} status`);
      const html = await response.text();
      assert(html.includes(expected), `${path} must include its published fixture content`);
      if (path === matchup) {
        const receipt = [...html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)]
          .map(match => match[0]).find(item => item.includes(`>${prop.player}</span>`)) ?? '';
        const text = receipt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        assert(text.includes('OVER 5.5 Strikeouts'), 'Legacy prop must display its encoded line');
        assert.equal(text.match(/Strikeouts/g)?.length, 1, 'Prop market label must appear once');
        assert.match(receipt, /class="[^"]*\btext-loss\b[^"]*">L<\/span>/,
          'The published Over 5.5 receipt must show its loss, not the alternate Over 4.5 win');
        assert.match(text, /Actual\s+5\b/, 'The receipt must show the recorded five strikeouts');
        console.log('PASS prop receipt: encoded 5.5 line, one market label, correct losing grade');
      }
      console.log(`PASS ${path}: permanent analysis discovery`);
    }
    const response = await fetch(`${origin}/results.json`, { signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, 200);
    const ledger = await response.json();
    assert.deepEqual(ledger.games.map(row => [row.league, row.result]), [['NFL', 'lost'], ['MLB', 'won']]);
    assert.deepEqual(ledger.props.map(row => [row.line_value, row.result]), [[4.5, 'won'], [5.5, 'lost']]);
    const preflight = await fetch(`${apiUrl}/rest/v1/rpc/your_book_leaderboard_v3`, {
      method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'apikey,authorization,content-type,content-profile,x-client-info' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    for (const header of ['apikey', 'authorization', 'content-type', 'content-profile', 'x-client-info']) {
      assert(preflight.headers.get('access-control-allow-headers')?.split(', ').includes(header),
        `Browser rankings preflight must allow ${header}`);
    }
    const rankingsResponse = await fetch(`${apiUrl}/rest/v1/rpc/your_book_leaderboard_v3`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_window: '7d', p_sort: 'record', p_league: 'NFL' }),
    });
    assert.equal(rankingsResponse.status, 200);
    assert.deepEqual(await rankingsResponse.json(), { rows: [], me: null, qualified_count: 0,
      min_decided: 5, my_decided: 0, has_more: false, window: '7d', sort: 'record', league: 'NFL' });
    assert.deepEqual([...unexpected], [], 'All data requests must have explicit fixtures');
    for (const table of ['daily_picks', 'daily_slate', 'game_results', 'nfl_results', 'prop_results']) {
      assert(observedTables.has(table), `This run's fixture API must receive ${table}; another preview may occupy the port`);
    }
    assert.equal(child.exitCode, null, 'The Next process for this run must still be running');
    assert.equal(child.signalCode, null);
    console.log('PASS /results.json: authoritative NFL + MLB, preseason and legacy NFL excluded');
    console.log('Fixture smoke check passed. Use npm run preview for browser interaction.');
  }
} finally {
  await close();
}
