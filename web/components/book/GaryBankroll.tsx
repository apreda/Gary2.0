'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/auth/client';
import { ScrubCorner, type Scrub } from './ScrubDay';

export interface BankrollSnapshot {
  started_at: string;
  initial_units: number;
  bankroll_units: number;
  profit_units: number;
  growth_pct: number;
  available_units: number;
  at_risk_units: number;
  wagered_units: number;
  roi_pct: number | null;
  win_pct: number | null;
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  pending: number;
  flat_profit_units: number;
  max_drawdown_units: number;
  curve: { date: string; net_units: number; flat_units: number }[];
  /** Days taken off the record, each with the note fans read (Oct 29 2026: Oct 17's bug day). */
  scrubbed?: Scrub[];
}
/** Winners is real money (founder, Sep 22 2026): one unit is $100 of Gary's $10,000, so units read as dollars. */
const dollars = (u: number) => `$${Math.abs(Math.round(u * 100)).toLocaleString('en-US')}`;
const signed = (u: number) => `${Math.round(u * 100) < 0 ? '-' : '+'}${dollars(u)}`;

export function BankrollReport({ data: b }: { data: BankrollSnapshot }) {
  const points = [{ date: 'Start', net_units: 0, flat_units: 0 }, ...b.curve];
  const values = points.flatMap(p => [p.net_units, p.flat_units]);
  const low = Math.min(...values, -1), high = Math.max(...values, 1);
  const path = (field: 'net_units' | 'flat_units') => points.map((p, i) =>
    `${i ? 'L' : 'M'}${12 + i / Math.max(1, points.length - 1) * 576},${148 - (p[field] - low) / (high - low) * 136}`).join(' ');
  return (
    <section className="rounded-panel border border-gold/30 bg-card p-5 sm:p-7" aria-label="Gary's simulated bankroll">
      <p className="font-mono text-xs uppercase tracking-widest text-gold">Gary&apos;s bankroll · Simulated</p>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <h2 className="font-display text-5xl text-hi">{dollars(b.bankroll_units)}</h2>
        <p className={b.profit_units < 0 ? 'text-loss' : 'text-win'}>{signed(b.profit_units)} · {b.growth_pct.toFixed(2)}% growth</p>
        {/* A day off the record rides the number's corner, one click from its card (Oct 29 2026). */}
        {(b.scrubbed ?? []).map(d => <ScrubCorner key={d.date} scrub={d} standing={b} />)}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-mid">Started with {dollars(b.initial_units)} on {new Date(b.started_at).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' })}. All sports and Winners markets · Since inception.</p>
      <dl className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-4">
        {[
          ['Win rate', b.win_pct === null ? '—' : `${b.win_pct.toFixed(1)}%`],
          ['Record', `${b.wins}–${b.losses}–${b.pushes}`],
          ['ROI', b.roi_pct === null ? '—' : `${b.roi_pct.toFixed(1)}%`],
          ['Max drawdown', dollars(b.max_drawdown_units)],
          ['Available', dollars(b.available_units)],
          ['At risk', dollars(b.at_risk_units)],
          ['Pending bets', String(b.pending)],
          ['Same bets at $100', signed(b.flat_profit_units)],
        ].map(([label, value]) => <div key={label}><dt className="text-xs text-low">{label}</dt><dd className="mt-1 font-mono text-lg text-hi">{value}</dd></div>)}
      </dl>
      {b.curve.length > 0 ? <figure className="mt-6">
        <svg viewBox="0 0 600 160" role="img" aria-label={`Cumulative profit: Gary ${signed(b.profit_units)}, same bets flat ${signed(b.flat_profit_units)}`} className="w-full">
          <path d={path('flat_units')} fill="none" stroke="#888" strokeWidth="2" strokeDasharray="5 4" />
          <path d={path('net_units')} fill="none" stroke="#C9A227" strokeWidth="3" />
        </svg>
        <figcaption className="flex justify-between text-xs text-low"><span>{points[1].date}</span><span>Gold: Gary · Dashed: $100 a bet</span><span>{points.at(-1)?.date}</span></figcaption>
        <details className="mt-3 text-xs text-mid"><summary className="cursor-pointer">Daily results</summary><table className="mt-2 w-full text-left"><thead><tr><th>Date</th><th>Gary net</th><th>Flat net</th></tr></thead><tbody>{b.curve.map(p => <tr key={p.date}><td>{p.date}</td><td>{signed(p.net_units)}</td><td>{signed(p.flat_units)}</td></tr>)}</tbody></table></details>
      </figure> : <p className="mt-6 text-sm text-mid">{b.bets ? 'The curve begins when the first bets settle.' : 'The bankroll is ready for the next published Winners bets.'}</p>}
      <p className="mt-5 text-xs leading-relaxed text-low">Stakes are the dollars risked, locked before play. ROI is net profit / settled stakes, excluding voids. The $100 comparison uses these exact bets and odds. Earlier flat-stake history remains below.</p>
    </section>
  );
}

export function GaryBankroll({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<BankrollSnapshot | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await supabaseBrowser().rpc('get_gary_bankroll');
        if (result.error || !result.data) throw new Error('Unavailable');
        if (active) { setData(result.data as BankrollSnapshot); setError(false); }
      } catch { if (active) setError(true); }
    };
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60000);
    return () => { active = false; window.clearInterval(interval); };
  }, [attempt]);
  return <div className="my-7">
    {data && (compact ? <Link href="/results" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-gold/30 bg-card p-4">
      <span><span className="block text-xs uppercase tracking-widest text-gold">Gary’s simulated bankroll</span><strong className="mt-1 block font-mono text-xl text-hi">{dollars(data.bankroll_units)} <span className="text-sm text-mid">· {signed(data.profit_units)}</span></strong></span>
      <span className="text-xs text-mid">{dollars(data.at_risk_units)} at risk · View results →</span>
    </Link> : <BankrollReport data={data} />)}
    {error ? <p role="alert" className="text-sm text-mid">Bankroll {data ? 'refresh' : 'data'} unavailable. <button className="text-gold underline" onClick={() => setAttempt(n => n + 1)}>Retry</button></p>
      : !data && <p role="status" className="text-sm text-mid">Loading Gary&apos;s simulated bankroll…</p>}
  </div>;
}
