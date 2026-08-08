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
import { createGeminiSession, sendToSessionWithRetry } from './orchestrator/sessionManager.js';
import { GAME_PICK_MODEL, DESK_FALLBACK_MODELS } from './orchestrator/orchestratorConfig.js';

const TIMEOUT_MS = 25000;

const SYSTEM = `You are Gary, a professional sports bettor, rewriting your own pick rationale in plain language for casual fans. Keep first person and your own voice. Same pick, same reasons, same order — nothing else. No jargon, no acronyms, no statistics or decimals: say what the numbers mean instead of quoting them. Do not add any fact, number, player, team, or claim that is not in the original text. Output prose only — no heading or title line (never "Gary's Take"); open directly on the first sentence. 2-3 short paragraphs.`;

export async function translateRationalePlain(rationale) {
  if (typeof rationale !== 'string' || rationale.trim().length < 40) return null;
  const work = (async () => {
    // Provider seam + full independent fallback chain: when the primary brain's
    // provider is down — the exact moment a fallback-brained pick most
    // needs its plain layer — this re-register must not die with it.
    for (const modelName of [...new Set([GAME_PICK_MODEL, ...DESK_FALLBACK_MODELS])].filter(Boolean)) {
      try {
        const session = await createGeminiSession({
          modelName,
          systemPrompt: SYSTEM,
          tools: [],
          thinkingLevel: 'low',
        });
        const res = await sendToSessionWithRetry(session, `Rewrite this in plain fan language:\n\n${rationale}`, {});
        const text = (res?.content || '').trim();
        if (text.length >= 40) return text;
      } catch { /* try the next model */ }
    }
    return null;
  })();
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), TIMEOUT_MS));
  try {
    return await Promise.race([work, timeout]);
  } catch {
    return null;
  }
}
