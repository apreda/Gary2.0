import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
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
  console.warn(`Skipping Book analytics database contract: ${message}`);
}
let directory; let started=false;
const args=()=>['-h',directory,'-p','55442','-U','testadmin','-d','postgres','-X','-v','ON_ERROR_STOP=1','-At'];
const sql=s=>execFileSync(`${bin}/psql`,[...args(),'-c',s],{env:pgEnv,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();

const migration = () => readFileSync(new URL('../../supabase/migrations/20260905125323_consented_book_milestones.sql', import.meta.url), 'utf8');
const identity = 'c53b8823-9e0f-40a3-8f17-685c3f19496d';
const session = 'd53b8823-9e0f-40a3-8f17-685c3f19496d';
const props = { path: '/you', session_id: session };
const write = (event='manual_bet_saved', data=props) => sql(`SET ROLE service_role; SELECT public.log_web_event('${event}', '${identity}', '${'a'.repeat(64)}', '${JSON.stringify(data).replaceAll("'", "''")}'::jsonb);`);
describe.skipIf(!supported)('private Book milestone writer on isolated Postgres', () => {
  beforeAll(() => {
    directory=mkdtempSync(path.join(tmpdir(),'gary-book-analytics-pg-'));
    execFileSync(`${bin}/initdb`,['-D',`${directory}/data`,'-A','trust','-U','testadmin','--no-locale'],{env:pgEnv,stdio:'pipe'});
    execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-l',`${directory}/server.log`,'-o',`-k ${directory} -h '' -p 55442`,'-w','start'],{env:pgEnv,stdio:'pipe'});
    started=true;
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.web_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, event text NOT NULL CONSTRAINT web_events_event CHECK(event IN ('session_started')), identity uuid NOT NULL, props jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      ALTER TABLE public.web_events ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.web_events FORCE ROW LEVEL SECURITY;
      GRANT SELECT,INSERT ON public.web_events TO service_role;
      GRANT USAGE ON SEQUENCE public.web_events_id_seq TO service_role;
      CREATE FUNCTION public.consume_web_ingest_quota(text,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';`);
    sql(migration());
  },30000);
  afterAll(() => {
    if(started) execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-m','immediate','-w','stop'],{env:pgEnv,stdio:'ignore'});
    if(directory) rmSync(directory,{recursive:true,force:true});
  });
  beforeEach(() => sql('TRUNCATE public.web_events;'));
  it('deduplicates per browser, session and milestone without suppressing a later session', () => {
    write(); write(); write('manual_bet_settled'); write('book_opened');
    expect(sql('SELECT count(*) FROM public.web_events;')).toBe('3');
    write('manual_bet_saved', {...props, session_id: identity});
    expect(sql('SELECT count(*) FROM public.web_events;')).toBe('4');
  });
  it('rejects private bet and account contents, missing sessions, wrong paths and malformed sessions', () => {
    for (const key of ['user_id','bet_id','item_id','pick_text','notes','odds','stake','bookmaker','result']) {
      expect(() => write('manual_bet_saved',{...props,[key]:'private'})).toThrow();
    }
    for (const data of [{path:'/you'}, {...props,path:'/you/private-id'}, {...props,session_id:'invalid'}]) {
      expect(() => write('manual_bet_saved',data)).toThrow();
    }
    expect(sql('SELECT count(*) FROM public.web_events;')).toBe('0');
  });
  it('denies public/authenticated invocation and preserves existing event semantics', () => {
    expect(sql("SELECT has_function_privilege('anon','public.log_web_event(text,uuid,text,jsonb)','EXECUTE'), has_function_privilege('authenticated','public.log_web_event(text,uuid,text,jsonb)','EXECUTE');")).toBe('f|f');
    expect(() => sql(`SET ROLE anon; SELECT public.log_web_event('book_opened','${identity}','${'a'.repeat(64)}','{}');`)).toThrow();
    write('meaningful_pick_view',{path:'/picks/mlb/2026-09-04/game',content_type:'pick',measurement_version:'reasoning_v2',session_id:session});
    write('first_book_action',{action:'tail',content_type:'game',item_id:'public-pick'});
    expect(() => write('first_book_action',{action:'manual',content_type:'game'})).toThrow();
    expect(sql('SELECT count(*) FROM public.web_events;')).toBe('2');
  });
});
