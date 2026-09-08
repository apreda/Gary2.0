import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
if (!supported && (process.env.GARY_TEST_PG_BIN || ['true', '1'].includes(process.env.CI))) throw new Error('Isolated PostgreSQL binaries required for cache cron contract');
if (!supported) console.warn('Skipping cache cron database contract: PostgreSQL binaries unavailable');
let directory; let started = false;
const args = () => ['-h', directory, '-p', '55460', '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = text => execFileSync(`${bin}/psql`, [...args(), '-c', text], { env: pgEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

const migration = readFileSync(new URL('../../supabase/migrations/20260908191550_licensed_mlb_live_batting.sql', import.meta.url), 'utf8');
const rows = () => JSON.parse(sql('SELECT json_agg(j ORDER BY jobid) FROM cron.job j;'));
function cleanup() {
  try {
    if (started) execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop'], { env: pgEnv, stdio: 'ignore', timeout: 7000 });
  } finally {
    started = false;
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
}

describe.skipIf(!supported)('licensed batting cache on isolated PostgreSQL', () => {
  beforeAll(() => {
    directory = mkdtempSync('/tmp/gary-mlb-batting-pg-');
    try {
      execFileSync(`${bin}/initdb`, ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale', '--no-sync'], { env: pgEnv, stdio: 'pipe', timeout: 20000 });
      execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p 55460 -c shared_buffers=8MB -c max_connections=20`, '-w', 'start'], { env: pgEnv, stdio: 'pipe', timeout: 15000 });
      started = true;
      sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
        CREATE SCHEMA cron; CREATE SCHEMA vault; CREATE SCHEMA net;
        CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY, jobname text UNIQUE, schedule text, active boolean DEFAULT true, command text);
        CREATE TABLE vault.decrypted_secrets(name text PRIMARY KEY, decrypted_secret text);
        CREATE TABLE net.requests(url text, body jsonb, headers jsonb, timeout_milliseconds integer);
        CREATE FUNCTION cron.schedule(jobname text,schedule text,command text) RETURNS bigint LANGUAGE SQL AS 'INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) RETURNING jobid';
        CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) RETURNS bigint LANGUAGE SQL AS 'INSERT INTO net.requests VALUES($1,$3,$2,$4); SELECT 1::bigint';
        INSERT INTO vault.decrypted_secrets VALUES('GARY_CRON_SERVICE_ROLE_KEY','fixture-service');`);
      sql(migration);
    } catch (error) { cleanup(); throw error; }
  }, 60000);
  afterAll(cleanup);
  beforeEach(() => sql('TRUNCATE public.mlb_live_batting, net.requests;'));

  const publish = (at, final, hits = 1) => `select public.publish_mlb_live_batting('2026-09-08','99','${at}',${final},'[{"name":"Fixture","hits":${hits}}]');`;
  it('exposes read-only facts while restricting writes and publication to the service', () => {
    expect(sql('SET ROLE service_role; ' + publish('2026-09-08T18:00:00Z', false))).toContain('t');
    for (const role of ['anon', 'authenticated']) {
      expect(sql(`SET ROLE ${role}; SELECT count(*) FROM public.mlb_live_batting;`)).toContain('1');
      expect(() => sql(`SET ROLE ${role}; DELETE FROM public.mlb_live_batting;`)).toThrow();
      expect(() => sql(`SET ROLE ${role}; ` + publish('2026-09-08T19:00:00Z', true))).toThrow();
    }
    expect(sql("SELECT relrowsecurity FROM pg_class WHERE oid='public.mlb_live_batting'::regclass;")).toBe('t');
  });
  it('rejects stale completions and never demotes a reconciled final', () => {
    expect(sql(publish('2026-09-08T18:00:00Z', false))).toBe('t');
    expect(sql(publish('2026-09-08T17:00:00Z', false, 0))).toBe('f');
    expect(sql(publish('2026-09-08T19:00:00Z', true, 2))).toBe('t');
    expect(sql(publish('2026-09-08T20:00:00Z', false, 1))).toBe('f');
    expect(sql("SELECT lines->0->>'hits' FROM public.mlb_live_batting;")).toBe('2');
  });
  it('enforces exact numeric game IDs and bounded array payloads', () => {
    expect(() => sql(publish('2026-09-08T18:00:00Z', false).replace("'99'","'bad'"))).toThrow();
    expect(() => sql("SELECT public.publish_mlb_live_batting('2026-09-08','99',now(),false,'{}');")).toThrow();
    expect(() => sql("SELECT public.publish_mlb_live_batting('2026-09-08','99',now(),false,(SELECT jsonb_agg(n) FROM generate_series(1,101) n));")).toThrow();
  });
  it('records schedules without sending HTTP and reads the Vault key only when run', () => {
    const jobs = rows();
    const refresh = jobs.find(j => j.jobname === 'mlb-live-batting-1min');
    expect(refresh.schedule).toBe('* * * * *');
    expect(refresh.command).not.toContain('fixture-service');
    expect(sql('SELECT count(*) FROM net.requests;')).toBe('0');
    sql(refresh.command);
    const request = JSON.parse(sql('SELECT row_to_json(r) FROM net.requests r;'));
    expect(request.url).toBe('https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/mlb-live-batting');
    expect(request.headers.Authorization).toBe('Bearer fixture-service');
    expect(request.timeout_milliseconds).toBe(60000);
  });
  it('prunes only expired factual cache rows', () => {
    sql("INSERT INTO public.mlb_live_batting(date,game_id,is_final,fetched_at,lines) VALUES ((now() at time zone 'America/New_York')::date-4,'1',true,now(),'[]'),((now() at time zone 'America/New_York')::date,'2',false,now(),'[]');");
    sql(rows().find(j => j.jobname === 'mlb-live-batting-retention').command);
    expect(sql('SELECT game_id FROM public.mlb_live_batting;')).toBe('2');
  });
});
