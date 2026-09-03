'use client';

import Link from 'next/link';
import { accountHref } from '@/lib/auth/redirect';
import { useSupabaseSessionHint } from '@/lib/auth/session-hint';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink';

export function AccountCta({
  nextPath,
  title = 'Keep your own record',
  body = 'Tail or fade a posted call and Gary grades your prediction beside his. It is free, and no wager is placed.',
  className = '',
}: {
  nextPath: string;
  title?: string;
  body?: string;
  className?: string;
}) {
  const signedIn = useSupabaseSessionHint();
  const href = signedIn ? '/you' : accountHref(nextPath, 'signup');

  return (
    <aside className={`rounded-panel border border-gold/35 bg-card px-5 py-5 sm:flex sm:items-center sm:justify-between sm:gap-6 ${className}`}>
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-gold">Your Book</p>
        <p className="mt-1 font-display text-xl uppercase text-hi">{title}</p>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-mid">{body}</p>
      </div>
      <Link
        href={href}
        prefetch={false}
        className={`mt-4 inline-flex shrink-0 rounded-chip bg-gold px-4 py-2.5 text-[13.5px] font-semibold text-ink transition-opacity hover:opacity-90 sm:mt-0 ${focusRing}`}
      >
        {signedIn ? 'Open My Book' : 'Start My Book — free'}
      </Link>
    </aside>
  );
}
