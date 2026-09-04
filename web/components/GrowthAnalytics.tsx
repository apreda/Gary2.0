'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  clearGrowthAnalyticsStorage,
  hasAnalyticsConsent,
  useAnalyticsConsent,
  writeAnalyticsConsent,
  type AnalyticsConsent,
} from '@/lib/gary/analytics-consent';
import { initializeGrowthAnalytics, resetGrowthAnalyticsMemory } from '@/lib/gary/analytics';

const VercelAnalytics = dynamic(
  () => import('@vercel/analytics/react').then(module => module.Analytics),
  { ssr: false },
);
const VercelSpeedInsights = dynamic(
  () => import('@vercel/speed-insights/next').then(module => module.SpeedInsights),
  { ssr: false },
);

function GrowthSignals() {
  const pathname = usePathname();

  useEffect(() => {
    initializeGrowthAnalytics(pathname);
    const onVisible = () => {
      if (document.visibilityState === 'visible') initializeGrowthAnalytics(pathname);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [pathname]);

  return (
    <>
      <VercelAnalytics beforeSend={event => hasAnalyticsConsent() ? event : null} />
      <VercelSpeedInsights beforeSend={event => hasAnalyticsConsent() ? event : null} />
    </>
  );
}

function stripPendingAnalyticsMarkers(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('_gary_signup')) return;
  url.searchParams.delete('_gary_signup');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/** Consent gate for all persistent website analytics, including Vercel telemetry. */
export function GrowthAnalytics() {
  const consent = useAnalyticsConsent();
  const [manualChoicesOpen, setManualChoicesOpen] = useState(false);
  const choicesOpen = consent === 'undecided' || manualChoicesOpen;

  useEffect(() => {
    if (consent === 'declined') {
      clearGrowthAnalyticsStorage();
      resetGrowthAnalyticsMemory();
    }
  }, [consent]);

  function choose(next: Exclude<AnalyticsConsent, 'undecided'>) {
    writeAnalyticsConsent(next);
    setManualChoicesOpen(false);
    if (next === 'declined') {
      clearGrowthAnalyticsStorage();
      resetGrowthAnalyticsMemory();
      stripPendingAnalyticsMarkers();
    }
  }

  if (consent === 'loading') return null;

  return (
    <>
      {consent === 'granted' && <GrowthSignals />}

      {choicesOpen ? (
        <aside
          aria-labelledby="analytics-choices-title"
          className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-panel border border-gold/35 bg-card p-5 shadow-card sm:inset-x-5 sm:flex sm:items-center sm:gap-5"
        >
          <div className="min-w-0 flex-1">
            <h2 id="analytics-choices-title" className="font-display text-xl uppercase text-hi">
              Help improve Gary?
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-mid">
              With your permission, Gary uses first-party product analytics, Vercel Analytics, and Speed Insights.
              No ad tracking. Read the{' '}
              <Link href="/privacy" className="text-gold underline underline-offset-2">privacy policy</Link>.
            </p>
          </div>
          <div className="mt-4 flex shrink-0 flex-wrap gap-2 sm:mt-0">
            <button
              type="button"
              onClick={() => choose('declined')}
              className="min-h-11 rounded-card border border-line px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-mid transition-colors hover:border-white/30 hover:text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
            >
              No thanks
            </button>
            <button
              type="button"
              onClick={() => choose('granted')}
              className="min-h-11 rounded-card bg-gold px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-ink transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
            >
              Allow analytics
            </button>
          </div>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setManualChoicesOpen(true)}
          className="fixed bottom-2 left-2 z-[90] rounded-chip border border-line bg-ink/95 px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.04em] text-low shadow-card transition-colors hover:border-gold/40 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
        >
          Privacy choices
        </button>
      )}
    </>
  );
}
