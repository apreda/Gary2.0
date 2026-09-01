'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBookDay, useUnitDollars } from './BookDay';
import { fmtNet, fmtStake, type UserBet } from '@/lib/book/model';
import { parseGameTime } from '@/lib/gary/format';
import { estDateStr, todayEST } from '@/lib/gary/dates';

// ─────────────────────────────────────────────────────────────────────────────
// Tail/Fade rows — the same interaction as the app's card backs. One tap arms
// a stake stepper; confirm logs it through the lock-checked RPC. After lock
// the row freezes into a receipt chip; after grading it shows the result.
// Neutral twins at rest (founder, Aug 4) — color arrives only after a call.
// ─────────────────────────────────────────────────────────────────────────────

const FADE_TINT = '#8B93A7';
const STREAK_TINT = '#E5844B';

/** The pick's ET calendar date — from its own start time, so a late-night
 *  card can never post against the wrong daily_picks row. */
function pickDateEST(commence?: string | null): string {
  const d = parseGameTime(commence);
  return d ? estDateStr(d) : todayEST();
}

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
        Lock it in
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
}: {
  pickText: string;
  pickId?: string | null;
  commence?: string | null;
}) {
  const ctx = useBookDay();
  const router = useRouter();
  const locked = useLocked(commence);
  const [unitDollars] = useUnitDollars();
  const [arming, setArming] = useState<'tail' | 'fade' | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  if (!ctx || !pickText) return null;

  const mine = ctx.mine.find(b => b.pick_text === pickText && b.pick_type === 'game') ?? null;
  const riders = ctx.counts[pickText];
  const ridersLine =
    riders && riders.tails + riders.fades > 0
      ? [riders.tails > 0 ? `${riders.tails} RIDING` : null, riders.fades > 0 ? `${riders.fades} FADING` : null]
          .filter(Boolean)
          .join(' · ')
      : null;

  if (!mine && locked) return null; // never advertise a bet you can no longer place

  const arm = (side: 'tail' | 'fade') => {
    setErrorText(null);
    if (!ctx.signedIn) {
      router.push('/account');
      return;
    }
    setArming(side);
  };

  const place = async (stake: number, streak: boolean) => {
    setBusy(true);
    try {
      const { placeBet } = await import('@/lib/book/api');
      const bet = await placeBet({
        gameDate: pickDateEST(commence),
        pickId,
        pickText,
        kind: arming!,
        stake,
        streak,
      });
      ctx.addBet(bet);
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
  if (!ctx || !player || !propToken) return null;

  const mine =
    ctx.mine.find(
      b =>
        b.pick_type === 'prop' &&
        (b.player_name ?? '').toLowerCase() === player.toLowerCase() &&
        (b.prop_type ?? '').toLowerCase() === propToken,
    ) ?? null;

  if (!mine && locked) return null;

  const arm = (side: 'tail' | 'fade') => {
    setErrorText(null);
    if (!ctx.signedIn) {
      router.push('/account');
      return;
    }
    setArming(side);
  };

  const place = async (stake: number) => {
    setBusy(true);
    try {
      const { placePropBet } = await import('@/lib/book/api');
      const bet = await placePropBet({
        gameDate: pickDateEST(commence),
        player,
        propType: propToken,
        kind: arming!,
        stake,
      });
      ctx.addBet(bet);
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
      <ErrorLine text={errorText} />
    </div>
  );
}
