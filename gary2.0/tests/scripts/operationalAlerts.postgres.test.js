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
if (!supported && (process.env.GARY_TEST_PG_BIN || ['true', '1'].includes(process.env.CI))) throw new Error('Isolated PostgreSQL binaries required for operational alerts contract');
if (!supported) console.warn('Skipping operational alerts database contract: PostgreSQL binaries unavailable');
let directory; let started = false;
const args = () => ['-h', directory, '-p', '55468', '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = text => execFileSync(`${bin}/psql`, [...args(), '-c', text], { env: pgEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

function startPostgres() {
  execFileSync(`${bin}/pg_ctl`, ['-D',`${directory}/data`,'-l',`${directory}/server.log`,'-o',`-k ${directory} -h '' -p 55468 -c shared_buffers=8MB`,'-w','start'], {env:pgEnv,stdio:'pipe',timeout:15000});
  started = true;
}

function cleanup() {
  try {
    if (started) execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop'], { env: pgEnv, stdio: 'ignore', timeout: 7000 });
  } finally {
    started = false;
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
}

const migration = readFileSync(new URL('../../supabase/migrations/20260916184819_operational_failure_email_alerts.sql', import.meta.url), 'utf8');
const observe = (rows, source='fixture') => sql(`select gary_ops.observe('${source}', '${JSON.stringify(rows).replaceAll("'", "''")}'::jsonb);`);
describe.skipIf(!supported)('operational alert delivery on isolated PostgreSQL', () => {
  beforeAll(() => {
    directory = mkdtempSync('/tmp/gary-ops-pg-');
    execFileSync(`${bin}/initdb`, ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale', '--no-sync'], {env:pgEnv,stdio:'pipe'});
    startPostgres();
    sql(`create role anon; create role authenticated; create role service_role;
      create schema cron; create schema net; create schema vault;
      create table cron.job(jobid bigint generated always as identity primary key, jobname text unique, schedule text, active boolean default true, command text);
      create table cron.job_run_details(jobid bigint, start_time timestamptz, status text);
      create function cron.alter_job(job_id bigint,command text) returns void language sql as 'update cron.job set command=$2 where jobid=$1';
      create function cron.schedule(jobname text,schedule text,command text) returns bigint language sql as 'insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid';
      create table vault.secrets(id uuid default gen_random_uuid(),name text,secret text);
      create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
      create function vault.create_secret(s text,n text) returns uuid language sql as 'insert into vault.secrets(name,secret) values($2,$1) returning id';
      create function vault.update_secret(i uuid,s text) returns void language sql as 'update vault.secrets set secret=$2 where id=$1';
      create unlogged table net.requests(id bigint generated always as identity primary key,url text,headers jsonb,body jsonb,timeout_milliseconds integer);
      create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.requests(url,headers,body,timeout_milliseconds) values($1,$2,$3,$4) returning id';
      create unlogged table net._http_response(id bigint,status_code integer,content text,timed_out boolean default false);
      create table public.social_publication_intents(publication_key text,state text,updated_at timestamptz);
      insert into cron.job(jobname,schedule,command) values('social-auto-post-hourly','*/15 * * * *','old');
      insert into vault.secrets(name,secret) values('GARY_CRON_SERVICE_ROLE_KEY','fixture-service');`);
    sql(migration);
    sql(readFileSync(new URL('../../supabase/migrations/20260916184953_activate_operational_email_control.sql', import.meta.url), 'utf8'));
    sql(readFileSync(new URL('../../supabase/migrations/20260919213333_align_social_request_lifetime_with_pg_net.sql', import.meta.url), 'utf8'));
  },30000);
  afterAll(cleanup);
  beforeEach(() => {
    sql(`truncate gary_ops.settings,gary_ops.host,gary_ops.incidents,gary_ops.events,gary_ops.mail,gary_ops.social_requests,net.requests,net._http_response,cron.job_run_details,public.social_publication_intents;
      delete from vault.secrets where name='GARY_OPS_RESEND_KEY';
      select public.configure_operational_email('fixture-email-key','owner@example.test','Gary <alerts@example.test>');
      update gary_ops.settings set enabled=true,enabled_at=now();
      insert into gary_ops.host values(true,now(),now());
      insert into cron.job_run_details select jobid,now(),'succeeded' from cron.job where jobname='social-auto-post-hourly';`);
  });
  it('enables once, records one connection test, and supports disabling sends', () => {
    sql('update gary_ops.settings set enabled=false; select public.set_operational_email_enabled(true); select public.set_operational_email_enabled(true)');
    expect(sql("select count(*) from gary_ops.events where kind='test'")).toBe('1');
    sql('select public.set_operational_email_enabled(false); select gary_ops.tick()');
    expect(sql('select count(*) from net.requests')).toBe('0');
  });
  it('deduplicates repeated incidents, announces recovery once, and reopens a later failure', () => {
    const problem = [{key:'props:1',title:'Props A @ B',detail:'Auth failed'}];
    observe(problem); observe(problem);
    expect(sql('select count(*) from gary_ops.events')).toBe('1');
    observe([]); observe([]);
    expect(sql("select string_agg(kind,',' order by id) from gary_ops.events")).toBe('failure,recovery');
    observe(problem);
    expect(sql('select count(*) from gary_ops.events')).toBe('3');
  });
  it('keeps prior incidents open when collection fails or the calendar rolls over', () => {
    observe([{key:'a',title:'Failed',detail:'test'}],'local:old');
    sql("select gary_ops.observe('local:old','[]',false)");
    observe([],'local:new');
    expect(sql('select count(*) from gary_ops.incidents where resolved_at is null')).toBe('1');
  });
  it('blocks public callers from configuration, ingestion, private state and ticks', () => {
    for (const role of ['anon','authenticated']) {
      for (const query of ["select public.configure_operational_email('fakefakefakefake','x@y.z','x@y.z')", "select public.report_operational_health('2026-09-16',now(),'[]',true)", 'select * from gary_ops.mail','select gary_ops.tick()', 'select public.set_operational_email_enabled(true)']) {
        expect(() => sql(`set role ${role}; ${query};`)).toThrow();
      }
    }
    expect(sql("select has_function_privilege('service_role','public.report_operational_health(text,timestamptz,jsonb,boolean)','execute')")).toBe('t');
  });
  it('is silent when healthy, preserves X cadence and tracks gateway failures without requiring JSON', () => {
    sql('select gary_ops.tick()');
    expect(sql('select count(*) from net.requests')).toBe('0');
    expect(sql("select schedule from cron.job where jobname='social-auto-post-hourly'")).toBe('*/15 * * * *');
    sql('select gary_ops.enqueue_social()');
    sql("insert into net._http_response select id,502,'bad gateway',false from net.requests");
    sql('select gary_ops.tick()');
    expect(sql("select count(*) from gary_ops.incidents where source='cloud:social' and resolved_at is null")).toBe('1');
    expect(sql("select count(*) from net.requests where url='https://api.resend.com/emails'")).toBe('1');
    sql('select gary_ops.tick()');
    expect(sql("select count(*) from net.requests where url='https://api.resend.com/emails'")).toBe('1');
  });
  it('catches timeouts, missing host heartbeats, and stale unresolved X receipts', () => {
    sql("insert into gary_ops.social_requests(id,created_at) values(333,now()-interval '4 minutes'); update gary_ops.host set received_at=now()-interval '6 minutes'; insert into public.social_publication_intents values('game:1','sending_root',now()-interval '10 minutes'); select gary_ops.tick()");
    expect(sql('select count(*) from gary_ops.incidents where resolved_at is null')).toBe('3');
    expect(sql('select count(*) from gary_ops.mail')).toBe('1');
  });
  it('retries the identical email key/payload, records acceptance, and stays quiet afterwards', () => {
    observe([{key:'a',title:'Failed',detail:'test'}]);
    sql('select gary_ops.tick()');
    const first = JSON.parse(sql('select row_to_json(r) from net.requests r'));
    sql("update gary_ops.mail set attempted_at=now()-interval '6 minutes'; select gary_ops.tick()");
    const last = JSON.parse(sql('select row_to_json(r) from net.requests r order by id desc limit 1'));
    expect(last.headers).toEqual(first.headers);
    expect(last.body).toEqual(first.body);
    sql(`insert into net._http_response values(${last.id},200,'{"id":"delivered-fixture"}',false); select gary_ops.tick(); select gary_ops.tick()`);
    expect(sql('select provider_id from gary_ops.mail')).toBe('delivered-fixture');
    expect(sql('select count(*) from net.requests')).toBe('2');
  });
  it('stops ambiguous delivery before the 24-hour idempotency window expires', () => {
    observe([{key:'a',title:'Failed',detail:'test'}]);
    sql("select gary_ops.tick(); update gary_ops.mail set first_sent_at=now()-interval '24 hours',attempted_at=now()-interval '6 minutes'; select gary_ops.tick()");
    expect(sql('select stopped from gary_ops.mail')).toBe('t');
    expect(sql('select count(*) from net.requests')).toBe('1');
  });
  it('can schedule again after crash recovery reuses a pg_net request number', () => {
    sql('truncate net.requests restart identity');
    const originalId = sql('select gary_ops.enqueue_social()');
    sql(`insert into net._http_response values(${originalId},502,'old response',false);
      insert into public.social_publication_intents values('existing-pick','completed',now());`);
    observe([{key:'existing-incident',title:'Existing incident',detail:'Keep durable history'}]);
    sql('checkpoint');

    // Crash only this isolated fixture database, matching pg_net's actual
    // queue/sequence reset. Never restart the production database for this test.
    execFileSync(`${bin}/pg_ctl`, ['-D',`${directory}/data`,'-m','immediate','-w','stop'], {env:pgEnv,stdio:'pipe',timeout:7000});
    started = false;
    startPostgres();

    expect(sql('select count(*) from net._http_response')).toBe('0');
    expect(sql('select count(*) from gary_ops.social_requests')).toBe('0');
    expect(sql('select count(*) from public.social_publication_intents')).toBe('1');
    expect(sql('select count(*) from gary_ops.events')).toBe('1');
    const nextId = sql('select gary_ops.enqueue_social()');
    expect(nextId).toBe(originalId);
    expect(sql('select count(*) from net.requests')).toBe('1');
    sql(`insert into net._http_response values(${nextId},200,'{"health":{"status":"ok"}}',false); select gary_ops.tick()`);
    expect(sql('select count(*) from gary_ops.social_requests where checked_at is not null')).toBe('1');
    expect(sql("select count(*) from gary_ops.incidents where source='cloud:social' and resolved_at is null")).toBe('0');
  },30000);
});
