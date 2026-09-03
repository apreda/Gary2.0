// THE NBA WINNING ERA (founder, Sep 3 2026: "go back to the version that
// won, not the playoff version, and we won't touch it again"). The NBA lane
// reads the Apr 8 2026 tree (commit 57e5ddd4, the last regular-season
// commit of the 152-106 run) word for word. The fixtures under
// tests/fixtures/nba-april/ are April's prompts rendered from that tree;
// the only differences allowed are the tool sentences of a brain that no
// longer carries tools, listed here one by one. Anything else that drifts
// fails this file.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildPass1Message } from '../../../src/services/agentic/orchestrator/passBuilders.js';
import { buildNbaPass25Message, buildNbaPass3Message, buildNbaSystemPrompt, buildNbaBriefingBlock, NBA_RESEARCHER_RULES } from '../../../src/services/agentic/orchestrator/nbaWinningEra.js';
import { getConstitution } from '../../../src/services/agentic/constitution/index.js';
import { NBA_CONSTITUTION } from '../../../src/services/agentic/constitution/nbaConstitution.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(path.join(__dirname, '../../fixtures/nba-april', name), 'utf8').replace(/^\n+/, '').replace(/\n+$/, '');
const src = (rel) => readFileSync(path.join(__dirname, '../../../src/services/agentic', rel), 'utf8');
const trim = (s) => String(s).replace(/\n+$/, '');

const home = 'Boston Celtics', away = 'Miami Heat', spread = -6.5, today = 'Thursday, April 9, 2026';

/** April's text with the documented tool-sentence adaptations applied. */
const adapt = (text, pairs) => pairs.reduce((s, [from, to]) => {
  expect(s, `April fixture must contain: ${from.slice(0, 50)}`).toContain(from);
  return s.replace(from, to);
}, text);

