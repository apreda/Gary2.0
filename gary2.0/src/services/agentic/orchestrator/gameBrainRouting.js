import { homedir } from 'node:os';
import { join } from 'node:path';
import { shouldRetryPickWithModel } from '../../marketTruth.js';
import { availableCodexHomes, codexHomeLabel, personalCodexHome, restrictCodexHomes } from './providerAdapters/codexHomes.js';

// Game decisions only. Research, props and content retain their own routing.
export const gameBrainEffort = model => model === 'claude-opus-5' ? 'max' : model === 'codex-gpt-5.6-sol' ? 'high' : 'xhigh';
export function gameCodexHomes({ env = process.env, home = homedir() } = {}) {
  const configured = String(env.GARY_GAME_CODEX_HOMES || '').split(',').map(s => s.trim()).filter(Boolean);
  return restrictCodexHomes(configured.length ? configured : [join(home, '.codex-plus')], { env, home });
}

// Each account attempt starts the entire existing game engine again. A
// mid-analysis failure must not resume a thread under another login or
// hand a partial conversation to the next route.
export async function runGameBrainOnAccounts(model, attempt, { signal, homes = gameCodexHomes(), allowPersonalAccount = false } = {}) {
  signal?.throwIfAborted();
  const accounts = model.startsWith('codex-') ? availableCodexHomes({ homes: restrictCodexHomes(homes, { allowPersonalAccount }) }) : [null];
  let result = { error: 'No permitted game Codex account has available allowance' };
  for (const home of accounts) {
    signal?.throwIfAborted();
    const options = { thinkingLevel: gameBrainEffort(model), ...(home ? { codexHomes: [home], ...(allowPersonalAccount ? { allowPersonalAccount: true } : {}) } : {}) };
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

// Route identity includes the account so a failed Plus preflight cannot hide
// the final Pro route to the same Astra model.
export function gameBrainRoutes(models, { env = process.env, home = homedir(), league = '' } = {}) {
  const college = /^(NCAAF|americanfootball_ncaaf)$/i.test(league);
  if (college) models = ['codex-gpt-5.6-sol'];
  const normal = [...new Set(models)].map(model => ({ id: model, model,
    ...(model.startsWith('codex-') ? { codexHomes: gameCodexHomes({ env, home }) } : {}),
  }));
  return [...normal, { id: 'personal-pro-reserve', model: college ? 'codex-gpt-5.6-sol' : 'codex-gpt-6-astra',
    codexHomes: [personalCodexHome({ env, home })], allowPersonalAccount: true }];
}

export async function runGameBrainCascade(models, attempt, { signal, preflight, retryPrimary = false, routes = gameBrainRoutes(models) } = {}) {
  const results = preflight?.results || [];
  const dead = new Set(results.filter(r => !r.ok).map(r => r.routeId || r.model));
  const available = routes.filter(route => !dead.has(route.id));
  let result = { error: 'All game brain routes are unavailable' };
  for (const [index, route] of available.entries()) {
    signal?.throwIfAborted();
    const run = () => runGameBrainOnAccounts(route.model, options => attempt(route.model, options), {
      signal, homes: route.codexHomes, allowPersonalAccount: route.allowPersonalAccount,
    });
    result = await run();
    if (index === 0 && retryPrimary && shouldRetryPickWithModel(result)) result = await run();
    if (!shouldRetryPickWithModel(result)) {
      if (result?.pick && !result.error) result._modelUsed ??= route.model;
      return result;
    }
    console.warn(`[Game Brain] ${route.id} did not complete: ${result?.error || 'no pick'}; trying the next authorized route`);
  }
  return result;
}
