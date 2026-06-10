/** Terminal-surface eyebrow: short mono caps label, tracking capped at 0.04em. */
export function Eyebrow({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <span
      className="font-mono text-[11px] font-bold uppercase tracking-[0.04em]"
      style={{ color: accent ?? 'rgba(255,255,255,0.5)' }}
    >
      {children}
    </span>
  );
}
