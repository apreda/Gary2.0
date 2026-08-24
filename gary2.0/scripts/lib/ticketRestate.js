/**
 * Ticket restatement — the card's prose must argue the actual ticket
 * (Aug 24 2026, founder GO: "fix the bugs").
 *
 * The preseason audit found 10 of 16 football cards quoting a different
 * spread or price than the stored pick ("Bills +3 -105" arguing "Give me
 * Buffalo +2.5"). Mechanism: Gary composes against the desk's board, then
 * best-line election rewrites the ticket — pick text and stored numbers
 * follow the election (F-5), but the prose never did. Election cannot move
 * before composition (the best line depends on which SIDE Gary picks), so
 * the fix is the house-limit pattern: when the elected ticket differs from
 * the numbers the card quotes, GARY restates his own card against the real
 * ticket — one corrective call, same arguments, only the wagered numbers
 * change. Nothing here writes prose; a failed restatement keeps the
 * original card (fail-soft, a pick is never blocked or delayed by this).
 */

import { createModelSession, sendToSessionWithRetry } from '../../src/services/agentic/orchestrator/sessionManager.js';
import { GAME_PICK_MODEL } from '../../src/services/agentic/orchestrator/orchestratorConfig.js';

/** All signed American-odds tokens in a text (e.g. -110, +102). */
function oddsTokens(text) {
  return [...String(text || '').matchAll(/(?<![\d.])[+-]\d{3}(?![\d.])/g)].map((m) => m[0]);
}

/**
 * Spread-like point tokens in prose: signed numbers ("+2.5", "-3") and the
 * "laying/taking the N (points)" forms. Scores ("27-14") and odds are
 * excluded by shape. Returns absolute values as strings ("2.5", "3").
 */
function spreadTokens(text) {
  const t = String(text || '');
  const out = new Set();
  for (const m of t.matchAll(/(?<![\d.\-+])[+-](\d{1,2}(?:\.5)?)(?![\d.\-])/g)) {
    const n = parseFloat(m[1]);
    if (Number.isFinite(n) && n <= 30 && !/^\d{3}$/.test(m[1])) out.add(m[1]);
  }
  for (const m of t.matchAll(/\b(?:laying|lay|taking|take|charging(?:\s+bettors)?|beyond|than)\s+(?:the\s+)?(\d{1,2}(?:\.5)?)\s*(?:points?\b|$|[.,;])/gi)) {
    const n = parseFloat(m[1]);
    if (Number.isFinite(n) && n > 0 && n <= 30) out.add(m[1]);
  }
  return [...out];
}

const fmtSpread = (n) => (n > 0 ? `+${n}` : `${n}`);
const fmtOdds = (n) => (n > 0 ? `+${n}` : `${n}`);

/**
 * Does the card's prose quote wagered numbers that contradict the final
 * ticket? Deterministic, conservative: prose with NO number talk (the
 * "I'm laying the points" style) never trips it.
 */
export function ticketNumbersDrift(rationale, finalSpread, finalSpreadOdds) {
  const text = String(rationale || '');
  if (!text) return false;
  const spreadAbs = finalSpread != null ? String(Math.abs(finalSpread)) : null;
  const oddsStr = Number.isFinite(finalSpreadOdds) ? fmtOdds(finalSpreadOdds) : null;

  const spreads = spreadTokens(text);
  const odds = oddsTokens(text);

  const spreadConflict = spreadAbs != null
    && spreads.length > 0
    && spreads.some((s) => s !== spreadAbs);
  const oddsConflict = oddsStr != null
    && odds.length > 0
    && odds.some((o) => o !== oddsStr);

  return spreadConflict || oddsConflict;
}

/**
 * Validate a restated card before accepting it: it must quote the ticket,
 * must not still carry a conflicting number, and must remain the same card
 * (length within ±25% — the contract forbids new arguments, so a large
 * delta means the model rewrote instead of restating).
 */
export function restatementAcceptable(original, restated, finalSpread, finalSpreadOdds) {
  const text = String(restated || '').trim();
  if (!text) return false;
  const lenRatio = text.length / Math.max(String(original || '').length, 1);
  if (lenRatio < 0.75 || lenRatio > 1.25) return false;
  if (ticketNumbersDrift(text, finalSpread, finalSpreadOdds)) return false;
  const spreadAbs = finalSpread != null ? String(Math.abs(finalSpread)) : null;
  // The corrected card should actually SAY the ticket somewhere (prose that
  // dodges numbers entirely is fine on a clean compose, but a restatement
  // was requested precisely because numbers were quoted).
  if (spreadAbs != null && !text.includes(spreadAbs)) return false;
  return true;
}

function extractJson(text) {
  const raw = String(text || '');
  const fence = raw.match(/```json\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(body.slice(start, end + 1)); } catch { return null; }
}

/**
 * One corrective call: Gary restates his own card against the elected
 * ticket. Returns the corrected rationale, or null on any failure — the
 * caller keeps the original and the pick ships regardless.
 */
export async function restateAgainstTicket({ rationale, pickText, spread, spreadOdds, book, model }) {
  const ticketLine = [
    pickText,
    book ? `at ${book}` : null,
  ].filter(Boolean).join(' ');

  const system = 'You are Gary. You wrote the pick card below. After you wrote it, line shopping landed your ticket on a better number, so the card\'s quoted figures no longer match the ticket you actually hold. Restate YOUR OWN card so that every reference to the wagered spread and price matches the final ticket exactly. Keep every argument, every sentence, and the card\'s order IDENTICAL apart from the corrected numbers and whatever minimal grammar those corrections require. Do not add, remove, or reweigh any reasoning. Do not introduce any new statistics or claims. Return ONLY JSON: {"rationale":"..."}';

  const user = `FINAL TICKET (as placed): ${ticketLine}
Final spread: ${fmtSpread(spread)}${Number.isFinite(spreadOdds) ? ` at ${fmtOdds(spreadOdds)}` : ''}

YOUR CARD (quotes outdated numbers):
${rationale}`;

  try {
    const session = await createModelSession({
      modelName: model || GAME_PICK_MODEL,
      systemPrompt: system,
      tools: [],
      thinkingLevel: 'low',
      maxOutputTokens: 4000,
    });
    const res = await sendToSessionWithRetry(session, user, {});
    const parsed = extractJson(res?.content);
    const restated = typeof parsed?.rationale === 'string' ? parsed.rationale.trim() : null;
    if (!restated) return null;
    if (!restatementAcceptable(rationale, restated, spread, spreadOdds)) {
      console.warn('   ⚠️ [Ticket Restate] restatement rejected by validator — keeping the original card');
      return null;
    }
    return restated;
  } catch (e) {
    console.warn(`   ⚠️ [Ticket Restate] failed (${e.message}) — keeping the original card`);
    return null;
  }
}

export default { ticketNumbersDrift, restatementAcceptable, restateAgainstTicket };
