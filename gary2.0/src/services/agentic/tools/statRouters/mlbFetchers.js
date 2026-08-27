/**
 * MLB Stat Fetchers
 *
 * Primary: BDL GOAT-tier API for structured data (standings, player season stats, splits, BvP matchups, odds).
 * Secondary: MLB Stats API for roster/schedule/recent games/probable pitchers/weather/lineups.
 * Tertiary: Static park factor data (no API needed).
 * Fallback: Gemini Grounding ONLY for data with no API alternative (H2H, game preview, injuries, season form narrative).
 */

import {
  getMlbStandings as getMlbStandingsLegacy,
  getMlbRecentGames,
  findMlbTeam,
  getMlbTeams,
  getPlayerSeasonStats,
  searchPlayer,
  getConfirmedLineups,
  getProbablePitchers,
  getGameBoxScore,
  getPitcherPlatoonSplits,
  getPitcherEntryContext,
  getMlbPeopleHands,
  getPitcherGameLogRaw,
} from '../../../mlbStatsApiService.js';
import { computeRelieverUsagePattern } from '../../scoutReport/sports/mlbSeasonContext.js';
import { getPitcherArsenal, getPitcherStatcastProfile } from '../../../baseballSavantService.js';
import { ballDontLieService } from '../../../ballDontLieService.js';
import { formatSampleSuffix } from './statRouterCommon.js';
import { bullpenLedgerDate, outsToIp, relieverBoxEntries } from './bullpenLedger.js';
// Bridge-aware search seam (Jul 30): ALL grounding in this file routes like
// the WORLD lane — Claude sub first when GARY_GROUNDING_VIA_CLAUDE=1 ($0),
// then the API chain — never a hardwired paid Gemini call.
import { openaiWebSearch } from '../../../pickdesk/webSearch.js';
import { foldName } from '../../../../utils/nameUtils.js';

