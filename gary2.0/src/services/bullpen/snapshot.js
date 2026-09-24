import { buildBullpenTeam, renderBullpenTeam, etClock } from './service.js';
import { BULLPEN_VERSION, dayOf } from './evidence.js';
import { readBullpenSource, sourceUrl } from './source.js';

export function bullpenReportQuery(team, cutoff) {
  return `MLB ${team} bullpen as of ${cutoff}. Use only reporting published by that time. Prioritize current reporting, but retain older dated role, injury and rehab announcements as background and search for subsequent changes. Do not discard an ongoing reported restriction solely because it was first announced more than 48 hours ago. An older daily availability statement does not establish today's status. Find current manager/pitcher statements about available, unavailable, limited or emergency-only arms; exact pitch/inning or consecutive-day restrictions; closer/setup hierarchy and changes; warm-ups without entering or repeated warm-ups; soreness/illness, rehab restrictions and new arrivals' minor-league workload; roster transactions; and plans to save pitchers for upcoming games. For every claim give the player, publication time/date, outlet, source URL and what was actually reported. Distinguish an explicit statement from the reporter's forecast. Do not infer availability or freshness from pitch counts, rest days or activation. If no dated source confirms a field, write UNKNOWN. No betting advice. Report directly with citations.`;
}

export async function collectBullpenReports(names, cutoff, search) {
  if (!search) return names.map(team=>({team, status:'not_requested', text:'Reported availability, restrictions and warm-ups UNKNOWN; no reporting read requested.', observedAt:new Date().toISOString()}));
  return Promise.all(names.map(async team=>{
    try {
      const result=await search(bullpenReportQuery(team,cutoff),{maxTokens:1800,thinkingLevel:'low'});
      const text=typeof result==='string'?result:result?.data;
      if(result?.success===false || !text?.trim()) throw new Error('No usable dated reporting returned');
      return {team,status:'reported_text',text,observedAt:new Date().toISOString(),cutoff,
        sourceStatus:'Attributed search findings; retain citations and separate reported facts from inferred forecasts'};
    } catch(e) { return {team,status:'unavailable',text:`Reported availability, restrictions and warm-ups UNKNOWN: ${e.message}`,observedAt:new Date().toISOString(),cutoff}; }
  }));
}

