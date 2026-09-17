import { todayEST } from '@/lib/gary/dates';
import { isArchiveDate } from '@/lib/gary/archive';
import type { Metadata } from 'next';
import { PageMasthead } from '@/components/Terminal';
import { WinnersClient } from '@/components/book/WinnersClient';
import { pageMetadata } from '@/lib/seo/metadata';
export const metadata: Metadata = pageMetadata({
  canonical: '/winners',
  title: 'Winners — Gary’s Best Bets of the Day | Gary AI',
  description:
    'Gary’s best bets of the day. His favorite game and prop picks, with a separate record that includes every win and loss.',
});
export default async function WinnersPage({searchParams}:{searchParams:Promise<{date?:string}>}) {
  const {date}=await searchParams;const initialDate=date&&isArchiveDate(date)&&date>='2026-09-04'&&date<=todayEST()?date:todayEST();
  return (
    <main className="mx-auto max-w-4xl px-5 pb-20 pt-12">
      <PageMasthead
        title="Winners"
        sub="Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most."
      />
      <WinnersClient initialDate={initialDate} />
    </main>
  );
}
