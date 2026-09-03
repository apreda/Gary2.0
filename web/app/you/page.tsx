import type { Metadata } from 'next';
import Link from 'next/link';
import { PageMasthead } from '@/components/Terminal';
import { BookClient } from '@/components/book/BookClient';
import { Leaderboard } from '@/components/book/Leaderboard';
import { garyBoardRows } from '@/lib/book/gary';
import { currentUser } from '@/lib/auth/server';
import { accountHref } from '@/lib/auth/redirect';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = pageMetadata({
  canonical: '/you',
  title: 'Your Book | Gary AI',
  description:
    'Ride or fade Gary’s picks and keep an unfakeable record — plus your own logged bets, graded your way, on the web and in the app.',
  robots: { index: false },
});

// Session-dependent by nature — never prerender one user's book for another.
export const dynamic = 'force-dynamic';

export default async function YouPage() {
  const [user, garyRows] = await Promise.all([currentUser(), garyBoardRows()]);

  return (
    <main className="mx-auto max-w-4xl px-5 pb-20 pt-12">
      <PageMasthead
        title="Your book"
        sub="Tail or fade a published call and the system grades your Book after the final. The leaderboard combines settled game-pick and core-prop choices; Gary's Results headline reports game picks, with props separate."
      />

      {user ? (
        <BookClient garyRows={garyRows} />
      ) : (
        <div className="mt-7 space-y-5">
          <div className="rounded-panel border border-gold/40 bg-card px-6 py-7">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-gold">
              Your free web Book
            </p>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-mid">
              Join free and every posted board gives you a BET WITH GARY and a FADE THE BEAR choice.
              Your predictions settle automatically after the final and stay separately labeled from Gary&apos;s record.
              This tracks your call; it never places a real-money wager.
            </p>
            <Link
              href={accountHref('/you', 'signup')}
              className="mt-5 inline-block rounded-chip bg-gold px-5 py-2.5 text-[14px] font-semibold text-ink transition-opacity hover:opacity-90"
            >
              Start My Book — free
            </Link>
          </div>

          <Leaderboard garyRows={garyRows} />
        </div>
      )}
    </main>
  );
}
