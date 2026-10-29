'use client';

// A day taken off Gary's record, as the app draws it (founder, Oct 29 2026: "make it small and move it to the
// corner ... just enough so someone can see why we made the decision we made when they see a jump"): a small
// calendar leaf by the bankroll number opens the day's card — its bets as tiles by sport, five to a row, the rows
// past the daily max faint under a gold line; the day's record and money; the numbers now and after the scrub.
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/auth/client';

export interface Scrub {
  date: string;
  note: string;
  effective_date?: string;
  in_effect?: boolean;
  charge_units?: number;
}
export interface Standing { wins: number; losses: number; pushes: number; bankroll_units: number }

/** The most game bets Winners takes in one sport a day (the per-sport cap since Oct 18 2026). */
const DAILY_MAX = 5;

const monthDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const money = (u: number) => `$${Math.abs(Math.round(u * 100)).toLocaleString('en-US')}`;
const signed = (u: number) => `${Math.round(u * 100) < 0 ? '-' : '+'}${money(u)}`;
const tint = (u: number) => (u < -0.005 ? 'text-loss' : u > 0.005 ? 'text-win' : 'text-hi');
const payout = (odds: number | null) => (!odds ? 1 : odds > 0 ? odds / 100 : 100 / Math.abs(odds));

type Result = 'won' | 'lost' | 'push';
/** Whole class names, so Tailwind finds them: a bet inside the daily max, and one past it (faint). */
const TILE: Record<Result, { in: string; over: string }> = {
  won: { in: 'bg-win text-black/75', over: 'border border-win/70 bg-win/25 text-win' },
  lost: { in: 'bg-loss text-black/75', over: 'border border-loss/70 bg-loss/25 text-loss' },
  push: { in: 'bg-mid text-black/75', over: 'border border-mid/70 bg-mid/25 text-mid' },
};
interface Bet { id: number; league: string; result: Result; net: number }
interface BoardTicket {
  candidate_id: number;
  league: string;
  stake_units: number | string | null;
  scratched_at: string | null;
  result: { result?: string } | null;
  pick_snapshot: { odds?: number | string | null; pick?: string } | null;
}

function toBets(tickets: BoardTicket[]): Bet[] {
  return tickets.flatMap((t) => {
    const r = String(t.result?.result ?? '').toLowerCase();
    if (t.scratched_at || !r) return [];
    const result: Result = r.startsWith('w') ? 'won' : r.startsWith('l') ? 'lost' : 'push';
    const stake = Number(t.stake_units) || 0;
    const raw = t.pick_snapshot?.odds ?? t.pick_snapshot?.pick?.match(/[+-]\d{3,4}\s*$/)?.[0] ?? null;
    const odds = raw == null ? null : Number(String(raw).replace('+', '').trim()) || null;
    const net = result === 'won' ? stake * payout(odds) : result === 'lost' ? -stake : 0;
    return [{ id: t.candidate_id, league: String(t.league).toUpperCase(), result, net }];
  });
}

function line(bets: Bet[]) {
  return {
    won: bets.filter((b) => b.result === 'won').length,
    lost: bets.filter((b) => b.result === 'lost').length,
    push: bets.filter((b) => b.result === 'push').length,
    net: bets.reduce((s, b) => s + b.net, 0),
  };
}
const record = (l: { won: number; lost: number; push: number }) => `${l.won}–${l.lost}${l.push ? `–${l.push}` : ''}`;

function DateLeaf({ ymd, small = false }: { ymd: string; small?: boolean }) {
  const [mon, day] = monthDay(ymd).split(' ');
  return (
    <span className={`flex flex-col items-center justify-center rounded-[10px] border border-gold/50 bg-black ${small ? 'h-[38px] w-9' : 'h-[46px] w-11'}`}>
      <span className={`font-bold uppercase tracking-widest text-gold ${small ? 'text-[8px]' : 'text-[9.5px]'}`}>{mon}</span>
      <span className={`font-bold leading-none text-white ${small ? 'text-base' : 'text-xl'}`}>{day}</span>
    </span>
  );
}

