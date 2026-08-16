import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runner = readFileSync(new URL('../../run-insight-connections.js', import.meta.url), 'utf8');
const workflow = readFileSync(
  new URL('../../../.github/workflows/hub-insights.yml', import.meta.url),
  'utf8',
);
const footballWorkflow = readFileSync(
  new URL('../../../.github/workflows/football-hub-insights.yml', import.meta.url),
  'utf8',
);
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

describe('football Hub invocation wiring', () => {
  it('registers NFL and NCAAF in the storage runner', () => {
    expect(runner).toContain("const ACTIVE_LEAGUES = ['MLB', 'NFL', 'NCAAF', 'NBA']");
    expect(runner).toContain("const DEFAULT_LEAGUES = ['MLB', 'NBA']");
    expect(runner).toContain('let leagues = DEFAULT_LEAGUES');
    expect(runner).toContain('game_id: connection.game_id != null ? String(connection.game_id) : null');
    expect(runner).toContain('team_id: connection.team_id != null ? String(connection.team_id) : null');
    expect(runner).toContain('player_id: connection.player_id != null ? String(connection.player_id) : null');
  });

  it('keeps scheduled MLB/NBA traffic isolated and exposes serialized football dispatches', () => {
    expect(workflow).toContain("group: hub-insights");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && inputs.leagues || 'MLB,NBA'");
    expect(workflow).toContain('- NFL,NCAAF');
    expect(workflow).toContain('node run-insight-connections.js --league "$HUB_LEAGUES"');
  });

  it('automatically runs football on a staggered, serialized cloud cadence', () => {
    expect(footballWorkflow).toContain("cron: '17 11,17,23 * * *'");
    expect(footballWorkflow).toContain('group: hub-insights');
    expect(footballWorkflow).toContain("github.event_name == 'workflow_dispatch' && inputs.leagues || 'NFL,NCAAF'");
    expect(footballWorkflow).toContain('node run-insight-connections.js --league "$HUB_LEAGUES"');
    expect(packageJson.scripts['hub:football']).toBe('node run-insight-connections.js --league NFL,NCAAF');
  });
});
