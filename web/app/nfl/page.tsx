import type { Metadata } from 'next';
import Image from 'next/image';
import { Eyebrow } from '@/components/Eyebrow';
import { AppStoreButton } from '@/components/AppStoreButton';
import { StitchRule, StatTile, GhostLink } from '@/components/Terminal';
import { fetchAllGameResults, computeRecord, sinceDate } from '@/lib/gary/results';
import { estDateStr, daysAgoEST } from '@/lib/gary/dates';
import { joinWaitlist } from './actions';

export const metadata: Metadata = {
  title: 'NFL Picks for Every Game — Kickoff Sep 9 | Gary AI',
  description:
    'Gary picks every NFL game this season — free in the app, with the reasoning behind each pick, and every result on his public record. First card drops for Kickoff: Patriots at Seahawks, September 9.',
  alternates: { canonical: '/nfl' },
};

const KICKOFF_ISO = '2026-09-09';

/** Whole calendar days from today (ET) to kickoff. Negative once the season is on. */
function daysToKickoff(): number {
  const [y, m, d] = estDateStr(new Date()).split('-').map(Number);
  const [ky, km, kd] = KICKOFF_ISO.split('-').map(Number);
  return Math.round((Date.UTC(ky, km - 1, kd) - Date.UTC(y, m - 1, d)) / 86400000);
}

const covenant = [
  {
    title: 'Every game',
    body: 'A pick on every NFL game, every week of the season. The full board, not a shortlist.',
  },
  {
    title: 'The reasoning',
    body: 'Each of Gary’s picks comes with a full breakdown — the read on the matchup, written out before kickoff.',
  },
  {
    title: 'The record',
    body: 'Every result is on the record by morning, wins and losses. The running tape is public and never edited.',
  },
  {
    title: 'Free',
    body: 'The full daily slate is free in the app. No signup wall.',
  },
];

