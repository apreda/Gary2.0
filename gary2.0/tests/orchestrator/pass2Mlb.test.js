import { describe, it, expect } from 'vitest';
import { buildPass2Message } from '../../src/services/agentic/orchestrator/passBuilders.js';

// THE DECISION TURN, MLB (founder GO, Sep 2 2026): the question and the
// output contract, nothing else. NFL has its own single-answer contract.
describe('Pass 2 for MLB', () => {
  const mlb = buildPass2Message('Red Sox', 'Mariners', 'baseball_mlb', -1.5, '', { moneyline_home: -138, moneyline_away: 118, spread_home: -1.5, spread_home_odds: 150 });
  it('opens with the bare ask and carries the output contract', () => {
    expect(mlb.trim().startsWith('<synthesis>')).toBe(true);
    expect(mlb).toContain("What's your bet, and what are the reasons why?");
    expect(mlb).toContain('"final_pick"');
    expect(mlb).not.toContain('ESTABLISHED INJURY RULE');
    expect(mlb).toContain('NO FABRICATION — STAT PROVENANCE');
    expect(mlb).toContain('Do NOT predict your own margin or final score.');
  });
  it('carries none of the retired sentences', () => {
    for (const gone of ['FINAL DECISION CHECKPOINT', 'Do NOT restart analysis', 'like a broadcast', 'the scene, not the case', 'Judgment calls informed by data are valid', 'Records describe what happened', 'BET TYPE', 'HOUSE LIMIT', 'whichever ticket your read', 'Which side of the 1.5', 'PACE_HOME_AWAY', 'offensive_rating']) {
      expect(mlb, gone).not.toContain(gone);
    }
    expect(mlb).toContain('MLB_BULLPEN_WORKLOAD data shows');
  });
  it('numbers the MLB constraints 1 to 4 with no gap', () => {
    expect(mlb).toMatch(/1\. PLAYER NAMES[\s\S]*2\. Do NOT predict[\s\S]*3\. NO FABRICATION[\s\S]*4\. NO EMOJIS/);
    expect(mlb).not.toContain('5. NO EMOJIS');
  });
  it('NFL asks for the bet and reasons without an editorial checkpoint', () => {
    const nfl = buildPass2Message('Rams', '49ers', 'americanfootball_nfl', -3.5, '', { moneyline_home: -180, moneyline_away: 155, spread_home_odds: -110, spread_away_odds: -110 });
    expect(nfl).toContain("What's the best bet at the posted number and price, and why?");
    expect(nfl).toContain('"final_pick"');
    expect(nfl).toContain('"rationale"');
    for (const retired of ['FINAL DECISION CHECKPOINT', 'Records describe what happened', 'announcer-style scene-setter', 'Do NOT output JSON yet.', "Gary's Take"]) {
      expect(nfl).not.toContain(retired);
    }
  });
});
