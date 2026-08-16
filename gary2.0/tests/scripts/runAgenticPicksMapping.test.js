import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countRealStats } from '../../src/services/agentic/statsSubstance.js';

const runner = readFileSync(new URL('../../scripts/run-agentic-picks.js', import.meta.url), 'utf8');

describe('NFL verified Tale of the Tape storage mapping', () => {
  const nflMap = {
    POINTS_GM: 'points_per_game',
    OPP_PTS_GM: 'opp_points_per_game',
    RUSH_YDS_GM: 'rushing_yards_per_game',
    PASS_YDS_GM: 'passing_ypg'
  };

  it('maps every NFL tape token to the backend key consumed by iOS', () => {
    for (const [token, key] of Object.entries(nflMap)) {
      expect(runner).toContain(`'${token}': '${key}'`);
    }
    expect(runner).toContain('{ statProvenance: row.statProvenance }');
  });

  it('counts the mapped NFL rows as substantive with the production key shape', () => {
    const stats = Object.entries(nflMap).map(([token, key], index) => ({
      token,
      home: { team: 'Home', [key]: String(20 + index) },
      away: { team: 'Away', [key]: String(18 + index) }
    }));

    expect(countRealStats(stats, nflMap)).toBe(4);
  });
});

describe('NCAAF verified Tale of the Tape storage mapping', () => {
  const ncaafMap = {
    TOTAL_YPG: 'total_ypg',
    OPP_PASSING_YARDS: 'opp_passing_yards',
    OPP_RUSHING_YARDS: 'opp_rushing_yards',
  };

  it('uses canonical tokens whose lowercase storage keys are decoded by iOS', () => {
    expect(runner).toContain('tokenToIosKey[row.token] || row.token.toLowerCase()');
    for (const [token, key] of Object.entries(ncaafMap)) {
      expect(token.toLowerCase()).toBe(key);
    }
  });

  it('counts all three canonical NCAAF rows as substantive after storage shaping', () => {
    const stats = Object.entries(ncaafMap).map(([token, key], index) => ({
      token,
      home: { team: 'Home College', [key]: String(440 + index) },
      away: { team: 'Away College', [key]: String(420 + index) },
    }));
    expect(countRealStats(stats)).toBe(3);
  });
});

describe('NCAAF game-runner FBS policy wiring', () => {
  it('persists exact provider abbreviations for college pick-card labels', () => {
    expect(runner).toContain('season_type: game?.season_type ?? null');
    expect(runner).toContain('homeTeamAbbreviation: game?.home_team?.abbreviation ?? null');
    expect(runner).toContain('awayTeamAbbreviation: (game?.away_team ?? game?.visitor_team)?.abbreviation ?? null');
  });

  it('uses provider ids and canonical conference shapes instead of exact team-name matching', () => {
    expect(runner).toContain('classifyNcaafFbsGames,');
    expect(runner).toContain("from '../src/services/ncaafGamePolicy.js'");
    expect(runner).toContain('const classified = classifyNcaafFbsGames(');
    expect(runner).toContain('games.filter((game) => !isVerifiedNcaafSlateFallback(game))');
    expect(runner).toContain('NCAAF FBS identity unresolved');
    expect(runner).not.toContain('fbsTeamNames');
  });

  it('carries FBS provenance only from authoritative slate or exact-provider fallbacks', () => {
    expect(runner).toContain("ncaaf_fbs_verification_source: 'daily_slate'");
    expect(runner).toContain('const verifiedSlateFallbacks = games.filter(isVerifiedNcaafSlateFallback)');
    expect(runner).toContain('const ncaafTeams = providerGames.length > 0');
    expect(runner).toContain("['daily_slate', 'provider_exact'].includes(game?.ncaaf_fbs_verification_source)");
  });
});
