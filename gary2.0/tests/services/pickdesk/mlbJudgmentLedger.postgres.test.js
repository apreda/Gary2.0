import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { accessSync, constants, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { runMlbJudgment, mlbJudgmentEvidenceError } from '../../../src/services/agentic/orchestrator/mlbJudgment.js';
import { createMlbJudgmentJournal } from '../../../src/services/pickdesk/mlbJudgmentStorage.js';
import { randomUUID } from 'node:crypto';
import { buildMlbExpectationSnapshot } from '../../../src/services/diary/mlbExpectations.js';
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
const args=()=>['-h',directory,'-p','55449','-U','testadmin','-d','postgres','-X','-v','ON_ERROR_STOP=1','-At'];
const sql=s=>execFileSync(`${bin}/psql`,[...args(),'-c',s],{env:pgEnv,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
describe.skipIf(!supported)('Immutable MLB judgment ledger on isolated local Postgres',{timeout:15000},()=>{
  beforeAll(()=>{
    directory=mkdtempSync(path.join(tmpdir(),'gary-judgment-pg-'));
    try {
      execFileSync(`${bin}/initdb`,['-D',`${directory}/data`,'-A','trust','-U','testadmin','--no-locale'],{env:pgEnv,stdio:'pipe'});
      execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-l',`${directory}/server.log`,'-o',`-k ${directory} -h '' -p 55449`,'-w','start'],{env:pgEnv,stdio:'pipe'});
      started=true;
    } catch(error) {
      let serverLog='';
      try { serverLog=readFileSync(`${directory}/server.log`,'utf8'); } catch {}
      throw new Error(`Could not start isolated Winners Postgres: ${error.stderr?.toString() || error.message}\n${serverLog}`,{cause:error});
    }
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE TABLE public.daily_slate(date text,league text,commence_time timestamptz,bdl_game_id bigint,game_status text,ml_home integer); CREATE TABLE public.daily_picks(date text,picks jsonb); CREATE TABLE public.game_results(id bigint generated always as identity primary key,game_date text,game_id text,league text,pick_text text,result text); GRANT SELECT ON public.daily_slate,public.daily_picks,public.game_results TO service_role;`);
    const identityMigrations=readdirSync(new URL('../../../supabase/migrations/',import.meta.url)).filter(name=>name.endsWith('_mlb_original_evidence_identity_guards.sql') || name.endsWith('_mlb_winners_review_prerequisites.sql')).sort();
    expect(identityMigrations).toHaveLength(2);
    for(const name of ['20260904203500_winners_admissions.sql','20260904203650_winners_review_recovery.sql','20260904205218_winners_prop_cohort_reservations.sql','20260908150211_mlb_gary_winners_selection.sql','20260909133844_winners_underdog_admission.sql','20260908155113_mlb_durable_judgment_ledger.sql',...identityMigrations])sql(readFileSync(new URL(`../../../supabase/migrations/${name}`,import.meta.url),'utf8'));
  },30000);
  afterAll(()=>{if(started)execFileSync(`${bin}/pg_ctl`,['-D',`${directory}/data`,'-m','immediate','-w','stop'],{env:pgEnv,stdio:'ignore'});if(directory)rmSync(directory,{recursive:true,force:true});});
  beforeEach(()=>sql('TRUNCATE public.winners_decision_events,public.winners_board,public.winners_candidates,public.winners_selection_runs,public.daily_slate,public.daily_picks,public.game_results,public.mlb_expectation_review_attempts,public.mlb_expectation_reviews,public.mlb_judgment_events,public.mlb_judgment_runs RESTART IDENTITY CASCADE;'));
  const quote=value=>`'${String(value).replaceAll("'","''")}'`;
  const json=value=>`${quote(JSON.stringify(value))}::jsonb`;
  const query=s=>JSON.parse(sql(s).split('\n').find(line=>line.startsWith('{') || line.startsWith('[')));
  const phases=['opening','middle','finish','offense'];
  const today=()=>sql("SELECT (clock_timestamp() AT TIME ZONE 'America/New_York')::date::text;");
  const setup=({seconds=1200,decision='endorse',spread=false}={})=>{
    const kickoff=sql(`SELECT clock_timestamp()+make_interval(secs=>${seconds});`);
    const date=sql(`SELECT (${quote(kickoff)}::timestamptz AT TIME ZONE 'America/New_York')::date::text;`);
    const id=randomUUID(), ticket={id:'home-ticket',side:'home',type:spread?'spread':'moneyline',line:spread?1.5:null,odds:-150,pick:spread?'Home +1.5 -150':'Home ML -150'};
    const source={gameKind:spread?'runline':'moneyline',allowedTickets:spread?[ticket,{id:'away-ticket',side:'away',type:'spread',line:-1.5,odds:130,pick:'Away -1.5 +130'}]:[ticket],game:{bdl_game_id:1,home_team:'Home',away_team:'Away'},deskText:'Original starter record shows six innings with two earned runs.',researchBriefing:'Original lineup was announced.',toolResponses:[{content:{starter:'Original pitcher workload from a dated tool response.'}}],odds_visibility:'odds_visible'};
    const initial={winner:spread?'away':'home',ticket_id:ticket.id,whole_game_view:'Home should control the full baseball game through pitching and offense.',expectations:Object.fromEntries(phases.map(p=>[p,{claim:`Home should handle the ${p} phase.`,evidence:'Original starter record shows six innings with two earned runs.',disconfirming_observation:'Starter loses command and allows multiple baserunners.'}])),strongest_opposing_case:'Away can exploit early command trouble.',uncertain_assumption:'Starter command holds through the first trip.',factual_questions:[]};
    const research={status:'not_requested',questions:[],results:null};
    const stress={...initial,strongest_alternative:{scenario:'Away jumps on early command trouble.',effect_on_expected_outcome:'Home would have to win through relief and offense.',response:'The supplied starter record still favors Home.'},changed_side:false,revision_evidence:[]};
    const price={ticket_id:ticket.id,decision,reason:'Gary endorses his committed outcome at the exact allowed ticket.'};
    const pick={game_id:1,league:'MLB',model:'test-gary',prompt_sha:'prompt-hash',odds_visibility:'odds_visible',commence_time:kickoff,homeTeam:'Home',awayTeam:'Away',pick:ticket.pick,type:ticket.type,odds:ticket.odds,...(spread?{spread:1.5}:{}),rationale:'Original starter record supports the expected complete game.',judgment_run_id:id,decision_policy:'mlb-judgment-v2',price_endorsement:decision};
    const envelope=data=>({schema_version:1,policy_version:'mlb-judgment-v2',odds_visibility:'odds_visible',odds_visible:true,game_id:'1',game_date:date,recorded_at:new Date().toISOString(),data});
    return {id,date,kickoff,ticket,source,initial,research,stress,price,pick,envelope,receipts:{},payloads:{}};
  };
  const start=(f,payload=f.payloads.initial_commit ||= f.envelope(f.initial))=>{
    const receipt=query(`SET ROLE service_role; SELECT public.start_mlb_judgment(${quote(f.id)},${quote(f.date)},'1',${quote(f.kickoff)},'test-gary','prompt-hash',${json(f.source)},${json(payload)});`);
    f.receipts.initial_commit=receipt;return receipt;
  };
  const append=(f,phase,data)=>{
    const payload=f.payloads[phase] ||= f.envelope(data);
    const previous=Object.values(f.receipts).at(-1).payload_sha256;
    const receipt=query(`SELECT public.append_mlb_judgment_phase(${quote(f.id)},${quote(phase)},${json(payload)},${quote(previous)});`);
    f.receipts[phase]=receipt;return receipt;
  };
  const published=f=>{
    start(f);append(f,'factual_research',f.research);append(f,'stress_test',f.stress);append(f,'price_assessment',f.price);
    sql(`INSERT INTO public.daily_picks VALUES (${quote(f.date)},${json([f.pick])});`);
    append(f,'published',{final_pick_snapshot:f.pick});return f;
  };
  const journal=f=>({schema_version:1,policy_version:'mlb-judgment-v2',odds_visibility:'odds_visible',odds_visible:true,run_id:f.id,game_id:'1',game_date:f.date,home_team:'Home',away_team:'Away',gameKind:f.source.gameKind,allowedTickets:f.source.allowedTickets,initial:f.initial,research:f.research,stress:f.stress,price:f.price,final_ticket:f.ticket,winners_eligible:f.price.decision==='endorse',receipts:f.receipts});
  const candidate=f=>{
    sql(`INSERT INTO public.daily_slate(date,league,commence_time,bdl_game_id,game_status) VALUES (${quote(f.date)},'MLB',${quote(f.kickoff)},1,'scheduled');
    INSERT INTO public.winners_candidates(game_date,league,kind,game_id,ticket_key,market_key,pick_text,odds,commence_time,pick_snapshot,evidence_snapshot,policy_version,status,reviewed_at,review,attempts)
    VALUES (${quote(f.date)},'MLB','game','1','ticket-1','market-1',${quote(f.pick.pick)},-150,${quote(f.kickoff)},${json(f.pick)},${json({deskText:f.source.deskText,researchBriefing:f.source.researchBriefing,toolResponses:f.source.toolResponses,mlbJudgment:journal(f)})},'mlb-conviction-v4','qualified',clock_timestamp(),'{"schema_version":4,"policy_version":"mlb-conviction-v4","eligibility_only":true}',1);`);
  };
  const claim=f=>query(`SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.claim_mlb_winners_selection(${quote(f.date)},${quote(f.kickoff)}) r;`);
  const choice=r=>({summary:'The original complete game judgment supports this exact ticket.',ranked_candidates:r.input_snapshot.candidates.map((c,i)=>({candidate_id:c.id,rank:i+1,selected:true,expected_outcome:'Home wins the committed ticket.',reason:'Original starter and offense support the complete game.',comparison:'This is the strongest supplied original judgment.'}))});
  const finish=(r,selection=choice(r))=>query(`SELECT public.finish_mlb_winners_selection(${r.id},${r.attempts},${json(selection)},'test-gary',10);`);
  // Each fixture makes several real psql/RPC round trips. Give those writes
  // headroom under parallel-suite CPU load, then cross the actual server
  // cutoff without changing any production clock or immutable timestamps.
  const pregameLeadSeconds=5;
  const waitUntilPostgame=f=>{
    sql(`SELECT pg_sleep(GREATEST(0,EXTRACT(EPOCH FROM (${quote(f.kickoff)}::timestamptz-clock_timestamp())))+0.05);`);
    expect(sql(`SELECT clock_timestamp()>${quote(f.kickoff)}::timestamptz;`)).toBe('t');
  };

  it('atomically commits the initial judgment with server time and content hashes; replay cannot rewrite it',()=>{
    const f=setup();const first=start(f);expect(first).toMatchObject({ok:true,run_id:f.id,phase:'initial_commit'});
    expect(first.payload_sha256).toMatch(/^[a-f0-9]{64}$/);expect(start(f)).toEqual(first);
    expect(()=>start(f,{...f.payloads.initial_commit,data:{...f.initial,whole_game_view:'Changed history'}})).toThrow();
    expect(sql('SELECT count(*) FROM public.mlb_judgment_events;')).toBe('1');
    expect(sql('SELECT bool_and(e.recorded_at>=r.created_at AND e.recorded_at<r.commence_time) FROM public.mlb_judgment_events e JOIN public.mlb_judgment_runs r USING(run_id);')).toBe('t');
  });
  it('requires sequential durable receipts and preserves each exact phase once',async()=>{
    const f=setup();start(f);
    expect(()=>append(f,'stress_test',f.stress)).toThrow(/out of order/);delete f.payloads.stress_test;
    const payload=f.envelope(f.research),prev=f.receipts.initial_commit.payload_sha256;
    const command=`SELECT public.append_mlb_judgment_phase(${quote(f.id)},'factual_research',${json(payload)},${quote(prev)});`;
    const results=await Promise.all([1,2].map(()=>run(`${bin}/psql`,[...args(),'-c',command],{env:pgEnv})));
    expect(results[0].stdout).toBe(results[1].stdout);
    expect(sql("SELECT count(*) FROM public.mlb_judgment_events WHERE phase='factual_research';")).toBe('1');
    expect(()=>sql(command.replace(json(payload),json({...payload,data:{...f.research,status:'unavailable'}})))).toThrow(/cannot be rewritten/);
  });
  it('enforces the moneyline cap and exact outcome while allowing a +1.5 ticket against the expected winner',()=>{
    const capped=setup();capped.source.allowedTickets[0].odds=-180;expect(()=>start(capped)).toThrow(/house limit/);
    const missing=setup();delete missing.initial.winner;expect(()=>start(missing)).toThrow(/Missing original game judgment/);
    const invalid=setup();invalid.initial.winner='away';expect(()=>start(invalid)).toThrow(/contradicts/);
    const f=published(setup({spread:true}));expect(f.receipts.published.ok).toBe(true);
  });
  it('requires evidence for a side or ticket revision and never lets price switch the stress-test ticket',()=>{
    const f=setup();start(f);append(f,'factual_research',f.research);
    expect(()=>append(f,'stress_test',{...f.stress,changed_side:true})).toThrow(/flag conflicts/);delete f.payloads.stress_test;
    append(f,'stress_test',f.stress);
    expect(()=>append(f,'price_assessment',{...f.price,ticket_id:'unseen'})).toThrow(/unchanged stress-test ticket/);
  });
  it('requires an exact confirmed public append before storing publication, then forbids further phases',()=>{
    const f=setup();start(f);append(f,'factual_research',f.research);append(f,'stress_test',f.stress);append(f,'price_assessment',f.price);
    expect(()=>append(f,'published',{final_pick_snapshot:f.pick})).toThrow(/confirmed public pick/);
    sql(`INSERT INTO public.daily_picks VALUES (${quote(f.date)},${json([{...f.pick,odds:-151}])});`);
    expect(()=>append(f,'published',{final_pick_snapshot:f.pick})).toThrow(/confirmed public pick/);
    sql(`UPDATE public.daily_picks SET picks=${json([f.pick])};`);append(f,'published',{final_pick_snapshot:f.pick});
    expect(()=>append(f,'failed',{error:'A later failure cannot alter a publication.'})).toThrow(/terminal phase/);
  });
  it('cannot backdate initial or later phases, but can record a terminal failure after kickoff',()=>{
    expect(()=>start(setup({seconds:-1}))).toThrow(/future exact game/);
    const f=setup({seconds:pregameLeadSeconds});start(f);waitUntilPostgame(f);
    expect(()=>append(f,'factual_research',f.research)).toThrow(/missed first pitch/);
    append(f,'failed',{error:'Research could not finish before kickoff.'});
    expect(()=>append(f,'stress_test',f.stress)).toThrow(/terminal phase/);
  });
  it('makes original runs, phases and completed reviews private and denies direct service mutation',()=>{
    const f=published(setup());
    for(const table of ['mlb_judgment_runs','mlb_judgment_events','mlb_expectation_reviews','mlb_expectation_review_attempts']) {
      expect(()=>sql(`SET ROLE anon; SELECT * FROM public.${table};`)).toThrow(/permission denied/);
      expect(()=>sql(`SET ROLE authenticated; SELECT * FROM public.${table};`)).toThrow(/permission denied/);
    }
    expect(()=>sql('SET ROLE service_role; DELETE FROM public.mlb_judgment_events;')).toThrow(/permission denied/);
    expect(()=>sql(`UPDATE public.mlb_judgment_runs SET model='rewritten' WHERE run_id=${quote(f.id)};`)).toThrow(/immutable/);
    expect(()=>sql('DELETE FROM public.mlb_judgment_events;')).toThrow(/immutable/);
    expect(()=>sql(`SET ROLE anon; SELECT public.append_mlb_judgment_phase(${quote(f.id)},'failed','{}','fake');`)).toThrow(/permission denied/);
    expect(sql('SET ROLE service_role; SELECT count(*) FROM public.mlb_judgment_events;').split('\n').at(-1)).toBe('5');
  });
  it('admits only the completed endorsed v4 record; copied receipts cannot authenticate changed judgments',()=>{
    const f=published(setup());candidate(f);
    expect(sql('SET ROLE service_role; SELECT public.mlb_judgment_candidate_eligible(c) FROM public.winners_candidates c;').split('\n').at(-1)).toBe('t');
    sql("UPDATE public.winners_candidates SET evidence_snapshot=jsonb_set(evidence_snapshot,'{mlbJudgment,stress,whole_game_view}','\"A rewritten persuasive narrative\"');");
    expect(claim(f)).toEqual([]);
    sql(`UPDATE public.winners_candidates SET evidence_snapshot=${json({deskText:f.source.deskText,researchBriefing:f.source.researchBriefing,toolResponses:f.source.toolResponses,mlbJudgment:journal(f)})};`);
    const [r]=claim(f);expect(r.policy_version).toBe('mlb-conviction-v4');expect(finish(r)).toMatchObject({completed:true,admitted:1});
    expect(sql('SELECT pick_snapshot FROM public.winners_board;')).toBe(sql('SELECT pick_snapshot FROM public.winners_candidates;'));
    expect(claim(f)).toEqual([]);
  });
  it('keeps a declined exact ticket public but excludes it from Winners even if marked qualified',()=>{
    const f=published(setup({decision:'decline'}));candidate(f);
    expect(sql('SELECT count(*) FROM public.daily_picks;')).toBe('1');expect(claim(f)).toEqual([]);
    expect(sql('SELECT count(*) FROM public.winners_board;')).toBe('0');
  });
  it('fails the entire selection when an eligible candidate changes after the frozen read',()=>{
    const f=published(setup());candidate(f);const [r]=claim(f);
    sql("UPDATE public.winners_candidates SET evidence_snapshot=jsonb_set(evidence_snapshot,'{mlbJudgment,receipts,published,payload_sha256}','\"forged\"');");
    expect(finish(r)).toMatchObject({completed:false});expect(sql('SELECT count(*) FROM public.winners_board;')).toBe('0');
  });

  it('runs the real staged workflow and storage adapter against PostgreSQL, then admits the exact published journal',async()=>{
    const f=setup();
    const db={async rpc(name,args){
      const values=Object.values(args).map(value=>value && typeof value==='object'?json(value):quote(value));
      try {return {data:query(`SET ROLE service_role; SELECT public.${name}(${values.join(',')});`),error:null};}
      catch(error){return {data:null,error};}
    }};
    const writer=createMlbJudgmentJournal({db,game:{bdl_game_id:1,commence_time:f.kickoff},model:'test-gary',promptSha:'prompt-hash',runId:f.id});
    const cleanStress={...f.stress};for(const key of ['strongest_opposing_case','uncertain_assumption','factual_questions'])delete cleanStress[key];
    const judgments={initial_commit:f.initial,stress_test:cleanStress,price_assessment:f.price};
    let completed=0;
    const output=await runMlbJudgment({input:{gameId:'1',gameDate:f.date,homeTeam:'Home',awayTeam:'Away',...f.source},
      ask:async(_prompt,{phase})=>{
        expect(Number(sql('SELECT count(*) FROM public.mlb_judgment_events;'))).toBe(completed);
        return JSON.stringify(judgments[phase]);
      },record:async(phase,payload)=>{const receipt=await writer.record(phase,payload,f.source);completed++;return receipt;}});
    expect(Object.keys(output.receipts)).toHaveLength(4);
    sql(`INSERT INTO public.daily_picks VALUES (${quote(f.date)},${json([f.pick])});`);
    output.receipts.published=await writer.publish(f.pick);
    expect(mlbJudgmentEvidenceError(output,{pick:f.pick,gameDate:f.date})).toBeNull();
    Object.assign(f,{initial:output.initial,research:output.research,stress:output.stress,price:output.price,receipts:output.receipts});
    candidate(f);const [selection]=claim(f);expect(selection).toBeTruthy();expect(finish(selection)).toMatchObject({completed:true,admitted:1});
  });


  it('excludes a malformed copied receipt without blocking a valid candidate in the same pool',()=>{
    const f=published(setup());candidate(f);
    sql(`INSERT INTO public.winners_candidates(game_date,league,kind,game_id,ticket_key,market_key,pick_text,odds,commence_time,pick_snapshot,evidence_snapshot,policy_version,status,reviewed_at,review,attempts)
      SELECT game_date,league,kind,game_id,ticket_key||'-malformed',market_key||'-malformed',pick_text,odds,commence_time,pick_snapshot,
        jsonb_set(evidence_snapshot,'{mlbJudgment,receipts,published,recorded_at}','"not-a-date"'),policy_version,status,reviewed_at,review,attempts FROM public.winners_candidates;`);
    const [r]=claim(f);expect(r.input_snapshot.candidates).toHaveLength(1);expect(r.input_snapshot.candidates[0].ticket_key).toBe('ticket-1');
  });
  it.each(['model','prompt_sha','odds_visibility'])('rejects a published pick with changed %s provenance',field=>{
    const f=setup();start(f);append(f,'factual_research',f.research);append(f,'stress_test',f.stress);append(f,'price_assessment',f.price);
    const changed={...f.pick,[field]:'wrong-original'};sql(`INSERT INTO public.daily_picks VALUES (${quote(f.date)},${json([changed])});`);
    expect(()=>append(f,'published',{final_pick_snapshot:changed})).toThrow(/exact committed ticket/);
  });


  it.each(['changed','omitted','injected'])('excludes a candidate with %s original tool responses',kind=>{
    const f=published(setup());candidate(f);
    expect(sql('SET ROLE service_role; SELECT public.mlb_judgment_candidate_eligible(c) FROM public.winners_candidates c;').split('\n').at(-1)).toBe('t');
    const replacement=structuredClone(f.source.toolResponses);
    if(kind==='changed')replacement[0].content.starter='A substituted pitcher report after the commitment.';
    if(kind==='injected')replacement.push({content:'New evidence that the original Gary never saw.'});
    sql(kind==='omitted'?"UPDATE public.winners_candidates SET evidence_snapshot=evidence_snapshot-'toolResponses';"
      :`UPDATE public.winners_candidates SET evidence_snapshot=jsonb_set(evidence_snapshot,'{toolResponses}',${json(replacement)});`);
    expect(sql('SET ROLE service_role; SELECT public.mlb_judgment_candidate_eligible(c) FROM public.winners_candidates c;').split('\n').at(-1)).toBe('f');
    expect(claim(f)).toEqual([]);expect(sql('SELECT count(*) FROM public.winners_board;')).toBe('0');
  });
  it('fails a frozen selection when its original tool responses change before admission',()=>{
    const f=published(setup());candidate(f);const [r]=claim(f);
    sql("UPDATE public.winners_candidates SET evidence_snapshot=jsonb_set(evidence_snapshot,'{toolResponses}','[]');");
    expect(finish(r)).toMatchObject({completed:false});expect(sql('SELECT count(*) FROM public.winners_board;')).toBe('0');
  });

  const postgame=({originalGame={}}={})=>{
    const original=setup({seconds:pregameLeadSeconds});Object.assign(original.source.game,originalGame);
    const f=published(original);waitUntilPostgame(f);
    const header=query(`SELECT to_jsonb(r) FROM public.mlb_judgment_runs r WHERE run_id=${quote(f.id)};`);
    const events=query(`SELECT jsonb_agg(to_jsonb(e) ORDER BY event_id) FROM public.mlb_judgment_events e WHERE run_id=${quote(f.id)};`);
    const snapshot=buildMlbExpectationSnapshot(header,events);
    sql(`INSERT INTO public.game_results(game_date,game_id,league,pick_text,result) VALUES (${quote(f.date)},'1','MLB',${quote(f.pick.pick)},'won');`);
    const result=query('SELECT to_jsonb(r) FROM public.game_results r LIMIT 1;');
    const observed=new Date().toISOString();
    const sources=[{source_id:'postgame:99:final',kind:'final',url:'https://statsapi.mlb.com/api/v1/schedule?date='+f.date,observed_at:observed,text:JSON.stringify({gamePk:99,officialDate:f.date,gameDate:f.kickoff,status:{abstractGameState:'Final'},teams:{home:{team:{name:'Home'}},away:{team:{name:'Away'}}}})},{source_id:'postgame:99:boxscore',kind:'boxscore',url:'https://statsapi.mlb.com/api/v1/game/99/boxscore',observed_at:observed,text:'Home starter completed six innings with two earned runs.'}];
    const evidence={snapshot,result,game_evidence:{league:'MLB',game_date:f.date,game_id:'1',game_pk:99,final:true,sources},review_started_at:observed,review_completed_at:observed};
    const review={schema_version:1,policy_version:'mlb-expectation-v1',run_id:f.id,game_date:f.date,game_id:'1',result:'won',expectations:snapshot.expectations.map(e=>({expectation_id:e.expectation_id,decision_review:{assessment:'no_identified_error',explanation:'The original factual record supported this expected game phase.',evidence:[{source_id:e.expectation_id,quote:e.claim},{source_id:'pregame:desk',quote:'Original starter record shows six innings'}]},outcome_review:{status:'observed',explanation:'The supplied boxscore records the stated pitching performance.',evidence:[{source_id:'postgame:99:boxscore',quote:'Home starter completed six innings'}]}}))};
    return {f,evidence,review,leaseToken:randomUUID()};
  };
  const record=p=>{
    if(!p.claimed){sql(`SET ROLE service_role; SELECT public.claim_mlb_expectation_review(${quote(p.f.id)},${quote(p.leaseToken)},420);`);p.claimed=true;}
    return sql(`SET ROLE service_role; SELECT public.record_mlb_expectation_review(${quote(p.f.id)},'test-review',${json(p.review)},${json(p.evidence)},${quote(p.leaseToken)});`).split('\n').at(-1);
  };

  const replaceOfficialFinal=(p,changes)=>{
    const source=p.evidence.game_evidence.sources.find(s=>s.kind==='final');
    source.text=JSON.stringify({...JSON.parse(source.text),...changes});
  };
  it('uses the exact original scheduled start when the immutable source has no official gamePk',()=>{
    const p=postgame();expect(p.evidence.snapshot.game_pk).toBeNull();
    expect(record(p)).toBe('t');
  });
  it.each(['gamePk','game_pk','mlb_game_pk'])('accepts the authoritative original %s alias for the exact official game',alias=>{
    const p=postgame({originalGame:{[alias]:99}});expect(p.evidence.snapshot.game_pk).toBe(99);
    expect(record(p)).toBe('t');
  });
  it.each(['gamePk','game_pk','mlb_game_pk'])('rejects a replaced %s even when the submitted snapshot and final sources agree',alias=>{
    const p=postgame({originalGame:{[alias]:98}});
    // The immutable run says 98; this manufactured snapshot and the supplied
    // final/box-score sources consistently say 99. Their agreement is not proof.
    p.evidence.snapshot.game_pk=99;
    expect(()=>record(p)).toThrow();expect(sql('SELECT count(*) FROM public.mlb_expectation_reviews;')).toBe('0');
  });

  it('rejects changing the original official ID JSON type even when its text is the same',()=>{
    const p=postgame({originalGame:{gamePk:99}});p.evidence.snapshot.game_pk='99';
    expect(()=>record(p)).toThrow();expect(sql('SELECT count(*) FROM public.mlb_expectation_reviews;')).toBe('0');
  });
  it('requires the explicit original null official ID instead of omitting the preserved field',()=>{
    const p=postgame();delete p.evidence.snapshot.game_pk;
    expect(()=>record(p)).toThrow();expect(sql('SELECT count(*) FROM public.mlb_expectation_reviews;')).toBe('0');
  });

  it('rejects removal of the official gamePk already recorded in the original source',()=>{
    const p=postgame({originalGame:{game_pk:99}});p.evidence.snapshot.game_pk=null;
    expect(()=>record(p)).toThrow();expect(sql('SELECT count(*) FROM public.mlb_expectation_reviews;')).toBe('0');
  });
  it('rejects an invented snapshot gamePk that tries to bypass the exact-time doubleheader check',()=>{
    const p=postgame();expect(p.evidence.snapshot.game_pk).toBeNull();
    p.evidence.snapshot.game_pk=99;
    replaceOfficialFinal(p,{gameDate:new Date(Date.parse(p.f.kickoff)-3*60*60*1000).toISOString()});
    expect(()=>record(p)).toThrow();expect(sql('SELECT count(*) FROM public.mlb_expectation_reviews;')).toBe('0');
  });
  it('rejects a same-date same-team game at a different start when the original official ID is absent',()=>{
    const p=postgame();
    replaceOfficialFinal(p,{gameDate:new Date(Date.parse(p.f.kickoff)-3*60*60*1000).toISOString()});
    expect(()=>record(p)).toThrow();expect(sql('SELECT count(*) FROM public.mlb_expectation_reviews;')).toBe('0');
  });

  it('records an immutable postgame review against original claims and exact settled public ticket',()=>{
    const p=postgame();expect(record(p)).toBe('t');expect(record(p)).toBe('f');
    expect(sql('SELECT length(source_hash) FROM public.mlb_expectation_reviews;')).toBe('64');
    p.review.expectations[0].outcome_review.explanation='A rewritten account of this outcome.';
    expect(()=>record(p)).toThrow(/cannot be rewritten/);
    expect(()=>sql("UPDATE public.mlb_expectation_reviews SET review='{}';")).toThrow(/immutable/);
  });
  it('rejects changed claims, missing original sources and fabricated pregame citations',()=>{
    const p=postgame();const valid=structuredClone({evidence:p.evidence,review:p.review});
    p.evidence.snapshot.expectations[0].claim='A hindsight replacement.';expect(()=>record(p)).toThrow(/expectation was changed/);
    p.evidence=structuredClone(valid.evidence);p.evidence.snapshot.original_sources[0].text='A new persuasive pregame story.';expect(()=>record(p)).toThrow(/source was altered/);
    p.evidence=structuredClone(valid.evidence);p.review.expectations[0].decision_review.evidence[1].quote='Invented observation from the future';expect(()=>record(p)).toThrow(/preserved pregame evidence/);
    expect(sql('SELECT count(*) FROM public.mlb_expectation_reviews;')).toBe('0');
  });
  it('requires final exact-game observations and cannot infer an observed mechanism from final score alone',()=>{
    const p=postgame();const valid=structuredClone({evidence:p.evidence,review:p.review});
    p.evidence.game_evidence.final=false;expect(()=>record(p)).toThrow(/final-game evidence/);
    p.evidence=structuredClone(valid.evidence);p.evidence.game_evidence.game_id='2';expect(()=>record(p)).toThrow(/final-game evidence/);
    p.evidence=structuredClone(valid.evidence);p.review.expectations[0].outcome_review.evidence=[{source_id:'postgame:99:final',quote:'"abstractGameState":"Final"'}];expect(()=>record(p)).toThrow(/known finding/);
    p.review=structuredClone(valid.review);p.evidence.game_evidence.sources[1].observed_at=new Date(Date.now()+60000).toISOString();expect(()=>record(p)).toThrow(/observation time/);
  });
  it('requires one unambiguous grade for the original ticket and allows unknown observations',()=>{
    const p=postgame();sql(`INSERT INTO public.game_results(game_date,game_id,league,pick_text,result) VALUES (${quote(p.f.date)},'1','MLB',${quote(p.f.pick.pick)},'lost');`);
    expect(()=>record(p)).toThrow(/unambiguous settled result/);
    sql("DELETE FROM public.game_results WHERE result='lost';");
    p.review.expectations[0].decision_review={assessment:'unknown',explanation:'The record does not resolve the original factual support.',evidence:[]};
    p.review.expectations[0].outcome_review={status:'unknown',explanation:'The actual game observation needed for this claim is unavailable.',evidence:[]};
    expect(record(p)).toBe('t');
  });
  it('preserves an already-frozen legacy v3 selection contract after the v4 cutover',()=>{
    const f=published(setup());candidate(f);
    sql(`UPDATE public.winners_candidates SET policy_version='mlb-conviction-v3',pick_snapshot=jsonb_set(pick_snapshot,'{decision_policy}','"mlb-judgment-v1"'),review='{"schema_version":3,"policy_version":"mlb-conviction-v3","eligibility_only":true}';`);
    expect(claim(f)).toEqual([]);
    const r=query(`INSERT INTO public.winners_selection_runs(game_date,policy_version,cohort,window_start,fingerprint,input_snapshot,lease_until)
      SELECT ${quote(f.date)},'mlb-conviction-v3',3,${quote(f.kickoff)},'historical-v3',jsonb_build_object('candidates',(SELECT jsonb_agg(to_jsonb(c)) FROM public.winners_candidates c),
      'slate',(SELECT jsonb_agg(to_jsonb(s)) FROM public.daily_slate s),'capacity',jsonb_build_object('remaining',6)),clock_timestamp()+interval '7 minutes' RETURNING to_jsonb(winners_selection_runs);`);
    expect(finish(r)).toMatchObject({completed:true,admitted:1});
    expect(sql('SELECT policy_version FROM public.winners_board;')).toBe('mlb-conviction-v3');
  });
  it('leases postgame attempts exclusively, preserves failure history and cools down retries',async()=>{
    const p=postgame(),token=randomUUID();
    const call=t=>`SET ROLE service_role; SELECT public.claim_mlb_expectation_review(${quote(p.f.id)},${quote(t)},420);`;
    const attempts=await Promise.all([token,randomUUID()].map(t=>run(`${bin}/psql`,[...args(),'-c',call(t)],{env:pgEnv})));
    expect(attempts.map(r=>r.stdout.trim().split('\n').at(-1)).sort()).toEqual(['f','t']);
    const active=sql(`SELECT lease_token FROM public.mlb_expectation_review_attempts WHERE run_id=${quote(p.f.id)};`);
    expect(sql(`SELECT public.finish_mlb_expectation_review_attempt(${quote(p.f.id)},${quote(randomUUID())},'not owned');`)).toBe('f');
    expect(sql(`SET ROLE service_role; SELECT public.finish_mlb_expectation_review_attempt(${quote(p.f.id)},${quote(active)},'Official source unavailable');`).split('\n').at(-1)).toBe('t');
    expect(sql(call(randomUUID())).split('\n').at(-1)).toBe('f');
    expect(sql("SELECT status||':'||jsonb_array_length(attempt_history) FROM public.mlb_expectation_review_attempts;")).toBe('failed:1');
    expect(sql("SELECT next_retry_at>=completed_at+interval '30 minutes' FROM public.mlb_expectation_review_attempts;")).toBe('t');
    sql("UPDATE public.mlb_expectation_review_attempts SET next_retry_at=clock_timestamp()-interval '1 second';");
    const next=randomUUID();expect(sql(call(next)).split('\n').at(-1)).toBe('t');
    p.leaseToken=next;p.claimed=true;
    expect(record(p)).toBe('t');
    expect(sql(`SELECT public.finish_mlb_expectation_review_attempt(${quote(p.f.id)},${quote(next)},NULL);`)).toBe('t');
    expect(sql("SELECT status||':'||jsonb_array_length(attempt_history) FROM public.mlb_expectation_review_attempts;")).toBe('completed:2');
    expect(sql(call(randomUUID())).split('\n').at(-1)).toBe('f');
  });

  it('prevents an expired or replaced reviewer from publishing a permanent expectation review',()=>{
    const p=postgame();const old=randomUUID(),next=randomUUID();
    sql(`SELECT public.claim_mlb_expectation_review(${quote(p.f.id)},${quote(old)},420);`);
    sql("UPDATE public.mlb_expectation_review_attempts SET lease_until=clock_timestamp()-interval '1 second';");
    p.leaseToken=old;p.claimed=true;expect(()=>record(p)).toThrow(/current owned/);
    expect(sql(`SELECT public.claim_mlb_expectation_review(${quote(p.f.id)},${quote(next)},420);`)).toBe('t');
    expect(()=>record(p)).toThrow(/current owned/);
    expect(sql('SELECT count(*) FROM public.mlb_expectation_reviews;')).toBe('0');
    p.leaseToken=next;expect(record(p)).toBe('t');
  });

  it('does not spend a factual model attempt before the original v4 publication receipt is available',()=>{
    const f=published(setup());candidate(f);
    sql(`UPDATE public.winners_candidates SET status='pending',attempts=0,review=NULL,reviewed_at=NULL,created_at=clock_timestamp()-interval '1 minute',
      evidence_snapshot=evidence_snapshot#-'{mlbJudgment,receipts,published}';`);
    expect(sql('SET ROLE service_role; SELECT count(*) FROM public.claim_winners_candidate();').split('\n').at(-1)).toBe('0');
    expect(sql('SELECT attempts FROM public.winners_candidates;')).toBe('0');
    // Exact receipt-only recovery supplies the immutable server receipt; the
    // pick, prior four phases, source data and attempt token stay unchanged.
    sql(`UPDATE public.winners_candidates SET evidence_snapshot=jsonb_set(evidence_snapshot,'{mlbJudgment,receipts,published}',${json(f.receipts.published)});`);
    expect(sql('SET ROLE service_role; SELECT attempts FROM public.claim_winners_candidate();').split('\n').at(-1)).toBe('1');
  });
  it('keeps the two-model-attempt limit for complete v4 evidence after provider failures',()=>{
    const f=published(setup());candidate(f);
    sql("UPDATE public.winners_candidates SET status='pending',attempts=0,review=NULL,reviewed_at=NULL,created_at=clock_timestamp()-interval '1 minute';");
    for(const attempt of [1,2]) {
      expect(sql('SET ROLE service_role; SELECT attempts FROM public.claim_winners_candidate();').split('\n').at(-1)).toBe(String(attempt));
      expect(sql(`SET ROLE service_role; SELECT public.finish_winners_review(1,${attempt},'unavailable','factual review: provider unavailable',NULL,'gpt-5.6-sol',100);`).split('\n').at(-1)).toBe('t');
      sql("UPDATE public.winners_candidates SET reviewed_at=clock_timestamp()-interval '3 minutes';");
    }
    expect(sql('SET ROLE service_role; SELECT count(*) FROM public.claim_winners_candidate();').split('\n').at(-1)).toBe('0');
    expect(sql('SELECT attempts FROM public.winners_candidates;')).toBe('2');
  });
  it('leaves the legacy prop review claim contract unchanged',()=>{
    sql(`INSERT INTO public.winners_candidates(game_date,league,kind,game_id,ticket_key,market_key,pick_text,odds,commence_time,pick_snapshot,evidence_snapshot,status,created_at)
      VALUES (${quote(today())},'NBA','prop','100','legacy-prop','legacy-prop-market','Player over points',-110,clock_timestamp()+interval '1 hour','{}','{}','pending',clock_timestamp()-interval '1 minute');`);
    expect(sql('SET ROLE service_role; SELECT attempts FROM public.claim_winners_candidate();').split('\n').at(-1)).toBe('1');
  });

  it('allows a complete declined v4 ticket to leave pending through deterministic exclusion',()=>{
    const f=published(setup({decision:'decline'}));candidate(f);
    sql("UPDATE public.winners_candidates SET status='pending',attempts=0,review=NULL,reviewed_at=NULL,created_at=clock_timestamp()-interval '1 minute';");
    expect(sql('SET ROLE service_role; SELECT attempts FROM public.claim_winners_candidate();').split('\n').at(-1)).toBe('1');
    expect(sql("SET ROLE service_role; SELECT public.finish_winners_review(1,1,'unavailable','Gary declined to endorse this exact priced ticket',NULL,NULL,0);").split('\n').at(-1)).toBe('t');
    expect(sql('SELECT status FROM public.winners_candidates;')).toBe('unavailable');
    expect(claim(f)).toEqual([]);
  });

});
