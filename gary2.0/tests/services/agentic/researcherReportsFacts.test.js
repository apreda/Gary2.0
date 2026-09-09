import { describe, it, expect } from 'vitest';
import { getFlashInvestigationPrompt } from '../../../src/services/agentic/flashInvestigationPrompts.js';
import { INVESTIGATION_FACTORS } from '../../../src/services/agentic/orchestrator/investigationFactors.js';
import { renderEvidenceBriefing } from '../../../src/services/agentic/orchestrator/evidenceQuality.js';
import { renderBucketsDesk, TEAM_SUBSECTIONS } from '../../../src/services/agentic/scoutReport/sports/mlbDeskLayout.js';

// Founder GO, Sep 9 2026: the desk led with season lines and the briefing
// graded the clubs, so the read argued "who is better" instead of tonight.
// Tonight's matchup leads everywhere; the researcher reports facts, not a
// weighted summary; the season-grading prompts are gone.
describe('the MLB researcher reads tonight first and reports facts', () => {
  const prompt = getFlashInvestigationPrompt('baseball_mlb');
  const headings = [...prompt.matchAll(/^### (\d+)\. (.+)$/gm)].map((m) => m[2]);

  it('opens on the pitching matchup and closes on the standings', () => {
    expect(headings[0]).toBe('STARTING PITCHER MATCHUP');
    expect(headings[1]).toBe('PITCHER RECENT FORM');
    expect(headings[headings.length - 1]).toBe('STANDINGS & DIVISION CONTEXT');
    expect(headings).toHaveLength(15);
    expect(headings.indexOf('INJURIES & ROSTER UPDATES')).toBeLessThan(headings.indexOf('THE SITUATION — STREAKS, SPOTS & THE SCHEDULE'));
    // Renumbered in place, no gaps.
    expect([...prompt.matchAll(/^### (\d+)\. /gm)].map((m) => Number(m[1]))).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it('no longer asks the researcher to grade a club\'s season-long level or weigh the findings', () => {
    for (const gone of ['Pythagorean', 'true level', 'Regression awareness', 'carry the most weight', 'weighted read', 'weight it honestly',
      'SUSTAINABILITY & TREND DETECTION', 'record vs winning teams', 'home and road records', 'The situation leads']) {
      expect(prompt, `still carries: ${gone}`).not.toContain(gone);
    }
    expect(prompt).toContain('the facts, their exact figures, and the sample each comes from. Gary weighs them.');
    // The factual protocol stays.
    expect(prompt).toContain('THE SYMMETRY RULE');
    expect(prompt).toContain('CONNECTING THE DOTS');
  });

  it('runs the factor plan matchup first, situation and series last, standings the last token of the situation', () => {
    const keys = Object.keys(INVESTIGATION_FACTORS.baseball_mlb);
    expect(keys[0]).toBe('PITCHING_MATCHUP');
    expect(keys.slice(-2)).toEqual(['THE_SITUATION', 'H2H']);
    const situation = INVESTIGATION_FACTORS.baseball_mlb.THE_SITUATION;
    expect(situation[situation.length - 1]).toBe('MLB_STANDINGS_STRUCTURED');
  });

  it('a factor reported as findings renders as facts; a keyFinding still renders as June\'s summary', () => {
    const facts = renderEvidenceBriefing([{ factor: 'BULLPEN', findings: 'Closer Man threw 24 pitches last night.', numbers: '24 pitches', context: 'Sep 8 game' }]);
    expect(facts).toContain('Closer Man threw 24 pitches last night.');
    const june = renderEvidenceBriefing([{ factor: 'BULLPEN', keyFinding: 'Pen is fresh.', numbers: '0 pitches', context: 'Sep 8 game' }]);
    expect(june).toContain('Pen is fresh.');
  });
});

describe('the MLB desk reads tonight first', () => {
  it('prints THE MATCHUP, then THE MARKET, then THE TEAMS, with each club\'s standing closing its block', () => {
    const team = (name) => ({ name, stand: `${name}: division rank 1`, lineup: `${name}: lineup`, starter: `${name}: starter`, pen: `${name}: pen`, penWorkload: `${name}: workload`, injuries: `${name}: none`, recentForm: `${name}: 5-2`, rosterMoves: `${name}: none` });
    const text = renderBucketsDesk({ header: 'MATCHUP: A @ B', home: team('B'), away: team('A'), matchup: { seriesState: 'Game 1', park: 'Park', rest: 'rested', scheduleShape: 'homestand' }, market: { odds: 'Moneyline: B -120' } });
    const at = (s) => { const i = text.indexOf(s); expect(i, `missing ${s}`).toBeGreaterThan(-1); return i; };
    expect(at('THE MATCHUP')).toBeLessThan(at('THE MARKET'));
    expect(at('THE MARKET')).toBeLessThan(at('THE TEAMS'));
    expect(TEAM_SUBSECTIONS[TEAM_SUBSECTIONS.length - 1]).toBe('Where they stand');
    const home = text.slice(at('═══ B ═══'), at('═══ A ═══'));
    expect(home.indexOf('── Roster moves ──')).toBeLessThan(home.indexOf('── Where they stand ──'));
  });
});
