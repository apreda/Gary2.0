import type { Metadata } from 'next';
import { LaunchOffer } from '@/components/LaunchOffer';
import { LAUNCH_OFFER } from '@/lib/gary/launch-offer';
import Image from 'next/image';
import Link from 'next/link';
import { Eyebrow } from '@/components/Eyebrow';
import { AppStoreButton } from '@/components/AppStoreButton';
import { JsonLd } from '@/components/JsonLd';
import { StitchRule, GhostLink } from '@/components/Terminal';
import { pageMetadata } from '@/lib/seo/metadata';
import { softwareApplicationJsonLd } from '@/lib/seo/software-application';

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata({
  canonical: '/app',
  title: 'Gary AI for iOS — Daily Picks, Winners & the Billfold',
  description:
    "The Gary AI iOS app: daily picks with written reasoning, Winners — Gary's conviction board — the insight Hub, and the Billfold ledger. Free on the App Store.",
});

const features = [
  {
    tab: 'HOME',
    title: 'Morning briefing',
    description:
      "Each morning, the app surfaces today's slate summary — top pick, sport-by-sport breakdown, recent record, and the daily insight board in a single scroll. Gary's highest-confidence call is pinned at the top.",
  },
  {
    tab: 'WINNERS',
    title: 'Winners',
    description:
      `Winners is a reviewed shortlist of exact published tickets, with its own graded record. ${LAUNCH_OFFER} Other accounts can choose a Winners plan after the preview.`,
    premium: true,
  },
  {
    tab: 'HUB',
    title: 'The Hub',
    description:
      "The insight board Gary's research produces alongside picks: heat checks, platoon edges, ballpark shifts, regression watches, Home Run Threats, and situational angles. Available lanes include result reviews; coverage and publication vary by sport.",
  },
  {
    tab: 'PICKS',
    title: 'Picks carousel',
    description:
      "The full daily slate in a swipeable carousel. Each card shows the pick, type, confidence rating, listed odds, and Gary's written rationale. Live scores update in-card during games.",
  },
  {
    tab: 'BILLFOLD',
    title: 'Billfold',
    description:
      'The performance ledger — all-time record, last 30 days, last 7 days, net units at flat stakes, and win percentage by sport. Every pick stays on the record, including losses.',
  },
];

/** Matte mock of the Winners board — illustration, clearly marked, no real picks. */
function WinnersBoardMock() {
  return (
    <div aria-hidden className="w-full max-w-[320px] rounded-panel border border-line bg-ink p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[14px] uppercase tracking-[0.04em] text-gold">Winners</span>
        <span className="font-mono text-[9px] uppercase text-low">Sample board</span>
      </div>
      <div className="stitch-gold mt-2" />
      {[
        ['MLB', 'PHI ML', '-118', false],
        ['NFL', 'TEAM -3.5', '-110', true],
        ['NCAAF', 'TEAM ML', '+120', true],
      ].map(([lg, pick, odds, locked], i) => (
        <div key={i} className="mt-2.5 rounded-chip border border-line bg-card px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.04em] text-faint">{lg as string}</span>
            {locked && (
              <svg width="9" height="11" viewBox="0 0 9 11" fill="none">
                <rect x="0.5" y="4.5" width="8" height="6" rx="1" stroke="rgba(201,162,39,0.7)" />
                <path d="M2.5 4.5V3a2 2 0 0 1 4 0v1.5" stroke="rgba(201,162,39,0.7)" />
              </svg>
            )}
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className={`font-mono text-[11px] font-bold ${locked ? 'text-hi blur-[5px] select-none' : 'text-gold'}`}>
              {pick as string}
            </span>
            <span className={`tnum font-mono text-[10px] font-bold text-low ${locked ? 'blur-[5px] select-none' : ''}`}>
              {odds as string}
            </span>
          </div>
        </div>
      ))}
      <p className="mt-3 text-center font-mono text-[8.5px] uppercase tracking-[0.04em] text-faint">
        Illustration · account access applies
      </p>
    </div>
  );
}

export default function AppPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-14">
      <JsonLd data={softwareApplicationJsonLd} />

      {/* Hero */}
      <section className="grid items-center gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Eyebrow>FREE ON IOS</Eyebrow>
          <h1 className="mt-4 font-display text-[clamp(2.8rem,6vw,4.5rem)] leading-[0.94] text-hi">
            The full Gary experience
            <br />
            <span className="text-gold">lives in the app</span>
          </h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-mid">
            Find your game. See Gary&apos;s pick. Read the reasoning, follow the result,
            and keep your own private Book. Web and iOS share your account and Winners
            access, while the full slate stays free.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <AppStoreButton surface="app_page_hero" />
            <GhostLink href="/pricing">See pricing</GhostLink>
          </div>
        </div>
        <div className="hidden justify-center lg:col-span-5 lg:flex">
          <Image src="/brand/gary-icon.png" alt="Gary the bear" width={300} height={300} />
        </div>
      </section>

      <LaunchOffer className="mt-8" />

      {/* Feature walkthrough */}
      <section className="mt-20">
        <Eyebrow>YOUR GAME. YOUR GARY.</Eyebrow>
        <StitchRule className="mt-4" />
        <div className="mt-2">
          {features.map((f, i) => (
            <div key={f.tab}>
              {i > 0 && <StitchRule tone="faint" />}
              <div className="grid gap-6 py-9 lg:grid-cols-12 lg:items-center">
                <div className={f.premium ? 'lg:col-span-7' : 'lg:col-span-12'}>
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
                  <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-mid">{f.description}</p>
                  {f.premium && (
                    <Link
                      href="/pricing"
                      className="mt-3 inline-block text-sm text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
                    >
                      Plans and the free-vs-Winners breakdown →
                    </Link>
                  )}
                </div>
                {f.premium && (
                  <div className="flex justify-center lg:col-span-5">
                    <WinnersBoardMock />
                  </div>
                )}
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
            <li>The Hub insight lanes</li>
            <li>The complete public track record, losses included</li>
          </ul>
        </div>
        <div className="quant-panel p-7">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-gold">Winners — reviewed selections</p>
          <ul className="mt-4 space-y-2.5 text-[15px] text-mid">
            <li>The handful per sport Gary would actually bet</li>
            <li>Each board&apos;s own graded record</li>
            <li>Live in-game tracking on your boards</li>
            <li>Included during launch preview and for founding accounts</li>
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
          want the conviction board.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-4">
          <AppStoreButton surface="app_page_footer" />
          <GhostLink href="/picks">Browse today&apos;s picks</GhostLink>
        </div>
      </section>
    </main>
  );
}
