// Jul 8 2026 cost audit — round 2 (founder-approved levers #2/#3/#4).
//
//   #2 MLB research walk: 12 → 8 factor chats. Merges overlap only —
//      (starting pitching + pitcher recent form), (hitting + platoon),
//      (catcher + team defense), (park/weather + game context). The token
//      UNION is unchanged: Flash loses zero data access, the walk just stops
//      paying 4 extra chat seeds + factor writeups per game.
//   #3 Gary briefing trust: the briefing contract ordered Gary to keep
//      investigating ("You MUST still investigate") even though every
//      Flash-covered token is deduplicated to nothing — guaranteed wasted
//      big-brain round-trips. New contract: the briefing IS the
//      investigation; fetch only what is genuinely missing.
//   #4 Grounding budget: NHL keeps 10 (RotoWire-era cap, revisit in October),
//      stat-rich sports (MLB + rest) drop 8 → 4 (structured tokens cover
//      stats/lineups/injuries; grounding is for breaking news only).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { INVESTIGATION_FACTORS } from '../../../src/services/agentic/orchestrator/investigationFactors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agenticRoot = path.join(__dirname, '../../../src/services/agentic');
const src = (rel) => readFileSync(path.join(agenticRoot, rel), 'utf8');

describe('#2 MLB research walk runs 8 factor chats with the full token union', () => {
  it('walks exactly 8 MLB factors', () => {
    expect(Object.keys(INVESTIGATION_FACTORS.baseball_mlb)).toHaveLength(8);
  });

  it('keeps every token from the 12-factor layout (merge loses no data access)', () => {
    const union = new Set(Object.values(INVESTIGATION_FACTORS.baseball_mlb).flat());
    const twelveFactorTokens = [
      'MLB_STARTING_PITCHERS', 'MLB_PITCHER_SEASON_STATS', 'MLB_PITCH_TYPES_SP',
      'MLB_PITCHER_RECENT_FORM', 'MLB_PITCHER_SCOUTING',
      'MLB_BULLPEN', 'MLB_BULLPEN_WORKLOAD', 'MLB_CLOSER_RELIEVER_STATS',
      'MLB_KEY_HITTERS', 'MLB_LINEUP', 'MLB_RISP_SITUATIONAL', 'MLB_PLAYER_SPLITS', 'MLB_STATCAST',
      'MLB_BATTER_VS_PITCHER', 'MLB_PITCH_TYPES_HITTERS',
      'MLB_CATCHER_DEFENSE', 'MLB_TEAM_DEFENSE',
      'MLB_STANDINGS_STRUCTURED', 'MLB_RECENT_FORM_STRUCTURED', 'MLB_RECENT_RESULTS',
      'H2H_HISTORY', 'MLB_H2H',
      'MLB_PARK_FACTORS', 'MLB_WEATHER',
      'INJURIES', 'MLB_INJURIES',
      'MLB_ODDS', 'MLB_GAME_PREVIEW', 'MLB_TOP_PLAYERS', 'REST_SITUATION',
    ];
    for (const token of twelveFactorTokens) {
      expect(union.has(token), `token ${token} must survive the merge`).toBe(true);
    }
  });

  it('bullpen and injuries keep their own dedicated factor chats', () => {
    const keys = Object.keys(INVESTIGATION_FACTORS.baseball_mlb);
    expect(keys).toContain('BULLPEN');
    expect(keys).toContain('INJURIES');
  });
});

describe('#3 Gary trusts the briefing instead of being ordered to re-investigate', () => {
  it('the briefing contract no longer orders redundant investigation', () => {
    const loop = src('orchestrator/agentLoop.js');
    expect(loop).not.toContain('You MUST still investigate');
    expect(loop).toContain('IS your investigation');
  });
});

describe('#4 grounding budget: NHL 10 / stat-rich sports 4', () => {
  it('flashAdvisor carries the tiered cap', () => {
    const flash = src('orchestrator/flashAdvisor.js');
    expect(flash).toContain('isNHLSport ? 10 : 4');
    expect(flash).not.toContain('isNHLSport ? 10 : 8');
  });
});
