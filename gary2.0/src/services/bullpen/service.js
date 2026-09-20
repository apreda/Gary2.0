import { BULLPEN_VERSION, BULLPEN_INTERPRETATION, dayOf, dayGap, shiftDay, isPitcher, gameWorkDate,
  appearance, boxAppearances, pitchingDetails, pitchProfile, summarize, workload, roleHistory, statLine, ipOf } from './evidence.js';
import { readBullpenSource, sourceUrl, mapLimit } from './source.js';

const validGame = g => ['R','F','D','L','W'].includes(g.gameType);
const completed = g => g.status?.abstractGameState === 'Final' || g.status?.detailedState === 'Final';
const unique = rows => [...new Map(rows.map(r => [String(r.gamePk), r])).values()];
const order = (a,b) => String(a.lastPitchAt || a.gameTime || a.date).localeCompare(String(b.lastPitchAt || b.gameTime || b.date)) || Number(a.gamePk)-Number(b.gamePk);
const logsFrom = d => {
  if (!Array.isArray(d?.stats)) throw new Error('pitching log response missing stats');
  return d.stats.flatMap(s => s.group?.displayName === 'pitching' ? s.splits || [] : []);
};
const normalizedLog = (r, id, level='MLB') => appearance(r.stat, { id, gamePk:r.game?.gamePk, date:r.date,
  opponent:r.opponent?.name || '?', teamId:r.team?.id, isHome:r.isHome, gameType:r.gameType || 'R', level });
const fmt = value => value == null ? '?' : value;

