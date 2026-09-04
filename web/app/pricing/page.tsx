import type { Metadata } from 'next';
import { LaunchOffer } from '@/components/LaunchOffer';
import { FREE_OFFER, LAUNCH_OFFER } from '@/lib/gary/launch-offer';
import Link from 'next/link';
import { Eyebrow } from '@/components/Eyebrow';
import { JsonLd } from '@/components/JsonLd';
import { AppStoreButton } from '@/components/AppStoreButton';
import { GhostLink } from '@/components/Terminal';
import { PricingPlans } from '@/components/PricingPlans';
import { GATING, PRICING } from '@/lib/gary/pricing';
import { fetchAllGameResults, computeRecord, sinceDate } from '@/lib/gary/results';
import { daysAgoEST } from '@/lib/gary/dates';
import { pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 600;

export const metadata: Metadata = pageMetadata({
  canonical: '/pricing',
  title: 'Gary AI Pricing — Unlock Winners, the Picks Gary Would Bet',
  description:
    `Free game picks, reasoning and your Book. ${LAUNCH_OFFER}`,
});

const faqItems = [
  {
    question: "What do I actually pay for if the picks are free?",
    answer:
      "The full game slate and reasoning stay free. Winners is a reviewed shortlist of exact published tickets, with its own graded record. You do not need to bet every game to enjoy seeing what Gary thinks. Launch preview and founding access include Winners without a purchase.",
  },
  {
    question: 'How much is it?',
    answer:
      `After the preview, accounts without included access can choose a single sport’s Winners board at ${PRICING.single}/mo. All-Access — every active board — is ${PRICING.allAccessMonthly}/mo with a ${PRICING.trialDays}-day free trial for new subscribers. Returning subscribers pay the plan price without another trial. Everything bills through Stripe and cancels anytime.`,
  },
  {
    question: 'Where do I subscribe?',
    answer:
      'Sign in and open Your membership on your profile. Your account shows included access, available plans and billing management on web and iOS. Preview and founding accounts are not charged for access they already have.',
  },
  {
    question: 'What stays free?',
    answer:
      FREE_OFFER,
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: { '@type': 'Answer', text: item.answer },
  })),
};

export default async function PricingPage() {
  const results = await fetchAllGameResults().catch(() => null);
  const l30rows = results ? sinceDate(results, daysAgoEST(30)) : [];
  const l30 = results ? computeRecord(l30rows) : null;
  const allTime = results ? computeRecord(results) : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <JsonLd data={faqJsonLd} />

      {/* Hero — proof first */}
      <section className="text-center">
        <Eyebrow>PRICING</Eyebrow>
        <h1 className="mx-auto mt-4 max-w-2xl font-display text-[clamp(2.6rem,5.5vw,4rem)] leading-[0.94] text-hi">
          The slate&apos;s free.
          <br />
          <span className="text-gold">Gary&apos;s card is the product.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-mid">
          Every game&apos;s pick and reasoning is free — that&apos;s the research, open to everyone.
          Winners is the handful per sport Gary would actually bet, with each board&apos;s own public record.
        </p>
        {l30 && allTime && (l30.wins + l30.losses) > 0 && (
          <div className="mx-auto mt-6 inline-flex flex-wrap items-center justify-center gap-3 rounded-full border border-line bg-card px-5 py-2.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-faint">Full free-slate record · last 30 days</span>
            <span className="tnum font-mono text-sm font-bold">
              <span className="text-win">{l30.wins}</span>
              <span className="text-faint">–</span>
              <span className="text-loss">{l30.losses}</span>
            </span>
            <span className="tnum text-[12px] text-low">
              · all-time {allTime.pct}% on {allTime.graded.toLocaleString()} graded · every result public
            </span>
          </div>
        )}
      </section>

      <LaunchOffer className="mt-8" />

      {/* Plans */}
      <section className="mt-12">
        <PricingPlans />
      </section>

      {/* Gating table — what unlocking gets you */}
      <section className="mt-16">
        <Eyebrow>FREE VS. WINNERS</Eyebrow>
        <h2 className="mt-2 font-display text-2xl uppercase text-hi">What unlocking gets you</h2>
        <div className="mt-5 overflow-hidden rounded-panel border border-line bg-card">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-line px-5 py-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-low">Capability</span>
            <span className="w-14 text-center font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-low">Free</span>
            <span className="w-16 text-center font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-gold">Winners</span>
          </div>
          {GATING.map((row) => (
            <div key={row.capability} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-white/5 px-5 py-3 last:border-b-0">
              <span className="text-[14px] text-mid">{row.capability}</span>
              <span className="w-14 text-center">{row.free ? <Check /> : <Dash />}</span>
              <span className="w-16 text-center">{row.paid ? <Check gold /> : <Dash />}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Trust strip — the brain behind the card */}
      <section className="mt-16 rounded-panel border border-line bg-elev px-7 py-8">
        <Eyebrow>WHY THE CARD IS WORTH IT</Eyebrow>
        <h2 className="mt-2 font-display text-2xl uppercase text-hi">A shortlist with evidence behind it</h2>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-mid">
          Winners reviews the original evidence behind a published pick, including the exact price,
          opposing evidence and unresolved assumptions. Space can stay empty. Published tickets
          stay on the record through wins and losses; review is not a guarantee of accuracy or profit.
        </p>
        <Link href="/how-it-works" className="mt-4 inline-block text-sm text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold">
          The full methodology →
        </Link>
      </section>

      {/* FAQ */}
      <section className="mt-16">
        <Eyebrow>FAQ</Eyebrow>
        <h2 className="mt-2 font-display text-2xl uppercase text-hi">Common questions</h2>
        <div className="mt-5 space-y-3">
          {faqItems.map((item) => (
            <div key={item.question} className="quant-panel px-6 py-5">
              <h3 className="font-display text-lg text-hi">{item.question}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-mid">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Close */}
      <section className="mt-14 flex flex-col items-center gap-4 text-center">
        <p className="max-w-md text-[15px] text-mid">
          See the free slate first — then unlock the board you actually bet.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <AppStoreButton label="Get Gary on iOS" surface="pricing_footer" />
          <GhostLink href="/picks">See today&apos;s free picks</GhostLink>
        </div>
      </section>
    </main>
  );
}

function Check({ gold }: { gold?: boolean }) {
  return (
    <span className={`font-mono text-sm font-bold ${gold ? 'text-gold' : 'text-win'}`} aria-label="included">
      ✓
    </span>
  );
}

function Dash() {
  return <span className="font-mono text-sm text-white/20" aria-label="not included">—</span>;
}
