#!/usr/bin/env node
/** Durable Winners review worker. Never generates or replaces a public pick. */
import '../src/loadEnv.js';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { supabaseAdmin as supabase } from '../src/supabaseClient.js';
import { enqueueWinnersCandidate, coreProp, winnersCandidate, winnersPickIsHome } from '../src/services/pickdesk/winnersAdmissions.js';
import { matchingDesk } from '../src/services/diary/evidence.js';
import { originalEvidenceMatches } from '../src/services/pickdesk/originalGameEvidence.js';
import { readNext, READER_POLICY, READER_CASCADE } from '../src/services/pickdesk/winnersReader.js';
import { runPropsSelection } from '../src/services/pickdesk/winnersProps.js';
import { runBigGameStakes } from '../src/services/pickdesk/garyBigGameStake.js';
import { placeOnCard } from '../src/services/pickdesk/garyCard.js';

const todayET = () => new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
const check = result => { if(result.error) throw result.error; return result.data; };
const logFailure = (lane, error) => console.error(`[Winners] ${new Date().toISOString()} ${lane}: ${String(error?.message || error).slice(0,1600)}`);
// Mirror for existing game-only clients/records. New clients read immutable
// winners_board snapshots. Empty/error never means use confidence as admission.
export async function mirrorGames(client,date) {
  const rows=check(await client.from('winners_candidates').select('id,league,game_id,pick_text,odds,admitted_at,status,reason,review,review_model,review_ms,reviewed_at,created_at,matchup:pick_snapshot->>matchup,away_team:pick_snapshot->>awayTeam,home_team:pick_snapshot->>homeTeam,bet_type:pick_snapshot->>type').eq('game_date',date).eq('kind','game')) || [];
  const byGame=new Map();
  for(const c of rows){const old=byGame.get(`${c.league}|${c.game_id}`); if(!old || c.admitted_at || (!old.admitted_at && c.id>old.id))byGame.set(`${c.league}|${c.game_id}`,c);}
  const updates=[...byGame.values()].map(c=>({game_date:date,league:c.league,game_id:c.game_id,pick_text:c.pick_text,
      matchup:c.matchup || `${c.away_team} @ ${c.home_team}`,odds:c.odds,bet_type:c.bet_type || null,
      on_board:!!c.admitted_at,reason:c.admitted_at?'curation':null,verdict:c.status==='qualified'?'STRONG':c.status==='rejected'?'WEAK':null,
      decided_by:c.reason,review:c.review,review_error:c.status==='unavailable'?c.reason:null,model:c.review_model,ms:c.review_ms,
      reviewed_at:c.reviewed_at || c.created_at}));
  if(updates.length)check(await client.from('winners_reviews').upsert(updates,{onConflict:'game_date,league,game_id'}));
}

// Recover publication/queue gaps without inventing missing original evidence.
// The direct writer can attach its evidence during the 30-second queue grace.
/**
 * THE CARD BACKSTOP (Oct 13 2026, audit): the pick runner places each game pick on Gary's card right after it
 * publishes. A pick whose placement did not happen there (a failed publication read-back, a crash, a turn that
 * timed out) would never be on the card and could never seat. Ten minutes after a candidate is queued, while its
 * game is still more than 20 minutes away, the worker places it. NHL waits for the founder, as everywhere on Winners.
 */
export async function placeUnplacedOnCard(client,date,{now=Date.now(),place=placeOnCard}={}) {
  const cands=check(await client.from('winners_candidates').select('id,league,game_id,pick_text,commence_time,created_at,pick_snapshot')
    .eq('game_date',date).eq('kind','game')) || [];
  const due=cands.filter(c=>c.league!=='NHL' && Date.parse(c.commence_time)>now+20*60_000 && Date.parse(c.created_at)<now-10*60_000);
  if(!due.length)return 0;
  const placed=new Set((check(await client.from('winners_card_placements').select('candidate_id').eq('game_date',date)) || []).map(r=>Number(r.candidate_id)));
  let n=0;
  for(const c of due) {
    if(placed.has(Number(c.id)))continue;
    const pick={...(c.pick_snapshot || {}),pick:c.pick_text,commence_time:c.commence_time};
    const out=await place(client,{league:c.league,gameId:String(c.game_id),pick,model:pick.model}).catch(e=>{console.warn(`[Winners] card backstop ${c.id}: ${e?.message || e}`);return null;});
    if(out?.placed)n+=1;
  }
  return n;
}

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
  // Most publications are already queued with their complete original evidence.
  // Read small receipt fields before fetching any research or rewriting rows.
  const queued=check(await client.from('winners_candidates')
    .select('ticket_key,status,admitted_at,evidence_version:evidence_snapshot->>snapshotVersion').eq('game_date',date)) || [];
  const byTicket=new Map(queued.map(c=>[c.ticket_key,c]));
  const missing=sources.filter(({kind,p})=>{
    const league=String(p.league || p.sport || '').toUpperCase();
    const ticket=winnersCandidate({date,league,kind,pick:p});
    const existing=byTicket.get(ticket.ticket_key);
    if(!existing)return true;
    if(kind==='prop' || Date.parse(p.commence_time)<=now || existing.admitted_at
      || !['pending','unavailable'].includes(existing.status))return false;
    return String(existing.evidence_version)!=='2';
  });
  // Recovery reads stored original inputs only. It never rebuilds a desk or
  // fetches new sports data. A past game cannot start a recovered review.
  const matchups=[...new Set(missing.filter(({kind,p})=>kind==='game' && Date.parse(p.commence_time)>now)
    .map(({p})=>p.matchup || `${p.awayTeam} @ ${p.homeTeam}`))];
  const deskResult=matchups.length ? await client.from('pick_desks').select('matchup,pick,desk,research_briefing,decision_evidence,created_at')
    .eq('game_date',date).in('matchup',matchups) : {data:[]};
  if(deskResult.error)console.warn('[Winners] original desk recovery unavailable:',deskResult.error.message);
  const desks=deskResult.data || [];
  for(const {kind,p} of missing) {
      const league=String(p.league || p.sport || '').toUpperCase();
      // NHL is absent on purpose: its picks publish, and Winners waits for the founder to admit the league.
      if(!['MLB','NBA','NFL','NCAAF','NCAAB','EPL','WC'].includes(league) || (kind==='prop' && !coreProp(p)))continue;
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
      await enqueueWinnersCandidate(client,{date,league,kind,pick:p,evidence});
  }
}

