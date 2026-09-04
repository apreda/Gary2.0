import { describe, expect, it } from 'vitest';
import { DECISION_EVIDENCE_QUESTIONS, renderEvidenceBriefing } from '../../../src/services/agentic/orchestrator/evidenceQuality.js';
import { buildPass2Message, buildPass3Unified } from '../../../src/services/agentic/orchestrator/passBuilders.js';

describe('evidence attribution reaching Gary', () => {
  it('keeps facts, interpretations, source dates and contradictions separate without certifying them', () => {
    const text = renderEvidenceBriefing([{
      factor: 'Starter', keyFinding: 'He may work deeper tonight.',
      numbers: '5 IP on Sep 1; 6 IP on Aug 26', context: '2 starts, 2026',
      sources: ['MLB_STARTER_LOG', 'https://example.com/report (2026-09-03)'],
      uncertainties: 'The press report says 4 IP; the dated game row says 5 IP.',
    }]);
    expect(text).toContain("Researcher's interpretation: He may work deeper tonight.");
    expect(text).toContain('Reported figures (check against cited evidence): 5 IP on Sep 1; 6 IP on Aug 26');
    expect(text).toContain('2 starts, 2026');
    expect(text).toContain('https://example.com/report (2026-09-03)');
    expect(text).toContain('The press report says 4 IP; the dated game row says 5 IP.');
  });

  it('does not manufacture attribution and removes only exactly repeated research', () => {
    const factor = { factor: 'A', keyFinding: 'Same account', numbers: '5 IP', context: 'One game' };
    const text = renderEvidenceBriefing([factor, { ...factor, factor: 'B' }, { ...factor, factor: 'C', numbers: '6 IP' }]);
    expect(text).toContain('Not supplied; attribution unverified');
    expect(text).toContain('**B**\nRepeats the same research as A');
    expect(text).toContain('**C**\nResearcher');
    expect(text).toContain('6 IP');
  });

  it.each(['MLB', 'NFL', 'NCAAF'])('adds evidence questions to %s without prescribing confidence', sport => {
    const pass2 = buildPass2Message('Home', 'Away', sport, -3.5);
    expect(pass2).toContain(DECISION_EVIDENCE_QUESTIONS);
    expect(pass2).toContain('"confidence_score": 0.XX');
    expect(pass2).toContain('How confident are you in this pick?');
    expect(buildPass3Unified('Home', 'Away', { sport })).not.toContain(DECISION_EVIDENCE_QUESTIONS);
  });
});
