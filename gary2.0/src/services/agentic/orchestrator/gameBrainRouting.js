import { homedir } from 'node:os';
import { join } from 'node:path';
import { shouldRetryPickWithModel } from '../../marketTruth.js';
import { availableCodexHomes, codexHomeLabel } from './providerAdapters/codexHomes.js';

// Game decisions only. Research, props and content retain their own routing.
export const gameBrainEffort = model => model === 'claude-opus-5' ? 'max' : 'xhigh';
export function gameCodexHomes({ env = process.env, home = homedir() } = {}) {
  const configured = String(env.GARY_GAME_CODEX_HOMES || '').split(',').map(s => s.trim()).filter(Boolean);
  return [...new Set(configured.length ? configured : [join(home, '.codex-plus'), join(home, '.codex')])];
}

// Each account attempt starts the entire existing game engine again. A
// mid-analysis quota/auth failure must not jump from Plus straight to Opus,
// resume a thread under another login, or hand over a partial conversation.
export async function runGameBrainOnAccounts(model, attempt, { signal, homes = gameCodexHomes() } = {}) {
  signal?.throwIfAborted();
  const accounts = model.startsWith('codex-') ? availableCodexHomes({ homes }) : [null];
  let result = { error: 'All configured game Codex accounts are at their usage limit' };
  for (const home of accounts) {
    signal?.throwIfAborted();
    const options = { thinkingLevel: gameBrainEffort(model), ...(home ? { codexHomes: [home] } : {}) };
    console.log(`[Game Brain] ${model} · ${options.thinkingLevel}${home ? ` · login ${codexHomeLabel(home)}` : ' · Claude subscription'}`);
    try {
      result = await attempt(options);
    } catch (error) {
      signal?.throwIfAborted();
      if (error.name === 'AbortError' || /USER_ABORTED|aborted/i.test(error.message)) throw error;
      result = { error: error.message, code: error.code, retryModel: error.retryModel, failures: error.failures };
    }
    signal?.throwIfAborted();
    if (result?.code === 'required_data_unavailable') return { ...result, retryModel: false };
    if (!shouldRetryPickWithModel(result)) return result;
    if (home) console.warn(`[Game Brain] ${codexHomeLabel(home)} attempt failed: ${result?.error || 'No completed pick'}; next account starts a fresh full analysis`);
  }
  return result;
}
