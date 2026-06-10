import { Eyebrow } from './Eyebrow';
import { sportByCode } from '@/lib/gary/leagues';
import { effectiveOdds } from '@/lib/gary/results';
import type { GaryPick } from '@/lib/gary/types';

function confidencePct(c?: number) {
  return c ? Math.round(c * 100) : null;
}

/**
 * The gold game card — anatomy ported from iOS CompactPickRow:
 * 12px matte card, 1px gold stroke, inner matte chip (10px, gold 0.70 stroke)
 * carrying the call in gold mono; the odds stand aside in grey.
 */
export function PickCard({ pick, expanded = false }: { pick: GaryPick; expanded?: boolean }) {
  const league = (pick.league ?? '').toUpperCase();
  const accent = sportByCode(league)?.accent;
  const rawOdds = pick.odds ?? effectiveOdds(pick.pick);
  const conf = confidencePct(pick.confidence);
  const take = pick.rationale?.replace(/^Gary's Take\s*/i, '').trim();
  const pickLabel = (pick.pick ?? '').replace(/[+-]\d{3,}\s*$/, '').trim();

  return (
    <article className="rounded-card border border-gold/40 bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          {accent && <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />}
          <Eyebrow accent={accent}>{league}</Eyebrow>
        </span>
        {pick.time && <span className="font-mono text-[11px] text-low">{pick.time}</span>}
      </div>
      <h3 className="mt-2.5 font-display text-2xl leading-tight text-hi">
        {pick.awayTeam} @ {pick.homeTeam}
      </h3>
      {take && (
        <p className={`mt-2 text-[15px] leading-relaxed text-mid ${expanded ? '' : 'line-clamp-3'}`}>
          {take}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-chip border border-gold/70 bg-chip px-4 py-2.5">
        <span className="font-mono text-sm font-bold tracking-[0.04em] text-gold">{pickLabel}</span>
        {rawOdds != null && (
          <span className="tnum font-mono text-sm font-bold text-low">
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
          <span className="tnum font-mono text-[11px] text-mid">{conf}%</span>
        </div>
      )}
    </article>
  );
}
