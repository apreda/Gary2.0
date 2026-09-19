/**
 * The one model cascade every LLM lane reads through.
 *
 * Founder, Sep 18 2026: "the same fallback flow for all the parts that use an
 * LLM but for the parts that might be like Sonnet then dont do astra do Terra
 * for the GPT fallback and we have 2 GPT accounts you can use for the fallback
 * a plus and a pro."
 *
 * Every lane below used to call one hardcoded model once and give up: winners
 * curation, prop selection, the reviewer, the MLB winners selection, the
 * autopsy, the news reader and the expectations reader. A capped Codex took
 * each of them down on its own. Prop selection additionally kept a private pair
 * (claude-sonnet-5 then claude-fable-5-1) that never received the approved
 * cascade, and sonnet-5 hung for the whole window on Sep 18 while the rung
 * behind it was never tried. One shared reader is why that cannot drift again.
 *
 * TIERS
 *   heavy — the decision lanes. GPT fallback is Astra.
 *   light — the Sonnet-class readers (news, autopsy, expectations). GPT
 *           fallback is Terra, per the founder's instruction.
 *
 * ACCOUNTS
 *   The first rung uses Gary's own Plus login only. A FALLBACK Codex rung may
 *   also reach the personal Pro login, and `availableCodexHomes` drops a capped
 *   home, so Pro is spent only when Plus genuinely cannot serve.
 */
import { codexCliOneShot } from './providerAdapters/codexCliSession.js';
import { createClaudeCliSession, sendToClaudeCliSession } from './providerAdapters/claudeCliSession.js';
import { discoverCodexHomes } from './providerAdapters/codexHomes.js';
import { deepseekOneShot, deepseekConfigured, DEEPSEEK_RUNG } from './providerAdapters/deepseekSession.js';
import { GAME_PICK_MODEL, GAME_FALLBACK_MODELS } from './orchestratorConfig.js';

export const SOL_MODEL = 'gpt-5.6-sol';
export const TERRA_MODEL = 'codex-gpt-5.6-terra';
// The last resort, and the only METERED rung. Founder, Sep 18 2026: "lets do a
// final deepseek fail back". Present only when a key exists, so the cascade is
// unchanged until one is configured.
export const LAST_RESORT = DEEPSEEK_RUNG;

const dedupe = list => list.filter((m, i, a) => m && a.indexOf(m) === i);

/**
 * The rungs for `primary`, in order. A lane keeps whatever model it leads with,
 * so a healthy run is the run it has always been.
 */
export function cascadeFor(primary, tier = 'heavy') {
  const free = tier === 'light'
    ? [primary, TERRA_MODEL, GAME_PICK_MODEL]
    : [primary, GAME_PICK_MODEL, ...GAME_FALLBACK_MODELS];
  // Metered, so it goes below every free rung and only when one is payable.
  return dedupe([...free, ...(deepseekConfigured() ? [LAST_RESORT] : [])]);
}
export const HEAVY_CASCADE = cascadeFor(SOL_MODEL, 'heavy');
export const LIGHT_CASCADE = cascadeFor(SOL_MODEL, 'light');

// A rung needs a real window; the Claude CLI's measured median is ~2.3m.
export const RUNG_RESERVE_MS = 150_000;
// Below this there is no point starting a rung at all.
export const MIN_RUNG_MS = 30_000;
const isClaudeRung = m => String(m).startsWith('claude-');
const isLastResort = m => String(m) === LAST_RESORT;

/**
 * Read `prompt` through the cascade. Returns the shape codexCliOneShot does, so
 * it drops straight into any lane whose `oneShot` defaulted to that function.
 *
 * Every rung but the last hands the window behind it back, so a rung that hangs
 * cannot swallow the budget: that reserve used to guard only the Codex rungs,
 * which is exactly how a hanging sonnet-5 left nothing for the rung after it.
 * A fixed budget cannot give four sequential rungs a full window each — what
 * this guarantees is that the NEXT rung always has one.
 */
export async function cascadeRead(prompt, options = {}) {
  const { timeoutMs, systemPrompt, breakerKey, codexHomes, search = false, effort = 'high',
    cascade = HEAVY_CASCADE, unavailable = 'Model comparison unavailable', signal } = options;
  const deadline = Date.now() + timeoutMs;
  const errors = [];
  for (const [index, model] of cascade.entries()) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_RUNG_MS) { errors.push(`${model}: time budget exhausted`); break; }
    const last = index === cascade.length - 1;
    const budget = last ? remaining : Math.max(MIN_RUNG_MS, remaining - RUNG_RESERVE_MS);
    // Rung 0 is Gary's own login. Only a fallback rung may reach personal Pro.
    const fallbackRung = index > 0;
    try {
      if (isLastResort(model)) {
        const r = await deepseekOneShot(prompt, { systemPrompt, timeoutMs: budget, signal });
        if (r?.success) return r;
        throw new Error(r?.error || unavailable);
      }
      if (isClaudeRung(model)) {
        const rungSignal = signal || AbortSignal.timeout(budget);
        const session = await createClaudeCliSession({ modelName: model, systemPrompt,
          thinkingLevel: 'high', browse: search, signal: rungSignal });
        const answer = await sendToClaudeCliSession(session, prompt, { signal: rungSignal });
        if (!answer?.content) throw new Error('Empty answer');
        return { success: true, data: answer.content, raw: answer.content, model };
      }
      const r = await codexCliOneShot(prompt, { systemPrompt, timeoutMs: budget, search, effort, signal,
        model: String(model).replace(/^codex-/, ''), breakerKey,
        allowPersonalAccount: fallbackRung,
        codexHomes: codexHomes || (fallbackRung ? discoverCodexHomes({ includePersonal: true }) : undefined) });
      if (r?.success) return { ...r, model };
      throw new Error(r?.error || unavailable);
    } catch (error) {
      errors.push(`${model}: ${error.message}`);
    }
  }
  return { success: false, error: errors.join('; ') };
}

/**
 * A lane's drop-in `oneShot`: the same signature `codexCliOneShot` has, with
 * the cascade behind it. The lane keeps passing its own model, effort, search
 * and timeout; only what happens after a failure changes.
 */
export const cascadeOneShot = (tier, breakerKey) => (prompt, options = {}) =>
  cascadeRead(prompt, {
    ...options,
    breakerKey: options.breakerKey || breakerKey,
    cascade: options.cascade || cascadeFor(options.model || SOL_MODEL, tier),
  });
