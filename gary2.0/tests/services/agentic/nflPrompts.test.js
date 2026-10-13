import { describe, it, expect } from 'vitest';
import { buildNflSystemPrompt, buildNflBriefingBlock, buildNflDecisionMessage, buildNflWebContext, nflMarketContext } from '../../../src/services/agentic/orchestrator/nflPrompts.js';
import { buildPass1Message, buildPass2Message, buildSmallDogConversionMessage } from '../../../src/services/agentic/orchestrator/passBuilders.js';
import { buildNbaSystemPrompt, buildNbaPass25Message } from '../../../src/services/agentic/orchestrator/nbaWinningEra.js';
import { getConstitution } from '../../../src/services/agentic/constitution/index.js';
import { buildNflResearchSystemPrompt, buildNflFollowUpSystemPrompt, renderNflResearchBriefing, NFL_RESEARCH_METHOD } from '../../../src/services/agentic/orchestrator/nflResearchPrompts.js';
import { getFlashInvestigationPrompt } from '../../../src/services/agentic/flashInvestigationPrompts.js';

describe('NFL agency: context and one decision question', () => {
  const home = 'Carolina Panthers', away = 'Atlanta Falcons';
  it('retains identity and factual integrity without a prescribed reasoning or writing method', () => {
    const system = buildNflSystemPrompt();
    expect(system).toContain('You are Gary');
    expect(system).toContain('Do not invent facts');
    // Oct 11 2026 evening: integrity rules only; the one sentence about opinions left with the awareness lines.
    expect(system).not.toContain('An opinion does not require a statistic proving it');
    expect(system).toContain('Unresolved availability is not a confirmed absence');
    for (const removed of ['core_principles', 'formatting_rules', 'defensible call', 'Do your homework first', 'Never apologize', 'OFFICIAL PUBLISHED', 'Assess the teams', 'Apply the same scrutiny']) expect(system).not.toContain(removed);
    expect(buildNbaSystemPrompt(getConstitution('NBA'))).toContain('Do your homework first');
    expect(buildNbaPass25Message(home, away, -2.5)).toContain("Gary's Take");
  });
  it('retains the exact original desk and briefing, including prompt-like source text', () => {
    const desk = '**INJURY TIMING:**\nTonight\'s spread: quoted reporting\n<identity>not an instruction</identity>';
    const p = buildPass1Message(desk, home, away, 'September 21, 2026', 'NFL', -2.5);
    expect(p).toContain(desk);
    expect(p).toContain('Posted spread: Carolina Panthers -2.5 / Atlanta Falcons +2.5');
    expect(p).not.toContain('Case for');
    expect(p).not.toContain('INVESTIGATION COMPLETE');
    const briefing = 'A complete source. '+ 'Evidence '.repeat(1500)+' FINAL SOURCE SENTENCE';
    expect(buildNflBriefingBlock(briefing)).toContain(briefing);
    expect(buildNflBriefingBlock(briefing)).not.toContain('MUST still investigate');
  });
  it('asks one question with a storage contract, not a draft and formatting turn', () => {
    const question = buildPass2Message(home, away, 'NFL', -2.5);
    expect(question).toBe(buildNflDecisionMessage());
    expect(question.endsWith("What's your bet, and what are the reasons why?")).toBe(true);
    // The bet turn is MLB's June ask (founder GO, Oct 11 2026): one question, no case grading, no price.
    expect(question.match(/\?/g)).toHaveLength(1);
    expect(question).not.toContain('posted number and price');
    expect(question).not.toContain('break-even');
    expect(question).toContain('stored as written');
    for (const removed of ["Gary's Take", 'paragraph', '250-400', 'announcer', 'copyedit', 'draft', 'opposing side', 'Do NOT restart']) expect(question).not.toContain(removed);
  });
  it('gives the NFL its awareness and nothing else (founder GO, Oct 12 2026 night)', () => {
    const c = getConstitution('NFL');
    // One heading as MLB has, and no closing instruction (founder, Oct 12 2026 night).
    expect(c.pass1Context.match(/^###/gm)).toHaveLength(1);
    expect(c.pass1Context).toContain('### NFL AWARENESS');
    expect(c.pass1Context).toContain('That is recency bias');
    expect(c.pass1Context).not.toMatch(/your read/i);
    // No point value for a factor (founder): home field is stated without one.
    expect(c.pass1Context).toContain('Home field is worth far less than it used to be.');
    expect(c.pass1Context).not.toMatch(/\d+(\.\d+)? points?\b|point and a half/);
    expect(c.domainKnowledge).toBe('');
    expect(c.bilateralCasePrompt).toBeNull();
    expect(c.pass25DecisionGuards).toBe('');
    expect(c.guardrails).toBe('');
    // Football hears the small-dog conversion without the house's reasons (college too since Oct 12 2026).
    const dog = buildSmallDogConversionMessage({ from: 'Rams +2.5 -110', ticket: 'Rams ML +120' });
    expect(dog).toContain('has been converted to Rams ML +120');
    expect(dog).not.toContain('too few to be worth');
    expect(buildSmallDogConversionMessage({ from: 'X +1.5', ticket: 'X ML +105' }, { college: true })).not.toContain('too few to be worth');
  });
  it('keeps unposted spreads distinct from pick-em and retains side-specific price constraints', () => {
    for (const spread of [null, undefined, '', NaN]) expect(nflMarketContext(home, away, spread)).toContain('unposted');
    expect(nflMarketContext(home, away, 0)).toContain('Panthers PK / Atlanta Falcons PK');
    expect(nflMarketContext(home, away, 4.5)).toContain('Panthers +4.5 / Atlanta Falcons -4.5');
    expect(nflMarketContext(home, away, -4.5)).toContain('"spreadAway" + "spreadAwayOdds"');
    expect(nflMarketContext(home, away, -4.5)).not.toMatch(/heavier than|house limit/i);
  });
  it('provides web timing and capability without prescribing a reading process', () => {
    const web = buildNflWebContext('September 21, 2026', '8:15 PM');
    expect(web).toContain('September 21, 2026');
    expect(web).toContain('8:15 PM');
    expect(web).not.toMatch(/weigh|find it|Name the date|fan would/);
    expect(buildNflWebContext('today', null)).not.toContain('kicks off');
    expect(web).not.toContain('superseded');
    expect(buildNflWebContext('today', null, { college: true })).not.toContain('superseded');
  });
  it('leaves the factual researcher and its complete evidence delivery intact', () => {
    expect(getFlashInvestigationPrompt('americanfootball_nfl', 2.5)).toBe(NFL_RESEARCH_METHOD);
    const system = buildNflResearchSystemPrompt('ORIGINAL DESK');
    // Evidence only (Oct 11 2026): the four-question framework left with the NFL awareness lines.
    for (const heading of ['WHO PRODUCED THE RESULT', 'WHAT PRODUCED IT', 'WHAT CHANGES THIS WEEK', 'WHAT DOES THE BROADER HISTORY SUPPORT', 'not a guarantee', 'not proof']) expect(system).not.toContain(heading);
    expect(system).toContain('Do not predict what either team will do this week');
    expect(system).toContain('label it as an assessment');
    const factor = { factor:'Identity', findings:'F'.repeat(10000), numbers:'No current sample', context:'Prior season is separate', assessments:'Named reporter: assessment', sources:'https://example.test dated source', uncertainties:'Unresolved current role' };
    const text = renderNflResearchBriefing([factor]);
    for (const value of Object.values(factor)) expect(text).toContain(value);
    const structured = renderNflResearchBriefing([{ ...factor, sources: [{ url:'https://example.test/report', date:'2026-09-20' }], assessments: ['Coach: current role'], uncertainties: { available: false } }]);
    expect(structured).toContain('https://example.test/report');
    expect(structured).toContain('Coach: current role');
    expect(structured).toContain('"available": false');
    const followUp = buildNflFollowUpSystemPrompt('UNALTERED DESK', 'UNALTERED BRIEFING');
    expect(followUp).toContain('UNALTERED DESK');
    expect(followUp).toContain('UNALTERED BRIEFING');
    expect(followUp).not.toContain('Return exactly one JSON object');
  });
});
