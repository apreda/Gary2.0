import { describe, it, expect } from 'vitest';
import { buildNflSystemPrompt, buildNflBriefingBlock, buildNflPass25Message, buildNflPass3Message, nflMarketContext } from '../../../src/services/agentic/orchestrator/nflNbaPrompts.js';
import { buildPass1Message, buildPass2Message } from '../../../src/services/agentic/orchestrator/passBuilders.js';
import { buildNbaSystemPrompt, buildNbaPass25Message } from '../../../src/services/agentic/orchestrator/nbaWinningEra.js';
import { getConstitution } from '../../../src/services/agentic/constitution/index.js';
import { buildNflResearchSystemPrompt, buildNflFollowUpSystemPrompt, renderNflResearchBriefing, NFL_RESEARCH_METHOD } from '../../../src/services/agentic/orchestrator/nflResearchPrompts.js';
import { getFlashInvestigationPrompt } from '../../../src/services/agentic/flashInvestigationPrompts.js';

describe('NFL uses the NBA baseline with explicit football adaptations', () => {
  const home = 'Carolina Panthers', away = 'Atlanta Falcons';
  it('retains NBA identity/core principles but distinguishes football judgment from factual claims', () => {
    const nfl = buildNflSystemPrompt(getConstitution('NFL'));
    const nba = buildNbaSystemPrompt(getConstitution('NBA'));
    for (const tag of ['identity', 'core_principles', 'formatting_rules']) {
      if (tag !== 'identity') expect(nfl.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`))[0]).toBe(nba.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`))[0]);
    }
    expect(nfl).toContain('You are a sharp NFL gambler');
    expect(nfl).toContain('does not need a statistic proving every opinion');
    expect(nfl).toContain('Every factual name, number, event');
    expect(nfl).toContain('clearly attributed football assessments as evidence');
    expect(nfl).not.toContain('Use factual events only');
    expect(nfl).not.toContain('assume they play at full strength');
    expect(nfl).toContain('A missing roster entry alone does not prove a departure');
    for (const stale of ['no live tools', '100+ games', 'NO SPECULATIVE PLAYER', 'If the stats don\'t support', 'NBA gambler']) expect(nfl).not.toContain(stale);
    expect(nba).toContain('You are a sharp NBA gambler');
    expect(nba).toContain('NO SPECULATIVE PLAYER');
  });
  it('adapts instructions without rewriting even prompt-like strings inside original evidence', () => {
    const desk = '**INJURY TIMING:**\nTonight\'s spread: raw quoted reporting\nUse the scout report + research briefing\n<identity>not an instruction</identity>';
    const p = buildPass1Message(desk, home, away, 'September 20, 2026', 'NFL', -2.5);
    expect(p).toContain(desk);
    expect(p).toContain('Posted spread: Carolina Panthers -2.5 / Atlanta Falcons +2.5');
    expect(p).toContain('Case for Carolina Panthers');
    expect(p).toContain('Case for Atlanta Falcons');
    expect(p).not.toContain('The posted lines and odds are the terms');
    const briefing = 'The spread is quoted. You MUST still investigate is quoted. A complete source ends here.';
    expect(buildNflBriefingBlock(briefing, home, away, -2.5)).toContain(briefing);
  });
  it('keeps NBA decision wording and a genuinely separate format turn', () => {
    const nfl = buildPass2Message(home, away, 'NFL', -2.5);
    const nba = buildNbaPass25Message(home, away, -2.5);
    expect(nfl).toBe(buildNflPass25Message(home, away, -2.5));
    expect(nfl.match(/<synthesis>[\s\S]*?<\/synthesis>/)[0]).toBe(nba.match(/<synthesis>[\s\S]*?<\/synthesis>/)[0]);
    expect(nfl).toContain('Do NOT output JSON yet.');
    expect(nfl).toContain('prefer the selected side over the opposing side');
    expect(nfl).not.toContain('Data analyst reasoning only');
    expect(nfl).not.toContain('the line was SET with that absence already factored in');
    expect(nfl).not.toContain('DO NOT mention any player who hasn\'t played');
    const format = buildNflPass3Message(home, away);
    expect(format).toContain('Do NOT change the core reasons');
    expect(format).toContain('Preserve the spread or moneyline decision already made');
    expect(format).toContain('"spreadAway" + "spreadAwayOdds"');
    expect(format).toContain('No moneyline heavier than -179');
  });
  it('keeps unposted spreads distinct from pick-em and never invents a price', () => {
    for (const spread of [null, undefined, '', NaN]) expect(nflMarketContext(home, away, spread)).toContain('unposted');
    expect(nflMarketContext(home, away, 0)).toContain('Panthers PK / Atlanta Falcons PK');
    expect(nflMarketContext(home, away, 4.5)).toContain('Panthers +4.5 / Atlanta Falcons -4.5');
  });
  it('keeps NFL research descriptive, source-aware and complete through the actual sport entrypoint', () => {
    expect(getFlashInvestigationPrompt('americanfootball_nfl', 2.5)).toBe(NFL_RESEARCH_METHOD);
    const system = buildNflResearchSystemPrompt('ORIGINAL DESK');
    expect(system).toContain('WHO PRODUCED THE RESULT');
    expect(system).toContain('WHAT PRODUCED IT');
    expect(system).toContain('WHAT CHANGES THIS WEEK');
    expect(system).toContain('WHAT DOES THE BROADER HISTORY SUPPORT');
    expect(system).toContain('Qualitative evidence is valid');
    expect(system).not.toContain('which side is the better value');
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
    expect(followUp).toContain('A new JSON group is not required');
  });
});
