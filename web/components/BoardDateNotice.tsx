'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { todayEST } from '@/lib/gary/dates';
import { etDateLabel } from '@/lib/gary/format';

function subscribeToBoardDay(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  window.addEventListener('focus', onChange);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('focus', onChange);
  };
}

const currentBoardDay = () => todayEST();
const serverBoardDay = () => null;

/** ISR may preserve yesterday's successful page through a feed outage.
 * Compare its explicit date with the browser clock, including the 3 AM ET
 * board rollover. This notice does not claim to diagnose the feed's health.
 */
export function BoardDateNotice({ date, className = '' }: { date: string; className?: string }) {
  const currentDay = useSyncExternalStore(subscribeToBoardDay, currentBoardDay, serverBoardDay);
  if (!currentDay || date >= currentDay) return null;

  return (
    <aside role="status" className={`mb-6 rounded-card border border-gold/40 bg-card px-5 py-4 ${className}`}>
      <p className="text-[15px] font-semibold text-hi">You&apos;re viewing the {etDateLabel(date)} board.</p>
      <p className="mt-1 text-[14px] leading-relaxed text-mid">
        These picks are historical. The current board hasn&apos;t loaded on this page.
      </p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gold">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="underline decoration-gold/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
        >Refresh board</button>
        <Link href="/archive" className="underline decoration-gold/40 underline-offset-4">Read the archive</Link>
      </div>
    </aside>
  );
}
