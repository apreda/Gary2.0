import Link from 'next/link';
import { etTime } from '@/lib/gary/format';
import { sportByCode } from '@/lib/gary/leagues';
import type { BoardSummary } from '@/lib/today/model';

export function TodayBoardStatus({
  summaries,
  unavailable = false,
}: {
  summaries: BoardSummary[];
  unavailable?: boolean;
}) {
  return (
    <section className="rounded-panel border border-line bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl uppercase text-hi">Board status</h2>
        <Link
          href="/picks"
          className="text-[13px] text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
        >
          Full board →
        </Link>
      </div>

      {unavailable ? (
        <p className="mt-4 text-[14px] leading-relaxed text-low">
          Board status is temporarily unavailable. Open the full board to try again.
        </p>
      ) : summaries.length > 0 ? (
        <ul className="mt-4">
          {summaries.map(summary => {
            const sport = sportByCode(summary.league);
            return (
              <li key={summary.league} className="border-b border-line py-3.5 last:border-0">
                <Link
                  href={sport ? `/picks/${sport.slug}` : '/picks'}
                  className="group flex items-center justify-between gap-4 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: sport?.accent ?? '#777' }}
                    />
                    <span className="font-mono text-[12px] font-bold uppercase tracking-[0.06em] text-hi group-hover:text-gold-light">
                      {sport?.name ?? summary.league}
                    </span>
                  </span>
                  <span className="tnum text-right font-mono text-[11px] text-low">
                    {summary.posted}/{summary.games} posted
                    {summary.nextStart ? ` · ${etTime(summary.nextStart) ?? 'time TBD'}` : ''}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-[14px] leading-relaxed text-low">
          The morning slate is still loading. This panel fills as today&apos;s schedule arrives.
        </p>
      )}
    </section>
  );
}
