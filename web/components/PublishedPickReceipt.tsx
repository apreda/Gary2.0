import { matchPickResult } from '@/lib/gary/gamepage';
import { effectiveOdds } from '@/lib/gary/odds';
import type { GaryPick, GameResultRow } from '@/lib/gary/types';

/** Server-rendered receipt: published ticket prices, never today's market. */
export function PublishedPickReceipt({ pick, results, ambiguous = false }: {
  pick: GaryPick; results: GameResultRow[]; ambiguous?: boolean;
}) {
  const matches = results.filter(row => matchPickResult(pick, [row]));
  const result = !ambiguous && matches.length === 1 ? matches[0] : null;
  const grade = (result?.result ?? '').trim().toLowerCase();
  const labels: Record<string, string> = { won: 'Won', lost: 'Lost', push: 'Push', void: 'Void' };
  const fields = [
    ['Published pick', pick.pick ?? 'Not retained'],
    ['Published odds', effectiveOdds(pick.pick) ?? 'Not retained in the published ticket'],
    ['Result', ambiguous || matches.length > 1 ? 'Game identity unresolved' : labels[grade] ?? 'Awaiting grade'],
    ['Final score', result?.final_score || 'Not available'],
  ];
  return (
    <section className="mt-6 rounded-panel border border-line bg-card p-5" aria-label="Published pick and result">
      <h2 className="font-display text-xl uppercase text-hi">The pick &amp; result</h2>
      <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
        {fields.map(([label, value]) => <div key={label}>
          <dt className="font-mono text-[11px] font-bold uppercase tracking-wide text-low">{label}</dt>
          <dd className="mt-1 break-words text-hi">{value}</dd>
        </div>)}
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-low">
        Odds are the American price printed with this pick, not a current offer.
        Wins, losses and pushes remain on the public record; a missing grade is not a win.
      </p>
    </section>
  );
}
