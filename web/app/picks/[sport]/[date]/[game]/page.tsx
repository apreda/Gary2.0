import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { AppStoreButton } from '@/components/AppStoreButton';
import { Eyebrow } from '@/components/Eyebrow';
import { JsonLd } from '@/components/JsonLd';
import { ScoutRead } from '@/components/ScoutRead';
import { ResultLetter, StitchRule } from '@/components/Terminal';
import { isArchiveDate } from '@/lib/gary/archive';
import { etDateLabel, etTime, injuryLines, marketLine, oddsText, parseGameTime, propCall, propLabel, scoutSectionsExcluding } from '@/lib/gary/format';
import {
  fetchGameDay,
  fetchGameProps,
  findGamePicks,
  gameSlug,
  matchPickResult,
  matchPropResult,
  pageSummary,
  propsForGame,
  slateForGame,
} from '@/lib/gary/gamepage';
import { sportBySlug } from '@/lib/gary/leagues';
import { nowMs } from '@/lib/gary/dates';
import type { GaryPick } from '@/lib/gary/types';
import { SITE_URL, pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 3600;

// Generate permanent matchup pages on first request, then retain them in ISR.
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ sport: string; date: string; game: string }>;

function headline(pick: GaryPick): string {
  return `${pick.awayTeam} at ${pick.homeTeam}`;
}
function callOf(pick: GaryPick): string {
  return (pick.pick ?? '').replace(/[+-]\d{3,}\s*$/, '').trim();
}
function oddsOf(pick: GaryPick): string | null {
  return oddsText(pick.odds ?? (pick.pick ?? '').match(/[+-]\d{3,}\s*$/)?.[0]);
}

function publishedLabel(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }) + ' ET';
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { sport, date, game } = await params;
  const cfg = sportBySlug(sport);
  if (!cfg || !isArchiveDate(date)) return { robots: { index: false } };
  const day = await fetchGameDay(cfg.slug, date);
  const picks = day ? findGamePicks(day.picks, cfg.code, game) : [];
  if (!day || picks.length === 0) return { robots: { index: false } };
  const pick = picks[0];
  const canonicalSlug = gameSlug(pick.awayTeam, pick.homeTeam);
  const result = matchPickResult(pick, day.results);
  const res = (result?.result ?? '').trim().toLowerCase();
  const label = etDateLabel(date);
  const summary = pageSummary(pick);
  const hero = callOf(pick).split(/\s+/).slice(0, 4).join('|');
  const card =
    `/api/share-card?hero=${encodeURIComponent(hero)}&league=${encodeURIComponent(cfg.code)}` +
    `&meta=${encodeURIComponent(`${headline(pick)} · ${label}`.toUpperCase())}` +
    (res === 'won' || res === 'lost' ? `&result=${res}` : '');
  return pageMetadata({
    canonical: `/picks/${cfg.slug}/${date}/${canonicalSlug}`,
    title: `${headline(pick)} Prediction and Pick, ${label} | Gary AI`,
    description: summary
      ? `Gary's pick: ${callOf(pick)}. ${summary}`
      : `Gary's ${cfg.longName} pick for ${headline(pick)} on ${label}, with the full reasoning and the graded result.`,
    openGraph: { images: [{ url: card, width: 1080, height: 1080, alt: `${callOf(pick)} — Gary's pick` }] },
    twitter: { card: 'summary_large_image' },
  });
}

/**
 * One game, one permanent page: the call, the lines, the full written read,
 * and how it finished. The read is Gary's own text, unedited — the same words
 * the app shows — and the result comes from the graded table once the game is
 * final, never from the pick itself.
 */
