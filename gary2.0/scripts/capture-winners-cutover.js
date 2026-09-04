#!/usr/bin/env node
/** One-time capture of the selections already visible under the old policy.
 * Preserves publications without pretending they passed the new reviewer.
 */
import '../src/loadEnv.js';
import { supabaseAdmin as db } from '../src/supabaseClient.js';
import { winnersCandidate, enqueueWinnersCandidate, coreProp } from '../src/services/pickdesk/winnersAdmissions.js';
import { pickIsHome } from '../src/services/agentic/rationaleLanes.js';
const date=process.argv.find(a=>/^--date=/.test(a))?.split('=')[1];
if(date!=='2026-09-04' || !process.argv.includes('--capture-current'))throw new Error('Requires --date=2026-09-04 --capture-current');
const check=r=>{if(r.error)throw r.error;return r.data;};
// This is a historical cutover, not a way to admit newly published selections.
const capturedBoard=check(await db.from('winners_board').select('candidate_id').eq('game_date',date).eq('policy_version','legacy-captured-2026-09-04').limit(1));
if(capturedBoard.length)throw new Error('Cutover already captured; do not relabel later publications as legacy');
const gameDay=check(await db.from('daily_picks').select('picks').eq('date',date).maybeSingle());
const propDay=check(await db.from('prop_picks').select('picks').eq('date',date).maybeSingle());
const reviews=check(await db.from('winners_reviews').select('*').eq('game_date',date));
const desks=check(await db.from('pick_desks').select('*').eq('game_date',date));
const legacy=[];
for(const p of gameDay?.picks||[]){
 const league=String(p.league||'').toUpperCase();
 const r=reviews.find(r=>r.league===league && String(r.game_id)===String(p.game_id));
 if(r?.on_board)legacy.push({date,league,kind:'game',pick:p,legacy:r});
}
const groups=new Map();
for(const p of (propDay?.picks||[]).filter(coreProp)){
 const lg=String(p.league||p.sport||'').toUpperCase();
 if(!['MLB','NFL','NCAAF','NBA'].includes(lg))continue;
 if(!groups.has(lg))groups.set(lg,[]);groups.get(lg).push(p);
}
for(const [league,rows] of groups){
 rows.sort((a,b)=>String(a.commence_time||'').localeCompare(String(b.commence_time||'')) || (b.confidence||0)-(a.confidence||0));
 for(const p of rows.slice(0,6))legacy.push({date,league,kind:'prop',pick:p});
}
let captured=0;
for(const input of legacy){
 const row=winnersCandidate(input);
 let current=check(await db.from('winners_candidates').select('id,admitted_at,attempts').eq('ticket_key',row.ticket_key).maybeSingle());
 if(current?.admitted_at)continue;
 if(current?.attempts>0)throw new Error('Cannot relabel a reviewed candidate as legacy');
 const now=new Date().toISOString();
 const legacyRow={...row,policy_version:'legacy-captured-2026-09-04',status:'qualified',reason:'Previously published selection captured at cutover',reviewed_at:now,
   review:{legacy_review:input.legacy||null,capture_only:true}};
 if(current)check(await db.from('winners_candidates').update(legacyRow).eq('id',current.id).is('admitted_at',null));
 else current=check(await db.from('winners_candidates').insert(legacyRow).select('id').single());
 check(await db.from('winners_board').insert({candidate_id:current.id,game_date:date,league:row.league,kind:row.kind,game_id:row.game_id,
   ticket_key:row.ticket_key,market_key:row.market_key,pick_snapshot:row.pick_snapshot,admitted_at:now,policy_version:legacyRow.policy_version,reason:legacyRow.reason}));
 check(await db.from('winners_candidates').update({admitted_at:now}).eq('id',current.id));
 check(await db.from('winners_decision_events').insert({candidate_id:current.id,event:'legacy_captured',detail:{source:input.kind==='game'?'winners_reviews':'old app prop selection',original_reviewed_at:input.legacy?.reviewed_at||null}}));
 captured++;
}
// Original saved desks are usable only for the exact published ticket.
for(const p of gameDay?.picks||[]){
 const match=`${p.awayTeam} @ ${p.homeTeam}`;
 const rows=desks.filter(d=>d.matchup===match && d.pick===p.pick && new Date(d.created_at)<new Date(p.commence_time));
 const d=rows.length===1?rows[0]:null;
 await enqueueWinnersCandidate(db,{date,league:p.league,kind:'game',pick:p,evidence:d?{
   deskText:d.desk,observedAt:d.created_at,homeTeam:p.homeTeam,awayTeam:p.awayTeam,
   caseHome:p.path_home,caseAway:p.path_away,pickIsHome:pickIsHome(p),commenceTime:p.commence_time,
 }: {}});
}
console.log(JSON.stringify({date,legacyCaptured:captured,gamePublications:gameDay?.picks?.length||0,propPublications:propDay?.picks?.length||0}));
process.exit(0);
