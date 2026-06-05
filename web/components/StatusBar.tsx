import { sportByCode } from '@/lib/gary/leagues';

export function StatusBar({
  record, liveCount, liveLeagues,
}: {
  record: { wins: number; losses: number; pct: number } | null;
  liveCount: number;
  liveLeagues: string[];
}) {
  const pipe = <span className="mx-2 inline-block h-2.5 w-px bg-white/12 align-middle" />;
  return (
    <div className="font-mono text-[11px] leading-none">
      <span className="font-bold text-white/40">REC </span>
      {record ? (
        <>
          <span className="text-white/78">{record.wins}-{record.losses}</span>
          <span className="text-white/30"> · </span>
          <span className="font-bold text-gold">{record.pct}%</span>
        </>
      ) : (
        <span className="text-white/40">—</span>
      )}
      {pipe}
      <span className="font-bold text-white/55">
        {liveCount === 0 ? 'AWAITING SLATE' : liveCount === 1 ? '1 PLAY LIVE' : `${liveCount} PLAYS LIVE`}
      </span>
      {liveLeagues.length > 0 && (
        <>
          {pipe}
          {liveLeagues.map(code => (
            <span key={code} className="mr-1.5 font-bold" style={{ color: sportByCode(code)?.accent ?? 'rgba(255,255,255,0.55)' }}>
              {code}
            </span>
          ))}
        </>
      )}
    </div>
  );
}
