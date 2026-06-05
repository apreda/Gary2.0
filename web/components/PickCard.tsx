import { Eyebrow } from './Eyebrow';
import { sportByCode } from '@/lib/gary/leagues';
import { effectiveOdds } from '@/lib/gary/results';
import type { GaryPick } from '@/lib/gary/types';

function confidencePct(c?: number) {
  return c ? Math.round(c * 100) : null;
}

export function PickCard({ pick, expanded = false }: { pick: GaryPick; expanded?: boolean }) {
  const league = (pick.league ?? '').toUpperCase();
  const accent = sportByCode(league)?.accent;
  const rawOdds = pick.odds ?? effectiveOdds(pick.pick);
  const conf = confidencePct(pick.confidence);
  const take = pick.rationale?.replace(/^Gary's Take\s*/i, '').trim();
  const pickLabel = (pick.pick ?? '').replace(/[+-]\d{3,}\s*$/, '').trim();

  return (
    <article className="rounded-[20px] border border-gold/35 bg-card p-5 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
      <div className="flex items-center gap-2">
        {accent && <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />}
        <Eyebrow>{league}{pick.time ? ` · ${pick.time}` : ''}</Eyebrow>
      </div>
      <h3 className="mt-2 font-display text-2xl text-white/95">
        {pick.awayTeam} @ {pick.homeTeam}
      </h3>
      {take && (
        <p className={`mt-2 text-[15px] leading-relaxed text-white/60 ${expanded ? '' : 'line-clamp-3'}`}>
          {take}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between rounded-[10px] border border-gold/60 bg-chip px-4 py-2.5">
        <span className="font-mono text-sm font-bold text-gold">{pickLabel}</span>
        {rawOdds != null && (
          <span className="font-mono text-sm text-white/55">
            {typeof rawOdds === 'number' && rawOdds > 0 ? `+${rawOdds}` : rawOdds}
          </span>
        )}
      </div>
      {conf !== null && (
        <div className="mt-3 flex items-center gap-2">
          <Eyebrow>CONF</Eyebrow>
          <div className="h-1 flex-1 rounded bg-white/10">
            <div className="h-1 rounded bg-gold" style={{ width: `${conf}%` }} />
          </div>
          <span className="font-mono text-[11px] text-white/70">{conf}%</span>
        </div>
      )}
    </article>
  );
}
