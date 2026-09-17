import { describe, it, expect, vi } from 'vitest';
const mocks=vi.hoisted(()=>({base:vi.fn(),bullpen:vi.fn(),search:vi.fn()}));
vi.mock('../../../src/services/agentic/mlbJuneEra/scoutReport/sports/mlb.js',()=>({buildMlbScoutReport:mocks.base}));
vi.mock('../../../src/services/bullpen/snapshot.js',()=>({buildBullpenSnapshot:mocks.bullpen}));
vi.mock('../../../src/services/bullpen/reporting.js',()=>({searchBullpenReporting:mocks.search}));
import { buildScoutReport } from '../../../src/services/agentic/mlbJuneEra/scoutReport/scoutReportBuilder.js';

describe('June scout bullpen preload',()=>{
  it('sends the identical complete pen to both research and Gary before tool use',async()=>{
    mocks.base.mockResolvedValue({text:'Original June starter and lineup data',gamePk:88,verifiedTaleOfTape:null,tokenMenu:''});
    const snapshot={version:'bullpen-game-evidence-v2',text:'Every named arm, including final roster arrival. UNKNOWN clearance.',home:{pitchers:[{id:9}]}};
    mocks.bullpen.mockResolvedValue(snapshot);
    const game={home_team:'Home',away_team:'Away',commence_time:'2026-09-17T17:00:00Z'};
    const result=await buildScoutReport(game,'baseball_mlb');
    expect(mocks.bullpen).toHaveBeenCalledWith({...game,gamePk:88},expect.objectContaining({search:mocks.search}));
    expect(result.garyText).toContain(snapshot.text);expect(result.flashText).toContain(snapshot.text);
    expect(result.bullpenSnapshot).toBe(snapshot);
  });
  it('cannot publish an apparently complete scout when the core bullpen roster fails',async()=>{
    mocks.base.mockResolvedValue({text:'Starter data',gamePk:88});mocks.bullpen.mockRejectedValue(new Error('Active roster unavailable'));
    await expect(buildScoutReport({home_team:'Home',away_team:'Away'},'baseball_mlb')).rejects.toMatchObject({code:'required_data_unavailable',retryModel:false,message:expect.stringContaining('Active roster unavailable')});
  });
});
