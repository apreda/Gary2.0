// A projected starter on tonight's injury report reads his status beside his name in the five (Nov 10 2026 data round
// 4: Tyler Herro, Questionable, read as a plain starter four lines above "Tyler Herro (G) (Questionable)"; the report's "Nic Claxton" is the five's "Nicolas Claxton").
import { describe, expect, it } from 'vitest';
import { projectedStarters } from '../../../src/services/gary/agentic/orchestrator/nbaRead.js';

const RULE = '━'.repeat(40);
const desk = `STARTING LINEUPS (BALLDONTLIE PROJECTED LINEUPS)\n${RULE}\n`
  + '[AWAY] Milwaukee Bucks: Brayden Burries (PG), Tyler Herro (SG), Jaime Jaquez Jr. (SF), Kyle Kuzma (PF), Myles Turner (C)\n'
  + '[HOME] New York Knicks: Jalen Brunson (PG), Mikal Bridges (SG), Josh Hart (SF), OG Anunoby (PF), Nicolas Claxton (C)\n'
  + `${RULE}\nINJURY REPORT\n${RULE}\n`
  + '  • Tyler Herro (G) (Questionable) - Injury/Illness - Right Contusion\n'
  + '  • Myles Turner (C) (Prob) - Injury/Illness - Left Ankle Sprain\n'
  + '  • Josh Hart (G) (Doubtful) - Injury/Illness - Illness\n'
  + '  • Nic Claxton (Questionable) - Injury/Illness - Left Hamstring Strain\n'
  + `${RULE}\n`;

describe('projectedStarters', () => {
  it("names each listed starter's report status and leaves the rest as they were", () => {
    const text = projectedStarters(desk);
    expect(text).toContain('Brayden Burries (PG), Tyler Herro (SG; Questionable on the injury report), Jaime Jaquez Jr. (SF), Kyle Kuzma (PF), Myles Turner (C; Probable on the injury report)');
    expect(text).toContain('Josh Hart (SF; Doubtful on the injury report), OG Anunoby (PF), Nicolas Claxton (C; Questionable on the injury report)');
  });
});
