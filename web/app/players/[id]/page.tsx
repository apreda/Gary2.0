import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicProfile } from '@/components/book/PublicProfile';
export const metadata: Metadata = {
  title: 'Player profile | Gary AI',
  robots: { index: false, follow: true },
};
export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-12">
      <PublicProfile userId={id} />
    </main>
  );
}
