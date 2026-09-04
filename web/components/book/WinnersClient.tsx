'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchWinners, type WinnersBoard } from '@/lib/book/access';
import { todayEST } from '@/lib/gary/dates';
import { PickCard } from '@/components/PickCard';
import { PropRow } from '@/components/board/PropRow';
import { BookDayProvider } from './BookDay';
import { TailFadeRow } from './TailFadeRow';
import { AccessCard } from './AccessCard';
import { bookButton, bookField } from './LogBet';
import { supabaseBrowser } from '@/lib/auth/client';

export function WinnersClient() {
  const [date, setDate] = useState(todayEST());
  const [sport, setSport] = useState('all');
  const [board, setBoard] = useState<WinnersBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const sessionVersion = useRef(0);
  useEffect(() => {
    const refresh = () => {
      sessionVersion.current += 1;
      setBoard(null);
      setError(null);
      setAttempt((n) => n + 1);
    };
    const { data: auth } = supabaseBrowser().auth.onAuthStateChange((event: string) => {
      if (['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) refresh();
    });
    window.addEventListener('focus', refresh);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') setAttempt((n) => n + 1);
    }, 60000);
    return () => {
      auth.subscription.unsubscribe();
      window.removeEventListener('focus', refresh);
      window.clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const version = sessionVersion.current;
    fetchWinners(date)
      .then((data) => {
        if (!cancelled && version === sessionVersion.current) {
          setBoard(data);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled && version === sessionVersion.current) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [date, attempt]);
  const tickets = (board?.tickets ?? []).filter((t) => sport === 'all' || t.league === sport);
  const locked = (board?.boards ?? []).filter((b) => b.locked && (sport === 'all' || b.league === sport));
  return (
    <div className="mt-7 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="text-[12px] text-mid">
          Board date (Eastern)
          <input
            type="date"
            min="2026-09-04"
            max={todayEST()}
            value={date}
            onChange={(e) => {
              if (!e.target.value) return;
              setDate(e.target.value);
              setBoard(null);
              setError(null);
            }}
            className={bookField}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {['all', 'MLB', 'NFL', 'NBA', 'NCAAF'].map((s) => (
            <button
              key={s}
              aria-pressed={sport === s}
              onClick={() => setSport(s)}
              className={`${bookButton} ${sport === s ? 'border-gold text-gold' : ''}`}
            >
              {s === 'all' ? 'All sports' : s}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <div className="rounded-card border border-loss/30 p-5">
          <p role="alert" className="text-[13px] text-loss">
            {error}
          </p>
          <button onClick={() => setAttempt((n) => n + 1)} className={`${bookButton} mt-3`}>
            Retry
          </button>
        </div>
      ) : !board ? (
        <p role="status" className="py-8 text-[13px] text-mid">
          Loading the published board…
        </p>
      ) : (
        <>
          {(board.access.preview || board.access.founding) && (
            <p className="rounded-card border border-gold/25 bg-gold/5 px-5 py-3 text-[13px] text-gold">
              {board.access.founding
                ? 'Your founding membership includes this board.'
                : 'Launch preview · Winners is open. No purchase required.'}
            </p>
          )}
          {locked.length > 0 && (
            <div className="rounded-panel border border-gold/35 bg-card p-5">
              <h2 className="font-display text-2xl text-hi">Your Winners board is waiting.</h2>
              <p className="mt-2 text-[13px] text-mid">
                {locked
                  .map((b) => `${b.league} ${b.kind === 'prop' ? 'props' : 'games'} · ${b.count} published`)
                  .join(' / ')}
              </p>
              <div className="mt-5">
                <AccessCard initial={board.access} />
              </div>
            </div>
          )}
          {tickets.length > 0 ? (
            <BookDayProvider date={date}>
              <div className="space-y-5">
                {tickets.map((t) => (
                  <div
                    key={t.id ?? t.candidate_id}
                    className="overflow-hidden rounded-panel border border-line bg-card"
                  >
                    <div className="flex items-center justify-between px-5 py-3 font-mono text-[10px] text-low">
                      <span>
                        {t.league} · {t.kind === 'prop' ? 'PROP' : 'GAME'} WINNER
                      </span>
                      <span>
                        Published{' '}
                        {new Date(t.admitted_at).toLocaleTimeString('en-US', {
                          timeZone: 'America/New_York',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}{' '}
                        ET
                      </span>
                    </div>
                    {t.kind === 'prop' ? (
                      <PropRow prop={t.pick_snapshot} />
                    ) : (
                      <div className="px-4 pb-4">
                        <PickCard pick={{ ...t.pick_snapshot, league: t.league }} expanded />
                        <TailFadeRow
                          pickText={t.pick_snapshot.pick ?? ''}
                          pickId={t.pick_snapshot.pick_id}
                          commence={t.pick_snapshot.commence_time}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </BookDayProvider>
          ) : (
            locked.length === 0 && (
              <div className="rounded-panel border border-line bg-card px-6 py-10">
                <h2 className="font-display text-2xl text-hi">A board is earned.</h2>
                <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-mid">
                  No Winners have been published for this view. Gary publishes only tickets that pass review;
                  an empty board is a valid result. Try another sport or return as today&apos;s reviews
                  finish.
                </p>
              </div>
            )
          )}
          <p className="text-[11px] leading-relaxed text-low">
            These are the original published tickets, with the odds and reasoning saved at admission. A board
            holds at most six game picks and six props per sport; it may publish fewer. Confidence reflects
            Gary&apos;s judgment, not a guaranteed outcome. Historical boards before September 4 are available
            in the app&apos;s record.
          </p>
        </>
      )}
    </div>
  );
}
