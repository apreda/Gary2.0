import type { Metadata } from 'next';
import Link from 'next/link';
import { PageMasthead } from '@/components/Terminal';

export const metadata: Metadata = {
  title: 'Email Updates | Gary AI',
  robots: { index: false, follow: false },
};

export default async function EmailSubscribedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = String(params.status ?? 'ok');
  const success = status === 'ok';

  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <PageMasthead title={success ? 'Check your inbox' : 'That didn’t go through'} meta="GARY EMAIL UPDATES">
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-mid">
          {success
            ? 'If that address needs confirmation, it is on the way. Nothing recurring is sent until the link is confirmed; an already confirmed subscription keeps its current settings.'
            : status === 'invalid'
              ? 'That email address does not look valid. Head back and try it once more.'
              : 'The signup service had a temporary problem. Your address was not added; please try again shortly.'}
        </p>
      </PageMasthead>
      <div className="mt-7 flex flex-wrap gap-4">
        <Link href="/today" className="rounded-card bg-gold px-5 py-3 text-sm font-semibold text-ink">Open today&rsquo;s desk</Link>
        {!success && <Link href="/#updates" className="rounded-card border border-line px-5 py-3 text-sm font-semibold text-hi">Try again</Link>}
      </div>
    </main>
  );
}
