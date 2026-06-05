import type { Metadata } from 'next';
import { PropCard } from '@/components/PropCard';
import { Eyebrow } from '@/components/Eyebrow';
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
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Eyebrow>PROPS · {todayEST()}</Eyebrow>
      <h1 className="mt-2 font-display text-4xl text-white/95">Today&apos;s Props</h1>

      {hr.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-2xl text-white/95">Gary Home Run Threats</h2>
          <p className="mt-1 text-sm text-white/55">Hitters with the conditions to leave the yard today.</p>
          <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {selectTopProps(hr, 12).map((p, i) => <PropCard key={i} prop={p} />)}
          </div>
        </section>
      )}

      {[...byLeague.entries()].map(([code, items]) => (
        <section key={code} className="mt-10">
          <h2 className="font-display text-2xl text-white/95">{code} Props</h2>
          <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {selectTopProps(items, 30).map((p, i) => <PropCard key={i} prop={p} />)}
          </div>
        </section>
      ))}

      {(!props || props.length === 0) && (
        <div className="mt-10 rounded-[20px] border border-white/10 bg-card p-10 text-center text-white/50">
          Today&apos;s props haven&apos;t dropped yet — they land with the morning slate.
        </div>
      )}
    </main>
  );
}
