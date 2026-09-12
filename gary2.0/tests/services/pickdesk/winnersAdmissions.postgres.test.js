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
    for(const name of ['20260904203500_winners_admissions.sql','20260904203650_winners_review_recovery.sql','20260904205218_winners_prop_cohort_reservations.sql','20260908150211_mlb_gary_winners_selection.sql','20260908172215_mlb_winners_review_prerequisites.sql','20260909133844_winners_underdog_admission.sql','20260912133639_winners_daily_curation.sql','20260912133808_winners_curation_review_queue.sql','20260912143745_winners_required_window_coverage.sql'])sql(readFileSync(new URL(`../../../supabase/migrations/${name}`,import.meta.url),'utf8'));
  },30000);
  afterAll(()=>{if(started)execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-m','immediate','-w','stop'],{env:pgEnv,stdio:'ignore'});if(directory)rmSync(directory,{recursive:true,force:true});});
  beforeEach(()=>sql('TRUNCATE public.winners_decision_events,public.winners_board,public.winners_candidates,public.winners_selection_runs,public.winners_curation_runs,public.daily_slate RESTART IDENTITY CASCADE;'));
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
  describe('schedule-aware curation from September 12',()=>{
    const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
    const stage=(league='NFL',groups=[8,5,1])=>{
      let id=1;
      groups.forEach((count,index)=>{
        for(let n=0;n<count;n++,id++)sql(`INSERT INTO daily_slate(date,league,commence_time,bdl_game_id,game_status)
          VALUES ('${day}','${league}',now()+make_interval(mins=>${60+index*200}),${id},'scheduled');`);
      });
      sql(`INSERT INTO winners_candidates(game_date,league,kind,game_id,ticket_key,market_key,pick_text,odds,commence_time,pick_snapshot,evidence_snapshot)
        SELECT date,league,'game',bdl_game_id::text,'cur-'||bdl_game_id,'market-'||bdl_game_id,'Home ML -110',-110,commence_time,
        jsonb_build_object('rationale','The original rationale','confidence',0.99),jsonb_build_object('deskText','Original pregame facts','observedAt',now()-interval '5 minutes') FROM daily_slate;`);
    };
    const claim=league=>JSON.parse(sql(`SELECT to_jsonb(r) FROM public.claim_winners_curation('${day}','${league}') r;`) || 'null');
    const decision=(run,count=1,grade='clear')=>({summary:'Complete original evidence comparison',ranked_candidates:run.input_snapshot.candidates.map((c,i)=>({candidate_id:c.id,rank:i+1,assessment:grade,selected:i<count,reason:'A concrete original matchup advantage supports the exact ticket.'}))});
    const finish=(run,selection,attempt=run.attempts)=>JSON.parse(sql(`SELECT public.finish_winners_curation(${run.id},${attempt},'${JSON.stringify(selection).replaceAll("'","''")}'::jsonb,'fixture',1);`));
    it('groups nearby NFL starts and reserves a late singleton within a quarter-slate target',()=>{
      stage();const plan=JSON.parse(sql(`SELECT public.winners_daily_plan('${day}','NFL');`));
      expect(plan.slate_count).toBe(14);expect(plan.target).toBe(4);
      expect(plan.windows.map(w=>w.quota)).toEqual([2,1,1]);
      const r=claim('NFL');expect(r.input_snapshot.capacity).toBe(2);expect(r.input_snapshot.reserved).toBe(2);
      expect(finish(r,decision(r,2)).admitted).toBe(2);
      expect(claim('NFL')).toBeNull();
      expect(sql(`SELECT public.release_winners_board('${day}','NFL','game');`)).toBe('0');
      expect(sql('SELECT count(*) FROM winners_board;')).toBe('2');
    });
    it('caps a large college slate at five even with many start windows',()=>{
      stage('NCAAF',[8,8,8,8,8,5]);
      const plan=JSON.parse(sql(`SELECT public.winners_daily_plan('${day}','NCAAF');`));
      expect(plan.slate_count).toBe(45);expect(plan.target).toBe(5);expect(plan.windows).toHaveLength(5);
      expect(plan.windows.reduce((n,w)=>n+w.quota,0)).toBe(5);
    });
    it('refuses excess early picks, stale attempts and changed evidence',()=>{
      stage();let r=claim('NFL');
      expect(finish(r,decision(r,3)).completed).toBe(false);
      sql('TRUNCATE winners_curation_runs RESTART IDENTITY;');r=claim('NFL');
      expect(finish(r,decision(r),99).reason).toContain('Stale');
      sql(`UPDATE winners_candidates SET evidence_snapshot='{}' WHERE id=${r.input_snapshot.candidates[0].id};`);
      expect(finish(r,decision(r)).completed).toBe(false);
      expect(sql('SELECT count(*) FROM winners_board;')).toBe('0');
    });
    it('is idempotent and keeps completed evidence and selected tickets immutable',()=>{
      stage();const r=claim('NFL'),d=decision(r);
      expect(finish(r,d).admitted).toBe(1);expect(finish(r,d).already_recorded).toBe(true);
      expect(sql('SELECT count(*) FROM winners_board;')).toBe('1');
      expect(()=>sql("UPDATE winners_curation_runs SET input_snapshot='{}';")).toThrow();
      expect(()=>sql('DELETE FROM winners_board;')).toThrow();
      expect(()=>sql(`SET ROLE anon; SELECT public.claim_winners_curation('${day}','NFL');`)).toThrow();
      expect(()=>sql('SET ROLE authenticated; SELECT * FROM winners_curation_runs;')).toThrow();
    });
    it('admits a single unsupported game through clock coverage even after a completed comparison declined it',()=>{
      stage('NFL',[1]);const r=claim('NFL');expect(r.input_snapshot.capacity).toBe(1);
      expect(finish(r,decision(r,0,'unsupported')).admitted).toBe(0);
      expect(sql(`SELECT ensure_winners_window_coverage('${day}','NFL');`)).toBe('1');
      expect(sql(`SELECT policy_version FROM winners_board;`)).toBe('daily-curation-v2');
      expect(claim('NFL')).toBeNull();
    });
    it('fills a window of toss-ups by their independent relative rank',()=>{
      stage('NFL',[8]);const r=claim('NFL');
      expect(finish(r,decision(r,2,'toss_up')).admitted).toBe(2);
    });
    it.each(['MLB','NBA','NFL','NCAAF','NHL','NCAAB','EPL','WC'])('fills %s normal quota despite an active model lease and missing research',league=>{
      stage(league,[8,5,1]);const r=claim(league);expect(r).not.toBeNull();
      sql("UPDATE winners_candidates SET evidence_snapshot='{}',pick_snapshot=pick_snapshot||'{\"confidence\":0.01}';");
      expect(sql(`SET ROLE service_role; SELECT ensure_winners_window_coverage('${day}','${league}');`).split('\n').pop()).toBe('3');
      // Two earliest tickets plus the already-published lone late game.
      expect(sql("SELECT string_agg(game_id,',' ORDER BY candidate_id) FROM winners_board;")).toBe('1,2,14');
      expect(sql(`SELECT ensure_winners_window_coverage('${day}','${league}');`)).toBe('0');
      expect(finish(r,decision(r,2)).completed).toBe(false);
    });
    it('waits for the normal T-60 fill while publishing a lone night ticket immediately',()=>{
      stage();sql("UPDATE daily_slate SET commence_time=commence_time+interval '20 minutes'; UPDATE winners_candidates c SET commence_time=s.commence_time FROM daily_slate s WHERE c.game_id=s.bdl_game_id::text;");
      expect(sql(`SELECT ensure_winners_window_coverage('${day}','NFL');`)).toBe('1');
      expect(sql('SELECT game_id FROM winners_board;')).toBe('14');
    });
    it('ignores missing slate starts, PASS tickets, invalid odds and live games without blocking a valid alternative',()=>{
      stage('NFL',[8]);
      sql("INSERT INTO daily_slate(date,league,bdl_game_id) SELECT date,league,999 FROM daily_slate LIMIT 1; UPDATE winners_candidates SET pick_text='PASS' WHERE id=1; UPDATE winners_candidates SET odds=0 WHERE id=2; UPDATE daily_slate SET game_status='live' WHERE bdl_game_id=3; UPDATE winners_candidates SET commence_time=commence_time+interval '1 minute' WHERE id=4;");
      expect(sql(`SELECT ensure_winners_window_coverage('${day}','NFL');`)).toBe('2');
      expect(sql("SELECT string_agg(game_id,',' ORDER BY candidate_id) FROM winners_board;")).toBe('5,6');
    });
    it('uses a completed original comparison ahead of stable order for scheduled fill',()=>{
      stage('NFL',[8]);let r=claim('NFL'),d=decision(r,0);
      d.ranked_candidates.reverse().forEach((c,i)=>{c.rank=i+1;c.assessment='lean';});
      expect(finish(r,d).admitted).toBe(0);
      expect(sql(`SELECT ensure_winners_window_coverage('${day}','NFL');`)).toBe('2');
      expect(sql("SELECT string_agg(game_id,',' ORDER BY candidate_id) FROM winners_board;")).toBe('7,8');
    });
    it('serializes simultaneous clock fills, caps normal admissions at five, and denies public access',async()=>{
      stage('NCAAF',[45]);
      const query=`SELECT ensure_winners_window_coverage('${day}','NCAAF');`;
      const result=await Promise.all([1,2].map(()=>run(`${bin}/psql`,[...args(),'-c',query],{env:pgEnv})));
      expect(result.map(x=>x.stdout.trim()).sort()).toEqual(['0','5']);
      expect(()=>sql(`SET ROLE anon; ${query}`)).toThrow();
      expect(()=>sql(`SET ROLE authenticated; ${query}`)).toThrow();
    });
    it('keeps three legacy early tickets and reserves three later windows with a one-day six-ticket transition',()=>{
      stage('NCAAF',[8,5,4,1]);
      sql(`INSERT INTO winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
        SELECT id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,now(),'exact-ticket-v2','Earlier policy admission' FROM winners_candidates WHERE id<=3;
        UPDATE winners_candidates SET admitted_at=now() WHERE id<=3;`);
      const p=JSON.parse(sql(`SELECT winners_daily_plan('${day}','NCAAF');`));
      expect(p.target).toBe(6);expect(p.transitional_coverage).toBe(true);
      // Lone night game enters immediately; early tickets never get deleted.
      expect(sql(`SELECT ensure_winners_window_coverage('${day}','NCAAF');`)).toBe('1');
      expect(sql('SELECT count(*) FROM winners_board;')).toBe('4');
      for (let i=0;i<2;i++) {
        sql("UPDATE daily_slate SET commence_time=commence_time-interval '200 minutes'; UPDATE winners_candidates c SET commence_time=s.commence_time FROM daily_slate s WHERE c.game_id=s.bdl_game_id::text AND c.admitted_at IS NULL;");
        expect(sql(`SELECT ensure_winners_window_coverage('${day}','NCAAF');`)).toBe('1');
      }
      expect(sql('SELECT count(*) FROM winners_board;')).toBe('6');
      expect(sql(`SELECT ensure_winners_window_coverage('${day}','NCAAF');`)).toBe('0');
      expect(()=>sql('DELETE FROM winners_board;')).toThrow();
    });
    it('finishes a 15-game day with four tickets across all four windows even if every model read is unavailable',()=>{
      stage('MLB',[6,4,4,1]);
      expect(sql(`SELECT ensure_winners_window_coverage('${day}','MLB');`)).toBe('2');
      for (let i=0;i<2;i++) {
        sql("UPDATE daily_slate SET commence_time=commence_time-interval '200 minutes'; UPDATE winners_candidates c SET commence_time=s.commence_time FROM daily_slate s WHERE c.game_id=s.bdl_game_id::text AND c.admitted_at IS NULL;");
        expect(sql(`SELECT ensure_winners_window_coverage('${day}','MLB');`)).toBe('1');
      }
      expect(sql("SELECT string_agg(game_id,',' ORDER BY candidate_id) FROM winners_board;")).toBe('1,7,11,15');
      expect(sql(`SELECT ensure_winners_window_coverage('${day}','MLB');`)).toBe('0');
    });
    it('enforces the six-clear exception in the database and never admits a seventh',()=>{
      stage('NFL',[24]);let r=claim('NFL');
      const mixed=decision(r,6);mixed.ranked_candidates[5].assessment='lean';
      expect(finish(r,mixed).completed).toBe(false);
      sql('TRUNCATE winners_curation_runs RESTART IDENTITY;');r=claim('NFL');
      expect(finish(r,decision(r,6)).admitted).toBe(6);
      expect(claim('NFL')).toBeNull();expect(sql('SELECT count(*) FROM winners_board;')).toBe('6');
    });
    it('serializes concurrent publication receipts without duplicate admissions',async()=>{
      stage('NFL',[8]);const r=claim('NFL'),d=decision(r,2);
      const query=`SELECT public.finish_winners_curation(${r.id},${r.attempts},'${JSON.stringify(d).replaceAll("'","''")}'::jsonb,'fixture',1);`;
      const receipts=await Promise.all([1,2].map(()=>run(`${bin}/psql`,[...args(),'-c',query],{env:pgEnv})));
      expect(receipts.map(x=>JSON.parse(x.stdout)).filter(x=>x.already_recorded)).toHaveLength(1);
      expect(sql('SELECT count(*) FROM winners_board;')).toBe('2');
    });
    it('keeps new games out of the old review queue while props continue',()=>{
      stage('NFL',[2]);sql("UPDATE winners_candidates SET created_at=now()-interval '5 minutes';");
      expect(sql('SELECT count(*) FROM claim_winners_candidate();')).toBe('0');
      add('pending',1,"UPDATE winners_candidates SET evidence_snapshot='{\"deskText\":\"original\"}' WHERE kind='prop';");
      expect(sql('SELECT kind FROM claim_winners_candidate();')).toBe('prop');
    });
    it('refuses changed start times and live-game slate updates before publishing',()=>{
      stage('NFL',[2]);const r=claim('NFL');
      sql("UPDATE daily_slate SET game_status='live';");
      expect(finish(r,decision(r)).completed).toBe(false);
      expect(sql('SELECT count(*) FROM winners_board;')).toBe('0');
      sql('TRUNCATE winners_curation_runs RESTART IDENTITY;');
      expect(claim('NFL')).toBeNull();
    });
  });

});
