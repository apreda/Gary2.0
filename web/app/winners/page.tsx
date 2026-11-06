import type { Metadata } from 'next';
import { WinnersClient } from '@/components/book/WinnersClient';
import '@/components/book/winners.css';
import { isArchiveDate } from '@/lib/gary/archive';
import { daysBefore, todayEST } from '@/lib/gary/dates';
import { fetchWinnersNight } from '@/lib/gary/winners-recap';
import { pageMetadata } from '@/lib/seo/metadata';
export const metadata: Metadata = pageMetadata({
  canonical: '/winners',
  title: 'Winners — Gary’s Best Bets of the Day | Gary AI',
  description:
    'Gary’s best bets of the day. His favorite game and prop picks, with a separate record that includes every win and loss.',
});
export default async function WinnersPage({searchParams}:{searchParams:Promise<{date?:string}>}) {
  const {date}=await searchParams;
  const today=todayEST();
  const initialDate=date&&isArchiveDate(date)&&date>='2026-09-04'&&date<=today?date:undefined;
  // The logo is how Gary did the night before, as on the app.
  const night=await fetchWinnersNight(daysBefore(today,1)).catch(()=>null);
  return (
    <main className="win-page">
      <WinnersClient initialDate={initialDate} mood={night?.mood ?? null} />
    </main>
  );
}
