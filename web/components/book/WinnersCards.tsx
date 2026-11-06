'use client';

import { useEffect, useRef } from 'react';
import { money, BOOK_TINT, priceText, shortMatchup, clockET, stampOpacity } from '@/lib/gary/ticket-format';
import { countdown, netUnits, unitsNet, type WinnersPlay } from '@/lib/book/winners-play';

// The app's Winners parts on the web (ios/GaryApp/WinnersLab/WinnersLabView.swift):
// the foil card, the sealed pack, the state word, the one-line result, the day bar
// and the run line.

export type PlayState =
  | { kind: 'final'; result: string; score: string | null }
  | { kind: 'live'; detail: string; score: string | null }
  | { kind: 'sealed' };

/** One line, whole words: the full ticket, then the short one, then a smaller size. */
function FitTitle({ full, short }: { full: string; short: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el?.parentElement) return;
    let alive = true;
    const fit = () => {
      if (!alive) return;
      el.style.removeProperty('font-size');
      el.textContent = full;
      const room = el.parentElement!.clientWidth;
      if (el.offsetWidth <= room) return;
      el.textContent = short;
      if (el.offsetWidth > room) {
        const size = parseFloat(getComputedStyle(el).fontSize);
        el.style.fontSize = `${size * (room / el.offsetWidth)}px`;
      }
    };
    const observer = new ResizeObserver(fit);
    observer.observe(el.parentElement);
    document.fonts.ready.then(fit);
    fit();
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [full, short]);
  return <span key={full} ref={ref} className="win-title-line">{full}</span>;
}

export function StateLine({ state, now, commence }: { state: PlayState; now: number; commence: string | null }) {
  if (state.kind === 'final') {
    const word = state.result === 'won' ? 'Win' : state.result === 'lost' ? 'Loss' : state.result;
    return (
      <span className="win-state">
        <b className={`win-word ${state.result}`}>{word}</b>
        {state.score && <span>{state.score}</span>}
      </span>
    );
  }
  if (state.kind === 'live') {
    const final = state.detail.toUpperCase() === 'FINAL';
    return (
      <span className="win-state">
        <b className={`win-word ${final ? 'push' : 'live'}`}>{final ? 'Final' : 'Live'}</b>
        {state.score && <span>{state.score}</span>}
        {!final && <span>{state.detail}</span>}
      </span>
    );
  }
  const left = countdown(commence, now);
  return (
    <span className="win-state">
      <b className="win-word sealed">Sealed</b>
      {left && <span className="win-seals">seals in {left}</span>}
    </span>
  );
}

export function TicketStub({ play }: { play: WinnersPlay }) {
  const labeled = play.direction || play.book;
  return (
    <span className="win-stub">
      {play.direction ? (
        <span className="win-direction">
          <i className={play.direction} aria-hidden="true">{play.direction === 'over' ? '▲' : '▼'}</i>
          {play.direction.toUpperCase()}
        </span>
      ) : play.book ? (
        <span className="win-book" style={{ color: BOOK_TINT[play.book.toLowerCase()] ?? 'var(--app-dim)' }}>{play.book}</span>
      ) : null}
      {labeled && play.price !== null && <span className="win-stub-rule" aria-hidden="true" />}
      {play.price !== null && <span className="win-price">{priceText(play.price)}</span>}
    </span>
  );
}

/** The pack's mark and one word: OPEN, COMING SOON or UNLOCK. */
function Pack({ word, lock, waiting }: { word?: string; lock?: boolean; waiting?: boolean }) {
  return (
    <div className="win-pack">
      <span className="win-pack-mark">
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed mark */}
        <img src="/site/gary-current.png" alt="" width={56} height={56} />
        {lock && <i className="win-pack-lock" aria-hidden="true" />}
      </span>
      {waiting ? <span className="win-pack-wait" role="status" aria-label="Loading today's plays" /> : <b>{word}</b>}
    </div>
  );
}

/** A pack that isn't a play yet: still to come, or behind the paywall. */
export function PackCard({ league, word, lock, waiting, onClick }: {
  league: string;
  word?: string;
  lock?: boolean;
  waiting?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="win-card-head"><b>{league}</b></div>
      <Pack word={word} lock={lock} waiting={waiting} />
    </>
  );
  return onClick
    ? <button type="button" className="win-card is-sealed" onClick={onClick} aria-label={`${league} play, unlock`}>{body}</button>
    : <div className="win-card is-sealed">{body}</div>;
}

