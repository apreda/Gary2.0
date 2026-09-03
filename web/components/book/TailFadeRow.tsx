'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBookDay, useUnitDollars } from './BookDay';
import {
  findExistingGameBet,
  findExistingPropBet,
  fmtNet,
  fmtStake,
  gameDateForBook,
  gamePickReceiptKey,
  tailFadeCountForGame,
  type UserBet,
} from '@/lib/book/model';
import {
  bookIntentAccountHref,
  clearBookIntent,
  gameIntentKey,
  propIntentKey,
  readBookIntent,
} from '@/lib/auth/book-intent';
import { parseGameTime } from '@/lib/gary/format';
import { todayEST } from '@/lib/gary/dates';
import { logBookActionStarted, logFirstBookAction } from '@/lib/gary/analytics';

// ─────────────────────────────────────────────────────────────────────────────
// Tail/Fade rows — the same interaction as the app's card backs. One tap arms
// a stake stepper; confirm logs it through the lock-checked RPC. After lock
// the row freezes into a receipt chip; after grading it shows the result.
// Neutral twins at rest (founder, Aug 4) — color arrives only after a call.
// ─────────────────────────────────────────────────────────────────────────────

const FADE_TINT = '#8B93A7';
const STREAK_TINT = '#E5844B';

function useLocked(commence?: string | null): boolean {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const d = parseGameTime(commence);
      if (d) setLocked(Date.now() >= d.getTime());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [commence]);
  return locked;
}

function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="mt-2 font-mono text-[10.5px] text-loss/90">{text}</p>;
}

function ResultTag({ bet, unitDollars }: { bet: UserBet; unitDollars: number }) {
  const won = bet.status === 'won';
  const wash = bet.status === 'push' || bet.status === 'void';
  const text = wash ? bet.status.toUpperCase() : fmtNet(bet.units_net ?? 0, unitDollars);
  const est = bet.odds_estimated && won ? ' est' : '';
  return (
    <span
      className={`tnum font-mono text-[11px] font-bold ${
        wash ? 'text-low' : won ? 'text-win' : 'text-loss'
      }`}
    >
      {text + est}
    </span>
  );
}

function PlacedChip({
  bet,
  locked,
  tailColor,
  unitDollars,
  onUndo,
  busy,
}: {
  bet: UserBet;
  locked: boolean;
  tailColor: string;
  unitDollars: number;
  onUndo: () => void;
  busy: boolean;
}) {
  const tail = bet.kind === 'tail';
  const tint = tail ? tailColor : FADE_TINT;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className="rounded-chip px-3 py-2 font-mono text-[11.5px] font-bold tracking-[0.08em]"
        style={{ color: tint, background: `${tint}1F` }}
      >
        {tail ? 'YOU TAILED' : 'YOU FADED'} · {fmtStake(bet.stake_units, unitDollars)}
      </span>
      {bet.streak_pick && (
        <span className="font-mono text-[9.5px] font-bold tracking-[0.08em]" style={{ color: STREAK_TINT }}>
          STREAK
        </span>
      )}
      {bet.status !== 'pending' ? (
        <ResultTag bet={bet} unitDollars={unitDollars} />
      ) : (
        !locked && (
          <button
            type="button"
            onClick={onUndo}
            disabled={busy}
            className="font-mono text-[10.5px] text-low transition-colors hover:text-mid disabled:opacity-50"
          >
            Undo
          </button>
        )
      )}
    </div>
  );
}

function StakePicker({
  side,
  tailColor,
  showStreak,
  busy,
  onConfirm,
  onBack,
}: {
  side: 'tail' | 'fade';
  tailColor: string;
  showStreak: boolean;
  busy: boolean;
  onConfirm: (stake: number, streak: boolean) => void;
  onBack: () => void;
}) {
  const [stake, setStake] = useState(1.0);
  const [streakOn, setStreakOn] = useState(false);
  const [unitDollars] = useUnitDollars();
  const tint = side === 'tail' ? tailColor : FADE_TINT;

  const step = (dir: 1 | -1) => {
    setStake(s => Math.min(5, Math.max(0.5, Math.round((s + dir * 0.5) * 2) / 2)));
  };

  const stepBtn =
    'flex h-7 w-7 items-center justify-center rounded-chip border border-line text-[15px] leading-none text-mid transition-colors hover:border-gold/50 hover:text-hi disabled:opacity-40';

  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
      <span className="font-mono text-[11.5px] font-bold tracking-[0.1em]" style={{ color: tint }}>
        {side.toUpperCase()}
      </span>
      <span className="flex items-center gap-2">
        <button type="button" aria-label="Less" onClick={() => step(-1)} disabled={busy} className={stepBtn}>
          &minus;
        </button>
        <span className="tnum min-w-[46px] text-center font-mono text-[12.5px] font-bold text-hi/85">
          {fmtStake(stake, unitDollars)}
        </span>
        <button type="button" aria-label="More" onClick={() => step(1)} disabled={busy} className={stepBtn}>
          +
        </button>
      </span>
      {showStreak && (
        <button
          type="button"
          onClick={() => setStreakOn(v => !v)}
          className="flex flex-col items-center gap-[3px] font-mono text-[9.5px] font-bold tracking-[0.08em]"
          style={{ color: streakOn ? STREAK_TINT : 'rgba(255,255,255,0.5)' }}
        >
          STREAK
          <span
            aria-hidden
            className="h-[1.5px] w-full"
            style={{ background: streakOn ? STREAK_TINT : 'transparent' }}
          />
        </button>
      )}
      <button
        type="button"
        onClick={() => onConfirm(stake, streakOn)}
        disabled={busy}
        className="rounded-chip bg-gold px-3.5 py-1.5 font-mono text-[11.5px] font-bold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Confirm in My Book
      </button>
      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        className="font-mono text-[10.5px] text-low transition-colors hover:text-mid"
      >
        Back
      </button>
    </div>
  );
}

