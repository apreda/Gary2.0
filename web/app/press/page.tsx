import type { Metadata } from 'next';
import Image from 'next/image';
import { Eyebrow } from '@/components/Eyebrow';
import { BRAND, liveStats } from '@/lib/gary/press';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Press & Brand Kit | Gary AI',
  description:
    'Brand facts, approved boilerplate, live track record stats, and downloadable assets for Gary AI — the free AI sports picks app.',
  alternates: { canonical: '/press' },
};

const BRAND_FACTS = [
  ['Product name', BRAND.name],
  ['Legal entity', BRAND.legalName],
  ['Tagline', BRAND.tagline],
  ['Website', BRAND.domain],
  ['iOS App Store', BRAND.appStoreUrl],
  ['X / Twitter', `${BRAND.x} (${BRAND.xUrl})`],
  ['Support', BRAND.supportEmail],
  ['Sports covered', BRAND.sports.join(', ')],
  ['Price', 'Free — every pick, every day'],
];

const ASSETS = [
  {
    file: '/brand/GaryIconBG.png',
    label: 'Gary Bear Mark',
    dims: '1024 × 1024 px · transparent PNG',
    hint: 'Primary mark. Use on warm black (#08080A) only.',
  },
  {
    file: '/brand/gary-head.png',
    label: 'Gary Head',
    dims: '512 × 512 px · transparent PNG',
    hint: 'Compact in-app avatar. No blue tint.',
  },
  {
    file: '/coin2.png',
    label: 'Gold Coin',
    dims: 'PNG · round crop',
    hint: 'Secondary brand asset.',
  },
  {
    file: '/press/gallery_hero_1270x760.png',
    label: 'App Gallery — Hero',
    dims: '1270 × 760 px · PNG',
    hint: 'Product Hunt / press use.',
  },
  {
    file: '/press/gallery_stats_1270x760.png',
    label: 'App Gallery — Stats',
    dims: '1270 × 760 px · PNG',
    hint: 'Track record screenshot.',
  },
  {
    file: '/press/gallery_howitworks_1270x760.png',
    label: 'App Gallery — How It Works',
    dims: '1270 × 760 px · PNG',
    hint: 'Methodology screenshot.',
  },
];

function CopyBlock({ children }: { children: string }) {
  return (
    <pre className="mt-2 cursor-text select-all overflow-x-auto whitespace-pre-wrap rounded-[10px] bg-chip p-4 font-mono text-[13px] leading-relaxed text-white/80">
      {children}
    </pre>
  );
}

export default async function PressPage() {
  // liveStats() can throw (network/DB) — catch to null and omit the section
  let stats: Awaited<ReturnType<typeof liveStats>> | null = null;
  try {
    stats = await liveStats();
  } catch {
    // omit live stats section
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Eyebrow>PRESS &amp; BRAND KIT</Eyebrow>
      <h1 className="mt-2 font-display text-4xl text-white/95">Brand Kit</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-white/60">
        Approved copy, live record stats, and downloadable assets. Questions:{' '}
        <a href={`mailto:${BRAND.supportEmail}`} className="text-white/80 underline">
          {BRAND.supportEmail}
        </a>
      </p>

      {/* Brand facts table */}
      <section className="mt-10">
        <Eyebrow>BRAND FACTS</Eyebrow>
        <div className="mt-3 overflow-hidden rounded-[12px] border border-white/10 bg-card">
          <table className="w-full text-[14px]">
            <tbody>
              {BRAND_FACTS.map(([label, value], i) => (
                <tr
                  key={label}
                  className={i < BRAND_FACTS.length - 1 ? 'border-b border-white/8' : ''}
                >
                  <td className="w-40 py-3 pl-5 font-mono text-[12px] font-bold text-white/40">
                    {label.toUpperCase()}
                  </td>
                  <td className="py-3 pr-5 text-white/80">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Boilerplate */}
      <section className="mt-10">
        <Eyebrow>APPROVED BOILERPLATE</Eyebrow>
        <p className="mt-2 text-[13px] text-white/45">
          Use these verbatim. Click a block to select all.
        </p>

        <h3 className="mt-6 font-display text-lg text-white/90">Short (1 sentence)</h3>
        <CopyBlock>{BRAND.boilerplateShort}</CopyBlock>

        <h3 className="mt-6 font-display text-lg text-white/90">Medium (2–3 sentences)</h3>
        <CopyBlock>{BRAND.boilerplateMedium}</CopyBlock>

        <h3 className="mt-6 font-display text-lg text-white/90">Long (full paragraph)</h3>
        <CopyBlock>{BRAND.boilerplateLong}</CopyBlock>
      </section>

      {/* Live stats */}
      {stats && (
        <section className="mt-10">
          <Eyebrow>LIVE TRACK RECORD</Eyebrow>
          <p className="mt-1 font-mono text-[11px] text-white/35">AS OF {stats.asOf}</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[12px] border border-white/10 bg-card px-6 py-5">
              <p className="font-mono text-[11px] font-bold text-white/40">ALL-TIME GAME PICKS</p>
              <p className="mt-2 font-display text-3xl text-white/95">
                {stats.allTime.wins}
                <span className="text-white/40">-</span>
                {stats.allTime.losses}
                <span className="text-white/40">-</span>
                {stats.allTime.pushes}
              </p>
              <p className="mt-1 font-mono text-[13px]">
                <span className="font-bold text-gold">{stats.allTime.pct}%</span>
                <span className="ml-2 text-white/45">
                  on {stats.allTime.graded.toLocaleString()} graded picks
                </span>
              </p>
            </div>
            <div className="rounded-[12px] border border-white/10 bg-card px-6 py-5">
              <p className="font-mono text-[11px] font-bold text-white/40">LAST 30 DAYS</p>
              <p className="mt-2 font-display text-3xl text-white/95">
                {stats.l30.wins}
                <span className="text-white/40">-</span>
                {stats.l30.losses}
                <span className="text-white/40">-</span>
                {stats.l30.pushes}
              </p>
              <p className="mt-1 font-mono text-[13px]">
                <span className="font-bold text-gold">{stats.l30.pct}%</span>
                <span className="ml-2 text-white/45">win rate</span>
              </p>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-white/35">
            Full graded record (including losses):{' '}
            <a href={`${BRAND.domain}/results`} className="text-white/55 underline">
              betwithgary.ai/results
            </a>
          </p>
        </section>
      )}

      {/* Assets */}
      <section className="mt-10">
        <Eyebrow>BRAND ASSETS</Eyebrow>
        <p className="mt-2 text-[13px] text-white/45">
          Usage rules: warm black backgrounds only (#08080A), no blue tint, never recreate or
          AI-generate the bear — always use the real assets below.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {ASSETS.map((a) => (
            <div
              key={a.file}
              className="rounded-[12px] border border-white/10 bg-card p-4"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] bg-chip">
                  <Image
                    src={a.file}
                    alt={a.label}
                    width={44}
                    height={44}
                    className="object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[12px] font-bold text-white/80">{a.label}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-white/40">{a.dims}</p>
                  <p className="mt-1 text-[12px] text-white/50">{a.hint}</p>
                  <a
                    href={a.file}
                    download
                    className="mt-2 inline-block font-mono text-[11px] text-white/55 underline hover:text-white/80"
                  >
                    Download
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Disclaimer */}
      <section className="mt-10">
        <Eyebrow>REQUIRED DISCLAIMER</Eyebrow>
        <p className="mt-2 text-[13px] text-white/45">
          Include this in any editorial coverage or promotional content.
        </p>
        <CopyBlock>{BRAND.disclaimer}</CopyBlock>
      </section>
    </main>
  );
}
