'use server';

import { redirect } from 'next/navigation';
import { emailTokenSecret } from '@/lib/email/config';
import { confirmEmailSubscription } from '@/lib/email/store';
import {
  confirmationTokenHash,
  isConfirmationToken,
  isSubscriptionId,
  signConfirmationReceipt,
} from '@/lib/email/tokens';

export async function confirmEmailUpdates(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const token = String(formData.get('token') ?? '');
  if (!isSubscriptionId(id) || !isConfirmationToken(token)) {
    redirect('/email/confirm?status=invalid');
  }

  let confirmed: Awaited<ReturnType<typeof confirmEmailSubscription>>;
  try {
    confirmed = await confirmEmailSubscription(id, confirmationTokenHash(token));
  } catch (error) {
    console.error(JSON.stringify({ event: 'email_confirmation_activation_failed', code: error instanceof Error ? error.name : 'unknown' }));
    redirect(`/email/confirm?status=error&id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`);
  }

  if (!confirmed) redirect('/email/confirm?status=invalid');
  const source = confirmed.source.replace(/[^a-z0-9_.:/-]/gi, '').slice(0, 100) || 'website';
  const secret = emailTokenSecret();
  const receipt = signConfirmationReceipt(confirmed.id, confirmed.cadence, source, secret);
  const params = new URLSearchParams({
    status: 'done',
    id: confirmed.id,
    cadence: confirmed.cadence,
    source,
    receipt,
  });
  redirect(`/email/confirm?${params}`);
}
