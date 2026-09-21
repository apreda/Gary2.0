import { describe, it, expect } from 'vitest';
import { buildNflSystemPrompt, buildNflBriefingBlock, buildNflDecisionMessage, buildNflWebContext, nflMarketContext } from '../../../src/services/agentic/orchestrator/nflPrompts.js';
import { buildPass1Message, buildPass2Message } from '../../../src/services/agentic/orchestrator/passBuilders.js';
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
    expect(system).toContain('An opinion does not require a statistic proving it');
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
    expect(question.endsWith("What's the best bet at the posted number and price, and why?")).toBe(true);
    expect(question.match(/\?/g)).toHaveLength(1);
    expect(question).toContain('stored as written');
    for (const removed of ["Gary's Take", 'paragraph', '250-400', 'announcer', 'copyedit', 'draft', 'opposing side', 'Do NOT restart']) expect(question).not.toContain(removed);
  });
  it('uses declarative football awareness, without question headings or case assignments', () => {
    const c = getConstitution('NFL');
    expect(c.pass1Context).toContain('Early-season records and statistics cover a small number of games');
    expect(c.pass1Context).toContain('Reports of planned adjustments describe intentions, not outcomes');
    expect(c.pass1Context).toContain('Divisional opponents meet regularly');
    expect(c.pass1Context).not.toMatch(/WHO PRODUCED|WHAT PRODUCED|WHAT CHANGES|Investigate|Consider both|\?/);
    expect(c.bilateralCasePrompt).toBeNull();
    expect(c.pass25DecisionGuards).toBe('');
    expect(c.pass1Context).toContain('**FRESH** — New absence window');
    expect(c.pass1Context).toContain('Use the exact tag shown in the scout report for this game.');
  });
  it('keeps unposted spreads distinct from pick-em and retains side-specific price constraints', () => {
    for (const spread of [null, undefined, '', NaN]) expect(nflMarketContext(home, away, spread)).toContain('unposted');
    expect(nflMarketContext(home, away, 0)).toContain('Panthers PK / Atlanta Falcons PK');
    expect(nflMarketContext(home, away, 4.5)).toContain('Panthers +4.5 / Atlanta Falcons -4.5');
    expect(nflMarketContext(home, away, -4.5)).toContain('"spreadAway" + "spreadAwayOdds"');
    expect(nflMarketContext(home, away, -4.5)).toContain('No moneyline heavier than -179');
  });
  it('provides web timing and capability without prescribing a reading process', () => {
    const web = buildNflWebContext('September 21, 2026', '8:15 PM');
    expect(web).toContain('September 21, 2026');
    expect(web).toContain('8:15 PM');
    expect(web).not.toMatch(/weigh|find it|Name the date|fan would/);
    expect(buildNflWebContext('today', null)).not.toContain('kicks off');
  });
  it('leaves the factual researcher and its complete evidence delivery intact', () => {
    expect(getFlashInvestigationPrompt('americanfootball_nfl', 2.5)).toBe(NFL_RESEARCH_METHOD);
    const system = buildNflResearchSystemPrompt('ORIGINAL DESK');
    for (const heading of ['WHO PRODUCED THE RESULT', 'WHAT PRODUCED IT', 'WHAT CHANGES THIS WEEK', 'WHAT DOES THE BROADER HISTORY SUPPORT']) expect(system).toContain(heading);
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
