'use client';

import { logEvent } from '@/lib/gary/analytics';

export const APP_STORE_URL = 'https://apps.apple.com/us/app/gary-ai/id6751238914';

/**
 * The one gold-filled control on the site — gold is the CTA's signature, so
 * nothing else gets a fill. Every click lands in the shared app_events funnel
 * (same table iOS writes to) so App Store handoffs are measurable per surface.
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
      href={APP_STORE_URL}
      onClick={() => logEvent('app_store_click', { surface })}
      className="inline-flex items-center gap-2 rounded-card bg-gold px-6 py-3 font-body text-sm font-semibold text-ink shadow-card transition-[transform,opacity] duration-150 hover:opacity-95 hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
    >
      {label}
    </a>
  );
}
