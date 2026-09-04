'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { UserBet } from '@/lib/book/model';

/**
 * One shared load for every tail/fade row on a board page: who's signed in,
 * which picks the user already has money on, and the public riders/faders
 * counts for the date. Without this, a 15-game board would fire 30 requests.
 * Rows outside a provider render nothing — the board stays server-cacheable
 * and personal state only ever hydrates client-side.
 */

interface BookDayState {
  date: string;
  ready: boolean;
  signedIn: boolean;
  ambiguousGamePickReceiptKeys: ReadonlySet<string>;
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
    const read = () => {
      try {
        const raw = window.sessionStorage.getItem('userUnitDollars');
        const v = raw ? Number(raw) : 0;
        setValue(Number.isFinite(v) && v > 0 ? v : 0);
      } catch { setValue(0); }
    };
    const timer = window.setTimeout(read, 0);
    window.addEventListener('gary:unit-changed', read);
    return () => { window.clearTimeout(timer); window.removeEventListener('gary:unit-changed', read); };
  }, []);
  const set = useCallback((v: number) => {
    setValue(v);
    try { window.sessionStorage.setItem('userUnitDollars', String(v)); } catch { /* Browser storage is optional. */ }
    window.dispatchEvent(new Event('gary:unit-changed'));
  }, []);
  return [value, set];
}

export function BookDayProvider({
  date,
  ambiguousGamePickReceiptKeys = [],
  children,
}: {
  date: string;
  ambiguousGamePickReceiptKeys?: string[];
  children: React.ReactNode;
}) {
  const activationRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [counts, setCounts] = useState<Record<string, { tails: number; fades: number }>>({});
  const [mine, setMine] = useState<UserBet[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [, setUnitDollars] = useUnitDollars();
  const ambiguousReceiptKeySet = useMemo(
    () => new Set(ambiguousGamePickReceiptKeys),
    [ambiguousGamePickReceiptKeys],
  );

  useEffect(() => {
    if (active) return;
    const node = activationRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setActive(true);
          observer.disconnect();
        }
      },
      { rootMargin: '320px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        // Keep the sizeable Supabase browser SDK out of an ordinary board
        // visit. Load it only after the visitor shows intent to open or use
        // the interactive Book controls.
        const [{ supabaseBrowser }, { fetchMyBets, fetchMyProfile, fetchTailCounts }] = await Promise.all([
          import('@/lib/auth/client'),
          import('@/lib/book/api'),
        ]);
        if (cancelled) return;
        const { data: authChanges } = supabaseBrowser().auth.onAuthStateChange((event: string) => {
          if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
            cancelled = true;
            setMine([]); setCounts({}); setLoadError(null); setReady(false);
            setSignedIn(event === 'SIGNED_IN'); setUnitDollars(0);
            setSessionEpoch(n => n + 1);
          }
        });
        unsubscribe = () => authChanges.subscription.unsubscribe();
        const [{ data: session }, dayCounts] = await Promise.all([
          supabaseBrowser().auth.getSession(),
          fetchTailCounts(date),
        ]);
        if (cancelled) return;
        setCounts(dayCounts);
        const authed = session.session != null;
        setSignedIn(authed);
        if (authed) {
          const [bets, profile] = await Promise.all([fetchMyBets(), fetchMyProfile()]);
          // Cancellation guard: never latch an empty result over a live row.
          if (!cancelled) { setMine(bets); setUnitDollars(Number(profile.preferences?.unit_value ?? 0)); }
        } else {
          setMine([]); setUnitDollars(0);
        }
      } catch {
        if (!cancelled) {
          setLoadError('Your saved Book choices could not load. Refresh before making another call.');
        }
      } finally {
        // A feed failure must not leave the controls in a permanent loading
        // state; route-level authorization still protects every mutation.
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [active, date, sessionEpoch, setUnitDollars]);

  const addBet = useCallback((bet: UserBet) => {
    setMine(prev => [bet, ...prev.filter(b => b.id !== bet.id).map(b => bet.streak_pick && b.game_date === bet.game_date ? { ...b, streak_pick: false } : b)]);
  }, []);

  const removeBet = useCallback((id: string) => {
    setMine(prev => prev.filter(b => b.id !== id));
  }, []);

  return (
    <BookDayContext.Provider value={{
      date,
      ready,
      signedIn,
      ambiguousGamePickReceiptKeys: ambiguousReceiptKeySet,
      counts,
      mine,
      addBet,
      removeBet,
    }}>
      <div
        ref={activationRef}
        onMouseEnter={() => setActive(true)}
        onFocusCapture={() => setActive(true)}
        onPointerDownCapture={() => setActive(true)}
      >
        {loadError && <p role="alert" className="mb-4 rounded-chip border border-loss/30 p-3 text-[12px] text-loss">{loadError} <button type="button" className="underline" onClick={() => { setLoadError(null); setReady(false); setSessionEpoch(n => n + 1); }}>Retry</button></p>}
        {children}
      </div>
    </BookDayContext.Provider>
  );
}
