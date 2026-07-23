'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { restInsert } from '@/lib/gary/supabase';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Kickoff-notify signup. Anon insert into launch_waitlist (insert-only RLS,
 * unique on email — repeat submits no-op via ignore-duplicates). The honeypot
 * pretends success so bots learn nothing.
 */
export async function joinWaitlist(formData: FormData) {
  if (String(formData.get('website') ?? '') !== '') redirect('/nfl?joined=1#notify');

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const source = String(formData.get('src') ?? 'direct').slice(0, 64);
  if (email.length > 320 || !EMAIL_RE.test(email)) redirect('/nfl?joined=0#notify');

  const ua = ((await headers()).get('user-agent') ?? '').slice(0, 400);
  try {
    await restInsert('launch_waitlist', { email, source, user_agent: ua }, { onConflict: 'email' });
  } catch {
    redirect('/nfl?joined=0#notify');
  }
  redirect('/nfl?joined=1#notify');
}
