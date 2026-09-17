import { normalizeLeague } from './leagues';
import type { PropPick } from './types';

/** NFL-only anytime-scorer classification, matching the current native lane. */
export function isNflAnytimeTd(
  league?: string | null,
  market?: string | null,
  pickText?: string | null,
): boolean {
  if (normalizeLeague(league) !== 'NFL') return false;
  return [market, pickText].some(value => {
    const token = (value ?? '').toLowerCase().replace(/_/g, ' ').trim();
    return /\banytime[\s-]*(?:td|touchdown)\b/.test(token) ||
      /^(?:td|touchdown) scorer(?:\s+[+-]?\d+(?:\.\d+)?)?$/.test(token);
  });
}

// Stored props carry the market as `<type> <line>` ("home_runs 0.5"). The
// batter home-run tokens below match the results-side lane rule in
// results.ts (isHrLaneResult); pitcher home runs allowed stay a core prop.
const HOME_RUN_TOKENS = new Set(['home_runs', 'home_run', 'homeruns', 'homerun', 'batter_home_runs']);

function marketToken(market?: string | null): string {
  return (market ?? '').toLowerCase().trim().replace(/\s+[+-]?\d+(?:\.\d+)?$/, '').trim().replace(/\s+/g, '_');
}

/** MLB batter home run: the lane label the runner stamps, or the market token on an MLB row. */
export function isMlbHomeRun(p: PropPick): boolean {
  const league = normalizeLeague(p.league, p.sport);
  if (league === 'MLB HR') return true;
  if (league !== 'MLB') return false;
  const token = marketToken(p.prop);
  if (token.startsWith('pitcher')) return false;
  return HOME_RUN_TOKENS.has(token);
}

/** NFL anytime touchdown scorer on a stored pick (never NCAAF, never first-TD). */
export function isNflAnytimeTdPick(p: PropPick): boolean {
  return isNflAnytimeTd(normalizeLeague(p.league, p.sport), p.prop);
}

/** Fun picks remain game-adjacent cards, outside the core prop showcase. */
export function isLongShot(p: PropPick): boolean {
  return isMlbHomeRun(p) || isNflAnytimeTdPick(p);
}