export async function buildBullpenSnapshot(game, { asOf = new Date().toISOString(), read = readBullpenSource, search, signal } = {}) {
  signal?.throwIfAborted();
  const cutoff = new Date(Math.min(Date.now(),Date.parse(asOf),Date.parse(game.commence_time || game.start_time || asOf))).toISOString();
  const names=[game.home_team_data?.full_name || game.home_team,game.away_team_data?.full_name || game.away_team];
  const teams=await read('v1/teams?sportId=1');
  const fold=s=>String(s).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const resolve=(name,side)=>{
    const id=game[`${side}_team_data`]?.id;
    const found=(teams.teams||[]).filter(t=>id!=null?String(t.id)===String(id):[t.name,t.teamName,t.shortName].some(n=>fold(n)===fold(name)));
    if(found.length!==1)throw new Error(`Bullpen team identity ambiguous: ${name}`);
    return found[0];
  };
  const home=resolve(names[0],'home'),away=resolve(names[1],'away');
  let gamePk=game.gamePk;
  if(!gamePk){
    const sched=await read(`v1/schedule?sportId=1&date=${dayOf(cutoff)}`);
    const matched=(sched.dates||[]).flatMap(d=>d.games||[]).filter(g=>g.teams?.home?.team?.id===home.id&&g.teams?.away?.team?.id===away.id&&Date.parse(g.gameDate)===Date.parse(game.commence_time||game.start_time));
    if(matched.length!==1)throw new Error('Bullpen requires exact game identity (including doubleheaders)');
    gamePk=matched[0].gamePk;
  }
  const feedPath=`v1.1/game/${gamePk}/feed/live`;
  const feed=await read(feedPath);
  if(feed.gameData?.teams?.home?.id!==home.id||feed.gameData?.teams?.away?.id!==away.id)throw new Error('Bullpen current game belongs to another matchup');
  if (['Live','Final'].includes(feed.gameData?.status?.abstractGameState)) throw new Error('Pregame bullpen snapshot cannot be built after this game has begun; use its saved original evidence');
  const lineup=side=>{
    const box=feed.liveData?.boxscore?.teams?.[side];
    return Object.values(box?.players||{}).filter(p=>p.battingOrder && Number(p.battingOrder)%100===0).map(p=>({id:p.person.id,name:p.person.fullName,order:Number(p.battingOrder)/100,hand:p.batSide?.code || feed.gameData?.players?.[`ID${p.person.id}`]?.batSide?.code})).sort((a,b)=>a.order-b.order);
  };
  const [homePen,awayPen,reports]=await Promise.all([
    buildBullpenTeam({teamId:home.id,teamName:home.name,opponentId:away.id,starterId:feed.gameData?.probablePitchers?.home?.id,gamePk,cutoff,lineup:lineup('away'),read,signal}),
    buildBullpenTeam({teamId:away.id,teamName:away.name,opponentId:home.id,starterId:feed.gameData?.probablePitchers?.away?.id,gamePk,cutoff,lineup:lineup('home'),read,signal}),
    collectBullpenReports([home.name,away.name],cutoff,search),
  ]);
  const snapshot={version:BULLPEN_VERSION,gamePk,cutoff,observedAt:new Date().toISOString(),home:homePen,away:awayPen,reports,
    currentGame:{source:sourceUrl(feedPath),status:feed.gameData?.status?.detailedState,
      note:'Pregame status at collection time. No warming pitcher feed is provided.'},
    demandScenarios:[3,5,7].map(starterInnings=>({starterInnings,remainingRegulationOuts:(9-starterInnings)*3})),
  };
  snapshot.text=[`═══ BULLPEN ═══`,
    `Limits: ${homePen.limits.join(' ')}`,
    'Coverage scenarios (conditional arithmetic, not predictions): starter exits after 3/5/7 innings leave 18/12/6 regulation outs. Assess which named arms could cover each scenario; do not assume observed past maxima are today’s capacity. Three-batter minimum and inning-ending exceptions constrain matchup plans; account for pinch hitters and regular-season extra-inning rules.',
    renderBullpenTeam(homePen),renderBullpenTeam(awayPen),
    ...reports.map(r=>`THE PEN, AS REPORTED — ${r.team}${r.status==='reported_text'?'':` (${String(r.status||'').replace(/_/g,' ')})`}\n${r.text}`),
    `Live status check: ${snapshot.currentGame.status || 'unknown'}; this pregame evidence stops at ${etClock(cutoff)}.`,
  ].join('\n\n');
  return snapshot;
}

export async function fetchBullpenEvidence(sport,home,away,season,options={}) {
  // The desk Gary reads already carries both pens when the scout report built
  // the snapshot; answering the tool with the same 100K again only duplicates
  // what is in front of him. Point back to it. A tool call with no desk
  // snapshot still builds and returns the full evidence.
  if (options.bullpenSnapshot?.text) {
    const s=options.bullpenSnapshot;
    const pointer=`Already in your desk under ═══ BULLPEN ═══: every arm for both teams, observed through ${etClock(s.cutoff)}, plus the reported pens. Nothing newer was collected; read it there.`;
    return {homeValue:pointer,awayValue:pointer,comparison:`Bullpen evidence as of ${etClock(s.cutoff)}; availability remains unknown unless reporting confirms it`,
      source:'The desk bullpen section (MLB StatsAPI observations; separately attributed reporting)',cutoff:s.cutoff,version:s.version,gamePk:s.gamePk};
  }
  const snapshot=options.bullpenSnapshot || await buildBullpenSnapshot(options.game || {home_team:home.full_name||home.name,away_team:away.full_name||away.name,commence_time:options.gameTime},options);
  return {homeValue:renderBullpenTeam(snapshot.home),awayValue:renderBullpenTeam(snapshot.away),
    comparison:`Bullpen evidence as of ${etClock(snapshot.cutoff)}; availability remains unknown unless reporting confirms it`,
    source:'MLB StatsAPI active roster, game logs, final boxes and pitch records; separately attributed reporting',
    reports:snapshot.reports,cutoff:snapshot.cutoff,version:snapshot.version,gamePk:snapshot.gamePk};
}
