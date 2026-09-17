import { describe, it, expect, vi } from 'vitest';
import { appearance, boxAppearances, summarize, workload, pitchingDetails, pitchProfile, outsOf } from '../../src/services/bullpen/evidence.js';
import { buildBullpenTeam, renderBullpenTeam } from '../../src/services/bullpen/service.js';
import { buildBullpenSnapshot, collectBullpenReports, fetchBullpenEvidence } from '../../src/services/bullpen/snapshot.js';

const stat = (ip='1.0', extra={}) => ({ inningsPitched:ip, numberOfPitches:18, gamesStarted:0, earnedRuns:0,runs:0,hits:0,baseOnBalls:0,strikeOuts:2,
  homeRuns:0,battersFaced:3,saves:0,holds:0,blownSaves:0,gamesFinished:0,inheritedRunners:0,inheritedRunnersScored:0,wildPitches:0,stolenBases:0,caughtStealing:0,...extra });
const game = (pk=10,date='2026-09-15',time='2026-09-16T02:00:00Z') => ({gamePk:pk,officialDate:date,gameDate:time,gameType:'R',status:{abstractGameState:'Final'},teams:{home:{team:{id:1,name:'Home'}},away:{team:{id:2,name:'Away'}}}});
const player=(id,ip,extra={},position='P')=>({person:{id,fullName:`Arm ${id}`},position:{abbreviation:position},stats:{pitching:stat(ip,extra)}});
const box={teams:{home:{team:{id:1},pitchers:[1,2,3,4,5],players:{ID1:player(1,'4.0',{gamesStarted:1}),ID2:player(2,'0.0',{numberOfPitches:22}),ID3:player(3,'5.0',{numberOfPitches:70}),ID4:player(4,'1.0'),ID5:player(5,'1.0',{},'SS')}},away:{team:{id:2}}}};

