/**
 * The NBA stat tools (also serving the shared tokens other leagues route here, such as REST_SITUATION). Split by
 * area on Oct 13 2026; each file under nba/ holds one group, and this object keeps the original token order.
 */
import { efficiencyFetchers } from './nba/efficiency.js';
import { teamsAndStandingsFetchers } from './nba/teamsAndStandings.js';
import { defenseAndShotsFetchers } from './nba/defenseAndShots.js';
import { formAndTrendsFetchers } from './nba/formAndTrends.js';
import { situationFetchers } from './nba/situation.js';

const all = { ...efficiencyFetchers, ...teamsAndStandingsFetchers, ...defenseAndShotsFetchers, ...formAndTrendsFetchers, ...situationFetchers };
const ORDER = ['PACE', 'TEMPO', 'OFFENSIVE_RATING', 'DEFENSIVE_RATING', 'NET_RATING', 'ADJ_OFFENSIVE_EFF', 'ADJ_DEFENSIVE_EFF', 'ADJ_EFFICIENCY_MARGIN', 'EFG_PCT', 'TURNOVER_RATE', 'OREB_RATE', 'FT_RATE', 'THREE_PT_SHOOTING', 'SCORING', 'ASSISTS', 'REBOUNDS', 'STEALS', 'BLOCKS', 'FG_PCT', 'TOP_PLAYERS', 'INJURIES', 'STANDINGS', 'TEAM_RECORD', 'CONFERENCE_STANDING', 'HOME_AWAY_SPLITS', 'CONFERENCE_STATS', 'NON_CONF_STRENGTH', 'DREB_RATE', 'EFFICIENCY_TREND', 'THREE_PT_DEFENSE', 'OPP_FT_RATE', 'OPP_EFG_PCT', 'OPP_TOV_RATE', 'PACE_LAST_10', 'PACE_HOME_AWAY', 'PAINT_SCORING', 'MIDRANGE', 'PAINT_DEFENSE', 'TRANSITION_DEFENSE', 'LINEUP_NET_RATINGS', 'TRAVEL_SITUATION', 'MINUTES_TREND', 'BLOWOUT_TENDENCY', 'RECENT_FORM', 'QUARTER_SCORING', 'FIRST_HALF_TRENDS', 'SECOND_HALF_TRENDS', 'VARIANCE_CONSISTENCY', 'H2H_HISTORY', 'CLUTCH_STATS', 'LUCK_ADJUSTED', 'USAGE_RATES', 'VS_ELITE_TEAMS', 'SCHEDULE_STRENGTH', 'BENCH_DEPTH', 'TURNOVER_MARGIN', 'REST_SITUATION'];

export const nbaFetchers = Object.fromEntries(ORDER.map((token) => [token, all[token]]));
