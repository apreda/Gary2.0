import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Socket-only, disposable PostgreSQL. No application environment, provider,
// production connection or actual recipient is used by this acceptance gate.
const pgEnv: NodeJS.ProcessEnv = { PATH: process.env.PATH, NODE_ENV: 'test', LC_ALL: 'C', TZ: 'UTC' };
let bin = process.env.GARY_TEST_PG_BIN ?? '';
if (!bin) {
  try { bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim(); }
  catch { /* Optional locally; required when explicitly configured or in CI. */ }
}
const missing = ['initdb', 'pg_ctl', 'psql', 'postgres'].filter(name => {
  try { accessSync(path.join(bin, name), constants.X_OK); return !bin; } catch { return true; }
});
const supported = missing.length === 0;
if (!supported) {
  const message = `Website email permissions tests need PostgreSQL: ${missing.join(', ')}. Set GARY_TEST_PG_BIN.`;
  if (process.env.GARY_TEST_PG_BIN || ['1', 'true'].includes(process.env.CI ?? '')) throw new Error(message);
  console.warn(`Skipping: ${message}`);
}

const migrationDirectory = fileURLToPath(new URL('../../gary2.0/supabase/migrations/', import.meta.url));
const original = readFileSync(path.join(migrationDirectory, '20260903181433_web_email_updates.sql'), 'utf8');
const grants = {
  web_email_subscriptions: ['SELECT', 'INSERT', 'UPDATE'],
  web_email_consent_events: ['SELECT', 'INSERT'],
  web_email_unsubscribe_tokens: ['SELECT', 'INSERT'],
  web_email_signup_rate_limits: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  web_email_deliveries: ['SELECT', 'INSERT', 'UPDATE'],
  web_email_provider_state: ['SELECT', 'UPDATE'],
  web_email_provider_capacity: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  web_email_campaign_leases: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  web_email_provider_events: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
} as const;
const tables = Object.keys(grants) as (keyof typeof grants)[];
let privileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
const owner = '10000000-0000-4000-8000-000000000001';
const otherOwner = '10000000-0000-4000-8000-000000000002';
const confirmationHash = 'a'.repeat(64);
const unsubscribeHash = 'b'.repeat(64);
const fingerprint = 'c'.repeat(64);
const email = 'reader@example.invalid';
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
let directory = '';
let startAttempted = false;
let broadPrivileges: unknown;
let beforeMetadata = '';
let hardeningFiles: string[] = [];

