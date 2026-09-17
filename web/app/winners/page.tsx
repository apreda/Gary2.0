import { todayEST } from '@/lib/gary/dates';
import { isArchiveDate } from '@/lib/gary/archive';
import type { Metadata } from 'next';
import { PageMasthead } from '@/components/Terminal';
import { WinnersClient } from '@/components/book/WinnersClient';
import { pageMetadata } from '@/lib/seo/metadata';
export const metadata: Metadata = pageMetadata({
  canonical: '/winners',
  title: 'Winners | Gary AI',
  description:
    'Gary’s selected Winners picks, with original odds and reasoning, connected to your membership and your free Book.',
});
export default async function WinnersPage({searchParams}:{searchParams:Promise<{date?:string}>}) {
  const {date}=await searchParams;const initialDate=date&&isArchiveDate(date)&&date>='2026-09-04'&&date<=todayEST()?date:todayEST();
  return (
    <main className="mx-auto max-w-4xl px-5 pb-20 pt-12">
      <PageMasthead
        title="Winners"
        sub="Gary’s selected picks, with their own win–loss record. The pick is Gary’s. The choice is yours."
      />
      <WinnersClient initialDate={initialDate} />
    </main>
  );
}
