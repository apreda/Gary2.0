import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('NCAAF props runner wiring', () => {
  it('uses the shared nonzero-outcome runner with the NCAAF context', () => {
    const runner = source('scripts/run-agentic-ncaaf-props.js');
    expect(runner).toContain("sportKey: 'americanfootball_ncaaf'");
    expect(runner).toContain("leagueLabel: 'NCAAF'");
    expect(runner).toContain('buildContext: buildNcaafPropsAgenticContext');
    expect(runner).toContain('exitAfterFlushing(1)');
  });

  it('dispatches NCAAF to the current-event market adapter', () => {
    const service = source('src/services/propOddsService.js');
    expect(service).toContain("sport === 'americanfootball_ncaaf'");
    expect(service).toContain('ncaafPropOddsService.getPlayerPropMarkets');
  });

  it('adopts the BDL-validated board and applies the shared per-game cap', () => {
    const cli = source('scripts/run-agentic-props-cli.js');
    expect(cli).toContain('playerProps = context.playerProps');
    expect(cli).toContain("leagueLabel === 'NCAAF' ? { player_id: _oddsRow?.player_id ?? null }");
    expect(cli).toContain("leagueLabel === 'NCAAF' && p.player_id == null");
    expect(cli).toContain("['NBA', 'NHL', 'MLB', 'NFL', 'NCAAF'].includes(leagueLabel)");
    expect(cli).toContain('produced no valid picks and no explicit pass');
    expect(cli).toContain('throw new Error(`Props processing failed');
  });
});
