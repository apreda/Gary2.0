import { BULLPEN_VERSION, BULLPEN_INTERPRETATION, dayOf, dayGap, shiftDay, isPitcher, gameWorkDate,
  appearance, boxAppearances, pitchingDetails, pitchProfile, summarize, workload, roleHistory, statLine, ipOf,
  lateInnings, nextDayPattern } from './evidence.js';
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
  const [rosterData, scheduleData, transactions, seasonSchedule] = await Promise.all([
    get(rosterPath,'Active roster',true), get(schedulePath,'Recent and upcoming schedule',true),
    get(`v1/transactions?teamId=${teamId}&startDate=${shiftDay(date,-14)}&endDate=${date}`,'Roster transactions'),
    // The season's played dates, for each arm's next-day record (Sep 24 2026).
    get(`v1/schedule?sportId=1&teamId=${teamId}&season=${season}&gameType=R&startDate=${season}-02-01&endDate=${date}`,'Season schedule'),
  ]);
  if (!Array.isArray(rosterData?.roster) || !Array.isArray(scheduleData?.dates)) throw new Error(`${teamName}: roster or schedule collection missing`);
  const roster = rosterData.roster.filter(p => isPitcher(p.position) && (!p.status?.code || p.status.code === 'A'));
  if (!roster.length || roster.some(p=>!p.person?.id || !p.person?.fullName)) throw new Error(`${teamName}: named active pitchers unavailable`);
  const schedule = unique(scheduleData.dates.flatMap(d=>d.games||[])).filter(validGame);
  const playedGames = unique([...(seasonSchedule?.dates || []), ...scheduleData.dates].flatMap(d=>d.games||[])).filter(g=>validGame(g) && completed(g));
  const teamDates = [...new Set(playedGames.map(g=>g.officialDate || dayOf(g.gameDate)))].sort();
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
    const withClub=mlb.filter(r=>r.teamId==null || String(r.teamId)===String(teamId));
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
      // This club only: a traded arm's old club had another manager and another schedule.
      late30:lateInnings(withClub,date), nextDay:nextDayPattern(withClub,teamDates,date),
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
  return { version:BULLPEN_VERSION,teamId,teamName,opponentId,gamePk,cutoff,date,observedAt:new Date().toISOString(),pitchers,teamDates,
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
      'Pitch/entry/platoon observations cover at most 14 days/20 completed games, with sample counts. Workload uses official playing dates, splitting tracked work at a dated game resumption, never at midnight within an uninterrupted game. Ambiguous mid-plate-appearance pitcher changes are excluded from pitch/platoon detail; box workload remains. Elapsed hours require complete pitch timestamps.',
      'This is a pregame snapshot. A later change requires a new read; it never revises an already published ticket.'] };
}

