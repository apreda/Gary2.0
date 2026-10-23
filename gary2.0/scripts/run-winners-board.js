#!/usr/bin/env node
/** Durable Winners review worker. Never generates or replaces a public pick. */
import '../src/loadEnv.js';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { supabaseAdmin as supabase } from '../src/supabaseClient.js';
import { enqueueWinnersCandidate, coreProp, winnersCandidate, winnersPickIsHome } from '../src/services/winners/winnersAdmissions.js';
import { matchingDesk } from '../src/services/content/diary/evidence.js';
import { originalEvidenceMatches } from '../src/services/gary/pickdesk/originalGameEvidence.js';
import { runPropsSelection } from '../src/services/winners/winnersProps.js';
import { runBigGameStakes } from '../src/services/winners/garyBigGameStake.js';
import { placeOnCard } from '../src/services/winners/garyCard.js';
import { runLateNewsChecks } from '../src/services/winners/lateNews.js';

const todayET = () => new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
// Every pass looks again every two minutes (founder, Oct 13 2026; it was 30 seconds). The tightest window it serves is
// an NBA seat, 28 down to 10 minutes before tip; the big-game net fires 15 minutes out. A pass that found work goes
// again at once.
const LOOP_MS = 2 * 60_000;
const check = result => { if(result.error) throw result.error; return result.data; };
// NEW CODE, NEW WORKER (Oct 22 2026, founder: "why do i have to keep doing ! launchctl kickstart"). The worker loads
// its code once, so a pushed change used to wait for a hand restart. When a commit touches src/ or scripts/, the
// worker finishes the work in hand, starts nothing new and exits; launchd (KeepAlive) starts it again on the new code.
const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
const STARTED_ON = git('rev-parse', 'HEAD');
export const codeChangedSince = (from, to) => Boolean(from && to && from !== to && git('diff', '--name-only', from, to, '--', 'src', 'scripts'));
let draining = false;
let inFlight = 0;
/** One pass of a loop, unless the worker is draining for new code; the restart waits for every pass in hand. */
const pass = async (fn) => { if (draining) return undefined; inFlight++; try { return await fn(); } finally { inFlight--; } };
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

// BIG GAMES ONLY (founder GO, Oct 23 2026): Winners game bets are the day's big games (winners_big_games: MLB playoff
// games, TNF/SNF/MNF, college's top two, the NBA's national-TV games). Each goes on at Gary's amount or his number
// once the late-news check has cleared it (the sweep). Gary's card, and his NFL, NBA and college boards, no longer
// seat anything; their code stays (seat_the_card, seat_*_board, nflBoard.js, nbaBoard.js, ncaafBoard.js).
// Props: the reader compares each window's published props and selects the clear ones with its own stake
// (winnersProps.js, daily-props-v1).
async function main() {
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Winners worker requires the configured service-role credential');
  const watch=process.argv.includes('--watch');
  console.log(`[Winners] started ${new Date().toISOString()} pid=${process.pid} on ${STARTED_ON?.slice(0,8) || 'unknown commit'}; games=big games only; props=daily-props-v1; mode=${watch?'watch':'once'}`);
  if(!watch) {
    await reconcilePublished(supabase,todayET());
    await runPropsSelection(supabase,todayET());
    await runLateNewsChecks(supabase,todayET());
    const swept=check(await supabase.rpc('admit_winners_pending',{p_date:todayET()}));
    await runBigGameStakes(supabase,todayET());
    if(swept)console.log(`[Winners] sweep admitted ${swept}`);
    await mirrorGames(supabase,todayET());
    return;
  }
  const reconcile=async()=>{
    while(true) {
      try {await pass(()=>reconcilePublished(supabase,todayET()));}
      catch(e){logFailure('reconciliation',e);}
      await sleep(LOOP_MS);
    }
  };
  // The props selection claims a window when its props are in (SQL claim_winners_props) and admits its picks.
  const props=async()=>{
    while(true) {
      let run=null;
      try {run=await pass(()=>runPropsSelection(supabase,todayET()));}
      catch(e){logFailure('props selection',e);}
      await sleep(run?5_000:LOOP_MS);
    }
  };
  // The sweep admits graded candidates whose bet or big-game status arrived
  // after the read, and mirrors display fields for older clients.
  const sweep=async()=>{
    while(true) {
      try {
        await pass(async()=>{
          const swept=check(await supabase.rpc('admit_winners_pending',{p_date:todayET()}));
          if(swept)console.log(`[Winners] ${new Date().toISOString()} sweep admitted ${swept}`);
          await mirrorGames(supabase,todayET());
        });
      } catch(e){logFailure('sweep',e);}
      await sleep(LOOP_MS);
    }
  };
  // The late-news check, 75 minutes before each kickoff (28 before an NBA tip): a big game goes on only once it is
  // cleared or Gary has kept it (lateNews.js). The card backstop still places picks on his card; the card seats nothing.
  const card=async()=>{
    while(true) {
      try {
        await pass(async()=>{
          const backstopped=await placeUnplacedOnCard(supabase,todayET());
          if(backstopped)console.log(`[Winners] ${new Date().toISOString()} card backstop placed ${backstopped}`);
          try {
            const checked=await runLateNewsChecks(supabase,todayET());
            if(checked)console.log(`[Winners] ${new Date().toISOString()} late news checked ${checked}`);
          } catch(e){logFailure('late news',e);}
        });
      } catch(e){logFailure('card',e);}
      await sleep(LOOP_MS);
    }
  };
  // A big game Gary passed on waits for his number (garyBigGameStake.js); the net is $100 in the last minutes.
  const bigGames=async()=>{
    while(true) {
      try {await pass(()=>runBigGameStakes(supabase,todayET()));}
      catch(e){logFailure('big game stake',e);}
      await sleep(LOOP_MS);
    }
  };
  // New code on main: drain, then exit for launchd to start the worker again on it.
  const newCode=async()=>{
    while(true) {
      await sleep(draining?5_000:LOOP_MS);
      if(!draining && codeChangedSince(STARTED_ON, git('rev-parse','HEAD'))) {
        draining=true;
        console.log(`[Winners] ${new Date().toISOString()} new code on main (${STARTED_ON?.slice(0,8)} → ${git('rev-parse','--short','HEAD')}); finishing the work in hand, then restarting`);
      }
      if(draining && inFlight===0) {
        console.log(`[Winners] ${new Date().toISOString()} restarting on the new code`);
        process.exit(0);
      }
    }
  };
  await Promise.all([reconcile(),props(),sweep(),card(),bigGames(),newCode()]);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)main().then(()=>process.exit(0)).catch(e=>{console.error('[Winners] startup:',e.message);process.exit(1);});
