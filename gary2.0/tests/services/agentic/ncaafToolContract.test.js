import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTokensForSport } from '../../../src/services/agentic/tools/toolDefinitions.js';
import { resolveTokenForSport } from '../../../src/services/agentic/tools/statRouters/index.js';
import { ncaafFetchers } from '../../../src/services/agentic/tools/statRouters/ncaafFetchers.js';
import { ballDontLieService } from '../../../src/services/ballDontLieService.js';
import { summarizeStatForContext } from '../../../src/services/agentic/orchestrator/orchestratorHelpers.js';

afterEach(() => vi.restoreAllMocks());
const home = { id: 11, full_name: 'Home State' }, away = { id: 22, full_name: 'Away Tech' };
describe('college tool menu through its actual adapters and formatter', () => {
  it('advertises every college adapter, and every advertised token resolves to an allowed route', () => {
    const menu = getTokensForSport('NCAAF');
    for (const token of Object.keys(ncaafFetchers)) expect(menu).toContain(token);
    for (const token of menu) expect(resolveTokenForSport('americanfootball_ncaaf', token).allowed, token).toBe(true);
    for (const token of ['QB_STATS','OL_RANKINGS','PRESSURE_RATE','EXPLOSIVE_PLAYS','EXPLOSIVE_ALLOWED','SCHEDULE_STRENGTH']) {
      expect(menu).toContain(token);
      expect(resolveTokenForSport('americanfootball_ncaaf', token)).toMatchObject({ allowed: true, owner: 'ncaaf' });
    }
    for (const token of ['SCHEDULE_CONTEXT','TRAVEL_SITUATION','WEATHER']) {
      expect(menu).not.toContain(token); // no college adapter: never borrow an NFL/NBA one
      expect(resolveTokenForSport('americanfootball_ncaaf', token).allowed).toBe(false);
    }
  });

  it('retains real completed-game records, samples, opponents and venue splits', async () => {
    // Use the provider's actual football field names.
    vi.spyOn(ballDontLieService, 'getGames').mockResolvedValue([
      { id: 1, status: 'Final', date: '2026-09-01T23:00:00Z', home_team: home, away_team: away, home_score: 27, away_score: 10 },
    ]);
    const recent = await ncaafFetchers.NCAAF_RECENT_FORM('americanfootball_ncaaf', home, away, 2026);
    const splits = await ncaafFetchers.NCAAF_HOME_AWAY_SPLITS('americanfootball_ncaaf', home, away, 2026);
    const render = (r,t) => summarizeStatForContext(r,t,home.full_name,away.full_name,'americanfootball_ncaaf');
    expect(render(recent,'RECENT_FORM')).toContain('"record": "1-0"');
    expect(render(recent,'RECENT_FORM')).toContain('"games_used": 1');
    expect(render(recent,'RECENT_FORM')).toContain('Away Tech');
    expect(render(splits,'HOME_AWAY_SPLITS')).toContain('"at_home"');
    expect(render(splits,'HOME_AWAY_SPLITS')).toContain('"record": "1-0"');
    expect(render(splits,'HOME_AWAY_SPLITS')).not.toContain('undefined');
    expect(render(recent,'RECENT_FORM')).toContain(recent.data_scope);
  });

  it('preserves absent samples and the true metric rather than labeling counts as pressure rate', () => {
    const result = { source: 'Ball Don\'t Lie', data_scope: 'True pressure rate is not published for NCAAF.',
      home: { team: 'Home State', sacks: 0, games_used: 1 }, away: { team: 'Away Tech', note: 'No player game rows returned' } };
    const text = summarizeStatForContext(result,'PRESSURE_RATE','Home State','Away Tech','NCAAF');
    expect(text).toContain(result.data_scope);
    expect(text).toContain('"sacks": 0');
    expect(text).toContain(result.away.note);
  });
});
