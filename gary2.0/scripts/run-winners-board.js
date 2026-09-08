#!/usr/bin/env node
/** Durable Winners review worker. Never generates or replaces a public pick. */
import '../src/loadEnv.js';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { supabaseAdmin as supabase } from '../src/supabaseClient.js';
import { reviewPick, reviewProp } from '../src/services/pickdesk/winnersReviewer.js';
import { enqueueWinnersCandidate, coreProp, canonicalProp, winnersCandidate, winnersPickIsHome, WINNERS_CUTOVER_DATE, MLB_WINNERS_POLICY_VERSION, MLB_WINNERS_POLICIES } from '../src/services/pickdesk/winnersAdmissions.js';
import { matchingDesk } from '../src/services/diary/evidence.js';
import { originalGameEvidence, originalEvidenceMatches, reviewSourceDesk } from '../src/services/pickdesk/originalGameEvidence.js';
import { MLB_WINNERS_POLICY, runMlbSelectionWindow } from '../src/services/pickdesk/mlbWinnersSelection.js';
import { mlbJudgmentEvidenceError } from '../src/services/agentic/orchestrator/mlbJudgment.js';
import { mlbCaseOrder } from '../src/services/agentic/orchestrator/mlbCaseMenu.js';
import { mlbJudgmentDatabaseCall } from '../src/services/pickdesk/mlbJudgmentStorage.js';

const todayET = () => new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
const check = result => { if(result.error) throw result.error; return result.data; };
const normalized = value => typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
function mlbCandidateIdentityError(candidate, pick, evidence, now) {
  if (candidate.league !== 'MLB' || candidate.kind !== 'game' || MLB_WINNERS_POLICIES[pick.decision_policy] !== candidate.policy_version) {
    return 'MLB factual policy does not match the original game decision';
  }
  const start = Date.parse(candidate.commence_time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.game_date || '')
      || new Date(start).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) !== candidate.game_date) {
    return 'Candidate game date does not match its original scheduled start';
  }
  const rebuilt = winnersCandidate({ date: candidate.game_date, league: candidate.league, kind: 'game', pick });
  if (rebuilt.status === 'unavailable' || ['game_id', 'market_key', 'ticket_key'].some(key => String(rebuilt[key]) !== String(candidate[key]))
      || normalized(rebuilt.pick_text) !== normalized(candidate.pick_text) || Number(rebuilt.odds) !== Number(candidate.odds)
      || Date.parse(rebuilt.commence_time) !== start || normalized(pick.league || pick.sport) !== 'mlb'
      || (pick.game_date && pick.game_date !== candidate.game_date)) {
    return 'Candidate identity, ticket, odds or start differs from its original pick snapshot';
  }
  if (!originalEvidenceMatches(evidence, pick, candidate.game_date, candidate.league)) {
    return 'Original evidence envelope does not match this exact game decision';
  }
  const saved = evidence.pickSnapshot;
  if (saved.decision_policy !== pick.decision_policy || normalized(saved.league || saved.sport) !== 'mlb'
      || (saved.game_date && saved.game_date !== candidate.game_date)
      || ['homeTeam', 'awayTeam'].some(key => !normalized(pick[key]) || normalized(pick[key]) !== normalized(saved[key])
        || normalized(pick[key]) !== normalized(evidence[key]))
      || Date.parse(saved.commence_time) !== start || Date.parse(evidence.commenceTime) !== start
      || (pick.type || 'moneyline') !== (saved.type || 'moneyline')
      || (pick.type === 'spread' && Number(pick.spread ?? pick.line) !== Number(saved.spread ?? saved.line))
      || typeof winnersPickIsHome(pick) !== 'boolean' || evidence.pickIsHome !== winnersPickIsHome(pick)) {
    return 'Original evidence sides, game identity, ticket type or start differs from the published decision';
  }
  if (!Number.isFinite(Date.parse(evidence.observedAt)) || Date.parse(evidence.observedAt) > now || Date.parse(evidence.observedAt) >= start) {
    return 'Original evidence envelope lacks a valid observation time before this review and kickoff';
  }
  return null;
}
export async function reviewCandidate(c, { gameReview=reviewPick, propReview=reviewProp, now=Date.now() }={}) {
  const p=c.pick_snapshot || {}, e=c.evidence_snapshot || {};
  const kickoff=Date.parse(c.commence_time);
  if (!Number.isFinite(kickoff) || kickoff<=now) return {ok:false,status:'unavailable',error:'The ticket has no future kickoff; no postgame review is allowed'};
  if (!e.deskText) return {ok:false,status:'unavailable',error:'Original evidence snapshot unavailable; rationale alone cannot verify itself'};
  if (e.observedAt && (!Number.isFinite(Date.parse(e.observedAt)) || Date.parse(e.observedAt)>=kickoff)) return {ok:false,status:'unavailable',error:'Evidence was not recorded before kickoff'};
  if (Object.values(MLB_WINNERS_POLICIES).includes(c.policy_version)) {
    const error = mlbCandidateIdentityError(c, p, e, now);
    if (error) return {ok:false,status:'unavailable',error};
  }
  if (c.policy_version === MLB_WINNERS_POLICY_VERSION) {
    const error = mlbJudgmentEvidenceError(e.mlbJudgment, { pick: p, gameDate: c.game_date, now });
    if (error) return {ok:false,status:'unavailable',error};
    if (p.price_endorsement !== 'endorse') return {ok:false,status:'unavailable',error:'Gary declined to endorse this exact priced ticket; it is not eligible for Winners'};
  }
  const prop=canonicalProp(p);
  const sourceDesk=reviewSourceDesk(e);
  const input={...e, deskText:sourceDesk, pickIsHome:winnersPickIsHome({...p,homeTeam:p.homeTeam || e.homeTeam,awayTeam:p.awayTeam || e.awayTeam}), league:c.league, pickText:c.pick_text, odds:c.odds, rationale:p.rationale,
    gameId:String(c.game_id), gameDate:c.game_date, betType:p.type, betLine:p.spread ?? p.line, homeTeam:p.homeTeam || e.homeTeam, awayTeam:p.awayTeam || e.awayTeam,
    propType:prop.prop, line:prop.line, side:prop.side, playerName:p.player,
    commenceTime:c.commence_time,reviewPolicyVersion:c.policy_version};
  return c.kind==='prop' ? propReview(input) : gameReview(input);
}