const md = d => String(d || '').slice(5);
export const etClock = iso => { const t = new Date(iso); if (Number.isNaN(t.getTime())) return String(iso || 'unknown');
  return t.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET'; };
const pct = v => v == null ? '?' : `${Math.round(v)}%`;
const num = (v, digits=1) => v == null ? '?' : Number(v).toFixed(digits);
// Spin, movement and release coordinates left the desk (founder, Sep 24 2026):
// analyst-grade pitch shape no fan reads. Mix, velocity and results stay.
const pitchRow = t => `${t.type} ${t.n}p ${pct(t.usagePct)} ${num(t.mph)}mph strk ${fmt(t.strikes)}/${t.n} whiff ${fmt(t.whiffs)}/${fmt(t.swings)}${t.whiffPct==null?'':` (${pct(t.whiffPct)})`} hard ${pct(t.hardHitPct)} of ${fmt(t.trackedContact)} tracked`;
const pitchSet = rows => rows?.length ? rows.map(pitchRow).join('; ') : 'unavailable';
// Roles read as words on the desk (Sep 24 2026); the snapshot keeps the keys.
const ROLE_WORDS = { today_starter:"today's starter", reliever:'reliever', swingman_role_unconfirmed:'swingman',
  rotation_or_role_change_unconfirmed:'rotation', unknown_log_missing:'role unknown: season log missing',
  unknown_no_mlb_appearances:'no MLB appearances this season', unknown_role:'role unknown' };
const roleWords = role => ROLE_WORDS[role] || String(role || 'role unknown').replace(/_/g, ' ');
// No tracked outing in the window is a fact about the pitcher, not a failed
// read (a failed read is named under Gaps): say which (Sep 24 2026).
const pitchWindow = (dates, rows, none) => dates.length ? ` (${dates.map(md).join(', ')}): ${pitchSet(rows)}` : `: ${none}`;
const platoon = s => `${fmt(s.bf)} PA, ${fmt(s.hits)} H, ${fmt(s.bb)} BB, ${fmt(s.k)} K`;
const outing = r => `${md(r.date)}${r.level==='MLB'?'':` ${r.level}`}${r.role==='relief'?'':` ${r.role}`} vs ${r.opponent}: ${ipOf(r.outs)} IP, ${fmt(r.pitches)} p, ${fmt(r.er)} ER, ${fmt(r.bb)} BB, ${fmt(r.k)} K, inherited ${fmt(r.inheritedScored)}/${fmt(r.inherited)} scored${r.entry?`, entered ${r.entry.half} ${r.entry.inning} at ${r.entry.teamScore}-${r.entry.opponentScore} with ${r.entry.outs} out`:''}`;

const weekday = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const lateUse = p => (p.late30?.saves || 0) + (p.late30?.holds || 0) + (p.late30?.finished || 0);

// THE PEN AT A GLANCE (founder, Sep 24 2026): how the pen reads before the
// arm-by-arm detail. Who the manager uses late, who has pitched the last
// three days, and each arm's own record of pitching the next day. Facts and
// history only; the reading is Gary's.
function renderGlance(team, arms) {
  if (!arms.length) return [];
  const played = new Set(team.teamDates || []);
  const last3 = [3, 2, 1].map(n => shiftDay(team.date, -n));
  const ordered = [...arms].sort((a, b) => lateUse(b) - lateUse(a) || (b.late30?.games || 0) - (a.late30?.games || 0));
  const cell = (p, d) => {
    if (Object.hasOwn(p.workload.byDay, d)) return p.workload.byDay[d] == null ? 'pitched (count unknown)' : String(p.workload.byDay[d]);
    return played.has(d) ? '—' : 'off';
  };
  const record = ([times, went]) => times ? `${went} of ${times}` : 'none';
  return [
    `THE PEN AT A GLANCE — ${team.teamName}`,
    'No team publishes daily availability. Every arm on the active roster can pitch; the manager decides by recent workload and role.',
    'Late innings, last 30 days (relief games · saves · holds · games finished · blown saves), most late-game use first:',
    ...ordered.map(p => `  ${p.name}: ${p.late30?.games ?? 0} G · ${p.late30?.saves ?? 0} SV · ${p.late30?.holds ?? 0} HLD · ${p.late30?.finished ?? 0} GF · ${p.late30?.blownSaves ?? 0} BS`),
    `Pitches the last three days (${last3.map(weekday).join(' / ')}; "—" = the team played and he did not; "off" = no team game):`,
    ...ordered.map(p => `  ${p.name}: ${last3.map(d => cell(p, d)).join(' / ')}${p.workload.pitchedToday ? ` · already pitched today (${fmt(p.workload.byDay[team.date])})` : ''}${p.workload.consecutiveDays >= 2 ? ` · ${p.workload.consecutiveDays} straight days` : ''}`),
    'Pitched the next day this season, when the team played (after a light outing of 15 pitches or fewer · 16-25 · 26 or more · after two straight days):',
    ...ordered.map(p => p.nextDay ? `  ${p.name}: ${record(p.nextDay.light)} · ${record(p.nextDay.medium)} · ${record(p.nextDay.heavy)} · ${record(p.nextDay.twoStraight)}` : `  ${p.name}: season log unavailable`),
  ];
}

export function renderBullpenTeam(team) {
  const lines=[`${team.teamName} bullpen — observed through ${etClock(team.cutoff)}.`];
  const arms=team.pitchers.filter(p=>!['today_starter','rotation_or_role_change_unconfirmed'].includes(p.role));
  lines.push(...renderGlance(team, arms), '');
  lines.push(`Relief arms on the active roster: ${arms.length}; every one follows below.`);
  const rotations=team.pitchers.filter(p=>!arms.includes(p));
  lines.push(`Rotation: ${rotations.map(p=>`${p.name} [${roleWords(p.role)}]`).join('; ') || 'none identified'}.`);
  for (const p of rotations) lines.push(`  ${p.name}: last work ${p.workload.lastDate || 'unknown'}, ${fmt(p.workload.fullDaysOff)} full days off; last start ${p.lastStart ? `${p.lastStart.date}, ${ipOf(p.lastStart.outs)} IP/${fmt(p.lastStart.pitches)} pitches` : 'unknown'}; worked today ${p.workload.pitchedToday}.`);
  lines.push('\nEach reliever: dates are official playing dates (a tracked resumed session uses its resumption date); L7/L30 count observed relief through the cutoff, today included; workload windows exclude today. Pitch rows read: type, pitches, usage share, velocity, strikes/pitches, whiffs/swings, hard-hit share of tracked contact. Platoon lines are observed pitches/plate appearances in the previous 14 days, not season splits.');
  for(const p of arms) {
    const w=p.workload,u=p.usage;
    const byDay=Object.entries(w.byDay).filter(([d])=>dayGap(d,team.date)<=14).map(([d,n])=>`${md(d)} ${fmt(n)}`).join(', ') || 'none known';
    const windows=Object.entries(w.windows).map(([n,v])=>`${n}d ${v.games} app/${v.days} days/${fmt(v.pitches)} p`).join('; ');
    lines.push(`\n${p.name} (${p.hand || '?'}HP; ${roleWords(p.role)})`,
      `  Rest: last work ${w.lastDate || 'unknown'}; ${fmt(w.fullDaysOff)} full days off; ${fmt(w.hoursSinceLastPitch)} h since last pitch; consecutive days ${w.consecutiveDays}; worked today ${w.pitchedToday}; prior four days ${w.daysInLast4}.`,
      `  Pitch counts by official playing date (last 14 days): ${byDay}.`,
      `  Workload before today: ${windows}.`,
      `  Last outings: ${p.recent.map(outing).join(' | ') || 'unknown'}.`,
      `  Lines: L7 ${statLine(p.recent7)}; L30 ${statLine(p.recent30)}; season ${p.logComplete ? statLine(p.season) : 'UNAVAILABLE (MLB log failed; recent observed boxes are not a complete season)' }.`,
      `  Usage: ${u.entriesObserved}/${u.recentSample} recent entries have situation data — ${u.leading} leading, ${u.tied} tied, ${u.trailing} trailing, ${u.ninthOrLater} in the ninth or later; ${fmt(p.season.saves)} SV/${fmt(p.season.holds)} HLD/${fmt(p.season.blownSaves)} BS observed; ${u.multiInning} multi-inning; ${u.returnedNextCalendarDay} next-day returns; longest this season ${ipOf(u.maxOuts)} IP/${fmt(u.maxPitches)} p.`,
      `  Platoon (14d): LHB ${platoon(p.recentPlatoon.left)}; RHB ${platoon(p.recentPlatoon.right)}.`,
      `  Pitches, newest outings${pitchWindow(p.pitchTrend.recentGames, p.pitchTrend.recent, 'no pitch-tracked relief outing in the last 14 days')}.`,
      `  Pitches, prior outings${pitchWindow(p.pitchTrend.comparisonGames, p.pitchTrend.comparison, p.pitchTrend.recentGames.length ? 'none earlier in the 14-day window (the newest outings are all of them)' : 'none in the last 14 days')}.`,
      `  Vs this opponent: ${p.opponentExposure.map(r=>`${md(r.date)}: ${r.batters.map(b=>`${b.name} (${b.hand}, ${b.event}; ${[...new Set(r.pitches.filter(p=>p.batterId===b.id).map(p=>p.type))].join('/')})`).join(', ')}`).join(' | ') || 'none in the tracked window'}.`,
      `  Runners: ${fmt(p.season.steals)} SB/${fmt(p.season.caughtStealing)} CS, ${fmt(p.season.wildPitches)} WP.${p.logComplete?'':' Season log missing.'}`);
  }
  lines.push(`\nOpponent batting order: ${team.lineup.map(b=>`${b.order}. ${b.name} (${b.hand||'?'})`).join('; ') || 'consult confirmed lineup in scout report'}.`,
    `Team relief in tracked games: ${statLine(team.unit.last14)}. ${team.unit.label}.`,
    `Upcoming: ${team.upcoming.map(g=>`${etClock(g.firstPitch)} vs ${g.opponent}, starter ${g.starter||'unannounced'}`).join('; ')}.`,
    `Transactions: ${team.transactions.map(t=>`${t.date}: ${t.description}`).join('; ') || 'none returned'}.`,
    `Gaps: ${team.gaps.join('; ') || 'no request failures'}.`,
    `Sources: MLB StatsAPI roster, schedule, pitching game logs, boxscores and play-by-play through the cutoff; full per-request provenance is retained in the saved snapshot.`);
  return lines.join('\n');
}
