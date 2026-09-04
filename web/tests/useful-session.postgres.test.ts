import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const env = { ...process.env, LC_ALL: 'C' };
let bin = process.env.GARY_TEST_PG_BIN ?? '';
if (!bin) { try { bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); } catch { /* optional local test runtime */ } }
let supported = true;
try { for (const name of ['initdb','pg_ctl','psql']) accessSync(path.join(bin, name), constants.X_OK); } catch { supported = false; }
if (!supported && (process.env.GARY_TEST_PG_BIN || process.env.CI)) throw new Error('Isolated Postgres required: set GARY_TEST_PG_BIN.');
let directory = ''; let started = false;
const sql = (source: string) => execFileSync(`${bin}/psql`, ['-h', directory, '-p', '55441', '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', source], { env, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
const identity = 'c53b8823-9e0f-40a3-8f17-685c3f19496d';
const session = 'c53b8823-9e0f-40a3-8f17-685c3f19496e';
const log = (event: string, props: Record<string, unknown>) => sql(`SET ROLE service_role; SELECT public.log_web_event('${event}', '${identity}', '${'a'.repeat(64)}', '${JSON.stringify(props).replaceAll("'", "''")}'::jsonb);`);
describe.skipIf(!supported)('useful session writer on isolated Postgres', () => {
  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'gary-web-funnel-pg-'));
    execFileSync(`${bin}/initdb`, ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale'], { env, stdio: 'pipe' });
    execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p 55441`, '-w', 'start'], { env, stdio: 'pipe' }); started = true;
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA cron; CREATE TABLE cron.job(jobid bigint,jobname text);
      CREATE FUNCTION cron.unschedule(bigint) RETURNS boolean LANGUAGE sql AS 'SELECT true';
      CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS 'SELECT 1::bigint';`);
    for (const name of ['20260903180543_web_growth_measurement.sql', '20260904225312_web_useful_session_funnel.sql']) {
      sql(readFileSync(new URL(`../../gary2.0/supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
  }, 30000);
  afterAll(() => {
    if (started) execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop'], { env, stdio: 'ignore' });
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  beforeEach(() => sql('TRUNCATE public.web_events, public.web_ingest_rate_limits RESTART IDENTITY;'));
  it('denies anonymous/authenticated reads and writes while allowing service ingestion', () => {
    expect(() => sql('SET ROLE anon; SELECT count(*) FROM public.web_events;')).toThrow();
    expect(() => sql(`SET ROLE authenticated; SELECT public.log_web_event('session_started','${identity}','${'a'.repeat(64)}','{}');`)).toThrow();
    expect(log('session_started', { session_id: session, path: '/today' })).toContain('t');
    expect(sql('SET ROLE service_role; SELECT count(*) FROM public.web_events;')).toContain('1');
  });
  it('is idempotent per session and game, retaining distinct games, sessions and legacy rows', () => {
    const props = { session_id: session, path: '/today', latest_source: 'x', latest_content: 'launch_card' };
    log('session_started', props); log('session_started', props);
    const read = { session_id: session, path: '/picks/mlb/2026-09-04/nyy-bal', content_type: 'pick', measurement_version: 'reasoning_v2' };
    log('meaningful_pick_view', read); log('meaningful_pick_view', read);
    log('meaningful_pick_view', { ...read, path: '/picks/mlb/2026-09-04/bos-tex' });
    log('session_started', { ...props, session_id: identity });
    log('meaningful_pick_view', { path: read.path, content_type: 'pick' });
    log('return_visit', { session_id: identity, path: '/today', days_since_last_visit: 1 });
    log('return_visit', { session_id: identity, path: '/picks', days_since_last_visit: 1 });
    expect(sql('SELECT count(*) FROM public.web_events;')).toBe('6');
  });
  it('rejects missing sessions, unsafe creative fields and private account data', () => {
    expect(() => log('session_started', { path: '/today' })).toThrow();
    expect(() => log('session_started', { session_id: 'not-a-uuid', path: '/today' })).toThrow();
    expect(() => log('session_started', { session_id: session, path: '/today', latest_content: 'fan@example.com' })).toThrow();
    expect(() => log('session_started', { session_id: session, path: '/today', account_id: identity })).toThrow();
    expect(sql('SELECT count(*) FROM public.web_events;')).toBe('0');
  });
});
