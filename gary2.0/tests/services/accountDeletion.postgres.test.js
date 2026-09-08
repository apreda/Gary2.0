import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const pgEnv = { ...process.env, LC_ALL: 'C' };
let bin = process.env.GARY_TEST_PG_BIN;
if (!bin) {
  try { bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim(); }
  catch { bin = ''; }
}
const missing = ['initdb', 'pg_ctl', 'psql', 'postgres'].filter(name => {
  try { accessSync(path.join(bin || '', name), constants.X_OK); return !bin; } catch { return true; }
});
const supported = missing.length === 0;
if (!supported) {
  const message = `Account deletion tests need PostgreSQL: ${missing.join(', ')}. Set GARY_TEST_PG_BIN.`;
  if (process.env.GARY_TEST_PG_BIN || ['true', '1'].includes(process.env.CI)) throw new Error(message);
  console.warn(`Skipping: ${message}`);
}
const migration = readFileSync(new URL('../../supabase/migrations/20260908132857_delete_legacy_account_identity.sql', import.meta.url), 'utf8');
const original = readFileSync(new URL('../../supabase/migrations/20260904212639_complete_account_deletion.sql', import.meta.url), 'utf8');
const privacy = readFileSync(new URL('../../supabase/migrations/20260906134536_restrict_legacy_user_reads.sql', import.meta.url), 'utf8');
const owner = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
const orphan = '10000000-0000-0000-0000-000000000003';
const missingLegacy = '10000000-0000-0000-0000-000000000004';
const cascades = ['user_bets', 'public_profiles', 'user_streaks', 'user_preferences'];
let directory, started = false;
const sql = query => execFileSync(`${bin}/psql`, ['-h', directory, '-p', '55453', '-U', 'testadmin', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', query],
  { env: pgEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }).trim();
const count = (table, field, id) => Number(sql(`select count(*) from ${table} where ${field}='${id}';`));
const ownedCounts = id => Object.fromEntries([
  ['auth.users', 'id'], ['public.users', 'id'], ['public.bankroll', 'user_id'], ['public.user_picks', 'user_id'],
  ['public.push_tokens', 'identity_id'], ['public.user_entitlements', 'installation_id'],
  ['public.account_deletion_requests', 'user_id'], ['user_experience_private.excluded_profiles', 'user_id'],
  ...cascades.map(table => [`public.${table}`, 'user_id']),
].map(([table, field]) => [table, count(table, field, id)]));
function cleanup() {
  try { if (started) execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-m', 'immediate', '-w', '-t', '5', 'stop'], { env: pgEnv, stdio: 'ignore', timeout: 7000 }); }
  finally { started = false; if (directory) rmSync(directory, { recursive: true, force: true }); }
}
function seed() {
  sql(`truncate auth.users, public.users, public.bankroll, public.user_picks, public.push_tokens, public.user_entitlements cascade;
    insert into auth.users(id,email) values ('${owner}','owner@example.invalid'),('${other}','other@example.invalid');
    insert into public.users(id,email,plan) values ('${orphan}','retained-orphan@example.invalid','free');
    insert into public.bankroll(user_id) values ('${owner}'),('${other}');
    insert into public.user_picks(user_id) values ('${owner}'),('${other}');
    insert into public.push_tokens(identity_id) values ('${owner}'),('${other}');
    insert into public.user_entitlements(installation_id) values ('${owner}'),('${other}');
    insert into public.account_deletion_requests(user_id) values ('${owner}'),('${other}');
    insert into user_experience_private.excluded_profiles(user_id) values ('${owner}'),('${other}');
    ${cascades.map(table => `insert into public.${table}(user_id) values ('${owner}'),('${other}');`).join('\n')}`);
}

describe.skipIf(!supported)('account identity deletion on isolated PostgreSQL', () => {
  beforeAll(() => {
    directory = mkdtempSync('/tmp/gary-account-delete-pg-');
    try {
      execFileSync(`${bin}/initdb`, ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale', '--no-sync'], { env: pgEnv, stdio: 'pipe', timeout: 20000 });
      execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p 55453 -c shared_buffers=8MB -c max_connections=20`, '-w', 'start'], { env: pgEnv, stdio: 'pipe', timeout: 15000 });
      started = true;
      // Sanitized schema/trigger definitions were inspected read-only in the
      // deployed project on Sep 8. public.users intentionally has NO auth FK.
      sql(`create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth; create schema user_experience_private;
        create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
        grant usage on schema auth to anon,authenticated,service_role;
        revoke all on schema user_experience_private from public,anon,authenticated;
        create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}');
        create table public.users(id uuid primary key,email text,plan text,created_at timestamptz);
        create table public.bankroll(user_id uuid references auth.users(id));
        create table public.user_picks(user_id uuid references auth.users(id));
        create table public.push_tokens(identity_id text);
        create table public.user_entitlements(installation_id text);
        create table user_experience_private.excluded_profiles(user_id uuid references auth.users(id) on delete cascade);
        ${cascades.map(table => `create table public.${table}(user_id uuid references auth.users(id) on delete cascade);`).join('\n')}
        create function public.handle_new_user() returns trigger language plpgsql security definer as $$
        begin
          begin
            insert into public.users(id,email,plan,created_at)
            values(new.id,new.email,coalesce(new.raw_app_meta_data->>'plan','free'),now())
            on conflict(id) do nothing;
          exception when others then raise notice 'Error inserting new user: %',SQLERRM;
          end;
          return new;
        end; $$;
        create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
        grant all on public.users to anon,authenticated,service_role;`);
      sql(original);
      sql(`begin; ${privacy} commit;`);
      // Reproduce the real failure before applying the repair: Auth deletion
      // succeeds while the signup-created email row survives.
      sql(`insert into auth.users(id,email) values ('${owner}','owner@example.invalid');
        delete from auth.users where id='${owner}';`);
      expect(count('auth.users', 'id', owner)).toBe(0);
      expect(sql(`select email||'|'||plan from public.users where id='${owner}';`)).toBe('owner@example.invalid|free');
      sql(migration);
      expect(count('public.users', 'id', owner)).toBe(1); // No retrospective orphan cleanup.
    } catch (error) { cleanup(); throw error; }
  }, 40000);
  afterAll(cleanup);
  beforeEach(seed);

  it('removes the signup-created identity and all existing dependents for only the deleting owner', () => {
    const untouched = ownedCounts(other);
    expect(Object.values(ownedCounts(owner)).every(value => value === 1)).toBe(true);
    expect(sql(`select email||'|'||plan from public.users where id='${owner}';`)).toBe('owner@example.invalid|free');
    sql(`delete from auth.users where id='${owner}';`);
    expect(Object.values(ownedCounts(owner)).every(value => value === 0)).toBe(true);
    expect(ownedCounts(other)).toEqual(untouched);
    expect(count('public.users', 'id', orphan)).toBe(1);
  });

  it('rolls back Auth and every dependent if the legacy identity delete fails', () => {
    const before = ownedCounts(owner);
    sql(`create function public.refuse_identity_deletion() returns trigger language plpgsql as $$begin raise exception 'fixture identity failure'; end$$;
      create trigger refuse_identity_deletion before delete on public.users for each row execute function public.refuse_identity_deletion();`);
    try {
      expect(() => sql(`delete from auth.users where id='${owner}';`)).toThrow(/fixture identity failure/);
      expect(ownedCounts(owner)).toEqual(before);
      expect(count('public.users', 'id', other)).toBe(1);
    } finally { sql('drop trigger refuse_identity_deletion on public.users; drop function public.refuse_identity_deletion();'); }
  });

  it('preserves the legacy identity when an existing earlier cleanup step fails', () => {
    const before = ownedCounts(owner);
    sql(`create function public.refuse_entitlement_deletion() returns trigger language plpgsql as $$begin raise exception 'fixture entitlement failure'; end$$;
      create trigger refuse_entitlement_deletion before delete on public.user_entitlements for each row execute function public.refuse_entitlement_deletion();`);
    try {
      expect(() => sql(`delete from auth.users where id='${owner}';`)).toThrow(/fixture entitlement failure/);
      expect(ownedCounts(owner)).toEqual(before);
    } finally { sql('drop trigger refuse_entitlement_deletion on public.user_entitlements; drop function public.refuse_entitlement_deletion();'); }
  });

  it('allows Auth deletion when its optional legacy identity is already absent', () => {
    sql(`insert into auth.users(id,email) values ('${missingLegacy}','missing@example.invalid');
      delete from public.users where id='${missingLegacy}';
      delete from auth.users where id='${missingLegacy}';`);
    expect(count('auth.users', 'id', missingLegacy)).toBe(0);
    expect(count('public.users', 'id', owner)).toBe(1);
  });

  it('changes no current identities when the migration is applied again', () => {
    const before = sql('select json_agg(u order by id) from public.users u;');
    sql(migration);
    expect(sql('select json_agg(u order by id) from public.users u;')).toBe(before);
  });

  it('keeps account deletion server-only and owner-scoped account reads unchanged', () => {
    expect(() => sql(`set role authenticated; delete from public.users where id='${owner}';`)).toThrow(/permission denied/);
    expect(() => sql(`set role authenticated; delete from auth.users where id='${owner}';`)).toThrow(/permission denied/);
    expect(() => sql('set role anon; select email from public.users;')).toThrow(/permission denied/);
    expect(() => sql('set role authenticated; select user_experience_private.delete_account_dependents();')).toThrow(/permission denied/);
    expect(sql(`set role authenticated; set request.jwt.claim.sub='${owner}'; select email from public.users;`)).toBe('owner@example.invalid');
    expect(sql("select prosecdef and proconfig @> array['search_path=\"\"'] from pg_proc where oid='user_experience_private.delete_account_dependents()'::regprocedure;")).toBe('t');
  });
});
