// Retired API transport: no caller may spend Anthropic credits.
export async function anthropicWebSearchRaw() { throw Object.assign(new Error('BILLING_POLICY: metered Anthropic search is disabled; use subscriptionSearch'), {code:'BILLING_POLICY'}); }
