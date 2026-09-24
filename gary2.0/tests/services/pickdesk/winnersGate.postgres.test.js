import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// THE WINNERS GATE (Sep 24 2026) on an isolated local Postgres: Gary's play
// plus the reader's grade admit; nothing else does but the big game.
const pgEnv = { ...process.env, LC_ALL: 'C' };
let bin = process.env.GARY_TEST_PG_BIN;
if (!bin) { try { bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim(); } catch { bin = ''; } }
const missing = ['initdb', 'pg_ctl', 'psql', 'postgres'].filter((name) => { if (!bin) return true; try { accessSync(path.join(bin, name), constants.X_OK); return false; } catch { return true; } });
const supported = missing.length === 0;
if (!supported) {
  const message = `Isolated Postgres tests need executable ${missing.join(', ')}. Set GARY_TEST_PG_BIN to the server binary directory.`;
  if (process.env.GARY_TEST_PG_BIN || process.env.CI === 'true' || process.env.CI === '1') throw new Error(message);
  console.warn(`Skipping the Winners gate contract: ${message}`);
}
let directory; let started = false;
const PORT = '55441';
const args = () => ['-h', directory, '-p', PORT, '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = (s) => execFileSync(`${bin}/psql`, [...args(), '-c', s], { env: pgEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
// As the worker: psql echoes the SET tag first; the answer is the last line.
const svc = (s) => sql(`SET ROLE service_role; ${s}`).split('\n').pop().trim();
const migration = (name) => sql(readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
const day = '2026-09-25';
const seed = (id, kind, snapshot = '{}') => sql(`INSERT INTO public.winners_candidates(id,game_date,league,kind,game_id,ticket_key,market_key,pick_text,odds,commence_time,pick_snapshot,evidence_snapshot,policy_version,status,created_at)
  OVERRIDING SYSTEM VALUE VALUES(${id},'${day}','MLB','${kind}','g${id}','t${id}','m${id}','Tigers ML -134',-134,now()+interval '3 hours','${snapshot}'::jsonb,'{"deskText":"x","observedAt":"2026-09-25T10:00:00Z"}','exact-ticket-v2','pending',now()-interval '2 minutes')`);
const claim = () => JSON.parse(svc(`SELECT row_to_json(r) FROM public.claim_winners_read() r`));
const finish = (r, grade) => JSON.parse(svc(`SELECT public.finish_winners_read(${r.id},${r.attempts},${grade === null ? 'NULL' : `'${grade}'`},'{"reason":"the record shows it","opposing_case":"the pen"}','[{"claim":"a","why":"b"},{"claim":"c","why":"d"}]','test-model',1)`));
const play = (dollars, why = 'I like it') => JSON.stringify({ gary_bet: { play: true, stake_dollars: dollars, why } }).replace(/'/g, "''");

describe.skipIf(!supported)('the Winners gate', () => {
  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'gary-winners-gate-pg-'));
    try {
      execFileSync(`${bin}/initdb`, ['-D', `${directory}/data`, '-A', 'trust', '-U', 'testadmin', '--no-locale'], { env: pgEnv, stdio: 'pipe' });
      execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-k ${directory} -h '' -p ${PORT}`, '-w', 'start'], { env: pgEnv, stdio: 'pipe' });
      started = true;
    } catch (error) {
      let serverLog = ''; try { serverLog = readFileSync(`${directory}/server.log`, 'utf8'); } catch {}
      throw new Error(`Could not start isolated Postgres: ${error.stderr?.toString() || error.message}\n${serverLog}`, { cause: error });
    }
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.daily_slate(date text,league text,commence_time timestamptz,bdl_game_id bigint,game_status text,ml_home integer); GRANT SELECT ON public.daily_slate TO service_role;`);
    for (const name of ['20260904203500_winners_admissions.sql', '20260904203650_winners_review_recovery.sql', '20260904205218_winners_prop_cohort_reservations.sql', '20260908150211_mlb_gary_winners_selection.sql', '20260908172215_mlb_winners_review_prerequisites.sql', '20260909133844_winners_underdog_admission.sql', '20260912133639_winners_daily_curation.sql', '20260912133808_winners_curation_review_queue.sql', '20260912143745_winners_required_window_coverage.sql']) migration(name);
    sql(`CREATE TABLE public.game_results(game_date date,league text,game_id text,pick_text text,result text,created_at timestamptz default now(),updated_at timestamptz default now());
      CREATE TABLE public.nfl_results(game_date date,game_id text,pick_text text,result text,season_type integer,created_at timestamptz default now(),updated_at timestamptz default now());
      CREATE TABLE public.prop_results(game_date date,sport text,game_id text,player_name text,prop_type text,line_value numeric,bet text,result text,created_at timestamptz default now(),updated_at timestamptz default now());
      GRANT SELECT ON public.game_results,public.nfl_results,public.prop_results TO service_role;`);
    migration('20260916161803_winners_simulated_bankroll.sql');
    migration('20260917011158_winners_daily_props.sql');
    migration('20260917012429_winners_props_monitoring.sql');
    // Stubs for what the gate migration references outside this chain.
    sql(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key, created_at timestamptz default now());
      CREATE TABLE public.push_tokens(id uuid default gen_random_uuid() primary key, device_token text, platform text, active boolean default true, identity_id text);
      CREATE TABLE public.user_entitlements(id bigint generated always as identity primary key, installation_id text, product_key text, status text, expires_at timestamptz, livemode boolean default true);
      CREATE TABLE public.winners_big_games(id bigint generated always as identity primary key, game_date text, league text, game_id text, matchup text, reason text, decided_at timestamptz default now(), unique(game_date,league));
      CREATE TABLE public.winners_reasons(candidate_id bigint primary key references public.winners_candidates(id) on delete cascade, reasons jsonb not null, model text, job_id uuid, created_at timestamptz default now());
      GRANT ALL ON public.winners_big_games, public.winners_reasons, public.push_tokens, public.user_entitlements TO service_role;`);
    migration('20260924210000_winners_gate.sql');
  }, 60000);
  afterAll(() => { if (started) execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop'], { env: pgEnv, stdio: 'ignore' }); if (directory) rmSync(directory, { recursive: true, force: true }); });
  beforeEach(() => sql('TRUNCATE public.game_results,public.nfl_results,public.prop_results,public.winners_decision_events,public.winners_board,public.winners_candidates,public.winners_big_games,public.winners_reasons,public.push_tokens,public.user_entitlements,auth.users'));

  it('admits Gary play + clear at his stake, and Gary play + lean', () => {
    seed(1, 'game', play(400));
    expect(finish(claim(), 'clear')).toMatchObject({ stored: true, admitted: true, why: 'admitted' });
    expect(Number(sql('SELECT stake_units FROM public.winners_board WHERE candidate_id=1'))).toBe(4);
    expect(sql('SELECT reason FROM public.winners_board WHERE candidate_id=1')).toBe('Gary plays it, $400; reader: clear');
    expect(sql('SELECT count(*) FROM public.winners_reasons WHERE candidate_id=1')).toBe('1');
    seed(2, 'game', play(100));
    expect(finish(claim(), 'lean')).toMatchObject({ admitted: true });
  });
  it('never admits toss-up, a pass, a missing bet, or unsupported', () => {
    seed(3, 'game', play(300)); expect(finish(claim(), 'toss_up')).toMatchObject({ admitted: false, why: 'grade_toss_up' });
    seed(4, 'game', '{"gary_bet":{"play":false,"why":"no"}}'); expect(finish(claim(), 'clear')).toMatchObject({ admitted: false, why: 'gary_pass' });
    seed(5, 'game'); expect(finish(claim(), 'clear')).toMatchObject({ admitted: false, why: 'gary_pass' });
    seed(6, 'game', play(300)); expect(finish(claim(), 'unsupported')).toMatchObject({ admitted: false, why: 'unsupported' });
    expect(sql('SELECT count(*) FROM public.winners_board')).toBe('0');
    expect(sql(`SELECT count(*) FROM public.winners_decision_events WHERE event='not_admitted'`)).toBe('4');
  });
  it('the big game goes on at $100 on a pass or a toss-up, never when unsupported', () => {
    sql(`INSERT INTO public.winners_big_games(game_date,league,game_id) VALUES('${day}','MLB','g7')`);
    seed(7, 'game', '{"gary_bet":{"play":false}}'); expect(finish(claim(), 'toss_up')).toMatchObject({ admitted: true });
    expect(Number(sql('SELECT stake_units FROM public.winners_board WHERE candidate_id=7'))).toBe(1);
    expect(sql('SELECT reason FROM public.winners_board WHERE candidate_id=7')).toBe('Big game; reader: toss_up');
    sql(`UPDATE public.winners_big_games SET game_id='g8'`);
    seed(8, 'game', play(500)); expect(finish(claim(), 'unsupported')).toMatchObject({ admitted: false, why: 'unsupported' });
  });
  it('props admit on play + any grade but unsupported; a game and its prop both admit', () => {
    seed(9, 'game', play(200));
    finish(claim(), 'clear');
    sql(`INSERT INTO public.winners_candidates(id,game_date,league,kind,game_id,ticket_key,market_key,pick_text,odds,commence_time,pick_snapshot,evidence_snapshot,policy_version,status,created_at)
      OVERRIDING SYSTEM VALUE VALUES(10,'${day}','MLB','prop','g9','t10','m10','Tarik Skubal over pitcher_outs 17.5 @ -120',-120,now()+interval '3 hours','${play(150)}'::jsonb||'{"player":"Tarik Skubal","bet":"over","prop":"pitcher_outs 17.5","line":17.5}','{"deskText":"x","observedAt":"2026-09-25T10:00:00Z"}','exact-ticket-v2','pending',now()-interval '2 minutes')`);
    const propRow = claim();
    expect(finish(propRow, 'toss_up')).toMatchObject({ admitted: true });
    expect(sql(`SELECT count(*) FROM public.winners_board WHERE game_id='g9'`)).toBe('2');
    seed(11, 'prop', play(150)); expect(finish(claim(), 'unsupported')).toMatchObject({ admitted: false });
  });
  it('allows any stake above $100, trims to cash on hand, and floors a $50 ask to $100', () => {
    seed(12, 'game', play(2500)); finish(claim(), 'clear');
    expect(Number(sql('SELECT stake_units FROM public.winners_board WHERE candidate_id=12'))).toBe(25);
    seed(13, 'game', play(9000, 'the rest')); finish(claim(), 'clear');
    expect(Number(sql('SELECT stake_units FROM public.winners_board WHERE candidate_id=13'))).toBe(75);
    seed(14, 'game', play(50)); expect(finish(claim(), 'clear')).toMatchObject({ admitted: false, why: 'gary_pass' });
    seed(15, 'game', play(100)); finish(claim(), 'clear');
    expect(Number(sql('SELECT stake_units FROM public.winners_board WHERE candidate_id=15'))).toBe(0);
    expect(sql(`SELECT detail->>'adjustment' FROM public.winners_decision_events WHERE candidate_id=15 AND event='bankroll_committed'`)).toContain('exhausted');
  });
  it('shows Gary the cash on hand and what is already out', () => {
    seed(16, 'game', play(400)); finish(claim(), 'clear');
    const cash = JSON.parse(svc('SELECT public.winners_cash_position()'));
    expect(cash.cash_on_hand_dollars).toBe(9600);
    expect(cash.open_plays).toEqual([expect.objectContaining({ pick_text: 'Tigers ML -134', stake_dollars: 400, kind: 'game' })]);
  });
  it('a read after kickoff is expired and never admits; a failed read is retried once', () => {
    seed(17, 'game', play(100)); const r = claim();
    sql('UPDATE public.winners_candidates SET commence_time=now()-interval \'1 minute\' WHERE id=17');
    expect(finish(r, 'clear')).toMatchObject({ status: 'expired', admitted: false });
    seed(18, 'game', play(100)); const first = claim();
    expect(finish(first, null)).toMatchObject({ status: 'unavailable', admitted: false });
    sql('UPDATE public.winners_candidates SET reviewed_at=now()-interval \'3 minutes\' WHERE id=18');
    const second = claim(); expect(second.id).toBe(18); expect(second.attempts).toBe(2);
    expect(finish(second, 'clear')).toMatchObject({ admitted: true });
    expect(svc('SELECT count(*) FROM public.claim_winners_read()')).toBe('0');
  });
  it('the sweep admits a graded candidate whose bet arrived after the read', () => {
    seed(19, 'game'); expect(finish(claim(), 'clear')).toMatchObject({ admitted: false, why: 'gary_pass' });
    sql(`UPDATE public.winners_candidates SET pick_snapshot='${play(300)}'::jsonb WHERE id=19`);
    expect(svc(`SELECT public.admit_winners_pending('${day}')`)).toBe('1');
    expect(Number(sql('SELECT stake_units FROM public.winners_board WHERE candidate_id=19'))).toBe(3);
    expect(svc(`SELECT public.admit_winners_pending('${day}')`)).toBe('0');
  });
  it('a scratched play is void in the ledger, once, and never after kickoff', () => {
    seed(20, 'game', play(400)); finish(claim(), 'clear');
    expect(svc(`SELECT public.scratch_winners_play(20,'Skubal inactive')`)).toBe('t');
    expect(sql('SELECT result FROM gary_private.bankroll_ledger WHERE candidate_id=20')).toBe('void');
    expect(svc(`SELECT public.scratch_winners_play(20,'again')`)).toBe('f');
    const line = JSON.parse(svc(`SELECT * FROM public.winners_ledger_lines('${day}')`));
    expect(line).toMatchObject({ scratched: true, gary_play: true, stake_dollars: 400, grade: 'clear', price_band: 'fav to -149' });
    seed(21, 'game', play(100)); finish(claim(), 'clear');
    // Test scaffolding only: an admitted candidate is immutable in production.
    sql('ALTER TABLE public.winners_candidates DISABLE TRIGGER ALL; UPDATE public.winners_candidates SET commence_time=now()-interval \'1 minute\' WHERE id=21; ALTER TABLE public.winners_candidates ENABLE TRIGGER ALL');
    expect(svc(`SELECT public.scratch_winners_play(21,'late')`)).toBe('f');
  });
  it('members: everyone during the preview, then founding accounts and live entitlements', () => {
    sql(`INSERT INTO public.push_tokens(device_token,active,identity_id) VALUES('anon-device',true,null),('paid-device',true,'11111111-1111-1111-1111-111111111111'),('dead-device',false,'11111111-1111-1111-1111-111111111111');
      INSERT INTO public.user_entitlements(installation_id,product_key,status) VALUES('11111111-1111-1111-1111-111111111111','ALL','active');`);
    const tokens = svc(`SELECT string_agg(t,',' ORDER BY t) FROM public.winners_push_devices('MLB') t`);
    expect(tokens).toBe('anon-device,paid-device');
  });
  it('the old window claims are silent from the gate date and anon can call nothing', () => {
    expect(svc(`SELECT count(*) FROM public.claim_winners_curation('${day}','MLB')`)).toBe('0');
    expect(svc(`SELECT count(*) FROM public.claim_winners_props('${day}')`)).toBe('0');
    expect(svc(`SELECT public.ensure_winners_window_coverage('${day}','MLB')`)).toBe('0');
    expect(() => sql('SET ROLE anon; SELECT public.claim_winners_read()')).toThrow();
    expect(() => sql('SET ROLE anon; SELECT public.winners_cash_position()')).toThrow();
  });
});
