#!/usr/bin/env node
/** Repair/warm only current college QB and availability evidence, by kickoff. */
import '../src/loadEnv.js';
import { createClient } from '@supabase/supabase-js';
import { ballDontLieService as bdl } from '../src/services/ballDontLieService.js';
import { getNcaafGameContext } from '../src/services/ncaafGameContext.js';
import { loadFootballSlate } from '../src/services/insights/footballData.js';
import { computeNcaafQbWatch } from '../src/services/insights/computers/ncaafQbWatch.js';
import { computeNcaafAvailability } from '../src/services/insights/computers/ncaafAvailability.js';
import { getESTDate } from '../src/utils/dateUtils.js';
const args=process.argv.slice(2), value=key=>args.find(a=>a.startsWith(`${key}=`))?.split('=')[1];
const date=value('--date')||getESTDate(), only=value('--game'), write=args.includes('--write');
const client=createClient(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const games=(await loadFootballSlate({bdl,league:'ncaaf',date})).filter(g=>(!only||String(g.id)===only)&&Date.parse(g.date)>Date.now()).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
let next=0,ready=0,failed=0,published=0;
async function worker(){
 while(next<games.length){
  const game=games[next++];
  try{
   const context=await getNcaafGameContext({game,date,bdl});
   if(context.unavailable) failed++; else ready++;
   if(!context.sides){console.log(JSON.stringify({game:game.id,status:'unavailable',reason:context.reason}));continue;}
   const ctx={forceRefresh:true,games:[game],date,season:game.season,bdl,league:'ncaaf',helpers:{gameLabel:g=>`${(g.visitor_team||g.away_team).abbreviation} @ ${g.home_team.abbreviation}`}};
   const rows=[...await computeNcaafQbWatch(ctx),...await computeNcaafAvailability(ctx)];
   if(write){
    const {data:old,error:readError}=await client.from('insight_connections').select('id,category,team_id,generated_by').eq('date',date).eq('league','NCAAF').eq('game_id',String(game.id)).in('category',['quarterback','injury']);
    if(readError)throw readError;
    const stored=rows.map(r=>({date,league:'NCAAF',generated_by:'ncaaf-context-repair',category:r.category,headline:r.headline,detail:r.detail,game:r.game,value:String(r.value),tone:r.tone,relevance_score:r.relevance_score,player_id:r.player_id==null?null:String(r.player_id),team_id:String(r.team_id),game_id:String(game.id),meta:r.meta}));
    if(stored.length){const {error}=await client.from('insight_connections').insert(stored);if(error)throw error;}
    // Insert first; retire only the categories actually replaced, using captured IDs.
    const replaced=new Set(rows.map(r=>`${r.category}:${r.team_id}`));
    for(const side of Object.values(context.sides)) if(side.availability==='checked') replaced.add(`injury:${side.team_id}`);
    const ids=(old||[]).filter(r=>r.generated_by==='ncaaf-context-repair'||replaced.has(`${r.category}:${r.team_id}`)).map(r=>r.id);
    if(ids.length){const{error}=await client.from('insight_connections').delete().in('id',ids);if(error)throw error;}
    published+=stored.length;
   }
   console.log(JSON.stringify({game:game.id,status:context.unavailable?'partial':'ready',reason:context.reason,warnings:context.warnings,quarterbacks:Object.values(context.sides).map(s=>s.quarterback?.name || 'unresolved'),rows:rows.length,write}));
  }catch(error){failed++;console.error(JSON.stringify({game:game.id,status:'failed',error:error.message}));}
 }
}
// Two collectors at most; each game's cache is shared with the pick/content workers.
await Promise.all([worker(),worker()]);
console.log(JSON.stringify({date,games:games.length,ready,failed,published,write}));
if(failed)process.exitCode=1;
