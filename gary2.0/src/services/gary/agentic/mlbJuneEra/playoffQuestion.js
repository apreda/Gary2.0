// THE PLAYOFF QUESTION (founder GO, Oct 13 2026): an MLB postseason game pick is Gary given the facts and asked one
// plain question: "Who wins tonight's game, and why?" Adam: "I want this ... to be Gary for the playoffs", after
// Gary kept handicapping playoff games like July matchups while the same model, given the same desk and asked
// that question, read the game in its series. The facts are the playoff desk and the research assistant's playoff
// briefing; there are no tools, no checklist and no passes, so what matters tonight is his to sort out. He answers
// first in conversation (nobody reads it), then writes that answer as the card's Gary's Take. Regular-season games
// never come here; the June loop stays as it was.
import { BULLPEN_INTERPRETATION } from '../../../sports/mlb/bullpen/evidence.js';
import { GEMINI_PRO_MODEL, RESEARCH_BRIEFING_TIMEOUT_MS } from './orchestratorConfig.js';
import { createGeminiSession, sendToSessionWithRetry } from './sessionManager.js';
import { buildFlashResearchBriefing } from './flashAdvisor.js';
import { createCostTracker } from '../orchestrator/costTracker.js';
import { parseGaryResponse } from './responseParser.js';
import { auditPickRationale, buildStatAuditRetryMessage } from './statAudit.js';

// The tool-use rules in the June base rules name fetch_stats and live search; this step has neither.
const TOOL_RULES = /\n1\. STATISTICS - Use fetch_stats\(\) tool ONLY[\s\S]*?previews, beat coverage, columns\n/;
// Founder GO, Oct 13 2026: in a playoff game Gary's judgment is not a stat. Every rule against inventing numbers,
// players and scores stays; the sentence that counted judgment ("fully rested", "heavy load") as a stat is replaced,
// and the price-bettor framing ("a sharp MLB gambler", "a specific edge can tell another") leaves his identity.
const PLAYOFF_RULE_EDITS = [
  ['You are a sharp MLB gambler — an expert at betting this sport, not just understanding it.', ''],
  [' Your 30 years taught you that the sum of the data tells one story, and a specific edge can tell another — your risk-taking is calculated.', ''],
  ['This includes quantitative DESCRIPTORS — pitch velocity, platoon tendencies, batted-ball profiles ("ground-ball pitcher"), workload characterizations ("heavy load", "fully rested"), and career batter-vs-pitcher lines all count as stats. If the metric wasn\'t provided, omit the claim entirely; a number recalled from memory is a fabrication even when it sounds right.',
    'A number recalled from memory is a fabrication even when it sounds right. Your read of tonight and of the series is your judgment, not a stat, and doesn\'t need a number behind it.'],
];

export function playoffQuestionSystemPrompt(systemPrompt) {
  let text = String(systemPrompt).replace(TOOL_RULES, '\n');
  for (const [from, to] of PLAYOFF_RULE_EDITS) {
    if (!text.includes(from)) console.warn(`[Playoff Question] standing-rule text not found, left as is: ${from.slice(0, 60)}`);
    text = text.replace(from, to).replace('Tonight you are betting MLB. \n', 'Tonight you are betting MLB.\n');
  }
  return `${text}\n\n${BULLPEN_INTERPRETATION}`;
}

export function buildPlayoffQuestionMessage({ desk, briefing, awareness, homeTeam, awayTeam, today }) {
  return `<scout_report>
## ${awayTeam} @ ${homeTeam} (TODAY: ${today})

${desk}
</scout_report>

## RESEARCH BRIEFING (from your research assistant)

${briefing}

<sport_pass1_context>
${awareness}
</sport_pass1_context>

Who wins tonight's game, and why?`;
}

// The second message (founder GO, Oct 13 2026): his answer is made in conversation; the card is written from it.
export function buildPlayoffCardMessage() {
  return `Write that answer as Gary's Take for the pick card: the same reasons, about 250-400 words, opening with a sentence or two that sets the scene. Then add this JSON block with the same pick, at that team's exact moneyline from THE PRICE:

\`\`\`json
{
  "final_pick": "[Team] ML [odds]",
  "rationale": "Gary's Take\\n\\n[the Gary's Take above]",
  "confidence_score": 0.XX
}
\`\`\`

confidence_score (0.50-1.00) is how confident you are in this pick.`;
}

const FORMAT_ONLY = 'Your answer did not include the JSON block. Add it now with the same pick and the same Gary\'s Take: "final_pick" ("[Team] ML [odds]" at that team\'s exact moneyline from THE PRICE), "rationale" ("Gary\'s Take\\n\\n" followed by the Gary\'s Take you wrote) and "confidence_score" (0.50-1.00).';

