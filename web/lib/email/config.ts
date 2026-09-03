import 'server-only';

export const SITE_ORIGIN = 'https://www.betwithgary.ai';
export const EMAIL_CONSENT_VERSION = '2026-09-03';

export interface EmailRuntimeConfig {
  apiKey: string;
  from: string;
  replyTo: string;
  tokenSecret: string;
  postalAddress: string;
}

/** Keep signup and scheduled sends off until every server-side dependency is
 * present. In particular, commercial email cannot launch without the physical
 * postal address required in each message footer. */
export function isEmailRuntimeReady(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY
      && process.env.EMAIL_TOKEN_SECRET
      && process.env.COMPANY_POSTAL_ADDRESS?.trim()
      && process.env.NEXT_PUBLIC_SUPABASE_URL
      && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function emailTokenSecret(): string {
  const value = process.env.EMAIL_TOKEN_SECRET;
  if (!value) throw new Error('EMAIL_TOKEN_SECRET is not configured');
  return value;
}

export function emailRuntimeConfig(): EmailRuntimeConfig {
  const apiKey = process.env.RESEND_API_KEY;
  const postalAddress = process.env.COMPANY_POSTAL_ADDRESS?.trim();
  const configuredDomain = (process.env.RESEND_EMAIL_DOMAIN ?? 'betwithgary.ai')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  if (!postalAddress) throw new Error('COMPANY_POSTAL_ADDRESS is not configured');

  return {
    apiKey,
    tokenSecret: emailTokenSecret(),
    from: process.env.RESEND_FROM_EMAIL ?? `Gary AI <updates@${configuredDomain}>`,
    replyTo: process.env.RESEND_REPLY_TO ?? 'support@betwithgary.ai',
    postalAddress,
  };
}
