import type { Metadata } from 'next';
import Link from 'next/link';
import { PageMasthead } from '@/components/Terminal';
import { Leaderboard } from '@/components/book/Leaderboard';
import { garyBoardRows } from '@/lib/book/gary';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = pageMetadata({
  canonical: '/leaderboard',
  title: 'Leaderboard | Gary AI',
  description:
    'Real people. Verified predictions. Find the hot streaks, compare records, and build your own free Book.',
});
export const revalidate = 300;
export default async function LeaderboardPage() {
  const garyRows = await garyBoardRows();
  return (
    <main className="mx-auto max-w-4xl px-5 pb-20 pt-12">
      <PageMasthead
        title="Earn your place."
        sub="A good call is a start. A record tells the story. Follow the hot streaks and see who keeps getting it right."
      />
      <div className="mb-7 mt-5 flex gap-5 text-[13px]">
        <Link href="/you" className="text-gold underline underline-offset-4">
          Open your free Book →
        </Link>
        <Link href="/picks" className="text-mid underline underline-offset-4">
          Make your next call
        </Link>
      </div>
      <Leaderboard garyRows={garyRows} />
    </main>
  );
}
