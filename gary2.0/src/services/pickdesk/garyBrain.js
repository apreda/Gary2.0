/**
 * THE BRAIN — one xhigh session over the complete desk, two turns
 * (spec docs/superpowers/specs/2026-07-26-mlb-pick-rebuild-design.md;
 * seal-the-pick split: founder GO, Aug 4 2026).
 *
 * No tools, no passes, no research assistant: the desk is Gary's entire
 * evidence, his full reasoning budget goes to weighing it, and the pick is a
 * pure function of the desk (stored per pick for audits). Turn 1 outputs the
 * ticket only — the pick seals before any card prose exists. Turn 2 writes
 * Gary's Take on the same session with the ticket already committed.
 *
 * Brain cascade (founder, Jul 29 2026): Sol first; if a brain THROWS —
 * dead balance/429 like the Jul 28 outage, or a provider hard-down — the
 * same desk re-runs on the Gemini fallbacks at their top thinking level.
 * Parse/rails failures do NOT cascade: those are contained no-pick errors,
 * unchanged. Sessions route through the sessionManager provider seam.
 *
 * Rails unchanged (prevent fabrication, never detect-and-ship): statAudit +
 * count-claim rail, ONE corrective retry, then null — no pick stored.
 */
import { createHash } from 'crypto';
import { buildMlbDesk } from './mlbDesk.js';
import { GAME_PICK_MODEL, DESK_FALLBACK_MODELS, DESK_COST_PER_M } from '../agentic/orchestrator/orchestratorConfig.js';
import { createGeminiSession, sendToSessionWithRetry } from '../agentic/orchestrator/sessionManager.js';
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

The line is the market's opinion of tonight, not a measurement of it.

Your published card is "Gary's Take": three paragraphs, opening with a line or two setting the stage like a broadcast — the reasoning is yours. No emojis. Never mention data feeds, tools, or missing data.`;

// THE SEAL (founder GO, Aug 4 2026): the ticket is decided and output BEFORE
// any card prose exists. The old contract wrote the card first and the pick
// arrived as the essay's conclusion — composition pressure sat upstream of
// the decision. Now turn 1 outputs only the ticket; turn 2 writes the card
// on the same session with the pick already sealed. Whatever any later turn
// emits, the stored pick is turn 1's — mechanically.
export const THE_ASK = `Pick the bet you want to take — a bet is a side and its price.

Injuries: an absence already games old is already in the price and in the team's recent results; fresh news — today's scratch — is the exception.

Your ticket seals before any card is written. Output only:

\`\`\`json
{ "final_pick": "[Team] [bet] [exact odds]", "confidence_score": 0.XX }
\`\`\`

confidence_score (0.50–1.00): your conviction in this bet at its price — the bet, not the outcome.`;

export const buildCardAsk = (finalPick) => `Your ticket is sealed: ${finalPick}.

Write your card.`;

const parseFinalJson = (t) => {
  try {
    const m = String(t || '').match(/```json\s*([\s\S]*?)```/i) || String(t || '').match(/(\{[\s\S]*\})/);
    const o = JSON.parse(m[1]);
    return o.final_pick ? o : null;
  } catch { return null; }
};

/** The card arrives as prose. A rails retry may answer in the old JSON shape
 *  — accept its rationale field; never accept a bare JSON blob as a card.
 *  Under 200 chars is not a card (a real Take runs 1,000+). */
const extractCard = (t) => {
  const s = String(t || '').trim();
  if (!s) return null;
  const m = s.match(/```json\s*([\s\S]*?)```/i) || (s.startsWith('{') ? s.match(/(\{[\s\S]*\})/) : null);
  if (m) {
    try {
      const o = JSON.parse(m[1]);
      return o.rationale && String(o.rationale).trim().length >= 200 ? String(o.rationale).trim() : null;
    } catch { /* fall through to prose */ }
  }
  if (/^\{[\s\S]*\}$/.test(s)) return null;
  return s.length >= 200 ? s : null;
};

/** Cards publish under the "Gary's Take" masthead (display contract, owned in
 *  code — never re-litigated in the prompt). Strip a model-invented header
 *  line that names the sealed ticket (smoke, Aug 4: "THE CARD — Orioles ML
 *  -150"), then ensure the masthead. */
