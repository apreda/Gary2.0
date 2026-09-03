'use client';

import { appStoreHandoffPath, beginAppStoreHandoff } from '@/lib/gary/analytics';

/**
 * The one gold-filled control on the site — gold is the CTA's signature, so
 * nothing else gets a fill. Consented website clicks use a first-party handoff
 * so App Store intent is measurable per surface without touching app telemetry.
 */
export function AppStoreButton({
  label = 'Download on the App Store',
  surface = 'unknown',
}: {
  label?: string;
  surface?: string;
}) {
  return (
    <a
      href={appStoreHandoffPath(surface)}
      onClick={event => {
        event.currentTarget.href = beginAppStoreHandoff(surface);
      }}
      className="inline-flex items-center gap-2 rounded-card bg-gold px-6 py-3 font-body text-sm font-semibold text-ink shadow-card transition-[transform,opacity] duration-150 hover:opacity-95 hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
    >
      {label}
    </a>
  );
}
