'use client';

import { useState } from 'react';
import {
  BREAKDOWN_DIMENSIONS, MARKET_OPTIONS, MAX_TAGS, PERIOD_KINDS, addTag, breakdownRows, canMoveForward,
  parseTags, periodContaining, periodKicker, shiftPeriod,
  type BookPeriod, type BreakdownDimension, type PeriodKind, type RollingWindow,
} from '@/lib/book/analytics';
import { fmtNetTotal, type UserBet } from '@/lib/book/model';
import { bookButton, bookField } from './LogBet';

/** WEEK · MONTH · YEAR · ALL with previous / next paging. */
export function PeriodPager({ period, today, onChange }: { period: BookPeriod; today: string; onChange: (p: BookPeriod) => void }) {
  const pick = (kind: PeriodKind) => {
    if (kind === period.kind) return;
    const anchor = period.kind === 'all' ? today : period.end < today ? period.end : today;
    onChange(periodContaining(anchor, kind));
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-4">
        {PERIOD_KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            aria-pressed={period.kind === k.key}
            onClick={() => pick(k.key)}
            className={`py-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] ${period.kind === k.key ? 'border-b border-gold text-hi' : 'text-mid'}`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onChange(shiftPeriod(period, -1))} disabled={period.kind === 'all'} aria-label="Previous period" className="h-9 w-9 rounded-chip text-gold hover:bg-white/5 disabled:text-white/20">
          ‹
        </button>
        <span className="min-w-[160px] text-center font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-hi">{periodKicker(period)}</span>
        <button type="button" onClick={() => onChange(shiftPeriod(period, 1))} disabled={!canMoveForward(period, today)} aria-label="Next period" className="h-9 w-9 rounded-chip text-gold hover:bg-white/5 disabled:text-white/20">
          ›
        </button>
      </div>
    </div>
  );
}

/** LEAGUE · TYPE · BOOK · TAGS · VS GARY · GARY'S LEAN — columns mirror Gary's BY SPORT grid. */
export function BookBreakdowns({ rows, scopeLine, unitDollars }: { rows: UserBet[]; scopeLine: string; unitDollars: number }) {
  const [dimension, setDimension] = useState<BreakdownDimension>('league');
  const meta = BREAKDOWN_DIMENSIONS.find((d) => d.key === dimension)!;
  const table = breakdownRows(rows, dimension);
  return (
    <section className="quant-panel overflow-hidden" aria-labelledby="book-breakdowns-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-5 py-3">
        <h2 id="book-breakdowns-heading" className="font-mono text-[11.5px] font-bold uppercase tracking-[0.1em] text-gold">Breakdowns</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-low">{scopeLine}</span>
      </div>
      <div className="flex flex-wrap gap-4 px-5 pt-4">
        {BREAKDOWN_DIMENSIONS.map((d) => (
          <button
            key={d.key}
            type="button"
            aria-pressed={dimension === d.key}
            onClick={() => setDimension(d.key)}
            className={`py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] ${dimension === d.key ? 'border-b border-gold text-hi' : 'text-mid'}`}
          >
            {d.label}
          </button>
        ))}
      </div>
      {table.length === 0 ? (
        <p className="px-5 py-5 text-[13px] leading-relaxed text-mid">{meta.empty}</p>
      ) : (
        <div className="overflow-x-auto px-5 pb-4 pt-3">
          <table className="w-full min-w-[420px] text-left">
            <thead>
              <tr className="font-mono text-[9.5px] uppercase tracking-wider text-low">
                <th className="py-2">{meta.column}</th>
                <th className="w-12 text-right">GP</th>
                <th className="w-16 text-right">Win%</th>
                <th className="w-24 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.key} className="border-t border-line">
                  <td className="py-2.5">
                    <p className="text-[13px] font-semibold text-hi">{r.label}</p>
                    <p className="font-mono text-[10px] text-low">{r.record}</p>
                  </td>
                  <td className="text-right font-mono text-[12px] text-mid">{r.played}</td>
                  <td className={`text-right font-mono text-[12px] ${r.winPct != null && r.winPct >= 50 ? 'text-win' : 'text-mid'}`}>
                    {r.winPct == null ? '—' : `${Math.round(r.winPct)}%`}
                  </td>
                  <td className={`tnum text-right font-mono text-[12px] font-bold ${Math.abs(r.net) < 0.005 ? 'text-mid' : r.net > 0 ? 'text-win' : 'text-loss'}`}>
                    {fmtNetTotal(r.net, unitDollars)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Rolling 30 · 60 · 90 days ending today, independent of the period. */
export function BookBankroll({ windows, sourceLine, unitDollars }: { windows: RollingWindow[]; sourceLine: string; unitDollars: number }) {
  const scale = Math.max(...windows.map((w) => Math.abs(w.summary.profit)), 0.01);
  return (
    <section className="quant-panel overflow-hidden" aria-labelledby="book-bankroll-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-5 py-3">
        <h2 id="book-bankroll-heading" className="font-mono text-[11.5px] font-bold uppercase tracking-[0.1em] text-gold">Bankroll health</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-low">Rolling · ends today</span>
      </div>
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
        {windows.map((w) => {
          const s = w.summary;
          const tone = s.settledCount === 0 ? 'text-low' : s.profit >= 0 ? 'text-win' : 'text-loss';
          const bar = s.settledCount === 0 ? 'bg-white/10' : s.profit >= 0 ? 'bg-win' : 'bg-loss';
          return (
            <div key={w.days} className="rounded-card border border-line bg-white/[0.03] p-3">
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-gold">{w.days}D</p>
              <p className={`tnum mt-1 font-mono text-lg font-bold ${tone}`}>{s.settledCount === 0 ? '—' : fmtNetTotal(s.profit, unitDollars)}</p>
              <p className="font-mono text-[10.5px] text-mid">{s.roi == null ? 'ROI —' : `ROI ${s.roi >= 0 ? '+' : ''}${Math.round(s.roi)}%`}</p>
              <p className="font-mono text-[10px] text-low">{s.settledCount === 0 ? 'No plays' : `${s.record} · ${s.settledCount} plays`}</p>
              <div className="mt-2 h-1 w-full rounded-full bg-white/10">
                <div className={`h-1 rounded-full ${bar}`} style={{ width: `${s.settledCount === 0 ? 0 : Math.max(2, Math.min(100, (Math.abs(s.profit) / scale) * 100))}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-low">{sourceLine}</p>
    </section>
  );
}

export function TagChips({ tags }: { tags: string[] | null | undefined }) {
  if (!tags?.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="rounded-chip border border-gold/35 bg-gold/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-gold">
          {t}
        </span>
      ))}
    </span>
  );
}

/** Chips plus a comma-tolerant input; Enter or Add commits. */
export function TagInput({ tags, onChange, suggestions = [] }: { tags: string[]; onChange: (tags: string[]) => void; suggestions?: string[] }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    let next = tags;
    for (const t of parseTags(draft)) next = addTag(t, next);
    onChange(next);
    setDraft('');
  };
  const offered = suggestions.filter((s) => !tags.includes(s)).slice(0, 6);
  return (
    <div>
      {tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-chip border border-gold/35 bg-gold/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-gold">
              {t}
              <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))} className="px-1 text-gold/70 hover:text-gold">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className={`${bookField} mt-0`}
          value={draft}
          disabled={tags.length >= MAX_TAGS}
          placeholder={tags.length >= MAX_TAGS ? 'Tag limit reached' : 'live, promo, primetime'}
          maxLength={120}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        />
        <button type="button" onClick={commit} disabled={!draft.trim()} className={bookButton}>Add</button>
      </div>
      {offered.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {offered.map((s) => (
            <button key={s} type="button" onClick={() => onChange(addTag(s, tags))} className="rounded-chip bg-white/5 px-2 py-1 font-mono text-[9.5px] font-bold uppercase tracking-wider text-mid hover:text-hi">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MarketSelect({ value, onChange }: { value: string | null; onChange: (m: string | null) => void }) {
  return (
    <select className={bookField} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Not set</option>
      {MARKET_OPTIONS.map((m) => (
        <option key={m.key} value={m.key}>{m.label}</option>
      ))}
    </select>
  );
}
