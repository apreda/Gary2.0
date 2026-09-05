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
    'Keep a private record of your own bets, odds and results. Tail or fade Gary’s published picks in a separately labeled, automatically graded record.',
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
        sub="Your picks. Your odds. Your record. Log your own bets privately, or tail and fade Gary's published calls."
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
              Log a bet, enter the odds and units you took, and add the result when you know it.
              Keep notes, review your record and export it. Your manual entries are private and
              self-graded; they never count toward public rankings.
            </p>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-mid">
              Want to make a call on Gary&apos;s board? Choose BET WITH GARY or FADE THE BEAR.
              Those choices settle automatically and stay separately labeled from your manual bets
              and Gary&apos;s record. Gary never places a real-money wager or connects to your sportsbook.
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
