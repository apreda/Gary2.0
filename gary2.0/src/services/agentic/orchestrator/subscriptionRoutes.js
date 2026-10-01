import { discoverCodexHomes, personalCodexHome } from './providerAdapters/codexHomes.js';
import { deepseekConfigured } from './providerAdapters/deepseekSession.js';

// One Claude subscription, several models (founder, Sep 22 2026: "a Claude on
// which can use multiple models if, let's say, Fable is at capacity"). When a
// model hits its usage cap the same turn goes to the next sibling on the same
// subscription before any GPT login is tried. College stays Opus-only by his
// ruling, so it has no siblings.
// The turn's time (founder, Sep 23 2026: "i for sure want to fix that"). An
// even split starved the first account: with Claude, two GPT logins and
// DeepSeek live, Claude got a quarter of a two-minute job, timed out on every
// worker job, and the Plus login did the work after Claude had already spent
// its usage on it. The first account that can answer takes most of the time;
// the backups share the rest. A backup that cannot answer (a capped login)
// fails at once and gives its share straight back.
export const LEAD_SHARE = 0.6;
/**
 * One account's slice of the time left: the lead gets LEAD_SHARE of it when
 * backups follow, a backup an even share of what is left, a lone account all.
 */
export function routeBudget(remaining, liveLeft, lead) {
  if (remaining <= 0) return 0;
  if (liveLeft <= 1) return remaining;
  return lead ? remaining * LEAD_SHARE : remaining / liveLeft;
}

/** A Claude usage cap as the CLI reports it ("You've hit your weekly limit ... (HTTP 429)", "You've reached your Fable limit"). */
export const CLAUDE_CAP = /HTTP 429|usage limit|(hit|reached) your [^.]*limit/i;

// No sibling swap (founder, Oct 1 2026: "Gary is Opus 5.5", and Sonnet is off
// the Claude subscription). A capped Claude model goes straight to the GPT
// logins behind it.
export function claudeSiblings() {
  return [];
}

// CLAUDE USAGE IS FOR GARY AND FOR THE WORDS USERS READ (founder, Oct 1 2026:
// "weekly usage on my subs does matter ... if i run out of usage on Claude
// then im fucked"). Work that named Sonnet or Haiku, and every light read that
// named a GPT model, is background work: GPT 6.1 Sol on the ChatGPT logins
// first, Claude (Opus) only when no GPT login can answer. Heavy work keeps
// Claude first: Gary's picks, props and darts, Winners, and the app's writing.
export const BACKGROUND_GPT = process.env.GARY_BACKGROUND_MODEL || 'codex-gpt-6.1-sol';
export const isBackgroundWork = (raw, tier) => /^claude-(sonnet|haiku)/.test(raw) || (!raw.startsWith('claude-') && tier !== 'heavy');

// September 19: one explicit account order for every lane. College decisions
// retain Sol; light factual readers use Terra on GPT recovery.
export function subscriptionRoutes(primary = BACKGROUND_GPT, { tier = 'light', college = false, env = process.env, home } = {}) {
  const raw = String(primary).replace(/^anthropic-/, '').replace(/^codex-/, '');
  const gptLogins = (model) => [
    ...discoverCodexHomes({ env, home }).map((dir,i) => ({ id: `business-gpt-${i}`, model, codexHomes: [dir] })),
    { id: 'personal-gpt', model, codexHomes: [personalCodexHome({ env, home })], allowPersonalAccount: true },
  ];
  const deepseek = deepseekConfigured(env) ? [{ id: 'deepseek-last', model: 'deepseek' }] : [];
  if (!college && isBackgroundWork(raw, tier)) {
    return [...gptLogins(BACKGROUND_GPT), { id: 'claude-subscription', model: 'claude-opus-5-5', siblings: [] }, ...deepseek];
  }
  const claude = raw.startsWith('claude-') && !isBackgroundWork(raw, tier) ? raw : 'claude-opus-5-5';
  const gpt = college ? 'codex-gpt-5.6-sol' : raw.startsWith('gpt-') ? `codex-${raw}` : tier === 'heavy' ? 'codex-gpt-6-sol' : 'codex-gpt-5.6-terra';
  return [
    // College excluded the Claude subscription while it was pinned to Sol on
    // GPT. NCAAF game picks and props run Opus on the Claude subscription now
    // (founder, Sep 22 2026: "all ncaaf picks should be on Opus not Fable or
    // Astra"), so college takes the Claude route for Opus and only Opus; every
    // other Claude model, Fable included, stays out of college by construction,
    // and the GPT rungs behind it remain Sol.
    // The REQUESTED primary must be Opus: a heavy tier derives Opus as its
    // Claude rung for any model, which would have walked the heavy GPT lane into
    // college through the back door.
    ...(!college || raw === 'claude-opus-5-5' ? [{ id: 'claude-subscription', model: claude, siblings: claudeSiblings() }] : []),
    ...gptLogins(gpt),
    ...deepseek,
  ];
}
