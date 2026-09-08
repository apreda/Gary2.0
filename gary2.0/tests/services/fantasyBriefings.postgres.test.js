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
  const message = `Isolated Fantasy Postgres tests need ${missing.join(', ')}. Set GARY_TEST_PG_BIN to the server binary directory. Checked: ${bin || 'pg_config unavailable'}.`;
  if (process.env.GARY_TEST_PG_BIN || process.env.CI === 'true' || process.env.CI === '1') throw new Error(message);
  console.warn(`Skipping Fantasy database contract: ${message}`);
}

let directory;
let started = false;
const args = () => ['-h', directory, '-p', '55446', '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = text => execFileSync(`${bin}/psql`, [...args(), '-c', text], { env: pgEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const hash = 'a'.repeat(64);
const decision = (extra = {}) => ({
  id: 'bdl:1', player_id: '1', player_name: 'Player One', team_id: '5', team: 'ATL', position: 'OF', role: 'HITTER',
  action: 'WATCH', headline: 'Wait for the posted batting order.',
  why_now: 'The earlier lineup moved him up.', fit: 'Managers needing runs.',
  risk: 'Today’s order remains unconfirmed.', watch_for: 'The posted lineup before first pitch.',
  opportunities: [{ game_id: '900', opponent: 'PHI', home: true, start_at: '2026-09-07T21:00:00Z' }],
  evidence: [{ id: 'lineup', summary: 'Earlier batting order: first.', facts: { order: 1 } }],
  valid_until: '2026-09-07T21:00:00Z', ...extra,
});
const payload = (extra = {}) => ({
  schema_version: 1, date: '2026-09-07', league: 'MLB',
  generated_at: '2026-09-07T15:01:00Z', fetched_as_of: '2026-09-07T15:00:00Z',
  expires_at: '2026-09-07T18:01:00Z', input_fingerprint: hash, coverage: { complete: true },
  decisions: [decision()], ...extra,
});
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const publishSql = row => `SELECT public.publish_fantasy_briefing(${quote(JSON.stringify(row))}::jsonb, ${quote(row.fetched_as_of)}::timestamptz, ${quote(row.input_fingerprint)});`;
const publish = row => sql(`SET ROLE service_role; ${publishSql(row)}`).split('\n').pop();
const allConnections = () => JSON.parse(sql('SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY id),\'[]\'::jsonb) FROM public.insight_connections c;'));

describe.skipIf(!supported)('Fantasy single-snapshot publication on isolated Postgres', () => {
  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'gary-fantasy-pg-'));
    execFileSync(`${bin}/initdb`, ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale'], { env: pgEnv, stdio: 'pipe' });
    execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p 55446`, '-w', 'start'], { env: pgEnv, stdio: 'pipe' });
    started = true;
    sql('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
    // Live information_schema/constraint/privilege inspection, Sep 7: the
    // installed app's existing table, including its separate sequence grant.
    sql(`CREATE TABLE public.insight_connections (
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
    sql(readFileSync(new URL('../../supabase/migrations/20260907181536_fantasy_briefings.sql', import.meta.url), 'utf8'));
    sql(readFileSync(new URL('../../supabase/migrations/20260907183011_fantasy_briefing_legacy_projection.sql', import.meta.url), 'utf8'));
    sql(readFileSync(new URL('../../supabase/migrations/20260907183743_fantasy_briefing_payload_types.sql', import.meta.url), 'utf8'));
    sql(readFileSync(new URL('../../supabase/migrations/20260907192157_fantasy_briefing_legacy_pitcher_role.sql', import.meta.url), 'utf8'));
    sql(readFileSync(new URL('../../supabase/migrations/20260908140425_fantasy_comparison_deadline_note.sql', import.meta.url), 'utf8'));
  }, 30_000);
  afterAll(() => {
    if (started) execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop'], { env: pgEnv, stdio: 'ignore' });
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  beforeEach(() => {
    sql('TRUNCATE public.fantasy_briefings, public.insight_connections;');
    publish(payload());
  });

  it('grants public read access and denies both direct mutation and privileged publication', () => {
    for (const role of ['anon', 'authenticated']) {
      expect(sql(`SET ROLE ${role}; SELECT count(*) FROM public.fantasy_briefings;`).split('\n').pop()).toBe('1');
      expect(() => sql(`SET ROLE ${role}; UPDATE public.fantasy_briefings SET league='NFL';`)).toThrow();
      expect(() => sql(`SET ROLE ${role}; ${publishSql(payload())}`)).toThrow();
    }
    expect(sql("SELECT has_function_privilege('anon','public.publish_fantasy_briefing(jsonb,timestamptz,text)','EXECUTE'), has_function_privilege('service_role','public.publish_fantasy_briefing(jsonb,timestamptz,text)','EXECUTE');")).toBe('f|t');
  });

  it('atomically replaces one partition and leaves the other league and prior day intact', () => {
    publish(payload({ date: '2026-09-06' }));
    publish(payload({ league: 'NFL' }));
    expect(publish(payload({ fetched_as_of: '2026-09-07T16:00:00Z', generated_at: '2026-09-07T16:01:00Z', decisions: [decision({ player_id: '2', player_name: 'Player Two' })] }))).toBe('t');
    expect(sql("SELECT string_agg(date||'/'||league||'/'||(payload->'decisions'->0->>'player_id'),',' ORDER BY date,league) FROM public.fantasy_briefings;")).toBe('2026-09-06/MLB/1,2026-09-07/MLB/2,2026-09-07/NFL/1');
  });

  it('rejects malformed, incomplete and duplicate-player boards without changing the published snapshot', () => {
    const bad = [
      payload({ coverage: { complete: false } }), payload({ coverage: { complete: 'true' } }), payload({ decisions: [payload().decisions[0], payload().decisions[0]] }),
      payload({ date: 'not a date' }), payload({ schema_version: 2 }), payload({ decisions: {} }),
      payload({ expires_at: '2026-09-07T14:00:00Z' }), payload({ input_fingerprint: 'bad' }),
      payload({ decisions: [{ player_id: null, player_name: 'Player Two' }] }),
      payload({ decisions: [decision({ action: 'MUST_ADD' })] }),
      payload({ decisions: [decision({ fit: '' })] }),
      payload({ decisions: [decision({ evidence: 'wrong shape' })] }),
    ];
    for (const row of bad) {
      expect(() => publish(row)).toThrow();
      expect(sql("SELECT payload->'decisions'->0->>'player_id' FROM public.fantasy_briefings;")).toBe('1');
    }
  });

  it('allows a verified quiet board but never advances freshness for an identical replay', () => {
    expect(publish(payload())).toBe('f');
    expect(publish(payload({ fetched_as_of: '2026-09-07T16:00:00Z', generated_at: '2026-09-07T16:01:00Z', decisions: [] }))).toBe('t');
    expect(sql("SELECT jsonb_array_length(payload->'decisions') FROM public.fantasy_briefings;")).toBe('0');
    expect(allConnections()).toEqual([]);
  });

  it('keeps newer evidence when an older slow run finishes afterward, including concurrent clients', async () => {
    const newer = payload({ fetched_as_of: '2026-09-07T16:00:00Z', generated_at: '2026-09-07T16:01:00Z', decisions: [decision({ player_id: '2', player_name: 'New Evidence' })] });
    const older = payload({ generated_at: '2026-09-07T16:30:00Z', decisions: [decision({ player_id: '3', player_name: 'Slow Old Evidence' })] });
    await Promise.all([
      run(`${bin}/psql`, [...args(), '-c', `SET ROLE service_role; ${publishSql(newer)}`], { env: pgEnv }),
      run(`${bin}/psql`, [...args(), '-c', `SET ROLE service_role; SELECT pg_sleep(0.1); ${publishSql(older)}`], { env: pgEnv }),
    ]);
    expect(sql("SELECT payload->'decisions'->0->>'player_id' FROM public.fantasy_briefings;")).toBe('2');
    expect(sql('SELECT count(*) FROM public.fantasy_briefings;')).toBe('1');
    expect(publish(older)).toBe('f');
    expect(allConnections().map(row => row.player_id)).toEqual(['2']);
  });

  it('projects full decisions into the installed Swift shape without inventing a tier or confidence', () => {
    const [row] = allConnections();
    expect(row).toMatchObject({ category: 'fantasy_pickups', player_id: '1', headline: 'Player One', value: 'WATCH', tone: 'neutral', game: 'vs PHI' });
    expect(row.meta).toMatchObject({ kind: 'fantasy_pickup', evidence: 'Earlier batting order: first.', verdict: 'WATCH: Wait for the posted batting order.', fantasy_decision: decision() });
    expect(row.meta).not.toHaveProperty('tier');
    for (const key of ['why_now', 'fit', 'risk', 'watch_for']) {
      expect(row.meta.read).toContain(decision()[key]);
      expect(row.detail).toContain(decision()[key]);
    }
    expect(row.meta.read).toContain('Evidence as of Sep 07, 11:00 AM ET.');
    expect(row.meta.read).toContain('Next-game call closes at Sep 07, 05:00 PM ET.');
    expect(JSON.parse(sql("SET ROLE anon; SELECT jsonb_agg(meta) FROM public.insight_connections;").split('\n').pop())).toHaveLength(1);
  });

  it('keeps MLB pitchers in the installed app’s arm section while preserving the original decision role', () => {
    const pitcher = decision({ player_id: '2', player_name: 'Starting Pitcher', role: 'pitcher', position: 'SP' });
    publish(payload({ fetched_as_of: '2026-09-07T16:00:00Z', generated_at: '2026-09-07T16:01:00Z', decisions: [pitcher] }));
    expect(allConnections()[0].meta).toMatchObject({ kind: 'fantasy_pickup', role: 'SP', fantasy_decision: { role: 'pitcher' } });
    expect(sql("SELECT payload->'decisions'->0->>'role' FROM public.fantasy_briefings;")).toBe('pitcher');
    publish(payload({ league: 'NFL', decisions: [decision({ role: 'quarterback', position: 'QB' })] }));
    expect(allConnections().find(row => row.league === 'NFL').meta.role).toBe('quarterback');
  });

  it('replaces only the current league/date noninjury Fantasy lanes, preserving all other rows byte for byte', () => {
    sql(`INSERT INTO public.insight_connections(date,league,category,headline,meta)
      SELECT d,l,c,'Keep original metadata','{"untouched":true}'::jsonb
      FROM (VALUES ('2026-09-06'::date),('2026-09-07'::date)) days(d)
      CROSS JOIN (VALUES ('MLB'),('NFL'),('NCAAF')) leagues(l)
      CROSS JOIN (VALUES ('fantasy_pickups'),('two_start_week'),('closer_watch'),('cut_list'),('fantasy_usage'),('fantasy_trend'),('fantasy_matchup'),('return_watch'),('injury'),('heat_check')) categories(c);`);
    const before = allConnections();
    const removedMlb = new Set(['fantasy_pickups', 'two_start_week', 'closer_watch', 'cut_list']);
    const replaced = row => row.date === '2026-09-07' && row.league === 'MLB' && removedMlb.has(row.category);
    publish(payload({ fetched_as_of: '2026-09-07T16:00:00Z', generated_at: '2026-09-07T16:01:00Z' }));
    expect(allConnections().filter(row => !replaced(row))).toEqual(before.filter(row => !replaced(row)));
    expect(allConnections().filter(replaced)).toHaveLength(1);
    const priorNfl = allConnections();
    const removedNfl = new Set(['fantasy_usage', 'fantasy_trend', 'fantasy_matchup']);
    const replacedNfl = row => row.date === '2026-09-07' && row.league === 'NFL' && removedNfl.has(row.category);
    publish(payload({ league: 'NFL' }));
    expect(allConnections().filter(row => !replacedNfl(row))).toEqual(priorNfl.filter(row => !replacedNfl(row)));
    expect(allConnections().filter(replacedNfl)).toMatchObject([{ category: 'fantasy_usage', meta: { kind: 'fantasy_usage' } }]);
  });

  it('rolls back both the new snapshot and legacy deletion when any projected row fails insertion', () => {
    const before = allConnections();
    const priorPayload = sql('SELECT payload FROM public.fantasy_briefings;');
    sql("ALTER TABLE public.insight_connections ADD CONSTRAINT fixture_insert_failure CHECK (player_id IS DISTINCT FROM 'blocked') NOT VALID;");
    try {
      expect(() => publish(payload({
        fetched_as_of: '2026-09-07T16:00:00Z', generated_at: '2026-09-07T16:01:00Z',
        decisions: [decision({ player_id: '2' }), decision({ player_id: 'blocked' })],
      }))).toThrow();
      expect(sql('SELECT payload FROM public.fantasy_briefings;')).toBe(priorPayload);
      expect(allConnections()).toEqual(before);
    } finally { sql('ALTER TABLE public.insight_connections DROP CONSTRAINT fixture_insert_failure;'); }
  });

  it('explains Tate’s earlier cross-game deadline without changing his Sunday identity or qualifiers', () => {
    const tate = decision({ id: 'bdl:33934712', player_id: '33934712', player_name: 'Carnell Tate',
      team_id: '11', team: 'TEN', position: 'WR', role: 'receiver', action: 'START', horizon: 'next_game',
      headline: 'Tate merits the PPR flex spot over the lower-volume speculative receivers in this pool',
      risk: 'Tate is a rookie with no completed 2026 game and no confirmed start; the comparison consists entirely of provider estimates.',
      watch_for: 'Check for a confirmed starting designation and any revised target projection before the 2026-09-13T17:00:00Z kickoff.',
      opportunities: [{ game_id: '1392220', opponent: 'NYJ', home: true, start_at: '2026-09-13T17:00:00.000Z' }],
      valid_until: '2026-09-11T00:35:00.000Z',
      evidence: [{ id: 'scheduled_matchup', summary: 'TEN hosts NYJ on September 13; this does not confirm the player’s starting role.' },
        { id: 'bdl:33934502/weekly_projection', player_id: '33934502', label: 'De’Zhaun Stribling · Week 1 forecast', summary: 'Provider estimate for game 1392217.' }],
    });
    const row = payload({ date: '2026-09-08', league: 'NFL', generated_at: '2026-09-08T13:09:35Z',
      fetched_as_of: '2026-09-08T13:03:38Z', expires_at: '2026-09-08T18:15:01Z', decisions: [tate] });
    publish(row);
    const actual = allConnections().find(connection => connection.player_id === tate.player_id);
    expect(actual.meta.read).toContain('Make this comparison before Sep 10, 08:35 PM ET, when the earliest game in this set starts.');
    expect(actual.meta.read).not.toContain('Next-game call closes');
    expect(actual.meta.read).toContain(tate.risk);
    expect(actual.meta.read).toContain(tate.watch_for);
    expect(actual).toMatchObject({ headline: 'Carnell Tate', game: 'vs NYJ', game_id: '1392220', value: 'START',
      meta: { valid_until: tate.valid_until, fantasy_decision: tate } });
    expect(actual.detail).toBe(`${actual.meta.verdict}\n\n${actual.meta.read}`);
    expect(JSON.parse(sql("SELECT payload FROM public.fantasy_briefings WHERE date='2026-09-08' AND league='NFL';"))).toEqual(row);
  });

  it('labels same-game cited-peer decisions as comparisons with the supplied deadline intact', () => {
    const sameGame = decision({ player_id: '2', evidence: [
      { id: 'lineup', summary: 'Provider lineup is pending.' },
      { id: 'bdl:3/recent', player_id: '3', summary: 'Comparison player in the same game.' },
    ] });
    publish(payload({ fetched_as_of: '2026-09-07T16:00:00Z', generated_at: '2026-09-07T16:01:00Z', decisions: [sameGame] }));
    const actual = allConnections()[0];
    expect(actual.meta.read).toContain('Make this comparison before Sep 07, 05:00 PM ET, when the earliest game in this set starts.');
    expect(actual.meta.valid_until).toBe(sameGame.valid_until);
    expect(actual.meta.fantasy_decision).toEqual(sameGame);
  });

  it('does not mistake the subject’s own player-tagged evidence for a comparison', () => {
    publish(payload({ fetched_as_of: '2026-09-07T16:00:00Z', generated_at: '2026-09-07T16:01:00Z',
      decisions: [decision({ evidence: [{ id: 'recent', player_id: '1', summary: 'The subject’s own measured history.' }] })] }));
    expect(allConnections()[0].meta.read).toContain('Next-game call closes at Sep 07, 05:00 PM ET.');
    expect(allConnections()[0].meta.read).not.toContain('Make this comparison');
  });

  it('adds no decision deadline to a weekly call even when a peer is cited', () => {
    publish(payload({ fetched_as_of: '2026-09-07T16:00:00Z', generated_at: '2026-09-07T16:01:00Z',
      decisions: [decision({ horizon: 'week', valid_until: null, evidence: [{ id: 'bdl:2/recent', player_id: '2', summary: 'Peer history.' }] })] }));
    expect(allConnections()[0].meta.read).not.toMatch(/call closes|Make this comparison/);
  });
});
