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
  console.warn(`Skipping operational data repair contract: ${message}`);
}
let directory; let started=false;
const args=()=>['-h',directory,'-p','55445','-U','testadmin','-d','postgres','-X','-v','ON_ERROR_STOP=1','-At'];
const sql=s=>execFileSync(`${bin}/psql`,[...args(),'-c',s],{env:pgEnv,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();

const retention = readFileSync(new URL('../../supabase/migrations/20260905144249_reduce_cron_history_io.sql', import.meta.url), 'utf8').split('$cleanup$')[1];
const repair = readFileSync(new URL('../../scripts/lib/repairNcaafQuarterbackNames.sql', import.meta.url), 'utf8');
describe.skipIf(!supported)('operational cleanup and QB repair on isolated Postgres', () => {
  beforeAll(() => {
    directory=mkdtempSync(path.join(tmpdir(),'gary-operational-repair-pg-'));
    execFileSync(`${bin}/initdb`,['-D',`${directory}/data`,'-A','trust','-U','testadmin','--no-locale'],{env:pgEnv,stdio:'pipe'});
    execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-l',`${directory}/server.log`,'-o',`-k ${directory} -h '' -p 55445`,'-w','start'],{env:pgEnv,stdio:'pipe'});
    started=true;
    sql(`create schema cron;
      create table cron.job_run_details(runid bigint primary key,status text,end_time timestamptz);
      create table public.insight_connections(id bigint primary key,date date,league text,category text,game_id text,detail text,meta jsonb,updated_at timestamptz);
      create table public.daily_slate(date date,league text,bdl_game_id bigint,away_team text,home_team text);`);
  },30000);
  afterAll(() => {
    if(started) execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-m','immediate','-w','stop'],{env:pgEnv,stdio:'ignore'});
    if(directory) rmSync(directory,{recursive:true,force:true});
  });
  beforeEach(() => sql('truncate cron.job_run_details,public.insight_connections,public.daily_slate;'));
  it('removes only terminal history older than 30 days, preserving live, recent and undated runs', () => {
    sql(`insert into cron.job_run_details values
      (1,'succeeded',now()-interval '40 days'),(2,'failed',now()-interval '31 days'),
      (3,'running',now()-interval '40 days'),(4,'succeeded',now()-interval '2 days'),
      (5,'failed',null),(6,'starting',now()-interval '40 days');`);
    sql(retention);
    expect(sql('select array_agg(runid order by runid) from cron.job_run_details')).toBe('{3,4,5,6}');
  });
  it('bounds each cleanup and resumes on the next run', () => {
    sql("insert into cron.job_run_details select n,'succeeded',now()-interval '40 days' from generate_series(1,10003)n;");
    sql(retention);
    expect(sql('select count(*) from cron.job_run_details')).toBe('3');
    sql(retention);
    expect(sql('select count(*) from cron.job_run_details')).toBe('0');
  });
  it('repairs anonymous current college text while preserving facts, reads, other leagues and history', () => {
    sql(`insert into public.daily_slate values ((now() at time zone 'America/New_York')::date,'NCAAF',77,'Marshall Thundering Herd','Penn State Nittany Lions');
      insert into public.insight_connections
      select n,(now() at time zone 'America/New_York')::date-case when n=4 then 1 else 0 end,
        case when n=3 then 'NFL' else 'NCAAF' end,'quarterback','77',
        case when n=2 then 'An existing generated read names Carlos.' else 'His 2025 season line: 2043 passing yards. He is on MRSH''s active roster this season.' end,
        '{"qb":"Carlos Del Rio-Wilson","abbr":"MRSH","side":"away","source":"balldontlie_ncaaf_players_active+player_stats","passing":{"yards":2043,"season":2025},"computed_detail":"His 2025 season line: 2043 passing yards.","read":"Existing generated read"}'::jsonb,now()
      from generate_series(1,4)n;`);
    expect(Number(sql(repair).split('|')[0])).toBe(2);
    const rows=JSON.parse(sql('select json_agg(i order by id) from public.insight_connections i'));
    expect(rows[0].detail).toBe("Carlos Del Rio-Wilson (Marshall Thundering Herd): 2025 season line: 2043 passing yards. He is on Marshall Thundering Herd's active roster this season.");
    expect(rows[0].meta.passing).toEqual({yards:2043,season:2025});
    expect(rows[1].detail).toBe('An existing generated read names Carlos.');
    expect(rows[1].meta.read).toBe('Existing generated read');
    expect(rows[2].detail).toMatch(/^His /); expect(rows[3].detail).toMatch(/^His /);
    expect(Number(sql(repair).split('|')[0])).toBe(0);
  });
});
