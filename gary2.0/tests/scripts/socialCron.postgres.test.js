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
if (!supported && (process.env.GARY_TEST_PG_BIN || ['true', '1'].includes(process.env.CI))) throw new Error('Isolated PostgreSQL binaries required for social cron contract');
if (!supported) console.warn('Skipping social cron database contract: PostgreSQL binaries unavailable');
let directory; let started = false;
const args = () => ['-h', directory, '-p', '55451', '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = text => execFileSync(`${bin}/psql`, [...args(), '-c', text], { env: pgEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();


const migration = readFileSync(new URL('../../supabase/migrations/20260908034216_secure_social_service_cron.sql', import.meta.url), 'utf8');
const rows = () => JSON.parse(sql('SELECT json_agg(j ORDER BY jobid) FROM cron.job j;'));
function cleanup() {
  try {
    if (started) execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop'], { env: pgEnv, stdio: 'ignore', timeout: 7000 });
  } finally {
    started = false;
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
}

// This private socket cluster records cron commands and HTTP attempts without
// scheduling work, contacting Supabase, or publishing anything to X.
describe.skipIf(!supported)('social service cron on isolated PostgreSQL', () => {
  beforeAll(() => {
    directory = mkdtempSync('/tmp/gary-social-cron-pg-');
    try {
      execFileSync(`${bin}/initdb`, ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale', '--no-sync'], { env: pgEnv, stdio: 'pipe', timeout: 20000 });
      execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p 55451 -c shared_buffers=8MB -c max_connections=20`, '-w', 'start'], { env: pgEnv, stdio: 'pipe', timeout: 15000 });
      started = true;
      sql(`CREATE SCHEMA cron; CREATE SCHEMA vault; CREATE SCHEMA net;
        CREATE TABLE cron.job(jobid bigint PRIMARY KEY, jobname text UNIQUE, schedule text, active boolean, command text);
        CREATE TABLE vault.decrypted_secrets(name text PRIMARY KEY, decrypted_secret text);
        CREATE TABLE net.requests(url text, body jsonb, headers jsonb, timeout_milliseconds integer);
        CREATE FUNCTION cron.alter_job(job_id bigint, command text) RETURNS void LANGUAGE SQL AS 'UPDATE cron.job SET command = $2 WHERE jobid = $1';
        CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) RETURNS bigint LANGUAGE SQL AS 'INSERT INTO net.requests VALUES($1,$3,$2,$4); SELECT 1::bigint';`);
    } catch (error) { cleanup(); throw error; }
  }, 40000);
  afterAll(cleanup);
  beforeEach(() => sql(`TRUNCATE cron.job, vault.decrypted_secrets, net.requests;
    INSERT INTO cron.job VALUES
      (3,'social-auto-post-hourly','*/15 * * * *',true,'SELECT old_social_call();'),
      (7,'other-job','0 * * * *',true,'SELECT untouched();');
    INSERT INTO vault.decrypted_secrets VALUES('GARY_CRON_SERVICE_ROLE_KEY','fixture-service-v1');`));

  it('preserves cadence, state, identity and timeout with runtime service authorization', () => {
    sql('UPDATE cron.job SET active=false WHERE jobid=3;');
    const before = rows();
    sql(migration);
    const after = rows();
    expect(after.map(({ command, ...metadata }) => metadata)).toEqual(before.map(({ command, ...metadata }) => metadata));
    expect(after[1]).toEqual(before[1]);
    expect(sql('SELECT count(*) FROM net.requests;')).toBe('0');
    expect(after[0].command).toContain('vault.decrypted_secrets');
    expect(after[0].command).not.toContain('fixture-service-v1');
    sql(after[0].command);
    expect(JSON.parse(sql('SELECT row_to_json(r) FROM net.requests r;'))).toEqual({ url: 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/social-auto-post', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-service-v1' }, body: {}, timeout_milliseconds: 120000 });
    sql("UPDATE vault.decrypted_secrets SET decrypted_secret='fixture-service-v2'; TRUNCATE net.requests;");
    sql(after[0].command);
    expect(sql("SELECT headers->>'Authorization' FROM net.requests;")).toBe('Bearer fixture-service-v2');
  });

  it.each(['missing secret', 'empty secret', 'missing job'])('fails before any job change or request for %s', scenario => {
    if (scenario === 'missing secret') sql('TRUNCATE vault.decrypted_secrets;');
    if (scenario === 'empty secret') sql("UPDATE vault.decrypted_secrets SET decrypted_secret=' '; ");
    if (scenario === 'missing job') sql('DELETE FROM cron.job WHERE jobid=3;');
    const before = rows();
    expect(() => sql(migration)).toThrow();
    expect(rows()).toEqual(before);
    expect(sql('SELECT count(*) FROM net.requests;')).toBe('0');
  });

  it('reapplies without new schedules or posting requests', () => {
    sql(migration);
    const once = rows();
    sql(migration);
    expect(rows()).toEqual(once);
    expect(sql('SELECT count(*) FROM net.requests;')).toBe('0');
  });
});
