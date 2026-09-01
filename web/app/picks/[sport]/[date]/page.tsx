import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppStoreButton } from '@/components/AppStoreButton';
import { JsonLd } from '@/components/JsonLd';
import { PageMasthead, ResultLetter, StitchRule } from '@/components/Terminal';
import { isArchiveDate } from '@/lib/gary/archive';
import { etDateLabel, etTime, oddsText } from '@/lib/gary/format';
import { adjacentDates, fetchGameDay, fetchLeagueDates, gameSlug, matchPickResult } from '@/lib/gary/gamepage';
import { sportBySlug } from '@/lib/gary/leagues';
import { SITE_URL, pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 3600;

type Params = Promise<{ sport: string; date: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { sport, date } = await params;
  const cfg = sportBySlug(sport);
  if (!cfg || !isArchiveDate(date)) return { robots: { index: false } };
  const day = etDateLabel(date);
  return pageMetadata({
    canonical: `/picks/${cfg.slug}/${date}`,
    title: `${cfg.longName} Picks, ${day} — Every Game, Graded | Gary AI`,
    description: `Gary's ${cfg.longName} picks for ${day}: every game on the board with the reasoning behind each pick, and how each one finished.`,
  });
}

/**
 * One league, one day: the board as it was posted, with every result attached.
 * This is the shelf the per-game pages sit on — a date page links every game,
 * and the previous/next links walk the whole season without a search box.
 */
export default async function LeagueDayPage({ params }: { params: Params }) {
  const { sport, date } = await params;
  const cfg = sportBySlug(sport);
  if (!cfg || !isArchiveDate(date)) notFound();

  const [day, dates] = await Promise.all([fetchGameDay(cfg.slug, date), fetchLeagueDates(cfg.code)]);
  if (!day) notFound();

  const rows = day.picks.map(pick => ({ pick, result: matchPickResult(pick, day.results) }));
  const wins = rows.filter(r => (r.result?.result ?? '').trim().toLowerCase() === 'won').length;
  const losses = rows.filter(r => (r.result?.result ?? '').trim().toLowerCase() === 'lost').length;
  const pushes = rows.filter(r => (r.result?.result ?? '').trim().toLowerCase() === 'push').length;
  const graded = wins + losses + pushes;
  const { prev, next } = adjacentDates(dates, date);
  const label = etDateLabel(date);

  return (
    <main className="mx-auto max-w-4xl px-5 pb-20 pt-12">
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Gary AI', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Picks', item: `${SITE_URL}/picks` },
          { '@type': 'ListItem', position: 3, name: cfg.longName, item: `${SITE_URL}/picks/${cfg.slug}` },
          { '@type': 'ListItem', position: 4, name: label, item: `${SITE_URL}/picks/${cfg.slug}/${date}` },
        ],
      }} />
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'ItemList',
        name: `Gary AI ${cfg.longName} picks for ${label}`,
        numberOfItems: rows.length,
        itemListElement: rows.map(({ pick }, i) => ({
          '@type': 'ListItem', position: i + 1,
          name: `${pick.awayTeam} at ${pick.homeTeam}: ${pick.pick}`,
          url: `${SITE_URL}/picks/${cfg.slug}/${date}/${gameSlug(pick.awayTeam, pick.homeTeam)}`,
        })),
      }} />

      <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.05em] text-low">
        <Link href="/picks" className="text-gold underline decoration-gold/40 underline-offset-4">Picks</Link>
        <span aria-hidden>/</span>
        <Link href={`/picks/${cfg.slug}`} className="text-gold underline decoration-gold/40 underline-offset-4">{cfg.longName}</Link>
        <span aria-hidden>/</span>
        <span>{date}</span>
      </nav>

      <div className="mt-5">
        <PageMasthead title={`${cfg.longName} picks, ${label}`} meta={`${cfg.code} · ${rows.length} game${rows.length === 1 ? '' : 's'}`}>
          {graded > 0 && (
            <p className="tnum mt-3 font-mono text-[12px] text-low">
              THE DAY · <span className="text-win">{wins}</span>-<span className="text-loss">{losses}</span>
              {pushes > 0 ? ` (${pushes} push${pushes === 1 ? '' : 'es'})` : ''}
              {graded < rows.length ? ` · ${rows.length - graded} not graded` : ''}
            </p>
          )}
        </PageMasthead>
      </div>

      <ol className="mt-8 divide-y divide-line rounded-panel border border-line bg-card">
        {rows.map(({ pick, result }) => {
          const slug = gameSlug(pick.awayTeam, pick.homeTeam);
          const time = etTime(pick.commence_time) ?? pick.time ?? null;
          const call = (pick.pick ?? '').replace(/[+-]\d{3,}\s*$/, '').trim();
          const odds = oddsText(pick.odds ?? (pick.pick ?? '').match(/[+-]\d{3,}\s*$/)?.[0]);
          const res = (result?.result ?? '').trim().toLowerCase();
          return (
            <li key={`${slug}-${pick.pick}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-4 sm:grid-cols-[6rem_1fr_auto_auto]">
              <span className="tnum font-mono text-[11px] text-low sm:order-1">{time ?? '—'}</span>
              <Link
                href={`/picks/${cfg.slug}/${date}/${slug}`}
                className="col-span-2 font-display text-[1.35rem] uppercase leading-none text-hi transition-colors hover:text-gold sm:order-2 sm:col-span-1"
              >
                {pick.awayTeam} at {pick.homeTeam}
              </Link>
              <span className="flex items-baseline gap-2 sm:order-3">
                <span className="font-mono text-[13px] font-bold text-gold">{call}</span>
                {odds && <span className="tnum font-mono text-[12px] text-low">{odds}</span>}
              </span>
              <span className="tnum flex items-center justify-end gap-2 font-mono text-[12px] text-low sm:order-4 sm:min-w-[7rem]">
                {res ? (
                  <>
                    <ResultLetter result={res} />
                    {result?.final_score && <span>Final {result.final_score}</span>}
                  </>
                ) : (
                  <span>Not graded</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.05em]">
        {prev ? (
          <Link href={`/picks/${cfg.slug}/${prev}`} className="text-gold underline decoration-gold/40 underline-offset-4">← {prev}</Link>
        ) : <span />}
        <Link href={`/archive/${date}`} className="text-low underline decoration-white/20 underline-offset-4 hover:text-gold">Every sport this day</Link>
        {next ? (
          <Link href={`/picks/${cfg.slug}/${next}`} className="text-gold underline decoration-gold/40 underline-offset-4">{next} →</Link>
        ) : <span />}
      </div>

      <StitchRule tone="faint" className="mt-12" />
      <section className="mt-8 flex flex-wrap items-center justify-between gap-5">
        <p className="max-w-xl text-[15px] leading-relaxed text-mid">
          Every pick Gary posts is graded in public and stays on his record, wins and losses. The full card, the props,
          and the ride-or-fade book live in the app.
        </p>
        <AppStoreButton surface={`league_day_${cfg.slug}`} />
      </section>
    </main>
  );
}
