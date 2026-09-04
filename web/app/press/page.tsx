import type { Metadata } from 'next';
import { LAUNCH_OFFER } from '@/lib/gary/launch-offer';
import Image from 'next/image';
import Link from 'next/link';
import { Eyebrow } from '@/components/Eyebrow';
import { PageMasthead, StatTile } from '@/components/Terminal';
import { BRAND, liveStats } from '@/lib/gary/press';
import { pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata({
  canonical: '/press',
  title: 'Press & Brand Kit | Gary AI',
  description:
    'Brand facts, approved boilerplate, live track record stats, and downloadable assets for Gary AI — the free AI sports picks app.',
});

const BRAND_FACTS = [
  ['Product name', BRAND.name],
  ['Legal entity', BRAND.legalName],
  ['Tagline', BRAND.tagline],
  ['Website', BRAND.domain],
  ['iOS App Store', BRAND.appStoreUrl],
  ['X / Twitter', `${BRAND.x} (${BRAND.xUrl})`],
  ['Support', BRAND.supportEmail],
  ['Sports covered', BRAND.sports.join(', ')],
  ['Price', `Full slate free. ${LAUNCH_OFFER} Other accounts can choose Winners from $9.99/mo per sport after the preview, or All-Access.`],
];

const ASSETS = [
  {
    file: '/brand/GaryIconBG.png',
    label: 'Gary Bear Mark',
    dims: '1024 × 1024 px · transparent PNG',
    hint: 'Primary mark. Use on warm black (#0A0908) only.',
  },
  {
    file: '/brand/gary-icon.png',
    label: 'Gary Icon',
    dims: '800 × 800 px · transparent PNG',
    hint: 'The site and app-icon mark. No blue tint.',
  },
  {
    file: '/coin2.png',
    label: 'Gold Coin',
    dims: 'PNG · round crop',
    hint: 'Secondary brand asset.',
  },
  // NOTE: the old /press/gallery_*.png cards are intentionally NOT listed —
  // they carry stale claims (100% free, old AI stack) and are pending
  // regeneration under the paid-Winners model. Do not redistribute them.
];

function CopyBlock({ children }: { children: string }) {
  return (
    <pre className="mt-2 cursor-text select-all overflow-x-auto whitespace-pre-wrap rounded-chip border border-line bg-chip p-4 font-mono text-[13px] leading-relaxed text-mid">
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
    <main className="mx-auto max-w-3xl px-5 py-12">
      <PageMasthead title="Press & brand" meta="MEDIA KIT">
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-mid">
          Approved copy, live record stats, and downloadable assets. Questions:{' '}
          <a
            href={`mailto:${BRAND.supportEmail}`}
            className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
          >
            {BRAND.supportEmail}
          </a>
        </p>
      </PageMasthead>

      {/* Brand facts table */}
      <section className="mt-7">
        <Eyebrow>BRAND FACTS</Eyebrow>
        <div className="mt-3 overflow-hidden rounded-card border border-line bg-card">
          <table className="w-full text-[14px]">
            <tbody>
              {BRAND_FACTS.map(([label, value], i) => (
                <tr
                  key={label}
                  className={i < BRAND_FACTS.length - 1 ? 'border-b border-line' : ''}
                >
                  <td className="w-40 py-3 pl-5 font-mono text-[12px] font-bold text-low">
                    {label.toUpperCase()}
                  </td>
                  <td className="tnum py-3 pr-5 text-mid">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Boilerplate */}
      <section className="mt-10">
        <Eyebrow>APPROVED BOILERPLATE</Eyebrow>
        <p className="mt-2 text-[13px] text-low">
          Use these verbatim. Click a block to select all.
        </p>

        <h2 className="mt-6 font-display text-lg text-hi">Short (1 sentence)</h2>
        <CopyBlock>{BRAND.boilerplateShort}</CopyBlock>

        <h2 className="mt-6 font-display text-lg text-hi">Medium (2–3 sentences)</h2>
        <CopyBlock>{BRAND.boilerplateMedium}</CopyBlock>

        <h2 className="mt-6 font-display text-lg text-hi">Long (full paragraph)</h2>
        <CopyBlock>{BRAND.boilerplateLong}</CopyBlock>
      </section>

      {/* Live stats */}
      {stats && (
        <section className="mt-10">
          <Eyebrow>LIVE TRACK RECORD</Eyebrow>
          <p className="tnum mt-1 font-mono text-[11px] text-low">AS OF {stats.asOf}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <StatTile
              label="All-time game picks"
              value={
                <>
                  {stats.allTime.wins}
                  <span className="text-faint">-</span>
                  {stats.allTime.losses}
                  <span className="text-faint">-</span>
                  {stats.allTime.pushes}
                </>
              }
              sub={
                <>
                  <span className="font-bold text-gold">{stats.allTime.pct}%</span> on{' '}
                  {stats.allTime.graded.toLocaleString()} graded picks
                </>
              }
            />
            <StatTile
              label="Last 30 days"
              value={
                <>
                  {stats.l30.wins}
                  <span className="text-faint">-</span>
                  {stats.l30.losses}
                  <span className="text-faint">-</span>
                  {stats.l30.pushes}
                </>
              }
              sub={
                <>
                  <span className="font-bold text-gold">{stats.l30.pct}%</span> win rate
                </>
              }
            />
          </div>
          <p className="mt-2 text-[12px] text-low">
            Full graded record (including losses):{' '}
            <a href={`${BRAND.domain}/results`} className="text-gold underline decoration-gold/40 transition-colors hover:text-gold-light">
              betwithgary.ai/results
            </a>
          </p>
        </section>
      )}

      <section className="mt-10 rounded-panel border border-gold/30 bg-card p-6">
        <Eyebrow>PUBLIC DATA ROOM</Eyebrow>
        <h2 className="mt-2 font-display text-2xl uppercase text-hi">Audit the record directly</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-mid">
          The model audit recomputes monthly results and confidence-band outcomes from the same public ledger. Reporters and researchers can download the underlying game and prop rows without requesting a private spreadsheet.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.05em]">
          <Link href="/results/audit" className="text-gold underline decoration-gold/40 underline-offset-4">Open model audit</Link>
          <a href="/results.csv" className="text-gold underline decoration-gold/40 underline-offset-4">Download CSV</a>
          <a href="/results.json" className="text-gold underline decoration-gold/40 underline-offset-4">Download JSON</a>
        </div>
      </section>

      <section className="mt-10 rounded-panel border border-line bg-card p-6">
        <Eyebrow>CITE GARY</Eyebrow>
        <h2 className="mt-2 font-display text-2xl uppercase text-hi">A live, auditable game-pick record badge</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-mid">
          Publishers, newsletters, and independent analysts can embed this badge when citing
          Gary&rsquo;s game-pick record. It refreshes from the same public ledger as the model audit
          and links readers to the underlying results.
        </p>
        <Link
          href="/results/audit"
          className="mt-5 block max-w-[520px] rounded-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
        >
          {/* This is intentionally a plain img: it is itself the documented embeddable asset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/record-badge.svg"
            alt="Gary AI public game-pick record badge"
            width="520"
            height="112"
            className="h-auto w-full"
          />
        </Link>
        <p className="mt-5 font-mono text-[11px] font-bold uppercase tracking-[0.05em] text-low">
          Copy this embed code
        </p>
        <CopyBlock>{`<a href="${BRAND.domain}/results/audit"><img src="${BRAND.domain}/record-badge.svg" alt="Gary AI public game-pick record"></a>`}</CopyBlock>
      </section>

      {/* Assets */}
      <section className="mt-10">
        <Eyebrow>BRAND ASSETS</Eyebrow>
        <p className="mt-2 text-[13px] text-low">
          Usage rules: warm black backgrounds only (#0A0908), no blue tint, never recreate or
          AI-generate the bear — always use the real assets below.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {ASSETS.map((a) => (
            <div
              key={a.file}
              className="rounded-card border border-line bg-card p-4"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-chip bg-chip">
                  <Image
                    src={a.file}
                    alt={a.label}
                    width={44}
                    height={44}
                    className="object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[12px] font-bold text-hi">{a.label}</p>
                  <p className="tnum mt-0.5 font-mono text-[11px] text-low">{a.dims}</p>
                  <p className="mt-1 text-[12px] text-low">{a.hint}</p>
                  <a
                    href={a.file}
                    download
                    className="mt-2 inline-block font-mono text-[11px] text-gold underline decoration-gold/40 transition-colors hover:text-gold-light"
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
        <p className="mt-2 text-[13px] text-low">
          Include this in any editorial coverage or promotional content.
        </p>
        <CopyBlock>{BRAND.disclaimer}</CopyBlock>
      </section>
    </main>
  );
}