export async function buildBullpenTeam({ teamId, teamName, opponentId, starterId, gamePk, cutoff, lineup = [], read = readBullpenSource, signal }) {
  const date = dayOf(cutoff), season = Number(date.slice(0,4));
  const gaps = [], sources = [];
  async function get(path, label, required=false) {
    signal?.throwIfAborted();
    try { const data = await read(path); sources.push({ label, url:sourceUrl(path), observedAt:new Date().toISOString() }); return data; }
    catch (error) { signal?.throwIfAborted(); if(required)throw error; gaps.push(`${label}: ${error.message}`); return null; }
  }
  const rosterPath = `v1/teams/${teamId}/roster?rosterType=active&date=${date}`;
  const schedulePath = `v1/schedule?sportId=1&teamId=${teamId}&startDate=${shiftDay(date,-35)}&endDate=${shiftDay(date,4)}&hydrate=probablePitcher`;
  const [rosterData, scheduleData, transactions] = await Promise.all([
    get(rosterPath,'Active roster',true), get(schedulePath,'Recent and upcoming schedule',true),
    get(`v1/transactions?teamId=${teamId}&startDate=${shiftDay(date,-14)}&endDate=${date}`,'Roster transactions'),
  ]);
  if (!Array.isArray(rosterData?.roster) || !Array.isArray(scheduleData?.dates)) throw new Error(`${teamName}: roster or schedule collection missing`);
  const roster = rosterData.roster.filter(p => isPitcher(p.position) && (!p.status?.code || p.status.code === 'A'));
  if (!roster.length || roster.some(p=>!p.person?.id || !p.person?.fullName)) throw new Error(`${teamName}: named active pitchers unavailable`);
  const schedule = unique(scheduleData.dates.flatMap(d=>d.games||[])).filter(validGame);
  if(schedule.some(g=>![g.teams?.home?.team?.id,g.teams?.away?.team?.id].some(id=>String(id)===String(teamId)))) throw new Error('bullpen schedule contains another team');
  const finals = schedule.filter(g=>completed(g) && Date.parse(g.gameDate)<Date.parse(cutoff) && String(g.gamePk)!==String(gamePk)).sort((a,b)=>Date.parse(a.gameDate)-Date.parse(b.gameDate));
  const recent = finals.filter(g=>gameWorkDate(g) >= shiftDay(date,-14)).slice(-20);
  if (finals.filter(g=>gameWorkDate(g) >= shiftDay(date,-14)).length > 20) gaps.push('Pitch/entry detail limited to the most recent 20 completed games; workload logs retain earlier appearances.');
  const enriched = new Map(), excludedGames = new Set([String(gamePk)]);
  await mapLimit(recent,4,async g=>{
    const [box, pbp] = await Promise.all([get(`v1/game/${g.gamePk}/boxscore`,`Box ${g.gamePk}`),get(`v1/game/${g.gamePk}/playByPlay`,`Pitch detail ${g.gamePk}`)]);
    if(!box) return;
    try {
      const rows = boxAppearances(box,g,teamId);
      const details = pbp && Array.isArray(pbp.allPlays) ? pitchingDetails(pbp.allPlays,g.teams.home.team.id===teamId) : new Map();
      if(pbp && !Array.isArray(pbp.allPlays)) gaps.push(`Pitch detail ${g.gamePk}: allPlays unavailable`);
      const endedAt = (pbp?.allPlays || []).map(p=>p.about?.endTime).filter(Boolean).sort().at(-1);
      // A final box fetched later must never become a pregame input for an earlier snapshot.
      if (endedAt && Date.parse(endedAt)>Date.parse(cutoff)) { excludedGames.add(String(g.gamePk)); return; }
      if (gameWorkDate(g)===date && !endedAt) { excludedGames.add(String(g.gamePk)); gaps.push(`Game ${g.gamePk}: same-day final lacks completion time; excluded`); return; }
      for(const row of rows) {
        const d=details.get(row.id); const pitches=d?.pitches||[];
        const completePitchTracking=pitches.length===row.pitches && pitches.every(p=>p.time && Date.parse(p.time)<=Date.parse(cutoff));
        const pitchDays=new Map();
        if (completePitchTracking) for(const p of pitches) {
          const day=gameWorkDate(g,p.time); pitchDays.set(day,(pitchDays.get(day)||0)+1);
        }
        const lastPitchAt=completePitchTracking ? pitches.map(p=>p.time).sort().at(-1) : null;
        enriched.set(`${row.gamePk}:${row.id}`,{...row,level:'MLB',entry:d?.entry || null,
          pitchDays:completePitchTracking ? [...pitchDays].map(([date,pitches])=>({date,pitches})) : [],
          lastPitchAt:lastPitchAt || null, pitchDetails:pitches, faced:d?.batters||[], inningsObserved:d?.innings.size || null});
      }
    } catch(e) { gaps.push(`Box ${g.gamePk}: ${e.message}`); }
  });
  const sameDayFinals = new Set([...enriched.values()].filter(r=>r.date===date).map(r=>String(r.gamePk)));
  const pitchers = await mapLimit(roster,4,async p=>{
    const id=p.person.id;
    const logData=await get(`v1/people/${id}/stats?stats=gameLog&group=pitching&season=${season}`,`${p.person.fullName} MLB log`);
    let log=null;
    try { if(logData)log=logsFrom(logData); } catch(e) { gaps.push(`${p.person.fullName}: ${e.message}`); }
    const safe = (log || []).filter(r=>r.game?.gamePk && !excludedGames.has(String(r.game.gamePk)) && r.date && validGame({gameType:r.gameType||'R'}) && (r.date<date || (r.date===date && sameDayFinals.has(String(r.game.gamePk)))))
      .map(r=>normalizedLog(r,id));
    const rows=new Map(safe.map(r=>[String(r.gamePk),r]));
    for(const r of enriched.values()) if(r.id===id) rows.set(String(r.gamePk),{...rows.get(String(r.gamePk)),...r});
    const mlb=[...rows.values()].sort(order);
    const latest=mlb.at(-1);
    const role = String(id)===String(starterId) ? 'today_starter' : !log ? 'unknown_log_missing'
      : !mlb.length ? 'unknown_no_mlb_appearances' : latest?.role==='starter' ? (mlb.some(r=>r.role==='relief' && r.date>=shiftDay(date,-14)) || mlb.filter(r=>r.role==='relief').length > mlb.filter(r=>r.role==='starter').length ? 'swingman_role_unconfirmed' : 'rotation_or_role_change_unconfirmed') : latest?.role==='relief' ? 'reliever' : 'unknown_role';
    // New arrivals can have substantial workload outside MLB. Query all affiliated
    // levels, not just AAA; keep these appearances out of MLB quality rates.
    let minor=[];
    if(!['today_starter','rotation_or_role_change_unconfirmed'].includes(role) && (mlb.length<5 || !mlb.some(r=>r.date>=shiftDay(date,-7)) || transactions?.transactions?.some(t=>t.person?.id===id))) {
      const levels = await mapLimit([11,12,13,14,15,16],2,async sportId => {
        const d=await get(`v1/people/${id}/stats?stats=gameLog&group=pitching&season=${season}&sportId=${sportId}`,`${p.person.fullName} minor-league workload (sport ${sportId})`);
        try {
          const logs = d ? logsFrom(d) : [];
          const eligible = logs.filter(r=>r.date>=shiftDay(date,-30)&&r.date<=date&&r.game?.gamePk && !rows.has(String(r.game.gamePk)));
          const verified = await mapLimit(eligible,2,async r=>{
            if(r.date<date) return normalizedLog(r,id,`MiLB sport ${sportId}`);
            const feed=await get(`v1.1/game/${r.game.gamePk}/feed/live`,`${p.person.fullName} same-day minor game ${r.game.gamePk}`);
            const end=feed?.liveData?.plays?.allPlays?.map(p=>p.about?.endTime).filter(Boolean).sort().at(-1);
            if(feed?.gameData?.status?.abstractGameState!=='Final' || !end || Date.parse(end)>Date.parse(cutoff)) {
              gaps.push(`${p.person.fullName}: minor game ${r.game.gamePk} is not confirmed complete by cutoff; workload omitted, availability remains unknown.`); return null;
            }
            return normalizedLog(r,id,`MiLB sport ${sportId}`);
          });
          return verified.filter(Boolean);
        }
        catch(e) { gaps.push(`${p.person.fullName} minor-league workload: ${e.message}`); return []; }
      });
      minor = [...new Map(levels.flat().map(r=>[String(r.gamePk),r])).values()].sort(order);
    }
    const all=[...mlb,...minor].sort(order), relief=mlb.filter(r=>r.role==='relief'&&r.positionPlayer!==true);
    const appearancesWithPitches=relief.filter(r=>r.pitchDetails?.length);
    const newest=appearancesWithPitches.slice(-3), prior=appearancesWithPitches.slice(0,-3);
    const handCounts = hand => {
      const observed=relief.flatMap(r=>r.faced||[]).filter(b=>b.hand===hand);
      return { bf:observed.length, hits:observed.filter(b=>['single','double','triple','home_run'].includes(b.event)).length,
        k:observed.filter(b=>/^strikeout/.test(b.event)).length, bb:observed.filter(b=>['walk','intent_walk'].includes(b.event)).length };
    };
    return { id,name:p.person.fullName,role,logComplete:log!=null,availability:'unknown',
      workload:workload(all,date,cutoff), recent:all.slice(-5).map(({pitchDetails,faced,...r})=>r),
      season:{...summarize(relief),complete:log!=null}, recent7:summarize(relief.filter(r=>dayGap(r.date,date)>=0&&dayGap(r.date,date)<7)),
      recent30:summarize(relief.filter(r=>dayGap(r.date,date)>=0&&dayGap(r.date,date)<30)),
      usage:roleHistory(relief), lastStart:mlb.filter(r=>r.role==='starter').map(({pitchDetails,faced,...r})=>r).at(-1) || null,
      pitchTrend:{ recentGames:newest.map(r=>r.date), comparisonGames:prior.map(r=>r.date),
        recent:pitchProfile(newest.flatMap(r=>r.pitchDetails)), comparison:pitchProfile(prior.flatMap(r=>r.pitchDetails)) },
      recentPlatoon:{ left:handCounts('L'),right:handCounts('R'),window:'observed pitches/plate appearances in previous 14 days; not season splits' },
      opponentExposure:relief.filter(r=>recent.some(g=>String(g.gamePk)===String(r.gamePk)&&[g.teams.home.team.id,g.teams.away.team.id].some(x=>String(x)===String(opponentId))))
        .map(r=>({date:r.date,gamePk:r.gamePk,batters:r.faced||[],pitches:(r.pitchDetails||[]).map(p=>({batterId:p.batterId,type:p.type}))})),
    };
  });
  const people=await get(`v1/people?personIds=${pitchers.map(p=>p.id).join(',')}`,'Throwing hands');
  for(const p of pitchers) p.hand=people?.people?.find(r=>r.id===p.id)?.pitchHand?.code || null;
  const lineupWithHands=lineup.map(b=>({id:b.id,name:b.name,hand:b.hand||b.bats||null,order:b.order}));
  const unitRows=[...enriched.values()].filter(r=>r.role==='relief'&&r.positionPlayer!==true);
  const observedGameIds=new Set(unitRows.map(r=>r.gamePk));
  return { version:BULLPEN_VERSION,teamId,teamName,opponentId,gamePk,cutoff,date,observedAt:new Date().toISOString(),pitchers,
    lineup:lineupWithHands,unit:{last14:summarize(unitRows),gamesObserved:observedGameIds.size,expectedGames:recent.length,
      label:'Actual relief appearances for this team in the sampled games, including pitchers subsequently moved; not today’s available capacity'},
    recentGames:recent.map(g=>({gamePk:g.gamePk,date:g.officialDate||dayOf(g.gameDate),firstPitch:g.gameDate,
      innings:g.linescore?.currentInning || null,home:g.teams.home.team.name,away:g.teams.away.team.name,
      homeScore:g.teams.home.score,awayScore:g.teams.away.score})),
    upcoming:schedule.filter(g=>Date.parse(g.gameDate)>=Date.parse(cutoff)).map(g=>({gamePk:g.gamePk,date:g.officialDate||dayOf(g.gameDate),firstPitch:g.gameDate,
      opponent:g.teams[g.teams.home.team.id===teamId?'away':'home'].team.name,
      starter:g.teams[g.teams.home.team.id===teamId?'home':'away'].probablePitcher?.fullName || null})),
    transactions:transactions?.transactions?.map(t=>({date:t.date,description:t.description,playerId:t.person?.id})) || [],
    excludedPositionPlayers:[...enriched.values()].filter(r=>r.positionPlayer===true).map(r=>({name:r.name,date:r.date,pitches:r.pitches})),
    gaps,sources,limits:['Warm-ups, soreness, medical clearance and announced restrictions require reporting; game logs do not establish them.',
      'Pitch/entry/platoon observations cover at most 14 days/20 completed games, with sample counts. Workload uses official playing dates, splitting tracked work at a dated game resumption, never at midnight within an uninterrupted game. Ambiguous mid-plate-appearance pitcher changes are excluded from pitch/platoon detail; box workload remains. Elapsed hours require complete pitch timestamps. Historical usage is not an availability forecast.',
      'This is a pregame snapshot. A later change requires a new read; it never revises an already published ticket.'] };
}

