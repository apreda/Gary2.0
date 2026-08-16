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

  it('refreshes the sportsbook market lane as a complete snapshot', () => {
    expect(runner).toMatch(/VOLATILE_CATEGORIES = new Set\(\[[\s\S]*?'pace_script'/);
    expect(runner).toMatch(/VOLATILE_CATEGORIES = new Set\(\[[\s\S]*?'market_range'/);
    expect(runner).toMatch(/VOLATILE_CATEGORIES = new Set\(\[[\s\S]*?'next_slate'/);
    expect(runner).toMatch(/VOLATILE_CATEGORIES = new Set\(\[[\s\S]*?'fantasy_usage'/);
    const replacement = runner.slice(
      runner.indexOf('async function replaceVolatileRows'),
      runner.indexOf('/** Stored rows for (date, league)'),
    );
    expect(replacement).toContain("category: `eq.${category}`");
    expect(replacement.indexOf('await insertRows(fresh)')).toBeLessThan(
      replacement.indexOf("method: 'DELETE'"),
    );
    expect(replacement).toContain("params: { id: `in.(${oldIds.join(',')})` }");
  });

  it('keeps the established MLB/NBA workflow and exposes serialized football dispatches', () => {
    expect(workflow).toContain("group: hub-insights");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && inputs.leagues || 'MLB,NBA'");
    expect(workflow).toContain('- NFL,NCAAF');
    expect(workflow).toContain('node run-insight-connections.js --league "$HUB_LEAGUES"');
    expect(workflow).toContain('GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}');
  });

  it('keeps football cloud execution as a manual emergency/backfill path', () => {
    expect(footballWorkflow).not.toMatch(/^\s*schedule:/m);
    expect(footballWorkflow).toMatch(/^on:\n\s+workflow_dispatch:/m);
    expect(footballWorkflow).toContain('group: hub-insights');
    expect(footballWorkflow).toContain("github.event_name == 'workflow_dispatch' && inputs.leagues || 'NFL,NCAAF'");
    expect(footballWorkflow).toContain('node run-insight-connections.js --league "$HUB_LEAGUES"');
    expect(footballWorkflow).toContain('GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}');
    expect(packageJson.scripts['hub:football']).toBe('node run-insight-connections.js --league NFL,NCAAF');
  });
});
