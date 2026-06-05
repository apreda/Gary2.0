export function Eyebrow({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <span
      className="font-mono text-[11px] font-bold uppercase tracking-[0.08em]"
      style={{ color: accent ?? 'rgba(255,255,255,0.45)' }}
    >
      {children}
    </span>
  );
}
