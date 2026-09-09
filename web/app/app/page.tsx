import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { LaunchOffer } from '@/components/LaunchOffer';
import { LAUNCH_OFFER } from '@/lib/gary/launch-offer';
import { Eyebrow } from '@/components/Eyebrow';
import { AppStoreButton } from '@/components/AppStoreButton';
import { JsonLd } from '@/components/JsonLd';
import { StitchRule, GhostLink } from '@/components/Terminal';
import { ProductTape } from '@/components/site/ProductTape';
import { pageMetadata } from '@/lib/seo/metadata';
import { softwareApplicationJsonLd } from '@/lib/seo/software-application';

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata({
  canonical: '/app',
  title: 'Gary AI for iOS — Every Screen, Shown For Real',
  description:
    "The Gary AI iPhone app, screen by screen: the Home board, the pick card and Gary's take, the game research, The Hub, the Fantasy watch, Winners and the Billfold. Real screenshots and a real recording, nothing mocked.",
});

// Every image below is a capture of the shipping build (2.25, September 8-9
// 2026) taken on the simulator through the app's own screens: real games,
// real picks, real results. Nothing is a mockup.
const SHOT = {
  home: { src: '/site/app/01-home.png', alt: "The Home tab: last night's results, today's slate and Gary's featured game" },
  picks: { src: '/site/app/02b-picks-today.png', alt: "The Picks tab: today's slate in the carousel, one pick card per game" },
  take: { src: '/site/app/02c-picks-today-flipped.png', alt: "A pick card flipped to Gary's written take" },
  game: { src: '/site/app/03-game.png', alt: 'Game research under the pick card: the starters, the numbers and the head-to-head' },
  hub: { src: '/site/app/04-hub.png', alt: 'The Hub: the lead observation, quick research and the research modules' },
  fantasy: { src: '/site/app/05-fantasy.png', alt: 'The Fantasy watch inside The Hub' },
  winners: { src: '/site/app/06-winners.png', alt: 'Winners: the smaller board of reviewed tickets with its own record' },
  billfold: { src: '/site/app/07-billfold.png', alt: "The Billfold: Gary's record, the equity curve and recent picks" },
} as const;

const SHOT_W = 660;
const SHOT_H = 1434;