describe('complete, dated bullpen observations',()=>{
  it('identifies the starter by order and retains zero-out and long relief, separating position players',()=>{
    const rows=boxAppearances(box,game(),1);
    expect(rows[0].role).toBe('starter');
    expect(rows.filter(r=>r.role==='relief'&&!r.positionPlayer).map(r=>[r.id,r.outs,r.pitches])).toEqual([[2,0,22],[3,15,70],[4,3,18]]);
    expect(rows[4].positionPlayer).toBe(true);
    expect(rows.every(r=>r.date==='2026-09-15')).toBe(true);
  });
  it('rejects wrong-team boxes and leaves missing workload unknown',()=>{
    expect(()=>boxAppearances(box,game(),99)).toThrow('does not contain');
    expect(appearance({inningsPitched:'0.0'})).toMatchObject({outs:0,pitches:null,role:'unknown'});
    expect(summarize([appearance(stat()),appearance({inningsPitched:'1.0'})])).toMatchObject({outs:6,pitches:null,er:null,kMinusBbPct:null});
  });
  it.each([['0.0',0],['1.2',5],['5.0',15],['1.3',null],['',null],[null,null]])('converts %s to actual outs', (input,expected)=>expect(outsOf(input)).toBe(expected));
  it('does not turn appearances separated by an off-day into consecutive days',()=>{
    const rows=['2026-09-13','2026-09-15'].map(date=>appearance(stat(),{date}));
    const w=workload(rows,'2026-09-16','2026-09-16T16:00:00Z');
    expect(w).toMatchObject({consecutiveDays:1,daysInLast4:2,fullDaysOff:0,hoursSinceLastPitch:null});
    expect(workload(rows,'2026-09-17','2026-09-17T16:00:00Z').fullDaysOff).toBe(1);
    expect(w.windows[1].games).toBe(1); // yesterday, not today
  });
  it('adds both doubleheader appearances without counting them as two consecutive days',()=>{
    const rows=[appearance(stat(),{date:'2026-09-16',gamePk:1,lastPitchAt:'2026-09-16T18:00:00Z'}),appearance(stat('0.0',{numberOfPitches:22}),{date:'2026-09-16',gamePk:2,lastPitchAt:'2026-09-16T23:00:00Z'})];
    expect(workload(rows,'2026-09-16','2026-09-17T01:00:00Z')).toMatchObject({byDay:{'2026-09-16':40},pitchedToday:true,consecutiveDays:1,hoursSinceLastPitch:2});
  });
  it('does not report elapsed recovery from an older tracked outing when latest work is untracked',()=>{
    const rows=[{date:'2026-09-13',pitches:20,lastPitchAt:'2026-09-13T20:00:00Z'},{date:'2026-09-15',pitches:30}];
    expect(workload(rows,'2026-09-16','2026-09-16T16:00:00Z').hoursSinceLastPitch).toBeNull();
  });
  it('uses actual pitch dates for resumed games',()=>{
    const r=appearance(stat(),{date:'2026-09-10',pitchDays:[{date:'2026-09-15',pitches:18}],lastPitchAt:'2026-09-16T00:00:00Z'});
    expect(workload([r],'2026-09-16','2026-09-16T12:00:00Z')).toMatchObject({lastDate:'2026-09-15',byDay:{'2026-09-15':18},hoursSinceLastPitch:12});
    const withEarlier=workload([r,{date:'2026-09-14',pitches:10,lastPitchAt:'2026-09-14T20:00:00Z'}],'2026-09-16','2026-09-16T12:00:00Z');
    expect(withEarlier.hoursSinceLastPitch).toBe(12);expect(withEarlier.windows[1].pitches).toBe(18);
  });
  it('records entry state separately from later runs and retains named batter/pitch exposure',()=>{
    const plays=[{about:{halfInning:'top',inning:7,endTime:'2026-09-15T22:00:00Z'},matchup:{pitcher:{id:1},batter:{id:20,fullName:'Hitter A'},postOnFirst:{id:20}},result:{awayScore:1,homeScore:2,eventType:'single'},count:{outs:1}},
      {about:{halfInning:'top',inning:7,endTime:'2026-09-15T22:01:00Z'},matchup:{pitcher:{id:2},batter:{id:21,fullName:'Hitter B'},batSide:{code:'L'}},result:{awayScore:3,homeScore:2,eventType:'home_run'},count:{outs:1},
        playEvents:[{isPitch:true,endTime:'2026-09-15T22:01:00Z',details:{type:{code:'FF'},call:{code:'X'},isStrike:true},pitchData:{startSpeed:98,coordinates:{pfxX:-4,pfxZ:9}},hitData:{launchSpeed:103}}]}];
    const d=pitchingDetails(plays,true).get(2);
    expect(d.entry).toMatchObject({teamScore:2,opponentScore:1,outs:1,runners:[20]});
    expect(d.batters[0]).toMatchObject({name:'Hitter B',hand:'L',event:'home_run'});
    expect(pitchProfile(d.pitches)[0]).toMatchObject({type:'FF',n:1,mph:98,trackedContact:1,hardHitPct:100});
  });
  it.each([true,false])('keeps ordinary entry data but excludes an ambiguous mid-PA change: %s',midPA=>{
    const pitch={isPitch:true,details:{call:{code:'S'},type:{code:'FF'}},pitchData:{startSpeed:95}};
    const change={details:{eventType:'pitching_substitution'},player:{id:2}};
    const p={about:{halfInning:'top',inning:7},matchup:{pitcher:{id:2},batter:{id:20}},playEvents:midPA?[pitch,change,pitch]:[change,pitch]};
    const detail=pitchingDetails([p],true).get(2);
    expect(detail.pitches).toHaveLength(midPA?0:1);expect(detail.entry===null).toBe(midPA);
  });
});

