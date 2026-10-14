import { fetchArchiveGamePicks, fetchArchivePropPicks } from '@/lib/gary/archive';
import type { FreePick } from '@/lib/gary/free-pick';
import type { GaryPick, PropPick } from '@/lib/gary/types';

// The free pick shown as the pick card it came from (founder, Oct 14 2026:
// "use the real design from the real pick cards from the app ... 100%
// actually the same"): the day's game or prop pick on the same game, drawn
// by the native card the Picks pages use.

export type FreePickCard =
  | { kind: 'game'; pick: GaryPick; date: string }
  | { kind: 'prop'; pick: PropPick; date: string };

const sameGame = (a: unknown, b: string | null) => b !== null && a !== null && a !== undefined && String(a) === b;
const words = (s: string | null | undefined) => (s ?? '').toLowerCase();

/** The pick card behind a free pick, or null when the day's picks don't hold it. */
export async function fetchFreePickCard(free: FreePick | null): Promise<FreePickCard | null> {
  if (!free) return null;
  if (free.kind === 'prop') {
    const props = await fetchArchivePropPicks(free.date).catch(() => [] as PropPick[]);
    const last = words(free.player).split(/\s+/).at(-1) ?? '';
    const pick =
      props.find((p) => sameGame(p.game_id, free.gameId) && last && words(p.player).includes(last)) ??
      props.find((p) => last && words(p.player).includes(last) && words(p.matchup) === words(free.matchup));
    return pick ? { kind: 'prop', pick, date: free.date } : null;
  }
  const picks = await fetchArchiveGamePicks(free.date).catch(() => [] as GaryPick[]);
  const [away, home] = free.matchup.split(' @ ').map((s) => words(s.trim()));
  const pick =
    picks.find((p) => sameGame(p.game_id, free.gameId)) ??
    picks.find((p) => words(p.awayTeam).includes(away ?? '\u0000') && words(p.homeTeam).includes(home ?? '\u0000'));
  return pick ? { kind: 'game', pick, date: free.date } : null;
}
