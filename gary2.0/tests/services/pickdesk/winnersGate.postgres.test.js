import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// WINNERS ADMISSION on an isolated local Postgres, as the migrations left it on Oct 13 2026 (GARY'S CARD and
// HIS CUT, 20261012233000 + 20261013001500). An ordinary game pick is on the board only when Gary's latest cut
// (the book he names at each card placement) includes it, 20 to 75 minutes before its own kickoff, once the
// card holds a pick (two before Oct 13 2026, when the first pick began answering its own book), at his bet-step amount; a seated pass takes the number ask. The judge reads big games
// only, and a big game is on at his number whatever the judge said. Props are the Sep 16 selection
// (daily-props-v1); the daily floor books the top of the card. The Sep 24 gate (play + grade) and the Oct 8-11
// judge gates are retired for ordinary game picks, so nothing here admits on a grade.
const pgEnv = { ...process.env, LC_ALL: 'C' };
let bin = process.env.GARY_TEST_PG_BIN;
if (!bin) { try { bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim(); } catch { bin = ''; } }
const missing = ['initdb', 'pg_ctl', 'psql', 'postgres'].filter((name) => { if (!bin) return true; try { accessSync(path.join(bin, name), constants.X_OK); return false; } catch { return true; } });
const supported = missing.length === 0;
if (!supported) {
  const message = `Isolated Postgres tests need executable ${missing.join(', ')}. Set GARY_TEST_PG_BIN to the server binary directory.`;
  if (process.env.GARY_TEST_PG_BIN || process.env.CI === 'true' || process.env.CI === '1') throw new Error(message);
  console.warn(`Skipping the Winners admission contract: ${message}`);
}
let directory; let started = false;
// Today's ET date from the database's own clock: the bankroll sizes only games on or after the day it started
// (the migration run), and the props selection claims only today's windows.
let day;
const PORT = '55441';
const args = () => ['-h', directory, '-p', PORT, '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = (s) => execFileSync(`${bin}/psql`, [...args(), '-c', s], { env: pgEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
// As the worker: psql echoes the SET tag first; the rows follow.
const svcRows = (s) => sql(`SET ROLE service_role; ${s}`).split('\n').slice(1).filter(Boolean);
const svc = (s) => svcRows(s).pop() ?? '';
const json = (line) => (line ? JSON.parse(line) : null);
// lenient: the darts migration's SQL-language functions read the lab helpers (20260922000000_winners_lab.sql, a
// much wider chain); their bodies are not checked at creation, the view and triggers still are.
const migration = (name, { lenient = false } = {}) => sql(`${lenient ? 'SET check_function_bodies=off; ' : ''}${readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8')}`);

const play = (dollars, why = 'I like it') => JSON.stringify({ gary_bet: { play: true, stake_dollars: dollars, why } }).replace(/'/g, "''");
// The bet parser (garyBet.js) records a pass, or an answer under the $100 minimum, exactly like this.
const pass = (why = 'no') => JSON.stringify({ gary_bet: { play: false, stake_dollars: null, why } });
const seed = (id, snapshot = '{}', { league = 'NFL', minutes = 60, gameId = `g${id}` } = {}) => sql(`INSERT INTO public.winners_candidates(id,game_date,league,kind,game_id,ticket_key,market_key,pick_text,odds,commence_time,pick_snapshot,evidence_snapshot,policy_version,status,created_at)
  OVERRIDING SYSTEM VALUE VALUES(${id},'${day}','${league}','game','${gameId}','t${id}','m${id}','${league === 'NFL' ? 'Bills -2.5 -110' : 'Tigers ML -134'}',${league === 'NFL' ? -110 : -134},now()+interval '${minutes} minutes','${snapshot}'::jsonb,'{"deskText":"x","observedAt":"2026-10-13T10:00:00Z"}','exact-ticket-v2','pending',now()-interval '2 minutes')`);
const kickoff = (id, minutes) => sql(`UPDATE public.winners_candidates SET commence_time=now()+interval '${minutes} minutes' WHERE id=${id}`);
const board = (id) => json(sql(`SELECT row_to_json(b) FROM public.winners_board b WHERE candidate_id=${id}`));
const stake = (id) => Number(sql(`SELECT stake_units FROM public.winners_board WHERE candidate_id=${id}`));
const events = (id, event) => Number(sql(`SELECT count(*) FROM public.winners_decision_events WHERE candidate_id=${id} AND event='${event}'`));
const gate = (id) => sql(`SELECT gary_private.admit_winners_candidate(${id})`);
// The card (garyCard.js → card_place) and the Winners worker's passes (seat_the_card, admit_winners_pending).
const place = (id, { above = null, slot = null, size = 0, book = null, why = 'I like it' } = {}) => json(svc(`SELECT public.card_place(${id},${above ?? 'NULL'},${slot ?? 'NULL'},${size},'${why}',false,true,'test-model',${book === null ? 'NULL::bigint[]' : book.length ? `ARRAY[${book.join(',')}]::bigint[]` : "'{}'::bigint[]"})`));
const cardOrder = () => sql(`SELECT string_agg(candidate_id||':'||rank,',' ORDER BY rank) FROM gary_private.card_order('${day}')`);
// The worker runs the late-news check (lateNews.js) before it seats; here every pick clears it unless a test says so.
const clearNews = () => sql(`INSERT INTO public.winners_late_news(candidate_id,game_date,league,game_id,decision) SELECT id,game_date,league,game_id,'clear' FROM public.winners_candidates WHERE kind='game' ON CONFLICT (candidate_id) DO NOTHING`);
const seat = ({ check = true } = {}) => { if (check) clearNews(); return Number(svc(`SELECT public.seat_the_card('${day}')`)); };
const sweep = () => Number(svc(`SELECT public.admit_winners_pending('${day}')`));
// The number ask (garyBigGameStake.js).
const asks = () => svcRows(`SELECT id FROM public.claim_big_game_stakes('${day}')`).map(Number);
const number = (id, dollars, why = 'the house plays it') => json(svc(`SELECT public.set_big_game_stake(${id},${dollars},'${why}','test-model')`));
// The judge (winnersReader.js).
const bigGame = (gameId, league = 'NFL') => sql(`INSERT INTO public.winners_big_games(game_date,league,game_id) VALUES('${day}','${league}','${gameId}')`);
const claim = () => json(svcRows(`SELECT row_to_json(r) FROM public.claim_winners_read() r`)[0]);
const finish = (r, grade) => json(svc(`SELECT public.finish_winners_read(${r.id},${r.attempts},${grade === null ? 'NULL' : `'${grade}'`},'{"reason":"the record shows it","opposing_case":"the pen"}','[{"claim":"a","why":"b"},{"claim":"c","why":"d"}]','test-model',1)`));
// The props selection (winnersProps.js): a slate game, its published prop, the reader's side-by-side reading.
const slate = (gameId, minutes = 50) => sql(`INSERT INTO public.daily_slate(date,league,away_team,home_team,commence_time,bdl_game_id,game_status) VALUES('${day}','MLB','Tigers','Guardians',date_trunc('minute',now())+interval '${minutes} minutes',${gameId},'scheduled')`);
const seedProp = (id, gameId, player) => sql(`INSERT INTO public.winners_candidates(id,game_date,league,kind,game_id,ticket_key,market_key,pick_text,odds,commence_time,pick_snapshot,evidence_snapshot,policy_version,status,created_at)
  OVERRIDING SYSTEM VALUE SELECT ${id},'${day}','MLB','prop','${gameId}','t${id}','m${id}','${player} over pitcher_outs 17.5 @ -120',-120,s.commence_time,
   jsonb_build_object('player','${player}','bet','over','prop','pitcher_outs 17.5','line','17.5','rationale','${player} has gone 18 outs or more in nine straight starts.'),
   jsonb_build_object('deskText','${player} has gone 18 outs or more in nine straight starts, the record shows it.','observedAt',now()-interval '1 hour'),
   'exact-ticket-v2','pending',now()-interval '2 minutes' FROM public.daily_slate s WHERE s.bdl_game_id=${gameId}`);
const claimProps = () => json(svcRows(`SELECT row_to_json(r) FROM public.claim_winners_props('${day}') r`)[0]);
const reading = (id, over = {}) => ({ candidate_id: id, rank: 1, selected: true, assessment: 'lean', reason: 'the record shows it plainly', opposing_case: 'the pen is thin', price_reason: 'the price is fair for it', stake_dollars: 150, stake_reason: 'a lean at a fair price', source_quote: 'nine straight starts', rationale_quote: '18 outs or more', ...over });
const finishProps = (run, readings) => json(svc(`SELECT public.finish_winners_props(${run.id},${run.attempts},'${JSON.stringify({ summary: 'the props compared', ranked_candidates: readings }).replace(/'/g, "''")}','test-model',1)`));
const admitProp = (id, player) => { slate(id); seedProp(id, String(id), player); return finishProps(claimProps(), [reading(id)]); };

describe.skipIf(!supported)('Winners admission: the card, the book, big games, props, the floor', () => {
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
    // Supabase gives the worker's role every table and sequence in public by default; the migrations revoke
    // from anon and authenticated by hand, and functions stay callable by anyone until a migration revokes them.
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
      CREATE TABLE public.daily_slate(id bigserial primary key,date date not null,league text not null,away_team text,home_team text,commence_time timestamptz,bdl_game_id bigint,game_status text,ml_home numeric);`);
    migration('20260903_winners_big_games.sql');
    for (const name of ['20260904203500_winners_admissions.sql', '20260904203650_winners_review_recovery.sql', '20260904205218_winners_prop_cohort_reservations.sql', '20260908150211_mlb_gary_winners_selection.sql', '20260908172215_mlb_winners_review_prerequisites.sql', '20260909133844_winners_underdog_admission.sql', '20260912133639_winners_daily_curation.sql', '20260912133808_winners_curation_review_queue.sql', '20260912143745_winners_required_window_coverage.sql']) migration(name);
    sql(`CREATE TABLE public.game_results(game_date date,league text,game_id text,pick_text text,result text,created_at timestamptz default now(),updated_at timestamptz default now());
      CREATE TABLE public.nfl_results(game_date date,game_id text,pick_text text,result text,season_type integer,created_at timestamptz default now(),updated_at timestamptz default now());
      CREATE TABLE public.prop_results(game_date date,sport text,game_id text,player_name text,prop_type text,line_value numeric,bet text,result text,created_at timestamptz default now(),updated_at timestamptz default now());`);
    migration('20260916161803_winners_simulated_bankroll.sql');
    migration('20260917011158_winners_daily_props.sql');
    migration('20260917012429_winners_props_monitoring.sql');
    // Stubs for what the chain references outside itself: Supabase auth, the push and entitlement tables, the
    // reasons table (its own migration queues subscription jobs), pg_cron (the floor schedules itself), and the
    // darts table the bankroll ledger reads since Oct 8.
    sql(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key, created_at timestamptz default now());
      CREATE TABLE public.daily_picks(id uuid default gen_random_uuid() primary key, date text, picks jsonb);
      CREATE TABLE public.weekly_nfl_picks(id uuid default gen_random_uuid() primary key, week_start date, picks jsonb);
      CREATE TABLE public.push_tokens(id uuid default gen_random_uuid() primary key, device_token text, platform text, active boolean default true, identity_id text);
      CREATE TABLE public.user_entitlements(id bigint generated always as identity primary key, installation_id text, product_key text, status text, expires_at timestamptz, livemode boolean default true);
      CREATE TABLE public.winners_reasons(candidate_id bigint primary key references public.winners_candidates(id) on delete cascade, reasons jsonb not null, model text, job_id uuid, created_at timestamptz default now());
      CREATE SCHEMA cron; CREATE TABLE cron.job(jobid bigint generated always as identity, jobname text, schedule text, command text);
      CREATE FUNCTION cron.schedule(jobname text, schedule text, command text) RETURNS bigint LANGUAGE sql AS 'INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) RETURNING jobid';
      CREATE TABLE public.darts(id bigserial primary key, game_date date, league text, kind text, player text, team text, position text, matchup text, game_id text, commence_time timestamptz, prop text, bet text, odds integer, book text, model text, reason text, rank integer, result text, actual numeric, graded_at timestamptz, scratched_at timestamptz, scratch_reason text);`);
    // The Winners chain from the Sep 24 gate to the Oct 13 cut, in the order it was applied.
    for (const name of ['20260924210000_winners_gate.sql', '20260924215000_winners_gate_cutover.sql', '20260925115442_winners_prop_only_scratch.sql',
      '20260926123424_day_pass_weekend_first_wave.sql', '20260926140000_gary_bankroll_days.sql', '20260926150000_winners_no_big_spreads.sql',
      '20260926150500_winners_gate_scratch.sql', '20260926151500_winners_ncaaf_clear_or_over_300.sql', '20260927013414_winners_props_clear_or_300.sql',
      '20260929140000_gary_bankroll_days_by_game_date.sql', '20261001195547_big_games_free_pick.sql', '20261004132225_sunday_free_picks.sql',
      '20261008150000_winners_september_system.sql', '20261008173000_winners_coach.sql']) migration(name);
    migration('20261008180000_darts_on_winners.sql', { lenient: true });
    for (const name of ['20261008213000_winners_big_game_stake.sql', '20261008221500_winners_judge_decides.sql', '20261009121500_props_lane_ignores_darts.sql',
      '20261009210000_winners_daily_floor.sql', '20261009223000_winners_college_like_nfl.sql', '20261010090000_winners_clear_only.sql',
      '20261012233000_winners_card.sql', '20261013001500_winners_card_cut.sql', '20261013040000_winners_card_first_pick.sql']) migration(name);
    migration('20261013150000_late_news.sql');
    day = sql(`SELECT to_char(clock_timestamp() AT TIME ZONE 'America/New_York','YYYY-MM-DD')`);
  }, 60000);
  afterAll(() => { if (started) execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop'], { env: pgEnv, stdio: 'ignore' }); if (directory) rmSync(directory, { recursive: true, force: true }); });
  beforeEach(() => sql('TRUNCATE public.game_results,public.nfl_results,public.prop_results,public.winners_decision_events,public.winners_board,public.winners_card_placements,public.winners_card_turns,public.winners_prop_selection_runs,public.darts,public.winners_late_news,public.winners_candidates,public.winners_big_games,public.winners_reasons,public.push_tokens,public.user_entitlements,public.daily_slate,public.daily_picks,public.weekly_nfl_picks,auth.users'));

  it('the judge never reads an ordinary game pick; the first pick answers its own book and a card of one seats (Oct 13 2026)', () => {
    seed(1, play(400));
    expect(claim()).toBeNull();
    expect(gate(1)).toBe('not_seated');
    expect(sweep()).toBe(0);
    // The day's first pick takes slot 1 and answers only its book; a card of one seats in its window (Sunday's
    // London game could never seat when the card needed two).
    expect(place(1, { book: [1] })).toMatchObject({ placed: true, slot: 1, of: 1 });
    expect(seat()).toBe(1);
    expect(board(1)).toMatchObject({ policy_version: 'winners-card-v1', reason: "Gary's book: #1 of 1 on his card; Gary plays it, $400", league: 'NFL', kind: 'game' });
    seed(2, play(250));
    const second = place(2, { above: 1, slot: 1, size: 1, book: [2, 1] });
    expect(second).toMatchObject({ placed: true, slot: 1, of: 2 });
    expect([...second.book].sort()).toEqual([1, 2]);
    expect(cardOrder()).toBe('2:1,1:2');
    expect(seat()).toBe(1);
    expect(board(2)).toMatchObject({ policy_version: 'winners-card-v1', reason: "Gary's book: #1 of 2 on his card; Gary plays it, $250", league: 'NFL', kind: 'game' });
    expect(stake(2)).toBe(2.5); expect(stake(1)).toBe(4);
    expect(events(1, 'card_seated')).toBe(1);
    expect(sql(`SELECT detail->>'gate' FROM public.winners_decision_events WHERE candidate_id=1 AND event='admitted'`)).toBe('card');
    expect(seat()).toBe(0);
    expect(gate(1)).toBe('already');
  });
  it('the cut decides: a pick outside his book never seats, a seat is final, a placed pick stays in the book', () => {
    seed(3, play(300)); place(3);
    seed(4, play(300)); expect(place(4, { slot: 2, size: 1, book: [4] }).book).toEqual([4]);
    expect(seat()).toBe(1);
    expect(board(4)).toMatchObject({ reason: "Gary's book: #2 of 2 on his card; Gary plays it, $300" });
    expect(board(3)).toBeNull(); expect(events(3, 'card_seated')).toBe(0);
    // The next cut drops 4 and names 3: 3 seats, 4 stays on the board, 5 (not in the book) never seats.
    seed(5, play(300)); expect([...place(5, { slot: 3, size: 2, book: [3] }).book].sort()).toEqual([3, 4]);
    expect(seat()).toBe(1);
    expect(board(3)).toMatchObject({ reason: "Gary's book: #1 of 3 on his card; Gary plays it, $300" });
    expect(sql('SELECT count(*) FROM public.winners_board')).toBe('2');
    expect(board(5)).toBeNull(); expect(events(5, 'card_seated')).toBe(0);
    // An empty book keeps every placed pick; an id not on today's card is dropped.
    seed(6, play(300)); expect([...place(6, { slot: 4, size: 3, book: [] }).book].sort()).toEqual([3, 4]);
    seed(7, play(300)); expect([...place(7, { slot: 5, size: 4, book: [999, 6] }).book].sort()).toEqual([3, 4, 6]);
    expect(place(7, { slot: 5, size: 4 })).toMatchObject({ placed: false, why: 'already' });
    const state = json(svc(`SELECT public.card_state('NFL','g7')`));
    expect(state).toMatchObject({ found: true, candidate_id: 7, placed: true });
    expect(state.card.map((c) => [c.candidate_id, c.slot, c.in_book, c.placed])).toEqual([[3, 1, true, true], [4, 2, true, true], [5, 3, false, false], [6, 4, true, false]]);
  });
  it('a seat waits for the window, 20 to 75 minutes before kickoff, and the sweep never seats', () => {
    seed(8, play(200), { minutes: 180 }); seed(9, play(200), { minutes: 15 });
    place(8); place(9, { slot: 2, size: 1, book: [8, 9] });
    expect(seat()).toBe(0); expect(sweep()).toBe(0);
    expect(events(8, 'card_seated') + events(9, 'card_seated')).toBe(0);
    kickoff(8, 76); kickoff(9, 20);
    expect(seat()).toBe(0);
    kickoff(8, 74); kickoff(9, 21);
    expect(seat()).toBe(2);
    expect(sql('SELECT count(*) FROM public.winners_board')).toBe('2');
  });
  it('late news (Oct 13 2026): no check, no seat; a scratch never seats, never admits a big game, and scratches a board ticket', () => {
    seed(1, play(300));
    expect(place(1, { book: [1] }).placed).toBe(true);
    expect(seat({ check: false })).toBe(0);                       // the check has not run
    sql(`INSERT INTO public.winners_late_news(candidate_id,game_date,league,game_id,decision,why) VALUES(1,'${day}','NFL','g1','scratch','His QB is out.')`);
    expect(seat()).toBe(0);                                       // scratched: never seats
    expect(gate(1)).toBe('late_news_scratched');
    seed(2, play(300), { gameId: 'g2' });
    bigGame('g2');
    sql(`UPDATE public.winners_candidates SET status='graded', review='{"assessment":"clear"}' WHERE id=2`);
    expect(gate(2)).toBe('admitted');                             // a big game on before its check
    // The published pick stays in the app, marked scratched with his reason (daily and weekly NFL rows).
    const published = `'[{"game_id":"g9","pick":"Other -1 -110"},{"bdl_game_id":"g2","pick":"Bills -2.5 -110"}]'::jsonb`;
    sql(`INSERT INTO public.daily_picks(date,picks) VALUES('${day}',${published}); INSERT INTO public.weekly_nfl_picks(week_start,picks) VALUES('${day}'::date - 2,${published})`);
    const out = json(svc(`SELECT public.scratch_game_pick(2,'Ruled out at the inactives.')`));
    expect(out).toMatchObject({ ok: true, daily_rows: 1, weekly_rows: 1, board: true });
    expect(sql(`SELECT picks->1->>'scratch_reason' FROM public.daily_picks`)).toBe('Ruled out at the inactives.');
    expect(sql(`SELECT coalesce(picks->0->>'scratched_at','none') FROM public.weekly_nfl_picks`)).toBe('none');
    expect(sql(`SELECT (picks->1->>'scratched_at') IS NOT NULL FROM public.weekly_nfl_picks`)).toBe('t');
    expect(board(2).scratch_reason).toBe('Late news: Ruled out at the inactives.');
    expect(events(2, 'late_news_scratched')).toBe(1);
  });

  it('a seated pick he passed takes the number ask; nothing under $100 is ever booked', () => {
    seed(10, pass()); seed(11, pass('not this one'));
    place(10); place(11, { slot: 2, size: 1, book: [10, 11] });
    expect(seat()).toBe(0);
    expect(events(10, 'card_seated')).toBe(1); expect(events(10, 'needs_gary_number')).toBe(1);
    expect(events(11, 'needs_gary_number')).toBe(1);
    expect(sql('SELECT count(*) FROM public.winners_board')).toBe('0');
    expect(asks()).toEqual([10, 11]);
    expect(number(10, 150)).toMatchObject({ stored: true, admitted: true, why: 'admitted' });
    expect(board(10)).toMatchObject({ policy_version: 'winners-card-v1', reason: "Gary's book: #1 of 2 on his card, Gary's number: $150" });
    expect(stake(10)).toBe(1.5);
    expect(sql(`SELECT detail->>'forced' FROM public.winners_decision_events WHERE candidate_id=10 AND event='admitted'`)).toBe('true');
    expect(number(11, 50)).toMatchObject({ stored: false, why: 'stake_under_100' });
    expect(number(11, 100)).toMatchObject({ stored: true, admitted: true });
    expect(number(10, 200)).toMatchObject({ stored: false, why: 'already' });
    seed(12, pass()); expect(number(12, 100)).toMatchObject({ stored: false, why: 'not_asked' });
    expect(asks()).toEqual([]);
    // A seated pass whose number arrives through the bet step (the pick runner) is booked by the next seating pass.
    seed(13, pass()); place(13, { slot: 3, size: 2, book: [13] });
    expect(seat()).toBe(0); expect(events(13, 'needs_gary_number')).toBe(1);
    sql(`UPDATE public.winners_candidates SET pick_snapshot='${play(300)}'::jsonb WHERE id=13`);
    expect(seat()).toBe(1);
    expect(board(13)).toMatchObject({ reason: "Gary's book: #3 of 3 on his card; Gary plays it, $300" });
  });
  it('big games: the judge reads them, and the pick is on at his number whatever the judge said', () => {
    seed(14, play(400), { minutes: 60 });            // an ordinary pick, kicking off first: never claimed
    bigGame('g15'); seed(15, play(400), { minutes: 180 });
    expect(gate(15)).toBe('unread');
    const r = claim(); expect(r.id).toBe(15); expect(r.attempts).toBe(1);
    expect(finish(r, 'toss_up')).toMatchObject({ stored: true, status: 'graded', admitted: true, why: 'admitted' });
    expect(board(15)).toMatchObject({ policy_version: 'winners-coach-v1', reason: 'Big game; Gary plays it, $400; judge: toss_up' });
    expect(stake(15)).toBe(4);
    expect(sql('SELECT count(*) FROM public.winners_reasons WHERE candidate_id=15')).toBe('1');
    expect(claim()).toBeNull();
    // Unsupported, and Gary passed: still on, at the number he gives the ask.
    bigGame('g16'); seed(16, pass());
    expect(finish(claim(), 'unsupported')).toMatchObject({ admitted: false, why: 'needs_gary_number' });
    expect(asks()).toEqual([16]);
    expect(number(16, 100, 'the house plays it')).toMatchObject({ admitted: true });
    expect(board(16)).toMatchObject({ policy_version: 'winners-coach-v1', reason: "Big game, Gary's number: $100; judge: unsupported" });
    // The sweep books a big game whose bet arrived after the read.
    bigGame('g17'); seed(17);
    expect(finish(claim(), 'lean')).toMatchObject({ admitted: false, why: 'needs_gary_number' });
    sql(`UPDATE public.winners_candidates SET pick_snapshot='${play(300)}'::jsonb WHERE id=17`);
    expect(sweep()).toBe(1);
    expect(board(17)).toMatchObject({ reason: 'Big game; Gary plays it, $300; judge: lean' });
    expect(sweep()).toBe(0);
  });
  it('a read after kickoff is expired and never admits; a failed read is retried once', () => {
    bigGame('g18'); seed(18, play(100)); const r = claim();
    kickoff(18, -1);
    expect(finish(r, 'clear')).toMatchObject({ status: 'expired', admitted: false });
    bigGame('g19'); seed(19, play(100)); const first = claim(); expect(first.id).toBe(19);
    expect(finish(first, null)).toMatchObject({ status: 'unavailable', admitted: false });
    sql('UPDATE public.winners_candidates SET reviewed_at=now()-interval \'3 minutes\' WHERE id=19');
    const second = claim(); expect(second.id).toBe(19); expect(second.attempts).toBe(2);
    expect(finish(second, 'clear')).toMatchObject({ admitted: true });
    expect(claim()).toBeNull();
  });
  it('allows any stake above $100, trims to cash on hand, and books a $100 ask at $0 when the cash is out', () => {
    seed(20, play(2500)); seed(21, play(9000, 'the rest')); seed(22, play(100));
    place(20); place(21, { slot: 2, size: 1, book: [20, 21] }); place(22, { slot: 3, size: 2, book: [20, 21, 22] });
    expect(seat()).toBe(3);
    expect(stake(20)).toBe(25);
    expect(stake(21)).toBe(75);
    expect(sql(`SELECT detail->>'adjustment' FROM public.winners_decision_events WHERE candidate_id=21 AND event='bankroll_committed'`)).toContain('Reduced');
    expect(stake(22)).toBe(0);
    expect(sql(`SELECT detail->>'adjustment' FROM public.winners_decision_events WHERE candidate_id=22 AND event='bankroll_committed'`)).toContain('exhausted');
  });
  it('shows Gary the cash on hand and what is already out', () => {
    seed(23, play(400)); seed(24, pass());
    place(23); place(24, { slot: 2, size: 1, book: [23] });
    expect(seat()).toBe(1);
    const cash = json(svc('SELECT public.winners_cash_position()'));
    expect(cash.cash_on_hand_dollars).toBe(9600);
    expect(cash.open_plays).toEqual([expect.objectContaining({ pick_text: 'Bills -2.5 -110', stake_dollars: 400, kind: 'game', league: 'NFL' })]);
  });
  it('props: the reader selects clear and lean ones at its stake; the card never touches a prop; a game and its prop both admit', () => {
    slate(25); seedProp(25, '25', 'Tarik Skubal');
    expect(claim()).toBeNull();
    expect(gate(25)).toBe('props_selection');
    expect(place(25)).toMatchObject({ placed: false, why: 'not_a_game' });
    const run = claimProps();
    expect(run).toMatchObject({ attempts: 1, status: 'selecting' });
    expect(run.input_snapshot.candidates.map((c) => c.id)).toEqual([25]);
    expect(finishProps(run, [reading(25)])).toMatchObject({ completed: true, admitted: 1 });
    expect(board(25)).toMatchObject({ policy_version: 'daily-props-v1', kind: 'prop', reason: 'the record shows it plainly' });
    expect(stake(25)).toBe(1.5);
    expect(sql(`SELECT detail->>'stake_reason' FROM public.winners_decision_events WHERE candidate_id=25 AND event='bankroll_committed'`)).toBe('a lean at a fair price');
    // A toss-up cannot be selected: the whole reading fails and nothing is booked.
    seedProp(26, '25', 'Tyler Holton');
    expect(finishProps(claimProps(), [reading(26, { assessment: 'toss_up' })])).toMatchObject({ completed: false, reason: 'Unsupported or toss-up prop cannot enter Winners' });
    expect(board(26)).toBeNull();
    // Gary's game pick on the same game seats through his book beside the prop.
    seed(27, play(200), { league: 'MLB', gameId: '25' }); seed(28, play(200), { league: 'MLB' });
    place(27); place(28, { slot: 2, size: 1, book: [27, 28] });
    expect(seat()).toBe(2);
    expect(sql(`SELECT count(*) FROM public.winners_board WHERE game_id='25'`)).toBe('2');
  });
  it('a scratched prop is void in the ledger, once, never after kickoff; a game play is never scratched', () => {
    expect(admitProp(29, 'Tarik Skubal')).toMatchObject({ admitted: 1 });
    expect(svc(`SELECT public.scratch_winners_play(29,'Skubal inactive')`)).toBe('t');
    expect(sql('SELECT result FROM gary_private.bankroll_ledger WHERE candidate_id=29')).toBe('void');
    expect(svc(`SELECT public.scratch_winners_play(29,'again')`)).toBe('f');
    const line = json(svc(`SELECT * FROM public.winners_ledger_lines('${day}')`));
    expect(line).toMatchObject({ kind: 'prop', scratched: true, gary_play: false, stake_dollars: 150, grade: null, price_band: 'fav to -149' });
    seed(30, play(400)); seed(31, pass());
    place(30); place(31, { slot: 2, size: 1, book: [30] });
    expect(seat()).toBe(1);
    expect(svc(`SELECT public.scratch_winners_play(30,'inactive')`)).toBe('f');
    expect(board(30).scratched_at).toBeNull();
    expect(admitProp(32, 'Tyler Holton')).toMatchObject({ admitted: 1 });
    // Test scaffolding only: an admitted candidate is immutable in production.
    sql('ALTER TABLE public.winners_candidates DISABLE TRIGGER ALL; UPDATE public.winners_candidates SET commence_time=now()-interval \'1 minute\' WHERE id=32; ALTER TABLE public.winners_candidates ENABLE TRIGGER ALL');
    expect(svc(`SELECT public.scratch_winners_play(32,'late')`)).toBe('f');
  });
  it('the daily floor books the top of the card when nothing is on Winners by the day pass', () => {
    seed(33, play(300), { minutes: 30 }); seed(34, play(500), { minutes: 30 });
    place(33); place(34, { slot: 2, size: 1, book: [] });
    expect(seat()).toBe(0);
    expect(sql(`SELECT gary_private.winners_daily_floor('${day}')`)).toBe('admitted 33');
    expect(board(33)).toMatchObject({ policy_version: 'winners-floor-v1', reason: 'Daily floor: nothing else on Winners today. Gary plays it, $300; card: #1 of 2' });
    expect(stake(33)).toBe(3);
    expect(sql(`SELECT gary_private.winners_daily_floor('${day}')`)).toBe('has_play');
    expect(board(34)).toBeNull();
  });
  it('placements run one at a time: a three-minute lease on the day', () => {
    expect(svc(`SELECT public.card_claim_turn('${day}','a')`)).toBe('t');
    expect(svc(`SELECT public.card_claim_turn('${day}','b')`)).toBe('f');
    expect(svc(`SELECT public.card_claim_turn('${day}','a')`)).toBe('t');
    svc(`SELECT public.card_release_turn('${day}','a')`);
    expect(svc(`SELECT public.card_claim_turn('${day}','b')`)).toBe('t');
  });
  it('members: the preview ended Oct 1; founding accounts and live entitlements for ALL or the league', () => {
    sql(`INSERT INTO auth.users(id,created_at) VALUES('22222222-2222-2222-2222-222222222222','2026-09-15');
      INSERT INTO public.push_tokens(device_token,active,identity_id) VALUES('anon-device',true,null),('paid-device',true,'11111111-1111-1111-1111-111111111111'),('dead-device',false,'11111111-1111-1111-1111-111111111111'),('founder-device',true,'22222222-2222-2222-2222-222222222222'),('lapsed-device',true,'33333333-3333-3333-3333-333333333333'),('mlb-device',true,'44444444-4444-4444-4444-444444444444');
      INSERT INTO public.user_entitlements(installation_id,product_key,status,expires_at) VALUES('11111111-1111-1111-1111-111111111111','ALL','active',null),('33333333-3333-3333-3333-333333333333','NFL','active',now()-interval '1 day'),('44444444-4444-4444-4444-444444444444','MLB','active',null);`);
    expect(svc(`SELECT string_agg(t,',' ORDER BY t) FROM public.winners_push_devices('NFL') t`)).toBe('founder-device,paid-device');
    expect(svc(`SELECT string_agg(t,',' ORDER BY t) FROM public.winners_push_devices('MLB') t`)).toBe('founder-device,mlb-device,paid-device');
  });
  it('the old window claims are gone and anon can call nothing', () => {
    for (const fn of ['public.claim_winners_curation(text,text)', 'public.claim_winners_props_before_gate(text)', 'public.ensure_winners_window_coverage(text,text)', 'public.finish_winners_curation(bigint,integer,jsonb,text,integer,text)']) {
      expect(sql(`SELECT to_regprocedure('${fn}') IS NULL`)).toBe('t');
    }
    for (const call of ['public.claim_winners_read()', 'public.winners_cash_position()', `public.seat_the_card('${day}')`, `public.admit_winners_pending('${day}')`,
      "public.card_place(1,NULL,NULL,0,'',false,true,'m',NULL::bigint[])", "public.card_state('NFL','g1')", `public.claim_big_game_stakes('${day}')`, "public.set_big_game_stake(1,100,'x','m')",
      `public.claim_winners_props('${day}')`, "public.scratch_winners_play(1,'x')", "public.winners_push_devices('NFL')"]) {
      expect(() => sql(`SET ROLE anon; SELECT ${call}`), call).toThrow(/permission denied/);
    }
  });
});
