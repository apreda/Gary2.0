'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/auth/client';

interface SummaryBet {
  status: string;
  units_net: number | null;
}

type BookState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error' }
  | { kind: 'ready'; bets: SummaryBet[] };

export function TodayBookSummary() {
  const [state, setState] = useState<BookState>({ kind: 'loading' });

  useEffect(() => {
    let mounted = true;
    let authEventSeen = false;
    let requestId = 0;
    const supabase = supabaseBrowser();

    async function load(session: Session | null) {
      const activeRequest = ++requestId;
      if (!session) {
        if (mounted && activeRequest === requestId) setState({ kind: 'signed-out' });
        return;
      }
      const { data, error } = await supabase
        .from('user_bets')
        .select('status,units_net')
        .in('kind', ['tail', 'fade'])
        .order('placed_at', { ascending: false })
        .limit(400);
      if (!mounted || activeRequest !== requestId) return;
      setState(error ? { kind: 'error' } : { kind: 'ready', bets: (data ?? []) as SummaryBet[] });
    }

    void supabase.auth.getSession().then((result: { data: { session: Session | null } }) => {
      if (!authEventSeen) void load(result.data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      authEventSeen = true;
      void load(session);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <section className="rounded-panel border border-line bg-card p-5" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl uppercase text-hi">Your Book</h2>
        {state.kind === 'ready' && (
          <Link
            href="/you"
            className="text-[13px] text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
          >
            Open book →
          </Link>
        )}
      </div>

      {state.kind === 'loading' && (
        <div className="mt-5 grid grid-cols-2 gap-3" aria-label="Loading your book">
          <span className="h-16 animate-pulse rounded-card bg-white/5" />
          <span className="h-16 animate-pulse rounded-card bg-white/5" />
        </div>
      )}

      {state.kind === 'signed-out' && (
        <div className="mt-4">
          <p className="text-[14px] leading-relaxed text-mid">
            Sign in to see your pending rides and verified record beside today&apos;s board.
          </p>
          <Link
            href="/account?next=%2Ftoday"
            className="mt-4 inline-flex rounded-chip bg-gold px-4 py-2.5 text-[13.5px] font-semibold text-ink transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            Sign in
          </Link>
        </div>
      )}

      {state.kind === 'error' && (
        <p className="mt-4 text-[14px] leading-relaxed text-mid">
          Your Book could not load right now. The public board is still available.
        </p>
      )}

      {state.kind === 'ready' && <ReadyBook bets={state.bets} />}
    </section>
  );
}

function ReadyBook({ bets }: { bets: SummaryBet[] }) {
  const pending = bets.filter(bet => bet.status === 'pending').length;
  const wins = bets.filter(bet => bet.status === 'won').length;
  const losses = bets.filter(bet => bet.status === 'lost').length;
  const units = bets.reduce((sum, bet) => sum + (bet.units_net ?? 0), 0);

  if (bets.length === 0) {
    return (
      <div className="mt-4">
        <p className="text-[14px] leading-relaxed text-mid">
          Your verified ledger is ready. Tail or fade a posted pick to start the ride.
        </p>
        <Link
          href="/picks"
          className="mt-4 inline-block text-[13px] text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
        >
          Browse today&apos;s board →
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="grid grid-cols-3 gap-3">
        <BookStat label="Recent open" value={String(pending)} />
        <BookStat label="Recent" value={`${wins}–${losses}`} />
        <BookStat label="Recent net" value={`${units >= 0 ? '+' : ''}${units.toFixed(1)}u`} tone={units > 0 ? 'win' : units < 0 ? 'loss' : 'plain'} />
      </div>
      <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.04em] text-low">
        Latest 400 verified rides
      </p>
    </div>
  );
}

function BookStat({
  label,
  value,
  tone = 'plain',
}: {
  label: string;
  value: string;
  tone?: 'plain' | 'win' | 'loss';
}) {
  const color = tone === 'win' ? 'text-win' : tone === 'loss' ? 'text-loss' : 'text-hi';
  return (
    <div className="rounded-card border border-line bg-chip p-3">
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.05em] text-low">{label}</p>
      <p className={`tnum mt-1 font-mono text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
