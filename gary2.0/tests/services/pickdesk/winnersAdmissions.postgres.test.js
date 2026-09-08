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
    for(const name of ['20260904203500_winners_admissions.sql','20260904203650_winners_review_recovery.sql','20260904205218_winners_prop_cohort_reservations.sql','20260908150211_mlb_gary_winners_selection.sql'])sql(readFileSync(new URL(`../../../supabase/migrations/${name}`,import.meta.url),'utf8'));
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

  describe('MLB factual eligibility followed by Gary selection',()=>{
    const quote=value=>`'${String(value).replaceAll("'","''")}'`;
    const json=value=>`${quote(JSON.stringify(value))}::jsonb`;
    const today=()=>sql("SELECT (clock_timestamp() AT TIME ZONE 'America/New_York')::date::text;");
    const seed=({count=3,minutes=20,later=true,status='qualified',policy='mlb-conviction-v3'}={})=>{
      const date=today();
      // Use one transaction timestamp so simultaneous slate peers share an
      // exact kickoff, as in production; all tickets have original prices.
      sql(`BEGIN;
        INSERT INTO public.daily_slate(date,league,commence_time,bdl_game_id,game_status,ml_home)
          SELECT ${quote(date)},'MLB',now()+make_interval(mins=>${minutes}),i,'scheduled',-150 FROM generate_series(1,${count}) i;
        ${later ? `INSERT INTO public.daily_slate(date,league,commence_time,bdl_game_id,game_status)
          VALUES (${quote(date)},'MLB',now()+interval '60 minutes',901,'scheduled'),(${quote(date)},'MLB',now()+interval '90 minutes',902,'scheduled');` : ''}
        INSERT INTO public.winners_candidates(game_date,league,kind,game_id,ticket_key,market_key,pick_text,odds,commence_time,
          pick_snapshot,evidence_snapshot,policy_version,status,created_at,reviewed_at,review,attempts)
          SELECT ${quote(date)},'MLB','game',s.bdl_game_id::text,'mlb-ticket-'||s.bdl_game_id,'mlb-market-'||s.bdl_game_id,
            'Home '||s.bdl_game_id||' ML -150',-150,s.commence_time,
            jsonb_build_object('pick','Home '||s.bdl_game_id||' ML -150','type','moneyline','odds',-150,'confidence',0.95-s.bdl_game_id/100.0,
              'rationale','Original baseball reasons for game '||s.bdl_game_id,'homeTeam','Home '||s.bdl_game_id,'awayTeam','Away '||s.bdl_game_id,
              'decision_policy','mlb-judgment-v1','commence_time',s.commence_time,'game_id',s.bdl_game_id),
            jsonb_build_object('deskText','Original source desk for game '||s.bdl_game_id,'observedAt',now()-interval '4 minutes'),
            ${quote(policy)},${quote(status)},now()-interval '5 minutes',now()-interval '3 minutes',
            '{"policy_version":"mlb-conviction-v3","schema_version":3,"eligibility_only":true}',1
          FROM public.daily_slate s WHERE s.bdl_game_id<900;
        COMMIT;`);
      return date;
    };
    const claim=(date=today(),gameId=1)=>JSON.parse(sql(`SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)
      FROM public.claim_mlb_winners_selection(${quote(date)},(SELECT commence_time FROM public.daily_slate WHERE bdl_game_id=${gameId})) r;`));
    const choose=(run,selectedCount=1)=>({summary:'The selected original judgments have the strongest complete baseball cases.',
      ranked_candidates:run.input_snapshot.candidates.map((candidate,index)=>({candidate_id:candidate.id,rank:index+1,selected:index<selectedCount,
        expected_outcome:'The original moneyline team wins outright.',reason:`Supported original baseball case for candidate ${candidate.id}.`,
        comparison:`I rank this original game judgment in position ${index+1} after considering its limitations.`}))});
    const finish=(run,selection=choose(run),{attempt=run.attempts,model='test-gary',ms=10,error=null}={})=>JSON.parse(sql(
      `SELECT public.finish_mlb_winners_selection(${run.id},${attempt===null?'NULL':attempt},${selection===null?'NULL':json(selection)},${model===null?'NULL':quote(model)},${ms===null?'NULL':ms},${error===null?'NULL':quote(error)});`));
    const countBoard=()=>Number(sql("SELECT count(*) FROM public.winners_board WHERE league='MLB' AND kind='game';"));

    it('allows only service-role access to comparative records and operations',()=>{
      seed();
      expect(()=>sql('SET ROLE anon; SELECT * FROM public.winners_selection_runs;')).toThrow();
      expect(()=>sql("SET ROLE authenticated; SELECT public.claim_mlb_winners_selection(NULL,NULL);")).toThrow();
      expect(()=>sql("SET ROLE anon; SELECT public.finish_mlb_winners_selection(1,1,NULL,'model',10);")).toThrow();
      expect(sql("SET ROLE service_role; SELECT public.mlb_winners_remaining(NULL,NULL);").split('\n').at(-1)).toBe('0');
    });

    it('does not auto-admit qualified MLB tickets, then atomically stores Gary\'s exact chosen originals',()=>{
      const date=seed();
      expect(sql(`SELECT public.release_winners_board(${quote(date)},'MLB','game');`)).toBe('0');
      const [run]=claim(date);
      expect(run.cohort).toBe(1);
      expect(run.input_snapshot.capacity.remaining).toBe(2);
      expect(run.input_snapshot.candidates).toHaveLength(3);
      // Gary may rank the lowest numeric-confidence candidate first.
      const selection=choose(run,2);
      selection.ranked_candidates.reverse();
      selection.ranked_candidates.forEach((item,index)=>{item.rank=index+1;item.selected=index<2;});
      expect(finish(run,selection)).toMatchObject({completed:true,admitted:2});
      expect(sql('SELECT string_agg(candidate_id::text,\',\' ORDER BY candidate_id) FROM public.winners_board;')).toBe('2,3');
      expect(sql('SELECT bool_and(b.pick_snapshot=c.pick_snapshot) FROM public.winners_board b JOIN public.winners_candidates c ON c.id=b.candidate_id;')).toBe('t');
      expect(sql("SELECT count(*) FROM public.winners_decision_events WHERE event='gary_not_selected';")).toBe('1');
      expect(sql("SELECT count(*) FROM public.winners_decision_events WHERE event='gary_selected';")).toBe('2');
      expect(()=>sql(`UPDATE public.winners_selection_runs SET input_snapshot='{}' WHERE id=${run.id};`)).toThrow();
      expect(()=>sql(`DELETE FROM public.winners_selection_runs WHERE id=${run.id};`)).toThrow();
    });

    it.each([0,1])('does not resample a completed %i-pick selection, even after live odds change',selectedCount=>{
      seed();const [run]=claim();
      expect(finish(run,choose(run,selectedCount))).toMatchObject({completed:true,admitted:selectedCount});
      expect(claim()).toEqual([]);
      sql('UPDATE public.daily_slate SET ml_home=-166;');
      expect(claim()).toEqual([]);
      expect(sql('SELECT count(*) FROM public.winners_selection_runs;')).toBe('1');
      expect(countBoard()).toBe(selectedCount);
    });

    it('permits a new comparison when a genuinely new candidate qualifies and preserves prior decisions',()=>{
      seed({minutes:8});
      sql("UPDATE public.winners_candidates SET status='reviewing' WHERE game_id='3';");
      const [first]=claim();expect(first.input_snapshot.candidates).toHaveLength(2);
      expect(finish(first,choose(first,1))).toMatchObject({completed:true,admitted:1});
      sql("UPDATE public.winners_candidates SET status='qualified',reviewed_at=clock_timestamp() WHERE game_id='3';");
      const [second]=claim();
      expect(second.id).not.toBe(first.id);
      expect(second.input_snapshot.capacity.remaining).toBe(1);
      expect(second.input_snapshot.previous_selections.map(p=>p.run_id)).toContain(first.id);
      expect(second.input_snapshot.candidates.map(c=>c.game_id)).toEqual(['2','3']);
      expect(finish(second,choose(second,1))).toMatchObject({completed:true,admitted:1});
      expect(countBoard()).toBe(2);
      expect(claim()).toEqual([]);
    });

    it.each(['pending','reviewing','absent'])('waits for a %s same-kickoff peer until the final comparison window',status=>{
      seed({count:status==='absent'?2:3});
      if(status==='absent')sql("INSERT INTO public.daily_slate(date,league,commence_time,bdl_game_id,game_status) SELECT date,league,commence_time,3,'scheduled' FROM public.daily_slate WHERE bdl_game_id=1;");
      else sql(`UPDATE public.winners_candidates SET status=${quote(status)} WHERE game_id='3';`);
      expect(claim()).toEqual([]);
      sql(`BEGIN; UPDATE public.daily_slate SET commence_time=now()+interval '8 minutes' WHERE bdl_game_id<900;
        UPDATE public.winners_candidates c SET commence_time=s.commence_time FROM public.daily_slate s WHERE s.bdl_game_id::text=c.game_id; COMMIT;`);
      expect(claim()[0].input_snapshot.candidates).toHaveLength(2);
    });

    it.each(['removed','cancelled','live','retimed'])('excludes an original candidate whose current slate game is %s',change=>{
      seed({count:2});
      if(change==='removed')sql('DELETE FROM public.daily_slate WHERE bdl_game_id=2;');
      if(change==='cancelled')sql("UPDATE public.daily_slate SET game_status='cancelled' WHERE bdl_game_id=2;");
      if(change==='live')sql("UPDATE public.daily_slate SET game_status='live' WHERE bdl_game_id=2;");
      if(change==='retimed')sql("UPDATE public.daily_slate SET commence_time=commence_time+interval '2 hours' WHERE bdl_game_id=2;");
      const [run]=claim();
      expect(run.input_snapshot.candidates.map(c=>c.game_id)).toEqual(['1']);
    });

    it('blocks selection when the slate contains an unknown kickoff',()=>{
      seed({count:1});
      sql('UPDATE public.daily_slate SET commence_time=NULL WHERE bdl_game_id=901;');
      expect(claim()).toEqual([]);
    });

    it.each(['cancelled','live','removed','retimed'])('does not publish when the game becomes %s while Gary is selecting',change=>{
      seed({count:1});const [run]=claim();
      if(change==='cancelled')sql("UPDATE public.daily_slate SET game_status='cancelled' WHERE bdl_game_id=1;");
      if(change==='live')sql("UPDATE public.daily_slate SET game_status='live' WHERE bdl_game_id=1;");
      if(change==='removed')sql('DELETE FROM public.daily_slate WHERE bdl_game_id=1;');
      if(change==='retimed')sql("UPDATE public.daily_slate SET commence_time=commence_time+interval '1 hour' WHERE bdl_game_id=1;");
      expect(finish(run).completed).toBe(false);
      expect(countBoard()).toBe(0);
    });

    it('accepts a price-only market refresh while retaining the exact original ticket odds',()=>{
      seed({count:1});const [run]=claim();sql('UPDATE public.daily_slate SET ml_home=-178;');
      expect(finish(run)).toMatchObject({completed:true,admitted:1});
      expect(sql("SELECT pick_snapshot->>'odds' FROM public.winners_board;")).toBe('-150');
    });

    it.each(['evidence_snapshot','review','pick_snapshot','game_id','market_key','odds','reviewed_at'])('rejects concurrent changes to frozen candidate %s',field=>{
      seed({count:1});const [run]=claim();
      const value=field.endsWith('snapshot') || field==='review' ? "'{}'::jsonb" : field==='odds' ? '-140' : field==='reviewed_at' ? 'clock_timestamp()' : "'different-id'";
      sql(`UPDATE public.winners_candidates SET ${field}=${value} WHERE id=1;`);
      expect(finish(run)).toMatchObject({completed:false,status:'failed'});
      expect(countBoard()).toBe(0);
    });

    it.each(['missing','wrong-policy','wrong-schema','not-eligibility'])('will not claim a candidate with %s factual review provenance',change=>{
      seed({count:1});
      const review={policy_version:'mlb-conviction-v3',schema_version:3,eligibility_only:true};
      if(change==='wrong-policy')review.policy_version='exact-ticket-v2';
      if(change==='wrong-schema')review.schema_version=2;
      if(change==='not-eligibility')review.eligibility_only=false;
      sql(`UPDATE public.winners_candidates SET review=${change==='missing'?'NULL':json(review)};`);
      expect(claim()).toEqual([]);
    });

    it.each(['summary','reason','comparison','expected_outcome','selected','rank','candidate_id'])('rejects malformed JSON types for %s at the SQL boundary',field=>{
      seed({count:1});const [run]=claim();const selection=choose(run);
      if(field==='summary')selection.summary={text:'This object is not an actual string summary'};
      else selection.ranked_candidates[0][field]=['selected','rank','candidate_id'].includes(field) ? String(selection.ranked_candidates[0][field]) : {text:'This object has sufficiently long serialized text'};
      expect(finish(run,selection).completed).toBe(false);
      expect(countBoard()).toBe(0);
    });

    it.each(['missing','duplicate','unseen','out-of-order','non-prefix','over-capacity'])('rejects a %s ranking without a partial publication',change=>{
      seed();const [run]=claim();const selection=choose(run,1);
      if(change==='missing')selection.ranked_candidates.pop();
      if(change==='duplicate')selection.ranked_candidates[1].candidate_id=selection.ranked_candidates[0].candidate_id;
      if(change==='unseen')selection.ranked_candidates[1].candidate_id=999;
      if(change==='out-of-order')selection.ranked_candidates[1].rank=1;
      if(change==='non-prefix'){selection.ranked_candidates[0].selected=false;selection.ranked_candidates[1].selected=true;}
      if(change==='over-capacity')selection.ranked_candidates.forEach(c=>{c.selected=true;});
      expect(finish(run,selection).completed).toBe(false);
      expect(countBoard()).toBe(0);
      expect(sql("SELECT count(*) FROM public.winners_decision_events WHERE event IN ('gary_selected','admitted');")).toBe('0');
    });

    it('rejects null, stale and expired lease tokens while preserving the valid active attempt',()=>{
      seed({count:1});const [run]=claim();
      expect(finish(run,choose(run),{attempt:null}).reason).toMatch(/Stale/);
      expect(finish(run,choose(run),{attempt:2}).reason).toMatch(/Stale/);
      expect(sql(`SELECT status FROM public.winners_selection_runs WHERE id=${run.id};`)).toBe('selecting');
      sql(`UPDATE public.winners_selection_runs SET lease_until=NULL WHERE id=${run.id};`);
      expect(finish(run).reason).toMatch(/Stale/);
      sql(`UPDATE public.winners_selection_runs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=${run.id};`);
      expect(finish(run).reason).toMatch(/Stale/);
      expect(countBoard()).toBe(0);
    });

    it.each(['lease','kickoff'])('checks the real %s clock after a transaction has already started',boundary=>{
      seed({count:1,later:false});const [selectionRun]=claim();
      // A transaction's now() is fixed before pg_sleep. These fixture-only
      // updates put the already-frozen decision just across the deadline so
      // stale transaction time would incorrectly permit publication.
      const changes=boundary==='lease'
        ? `UPDATE public.winners_selection_runs SET lease_until=now()+interval '0.6 seconds' WHERE id=${selectionRun.id};`
        : `UPDATE public.daily_slate SET commence_time=now()+interval '30.6 seconds';
          UPDATE public.winners_candidates SET commence_time=now()+interval '30.6 seconds';
          UPDATE public.winners_selection_runs SET input_snapshot=jsonb_set(jsonb_set(input_snapshot,'{candidates}',
            (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.winners_candidates c)),
            '{slate}',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.commence_time) FROM public.daily_slate s)) WHERE id=${selectionRun.id};`;
      const output=sql(`BEGIN; ${changes} SELECT pg_sleep(1);
        SELECT public.finish_mlb_winners_selection(${selectionRun.id},${selectionRun.attempts},${json(choose(selectionRun))},'test-gary',10); COMMIT;`);
      const result=JSON.parse(output.split('\n').find(line=>line.startsWith('{')));
      expect(result.completed).toBe(false);
      expect(result.reason).toMatch(boundary==='lease'?/Stale/:/before kickoff/);
      expect(countBoard()).toBe(0);
    });

    it('retries infrastructure failure on the same frozen run at most once',()=>{
      seed({count:1});const [run]=claim();
      expect(finish(run,null,{error:'Provider unavailable'})).toMatchObject({completed:false,status:'failed'});
      expect(claim()).toEqual([]);
      sql(`UPDATE public.winners_selection_runs SET completed_at=clock_timestamp()-interval '2 minutes' WHERE id=${run.id};`);
      const [retry]=claim();expect(retry.id).toBe(run.id);expect(retry.attempts).toBe(2);
      expect(retry.input_snapshot).toEqual(run.input_snapshot);
      expect(finish(run).reason).toMatch(/Stale/);
      expect(finish(retry,null,{error:'Provider still unavailable'}).completed).toBe(false);
      sql(`UPDATE public.winners_selection_runs SET completed_at=clock_timestamp()-interval '2 minutes' WHERE id=${run.id};`);
      expect(claim()).toEqual([]);
    });

    it('serializes concurrent claims and competing finish calls without duplicate admission',async()=>{
      const date=seed({count:8,later:false});
      const statement=`SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.claim_mlb_winners_selection(${quote(date)},(SELECT commence_time FROM public.daily_slate WHERE bdl_game_id=1)) r;`;
      const claims=await Promise.all([1,2].map(()=>run(`${bin}/psql`,[...args(),'-c',statement],{env:pgEnv})));
      const selections=claims.map(r=>JSON.parse(r.stdout.trim()));
      expect(selections.map(r=>r.length).sort()).toEqual([0,1]);
      const selected=selections.flat()[0];expect(selected.input_snapshot.capacity.remaining).toBe(6);
      const finishSql=`SELECT public.finish_mlb_winners_selection(${selected.id},${selected.attempts},${json(choose(selected,6))},'test-gary',10);`;
      const completions=await Promise.all([1,2].map(()=>run(`${bin}/psql`,[...args(),'-c',finishSql],{env:pgEnv})));
      expect(completions.map(r=>JSON.parse(r.stdout.trim()).completed).sort()).toEqual([false,true]);
      expect(countBoard()).toBe(6);
      expect(sql("SELECT count(*) FROM public.winners_decision_events WHERE event='admitted';")).toBe('6');
    });

    it('preserves the two/four/six group reservations across Gary\'s actual admissions',()=>{
      seed({count:9,later:false});
      sql(`BEGIN; UPDATE public.daily_slate SET commence_time=now()+make_interval(mins=>CASE WHEN bdl_game_id<=3 THEN 20 WHEN bdl_game_id<=6 THEN 21 ELSE 22 END);
        UPDATE public.winners_candidates c SET commence_time=s.commence_time FROM public.daily_slate s WHERE s.bdl_game_id::text=c.game_id; COMMIT;`);
      for(const gameId of [1,4,7]) {
        const [selectionRun]=claim(today(),gameId);
        expect(selectionRun.input_snapshot.capacity.remaining).toBe(2);
        expect(selectionRun.input_snapshot.candidates).toHaveLength(3);
        expect(finish(selectionRun,choose(selectionRun,2))).toMatchObject({completed:true,admitted:2});
      }
      expect(countBoard()).toBe(6);
      expect(sql(`SELECT string_agg(cohort||':'||n,',' ORDER BY cohort) FROM (SELECT public.winners_prop_cohort(${quote(today())},'MLB',c.commence_time) cohort,count(*) n FROM public.winners_board b JOIN public.winners_candidates c ON c.id=b.candidate_id GROUP BY 1) x;`)).toBe('1:2,2:2,3:2');
    });

    it.each([{model:null},{model:''},{ms:null},{ms:-1}])('requires model and nonnegative timing provenance: %j',overrides=>{
      seed({count:1});const [selectionRun]=claim();
      expect(finish(selectionRun,choose(selectionRun),overrides).completed).toBe(false);
      expect(countBoard()).toBe(0);
    });

    it('keeps old MLB game admission and current other-sport policies separate from the new lane',()=>{
      const date=seed({count:1,policy:'exact-ticket-v2'});
      expect(claim(date)).toEqual([]);
      expect(sql(`SELECT public.release_winners_board(${quote(date)},'MLB','game');`)).toBe('0');
      sql("UPDATE public.winners_candidates SET game_date='2026-09-04';");
      expect(sql("SELECT public.release_winners_board('2026-09-04','MLB','game');")).toBe('1');
      sql(`INSERT INTO public.winners_candidates(game_date,league,kind,game_id,ticket_key,market_key,pick_text,odds,commence_time,pick_snapshot,status,reviewed_at)
        VALUES (${quote(date)},'NFL','game','nfl-1','nfl-ticket','nfl-market','Home ML -150',-150,clock_timestamp()+interval '1 hour','{}','qualified',clock_timestamp());`);
      expect(sql(`SELECT public.release_winners_board(${quote(date)},'NFL','game');`)).toBe('1');
      expect(sql("SELECT count(*) FROM public.winners_selection_runs;")).toBe('0');
    });
  });
});
