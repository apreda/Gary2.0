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
const tables = {
  daily_picks: [{ id: 'local-qa', date, picks: [pick] }],
  weekly_nfl_picks: [],
  pick_page_index: [],
  prop_picks: [],
  daily_slate: [{ date, league: 'MLB', away_team: pick.awayTeam, home_team: pick.homeTeam,
    commence_time: pick.commence_time, venue: pick.venue, ml_away: '-110', ml_home: '+100' }],
  game_results: [mlbResult, { ...nflResult, league: 'NFL', result: 'won' }],
  nfl_results: [nflResult, { ...nflResult, matchup: 'Preseason QA game', season_type: 1, result: 'won' }],
  prop_results: [],
  live_scores: [{ date, league: 'MLB', game_id: 'local-qa', away_abbr: 'CHC', home_abbr: 'CIN',
    away_score: 2, home_score: 1, status: 'live', detail: 'TOP 5' }],
};
const unexpected = new Set();
const observedTables = new Set();
const api = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', `http://127.0.0.1:${port}`);
  res.setHeader('Access-Control-Allow-Headers', 'apikey, authorization, content-type, x-client-info');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const url = new URL(req.url, 'http://127.0.0.1');
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
    await Promise.race([stopped, delay(3000)]);
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
    ]) {
      const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(90_000) });
      assert.equal(response.status, 200, `${path} status`);
      const html = await response.text();
      const main = html.match(/<main\b[\s\S]*?<\/main>/)?.[0] ?? '';
      assert(main.includes(expected), `${path} must render fixture content in main`);
      if (path === '/picks') {
        const text = main.replace(/<[^>]+>/g, '');
        assert.match(text, /Yesterday\s*1-1/, 'The rendered Yesterday receipt must count authoritative NFL results');
      }
      console.log(`PASS ${path}: real server-rendered page contains expected content`);
    }
    const response = await fetch(`${origin}/results.json`, { signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, 200);
    const ledger = await response.json();
    assert.deepEqual(ledger.games.map(row => [row.league, row.result]), [['NFL', 'lost'], ['MLB', 'won']]);
    assert.deepEqual(ledger.props, []);
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
