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
  getTeamRoster,
  getPlayerCareerStats,
  getPlayerSeasonStats,
  searchPlayer,
  getConfirmedLineups,
  getProbablePitchers,
} from '../../../mlbStatsApiService.js';
import { ballDontLieService } from '../../../ballDontLieService.js';
import { geminiGroundingSearch } from '../../scoutReport/shared/grounding.js';

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
  'Oakland Coliseum': { type: 'pitcher', factor: 0.93, notes: 'Vast foul territory, marine air. Pitcher-friendly.', teams: ['Oakland Athletics'] },
};

// Helper: find park data by venue name or home team name
function findParkData(venueName, homeTeamName) {
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

// Helper: format player career hitting stats
function formatHittingStats(stats, name) {
  if (!stats) return `${name}: Career stats unavailable`;
  return `${name}: .${Math.round((stats.avg || 0) * 1000)} AVG, ${stats.homeRuns || 0} HR, ${stats.rbi || 0} RBI, .${Math.round((stats.ops || 0) * 1000)} OPS (MLB career: ${stats.gamesPlayed || 0} GP)`;
}

function formatPitchingStats(stats, name) {
  if (!stats) return `${name}: Career stats unavailable`;
  return `${name}: ${stats.wins || 0}-${stats.losses || 0}, ${stats.era || '—'} ERA, ${stats.whip || '—'} WHIP, ${stats.strikeOuts || 0} K in ${stats.inningsPitched || 0} IP`;
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
                const pitcherLower = name.toLowerCase();
                const match = (result.stats || []).find(s => {
                  const n = (s.player?.full_name || s.player?.last_name || '').toLowerCase();
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
        const relievers = (result.stats || [])
          .filter(s => s.pitching_ip > 0 && (
            (s.pitching_sv != null && s.pitching_sv > 0) ||
            (s.pitching_hld != null && s.pitching_hld > 0) ||
            (s.pitching_ip < 50 && s.pitching_era != null)
          ))
          .sort((a, b) => (b.pitching_sv || 0) - (a.pitching_sv || 0))
          .slice(0, 5);

        if (relievers.length > 0) {
          usedApi = true;
          lines.push(`${teamName} Key Relievers:`);
          for (const r of relievers) {
            const name = r.player?.full_name || r.player?.last_name || 'Unknown';
            lines.push(`  ${name}: ${r.pitching_sv ?? 0} SV, ${r.pitching_hld ?? 0} HLD, ${r.pitching_era?.toFixed(2) ?? '—'} ERA, ${r.pitching_ip?.toFixed(1) ?? '—'} IP`);
          }
        }

        // Get recent workload from last 3 games
        const mlbTeam = await findMlbTeamByName(team.full_name || team.name);
        if (mlbTeam) {
          const recentGames = await getMlbRecentGames(mlbTeam.id, 3).catch(() => []);
          if (recentGames.length > 0) {
            const gameIds = recentGames.map(g => g.gamePk).filter(Boolean);
            if (gameIds.length > 0) {
              const gameStats = await ballDontLieService.getMlbGameStats({ gameIds }).catch(() => []);
              if (gameStats.length > 0) {
                usedApi = true;
                lines.push(`  Recent Workload (last ${recentGames.length} games):`);
                // Group by game
                const byGame = {};
                for (const s of gameStats) {
                  const gId = s.game?.id || s.game_id;
                  if (!gId) continue;
                  if (s.pitching_ip > 0 && s.pitching_ip < 5) { // Relievers typically pitch < 5 IP
                    if (!byGame[gId]) byGame[gId] = [];
                    const name = s.player?.full_name || s.player?.last_name || 'Unknown';
                    byGame[gId].push(`${name} ${s.pitching_ip?.toFixed(1) || '?'} IP`);
                  }
                }
                for (const [gId, pitchers] of Object.entries(byGame)) {
                  const game = recentGames.find(g => String(g.gamePk) === String(gId));
                  const date = game ? (game.gameDate || '').split('T')[0] : gId;
                  lines.push(`    ${date}: ${pitchers.join(', ')}`);
                }
              }
            }
          }
        }

        if (usedApi) continue;
      } catch (e) {
        console.warn(`[MLB Fetchers] Bullpen API data failed for ${teamName}:`, e.message);
      }

      lines.push(`${teamName}: See MLB_CLOSER_RELIEVER_STATS and MLB_BULLPEN_WORKLOAD for detailed bullpen data`);
    }

    // Minimal Grounding call for day-of bullpen news only
    let newsNote = '';
    try {
      const news = await geminiGroundingSearch(
        `${awayTeam} vs ${homeTeam} MLB bullpen news closer availability update today`
      );
      if (news && news.length > 20) newsNote = `\n\nDay-of Bullpen News: ${news}`;
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
            .filter(s => (s.batting_ops > 0 || s.batting_avg > 0) && !s.pitching_era)
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

      // Fallback: legacy MLB Stats API roster + career stats
      const mlbTeam = await findMlbTeamByName(team.full_name || team.name);
      if (mlbTeam) {
        const roster = await getTeamRoster(mlbTeam.id).catch(() => []);
        const rosterHitters = roster.filter(p => p.positionType !== 'Pitcher').slice(0, 5);
        let hasAnyMLBStats = false;
        for (const h of rosterHitters) {
          const career = await getPlayerCareerStats(h.id, 'hitting').catch(() => null);
          if (career) hasAnyMLBStats = true;
          lines.push(formatHittingStats(career, h.name));
        }
        if (hasAnyMLBStats) continue;
      }

      // No BDL or MLB Stats data — return clean no-data instead of expensive Grounding
      lines.push(`${teamName}: No 2026 season data available yet (season may not have started)`);
    }
    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Key hitters (season stats, sorted by OPS)${fallbackNote}`,
      source: usedBdl ? `BDL API${seasonLabel}` : 'MLB Stats API (no season data yet)',
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

    // PRIMARY: BDL lineups API (available pre-game, includes handedness)
    if (gameId) {
      try {
        const bdlLineups = await ballDontLieService.getMlbLineups(gameId);
        if (bdlLineups) {
          // Match home/away by abbreviation
          const homeData = bdlLineups[homeAbbr] || Object.values(bdlLineups).find(t => t.teamName?.includes(home.name));
          const awayData = bdlLineups[awayAbbr] || Object.values(bdlLineups).find(t => t.teamName?.includes(away.name));
          if ((homeData?.batters?.length > 0) || (awayData?.batters?.length > 0)) {
            return {
              homeValue: formatBdlLineup(homeData, homeTeam),
              awayValue: formatBdlLineup(awayData, awayTeam),
              comparison: `Pre-game lineups with batting order + handedness for ${awayTeam} @ ${homeTeam}`,
              source: 'BDL API (pre-game lineups)',
            };
          }
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] BDL lineups failed for game ${gameId}: ${e.message}`);
      }
    }

    // No fallback — BDL is the only pre-game lineup source. If it's empty, lineups aren't posted yet.
    console.warn(`[MLB Fetchers] ⚠️ No lineup data from BDL for ${awayTeam} @ ${homeTeam} (gameId: ${gameId})`);
    return {
      homeValue: `${homeTeam}: Lineup not yet available (check closer to game time)`,
      awayValue: `${awayTeam}: Lineup not yet available (check closer to game time)`,
      comparison: `Lineups not yet posted for ${awayTeam} @ ${homeTeam}`,
      source: 'No data (BDL + MLB Stats API both empty)',
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
    const gameId = options?.game?.bdlGameId || options?.game?.gamePk || options?.game?.id;

    if (gameId) {
      try {
        const odds = await ballDontLieService.getMlbGameOdds({ gameIds: [gameId] });
        if (odds && odds.length > 0) {
          const lines = [];
          for (const bookOdds of odds) {
            const book = bookOdds.sportsbook || bookOdds.book || 'Unknown';
            const ml = bookOdds.moneyline || bookOdds.ml || {};
            const rl = bookOdds.spread || bookOdds.run_line || {};
            const ou = bookOdds.total || bookOdds.over_under || {};

            const homeML = ml.home ?? ml.home_odds ?? '—';
            const awayML = ml.away ?? ml.away_odds ?? '—';
            const homeRL = rl.home_spread ?? rl.home ?? '—';
            const awayRL = rl.away_spread ?? rl.away ?? '—';
            const total = ou.total ?? ou.line ?? '—';
            const overPrice = ou.over ?? ou.over_odds ?? '—';
            const underPrice = ou.under ?? ou.under_odds ?? '—';

            lines.push(`${book}: ML ${awayTeam} ${awayML} / ${homeTeam} ${homeML} | RL ${awayRL}/${homeRL} | O/U ${total} (O ${overPrice} / U ${underPrice})`);
          }

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

    // Try by today's date if no gameId
    try {
      const today = new Date().toISOString().split('T')[0];
      const odds = await ballDontLieService.getMlbGameOdds({ dates: [today] });
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
          const lines = [];
          for (const bookOdds of gameOdds) {
            const book = bookOdds.sportsbook || bookOdds.book || 'Unknown';
            const ml = bookOdds.moneyline || bookOdds.ml || {};
            const rl = bookOdds.spread || bookOdds.run_line || {};
            const ou = bookOdds.total || bookOdds.over_under || {};

            const homeML = ml.home ?? ml.home_odds ?? '—';
            const awayML = ml.away ?? ml.away_odds ?? '—';
            const total = ou.total ?? ou.line ?? '—';

            lines.push(`${book}: ML ${awayTeam} ${awayML} / ${homeTeam} ${homeML} | O/U ${total}`);
          }

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
        homeValue: 'See scout report INJURIES section (BDL structured data with NEW/KNOWN labels)',
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
    const currentYear = new Date().getFullYear();
    const result = await geminiGroundingSearch(
      `${awayTeam} vs ${homeTeam} MLB head to head season series record ${currentYear}`
    );
    return {
      homeValue: result || 'No H2H data found',
      awayValue: '',
      comparison: `MLB H2H season series: ${awayTeam} vs ${homeTeam}`,
      source: 'Gemini Grounding',
    };
  },

  MLB_REST_SITUATION: async (sport, home, away, season, options) => {
    const today = new Date().toISOString().split('T')[0];
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
            // Top 3 hitters by OPS
            const hitters = stats
              .filter(s => (s.batting_ops > 0 || s.batting_avg > 0) && !s.pitching_era)
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

  MLB_GAME_PREVIEW: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const result = await geminiGroundingSearch(
      `${awayTeam} vs ${homeTeam} MLB 2026 game preview prediction analysis today. ` +
      `Include: starting pitcher scouting reports, key matchup advantages, projected lineup, ` +
      `betting projections, expert picks, and any blog or media analysis.`
    );
    return {
      homeValue: result || 'N/A',
      awayValue: result || 'N/A',
      comparison: `Game preview and analysis for ${awayTeam} @ ${homeTeam}`,
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
        const pitcherLower = pitcherName.toLowerCase();
        const match = (seasonResult.stats || []).find(s => {
          const n = (s.player?.full_name || s.player?.last_name || '').toLowerCase();
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

          // Try splits (L/R, home/away, day/night)
          const playerId = match.player?.id;
          if (playerId) {
            try {
              const splitsResult = await fetchSplitsWithFallback(playerId, seasonResult.season);
              const splits = splitsResult.splits;
              if (splits && (splits.byBreakdown?.length > 0 || splits.split?.length > 0)) {
                const breakdowns = splits.byBreakdown || splits.split || [];
                if (breakdowns.length > 0) {
                  lines.push(`Splits:`);
                  for (const b of breakdowns) {
                    const splitLabel = b.breakdown || b.name || 'Unknown';
                    const era = b.pitching_era != null ? b.pitching_era.toFixed(2) : (b.batting_avg != null ? `${b.batting_avg.toFixed(3)} opp AVG` : '—');
                    const ops = b.batting_ops != null ? b.batting_ops.toFixed(3) : '—';
                    lines.push(`  ${splitLabel}: ${era} ERA, ${ops} opp OPS`);
                  }
                }
              }
            } catch (_) { /* Splits optional */ }

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
                  lines.push(`vs ${opposingName} hitters:`);
                  for (const m of bvp.slice(0, 5)) {
                    const batter = m.opponent_player?.full_name || m.opponent_player?.last_name || 'Unknown';
                    const avg = m.avg != null ? (typeof m.avg === 'number' ? m.avg.toFixed(3) : m.avg) : '—';
                    const ab = m.at_bats ?? m.ab ?? '—';
                    const hr = m.hr ?? '—';
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
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const result = await geminiGroundingSearch(
      `${homeTeam} ${awayTeam} MLB 2026 recent form results performance last 10 games. ` +
      `How has each team played recently? Key performers, momentum, ` +
      `offensive and pitching performance, winning or losing streaks.`
    );
    return {
      homeValue: result || 'N/A',
      awayValue: result || 'N/A',
      comparison: `Recent season form for ${homeTeam} and ${awayTeam}`,
      source: 'Gemini Grounding',
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
          const pitcherLower = pitcherName.toLowerCase();
          const match = pitchers.find(p => {
            const n = (p.player?.full_name || p.player?.last_name || '').toLowerCase();
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
            const ip = parseFloat(stats.inningsPitched) || 1;
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
          const pitcherLower = pitcherName.toLowerCase();
          const match = (result.stats || []).find(s => {
            const n = (s.player?.full_name || s.player?.last_name || '').toLowerCase();
            return (n.includes(pitcherLower) || pitcherLower.includes(n)) && s.pitching_ip > 0;
          });
          if (match?.player?.id) pitcherId = match.player.id;
        } catch (_) { /* Will try game stats below */ }
      }

      if (pitcherId) {
        try {
          // Get pitcher's game-by-game stats from BDL
          const gameStats = await ballDontLieService.getMlbGameStats({
            playerIds: [pitcherId],
            seasons: [currentYear],
          }).catch(() => []);

          // Filter to starts (pitcher with IP >= 3 likely a start)
          let starts = gameStats
            .filter(s => s.pitching_ip >= 3)
            .sort((a, b) => {
              const dateA = a.game?.date || a.date || '';
              const dateB = b.game?.date || b.date || '';
              return dateB.localeCompare(dateA);
            })
            .slice(0, 5);

          // If current season empty, try prior season
          if (starts.length === 0) {
            const priorStats = await ballDontLieService.getMlbGameStats({
              playerIds: [pitcherId],
              seasons: [currentYear - 1],
            }).catch(() => []);

            starts = priorStats
              .filter(s => s.pitching_ip >= 3)
              .sort((a, b) => {
                const dateA = a.game?.date || a.date || '';
                const dateB = b.game?.date || b.date || '';
                return dateB.localeCompare(dateA);
              })
              .slice(0, 5);

            if (starts.length > 0) {
              lines.push(`${pitcherName} — Last 5 starts (${currentYear - 1} season):`);
            }
          } else {
            lines.push(`${pitcherName} — Last ${starts.length} starts:`);
          }

          if (starts.length > 0) {
            usedApi = true;
            for (const s of starts) {
              const date = (s.game?.date || s.date || '').split('T')[0];
              const opp = s.game?.opponent?.full_name || s.game?.opponent?.name || '—';
              const ip = s.pitching_ip?.toFixed(1) ?? '—';
              const h = s.pitching_h ?? '—';
              const er = s.pitching_er ?? '—';
              const k = s.pitching_k ?? '—';
              const bb = s.pitching_bb ?? '—';
              lines.push(`  ${date} vs ${opp}: ${ip} IP, ${h} H, ${er} ER, ${k} K, ${bb} BB`);
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
          const pitcherLower = pitcherName.toLowerCase();
          const match = (result.stats || []).find(s => {
            const n = (s.player?.full_name || s.player?.last_name || '').toLowerCase();
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

    // Fallback: Gemini Grounding — kept for team records (critical context)
    const result = await geminiGroundingSearch(
      `${homeTeam} ${awayTeam} MLB ${currentYear} current record wins losses division standings games back wild card position`
    );
    return {
      homeValue: result ? `${result}\n(Note: may reflect 2025 data if 2026 season not yet started)` : 'N/A',
      awayValue: result ? '' : 'N/A',
      comparison: `Current MLB records and standings for ${awayTeam} @ ${homeTeam} (2025 data — 2026 season not yet started)`,
      source: 'Gemini Grounding (fallback — may be stale)',
    };
  },

  MLB_RECENT_FORM: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const result = await geminiGroundingSearch(
      `${homeTeam} ${awayTeam} MLB last 10 games results record scores ${currentYear}. ` +
      `Include win-loss record over last 10, scoring trends, and any streaks.`
    );
    return {
      homeValue: result || 'N/A',
      awayValue: result || 'N/A',
      comparison: `Last 10 games form for ${awayTeam} @ ${homeTeam}`,
      source: 'Gemini Grounding',
    };
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
        homeValue: `${parkData.park} — ${typeLabel} (Factor: ${parkData.factor})\n${parkData.notes}`,
        awayValue: 'N/A (park factor applies to home venue)',
        comparison: `Park factor and venue profile for ${homeTeam} home stadium`,
        source: 'Static MLB Park Data (2024-2026)',
      };
    }

    // No match found — return generic message
    return {
      homeValue: `${homeTeam}: Park data not found for venue "${venueName || 'unknown'}". Check venue name mapping.`,
      awayValue: 'N/A (park factor applies to home venue)',
      comparison: `Park factor and venue profile for ${homeTeam} home stadium`,
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
        const recentGames = await getMlbRecentGames(mlbTeam.id, 3);
        if (!recentGames || recentGames.length === 0) {
          lines.push(`${teamName}: No recent games found`);
          continue;
        }

        const gameIds = recentGames.map(g => g.gamePk).filter(Boolean);
        if (gameIds.length === 0) {
          lines.push(`${teamName}: No game IDs found`);
          continue;
        }

        const gameStats = await ballDontLieService.getMlbGameStats({ gameIds }).catch(() => []);
        if (gameStats.length === 0) {
          lines.push(`${teamName}: No box score data available for recent games`);
          continue;
        }

        usedApi = true;
        // Group reliever appearances by game
        for (const game of recentGames) {
          const date = (game.gameDate || '').split('T')[0];
          const gId = game.gamePk;
          const gamePitchers = gameStats.filter(s => {
            const matchGame = String(s.game?.id || s.game_id) === String(gId);
            // Filter to relievers (pitched < 5 IP in that game, i.e., not the starter)
            return matchGame && s.pitching_ip > 0 && s.pitching_ip < 5;
          });

          if (gamePitchers.length > 0) {
            const pitcherList = gamePitchers.map(s => {
              const name = s.player?.full_name || s.player?.last_name || 'Unknown';
              return `${name} ${s.pitching_ip?.toFixed(1) || '?'} IP`;
            }).join(', ');
            lines.push(`${date}: ${pitcherList}`);
          } else {
            lines.push(`${date}: No reliever data available`);
          }
        }
      } catch (e) {
        console.warn(`[MLB Fetchers] Bullpen workload API failed for ${teamName}:`, e.message);
        // Fallback to Grounding for this team
        try {
          const result = await geminiGroundingSearch(
            `${teamName} MLB bullpen usage last 3 days ${new Date().getFullYear()}`
          );
          if (result) {
            lines.push(result);
            continue;
          }
        } catch (_) { /* Grounding also failed */ }
        lines.push(`${teamName}: Bullpen workload data unavailable`);
      }
    }

    return {
      homeValue: homeLines.join('\n'),
      awayValue: awayLines.join('\n'),
      comparison: `Bullpen workload (last 3 games) for ${awayTeam} @ ${homeTeam}`,
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

    // Fallback: Gemini Grounding — kept for standings (critical context)
    const result = await geminiGroundingSearch(
      `MLB ${currentYear} standings ${homeTeam} ${awayTeam} division American League National League wins losses games back wild card`
    );
    return {
      homeValue: result ? `${result}\n(Note: may reflect 2025 data if 2026 season not yet started)` : 'N/A',
      awayValue: result ? '' : 'N/A',
      comparison: `MLB standings for ${awayTeam} @ ${homeTeam} (2025 data — 2026 season not yet started)`,
      source: 'Gemini Grounding (fallback — may be stale)',
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
          .filter(s => (s.batting_ops > 0 || s.batting_avg > 0) && !s.pitching_era)
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

          // L/R breakdown
          if (splits.byBreakdown && Array.isArray(splits.byBreakdown)) {
            for (const b of splits.byBreakdown) {
              const label = b.breakdown || b.name || 'Unknown';
              const avg = b.batting_avg != null ? b.batting_avg.toFixed(3) : '—';
              const ops = b.batting_ops != null ? b.batting_ops.toFixed(3) : '—';
              const hr = b.batting_hr ?? '—';
              const ab = b.batting_ab ?? '—';
              lines.push(`  ${label}: ${avg} AVG, ${ops} OPS, ${hr} HR (${ab} AB)`);
            }
          }

          // Home/Away (also in byBreakdown typically)
          if (splits.byArena && Array.isArray(splits.byArena)) {
            const topVenues = splits.byArena.slice(0, 3);
            for (const v of topVenues) {
              const venue = v.arena || v.name || 'Unknown';
              const avg = v.batting_avg != null ? v.batting_avg.toFixed(3) : '—';
              const ops = v.batting_ops != null ? v.batting_ops.toFixed(3) : '—';
              lines.push(`  @ ${venue}: ${avg} AVG, ${ops} OPS`);
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
      comparison: `Player splits (L/R, home/away) for ${awayTeam} @ ${homeTeam}${splitsFallbackNote}`,
      source: usedBdl ? `BDL API${splitsSeasonLabel}` : 'BDL (no data)',
    };
  },

  MLB_BATTER_VS_PITCHER: async (sport, home, away, season, options) => {
    const homeTeam = home.full_name || home.name;
    const awayTeam = away.full_name || away.name;
    const currentYear = new Date().getFullYear();
    const homeLines = [];
    const awayLines = [];
    let usedBdl = false;

    // For each team's hitters, look up their history vs the opposing team's pitchers
    for (const [battingTeam, battingName, opposingTeam, opposingName, lines] of [
      [home, homeTeam, away, awayTeam, homeLines],
      [away, awayTeam, home, homeTeam, awayLines],
    ]) {
      const battingTeamId = await resolveBdlTeamId(battingTeam);
      const opposingTeamId = await resolveBdlTeamId(opposingTeam);

      if (!battingTeamId || !opposingTeamId) {
        lines.push(`${battingName}: Unable to resolve team IDs for BvP lookup`);
        continue;
      }

      try {
        // Get top hitters for the batting team (with prior-season fallback for player identification)
        const seasonResult = await fetchSeasonStatsWithFallback({ teamId: battingTeamId, season: currentYear });
        const topHitters = (seasonResult.stats || [])
          .filter(s => (s.batting_ops > 0 || s.batting_avg > 0) && !s.pitching_era)
          .sort((a, b) => (b.batting_ops || 0) - (a.batting_ops || 0))
          .slice(0, 5);

        if (topHitters.length === 0) {
          lines.push(`${battingName}: No hitter data available`);
          continue;
        }

        for (const hitter of topHitters) {
          const playerId = hitter.player?.id;
          const name = hitter.player?.full_name || hitter.player?.last_name || 'Unknown';
          if (!playerId) continue;

          const matchups = await ballDontLieService.getMlbPlayerVsPlayer({ playerId, opponentTeamId: opposingTeamId }).catch(() => []);
          if (!matchups || matchups.length === 0) {
            lines.push(`${name} vs ${opposingName}: No matchup history`);
            continue;
          }

          usedBdl = true;
          lines.push(`--- ${name} vs ${opposingName} pitchers ---`);
          for (const m of matchups) {
            const pitcher = m.opponent_player?.full_name || m.opponent_player?.last_name || 'Unknown P';
            const ab = m.at_bats ?? m.ab ?? '—';
            const hits = m.hits ?? m.h ?? '—';
            const hr = m.hr ?? '—';
            const avg = m.avg != null ? (typeof m.avg === 'number' ? m.avg.toFixed(3) : m.avg) : '—';
            const ops = m.ops != null ? (typeof m.ops === 'number' ? m.ops.toFixed(3) : m.ops) : '—';
            const k = m.strikeouts ?? m.k ?? '—';
            const bb = m.walks ?? m.bb ?? '—';
            lines.push(`  vs ${pitcher}: ${avg} AVG, ${ops} OPS, ${hr} HR, ${k} K, ${bb} BB (${ab} AB, ${hits} H)`);
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
      comparison: `Batter vs pitcher matchup history for ${awayTeam} @ ${homeTeam}`,
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
        // Filter to relievers: pitchers with saves > 0 or holds > 0 or (IP > 0 and no starts/low IP suggesting reliever role)
        const relievers = (result.stats || [])
          .filter(s => s.pitching_ip > 0 && (
            (s.pitching_sv != null && s.pitching_sv > 0) ||
            (s.pitching_hld != null && s.pitching_hld > 0) ||
            (s.pitching_ip < 50 && s.pitching_era != null) // Short IP = likely reliever
          ))
          .sort((a, b) => (b.pitching_sv || 0) - (a.pitching_sv || 0))
          .slice(0, 4);

        if (relievers.length > 0) {
          usedBdl = true;
          for (const r of relievers) {
            const name = r.player?.full_name || r.player?.last_name || 'Unknown';
            const sv = r.pitching_sv ?? 0;
            const hld = r.pitching_hld ?? 0;
            const era = r.pitching_era != null ? r.pitching_era.toFixed(2) : '—';
            const ip = r.pitching_ip != null ? r.pitching_ip.toFixed(1) : '—';
            const k = r.pitching_k ?? '—';
            const whip = r.pitching_whip != null ? r.pitching_whip.toFixed(2) : '—';
            const bb = r.pitching_bb ?? '—';
            lines.push(`${name}: ${sv} SV, ${hld} HLD, ${era} ERA, ${whip} WHIP, ${k} K, ${bb} BB in ${ip} IP`);
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
          for (const c of catchers) {
            const name = c.player?.full_name || c.player?.last_name || 'Unknown';
            // Batting stats
            const avg = c.batting_avg != null ? c.batting_avg.toFixed(3) : '—';
            const ops = c.batting_ops != null ? c.batting_ops.toFixed(3) : '—';
            const hr = c.batting_hr ?? '—';
            // Defensive stats (BDL may include fielding fields)
            const cs = c.fielding_cs ?? c.catching_cs ?? '—';
            const sba = c.fielding_sba ?? c.catching_sba ?? '—';
            const pb = c.fielding_pb ?? c.catching_pb ?? '—';
            const war = c.batting_war != null ? c.batting_war.toFixed(1) : (c.fielding_war != null ? c.fielding_war.toFixed(1) : '—');
            const sb = c.batting_sb ?? '—';

            lines.push(`${name}: ${avg} AVG, ${ops} OPS, ${hr} HR | CS: ${cs}, SBA: ${sba}, PB: ${pb} | WAR: ${war}`);
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
          .filter(s => (s.batting_ops > 0 || s.batting_avg > 0) && !s.pitching_era)
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
          if (!splits || !splits.bySituation || !Array.isArray(splits.bySituation)) continue;

          // Extract situational splits: RISP, Runners On, None On, Bases Loaded
          const situational = splits.bySituation.filter(s => {
            const label = (s.situation || s.name || '').toLowerCase();
            return label.includes('scoring position') || label.includes('runners on') ||
                   label.includes('none on') || label.includes('bases loaded') ||
                   label.includes('risp');
          });

          if (situational.length > 0) {
            hasAnyRispData = true;
            usedBdl = true;
            lines.push(`--- ${name} ---`);
            for (const s of situational) {
              const label = s.situation || s.name || 'Unknown';
              const avg = s.batting_avg != null ? s.batting_avg.toFixed(3) : '—';
              const ops = s.batting_ops != null ? s.batting_ops.toFixed(3) : '—';
              const hr = s.batting_hr ?? '—';
              const rbi = s.batting_rbi ?? '—';
              const ab = s.batting_ab ?? '—';
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

  // Default handler
  DEFAULT: async (sport, home, away, season, options) => {
    return {
      homeValue: 'Token not available for MLB',
      awayValue: '',
      comparison: 'This stat token is not implemented for baseball',
      source: 'N/A',
    };
  },
};
