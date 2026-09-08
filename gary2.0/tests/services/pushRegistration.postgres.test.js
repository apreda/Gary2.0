import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let bin = process.env.GARY_TEST_PG_BIN;
if (!bin) { try { bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim(); } catch { bin = ''; } }
const supported = ['initdb', 'pg_ctl', 'psql'].every(name => {
  try { accessSync(path.join(bin, name), constants.X_OK); return !!bin; } catch { return false; }
});
if (!supported && (process.env.CI || process.env.GARY_TEST_PG_BIN)) throw new Error('Push ownership tests require PostgreSQL server tools');
if (!supported) console.warn('Skipping isolated push ownership tests: PostgreSQL server tools unavailable');
const migration = readFileSync(new URL('../../supabase/migrations/20260908041241_authenticated_push_registration.sql', import.meta.url), 'utf8');
const env = { ...process.env, LC_ALL: 'C' };
let directory; let started = false;
const sql = query => execFileSync(path.join(bin, 'psql'), ['-h', directory, '-p', '55472', '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query],
  { env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const owner = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
const device = '20000000-0000-4000-8000-000000000001';
const otherDevice = '20000000-0000-4000-8000-000000000002';
const token = 'fixture-token-' + 'a'.repeat(40);
const nextToken = 'fixture-token-' + 'b'.repeat(40);
const as = (role, query, sub = '') => sql(`set role ${role}; set request.jwt.claim.sub = '${sub}'; ${query}`).split('\n').filter(line => line !== 'SET').join('\n');
const sync = (revision, sub = owner, active = true, target = token, installation = device) =>
  JSON.parse(as(sub ? 'authenticated' : 'anon', `select public.sync_push_registration('${target}','ios','${installation}',${revision},${active});`, sub));
const state = target => JSON.parse(sql(`select jsonb_build_object('identity',identity_id,'active',active,'installation',registration_installation) from public.push_tokens where device_token='${target}';`));

describe.skipIf(!supported)('authenticated push registration on isolated PostgreSQL', () => {
  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'gary-push-ownership-pg-'));
    execFileSync(path.join(bin, 'initdb'), ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale'], { env, stdio: 'pipe' });
    execFileSync(path.join(bin, 'pg_ctl'), ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p 55472`, '-w', 'start'], { env, stdio: 'pipe' });
    started = true;
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values ('${owner}'),('${other}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated,service_role;`);
  }, 30_000);
  afterAll(() => {
    if (started) execFileSync(path.join(bin, 'pg_ctl'), ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop'], { env, stdio: 'ignore' });
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  beforeEach(() => {
    sql(`drop schema if exists push_private cascade;
      drop function if exists public.sync_push_registration(text,text,uuid,bigint,boolean);
      drop function if exists public.register_push_token(text,text,text);
      drop table if exists public.push_tokens;
      create table public.push_tokens(id uuid primary key default gen_random_uuid(),device_token text unique not null,
        platform text not null,active boolean not null default true,identity_id text,
        created_at timestamptz not null default now(),updated_at timestamptz not null default now());
      grant all on public.push_tokens to service_role;
      insert into public.push_tokens(device_token,platform,active,identity_id) values
        ('${token}','ios',true,'${owner}'),('${nextToken}','ios',false,'legacy-installation');`);
    sql(migration);
  });

  it('preserves all legacy tokens and active flags while removing unverifiable identity links', () => {
    expect(sql('select count(*) from public.push_tokens')).toBe('2');
    expect(state(token)).toEqual({ identity: null, active: true, installation: null });
    expect(state(nextToken)).toEqual({ identity: null, active: false, installation: null });
  });

  it.each(['anon', 'authenticated'])('ignores identity spoofing from %s legacy clients and supports two-argument old calls', role => {
    as(role, `select public.register_push_token('${token}','ios','${other}');`, role === 'authenticated' ? owner : '');
    expect(state(token).identity).toBeNull();
    as(role, `select public.register_push_token('${nextToken}','ios');`);
    expect(state(nextToken).active).toBe(true);
    expect(state(nextToken).identity).toBeNull();
  });

  it('links only the authenticated account, explicitly unlinks sign-out, and supports account switch', () => {
    expect(sync(1)).toEqual({ ok: true, applied: true, revision: 1 });
    expect(state(token).identity).toBe(owner);
    sync(2, '');
    expect(state(token)).toEqual({ identity: null, active: true, installation: device });
    sync(3, other);
    expect(state(token).identity).toBe(other);
  });

  it('rejects stale and repeated revisions after a newer sign-out or account switch', () => {
    sync(5); sync(7, '');
    expect(sync(6)).toEqual({ ok: true, applied: false, revision: 7 });
    expect(sync(7)).toEqual({ ok: true, applied: false, revision: 7 });
    expect(state(token).identity).toBeNull();
    sync(8, other);
    expect(sync(5).applied).toBe(false);
    expect(state(token).identity).toBe(other);
  });

  it('serializes a real competing sign-out behind an in-flight account registration', async () => {
    const args = ['-h', directory, '-p', '55472', '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At'];
    const ownerProcess = spawn(path.join(bin, 'psql'), args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const ownerExit = new Promise(resolve => ownerProcess.once('exit', resolve));
    let signoutProcess;
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Registration lock not acquired')), 5000);
        ownerProcess.once('error', reject);
        ownerProcess.stdout.on('data', data => {
          if (data.toString().includes('OWNER_LOCKED')) { clearTimeout(timeout); resolve(); }
        });
        ownerProcess.stdin.write(`begin; set role authenticated; set request.jwt.claim.sub='${owner}';
          select public.sync_push_registration('${token}','ios','${device}',10,true);\n\\echo OWNER_LOCKED\n`);
      });
      signoutProcess = spawn(path.join(bin, 'psql'), [...args, '-c', `set role anon; set request.jwt.claim.sub='';
        select public.sync_push_registration('${token}','ios','${device}',11,true);`], { env, stdio: ['ignore', 'pipe', 'pipe'] });
      let signoutOutput = '';
      signoutProcess.stdout.on('data', data => { signoutOutput += data.toString(); });
      const signoutExit = new Promise((resolve, reject) => {
        signoutProcess.once('error', reject); signoutProcess.once('exit', resolve);
      });
      ownerProcess.stdin.end('commit;\n\\q\n');
      expect(await ownerExit).toBe(0);
      expect(await signoutExit).toBe(0);
      expect(signoutOutput).toContain('"revision": 11');
      expect(state(token).identity).toBeNull();
      expect(sync(10).applied).toBe(false);
    } finally {
      if (ownerProcess.exitCode === null) ownerProcess.kill();
      if (signoutProcess?.exitCode === null) signoutProcess.kill();
    }
  }, 10_000);

  it('deactivates old rotated tokens, clears personal identity on revoked permission, and reactivates explicitly', () => {
    sync(1); sync(2, owner, true, nextToken);
    expect(state(token)).toEqual({ identity: null, active: false, installation: device });
    expect(state(nextToken)).toEqual({ identity: owner, active: true, installation: device });
    sync(3, owner, false, nextToken);
    expect(state(nextToken).active).toBe(false);
    expect(state(nextToken).identity).toBeNull();
    as('anon', `select public.register_push_token('${nextToken}','ios','${owner}')`);
    expect(state(nextToken).active).toBe(false);
    sync(4, owner, true, nextToken);
    expect(state(nextToken).active).toBe(true);
    expect(state(nextToken).identity).toBe(owner);
  });

  it('does not let another installation take a bound token or reactivate a rotated token', () => {
    sync(1); sync(2, owner, true, nextToken);
    expect(() => sync(1, other, true, nextToken, otherDevice)).toThrow(/registration unavailable/);
    expect(state(nextToken).identity).toBe(owner);
    expect(() => sync(3, other, true, token, otherDevice)).toThrow(/registration unavailable/);
    expect(state(token).active).toBe(false);
  });

  it('cannot re-link a deleted account from a still-valid JWT', () => {
    const deleted = '10000000-0000-0000-0000-000000000099';
    sync(1, deleted);
    expect(state(token).identity).toBeNull();
  });

  it.each(['anon', 'authenticated'])('denies %s token enumeration and direct state writes', role => {
    for (const query of ['select * from public.push_tokens', 'update public.push_tokens set active=true',
      'delete from public.push_tokens', 'select * from push_private.push_installations',
      'update push_private.push_installations set latest_revision=0']) {
      expect(() => as(role, query, role === 'authenticated' ? owner : '')).toThrow(/permission denied/);
    }
  });

  it('rejects malformed registrations without changing existing rows or creating installation state', () => {
    for (const args of [`'short','ios','${device}',1,true`, `'${token}','other','${device}',1,true`,
      `'${token}','ios',null,1,true`, `'${token}','ios','${device}',0,true`, `'${token}','ios','${device}',1,null`]) {
      expect(() => as('anon', `select public.sync_push_registration(${args})`)).toThrow(/invalid/);
    }
    expect(sql('select count(*) from push_private.push_installations')).toBe('0');
    expect(state(token).installation).toBeNull();
  });
});
