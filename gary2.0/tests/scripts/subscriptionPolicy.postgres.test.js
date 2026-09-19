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
if (!supported && (process.env.GARY_TEST_PG_BIN || ['true', '1'].includes(process.env.CI))) throw new Error('Isolated PostgreSQL binaries required for publication hold and worker queue contract');
if (!supported) console.warn('Skipping publication hold and worker queue database contract: PostgreSQL binaries unavailable');
let directory; let started = false;
const args = () => ['-h', directory, '-p', '55479', '-U', 'testadmin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = text => execFileSync(`${bin}/psql`, [...args(), '-c', text], { env: pgEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();


function cleanup() {
  try {
    if (started) execFileSync(`${bin}/pg_ctl`, ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop'], { env: pgEnv, stdio: 'ignore', timeout: 7000 });
  } finally {
    started = false;
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
}

const migrations=['20260919141357_ncaaf_founder_publication_hold.sql','20260919142140_subscription_model_jobs.sql','20260919142518_required_component_health.sql','20260919145848_tighten_ncaaf_winners_hold.sql'];
describe.skipIf(!supported)('college hold and private subscription queue on real PostgreSQL',()=>{
 beforeAll(()=>{
  directory=mkdtempSync('/tmp/gary-policy-pg-');
  execFileSync(`${bin}/initdb`,['-D',`${directory}/data`,'-A','trust','-U','testadmin','--no-locale','--no-sync'],{env:pgEnv,stdio:'pipe'});
  execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-l',`${directory}/server.log`,'-o',`-k ${directory} -h '' -p 55479 -c shared_buffers=8MB`,'-w','start'],{env:pgEnv,stdio:'pipe'});started=true;
  sql(`create role anon;create role authenticated;create role service_role;create table public.daily_picks(date text primary key,picks jsonb);create table public.prop_picks(date text primary key,picks jsonb);create table public.winners_board(candidate_id bigint primary key,league text,pick_snapshot jsonb);
  insert into winners_board values(1,'NCAAF','{"game_id":1,"pick":"Original +3.5","odds":-110}');
  insert into daily_picks values('2026-09-19','[{"league":"NCAAF","game_id":1,"pick":"Original +3.5","odds":-110}]');`);
  for(const file of migrations)sql(readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 },30000);
 afterAll(cleanup);
 it('rejects new college game/prop tickets and Winners admissions from every writer',()=>{
  expect(()=>sql(`insert into prop_picks values('2026-09-19','[{"league":"NCAAF","game_id":2,"player":"P","line":40}]')`)).toThrow();
  expect(()=>sql(`update daily_picks set picks=picks||'[{"league":"americanfootball_ncaaf","game_id":2,"pick":"New"}]'::jsonb`)).toThrow();
  expect(()=>sql(`insert into winners_board values(2,'NCAAF','{}')`)).toThrow();
 });
 it('allows historical grading and other leagues without permitting rewritten college tickets',()=>{
  sql(`update daily_picks set picks=jsonb_set(picks,'{0,result}','"won"');`);
  expect(sql(`select picks->0->>'result' from daily_picks`)).toBe('won');
  sql(`update daily_picks set picks=picks||'[{"league":"MLB","game_id":2,"pick":"Home ML"}]'::jsonb`);
  expect(()=>sql(`update daily_picks set picks=jsonb_set(picks,'{0,odds}','-120')`)).toThrow();
 });
 it('does not allow Winners to replace the price of an existing college admission',()=>{
  expect(()=>sql(`update winners_board set pick_snapshot=jsonb_set(pick_snapshot,'{odds}','-120') where candidate_id=1`)).toThrow();
  sql(`update winners_board set pick_snapshot=jsonb_set(pick_snapshot,'{result}','"won"') where candidate_id=1`);
  expect(sql(`select pick_snapshot->>'result' from winners_board where candidate_id=1`)).toBe('won');
 });
 it('claims queued jobs once and denies private prompts to app users',()=>{
  sql(`insert into subscription_model_jobs(lane,request) values('fixture','{"messages":[]}');`);
  expect(sql(`select count(*) from claim_subscription_model_job()`)).toBe('1');
  expect(sql(`select count(*) from claim_subscription_model_job()`)).toBe('0');
  expect(()=>sql(`set role anon;select * from subscription_model_jobs;`)).toThrow();
  expect(()=>sql(`set role authenticated;select * from subscription_model_jobs;`)).toThrow();
 });
});
