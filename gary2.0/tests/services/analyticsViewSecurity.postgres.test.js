import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let bin = process.env.GARY_TEST_PG_BIN;
if (!bin) { try { bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim(); } catch { bin = ''; } }
const supported = ['initdb', 'pg_ctl', 'psql'].every(name => {
  try { accessSync(path.join(bin, name), constants.X_OK); return !!bin; } catch { return false; }
});
if (!supported && (process.env.CI || process.env.GARY_TEST_PG_BIN)) throw new Error('Analytics RLS tests require PostgreSQL server tools');
if (!supported) console.warn('Skipping isolated analytics RLS tests: PostgreSQL server tools unavailable');
const views = ['prop_lane_ledger', 'prop_lane_rollup', 'prop_lane_daily', 'coin_flip_ledger', 'coin_flip_ledger_rollup'];
const migration = readFileSync(new URL('../../supabase/migrations/20260908034218_secure_public_analytics_views.sql', import.meta.url), 'utf8');
const definitions = ['20260729_coin_flip_ledger.sql', '20260803_prop_lane_ledger.sql', '20260903_prop_lane_screen.sql']
  .map(name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')).join('\n');
const env = { ...process.env, LC_ALL: 'C' };
let directory; let started = false;
const sql = query => execFileSync(path.join(bin, 'psql'), ['-h', directory, '-p', '55476', '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query],
  { env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const as = (role, query) => sql(`set role ${role}; ${query}`).split('\n').filter(line => line !== 'SET').join('\n');
const rows = (role, view) => JSON.parse(as(role, `select coalesce(jsonb_agg(to_jsonb(v) order by to_jsonb(v)::text),'[]') from public.${view} v;`));
const restrictSources = () => sql(`
  alter policy published_read on public.daily_picks using (date='2026-09-01');
  alter policy published_read on public.prop_picks using (date='2026-09-01');`);

describe.skipIf(!supported)('public analytics security-invoker views on isolated PostgreSQL', () => {
  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'gary-analytics-rls-pg-'));
    execFileSync(path.join(bin, 'initdb'), ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale'], { env, stdio: 'pipe' });
    execFileSync(path.join(bin, 'pg_ctl'), ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p 55476`, '-w', 'start'], { env, stdio: 'pipe' });
    started = true;
    sql('create role anon; create role authenticated; create role service_role bypassrls;');
  }, 30_000);
  afterAll(() => {
    if (started) execFileSync(path.join(bin, 'pg_ctl'), ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop'], { env, stdio: 'ignore' });
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  beforeEach(() => {
    sql(`drop schema public cascade; create schema public;
      grant usage on schema public to anon,authenticated,service_role;
      create table public.daily_picks(date text,picks jsonb);
      create table public.prop_picks(date text,picks jsonb);
      create table public.game_results(game_date date,pick_text text,result text);
      create table public.prop_results(game_date date,player_name text,prop_type text,result text,actual_value numeric);
      insert into public.daily_picks select '2026-09-0'||n, jsonb_build_array(jsonb_build_object(
        'pick','Club '||n||' ML','homeTeam','Home '||n,'awayTeam','Away '||n,'type','game','league','MLB',
        'odds','-110','moneylineHome','-110','moneylineAway','-105','confidence','0.6','model','fixture','prompt_sha','era-'||n)) from generate_series(1,2) n;
      insert into public.prop_picks select '2026-09-0'||n, jsonb_build_array(jsonb_build_object(
        'player','Player '||n,'prop','hits 1.5','bet','over','line','1.5','odds','+110','confidence','0.6',
        'sport','MLB','prompt_sha','era-'||n,'board_version','2','board_two_sided_pct','0.5',
        'lane','CORE','screen_p','0.62','price_p','0.48','screen_gap','0.14','screen_rank','1')) from generate_series(1,2) n;
      insert into public.game_results values ('2026-09-01','Club 1 ML','won'),('2026-09-02','Club 2 ML','lost');
      insert into public.prop_results values ('2026-09-01','Player 1','hits','won',2),('2026-09-02','Player 2','hits','lost',1);
      alter table public.daily_picks enable row level security;
      alter table public.prop_picks enable row level security;
      alter table public.game_results enable row level security;
      alter table public.prop_results enable row level security;
      create policy published_read on public.daily_picks for select to anon,authenticated using (true);
      create policy published_read on public.prop_picks for select to anon,authenticated using (true);
      create policy published_read on public.game_results for select to anon,authenticated using (true);
      create policy published_read on public.prop_results for select to anon,authenticated using (true);
      grant select on public.daily_picks,public.prop_picks,public.game_results,public.prop_results to anon,authenticated,service_role;
      ${definitions}
      grant all on ${views.map(view => `public.${view}`).join(',')} to anon,authenticated,service_role;
      alter table public.prompt_eras enable row level security;
      grant all on public.prompt_eras to service_role;`);
  });

  it('preserves every public column, record and statistic for anon/authenticated/service roles', () => {
    const baseline = Object.fromEntries(['anon','authenticated','service_role'].map(role => [role,
      Object.fromEntries(views.map(view => [view, rows(role, view)]))]));
    const shape = () => sql(`select jsonb_agg(jsonb_build_array(table_name,column_name,data_type,ordinal_position) order by table_name,ordinal_position)
      from information_schema.columns where table_schema='public' and table_name in (${views.map(view => `'${view}'`).join(',')});`);
    const before = shape();
    sql(migration);
    expect(shape()).toBe(before);
    for (const role of ['anon','authenticated','service_role']) for (const view of views) {
      expect(rows(role, view)).toEqual(baseline[role][view]);
      expect(rows(role, view)).toHaveLength(2);
    }
  });

  it.each(['anon','authenticated'])('makes all five views obey source RLS for %s, including nested rollups', role => {
    restrictSources();
    expect(as(role, 'select count(*) from public.daily_picks;')).toBe('1');
    expect(as(role, 'select count(*) from public.prop_picks;')).toBe('1');
    // Reproduce the owner bypass using the real pre-migration view definitions.
    for (const view of views) expect(rows(role, view)).toHaveLength(2);
    sql(migration);
    for (const view of views) {
      const result = rows(role, view);
      expect(result).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain('2026-09-02');
      expect(JSON.stringify(result)).not.toContain('era-2');
    }
  });

  it('preserves service-role analysis and leaves private prompt eras inaccessible to clients', () => {
    restrictSources(); sql(migration);
    for (const view of views) expect(rows('service_role', view)).toHaveLength(2);
    for (const role of ['anon','authenticated']) {
      expect(() => as(role, 'select * from public.prompt_eras;')).toThrow(/permission denied/);
      for (const view of views) {
        const grants = JSON.parse(sql(`select jsonb_build_object('select',has_table_privilege('${role}','public.${view}','SELECT'),
          'insert',has_table_privilege('${role}','public.${view}','INSERT'),'update',has_table_privilege('${role}','public.${view}','UPDATE'),
          'delete',has_table_privilege('${role}','public.${view}','DELETE'));`));
        expect(grants).toEqual({ select: true, insert: false, update: false, delete: false });
      }
    }
  });

  it('can be applied repeatedly without replacing view definitions or changing source privileges', () => {
    const sourceACL = () => sql("select jsonb_agg(jsonb_build_array(relname,relacl) order by relname) from pg_class where relname in ('daily_picks','prop_picks','game_results','prop_results','prompt_eras');");
    const before = sourceACL();
    sql(migration); sql(migration);
    expect(sourceACL()).toBe(before);
    for (const view of views) {
      expect(sql(`select reloptions @> array['security_invoker=true'] from pg_class where oid='public.${view}'::regclass;`)).toBe('t');
      expect(rows('anon', view)).toHaveLength(2);
    }
  });
});
