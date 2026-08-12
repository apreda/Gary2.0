'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/auth/client';
import { fetchMyBets, fetchTailCounts } from '@/lib/book/api';
import type { UserBet } from '@/lib/book/model';

/**
 * One shared load for every tail/fade row on a board page: who's signed in,
 * which picks the user already has money on, and the public riders/faders
 * counts for the date. Without this, a 15-game board would fire 30 requests.
 * Rows outside a provider render nothing — the board stays server-cacheable
 * and personal state only ever hydrates client-side.
 */

interface BookDayState {
  ready: boolean;
  signedIn: boolean;
  counts: Record<string, { tails: number; fades: number }>;
  mine: UserBet[];
  addBet: (bet: UserBet) => void;
  removeBet: (id: string) => void;
}

const BookDayContext = createContext<BookDayState | null>(null);

export function useBookDay(): BookDayState | null {
  return useContext(BookDayContext);
}

/** localStorage-backed unit size — the display truth for stakes ("$25" vs "1.0u"). */
export function useUnitDollars(): [number, (v: number) => void] {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const raw = window.localStorage.getItem('userUnitDollars');
    const v = raw ? parseFloat(raw) : 0;
    if (Number.isFinite(v) && v > 0) setValue(v);
  }, []);
  const set = useCallback((v: number) => {
    setValue(v);
    window.localStorage.setItem('userUnitDollars', String(v));
  }, []);
  return [value, set];
}

export function BookDayProvider({ date, children }: { date: string; children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [counts, setCounts] = useState<Record<string, { tails: number; fades: number }>>({});
  const [mine, setMine] = useState<UserBet[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: session }, dayCounts] = await Promise.all([
        supabaseBrowser().auth.getSession(),
        fetchTailCounts(date),
      ]);
      if (cancelled) return;
      setCounts(dayCounts);
      const authed = session.session != null;
      setSignedIn(authed);
      if (authed) {
        const bets = await fetchMyBets();
        // Cancellation guard: never latch an empty result over a live row.
        if (!cancelled && bets.length > 0) setMine(bets);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  const addBet = useCallback((bet: UserBet) => {
    setMine(prev => [bet, ...prev.filter(b => b.id !== bet.id)]);
  }, []);

  const removeBet = useCallback((id: string) => {
    setMine(prev => prev.filter(b => b.id !== id));
  }, []);

  return (
    <BookDayContext.Provider value={{ ready, signedIn, counts, mine, addBet, removeBet }}>
      {children}
    </BookDayContext.Provider>
  );
}
