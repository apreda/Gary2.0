import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  try { accessSync(path.join(bin, name), constants.X_OK); return false; }
  catch { return true; }
});
const supported = missing.length === 0;
if (!supported) {
  const message = `Isolated Hub judgment tests need ${missing.join(', ')}. Set GARY_TEST_PG_BIN to the server binary directory. Checked: ${bin || 'pg_config unavailable'}.`;
  if (process.env.GARY_TEST_PG_BIN || process.env.CI === 'true' || process.env.CI === '1') throw new Error(message);
  console.warn(`Skipping Hub judgment database contract: ${message}`);
}

let directory;
let started = false;
let anchor;
const args = () => ['-h', directory, '-p', '55448', '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = text => execFileSync(`${bin}/psql`, [...args(), '-c', text], {
  env: pgEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10_000,
}).trim();
const quote = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const json = value => value == null ? 'NULL' : `${quote(JSON.stringify(value))}::jsonb`;
const signature = 'public.publish_hub_judgment(bigint,date,text,text,text,text,text,jsonb)';
const iso = offset => new Date(anchor + offset).toISOString();
const identity = (extra = {}) => ({ row_id: 1, date: iso(0).slice(0, 10), league: 'MLB',
  category: 'heat_check', game_id: '100', player_id: '7', team_id: '16', ...extra });
const sourceKey = row => [row.category, row.game_id, row.player_id || '', row.team_id || ''].join('|');
const payload = (extra = {}, row = identity()) => ({
  schema_version: 1, writer_version: 'fixture-hub-v1', status: 'ready',
  date: row.date, league: row.league.toLowerCase(), game_id: row.game_id,
  as_of: iso(-300_000), valid_until: iso(3_600_000), input_fingerprint: 'a'.repeat(64),
  primary_source_key: sourceKey(row),
  take: 'The matchup gives the recent improvement a useful test.',
  explanation: 'The recent form and today’s opposing starter give this matchup context.',
  full_case: 'These observed facts support a measured read of the exact upcoming game.',
  counterargument: 'The recent sample is limited.', watch_for: 'Check the posted lineup.',
  critical_condition: null, what_changed: null, horizon: 'pregame', prominence: 'standard',
  supporting_evidence_ids: ['form', 'current_context'], counter_evidence_ids: [],
  supersedes_source_keys: [sourceKey(row)], related_subject_ids: [`team:${row.team_id}`],
  evidence: [
    { id: 'form', source_key: sourceKey(row), label: 'Recent form', source: 'Fixture provider',
      summary: 'Original measured form.', as_of: iso(-300_000), game_id: row.game_id },
    { id: 'current_context', label: 'Today’s matchup', source: 'Fixture provider',
      summary: 'The scheduled opposing starter.', as_of: iso(-300_000), game_id: row.game_id },
  ],
  evidence_state: [{ source_key: sourceKey(row), fingerprint: 'b'.repeat(64), summary: 'Original measured form.' }],
  ...extra,
});
const publishSql = (judgment, row = identity()) => `SELECT public.publish_hub_judgment(${row.row_id == null ? 'NULL' : row.row_id},
  ${quote(row.date)}::date, ${quote(row.league)}, ${quote(row.category)}, ${quote(row.game_id)},
  ${quote(row.player_id)}, ${quote(row.team_id)}, ${json(judgment)});`;
const publish = (judgment, row = identity()) => sql(`SET ROLE service_role; ${publishSql(judgment, row)}`).split('\n').at(-1);
const records = () => JSON.parse(sql("SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.insight_connections c;"));
const record = () => records()[0];
const current = () => record().meta.judgment;
const lastBoolean = output => output.trim().split('\n').filter(line => line === 't' || line === 'f').at(-1);

async function waitForDatabase(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (sql(`SELECT EXISTS (${predicate});`) === 't') return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Concurrent Hub fixture did not reach its expected database state');
}

