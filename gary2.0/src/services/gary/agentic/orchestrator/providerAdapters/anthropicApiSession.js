// September 19: direct SDK billing is off. Since Oct 13 2026 the API credit is spent only through the Claude CLI's
// claude-api-<model> route after the subscription (claudeCliSession.js, subscriptionRoutes.js); this SDK path stays off.
export const isAnthropicApiModel = model => /^anthropic-/.test(String(model||''));
export function createAnthropicApiSession() { throw Object.assign(new Error('BILLING_POLICY: metered Anthropic and OpenAI are disabled'), {code:'BILLING_POLICY'}); }
export function sendToAnthropicApiSession() { throw Object.assign(new Error('BILLING_POLICY: metered Anthropic and OpenAI are disabled'), {code:'BILLING_POLICY'}); }
export function resetAnthropicApiSessionChat() { throw Object.assign(new Error('BILLING_POLICY: metered Anthropic and OpenAI are disabled'), {code:'BILLING_POLICY'}); }