/** A play: the foil card, sealed until the fan opens it. The free pick takes the page's width. */
export function PlayCard({ play, state, sealed, tearing, free, now, onOpen }: {
  play: WinnersPlay;
  state: PlayState;
  sealed: boolean;
  /** Opening right now: the wrapper comes off the ticket. */
  tearing: boolean;
  free?: { current: number; best: number };
  now: number;
  onOpen: () => void;
}) {
  const stake = money(play.stakeUnits);
  const clock = clockET(play.commence);
  const label = sealed
    ? `Open ${free ? 'the free pick' : `this ${play.league} play`}`
    : `${play.title}. Read Gary's reasons`;
  return (
    <article className={`win-card ${free ? 'is-free' : ''} ${sealed ? 'is-sealed' : ''} ${tearing ? 'is-tearing' : ''}`}>
      <button type="button" className="win-card-hit" aria-label={label} onClick={onOpen} />
      {free && (
        <div className="win-free-strip">
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed mark */}
          <img src="/site/gary-current.png" alt="" width={34} height={34} />
          <b>Free pick</b>
          <span>
            <em className={free.current > 0 ? 'on' : ''}>Streak {free.current}</em>
            {free.best > 0 && <> · Best {free.best}</>}
          </span>
        </div>
      )}
      <div className="win-card-head">
        <b>{play.league}</b>
        {!sealed && <span className="win-card-matchup">{shortMatchup(play.matchup, play.league)}</span>}
        {clock && <span className="win-card-clock">{clock}</span>}
      </div>
      {sealed ? <Pack word="OPEN" /> : (
        <div className="win-card-body">
          <div className="win-card-ticket">
            <div className="win-card-pick">
              <h3><FitTitle full={play.title} short={play.short} /></h3>
              {stake && <span className="win-stamp" style={{ opacity: stampOpacity(play.stakeUnits) }} aria-label={`Gary's bet: ${stake}`}>{stake}</span>}
            </div>
            <div className="win-card-state">
              <StateLine state={state} now={now} commence={play.commence} />
              <TicketStub play={play} />
            </div>
          </div>
          {free && play.reasons.length > 0 && (
            <ol className="win-free-reasons">
              {play.reasons.slice(0, 3).map(r => <li key={r.claim}>{r.claim}</li>)}
            </ol>
          )}
        </div>
      )}
      {tearing && <div className="win-tear" aria-hidden="true"><Pack word="OPEN" /></div>}
    </article>
  );
}

/** A settled play on one line: the result, the pick and the money. */
export function ResultRows({ plays, onOpen }: { plays: WinnersPlay[]; onOpen: (p: WinnersPlay) => void }) {
  return (
    <div className="win-rows">
      {plays.map(p => {
        const tone = p.scratched ? 'scratched' : (p.result ?? 'pending');
        const word = p.scratched ? 'Scratched' : p.result === 'won' ? 'Win' : p.result === 'lost' ? 'Loss' : p.result === 'push' ? 'Push' : 'Pending';
        const cash = p.scratched || !p.result ? '' : unitsNet(netUnits(p));
        return (
          <button type="button" key={p.id} className="win-row" onClick={() => onOpen(p)}>
            <b className={`win-word ${tone}`}>{word}</b>
            <span className="win-row-title">{p.rowTitle}</span>
            <span className={`win-row-money ${tone}`}>{cash}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The gold rule under the header, made of the shown day's plays, each as long as its bet. */
export function DayBar({ plays }: { plays: WinnersPlay[] }) {
  const live = plays
    .filter(p => !p.scratched)
    .sort((a, b) => (a.commence ?? '').localeCompare(b.commence ?? '') || a.id - b.id);
  return (
    <div className="win-daybar" aria-hidden="true">
      {live.map(p => (
        <i
          key={p.id}
          className={p.result ?? 'open'}
          style={{ '--u': p.result ? Math.max(0.5, p.stakeUnits ?? 1) : 1 } as React.CSSProperties}
        />
      ))}
      <span />
    </div>
  );
}

export interface WinnersRun { run_result: string | null; run_count: number; recent: number[] }

/** Gary's money over his last ten plays and his run. */
export function RunSpark({ run }: { run: WinnersRun }) {
  const tone = run.run_result === 'won' ? 'won' : run.run_result === 'lost' ? 'lost' : 'push';
  const label = run.run_result && run.run_count > 0 ? `${run.run_result === 'won' ? 'W' : 'L'}${run.run_count}` : '';
  const W = 92, H = 30, pad = 3;
  const values = run.recent.reduce<number[]>((sums, u) => [...sums, sums[sums.length - 1] + Number(u)], [0]);
  const top = Math.max(...values), bottom = Math.min(...values);
  const span = Math.max(top - bottom, 0.0001);
  const points = values.map((v, i) => [
    pad + (i * (W - pad * 2)) / Math.max(1, values.length - 1),
    pad + ((top - v) / span) * (H - pad * 2),
  ]);
  const last = points.at(-1);
  const sum = run.recent.reduce((a, b) => a + Number(b), 0);
  return (
    <div className="win-spark" role="img" aria-label={`Last ${run.recent.length} plays ${unitsNet(sum)}${label ? `, run ${label}` : ''}`}>
      {run.recent.length >= 2 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <polyline points={points.map(p => p.join(',')).join(' ')} />
          {last && <circle className={tone} cx={last[0]} cy={last[1]} r="3.4" />}
        </svg>
      )}
      {label && <b className={tone}>{label}</b>}
    </div>
  );
}
