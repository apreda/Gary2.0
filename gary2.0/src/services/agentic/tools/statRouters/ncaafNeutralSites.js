/**
 * Neutral-site games for the college stat tools (founder GO, Oct 3 2026).
 *
 * The game feed names one team "home" at a neutral site, so a kickoff classic
 * or the Cotton Bowl was counted as a home or a road game. The desk already
 * separates them (scoutReport/sports/ncaafSchedule.js); the tools Gary calls
 * must say the same thing the desk says. The schedule provider's neutral flag
 * decides; when it does not answer, nothing is marked.
 */
import { getSeasonGames, seasonGameFor } from '../../../cfbdService.js';

/** The same results, each with `neutral` set from the schedule provider. */
export async function withNeutralSites(results, teamName, season) {
  const games = await getSeasonGames(season).catch(() => null);
  return (results || []).map((r) => ({ ...r, neutral: seasonGameFor(games, teamName, r.opponent, r.date)?.neutralSite === true }));
}

/** For the shared line builders: a neutral game reads "vs Opponent (neutral site)". */
export const neutralWording = (r) => (r.neutral ? { ...r, home: true, opponent: `${r.opponent} (neutral site)` } : r);
