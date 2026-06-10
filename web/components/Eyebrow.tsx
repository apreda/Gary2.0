/** Terminal-surface eyebrow: short mono caps label, tracking capped at 0.04em.
 *  Gold by default — the app's micro-labels ("NET UNITS · PICKS", "MEMBERS
 *  ONLY", "TODAY'S EDGES") wear gold. `dim` is for quiet data labels (axis
 *  captions, league-on-card) that the app keeps grey. */
export function Eyebrow({
  children,
  accent,
  dim = false,
}: {
  children: React.ReactNode;
  accent?: string;
  dim?: boolean;
}) {
  return (
    <span
      className="font-mono text-[11px] font-bold uppercase tracking-[0.04em]"
      style={{ color: accent ?? (dim ? 'rgba(255,255,255,0.5)' : '#C9A227') }}
    >
      {children}
    </span>
  );
}
