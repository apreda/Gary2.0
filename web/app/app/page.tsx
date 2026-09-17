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
  title: 'Gary AI for iOS — Game Picks, Player Props & Best Bets',
  description:
    "Get Gary’s game picks and player props on iPhone. Find his best bets in Winners and explore insights and betting connections in the Hub.",
});

// Every image below is a capture of the shipping build (2.25, September 8-9
// 2026) taken on the simulator through the app's own screens: real games,
// real picks, real results. Nothing is a mockup.
const SHOT = {
  home: { src: '/site/app/01-home.png', alt: "The Home tab: last night's results, today's games and Gary's featured game" },
  picks: { src: '/site/app/02b-picks-today.png', alt: "The Picks tab: today's games in the carousel, one pick card per game" },
  take: { src: '/site/app/02c-picks-today-flipped.png', alt: "A pick card flipped to Gary's written take" },
  game: { src: '/site/app/03-game.png', alt: 'Game research under the pick card: the starters, the numbers and the head-to-head' },
  hub: { src: '/site/app/04-hub.png', alt: 'The Hub: the lead observation, quick research and the research modules' },
  fantasy: { src: '/site/app/05-fantasy.png', alt: 'The Fantasy watch inside The Hub' },
  winners: { src: '/site/app/06-winners.png', alt: 'Winners: Gary’s best bets with their own record' },
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
    title: 'Start with today’s picks',
    body:
      "Today’s games and start times, recent results, and a quick way into Gary’s picks.",
    shots: [{ shot: SHOT.home, caption: 'Home' }],
  },
  {
    tab: 'PICKS',
    title: 'Gary’s take on every game',
    body:
      "Find Gary’s game picks and player props across the day’s games, including home run and touchdown picks when available. Each card shows the pick, the odds, and live scores. Flip it to see why Gary likes the pick.",
    shots: [
      { shot: SHOT.picks, caption: 'The card' },
      { shot: SHOT.take, caption: "Gary's take" },
    ],
  },
  {
    tab: 'PICKS',
    title: 'A closer look at your game',
    body:
      'Open a game to explore the matchup: starters, recent stats, injuries, and how the odds have moved. Available details vary by sport.',
    shots: [{ shot: SHOT.game, caption: 'Game research' }],
  },
  {
    tab: 'HUB',
    title: 'The Hub',
    body:
      "Gary’s insights and betting connections. Explore useful stats, trends, and matchups—from a hitter heating up to a busy bullpen or changing odds—and spot something you might otherwise miss.",
    shots: [
      { shot: SHOT.hub, caption: 'The Hub' },
      { shot: SHOT.fantasy, caption: 'Fantasy watch' },
    ],
  },
  {
    tab: 'WINNERS',
    title: 'Winners',
    body:
      `Gary’s best bets of the day. From all his game and prop picks, these are the bets he likes most—the picks he would bet on. Winners keeps its own record, including losses. ${LAUNCH_OFFER}`,
    shots: [{ shot: SHOT.winners, caption: 'Winners' }],
    premium: true,
  },
  {
    tab: 'BILLFOLD',
    title: 'The Billfold',
    body:
      "See how Gary’s picks have performed, including the losses. Switch between Winners and all picks to explore the record. Your own Book lets you track your bets alongside Gary’s.",
    shots: [{ shot: SHOT.billfold, caption: 'Billfold' }],
  },
];

export default function AppPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-14">
      <JsonLd data={softwareApplicationJsonLd} />

      {/* Hero — two real screens */}
      <section className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <Eyebrow>FREE ON IOS</Eyebrow>
          <h1 className="mt-4 font-display text-[clamp(2.8rem,6vw,4.5rem)] leading-[0.94] text-hi">
            Gary&apos;s picks
            <br />
            <span className="text-gold">right in your pocket</span>
          </h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-mid">
            Game picks and player props for the sports you follow. Gary’s best bets in Winners. Insights and betting connections in the Hub. All in one app.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <AppStoreButton surface="app_page_hero" />
            <GhostLink href="/picks">Today&apos;s picks on the web</GhostLink>
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
      <section className="mt-20 grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Eyebrow>RECORDED FROM THE APP</Eyebrow>
          <h2 className="mt-3 font-display text-[clamp(2rem,4.5vw,3rem)] uppercase leading-[0.95] text-hi">
            A real day, start to finish
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-mid">
            Yesterday&apos;s cards with their results, a card flipped to Gary&apos;s take, the Winners picks, The Hub with the lines moving, and the Billfold. Captured from the shipping build on September 9, 2026 — real picks and real numbers, no staging.
          </p>
          <p className="mt-4 text-[13px] leading-relaxed text-low">
            The recording plays muted and loops. Screenshots and video show Gary 2.25 from September 2026.
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
              <div className="grid grid-cols-1 gap-8 py-10 lg:grid-cols-12 lg:items-center">
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
            <li>Gary’s game picks</li>
            <li>Player prop picks</li>
            <li>The Hub’s insights and betting connections</li>
            <li>The complete public track record, losses included</li>
          </ul>
        </div>
        <div className="quant-panel p-7">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-gold">Winners — Gary’s best bets</p>
          <ul className="mt-4 space-y-2.5 text-[15px] text-mid">
            <li>Gary’s favorite game and prop bets of the day</li>
            <li>A separate record for Winners picks — Gary&apos;s Billfold record</li>
            <li>Choose one sport or All-Access for every active sport</li>
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
          Explore Gary&apos;s game picks, player props, and the Hub for free. Head to Winners
          for his best bets of the day.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-4">
          <AppStoreButton surface="app_page_footer" />
          <GhostLink href="/picks">Browse today&apos;s picks</GhostLink>
        </div>
      </section>
    </main>
  );
}