const twinBtn =
  'flex-1 rounded-chip border border-white/10 bg-white/[0.07] px-3 py-2.5 font-mono text-[11px] font-bold tracking-[0.12em] text-hi/85 transition-colors hover:border-gold/40 hover:text-hi disabled:opacity-50';

/** Tail/fade on a game pick. Renders nothing outside a BookDayProvider. */
export function TailFadeRow({
  pickText,
  pickId,
  commence,
  trackingUnavailableReason,
}: {
  pickText: string;
  pickId?: string | null;
  commence?: string | null;
  trackingUnavailableReason?: string | null;
}) {
  const ctx = useBookDay();
  const router = useRouter();
  const locked = useLocked(commence);
  const [unitDollars] = useUnitDollars();
  const [arming, setArming] = useState<'tail' | 'fade' | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const intentKey = gameIntentKey(pickId, pickText);
  const gameDate = gameDateForBook(commence, ctx?.date ?? todayEST());
  const receiptKey = gamePickReceiptKey(gameDate, pickText);
  const ambiguous = ctx?.ambiguousGamePickReceiptKeys.has(receiptKey) ?? false;
  const mine = !ambiguous && ctx ? findExistingGameBet(ctx.mine, gameDate, pickText) : null;
  // The provider's aggregate is explicitly for its primary date. Never show
  // that number beside a different day from a multi-date weekly board.
  const riders = ambiguous || !ctx
    ? undefined
    : tailFadeCountForGame(ctx.counts, ctx.date, gameDate, pickText);
  const ridersLine =
    riders && riders.tails + riders.fades > 0
      ? [riders.tails > 0 ? `${riders.tails} RIDING` : null, riders.fades > 0 ? `${riders.fades} FADING` : null]
          .filter(Boolean)
          .join(' · ')
      : null;

  useEffect(() => {
    if (!ctx?.ready || !ctx.signedIn || arming) return;
    const intent = readBookIntent(window.location.search);
    if (intent?.kind !== 'game' || intent.key !== intentKey) return;
    const timer = window.setTimeout(() => {
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.replaceState(window.history.state, '', clearBookIntent(current));
      if (!ambiguous && !mine && !locked) setArming(intent.side);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ambiguous, arming, ctx?.ready, ctx?.signedIn, intentKey, locked, mine]);

  if (!ctx || !pickText) return null;

  if (trackingUnavailableReason) {
    return (
      <p className="mt-4 text-right font-mono text-[9.5px] leading-relaxed text-low">
        {trackingUnavailableReason}
      </p>
    );
  }

  if (ambiguous) {
    return (
      <p className="mt-4 text-right font-mono text-[9.5px] leading-relaxed text-low">
        Book tracking is unavailable for this call because another game has the
        same listed selection. The pick and analysis are unchanged.
      </p>
    );
  }

  if (!mine && locked) return null; // never advertise a bet you can no longer place

  const arm = (side: 'tail' | 'fade') => {
    setErrorText(null);
    logBookActionStarted(side, {
      content_type: 'game',
      ...(pickId ? { item_id: pickId.toLowerCase() } : {}),
    });
    if (!ctx.signedIn) {
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      router.push(bookIntentAccountHref(current, { kind: 'game', side, key: intentKey }));
      return;
    }
    setArming(side);
  };

  const place = async (stake: number, streak: boolean) => {
    setBusy(true);
    try {
      const action = arming!;
      const { placeBet } = await import('@/lib/book/api');
      const bet = await placeBet({
        gameDate,
        pickId,
        pickText,
        kind: action,
        stake,
        streak,
      });
      ctx.addBet(bet);
      logFirstBookAction(action, {
        content_type: 'game',
        ...(pickId ? { item_id: pickId.toLowerCase() } : {}),
      });
      setArming(null);
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'We could not save that right now.');
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!mine) return;
    setBusy(true);
    setErrorText(null);
    try {
      const { deleteBet } = await import('@/lib/book/api');
      if (await deleteBet(mine.id)) ctx.removeBet(mine.id);
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'We could not undo that right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      {ridersLine && (
        <p className="mb-2 text-right font-mono text-[10px] tracking-[0.05em] text-low">{ridersLine}</p>
      )}
      {mine ? (
        <PlacedChip
          bet={mine}
          locked={locked}
          tailColor="#C9A227"
          unitDollars={unitDollars}
          onUndo={undo}
          busy={busy}
        />
      ) : arming ? (
        <StakePicker
          side={arming}
          tailColor="#C9A227"
          showStreak
          busy={busy}
          onConfirm={place}
          onBack={() => setArming(null)}
        />
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => arm('tail')} disabled={busy || !ctx.ready} className={twinBtn}>
            BET WITH GARY
          </button>
          <button type="button" onClick={() => arm('fade')} disabled={busy || !ctx.ready} className={twinBtn}>
            FADE THE BEAR
          </button>
        </div>
      )}
      {!mine && (
        <p className="mt-2 text-right font-mono text-[9.5px] leading-relaxed text-low">
          Tracks your prediction — no wager is placed.
        </p>
      )}
      <ErrorLine text={errorText} />
    </div>
  );
}

