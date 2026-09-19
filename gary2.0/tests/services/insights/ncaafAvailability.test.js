import {beforeEach,describe,it,expect,vi}from'vitest';
const context=vi.hoisted(()=>({getNcaafGameContext:vi.fn()}));
vi.mock('../../../src/services/ncaafGameContext.js',()=>context);
const ledger=vi.hoisted(()=>({gamesWithRowsToday:vi.fn(async()=>new Set())}));
vi.mock('../../../src/services/insights/ncaafLaneLedger.js',async original=>({...await original(),...ledger}));
const{computeNcaafAvailability}=await import('../../../src/services/insights/computers/ncaafAvailability.js');
const game={id:99,date:'2026-09-19T20:00:00Z',home_team:{id:1,abbreviation:'H'},visitor_team:{id:2,abbreviation:'A'}};
let report,ctx;
beforeEach(()=>{vi.clearAllMocks();ledger.gamesWithRowsToday.mockResolvedValue(new Set());report={observed_at:'2026-09-19T12:00:00Z',sides:{home:{availability:'checked',sources:[{id:'s',title:'School',url:'https://school.edu/report',reported:'2026-09-18'}],injuries:[]},away:{availability:'unavailable',sources:[],injuries:[]}}};context.getNcaafGameContext.mockImplementation(async()=>report);ctx={league:'ncaaf',date:'2026-09-19',season:2026,games:[game],helpers:{gameLabel:()=> 'A @ H'},bdl:{}};});
const injury=i=>({name:`Player ${i}`,player:{id:i,position:'TE'},status:'out for season',description:'Season-ending surgery.',sources:['s']});
describe('college availability uses the shared evidenced report',()=>{
 it('publishes every validated absence with exact source URLs and roster positions',async()=>{report.sides.home.injuries=Array.from({length:6},(_,i)=>injury(i+1));const rows=await computeNcaafAvailability(ctx);expect(rows).toHaveLength(6);expect(rows[0].headline).toContain('(TE)');expect(rows[0].value).toBe('OUT FOR SEASON');expect(rows[0].meta.sources[0].url).toBe('https://school.edu/report');expect(rows[0].detail).toContain('School (2026-09-18)');expect(rows[0].meta.source).toBe('ncaaf_game_context_v1');});
 it('does not publish an unavailable team as healthy or reuse invalid injuries',async()=>{report.sides.away.injuries=[injury(9)];expect(await computeNcaafAvailability(ctx)).toEqual([]);});
 it('does not mistake an old generic injury story for the new collector finishing',async()=>{await computeNcaafAvailability(ctx);expect(ledger.gamesWithRowsToday).toHaveBeenCalledWith(expect.objectContaining({source:'ncaaf_game_context_v1'}));});
 it('does not run for NFL, completed games, or a failed report',async()=>{expect(await computeNcaafAvailability({...ctx,league:'nfl'})).toEqual([]);ledger.gamesWithRowsToday.mockResolvedValue(new Set(['99']));expect(await computeNcaafAvailability(ctx)).toEqual([]);expect(context.getNcaafGameContext).not.toHaveBeenCalled();ledger.gamesWithRowsToday.mockResolvedValue(new Set());context.getNcaafGameContext.mockResolvedValue({unavailable:true});expect(await computeNcaafAvailability(ctx)).toEqual([]);});
});
