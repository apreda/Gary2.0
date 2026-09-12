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
describe.skipIf(!supported)('audience cadence on isolated PostgreSQL', () => {
  beforeAll(() => {
    directory=mkdtempSync(path.join(tmpdir(),'gary-social-pg-'));
    execFileSync(`${bin}/initdb`,['-D',`${directory}/data`,'-A','trust','-U','testadmin','--no-locale'],{env:pgEnv,stdio:'pipe'});
    execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-l',`${directory}/server.log`,'-o',`-k ${directory} -h '' -p 55447`,'-w','start'],{env:pgEnv,stdio:'pipe'}); started=true;
    sql(`create role anon; create role authenticated; create role service_role;
      create table public.social_post_log(id uuid primary key default gen_random_uuid(),post_date text,pick_text text,thread_format text,posted_at timestamptz default now());
      alter table public.social_post_log add constraint social_post_log_unique_pick unique(post_date,pick_text);
      grant select,insert,update on public.social_post_log to service_role;`);
    sql(migration);
    sql(readFileSync(new URL('../../supabase/migrations/20260912153703_social_audience_cadence.sql', import.meta.url), 'utf8'));
  },30000);
  afterAll(() => {
    if(started) execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-m','immediate','-w','stop'],{env:pgEnv,stdio:'ignore'});
    if(directory) rmSync(directory,{recursive:true,force:true});
  });
  beforeEach(() => sql('truncate public.social_publication_intents, public.social_post_log'));
  const cap = etDate === '2026-09-12' ? 16 : 12;
  function seed(count) {
    sql(`insert into public.social_publication_intents(post_date,publication_key,log_payload,created_at)
      select ${today},'prior-'||n,'${JSON.stringify(payload)}'::jsonb,now()-interval '31 minutes' from generate_series(1,${count})n`);
  }
  it('serializes overlapping runs into one root per thirty-minute interval', async () => {
    const run=promisify(execFile);
    await Promise.all(Array.from({length:8},(_,i)=>run(`${bin}/psql`,[...args(),'-c',claim('burst-'+i)],{env:pgEnv})));
    expect(sql('select count(*) from public.social_publication_intents')).toBe('1');
    sql("update public.social_publication_intents set created_at=now()-interval '31 minutes'");
    sql(claim('next'));
    expect(sql('select count(*) from public.social_publication_intents')).toBe('2');
  });
  it('a recent confirmed receipt holds the interval even if its intent is absent',()=>{
    sql(`insert into public.social_post_log(post_date,pick_text,thread_format,posted_at)
      values (${today},'legacy','standard',now())`);
    sql(claim('blocked')); expect(sql('select count(*) from public.social_publication_intents')).toBe('0');
  });
  it('keeps exact prepared copy and lets its own reservation resume',()=>{
    sql(claim('same')); sql(claim('same',{...payload,post_text:'Replacement'}));
    expect(sql("select count(*),max(log_payload->>'post_text') from public.social_publication_intents")).toBe('1|A reason. Cubs ML.');
  });
  it('an older prepared payload cannot resume while another game occupies the interval',()=>{
    seed(1); sql(claim('next'));
    expect(sql(claim('prior-1'))).not.toContain('prior-1');
    expect(sql('select count(*) from public.social_publication_intents')).toBe('2');
  });
  it('uncertain sends count toward the cap while expired unsent claims release it',()=>{
    seed(cap); sql("update public.social_publication_intents set state='root_sending'");
    sql(claim('over')); expect(sql('select count(*) from public.social_publication_intents')).toBe(String(cap));
    sql("update public.social_publication_intents set state='expired' where publication_key='prior-1'");
    sql(claim('last')); expect(sql("select count(*) from public.social_publication_intents where state<>'expired'")).toBe(String(cap));
  });
  it('does not double-count new receipts or charge recaps against the root limit',()=>{
    seed(cap-1);
    sql(`insert into public.social_post_log(post_date,pick_text,thread_format,publication_key,posted_at)
      values (${today},'Cubs ML','standard','prior-1',now()-interval '31 minutes'),
      (${today},'recap','recap',null,now())`);
    sql(claim('last')); expect(sql('select count(*) from public.social_publication_intents')).toBe(String(cap));
  });
  it('counts confirmed keyed receipts even when their intent is absent',()=>{
    seed(cap-1);
    sql(`insert into public.social_post_log(post_date,pick_text,thread_format,publication_key,posted_at)
      values (${today},'orphan','standard','missing-intent',now()-interval '31 minutes')`);
    sql(claim('over')); expect(sql('select count(*) from public.social_publication_intents')).toBe(String(cap-1));
  });
  it('preserves service-only access and a fixed search path',()=>{
    for(const role of ['anon','authenticated']) expect(()=>sql(claim('x').replace('set role service_role',`set role ${role}`))).toThrow();
    expect(sql("select prosecdef from pg_proc where oid='public.claim_social_publication(text,text,jsonb,text)'::regprocedure")).toBe('f');
    expect(sql("select array_to_string(proconfig,',') from pg_proc where oid='public.claim_social_publication(text,text,jsonb,text)'::regprocedure")).toContain('search_path=');
  });
});
