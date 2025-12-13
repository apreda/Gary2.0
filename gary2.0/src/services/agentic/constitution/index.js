/**
 * Constitution Index - Export all sport constitutions
 */

import { NBA_CONSTITUTION } from './nbaConstitution.js';
import { NFL_CONSTITUTION } from './nflConstitution.js';
import { NCAAB_CONSTITUTION } from './ncaabConstitution.js';
import { NCAAF_CONSTITUTION } from './ncaafConstitution.js';
import { NHL_CONSTITUTION } from './nhlConstitution.js';
import { NFL_PROPS_CONSTITUTION } from './nflPropsConstitution.js';
import { NBA_PROPS_CONSTITUTION } from './nbaPropsConstitution.js';
import { EPL_CONSTITUTION } from './eplConstitution.js';
import { EPL_PROPS_CONSTITUTION } from './eplPropsConstitution.js';
import { NHL_PROPS_CONSTITUTION } from './nhlPropsConstitution.js';

const CONSTITUTIONS = {
  NBA: NBA_CONSTITUTION,
  NFL: NFL_CONSTITUTION,
  NCAAB: NCAAB_CONSTITUTION,
  NCAAF: NCAAF_CONSTITUTION,
  NHL: NHL_CONSTITUTION,
  NFL_PROPS: NFL_PROPS_CONSTITUTION,
  NBA_PROPS: NBA_PROPS_CONSTITUTION,
  EPL: EPL_CONSTITUTION,
  EPL_PROPS: EPL_PROPS_CONSTITUTION,
  NHL_PROPS: NHL_PROPS_CONSTITUTION,
  // Aliases
  basketball_nba: NBA_CONSTITUTION,
  basketball_nba_props: NBA_PROPS_CONSTITUTION,
  americanfootball_nfl: NFL_CONSTITUTION,
  americanfootball_nfl_props: NFL_PROPS_CONSTITUTION,
  basketball_ncaab: NCAAB_CONSTITUTION,
  americanfootball_ncaaf: NCAAF_CONSTITUTION,
  icehockey_nhl: NHL_CONSTITUTION,
  icehockey_nhl_props: NHL_PROPS_CONSTITUTION,
  soccer_epl: EPL_CONSTITUTION,
  soccer_epl_props: EPL_PROPS_CONSTITUTION
};

export function getConstitution(sport) {
  const normalized = sport?.toUpperCase?.() || sport;
  return CONSTITUTIONS[normalized] || CONSTITUTIONS[sport] || '';
}

export { 
  NBA_CONSTITUTION, 
  NFL_CONSTITUTION, 
  NCAAB_CONSTITUTION, 
  NCAAF_CONSTITUTION, 
  NHL_CONSTITUTION, 
  NFL_PROPS_CONSTITUTION, 
  NBA_PROPS_CONSTITUTION, 
  EPL_CONSTITUTION,
  EPL_PROPS_CONSTITUTION,
  NHL_PROPS_CONSTITUTION
};

