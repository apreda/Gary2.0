/** Real production build + ISR under a local database outage. No app credentials. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const source = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'gary-sitemap-isr-'));
const web = join(temp, 'web');
const children = new Set();
const failures = new Map();
let available = false;
let version = 1;
let log = '';
const date = '2026-09-01';
const api = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const table = url.pathname.split('/').at(-1);
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') { res.writeHead(405).end('{}'); return; }
  if (!available) {
    failures.set(table, (failures.get(table) ?? 0) + 1);
    res.writeHead(503).end(JSON.stringify({ code: 'PGRST002', message: 'Fixture database outage' }));
    return;
  }
  const dates = version === 1 ? [date] : ['2026-09-02', date];
  const rows = table === 'archive_day_index'
    ? dates.map(date => ({ date, game_count: 2, prop_count: 0, research_count: 0 }))
    : table === 'pick_page_index'
      ? dates.map(date => ({ date, league: 'MLB', sport: null, away_team: 'Cubs', home_team: 'Reds' }))
      : [];
  const offset = Number(url.searchParams.get('offset') ?? 0);
  res.end(JSON.stringify(rows.slice(offset, offset + 1000)));
});

function run(args, env) {
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), ...args], {
    cwd: web, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  const done = once(child, 'exit');
  child.once('exit', () => children.delete(child));
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  return { child, done };
}

try {
  cpSync(source, web, { recursive: true, filter: path => !relative(source, path).split(sep).some(part =>
    ['node_modules', '.next', '.vercel', '.git', 'coverage', '.DS_Store'].includes(part) || part.startsWith('.env')) });
  symlinkSync(join(source, 'node_modules'), join(web, 'node_modules'), 'dir');
  // Only shorten time in the disposable copy. Production's ten-minute XML
  // interval and per-query data intervals are unchanged by this test.
  const route = join(web, 'app/sitemap-data/[inventory]/route.ts');
  const routeSource = readFileSync(route, 'utf8');
  assert(routeSource.includes('export const revalidate = 600;'));
  writeFileSync(route, routeSource.replace('export const revalidate = 600;', 'export const revalidate = 1;'));
  const rest = join(web, 'lib/gary/supabase.ts');
  const restSource = readFileSync(rest, 'utf8');
  assert(restSource.includes('opts.revalidate ?? 600'));
  writeFileSync(rest, restSource.replace('opts.revalidate ?? 600', '1'));
  // Next's supported font test hook keeps this database regression independent
  // of Google Fonts availability. Font rendering is outside this test's scope.
  const fontMock = join(temp, 'font-responses.cjs');
  writeFileSync(fontMock, `module.exports = new Proxy({}, { get: () => ${JSON.stringify("/* latin */\n@font-face { font-family: 'Fixture'; font-style: normal; font-weight: 100 900; src: url(https://fonts.gstatic.com/fixture.woff2) format('woff2'); }")} });`);

  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const apiUrl = `http://127.0.0.1:${api.address().port}`;
  const portProbe = createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'LANG', 'TERM']
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  Object.assign(env, {
    NEXT_PUBLIC_SUPABASE_URL: apiUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon-key',
    NEXT_TELEMETRY_DISABLED: '1', GARY_FIXTURE_ORIGIN: origin,
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontMock,
    NODE_OPTIONS: `--import=${new URL('./fixture-fetch-guard.mjs', import.meta.url).href}`,
  });
  console.log('Building the full web app with every database request returning 503…');
  const build = run(['build', '--webpack'], env);
  const [code] = await build.done;
  assert.equal(code, 0, `Production build must survive database downtime.\n${log.slice(-16000)}`);
  const manifest = JSON.parse(readFileSync(join(web, '.next/prerender-manifest.json'), 'utf8'));
  assert(manifest.dynamicRoutes['/sitemap-data/[inventory]'], 'Inventories must retain runtime ISR');
  assert.equal(Object.keys(manifest.routes).filter(path => path.startsWith('/sitemap-data/')).length, 0,
    'No database inventory may be generated at build time');
  console.log('PASS production build during database outage; inventories deferred to runtime');
  const server = run(['start', '--hostname', '127.0.0.1', '--port', String(port)], env);
  for (let attempt = 0; ; attempt++) {
    assert(attempt < 100 && server.child.exitCode === null, 'Next server did not start');
    try { if ((await fetch(`${origin}/sitemap.xml`)).ok) break; } catch { /* Starting. */ }
    await delay(100);
  }
  const paths = ['/archive/sitemap.xml', '/sitemap-index.xml', '/picks/sitemap/0.xml'];
  const get = async path => {
    const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(15000) });
    return { status: response.status, body: await response.text() };
  };
  for (const path of paths) assert((await get(path)).status >= 500, `${path}: cold outage cannot publish empty XML`);
  console.log('PASS cold outage returns errors, never a successful empty inventory');
  available = true;
  const lastGood = new Map();
  for (const path of paths) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert(response.body.includes('<loc>https://www.betwithgary.ai/'), path);
    if (path !== '/sitemap-index.xml') assert(response.body.includes(date), path);
    lastGood.set(path, response.body);
  }
  assert.equal((await get('/archive/inventory.xml')).body, lastGood.get('/archive/sitemap.xml'));
  assert.equal((await get('/sitemap-data/games--1')).status, 404);
  console.log('PASS all public sitemap URLs recover and contain real fixture dates');
  const archivePage = await get('/archive');
  assert.equal(archivePage.status, 200);
  assert(archivePage.body.includes(`/archive/${date}`), 'Archive page must render stored data at request time');
  available = false;
  failures.clear();
  await delay(1300);
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const path of paths) {
      const response = await get(path);
      assert.equal(response.status, 200, `${path}: warm outage status`);
      assert.equal(response.body, lastGood.get(path), `${path}: warm outage must retain last-good XML`);
    }
    await delay(1100);
  }
  assert(failures.has('archive_day_index') && failures.has('pick_page_index'), 'Must actually attempt failed regenerations');
  const staleArchivePage = await get('/archive');
  assert.equal(staleArchivePage.status, 200);
  assert(staleArchivePage.body.includes(`/archive/${date}`), 'Dynamic pages must retain cached data during outages');
  console.log('PASS failed ISR regenerations preserve last-good archive, index and game XML');
  available = true;
  version = 2;
  for (const path of [paths[0], paths[2]]) {
    let recovered = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await get(path);
      if (response.status === 200 && response.body.includes('2026-09-02')) { recovered = true; break; }
      await delay(1100);
    }
    assert(recovered, `${path}: must publish new dates after database recovery`);
  }
  console.log('PASS successful regeneration publishes new archive and game dates after recovery');
} catch (error) {
  console.error(log.slice(-16000));
  throw error;
} finally {
  for (const child of children) child.kill('SIGTERM');
  await Promise.all([...children].map(child => Promise.race([once(child, 'exit'), delay(3000)])));
  for (const child of children) child.kill('SIGKILL');
  api.closeAllConnections();
  await new Promise(resolve => api.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
