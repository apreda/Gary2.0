/** Helpers shared by the mlbFetchers groups (split from mlbFetchers.js, Oct 13 2026). */
import { findMlbTeam } from '../../../../../providers/mlbStatsApiService.js';
import { ballDontLieService } from '../../../../../providers/ballDontLieService.js';
import { foldName } from '../../../../../../utils/nameUtils.js';

/**
 * MLB Stat Fetchers
 *
 * Primary: BDL GOAT-tier API for structured data (standings, player season stats, splits, BvP matchups, odds).
 * Secondary: MLB Stats API for roster/schedule/recent games/probable pitchers/weather/lineups.
 * Tertiary: Static park factor data (no API needed).
 * Fallback: grounded search ONLY for data with no API alternative (H2H, game preview, injuries, season form narrative).
 */

// Bridge-aware search seam (Sep 1 2026): ALL grounding in this file routes
// like the WORLD lane — codex GPT Pro bridge first ($0), then the API chain.
// Claude CLI is out of the pick lane (founder).

// CURRENT-ROSTER TRUTH (founder GO, Aug 5 2026): BDL season stats accumulate
// for the club a man pitched FOR — so deadline-departed arms kept rendering as
// tonight's high-leverage pen (Aug 4: Zeferjahn and Yates listed for the
// Angels after both were dealt). Fold-join every pen name against the club's
// current MLB Stats API roster; a missing man keeps his innings (real season
// context) and gains the only fact that matters tonight. A failed roster
// fetch tags nothing — never assert absence from missing data.
export const rosterFoldCache = new Map();
export async function currentRosterFolds(teamName) {
  if (!rosterFoldCache.has(teamName)) {
    rosterFoldCache.set(teamName, (async () => {
      try {
        const { findMlbTeam, getTeamRoster } = await import('../../../../../providers/mlbStatsApiService.js');
        const t = await findMlbTeam(teamName);
        if (!t?.id) return null;
        const roster = await getTeamRoster(t.id);
        const folds = new Set((roster || []).map(r => foldName(r.name)).filter(Boolean));
        return folds.size ? folds : null;
      } catch { return null; }
    })());
  }
  return rosterFoldCache.get(teamName);
}

export const goneTag = (rosterFolds, name) =>
  rosterFolds && !rosterFolds.has(foldName(name)) ? ' — not on current roster' : '';