// CURRENT-ROSTER TRUTH (founder GO, Aug 5 2026): BDL season stats accumulate
// for the club a man pitched FOR — so deadline-departed arms kept rendering as
// tonight's high-leverage pen (Aug 4: Zeferjahn and Yates listed for the
// Angels after both were dealt). Fold-join every pen name against the club's
// current MLB Stats API roster; a missing man keeps his innings (real season
// context) and gains the only fact that matters tonight. A failed roster
// fetch tags nothing — never assert absence from missing data.
const rosterFoldCache = new Map();
async function currentRosterFolds(teamName) {
  if (!rosterFoldCache.has(teamName)) {
    rosterFoldCache.set(teamName, (async () => {
      try {
        const { findMlbTeam, getTeamRoster } = await import('../../../mlbStatsApiService.js');
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

// Fold → MLBAM person id, same roster fetch — lets the pen sections reach a
// man's official game log (usage patterns) and pitch hand (Aug 18 fills).
// Aug 19: also carries a fold-set of actual PITCHERS, so a position player's
// mop-up innings can never list him as a pen arm (the Straw case — an
// outfielder rendered as "Myles Straw (RHP)" because his 3.0 garbage-time
// innings cleared the membership floor).
const rosterIdCache = new Map();
async function currentRosterIdsByFold(teamName) {
  if (!rosterIdCache.has(teamName)) {
    rosterIdCache.set(teamName, (async () => {
      try {
        const { findMlbTeam, getTeamRoster } = await import('../../../mlbStatsApiService.js');
        const t = await findMlbTeam(teamName);
        if (!t?.id) return null;
        const roster = await getTeamRoster(t.id);
        const map = new Map();
        const pitcherFolds = new Set();
        for (const r of roster || []) {
          const f = foldName(r.name);
          if (!f || r.id == null) continue;
          map.set(f, r.id);
          if (String(r.positionType || r.position || '') === 'Pitcher' || String(r.position || '') === 'P') pitcherFolds.add(f);
        }
        if (!map.size) return null;
        map.pitcherFolds = pitcherFolds.size ? pitcherFolds : null;
        return map;
      } catch { return null; }
    })());
  }
  return rosterIdCache.get(teamName);
}
const goneTag = (rosterFolds, name) =>
  rosterFolds && !rosterFolds.has(foldName(name)) ? ' — not on current roster' : '';

// ═══════════════════════════════════════════════════════════════════
// STATIC PARK FACTOR DATA (no API needed)
// ═══════════════════════════════════════════════════════════════════
const MLB_PARK_DATA = {
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
const MIN_GAMES_FOR_CURRENT_SEASON = 5; // Below this, prior season is more useful
async function fetchSeasonStatsWithFallback({ teamId, playerIds, season }) {
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
async function fetchTeamStatsWithFallback(teamId, season) {
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
async function fetchStandingsWithFallback(season) {
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
async function fetchSplitsWithFallback(playerId, season) {
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
async function resolveBdlTeamId(team) {
  // If team already has a numeric id from BDL, use it
  if (team?.id && typeof team.id === 'number') return team.id;
  const name = team?.full_name || team?.name;
  if (!name) return null;
  const bdlTeam = await ballDontLieService.getTeamByNameGeneric('baseball_mlb', name).catch(() => null);
  return bdlTeam?.id || null;
}

// Helper: find MLB team by name (delegates to service)
async function findMlbTeamByName(teamName) {
  return findMlbTeam(teamName);
}

export const mlbFetchers = {

  // ═══════════════════════════════════════════════════════════════════
  // PITCHING
  // ═══════════════════════════════════════════════════════════════════

  MLB_STARTING_PITCHERS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const gamePk = options?.game?.gamePk || options?.game?.id;
    const currentYear = new Date().getFullYear();

    if (gamePk) {
      try {
        const pitcherData = await getProbablePitchers(gamePk);
        const homePitcher = pitcherData.home;
        const awayPitcher = pitcherData.away;

        if (homePitcher || awayPitcher) {
          const homeLines = [];
          const awayLines = [];

          // Format pitcher info and try to get BDL season stats
          for (const [pitcher, teamName, lines, team] of [
            [homePitcher, homeTeam, homeLines, home],
            [awayPitcher, awayTeam, awayLines, away],
          ]) {
            if (!pitcher) {
              lines.push(`${teamName}: Probable pitcher not yet announced`);
              continue;
            }
            const name = pitcher.fullName || `${pitcher.firstName || ''} ${pitcher.lastName || ''}`.trim() || 'TBD';
            let statsLine = '';

            // Try BDL season stats for the pitcher
            const bdlTeamId = await resolveBdlTeamId(team);
            if (bdlTeamId) {
              try {
                const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
                const pitcherLower = foldName(name);
                const match = (result.stats || []).find(s => {
                  const n = foldName(s.player?.full_name || s.player?.last_name);
                  return (n.includes(pitcherLower) || pitcherLower.includes(n)) && s.pitching_ip > 0;
                });
                if (match) {
                  const seasonLabel = result.isFallback ? ` (${result.season})` : '';
                  statsLine = ` | ${match.pitching_w ?? 0}-${match.pitching_l ?? 0}, ${match.pitching_era?.toFixed(2) ?? '—'} ERA, ${match.pitching_whip?.toFixed(2) ?? '—'} WHIP, ${match.pitching_k ?? '—'} K in ${match.pitching_ip?.toFixed(1) ?? '—'} IP${seasonLabel}`;
                }
              } catch (_) { /* BDL stats optional */ }
            }

            lines.push(`${teamName}: ${name} (ID: ${pitcher.id || 'N/A'})${statsLine}`);
          }

          return {
            homeValue: homeLines.join('\n'),
            awayValue: awayLines.join('\n'),
            comparison: `Probable starting pitchers for ${awayTeam} @ ${homeTeam}`,
            source: 'MLB Stats API + BDL',
          };
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] getProbablePitchers failed for gamePk ${gamePk}:`, e.message);
      }
    }

    // No gamePk or API returned no pitchers
    return {
      homeValue: `${homeTeam}: Probable pitchers not yet announced`,
      awayValue: `${awayTeam}: Probable pitchers not yet announced`,
      comparison: `Probable starting pitchers for ${awayTeam} @ ${homeTeam}`,
      source: 'MLB Stats API (no data yet)',
    };
  },

  MLB_BULLPEN: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    // This fetcher combines closer/reliever stats + recent workload for a full bullpen picture.
    // MLB_CLOSER_RELIEVER_STATS and MLB_BULLPEN_WORKLOAD provide the detailed data;
    // this fetcher adds a minimal Grounding call only for day-of bullpen news that APIs can't capture.
    const currentYear = new Date().getFullYear();
    const homeLines = [];
    const awayLines = [];
    let usedApi = false;

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const bdlTeamId = await resolveBdlTeamId(team);
      if (!bdlTeamId) {
        lines.push(`${teamName}: Unable to resolve team ID`);
        continue;
      }

      try {
        // Get closer/reliever season stats
        const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
        // A reliever is someone who RELIEVES (Jul 30): zero starts. The old
        // `ip < 50` heuristic misfiled low-IP starters as relief arms and
        // dropped 50+ IP setup workhorses by late season. Rank saves, then
        // holds, then innings so the real high-leverage arms surface, not
        // just save-getters.
        const relievers = (result.stats || [])
          .filter(s => s.pitching_ip > 0 && (s.pitching_gs || 0) === 0 && s.pitching_era != null)
          .sort((a, b) =>
            (b.pitching_sv || 0) - (a.pitching_sv || 0) ||
            (b.pitching_hld || 0) - (a.pitching_hld || 0) ||
            (b.pitching_ip || 0) - (a.pitching_ip || 0))
          .slice(0, 5);

        if (relievers.length > 0) {
          usedApi = true;
          const rosterFolds = await currentRosterFolds(teamName);
          lines.push(`${teamName} Key Relievers:`);
          for (const r of relievers) {
            const name = r.player?.full_name || r.player?.last_name || 'Unknown';
            lines.push(`  ${name}: ${r.pitching_sv ?? 0} SV, ${r.pitching_hld ?? 0} HLD, ${r.pitching_era?.toFixed(2) ?? '—'} ERA, ${r.pitching_ip?.toFixed(1) ?? '—'} IP${goneTag(rosterFolds, name)}`);
          }
        }

        // Recent workload (with pitch counts) lives in MLB_BULLPEN_WORKLOAD,
        // which reads MLB Stats API boxscores directly. A previous version
        // here passed MLB gamePks to BDL's getMlbGameStats — different ID
        // namespaces, so it always returned 0 records. Removed rather than
        // duplicated; the workload token is wired into the same factor.
        if (relievers.length > 0) {
          lines.push(`  Recent per-game workload: see MLB_BULLPEN_WORKLOAD (appearance detail + day/series rollups)`);
        }

        if (usedApi) continue;
      } catch (e) {
        console.warn(`[MLB Fetchers] Bullpen API data failed for ${teamName}:`, e.message);
      }

      lines.push(`${teamName}: See MLB_CLOSER_RELIEVER_STATS and MLB_BULLPEN_WORKLOAD for detailed bullpen data`);
    }

    // Minimal grounding call for day-of bullpen news only — via the seam so
    // the bridge makes it $0 (was a hardwired PAID Gemini call per desk
    // build, found Jul 30). Jul 8 2026 fix preserved: the result is
    // {success, data, raw} — read .data, not .length on the object.
    let newsNote = '';
    try {
      const news = await openaiWebSearch(
        `${awayTeam} vs ${homeTeam} MLB bullpen news closer availability update today`
      );
      const newsText = news?.data || '';
      if (newsText.length > 20) newsNote = `\n\nDay-of Bullpen News: ${newsText}`;
    } catch (_) { /* Grounding is optional */ }

    return {
      homeValue: homeLines.join('\n') + (newsNote ? newsNote : ''),
      awayValue: awayLines.join('\n'),
      comparison: `Bullpen status for ${awayTeam} @ ${homeTeam}`,
      source: usedApi ? 'BDL API + MLB Stats API' : 'Gemini Grounding (fallback)',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // HITTING / LINEUP
  // ═══════════════════════════════════════════════════════════════════

  MLB_KEY_HITTERS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;

    let seasonLabel = '';
    let fallbackNote = '';
    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      // Try BDL season stats by team first (with prior-season fallback)
      const bdlTeamId = await resolveBdlTeamId(team);
      if (bdlTeamId) {
        try {
          const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
          seasonLabel = result.isFallback ? ` (${result.season} season)` : '';
          fallbackNote = result.isFallback ? ' (prior season data — current season not yet started)' : '';
          // Filter to hitters (batting_avg > 0 or batting_ops > 0) and sort by OPS descending
          const hitters = (result.stats || [])
            // Real batting sample, not "has never pitched" (Jul 30): the old
          // `!s.pitching_era` clause erased a two-way player's BAT entirely
          // (the Ohtani class), while a pitcher's fluke 1-for-2 could top an
          // OPS sort. >= 20 AB keeps April regulars and kills both.
          .filter(s => (s.batting_ops > 0 || s.batting_avg > 0) && (s.batting_ab || 0) >= 20)
            .sort((a, b) => (b.batting_ops || 0) - (a.batting_ops || 0))
            .slice(0, 6);
          if (hitters.length > 0) {
            usedBdl = true;
            for (const h of hitters) {
              const name = h.player?.full_name || h.player?.last_name || 'Unknown';
              const avg = h.batting_avg != null ? h.batting_avg.toFixed(3) : '—';
              const hr = h.batting_hr ?? '—';
              const rbi = h.batting_rbi ?? '—';
              const ops = h.batting_ops != null ? h.batting_ops.toFixed(3) : '—';
              const war = h.batting_war != null ? h.batting_war.toFixed(1) : '—';
              const ab = h.batting_ab ?? '—';
              const hits = h.batting_h ?? '—';
              lines.push(`${name}: ${avg} AVG, ${hr} HR, ${rbi} RBI, ${ops} OPS, ${war} WAR (${ab} AB, ${hits} H)`);
            }
            continue;
          }
        } catch (e) {
          console.warn(`[MLB Fetchers] BDL key hitters failed for ${teamName}:`, e.message);
        }
      }

      // BDL had no key hitters for this team — report clearly. No career fallback:
      // a lifetime average is misleading vs. current-year context.
      lines.push(`${teamName}: No ${currentYear} hitting data yet`);
    }
    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Key hitters (season stats, sorted by OPS)${fallbackNote}`,
      source: usedBdl ? `BDL API${seasonLabel}` : 'BDL (no current-season hitting data)',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // PITCH-TYPE BREAKDOWNS (BDL GOAT) — per-pitch stats for SPs and hitters
  // Replaces blind Gemini Grounding searches like "how does X hit sliders".
  // These are deterministic, current-season Statcast aggregates from BDL.
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Probable SPs' season pitch-type stats.
   * Per pitch type: usage%, whiff%, chase%, xwOBA, BA against.
   */
  MLB_PITCH_TYPES_SP: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const gamePk = options?.game?.gamePk || options?.game?.id;
    const currentYear = new Date().getFullYear();

    if (!gamePk) {
      return {
        homeValue: `${homeTeam}: No gamePk — can't identify SP`,
        awayValue: `${awayTeam}: No gamePk — can't identify SP`,
        comparison: 'Probable SP pitch-type breakdown',
        source: 'No data',
      };
    }

    let probable;
    try {
      probable = await getProbablePitchers(gamePk);
    } catch (e) {
      console.warn(`[MLB Fetchers] PITCH_TYPES_SP: getProbablePitchers failed for ${gamePk}: ${e.message}`);
      probable = {};
    }

    // For each side: resolve probable pitcher's BDL player id via team season stats name match.
    const sides = [
      { team: home, teamName: homeTeam, pitcher: probable?.home },
      { team: away, teamName: awayTeam, pitcher: probable?.away },
    ];

    const resolved = []; // { teamName, name, bdlId, mlbamId }
    for (const side of sides) {
      if (!side.pitcher) {
        resolved.push({ teamName: side.teamName, name: null, bdlId: null, mlbamId: null });
        continue;
      }
      const name = side.pitcher.fullName || `${side.pitcher.firstName || ''} ${side.pitcher.lastName || ''}`.trim();
      const bdlTeamId = await resolveBdlTeamId(side.team);
      let bdlId = null;
      if (bdlTeamId && name) {
        try {
          const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
          const target = foldName(name);
          const match = (result.stats || []).find(s => {
            const n = foldName(s.player?.full_name || s.player?.last_name);
            return (n.includes(target) || target.includes(n)) && (s.pitching_ip || 0) > 0;
          });
          bdlId = match?.player?.id || null;
        } catch { /* fall through with bdlId=null */ }
      }
      resolved.push({ teamName: side.teamName, name, bdlId, mlbamId: side.pitcher.id || null });
    }

    // Per-pitch velocity from Baseball Savant arsenal CSV (BDL carries no pitch speed).
    // Keyed by MLBAM id with name fallback; null when Savant has no row.
    const arsenals = new Map(); // resolved index -> arsenal | null
    // (Prior-season velocity baseline REMOVED — founder ruling, Aug 10: no
    // prior-season numbers on the desk. Velocity prints current-season only;
    // a velo story, if there is one, arrives as written via the press layer.)
    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i];
      if (!r.name) { arsenals.set(i, null); continue; }
      const arsenal = await getPitcherArsenal(r.mlbamId ?? r.name, currentYear).catch(() => null)
        || await getPitcherArsenal(r.name, currentYear).catch(() => null);
      arsenals.set(i, arsenal);
    }

    const playerIds = resolved.map(r => r.bdlId).filter(id => id != null);
    let records = [];
    if (playerIds.length > 0) {
      records = await ballDontLieService.getMlbPitcherPitchTypeStats({
        playerIds, season: currentYear
      }).catch(() => []);
    }

    // Group records by player_id, format per-pitch lines (top 5 pitches by usage).
    const byPlayer = new Map();
    for (const r of records) {
      const pid = r.player_id ?? r.player?.id;
      if (pid == null) continue;
      const list = byPlayer.get(pid) || [];
      list.push(r);
      byPlayer.set(pid, list);
    }
    const fmtPct = (v) => (v != null && Number.isFinite(Number(v))) ? `${Number(v).toFixed(1)}%` : '—';
    const fmtAvg = (v) => (v != null && Number.isFinite(Number(v))) ? Number(v).toFixed(3) : '—';
    const formatPitcher = ({ teamName, name, bdlId }, arsenal) => {
      if (!name) return `${teamName}: SP not announced`;
      // mph lookup keyed by pitch CODE (FF/SI/FS...) — both sources carry codes
      // and codes are stable; display-name strings can drift ("4-Seam" vs
      // "Four-Seam"). Name map kept as fallback for codeless BDL rows.
      const mphByCode = new Map((arsenal?.pitches || []).map(p => [p.code, p.mph]));
      const mphByName = new Map((arsenal?.pitches || []).map(p => [p.name.toLowerCase(), p.mph]));
      const velocityLine = arsenal
        ? `  Velocity (Savant ${currentYear}): ${arsenal.pitches.map(p => `${p.name} ${p.mph} mph`).join(' | ')}`
        : `  Velocity: NOT AVAILABLE — do not cite pitch speeds for ${name}`;
      if (bdlId == null) return `${teamName}: ${name} — not found in BDL season stats\n${velocityLine}`;
      const list = (byPlayer.get(bdlId) || []).slice();
      if (list.length === 0) return `${teamName}: ${name} — no pitch-type data yet\n${velocityLine}`;
      list.sort((a, b) => (Number(b.pitch_usage_percent) || 0) - (Number(a.pitch_usage_percent) || 0));
      // FULL ARSENAL (founder, Aug 5 2026 PM — reversing the same-day top-3
      // cut): "we don't want to select his top three and leave off the other
      // pitches." Complete data is naked data; the ESPN page shows all five.
      // The volume problem was framing and grain, not the arsenal.
      const top = list.slice(0, 5).map(r => {
        const label = r.pitch_name || r.pitch_type || 'Unknown';
        // Show pitch_count so the reader can weight whiff%/xwOBA by sample.
        const n = r.pitch_count != null ? `${r.pitch_count} pitches` : '? pitches';
        const mph = mphByCode.get(String(r.pitch_type || '').toUpperCase()) ?? mphByName.get(String(label).toLowerCase());
        const mphStr = mph != null ? `, avg ${mph} mph` : '';
        return `  ${label} (${fmtPct(r.pitch_usage_percent)}, ${n}${mphStr}): xwOBA ${fmtAvg(r.xwoba)}, whiff ${fmtPct(r.whiff_percent)}, chase ${fmtPct(r.chase_percent)}, BA ${fmtAvg(r.ba)}`;
      });
      return `${teamName}: ${name}\n${top.join('\n')}\n${velocityLine}`;
    };

    return {
      homeValue: formatPitcher(resolved[0], arsenals.get(0)),
      awayValue: formatPitcher(resolved[1], arsenals.get(1)),
      comparison: `Probable SP pitch-type breakdown (${currentYear} season)`,
      source: 'BDL API (pitch-type season stats) + Baseball Savant (velocity)',
    };
  },

  /**
   * Top hitters' performance against each pitch type.
   * Per hitter per pitch type: BA, xwOBA, SLG.
   * Picks top 5 hitters per team by OPS, then fetches pitch-type splits.
   */
  MLB_PITCH_TYPES_HITTERS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();

    // Per side: resolve top hitters by OPS via BDL season stats.
    const collectTopHitters = async (team, teamName) => {
      const bdlTeamId = await resolveBdlTeamId(team);
      if (!bdlTeamId) return { teamName, hitters: [] };
      try {
        const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
        const hitters = (result.stats || [])
          // Real batting sample, not "has never pitched" (Jul 30): the old
          // `!s.pitching_era` clause erased a two-way player's BAT entirely
          // (the Ohtani class), while a pitcher's fluke 1-for-2 could top an
          // OPS sort. >= 20 AB keeps April regulars and kills both.
          .filter(s => (s.batting_ops > 0 || s.batting_avg > 0) && (s.batting_ab || 0) >= 20)
          .sort((a, b) => (b.batting_ops || 0) - (a.batting_ops || 0))
          .slice(0, 5)
          .map(s => ({
            id: s.player?.id,
            name: s.player?.full_name || s.player?.last_name || 'Unknown',
          }))
          .filter(h => h.id != null);
        return { teamName, hitters };
      } catch (e) {
        console.warn(`[MLB Fetchers] PITCH_TYPES_HITTERS: season stats failed for ${teamName}: ${e.message}`);
        return { teamName, hitters: [] };
      }
    };

    const [homeSide, awaySide] = await Promise.all([
      collectTopHitters(home, homeTeam),
      collectTopHitters(away, awayTeam),
    ]);

    const playerIds = [...homeSide.hitters, ...awaySide.hitters].map(h => h.id);
    let records = [];
    if (playerIds.length > 0) {
      records = await ballDontLieService.getMlbHitterPitchTypeStats({
        playerIds, season: currentYear
      }).catch(() => []);
    }

    const byPlayer = new Map();
    for (const r of records) {
      const pid = r.player_id ?? r.player?.id;
      if (pid == null) continue;
      const list = byPlayer.get(pid) || [];
      list.push(r);
      byPlayer.set(pid, list);
    }
    const fmtAvg = (v) => (v != null && Number.isFinite(Number(v))) ? Number(v).toFixed(3) : '—';
    const formatHitter = (h) => {
      const list = (byPlayer.get(h.id) || []).slice();
      if (list.length === 0) return `${h.name}: no pitch-type data yet`;
      if (list.filter(r => (Number(r.pa_count) || 0) >= 10).length === 0) return `${h.name}: no pitch-type sample of 10+ PA yet`;
      // Sort by SAMPLE SIZE (PA against the pitch type) descending — NOT by
      // xwOBA. Sorting by xwOBA surfaced tiny-sample outliers first (e.g. a
      // 1.2 xwOBA on 6 PA against splitters), which reads as a fake "this guy
      // crushes splitters" edge. The pitches a hitter faces MOST are both the
      // most reliable signal and the most relevant (they're what the opposing
      // SP is likely to throw). Each line carries its PA count so the reader
      // can weight it; the Flash prompt instructs that splits under ~30 pitches
      // / ~10 PA are noise, not signal.
      list.sort((a, b) => (Number(b.pa_count) || 0) - (Number(a.pa_count) || 0));
      // LAB DIET (Aug 5): rows under 10 PA are noise dressed as signal — the
      // prompt used to caveat them; now they simply don't print. Top 3.
      const gated = list.filter(r => (Number(r.pa_count) || 0) >= 10);
      const top = gated.slice(0, 3).map(r => {
        const label = r.pitch_name || r.pitch_type || 'Unknown';
        const pa = r.pa_count != null ? `${r.pa_count} PA` : '? PA';
        return `${label} (${pa}): ${fmtAvg(r.ba)} BA, ${fmtAvg(r.xwoba)} xwOBA, ${fmtAvg(r.slg)} SLG`;
      });
      return `${h.name}: ${top.join(' | ')}`;
    };

    const formatSide = ({ teamName, hitters }) => {
      if (hitters.length === 0) return `${teamName}: No hitters found`;
      const lines = hitters.map(formatHitter);
      return `${teamName}:\n  ${lines.join('\n  ')}`;
    };

    return {
      homeValue: formatSide(homeSide),
      awayValue: formatSide(awaySide),
      // Label matches the code (Jul 30): rows sort by SAMPLE (PA faced), not
      // xwOBA — the old label told the reader the opposite of the truth.
      comparison: `Top hitters' pitch-type performance (${currentYear} season — most-faced pitch types first, PA counts shown)`,
      source: 'BDL API (pitch-type season stats)',
    };
  },

  MLB_LINEUP: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const gameId = options?.game?.id || options?.game?.gameId;
    const gamePk = options?.game?.gamePk;
    const homeAbbr = home.abbreviation || '';
    const awayAbbr = away.abbreviation || '';

    const formatBdlLineup = (teamData, teamName) => {
      if (!teamData || teamData.batters.length === 0) return `${teamName}: Lineup not yet posted`;
      let out = `${teamName}:\n`;
      out += teamData.batters.map(b =>
        `  ${b.battingOrder}. ${b.name} (${b.position}) [${b.batsThrows}]`
      ).join('\n');
      if (teamData.pitcher) {
        out += `\n  SP: ${teamData.pitcher.name} (${teamData.pitcher.batsThrows})`;
      }
      return out;
    };

    // PRIMARY: MLB Stats API boxscore (free, public, returns posted lineups + handedness)
    // The prior implementation called ballDontLieService.getMlbLineups, but that method
    // does not exist on the service — every call threw and silently fell through to the
    // "not available" branch, leaving Gary with zero lineup data for MLB games.
    if (gamePk) {
      try {
        const { getMlbGameLineups } = await import('../../../mlbStatsApiService.js');
        const mlbLineups = await getMlbGameLineups(gamePk);
        if (mlbLineups) {
          const homeData = mlbLineups[homeAbbr] || Object.values(mlbLineups).find(t => t.teamName?.toLowerCase().includes((home.name || '').toLowerCase()));
          const awayData = mlbLineups[awayAbbr] || Object.values(mlbLineups).find(t => t.teamName?.toLowerCase().includes((away.name || '').toLowerCase()));
          if ((homeData?.batters?.length > 0) || (awayData?.batters?.length > 0)) {
            return {
              homeValue: formatBdlLineup(homeData, homeTeam),
              awayValue: formatBdlLineup(awayData, awayTeam),
              comparison: `Pre-game lineups with batting order + handedness for ${awayTeam} @ ${homeTeam}`,
              source: 'MLB Stats API (boxscore lineups)',
            };
          }
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] MLB Stats API lineup fetch failed for gamePk ${gamePk}: ${e.message}`);
      }
    }

    // Lineups not yet posted (game too far out, or boxscore not populated yet).
    console.warn(`[MLB Fetchers] ⚠️ No lineup data available for ${awayTeam} @ ${homeTeam} (gamePk: ${gamePk}, gameId: ${gameId})`);
    return {
      homeValue: `${homeTeam}: Lineup not yet available (check closer to game time)`,
      awayValue: `${awayTeam}: Lineup not yet available (check closer to game time)`,
      comparison: `Lineups not yet posted for ${awayTeam} @ ${homeTeam}`,
      source: 'MLB Stats API (no posted lineup)',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // STANDINGS & CONTEXT
  // ═══════════════════════════════════════════════════════════════════

  MLB_STANDINGS_STRUCTURED: async (sport, home, away, season, options) => {
    const currentYear = new Date().getFullYear();
    // Try BDL GOAT-tier standings first (with prior-season fallback)
    try {
      const result = await fetchStandingsWithFallback(currentYear);
      const standings = result.standings;
      const standingsSeasonLabel = result.isFallback ? ` (${result.season} season)` : '';
      const standingsFallbackNote = result.isFallback ? ' (prior season data — current season not yet started)' : '';
      if (Array.isArray(standings) && standings.length > 0) {
        // Group by division
        const divisions = {};
        for (const t of standings) {
          const div = t.division_name || 'Unknown Division';
          if (!divisions[div]) divisions[div] = [];
          const teamName = t.team?.full_name || t.team?.name || 'Unknown';
          divisions[div].push(
            `${teamName}: ${t.wins}-${t.losses} | Home: ${t.home || '—'} | Away: ${t.road || '—'} | L10: ${t.last_ten_games || '—'} | Streak: ${t.streak || '—'} | GB: ${t.division_games_behind ?? t.games_behind ?? '—'} | Win%: ${t.win_percent != null ? (t.win_percent * 100).toFixed(1) + '%' : '—'}`
          );
        }
        const lines = [];
        for (const [divName, teams] of Object.entries(divisions)) {
          lines.push(`\n--- ${divName} ---`);
          lines.push(...teams);
        }
        return {
          homeValue: lines.join('\n'),
          awayValue: '',
          comparison: `MLB Division Standings${standingsFallbackNote}`,
          source: `BDL API${standingsSeasonLabel}`,
        };
      }
    } catch (e) {
      console.warn('[MLB Fetchers] BDL standings failed, trying legacy:', e.message);
    }

    // Fallback: legacy MLB Stats API
    try {
      const standings = await getMlbStandingsLegacy();
      if (standings?.records) {
        const lines = [];
        for (const record of standings.records) {
          const divName = record.division?.name || 'Division';
          lines.push(`\n--- ${divName} ---`);
          for (const tr of (record.teamRecords || [])) {
            const gb = tr.gamesBack || '-';
            lines.push(`${tr.team?.name}: ${tr.wins}-${tr.losses} (GB: ${gb})`);
          }
        }
        return {
          homeValue: lines.join('\n'),
          awayValue: '',
          comparison: 'MLB Division Standings',
          source: 'MLB Stats API (fallback)',
        };
      }
    } catch (e2) {
      // Both failed
    }
    return { homeValue: 'N/A', awayValue: 'N/A', comparison: 'Standings unavailable', source: 'N/A' };
  },

  MLB_RECENT_RESULTS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const homeLines = [];
    const awayLines = [];

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const mlbTeam = await findMlbTeamByName(team.full_name || team.name);
      if (!mlbTeam) {
        lines.push(`${teamName}: Team not found`);
        continue;
      }
      const games = await getMlbRecentGames(mlbTeam.id, 10).catch(() => []);
      if (games.length === 0) {
        lines.push(`${teamName}: No recent games found`);
        continue;
      }
      for (const g of games) {
        const h = g.teams?.home;
        const a = g.teams?.away;
        const date = (g.gameDate || '').split('T')[0];
        lines.push(`${date}: ${a?.team?.name} ${a?.score} @ ${h?.team?.name} ${h?.score}`);
      }
    }
    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Recent results for ${awayTeam} @ ${homeTeam}`,
      source: 'MLB Stats API',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // ODDS (Grounding-based)
  // ═══════════════════════════════════════════════════════════════════

  MLB_ODDS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    // This is a BDL endpoint, so it needs the BDL game id — NOT the MLB Stats
    // API gamePk. The previous precedence (bdlGameId || gamePk || id) meant that
    // once orchestratorMain set game.gamePk (the MLB Stats API id), this used it
    // for the BDL odds query, which returns 0 records. The fetcher then fell to a
    // date-based query that dumped ALL of the day's odds across every game,
    // unfiltered — feeding Gary a mix of multiple games' lines. Prefer the BDL
    // id (game.id / bdl_game_id); only fall to gamePk as a last resort.
    const gameId = options?.game?.bdl_game_id || options?.game?.bdlGameId || options?.game?.id || options?.game?.gamePk;

    // BDL MLB odds rows are FLAT:
    //   vendor, moneyline_home_odds, moneyline_away_odds,
    //   spread_home_value, spread_home_odds, spread_away_value, spread_away_odds,
    //   total_value, total_over_odds, total_under_odds
    // The prior implementation read bookOdds.moneyline.home etc. — those keys
    // don't exist on the BDL payload, so every value rendered as "—" even though
    // the data was right there. Matches the shape used in ballDontLieOddsService.js.
    const formatOddsRow = (row, includeRL = true) => {
      const book = row.vendor || row.sportsbook || row.book || 'Unknown';
      const homeML = row.moneyline_home_odds ?? '—';
      const awayML = row.moneyline_away_odds ?? '—';
      const total = row.total_value ?? '—';
      const overPrice = row.total_over_odds ?? '—';
      const underPrice = row.total_under_odds ?? '—';
      if (includeRL) {
        const homeRL = row.spread_home_value != null
          ? `${row.spread_home_value} (${row.spread_home_odds ?? '—'})`
          : '—';
        const awayRL = row.spread_away_value != null
          ? `${row.spread_away_value} (${row.spread_away_odds ?? '—'})`
          : '—';
        return `${book}: ML ${awayTeam} ${awayML} / ${homeTeam} ${homeML} | RL ${awayRL} / ${homeRL} | O/U ${total} (O ${overPrice} / U ${underPrice})`;
      }
      return `${book}: ML ${awayTeam} ${awayML} / ${homeTeam} ${homeML} | O/U ${total}`;
    };

    if (gameId) {
      try {
        const odds = await ballDontLieService.getMlbGameOdds({ gameIds: [gameId] });
        if (odds && odds.length > 0) {
          const lines = odds.map(row => formatOddsRow(row, true));
          return {
            homeValue: lines.join('\n'),
            awayValue: '',
            comparison: `Current MLB odds for ${awayTeam} @ ${homeTeam}`,
            source: 'BDL API (structured odds)',
          };
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] BDL odds failed for game ${gameId}:`, e.message);
      }
    }

    // Try by today's date if no gameId. ET day + the next UTC day (Jul 30):
    // BDL keys late ET games under the NEXT UTC date, and the old UTC-now
    // derivation pointed at the wrong day entirely from 8 PM ET on.
    try {
      const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const nextUtc = (() => { const d = new Date(`${todayET}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
      const odds = await ballDontLieService.getMlbGameOdds({ dates: [todayET, nextUtc] });
      if (odds && odds.length > 0) {
        // Find odds matching this game
        const homeLower = homeTeam.toLowerCase();
        const awayLower = awayTeam.toLowerCase();
        const gameOdds = odds.filter(o => {
          const oHome = (o.game?.home_team?.full_name || o.game?.home_team || '').toString().toLowerCase();
          const oAway = (o.game?.away_team?.full_name || o.game?.away_team || '').toString().toLowerCase();
          return (oHome.includes(homeLower) || homeLower.includes(oHome)) &&
                 (oAway.includes(awayLower) || awayLower.includes(oAway));
        });

        if (gameOdds.length > 0) {
          const lines = gameOdds.map(row => formatOddsRow(row, false));

          return {
            homeValue: lines.join('\n'),
            awayValue: '',
            comparison: `Current MLB odds for ${awayTeam} @ ${homeTeam}`,
            source: 'BDL API (structured odds)',
          };
        }
      }
    } catch (e) {
      console.warn(`[MLB Fetchers] BDL odds by date failed:`, e.message);
    }

    return {
      homeValue: 'Odds not yet available (lines may not be posted yet)',
      awayValue: '',
      comparison: `Current MLB odds for ${awayTeam} @ ${homeTeam}`,
      source: 'BDL API (no data)',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // GENERIC / SHARED TOKENS
  // ═══════════════════════════════════════════════════════════════════

  MLB_INJURIES: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    // BDL provides structured injuries in the scout report — no grounding fallback.
    // If BDL injuries are missing, surface the gap instead of masking with grounding.
    const hasBdlInjuries = options?.game?.injuries && options.game.injuries.length > 50;
    if (hasBdlInjuries) {
      return {
        homeValue: 'See scout report INJURIES section (BDL structured data with FRESH/ESTABLISHED routing labels)',
        awayValue: '',
        comparison: `Structured injury data already in scout report for ${awayTeam} @ ${homeTeam}`,
        source: 'BDL (via scout report)',
      };
    }
    // No grounding fallback — if BDL doesn't have injuries, report it clearly
    console.warn(`[MLB Fetchers] ⚠️ No BDL injury data for ${awayTeam} @ ${homeTeam} — check BDL injury API`);
    return {
      homeValue: 'No structured injury data available — BDL injury API returned empty',
      awayValue: '',
      comparison: `Injury data unavailable for ${awayTeam} @ ${homeTeam}`,
      source: 'BDL API (no data)',
    };
  },

  MLB_RECENT_FORM_STRUCTURED: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const homeLines = [];
    const awayLines = [];

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const mlbTeam = await findMlbTeamByName(team.full_name || team.name);
      if (!mlbTeam) {
        lines.push(`${teamName}: Team not found`);
        continue;
      }
      const games = await getMlbRecentGames(mlbTeam.id, 10).catch(() => []);
      if (games.length === 0) {
        lines.push(`${teamName}: No recent games found`);
        continue;
      }
      let wins = 0, losses = 0;
      for (const g of games) {
        const h = g.teams?.home;
        const a = g.teams?.away;
        const date = (g.gameDate || '').split('T')[0];
        const isHome = (h?.team?.id === mlbTeam.id);
        const teamScore = isHome ? h?.score : a?.score;
        const oppScore = isHome ? a?.score : h?.score;
        const won = teamScore > oppScore;
        if (won) wins++; else losses++;
        const oppName = isHome ? a?.team?.name : h?.team?.name;
        lines.push(`${date}: ${won ? 'W' : 'L'} ${teamScore}-${oppScore} vs ${oppName}`);
      }
      lines.unshift(`${teamName}: ${wins}-${losses} last ${games.length} games`);
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Recent form (last 10 games) for ${awayTeam} @ ${homeTeam}`,
      source: 'MLB Stats API',
    };
  },

  MLB_H2H: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    // Use BDL game history to compute H2H — no grounding needed
    try {
      const homeId = home.id || home.teamId;
      const awayId = away.id || away.teamId;
      if (homeId && awayId) {
        const games = await ballDontLieService.getGames('baseball_mlb', { team_ids: [homeId], seasons: [season || new Date().getFullYear()], per_page: 100 });
        const h2h = (games || []).filter(g => {
          const hId = g.home_team?.id || g.home_team_data?.id;
          const aId = g.visitor_team?.id || g.away_team?.id;
          // BDL MLB games report status 'STATUS_FINAL' (not 'Final' — the old
          // strict check matched ZERO games, so this tool returned "no H2H
          // data" for every MLB matchup since launch). Also restrict to
          // regular season: the 2026 season set includes spring_training
          // games that would contaminate the season-series numbers.
          const isFinal = /final/i.test(g.status || '');
          const isRegular = !g.season_type || g.season_type === 'regular';
          return (hId === awayId || aId === awayId) && isFinal && isRegular;
        });
        if (h2h.length > 0) {
          // Chronological order so the per-game readout reads naturally
          h2h.sort((a, b) => new Date(a.date || a.game_date || 0) - new Date(b.date || b.game_date || 0));
          let homeWins = 0, awayWins = 0, homeRuns = 0, awayRuns = 0;
          const results = [];
          for (const g of h2h) {
            // BDL MLB game objects carry runs in home/away_team_data.runs
            // (home_team_data is BOX data — hits/runs/errors — not a team
            // object, so it has no .id; the team id lives on home_team).
            const hScore = Number(g.home_team_data?.runs ?? g.home_team_score ?? g.home_score);
            const vScore = Number(g.away_team_data?.runs ?? g.visitor_team_score ?? g.away_score);
            // A final whose runs haven't landed yet must be SKIPPED — the old
            // `?? 0` fallbacks made it read 0-0, and the else-branch handed a
            // phantom win to the away side (Jul 30; the streak-splice class).
            if (!Number.isFinite(hScore) || !Number.isFinite(vScore) || hScore === vScore) continue;
            const isHomeTeamHome = g.home_team?.id === homeId;
            const ourRuns = isHomeTeamHome ? hScore : vScore;     // runs by tonight's home team
            const theirRuns = isHomeTeamHome ? vScore : hScore;   // runs by tonight's away team
            homeRuns += ourRuns;
            awayRuns += theirRuns;
            if (ourRuns > theirRuns) homeWins++;
            else awayWins++;
            const date = (g.date || g.game_date || '').split('T')[0];
            results.push(`${date}: ${homeTeam.split(' ').pop()} ${ourRuns}-${theirRuns}`);
          }
          // Count only the games actually tallied (skips above) — n drives
          // both the label and the runs/gm averages. Zero tallied falls
          // through to the honest no-data return below.
          const n = homeWins + awayWins;
          if (n > 0) {
            return {
              homeValue: `${homeTeam}: ${homeWins}W vs ${awayTeam} this season, ${homeRuns} runs scored (${(homeRuns / n).toFixed(1)}/gm)`,
              awayValue: `${awayTeam}: ${awayWins}W vs ${homeTeam} this season, ${awayRuns} runs scored (${(awayRuns / n).toFixed(1)}/gm)`,
              comparison: `Season series: ${n} games played — ${results.join(', ')}`,
              source: 'BDL API (game history)',
            };
          }
        }
      }
    } catch (e) {
      console.warn(`[MLB Fetchers] BDL H2H failed: ${e.message}`);
    }
    return {
      homeValue: 'No H2H data available (teams may not have played yet this season). Season-series run totals: NOT AVAILABLE — do not cite per-game series scoring averages.',
      awayValue: '',
      comparison: `MLB H2H: ${awayTeam} vs ${homeTeam}`,
      source: 'BDL API (no data)',
    };
  },

  MLB_REST_SITUATION: async (sport, home, away, season, options) => {
    // ET date, never UTC (Jul 30): toISOString() rolls to tomorrow at 8 PM ET,
    // which stamped every evening window's rest math one day high.
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;

    async function getLastGameDate(teamName) {
      const mlbTeam = await findMlbTeamByName(teamName);
      if (!mlbTeam) return null;
      const games = await getMlbRecentGames(mlbTeam.id, 3).catch(() => []);
      if (games.length === 0) return null;
      return games[games.length - 1].gameDate?.split('T')[0];
    }

    const homeLast = await getLastGameDate(homeTeam);
    const awayLast = await getLastGameDate(awayTeam);

    function daysRest(lastDate) {
      if (!lastDate) return 'No recent games found';
      const diff = Math.floor((new Date(today) - new Date(lastDate)) / (1000 * 60 * 60 * 24));
      return `${diff} day(s) rest (last played ${lastDate})`;
    }

    return {
      homeValue: daysRest(homeLast),
      awayValue: daysRest(awayLast),
      comparison: `Days rest for ${awayTeam} @ ${homeTeam}`,
      source: 'MLB Stats API (schedule)',
    };
  },

  MLB_TOP_PLAYERS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;
    let topSeasonLabel = '';
    let topFallbackNote = '';

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      // Try BDL season stats — get top hitters + top pitchers by WAR (with prior-season fallback)
      const bdlTeamId = await resolveBdlTeamId(team);
      if (bdlTeamId) {
        try {
          const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
          if (result.isFallback) {
            topSeasonLabel = ` (${result.season} season)`;
            topFallbackNote = ' (prior season data — current season not yet started)';
          }
          const stats = result.stats;
          if (stats && stats.length > 0) {
            // Top 3 hitters by OPS — real batting sample gate (Jul 30), not
            // "has never pitched": the old clause erased two-way bats and a
            // pitcher's fluke 1-for-2 could top an OPS sort.
            const hitters = stats
              .filter(s => (s.batting_ops > 0 || s.batting_avg > 0) && (s.batting_ab || 0) >= 20)
              .sort((a, b) => (b.batting_ops || 0) - (a.batting_ops || 0))
              .slice(0, 3);
            // Top 2 pitchers by WAR (or ERA lowest)
            const pitchers = stats
              .filter(s => s.pitching_era != null && s.pitching_ip > 0)
              .sort((a, b) => (b.pitching_war || 0) - (a.pitching_war || 0))
              .slice(0, 2);

            if (hitters.length > 0 || pitchers.length > 0) {
              usedBdl = true;
              for (const h of hitters) {
                const name = h.player?.full_name || h.player?.last_name || 'Unknown';
                lines.push(`${name}: ${h.batting_avg?.toFixed(3) || '—'} AVG, ${h.batting_hr ?? '—'} HR, ${h.batting_rbi ?? '—'} RBI, ${h.batting_ops?.toFixed(3) || '—'} OPS, ${h.batting_war?.toFixed(1) || '—'} WAR`);
              }
              for (const p of pitchers) {
                const name = p.player?.full_name || p.player?.last_name || 'Unknown';
                lines.push(`${name}: ${p.pitching_era?.toFixed(2) || '—'} ERA, ${p.pitching_whip?.toFixed(2) || '—'} WHIP, ${p.pitching_k ?? '—'} K, ${p.pitching_ip?.toFixed(1) || '—'} IP, ${p.pitching_war?.toFixed(1) || '—'} WAR`);
              }
              continue;
            }
          }
        } catch (e) {
          console.warn(`[MLB Fetchers] BDL top players failed for ${teamName}:`, e.message);
        }
      }

      // No BDL data — return clean no-data instead of expensive Grounding
      lines.push(`${teamName}: No 2026 season data available yet (season may not have started)`);
    }
    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Top players (hitters by OPS + pitchers by WAR)${topFallbackNote}`,
      source: usedBdl ? `BDL API${topSeasonLabel}` : 'BDL (no data)',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // MLB PREVIEW & NARRATIVE (Grounding for context APIs can't provide)
  // ═══════════════════════════════════════════════════════════════════

  // Jul 8 2026 rewrite (founder's fan-knowledge doctrine): grounding fills the
  // gap no API covers — storylines, clubhouse news, what the media is saying.
  // The old query actively solicited other people's picks and projections
  // (contradicting the ignore-picks rule the research assistant runs under)
  // and returned the raw result object instead of its text.
  MLB_GAME_PREVIEW: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    // Via the seam (Jul 30): bridge-first ($0), API chain fallback — never a
    // hardwired paid call, even on a currently-dormant token.
    const result = await openaiWebSearch(
      `${awayTeam} vs ${homeTeam} MLB today — the storylines and team news a fan following both teams would know: ` +
      `recent momentum and series context, player storylines and milestone watches, clubhouse and manager news, ` +
      `and what national and local media are saying about each team right now. ` +
      `Factual reporting and narrative context only — do NOT include expert picks, betting predictions, or projections.`
    );
    return {
      homeValue: result?.data || 'N/A',
      awayValue: result?.data || 'N/A',
      comparison: `Storylines and team news for ${awayTeam} @ ${homeTeam}`,
      source: 'Gemini Grounding',
    };
  },

  MLB_PITCHER_SCOUTING: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const gamePk = options?.game?.gamePk || options?.game?.id;
    const homeLines = [];
    const awayLines = [];
    let usedApi = false;

    // Try to identify probable pitchers
    let probablePitchers = null;
    if (gamePk) {
      try {
        probablePitchers = await getProbablePitchers(gamePk);
      } catch (_) { /* Will fall back */ }
    }

    for (const [team, teamName, lines, side] of [
      [home, homeTeam, homeLines, 'home'],
      [away, awayTeam, awayLines, 'away'],
    ]) {
      const pitcher = probablePitchers?.[side];
      const pitcherName = pitcher?.fullName || `${pitcher?.firstName || ''} ${pitcher?.lastName || ''}`.trim();

      if (!pitcherName) {
        lines.push(`${teamName}: Probable pitcher not identified — scouting report unavailable`);
        continue;
      }

      const bdlTeamId = await resolveBdlTeamId(team);
      if (!bdlTeamId) {
        lines.push(`${pitcherName}: Unable to resolve team for stats lookup`);
        continue;
      }

      try {
        // Get season stats
        const seasonResult = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
        const pitcherLower = foldName(pitcherName);
        const match = (seasonResult.stats || []).find(s => {
          const n = foldName(s.player?.full_name || s.player?.last_name);
          return (n.includes(pitcherLower) || pitcherLower.includes(n)) && s.pitching_ip > 0;
        });

        if (match) {
          usedApi = true;
          const label = seasonResult.isFallback ? ` (${seasonResult.season})` : '';
          const name = match.player?.full_name || pitcherName;

          // Season line
          lines.push(`--- ${name} Scouting Profile${label} ---`);
          lines.push(`Record: ${match.pitching_w ?? 0}-${match.pitching_l ?? 0} | ERA: ${match.pitching_era?.toFixed(2) ?? '—'} | WHIP: ${match.pitching_whip?.toFixed(2) ?? '—'}`);
          lines.push(`K: ${match.pitching_k ?? '—'} (${match.pitching_k_per_9?.toFixed(1) ?? '—'} K/9) | BB: ${match.pitching_bb ?? '—'} | HR: ${match.pitching_hr ?? '—'} | IP: ${match.pitching_ip?.toFixed(1) ?? '—'}`);
          if (match.pitching_h != null) {
            lines.push(`H: ${match.pitching_h} | HBP: ${match.pitching_hbp ?? '—'} | WAR: ${match.pitching_war?.toFixed(1) ?? '—'}`);
          }

          // Try splits (venue/day-night from BDL — BDL has no L/R breakdown for pitchers)
          const playerId = match.player?.id;
          if (playerId) {
            try {
              const splitsResult = await fetchSplitsWithFallback(playerId, seasonResult.season);
              const splits = splitsResult.splits;
              if (splits?.byBreakdown?.length > 0) {
                lines.push(`Splits:`);
                for (const b of splits.byBreakdown) {
                  const splitLabel = b.split_name || b.split_abbreviation || 'Unknown';
                  const era = b.era != null ? Number(b.era).toFixed(2) : (b.avg != null ? `${Number(b.avg).toFixed(3)} opp AVG` : '—');
                  const ops = b.ops != null ? Number(b.ops).toFixed(3) : '—';
                  const sample = formatSampleSuffix(b, [
                    { field: 'innings_pitched', label: 'IP', decimals: 1 },
                    { field: 'pitching_ip', label: 'IP', decimals: 1 },
                    { field: 'ip', label: 'IP', decimals: 1 },
                    { field: 'games', label: 'G' },
                    { field: 'batters_faced', label: 'BF' },
                  ]);
                  lines.push(`  ${splitLabel}: ${era} ERA, ${ops} opp OPS${sample}`);
                }
              }
            } catch (_) { /* Splits optional */ }

            // Platoon splits (vs LHB / vs RHB) — MLB Stats API, keyed by the
            // probable pitcher's MLBAM id. This is the ONLY structured source
            // for pitcher platoon claims; BDL has no L/R breakdown for pitchers.
            try {
              const mlbamId = pitcher?.id;
              const platoon = mlbamId ? await getPitcherPlatoonSplits(mlbamId, currentYear) : null;
              if (platoon?.vsLeft || platoon?.vsRight) {
                lines.push(`Platoon (opponents batting, ${currentYear}):`);
                for (const [sideLabel, p] of [['vs LHB', platoon.vsLeft], ['vs RHB', platoon.vsRight]]) {
                  if (!p) { lines.push(`  ${sideLabel}: no data`); continue; }
                  lines.push(`  ${sideLabel}: ${p.avg ?? '—'} AVG, ${p.ops ?? '—'} OPS, ${p.hr ?? '—'} HR, ${p.bb ?? '—'} BB (${p.ab ?? '—'} AB)`);
                }
              } else {
                lines.push(`Platoon (vs LHB/RHB): NOT AVAILABLE — do not characterize this pitcher's platoon splits`);
              }
            } catch (_) {
              lines.push(`Platoon (vs LHB/RHB): NOT AVAILABLE — do not characterize this pitcher's platoon splits`);
            }

            // Contact quality allowed + fastball velocity + batted-ball tendency
            try {
              const mlbamId = pitcher?.id;
              const [profile, arsenal, seasonPitching] = await Promise.all([
                getPitcherStatcastProfile(mlbamId ?? pitcherName, currentYear).catch(() => null),
                getPitcherArsenal(mlbamId ?? pitcherName, currentYear).catch(() => null),
                mlbamId ? getPlayerSeasonStats(mlbamId, currentYear, 'pitching').catch(() => null) : Promise.resolve(null),
              ]);
              const parts = [];
              if (profile?.brlPercent != null) parts.push(`Barrel% allowed: ${profile.brlPercent}%`);
              if (profile?.ev95Percent != null) parts.push(`Hard-hit% allowed: ${profile.ev95Percent}%`);
              if (arsenal?.fastballMph != null) parts.push(`Fastball velo: ${arsenal.fastballMph} mph`);
              // GO/AO ratio is the fetchable grounder/flyout tendency proxy
              // (true GB%/FB% has no source in our stack — never cite one).
              if (seasonPitching?.groundOutsToAirouts != null) parts.push(`GO/AO: ${seasonPitching.groundOutsToAirouts} (grounders per flyout — above ~1.2 leans ground-ball, below ~0.8 leans fly-ball)`);
              if (parts.length > 0) {
                lines.push(`Contact/velocity (${currentYear}): ${parts.join(' | ')}`);
              } else {
                lines.push(`Contact/velocity: NOT AVAILABLE — do not cite velocity or batted-ball quality for this pitcher`);
              }
            } catch (_) { /* Savant optional */ }

            // Try BvP data against opposing team
            const opposingTeam = side === 'home' ? away : home;
            const opposingTeamId = await resolveBdlTeamId(opposingTeam);
            if (opposingTeamId) {
              try {
                const bvp = await ballDontLieService.getMlbPlayerVsPlayer({
                  playerId,
                  opponentTeamId: opposingTeamId,
                }).catch(() => []);
                if (bvp && bvp.length > 0) {
                  const opposingName = opposingTeam.full_name || opposingTeam.name;
                  lines.push(`vs ${opposingName} hitters (career, may lag most recent meetings):`);
                  for (const m of bvp.slice(0, 5)) {
                    const batter = m.opponent_player?.full_name || m.opponent_player?.last_name || 'Unknown';
                    const avg = m.avg != null ? (typeof m.avg === 'number' ? m.avg.toFixed(3) : m.avg) : '—';
                    const ab = m.at_bats ?? '—';
                    const hr = m.home_runs ?? '—';
                    lines.push(`  ${batter}: ${avg} AVG, ${hr} HR (${ab} AB)`);
                  }
                }
              } catch (_) { /* BvP optional */ }
            }
          }

          continue;
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] Pitcher scouting API failed for ${pitcherName}:`, e.message);
      }

      lines.push(`${pitcherName}: Scouting data unavailable via API`);
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Starting pitcher scouting for ${awayTeam} @ ${homeTeam}`,
      source: usedApi ? 'BDL API (season stats + splits + BvP)' : 'BDL (no data)',
    };
  },

  MLB_SEASON_FORM: async (sport, home, away, season, options) => {
    // Use BDL recent games — no grounding needed for L10 data
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const homeLines = [], awayLines = [];
    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      try {
        const mlbTeam = await findMlbTeamByName(team.full_name || team.name);
        if (!mlbTeam) { lines.push(`${teamName}: Team not found`); continue; }
        const games = await getMlbRecentGames(mlbTeam.id, 10).catch(() => []);
        if (games.length === 0) { lines.push(`${teamName}: No recent games`); continue; }
        let wins = 0, losses = 0, totalRuns = 0, totalAllowed = 0;
        for (const g of games) {
          const h = g.teams?.home, a = g.teams?.away;
          const isHome = h?.team?.id === mlbTeam.id;
          const ts = isHome ? h?.score : a?.score;
          const os = isHome ? a?.score : h?.score;
          if (ts > os) wins++; else losses++;
          totalRuns += (ts || 0); totalAllowed += (os || 0);
        }
        // Stamp the window so the number is auditable (which 10 games, exactly)
        const firstDate = (games[0]?.gameDate || '').split('T')[0];
        const lastDate = (games[games.length - 1]?.gameDate || '').split('T')[0];
        const windowLabel = firstDate && lastDate ? ` (${firstDate} → ${lastDate})` : '';
        lines.push(`${teamName}: ${wins}-${losses} L${games.length}${windowLabel}, ${(totalRuns/games.length).toFixed(1)} RS/gm, ${(totalAllowed/games.length).toFixed(1)} RA/gm`);
      } catch (e) { lines.push(`${teamName}: Recent form unavailable`); }
    }
    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Recent form (L10) for ${awayTeam} @ ${homeTeam}`,
      source: 'BDL API (game history)',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // MLB REGULAR SEASON — STRUCTURED FETCHERS
  // ═══════════════════════════════════════════════════════════════════

  MLB_PITCHER_SEASON_STATS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const gamePk = options?.game?.gamePk || options?.game?.id;
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;
    let pitcherFallbackLabel = '';
    let pitcherFallbackNote = '';

    // Step 1: Identify probable starters via MLB Stats API (no Grounding needed)
    let probablePitchers = null;
    if (gamePk) {
      try {
        probablePitchers = await getProbablePitchers(gamePk);
      } catch (_) { /* Will fall back */ }
    }

    for (const [team, teamName, lines, side] of [
      [home, homeTeam, homeLines, 'home'],
      [away, awayTeam, awayLines, 'away'],
    ]) {
      const pitcher = probablePitchers?.[side];
      const pitcherName = pitcher?.fullName || `${pitcher?.firstName || ''} ${pitcher?.lastName || ''}`.trim();

      if (!pitcherName) {
        lines.push(`${teamName}: Probable pitcher not yet announced`);
        continue;
      }

      // Step 2: Try BDL season stats for the team's pitchers (with prior-season fallback), find the named pitcher
      const bdlTeamId = await resolveBdlTeamId(team);
      if (bdlTeamId) {
        try {
          const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
          if (result.isFallback) {
            pitcherFallbackLabel = ` (${result.season} season)`;
            pitcherFallbackNote = ' (prior season data — current season not yet started)';
          }
          // Find pitchers (have pitching_era or pitching_ip) and match name
          const pitchers = (result.stats || []).filter(s => s.pitching_era != null || s.pitching_ip > 0);
          const pitcherLower = foldName(pitcherName);
          const match = pitchers.find(p => {
            const n = foldName(p.player?.full_name || p.player?.last_name);
            return n.includes(pitcherLower) || pitcherLower.includes(n);
          });
          if (match) {
            usedBdl = true;
            const name = match.player?.full_name || pitcherName;
            const era = match.pitching_era != null ? match.pitching_era.toFixed(2) : '—';
            const whip = match.pitching_whip != null ? match.pitching_whip.toFixed(2) : '—';
            const k = match.pitching_k ?? '—';
            const k9 = match.pitching_k_per_9 != null ? match.pitching_k_per_9.toFixed(1) : '—';
            const ip = match.pitching_ip != null ? match.pitching_ip.toFixed(1) : '—';
            const war = match.pitching_war != null ? match.pitching_war.toFixed(1) : '—';
            const w = match.pitching_w ?? '—';
            const l = match.pitching_l ?? '—';
            const bb = match.pitching_bb ?? '—';
            lines.push(`${name}: ${w}-${l}, ${era} ERA, ${whip} WHIP, ${k} K (${k9} K/9), ${bb} BB in ${ip} IP | WAR: ${war}`);
            if (match.pitching_h != null && match.pitching_hr != null) {
              lines.push(`  H: ${match.pitching_h}, HR: ${match.pitching_hr}, HBP: ${match.pitching_hbp ?? '—'}`);
            }
            continue;
          }
        } catch (e) {
          console.warn(`[MLB Fetchers] BDL pitcher stats failed for ${teamName}:`, e.message);
        }
      }

      // Fallback: legacy MLB Stats API search + season stats
      const players = await searchPlayer(pitcherName).catch(() => []);
      const pitcherPlayer = players.find(p => p.primaryPosition?.type === 'Pitcher') || players[0];
      if (pitcherPlayer?.id) {
        const stats = await getPlayerSeasonStats(pitcherPlayer.id, currentYear, 'pitching').catch(() => null);
        if (stats) {
          lines.push(`${pitcherPlayer.fullName || pitcherName}: ${stats.wins || 0}-${stats.losses || 0}, ${stats.era || '—'} ERA, ${stats.whip || '—'} WHIP, ${stats.strikeOuts || 0} K, ${stats.baseOnBalls || 0} BB in ${stats.inningsPitched || 0} IP`);
          if (stats.strikeOuts && stats.inningsPitched) {
            // MLB IP is THIRDS notation ("10.2" = 10⅔) — parseFloat math
            // under-counted innings and inflated K/9 by up to ~5% on short
            // seasons (Jul 30). Convert to true innings via outs first.
            const raw = parseFloat(stats.inningsPitched) || 0;
            const ip = (Math.floor(raw) * 3 + Math.round((raw % 1) * 10)) / 3 || 1;
            const k9 = ((stats.strikeOuts / ip) * 9).toFixed(1);
            const bb9 = (((stats.baseOnBalls || 0) / ip) * 9).toFixed(1);
            lines.push(`  K/9: ${k9}, BB/9: ${bb9}, K/BB: ${stats.baseOnBalls ? (stats.strikeOuts / stats.baseOnBalls).toFixed(2) : '—'}`);
          }
        } else {
          lines.push(`${pitcherName}: Season stats unavailable via API`);
        }
      } else {
        lines.push(`${pitcherName}: Player not found in API`);
      }
    }
    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Starting pitcher season stats for ${awayTeam} @ ${homeTeam}${pitcherFallbackNote}`,
      source: usedBdl ? `BDL API${pitcherFallbackLabel}` : 'MLB Stats API',
    };
  },

  MLB_PITCHER_RECENT_FORM: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const gamePk = options?.game?.gamePk || options?.game?.id;
    const homeLines = [];
    const awayLines = [];
    let usedApi = false;

    // Try to identify probable pitchers first
    let probablePitchers = null;
    if (gamePk) {
      try {
        probablePitchers = await getProbablePitchers(gamePk);
      } catch (_) { /* Will fall back */ }
    }

    for (const [team, teamName, lines, side] of [
      [home, homeTeam, homeLines, 'home'],
      [away, awayTeam, awayLines, 'away'],
    ]) {
      const pitcher = probablePitchers?.[side];
      const pitcherName = pitcher?.fullName || `${pitcher?.firstName || ''} ${pitcher?.lastName || ''}`.trim();

      if (!pitcherName) {
        lines.push(`${teamName}: Probable pitcher not identified — cannot fetch recent form`);
        continue;
      }

      // Try to find the pitcher's BDL player ID via team season stats
      const bdlTeamId = await resolveBdlTeamId(team);
      let pitcherId = null;

      if (bdlTeamId) {
        try {
          const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
          const pitcherLower = foldName(pitcherName);
          const match = (result.stats || []).find(s => {
            const n = foldName(s.player?.full_name || s.player?.last_name);
            return (n.includes(pitcherLower) || pitcherLower.includes(n)) && s.pitching_ip > 0;
          });
          if (match?.player?.id) pitcherId = match.player.id;
        } catch (_) { /* Will try game stats below */ }
      }

      if (pitcherId) {
        try {
          // Get pitcher's game-by-game stats in TRUE chronological order
          // (real game dates joined; spring/in-progress rows excluded —
          // game_id is not reliably chronological, June 3 2026 audit).
          const gameStats = await ballDontLieService.getMlbPlayerGameRowsChrono(pitcherId, currentYear).catch(() => []);

          // Filter to starts. BDL game stats use flat field names (ip, er, p_k, etc.)
          // — NOT the pitching_* prefix used by season stats. Rows arrive
          // oldest→newest, so the last 5 entries are the latest 5 starts.
          let starts = gameStats
            .filter(s => (s.ip || 0) >= 3 || (s.games_started || 0) > 0)
            .slice(-5)
            .reverse();

          // If current season empty, try prior season
          if (starts.length === 0) {
            const priorStats = await ballDontLieService.getMlbPlayerGameRowsChrono(pitcherId, currentYear - 1).catch(() => []);

            starts = priorStats
              .filter(s => (s.ip || 0) >= 3 || (s.games_started || 0) > 0)
              .slice(-5)
              .reverse();

            if (starts.length > 0) {
              lines.push(`${pitcherName} — Last 5 starts (${currentYear - 1} season):`);
            }
          } else {
            lines.push(`${pitcherName} — Last ${starts.length} starts:`);
          }

          if (starts.length > 0) {
            usedApi = true;
            for (const s of starts) {
              const ip = s.ip != null ? Number(s.ip).toFixed(1) : '—';
              const h = s.p_hits ?? '—';
              const er = s.er ?? '—';
              const k = s.p_k ?? '—';
              const bb = s.p_bb ?? '—';
              lines.push(`  ${ip} IP, ${h} H, ${er} ER, ${k} K, ${bb} BB`);
            }
            continue;
          }
        } catch (e) {
          console.warn(`[MLB Fetchers] Pitcher recent form API failed for ${pitcherName}:`, e.message);
        }
      }

      // Fallback: season summary from BDL
      if (bdlTeamId) {
        try {
          const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
          const pitcherLower = foldName(pitcherName);
          const match = (result.stats || []).find(s => {
            const n = foldName(s.player?.full_name || s.player?.last_name);
            return (n.includes(pitcherLower) || pitcherLower.includes(n)) && s.pitching_ip > 0;
          });
          if (match) {
            usedApi = true;
            const label = result.isFallback ? ` (${result.season})` : '';
            lines.push(`${pitcherName} — Season Summary${label}: ${match.pitching_w ?? 0}-${match.pitching_l ?? 0}, ${match.pitching_era?.toFixed(2) ?? '—'} ERA, ${match.pitching_whip?.toFixed(2) ?? '—'} WHIP, ${match.pitching_k ?? '—'} K in ${match.pitching_ip?.toFixed(1) ?? '—'} IP`);
            lines.push(`  (Game-by-game log unavailable — showing season totals)`);
            continue;
          }
        } catch (_) { /* Fall through */ }
      }

      lines.push(`${pitcherName}: Recent form data unavailable`);
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Starting pitcher recent form (last 5 starts) for ${awayTeam} @ ${homeTeam}`,
      source: usedApi ? 'BDL API + MLB Stats API' : 'BDL (no game log data)',
    };
  },

  MLB_TEAM_RECORD: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();

    // Try BDL GOAT-tier standings first (with prior-season fallback)
    try {
      const result = await fetchStandingsWithFallback(currentYear);
      const standings = result.standings;
      const recordSeasonLabel = result.isFallback ? ` (${result.season} season)` : '';
      const recordFallbackNote = result.isFallback ? ' (prior season data — current season not yet started)' : '';
      if (Array.isArray(standings) && standings.length > 0) {
        const homeLower = (homeTeam || '').toLowerCase();
        const awayLower = (awayTeam || '').toLowerCase();

        function formatTeamRecord(t) {
          const name = t.team?.full_name || t.team?.name || '';
          return `${t.division_name || 'Division'}: ${name} ${t.wins}-${t.losses} | Home: ${t.home || '—'} | Away: ${t.road || '—'} | L10: ${t.last_ten_games || '—'} | Streak: ${t.streak || '—'} | GB: ${t.division_games_behind ?? t.games_behind ?? '—'} | Win%: ${t.win_percent != null ? (t.win_percent * 100).toFixed(1) + '%' : '—'}`;
        }

        const homeMatch = standings.find(t => {
          const n = (t.team?.full_name || t.team?.name || '').toLowerCase();
          return n.includes(homeLower) || homeLower.includes(n);
        });
        const awayMatch = standings.find(t => {
          const n = (t.team?.full_name || t.team?.name || '').toLowerCase();
          return n.includes(awayLower) || awayLower.includes(n);
        });

        if (homeMatch || awayMatch) {
          return {
            homeValue: homeMatch ? formatTeamRecord(homeMatch) : 'Not found in standings',
            awayValue: awayMatch ? formatTeamRecord(awayMatch) : 'Not found in standings',
            comparison: `MLB Team Records for ${awayTeam} @ ${homeTeam}${recordFallbackNote}`,
            source: `BDL API${recordSeasonLabel}`,
          };
        }
      }
    } catch (e) {
      console.warn('[MLB Fetchers] BDL standings for team record failed:', e.message);
    }

    // No grounding fallback — if BDL doesn't have standings, surface the gap
    console.warn(`[MLB Fetchers] ⚠️ BDL standings missing for ${awayTeam} @ ${homeTeam}`);
    return {
      homeValue: 'Team record unavailable — BDL standings returned empty',
      awayValue: '',
      comparison: `MLB records for ${awayTeam} @ ${homeTeam}`,
      source: 'BDL API (no data)',
    };
  },

  MLB_RECENT_FORM: async (sport, home, away, season, options) => {
    // Use BDL recent games — same as MLB_SEASON_FORM, no grounding needed
    return mlbFetchers.MLB_SEASON_FORM(sport, home, away, season, options);
  },

  MLB_PARK_FACTORS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const venueName = options?.game?.venue || options?.game?.venueName;

    const parkData = findParkData(venueName, homeTeam);
    if (parkData) {
      const typeLabel = parkData.type === 'pitcher' ? 'Pitcher-Friendly' :
        parkData.type === 'hitter' ? 'Hitter-Friendly' :
        parkData.type === 'variable' ? 'Variable (Wind-Dependent)' : 'Neutral';
      return {
        // NO NUMERIC PARK FACTORS ON GARY'S DESK (founder, Aug 26: "we never
        // math out park factor, ever... I'm talking about what the average
        // everyday fan would know about a certain park" — the Padres rationale
        // cited "a 0.92 factor" the same day). The park reaches Gary as fan
        // knowledge in words: the character of the yard, which both lineups
        // share tonight. The numeric factor stays OUT of every Gary surface;
        // the user-facing board's +N% row (his Aug 14 pick) is untouched.
        homeValue: `${parkData.park} — ${typeLabel}. ${parkData.notes}`,
        awayValue: 'Shared venue — both lineups hit in the same park tonight.',
        comparison: `Venue profile for ${homeTeam} home stadium`,
        source: 'Static MLB Park Data (2024-2026)',
      };
    }

    // No match found — return generic message
    return {
      homeValue: `${homeTeam}: Park data not found for venue "${venueName || 'unknown'}". Check venue name mapping.`,
      awayValue: 'Shared venue — both lineups hit in the same park tonight.',
      comparison: `Venue profile for ${homeTeam} home stadium`,
      source: 'Static MLB Park Data (venue not matched)',
    };
  },

  MLB_WEATHER: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const gamePk = options?.game?.gamePk || options?.game?.id;

    if (gamePk) {
      try {
        const pitcherData = await getProbablePitchers(gamePk);
        const weather = pitcherData.weather;
        const venue = pitcherData.venue;

        if (weather || venue) {
          const lines = [];
          if (venue) {
            lines.push(`Venue: ${venue.name || venue.fieldInfo?.name || 'Unknown'}`);
          }
          if (weather) {
            const temp = weather.temp ? `${weather.temp}°F` : '—';
            const condition = weather.condition || '—';
            const wind = weather.wind || '—';
            lines.push(`Weather: ${condition}, ${temp}`);
            lines.push(`Wind: ${wind}`);
          }

          // Add park context from static data
          const venueName = venue?.name || options?.game?.venue;
          const parkData = findParkData(venueName, homeTeam);
          if (parkData) {
            const roofInfo = parkData.notes.toLowerCase().includes('retractable') ? 'Retractable roof' :
              parkData.notes.toLowerCase().includes('dome') || parkData.notes.toLowerCase().includes('indoor') ? 'Indoor/Dome' : 'Open-air';
            lines.push(`Venue Type: ${roofInfo}`);
          }

          return {
            homeValue: lines.join('\n'),
            awayValue: 'N/A (weather applies to game venue)',
            comparison: `Weather and venue conditions for tonight's game at ${homeTeam}`,
            source: 'MLB Stats API (game feed)',
          };
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] Weather fetch failed for gamePk ${gamePk}:`, e.message);
      }
    }

    // No gamePk — check if we can at least provide venue info from static data
    const parkData = findParkData(null, homeTeam);
    if (parkData) {
      const roofInfo = parkData.notes.toLowerCase().includes('retractable') ? 'Retractable roof' :
        parkData.notes.toLowerCase().includes('dome') || parkData.notes.toLowerCase().includes('indoor') ? 'Indoor/Dome' : 'Open-air';
      return {
        homeValue: `Venue: ${parkData.park} (${roofInfo})\nWeather data available closer to game time.`,
        awayValue: 'N/A (weather applies to game venue)',
        comparison: `Weather and venue conditions for tonight's game at ${homeTeam}`,
        source: 'Static MLB Park Data (weather pending)',
      };
    }

    return {
      homeValue: 'Weather data available closer to game time.',
      awayValue: 'N/A (weather applies to game venue)',
      comparison: `Weather and venue conditions for tonight's game at ${homeTeam}`,
      source: 'N/A (no gamePk)',
    };
  },

  MLB_BULLPEN_WORKLOAD: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const homeLines = [];
    const awayLines = [];
    let usedApi = false;

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const mlbTeam = await findMlbTeamByName(team.full_name || team.name);
      if (!mlbTeam) {
        lines.push(`${teamName}: Team not found`);
        continue;
      }

      try {
        // PEN RECENCY, THE FOUNDER'S SPEC (Aug 27, replacing the Aug-26
        // 7/14-GAME windows he never asked for — his words: last game, who
        // pitched in it, who's pitched this series, and the pen over the
        // last 5/7/10 DAYS and 3 series). The most recent series prints
        // appearance by appearance (the last game is its newest row), then
        // the day-window and series rollups. Facts only; the read is the
        // brain's. (The Aug-26 composition/close-spot prose died the same
        // day — duplication audit; the game stories carry the narrative.)
        const allRecentGames = await getMlbRecentGames(mlbTeam.id, 14);
        if (!allRecentGames || allRecentGames.length === 0) {
          lines.push(`${teamName}: No recent games found`);
          continue;
        }
        // Series runs, oldest → newest: consecutive games vs the same club.
        const oppOf = (g) => (g?.teams?.home?.team?.id === mlbTeam.id
          ? (g?.teams?.away?.team?.name || '?')
          : (g?.teams?.home?.team?.name || '?'));
        const nickOf = (name) => {
          const two = String(name || '').match(/\b(Blue Jays|Red Sox|White Sox)$/);
          return two ? two[1] : String(name || '?').split(' ').pop();
        };
        const seriesRuns = [];
        for (const g of allRecentGames) {
          const opp = oppOf(g);
          const tail = seriesRuns[seriesRuns.length - 1];
          if (tail && tail.opp === opp) tail.games.push(g);
          else seriesRuns.push({ opp, games: [g] });
        }
        const trailing = seriesRuns[seriesRuns.length - 1];
        // DETAIL FLOOR (founder, Aug 27: "for the last game, the last two
        // games, Gary needs to know every single thing"): the full trailing
        // series AND never fewer than the last three games, even when a new
        // series just started — capped at six appearances-detail games.
        const detailSet = new Map();
        for (const g of [...(trailing?.games || []), ...allRecentGames.slice(-3)]) {
          if (g?.gamePk != null) detailSet.set(g.gamePk, g);
        }
        const detailGames = [...detailSet.values()]
          .sort((x, y) => String(bullpenLedgerDate(x)).localeCompare(String(bullpenLedgerDate(y))))
          .slice(-6);
        const detailPks = new Set(detailGames.map((g) => g.gamePk));
        // "This series" vs "last series": is the trailing run tonight's opponent?
        const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
        const tonightOpp = norm(teamName) === norm(homeTeam) ? awayTeam : homeTeam;
        const trailingIsTonight = trailing && (norm(trailing.opp) === norm(tonightOpp)
          || norm(trailing.opp).includes(norm(nickOf(tonightOpp)))
          || norm(tonightOpp).includes(norm(nickOf(trailing.opp))));
        lines.push(`${teamName} pen, ${trailingIsTonight ? `this series vs ${nickOf(trailing.opp)}` : `last series (vs ${nickOf(trailing?.opp)})`}, appearance by appearance:`);

        usedApi = true;
        // ONE boxscore walk over the whole fetch: full appearance lines for
        // the detail window, bare per-game pen totals for the rollups.
        // (recentGames come from MLB Stats API — gamePk namespace; BDL game
        // ids are a different namespace and return nothing here.)
        const perGamePen = []; // { pk, date, outs, er }
        const armTotals = new Map(); // detail window: name -> { outs, pitches, er, dates[] }
        const gameDates = [];        // detail window, chronological
        for (const game of allRecentGames) {
          const date = bullpenLedgerDate(game);
          const inDetail = detailPks.has(game.gamePk);
          const box = await getGameBoxScore(game.gamePk).catch(() => null);
          if (!box?.teams) {
            if (inDetail) lines.push(`${date}: Box score unavailable`);
            continue;
          }
          // ENTRY CONTEXT (founder GO, Aug 12 — the pen's missing story):
          // the situation each arm walked into — inning and score before his
          // first pitch — from the official play-by-play. Detail window only.
          const entryCtx = inDetail ? await getPitcherEntryContext(game.gamePk).catch(() => new Map()) : new Map();
          const sideKey = box.teams.home?.team?.id === mlbTeam.id ? 'home' : 'away';
          const side = box.teams[sideKey];
          let gOuts = 0;
          let gEr = 0;
          const relievers = [];
          // pitchers[] is appearance order: [0] is the STARTER, everyone after
          // is relief. relieverBoxEntries also drops position players mopping
          // up a blowout — they are not pen arms (Aug 15 KC fix).
          for (const { pid, player: p } of relieverBoxEntries(side)) {
            const ipStr = p?.stats?.pitching?.inningsPitched;
            if (ipStr == null) continue;
            // MLB IP is in "outs decimal" form (e.g. "1.2" = 1 inning + 2 outs).
            const ip = parseFloat(ipStr);
            if (!Number.isFinite(ip) || ip < 0) continue;
            const outs = Math.floor(ip) * 3 + Math.round((ip % 1) * 10);
            const er = p?.stats?.pitching?.earnedRuns;
            gOuts += outs;
            gEr += Number(er) || 0;
            if (!inDetail) continue;
            const name = p?.person?.fullName || 'Unknown';
            // Pitch count is the real workload signal — IP alone overstates a
            // 15-pitch four-out save and understates a 30-pitch single inning.
            const pitches = p?.stats?.pitching?.numberOfPitches;
            const pitchStr = pitches != null ? `, ${pitches} pitches` : '';
            // PEN CONTEXT (founder GO, Aug 5 PM): the official decision note
            // carries the appearance's result by name — (BS, 4), (SV, 20),
            // (H, 12) — so a blown save is a printed fact.
            const note = p?.stats?.pitching?.note;
            // THE OUTING'S SHAPE (founder GO, Aug 12 — Plan A2): K/BB and
            // inherited runners make the appearance a story, not a bare IP.
            const k = p?.stats?.pitching?.strikeOuts;
            const bb = p?.stats?.pitching?.baseOnBalls;
            const ir = p?.stats?.pitching?.inheritedRunners;
            const irs = p?.stats?.pitching?.inheritedRunnersScored;
            const kbb = [k != null && k > 0 ? `${k} K` : null, bb != null && bb > 0 ? `${bb} BB` : null].filter(Boolean).join(' ');
            const inherited = ir != null && Number(ir) > 0 ? `, inherited ${irs ?? 0}/${ir} scored` : '';
            // The situation he entered: "in B7 2-1" — the score before his
            // first pitch, from the play-by-play entry context above.
            const ec = entryCtx.get(pid);
            const entered = ec?.inning != null ? ` (in ${ec.half}${ec.inning} ${ec.awayScore}-${ec.homeScore})` : '';
            // Real traffic only (2+ on) — one runner is a Tuesday.
            const jam = ec?.maxOn >= 3 ? ', bases loaded' : ec?.maxOn === 2 ? ', 2 on' : '';
            relievers.push(`${name} ${ip.toFixed(1)} IP${entered}${er != null ? `, ${er} ER` : ''}${kbb ? `, ${kbb}` : ''}${inherited}${jam}${pitchStr}${note ? ` ${note}` : ''}`);
            const t = armTotals.get(name) || { outs: 0, pitches: 0, er: 0, dates: [] };
            t.outs += outs;
            t.pitches += Number(pitches) || 0;
            t.er += Number(er) || 0;
            t.dates.push(date);
            armTotals.set(name, t);
          }
          perGamePen.push({ pk: game.gamePk, date, outs: gOuts, er: gEr });
          if (inDetail) {
            gameDates.push(date);
            lines.push(relievers.length ? `${date}: ${relievers.join(', ')}` : `${date}: No reliever appearances`);
          }
        }
        // Roll-up (founder, Jul 30): the aggregate facts beside the ledger —
        // total relief IP, arms used, and who worked both of the last two
        // game days. Facts only.
        if (armTotals.size) {
          const totalOuts = [...armTotals.values()].reduce((s, a) => s + a.outs, 0);
          const totalEr = [...armTotals.values()].reduce((acc, a) => acc + (a.er || 0), 0);
          // Distinct dates — a doubleheader made everyone 'worked both of
          // the last two game days' (live catch, Rockies Aug 5 DH).
          const lastTwo = [...new Set(gameDates)].slice(-2);
          const b2b = [...armTotals.entries()]
            .filter(([, a]) => lastTwo.length === 2 && lastTwo.every((d) => a.dates.includes(d)))
            .map(([n]) => n);
          const heaviest = [...armTotals.entries()]
            .sort((a, b) => b[1].pitches - a[1].pitches)
            .slice(0, 3)
            .map(([n, a]) => `${n} ${a.pitches} pitches/${a.dates.length} G`)
            .join(', ');
          lines.push(
            `These ${gameDates.length} game${gameDates.length === 1 ? '' : 's'} total: ${outsToIp(totalOuts)} relief IP, ${totalEr} ER ` +
            `across ${armTotals.size} arms; heaviest: ${heaviest}; ` +
            `worked both of the last two game days: ${b2b.length ? b2b.join(', ') : 'none'}.`,
          );
        }
        // The pen by DAYS — the founder's recency grain (5/7/10 calendar days
        // back from today ET, so off days and doubleheaders count as
        // themselves instead of stretching a game-count window).
        const todayEtPen = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const daysAgoPen = (d) => Math.round((new Date(`${todayEtPen}T12:00:00`) - new Date(`${d}T12:00:00`)) / 86400000);
        for (const win of [5, 7, 10]) {
          const rows = perGamePen.filter((r) => r.date && daysAgoPen(r.date) >= 0 && daysAgoPen(r.date) <= win);
          const outs = rows.reduce((s, r) => s + r.outs, 0);
          const er = rows.reduce((s, r) => s + r.er, 0);
          if (rows.length && outs > 0) {
            lines.push(`Pen last ${win} days: ${outsToIp(outs)} IP, ${er} ER (${((er * 27) / outs).toFixed(2)} ERA) over ${rows.length} game${rows.length === 1 ? '' : 's'}`);
          }
        }
        // The pen by SERIES — the sport's native unit, last three, newest first.
        const seriesBits = seriesRuns.slice(-3).reverse().map((s) => {
          const pks = new Set(s.games.map((g) => g.gamePk));
          const rows = perGamePen.filter((r) => pks.has(r.pk));
          if (!rows.length) return null;
          const outs = rows.reduce((sum, r) => sum + r.outs, 0);
          const er = rows.reduce((sum, r) => sum + r.er, 0);
          return `vs ${nickOf(s.opp)} (${rows.length}g): ${outsToIp(outs)} IP, ${er} ER`;
        }).filter(Boolean);
        if (seriesBits.length) lines.push(`Pen by series, newest first: ${seriesBits.join(' · ')}`);
      } catch (e) {
        console.warn(`[MLB Fetchers] ⚠️ Bullpen workload API failed for ${teamName}: ${e.message}`);
        lines.push(`${teamName}: Bullpen workload data unavailable — check MLB Stats API boxscore`);
      }
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Bullpen recency (series detail + 5/7/10-day and 3-series rollups) for ${awayTeam} @ ${homeTeam}`,
      source: usedApi ? 'BDL API + MLB Stats API' : 'Gemini Grounding (fallback)',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // MLB STANDINGS (alias for STANDINGS token when sport is MLB)
  // ═══════════════════════════════════════════════════════════════════

  MLB_STANDINGS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();

    // Try BDL GOAT-tier standings first (with prior-season fallback)
    try {
      const result = await fetchStandingsWithFallback(currentYear);
      const standings = result.standings;
      const stSeasonLabel = result.isFallback ? ` (${result.season} season)` : '';
      const stFallbackNote = result.isFallback ? ' (prior season data — current season not yet started)' : '';
      if (Array.isArray(standings) && standings.length > 0) {
        const divisions = {};
        for (const t of standings) {
          const div = t.division_name || 'Unknown Division';
          if (!divisions[div]) divisions[div] = [];
          const teamName = t.team?.full_name || t.team?.name || 'Unknown';
          divisions[div].push(
            `${teamName}: ${t.wins}-${t.losses} | Home: ${t.home || '—'} | Away: ${t.road || '—'} | L10: ${t.last_ten_games || '—'} | Streak: ${t.streak || '—'} | GB: ${t.division_games_behind ?? t.games_behind ?? '—'}`
          );
        }
        const lines = [];
        for (const [divName, teams] of Object.entries(divisions)) {
          lines.push(`\n--- ${divName} ---`);
          lines.push(...teams);
        }
        if (lines.length > 0) {
          return {
            homeValue: lines.join('\n'),
            awayValue: '',
            comparison: `MLB Division Standings${stFallbackNote}`,
            source: `BDL API${stSeasonLabel}`,
          };
        }
      }
    } catch (e) {
      console.warn('[MLB Fetchers] BDL standings failed, trying fallback:', e.message);
    }

    // No grounding fallback — if BDL standings fail, surface the gap
    console.warn(`[MLB Fetchers] ⚠️ BDL standings unavailable for ${awayTeam} @ ${homeTeam}`);
    return {
      homeValue: 'Standings unavailable — BDL returned empty',
      awayValue: '',
      comparison: `MLB standings for ${awayTeam} @ ${homeTeam}`,
      source: 'BDL API (no data)',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // MLB BDL GOAT-TIER — Player Splits & Matchups
  // ═══════════════════════════════════════════════════════════════════

  MLB_PLAYER_SPLITS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;
    let splitsSeasonLabel = '';
    let splitsFallbackNote = '';

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const bdlTeamId = await resolveBdlTeamId(team);
      if (!bdlTeamId) {
        lines.push(`${teamName}: Unable to resolve BDL team ID for splits`);
        continue;
      }

      try {
        // Get top hitters for the team (with prior-season fallback), then fetch splits for each
        const seasonResult = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
        const effectiveSeason = seasonResult.season;
        if (seasonResult.isFallback) {
          splitsSeasonLabel = ` (${seasonResult.season} season)`;
          splitsFallbackNote = ' (prior season data — current season not yet started)';
        }
        const topHitters = (seasonResult.stats || [])
          // Real batting sample, not "has never pitched" (Jul 30): the old
          // `!s.pitching_era` clause erased a two-way player's BAT entirely
          // (the Ohtani class), while a pitcher's fluke 1-for-2 could top an
          // OPS sort. >= 20 AB keeps April regulars and kills both.
          .filter(s => (s.batting_ops > 0 || s.batting_avg > 0) && (s.batting_ab || 0) >= 20)
          .sort((a, b) => (b.batting_ops || 0) - (a.batting_ops || 0))
          .slice(0, 4);

        if (topHitters.length === 0) {
          lines.push(`${teamName}: No hitter data available for splits`);
          continue;
        }

        for (const hitter of topHitters) {
          const playerId = hitter.player?.id;
          const name = hitter.player?.full_name || hitter.player?.last_name || 'Unknown';
          if (!playerId) {
            lines.push(`${name}: No player ID for splits lookup`);
            continue;
          }

          const splitsResult = await fetchSplitsWithFallback(playerId, effectiveSeason);
          const splits = splitsResult.splits;
          if (!splits || Object.keys(splits).length === 0) {
            lines.push(`${name}: Splits data unavailable`);
            continue;
          }

          usedBdl = true;
          lines.push(`--- ${name} ---`);

          // L/R breakdown — BDL splits use flat field names (avg, ops, home_runs, at_bats).
          // LAB DIET (founder GO, Aug 5 2026): platoon rows ONLY. The full
          // byBreakdown array carried Away/Day/Home/Night rows under an "L/R
          // SPLITS" header — tiny-sample venue/time trivia (the CES "Away:
          // 22 AB" class) that fed the bench's stat-tilt. vs-LHP/vs-RHP is
          // what the section's name promises; recent form stays below.
          if (splits.byBreakdown && Array.isArray(splits.byBreakdown)) {
            const platoon = splits.byBreakdown.filter((b) =>
              /\b(lhp|rhp|left|right)\b/i.test(String(b.split_name || b.split_abbreviation || '')));
            for (const b of platoon) {
              const label = b.split_name || b.split_abbreviation || 'Unknown';
              const avg = b.avg != null ? Number(b.avg).toFixed(3) : '—';
              const ops = b.ops != null ? Number(b.ops).toFixed(3) : '—';
              const hr = b.home_runs ?? '—';
              const ab = b.at_bats ?? '—';
              lines.push(`  ${label}: ${avg} AVG, ${ops} OPS, ${hr} HR (${ab} AB)`);
            }
          }

          // (Per-hitter venue rows REMOVED — LAB DIET Aug 5: three ballpark
          // lines per bat at 10-30 AB each was the exact noise class the
          // founder called out; the SP venue split elsewhere stays, IP-gated.)

          // Recent form (Jul 30, founder: no headline without its context —
          // Gary saw season + L/R while blind to the last two weeks, the
          // exact hot/cold context the Hub computes). Label comes from the
          // split actually used, so a 7- or 30-day fallback names itself.
          if (splits.byDayMonth && Array.isArray(splits.byDayMonth)) {
            const norm = (x) => String(x || '').toLowerCase();
            const recent = splits.byDayMonth.find((b) => norm(b.split_name).includes('last 15 days'))
              || splits.byDayMonth.find((b) => norm(b.split_name).includes('last 7 days'))
              || splits.byDayMonth.find((b) => norm(b.split_name).includes('last 30 days'));
            if (recent) {
              const avg = recent.avg != null ? Number(recent.avg).toFixed(3) : '—';
              const ops = recent.ops != null ? Number(recent.ops).toFixed(3) : '—';
              const sample = formatSampleSuffix(recent, [
                { field: 'at_bats', label: 'AB' },
                { field: 'plate_appearances', label: 'PA' },
              ]);
              lines.push(`  ${recent.split_name || 'Recent'}: ${avg} AVG, ${ops} OPS${sample}`);
            }
          }
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] BDL splits failed for ${teamName}:`, e.message);
        lines.push(`${teamName}: Splits lookup failed`);
      }
    }

    return {
      homeValue: homeLines.join('\n') || 'No player splits data available yet (season may not have started)',
      awayValue: awayLines.join('\n') || 'No player splits data available yet',
      comparison: `Player splits (L/R, home/away) for ${awayTeam} @ ${homeTeam}${splitsFallbackNote} — HITTERS ONLY; pitcher platoon splits (vs LHB/RHB) come from MLB_PITCHER_SCOUTING`,
      source: usedBdl ? `BDL API${splitsSeasonLabel}` : 'BDL (no data)',
    };
  },

  // (MLB_LINEUP_VS_SP fetcher REMOVED — founder ruling, Aug 10 2026: the
  // section was career-grain by nature; no career numbers on the desk.)

  MLB_BATTER_VS_PITCHER: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const gamePk = options?.game?.gamePk || options?.game?.id;
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;

    // Identify today's probable starters so each hitter's line vs THE actual
    // opposing SP is surfaced explicitly (not buried among 12 career rows).
    let probable = {};
    if (gamePk) {
      try { probable = await getProbablePitchers(gamePk); } catch (_) { /* optional */ }
    }
    const spNameFor = (side) => {
      const p = probable?.[side];
      return p ? (p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim()) : null;
    };

    // For each team's hitters, look up their history vs the opposing team's pitchers
    for (const [battingTeam, battingName, opposingTeam, opposingName, opposingSpName, lines] of [
      [home, homeTeam, away, awayTeam, spNameFor('away'), homeLines],
      [away, awayTeam, home, homeTeam, spNameFor('home'), awayLines],
    ]) {
      const battingTeamId = await resolveBdlTeamId(battingTeam);
      const opposingTeamId = await resolveBdlTeamId(opposingTeam);

      if (!battingTeamId || !opposingTeamId) {
        lines.push(`${battingName}: Unable to resolve team IDs for BvP lookup`);
        continue;
      }

      try {
        // Get top hitters for the batting team (with prior-season fallback for
        // player identification). 8 covers the bulk of a lineup — a top-5 cap
        // previously dropped slumping stars whose BvP the rationale then invented.
        const seasonResult = await fetchSeasonStatsWithFallback({ teamId: battingTeamId, season: currentYear });
        const topHitters = (seasonResult.stats || [])
          // Real batting sample, not "has never pitched" (Jul 30): the old
          // `!s.pitching_era` clause erased a two-way player's BAT entirely
          // (the Ohtani class), while a pitcher's fluke 1-for-2 could top an
          // OPS sort. >= 20 AB keeps April regulars and kills both.
          .filter(s => (s.batting_ops > 0 || s.batting_avg > 0) && (s.batting_ab || 0) >= 20)
          .sort((a, b) => (b.batting_ops || 0) - (a.batting_ops || 0))
          .slice(0, 8);

        if (topHitters.length === 0) {
          lines.push(`${battingName}: No hitter data available`);
          continue;
        }

        const fmtRow = (m) => {
          const ab = m.at_bats ?? '—';
          const hits = m.hits ?? '—';
          const hr = m.home_runs ?? '—';
          const avg = m.avg != null ? (typeof m.avg === 'number' ? m.avg.toFixed(3) : m.avg) : '—';
          const ops = m.ops != null ? (typeof m.ops === 'number' ? m.ops.toFixed(3) : m.ops) : '—';
          const k = m.strikeouts ?? m.k ?? '—';
          const bb = m.walks ?? m.bb ?? '—';
          return `${avg} AVG, ${ops} OPS, ${hr} HR, ${k} K, ${bb} BB (${ab} AB, ${hits} H)`;
        };
        const matchesSp = (m) => {
          if (!opposingSpName) return false;
          const p = foldName(m.opponent_player?.full_name);
          return p && p === foldName(opposingSpName);
        };

        for (const hitter of topHitters) {
          const playerId = hitter.player?.id;
          const name = hitter.player?.full_name || hitter.player?.last_name || 'Unknown';
          if (!playerId) continue;

          const matchups = await ballDontLieService.getMlbPlayerVsPlayer({ playerId, opponentTeamId: opposingTeamId }).catch(() => []);
          if (!matchups || matchups.length === 0) {
            const spNote = opposingSpName ? ` (incl. no history vs ${opposingSpName})` : '';
            lines.push(`${name} vs ${opposingName}: No matchup history${spNote}`);
            continue;
          }

          usedBdl = true;
          lines.push(`--- ${name} vs ${opposingName} pitchers ---`);
          // Today's opposing starter first — that's the matchup that matters tonight.
          if (opposingSpName) {
            const spRow = matchups.find(matchesSp);
            if (spRow && (spRow.at_bats || 0) >= 10) {
              lines.push(`  vs ${opposingSpName} (TODAY'S SP): ${fmtRow(spRow)}`);
            } else if (spRow) {
              // LAB DIET (Aug 5): under 10 AB the rate stats mislead (the
              // Nats-mash-Luzardo-in-6-AB class) — the counts are the fact.
              lines.push(`  vs ${opposingSpName} (TODAY'S SP): ${spRow.at_bats ?? 0} career AB, ${spRow.hits ?? 0} H`);
            } else {
              lines.push(`  vs ${opposingSpName} (TODAY'S SP): no career history in source`);
            }
          }
          const others = matchups
            .filter(m => !matchesSp(m) && (m.at_bats || 0) >= 10)
            .sort((a, b) => (b.at_bats || 0) - (a.at_bats || 0))
            .slice(0, 5);
          for (const m of others) {
            const pitcher = m.opponent_player?.full_name || m.opponent_player?.last_name || 'Unknown P';
            lines.push(`  vs ${pitcher}: ${fmtRow(m)}`);
          }
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] BDL BvP failed for ${battingName} vs ${opposingName}:`, e.message);
        lines.push(`${battingName} vs ${opposingName}: BvP lookup failed`);
      }
    }

    return {
      homeValue: homeLines.join('\n') || 'No 2026 batter vs pitcher data available yet (season may not have started)',
      awayValue: awayLines.join('\n') || 'No 2026 batter vs pitcher data available yet',
      comparison: `Batter vs pitcher matchup history for ${awayTeam} @ ${homeTeam} (career totals; source may lag the most recent meetings — do not cite BvP lines not shown here)`,
      source: usedBdl ? 'BDL API' : 'BDL (no data)',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // MLB NEW: Closer/Reliever, Catcher Defense, RISP, Team Defense
  // ═══════════════════════════════════════════════════════════════════

  MLB_CLOSER_RELIEVER_STATS: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;
    let closerSeasonLabel = '';
    let closerFallbackNote = '';

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const bdlTeamId = await resolveBdlTeamId(team);
      if (!bdlTeamId) {
        lines.push(`${teamName}: Unable to resolve team ID`);
        continue;
      }

      try {
        const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
        if (result.isFallback) {
          closerSeasonLabel = ` (${result.season} season)`;
          closerFallbackNote = ' (prior season data — current season not yet started)';
        }
        // A reliever = zero starts (Jul 30; the old ip<50 heuristic misfiled
        // low-IP starters and dropped late-season setup workhorses). Saves,
        // then holds, then innings — high-leverage arms, not just save totals.
        // EVERY ARM (founder GO, Aug 6 eve: "each member of the bullpen laid
        // out") — the old top-4 cap hid the middle relief that owns innings
        // 5-7 when a starter exits early. High-leverage arms still sort first.
        const rows = (result.stats || [])
          .filter(s => s.pitching_ip > 0 && (s.pitching_gs || 0) === 0 && s.pitching_era != null)
          // Membership floor (same small-sample honesty as the >=20 AB hitter
          // gate): 3+ IP or any save/hold — a position player's mop-up inning
          // is not a pen arm (live catch: a catcher at 18.00 in 1.0 IP).
          .filter(s => (Number(s.pitching_ip) || 0) >= 3 || (s.pitching_sv || 0) > 0 || (s.pitching_hld || 0) > 0);

        // ONE ROW PER ARM (Aug 12): BDL season stats return one row per team
        // STINT, so a midseason acquisition printed twice with two partial
        // lines (live catch: Jack Anderson ×2 on the Aug 12 desk). Merge by
        // folded name — outs-weighted ERA/WHIP, counting stats summed.
        const byArm = new Map();
        for (const s of rows) {
          const nm = s.player?.full_name || s.player?.last_name || 'Unknown';
          const key = foldName(nm);
          const ipn = Number(s.pitching_ip) || 0;
          const outs = Math.floor(ipn) * 3 + Math.round((ipn % 1) * 10);
          const acc = byArm.get(key) || { name: nm, outs: 0, er: 0, whipOuts: 0, sv: 0, hld: 0, k: 0, bb: 0 };
          acc.outs += outs;
          acc.er += ((Number(s.pitching_era) || 0) * outs) / 27;
          acc.whipOuts += (Number(s.pitching_whip) || 0) * outs;
          acc.sv += s.pitching_sv || 0;
          acc.hld += s.pitching_hld || 0;
          acc.k += s.pitching_k || 0;
          acc.bb += s.pitching_bb || 0;
          byArm.set(key, acc);
        }
        const merged = [...byArm.values()].sort((a, b) => b.sv - a.sv || b.hld - a.hld || b.outs - a.outs);

        const rosterFolds = await currentRosterFolds(teamName);
        // TONIGHT'S PEN ONLY (founder, Aug 12: "of course we shouldn't be
        // showing Gary people who are not on the team"): with the roster
        // known, departed arms drop from the print entirely. If filtering
        // would empty the list (roster/stats disagree badly), fall back to
        // the full list with gone-tags — never print an empty pen over a
        // data mismatch. Unknown roster keeps everyone untagged, as before.
        const onRoster = rosterFolds ? merged.filter(a => rosterFolds.has(foldName(a.name))) : merged;
        const rosterFiltered = Boolean(rosterFolds) && onRoster.length > 0;
        let relievers = rosterFiltered ? onRoster : merged;

        if (relievers.length > 0) {
          usedBdl = true;
          // TEAM-LABELED (Aug 12): the desk renders home + away values back
          // to back, so unheadered arm lines read as ONE anonymous list —
          // Gary couldn't tell whose pen was whose (the Orioles-Twins miss).
          lines.push(`${teamName} pen${rosterFiltered ? ' (current roster)' : ''}:`);
          // HANDEDNESS + SEASON USAGE PATTERN (founder GO, Aug 18): the arm's
          // throwing side and the manager's actual rules for him — how often
          // he works back-to-back days, his pitch loads, multi-inning use —
          // from the official game log. Facts only; availability is the
          // brain's read off these plus the recent-workload ledger.
          const idByFold = await currentRosterIdsByFold(teamName).catch(() => null);
          // Position players out of the pen (Aug 19, the Straw case): when
          // the roster knows who the actual pitchers are, only they list.
          // Fail-open — an unknown roster excludes no one.
          if (idByFold?.pitcherFolds) {
            relievers = relievers.filter((a) => idByFold.pitcherFolds.has(foldName(a.name)));
          }
          const armIds = idByFold ? relievers.map((a) => idByFold.get(foldName(a.name))).filter((id) => id != null) : [];
          const hands = armIds.length ? await getMlbPeopleHands(armIds).catch(() => new Map()) : new Map();
          const usageByFold = new Map();
          if (idByFold) {
            await Promise.all(relievers.map(async (a) => {
              const mid = idByFold.get(foldName(a.name));
              if (mid == null) return;
              try {
                const log = await getPitcherGameLogRaw(mid, currentYear);
                const pattern = computeRelieverUsagePattern(log);
                if (pattern) usageByFold.set(foldName(a.name), pattern);
              } catch { /* usage line is additive */ }
            }));
          }
          for (const a of relievers) {
            const era = a.outs > 0 ? ((a.er * 27) / a.outs).toFixed(2) : '—';
            const whip = a.outs > 0 ? (a.whipOuts / a.outs).toFixed(2) : '—';
            const ip = `${Math.floor(a.outs / 3)}.${a.outs % 3}`;
            const mid = idByFold ? idByFold.get(foldName(a.name)) : null;
            const throwsC = mid != null ? hands.get(mid)?.throw : null;
            // Short-sample honesty (founder GO, Aug 19 — same law as the
            // starters): a 3.2-IP arm's 9.82 ERA is a sample, not a season.
            const tiny = a.outs > 0 && a.outs < 30
              ? ` — every rate here rests on ${ip} IP`
              : '';
            lines.push(`  ${a.name}${throwsC ? ` (${throwsC}HP)` : ''}: ${a.sv} SV, ${a.hld} HLD, ${era} ERA, ${whip} WHIP, ${a.k} K, ${a.bb} BB in ${ip} IP${tiny}${rosterFiltered ? '' : goneTag(rosterFolds, a.name)}`);
            const usage = usageByFold.get(foldName(a.name));
            if (usage) lines.push(`    Usage (season): ${usage}`);
          }
          // THE PEN AS A UNIT (founder GO, Aug 6 eve: "the overall bullpen
          // stats too") — season aggregate over the arms printed above (the
          // roster filter already excluded departed innings when known).
          let uOuts = 0, uEr = 0, uWhipOuts = 0;
          for (const a of relievers) {
            if (a.outs <= 0) continue;
            uOuts += a.outs;
            uEr += a.er;
            uWhipOuts += a.whipOuts;
          }
          if (uOuts > 0) {
            lines.push(`${teamName} pen as a unit (${rosterFiltered ? 'current arms, ' : ''}season): ${((uEr * 27) / uOuts).toFixed(2)} ERA, ${(uWhipOuts / uOuts).toFixed(2)} WHIP over ${Math.floor(uOuts / 3)}.${uOuts % 3} IP`);
          }
          continue;
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] BDL closer/reliever stats failed for ${teamName}:`, e.message);
      }

      // No BDL data — return clean no-data instead of expensive Grounding
      lines.push(`${teamName}: No 2026 closer/reliever data available yet (season may not have started)`);
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Closer & key reliever stats for ${awayTeam} @ ${homeTeam}${closerFallbackNote}`,
      source: usedBdl ? `BDL API${closerSeasonLabel}` : 'BDL (no data)',
    };
  },

  MLB_CATCHER_DEFENSE: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;
    let catcherSeasonLabel = '';
    let catcherFallbackNote = '';

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const bdlTeamId = await resolveBdlTeamId(team);
      if (!bdlTeamId) {
        lines.push(`${teamName}: Unable to resolve team ID`);
        continue;
      }

      try {
        const result = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
        if (result.isFallback) {
          catcherSeasonLabel = ` (${result.season} season)`;
          catcherFallbackNote = ' (prior season data — current season not yet started)';
        }
        // Filter to catchers by position
        const catchers = (result.stats || []).filter(s => {
          const pos = (s.player?.position || '').toLowerCase();
          return pos.includes('catcher') || pos === 'c';
        });

        if (catchers.length > 0) {
          usedBdl = true;
          // RUNNING GAME ONLY (founder, Aug 5 PM: "we definitely do not need
          // catcher framing and all that. Stolen base is fine"). Batting lines
          // duplicated the lineup surfaces; framing/PB/WAR were micro. What
          // survives is the fact a fan holds: can you run on this catcher.
          for (const c of catchers) {
            const name = c.player?.full_name || c.player?.last_name || 'Unknown';
            const cs = c.fielding_cs ?? c.catching_cs ?? '—';
            const sba = c.fielding_sba ?? c.catching_sba ?? '—';
            lines.push(`${name}: ${cs} caught of ${sba} steal attempts`);
          }
          continue;
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] BDL catcher defense failed for ${teamName}:`, e.message);
      }

      // No BDL data — return clean no-data instead of expensive Grounding
      lines.push(`${teamName}: No 2026 catcher defense data available yet (season may not have started)`);
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Catcher defense & batting for ${awayTeam} @ ${homeTeam}${catcherFallbackNote}`,
      source: usedBdl ? `BDL API${catcherSeasonLabel}` : 'BDL (no data)',
    };
  },

  MLB_RISP_SITUATIONAL: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;
    let rispSeasonLabel = '';
    let rispFallbackNote = '';

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const bdlTeamId = await resolveBdlTeamId(team);
      if (!bdlTeamId) {
        lines.push(`${teamName}: Unable to resolve team ID`);
        continue;
      }

      try {
        // Get top hitters (with prior-season fallback), then fetch splits for situational data
        const seasonResult = await fetchSeasonStatsWithFallback({ teamId: bdlTeamId, season: currentYear });
        const effectiveSeason = seasonResult.season;
        if (seasonResult.isFallback) {
          rispSeasonLabel = ` (${seasonResult.season} season)`;
          rispFallbackNote = ' (prior season data — current season not yet started)';
        }
        const topHitters = (seasonResult.stats || [])
          // Real batting sample, not "has never pitched" (Jul 30): the old
          // `!s.pitching_era` clause erased a two-way player's BAT entirely
          // (the Ohtani class), while a pitcher's fluke 1-for-2 could top an
          // OPS sort. >= 20 AB keeps April regulars and kills both.
          .filter(s => (s.batting_ops > 0 || s.batting_avg > 0) && (s.batting_ab || 0) >= 20)
          .sort((a, b) => (b.batting_ops || 0) - (a.batting_ops || 0))
          .slice(0, 4);

        if (topHitters.length === 0) {
          lines.push(`${teamName}: No hitter data available for RISP`);
          continue;
        }

        let hasAnyRispData = false;
        for (const hitter of topHitters) {
          const playerId = hitter.player?.id;
          const name = hitter.player?.full_name || hitter.player?.last_name || 'Unknown';
          if (!playerId) continue;

          const splitsResult = await fetchSplitsWithFallback(playerId, effectiveSeason);
          const splits = splitsResult.splits;
          if (!splits?.bySituation || !Array.isArray(splits.bySituation)) continue;

          // Extract situational splits: RISP, Runners On, None On, Bases Loaded
          // BDL splits use flat field names (avg, ops, home_runs, rbis, at_bats, split_name)
          const situational = splits.bySituation.filter(s => {
            const label = (s.split_name || s.split_abbreviation || '').toLowerCase();
            return label.includes('scoring position') || label.includes('runners on') ||
                   label.includes('none on') || label.includes('bases loaded') ||
                   label.includes('risp');
          });

          if (situational.length > 0) {
            hasAnyRispData = true;
            usedBdl = true;
            lines.push(`--- ${name} ---`);
            for (const s of situational) {
              const label = s.split_name || s.split_abbreviation || 'Unknown';
              const avg = s.avg != null ? Number(s.avg).toFixed(3) : '—';
              const ops = s.ops != null ? Number(s.ops).toFixed(3) : '—';
              const hr = s.home_runs ?? '—';
              const rbi = s.rbis ?? '—';
              const ab = s.at_bats ?? '—';
              lines.push(`  ${label}: ${avg} AVG, ${ops} OPS, ${hr} HR, ${rbi} RBI (${ab} AB)`);
            }
          }
        }

        if (hasAnyRispData) continue;
      } catch (e) {
        console.warn(`[MLB Fetchers] BDL RISP/situational failed for ${teamName}:`, e.message);
      }

      // No BDL data — return clean no-data instead of expensive Grounding
      lines.push(`${teamName}: No 2026 RISP/situational data available yet (season may not have started)`);
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `RISP & situational hitting for ${awayTeam} @ ${homeTeam}${rispFallbackNote}`,
      source: usedBdl ? `BDL API (splits)${rispSeasonLabel}` : 'BDL (no data)',
    };
  },

  MLB_TEAM_DEFENSE: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;
    let defenseSeasonLabel = '';
    let defenseFallbackNote = '';

    for (const [team, teamName, lines] of [[home, homeTeam, homeLines], [away, awayTeam, awayLines]]) {
      const bdlTeamId = await resolveBdlTeamId(team);
      if (!bdlTeamId) {
        lines.push(`${teamName}: Unable to resolve team ID`);
        continue;
      }

      try {
        const result = await fetchTeamStatsWithFallback(bdlTeamId, currentYear);
        if (result.isFallback) {
          defenseSeasonLabel = ` (${result.season} season)`;
          defenseFallbackNote = ' (prior season data — current season not yet started)';
        }
        const teamStats = result.stats;
        if (teamStats && typeof teamStats === 'object' && Object.keys(teamStats).length > 0) {
          usedBdl = true;
          // Fielding stats
          const errors = teamStats.fielding_e ?? teamStats.errors ?? '—';
          const fp = teamStats.fielding_fp != null ? teamStats.fielding_fp.toFixed(3) : (teamStats.fielding_pct != null ? teamStats.fielding_pct.toFixed(3) : '—');
          const tc = teamStats.fielding_tc ?? '—';
          // Pitching stats that reflect defense
          const era = teamStats.pitching_era != null ? teamStats.pitching_era.toFixed(2) : '—';
          const whip = teamStats.pitching_whip != null ? teamStats.pitching_whip.toFixed(2) : '—';
          // Additional defense indicators
          const dp = teamStats.fielding_dp ?? teamStats.double_plays ?? '—';
          const gp = teamStats.gp ?? teamStats.games_played ?? '—';

          lines.push(`${teamName} (${gp} GP):`);
          lines.push(`  Fielding: ${errors} E, ${fp} FPCT, ${tc} TC, ${dp} DP`);
          lines.push(`  Team Pitching: ${era} ERA, ${whip} WHIP`);
          // DEFENSE RIGHT NOW (founder GO, Aug 12 — defense was the desk's
          // thinnest area: a season fielding percentage is the one number
          // that never moves). The last 7 games from official boxscores:
          // errors, and the runs the glove actually cost (runs minus earned
          // runs) — a team kicking it around this week is a fact a fan holds
          // and the season rate hides. Fail-open per game.
          try {
            const mlbTeam = await findMlbTeamByName(teamName);
            if (mlbTeam?.id) {
              const recent = await getMlbRecentGames(mlbTeam.id, 7);
              let e = 0, unearned = 0, counted = 0;
              for (const g of (recent || [])) {
                const box = await getGameBoxScore(g.gamePk).catch(() => null);
                if (!box?.teams) continue;
                const sideKey = box.teams.home?.team?.id === mlbTeam.id ? 'home' : 'away';
                const st = box.teams[sideKey]?.teamStats;
                if (!st) continue;
                e += Number(st.fielding?.errors) || 0;
                const r = Number(st.pitching?.runs);
                const er2 = Number(st.pitching?.earnedRuns);
                if (Number.isFinite(r) && Number.isFinite(er2)) unearned += Math.max(0, r - er2);
                counted += 1;
              }
              if (counted >= 3) {
                lines.push(`  Last ${counted} games: ${e} error${e === 1 ? '' : 's'}, ${unearned} unearned run${unearned === 1 ? '' : 's'} allowed`);
              }
            }
          } catch { /* recent-defense is additive — never sink the section */ }
          continue;
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] BDL team defense failed for ${teamName}:`, e.message);
      }

      // No BDL data — return clean no-data instead of expensive Grounding
      lines.push(`${teamName}: No 2026 team defense data available yet (season may not have started)`);
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Team defense & fielding for ${awayTeam} @ ${homeTeam}${defenseFallbackNote}`,
      source: usedBdl ? `BDL API${defenseSeasonLabel}` : 'BDL (no data)',
    };
  },

  // ═══════════════════════════════════════════════════════════════════
  // STATCAST — CONTACT QUALITY (exit velocity, barrel rate, hard hit)
  // Uses BDL /mlb/v1/plate_appearances endpoint (pitch-level Statcast)
  // ═══════════════════════════════════════════════════════════════════

  MLB_STATCAST: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const homeLines = [];
    const awayLines = [];
    let usedApi = false;

    // Helper: compute Statcast aggregates from plate appearances
    function computeStatcast(pas, teamBattingHalf) {
      const evs = [];
      let barrels = 0;
      let totalBIP = 0;
      for (const pa of pas) {
        if (pa.half_inning !== teamBattingHalf) continue;
        const pitches = pa.pitches || [];
        const last = pitches[pitches.length - 1];
        if (!last?.exit_velocity) continue;
        totalBIP++;
        evs.push(last.exit_velocity);
        if (last.is_barrel === true) barrels++;
      }
      if (totalBIP === 0) return null;
      const avgEV = evs.reduce((a, b) => a + b, 0) / evs.length;
      const hardHits = evs.filter(v => v >= 95).length;
      return {
        avgEV: avgEV.toFixed(1),
        hardHitPct: ((hardHits / totalBIP) * 100).toFixed(1),
        barrelPct: ((barrels / totalBIP) * 100).toFixed(1),
        bip: totalBIP
      };
    }

    for (const [team, teamName, lines, isHomeTeam] of [
      [home, homeTeam, homeLines, true],
      [away, awayTeam, awayLines, false]
    ]) {
      const bdlTeamId = await resolveBdlTeamId(team);
      if (!bdlTeamId) { lines.push(`${teamName}: Unable to resolve team`); continue; }

      try {
        // Get last 5 days of games for this team
        const dates = [];
        for (let i = 1; i <= 7; i++) {
          const d = new Date(); d.setDate(d.getDate() - i);
          dates.push(d.toISOString().slice(0, 10));
        }
        const teamGames = await ballDontLieService.getGames('baseball_mlb', {
          team_ids: [bdlTeamId], dates, per_page: 50
        }).catch(() => []);

        const finished = (teamGames || [])
          .filter(g => g.status === 'STATUS_FINAL')
          .sort((a, b) => (b.id || 0) - (a.id || 0))
          .slice(0, 3);

        if (finished.length === 0) {
          lines.push(`${teamName}: No recent completed games for Statcast`);
          continue;
        }

        // Fetch plate appearances for up to 3 recent games
        const allPAs = [];
        for (const game of finished) {
          const gamePAs = await ballDontLieService.getMlbPlateAppearances(game.id).catch(() => []);
          // Determine which half_inning is this team's batting
          const isTeamHome = game.home_team?.id === bdlTeamId;
          const battingHalf = isTeamHome ? 'bottom' : 'top';
          for (const pa of gamePAs) {
            pa._teamBattingHalf = battingHalf;
          }
          allPAs.push(...gamePAs);
        }

        if (allPAs.length === 0) {
          lines.push(`${teamName}: No plate appearance data available`);
          continue;
        }

        // Two aggregations from BDL plate-appearance Statcast:
        // (1) BIP-level — last pitch of each PA that produced a ball in play.
        //     Extracts the full Statcast surface (xwOBA, xSLG, xBA, launch
        //     angle, bat speed, barrel) not just exit velocity. xwOBA is the
        //     headline regression-aware contact metric — much more predictive
        //     than raw wOBA or BA, and the metric sharp MLB bettors actually use.
        // (2) Pitch-level — every pitch in the team's batting PAs, used to
        //     compute swing decisions (whiff rate, chase rate). Predictive for
        //     strikeout props and pitcher matchup quality.
        const bipPitches = [];
        let pitchTotal = 0, swings = 0, whiffs = 0, oozPitches = 0, chases = 0;
        for (const pa of allPAs) {
          if (pa.half_inning !== pa._teamBattingHalf) continue;
          const pitches = pa.pitches || [];
          for (const p of pitches) {
            pitchTotal++;
            if (p.is_swing === true) swings++;
            if (p.is_whiff === true) whiffs++;
            if (p.is_in_zone === false) {
              oozPitches++;
              if (p.is_chase === true) chases++;
            }
          }
          const last = pitches[pitches.length - 1];
          if (last && last.exit_velocity != null) bipPitches.push(last);
        }

        if (bipPitches.length === 0) {
          lines.push(`${teamName}: No Statcast contact data from recent games`);
          continue;
        }

        usedApi = true;
        const nums = (arr, key) => arr.map(p => p[key]).filter(v => v != null && Number.isFinite(Number(v))).map(Number);
        const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
        const fmt = (v, d = 1) => v != null ? v.toFixed(d) : '—';
        const pct = (num, den) => den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—';

        const evs = nums(bipPitches, 'exit_velocity');
        const las = nums(bipPitches, 'launch_angle');
        const xwobas = nums(bipPitches, 'expected_woba');
        const xslgs = nums(bipPitches, 'expected_slugging');
        const xbas = nums(bipPitches, 'expected_batting_average');
        const batSpeeds = nums(bipPitches, 'bat_speed');
        const barrels = bipPitches.filter(p => p.is_barrel === true).length;
        const hardHits = evs.filter(v => v >= 95).length;
        const sweetSpot = las.filter(la => la >= 8 && la <= 32).length;
        const maxEV = evs.length ? Math.max(...evs) : null;

        lines.push(`${teamName} (last ${finished.length} games, ${bipPitches.length} BIP, ${pitchTotal} pitches):`);
        lines.push(`  Exit Velo: avg ${fmt(avg(evs))} mph, max ${fmt(maxEV)} mph, hard-hit ${pct(hardHits, evs.length)}`);
        if (las.length) lines.push(`  Launch Angle: avg ${fmt(avg(las))}°, sweet-spot (8–32°) ${pct(sweetSpot, las.length)}`);
        if (xwobas.length || xslgs.length || xbas.length) {
          lines.push(`  Expected: ${fmt(avg(xwobas), 3)} xwOBA, ${fmt(avg(xslgs), 3)} xSLG, ${fmt(avg(xbas), 3)} xBA`);
        }
        lines.push(`  Barrels: ${pct(barrels, bipPitches.length)}`);
        if (batSpeeds.length) lines.push(`  Bat Speed: avg ${fmt(avg(batSpeeds))} mph`);
        if (swings > 0 || oozPitches > 0) {
          lines.push(`  Plate discipline: whiff ${pct(whiffs, swings)}, chase ${pct(chases, oozPitches)}`);
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] Statcast fetch failed for ${teamName}:`, e.message);
        lines.push(`${teamName}: Statcast data unavailable`);
      }
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Statcast contact quality (last 3 games) for ${awayTeam} @ ${homeTeam}`,
      source: usedApi ? 'BDL API (Statcast plate appearances)' : 'BDL (no data)',
    };
  },

  // Default handler
  // DEFAULT removed Jul 6 2026 — the neutral unknown-token handler lives in
  // statRouters/index.js (per-sport DEFAULTs collided in the merged map).
};
