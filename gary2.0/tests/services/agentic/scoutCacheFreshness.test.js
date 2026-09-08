import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ files:new Map(),era:'aaaa1111aaaa',scout:vi.fn(),loop:vi.fn() }));
vi.mock('fs', async original => {
  const fs = await original();
  const cached = path => String(path).includes('gary-scout-cache');
  return { ...fs,
    existsSync:path => cached(path) ? mocks.files.has(String(path)) : fs.existsSync(path),
    mkdirSync:(path,...args) => cached(path) ? undefined : fs.mkdirSync(path,...args),
    readFileSync:(path,...args) => cached(path) ? mocks.files.get(String(path)) : fs.readFileSync(path,...args),
    writeFileSync:(path,data,...args) => cached(path) ? mocks.files.set(String(path),data) : fs.writeFileSync(path,data,...args),
    statSync:path => cached(path) ? {mtimeMs:Date.now()} : fs.statSync(path),
  };
});
vi.mock('../../../src/services/agentic/orchestrator/footballPromptSha.js', () => ({ footballPromptSha:()=>mocks.era }));
vi.mock('../../../src/services/agentic/scoutReport/scoutReportBuilder.js', () => ({ buildScoutReport:mocks.scout }));
vi.mock('../../../src/services/agentic/orchestrator/agentLoop.js', () => ({ runAgentLoop:mocks.loop }));
vi.mock('../../../src/services/agentic/tools/statRouters/index.js', () => ({ fetchStats:vi.fn(),clearStatRouterCache:vi.fn() }));
vi.mock('../../../src/services/agentic/statsSubstance.js', () => ({shouldReuseScoutReport:()=>true}));

import { analyzeGame } from '../../../src/services/agentic/orchestrator/orchestratorMain.js';

const game = {id:1392216,home_team:'Seattle Seahawks',away_team:'New England Patriots',commence_time:'2026-09-10T00:20:00Z',
  spread_home:-3.5,spread_away:3.5,spread_home_odds:-110,spread_away_odds:-110};
const scout = text => ({garyText:text,flashText:text});
beforeEach(() => {
  mocks.files.clear(); mocks.era='aaaa1111aaaa'; vi.clearAllMocks();
  mocks.scout.mockReset(); mocks.loop.mockReset();
  mocks.loop.mockResolvedValue({pick:'Seattle Seahawks -3.5 (-110)',rawAnalysis:'fixture'});
  mocks.scout.mockResolvedValue(scout('current scout'));
});
afterEach(() => vi.restoreAllMocks());

describe('whole scout cache freshness through the real orchestrator', () => {
  it.each(['nocache','fresh'])('rebuilds despite a valid matching cache when %s is requested', async flag => {
    mocks.scout.mockResolvedValueOnce(scout('old scout')).mockResolvedValueOnce(scout('fresh scout'));
    await analyzeGame({...game},'americanfootball_nfl');
    const result = await analyzeGame({...game},'americanfootball_nfl',{[flag]:true});
    expect(result.error).toBeUndefined();
    expect(mocks.scout).toHaveBeenCalledTimes(2);
    expect(result._context.scoutReport).toBe('fresh scout');
  });

  it('reuses a valid report only within the same football code era', async () => {
    mocks.scout.mockResolvedValueOnce(scout('era A')).mockResolvedValueOnce(scout('era B'));
    await analyzeGame({...game},'americanfootball_nfl');
    expect((await analyzeGame({...game},'americanfootball_nfl'))._context.scoutReport).toBe('era A');
    expect(mocks.scout).toHaveBeenCalledTimes(1);
    mocks.era='bbbb2222bbbb';
    const result = await analyzeGame({...game},'americanfootball_nfl');
    expect(mocks.scout).toHaveBeenCalledTimes(2);
    expect(result._context.scoutReport).toBe('era B');
    expect(result._promptSha).toBe('bbbb2222bbbb');
    expect(mocks.files.size).toBe(2);
  });

  it('uses the era captured before asynchronous scouting for both cache storage and the decision', async () => {
    mocks.scout.mockImplementationOnce(async () => {mocks.era='bbbb2222bbbb';return scout('era A desk');});
    const first = await analyzeGame({...game},'americanfootball_ncaaf');
    expect(first._promptSha).toBe('aaaa1111aaaa');
    mocks.era='aaaa1111aaaa';
    const second = await analyzeGame({...game},'americanfootball_ncaaf');
    expect(second._context.scoutReport).toBe('era A desk');
    expect(mocks.scout).toHaveBeenCalledTimes(1);
  });

  it('preserves the explicitly supplied notebook desk when a fresh shadow analysis is requested', async () => {
    const result = await analyzeGame({...game},'americanfootball_nfl',{nocache:true,prebuiltScoutReport:'Original notebook desk'});
    expect(result._context.scoutReport).toBe('Original notebook desk');
    expect(mocks.scout).not.toHaveBeenCalled();
    expect(mocks.files.size).toBe(0);
  });

  it.each([
    ['kickoff',{commence_time:'2026-09-10T01:20:00Z'},{}],
    ['line',{spread_home:-4.5,spread_away:4.5},{}],
    ['price',{spread_away_odds:-120},{}],
    ['moneyline',{moneyline_home:-160,moneyline_away:140},{}],
    ['book',{bookmaker:'FanDuel'},{}],
    ['comparison',{}, {sportsbookOdds:[{bookmaker:'DraftKings',spread_home:-4.5,spread_home_odds:-115}]}],
  ])('rebuilds the same-era football scout when its %s changes', async (_kind,change,options) => {
    mocks.scout.mockResolvedValueOnce(scout('old board')).mockResolvedValueOnce(scout('updated board'));
    await analyzeGame({...game},'americanfootball_nfl');
    const result = await analyzeGame({...game,...change},'americanfootball_nfl',options);
    expect(mocks.scout).toHaveBeenCalledTimes(2);
    expect(result._context.scoutReport).toBe('updated board');
  });
});
