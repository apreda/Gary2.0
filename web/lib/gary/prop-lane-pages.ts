import { isMlbHomeRun, isNflAnytimeTdPick } from './prop-lanes';
import type { PropPick } from './types';

export type PropLaneSlug = 'home-runs' | 'touchdowns';

export interface PropLaneConfig {
  slug: PropLaneSlug;
  path: string;
  leagueCode: 'MLB' | 'NFL';
  sportSlug: 'mlb' | 'nfl';
  sportName: string;
  title: string;
  metaTitle: string;
  description: string;
  sub: string;
  laneNoun: string;
  otherLane: PropLaneSlug;
  predicate: (p: PropPick) => boolean;
  explainer: string;
}

export const PROP_LANES: Record<PropLaneSlug, PropLaneConfig> = {
  'home-runs': {
    slug: 'home-runs',
    path: '/props/home-runs',
    leagueCode: 'MLB',
    sportSlug: 'mlb',
    sportName: 'MLB',
    title: 'Home run picks.',
    metaTitle: "Today's MLB Home Run Picks | Gary AI",
    description: "Gary's MLB home run picks for today: the batter, the matchup, the listed odds and the reasoning, published before first pitch.",
    sub: 'One batter, one swing. Gary’s home run pick for the game, with the reasoning.',
    laneNoun: 'home run picks',
    otherLane: 'touchdowns',
    predicate: isMlbHomeRun,
    explainer: 'A home run pick is a bet that the named batter hits at least one home run in that game. Home run picks are long shots: they are published as picks, never counted in Gary’s game record, and are not part of Winners.',
  },
  touchdowns: {
    slug: 'touchdowns',
    path: '/props/touchdowns',
    leagueCode: 'NFL',
    sportSlug: 'nfl',
    sportName: 'NFL',
    title: 'Touchdown picks.',
    metaTitle: "Today's NFL Anytime Touchdown Picks | Gary AI",
    description: "Gary's NFL anytime touchdown scorer picks for today's games: the player, the matchup, the listed odds and the reasoning.",
    sub: 'Anytime touchdown scorers for today’s NFL games, with the reasoning.',
    laneNoun: 'anytime touchdown picks',
    otherLane: 'home-runs',
    predicate: isNflAnytimeTdPick,
    explainer: 'An anytime touchdown pick is a bet that the named player scores a touchdown at any point in the game. Gary does not publish first-touchdown picks. Touchdown picks are long shots: published as picks, kept out of the core prop record, and not part of Winners.',
  },
};

export type PropLaneState = 'picks' | 'preparing' | 'no-games' | 'unknown';

/** What the page can truthfully say. A failed slate read is unknown, never "no games". */
export function propLaneState(input: { picks: number; slateGames: number | null; firstStart: string | null }): PropLaneState {
  if (input.picks > 0) return 'picks';
  if (input.slateGames === null) return 'unknown';
  if (input.slateGames === 0) return 'no-games';
  return 'preparing';
}
