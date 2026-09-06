import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
  try { accessSync(path.join(bin || '', name), constants.X_OK); return !bin; }
  catch { return true; }
});
const supported = missing.length === 0;
if (!supported) {
  const message = `Legacy user privacy tests require PostgreSQL: ${missing.join(', ')}. Set GARY_TEST_PG_BIN.`;
  if (process.env.GARY_TEST_PG_BIN || ['true', '1'].includes(process.env.CI)) throw new Error(message);
  console.warn(`Skipping: ${message}`);
}
let directory, started = false;
const sql = query => execFileSync(`${bin}/psql`, ['-h', directory, '-p', '55446', '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query],
  { env: pgEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const owner = '10000000-0000-0000-0000-000000000001';
const stranger = '10000000-0000-0000-0000-000000000003';
const as = (role, query, sub = owner) => sql(`set role ${role}; set request.jwt.claim.sub = '${sub}'; ${query}`).split('\n').filter(line => line !== 'SET').join('\n');
const migration = readFileSync(new URL('../../supabase/migrations/20260906134536_restrict_legacy_user_reads.sql', import.meta.url), 'utf8');

describe.skipIf(!supported)('legacy account privacy on isolated PostgreSQL', () => {
  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'gary-user-privacy-pg-'));
    execFileSync(`${bin}/initdb`, ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale'], { env: pgEnv, stdio: 'pipe' });
    execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p 55446`, '-w', 'start'], { env: pgEnv, stdio: 'pipe' });
    started = true;
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
      grant usage on schema auth to anon, authenticated, service_role;
      create table public.users(id uuid primary key, email text, plan text);
      insert into public.users values ('${owner}','owner@example.invalid','free'),('10000000-0000-0000-0000-000000000002','other@example.invalid','member');
      alter table public.users enable row level security;
      grant all on public.users to anon, authenticated, service_role;
      create policy "Allow read access to all users" on public.users for select using (true);
      create policy "Users can view their own data" on public.users for select using (auth.uid()=id);`);
    expect(as('anon', 'select count(*) from public.users')).toBe('2');
    sql(`begin; ${migration} commit;`);
  }, 30000);
  afterAll(() => {
    if (started) execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop'], { env: pgEnv, stdio: 'ignore' });
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  it('denies anonymous account reads', () => {
    expect(() => as('anon', 'select email from public.users')).toThrow(/permission denied for table users/);
  });
  it('allows only the signed-in owner and returns nothing for another identity', () => {
    expect(as('authenticated', 'select email from public.users')).toBe('owner@example.invalid');
    expect(as('authenticated', 'select count(*) from public.users', stranger)).toBe('0');
  });
  for (const role of ['anon', 'authenticated']) {
    for (const [operation, statement] of [
      ['insert', `insert into public.users values ('${stranger}','new@example.invalid','member')`],
      ['update', "update public.users set plan='member'"],
      ['delete', 'delete from public.users'],
      ['truncate', 'truncate public.users'],
    ]) it(`denies ${role} ${operation}`, () => {
      expect(() => as(role, statement)).toThrow(/permission denied for table users/);
    });
  }
  it('preserves the backend service role access', () => {
    expect(as('service_role', 'select count(*) from public.users')).toBe('2');
    expect(as('service_role', "begin; update public.users set plan='fixture' returning plan; rollback;")).toContain('fixture');
  });
});