// GARY'S CARD (founder GO, Oct 12 2026; migration 20261012233000_winners_card.sql). Game picks: the pick runner places
// each pick on today's card as it lands (garyCard.js); this worker seats the top of the card on Winners at his amount
// 75 minutes before kickoff (SQL seat_the_card: one in five of the day's slate). The judge (winnersReader.js) reads
// big games only now; a big game is on at his number whatever it said (20261008173000_winners_coach.sql).
// Props: the reader compares each window's published props and selects the clear and lean ones with its own
// stake (winnersProps.js, daily-props-v1).
async function main() {
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Winners worker requires the configured service-role credential');
  const watch=process.argv.includes('--watch');
  console.log(`[Winners] started ${new Date().toISOString()} pid=${process.pid}; gate=${READER_POLICY}; reader rungs ${READER_CASCADE.join(' → ')}; props=daily-props-v1; mode=${watch?'watch':'once'}`);
  if(!watch) {
    await reconcilePublished(supabase,todayET());
    while(await readNext(supabase)){}
    await runPropsSelection(supabase,todayET());
    const seated=check(await supabase.rpc('seat_the_card',{p_date:todayET()}));
    if(seated)console.log(`[Winners] card seated ${seated}`);
    const swept=check(await supabase.rpc('admit_winners_pending',{p_date:todayET()}));
    await runBigGameStakes(supabase,todayET());
    if(swept)console.log(`[Winners] sweep admitted ${swept}`);
    await mirrorGames(supabase,todayET());
    return;
  }
  const reconcile=async()=>{
    while(true) {
      try {await reconcilePublished(supabase,todayET());}
      catch(e){logFailure('reconciliation',e);}
      await sleep(30_000);
    }
  };
  // Three readers in flight: a slow read never holds another candidate.
  const reader=async(n)=>{
    while(true) {
      let worked=false;
      try {worked=await readNext(supabase);}
      catch(e){logFailure(`reader ${n}`,e);}
      await sleep(worked?1_000:10_000);
    }
  };
  // The props selection claims a window when its props are in (SQL claim_winners_props) and admits its picks.
  const props=async()=>{
    while(true) {
      let run=null;
      try {run=await runPropsSelection(supabase,todayET());}
      catch(e){logFailure('props selection',e);}
      await sleep(run?5_000:60_000);
    }
  };
  // The sweep admits graded candidates whose bet or big-game status arrived
  // after the read, and mirrors display fields for older clients.
  const sweep=async()=>{
    while(true) {
      try {
        const swept=check(await supabase.rpc('admit_winners_pending',{p_date:todayET()}));
        if(swept)console.log(`[Winners] ${new Date().toISOString()} sweep admitted ${swept}`);
        await mirrorGames(supabase,todayET());
      } catch(e){logFailure('sweep',e);}
      await sleep(30_000);
    }
  };
  // The card seats its top 75 minutes before each kickoff; a seated pass goes to the number ask below.
  const card=async()=>{
    while(true) {
      try {
        const backstopped=await placeUnplacedOnCard(supabase,todayET());
        if(backstopped)console.log(`[Winners] ${new Date().toISOString()} card backstop placed ${backstopped}`);
        const seated=check(await supabase.rpc('seat_the_card',{p_date:todayET()}));
        if(seated)console.log(`[Winners] ${new Date().toISOString()} card seated ${seated}`);
      } catch(e){logFailure('card',e);}
      await sleep(30_000);
    }
  };
  // A big game Gary passed on waits for his number (garyBigGameStake.js); the net is $100 in the last minutes.
  const bigGames=async()=>{
    while(true) {
      try {await runBigGameStakes(supabase,todayET());}
      catch(e){logFailure('big game stake',e);}
      await sleep(30_000);
    }
  };
  await Promise.all([reconcile(),reader(1),reader(2),reader(3),props(),sweep(),card(),bigGames()]);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)main().then(()=>process.exit(0)).catch(e=>{console.error('[Winners] startup:',e.message);process.exit(1);});