export function renderBullpenTeam(team) {
  const lines=[`${team.teamName} bullpen — ${team.version}; cutoff ${team.cutoff}; collected ${team.observedAt}.`,BULLPEN_INTERPRETATION];
  const arms=team.pitchers.filter(p=>!['today_starter','rotation_or_role_change_unconfirmed'].includes(p.role));
  lines.push(`Current roster: ${arms.length} relief/uncertain-role candidates; every candidate follows. Availability UNKNOWN unless a separately attributed report states otherwise.`);
  const rotations=team.pitchers.filter(p=>!arms.includes(p));
  lines.push(`Rotation (relief availability unconfirmed): ${rotations.map(p=>`${p.name} [${p.role}]`).join('; ') || 'none identified'}.`);
  for (const p of rotations) lines.push(`  ${p.name}: last work ${p.workload.lastDate || 'unknown'}, ${fmt(p.workload.fullDaysOff)} full days off; last start ${p.lastStart ? `${p.lastStart.date}, ${ipOf(p.lastStart.outs)} IP/${fmt(p.lastStart.pitches)} pitches` : 'unknown'}; worked today ${p.workload.pitchedToday}. Emergency relief is unconfirmed.`);
  for(const p of arms) {
    const w=p.workload,u=p.usage;
    lines.push(`\n${p.name} (${p.hand || '?'}HP; ${p.role}; availability ${p.availability})`,
      `  Last work ${w.lastDate || 'unknown'}; ${fmt(w.fullDaysOff)} full calendar days off; ${fmt(w.hoursSinceLastPitch)} hours since last recorded pitch; consecutive calendar days through today/yesterday ${w.consecutiveDays}; worked today ${w.pitchedToday}; prior four days ${w.daysInLast4}.`,
      `  Pitch counts by official playing date (tracked resumed sessions use their resumption date): ${Object.entries(w.byDay).filter(([d])=>dayGap(d,team.date)<=14).map(([d,n])=>`${d}: ${fmt(n)}`).join('; ') || 'none known'}.`,
      `  Prior calendar-day workload (excluding today): ${Object.entries(w.windows).map(([n,v])=>`${n}d: ${v.games} appearances/${v.days} work days/${fmt(v.pitches)} pitches`).join('; ')}.`,
      `  Last appearances: ${p.recent.map(r=>`${r.date} ${r.level} ${r.role} vs ${r.opponent}, ${ipOf(r.outs)} IP/${fmt(r.pitches)} pitches/${fmt(r.er)} ER/${fmt(r.bb)} BB/${fmt(r.k)} K; inherited ${fmt(r.inheritedScored)}/${fmt(r.inherited)} scored${r.entry?`; entered ${r.entry.half} ${r.entry.inning}, score ${r.entry.teamScore}-${r.entry.opponentScore}, ${r.entry.outs} outs`:''}`).join(' | ') || 'unknown'}.`,
      `  Observed relief only (L7/L30 include today through cutoff): L7 ${statLine(p.recent7)}; L30 ${statLine(p.recent30)}; season ${p.logComplete ? statLine(p.season) : 'UNAVAILABLE (MLB log failed; recent observed boxes are not a complete season)' }.`,
      `  Roles as observed: ${u.entriesObserved}/${u.recentSample} recent entries have situation data; ${u.leading} leading/${u.tied} tied/${u.trailing} trailing, ${u.ninthOrLater} in ninth or later. Observed MLB relief ${fmt(p.season.saves)} saves/${fmt(p.season.holds)} holds/${fmt(p.season.blownSaves)} blown saves; ${u.multiInning} multi-inning outings; ${u.returnedNextCalendarDay} next-calendar-day returns. Observed maximum ${ipOf(u.maxOuts)} IP/${fmt(u.maxPitches)} pitches, not a limit for today.`,
      `  Recent observed platoon PA: LHB ${JSON.stringify(p.recentPlatoon.left)}; RHB ${JSON.stringify(p.recentPlatoon.right)} (${p.recentPlatoon.window}).`,
      `  Pitch profile — newest observed relief outings ${p.pitchTrend.recentGames.join(', ') || 'unavailable'} vs prior observed outings ${p.pitchTrend.comparisonGames.join(', ') || 'unavailable'}: ${JSON.stringify(p.pitchTrend.recent)} vs ${JSON.stringify(p.pitchTrend.comparison)}. pfxX/pfxZ and releaseX/releaseZ retain raw provider coordinate units; compare each field only with itself, for like pitch types and labeled samples.`,
      `  Prior exposure to this opponent: ${p.opponentExposure.map(r=>`${r.date}: ${r.batters.map(b=>`${b.name} (${b.hand}, ${b.event}; pitches ${[...new Set(r.pitches.filter(p=>p.batterId===b.id).map(p=>p.type))].join('/')})`).join(', ')}`).join(' | ') || 'none observed in the tracked window'}.`,
      `  Season runner control: ${fmt(p.season.steals)} SB/${fmt(p.season.caughtStealing)} CS, ${fmt(p.season.wildPitches)} wild pitches. Missing log: ${!p.logComplete}.`);
  }
  lines.push(`\nOpponent batting order: ${team.lineup.map(b=>`${b.order}. ${b.name} (${b.hand||'?'})`).join('; ') || 'consult confirmed lineup in scout report'}.`,
    `Team relief in tracked games: ${statLine(team.unit.last14)}. ${team.unit.label}.`,
    `Upcoming: ${team.upcoming.map(g=>`${g.date} ${g.firstPitch} vs ${g.opponent}, starter ${g.starter||'unannounced'}`).join('; ')}.`,
    `Transactions: ${team.transactions.map(t=>`${t.date}: ${t.description}`).join('; ') || 'none returned'}.`,
    `Gaps: ${team.gaps.join('; ') || 'No request failures; unreported availability and warm-ups remain unknown'}.`,
    `Limits: ${team.limits.join(' ')}`,
    `Source URLs (observed ${team.observedAt}; full per-request provenance retained in the saved snapshot): ${sourceUrl(`v1/teams/${team.teamId}/roster?rosterType=active&date=${team.date}`)}; ${team.sources.find(s=>s.label==='Recent and upcoming schedule')?.url || '?'}. Pitching logs: ${sourceUrl('v1/people/{playerId}/stats?stats=gameLog&group=pitching&season='+team.date.slice(0,4))}, with individual sportId=11–16 for minor-league logs. Named player IDs: ${team.pitchers.map(p=>`${p.name}=${p.id}`).join('; ')}. Boxes/pitches: ${sourceUrl('v1/game/{gamePk}/boxscore')} and /playByPlay; observed game IDs ${team.recentGames.map(g=>`${g.date}=${g.gamePk}`).join(', ')}.`);
  return lines.join('\n');
}
