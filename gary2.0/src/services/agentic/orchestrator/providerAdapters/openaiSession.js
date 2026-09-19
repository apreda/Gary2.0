// September 19: API-key billing is forbidden. Use the subscription cascade.
export const isOpenAiModel = model => /^gpt-/.test(String(model||''));
export function createOpenAISession() { throw Object.assign(new Error('BILLING_POLICY: metered Anthropic and OpenAI are disabled'), {code:'BILLING_POLICY'}); }
export function sendToOpenAISession() { throw Object.assign(new Error('BILLING_POLICY: metered Anthropic and OpenAI are disabled'), {code:'BILLING_POLICY'}); }
export function resetOpenAISessionChat() { throw Object.assign(new Error('BILLING_POLICY: metered Anthropic and OpenAI are disabled'), {code:'BILLING_POLICY'}); }
