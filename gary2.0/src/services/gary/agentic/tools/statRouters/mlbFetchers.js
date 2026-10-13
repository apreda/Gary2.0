/**
 * The MLB stat tools (the playoff desk and Gary's MLB research read these). Split by area on Oct 13 2026; each file under mlb/ holds one group, and this object keeps
 * the original token order.
 */
import { pitchingFetchers } from './mlb/pitching.js';
import { hittingFetchers } from './mlb/hitting.js';
import { teamsAndFormFetchers } from './mlb/teamsAndForm.js';
import { gameContextFetchers } from './mlb/gameContext.js';
export { findParkData, fetchSeasonStatsWithFallback, resolveBdlTeamId } from './mlb/shared.js';

const all = { ...pitchingFetchers, ...hittingFetchers, ...teamsAndFormFetchers, ...gameContextFetchers };
const ORDER = ["MLB_STARTING_PITCHERS", "MLB_BULLPEN", "MLB_KEY_HITTERS", "MLB_PITCH_TYPES_SP", "MLB_PITCH_TYPES_HITTERS", "MLB_LINEUP", "MLB_STANDINGS_STRUCTURED", "MLB_RECENT_RESULTS", "MLB_ODDS", "MLB_INJURIES", "MLB_RECENT_FORM_STRUCTURED", "MLB_H2H", "MLB_REST_SITUATION", "MLB_TOP_PLAYERS", "MLB_GAME_PREVIEW", "MLB_PITCHER_SCOUTING", "MLB_SEASON_FORM", "MLB_PITCHER_SEASON_STATS", "MLB_PITCHER_RECENT_FORM", "MLB_TEAM_RECORD", "MLB_RECENT_FORM", "MLB_PARK_FACTORS", "MLB_WEATHER", "MLB_BULLPEN_WORKLOAD", "MLB_STANDINGS", "MLB_PLAYER_SPLITS", "MLB_BATTER_VS_PITCHER", "MLB_CLOSER_RELIEVER_STATS", "MLB_CATCHER_DEFENSE", "MLB_RISP_SITUATIONAL", "MLB_TEAM_DEFENSE", "MLB_STATCAST"];

export const mlbFetchers = Object.fromEntries(ORDER.map((token) => [token, all[token]]));