// Mirror for existing game-only clients/records. New clients read immutable
// winners_board snapshots. Empty/error never means use confidence as admission.
async function mirrorGames(client,date) {
  const rows=check(await client.from('winners_candidates').select('*').eq('game_date',date).eq('kind','game').neq('status','pending').neq('status','reviewing')) || [];
  const byGame=new Map();
  for(const c of rows){const old=byGame.get(`${c.league}|${c.game_id}`); if(!old || c.admitted_at || (!old.admitted_at && c.id>old.id))byGame.set(`${c.league}|${c.game_id}`,c);}
  for(const c of byGame.values()) {
    const p=c.pick_snapshot;
    check(await client.from('winners_reviews').upsert({game_date:date,league:c.league,game_id:c.game_id,pick_text:c.pick_text,
      matchup:p.matchup || `${p.awayTeam} @ ${p.homeTeam}`,odds:c.odds,bet_type:p.type || null,
      on_board:!!c.admitted_at,reason:c.admitted_at?'review':null,verdict:c.status==='qualified'?'STRONG':c.status==='rejected'?'WEAK':null,
      decided_by:c.reason,review:c.review,review_error:c.status==='unavailable'?c.reason:null,model:c.review_model,ms:c.review_ms,
      reviewed_at:c.reviewed_at || c.created_at},{onConflict:'game_date,league,game_id'}));
  }
}

export async function releaseBoards(client=supabase,date=todayET()) {
  const rows=[];
  for(let offset=0;;offset+=1000){
    const page=check(await client.from('winners_candidates').select('id,game_date,league,kind')
      .gte('game_date',WINNERS_CUTOVER_DATE).lte('game_date',date)
      .order('id',{ascending:true}).range(offset,offset+999)) || [];
    rows.push(...page);
    if(page.length<1000)break;
  }
  const keys=new Map(rows.map(r=>[`${r.game_date}|${r.league}|${r.kind}`,r]));
  for(const r of keys.values())check(await client.rpc('release_winners_board',{p_date:r.game_date,p_league:r.league,p_kind:r.kind}));
  await mirrorGames(client,date);
}

