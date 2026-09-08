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
if (!supported && (process.env.GARY_TEST_PG_BIN || ['true', '1'].includes(process.env.CI))) throw new Error('Isolated PostgreSQL binaries required for grading cron contract');
if (!supported) console.warn('Skipping grading cron database contract: PostgreSQL binaries unavailable');
let directory; let started = false;
const args = () => ['-h', directory, '-p', '55449', '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = text => execFileSync(`${bin}/psql`, [...args(), '-c', text], { env: pgEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

const migration = readFileSync(new URL('../../supabase/migrations/20260908033025_secure_grading_cron.sql', import.meta.url), 'utf8');
const rows = () => JSON.parse(sql('SELECT json_agg(j ORDER BY jobid) FROM cron.job j;'));
function cleanup() {
  try {
    if (started) execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop'], { env: pgEnv, stdio: 'ignore', timeout: 7000 });
  } finally {
    started = false;
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
}

// The temporary cluster replaces pg_cron/pg_net with recording functions; it
// can validate real SQL command execution without scheduling or sending HTTP.
describe.skipIf(!supported)('grader cron authorization on isolated PostgreSQL', () => {
  beforeAll(() => {
    directory = mkdtempSync('/tmp/gary-grader-cron-pg-');
    try {
      execFileSync(`${bin}/initdb`, ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale', '--no-sync'], { env: pgEnv, stdio: 'pipe', timeout: 20000 });
      execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p 55449 -c shared_buffers=8MB -c max_connections=20`, '-w', 'start'], { env: pgEnv, stdio: 'pipe', timeout: 15000 });
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
      (5,'grade-results-3min','*/3 * * * *',true,'SELECT old_game_call();'),
      (6,'grade-props-5min','*/5 * * * *',false,'SELECT old_prop_call();'),
      (7,'other-job','0 * * * *',true,'SELECT untouched();');
    INSERT INTO vault.decrypted_secrets VALUES('GARY_CRON_SERVICE_ROLE_KEY','fixture-service-v1');`));

  it('preserves existing job identity, cadence and active state; reads the service key only at execution', () => {
    const before = rows();
    sql(migration);
    const after = rows();
    expect(after.map(({ command, ...metadata }) => metadata)).toEqual(before.map(({ command, ...metadata }) => metadata));
    expect(after[2]).toEqual(before[2]);
    expect(sql('SELECT count(*) FROM net.requests;')).toBe('0');
    for (const job of after.slice(0, 2)) {
      expect(job.command).toContain('vault.decrypted_secrets');
      expect(job.command).not.toContain('fixture-service-v1');
      sql(job.command);
    }
    const requests = JSON.parse(sql('SELECT json_agg(r ORDER BY timeout_milliseconds) FROM net.requests r;'));
    expect(requests).toEqual([
      { url: 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/grade-results', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-service-v1' }, body: {}, timeout_milliseconds: 30000 },
      { url: 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/grade-props', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-service-v1' }, body: {}, timeout_milliseconds: 40000 },
    ]);
    sql("UPDATE vault.decrypted_secrets SET decrypted_secret='fixture-service-v2'; TRUNCATE net.requests;");
    sql(after[0].command);
    expect(sql("SELECT headers->>'Authorization' FROM net.requests;")).toBe('Bearer fixture-service-v2');
  });

  it.each(['missing secret', 'empty secret', 'missing job'])('fails atomically for %s before changing any job', scenario => {
    if (scenario === 'missing secret') sql('TRUNCATE vault.decrypted_secrets;');
    if (scenario === 'empty secret') sql("UPDATE vault.decrypted_secrets SET decrypted_secret=' '; ");
    if (scenario === 'missing job') sql('DELETE FROM cron.job WHERE jobid=6;');
    const before = rows();
    expect(() => sql(migration)).toThrow();
    expect(rows()).toEqual(before);
    expect(sql('SELECT count(*) FROM net.requests;')).toBe('0');
  });

  it('can be reapplied without duplicate jobs or network execution', () => {
    sql(migration);
    const once = rows();
    sql(migration);
    expect(rows()).toEqual(once);
    expect(sql('SELECT count(*) FROM net.requests;')).toBe('0');
  });
});
