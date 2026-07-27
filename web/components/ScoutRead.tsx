import { parseScoutSections, type ScoutSection } from '@/lib/gary/format';

/**
 * Gary's written read, rendered the way he writes it: labelled blocks, one
 * idea each. The feed separates them with blank lines — HTML collapses those,
 * which is how the board used to print a 900-character grey wall — so the
 * labels come back as kickers and each block gets its own paragraph.
 *
 * `tone="tight"` is the in-card size; the featured slips run "full".
 */
export function ScoutRead({
  text,
  sections: given,
  tone = 'full',
  className = '',
}: {
  text?: string | null;
  /** Pre-parsed blocks — used when the caller has already filtered them. */
  sections?: ScoutSection[];
  tone?: 'full' | 'tight';
  className?: string;
}) {
  const sections = given ?? parseScoutSections(text);
  if (sections.length === 0) return null;

  const body = tone === 'tight' ? 'text-[14px] leading-[1.62]' : 'text-[15px] leading-[1.68]';
  const gap = tone === 'tight' ? 'space-y-3' : 'space-y-4';

  return (
    <div className={`${gap} ${className}`}>
      {sections.map((s, i) => (
        <div key={i}>
          {s.label && (
            <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.09em] text-gold/70">
              {s.label}
            </p>
          )}
          <p className={`${s.label ? 'mt-1.5' : ''} ${body} text-mid`}>{s.body}</p>
        </div>
      ))}
    </div>
  );
}
