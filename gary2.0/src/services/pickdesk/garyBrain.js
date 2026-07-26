/**
 * THE BRAIN — one Sol xhigh call over the complete desk
 * (spec docs/superpowers/specs/2026-07-26-mlb-pick-rebuild-design.md).
 *
 * No tools, no passes, no research assistant: the desk is Gary's entire
 * evidence, his full reasoning budget goes to weighing it, and the pick is a
 * pure function of the desk (stored per pick for audits).
 *
 * Rails unchanged (prevent fabrication, never detect-and-ship): statAudit +
 * count-claim rail, ONE corrective retry, then null — no pick stored.
 */
import { buildMlbDesk } from './mlbDesk.js';
import { buildSystemPrompt } from '../agentic/orchestrator/orchestratorMain.js';
import { GAME_PICK_MODEL } from '../agentic/orchestrator/orchestratorConfig.js';
import { createOpenAISession, sendToOpenAISession } from '../agentic/orchestrator/providerAdapters/openaiSession.js';
import { auditPickRationale, auditCountClaims, buildStatAuditRetryMessage } from '../agentic/orchestrator/statAudit.js';

// The betting framework — the founder's approved decision language (Pass 2.5
// lineage, carried verbatim from the Jul 22 sol-native runner). Two deliberate
// deltas per spec: no tools sentence (the desk is complete), no length bracket
// (the card is the pick and the reasons; length is never forced).
export const DECISION_ASK = (homeTeam, awayTeam) => `
## YOUR TASK

Make the bet.

The betting options in front of you are what you are picking from — you are not being asked who is better or who wins on paper; the prices already say what the world thinks. You are picking the BEST BET on this board: hold your read of tonight against the options and take the ticket you would put your own money on. Sometimes that is the favorite at a fair price. Sometimes it is the underdog, because the price pays far more than your read of a close game requires. And sometimes your read simply says a side gets it done regardless of the numbers — that conviction, owned plainly, is a real sports betting decision.

**BET TYPE:** Two options — MONEYLINE (team wins outright) or RUN LINE (standard -1.5/+1.5). The mechanics: -1.5 pays only on a win by 2+ runs — a one-run win pays the moneyline and LOSES -1.5; +1.5 cashes on a win or a one-run loss. They are different bets on different outcomes, not two prices for the same opinion — take the bet that pays if your read is right, not the one that makes a price you dislike look better.

**ESTABLISHED INJURY RULE:** an absence that is multiple games old is already in the line and in the team's recent results — only FRESH injuries (0-2 games) can inform the pick.

Use the EXACT odds shown on the board. Write "Gary's Take" — your pick and the real reasons you landed on it, opening with a brief announcer-style scene-setter — then output JSON:

\`\`\`json
{
  "final_pick": "[Team] [ML or run line] [exact odds]",
  "rationale": "Gary's Take\\n\\n[the prose]",
  "confidence_score": 0.XX
}
\`\`\`

confidence_score (0.50-1.00): set organically — confidence measures your read against the price, not the shortness of the price.`;

const parseFinalJson = (t) => {
  try {
    const m = String(t || '').match(/```json\s*([\s\S]*?)```/i) || String(t || '').match(/(\{[\s\S]*\})/);
    const o = JSON.parse(m[1]);
    return o.final_pick ? o : null;
  } catch { return null; }
};

/** Map Sol's final_pick text onto the chassis contract fields. */
export function mapFinalPick(parsed, meta) {
  const fp = String(parsed.final_pick || '');
  const isSpread = /run\s*line|[+-]1\.5/i.test(fp);
  const fpLower = fp.toLowerCase();
  const homeSide = fpLower.includes(String(meta.homeTeam || '').toLowerCase().split(' ').pop());
  const oddsM = fp.trim().match(/([+-]\d{3,4})$/);
  const metaOdds = isSpread
    ? (homeSide ? meta.spreadHomeOdds : meta.spreadAwayOdds)
    : (homeSide ? meta.moneylineHome : meta.moneylineAway);
  return {
    pick: fp,
    type: isSpread ? 'spread' : 'moneyline',
    odds: oddsM ? parseInt(oddsM[1], 10) : (metaOdds ?? null),
    spread: isSpread ? (homeSide ? meta.spreadHome : meta.spreadAway) : null,
    spreadOdds: isSpread ? (homeSide ? meta.spreadHomeOdds : meta.spreadAwayOdds) : null,
  };
}

const todayLong = () => new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York',
});

/**
 * The MLB game brain. Same result contract analyzeGame carried — the runner
 * chassis (tiers, gates, store, tape, plain layer) does not change.
 */
export async function analyzeGameDesk(game, options = {}) {
  const desk = await buildMlbDesk(game, options);
  const { homeTeam, awayTeam } = desk.meta;

  const systemPrompt = buildSystemPrompt('', 'baseball_mlb').replace(/{{CURRENT_DATE}}/g, todayLong());
  const session = await createOpenAISession({
    modelName: GAME_PICK_MODEL,
    systemPrompt,
    tools: [],
    thinkingLevel: 'xhigh',
  });

  const userMessage = `## THE DESK — ${awayTeam} @ ${homeTeam}\n\n${desk.deskText}\n${DECISION_ASK(homeTeam, awayTeam)}`;
  const usage = { in: 0, out: 0 };
  const bump = (res) => { usage.in += res.usage?.prompt_tokens || 0; usage.out += res.usage?.completion_tokens || 0; };

  let res = await sendToOpenAISession(session, userMessage, {});
  bump(res);
  let parsed = parseFinalJson(res.content);
  if (!parsed) {
    res = await sendToOpenAISession(session, 'Return your final JSON now.', {});
    bump(res);
    parsed = parseFinalJson(res.content);
    if (!parsed) return { error: 'parse: no valid final JSON after re-ask' };
  }

  const corpus = [{ content: desk.deskText }];
  const auditAll = (rationale) => {
    const a = auditPickRationale({ rationale }, corpus);
    const c = desk.recentScores ? auditCountClaims(rationale, desk.recentScores) : [];
    return { issues: [...a.retryable, ...c], warnings: a.warnOnly?.length ? a.warnOnly : null };
  };

  let { issues, warnings } = auditAll(parsed.rationale);
  if (issues.length) {
    console.warn(`   [Rail] ${issues.length} issue(s) — one corrective retry`);
    res = await sendToOpenAISession(session, buildStatAuditRetryMessage(issues), {});
    bump(res);
    const rp = parseFinalJson(res.content);
    const second = rp ? auditAll(rp.rationale) : { issues: [{ fatal: true }] };
    if (!rp || second.issues.length) return { error: 'rails: rationale failed statAudit after retry' };
    parsed = rp;
    warnings = second.warnings;
  }

  const cost = (usage.in * 5 + usage.out * 30) / 1e6;
  console.log(`   [Brain] one call, ${usage.in.toLocaleString()} in / ${usage.out.toLocaleString()} out ≈ $${cost.toFixed(3)}`);

  return {
    ...mapFinalPick(parsed, desk.meta),
    confidence: parsed.confidence_score ?? null,
    rationale: parsed.rationale,
    homeTeam,
    awayTeam,
    moneylineHome: desk.meta.moneylineHome,
    moneylineAway: desk.meta.moneylineAway,
    total: desk.meta.total,
    verifiedTaleOfTape: desk.verifiedTaleOfTape,
    recentScores: desk.recentScores,
    deskText: desk.deskText,
    _statAuditWarnings: warnings,
    _usage: usage,
  };
}
