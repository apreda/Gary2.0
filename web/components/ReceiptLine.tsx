import Link from 'next/link';
import { Slab } from '@/components/board/GameRow';
import type { Record_ } from '@/lib/gary/results';

/**
 * Yesterday's graded record as one quiet line above the board — the same
 * compact receipt the app runs under its hero. It states what happened; it
 * never sells. Nothing renders when nothing graded.
 */
export function ReceiptLine({
  label,
  record,
  href,
  cta = 'The full record',
}: {
  label: string;
  record: Record_;
  href: string;
  cta?: string;
}) {
  if (record.graded === 0) return null;
  const net = record.netUnits;
  const netText = `${net > 0 ? '+' : net < 0 ? '−' : ''}${Math.abs(net).toFixed(2)}u`;
  const netTone = net > 0 ? 'text-win' : net < 0 ? 'text-loss' : 'text-mid';

  return (
    <Link
      href={href}
      className="group flex flex-wrap items-center gap-x-3 gap-y-1 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
    >
      <Slab />
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-low">{label}</span>
      <span className="tnum font-mono text-[13px] font-bold text-hi">
        {record.wins}-{record.losses}
        {record.pushes > 0 ? `-${record.pushes}` : ''}
      </span>
      <span className={`tnum font-mono text-[13px] font-bold ${netTone}`}>{netText}</span>
      <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-gold/80 transition-colors group-hover:text-gold">
        {cta} ›
      </span>
    </Link>
  );
}