export default async function GamePage({ params }: { params: Params }) {
  const { sport, date, game } = await params;
  const cfg = sportBySlug(sport);
  if (!cfg || !isArchiveDate(date)) notFound();

  const day = await fetchGameDay(cfg.slug, date);
  if (!day) notFound();
  const picks = findGamePicks(day.picks, cfg.code, game);
  if (picks.length === 0) notFound();

  // Canonical slug for this matchup — a containment match on a nickname URL
  // still lands here, but the address bar should carry the real one.
  const canonicalSlug = gameSlug(picks[0].awayTeam, picks[0].homeTeam);
  if (game !== canonicalSlug) permanentRedirect(`/picks/${cfg.slug}/${date}/${canonicalSlug}`);

  const { props: dayProps, results: propResults } = await fetchGameProps(date);
  const lead = [...picks].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
  const slate = slateForGame(day.slate, lead);
  const props = propsForGame(dayProps, lead);
  const label = etDateLabel(date);
  const time = etTime(lead.commence_time) ?? lead.time ?? null;
  const started = (parseGameTime(lead.commence_time)?.getTime() ?? Number.MAX_SAFE_INTEGER) <= nowMs();
  const market = marketLine({
    total: slate?.total ?? lead.total,
    spread: slate?.spread ?? lead.spread,
    mlHome: slate?.ml_home ?? lead.moneylineHome,
    mlAway: slate?.ml_away ?? lead.moneylineAway,
    homeAbbr: lead.homeTeam,
    awayAbbr: lead.awayTeam,
    league: cfg.code,
  });
  const venue = slate?.venue ?? lead.venue ?? null;

  const pageUrl = `${SITE_URL}/picks/${cfg.slug}/${date}/${canonicalSlug}`;
  const body = picks.map(p => (p.rationale ?? p.rationale_plain ?? '')).filter(Boolean).join('\n\n');
  const sourceBooks = [...new Set(
    picks.flatMap(pick => pick.sportsbook_odds ?? []).map(line => line.book?.trim()).filter((book): book is string => !!book),
  )];

  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-12">
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Gary AI', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: cfg.longName, item: `${SITE_URL}/picks/${cfg.slug}` },
          { '@type': 'ListItem', position: 3, name: label, item: `${SITE_URL}/picks/${cfg.slug}/${date}` },
          { '@type': 'ListItem', position: 4, name: headline(lead), item: pageUrl },
        ],
      }} />
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'Article',
        headline: `${headline(lead)}: ${callOf(lead)}`,
        description: pageSummary(lead),
        ...(day.publishedAt ? { datePublished: day.publishedAt } : {}),
        author: { '@type': 'Organization', name: 'Gary AI', url: SITE_URL },
        publisher: { '@type': 'Organization', name: 'Gary A.I. LLC', url: SITE_URL },
        mainEntityOfPage: pageUrl,
        isAccessibleForFree: true,
        articleBody: body,
        about: {
          '@type': 'SportsEvent',
          name: headline(lead),
          startDate: lead.commence_time ?? date,
          ...(venue ? { location: { '@type': 'Place', name: venue } } : {}),
          awayTeam: { '@type': 'SportsTeam', name: lead.awayTeam },
          homeTeam: { '@type': 'SportsTeam', name: lead.homeTeam },
        },
      }} />

      <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.05em] text-low">
        <Link href={`/picks/${cfg.slug}`} className="text-gold underline decoration-gold/40 underline-offset-4">{cfg.longName}</Link>
        <span aria-hidden>/</span>
        <Link href={`/picks/${cfg.slug}/${date}`} className="text-gold underline decoration-gold/40 underline-offset-4">{label}</Link>
      </nav>

      <header className="mt-5">
        <Eyebrow>{cfg.code} · {label}{time ? ` · ${time}` : ''}</Eyebrow>
        <h1 className="mt-2 font-display text-[clamp(2.4rem,7vw,4rem)] uppercase leading-[0.95] text-hi">
          {lead.awayTeam} <span className="text-low">at</span> {lead.homeTeam}
        </h1>
        {(market || venue) && (
          <p className="tnum mt-3 font-mono text-[12px] text-low">
            {[market, venue].filter(Boolean).join(' · ')}
          </p>
        )}
        <StitchRule className="mt-5" />
      </header>

      {/* The call(s) and the result */}
      <section className="mt-8 grid gap-4">
        {picks.map(pick => {
          const result = matchPickResult(pick, day.results);
          const res = (result?.result ?? '').trim().toLowerCase();
          const conf = pick.confidence ? Math.round(pick.confidence * 100) : null;
          const odds = oddsOf(pick);
          return (
            <div key={pick.pick} className="rounded-card border border-gold/40 bg-card p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Eyebrow>Gary&apos;s pick</Eyebrow>
                  <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3">
                    <span className="font-display text-[clamp(1.9rem,5vw,2.6rem)] uppercase leading-none text-gold">{callOf(pick)}</span>
                    {odds && <span className="tnum font-display text-[1.25rem] text-hi/90">{odds}</span>}
                  </p>
                  {conf !== null && <p className="tnum mt-2 font-mono text-[11px] text-low">CONF {conf}%</p>}
                </div>
                <div className="text-right">
                  <Eyebrow dim>Result</Eyebrow>
                  {res ? (
                    <p className="mt-1.5 flex items-baseline justify-end gap-2">
                      <ResultLetter result={res} />
                      <span className={`font-display text-[1.5rem] uppercase leading-none ${res === 'won' ? 'text-win' : res === 'lost' ? 'text-loss' : 'text-gold'}`}>
                        {res === 'won' ? 'Cashed' : res === 'lost' ? 'Lost' : 'Push'}
                      </span>
                      {result?.final_score && <span className="tnum font-mono text-[12px] text-low">Final {result.final_score}</span>}
                    </p>
                  ) : (
                    <p className="mt-1.5 font-mono text-[12px] text-low">{started ? 'Not yet graded' : 'Game not started'}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* The read — full text, nothing behind a fold */}
      {picks.map(pick => {
        const plain = pick.rationale_plain?.trim();
        const full = pick.rationale?.trim();
        const deeper = plain && full && full !== plain ? scoutSectionsExcluding(full, plain) : null;
        const injuries = injuryLines(pick.injuries, pick.awayTeam, pick.homeTeam);
        return (
          <section key={`read-${pick.pick}`} className="mt-10">
            <h2 className="font-display text-[1.7rem] uppercase leading-none text-hi">
              The read{picks.length > 1 ? `: ${callOf(pick)}` : ''}
            </h2>
            <StitchRule tone="faint" className="mb-6 mt-4" />
            {plain ? (
              <>
                <ScoutRead text={plain} />
                {deeper && deeper.length > 0 && (
                  <>
                    <p className="mt-7 font-mono text-[10.5px] font-bold uppercase tracking-[0.09em] text-gold/70">The full analysis</p>
                    <ScoutRead sections={deeper} className="mt-3" />
                  </>
                )}
              </>
            ) : (
              <ScoutRead text={full} />
            )}
            {injuries.length > 0 && (
              <div className="mt-6">
                <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.09em] text-gold/70">Injuries noted</p>
                {injuries.map(line => (
                  <p key={line} className="mt-1.5 text-[15px] leading-[1.68] text-mid">{line}</p>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <section className="mt-12 rounded-panel border border-line bg-card p-6" aria-labelledby="analysis-disclosure-heading">
        <h2 id="analysis-disclosure-heading" className="font-display text-[1.5rem] uppercase leading-none text-hi">About this analysis</h2>
        <dl className="mt-5 grid gap-5 text-[13.5px] leading-relaxed sm:grid-cols-2">
          <div>
            <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold">Who made it</dt>
            <dd className="mt-1.5 text-mid">Gary AI, an AI sports-analysis product operated by Gary A.I. LLC. No human reviewer is claimed unless one is explicitly named.</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold">Published data</dt>
            <dd className="mt-1.5 text-mid">
              {day.publishedAt ? `Board stored ${publishedLabel(day.publishedAt)}.` : `Stored board date: ${label}; an exact publication timestamp is not available in this historical row.`}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold">Odds record</dt>
            <dd className="mt-1.5 text-mid">
              The displayed line is the value retained with the call.
              {sourceBooks.length > 0 ? ` Stored sportsbook sources: ${sourceBooks.join(', ')}.` : ' Source names were not retained with this call.'}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold">Accountability</dt>
            <dd className="mt-1.5 text-mid">
              Read the <Link href="/editorial-standards" className="text-gold underline decoration-gold/40 underline-offset-4">editorial standards</Link>,{' '}
              <Link href="/data-sources" className="text-gold underline decoration-gold/40 underline-offset-4">source policy</Link>, and{' '}
              <Link href="/corrections" className="text-gold underline decoration-gold/40 underline-offset-4">corrections process</Link>.
            </dd>
          </div>
        </dl>
      </section>

      {/* Props written for this game */}
      {props.length > 0 && (
        <section className="mt-12">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[1.7rem] uppercase leading-none text-hi">Props on this game</h2>
            <span className="tnum font-mono text-[11px] text-low">{props.length}</span>
          </div>
          <StitchRule tone="faint" className="mb-6 mt-4" />
          <ul className="grid gap-4">
            {props.map((prop, i) => {
              const result = matchPropResult(prop, propResults);
              const res = (result?.result ?? '').trim().toLowerCase();
              const odds = oddsText(prop.odds);
              return (
                <li key={`${prop.player}-${prop.prop}-${i}`} className="rounded-card border border-line bg-card p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <p>
                      <span className="font-display text-[1.35rem] uppercase leading-none text-hi">{prop.player}</span>
                      <span className="ml-3 font-mono text-[13px] font-bold text-silver">{propCall(prop)} {propLabel(prop.prop)}</span>
                      {odds && <span className="tnum ml-2 font-mono text-[12px] text-low">{odds}</span>}
                    </p>
                    <p className="tnum flex items-center gap-2 font-mono text-[12px] text-low">
                      {res ? (
                        <>
                          <ResultLetter result={res} />
                          {result?.actual_value != null && <span>Actual {String(result.actual_value)}</span>}
                        </>
                      ) : (
                        <span>{started ? 'Not yet graded' : 'Pending'}</span>
                      )}
                    </p>
                  </div>
                  <ScoutRead text={prop.rationale ?? prop.analysis} tone="tight" className="mt-4" />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <StitchRule className="mt-12" />
      <section className="mt-8 flex flex-wrap items-center justify-between gap-5">
        <p className="max-w-xl text-[15px] leading-relaxed text-mid">
          Every pick posts before the game and is graded after, in public. In the app you can ride or fade any
          of them, and your book keeps score against Gary&apos;s.
        </p>
        <AppStoreButton surface={`game_page_${cfg.slug}`} />
      </section>
      <p className="mt-8 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.05em]">
        <Link href={`/picks/${cfg.slug}/${date}`} className="text-gold underline decoration-gold/40 underline-offset-4">Every {cfg.code} game this day</Link>
        <Link href={`/results/${cfg.slug}`} className="text-gold underline decoration-gold/40 underline-offset-4">The {cfg.code} record</Link>
        <Link href={`/picks/${cfg.slug}`} className="text-gold underline decoration-gold/40 underline-offset-4">Today&apos;s {cfg.code} board</Link>
      </p>
    </main>
  );
}
