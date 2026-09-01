import type { Metadata } from 'next';
import Link from 'next/link';
import { PageMasthead } from '@/components/Terminal';
import { BookClient } from '@/components/book/BookClient';
import { Leaderboard } from '@/components/book/Leaderboard';
import { garyBoardRows } from '@/lib/book/gary';
import { currentUser } from '@/lib/auth/server';
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
        sub="Ride a pick or fade it, and the system grades you the same way it grades Gary — a record nobody can fudge. Your own plays live alongside, labeled."
      />

      {user ? (
        <BookClient garyRows={garyRows} />
      ) : (
        <div className="mt-7 space-y-5">
          <div className="rounded-panel border border-gold/40 bg-card px-6 py-7">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-gold">
              One account, both surfaces
            </p>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-mid">
              Sign in and every pick on the board grows a BET WITH GARY and a FADE THE BEAR button.
              Your rides settle automatically, your record is public-proof, and the same book follows
              you into the iOS app.
            </p>
            <Link
              href="/account?next=%2Fyou"
              className="mt-5 inline-block rounded-chip bg-gold px-5 py-2.5 text-[14px] font-semibold text-ink transition-opacity hover:opacity-90"
            >
              Sign in to start your book
            </Link>
          </div>

          <Leaderboard garyRows={garyRows} />
        </div>
      )}
    </main>
  );
}
