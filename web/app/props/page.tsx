import Image from 'next/image';
import type { Metadata } from 'next';
import { PropCard } from '@/components/PropCard';
import { PageMasthead, StitchRule } from '@/components/Terminal';
import { fetchTodayPropPicks, splitHrThreats, selectTopProps } from '@/lib/gary/picks';
import { normalizeLeague } from '@/lib/gary/leagues';
import { todayEST } from '@/lib/gary/dates';
import type { PropPick } from '@/lib/gary/types';

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Today's Free Player Prop Picks | Gary AI",
  description:
    "Free player prop picks with the key stats behind each call, plus Gary's Home Run Threats board. Graded daily on the public record.",
  alternates: { canonical: '/props' },
};

export default async function PropsPage() {
  const props = await fetchTodayPropPicks().catch(() => null);

  // Guard grouping behind non-null check (resilience deviation)
  const { hr, rest } = props ? splitHrThreats(props) : { hr: [] as PropPick[], rest: [] as PropPick[] };

  const byLeague = new Map<string, PropPick[]>();
  if (props) {
    for (const p of rest) {
      const code = normalizeLeague(p.league, p.sport) ?? 'OTHER';
      byLeague.set(code, [...(byLeague.get(code) ?? []), p]);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-5 pb-16 pt-12">
      <PageMasthead title="Props board" meta={todayEST()} />

      {hr.length > 0 && (
        <section className="mt-7">
          <h2 className="font-display text-2xl uppercase text-hi">Gary Home Run Threats</h2>
          <p className="mt-1 text-sm text-mid">Hitters with the conditions to leave the yard today.</p>
          <StitchRule tone="faint" className="mt-4" />
          <div className="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {selectTopProps(hr, 12).map((p, i) => <PropCard key={i} prop={p} />)}
          </div>
        </section>
      )}

      {[...byLeague.entries()].map(([code, items]) => (
        <section key={code} className="mt-16">
          <h2 className="font-display text-2xl uppercase text-hi">{code} Props</h2>
          <StitchRule tone="faint" className="mt-4" />
          <div className="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {selectTopProps(items, 30).map((p, i) => <PropCard key={i} prop={p} />)}
          </div>
        </section>
      ))}

      {(!props || props.length === 0) && (
        <div className="mt-7 flex flex-col items-center justify-center rounded-panel border border-line bg-card p-10 text-center">
          <Image src="/brand/gary-cooking.png" alt="" aria-hidden width={110} height={110} />
          <p className="mt-3 text-[15px] text-mid">
            Today&apos;s props haven&apos;t dropped yet — they land with the morning slate.
          </p>
        </div>
      )}
    </main>
  );
}
