'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sendConfirmationEmail } from '@/lib/email/send';
import {
  releaseEmailConfirmation,
  requestEmailSubscription,
  type EmailCadence,
} from '@/lib/email/store';
import { confirmationTokenHash, createConfirmationToken, signupRateFingerprint } from '@/lib/email/tokens';
import { EMAIL_CONSENT_VERSION, emailRuntimeConfig, isEmailRuntimeReady } from '@/lib/email/config';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CADENCES = new Set<EmailCadence>(['daily', 'weekly', 'both']);

export async function subscribeToEmailUpdates(formData: FormData) {
  if (String(formData.get('website') ?? '') !== '') redirect('/email/subscribed?status=ok');

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const requestedCadence = String(formData.get('cadence') ?? 'both') as EmailCadence;
  const cadence = CADENCES.has(requestedCadence) ? requestedCadence : 'both';
  const source = String(formData.get('source') ?? 'website')
    .replace(/[^a-z0-9_.:/-]/gi, '')
    .slice(0, 100) || 'website';

  if (email.length > 320 || !EMAIL_RE.test(email)) {
    redirect('/email/subscribed?status=invalid');
  }
  if (!isEmailRuntimeReady()) redirect('/email/subscribed?status=error');

  let retryableConfirmation: { id: string; tokenHash: string } | null = null;
  try {
    // Fail closed before writing consent if the sender is not production-ready.
    const config = emailRuntimeConfig();
    const requestHeaders = await headers();
    const userAgent = (requestHeaders.get('user-agent') ?? '').slice(0, 500) || null;
    const vercelForwardedFor = requestHeaders.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
    const forwardedFor = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim();
    const requestIp = (vercelForwardedFor ?? requestHeaders.get('x-real-ip') ?? forwardedFor ?? 'unknown').slice(0, 80);
    const confirmationToken = createConfirmationToken();
    const tokenHash = confirmationTokenHash(confirmationToken);
    const subscription = await requestEmailSubscription({
      email,
      cadence,
      source,
      userAgent,
      tokenHash,
      rateKey: signupRateFingerprint(requestIp, config.tokenSecret),
      consentVersion: EMAIL_CONSENT_VERSION,
    });
    if (subscription.send_confirmation) {
      retryableConfirmation = { id: subscription.id, tokenHash };
      const outcome = await sendConfirmationEmail(subscription, confirmationToken);
      if (outcome !== 'sent' && outcome !== 'duplicate') {
        throw new Error('Confirmation email was rejected by the provider');
      }
      retryableConfirmation = null;
    }
  } catch (error) {
    if (retryableConfirmation) {
      try {
        await releaseEmailConfirmation(retryableConfirmation.id, retryableConfirmation.tokenHash);
      } catch (releaseError) {
        console.error(JSON.stringify({
          event: 'email_confirmation_release_failed',
          code: releaseError instanceof Error ? releaseError.name : 'unknown',
        }));
      }
    }
    console.error(JSON.stringify({ event: 'email_subscription_failed', code: error instanceof Error ? error.name : 'unknown' }));
    redirect('/email/subscribed?status=error');
  }

  redirect(`/email/subscribed?status=ok&cadence=${cadence}&source=${encodeURIComponent(source)}`);
}
