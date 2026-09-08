import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync, execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
if (!supported) {
  const message = `Pick push database tests need ${missing.join(', ')}; set GARY_TEST_PG_BIN to pg_config --bindir.`;
  if (process.env.GARY_TEST_PG_BIN || ['true', '1'].includes(process.env.CI)) throw new Error(message);
  console.warn(`Skipping isolated pick push delivery tests: ${message}`);
}

let directory;
let started = false;
const children = new Set();
const port = '55447';
const args = () => ['-h', directory, '-p', port, '-U', 'testadmin', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
const sql = source => execFileSync(`${bin}/psql`, [...args(), '-c', source], {
  env: pgEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10_000,
}).trim();
const literal = value => `'${value.replaceAll("'", "''")}'`;
const key = '2026-09-07|MLB|12345|game';
const rawToken = 'fixture-fcm-registration:token-value-never-persisted';
const device = suffix => createHash('sha256').update(rawToken + suffix).digest('hex');
const claimSQL = (hash = device('a'), pick = key, expiry = "clock_timestamp()+interval '1 hour'") =>
  `SET ROLE service_role; SELECT public.claim_pick_push(${literal(pick)},${literal(hash)},${expiry});`;
const claim = (...params) => JSON.parse(sql(claimSQL(...params)));
const finish = (attempt, status, hash = device('a'), pick = key, http = 'null') => sql(
  `SET ROLE service_role; SELECT public.finish_pick_push(${literal(pick)},${literal(hash)},${literal(attempt)}::uuid,${literal(status)},${http});`,
);
const row = (hash = device('a')) => JSON.parse(sql(`SELECT row_to_json(d) FROM public.pick_push_deliveries d WHERE device_key=${literal(hash)};`));

function cleanup() {
  for (const child of children) child.kill('SIGTERM');
  children.clear();
  try {
    if (started) execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-m', 'immediate', '-w', '-t', '5', 'stop'], { env: pgEnv, stdio: 'ignore', timeout: 7000 });
  } finally {
    started = false;
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
}

describe.skipIf(!supported)('pick push claim and completion on isolated PostgreSQL', () => {
  beforeAll(() => {
    // Short socket path, no TCP listener and a small disposable cluster. Never
    // use an inherited DATABASE_URL or a production database for these writes.
    directory = mkdtempSync('/tmp/gary-push-pg-');
    try {
      execFileSync(`${bin}/initdb`, ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale', '--no-sync'], { env: pgEnv, stdio: 'pipe', timeout: 20_000 });
      execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p ${port} -c shared_buffers=8MB -c max_connections=20`, '-w', 'start'], { env: pgEnv, stdio: 'pipe', timeout: 15_000 });
      started = true;
      sql('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
      sql(readFileSync(new URL('../../supabase/migrations/20260908032715_reliable_pick_push_delivery.sql', import.meta.url), 'utf8'));
    } catch (error) { cleanup(); throw error; }
  }, 40_000);
  afterAll(cleanup);
  beforeEach(() => sql('TRUNCATE public.pick_push_deliveries;'));

  it('allows exactly one concurrent claim for one pick/device', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => run(`${bin}/psql`, [...args(), '-c', claimSQL()], { env: pgEnv, timeout: 10_000 })));
    const claims = results.map(result => JSON.parse(result.stdout.trim()));
    expect(claims.filter(result => result.claimed)).toHaveLength(1);
    expect(claims.every(result => result.status === 'sending')).toBe(true);
    expect(row().attempts).toBe(1);
    expect(sql('SELECT count(*) FROM public.pick_push_deliveries;')).toBe('1');
  });

  it('retries only a known failed device after partial delivery', () => {
    const sent = claim(device('sent'));
    const failed = claim(device('failed'));
    const unknown = claim(device('unknown'));
    expect(finish(sent.attempt_id, 'sent', device('sent'), key, '200')).toBe('t');
    expect(finish(failed.attempt_id, 'failed', device('failed'), key, '503')).toBe('t');
    expect(finish(unknown.attempt_id, 'unknown', device('unknown'))).toBe('t');
    sql("UPDATE public.pick_push_deliveries SET retry_after=clock_timestamp()-interval '1 second' WHERE status='failed';");
    expect(claim(device('sent'))).toEqual({ claimed: false, status: 'sent' });
    expect(claim(device('unknown'))).toEqual({ claimed: false, status: 'unknown' });
    const retry = claim(device('failed'));
    expect(retry.claimed).toBe(true);
    expect(retry.attempt_id).not.toBe(failed.attempt_id);
    expect(row(device('sent')).attempts).toBe(1);
    expect(row(device('unknown')).attempts).toBe(1);
    expect(row(device('failed')).attempts).toBe(2);
  });

  it.each(['sent', 'unknown', 'dead', 'expired'])('never resends terminal %s receipts even with a later expiry', status => {
    const attempt = claim();
    expect(finish(attempt.attempt_id, status)).toBe('t');
    expect(claim(device('a'), key, "clock_timestamp()+interval '1 day'")).toEqual({ claimed: false, status });
    expect(row().attempts).toBe(1);
  });

  it('quarantines a stale sending lease as unknown and rejects its late completion', () => {
    const attempt = claim();
    expect(claim()).toEqual({ claimed: false, status: 'sending' });
    sql("UPDATE public.pick_push_deliveries SET updated_at=clock_timestamp()-interval '91 seconds';");
    expect(claim()).toEqual({ claimed: false, status: 'unknown' });
    expect(finish(attempt.attempt_id, 'sent')).toBe('f');
    expect(row().attempts).toBe(1);
    expect(row().status).toBe('unknown');
  });

  it('does not let an old attempt finish a newer retry', () => {
    const first = claim();
    expect(finish(first.attempt_id, 'failed')).toBe('t');
    sql("UPDATE public.pick_push_deliveries SET retry_after=clock_timestamp()-interval '1 second';");
    const next = claim();
    expect(next.attempt_id).not.toBe(first.attempt_id);
    expect(finish(first.attempt_id, 'sent')).toBe('f');
    expect(row().status).toBe('sending');
    expect(finish(next.attempt_id, 'sent')).toBe('t');
    expect(finish(next.attempt_id, 'failed')).toBe('f');
  });

  it('enforces a five-minute cooldown and at most three total attempts', () => {
    for (let number = 1; number <= 3; number++) {
      const attempt = claim();
      expect(attempt.claimed).toBe(true);
      expect(row().attempts).toBe(number);
      expect(finish(attempt.attempt_id, 'failed', device('a'), key, '503')).toBe('t');
      expect(sql("SELECT retry_after BETWEEN clock_timestamp()+interval '4 minutes 59 seconds' AND clock_timestamp()+interval '5 minutes 1 second' FROM public.pick_push_deliveries;")).toBe('t');
      expect(claim()).toEqual({ claimed: false, status: number === 3 ? 'abandoned' : 'failed' });
      sql("UPDATE public.pick_push_deliveries SET retry_after=clock_timestamp()-interval '1 second';");
    }
    expect(claim()).toEqual({ claimed: false, status: 'abandoned' });
    expect(row().attempts).toBe(3);
  });

  it('refuses exact/past kickoff and cannot extend the original expiration on retry', () => {
    expect(claim(device('past'), key, 'clock_timestamp()')).toEqual({ claimed: false, status: 'expired' });
    expect(row(device('past')).attempts).toBe(0);
    const attempt = claim(device('future'), key, "clock_timestamp()+interval '10 minutes'");
    const originalExpiry = row(device('future')).expires_at;
    finish(attempt.attempt_id, 'failed', device('future'));
    sql("UPDATE public.pick_push_deliveries SET retry_after=clock_timestamp()-interval '1 second';");
    expect(claim(device('future'), key, "clock_timestamp()+interval '1 hour'").claimed).toBe(true);
    expect(row(device('future')).expires_at).toBe(originalExpiry);
  });

  it('checks the actual clock after a blocking row lock, not the transaction start time', async () => {
    sql(`INSERT INTO public.pick_push_deliveries(pick_key,device_key,expires_at) VALUES(${literal(key)},${literal(device('a'))},clock_timestamp()+interval '2 seconds');`);
    const holder = spawn(`${bin}/psql`, args(), { env: { ...pgEnv, PGAPPNAME: 'pick_push_lock_holder' }, stdio: ['pipe', 'ignore', 'ignore'] });
    children.add(holder);
    const closed = new Promise(resolve => holder.once('close', resolve));
    let waiting;
    holder.stdin.write(`BEGIN; SELECT 1 FROM public.pick_push_deliveries WHERE pick_key=${literal(key)} FOR UPDATE;\n`);
    try {
      await expect.poll(() => sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='pick_push_lock_holder' AND state='idle in transaction';"), { timeout: 3000, interval: 25 }).toBe('1');
      const expiry = row().expires_at;
      waiting = run(`${bin}/psql`, [...args(), '-c', `BEGIN; ${claimSQL(device('a'), key, `${literal(expiry)}::timestamptz`)} COMMIT;`], { env: { ...pgEnv, PGAPPNAME: 'pick_push_waiting_claim' }, timeout: 8000 });
      await expect.poll(() => sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='pick_push_waiting_claim' AND wait_event_type='Lock';"), { timeout: 2000, interval: 25 }).toBe('1');
      await expect.poll(() => sql('SELECT clock_timestamp() >= expires_at FROM public.pick_push_deliveries;'), { timeout: 4000, interval: 50 }).toBe('t');
      holder.stdin.end('COMMIT;\n');
      await closed;
      const result = JSON.parse((await waiting).stdout.trim());
      expect(result).toEqual({ claimed: false, status: 'expired' });
      expect(row().attempts).toBe(0);
    } finally {
      if (holder.exitCode == null) holder.kill('SIGTERM');
      await closed;
      if (waiting) await waiting.catch(() => {});
      children.delete(holder);
    }
  }, 12_000);

  it('denies public and authenticated access; RLS hides rows even if SELECT were accidentally granted', () => {
    const attempt = claim();
    for (const role of ['anon', 'authenticated']) {
      expect(sql(`SELECT has_table_privilege('${role}','public.pick_push_deliveries','SELECT'),has_function_privilege('${role}','public.claim_pick_push(text,text,timestamptz)','EXECUTE'),has_function_privilege('${role}','public.finish_pick_push(text,text,uuid,text,integer)','EXECUTE');`)).toBe('f|f|f');
      expect(() => sql(`SET ROLE ${role}; SELECT * FROM public.pick_push_deliveries;`)).toThrow();
      expect(() => sql(claimSQL().replace('SET ROLE service_role', `SET ROLE ${role}`))).toThrow();
      expect(() => sql(`SET ROLE ${role}; SELECT public.finish_pick_push(${literal(key)},${literal(device('a'))},${literal(attempt.attempt_id)},'sent',200);`)).toThrow();
      expect(sql(`BEGIN; GRANT SELECT ON public.pick_push_deliveries TO ${role}; SET ROLE ${role}; SELECT count(*) FROM public.pick_push_deliveries; ROLLBACK;`)).toBe('0');
    }
    expect(sql("SELECT relrowsecurity FROM pg_class WHERE oid='public.pick_push_deliveries'::regclass;")).toBe('t');
    expect(sql('SET ROLE service_role; SELECT count(*) FROM public.pick_push_deliveries;')).toBe('1');
  });

  it('stores a digest instead of a registration token and rejects invalid identities/outcomes', () => {
    const attempt = claim();
    expect(JSON.stringify(row())).not.toContain(rawToken);
    expect(row().device_key).toMatch(/^[a-f0-9]{64}$/);
    expect(sql("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='pick_push_deliveries' AND column_name IN ('token','device_token','registration_token');")).toBe('0');
    for (const invalid of [rawToken, '', 'g'.repeat(64), 'A'.repeat(64)]) expect(() => claim(invalid)).toThrow();
    expect(() => claim(device('a'), '')).toThrow();
    expect(() => claim(device('a'), 'x'.repeat(601))).toThrow();
    expect(() => finish(attempt.attempt_id, 'ready')).toThrow();
    expect(row().status).toBe('sending');
    expect(sql('SELECT count(*) FROM public.pick_push_deliveries;')).toBe('1');
  });
});
