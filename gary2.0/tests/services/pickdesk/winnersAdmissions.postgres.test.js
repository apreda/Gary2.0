import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const run=promisify(execFile);
const bin='/opt/homebrew/bin';
const supported=['initdb','pg_ctl','psql'].every(name=>existsSync(`${bin}/${name}`));
let directory; let started=false;
const args=()=>['-h',directory,'-p','55439','-U','testadmin','-d','postgres','-X','-v','ON_ERROR_STOP=1','-At'];
const sql=s=>execFileSync(`${bin}/psql`,[...args(),'-c',s],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const add=(status='qualified',n=1,extra='')=>sql(`INSERT INTO public.winners_candidates(game_date,league,kind,game_id,ticket_key,market_key,pick_text,odds,commence_time,pick_snapshot,evidence_snapshot,status,created_at,reviewed_at,attempts)
SELECT '2026-09-04','MLB','prop',i::text,'ticket-'||i,'market-'||i,'a prop',-110,now()+interval '3 hours',jsonb_build_object('confidence',i/10.0),'{}','${status}',now()-interval '5 minutes',now()-interval '3 minutes',0 FROM generate_series(1,${n}) i; ${extra}`);
describe.skipIf(!supported)('Winners database contract on isolated local Postgres',()=>{
  beforeAll(()=>{
    directory=mkdtempSync(path.join(tmpdir(),'gary-winners-pg-'));
    execFileSync(`${bin}/initdb`,['-D',`${directory}/data`,'-A','trust','-U','testadmin','--no-locale'],{stdio:'ignore'});
    execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-l',`${directory}/server.log`,'-o',`-k ${directory} -h '' -p 55439`,'-w','start'],{stdio:'ignore'});
    started=true;
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE TABLE public.daily_slate(date text,league text,commence_time timestamptz); GRANT SELECT ON public.daily_slate TO service_role;`);
    for(const name of ['20260904203500_winners_admissions.sql','20260904203650_winners_review_recovery.sql','20260904205218_winners_prop_cohort_reservations.sql'])sql(readFileSync(new URL(`../../../supabase/migrations/${name}`,import.meta.url),'utf8'));
  },30000);
  afterAll(()=>{if(started)execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-m','immediate','-w','stop'],{stdio:'ignore'});if(directory)rmSync(directory,{recursive:true,force:true});});
  beforeEach(()=>sql('TRUNCATE public.winners_decision_events,public.winners_board,public.winners_candidates,public.daily_slate RESTART IDENTITY CASCADE;'));
  it('grants read-only board access and denies anon evidence and privileged functions',()=>{
    expect(sql("SET ROLE anon; SELECT count(*) FROM public.winners_board;")).toContain('0');
    expect(()=>sql('SET ROLE anon; SELECT * FROM public.winners_candidates;')).toThrow();
    expect(()=>sql('SET ROLE anon; SELECT public.claim_winners_candidate();')).toThrow();
    expect(()=>sql("SET ROLE authenticated; SELECT public.release_winners_board('2026-09-04','MLB','prop');")).toThrow();
    expect(sql('SET ROLE service_role; SELECT count(*) FROM public.claim_winners_candidate();')).toContain('0');
  });
  it('reserves capacity across the actual slate windows and carries unused space forward',()=>{
    sql("INSERT INTO public.daily_slate VALUES ('2026-09-04','MLB',now()+interval '3 hours'),('2026-09-04','MLB',now()+interval '6 hours'),('2026-09-04','MLB',now()+interval '9 hours');");
    expect(sql("SELECT public.winners_capacity('2026-09-04','MLB','prop');")).toBe('2');
    sql("UPDATE public.daily_slate SET commence_time=now()+interval '1 hour' WHERE commence_time<now()+interval '7 hours';");
    // Two distinct windows: two early places, four reserved for the later batch.
    expect(sql("SELECT public.winners_capacity('2026-09-04','MLB','prop');")).toBe('2');
    sql("TRUNCATE public.daily_slate; INSERT INTO public.daily_slate VALUES ('2026-09-04','MLB',now()+interval '30 minutes'),('2026-09-04','MLB',now()+interval '60 minutes'),('2026-09-04','MLB',now()+interval '8 hours');");
    expect(sql("SELECT public.winners_capacity('2026-09-04','MLB','prop');")).toBe('4');
    sql("UPDATE public.daily_slate SET commence_time=now()+interval '80 minutes' WHERE commence_time>now()+interval '7 hours';");
    expect(sql("SELECT public.winners_capacity('2026-09-04','MLB','prop');")).toBe('6');
  });
  it('atomically caps concurrent release at six and keeps admitted snapshots immutable',async()=>{
    sql("INSERT INTO public.daily_slate VALUES ('2026-09-04','MLB',now()+interval '3 hours');");add('qualified',10);
    sql("UPDATE public.winners_candidates SET status='rejected',pick_snapshot='{\"confidence\":99}' WHERE id=1; UPDATE public.winners_candidates SET status='pending',pick_snapshot='{\"confidence\":999}' WHERE id=2;");
    const releases=await Promise.all([1,2].map(()=>run(`${bin}/psql`,[...args(),'-c',"SET ROLE service_role; SELECT public.release_winners_board('2026-09-04','MLB','prop');"])));
    expect(releases.map(r=>r.stdout.trim().split('\n').pop()).sort()).toEqual(['0','6']);
    expect(sql('SELECT count(*) FROM public.winners_board;')).toBe('6');
    expect(sql('SELECT min(candidate_id) FROM public.winners_board;')).toBe('5');
    expect(()=>sql("UPDATE public.winners_board SET pick_snapshot='{}';")).toThrow(/Command failed/);
    expect(()=>sql('DELETE FROM public.winners_board;')).toThrow();
    expect(()=>sql("UPDATE public.winners_candidates SET pick_text='changed' WHERE admitted_at IS NOT NULL;")).toThrow();
    expect(sql('SELECT count(*) FROM public.winners_board;')).toBe('6');
  });
  it('stores late completion as expired and refuses stale attempt tokens',()=>{
    add('reviewing',1,"UPDATE public.winners_candidates SET attempts=2,commence_time=now()-interval '1 second';");
    expect(sql("SELECT public.finish_winners_review(1,1,'qualified','passed','{}','test',1);")).toBe('f');
    expect(sql("SELECT public.finish_winners_review(1,2,'qualified','passed','{}','test',1);")).toBe('t');
    expect(sql('SELECT status FROM public.winners_candidates WHERE id=1;')).toBe('expired');
    expect(sql("SELECT event FROM public.winners_decision_events WHERE candidate_id=1;")).toBe('expired');
    expect(sql("SELECT public.release_winners_board('2026-09-04','MLB','prop');")).toBe('0');
  });
  it('retries unavailable work only with original evidence, and only twice',()=>{
    add('unavailable');
    expect(sql('SELECT count(*) FROM public.claim_winners_candidate();')).toBe('0');
    sql("UPDATE public.winners_candidates SET evidence_snapshot='{\"deskText\":\"original\"}',attempts=1;");
    expect(sql('SELECT attempts FROM public.claim_winners_candidate();')).toBe('2');
    expect(sql("SELECT public.finish_winners_review(1,2,'unavailable','provider offline',null,'test',1);")).toBe('t');
    sql("UPDATE public.winners_candidates SET reviewed_at=now()-interval '3 minutes';");
    expect(sql('SELECT count(*) FROM public.claim_winners_candidate();')).toBe('0');
  });
  it('does not retry a completed uncertainty judgment until it happens to qualify',()=>{
    add('unavailable',1,"UPDATE public.winners_candidates SET evidence_snapshot='{\"deskText\":\"original\"}',attempts=1,review='{\"finding\":\"unknown\"}';");
    expect(sql('SELECT count(*) FROM public.claim_winners_candidate();')).toBe('0');
  });

  const stageSlate=()=>sql("INSERT INTO public.daily_slate SELECT '2026-09-04','MLB',now()+make_interval(mins=>m) FROM unnest(ARRAY[15,20,30,40,75,240]) m;");
  const addAt=(window,count,prefix,confidence=0.7)=>sql(`INSERT INTO public.winners_candidates(game_date,league,kind,game_id,ticket_key,market_key,pick_text,odds,commence_time,pick_snapshot,status,created_at,reviewed_at)
    SELECT '2026-09-04','MLB','prop','${prefix}-'||i,'${prefix}-ticket-'||i,'${prefix}-market-'||i,'a prop',-110,
      (SELECT commence_time FROM public.daily_slate ORDER BY commence_time OFFSET ${window-1} LIMIT 1),
      jsonb_build_object('confidence',${confidence}),'qualified',now()-interval '5 minutes',now()-interval '3 minutes' FROM generate_series(1,${count}) i;`);
  const release=()=>sql("SELECT public.release_winners_board('2026-09-04','MLB','prop');");

  it('reserves actual later-cohort places even after the clock opens all six',()=>{
    stageSlate();
    expect(sql("SELECT public.winners_capacity('2026-09-04','MLB','prop');")).toBe('6');
    addAt(1,8,'early');
    expect(release()).toBe('2'); // late props do not exist yet
    addAt(3,8,'middle');
    expect(release()).toBe('2');
    addAt(6,8,'late');
    expect(release()).toBe('2');
    expect(sql("SELECT string_agg(cohort||':'||n,',' ORDER BY cohort) FROM (SELECT public.winners_prop_cohort('2026-09-04','MLB',c.commence_time) cohort,count(*) n FROM public.winners_board b JOIN public.winners_candidates c ON c.id=b.candidate_id GROUP BY 1) x;")).toBe('1:2,2:2,3:2');
  });

  it('carries unused earlier slots forward and never lets later-arriving early picks consume the late reservation',()=>{
    stageSlate();
    addAt(3,6,'middle',0.9);
    expect(release()).toBe('4'); // both unused early places carry into the middle
    addAt(1,6,'early',0.99);
    expect(release()).toBe('0'); // early+middle must remain at four, regardless of confidence
    addAt(6,6,'late');
    expect(release()).toBe('2');
    expect(sql('SELECT count(*) FROM public.winners_board;')).toBe('6');
  });

  it('lets a later cohort use all six when no earlier pick qualified',()=>{
    stageSlate();addAt(6,8,'late');
    expect(release()).toBe('6');
  });

  it('holds two-batch early tickets to two while leaving the single-batch six-ticket rule intact',()=>{
    sql("INSERT INTO public.daily_slate VALUES ('2026-09-04','MLB',now()+interval '15 minutes'),('2026-09-04','MLB',now()+interval '60 minutes');");
    addAt(1,6,'early');expect(release()).toBe('2');
    addAt(2,6,'late');expect(release()).toBe('4');
    expect(sql('SELECT count(*) FROM public.winners_board;')).toBe('6');
  });
});
