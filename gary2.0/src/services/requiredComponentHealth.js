export function collegeComponentRows(context, {game,date}) {
 return ['away','home'].flatMap(side=>{
  const team=side==='home'?game.home_team:game.away_team||game.visitor_team;
  const evidence=context.sides?.[side];
  const checks={quarterback:Boolean(evidence?.quarterback),availability:evidence?.availability==='checked',coaching:Boolean(evidence?.coaches?.some(c=>/head coach|^hc$/i.test(c.role)))};
  return Object.entries(checks).map(([component,ok])=>({date,league:'NCAAF',game_id:String(game.id??game.bdl_game_id),team_id:String(team.id),component,status:ok?'ok':'fail',
   reason:ok?`${team.full_name||team.college}: current ${component} evidence verified`:`${team.full_name||team.college}: ${component} failed — ${context.reason||'required current evidence not verified'}`,
   observed_at:context.observed_at||new Date().toISOString(),sources:evidence?.sources||[]}));
 });
}
export async function publishCollegeComponentHealth(context, identity) {
 if(process.env.VITEST)return;
 const {supabaseAdmin}=await import('../supabaseClient.js');
 if(!supabaseAdmin)throw new Error('Required component health cannot be published: service client missing');
 const {error}=await supabaseAdmin.from('required_component_health').upsert(collegeComponentRows(context,identity));
 if(error)throw new Error(`Required component health publication failed: ${error.message}`);
}
