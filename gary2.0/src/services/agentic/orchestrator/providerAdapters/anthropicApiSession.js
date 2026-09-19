// September 19: API-key billing is forbidden. Use the subscription cascade.
export const isAnthropicApiModel = model => /^anthropic-/.test(String(model||''));
export function createAnthropicApiSession() { throw Object.assign(new Error('BILLING_POLICY: metered Anthropic and OpenAI are disabled'), {code:'BILLING_POLICY'}); }
export function sendToAnthropicApiSession() { throw Object.assign(new Error('BILLING_POLICY: metered Anthropic and OpenAI are disabled'), {code:'BILLING_POLICY'}); }
export function resetAnthropicApiSessionChat() { throw Object.assign(new Error('BILLING_POLICY: metered Anthropic and OpenAI are disabled'), {code:'BILLING_POLICY'}); }
