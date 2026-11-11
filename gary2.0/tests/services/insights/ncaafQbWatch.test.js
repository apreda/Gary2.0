import {beforeEach,describe,it,expect,vi} from 'vitest';
const context=vi.hoisted(()=>({getNcaafGameContext:vi.fn()}));
vi.mock('../../../src/services/sports/ncaaf/ncaafGameContext.js',()=>context);
const ledger=vi.hoisted(()=>({gamesWithRowsToday:vi.fn(async()=>new Set())}));
vi.mock('../../../src/services/content/insights/ncaafLaneLedger.js',async original=>({...await original(),...ledger}));
const writer=vi.hoisted(()=>({writeQuarterbackTakes:vi.fn(async()=>new Map())}));
vi.mock('../../../src/services/content/tomorrowBoard/armsTakes.js',()=>writer);
const cfbd=vi.hoisted(()=>({getSeasonGames:vi.fn(async()=>({unavailable:true}))}));
vi.mock('../../../src/services/providers/cfbdService.js',async original=>({...await original(),...cfbd}));
const{computeNcaafQbWatch,espnPasserRows}=await import('../../../src/services/content/insights/computers/ncaafQbWatch.js');
const game={id:99,date:'2026-09-19T20:00:00Z',home_team:{id:1,abbreviation:'H'},visitor_team:{id:2,abbreviation:'A'}};
const side=(name,id,status='confirmed')=>({quarterback:{name,player_id:id,status,sources:['s']},sources:[{id:'s',url:'https://school.edu/depth'}]});
let ctx;
beforeEach(()=>{vi.clearAllMocks();writer.writeQuarterbackTakes.mockResolvedValue(new Map());ledger.gamesWithRowsToday.mockResolvedValue(new Set());context.getNcaafGameContext.mockResolvedValue({observed_at:'2026-09-19T12:00:00Z',sides:{home:side('Starter H',10),away:side('Starter A',20,'projected')}});ctx={league:'ncaaf',date:'2026-09-19',season:2026,games:[game],helpers:{gameLabel:()=> 'A @ H'},bdl:{getNcaafPlayerGameStats:vi.fn(async()=>[])}};});
const stat=(id,teamId,season=2026)=>({player:{id},team:{id:teamId,abbreviation:'OLD'},season,game:{id:11+id,date:`${season}-09-05T20:00:00Z`,season,status:'Final'},passing_attempts:20,passing_completions:12,passing_yards:200,passing_touchdowns:2,passing_interceptions:0});
describe('named college starting quarterbacks',()=>{
 it('shows both reported starters even on a debut with no stats',async()=>{const rows=await computeNcaafQbWatch(ctx);expect(rows).toHaveLength(2);expect(rows.map(r=>r.meta.qb_status)).toEqual(['projected','confirmed']);expect(rows.every(r=>r.meta.passing===null)).toBe(true);expect(rows[0].detail).toContain('No verified passing sample');});
 it('stats describe the named starter, never the higher-volume backup',async()=>{ctx.bdl.getNcaafPlayerGameStats.mockImplementation(async({season})=>season===2026?[stat(10,1),{...stat(30,1),passing_attempts:90}]:[]);const rows=await computeNcaafQbWatch(ctx);const home=rows.find(r=>r.meta.side==='home');expect(home.player_id).toBe(10);expect(home.meta.passing).toMatchObject({yards:200,attempts:20,season:2026});expect(home.headline).toContain('confirmed starter');expect(ctx.bdl.getNcaafPlayerGameStats.mock.calls[0][0].playerIds).toEqual([20,10]);});
 it('never reads last season for a transfer with no line this year',async()=>{ctx.bdl.getNcaafPlayerGameStats.mockImplementation(async({season,playerIds})=>season===2025&&playerIds[0]===20?[stat(20,9,2025)]:[]);const away=(await computeNcaafQbWatch(ctx)).find(r=>r.meta.side==='away');expect(away.meta.passing).toBeNull();expect(away.detail).not.toContain('2025');expect(ctx.bdl.getNcaafPlayerGameStats).not.toHaveBeenCalledWith(expect.objectContaining({season:2025}));});
 it('does not turn missing fields into zero stats',async()=>{ctx.bdl.getNcaafPlayerGameStats.mockResolvedValue([{...stat(10,1),passing_touchdowns:null}]);const home=(await computeNcaafQbWatch(ctx)).find(r=>r.meta.side==='home');expect(home.meta.passing).toBeNull();});
 it('requires both named sides in the completion ledger',async()=>{await computeNcaafQbWatch(ctx);expect(ledger.gamesWithRowsToday).toHaveBeenCalledWith(expect.objectContaining({source:'ncaaf_game_context_v1',requireBothSides:true}));});
 it('does not guess when reporting is unresolved or unavailable',async()=>{context.getNcaafGameContext.mockResolvedValue({unavailable:true});expect(await computeNcaafQbWatch(ctx)).toEqual([]);});
 it('shows the section write-up, one paragraph per side, and keeps the search note off the page',async()=>{context.getNcaafGameContext.mockResolvedValue({observed_at:'2026-09-19T12:00:00Z',sides:{home:{...side('Starter H',10),quarterback:{...side('Starter H',10).quarterback,note:'No team declaration was retrieved.'}},away:side('Starter A',20)}});writer.writeQuarterbackTakes.mockResolvedValue(new Map([['bdl:99',['Away read.','Home read.']]]));const rows=await computeNcaafQbWatch(ctx);expect(rows.find(r=>r.meta.side==='away').meta.read).toBe('Away read.');const home=rows.find(r=>r.meta.side==='home');expect(home.meta.read).toBe('Home read.');expect(home.detail).not.toContain('retrieved');});
 it('keeps the plain line when the write-up does not come back',async()=>{const rows=await computeNcaafQbWatch(ctx);expect(rows.every(r=>r.meta.read===r.detail)).toBe(true);});
 it('does not run for NFL or already completed games',async()=>{expect(await computeNcaafQbWatch({...ctx,league:'nfl'})).toEqual([]);ledger.gamesWithRowsToday.mockResolvedValue(new Set(['99']));expect(await computeNcaafQbWatch(ctx)).toEqual([]);expect(context.getNcaafGameContext).not.toHaveBeenCalled();});
});
// Bachmeier's Oct 24 BDL row had 25 attempts to ESPN's 32 (Nov 10 2026 college pass 3): the page takes ESPN's box.
describe('college quarterback games from ESPN',()=>{
 const team={id:1,full_name:'Iowa State Cyclones'};
 const row={player:{id:10},team:{id:1},game:{id:5,date:'2026-10-24T20:00:00Z'},passing_attempts:25,passing_completions:15,passing_yards:180,passing_touchdowns:1,passing_interceptions:0,rushing_attempts:4,rushing_yards:10,rushing_touchdowns:0};
 const schedule=new Map([['1:5',{opponent:'Kansas State Wildcats'}]]);
 const seasonGames=async()=>({rows:[{id:401,startDate:'2026-10-24T20:00:00Z',homeTeam:'Iowa State',homeId:66,awayTeam:'Kansas State',awayId:2306}]});
 const box=(att)=>({players:[{teamId:'66',name:'Rocco Becht',stats:{passing:{completions:20,passingAttempts:att,passingYards:240,passingTouchdowns:2,interceptions:1},rushing:{rushingAttempts:6,rushingYards:22,rushingTouchdowns:1}}}]});
 it('takes his numbers from the box, and gives none when a game is not in it',async()=>{
  const rows=await espnPasserRows([row],{name:'Rocco Becht',team,schedule,season:2026},{seasonGames,gameBox:async()=>box(32)});
  expect(rows[0]).toMatchObject({passing_attempts:32,passing_completions:20,passing_yards:240,rushing_attempts:6,rushing_touchdowns:1});
  expect(await espnPasserRows([row],{name:'Rocco Becht',team,schedule,season:2026},{seasonGames,gameBox:async()=>({unavailable:true})})).toBeNull();
 });
});
