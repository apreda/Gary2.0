import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

let bin = process.env.GARY_TEST_PG_BIN;
if (!bin) {
  try { bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim(); }
  catch { bin = ''; }
}
const supported = ['initdb', 'pg_ctl', 'psql', 'postgres'].every(name => {
  try { accessSync(path.join(bin, name), constants.X_OK); return !!bin; } catch { return false; }
});
if (!supported && (process.env.GARY_TEST_PG_BIN || ['true', '1'].includes(process.env.CI))) throw new Error('Hub research CAS requires isolated PostgreSQL binaries');
if (!supported) console.warn('Skipping isolated Hub research CAS: PostgreSQL binaries unavailable');

const env = { ...process.env, LC_ALL: 'C' };
const migrationPath = new URL('../../supabase/migrations/20260908211837_observed_hub_research_cas.sql', import.meta.url);
let directory, today, started = false;
const args = () => ['-h', directory, '-p', '55469', '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-qAt'];
const sql = query => execFileSync(path.join(bin, 'psql'), args(), { input: query, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }).trim();
const literal = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${literal(JSON.stringify(value))}::jsonb`;
const row = () => JSON.parse(sql('SELECT row_to_json(c) FROM public.insight_connections c WHERE id=1;'));
const baseMeta = () => ({ computed_detail: 'Fixture reliever allowed 2 ER in 6 IP.', source_as_of: today,
  clock: { collected: 'old' }, nested: { preserved: true }, judgment: { revision: 'unchanged' } });
const patchFor = original => ({ detail: 'Fixture reliever: 2 ER in 6 IP.', meta: { ...original.meta,
  read: 'Fixture reliever: 2 ER in 6 IP.', evidence: 'Fixture reliever: 2 ER in 6 IP.', research_copy_version: 'observed-research-v1' } });
function call(original, patch = patchFor(original), overrides = {}, role = 'service_role') {
  const expected = { ...original, ...overrides };
  const values = [expected.id, expected.date, expected.league, expected.category, expected.generated_by,
    expected.game_id, expected.team_id, expected.player_id, expected.detail].map(literal);
  return sql(`SET ROLE ${role}; SELECT count(*) FROM public.replace_current_hub_research(${values.join(',')},${json(expected.meta)},${json(patch)});`);
}
function cleanup() {
  try {
    if (started) execFileSync(path.join(bin, 'pg_ctl'), ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop'], { env, stdio: 'ignore', timeout: 7000 });
  } finally {
    started = false;
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
}

describe.skipIf(!supported)('observed Hub research CAS on isolated PostgreSQL', () => {
  beforeAll(() => {
    // Keep the data directory on the internal filesystem; each fixture has
    // its own Unix socket directory and never opens a TCP listener.
    directory = mkdtempSync('/tmp/gary-hub-cas-pg-');
    try {
      execFileSync(path.join(bin, 'initdb'), ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale', '--no-sync'], { env, stdio: 'pipe', timeout: 20000 });
      execFileSync(path.join(bin, 'pg_ctl'), ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p 55469 -c shared_buffers=8MB -c max_connections=20`, '-w', 'start'], { env, stdio: 'pipe', timeout: 15000 });
      started = true;
      sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE unrelated;
        CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS 'SELECT current_user::text';
        GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role,unrelated;`);
      for (const name of ['20260602_create_insight_connections.sql', '20260604_insight_connections_meta.sql', '20260604_insight_connections_grading.sql']) {
        sql(readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
      }
      sql('GRANT SELECT ON public.insight_connections TO anon,authenticated,unrelated; GRANT ALL ON public.insight_connections TO service_role; GRANT USAGE ON SEQUENCE public.insight_connections_id_seq TO service_role;');
      const migration = readFileSync(migrationPath, 'utf8');
      if (!migration.trim()) throw new Error('Hub research CAS migration is empty');
      sql(migration);
      today = sql("SELECT (now() AT TIME ZONE 'America/New_York')::date;");
    } catch (error) { cleanup(); throw error; }
  }, 60000);
  afterAll(cleanup);
  beforeEach(() => {
    sql(`TRUNCATE public.insight_connections;
      INSERT INTO public.insight_connections(id,date,league,category,headline,detail,game,value,tone,spark,line_val,relevance_score,
        player_id,team_id,game_id,generated_by,created_at,updated_at,result,result_note,graded_at,meta)
      VALUES(1,${literal(today)},'MLB','heat_check','Fixture original headline','Fixture original detail','FIX @ TEST','6 IP','neutral','[1,2]',2.5,80,
        NULL,'28','5059948','insights-cli','2026-01-01T10:00:00Z','2026-01-01T11:00:00Z',NULL,NULL,NULL,${json(baseMeta())});`);
  });

  it('publishes allowed fields and preserves every identity, grade, clock and unrelated fact', () => {
    const original = row();
    const patch = { ...patchFor(original), headline: 'Fixture measured headline', value: '2 ER', tone: 'neutral', spark: [2, 1, 0] };
    expect(call(original, patch)).toBe('1');
    expect(row()).toEqual({ ...original, ...patch });
    expect(call(original, patch)).toBe('0');
    expect(row()).toEqual({ ...original, ...patch });
  });

  it('preserves omitted optional fields and distinguishes explicit null', () => {
    const original = row();
    const patch = { ...patchFor(original), spark: null };
    expect(call(original, patch)).toBe('1');
    expect(row()).toEqual({ ...original, ...patch });
  });

  it('is invoker-only and denies anonymous, authenticated and default-public execution', () => {
    const original = row();
    expect(sql("SELECT prosecdef FROM pg_proc WHERE oid='public.replace_current_hub_research(bigint,date,text,text,text,text,text,text,text,jsonb,jsonb)'::regprocedure;")).toBe('f');
    for (const role of ['anon', 'authenticated', 'unrelated']) {
      expect(() => call(original, patchFor(original), {}, role)).toThrow(/permission denied for function/);
      expect(row()).toEqual(original);
    }
  });

  it.each([
    { category: 'cooling_off' }, { game_id: '5059949' }, { team_id: '29' },
    { player_id: '700' }, { detail: 'Newer source detail' }, { id: 2 },
  ])('does not mutate a stale expected identity/detail (%j)', overrides => {
    const original = row();
    expect(call(original, patchFor(original), overrides)).toBe('0');
    expect(row()).toEqual(original);
  });

  it('uses full JSON metadata equality even when detail and judgment did not change', () => {
    const original = row();
    const changedMeta = { ...original.meta, clock: { collected: 'new' }, newlyVerified: [1, 2, 3] };
    sql(`UPDATE public.insight_connections SET meta=${json(changedMeta)} WHERE id=1;`);
    const concurrent = row();
    expect(call(original)).toBe('0');
    expect(row()).toEqual(concurrent);
  });

  it('preserves graded rows even when all expected source fields still match', () => {
    const original = row();
    sql("UPDATE public.insight_connections SET result='hit',result_note='Fixture final',graded_at=now() WHERE id=1;");
    const graded = row();
    expect(call(original)).toBe('0');
    expect(row()).toEqual(graded);
  });

  it.each([
    "date=(now() AT TIME ZONE 'America/New_York')::date-1",
    "league='NFL'", "generated_by='fantasy_briefing_v1'",
  ])('rejects a requested row outside the current ordinary MLB scope (%s)', change => {
    sql(`UPDATE public.insight_connections SET ${change} WHERE id=1;`);
    const outside = row();
    try { expect(call(outside)).toBe('0'); } catch (error) {
      // An explicit argument-validation error is also a safe rejection.
      if (!/ERROR:/.test(String(error.stderr ?? ''))) throw error;
    }
    expect(row()).toEqual(outside);
  });

  it.each([
    null, [], {}, { detail: 'Missing metadata' }, { meta: {} },
    { detail: 7, meta: {} }, { detail: 'Invalid metadata', meta: [] },
    { detail: 'Attempt identity change', meta: {}, game_id: 'other' },
    { detail: 'Attempt grading change', meta: {}, result: 'hit' },
    { detail: 'Attempt provenance change', meta: {}, generated_by: 'other' },
  ])('rejects malformed patches and unknown keys atomically (%j)', patch => {
    const original = row();
    if (patch && typeof patch.detail === 'string' && patch.meta && !Array.isArray(patch.meta)) {
      patch = { ...patch, meta: { ...patch.meta, read: patch.detail, evidence: patch.detail } };
    }
    expect(() => call(original, patch)).toThrow();
    expect(row()).toEqual(original);
  });

  it.each([
    { headline: null }, { headline: '' }, { value: 7 }, { tone: 'unknown' },
    { spark: {} }, { spark: [1, 'invalid'] },
  ])('rejects malformed optional display values (%j)', change => {
    const original = row();
    expect(() => call(original, { ...patchFor(original), ...change })).toThrow();
    expect(row()).toEqual(original);
  });

  it('rejects a patch whose public copies disagree', () => {
    const original = row(), patch = patchFor(original);
    patch.meta.evidence = 'A different observation';
    expect(() => call(original, patch)).toThrow();
    expect(row()).toEqual(original);
  });

  it('accepts at least 40 KB of full metadata and preserves it through the body CAS', () => {
    const largeMeta = { ...baseMeta(), retainedLedger: 'x'.repeat(48_000), nested: { escaped: "He said 'quoted'.", list: [1, null, { preserved: true }] } };
    sql(`UPDATE public.insight_connections SET meta=${json(largeMeta)} WHERE id=1;`);
    const original = row();
    expect(Buffer.byteLength(JSON.stringify(original.meta))).toBeGreaterThan(40_000);
    const patch = patchFor(original);
    expect(call(original, patch)).toBe('1');
    expect(row()).toEqual({ ...original, ...patch });
  });
});
