#!/usr/bin/env node
/** Durable Winners review worker. Never generates or replaces a public pick. */
import '../src/loadEnv.js';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { supabaseAdmin as supabase } from '../src/supabaseClient.js';
import { reviewPick, reviewProp } from '../src/services/pickdesk/winnersReviewer.js';
import { enqueueWinnersCandidate, coreProp, canonicalProp, winnersPickIsHome, WINNERS_CUTOVER_DATE } from '../src/services/pickdesk/winnersAdmissions.js';
import { matchingDesk } from '../src/services/diary/evidence.js';

const todayET = () => new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
const check = result => { if(result.error) throw result.error; return result.data; };
export async function reviewCandidate(c, { gameReview=reviewPick, propReview=reviewProp, now=Date.now() }={}) {
  const p=c.pick_snapshot || {}, e=c.evidence_snapshot || {};
  const kickoff=Date.parse(c.commence_time);
  if (!Number.isFinite(kickoff) || kickoff<=now) return {ok:false,status:'unavailable',error:'The ticket has no future kickoff; no postgame review is allowed'};
  if (!e.deskText) return {ok:false,status:'unavailable',error:'Original evidence snapshot unavailable; rationale alone cannot verify itself'};
  if (e.observedAt && (!Number.isFinite(Date.parse(e.observedAt)) || Date.parse(e.observedAt)>=kickoff)) return {ok:false,status:'unavailable',error:'Evidence was not recorded before kickoff'};
  const prop=canonicalProp(p);
  const sourceDesk=e.researchBriefing ? `${e.deskText}\n\n## ORIGINAL RESEARCH BRIEFING — reported findings and interpretation, not independent verification\n${e.researchBriefing}` : e.deskText;
  const input={...e, deskText:sourceDesk, pickIsHome:winnersPickIsHome({...p,homeTeam:p.homeTeam || e.homeTeam,awayTeam:p.awayTeam || e.awayTeam}), league:c.league, pickText:c.pick_text, odds:c.odds, rationale:p.rationale,
    gameDate:c.game_date, betType:p.type, betLine:p.spread ?? p.line, homeTeam:p.homeTeam || e.homeTeam, awayTeam:p.awayTeam || e.awayTeam,
    propType:prop.prop, line:prop.line, side:prop.side, playerName:p.player,
    commenceTime:c.commence_time};
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
export async function reconcilePublished(client,date, {now=Date.now()}={}) {
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
  const deskResult=await client.from('pick_desks').select('matchup,pick,desk,research_briefing,created_at').eq('game_date',date);
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
  if(!watch) {
    await reconcilePublished(supabase,todayET());
    await Promise.all([reviewAndRelease(),reviewAndRelease()]);
    await releaseBoards();
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
  await Promise.all([reader(),reader(),reconcile()]);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)main().then(()=>process.exit(0)).catch(e=>{console.error('[Winners] startup:',e.message);process.exit(1);});