/** Tail/fade on a player prop. Same anatomy; the board's prop token
 *  ("total_bases 1.5" → "total_bases") is the key the grader settles on. */
export function PropTailFadeRow({
  player,
  prop,
  commence,
}: {
  player: string;
  prop: string;
  commence?: string | null;
}) {
  const ctx = useBookDay();
  const router = useRouter();
  const locked = useLocked(commence);
  const [unitDollars] = useUnitDollars();
  const [arming, setArming] = useState<'tail' | 'fade' | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const propToken = (prop.split(' ')[0] ?? '').toLowerCase();
  const intentKey = propIntentKey(player, propToken);
  // Props are stored in the provider's daily prop_picks row. Preserve that
  // publication-date identity; only game cards can span a weekly board.
  const gameDate = ctx?.date ?? gameDateForBook(commence, todayEST());
  const mine = ctx ? findExistingPropBet(ctx.mine, gameDate, player, propToken) : null;

  useEffect(() => {
    if (!ctx?.ready || !ctx.signedIn || arming) return;
    const intent = readBookIntent(window.location.search);
    if (intent?.kind !== 'prop' || intent.key !== intentKey) return;
    const timer = window.setTimeout(() => {
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.replaceState(window.history.state, '', clearBookIntent(current));
      if (!mine && !locked) setArming(intent.side);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [arming, ctx?.ready, ctx?.signedIn, intentKey, locked, mine]);

  if (!ctx || !player || !propToken) return null;

  if (!mine && locked) return null;

  const arm = (side: 'tail' | 'fade') => {
    setErrorText(null);
    logBookActionStarted(side, { content_type: 'prop' });
    if (!ctx.signedIn) {
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      router.push(bookIntentAccountHref(current, { kind: 'prop', side, key: intentKey }));
      return;
    }
    setArming(side);
  };

  const place = async (stake: number) => {
    setBusy(true);
    try {
      const action = arming!;
      const { placePropBet } = await import('@/lib/book/api');
      const bet = await placePropBet({
        gameDate,
        player,
        propType: propToken,
        kind: action,
        stake,
      });
      ctx.addBet(bet);
      logFirstBookAction(action, { content_type: 'prop' });
      setArming(null);
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'We could not save that right now.');
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!mine) return;
    setBusy(true);
    setErrorText(null);
    try {
      const { deleteBet } = await import('@/lib/book/api');
      if (await deleteBet(mine.id)) ctx.removeBet(mine.id);
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'We could not undo that right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3.5">
      {mine ? (
        <PlacedChip
          bet={mine}
          locked={locked}
          tailColor="#D7DCE4"
          unitDollars={unitDollars}
          onUndo={undo}
          busy={busy}
        />
      ) : arming ? (
        <StakePicker
          side={arming}
          tailColor="#D7DCE4"
          showStreak={false}
          busy={busy}
          onConfirm={place}
          onBack={() => setArming(null)}
        />
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => arm('tail')} disabled={busy || !ctx.ready} className={twinBtn}>
            BET WITH GARY
          </button>
          <button type="button" onClick={() => arm('fade')} disabled={busy || !ctx.ready} className={twinBtn}>
            FADE THE BEAR
          </button>
        </div>
      )}
      {!mine && (
        <p className="mt-2 text-right font-mono text-[9.5px] leading-relaxed text-low">
          Tracks your prediction — no wager is placed.
        </p>
      )}
      <ErrorLine text={errorText} />
    </div>
  );
}
