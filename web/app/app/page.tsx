import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Eyebrow } from '@/components/Eyebrow';
import { AppStoreButton } from '@/components/AppStoreButton';

export const metadata: Metadata = {
  title: 'Gary AI for iOS — Every Game, Every Day | betwithgary.ai',
  description:
    'The Gary AI iOS app: daily picks with written reasoning, Winners (Gary\'s highest-conviction board), the insight Hub, a live Picks carousel, and the Billfold performance ledger. Free on the App Store.',
  alternates: { canonical: '/app' },
};

const features = [
  {
    tab: 'HOME',
    title: 'Morning Briefing',
    description:
      "Each morning, the app surfaces today's slate summary — top pick, sport-by-sport breakdown, recent record, and the daily insight board in a single scroll. Gary's highest-confidence call is pinned at the top.",
  },
  {
    tab: 'WINNERS',
    title: "Winners",
    description:
      "Winners is Gary's highest-conviction board — a curated subset of the day's picks filtered by confidence threshold and cross-sport value. These are the plays Gary rates most strongly, presented with the full rationale.",
    premium: true,
  },
  {
    tab: 'HUB',
    title: 'The Hub',
    description:
      'The insight board Gary\'s research produces alongside picks: heat checks, platoon edges, ballpark shifts, regression watches, Home Run Threats, and situational angles. Each lane is graded against results the next morning.',
  },
  {
    tab: 'PICKS',
    title: 'Picks Carousel',
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

const galleryImages = [
  {
    src: '/press/gallery_hero_1270x760.png',
    alt: 'Gary AI app home screen showing morning briefing and top pick',
    width: 1270,
    height: 760,
  },
  {
    src: '/press/gallery_stats_1270x760.png',
    alt: 'Gary AI track record and Billfold stats view',
    width: 1270,
    height: 760,
  },
  {
    src: '/press/gallery_howitworks_1270x760.png',
    alt: 'Gary AI how it works — picks with written rationale',
    width: 1270,
    height: 760,
  },
];

export default function AppPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">

      {/* Hero */}
      <section className="text-center">
        <Eyebrow>FREE ON IOS</Eyebrow>
        <h1 className="mt-3 font-display text-5xl leading-tight text-white/95">
          The full Gary experience<br className="hidden sm:block" /> lives in the app
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-white/60">
          The website publishes the full slate every day. The iOS app adds Winners, live
          score tracking, the Hub insight board, and the Billfold performance ledger —
          all in one place, always free.
        </p>
        <div className="mt-7 flex justify-center">
          <AppStoreButton label="Download on the App Store" />
        </div>
      </section>

      {/* Gallery */}
      <section className="mt-14">
        <div className="grid gap-5 md:grid-cols-3">
          {galleryImages.map((img) => (
            <div
              key={img.src}
              className="overflow-hidden rounded-[16px] border border-white/10"
            >
              <Image
                src={img.src}
                alt={img.alt}
                width={img.width}
                height={img.height}
                className="w-full object-cover"
                priority
              />
            </div>
          ))}
        </div>
      </section>

      {/* 5-tab feature walkthrough */}
      <section className="mt-16">
        <Eyebrow>FEATURES</Eyebrow>
        <h2 className="mt-2 font-display text-3xl text-white/95">Five screens. One app.</h2>
        <div className="mt-6 space-y-5">
          {features.map((f) => (
            <div
              key={f.tab}
              className="rounded-[20px] border border-white/10 bg-card px-7 py-6"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-md bg-chip px-2.5 py-1 font-mono text-[11px] font-bold text-white/55 uppercase">
                  {f.tab}
                </span>
                {f.premium && (
                  <span className="rounded-md border border-gold/30 px-2.5 py-1 font-mono text-[11px] font-bold text-gold uppercase">
                    APP EXCLUSIVE
                  </span>
                )}
              </div>
              <h3 className="mt-3 font-display text-2xl text-white/95">{f.title}</h3>
              <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-white/60">
                {f.description}
              </p>

              {/* Winners premium tease — blurred mock cards, no real pick data */}
              {f.premium && (
                <div className="mt-5 space-y-2" aria-label="Winners board preview">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className="flex items-center justify-between rounded-[10px] border border-white/8 bg-chip px-4 py-3 blur-sm select-none"
                      aria-hidden="true"
                    >
                      <div className="flex items-center gap-3">
                        <span className="h-2 w-2 rounded-full bg-gold/60" />
                        <span className="font-mono text-[13px] text-white/70">
                          BLURRED
                        </span>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[12px] text-white/45">
                        <span>BLURRED</span>
                        <span className="text-gold font-bold">BLURRED</span>
                      </div>
                    </div>
                  ))}
                  <p className="mt-3 text-center font-mono text-[11px] text-white/40 not-italic" style={{ filter: 'none' }}>
                    Available in the iOS app
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mt-14 rounded-[20px] border border-white/10 bg-card px-7 py-8 text-center">
        <Eyebrow>EVERY GAME. EVERYDAY. ALWAYS FREE.</Eyebrow>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-white/60">
          Full slate of Gary&apos;s picks are live. Every game covered. Completely free.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <AppStoreButton label="Download on the App Store" />
          <Link
            href="/picks"
            className="inline-flex items-center rounded-xl border border-white/15 px-5 py-3 text-sm text-white/70 transition-colors hover:border-white/30 hover:text-white/90"
          >
            Browse Today&apos;s Picks
          </Link>
        </div>
      </section>
    </main>
  );
}
