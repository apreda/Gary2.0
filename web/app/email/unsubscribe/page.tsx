import type { Metadata } from 'next';
import Link from 'next/link';
import { confirmUnsubscribe } from './actions';
import { isEmailUnsubscribeTokenValid } from '@/lib/email/store';
import { isSubscriptionId, isUnsubscribeToken, unsubscribeTokenHash } from '@/lib/email/tokens';
import { PageMasthead } from '@/components/Terminal';

export const metadata: Metadata = {
  title: 'Email Preferences | Gary AI',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = typeof params.status === 'string' ? params.status : null;
  const id = typeof params.id === 'string' ? params.id : '';
  const token = typeof params.token === 'string' ? params.token : '';
  let valid = false;
  let validationUnavailable = false;
  try {
    valid = isSubscriptionId(id)
      && isUnsubscribeToken(token)
      && await isEmailUnsubscribeTokenValid(id, unsubscribeTokenHash(token));
  } catch (error) {
    validationUnavailable = true;
    console.error(JSON.stringify({
      event: 'email_unsubscribe_validation_failed',
      code: error instanceof Error ? error.name : 'unknown',
    }));
  }

  const done = status === 'done';
  const errored = status === 'error';
  const temporarilyUnavailable = errored || validationUnavailable;

  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <PageMasthead
        title={done ? 'You’re unsubscribed' : temporarilyUnavailable ? 'Try again shortly' : valid ? 'Stop Gary’s emails?' : 'That link is not valid'}
        meta="EMAIL PREFERENCES"
      >
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-mid">
          {done
            ? 'No more website-update emails will be sent to that address. You can subscribe again anytime.'
            : temporarilyUnavailable
              ? 'We could not check or update that subscription just now. No settings were changed.'
              : valid
                ? 'Confirm below and we’ll stop both daily board alerts and weekly record receipts for this address.'
                : 'The preference link may be incomplete or expired. You can use the unsubscribe link from a newer Gary email.'}
        </p>
      </PageMasthead>
      <div className="mt-7 flex flex-wrap gap-4">
        {valid && !done && (
          <form action={confirmUnsubscribe}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="rounded-card bg-gold px-5 py-3 text-sm font-semibold text-ink">
              {errored ? 'Retry unsubscribe' : 'Yes, unsubscribe me'}
            </button>
          </form>
        )}
        <Link href="/today" className="rounded-card border border-line px-5 py-3 text-sm font-semibold text-hi">Keep reading Gary</Link>
      </div>
    </main>
  );
}
