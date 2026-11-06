import { PropCard } from '@/components/PropCard';
import type { CardFinish } from '@/components/picks/native-card';
import { PropTailFadeRow } from '@/components/book/TailFadeRow';
import { isLongShot } from '@/lib/gary/prop-lanes';
import type { PropPick } from '@/lib/gary/types';

/** The stat spine under a call — the numbers Gary leaned on, verbatim. */
export function KeyStats({ stats, max = 3 }: { stats?: string[]; max?: number }) {
  if (!Array.isArray(stats) || stats.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1.5">
      {stats.slice(0, max).map((s, i) => (
        <li key={i} className="flex gap-2 font-mono text-[14px] leading-[1.5] text-low">
          <span aria-hidden className="text-gold/50">·</span>
          <span>{s}</span>
        </li>
      ))}
    </ul>
  );
}

/** The shared native prop card, with Book actions outside the flip target. */
export function PropRow({ prop, finish='dark',date,shareHref }: { prop: PropPick; finish?:CardFinish;date?:string;shareHref?:string }) {
  const longShot=isLongShot(prop);
  return <article className="min-w-0"><PropCard prop={prop} finish={finish} date={date} shareHref={shareHref}/>
    {Array.isArray(prop.key_stats)&&prop.key_stats.length>0&&<details className="mt-4 text-sm text-mid"><summary className="cursor-pointer text-gold">Stats Behind the Pick</summary><KeyStats stats={prop.key_stats} max={prop.key_stats.length}/></details>}
    {!longShot && <PropTailFadeRow player={prop.player ?? ''} prop={prop.prop ?? ''} commence={prop.commence_time}
      gameId={prop.game_id != null || prop.bdl_game_id != null ? String(prop.game_id ?? prop.bdl_game_id) : null}
      line={prop.line != null && Number.isFinite(Number(prop.line)) ? Number(prop.line) : null} side={prop.bet} />}
  </article>;
}
