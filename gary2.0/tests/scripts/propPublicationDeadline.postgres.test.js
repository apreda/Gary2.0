import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync, execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const run = promisify(execFile);
const pgEnv = { ...process.env, LC_ALL: 'C' };
let bin = process.env.GARY_TEST_PG_BIN;
if (!bin) {
  try { bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim(); }
  catch { bin = ''; }
}
const missing = ['initdb', 'pg_ctl', 'psql', 'postgres'].filter(name => {
  if (!bin) return true;
  try { accessSync(path.join(bin, name), constants.X_OK); return false; } catch { return true; }
});
const supported = missing.length === 0;
if (!supported && (process.env.GARY_TEST_PG_BIN || ['true', '1'].includes(process.env.CI))) throw new Error('Isolated PostgreSQL binaries required for prop publication contract');
if (!supported) console.warn('Skipping prop publication database contract: PostgreSQL binaries unavailable');
let directory; let started = false;
const args = () => ['-h', directory, '-p', '55441', '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = text => execFileSync(`${bin}/psql`, [...args(), '-c', text], { env: pgEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const ticket = (extra = {}, start = '2099-08-15T23:00:00Z') => ({ sport: 'MLB', game_id: '99', player: 'Fixture Player', prop: 'hits 0.5', bet: 'over', line: '0.5', odds: '-110', rationale: 'Original published reasoning', commence_time: start, ...extra });
const escaped = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const publish = (picks, { replace = [], sport = 'MLB' } = {}) => `SELECT public.upsert_prop_picks_atomic('2099-08-15','${sport}',${escaped(picks)},${escaped(replace)});`;

// This database exists only in a private temporary Unix socket directory. It
// never loads app credentials, connects to Supabase, or touches production picks.
describe.skipIf(!supported)('prop publication deadline on isolated PostgreSQL', () => {
  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'gary-prop-deadline-pg-'));
    execFileSync(`${bin}/initdb`, ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale'], { env: pgEnv, stdio: 'pipe' });
    execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p 55441`, '-w', 'start'], { env: pgEnv, stdio: 'pipe' });
    started = true;
    sql('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE TABLE public.prop_picks(date text PRIMARY KEY,picks jsonb,created_at timestamptz,updated_at timestamptz); GRANT ALL ON public.prop_picks TO service_role;');
    sql(readFileSync(new URL('../../supabase/migrations/20260908025501_enforce_prop_publication_deadline.sql', import.meta.url), 'utf8'));
  }, 30000);
  afterAll(() => {
    if (started) execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop'], { env: pgEnv, stdio: 'ignore' });
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  beforeEach(() => sql('TRUNCATE public.prop_picks;'));

  it('allows service publication and preserves the original snapshot on a duplicate', () => {
    const original = ticket();
    expect(JSON.parse(sql('SET ROLE service_role; ' + publish([original])).split('\n').pop())).toMatchObject({ added: 1, skipped: 0 });
    expect(JSON.parse(sql(publish([ticket({ rationale: 'Changed incoming text', odds: '-120' })])))).toMatchObject({ added: 0, skipped: 1 });
    expect(JSON.parse(sql('SELECT picks FROM public.prop_picks;'))).toEqual([original]);
  });

  it.each([null, 'not-a-date', '2099-08-15T23:00:00', '2020-08-15T23:00:00Z'])('rejects missing/invalid/expired commence_time %s before changing the ledger', commence_time => {
    expect(() => sql(publish([ticket({ commence_time })]))).toThrow();
    expect(sql('SELECT count(*) FROM public.prop_picks;')).toBe('0');
  });

  it('rolls back an expired forced replacement and its sibling additions', () => {
    const original = ticket();
    sql(publish([original]));
    expect(() => sql(publish([ticket({ rationale: 'Replacement' }, '2020-08-15T23:00:00Z'), ticket({ game_id: '100' })], { replace: ['99'] }))).toThrow();
    expect(JSON.parse(sql('SELECT picks FROM public.prop_picks;'))).toEqual([original]);
  });

  it('uses the actual wall clock after waiting for the date lock', async () => {
    const holder = spawn(`${bin}/psql`, args(), { env: pgEnv });
    let stdout = '';
    holder.stdin.write("BEGIN;\nSELECT pg_advisory_xact_lock(hashtextextended('prop_picks|2099-08-15',0));\nSELECT 'LOCKED';\n");
    const finished = new Promise((resolve, reject) => { holder.once('error', reject); holder.once('exit', code => code === 0 ? resolve() : reject(new Error(`Lock holder exit ${code}`))); });
    await new Promise((resolve, reject) => {
      holder.stdout.on('data', chunk => { stdout += chunk; if (stdout.includes('LOCKED')) resolve(); });
      holder.once('error', reject);
    });
    holder.stdin.end('SELECT pg_sleep(1.2);\nCOMMIT;\n');
    const imminent = ticket({}, new Date(Date.now() + 500).toISOString());
    await expect(run(`${bin}/psql`, [...args(), '-c', 'SET ROLE service_role; ' + publish([imminent])], { env: pgEnv })).rejects.toThrow(/has started/);
    await finished;
    expect(sql('SELECT count(*) FROM public.prop_picks;')).toBe('0');
  });

  it('keeps concurrent pregame siblings and NCAAF TD preservation behavior', async () => {
    await Promise.all(['99', '100'].map(game_id => run(`${bin}/psql`, [...args(), '-c', publish([ticket({ game_id })])], { env: pgEnv })));
    expect(sql('SELECT jsonb_array_length(picks) FROM public.prop_picks;')).toBe('2');
    sql('TRUNCATE public.prop_picks;');
    const td = ticket({ sport: 'NCAAF', prop: 'anytime_touchdown 0.5', td_category: 'standard' });
    sql(publish([td], { sport: 'NCAAF' }));
    sql(publish([ticket({ sport: 'NCAAF', prop: 'rushing_yards 50.5', line: '50.5' })], { sport: 'NCAAF', replace: ['99'] }));
    expect(JSON.parse(sql('SELECT picks FROM public.prop_picks;'))).toContainEqual(td);
  });

  it('retains service-only invoker permissions', () => {
    for (const role of ['anon', 'authenticated']) expect(() => sql(`SET ROLE ${role}; ` + publish([ticket()]))).toThrow();
    expect(sql("SELECT prosecdef FROM pg_proc WHERE proname='upsert_prop_picks_atomic';")).toBe('f');
  });
});
