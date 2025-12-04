/**
 * Constitution Index - Export all sport constitutions
 */

import { NBA_CONSTITUTION } from './nbaConstitution.js';
import { NFL_CONSTITUTION } from './nflConstitution.js';
import { NCAAB_CONSTITUTION } from './ncaabConstitution.js';
import { NCAAF_CONSTITUTION } from './ncaafConstitution.js';

const CONSTITUTIONS = {
  NBA: NBA_CONSTITUTION,
  NFL: NFL_CONSTITUTION,
  NCAAB: NCAAB_CONSTITUTION,
  NCAAF: NCAAF_CONSTITUTION,
  // Aliases
  basketball_nba: NBA_CONSTITUTION,
  americanfootball_nfl: NFL_CONSTITUTION,
  basketball_ncaab: NCAAB_CONSTITUTION,
  americanfootball_ncaaf: NCAAF_CONSTITUTION
};

export function getConstitution(sport) {
  const normalized = sport?.toUpperCase?.() || sport;
  return CONSTITUTIONS[normalized] || CONSTITUTIONS[sport] || '';
}

export { NBA_CONSTITUTION, NFL_CONSTITUTION, NCAAB_CONSTITUTION, NCAAF_CONSTITUTION };

