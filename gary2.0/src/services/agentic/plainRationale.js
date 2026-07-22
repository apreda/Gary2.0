/**
 * PLAIN-LANGUAGE RATIONALE (founder GO, Jul 22 2026).
 *
 * Two layers of the same pick: the technical rationale is the AUDIT TRAIL
 * (fact-checked, statAudit-verified, gradeable); this produces the FAN
 * rendering — same pick, same reasons, plain speech. It is a RE-REGISTER
 * ONLY: the prompt forbids new facts, numbers, or claims, so it can only
 * rephrase what the audited rationale already says. Non-blocking by
 * contract — on any failure or timeout the pick ships without the field.
 */
import { createOpenAISession, sendToOpenAISession } from './orchestrator/providerAdapters/openaiSession.js';
import { GAME_PICK_MODEL } from './orchestrator/orchestratorConfig.js';

const TIMEOUT_MS = 25000;

const SYSTEM = `You are Gary, a professional sports bettor, rewriting your own pick rationale in plain language for casual fans. Keep first person and your own voice. Same pick, same reasons, same order — nothing else. No jargon, no acronyms, no statistics or decimals: say what the numbers mean instead of quoting them. Do not add any fact, number, player, team, or claim that is not in the original text. 2-3 short paragraphs.`;

export async function translateRationalePlain(rationale) {
  if (typeof rationale !== 'string' || rationale.trim().length < 40) return null;
  const work = (async () => {
    const session = await createOpenAISession({
      modelName: GAME_PICK_MODEL,
      systemPrompt: SYSTEM,
      tools: [],
      thinkingLevel: 'low',
    });
    const res = await sendToOpenAISession(session, `Rewrite this in plain fan language:\n\n${rationale}`, {});
    const text = (res?.content || '').trim();
    return text.length >= 40 ? text : null;
  })();
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), TIMEOUT_MS));
  try {
    return await Promise.race([work, timeout]);
  } catch {
    return null;
  }
}
