import { subscriptionRoutes, CLAUDE_CAP } from './subscriptionRoutes.js';
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
    const options = { routePinned: true, thinkingLevel: gameBrainEffort(model), ...(home ? { codexHomes: [home], ...(allowPersonalAccount ? { allowPersonalAccount: true } : {}) } : {}) };
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
  return subscriptionRoutes(models[0], { tier: 'heavy', college, env, home });
}

export async function runGameBrainCascade(models, attempt, { signal, preflight, retryPrimary = false, routes = gameBrainRoutes(models) } = {}) {
  const results = preflight?.results || [];
  const dead = new Set(results.filter(r => !r.ok).map(r => r.routeId || r.model));
  // The preflight found this route's brain capped and its sibling answering.
  const runOn = new Map(results.filter(r => r.ok && r.runOn).map(r => [r.routeId || r.model, r.runOn]));
  const available = routes.filter(route => !dead.has(route.id));
  let result = { error: 'All game brain routes are unavailable' };
  for (const [index, route] of available.entries()) {
    signal?.throwIfAborted();
    const model = runOn.get(route.id) || route.model;
    const run = () => runGameBrainOnAccounts(model, options => attempt(model, options), {
      signal, homes: route.codexHomes, allowPersonalAccount: route.allowPersonalAccount,
    });
    result = await run();
    if (index === 0 && retryPrimary && shouldRetryPickWithModel(result)) result = await run();
    // A capped Claude brain restarts the same full analysis on its heavy
    // sibling on the same subscription (founder, Sep 22 2026: "a Claude on
    // which can use multiple models if Fable is at capacity") before the pick
    // leaves Claude. Only a usage cap does this; any other failure moves on.
    let usedModel = model;
    for (const sibling of (route.siblings || []).filter(m => m === 'claude-opus-5' && m !== model)) {
      if (!shouldRetryPickWithModel(result) || !CLAUDE_CAP.test(`${result?.error || ''} ${JSON.stringify(result?.failures || '')}`)) break;
      console.warn(`[Game Brain] ${usedModel} is at its cap; ${sibling} restarts the analysis on the Claude subscription`);
      usedModel = sibling;
      result = await runGameBrainOnAccounts(sibling, options => attempt(sibling, options), { signal });
    }
    if (!shouldRetryPickWithModel(result)) {
      if (result?.pick && !result.error) result._modelUsed ??= usedModel;
      return result;
    }
    console.warn(`[Game Brain] ${route.id} did not complete: ${result?.error || 'no pick'}; trying the next authorized route`);
  }
  return result;
}