describe.skipIf(!supported)('atomic Hub judgment publication on isolated PostgreSQL', () => {
  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'gary-hub-judgment-pg-'));
    execFileSync(`${bin}/initdb`, ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale'], { env: pgEnv, stdio: 'pipe' });
    execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p 55448`, '-w', 'start'], { env: pgEnv, stdio: 'pipe' });
    started = true;
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE fixture_public;
      CREATE TABLE public.insight_connections (
        id bigserial PRIMARY KEY, date date NOT NULL, league text NOT NULL, category text NOT NULL,
        headline text, detail text, game text, value text, tone text, spark jsonb, line_val numeric, relevance_score numeric,
        player_id text, team_id text, game_id text, generated_by text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        result text CHECK (result IN ('hit','miss','push')), result_note text, graded_at timestamptz, meta jsonb
      );
      ALTER TABLE public.insight_connections ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_connections TO service_role;
      GRANT USAGE ON public.insight_connections_id_seq TO service_role;
      GRANT SELECT ON public.insight_connections TO anon, authenticated;
      CREATE POLICY public_read ON public.insight_connections FOR SELECT TO anon, authenticated USING (true);`);
    sql(readFileSync(new URL('../../../supabase/migrations/20260908151609_hub_judgment_publication.sql', import.meta.url), 'utf8'));
    sql(readFileSync(new URL('../../../supabase/migrations/20260908161526_hub_judgment_source_observation_guard.sql', import.meta.url), 'utf8'));
  }, 30_000);
  afterAll(() => {
    if (started) execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop'], { env: pgEnv, stdio: 'ignore' });
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  beforeEach(() => {
    anchor = Date.now();
    sql(`TRUNCATE public.insight_connections RESTART IDENTITY;
      INSERT INTO public.insight_connections(date,league,category,headline,detail,game,value,tone,spark,line_val,relevance_score,
        player_id,team_id,game_id,generated_by,created_at,updated_at,result,result_note,graded_at,meta)
      VALUES (${quote(identity().date)},'MLB','heat_check','Source player: original measured form','Original research prose',
        'AWAY @ HOME','.333','good','[1,0,2]',0.25,80,'7','16','100','insights-cli',
        '2026-09-01T12:00:00Z','2026-09-01T12:00:00Z','hit','Original result','2026-09-02T12:00:00Z',
        '{"computed_detail":"Original facts","read":"Original Gary read","nested":{"retained":[1,true,null]},"optional":null}');
      INSERT INTO public.insight_connections(date,league,category,headline,player_id,team_id,game_id,meta)
      VALUES (${quote(identity().date)},'MLB','heat_check','Doubleheader game two','7','16','101','{}'),
        (${quote(identity().date)},'NFL','heat_check','Other league same identifiers','7','16','100','{}'),
        (${quote(identity().date)}::date+1,'MLB','heat_check','Tomorrow same identifiers','7','16','100','{}'),
        (${quote(identity().date)},'MLB','bullpen_fatigue','Team-only source',NULL,'16','100',NULL);`);
  });

  it('merges only judgment, preserving all source fields and other rows without an updated_at trigger', () => {
    const before = records();
    expect(sql("SELECT count(*) FROM pg_trigger WHERE tgrelid='public.insight_connections'::regclass AND NOT tgisinternal;")).toBe('0');
    const judgment = payload();
    expect(publish(judgment)).toBe('t');
    const after = records();
    expect(after[0]).toEqual({ ...before[0], meta: { ...before[0].meta, judgment } });
    expect(after.slice(1)).toEqual(before.slice(1));
    expect(sql('SET ROLE anon; SELECT meta->\'judgment\'->>\'take\' FROM public.insight_connections WHERE id=1;').split('\n').at(-1)).toBe(judgment.take);
  });

  it('is service-only, ignores forged JWT role claims, and remains security invoker with a fixed search path', () => {
    for (const role of ['anon', 'authenticated', 'fixture_public']) {
      expect(sql(`SELECT has_function_privilege('${role}','${signature}','EXECUTE');`)).toBe('f');
      expect(() => sql(`SET ROLE ${role}; SET request.jwt.claim.role='service_role'; ${publishSql(payload())}`)).toThrow();
    }
    expect(sql(`SELECT has_function_privilege('service_role','${signature}','EXECUTE');`)).toBe('t');
    expect(sql(`SELECT prosecdef, proconfig::text FROM pg_proc WHERE oid='${signature}'::regprocedure;`)).toBe('f|{"search_path=\\"\\""}');
    sql('REVOKE UPDATE ON public.insight_connections FROM service_role;');
    try { expect(() => publish(payload())).toThrow(); }
    finally { sql('GRANT UPDATE ON public.insight_connections TO service_role;'); }
    expect(current()).toBeUndefined();
  });

  it.each([
    { row_id: 999 }, { row_id: 2 }, { row_id: 3 }, { row_id: 4 },
    { date: '2026-01-01' }, { league: 'NFL' }, { category: 'cooling_off' },
    { game_id: '101' }, { player_id: '8' }, { team_id: '17' }, { player_id: null }, { team_id: null },
  ])('requires the entire exact row identity: %j', change => {
    const row = identity(change), before = records();
    expect(publish(payload({}, row), row)).toBe('f');
    expect(records()).toEqual(before);
  });

  it('supports null player identity and null metadata without treating null as a wildcard', () => {
    const row = identity({ row_id: 5, category: 'bullpen_fatigue', player_id: null });
    const judgment = payload({}, row);
    expect(publish(judgment, row)).toBe('t');
    expect(records()[4].meta).toEqual({ judgment });
    const mismatch = { ...row, player_id: '7' };
    expect(publish(payload({}, mismatch), mismatch)).toBe('f');
  });

  it('rejects payload identity and source-key substitution even with a valid target row', () => {
    for (const changes of [{ date: '2026-01-01' }, { league: 'nfl' }, { game_id: '101' },
      { game_id: 100 }, { primary_source_key: 'heat_check|100|8|16' }, { primary_source_key: 'heat_check|100|16|7' }]) {
      expect(() => publish(payload(changes))).toThrow(/Invalid Hub judgment envelope/);
      expect(current()).toBeUndefined();
    }
  });

  it('rejects malformed envelope types, source references, clocks and missing reading layers', () => {
    const bad = [null, [], {}, payload({ schema_version: '1' }), payload({ schema_version: 2 }),
      payload({ status: 'published' }), payload({ input_fingerprint: 'short' }),
      payload({ as_of: 'today' }), payload({ as_of: 'infinity' }), payload({ as_of: '2026-02-30T12:00:00Z' }),
      payload({ as_of: iso(600_000) }), payload({ valid_until: iso(-600_000) }),
      payload({ valid_until: iso(0).slice(0, 10) }), payload({ as_of: 1 }),
      payload({ take: { text: 'Object masquerading as prose' } }), payload({ explanation: '' }),
      payload({ full_case: null }), payload({ watch_for: 'x'.repeat(451) }), payload({ counterargument: [] }),
      payload({ critical_condition: true }), payload({ what_changed: {} }), payload({ horizon: 'season' }),
      payload({ prominence: 'always_major' }), payload({ evidence: {} }), payload({ evidence: [null, {}] }),
      payload({ evidence: [{ id: 'form' }, { id: 'form' }] }),
      payload({ supporting_evidence_ids: ['form'] }), payload({ supporting_evidence_ids: ['form', 'invented'] }),
      payload({ supporting_evidence_ids: ['form', 'form'] }), payload({ counter_evidence_ids: [2] }),
      payload({ supersedes_source_keys: [null] }), payload({ related_subject_ids: 'player:7' }),
      payload({ evidence_state: null }),
    ];
    const before = records();
    for (const value of bad) {
      expect(() => publish(value), JSON.stringify(value)).toThrow(/Invalid Hub judgment|Hub judgment evidence is in the future/);
      expect(records()).toEqual(before);
    }
  });

  it('rejects already-expired ready calls without refreshing their evidence window', () => {
    expect(publish(payload({ valid_until: iso(-1_000) }))).toBe('f');
    expect(current()).toBeUndefined();
  });

  it('checks wall-clock expiry even when the transaction began before its deadline', () => {
    const value = payload({ valid_until: iso(150) });
    const output = sql(`BEGIN; SET LOCAL ROLE service_role; SELECT pg_sleep(0.25); ${publishSql(value)} COMMIT;`);
    expect(lastBoolean(output)).toBe('f');
    expect(current()).toBeUndefined();
  });

  it('returns true for identical JSON without creating a new row version or changing timestamps', () => {
    const value = payload();
    expect(publish(value)).toBe('t');
    const before = record();
    const rowVersion = sql('SELECT xmin::text FROM public.insight_connections WHERE id=1;');
    expect(publish({ ...value })).toBe('t');
    expect(record()).toEqual(before);
    expect(sql('SELECT xmin::text FROM public.insight_connections WHERE id=1;')).toBe(rowVersion);
  });

  it.each(['computed_as_of', 'source_collected_at'])('rejects a primary %s newer than the argument, including identical ready replay', field => {
    const value = payload();
    expect(publish(value)).toBe('t');
    sql(`UPDATE public.insight_connections SET meta=jsonb_set(meta,ARRAY[${quote(field)}],${json(iso(-120_000))}) WHERE id=1;`);
    const before = record();
    expect(publish(value)).toBe('f');
    expect(record()).toEqual(before);
    const withdrawal = payload({ status: 'context_changed', as_of: iso(-60_000), valid_until: iso(-60_000) });
    expect(publish(withdrawal)).toBe('t');
    expect(current()).toEqual(withdrawal);
  });

  it('permits same-pass source persistence after analysis but examines both declared observation clocks', () => {
    const value = payload();
    sql(`UPDATE public.insight_connections SET created_at=${quote(iso(0))}, updated_at=${quote(iso(0))},
      meta=meta || ${json({ computed_as_of: iso(-360_000), source_collected_at: value.as_of, generated_at: iso(0) })} WHERE id=1;`);
    expect(publish(value)).toBe('t');
    sql(`UPDATE public.insight_connections SET meta=jsonb_set(meta,'{source_collected_at}',${json(iso(-120_000))}) WHERE id=1;`);
    expect(publish(value)).toBe('f');
  });

  it('rejects malformed declared source clocks without changing source facts', () => {
    for (const clock of ['unknown', '2026-09-08', '2026-02-30T12:00:00Z', 15, {}, true]) {
      sql(`UPDATE public.insight_connections SET meta=jsonb_set(meta,'{source_collected_at}',${json(clock)}) WHERE id=1;`);
      const before = record();
      expect(publish(payload())).toBe('f');
      expect(record()).toEqual(before);
    }
  });

  it('reads cited secondary clocks in the exact scope without requiring capped evidence rows to exist', () => {
    const secondaryKey = sourceKey(identity({ category: 'bullpen_fatigue', player_id: null }));
    const value = payload();
    value.evidence.push({ id: 'secondary', source_key: secondaryKey, label: 'Relief workload',
      source: 'Fixture provider', summary: 'Original relief observation.', game_id: '100', as_of: value.as_of });
    value.counter_evidence_ids.push('secondary');
    sql(`UPDATE public.insight_connections SET meta=${json({ source_collected_at: iso(-120_000) })} WHERE id IN (2,3,4,5);`);
    expect(publish(value)).toBe('f');
    sql('DELETE FROM public.insight_connections WHERE id=5;');
    // Newer clocks on another game, league or day cannot block this argument;
    // the unpersisted secondary snapshot still lives inside the full case.
    expect(publish(value)).toBe('t');
  });

  it('rechecks refreshed primary facts after waiting for the collector row lock', async () => {
    const change = run(`${bin}/psql`, [...args(), '-c', `SET application_name='hub-source-clock-writer'; SET ROLE service_role;
      BEGIN; UPDATE public.insight_connections SET meta=meta || ${json({ source_collected_at: iso(-120_000), measured_hits: 8 })} WHERE id=1;
      SELECT pg_sleep(0.5); COMMIT;`], { env: pgEnv, timeout: 10_000 });
    await waitForDatabase("SELECT 1 FROM pg_stat_activity WHERE application_name='hub-source-clock-writer' AND wait_event='PgSleep'");
    const publication = run(`${bin}/psql`, [...args(), '-c', `SET application_name='hub-old-facts-writer'; SET ROLE service_role;
      ${publishSql(payload())}`], { env: pgEnv, timeout: 10_000 });
    await waitForDatabase("SELECT 1 FROM pg_stat_activity WHERE application_name='hub-old-facts-writer' AND wait_event_type='Lock'");
    const [, result] = await Promise.all([change, publication]);
    expect(lastBoolean(result.stdout)).toBe('f');
    expect(record().meta.measured_hits).toBe(8);
    expect(current()).toBeUndefined();
  });

  it('rejects older observations and equal-time conflicting opinions while allowing a newer observation', () => {
    const first = payload();
    expect(publish(first)).toBe('t');
    expect(publish(payload({ as_of: iso(-360_000), take: 'An older observation.' }))).toBe('f');
    expect(publish(payload({ take: 'A conflicting opinion from the same observation.' }))).toBe('f');
    expect(current()).toEqual(first);
    const next = payload({ as_of: iso(-240_000), take: 'A newer supported interpretation.' });
    expect(publish(next)).toBe('t');
    expect(current()).toEqual(next);
  });

  it.each(['context_changed', 'context_unavailable', 'superseded'])('invalidates only an existing older opinion with %s', status => {
    const invalidation = payload({ status, as_of: iso(-120_000), valid_until: iso(-120_000) });
    expect(publish(invalidation)).toBe('f');
    const original = payload();
    expect(publish(original)).toBe('t');
    expect(publish(payload({ status, valid_until: original.as_of }))).toBe('f');
    expect(() => publish({ ...invalidation, valid_until: iso(-119_000) })).toThrow(/evidence window/);
    expect(publish(invalidation)).toBe('t');
    expect(current()).toEqual(invalidation);
    expect(publish(invalidation)).toBe('t');
    expect(publish(original)).toBe('f');
    expect(publish(payload({ as_of: iso(-60_000) }))).toBe('t');
  });

  it('preserves unsupported legacy metadata or an existing opinion with unknown chronology', () => {
    for (const meta of ['[]', '"legacy"', '{"judgment":{"as_of":"unknown"}}',
      '{"judgment":{"as_of":"2026-02-30T12:00:00Z"}}', '{"judgment":[]}']) {
      sql(`UPDATE public.insight_connections SET meta=${quote(meta)}::jsonb WHERE id=1;`);
      const before = record();
      expect(publish(payload())).toBe('f');
      expect(record()).toEqual(before);
    }
  });

  it('serializes overlapping writers and rejects a stale run that was waiting for a newer publication', async () => {
    const newer = payload({ as_of: iso(-120_000), take: 'The newer checked game context.' });
    const first = run(`${bin}/psql`, [...args(), '-c', `SET application_name='hub-newer-writer'; SET ROLE service_role;
      BEGIN; ${publishSql(newer)} SELECT pg_sleep(0.5); COMMIT;`], { env: pgEnv, timeout: 10_000 });
    await waitForDatabase("SELECT 1 FROM pg_stat_activity WHERE application_name='hub-newer-writer' AND wait_event='PgSleep'");
    const stale = run(`${bin}/psql`, [...args(), '-c', `SET application_name='hub-stale-writer'; SET ROLE service_role;
      ${publishSql(payload())}`], { env: pgEnv, timeout: 10_000 });
    await waitForDatabase("SELECT 1 FROM pg_stat_activity WHERE application_name='hub-stale-writer' AND wait_event_type='Lock'");
    const [freshResult, staleResult] = await Promise.all([first, stale]);
    expect(lastBoolean(freshResult.stdout)).toBe('t');
    expect(lastBoolean(staleResult.stdout)).toBe('f');
    expect(current()).toEqual(newer);
  });

  it('reads sibling metadata after a concurrent update instead of overwriting it with a prior snapshot', async () => {
    const value = payload();
    const sibling = run(`${bin}/psql`, [...args(), '-c', `SET application_name='hub-sibling-writer'; SET ROLE service_role;
      BEGIN; UPDATE public.insight_connections SET meta=jsonb_set(meta,'{independent_collector}','{"fresh":true}') WHERE id=1;
      SELECT pg_sleep(0.5); COMMIT;`], { env: pgEnv, timeout: 10_000 });
    await waitForDatabase("SELECT 1 FROM pg_stat_activity WHERE application_name='hub-sibling-writer' AND wait_event='PgSleep'");
    const publication = run(`${bin}/psql`, [...args(), '-c', `SET ROLE service_role; ${publishSql(value)}`], { env: pgEnv, timeout: 10_000 });
    const [, result] = await Promise.all([sibling, publication]);
    expect(lastBoolean(result.stdout)).toBe('t');
    expect(record().meta).toMatchObject({ judgment: value, independent_collector: { fresh: true }, computed_detail: 'Original facts' });
  });

  it('rejects a ready call that expires while waiting for the source row lock', async () => {
    const blocker = run(`${bin}/psql`, [...args(), '-c', `SET application_name='hub-deadline-blocker'; SET ROLE service_role;
      BEGIN; SELECT id FROM public.insight_connections WHERE id=1 FOR UPDATE; SELECT pg_sleep(0.5); COMMIT;`], { env: pgEnv, timeout: 10_000 });
    await waitForDatabase("SELECT 1 FROM pg_stat_activity WHERE application_name='hub-deadline-blocker' AND wait_event='PgSleep'");
    const value = payload({ valid_until: new Date(Date.now() + 150).toISOString() });
    const publication = run(`${bin}/psql`, [...args(), '-c', `SET application_name='hub-deadline-writer'; SET ROLE service_role;
      ${publishSql(value)}`], { env: pgEnv, timeout: 10_000 });
    await waitForDatabase("SELECT 1 FROM pg_stat_activity WHERE application_name='hub-deadline-writer' AND wait_event_type='Lock'");
    const [, result] = await Promise.all([blocker, publication]);
    expect(lastBoolean(result.stdout)).toBe('f');
    expect(current()).toBeUndefined();
  });

  it('rechecks source identity when the row changes while the publisher waits', async () => {
    const change = run(`${bin}/psql`, [...args(), '-c', `SET application_name='hub-identity-writer'; SET ROLE service_role;
      BEGIN; UPDATE public.insight_connections SET game_id='101' WHERE id=1; SELECT pg_sleep(0.5); COMMIT;`], { env: pgEnv, timeout: 10_000 });
    await waitForDatabase("SELECT 1 FROM pg_stat_activity WHERE application_name='hub-identity-writer' AND wait_event='PgSleep'");
    const publication = run(`${bin}/psql`, [...args(), '-c', `SET ROLE service_role; ${publishSql(payload())}`], { env: pgEnv, timeout: 10_000 });
    const [, result] = await Promise.all([change, publication]);
    expect(lastBoolean(result.stdout)).toBe('f');
    expect(record().game_id).toBe('101');
    expect(current()).toBeUndefined();
  });
});