function Shot({ shot, caption, priority = false, sizes = '(max-width: 640px) 70vw, 300px' }: { shot: { src: string; alt: string }; caption?: string; priority?: boolean; sizes?: string }) {
  return (
    <figure className="m-0">
      <div className="site-shot">
        <Image src={shot.src} alt={shot.alt} width={SHOT_W} height={SHOT_H} sizes={sizes} priority={priority} />
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

const walkthrough: { tab: string; title: string; body: string; shots: { shot: { src: string; alt: string }; caption: string }[]; premium?: boolean }[] = [
  {
    tab: 'HOME',
    title: 'The board, first thing',
    body:
      "Last night's results, today's slate with first pitch and kickoff times, and the game Gary put at the top. Winners picks carry a small gold mark on the board so you know which calls made the smaller board.",
    shots: [{ shot: SHOT.home, caption: 'Home' }],
  },
  {
    tab: 'PICKS',
    title: 'Every game, one card, and the take behind it',
    body:
      "Swipe the day's slate. The front of each card is the pick, the price, and the live score once the game starts; flip it and Gary's full written reasoning is there, unedited. Yesterday's cards stay up with their results.",
    shots: [
      { shot: SHOT.picks, caption: 'The card' },
      { shot: SHOT.take, caption: "Gary's take" },
    ],
  },
  {
    tab: 'PICKS',
    title: 'The research under the card',
    body:
      'Under every card: the starters and their lines, the line itself (where it opened, where it is now, every move in order), the big numbers, the head-to-head, availability and the practice report. Football and baseball share the same shape.',
    shots: [{ shot: SHOT.game, caption: 'Game research' }],
  },
  {
    tab: 'HUB',
    title: 'The Hub',
    body:
      "Dated measurements and connections across the slate: a lead observation, quick research per category, research modules that open independently, a board of the games whose lines are moving, and a reliever workload chart drawn from box-score totals. Observations only — no predictions.",
    shots: [
      { shot: SHOT.hub, caption: 'The Hub' },
      { shot: SHOT.fantasy, caption: 'Fantasy watch' },
    ],
  },
  {
    tab: 'WINNERS',
    title: 'Winners',
    body:
      `The smaller board. Every underdog and every plus-line ticket Gary posts is admitted the moment it is a valid future ticket; favorites fill by conviction toward five a day. It keeps its own graded record. ${LAUNCH_OFFER}`,
    shots: [{ shot: SHOT.winners, caption: 'Winners' }],
    premium: true,
  },
  {
    tab: 'BILLFOLD',
    title: 'The Billfold',
    body:
      "Gary's record is the Winners picks — net at a flat $100 a pick, win rate, the equity curve, and every recent pick. The all-picks record stays one filter away. Your own Book lives beside it: log a bet, tail or fade a pick, and let the app grade it.",
    shots: [{ shot: SHOT.billfold, caption: 'Billfold' }],
  },
];

export default function AppPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-14">
      <JsonLd data={softwareApplicationJsonLd} />

      {/* Hero — two real screens */}
      <section className="grid items-center gap-10 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <Eyebrow>FREE ON IOS</Eyebrow>
          <h1 className="mt-4 font-display text-[clamp(2.8rem,6vw,4.5rem)] leading-[0.94] text-hi">
            Gary&apos;s picks
            <br />
            <span className="text-gold">right in your pocket</span>
          </h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-mid">
            Every game on the slate, the reasoning behind every pick, the research under every card, and a record that keeps the losses. This page shows the app as it is: real screens, a real recording, nothing mocked.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <AppStoreButton surface="app_page_hero" />
            <GhostLink href="/picks">Today&apos;s board on the web</GhostLink>
          </div>
        </div>
        <div className="lg:col-span-6">
          <div className="site-shot-grid mx-auto max-w-[520px]">
            <Shot shot={SHOT.home} caption="Home" priority sizes="(max-width: 640px) 45vw, 240px" />
            <Shot shot={SHOT.take} caption="Gary's take" priority sizes="(max-width: 640px) 45vw, 240px" />
          </div>
        </div>
      </section>

      <LaunchOffer className="mt-8" />

      {/* The tape — a real walkthrough, recorded from the app */}
      <section className="mt-20 grid items-center gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Eyebrow>RECORDED FROM THE APP</Eyebrow>
          <h2 className="mt-3 font-display text-[clamp(2rem,4.5vw,3rem)] uppercase leading-[0.95] text-hi">
            A real day, start to finish
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-mid">
            Yesterday&apos;s cards with their results, a card flipped to Gary&apos;s take, the Winners board, The Hub with the lines moving, and the Billfold. Captured from the shipping build on September 9, 2026 — real picks and real numbers, no staging.
          </p>
          <p className="mt-4 text-[13px] leading-relaxed text-low">
            Screens are read from the same tables the app reads; the recording plays muted and loops.
          </p>
        </div>
        <div className="lg:col-span-7">
          <div className="mx-auto max-w-[340px]">
            <ProductTape
              mp4="/site/app/tape.mp4"
              webm="/site/app/tape.webm"
              poster="/site/app/tape-poster.jpg"
              caption="Recorded September 9, 2026 · Gary 2.25"
            />
          </div>
        </div>
      </section>

      {/* Screen by screen */}
      <section className="mt-20">
        <Eyebrow>SCREEN BY SCREEN</Eyebrow>
        <StitchRule className="mt-4" />
        <div className="mt-2">
          {walkthrough.map((f, i) => (
            <div key={`${f.tab}-${f.title}`}>
              {i > 0 && <StitchRule tone="faint" />}
              <div className="grid gap-8 py-10 lg:grid-cols-12 lg:items-center">
                <div className={f.shots.length > 1 ? 'lg:col-span-6' : 'lg:col-span-7'}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-chip bg-chip px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-low">
                      {f.tab}
                    </span>
                    {f.premium && (
                      <span className="rounded-chip border border-gold/40 px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-gold">
                        ACCOUNT ACCESS
                      </span>
                    )}
                  </div>
                  <h2 className="mt-3 font-display text-3xl uppercase text-hi">{f.title}</h2>
                  <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-mid">{f.body}</p>
                  {f.premium && (
                    <Link
                      href="/pricing"
                      className="mt-3 inline-block text-sm text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
                    >
                      Plans and the free-vs-Winners breakdown →
                    </Link>
                  )}
                </div>
                <div className={f.shots.length > 1 ? 'lg:col-span-6' : 'lg:col-span-5'}>
                  <div className={`site-shot-grid mx-auto ${f.shots.length > 1 ? 'max-w-[520px]' : 'max-w-[260px]'}`}>
                    {f.shots.map(s => <Shot key={s.shot.src} shot={s.shot} caption={s.caption} />)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* What stays free — the honest split */}
      <section className="mt-14 grid gap-4 md:grid-cols-2">
        <div className="quant-panel p-7">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-low">Free, forever</p>
          <ul className="mt-4 space-y-2.5 text-[15px] text-mid">
            <li>The full daily slate — every game, with written reasoning</li>
            <li>The player props board</li>
            <li>The Hub, the research under every card, and the lines as they move</li>
            <li>The complete public track record, losses included</li>
          </ul>
        </div>
        <div className="quant-panel p-7">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-gold">Winners — the smaller board</p>
          <ul className="mt-4 space-y-2.5 text-[15px] text-mid">
            <li>Every underdog and plus-line ticket Gary posts, plus the favorites he holds highest</li>
            <li>The board&apos;s own graded record — Gary&apos;s Billfold record</li>
            <li>Live in-game tracking on your boards</li>
            <li>Included during the launch preview and for founding accounts</li>
          </ul>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mt-16 rounded-panel border border-line bg-card px-7 py-12 text-center">
        <h2 className="font-display text-[clamp(2rem,4.5vw,3rem)] uppercase leading-[0.95] text-hi">
          Every game. Every day.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-mid">
          The full slate of Gary&apos;s picks is live and free. Winners is there when you
          want the smaller board.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-4">
          <AppStoreButton surface="app_page_footer" />
          <GhostLink href="/picks">Browse today&apos;s picks</GhostLink>
        </div>
      </section>
    </main>
  );
}
