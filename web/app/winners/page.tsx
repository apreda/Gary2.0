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
    'Gary’s reviewed Winners boards. Original published tickets, connected to your membership and your free Book.',
});
export default async function WinnersPage({searchParams}:{searchParams:Promise<{date?:string}>}) {
  const {date}=await searchParams;const initialDate=date&&isArchiveDate(date)&&date>='2026-09-04'&&date<=todayEST()?date:todayEST();
  return (
    <main className="mx-auto max-w-4xl px-5 pb-20 pt-12">
      <PageMasthead
        title="Winners"
        sub="A smaller board. A closer look. The call is Gary’s. The choice is yours."
      />
      <WinnersClient initialDate={initialDate} />
    </main>
  );
}