/** The corner leaf by the bankroll number; a click opens the day's card. */
export function ScrubCorner({ scrub, standing }: { scrub: Scrub; standing: Standing }) {
  const [open, setOpen] = useState(false);
  const day = monthDay(scrub.date);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative ml-auto self-center p-2"
        aria-label={scrub.in_effect === false && scrub.effective_date ? `${day} comes off Gary's record ${monthDay(scrub.effective_date)}` : `Why ${day} is off Gary's record`}
      >
        <DateLeaf ymd={scrub.date} small />
        <span aria-hidden="true" className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[10px] font-black text-black">i</span>
      </button>
      <ScrubDayDialog scrub={scrub} standing={standing} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function ScrubDayDialog({ scrub, standing, open, onClose }: { scrub: Scrub; standing: Standing; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [bets, setBets] = useState<Bet[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open && ref.current?.open) ref.current.close();
  }, [open]);

  useEffect(() => {
    if (!open || bets) return;
    let live = true;
    supabaseBrowser().rpc('get_winners_board', { p_date: scrub.date }).then(({ data, error }: { data: unknown; error: unknown }) => {
      if (!live) return;
      const tickets = (data as { tickets?: BoardTicket[] } | null)?.tickets;
      if (error || !Array.isArray(tickets)) setFailed(true);
      else setBets(toBets(tickets));
    });
    return () => { live = false; };
  }, [open, bets, scrub.date]);

  const day = monthDay(scrub.date);
  const pending = scrub.in_effect === false;
  const effective = monthDay(scrub.effective_date ?? scrub.date);
  const sports = bets
    ? [...new Set(bets.map((b) => b.league))].map((league) => ({ league, bets: bets.filter((b) => b.league === league) })).sort((a, b) => b.bets.length - a.bets.length)
    : [];
  const d = bets ? line(bets) : null;
  const charge = scrub.charge_units ?? 0;
  const s = standing;
  const rec = (w: number, l: number, p: number) => `${w}–${l}–${p}`;
  const cols = d && (pending
    ? [{ head: 'Now', record: rec(s.wins, s.losses, s.pushes), bank: s.bankroll_units, day: d.net },
       { head: effective, record: rec(s.wins - d.won, s.losses - d.lost, s.pushes - d.push), bank: s.bankroll_units - d.net - charge, day: -charge }]
    : [{ head: 'Before', record: rec(s.wins + d.won, s.losses + d.lost, s.pushes + d.push), bank: s.bankroll_units + d.net + charge, day: d.net },
       { head: 'Now', record: rec(s.wins, s.losses, s.pushes), bank: s.bankroll_units, day: -charge }]);

  return (
    <dialog
      ref={ref}
      aria-label={`${day}, off Gary's record`}
      onCancel={onClose}
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="m-auto w-[min(92vw,30rem)] rounded-[22px] border border-gold/35 bg-card p-0 text-hi backdrop:bg-black/60"
    >
      <div className="relative max-h-[80vh] overflow-y-auto px-5 pb-7 pt-6">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-hi">×</button>
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-gold">{day} · Winners bug</p>
        <h2 className="mt-1 pr-10 font-display text-4xl uppercase">{bets ? `${bets.length} bets in one day` : day}</h2>

        {failed && <p className="mt-6 text-sm text-mid">The day could not be loaded. Close and try again.</p>}
        {!bets && !failed && <p className="mt-6 text-sm text-mid" role="status">Loading the day…</p>}

        {bets && d && cols && <>
          {sports.map(({ league, bets: list }) => {
            const l = line(list);
            const rows = Array.from({ length: Math.ceil(list.length / DAILY_MAX) }, (_, i) => list.slice(i * DAILY_MAX, i * DAILY_MAX + DAILY_MAX));
            return (
              <section key={league} className="mt-6" aria-label={`${league}, ${list.length} bets, ${record(l)}, ${signed(l.net)}`}>
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs font-bold tracking-widest text-hi/80">{league}</span>
                  <span className="font-mono text-[11px] tracking-widest text-low">{list.length} BETS</span>
                  <span className="ml-auto font-mono text-sm">{record(l)}</span>
                  <span className={`font-mono text-sm ${tint(l.net)}`}>{signed(l.net)}</span>
                </div>
                {rows.map((row, r) => (
                  <div key={r}>
                    {r === 1 && (
                      <div className="my-2 flex items-center gap-2" aria-hidden="true">
                        <span className="h-px flex-1 border-t border-dashed border-gold/80" />
                        <span className="font-mono text-[10px] font-black tracking-widest text-gold">DAILY MAX {DAILY_MAX} · {list.length - DAILY_MAX} OVER</span>
                        <span className="h-px flex-1 border-t border-dashed border-gold/80" />
                      </div>
                    )}
                    <div className="mt-1.5 grid grid-cols-5 gap-1.5" aria-hidden="true">
                      {row.map((b) => (
                        <span key={b.id} className={`flex h-7 items-center justify-center rounded-md text-[11px] font-black ${r > 0 ? TILE[b.result].over : TILE[b.result].in}`}>
                          {b.result === 'won' ? 'W' : b.result === 'lost' ? 'L' : 'P'}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            );
          })}

          <div className="mt-7 flex items-baseline gap-3">
            <span className="font-mono text-xs font-bold tracking-widest text-low">THE DAY</span>
            <span className="ml-auto font-display text-3xl">{record(d)}</span>
            <span className={`font-display text-3xl ${tint(d.net)}`}>{signed(d.net)}</span>
          </div>

          <table className="mt-6 w-full border-t border-line pt-4 font-mono text-sm">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-widest">
                <th className="pt-4 text-left font-bold text-low" scope="col"><span className="sr-only">What</span></th>
                <th className="pt-4 text-right font-bold text-low" scope="col">{cols[0].head}</th>
                <th aria-hidden="true" />
                <th className="pt-4 text-right font-bold text-gold" scope="col">{cols[1].head}</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Record', cols[0].record, cols[1].record, 'text-hi', 'text-hi'],
                ['Bankroll', money(cols[0].bank), money(cols[1].bank), 'text-hi', 'text-hi'],
                [day, signed(cols[0].day), signed(cols[1].day), tint(cols[0].day), tint(cols[1].day)],
              ].map(([label, from, to, fromTint, toTint]) => (
                <tr key={label}>
                  <th scope="row" className="pt-3 text-left text-[11px] font-bold uppercase tracking-widest text-low">{label}</th>
                  <td className={`pt-3 text-right opacity-70 ${fromTint} ${pending ? '' : 'line-through'}`}>{from}</td>
                  <td aria-hidden="true" className="px-2 pt-3 text-center text-gold/80">→</td>
                  <td className={`pt-3 text-right text-base font-bold ${toTint}`}>
                    {to}
                    {label === day && <span className="block text-[9px] font-black tracking-widest text-gold">CHARGE</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>}
      </div>
    </dialog>
  );
}
