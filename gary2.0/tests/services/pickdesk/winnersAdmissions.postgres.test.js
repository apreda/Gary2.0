import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const run=promisify(execFile);
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
  console.warn(`Skipping Winners database contract: ${message}`);
}
let directory; let started=false;
const args=()=>['-h',directory,'-p','55439','-U','testadmin','-d','postgres','-X','-v','ON_ERROR_STOP=1','-At'];
const sql=s=>execFileSync(`${bin}/psql`,[...args(),'-c',s],{env:pgEnv,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const add=(status='qualified',n=1,extra='')=>sql(`INSERT INTO public.winners_candidates(game_date,league,kind,game_id,ticket_key,market_key,pick_text,odds,commence_time,pick_snapshot,evidence_snapshot,status,created_at,reviewed_at,attempts)
SELECT '2026-09-04','MLB','prop',i::text,'ticket-'||i,'market-'||i,'a prop',-110,now()+interval '3 hours',jsonb_build_object('confidence',i/10.0),'{}','${status}',now()-interval '5 minutes',now()-interval '3 minutes',0 FROM generate_series(1,${n}) i; ${extra}`);
describe.skipIf(!supported)('Winners database contract on isolated local Postgres',()=>{
  beforeAll(()=>{
    directory=mkdtempSync(path.join(tmpdir(),'gary-winners-pg-'));
    try {
      execFileSync(`${bin}/initdb`,['-D',`${directory}/data`,'-A','trust','-U','testadmin','--no-locale'],{env:pgEnv,stdio:'pipe'});
      execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-l',`${directory}/server.log`,'-o',`-k ${directory} -h '' -p 55439`,'-w','start'],{env:pgEnv,stdio:'pipe'});
      started=true;
    } catch(error) {
      let serverLog='';
      try { serverLog=readFileSync(`${directory}/server.log`,'utf8'); } catch {}
      throw new Error(`Could not start isolated Winners Postgres: ${error.stderr?.toString() || error.message}\n${serverLog}`,{cause:error});
    }
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE TABLE public.daily_slate(date text,league text,commence_time timestamptz,bdl_game_id bigint,game_status text,ml_home integer); GRANT SELECT ON public.daily_slate TO service_role;`);
    for(const name of ['20260904203500_winners_admissions.sql','20260904203650_winners_review_recovery.sql','20260904205218_winners_prop_cohort_reservations.sql','20260908150211_mlb_gary_winners_selection.sql','20260909133844_winners_underdog_admission.sql'])sql(readFileSync(new URL(`../../../supabase/migrations/${name}`,import.meta.url),'utf8'));
  },30000);
  afterAll(()=>{if(started)execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-m','immediate','-w','stop'],{env:pgEnv,stdio:'ignore'});if(directory)rmSync(directory,{recursive:true,force:true});});
  beforeEach(()=>sql('TRUNCATE public.winners_decision_events,public.winners_board,public.winners_candidates,public.winners_selection_runs,public.daily_slate RESTART IDENTITY CASCADE;'));
  it('grants read-only board access and denies anon evidence and privileged functions',()=>{
    expect(sql("SET ROLE anon; SELECT count(*) FROM public.winners_board;")).toContain('0');
    expect(()=>sql('SET ROLE anon; SELECT * FROM public.winners_candidates;')).toThrow();
    expect(()=>sql('SET ROLE anon; SELECT public.claim_winners_candidate();')).toThrow();
    expect(()=>sql("SET ROLE authenticated; SELECT public.release_winners_board('2026-09-04','MLB','prop');")).toThrow();
    expect(sql('SET ROLE service_role; SELECT count(*) FROM public.claim_winners_candidate();')).toContain('0');
  });
  it('reserves capacity across the actual slate windows and carries unused space forward',()=>{
    sql("INSERT INTO public.daily_slate(date,league,commence_time) VALUES ('2026-09-04','MLB',now()+interval '3 hours'),('2026-09-04','MLB',now()+interval '6 hours'),('2026-09-04','MLB',now()+interval '9 hours');");
    expect(sql("SELECT public.winners_capacity('2026-09-04','MLB','prop');")).toBe('2');
    sql("UPDATE public.daily_slate SET commence_time=now()+interval '1 hour' WHERE commence_time<now()+interval '7 hours';");
    // Two distinct windows: two early places, four reserved for the later batch.
    expect(sql("SELECT public.winners_capacity('2026-09-04','MLB','prop');")).toBe('2');
    sql("TRUNCATE public.daily_slate; INSERT INTO public.daily_slate(date,league,commence_time) VALUES ('2026-09-04','MLB',now()+interval '30 minutes'),('2026-09-04','MLB',now()+interval '60 minutes'),('2026-09-04','MLB',now()+interval '8 hours');");
    expect(sql("SELECT public.winners_capacity('2026-09-04','MLB','prop');")).toBe('4');
    sql("UPDATE public.daily_slate SET commence_time=now()+interval '80 minutes' WHERE commence_time>now()+interval '7 hours';");
    expect(sql("SELECT public.winners_capacity('2026-09-04','MLB','prop');")).toBe('6');
  });
  it('atomically caps concurrent release at six and keeps admitted snapshots immutable',async()=>{
    sql("INSERT INTO public.daily_slate(date,league,commence_time) VALUES ('2026-09-04','MLB',now()+interval '3 hours');");add('qualified',10);
    sql("UPDATE public.winners_candidates SET status='rejected',pick_snapshot='{\"confidence\":99}' WHERE id=1; UPDATE public.winners_candidates SET status='pending',pick_snapshot='{\"confidence\":999}' WHERE id=2;");
    const releases=await Promise.all([1,2].map(()=>run(`${bin}/psql`,[...args(),'-c',"SET ROLE service_role; SELECT public.release_winners_board('2026-09-04','MLB','prop');"],{env:pgEnv})));
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

  const stageSlate=()=>sql("INSERT INTO public.daily_slate(date,league,commence_time) SELECT '2026-09-04','MLB',now()+make_interval(mins=>m) FROM unnest(ARRAY[15,20,30,40,75,240]) m;");
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
    sql("INSERT INTO public.daily_slate(date,league,commence_time) VALUES ('2026-09-04','MLB',now()+interval '15 minutes'),('2026-09-04','MLB',now()+interval '60 minutes');");
    addAt(1,6,'early');expect(release()).toBe('2');
    addAt(2,6,'late');expect(release()).toBe('4');
    expect(sql('SELECT count(*) FROM public.winners_board;')).toBe('6');
  });

  describe('game admission from September 9: underdogs and plus-line tickets, then a confidence fill',()=>{
    const day='2026-09-09';
    const game=(id,text,odds,{type='moneyline',spread=null,confidence=0.55,status='pending',reason=null,start="now()+interval '3 hours'",league='MLB'}={})=>sql(`INSERT INTO public.winners_candidates(game_date,league,kind,game_id,ticket_key,market_key,pick_text,odds,commence_time,pick_snapshot,evidence_snapshot,status,reason,created_at,reviewed_at,attempts)
      VALUES ('${day}','${league}','game','${id}','g-ticket-${id}','g-market-${id}','${text}',${odds},${start},jsonb_build_object('type','${type}','spread',${spread===null?'null':`'${spread}'`},'confidence',${confidence}),'{}','${status}',${reason===null?'null':`'${reason}'`},now()-interval '5 minutes',${status==='pending'?'null':"now()-interval '3 minutes'"},0);`);
    const board=()=>sql(`SELECT string_agg(game_id||':'||coalesce(reason,''),' | ' ORDER BY candidate_id) FROM public.winners_board WHERE game_date='${day}' AND kind='game';`);
    const release=(league='MLB')=>sql(`SET ROLE service_role; SELECT public.release_winners_board('${day}','${league}','game');`).split('\n').pop();
    it('admits every underdog moneyline and plus-line ticket regardless of review status',()=>{
      sql(`INSERT INTO public.daily_slate(date,league,commence_time) VALUES ('${day}','MLB',now()+interval '3 hours'),('${day}','MLB',now()+interval '6 hours'),('${day}','MLB',now()+interval '9 hours');`);
      game('101','Reds ML +144',144,{status:'pending'});
      game('102','Nationals +1.5 -122',-122,{type:'spread',spread:'1.5',status:'rejected',reason:'The ticket does not meet the checklist'});
      game('103','Athletics +1.5 +105',105,{type:'spread',spread:'1.5',status:'unavailable',reason:'Original evidence snapshot unavailable'});
      game('104','Yankees -1.5 -162',-162,{type:'spread',spread:'-1.5',status:'qualified',confidence:0.7});
      game('105','Tigers ML -132',-132,{status:'pending',confidence:0.65});
      expect(release()).toBe('3');
      const rows=board();
      expect(rows).toContain('101:Underdog moneyline at +144; automatic Winners admission');
      expect(rows).toContain('102:Plus-line ticket +1.5; automatic Winners admission');
      expect(rows).toContain('103:Plus-line ticket +1.5; automatic Winners admission');
      expect(rows).not.toContain('104:');
      expect(rows).not.toContain('105:');
      expect(sql(`SELECT count(*) FROM public.winners_decision_events WHERE event='admitted' AND detail->>'rule' IN ('underdog','plus_line');`)).toBe('3');
      // A second release admits nothing new and never duplicates a market.
      expect(release()).toBe('0');
      expect(sql(`SELECT count(*) FROM public.winners_board WHERE game_date='${day}';`)).toBe('3');
    });
    it('never admits a ticket that lacks exact identity or price, and expires unadmitted tickets at kickoff',()=>{
      sql(`INSERT INTO public.daily_slate(date,league,commence_time) VALUES ('${day}','MLB',now()+interval '3 hours');`);
      game('201','Ghost ML +150',150,{status:'unavailable',reason:'Missing exact game identity, ticket price, or kickoff'});
      game('202','Late Dog ML +130',130,{status:'pending',start:"now()-interval '1 minute'"});
      release();
      expect(sql(`SELECT count(*) FROM public.winners_board WHERE game_date='${day}';`)).toBe('0');
      expect(sql(`SELECT status FROM public.winners_candidates WHERE game_id='202';`)).toBe('expired');
      expect(sql(`SELECT status FROM public.winners_candidates WHERE game_id='201';`)).toBe('unavailable');
    });
    it('fills favorites by confidence as the slate clock opens, counting automatic admissions toward the five',()=>{
      sql(`INSERT INTO public.daily_slate(date,league,commence_time) VALUES ('${day}','MLB',now()+interval '30 minutes'),('${day}','MLB',now()+interval '60 minutes'),('${day}','MLB',now()+interval '8 hours');`);
      expect(sql(`SELECT public.winners_game_fill_capacity('${day}','MLB');`)).toBe('4');
      game('301','Rockies ML +118',118,{confidence:0.5,start:"now()+interval '30 minutes'"});
      game('302','Dodgers ML -150',-150,{confidence:0.6,status:'rejected',reason:'The ticket does not meet the checklist',start:"now()+interval '60 minutes'"});
      game('303','Padres -1.5 +108',108,{type:'spread',spread:'-1.5',confidence:0.58,status:'qualified',start:"now()+interval '60 minutes'"});
      game('304','Astros ML -140',-140,{confidence:0.55,start:"now()+interval '8 hours'"});
      game('305','Braves ML -120',-120,{confidence:0.52,start:"now()+interval '8 hours'"});
      game('306','Cubs ML -110',-110,{confidence:0.5,start:"now()+interval '8 hours'"});
      expect(release()).toBe('4');
      let rows=board();
      expect(rows).toContain('301:Underdog moneyline at +118; automatic Winners admission');
      expect(rows).toContain('302:Confidence fill 0.60; daily Winners target');
      expect(rows).toContain('303:Confidence fill 0.58; daily Winners target');
      expect(rows).toContain('304:Confidence fill 0.55; daily Winners target');
      expect(rows).not.toContain('305:');
      expect(sql(`SELECT count(*) FROM public.winners_decision_events WHERE event='admitted' AND detail->>'rule'='confidence_fill';`)).toBe('3');
      sql(`UPDATE public.daily_slate SET commence_time=now()+interval '80 minutes' WHERE commence_time>now()+interval '7 hours'; UPDATE public.winners_candidates SET commence_time=now()+interval '80 minutes' WHERE game_id IN ('305','306');`);
      expect(sql(`SELECT public.winners_game_fill_capacity('${day}','MLB');`)).toBe('5');
      expect(release()).toBe('1');
      rows=board();
      expect(rows).toContain('305:Confidence fill 0.52; daily Winners target');
      expect(rows).not.toContain('306:');
      expect(sql(`SELECT count(*) FROM public.winners_board WHERE game_date='${day}';`)).toBe('5');
    });
    it('applies the same game rule to football and idles the MLB comparative selection',()=>{
      sql(`INSERT INTO public.daily_slate(date,league,commence_time) VALUES ('${day}','NFL',now()+interval '3 hours');`);
      game('401','Patriots +3.5 -104',-104,{league:'NFL',type:'spread',spread:'3.5',status:'rejected',reason:'strict'});
      game('402','Seahawks -3.5 -104',-104,{league:'NFL',type:'spread',spread:'-3.5',confidence:0.6});
      expect(release('NFL')).toBe('2');
      const rows=sql(`SELECT string_agg(game_id||':'||coalesce(reason,''),' | ' ORDER BY candidate_id) FROM public.winners_board WHERE game_date='${day}' AND league='NFL';`);
      expect(rows).toContain('401:Plus-line ticket +3.5; automatic Winners admission');
      expect(rows).toContain('402:Confidence fill 0.60; daily Winners target');
      const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
      if(today>=day){
        sql(`INSERT INTO public.daily_slate(date,league,commence_time) VALUES ('${today}','MLB',now()+interval '20 minutes');`);
        expect(sql(`SET ROLE service_role; SELECT count(*) FROM public.claim_mlb_winners_selection('${today}',(SELECT commence_time FROM public.daily_slate WHERE date='${today}' AND league='MLB' LIMIT 1));`).split('\n').pop()).toBe('0');
      }
    });
  });
});
