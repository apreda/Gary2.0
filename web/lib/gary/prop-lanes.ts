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

/** Fun picks remain game-adjacent cards, outside the core prop showcase. */
export function isLongShot(p: PropPick): boolean {
  const league = normalizeLeague(p.league, p.sport);
  return league === 'MLB HR' || isNflAnytimeTd(league, p.prop);
}