const normalizeCardHead = (card, finalPick) => {
  let s = String(card).trim();
  if (/^gary'?s take\b/i.test(s)) return s;
  const nl = s.indexOf('\n');
  const first = (nl === -1 ? s : s.slice(0, nl)).trim();
  const isHeader = /^the card\b/i.test(first) || (finalPick && first.includes(finalPick));
  if (isHeader && nl !== -1) s = s.slice(nl + 1).trim();
  return `Gary's Take\n\n${s}`;
};

/** Map the brain's final_pick text onto the chassis contract fields. */
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

// Prompt-era fingerprint (founder GO, Jul 29): every stored pick carries the
// hash of the contract TEMPLATE it was made under (date placeholder, so the
// hash only moves when the words move). This is what makes before/after
// readable when contract wording changes — eras join in SQL, never inferred
// from timestamps again. Register new eras in the prompt_eras table.
export const PROMPT_SHA = createHash('sha256')
  .update(buildGarySystemPrompt('{date}') + THE_ASK + buildCardAsk('{pick}'))
  .digest('hex')
  .slice(0, 12);

// OpenAI's and the Claude CLI's effort ladders reach xhigh; Gemini's
// thinkingLevel tops at high.
const topThinkingLevel = (modelName) => (modelName.startsWith('gemini') ? 'high' : 'xhigh');

/**
 * One full brain pass on one model, two turns on one session: desk → ticket
 * (the seal), then card ask → prose, rails on the card with ONE corrective
 * retry. Returns { parsed, usage, warnings } or a contained { error }
 * (parse/rails). Provider/quota failures THROW — the cascade in
 * analyzeGameDesk owns those.
 */
async function runBrainPass(modelName, systemPrompt, userMessage, auditAll) {
  const session = await createGeminiSession({
    modelName,
    systemPrompt,
    tools: [],
    thinkingLevel: topThinkingLevel(modelName),
  });

  const usage = { in: 0, out: 0 };
  const bump = (res) => { usage.in += res.usage?.prompt_tokens || 0; usage.out += res.usage?.completion_tokens || 0; };
  const logCost = () => {
    const [inRate, outRate] = DESK_COST_PER_M[modelName] || [0, 0];
    const cost = (usage.in * inRate + usage.out * outRate) / 1e6;
    console.log(`   [Brain] one call (${modelName}), ${usage.in.toLocaleString()} in / ${usage.out.toLocaleString()} out ≈ $${cost.toFixed(3)}`);
  };

  // TURN 1 — THE DECISION. The desk in, the ticket out. No prose exists yet.
  let res = await sendToSessionWithRetry(session, userMessage, {});
  bump(res);
  let ticket = parseFinalJson(res.content);
  if (!ticket) {
    res = await sendToSessionWithRetry(session, 'Return your final JSON now.', {});
    bump(res);
    ticket = parseFinalJson(res.content);
    if (!ticket) { logCost(); return { error: 'parse: no ticket JSON after re-ask' }; }
  }

  // THE SEAL: from here on, ticket.final_pick is the pick. Turn 2 and any
  // rails retry write prose only — a different final_pick in a later reply
  // is ignored by construction.
  res = await sendToSessionWithRetry(session, buildCardAsk(ticket.final_pick), {});
  bump(res);
  let card = extractCard(res.content);
  if (!card) {
    res = await sendToSessionWithRetry(session, 'Write your card now.', {});
    bump(res);
    card = extractCard(res.content);
    if (!card) { logCost(); return { error: 'parse: no card after re-ask' }; }
  }

  let { issues, warnings } = auditAll(card);
  if (issues.length) {
    console.warn(`   [Rail] ${issues.length} issue(s) — one corrective retry`);
    res = await sendToSessionWithRetry(session, buildStatAuditRetryMessage(issues), {});
    bump(res);
    const rc = extractCard(res.content);
    const second = rc ? auditAll(rc) : { issues: [{ fatal: true }] };
    if (!rc || second.issues.length) { logCost(); return { error: 'rails: card failed statAudit after retry' }; }
    card = rc;
    warnings = second.warnings;
  }

  logCost();
  return { parsed: { ...ticket, rationale: normalizeCardHead(card, ticket.final_pick) }, usage, warnings };
}

/**
 * The MLB game brain. Same result contract analyzeGame carried — the runner
 * chassis (tiers, gates, store, tape, plain layer) does not change.
 */
export async function analyzeGameDesk(game, options = {}) {
  const desk = await buildMlbDesk(game, options);
  const { homeTeam, awayTeam } = desk.meta;

  const systemPrompt = buildGarySystemPrompt(todayLong());
  const userMessage = `## THE DESK — ${awayTeam} @ ${homeTeam}\n\n${desk.deskText}\n\n${THE_ASK}`;

  const corpus = [{ content: desk.deskText }];
  const auditAll = (rationale) => {
    const a = auditPickRationale({ rationale }, corpus);
    const c = desk.recentScores ? auditCountClaims(rationale, desk.recentScores) : [];
    return { issues: [...a.retryable, ...c], warnings: a.warnOnly?.length ? a.warnOnly : null };
  };

  const cascade = [GAME_PICK_MODEL, ...DESK_FALLBACK_MODELS];
  let pass = null;
  for (let i = 0; i < cascade.length; i++) {
    const modelName = cascade[i];
    try {
      pass = await runBrainPass(modelName, systemPrompt, userMessage, auditAll);
      if (i > 0) console.warn(`   [Brain] FALLBACK brain produced this pass: ${modelName}`);
      break;
    } catch (err) {
      const reason = err?.isQuotaError ? 'quota/429' : (err?.message || 'provider error');
      if (i < cascade.length - 1) {
        console.warn(`   [Brain] ${modelName} failed (${reason}) — cascading to ${cascade[i + 1]}`);
        continue;
      }
      console.error(`   [Brain] ${modelName} failed (${reason}) — cascade exhausted`);
      throw err; // runner's per-game catch owns the miss, unchanged
    }
  }
  if (pass.error) return { error: pass.error };
  const { parsed, usage, warnings } = pass;

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
    _promptSha: PROMPT_SHA,
  };
}