export async function runPlayoffQuestion(systemPrompt, { desk, flashDesk, awareness, today }, sport, homeTeam, awayTeam, options = {}) {
  const costTracker = createCostTracker(`Playoff question: ${awayTeam} @ ${homeTeam} (${sport})`);
  try {
    // The research assistant, as in every game pick: its postseason prompt checks what a playoff bettor checks.
    let briefing = null;
    let toolResponses = [];
    try {
      const result = await Promise.race([
        buildFlashResearchBriefing(flashDesk, sport, homeTeam, awayTeam, { ...options, _costTracker: costTracker }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Flash research timed out after ${RESEARCH_BRIEFING_TIMEOUT_MS / 1000}s`)), RESEARCH_BRIEFING_TIMEOUT_MS)),
      ]);
      briefing = typeof result === 'string' ? result : result?.briefing;
      toolResponses = result?.toolResponses || [];
    } catch (err) {
      throw new Error(`[HARD FAIL] Flash Research Assistant failed for ${homeTeam} @ ${awayTeam} (${sport}). Error: ${err.message}. The research assistant must complete successfully — no fallback to unresearched picks.`);
    }
    if (!briefing) throw new Error(`[HARD FAIL] Flash Research Assistant returned empty briefing for ${homeTeam} @ ${awayTeam} (${sport}). The research assistant must complete successfully — no fallback to unresearched picks.`);
    console.log(`[Playoff Question] Briefing ready (${briefing.length} chars)`);

    const system = playoffQuestionSystemPrompt(systemPrompt);
    const question = buildPlayoffQuestionMessage({ desk, briefing, awareness, homeTeam, awayTeam, today });
    const session = await createGeminiSession({
      _costTracker: costTracker,
      modelName: options.modelOverride || process.env.GARY_MODEL_OVERRIDE || GEMINI_PRO_MODEL,
      systemPrompt: system,
      tools: null,
      browse: false,
      thinkingLevel: options.thinkingLevel || 'xhigh',
      allowPersonalAccount: options.allowPersonalAccount,
      routePinned: options.routePinned,
      codexHomes: options.codexHomes,
      enableCache: true,
    });
    console.log(`[Playoff Question] ${session.modelName}: one question, no tools (${question.length} chars)`);

    const messages = [{ role: 'system', content: system }, { role: 'user', content: question }];
    const ask = async (text) => {
      const response = await sendToSessionWithRetry(session, text);
      messages.push({ role: 'assistant', content: response.content || '' });
      return response.content || '';
    };

    const read = await ask(question);
    console.log(`[Playoff Question] Answer (${read.length} chars); asking for the card`);
    let answer = await ask(buildPlayoffCardMessage());
    let pick = parseGaryResponse(answer, homeTeam, awayTeam, sport, options.game || {});
    if (!pick) {
      console.log('[Playoff Question] No JSON block in the answer — asking for the format only');
      answer = await ask(FORMAT_ONLY);
      pick = parseGaryResponse(answer, homeTeam, awayTeam, sport, options.game || {});
    }
    if (!pick) return { error: 'Playoff question: no parseable pick', homeTeam, awayTeam, sport, rawAnalysis: answer };

    // The same stat audit every game pick gets: one corrective retry for a number the desk doesn't hold.
    const audit = auditPickRationale(pick, messages);
    if (audit.retryable.length > 0) {
      console.warn(`[StatAudit] ⚠️ ${audit.unsupported.length}/${audit.checked} numeric claim(s) not found in provided data (${audit.retryable.length} retryable) — requesting corrected rationale:\n  ${audit.unsupported.join('\n  ')}`);
      const retried = await ask(buildStatAuditRetryMessage(audit.unsupported));
      const corrected = parseGaryResponse(retried, homeTeam, awayTeam, sport, options.game || {});
      if (corrected) { pick = corrected; answer = retried; }
      const after = auditPickRationale(pick, messages);
      if (after.unsupported.length > 0) pick._statAuditWarnings = after.unsupported;
    } else if (audit.unsupported.length > 0) {
      pick._statAuditWarnings = audit.unsupported;
    }

    pick.toolCallHistory = [];
    pick.iterations = messages.filter((m) => m.role === 'assistant').length;
    pick.rawAnalysis = answer;
    pick._fullAssistantNarrative = messages.filter((m) => m.role === 'assistant').map((m) => m.content).join('\n\n---\n\n');
    pick._researchBriefing = briefing;
    pick._originalToolResponses = toolResponses;
    pick._playoffQuestion = true;
    return pick;
  } finally {
    costTracker.logSummary();
  }
}
