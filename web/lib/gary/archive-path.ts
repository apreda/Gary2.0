import { gameSlug } from '@/lib/gary/gamepage';
import { normalizeLeague, sportByCode } from '@/lib/gary/leagues';
import type { GaryPick } from '@/lib/gary/types';

export function archiveGamePath(pick: GaryPick, date: string): string | null {
  const code = normalizeLeague(pick.league, pick.sport);
  const sport = code ? sportByCode(code) : undefined;
  if (!sport || !pick.awayTeam?.trim() || !pick.homeTeam?.trim()) return null;
  return `/picks/${sport.slug}/${date}/${gameSlug(pick.awayTeam, pick.homeTeam)}`;
}