// ═══════════════════════════════════════════════════════════════════
// STATIC PARK FACTOR DATA (no API needed)
// ═══════════════════════════════════════════════════════════════════
export const MLB_PARK_DATA = {
  'Oracle Park': { type: 'pitcher', factor: 0.88, notes: 'Deep dimensions, heavy marine air, suppresses HR. Short right field porch (309ft).', teams: ['San Francisco Giants'] },
  'Coors Field': { type: 'hitter', factor: 1.28, notes: 'Altitude (5,280ft) inflates all offense. Largest outfield in MLB.', teams: ['Colorado Rockies'] },
  'Yankee Stadium': { type: 'hitter', factor: 1.08, notes: 'Short right field porch (314ft) favors LHB power.', teams: ['New York Yankees'] },
  'Dodger Stadium': { type: 'neutral', factor: 1.01, notes: 'Spacious but fair. Marine layer suppresses night HR.', teams: ['Los Angeles Dodgers'] },
  'Fenway Park': { type: 'hitter', factor: 1.05, notes: 'Green Monster (37ft LF wall, 310ft). Unique dimensions create doubles.', teams: ['Boston Red Sox'] },
  'Wrigley Field': { type: 'variable', factor: 1.03, notes: 'Wind-dependent. Blowing out = hitter paradise. Blowing in = pitcher park.', teams: ['Chicago Cubs'] },
  'Tropicana Field': { type: 'pitcher', factor: 0.93, notes: 'Indoor dome, artificial turf. Suppresses offense.', teams: ['Tampa Bay Rays'] },
  'Petco Park': { type: 'pitcher', factor: 0.92, notes: 'Marine air, deep CF (396ft). Suppresses HR.', teams: ['San Diego Padres'] },
  'T-Mobile Park': { type: 'pitcher', factor: 0.94, notes: 'Retractable roof, marine air when open. Pitcher-friendly.', teams: ['Seattle Mariners'] },
  'Chase Field': { type: 'hitter', factor: 1.06, notes: 'Retractable roof, dry desert air when open boosts offense.', teams: ['Arizona Diamondbacks'] },
  'Globe Life Field': { type: 'neutral', factor: 1.01, notes: 'Indoor retractable roof. Climate controlled.', teams: ['Texas Rangers'] },
  'Minute Maid Park': { type: 'hitter', factor: 1.05, notes: 'Short LF (315ft), retractable roof. Crawford Boxes favor RHB.', teams: ['Houston Astros'] },
  'Great American Ball Park': { type: 'hitter', factor: 1.10, notes: 'Small dimensions, Ohio River winds. HR-friendly.', teams: ['Cincinnati Reds'] },
  'Camden Yards': { type: 'neutral', factor: 1.02, notes: 'Balanced. LF wall moved back in 2022.', teams: ['Baltimore Orioles'] },
  'Guaranteed Rate Field': { type: 'hitter', factor: 1.04, notes: 'Upper deck hangs over field, wind effects. Modest hitter park.', teams: ['Chicago White Sox'] },
  'Progressive Field': { type: 'neutral', factor: 0.99, notes: 'Balanced park. Wind variable off Lake Erie.', teams: ['Cleveland Guardians'] },
  'Comerica Park': { type: 'pitcher', factor: 0.95, notes: 'Deep CF (420ft). Suppresses HR.', teams: ['Detroit Tigers'] },
  'Kauffman Stadium': { type: 'pitcher', factor: 0.94, notes: 'Spacious outfield, water features. Pitcher-friendly.', teams: ['Kansas City Royals'] },
  'Target Field': { type: 'neutral', factor: 1.00, notes: 'Open-air, wind variable. Limestone exterior.', teams: ['Minnesota Twins'] },
  'American Family Field': { type: 'hitter', factor: 1.04, notes: 'Retractable roof. Modest hitter lean.', teams: ['Milwaukee Brewers'] },
  'Busch Stadium': { type: 'pitcher', factor: 0.96, notes: 'Spacious, Midwest conditions. Slightly pitcher-friendly.', teams: ['St. Louis Cardinals'] },
  'Nationals Park': { type: 'neutral', factor: 1.01, notes: 'Balanced. Potomac River humidity in summer.', teams: ['Washington Nationals'] },
  'Citi Field': { type: 'pitcher', factor: 0.95, notes: 'Deep dimensions, suppresses HR. Wind off Flushing Bay.', teams: ['New York Mets'] },
  'Citizens Bank Park': { type: 'hitter', factor: 1.06, notes: 'Cozy dimensions, HR-friendly. Especially RHB power.', teams: ['Philadelphia Phillies'] },
  'PNC Park': { type: 'pitcher', factor: 0.94, notes: 'Deep CF (399ft), river wind. Pitcher-friendly.', teams: ['Pittsburgh Pirates'] },
  'loanDepot park': { type: 'hitter', factor: 1.03, notes: 'Retractable roof, humid FL air when open.', teams: ['Miami Marlins'] },
  'Rogers Centre': { type: 'neutral', factor: 1.01, notes: 'Retractable roof. Artificial turf affects ground balls.', teams: ['Toronto Blue Jays'] },
  'Truist Park': { type: 'neutral', factor: 1.02, notes: 'Balanced. Southeast humidity in summer.', teams: ['Atlanta Braves'] },
  'Angel Stadium': { type: 'neutral', factor: 1.00, notes: 'Open-air, mild SoCal weather. Balanced.', teams: ['Los Angeles Angels'] },
  // Athletics relocated to Sacramento for the 2025-2027 seasons while Las Vegas park is built.
  'Sutter Health Park': { type: 'hitter', factor: 1.07, notes: 'Sacramento, CA — Athletics temporary home 2025-2027. Hot dry summers + smaller dimensions favor offense vs the old Coliseum.', teams: ['Athletics', 'Oakland Athletics', 'Sacramento Athletics'] },
  // Kept for historical games only — A's no longer play here.
  'Oakland Coliseum': { type: 'pitcher', factor: 0.93, notes: 'HISTORICAL — Athletics relocated to Sutter Health Park for 2025-2027.', teams: [] },
};

// Helper: find park data by venue name or home team name. Exported Aug 14
// 2026 for the board's park-factor row (THE BIG NUMBERS) — one curated table,
// no second copy.
export function findParkData(venueName, homeTeamName) {
  // Try exact venue name match first
  if (venueName && MLB_PARK_DATA[venueName]) return { park: venueName, ...MLB_PARK_DATA[venueName] };
  // Try partial venue name match
  if (venueName) {
    const venueLower = venueName.toLowerCase();
    for (const [parkName, data] of Object.entries(MLB_PARK_DATA)) {
      if (parkName.toLowerCase().includes(venueLower) || venueLower.includes(parkName.toLowerCase())) {
        return { park: parkName, ...data };
      }
    }
  }
  // Try matching by home team name
  if (homeTeamName) {
    const teamLower = homeTeamName.toLowerCase();
    for (const [parkName, data] of Object.entries(MLB_PARK_DATA)) {
      if (data.teams?.some(t => teamLower.includes(t.toLowerCase()) || t.toLowerCase().includes(teamLower))) {
        return { park: parkName, ...data };
      }
    }
  }
  return null;
}