export default async function NflPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const joined = typeof sp.joined === 'string' ? sp.joined : null;
  const src = (typeof sp.src === 'string' ? sp.src : 'direct').slice(0, 64);

  const days = daysToKickoff();
  const preseason = days > 0;

  const all = await fetchAllGameResults();
  const allTime = computeRecord(all);
  const mlb30 = computeRecord(
    sinceDate(all, daysAgoEST(30)).filter(r => (r.league ?? '').trim().toUpperCase() === 'MLB'),
  );

  return (
    <main className="mx-auto max-w-6xl px-5 py-14">
      {/* Hero */}
      <section className="grid items-center gap-10 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Eyebrow>NFL KICKOFF · SEP 9</Eyebrow>
          <h1 className="mt-4 font-display text-[clamp(2.6rem,5.5vw,4.2rem)] leading-[0.96] text-hi">
            Gary picks every NFL game
            <br />
            <span className="text-gold">this season.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-mid">
            A pick for every game, every week — free in the app, with the reasoning behind
            it, and every result on his record, wins and losses.{' '}
            {preseason
              ? 'The first card drops for Kickoff: Patriots at Seahawks, Wednesday September 9.'
              : 'The season is on — today’s card is live in the app.'}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <AppStoreButton surface="nfl_page_hero" />
            <GhostLink href="/results">See the record</GhostLink>
          </div>
        </div>
        <div className="hidden justify-center lg:col-span-4 lg:flex">
          <Image src="/brand/gary-icon.png" alt="Gary the bear" width={260} height={260} />
        </div>
      </section>

      {/* Kickoff board */}
      <section className="mt-14">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Kickoff" value="SEP 9" sub="Patriots at Seahawks · 8:20 PM ET" />
          <StatTile
            label={preseason ? 'Days out' : 'Season'}
            value={preseason ? (days === 1 ? 'TOMORROW' : String(days)) : 'LIVE'}
            valueClassName="text-gold"
            sub={preseason ? 'first card posts before the game' : 'a card for every game, every week'}
          />
          <StatTile
            label="The summer tape"
            value={`${mlb30.wins}-${mlb30.losses}`}
            sub="MLB, last 30 days · every result public"
          />
        </div>
      </section>

      {/* The season covenant */}
      <section className="mt-16">
        <Eyebrow>WHAT YOU GET ALL SEASON</Eyebrow>
        <StitchRule className="mt-4" />
        {covenant.map((c, i) => (
          <div key={c.title}>
            {i > 0 && <StitchRule tone="faint" />}
            <div className="grid gap-2 py-7 md:grid-cols-12 md:items-baseline">
              <h2 className="font-display text-2xl uppercase text-hi md:col-span-3">{c.title}</h2>
              <p className="max-w-2xl text-[15px] leading-relaxed text-mid md:col-span-9">{c.body}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Proof: the summer on the record */}
      <section className="mt-10 rounded-panel border border-line bg-card px-7 py-9">
        <Eyebrow>GARY DOESN&apos;T START COLD</Eyebrow>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-mid">
          Gary has been on the board every day all summer — a pick on every MLB game, graded
          in public the next morning. He&apos;s {mlb30.wins}-{mlb30.losses} over the last 30
          days, and the all-time tape is{' '}
          {`${allTime.wins.toLocaleString('en-US')}-${allTime.losses.toLocaleString('en-US')}${
            allTime.pushes > 0 ? `-${allTime.pushes}` : ''
          }`}{' '}
          across {allTime.graded.toLocaleString('en-US')} graded picks. Every one of them,
          including the losses, is still up.
        </p>
        <div className="mt-6">
          <GhostLink href="/results">The full record</GhostLink>
        </div>
      </section>

      {/* Kickoff notify */}
      <section id="notify" className="mt-16">
        <Eyebrow>THE FIRST CARD</Eyebrow>
        <StitchRule className="mt-4" />
        <div className="mt-7 max-w-xl">
          {joined === '1' ? (
            <>
              <h2 className="font-display text-3xl uppercase text-hi">You&apos;re on the list</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-mid">
                We&apos;ll email you when Gary&apos;s first NFL card posts on September 9.
                That&apos;s the only email. If you want the summer picks in the meantime,
                the app is free.
              </p>
              <div className="mt-6">
                <AppStoreButton surface="nfl_page_joined" />
              </div>
            </>
          ) : (
            <>
              <h2 className="font-display text-3xl uppercase text-hi">Get the Week 1 card</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-mid">
                Drop your email and we&apos;ll send Gary&apos;s first NFL card when it posts
                on September 9. One email at kickoff, nothing else.
              </p>
              {joined === '0' && (
                <p className="mt-3 text-[14px] text-loss">
                  That didn&apos;t go through on our end. The App Store link below works today.
                </p>
              )}
              <form action={joinWaitlist} className="mt-5 flex flex-col gap-3 sm:flex-row">
                <input type="hidden" name="src" value={src} />
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="hidden"
                />
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="you@example.com"
                  className="w-full rounded-card border border-line bg-card px-4 py-3 text-[15px] text-hi placeholder:text-faint focus:border-gold/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 sm:max-w-sm"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-card bg-gold px-6 py-3 font-body text-sm font-semibold text-ink shadow-card transition-[transform,opacity] duration-150 hover:opacity-95 hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                >
                  Send me the first card
                </button>
              </form>
            </>
          )}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mt-16 rounded-panel border border-line bg-card px-7 py-12 text-center">
        <h2 className="font-display text-[clamp(2rem,4.5vw,3rem)] uppercase leading-[0.95] text-hi">
          Set before kickoff
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-mid">
          The app is live now with the full summer slate, free. Get it today and
          Gary&apos;s Week 1 board is waiting for you on September 9.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-4">
          <AppStoreButton surface="nfl_page_footer" />
          <GhostLink href="/picks">Browse today&apos;s picks</GhostLink>
        </div>
      </section>
    </main>
  );
}
