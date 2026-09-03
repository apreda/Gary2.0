// THE RESEARCHER RETURNS FOR MLB (founder GO, Sep 3 2026). The record that
// brought it back: June's engine with its research assistant went 188-136
// (+26u); the Jul 26 lane deletion turned it negative; the Aug 18
// restoration went 47-37 in its one week; the Aug 27 kill turned it
// negative again. These pins keep the Aug 18 shape: the Haiku briefing is
// built before Pass 1 and rides the Pass 1 message, Gary can hand it up to
// six questions, the gate is MLB-only (football stays desk-only pending its
// review), and one env switch turns it off everywhere.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agenticRoot = path.join(__dirname, '../../../src/services/agentic');
const src = (rel) => readFileSync(path.join(agenticRoot, rel), 'utf8');

describe('the researcher is back for MLB (Sep 3 2026, the Aug 18 version)', () => {
  it('the agent loop builds the briefing before Pass 1 and injects it into the Pass 1 message', () => {
    const loop = src('orchestrator/agentLoop.js');
    expect(loop).toContain('buildResearchBriefing(options.scoutReport, sport, homeTeam, awayTeam');
    expect(loop).toContain('RESEARCH BRIEFING (from your research assistant');
    expect(loop).toContain('messages[1] = { role: \'user\', content: userMessage };');
    expect(loop).not.toContain('const _researchBriefing = null;');
  });

  it('is gated to MLB with one env switch, and hard-fails a game without its briefing', () => {
    const loop = src('orchestrator/agentLoop.js');
    expect(loop).toContain("(sport === 'baseball_mlb' || sport === 'MLB')");
    expect(loop).toContain("process.env.GARY_RESEARCHER || 'on'");
    expect(loop).toContain('[HARD FAIL] Research assistant failed');
  });

  it('Gary can ask the researcher up to six questions mid-investigation', () => {
    const loop = src('orchestrator/agentLoop.js');
    expect(loop).toContain('const RESEARCHER_QUESTION_BUDGET = 6;');
    expect(loop).toContain('ASK RESEARCHER:');
    expect(loop).toContain('extractResearcherQuestions(message.content');
    expect(loop).toContain('## RESEARCHER ANSWERS');
  });

  it('the researcher modules are back and on the era hash', () => {
    for (const rel of ['orchestrator/researchBriefing.js', 'orchestrator/investigationFactors.js', 'flashInvestigationPrompts.js', 'orchestrator/footballResearchPolicy.js']) {
      expect(() => src(rel), `${rel} must exist`).not.toThrow();
    }
    const sha = src('orchestrator/junePromptSha.js');
    expect(sha).toContain("'./researchBriefing.js'");
    expect(sha).toContain("'../flashInvestigationPrompts.js'");
    expect(sha).toContain("'./investigationFactors.js'");
    expect(sha).toContain('MLB_RESEARCHER=ON');
  });
});
