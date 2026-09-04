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
export default function WinnersPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 pb-20 pt-12">
      <PageMasthead
        title="Winners"
        sub="The plays Gary would make. Every ticket passes review before it earns a place on the board."
      />
      <WinnersClient />
    </main>
  );
}
