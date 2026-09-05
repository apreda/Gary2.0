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
  console.warn(`Skipping engagement sheet database contract: ${message}`);
}
let directory; let started=false;
const args=()=>['-h',directory,'-p','55441','-U','testadmin','-d','postgres','-X','-v','ON_ERROR_STOP=1','-At'];
const sql=s=>execFileSync(`${bin}/psql`,[...args(),'-c',s],{env:pgEnv,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();

const migration = () => readFileSync(new URL('../../supabase/migrations/20260905114747_reliable_engagement_sheet.sql', import.meta.url), 'utf8');
const rows = [{author:'sports',author_name:'Sports',tweet_id:'123',tweet_text:'The game',eng:10,matched_pick:null,draft:'A useful thought.',url:'https://x.com/sports/status/123'}];
const replace = (batch=rows) => sql(`SET ROLE service_role; SELECT public.replace_engagement_sheet('2026-09-05', '${JSON.stringify(batch).replaceAll("'", "''")}'::jsonb);`);
describe.skipIf(!supported)('engagement sheet atomic replacement on isolated Postgres', () => {
  beforeAll(() => {
    directory=mkdtempSync(path.join(tmpdir(),'gary-engagement-pg-'));
    execFileSync(`${bin}/initdb`,['-D',`${directory}/data`,'-A','trust','-U','testadmin','--no-locale'],{env:pgEnv,stdio:'pipe'});
    execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-l',`${directory}/server.log`,'-o',`-k ${directory} -h '' -p 55441`,'-w','start'],{env:pgEnv,stdio:'pipe'});
    started=true;
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.engagement_sheet (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), sheet_date date NOT NULL, author text NOT NULL, author_name text, tweet_id text NOT NULL, tweet_text text, eng integer NOT NULL DEFAULT 0, matched_pick text, draft text NOT NULL, url text NOT NULL);
      GRANT SELECT,INSERT,DELETE ON public.engagement_sheet TO service_role;`);
    sql(migration());
  },30000);
  afterAll(() => {
    if(started) execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-m','immediate','-w','stop'],{env:pgEnv,stdio:'ignore'});
    if(directory) rmSync(directory,{recursive:true,force:true});
  });
  beforeEach(() => sql(`TRUNCATE public.engagement_sheet; INSERT INTO public.engagement_sheet(sheet_date,author,tweet_id,draft,url) VALUES ('2026-09-05','prior','1','Keep me','https://x.com/prior/status/1'),('2026-09-04','yesterday','2','Keep yesterday','https://x.com/yesterday/status/2');`));
  it('replaces only the selected date and denies public invocation', () => {
    expect(replace().split('\n').pop()).toBe('1');
    expect(sql(`SELECT draft FROM public.engagement_sheet ORDER BY sheet_date;`)).toBe('Keep yesterday\nA useful thought.');
    expect(sql(`SELECT has_function_privilege('anon','public.replace_engagement_sheet(date,jsonb)','EXECUTE'), has_function_privilege('authenticated','public.replace_engagement_sheet(date,jsonb)','EXECUTE');`)).toBe('f|f');
    expect(() => sql(`SET ROLE anon; SELECT public.replace_engagement_sheet('2026-09-05','[]');`)).toThrow();
  });
  it('rolls deletion back when an insert fails after validation', () => {
    expect(() => replace([{...rows[0],eng:'not an integer'}])).toThrow();
    expect(sql(`SELECT draft FROM public.engagement_sheet WHERE sheet_date='2026-09-05';`)).toBe('Keep me');
  });
  it('rejects empty, duplicate, malformed and oversized batches without erasing prior drafts', () => {
    for (const batch of [[],[rows[0],rows[0]],[{...rows[0],tweet_id:'invalid'}],[{...rows[0],draft:'x'.repeat(241)}],Array.from({length:11},(_,i)=>({...rows[0],tweet_id:String(i)}))]) {
      expect(() => replace(batch)).toThrow();
      expect(sql(`SELECT draft FROM public.engagement_sheet WHERE sheet_date='2026-09-05';`)).toBe('Keep me');
    }
  });
});