// Helper: fetch BDL season stats with automatic prior-season fallback
// When current season has no data (early season / Opening Day), falls back to prior season
// Returns { stats, season, isFallback } so callers can label the data correctly
export const MIN_GAMES_FOR_CURRENT_SEASON = 5; // Below this, prior season is more useful
export async function fetchSeasonStatsWithFallback({ teamId, playerIds, season }) {
  const currentYear = season || new Date().getFullYear();
  const priorYear = currentYear - 1;

  // Try current season first
  const params = { season: currentYear };
  if (teamId) params.teamId = teamId;
  if (playerIds?.length) params.playerIds = playerIds;
  const current = await ballDontLieService.getMlbPlayerSeasonStats(params).catch(() => []);

  // Check if current season has meaningful data
  const hasData = current.length > 0 && current.some(s => (s.batting_gp || s.pitching_gp || 0) >= MIN_GAMES_FOR_CURRENT_SEASON);
  if (hasData) return { stats: current, season: currentYear, isFallback: false };

  // Fall back to prior season
  const priorParams = { season: priorYear };
  if (teamId) priorParams.teamId = teamId;
  if (playerIds?.length) priorParams.playerIds = playerIds;
  const prior = await ballDontLieService.getMlbPlayerSeasonStats(priorParams).catch(() => []);
  if (prior.length > 0) {
    console.log(`[MLB Fetcher] Using ${priorYear} season data (${currentYear} has < ${MIN_GAMES_FOR_CURRENT_SEASON} GP)`);
    return { stats: prior, season: priorYear, isFallback: true };
  }
  return { stats: [], season: currentYear, isFallback: false };
}

// Same for team season stats
export async function fetchTeamStatsWithFallback(teamId, season) {
  const currentYear = season || new Date().getFullYear();
  const priorYear = currentYear - 1;
  const current = await ballDontLieService.getTeamSeasonStats('baseball_mlb', { teamId, season: currentYear }).catch(() => null);
  if (current?.gp >= MIN_GAMES_FOR_CURRENT_SEASON) return { stats: current, season: currentYear, isFallback: false };
  const prior = await ballDontLieService.getTeamSeasonStats('baseball_mlb', { teamId, season: priorYear }).catch(() => null);
  if (prior?.gp > 0) {
    console.log(`[MLB Fetcher] Using ${priorYear} team stats (${currentYear} has < ${MIN_GAMES_FOR_CURRENT_SEASON} GP)`);
    return { stats: prior, season: priorYear, isFallback: true };
  }
  return { stats: null, season: currentYear, isFallback: false };
}

// Same for standings
export async function fetchStandingsWithFallback(season) {
  const currentYear = season || new Date().getFullYear();
  const priorYear = currentYear - 1;
  const current = await ballDontLieService.getMlbStandings(currentYear).catch(() => []);
  if (current.length > 0 && current.some(s => s.wins > 0)) return { standings: current, season: currentYear, isFallback: false };
  const prior = await ballDontLieService.getMlbStandings(priorYear).catch(() => []);
  if (prior.length > 0) {
    console.log(`[MLB Fetcher] Using ${priorYear} standings (${currentYear} season not yet started)`);
    return { standings: prior, season: priorYear, isFallback: true };
  }
  return { standings: [], season: currentYear, isFallback: false };
}

// Same for player splits
export async function fetchSplitsWithFallback(playerId, season) {
  const currentYear = season || new Date().getFullYear();
  const priorYear = currentYear - 1;
  const current = await ballDontLieService.getMlbPlayerSplits({ playerId, season: currentYear }).catch(() => null);
  if (current && Object.keys(current).length > 0 && current.split?.length > 0) return { splits: current, season: currentYear, isFallback: false };
  const prior = await ballDontLieService.getMlbPlayerSplits({ playerId, season: priorYear }).catch(() => null);
  if (prior && Object.keys(prior).length > 0) {
    return { splits: prior, season: priorYear, isFallback: true };
  }
  return { splits: null, season: currentYear, isFallback: false };
}

// Helper: resolve BDL team ID from team object or name
export async function resolveBdlTeamId(team) {
  // If team already has a numeric id from BDL, use it
  if (team?.id && typeof team.id === 'number') return team.id;
  const name = team?.full_name || team?.name;
  if (!name) return null;
  const bdlTeam = await ballDontLieService.getTeamByNameGeneric('baseball_mlb', name).catch(() => null);
  return bdlTeam?.id || null;
}

// Helper: find MLB team by name (delegates to service)
export async function findMlbTeamByName(teamName) {
  return findMlbTeam(teamName);
}