function fixture({missingLog=false,future=false}={}) {
  const roster=Array.from({length:9},(_,i)=>({person:{id:i+1,fullName:`Arm ${i+1}`},position:{type:'Pitcher',abbreviation:'P'},status:{code:'A'}}));
  const log=id=>[{date:'2026-09-13',game:{gamePk:9},gameType:'R',opponent:{name:'Away'},stat:stat('1.0',{gamesStarted:id===1?1:0})},
    ...(future?[{date:'2026-09-17',game:{gamePk:99},stat:stat('1.0',{numberOfPitches:999})}]:[])];
  const read=vi.fn(async path=>{
    if(path.includes('/roster?'))return {roster};
    if(path.includes('/schedule?'))return {dates:[{games:[game()]}]};
    if(path.includes('/transactions?'))return {transactions:[{person:{id:6},date:'2026-09-15',description:'Arm 6 recalled'}]};
    if(path.includes('/boxscore'))return box;
    if(path.includes('/playByPlay'))return {allPlays:[]};
    if(path.includes('sportId='))return {stats:[{group:{displayName:'pitching'},splits:path.endsWith('sportId=11')?[{date:'2026-09-14',game:{gamePk:500},stat:stat('3.0',{numberOfPitches:55}),team:{id:101}}]:[]}]};
    if(path.includes('/stats?')){ const id=Number(path.match(/people\/(\d+)/)[1]);if(id===8&&missingLog)throw new Error('provider offline');return {stats:[{group:{displayName:'pitching'},splits:id===9?[]:log(id)}]}; }
    if(path.includes('people?personIds'))return {people:roster.map(p=>({id:p.person.id,pitchHand:{code:'R'}}))};
    throw new Error(`Unexpected fixture path ${path}`);
  });
  return {read};
}
describe('roster, logs and box scores joined through the production collector',()=>{
  const args={teamId:1,teamName:'Home',opponentId:2,starterId:1,gamePk:100,cutoff:'2026-09-16T16:00:00Z'};
  it('covers more than four arms, includes a no-MLB-log arrival and retains minor-league work separately',async()=>{
    const {read}=fixture({future:true}); const t=await buildBullpenTeam({...args,read});
    expect(t.pitchers).toHaveLength(9);
    expect(t.pitchers.find(p=>p.id===9).role).toBe('unknown_no_mlb_appearances');
    const p=t.pitchers.find(p=>p.id===6);
    expect(p.workload.byDay['2026-09-14']).toBe(55);
    expect(p.season.games).toBe(1); // minor workload never becomes MLB quality
    expect(p.workload.byDay['2026-09-17']).toBeUndefined();
    expect(t.pitchers.find(p=>p.id===2).recent.at(-1)).toMatchObject({outs:0,pitches:22,date:'2026-09-15'});
    expect(t.pitchers.find(p=>p.id===3).recent.at(-1)).toMatchObject({outs:15,pitches:70,role:'relief'});
    expect(t.excludedPositionPlayers.map(p=>p.name)).toContain('Arm 5');
    const text=renderBullpenTeam(t);
    expect(text).toContain('Arm 9');expect(text).toContain('availability unknown');expect(text).not.toContain('entire pen fresh');
    expect(read.mock.calls.some(([p])=>p.includes('sportIds='))).toBe(false); // StatsAPI silently ignores plural
  });
  it('retains an unknown arm when its log fails and never treats partial boxes as season totals',async()=>{
    const {read}=fixture({missingLog:true});const t=await buildBullpenTeam({...args,read});
    expect(t.pitchers.find(p=>p.id===8)).toMatchObject({role:'unknown_log_missing',availability:'unknown',logComplete:false});
    expect(renderBullpenTeam(t)).toContain('UNAVAILABLE (MLB log failed');expect(t.gaps.join(' ')).toContain('provider offline');
  });
  it('fails on a missing roster instead of emitting an empty bullpen',async()=>{
    const {read}=fixture();const original=read.getMockImplementation();read.mockImplementation(p=>p.includes('/roster?')?Promise.resolve({}):original(p));
    await expect(buildBullpenTeam({...args,read})).rejects.toThrow('collection missing');
  });
  it('keeps optional missing box detail visible without breaking the entire report',async()=>{
    const {read}=fixture();const original=read.getMockImplementation();
    read.mockImplementation(path=>{
      if(path.includes('/schedule?'))return {dates:[{games:[game(9,'2026-09-13','2026-09-13T20:00:00Z')]}]};
      if(path.includes('/boxscore'))throw new Error('Box temporarily unavailable');
      return original(path);
    });
    const t=await buildBullpenTeam({...args,read});
    expect(renderBullpenTeam(t)).toContain('Box temporarily unavailable');
    expect(t.pitchers.find(p=>p.id===2).opponentExposure[0].batters).toEqual([]);
  });
  it('does not turn a failed reporting search into confirmed availability',async()=>{
    const report=await collectBullpenReports(['Home'],args.cutoff,async()=>({success:false,data:'All available'}));
    expect(report[0]).toMatchObject({status:'unavailable'});expect(report[0].text).toContain('UNKNOWN');
  });
  it.each([true,false])('includes a same-day doubleheader first game only after its verified end: %s',ended=>{
    const {read}=fixture();const original=read.getMockImplementation();
    read.mockImplementation(path=>{
      if(path.includes('/schedule?'))return {dates:[{games:[game(10,'2026-09-16','2026-09-16T12:00:00Z')]}]};
      if(path.includes('/playByPlay'))return {allPlays:[{about:{endTime:ended?'2026-09-16T15:00:00Z':'2026-09-16T17:00:00Z'}}]};
      return original(path);
    });
    return buildBullpenTeam({...args,read}).then(t=>{
      const w=t.pitchers.find(p=>p.id===2).workload;expect(w.pitchedToday).toBe(ended);
      expect(w.byDay['2026-09-16']).toBe(ended?22:undefined);
    });
  });
  it.each([true,false])('retains same-day minor-league workload only with a completed game: %s',async ended=>{
    const {read}=fixture();const original=read.getMockImplementation();
    read.mockImplementation(path=>{
      if(path.endsWith('sportId=11'))return {stats:[{group:{displayName:'pitching'},splits:[{date:'2026-09-16',game:{gamePk:500},stat:stat('2.0',{numberOfPitches:35})}]}]};
      if(path.includes('game/500/feed/live'))return {gameData:{status:{abstractGameState:ended?'Final':'Live'}},liveData:{plays:{allPlays:[{about:{endTime:'2026-09-16T15:00:00Z'}}]}}};
      return original(path);
    });
    const t=await buildBullpenTeam({...args,read});expect(t.pitchers.find(p=>p.id===6).workload.pitchedToday).toBe(ended);
    if(!ended)expect(t.gaps.join(' ')).toContain('not confirmed complete');
  });
  it('delivers the same complete record through all bullpen tool aliases without duplicating the whole snapshot',async()=>{
    const {read}=fixture();const team=await buildBullpenTeam({...args,read});
    const snapshot={home:team,away:team,reports:[],cutoff:args.cutoff,gamePk:100,version:team.version};
    const {FETCHERS}=await import('../../src/services/agentic/mlbJuneEra/tools/statRouters/index.js');
    for(const token of ['MLB_BULLPEN','MLB_BULLPEN_WORKLOAD','MLB_CLOSER_RELIEVER_STATS']){
      expect(FETCHERS[token]).toBe(fetchBullpenEvidence);
      const result=await FETCHERS[token]('baseball_mlb',{}, {},2026,{bullpenSnapshot:snapshot});
      expect(result.homeValue).toContain('Arm 9');expect(result.cutoff).toBe(args.cutoff);expect(result.evidence).toBeUndefined();
    }
  });
  it('refuses an after-start pregame snapshot instead of leaking game results or changed lineups',async()=>{
    const read=vi.fn(async path=>path.startsWith('v1/teams?')?{teams:[{id:1,name:'Home'},{id:2,name:'Away'}]}:
      {gameData:{teams:{home:{id:1},away:{id:2}},status:{abstractGameState:'Final'}},liveData:{linescore:{teams:{home:{runs:10}}}}});
    await expect(buildBullpenSnapshot({gamePk:10,home_team:'Home',away_team:'Away',commence_time:args.cutoff},{read})).rejects.toThrow('after this game has begun');
    expect(read).toHaveBeenCalledTimes(2);
  });
});
