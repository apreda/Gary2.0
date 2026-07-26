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
import { GAME_PICK_MODEL } from '../agentic/orchestrator/orchestratorConfig.js';
import { createOpenAISession, sendToOpenAISession } from '../agentic/orchestrator/providerAdapters/openaiSession.js';
import { auditPickRationale, auditCountClaims, buildStatAuditRetryMessage } from '../agentic/orchestrator/statAudit.js';

// ═══════════════════════════════════════════════════════════════════════════
// THE ZERO-BASED PROMPT SURFACE (founder + Claude, Jul 26 2026).
// Entry rule: a sentence exists here only if it is (a) something a frontier
// model cannot know — product contracts, our environment, today's date — or
// (b) a law the founder has set. No tutoring, no persona essays, no doctrine.
// The desk is the system; these ~1,100 characters are the contract around it.
// ═══════════════════════════════════════════════════════════════════════════

export const buildGarySystemPrompt = (dateLong) => `Today is ${dateLong}. You are Gary — the bettor whose picks publish in this app. You write as yourself, never as an AI or a system, and you have no favorite team.

Your training data is old; the desk is current.

Your published card is "Gary's Take": three paragraphs, opening with a line or two setting the stage like a broadcast — the reasoning is yours. No emojis. Never mention data feeds, tools, or missing data.`;

export const THE_ASK = `Pick the bet you want to take.

Injuries: an absence already games old is already in the price and in the team's recent results; fresh news — today's scratch — is the exception.

After your card, output:

\`\`\`json
{ "final_pick": "[Team] [bet] [exact odds]", "rationale": "Gary's Take\\n\\n[the prose]", "confidence_score": 0.XX }
\`\`\`

confidence_score (0.50–1.00): how strongly your read beats this price.`;

const parseFinalJson = (t) => {
  try {
    const m = String(t || '').match(/```json\s*([\s\S]*?)```/i) || String(t || '').match(/(\{[\s\S]*\})/);
    const o = JSON.parse(m[1]);
    return o.final_pick ? o : null;
  } catch { return null; }
};

/** Map Sol's final_pick text onto the chassis contract fields. */
export function mapFinalPick(parsed, meta) {
  // Normalize "(−126)" → "−126": every downstream parser (grading, ledgers,
  // F-5 text rules) expects bare trailing odds.
  const fp = String(parsed.final_pick || '').replace(/\(\s*([+-]\d{3,4})\s*\)/g, '$1').replace(/\s{2,}/g, ' ').trim();
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

  const systemPrompt = buildGarySystemPrompt(todayLong());
  const session = await createOpenAISession({
    modelName: GAME_PICK_MODEL,
    systemPrompt,
    tools: [],
    thinkingLevel: 'xhigh',
  });

  const userMessage = `## THE DESK — ${awayTeam} @ ${homeTeam}\n\n${desk.deskText}\n\n${THE_ASK}`;
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
    book: desk.meta.book ?? null,
    total: desk.meta.total,
    verifiedTaleOfTape: desk.verifiedTaleOfTape,
    recentScores: desk.recentScores,
    deskText: desk.deskText,
    _statAuditWarnings: warnings,
    _usage: usage,
  };
}
