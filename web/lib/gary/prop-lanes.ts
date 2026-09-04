import { normalizeLeague } from './leagues';
import type { PropPick } from './types';

/**
 * The long shot (sport 'MLB HR'): one home run a game, priced for the fun of
 * it. It publishes as a pick card beside that game's props (founder, Sep 3
 * 2026) and never counts in the props record.
 */
export function isLongShot(p: PropPick): boolean {
  return normalizeLeague(p.league, p.sport) === 'MLB HR';
}