describe('NBA reads the Apr 8 2026 prompts (the winning era)', () => {
  it('Pass 1 is April verbatim except the fetch_stats sentence', () => {
    const expected = adapt(fixture('pass1.txt'), [
      ['Use the scout report + research briefing as your starting point, then investigate with fetch_stats where you need deeper evidence.',
       'Use the scout report + research briefing as your starting point — they are your evidence.'],
    ]);
    const rendered = trim(buildPass1Message('[DESK]', home, away, today, 'basketball_nba', spread, { game: {} }));
    expect(rendered).toBe(expected);
  });

  it('Pass 2.5 is April verbatim except the two tool references', () => {
    const expected = adapt(fixture('pass25.txt'), [
      ['Only call more tools if a critical factual gap blocks your decision.', 'The desk you have already read is your complete evidence.'],
      ['every number from scout report, tools, or grounding.', 'every number from the scout report or other provided data.'],
    ]);
    const rendered = trim(buildNbaPass25Message(home, away, spread, ''));
    // The season label is computed (April hard-coded 2025-2026); compare on April's season.
    expect(rendered.replace(/this \d{4}-\d{4} season/, 'this 2025-2026 season')).toBe(expected);
    expect(rendered).toContain('Do NOT output JSON yet.');
    expect(rendered).toContain("Gary's Take");
    expect(rendered).not.toContain("What's your bet, and what are the reasons why?");
    expect(rendered).not.toContain('HOUSE LIMIT');
  });

  it('Pass 3 is April verbatim', () => {
    const rendered = trim(buildNbaPass3Message(home, away, { sport: 'basketball_nba', homeRecord: '52-25', awayRecord: '40-37' }));
    expect(rendered).toBe(fixture('pass3.txt'));
  });

  it('the system prompt is April verbatim except the tool lines in the base rules and the identity', () => {
    const expected = adapt(fixture('system.txt'), [
      [`1. STATISTICS - Use fetch_stats() tool ONLY (BDL API)
   - ALL hard stats (scoring, efficiency, rates, ratings, splits) must come from fetch_stats()
   - Do NOT search for stats - they are available via the tool
   - BDL data is structured, reliable, and cost-effective`,
       `1. THE DESK IS THE EVIDENCE - This conversation carries no live tools
   - Every stat, name, and number you use comes from the scout report and the materials provided in this conversation
   - There is no stat-fetch tool and no live search here - never reference calling one, and never wait for more data to arrive`],
      [`2. LIVE CONTEXT - Use search for real-time info ONLY
   - Injuries: "Is [player] playing today?"
   - Weather: "Current conditions at [stadium]"
   - Roster verification: "Is [player] on [team] roster?"
   - Breaking news: "Any [team] news today?"`,
       `2. LIVE CONTEXT - Search results the desk carries (breaking news, storylines, weather) were retrieved for you before this conversation started
   - Treat them as provided data, same as any desk section`],
      ['- Use ONLY the provided Scout Report and BDL API data for current rosters', '- Use ONLY the provided Scout Report for current rosters'],
      ['only cite H2H if it exists in scout report or fetched data for this game', 'only cite H2H if it exists in the scout report or other provided data for this game'],
      ['USE ONLY: Scout Report (rosters, injuries, standings), BDL API stats, and Google Search Grounding.', 'USE ONLY: the Scout Report (rosters, injuries, standings) and the materials provided in this conversation.'],
    ]);
    const rendered = trim(buildNbaSystemPrompt(getConstitution('basketball_nba')));
    expect(rendered).toBe(expected);
    expect(rendered).toContain('You are a sharp NBA gambler');
    expect(rendered).toContain('Risk-taking is in your DNA as a gambler.');
    expect(rendered).toContain('<core_principles>');
    expect(rendered).toContain('<formatting_rules>');
    expect(rendered).toContain('[CRITICAL] NO SPECULATIVE PLAYER IMPACT PREDICTIONS');
  });

  it('the constitution is the April one: THE SPREAD stands, the playoff bullets never arrived', () => {
    const c = NBA_CONSTITUTION.pass1Context;
    expect(c).toContain('### THE SPREAD');
    expect(c).toContain('NBA spreads move quickly once injury news breaks');
    expect(c).toContain('Back-to-backs, travel burden, and schedule density are widely known and often priced quickly');
    expect(c).toContain('**SEASON-LONG** — Extended absence (20+ games). Fully baked into every number you see.');
    expect(c).not.toContain('Each game is its own event');
    expect(c).not.toContain('Playoff adjustments happen fast');
    expect(c).not.toContain('Playoff stats are a separate sample');
    expect(c).not.toContain('A stat is a description of what happened');
  });

  it("the research assistant's NBA checklist has no playoff-series section, and reads April's rule lines", () => {
    const prompts = src('flashInvestigationPrompts.js');
    const nbaBlock = prompts.slice(prompts.indexOf('const NBA_FACTORS = '), prompts.indexOf('// MLB INVESTIGATION FACTORS') > 0 ? prompts.indexOf('// MLB INVESTIGATION FACTORS') : undefined);
    expect(nbaBlock).not.toContain('tournamentContext indicates "NBA Playoffs"');
    const rb = src('orchestrator/researchBriefing.js');
    expect(rb).toContain('${isNBASport ? NBA_RESEARCHER_RULES.reporting :');
    expect(rb).toContain('${isNBASport ? NBA_RESEARCHER_RULES.figures :');
    expect(NBA_RESEARCHER_RULES.reporting).toBe('- Report findings for each factor separately — Gary will connect the dots across factors himself');
    expect(NBA_RESEARCHER_RULES.figures).toBe('');
  });

  it('the briefing hand-off is April-shaped: spread line, the two cases, INVESTIGATION COMPLETE, no ask channel', () => {
    const block = buildNbaBriefingBlock('[BRIEFING]', home, away, spread, '\n\n[CASES]');
    expect(block).toBe(`\n\n## RESEARCH BRIEFING (from your research assistant)\n\nYour research assistant investigated every factor with full tool access. These are structured, verified findings — use them as your foundation.\n\n[BRIEFING]\n\n---\n\nThe spread is Boston Celtics -6.5 / Miami Heat +6.5.\n\nYou MUST still investigate this matchup yourself. The briefing gives you a head start — now verify its key claims against the scout report and complete your synthesis.\n\n[CASES]\n\nWhen your investigation and synthesis are complete, output exactly:\nINVESTIGATION COMPLETE`);
    expect(block).not.toContain('ASK RESEARCHER');
  });

  it('the agent loop routes NBA to the April turns and the researcher, and keeps the stat-audit retry off it', () => {
    const loop = src('orchestrator/agentLoop.js');
    expect(loop).toContain("((sport === 'baseball_mlb' || sport === 'MLB') || isNBASport)");
    expect(loop).toContain('if (researcherOn && isNBASport) {');
    expect(loop).toContain('buildNbaBriefingBlock(_researchBriefing, homeTeam, awayTeam, options.spread ?? null, caseReminder)');
    expect(loop).toContain('? buildNbaPass25Message(homeTeam, awayTeam, options.spread ?? 0, options.pass25DecisionGuards || \'\')');
    expect(loop.match(/isNBASport \? buildNbaPass3Message\(homeTeam, awayTeam, options\) : buildPass3Unified\(homeTeam, awayTeam, options\)/g)?.length).toBe(2);
    expect(loop.match(/!_statAuditRetried && !isNBASport && iteration < effectiveMaxIterations/g)?.length).toBe(2);
    const main = src('orchestrator/orchestratorMain.js');
    expect(main).toContain('isNbaSport(sport) ? buildNbaSystemPrompt(constitution) : buildSystemPrompt(constitution, sport)');
  });
});
