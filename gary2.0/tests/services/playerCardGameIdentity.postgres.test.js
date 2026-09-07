import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let bin = process.env.GARY_TEST_PG_BIN;
if (!bin) { try { bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim(); } catch { bin = ''; } }
const supported = ['initdb', 'pg_ctl', 'psql'].every(name => {
  try { accessSync(path.join(bin, name), constants.X_OK); return !!bin; } catch { return false; }
});
if (!supported && (process.env.CI || process.env.GARY_TEST_PG_BIN)) throw new Error('Card identity tests require local PostgreSQL 15+ server tools');
if (!supported) console.warn('Skipping isolated card identity database tests: PostgreSQL server tools unavailable');
const migration = readFileSync(new URL('../../supabase/migrations/20260907225151_player_card_game_identity.sql', import.meta.url), 'utf8');
const baseline = readFileSync(new URL('../../supabase/migrations/20260604_player_insight_cards.sql', import.meta.url), 'utf8');
const env = { ...process.env, LC_ALL: 'C' };
let directory; let started = false;
const args = () => ['-h', directory, '-p', '55451', '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = query => execFileSync(path.join(bin, 'psql'), [...args(), '-c', query], { env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const rows = () => JSON.parse(sql("SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY id),'[]'::jsonb) FROM public.player_insight_cards c;"));
const insert = (game, payload, date = '2026-09-07', league = 'MLB') => `INSERT INTO public.player_insight_cards(date,league,player_id,game_id,payload)
 VALUES ('${date}','${league}','700',${game == null ? 'NULL' : `'${game}'`},'${JSON.stringify(payload)}'::jsonb)
 ON CONFLICT(date,league,player_id,game_id) DO UPDATE SET payload=excluded.payload;`;

describe.skipIf(!supported)('exact-game player card identity on isolated Postgres', () => {
  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'gary-card-identity-pg-'));
    execFileSync(path.join(bin, 'initdb'), ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale'], { env, stdio: 'pipe' });
    execFileSync(path.join(bin, 'pg_ctl'), ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p 55451`, '-w', 'start'], { env, stdio: 'pipe' });
    started = true;
    sql('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  }, 30_000);
  afterAll(() => {
    if (started) execFileSync(path.join(bin, 'pg_ctl'), ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop'], { env, stdio: 'ignore' });
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  beforeEach(() => {
    sql('DROP TABLE IF EXISTS public.player_insight_cards CASCADE;');
    sql(baseline);
    sql("GRANT SELECT ON public.player_insight_cards TO anon; GRANT ALL ON public.player_insight_cards TO service_role; GRANT USAGE ON public.player_insight_cards_id_seq TO service_role;");
    sql(`INSERT INTO public.player_insight_cards(date,league,player_id,game_id,payload,created_at) VALUES
      ('2026-09-06','MLB','700',NULL,'{"historical":true}','2026-09-06T12:00:00Z'),
      ('2026-09-07','MLB','700','2001','{"first":true}','2026-09-07T12:00:00Z'),
      ('2026-09-07','NFL','700',NULL,'{"otherLeague":true}','2026-09-07T12:00:00Z');`);
  });

  it('preserves every existing row, primary key, table storage file and public read policy', () => {
    const before = rows();
    const file = sql("SELECT pg_relation_filenode('public.player_insight_cards');");
    sql(migration);
    expect(rows()).toEqual(before);
    expect(sql("SELECT pg_relation_filenode('public.player_insight_cards');")).toBe(file);
    expect(sql("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.player_insight_cards'::regclass AND contype='p';")).toBe('PRIMARY KEY (id)');
    expect(sql('SET ROLE anon; SELECT count(*) FROM public.player_insight_cards;').split('\n').pop()).toBe('3');
    expect(() => sql('SET ROLE anon; DELETE FROM public.player_insight_cards;')).toThrow();
  });

  it('keeps two games and one unassigned pack, with exact-game and NULL reruns idempotent', () => {
    sql(migration);
    sql(`SET ROLE service_role; ${insert('2002', { second: true })} ${insert(null, { context: true })}`);
    const before = rows();
    expect(before).toHaveLength(5);
    sql(`SET ROLE service_role; ${insert('2002', { second: 'updated' })} ${insert(null, { context: 'updated' })}`);
    const after = rows();
    expect(after).toHaveLength(5);
    expect(after.map(row => row.id)).toEqual(before.map(row => row.id));
    expect(after.filter(row => row.game_id !== '2002' && !(row.date === '2026-09-07' && row.league === 'MLB' && row.game_id == null)))
      .toEqual(before.filter(row => row.game_id !== '2002' && !(row.date === '2026-09-07' && row.league === 'MLB' && row.game_id == null)));
  });

  it('rolls back the removed old constraint if replacement constraint creation fails', () => {
    const before = rows();
    sql('CREATE TABLE public.identity_name_collision(id int); CREATE INDEX player_insight_cards_date_league_player_game_key ON public.identity_name_collision(id);');
    try {
      expect(() => sql(migration)).toThrow();
      expect(rows()).toEqual(before);
      expect(sql("SELECT count(*) FROM pg_constraint WHERE conname='player_insight_cards_date_league_player_id_key';")).toBe('1');
    } finally { sql('DROP TABLE public.identity_name_collision;'); }
  });

  it('times out rather than waiting indefinitely for a writer, preserving the complete old schema', async () => {
    expect(migration).toContain("SET LOCAL lock_timeout = '5s'");
    expect(migration).toContain("SET LOCAL statement_timeout = '30s'");
    const blocker = spawn(path.join(bin, 'psql'), args(), { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const exited = new Promise(resolve => blocker.once('exit', resolve));
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Fixture lock not acquired')), 5000);
        blocker.once('error', reject);
        blocker.stdout.on('data', chunk => { if (chunk.toString().includes('CARD_LOCKED')) { clearTimeout(timer); resolve(); } });
        blocker.stdin.write('BEGIN;\nLOCK TABLE public.player_insight_cards IN ACCESS EXCLUSIVE MODE;\n\\echo CARD_LOCKED\n');
      });
      expect(() => sql(migration)).toThrow(/lock timeout/);
    } finally { blocker.stdin.end('ROLLBACK;\n\\q\n'); await exited; }
    expect(sql("SELECT count(*) FROM pg_constraint WHERE conname='player_insight_cards_date_league_player_id_key';")).toBe('1');
    expect(rows()).toHaveLength(3);
  }, 15_000);
});
