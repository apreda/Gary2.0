import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// PostgreSQL on macOS needs an explicit locale when launched from a clean env.
const pgEnv={...process.env,LC_ALL:'C'};
let bin=process.env.GARY_TEST_PG_BIN;
if (!bin) {
  try {
    bin=execFileSync('pg_config',['--bindir'],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:5000}).trim();
  } catch {
    bin='';
  }
}
const missing=['initdb','pg_ctl','psql','postgres'].filter(name=>{
  if (!bin) return true;
  try { accessSync(path.join(bin,name),constants.X_OK); return false; }
  catch { return true; }
});
const supported=missing.length===0;
if (!supported) {
  const message=`Isolated Postgres tests need executable ${missing.join(', ')}. Set GARY_TEST_PG_BIN to the server binary directory (pg_config --bindir). Checked: ${bin || 'pg_config unavailable'}.`;
  if (process.env.GARY_TEST_PG_BIN || process.env.CI==='true' || process.env.CI==='1') throw new Error(message);
  console.warn(`Skipping social publication database contract: ${message}`);
}
let directory; let started=false;
const args=()=>['-h',directory,'-p','55447','-U','testadmin','-d','postgres','-X','-v','ON_ERROR_STOP=1','-At'];
const sql=s=>execFileSync(`${bin}/psql`,[...args(),'-c',s],{env:pgEnv,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();

const migration = readFileSync(new URL('../../supabase/migrations/20260907101656_durable_social_publication.sql', import.meta.url), 'utf8');
const etDate = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const today = "to_char(now() at time zone 'America/New_York','YYYY-MM-DD')";
const payload = {pick_text:'Cubs ML',post_text:'A reason. Cubs ML.',thread_format:'standard',commence_time:etDate+'T18:00:00Z'};
const claim = (key, value=payload) => `set role service_role; select publication_key from public.claim_social_publication(${today},'${key}','${JSON.stringify(value)}'::jsonb,null);`;
describe.skipIf(!supported)('durable social publication on isolated PostgreSQL', () => {
  beforeAll(() => {
    directory=mkdtempSync(path.join(tmpdir(),'gary-social-pg-'));
    execFileSync(`${bin}/initdb`,['-D',`${directory}/data`,'-A','trust','-U','testadmin','--no-locale'],{env:pgEnv,stdio:'pipe'});
    execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-l',`${directory}/server.log`,'-o',`-k ${directory} -h '' -p 55447`,'-w','start'],{env:pgEnv,stdio:'pipe'}); started=true;
    sql(`create role anon; create role authenticated; create role service_role;
      create table public.social_post_log(id uuid primary key default gen_random_uuid(),post_date text,pick_text text,thread_format text);
      alter table public.social_post_log add constraint social_post_log_unique_pick unique(post_date,pick_text);
      grant select,insert,update on public.social_post_log to service_role;`);
    sql(migration);
  },30000);
  afterAll(() => {
    if(started) execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-m','immediate','-w','stop'],{env:pgEnv,stdio:'ignore'});
    if(directory) rmSync(directory,{recursive:true,force:true});
  });
  beforeEach(() => sql('truncate public.social_publication_intents, public.social_post_log'));
  it('repeated reservations preserve the exact original copy and count once', () => {
    sql(claim('game-1')); sql(claim('game-1',{...payload,post_text:'Changed copy'}));
    expect(sql("select count(*),max(log_payload->>'post_text') from public.social_publication_intents")).toBe('1|A reason. Cubs ML.');
  });
  it('legacy receipts block an identical ticket; new keys permit distinct doubleheaders', () => {
    sql(`insert into public.social_post_log(post_date,pick_text,thread_format) values (${today},'Cubs ML','standard')`);
    sql(claim('game-1')); expect(sql('select count(*) from public.social_publication_intents')).toBe('0');
    sql('truncate public.social_post_log'); sql(claim('game-1')); sql(claim('game-2'));
    expect(sql('select count(*) from public.social_publication_intents')).toBe('2');
    sql(`insert into public.social_post_log(post_date,pick_text,thread_format,publication_key) values (${today},'Cubs ML','standard','game-1'),(${today},'Cubs ML','standard','game-2')`);
    expect(sql('select count(*) from public.social_post_log')).toBe('2');
  });
  it('legacy threads and unresolved sends both consume the unchanged daily cap', () => {
    sql(`insert into public.social_post_log(post_date,pick_text,thread_format) select ${today},'old-'||n,'standard' from generate_series(1,29)n`);
    sql(claim('last')); sql("update public.social_publication_intents set state='root_sending'"); sql(claim('over-cap'));
    expect(sql('select count(*) from public.social_publication_intents')).toBe('1');
  });
  it('completed new publications are not counted twice against the cap', () => {
    sql(claim('first')); sql(`insert into public.social_post_log(post_date,pick_text,thread_format,publication_key) values (${today},'Cubs ML','standard','first')`);
    for(let i=2;i<=31;i++) sql(claim('game-'+i));
    expect(sql('select count(*) from public.social_publication_intents')).toBe('30');
  });
  it('overlapping database clients cannot exceed the final available daily slot', async () => {
    sql(`insert into public.social_post_log(post_date,pick_text,thread_format) select ${today},'prior-'||n,'standard' from generate_series(1,29)n`);
    const run = promisify(execFile);
    await Promise.all(Array.from({length:8},(_,i)=>run(`${bin}/psql`,[...args(),'-c',claim('concurrent-'+i)],{env:pgEnv})));
    expect(sql('select count(*) from public.social_publication_intents')).toBe('1');
  });
  it('state transitions compare the previous state and reject invalid receipts', () => {
    sql(claim('game'));
    expect(sql("set role service_role; update public.social_publication_intents set state='root_sending' where state='prepared' returning state")).toContain('root_sending');
    expect(sql("set role service_role; update public.social_publication_intents set state='root_sending' where state='prepared' returning state")).toContain('UPDATE 0');
    expect(()=>sql("update public.social_publication_intents set state='root_sent'")).toThrow();
  });
  it('rejects public table/RPC access and invalid or historical reservations', () => {
    for(const role of ['anon','authenticated']) {
      expect(()=>sql(`set role ${role}; select * from public.social_publication_intents`)).toThrow();
      expect(()=>sql(claim('x').replace('set role service_role',`set role ${role}`))).toThrow();
    }
    expect(sql("select relrowsecurity from pg_class where oid='public.social_publication_intents'::regclass")).toBe('t');
    expect(()=>sql(claim('x').replace(today,"'2020-01-01'"))).toThrow();
    expect(()=>sql(claim('x',{...payload,post_text:''}))).toThrow();
  });
});
