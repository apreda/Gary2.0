import { isArchiveDate } from './archive';
import { estDateStr } from './dates';
import { fetchPickIndexForDates, gameSlug, isGamePick, publishedGamePathSet } from './gamepage';
import { normalizeLeague, sportByCode } from './leagues';
import type { GaryPick } from './types';

function pickDates(pick: GaryPick, boardDate: string): string[] {
  const dates = [boardDate];
  // Today's board also contains the current weekly NFL card. A weekly pick's
  // permanent page belongs to its ET game date, which may be earlier this week.
  if (pick.commence_time) {
    const start = new Date(pick.commence_time);
    if (Number.isFinite(start.getTime())) dates.push(estDateStr(start));
  }
  return [...new Set(dates.filter(date => isArchiveDate(date)))];
}

/** One narrow inventory read for the board, including any earlier weekly games. */
export async function fetchPublishedPickPaths(picks: GaryPick[], boardDate: string): Promise<Set<string>> {
  const dates = picks.filter(isGamePick).flatMap(pick => pickDates(pick, boardDate));
  return publishedGamePathSet(await fetchPickIndexForDates(dates, 600));
}

/** Link only to an existing analysis page, using its stored team names and date. */
export function publishedPickPath(
  pick: GaryPick | null,
  boardDate: string,
  publishedPaths: Set<string>,
): string | null {
  if (!pick || !isGamePick(pick)) return null;
  const code = normalizeLeague(pick.league, pick.sport);
  const cfg = code ? sportByCode(code) : undefined;
  if (!cfg) return null;
  for (const date of pickDates(pick, boardDate)) {
    const path = `/picks/${cfg.slug}/${date}/${gameSlug(pick.awayTeam, pick.homeTeam)}`;
    if (publishedPaths.has(path)) return path;
  }
  return null;
}