// Recover publication/queue gaps without inventing missing original evidence.
// The direct writer can attach its evidence during the 30-second queue grace.
export async function reconcilePublished(client,date, {now=Date.now(),recoverJudgment}={}) {
  const sources=[];
  for(const [table,kind] of [['daily_picks','game'],['prop_picks','prop']]) {
    const day=check(await client.from(table).select('picks').eq('date',date).maybeSingle());
    sources.push(...(day?.picks || []).map(p=>({kind,p})));
  }
  const weekFrom=new Date(Date.parse(`${date}T12:00:00Z`)-7*86400000).toISOString().slice(0,10);
  const weeks=check(await client.from('weekly_nfl_picks').select('picks').gte('week_start',weekFrom).lte('week_start',date)) || [];
  for(const week of weeks)for(const p of week.picks || []) {
    const kickoff=new Date(p.commence_time || '');
    if(Number.isFinite(kickoff.getTime()) && kickoff.toLocaleDateString('en-CA',{timeZone:'America/New_York'})===date)sources.push({kind:'game',p:{...p,league:'NFL'}});
  }
  // Recovery reads stored original inputs only. It never rebuilds a desk or
  // fetches new sports data. A past game cannot start a recovered review.
  const deskResult=await client.from('pick_desks').select('matchup,pick,desk,research_briefing,decision_evidence,created_at').eq('game_date',date);
  if(deskResult.error)console.warn('[Winners] original desk recovery unavailable:',deskResult.error.message);
  const desks=deskResult.data || [];
  for(const {kind,p} of sources) {
      const league=String(p.league || p.sport || '').toUpperCase();
      if(!['MLB','NBA','NFL','NCAAF'].includes(league) || (kind==='prop' && !coreProp(p)))continue;
      let evidence={};
      const kickoff=Date.parse(p.commence_time);
      if(kind==='game' && kickoff>now) {
        const sameMatchupGames=new Set(sources.filter(x=>x.kind==='game' && x.p.homeTeam===p.homeTeam && x.p.awayTeam===p.awayTeam)
          .map(x=>String(x.p.game_id ?? x.p.bdl_game_id))).size;
        const desk=matchingDesk(desks,{homeTeam:p.homeTeam,awayTeam:p.awayTeam,pickText:p.pick,sameMatchupGames});
        if(desk && Number.isFinite(Date.parse(desk.created_at)) && Date.parse(desk.created_at)<kickoff) evidence={
          deskText:desk.desk, researchBriefing:desk.research_briefing || null, observedAt:desk.created_at,
          caseHome:p.path_home || null,caseAway:p.path_away || null,homeTeam:p.homeTeam,awayTeam:p.awayTeam,
          pickIsHome:winnersPickIsHome(p),
          provenance:'original_pick_desks_exact_ticket',
        };
        if (originalEvidenceMatches(desk?.decision_evidence, p, date, league)) {
          // Upserts retain the desk's original created_at. The envelope carries
          // THIS decision's actual observation time, which must also be pregame.
          const saved = desk.decision_evidence;
          evidence = Date.parse(saved.observedAt) < kickoff ? saved : {};
        } else if (desk?.decision_evidence) {
          evidence = {}; // Same matchup can be another game or another decision.
        }
      }
      if (kind === 'game' && league === 'MLB' && p.decision_policy === 'mlb-judgment-v2' && kickoff > now) {
        try {
          const recover = recoverJudgment || (await import('../src/services/pickdesk/mlbJudgmentStorage.js')).recoverMlbJudgmentPublication;
          const journal = await recover(client, p, { gameDate: date, now });
          if (journal) {
            // A newly appended server receipt is later than this reconciliation
            // sweep's start. Validate it at observation, not the stale sweep clock.
            const error = mlbJudgmentEvidenceError(journal, { pick: p, gameDate: date, now: Math.max(now, Date.now()) });
            if (error) throw new Error(error);
            if (evidence.snapshotVersion === 2) evidence = { ...evidence, mlbJudgment: journal };
            else {
              // A desk-mirror write can fail after the original source and
              // public ticket have committed. Recover only that immutable
              // source, never a newly rebuilt desk or another matchup's mirror.
              const header = check(await mlbJudgmentDatabaseCall(() => client.from('mlb_judgment_runs').select('*').eq('run_id', p.judgment_run_id).maybeSingle()));
              const source = header?.source_snapshot;
              if (!header || header.game_date !== date || String(header.game_id) !== String(p.game_id ?? p.bdl_game_id)
                || header.model !== p.model || header.prompt_sha !== p.prompt_sha || Date.parse(header.commence_time) !== kickoff
                || typeof source?.deskText !== 'string' || !source.deskText.trim()
                || (evidence.deskText && evidence.deskText !== source.deskText)) throw new Error('Immutable MLB source does not match the original public decision');
              evidence = originalGameEvidence({ pick: p, deskText: source.deskText,
                first: mlbCaseOrder(source.game) === 'away-first' ? 'away' : 'home',
                result: { _mlbJudgment: journal, _researchBriefing: source.researchBriefing || null,
                  _originalToolResponses: source.toolResponses || [], _evidenceObservedAt: journal.receipts.price_assessment.recorded_at } });
            }
          }
        } catch (error) { console.warn('[Winners] original MLB judgment recovery unavailable:', error.message); }
      }
      await enqueueWinnersCandidate(client,{date,league,kind,pick:p,evidence});
  }
}

