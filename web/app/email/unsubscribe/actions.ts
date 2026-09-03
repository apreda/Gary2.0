'use server';

import { redirect } from 'next/navigation';
import { unsubscribeEmailSubscription } from '@/lib/email/store';
import { isSubscriptionId, isUnsubscribeToken, unsubscribeTokenHash } from '@/lib/email/tokens';

export async function confirmUnsubscribe(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const token = String(formData.get('token') ?? '');
  if (!isSubscriptionId(id) || !isUnsubscribeToken(token)) {
    redirect('/email/unsubscribe?status=invalid');
  }

  let unsubscribed = false;
  try {
    unsubscribed = await unsubscribeEmailSubscription(id, unsubscribeTokenHash(token));
  } catch (error) {
    console.error(JSON.stringify({ event: 'email_unsubscribe_failed', code: error instanceof Error ? error.name : 'unknown' }));
    redirect(`/email/unsubscribe?status=error&id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`);
  }

  if (!unsubscribed) redirect('/email/unsubscribe?status=invalid');
  redirect('/email/unsubscribe?status=done');
}
