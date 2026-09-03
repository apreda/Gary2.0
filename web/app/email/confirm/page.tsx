import type { Metadata } from 'next';
import Link from 'next/link';
import { EmailSignupTracker } from '@/components/EmailSignupTracker';
import { PageMasthead } from '@/components/Terminal';
import { emailTokenSecret } from '@/lib/email/config';
import {
  isConfirmationToken,
  isSubscriptionId,
  verifyConfirmationReceipt,
} from '@/lib/email/tokens';
import { confirmEmailUpdates } from './actions';

export const metadata: Metadata = {
  title: 'Confirm Email Updates | Gary AI',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = typeof params.status === 'string' ? params.status : null;
  const id = typeof params.id === 'string' ? params.id : '';
  const token = typeof params.token === 'string' ? params.token : '';
  const cadence = ['daily', 'weekly', 'both'].includes(String(params.cadence)) ? String(params.cadence) : 'both';
  const source = String(params.source ?? 'website').replace(/[^a-z0-9_.:/-]/gi, '').slice(0, 100) || 'website';
  const receipt = typeof params.receipt === 'string' ? params.receipt : '';
  const canConfirm = isSubscriptionId(id) && isConfirmationToken(token);
  let confirmed = false;
  if (status === 'done') {
    try {
      confirmed = verifyConfirmationReceipt(id, cadence, source, receipt, emailTokenSecret());
    } catch {
      confirmed = false;
    }
  }

  const errored = status === 'error';
  const title = confirmed ? 'Updates confirmed' : errored ? 'Try that again' : canConfirm ? 'Confirm Gary updates?' : 'That link is not valid';

  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      {confirmed && <EmailSignupTracker cadence={cadence} source={source} />}
      <PageMasthead title={title} meta="GARY EMAIL UPDATES">
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-mid">
          {confirmed
            ? 'You’re set. Gary will send only the cadence you confirmed, and every message includes an unsubscribe option.'
            : errored
              ? 'We could not confirm the request just now. No subscription setting was changed.'
              : canConfirm
                ? 'Confirm below to activate the daily-board alert, Sunday record receipt, or cadence you selected.'
                : 'The confirmation link is incomplete or expired. Submit the email form again to request a fresh one.'}
        </p>
      </PageMasthead>
      <div className="mt-7 flex flex-wrap gap-4">
        {(canConfirm && !confirmed) && (
          <form action={confirmEmailUpdates}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="rounded-card bg-gold px-5 py-3 text-sm font-semibold text-ink">
              Confirm my updates
            </button>
          </form>
        )}
        <Link href="/today" className="rounded-card border border-line px-5 py-3 text-sm font-semibold text-hi">Open today&rsquo;s desk</Link>
      </div>
    </main>
  );
}
