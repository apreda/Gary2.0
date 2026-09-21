import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let bin = process.env.GARY_TEST_PG_BIN;
if (!bin) { try { bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim(); } catch { bin = ''; } }
const supported = ['initdb', 'pg_ctl', 'psql'].every(name => {
  try { accessSync(path.join(bin, name), constants.X_OK); return !!bin; } catch { return false; }
});
if (!supported && (process.env.CI || process.env.GARY_TEST_PG_BIN)) throw new Error('NFL history tests require PostgreSQL server tools');
if (!supported) console.warn('Skipping isolated NFL history tests: PostgreSQL server tools unavailable');
const migration = readFileSync(new URL('../../supabase/migrations/20260921154817_read_nfl_props_window.sql', import.meta.url), 'utf8');
const env = { ...process.env, LC_ALL: 'C' };
let directory; let started = false;
const sql = query => execFileSync(path.join(bin, 'psql'), ['-h', directory, '-p', '55483', '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query],
  { env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

const read = (start, end, role = 'anon') => JSON.parse(sql(`set role ${role}; select coalesce(jsonb_agg(t),'[]') from public.read_nfl_props_window('${start}','${end}') t;`).split('\n').at(-1));
describe.skipIf(!supported)('bounded NFL history on isolated PostgreSQL', () => {
  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'gary-nfl-history-pg-'));
    execFileSync(path.join(bin, 'initdb'), ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale'], { env, stdio: 'pipe' });
    execFileSync(path.join(bin, 'pg_ctl'), ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p 55483`, '-w', 'start'], { env, stdio: 'pipe' });
    started = true;
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.prop_picks(date text primary key, picks jsonb);
      alter table public.prop_picks enable row level security;
      create policy fixture_visible on public.prop_picks for select using (date <> '2026-09-16');
      grant select on public.prop_picks to anon,authenticated,service_role;
      insert into public.prop_picks values
      ('2026-09-14','[{"sport":"NFL","player":"before"}]'),
      ('2026-09-15','[{"sport":"MLB","player":"baseball"},{"sport":"NFL","player":"first"},{"league":"NFL","player":"second"}]'),
      ('2026-09-16','[{"sport":"NFL","player":"restricted"}]'),
      ('2026-09-21','[{"sport":"NFL","player":"last"}]'),
      ('2026-09-22','[{"sport":"NFL","player":"after"}]');`);
    sql(migration);
  }, 30_000);
  afterAll(() => {
    if (started) execFileSync(path.join(bin, 'pg_ctl'), ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop'], { env, stdio: 'ignore' });
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  it.each(['anon','authenticated'])('returns only selected-week NFL picks in original order as %s', role => {
    expect(read('2026-09-15','2026-09-21',role)).toEqual([
      { date:'2026-09-15',picks:[{sport:'NFL',player:'first'},{league:'NFL',player:'second'}] },
      { date:'2026-09-21',picks:[{sport:'NFL',player:'last'}] }
    ]);
  });
  it('inherits table RLS instead of elevating access', () => {
    expect(read('2026-09-16','2026-09-16')).toEqual([]);
    expect(read('2026-09-16','2026-09-16','service_role')[0].picks[0].player).toBe('restricted');
  });
  it('rejects reversed or unbounded windows', () => {
    expect(() => read('2026-09-21','2026-09-15')).toThrow(/one to seven/);
    expect(() => read('2026-09-15','2026-09-22')).toThrow(/one to seven/);
    expect(() => sql('select * from public.read_nfl_props_window(null,null)')).toThrow(/one to seven/);
  });
  it('returns an empty result when the selected date has no published props', () => {
    expect(read('2026-09-20','2026-09-20')).toEqual([]);
  });
});