function sql(query: string): string {
  return execFileSync(path.join(bin, 'psql'), ['-h', directory, '-p', '55461', '-U', 'testadmin', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', query],
    { env: pgEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }).trim();
}
const service = (query: string) => sql(`SET ROLE service_role; ${query}`);
const rpc = (expression: string) => service(`SELECT public.${expression};`);
const jsonRpc = <T = Record<string, unknown>>(expression: string): T => JSON.parse(rpc(expression) || 'null');
const count = (table: string) => Number(sql(`SELECT count(*) FROM public.${table};`));

function cleanup() {
  if (!directory) return;
  if (startAttempted) {
    try {
      execFileSync(path.join(bin, 'pg_ctl'), ['-D', `${directory}/data`, '-m', 'immediate', '-w', '-t', '5', 'stop'],
        { env: pgEnv, stdio: 'pipe', timeout: 7000 });
    } catch {
      // A failed start may leave no server. Never remove a still-running
      // cluster's files just because stopping it returned an error.
      let running = false;
      try {
        execFileSync(path.join(bin, 'pg_ctl'), ['-D', `${directory}/data`, 'status'], { env: pgEnv, stdio: 'pipe', timeout: 5000 });
        running = true;
      } catch (error) {
        // Only pg_ctl's explicit "not running" result permits removal.
        // An unexpected status failure leaves the directory for inspection.
        if ((error as { status?: number }).status !== 3) throw error;
      }
      if (running) throw new Error(`Could not stop isolated email test server at ${directory}`);
    }
  }
  startAttempted = false;
  rmSync(directory, { recursive: true, force: true });
  directory = '';
}

function permissionSnapshot() {
  return JSON.parse(sql(`SELECT jsonb_object_agg(t, p) FROM (
    SELECT t, jsonb_object_agg(privilege, has_table_privilege('service_role', 'public.' || t, privilege)) p
    FROM unnest(ARRAY[${tables.map(q).join(',')}]) t
    CROSS JOIN unnest(ARRAY[${privileges.map(q).join(',')}]) privilege GROUP BY t
  ) x;`)) as Record<string, Record<string, boolean>>;
}

function metadataSnapshot() {
  return sql(`SELECT jsonb_build_object(
    'columns', (SELECT jsonb_agg(to_jsonb(c) ORDER BY table_name, ordinal_position) FROM information_schema.columns c WHERE table_schema='public' AND table_name LIKE 'web_email_%'),
    'constraints', (SELECT jsonb_agg(jsonb_build_array(c.conname, pg_get_constraintdef(c.oid), c.convalidated) ORDER BY c.conname) FROM pg_constraint c WHERE c.conrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname LIKE 'web_email_%')),
    'indexes', (SELECT jsonb_agg(to_jsonb(i) ORDER BY indexname) FROM pg_indexes i WHERE schemaname='public' AND tablename LIKE 'web_email_%'),
    'rls', (SELECT jsonb_agg(jsonb_build_array(relname, relrowsecurity, relforcerowsecurity) ORDER BY relname) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname LIKE 'web_email_%' AND relkind='r'),
    'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename LIKE 'web_email_%'),
    'functions', (SELECT jsonb_agg(jsonb_build_array(proname, pg_get_functiondef(oid), proacl) ORDER BY proname) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE '%web_email_%'),
    'defaults', (SELECT jsonb_agg(to_jsonb(d) ORDER BY oid) FROM pg_default_acl d),
    'unrelated_table_acl', (SELECT relacl FROM pg_class WHERE oid='public.non_email_fixture'::regclass),
    'cron', (SELECT jsonb_agg(to_jsonb(j) ORDER BY jobid) FROM cron.job j)
  );`);
}

function request(address = email, cadence = 'both') {
  return jsonRpc<{ id: string; send_confirmation: boolean; status: string }>(`request_web_email_subscription(${q(address)}, ${q(cadence)}, 'fixture', NULL, ${q(confirmationHash)}, ${q(fingerprint)}, 'fixture-v1')`);
}
function activate(address = email, cadence = 'both') {
  const subscription = request(address, cadence);
  expect(jsonRpc(`confirm_web_email_subscription(${q(subscription.id)}, ${q(confirmationHash)})`)).toMatchObject({ status: 'active' });
  return subscription.id;
}
function claim(id: string, kind = 'daily_board', content = 'fixture-day') {
  return jsonRpc<{ state: string; id: string }>(`claim_web_email_delivery(${q(id)}, ${q(kind)}, ${q(content)}, ${q(`${id}:${kind}:${content}`)}, ${q(unsubscribeHash)})`);
}
function finish(id: string, subscription: string, status = 'sent', provider: string | null = 'fixture-provider', kind = 'daily_board') {
  return rpc(`finish_web_email_delivery(${q(id)}, ${q(subscription)}, ${q(kind)}, ${q(status)}, ${provider === null ? 'NULL' : q(provider)}, NULL)`);
}
function event(id: string, provider: string, type: string, tag: string | null = 'daily-board') {
  return rpc(`record_web_email_provider_event(${q(id)}, ${q(provider)}, ${q(type)}, clock_timestamp(), ARRAY[${q(`  ${email.toUpperCase()}  `)}], ${tag === null ? 'NULL' : q(tag)})`);
}

const deniedCalls = [
  `request_web_email_subscription(${q(email)}, 'both', 'fixture', NULL, ${q(confirmationHash)}, ${q(fingerprint)}, 'fixture-v1')`,
  `confirm_web_email_subscription('${owner}', ${q(confirmationHash)})`,
  `is_web_email_unsubscribe_token_valid('${owner}', ${q(unsubscribeHash)})`,
  `unsubscribe_web_email_subscription('${owner}', ${q(unsubscribeHash)})`,
  `claim_web_email_delivery('${owner}', 'daily_board', 'fixture', 'fixture', ${q(unsubscribeHash)})`,
  `is_web_email_delivery_eligible('${owner}', '${owner}', 'daily_board')`,
  'reserve_web_email_provider_slot()',
  `reserve_web_email_provider_capacity('${owner}')`,
  `acquire_web_email_campaign_lease('daily_board', 'fixture', '${owner}')`,
  `release_web_email_campaign_lease('daily_board', 'fixture', '${owner}')`,
  "reconcile_web_email_provider_events('fixture-provider')",
  `record_web_email_provider_event('fixture-event', 'fixture-provider', 'email.delivered', now(), ARRAY[${q(email)}], 'daily-board')`,
  `finish_web_email_delivery('${owner}', '${owner}', 'daily_board', 'skipped')`,
  'cleanup_web_email_operational_data()',
];

describe.skipIf(!supported)('website email least privileges on isolated PostgreSQL', () => {
  beforeAll(() => {
    directory = mkdtempSync('/tmp/gary-email-permissions-pg-');
    try {
      execFileSync(path.join(bin, 'initdb'), ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale', '--no-sync'], { env: pgEnv, stdio: 'pipe', timeout: 20000 });
      startAttempted = true;
      execFileSync(path.join(bin, 'pg_ctl'), ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p 55461 -c shared_buffers=8MB -c max_connections=20`, '-w', 'start'], { env: pgEnv, stdio: 'pipe', timeout: 15000 });
      sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        ALTER DEFAULT PRIVILEGES FOR ROLE testadmin IN SCHEMA public GRANT ALL ON TABLES TO service_role;
        CREATE TABLE public.non_email_fixture(id uuid PRIMARY KEY);
        CREATE SCHEMA cron; CREATE TABLE cron.job(jobid bigint, jobname text);
        INSERT INTO cron.job VALUES (1, 'unrelated-fixture-job');
        CREATE FUNCTION cron.unschedule(bigint) RETURNS boolean LANGUAGE sql AS 'SELECT true';
        CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS 'SELECT 1::bigint';`);
      sql(original);
      // Discover the server's complete ALL privilege set rather than freezing
      // a seven-name list: PostgreSQL 17 also grants MAINTAIN. Effective checks
      // below include privileges inherited through PUBLIC or other roles.
      const inheritedDefaults: string[] = JSON.parse(sql(`SELECT jsonb_agg(privilege_type ORDER BY privilege_type) FROM (
        SELECT DISTINCT a.privilege_type FROM pg_class c
        CROSS JOIN LATERAL aclexplode(c.relacl) a
        WHERE c.relnamespace='public'::regnamespace AND c.relname IN (${tables.map(q).join(',')})
          AND a.grantee='service_role'::regrole
      ) p;`));
      privileges = [...new Set([...privileges, ...inheritedDefaults])];
      broadPrivileges = permissionSnapshot();
      beforeMetadata = metadataSnapshot();
      hardeningFiles = readdirSync(migrationDirectory).filter(name => /^\d{14}_web_email_table_privileges\.sql$/.test(name));
      // Before the new migration exists, the exact-grant assertions below
      // reproduce the deployed broad-default failure (the red test gate).
      for (const name of hardeningFiles) sql(readFileSync(path.join(migrationDirectory, name), 'utf8'));
    } catch (error) { cleanup(); throw error; }
  }, 45000);
  afterAll(cleanup);
  beforeEach(() => {
    sql(`TRUNCATE ${tables.map(table => `public.${table}`).join(', ')};
      INSERT INTO public.web_email_provider_state(singleton) VALUES (true);`);
  });

  it('reproduces inherited ALL privileges before applying exactly one new migration', () => {
    expect(broadPrivileges).toEqual(Object.fromEntries(tables.map(table => [table, Object.fromEntries(privileges.map(privilege => [privilege, true]))])));
    expect(hardeningFiles).toHaveLength(1);
  });

  for (const table of tables) {
    it(`keeps only the intended service-role privileges on ${table}`, () => {
      expect(permissionSnapshot()[table]).toEqual(Object.fromEntries(privileges.map(privilege => [privilege, (grants[table] as readonly string[]).includes(privilege)])));
      const directGrants = JSON.parse(sql(`SELECT coalesce(jsonb_agg(a.privilege_type ORDER BY a.privilege_type), '[]')
        FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
        WHERE c.oid='public.${table}'::regclass AND a.grantee='service_role'::regrole;`));
      expect(directGrants).toEqual([...grants[table]].sort());
    });
  }

  it('preserves functions, schema, forced RLS, defaults, unrelated ACLs and cron metadata on replay', () => {
    expect(metadataSnapshot()).toBe(beforeMetadata);
    const first = permissionSnapshot();
    for (const name of hardeningFiles) sql(readFileSync(path.join(migrationDirectory, name), 'utf8'));
    expect(permissionSnapshot()).toEqual(first);
    expect(metadataSnapshot()).toBe(beforeMetadata);
  });

  for (const role of ['anon', 'authenticated']) {
    it(`denies every email table privilege and all 14 RPCs to ${role}`, () => {
      for (const table of tables) {
        expect(sql(`SELECT ${privileges.map(privilege => `has_table_privilege('${role}', 'public.${table}', '${privilege}')`).join(',')};`)).toBe(privileges.map(() => 'f').join('|'));
        expect(() => sql(`SET ROLE ${role}; SELECT * FROM public.${table};`)).toThrow(/permission denied/);
      }
      expect(deniedCalls).toHaveLength(14);
      for (const call of deniedCalls) expect(() => sql(`SET ROLE ${role}; SELECT public.${call};`)).toThrow(/permission denied for function/);
      expect(sql("SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE '%web_email_%';")).toBe('14');
    });
  }

  it('rejects excess service mutations while keeping append-only consent/token ledgers', () => {
    for (const table of tables) expect(() => service(`TRUNCATE public.${table};`)).toThrow(/permission denied/);
    for (const table of ['web_email_subscriptions', 'web_email_consent_events', 'web_email_unsubscribe_tokens', 'web_email_deliveries', 'web_email_provider_state']) {
      expect(() => service(`DELETE FROM public.${table} WHERE false;`)).toThrow(/permission denied/);
    }
    expect(() => service('INSERT INTO public.web_email_provider_state DEFAULT VALUES;')).toThrow(/permission denied/);
    expect(() => service('UPDATE public.web_email_consent_events SET source=source WHERE false;')).toThrow(/permission denied/);
    expect(() => service('UPDATE public.web_email_unsubscribe_tokens SET token_hash=token_hash WHERE false;')).toThrow(/permission denied/);
  });

  it('requests, reconfirms a changed cadence and records versioned consent', () => {
    const subscription = request();
    expect(subscription).toMatchObject({ status: 'pending', send_confirmation: true });
    expect(request()).toMatchObject({ id: subscription.id, send_confirmation: false });
    expect(jsonRpc(`confirm_web_email_subscription(${q(subscription.id)}, ${q('d'.repeat(64))})`)).toBeNull();
    expect(jsonRpc(`confirm_web_email_subscription(${q(subscription.id)}, ${q(confirmationHash)})`)).toMatchObject({ status: 'active', cadence: 'both' });
    expect(jsonRpc(`confirm_web_email_subscription(${q(subscription.id)}, ${q(confirmationHash)})`)).toBeNull();
    expect(request(email, 'weekly').send_confirmation).toBe(true);
    expect(jsonRpc(`confirm_web_email_subscription(${q(subscription.id)}, ${q(confirmationHash)})`)).toMatchObject({ status: 'active', cadence: 'weekly' });
    expect(count('web_email_consent_events')).toBe(2);
  });

  it('claims pending confirmation and preserves valid unsubscribe links and opt-out state', () => {
    const id = request().id;
    const delivery = claim(id, 'confirmation', confirmationHash);
    expect(delivery.state).toBe('claimed');
    expect(rpc(`is_web_email_delivery_eligible(${q(delivery.id)}, ${q(id)}, 'confirmation')`)).toBe('t');
    expect(rpc(`is_web_email_unsubscribe_token_valid(${q(id)}, ${q(unsubscribeHash)})`)).toBe('t');
    expect(rpc(`unsubscribe_web_email_subscription(${q(id)}, ${q('d'.repeat(64))})`)).toBe('f');
    expect(rpc(`unsubscribe_web_email_subscription(${q(id)}, ${q(unsubscribeHash)})`)).toBe('t');
    expect(rpc(`unsubscribe_web_email_subscription(${q(id)}, ${q(unsubscribeHash)})`)).toBe('t');
    expect(rpc(`is_web_email_delivery_eligible(${q(delivery.id)}, ${q(id)}, 'confirmation')`)).toBe('f');
    expect(claim(id).state).toBe('ineligible');
    expect(count('web_email_consent_events')).toBe(1);
    expect(rpc(`is_web_email_unsubscribe_token_valid(${q(id)}, ${q(unsubscribeHash)})`)).toBe('t');
  });

  it('reserves capacity once and finishes daily and weekly campaigns without extra grants', () => {
    const id = activate();
    for (const kind of ['daily_board', 'weekly_record']) {
      const delivery = claim(id, kind);
      expect(delivery.state).toBe('claimed');
      expect(jsonRpc(`reserve_web_email_provider_capacity(${q(delivery.id)})`)).toMatchObject({ granted: true, already_reserved: false });
      expect(jsonRpc(`reserve_web_email_provider_capacity(${q(delivery.id)})`)).toMatchObject({ granted: true, already_reserved: true });
      expect(finish(delivery.id, id, 'sent', `fixture-${kind}`, kind)).toBe('t');
      expect(claim(id, kind).state).toBe('duplicate');
      expect(jsonRpc(`reserve_web_email_provider_capacity(${q(delivery.id)})`)).toMatchObject({ granted: false, reason: 'delivery_not_queued' });
    }
    expect(service('SELECT last_daily_sent_at IS NOT NULL AND last_weekly_sent_at IS NOT NULL FROM public.web_email_subscriptions;')).toBe('t');
    expect(service('SELECT reserved_count FROM public.web_email_provider_capacity ORDER BY period;')).toBe('2\n2');
    // Existing direct REST store operations also keep their required grants.
    expect(service('UPDATE public.web_email_subscriptions SET pending_cadence=NULL WHERE false; SELECT count(*) FROM public.web_email_subscriptions;')).toBe('1');
  });

  it('retries only a mature request failure and never replays provider-final failure', () => {
    const id = activate();
    const delivery = claim(id);
    expect(finish(delivery.id, id, 'request_failed', null)).toBe('t');
    expect(claim(id).state).toBe('duplicate');
    sql(`UPDATE public.web_email_deliveries SET attempted_at=now()-interval '20 minutes' WHERE id=${q(delivery.id)};`);
    expect(claim(id)).toMatchObject({ state: 'claimed', id: delivery.id });
    expect(finish(delivery.id, id, 'provider_failed', null)).toBe('t');
    sql(`UPDATE public.web_email_deliveries SET attempted_at=now()-interval '20 minutes' WHERE id=${q(delivery.id)};`);
    expect(claim(id).state).toBe('duplicate');
    expect(finish(delivery.id, id, 'request_failed', null)).toBe('f');
  });

  it('serializes provider slots and preserves campaign capacity headroom', () => {
    expect(jsonRpc('reserve_web_email_provider_slot()')).toMatchObject({ granted: true });
    sql("UPDATE public.web_email_provider_state SET next_slot_at=now()+interval '30 seconds';");
    expect(jsonRpc('reserve_web_email_provider_slot(550, 0)')).toMatchObject({ granted: false });
    expect(() => rpc('reserve_web_email_provider_slot(1, 0)')).toThrow(/invalid email provider slot/);
    const first = request().id;
    const second = request('second@example.invalid').id;
    const one = claim(first, 'confirmation', confirmationHash);
    const two = claim(second, 'confirmation', confirmationHash);
    expect(jsonRpc(`reserve_web_email_provider_capacity(${q(one.id)}, 2, 10, 1, 1)`)).toMatchObject({ granted: true });
    expect(jsonRpc(`reserve_web_email_provider_capacity(${q(two.id)}, 2, 10, 1, 1)`)).toMatchObject({ granted: false, reason: 'capacity_exhausted' });
  });

  it('acquires, renews, rejects competing owners and releases or expires campaign leases', () => {
    const lease = (who: string) => rpc(`acquire_web_email_campaign_lease('daily_board', 'fixture', '${who}')`);
    expect(lease(owner)).toBe('t');
    expect(lease(owner)).toBe('t');
    expect(lease(otherOwner)).toBe('f');
    rpc(`release_web_email_campaign_lease('daily_board', 'fixture', '${otherOwner}')`);
    expect(count('web_email_campaign_leases')).toBe(1);
    rpc(`release_web_email_campaign_lease('daily_board', 'fixture', '${owner}')`);
    expect(count('web_email_campaign_leases')).toBe(0);
    expect(lease(otherOwner)).toBe('t');
    sql("UPDATE public.web_email_campaign_leases SET lease_until=now()-interval '1 second';");
    expect(lease(owner)).toBe('t');
  });

  it('reconciles early provider events, deduplicates them and preserves terminal suppression', () => {
    const id = activate();
    const delivery = claim(id);
    expect(event('fixture-early', 'fixture-provider', 'email.delivered')).toBe('0');
    expect(finish(delivery.id, id)).toBe('t');
    expect(service('SELECT status FROM public.web_email_deliveries;')).toBe('delivered');
    expect(rpc("reconcile_web_email_provider_events('fixture-provider')")).toBe('0');
    expect(event('fixture-early', 'fixture-provider', 'email.delivered')).toBe('0');
    expect(event('fixture-failed', 'fixture-provider', 'email.failed')).toBe('1');
    expect(service('SELECT status FROM public.web_email_deliveries;')).toBe('delivered');
    expect(event('fixture-bounce', 'fixture-provider', 'email.bounced')).toBe('1');
    expect(service('SELECT status FROM public.web_email_subscriptions;')).toBe('suppressed');
    expect(finish(delivery.id, id)).toBe('f');
    expect(rpc(`unsubscribe_web_email_subscription(${q(id)}, ${q(unsubscribeHash)})`)).toBe('t');
    expect(service('SELECT status FROM public.web_email_subscriptions;')).toBe('suppressed');
    expect(request().send_confirmation).toBe(false);
    expect(claim(id, 'daily_board', 'later').state).toBe('ineligible');
  });

  it('uses trusted campaign tags for recipient fallback and supports provider-final failures', () => {
    const id = activate();
    expect(event('fixture-unrelated', 'unmatched-provider', 'email.complained', null)).toBe('0');
    expect(service('SELECT status FROM public.web_email_subscriptions;')).toBe('active');
    const delivery = claim(id);
    expect(finish(delivery.id, id)).toBe('t');
    expect(event('fixture-final', 'fixture-provider', 'email.failed')).toBe('1');
    expect(service('SELECT status FROM public.web_email_deliveries;')).toBe('provider_failed');
    expect(claim(id).state).toBe('duplicate');
    expect(event('fixture-tagged', 'early-provider', 'email.suppressed')).toBe('0');
    expect(service('SELECT status FROM public.web_email_subscriptions;')).toBe('suppressed');
    expect(service("SELECT recipients=ARRAY['reader@example.invalid'] FROM public.web_email_provider_events WHERE svix_id='fixture-tagged';")).toBe('t');
  });

  it('supports skipped finishes while rejecting wrong owners and invalid final states', () => {
    const id = activate();
    const delivery = claim(id);
    expect(finish(delivery.id, otherOwner, 'skipped', null)).toBe('f');
    expect(() => finish(delivery.id, id, 'sent', null)).toThrow(/invalid email delivery finish state/);
    expect(finish(delivery.id, id, 'skipped', null)).toBe('t');
    expect(claim(id).state).toBe('duplicate');
  });

  it('cleans only expired operational fixtures and preserves subscription, consent and token ledgers', () => {
    const id = activate();
    claim(id);
    sql(`INSERT INTO public.web_email_signup_rate_limits VALUES (${q('e'.repeat(64))}, 'ip_day', now()-interval '3 days', 1);
      INSERT INTO public.web_email_campaign_leases VALUES ('daily_board','expired','${owner}',now()-interval '3 days',now()), ('daily_board','current','${owner}',now()+interval '1 hour',now());
      INSERT INTO public.web_email_provider_capacity VALUES ('day',current_date-401,1,now()), ('day',current_date,1,now());
      INSERT INTO public.web_email_provider_events(svix_id,provider_id,event_type,event_at,received_at) VALUES
        ('expired','fixture-old','email.delivered',now(),now()-interval '181 days'), ('current','fixture-now','email.delivered',now(),now());`);
    const retained = ['web_email_subscriptions', 'web_email_consent_events', 'web_email_unsubscribe_tokens', 'web_email_deliveries'].map(count);
    rpc('cleanup_web_email_operational_data()');
    expect(sql(`SELECT count(*) FROM public.web_email_signup_rate_limits WHERE fingerprint_hash=${q('e'.repeat(64))};`)).toBe('0');
    expect(count('web_email_signup_rate_limits')).toBeGreaterThan(0);
    expect(count('web_email_campaign_leases')).toBe(1);
    expect(count('web_email_provider_capacity')).toBe(1);
    expect(count('web_email_provider_events')).toBe(1);
    expect(['web_email_subscriptions', 'web_email_consent_events', 'web_email_unsubscribe_tokens', 'web_email_deliveries'].map(count)).toEqual(retained);
  });
});
