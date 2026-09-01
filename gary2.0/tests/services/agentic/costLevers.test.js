// The researcher is dead (founder kill, Aug 27 2026; corpse excised Sep 1).
// What survives of the Jul 8 cost-lever suite is the pin that keeps it dead:
// the agent loop must never rebuild or inject a research briefing.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agenticRoot = path.join(__dirname, '../../../src/services/agentic');
const src = (rel) => readFileSync(path.join(agenticRoot, rel), 'utf8');

describe('the briefing is gone (researcher killed for all sports, Aug 27; files deleted Sep 1)', () => {
  it('the agent loop neither builds nor injects a research briefing', () => {
    const loop = src('orchestrator/agentLoop.js');
    expect(loop).not.toContain('RESEARCH BRIEFING (from your research assistant');
    expect(loop).not.toContain('Investigate further with your own fetch_stats calls');
    expect(loop).toContain('const _researchBriefing = null;');
  });

  it('the researcher modules stay deleted', () => {
    const gone = [
      'orchestrator/researchBriefing.js',
      'orchestrator/investigationFactors.js',
      'flashInvestigationPrompts.js',
    ];
    for (const rel of gone) {
      expect(() => src(rel), `${rel} must not come back`).toThrow();
    }
  });
});