export async function reviewNext(client, {review=reviewCandidate}={}) {
  const rows=check(await client.rpc('claim_winners_candidate'));
  const c=rows?.[0]; if(!c)return false;
  let r;
  try { r=await review(c); } catch(e) {r={ok:false,status:'unavailable',error:e.message};}
  const status=r?.ok && ['qualified','rejected'].includes(r.status) ? r.status : 'unavailable';
  const stored=check(await client.rpc('finish_winners_review',{p_id:c.id,p_attempt:c.attempts,p_status:status,
    p_reason:r.decided_by || r.error || status,p_review:r.review || null,p_model:r.model || null,p_ms:Number.isFinite(r.ms)?Math.round(r.ms):null}));
  console.log(`[Winners] ${c.league} ${c.kind} ${c.pick_text}: ${stored ? 'review recorded' : 'stale review ignored'} (${status})`);
  return true;
}

export async function reviewAndRelease(client=supabase, {review=reviewNext, release=releaseBoards}={}) {
  const worked=await review(client);
  if(worked)await release(client);
  return worked;
}

async function main() {
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Winners worker requires the configured service-role credential');
  const watch=process.argv.includes('--watch');
  console.log(`[Winners] started ${new Date().toISOString()} pid=${process.pid}; MLB policy=${MLB_WINNERS_POLICY}; mode=${watch?'watch':'once'}`);
  if(!watch) {
    await reconcilePublished(supabase,todayET());
    await Promise.all([reviewAndRelease(),reviewAndRelease()]);
    await releaseBoards();
    await runMlbSelectionWindow(supabase,todayET());
    await mirrorGames(supabase,todayET());
    return;
  }
  // A slow model call must not delay another completed review or the clock
  // that opens later slate capacity. SQL leases bound concurrency/recovery.
  const reader=async()=>{
    while(true) {
      let worked=false;
      try {worked=await reviewAndRelease();}catch(e){console.error('[Winners] reader:',e.message);}
      if(!worked)await sleep(30_000);
    }
  };
  const reconcile=async()=>{
    while(true) {
      try {await reconcilePublished(supabase,todayET());await releaseBoards();}
      catch(e){console.error('[Winners] reconciliation:',e.message);}
      await sleep(30_000);
    }
  };
  // Selection has its own loop: Gary's comparative read never holds up factual
  // verification, other leagues, or the publication/reconciliation clock.
  const select=async()=>{
    while(true) {
      try {await runMlbSelectionWindow(supabase,todayET());await mirrorGames(supabase,todayET());}
      catch(error){console.error('[Winners] Gary selection:',error.message);}
      await sleep(30_000);
    }
  };
  await Promise.all([reader(),reader(),reconcile(),select()]);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)main().then(()=>process.exit(0)).catch(e=>{console.error('[Winners] startup:',e.message);process.exit(1);});
