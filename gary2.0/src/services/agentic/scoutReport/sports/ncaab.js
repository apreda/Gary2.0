/**
 * NCAAB Scout Report Builder
 * Handles all NCAAB-specific logic for building the pre-game scout report.
 */

import { ballDontLieService } from '../../../ballDontLieService.js';
import { generateGameSignificance } from '../gameSignificanceGenerator.js';
import { formatTokenMenu } from '../../tools/toolDefinitions.js';
import { getTeamRatings as getBarttovikRatings } from '../../../ncaabMetricsService.js';
import { ncaabSeason } from '../../../../utils/dateUtils.js';
import {
  seasonForSport,
  playerNamesMatch,
  normalizeSport,
  sportToBdlKey,
  findTeam,
  escapeRegex,
  formatGameTime,
  getInjuryStatusFromMap
} from '../shared/utilities.js';
import { getGeminiClient, geminiGroundingSearch, fetchStandingsSnapshot } from '../shared/grounding.js';
import {
  fetchTeamProfile,
  fetchInjuries,
  fetchRecentGames,
  fetchH2HData,
  fetchCurrentState,
  scrubNarrative,
  formatInjuryReport,
  formatStartingLineups,
  formatOdds,
  formatRestSituation,
  calculateRestSituation,
  formatRecentForm,
  formatH2HSection,
  detectReturningPlayers
} from '../shared/dataFetchers.js';
import { buildVerifiedTaleOfTape } from '../shared/taleOfTape.js';


// =========================================================================
// NCAAB ADVANCED METRICS (BARTTORVIK)
// =========================================================================

async function fetchNcaabAdvancedMetrics(homeTeamName, awayTeamName) {
  // ═══════════════════════════════════════════════════════════════════════════
  // Barttorvik API: Structured data, no Grounding needed
  // One cached fetch serves ALL NCAAB games (365 teams, 6h cache)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[Scout Report] Fetching NCAAB Tier 1 advanced metrics via Barttorvik API for ${awayTeamName} @ ${homeTeamName}...`);
  const startTime = Date.now();

  const [homeData, awayData] = await Promise.all([
    getBarttovikRatings(homeTeamName),
    getBarttovikRatings(awayTeamName)
  ]);

  const duration = Date.now() - startTime;
  console.log(`[Scout Report] Barttorvik data fetched in ${duration}ms — Home: ${homeData ? 'OK' : 'MISS'}, Away: ${awayData ? 'OK' : 'MISS'}`);

  return {
    home: { team: homeTeamName, data: homeData },
    away: { team: awayTeamName, data: awayData }
  };
}

// =========================================================================
// NCAAB AP RANKINGS
// =========================================================================

/**
 * Fetch NCAAB AP Rankings from BDL rankings endpoint.
 * Returns AP and Coaches poll rankings for both teams.
 */
async function fetchNcaabApRankings(homeTeamId, awayTeamId, season, homeTeamName, awayTeamName) {
  console.log(`[Scout Report] Fetching NCAAB AP/Coaches rankings from BDL (season: ${season})...`);
  const startTime = Date.now();

  const rankings = await ballDontLieService.getRankingsGeneric('basketball_ncaab', { season });

  const duration = Date.now() - startTime;
  console.log(`[Scout Report] NCAAB rankings fetched in ${duration}ms (${rankings.length} entries)`);

  if (!rankings || rankings.length === 0) return null;

  const findTeamRanking = (teamId, teamName, poll) => {
    // Try by team ID first
    let entry = rankings.find(r => r.team?.id === teamId && (r.poll || '').toLowerCase() === poll);
    if (!entry) {
      // Fallback: match by team name
      const nameLower = teamName.toLowerCase();
      entry = rankings.find(r => {
        const rName = (r.team?.full_name || r.team?.name || '').toLowerCase();
        return rName.includes(nameLower) || nameLower.includes(rName);
      });
      if (entry && (entry.poll || '').toLowerCase() !== poll) entry = null;
    }
    return entry ? { rank: entry.rank, record: entry.record, trend: entry.trend } : null;
  };

  return {
    home: {
      ap: findTeamRanking(homeTeamId, homeTeamName, 'ap'),
      coaches: findTeamRanking(homeTeamId, homeTeamName, 'coaches')
    },
    away: {
      ap: findTeamRanking(awayTeamId, awayTeamName, 'ap'),
      coaches: findTeamRanking(awayTeamId, awayTeamName, 'coaches')
    }
  };
}


// =========================================================================
// NCAAB HOME COURT SPLITS
// =========================================================================

/**
 * Calculate NCAAB Home/Away splits from recent games.
 * Computes Season + L10 + L5 breakdowns for trend analysis.
 * No extra API call — uses recentHome/recentAway already fetched.
 */
function calcNcaabHomeCourt(recentHome, recentAway, homeTeamName, awayTeamName, homeTeamId, awayTeamId) {
  const calcSplitsForSlice = (games, teamId, teamName) => {
    if (!games || games.length === 0) return null;

    let homeWins = 0, homeLosses = 0, awayWins = 0, awayLosses = 0;
    let homePts = 0, homeOppPts = 0, homeGames = 0;
    let awayPts = 0, awayOppPts = 0, awayGamesCount = 0;

    for (const g of games) {
      const isHome = g.home_team?.id === teamId || (g.home_team?.name || '').toLowerCase().includes(teamName.toLowerCase().split(' ').pop());
      const teamScore = isHome ? (g.home_team_score ?? g.home_score ?? 0) : (g.visitor_team_score ?? g.away_score ?? 0);
      const oppScore = isHome ? (g.visitor_team_score ?? g.away_score ?? 0) : (g.home_team_score ?? g.home_score ?? 0);

      if (teamScore === 0 && oppScore === 0) continue;

      if (isHome) {
        homeGames++;
        homePts += teamScore;
        homeOppPts += oppScore;
        if (teamScore > oppScore) homeWins++; else homeLosses++;
      } else {
        awayGamesCount++;
        awayPts += teamScore;
        awayOppPts += oppScore;
        if (teamScore > oppScore) awayWins++; else awayLosses++;
      }
    }

    return {
      home_record: `${homeWins}-${homeLosses}`,
      away_record: `${awayWins}-${awayLosses}`,
      home_margin: homeGames > 0 ? ((homePts - homeOppPts) / homeGames).toFixed(1) : 'N/A',
      away_margin: awayGamesCount > 0 ? ((awayPts - awayOppPts) / awayGamesCount).toFixed(1) : 'N/A',
      home_games: homeGames,
      away_games: awayGamesCount
    };
  };

  const calcAllSplits = (games, teamId, teamName) => {
    if (!games || games.length === 0) return null;
    return {
      season: calcSplitsForSlice(games, teamId, teamName),
      l10: calcSplitsForSlice(games.slice(0, 10), teamId, teamName),
      l5: calcSplitsForSlice(games.slice(0, 5), teamId, teamName)
    };
  };

  return {
    home: calcAllSplits(recentHome, homeTeamId, homeTeamName),
    away: calcAllSplits(recentAway, awayTeamId, awayTeamName)
  };
}


// =========================================================================
// NCAAB RANKINGS + HOME COURT FORMATTER
// =========================================================================

/**
 * Format NCAAB AP Rankings + Home Court section for the scout report.
 */
function formatNcaabRankingsAndHomeCourt(rankings, homeCourt, homeTeam, awayTeam) {
  const lines = [];
  let hasContent = false;

  // AP Rankings
  if (rankings && (rankings.home?.ap || rankings.away?.ap)) {
    hasContent = true;
    lines.push('');
    lines.push('NCAAB RANKINGS (FROM BDL)');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const formatRank = (teamData, teamName, label) => {
      const ap = teamData?.ap;
      const coaches = teamData?.coaches;
      if (ap || coaches) {
        const parts = [];
        if (ap) parts.push(`AP #${ap.rank}${ap.record ? ` (${ap.record})` : ''}${ap.trend ? ` ${ap.trend}` : ''}`);
        if (coaches) parts.push(`Coaches #${coaches.rank}`);
        lines.push(`  [${label}] ${teamName}: ${parts.join(' | ')}`);
      } else {
        lines.push(`  [${label}] ${teamName}: Unranked`);
      }
    };

    formatRank(rankings.home, homeTeam, 'HOME');
    formatRank(rankings.away, awayTeam, 'AWAY');
    lines.push('');
  }

  // Home/Away Splits — Season + L10 + L5 comparison
  if (homeCourt && (homeCourt.home || homeCourt.away)) {
    hasContent = true;
    lines.push('HOME/AWAY SPLITS (FROM BDL GAME RESULTS)');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const formatTeamSplits = (teamSplits, teamName, label) => {
      if (!teamSplits) return;
      lines.push(`  [${label}] ${teamName}:`);

      const formatRow = (period, splits) => {
        if (!splits) return;
        const homeStr = `Home: ${splits.home_record} (${splits.home_games}g) Margin: ${splits.home_margin}`;
        const awayStr = `Away: ${splits.away_record} (${splits.away_games}g) Margin: ${splits.away_margin}`;
        lines.push(`    ${period.padEnd(8)} ${homeStr} | ${awayStr}`);
      };

      formatRow('Season', teamSplits.season);
      formatRow('L10', teamSplits.l10);
      formatRow('L5', teamSplits.l5);
      lines.push('');
    };

    formatTeamSplits(homeCourt.home, homeTeam, 'HOME');
    formatTeamSplits(homeCourt.away, awayTeam, 'AWAY');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
  }

  return hasContent ? lines.join('\n') : '';
}


// =========================================================================
// NCAAB KEY PLAYERS
// =========================================================================

/**
 * Fetch key players for NCAAB teams
 * CRITICAL: Prevents hallucinations about transferred players (transfer portal is huge in college basketball)
 * ENHANCED: Now uses Gemini Grounding to get starting lineups from RotoWire
 */
async function fetchNcaabKeyPlayers(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (bdlSport !== 'basketball_ncaab') {
      return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // NCAAB: Use Gemini Grounding to get TONIGHT'S STARTING LINEUP from RotoWire
    // College has massive transfer portal activity - this ensures we have current players
    // ═══════════════════════════════════════════════════════════════════════════
    console.log(`[Scout Report] Fetching NCAAB starting lineups via Gemini Grounding for ${awayTeam} @ ${homeTeam}`);

    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    let rotoWireLineups = null;
    try {
      const gemini = getGeminiClient();
      if (gemini) {
        const model = gemini.getGenerativeModel({
          model: 'gemini-3-flash-preview', // Flash for grounding searches only
          tools: [{ google_search: {} }],
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ]
        });

        // Fetch EACH team separately to prevent truncation (single-query approach cut off second team)
        const buildLineupQuery = (teamName) => `<date_anchor>Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Use ONLY current 2025-26 season data.</date_anchor>
Search site:rotowire.com/daily/ncaab/lineups.php for ${teamName} ${today}

Return the EXACT information from RotoWire's CBB lineups page for ${teamName}:

═══ ${teamName} ═══
STARTERS:
PG: [name]
SG: [name]
SF: [name]
PF: [name]
C: [name]

INJURIES:
[Pos] [Name] [Status]
(Format: G/F/C + Name + GTD/Out/OFS)

STATUS KEY: GTD = Game Time Decision, Out = Confirmed NOT playing, OFS = Out For Season
List ALL injuries shown on RotoWire. If no injuries, write "None".`;

        const [awayLineupResult, homeLineupResult] = await Promise.all([
          model.generateContent(buildLineupQuery(awayTeam)),
          model.generateContent(buildLineupQuery(homeTeam))
        ]);

        const awayLineupText = awayLineupResult.response?.text() || '';
        const homeLineupText = homeLineupResult.response?.text() || '';
        const combinedLineupText = `═══ ${awayTeam} (AWAY) ═══\n${awayLineupText}\n\n═══ ${homeTeam} (HOME) ═══\n${homeLineupText}`;

        if (combinedLineupText.length > 100) {
          console.log(`[Scout Report] Gemini Grounding returned NCAAB lineup data: ${awayTeam} (${awayLineupText.length} chars), ${homeTeam} (${homeLineupText.length} chars)`);
          rotoWireLineups = {
            content: combinedLineupText,
            source: 'Gemini Grounding (site:rotowire.com)',
            fetchedAt: new Date().toISOString(),
            // Store per-team raw texts so the GTD block can reuse them (avoids duplicate Grounding calls)
            awayRaw: awayLineupText,
            homeRaw: homeLineupText
          };
        }
      }
    } catch (groundingError) {
      console.warn(`[Scout Report] Gemini Grounding for NCAAB lineups failed: ${groundingError.message}`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BDL: Supplement with stats for context
    // ═══════════════════════════════════════════════════════════════════════════
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);

    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for NCAAB roster lookup');
      // If we have RotoWire data, return that alone
      if (rotoWireLineups) {
        return { rotoWireLineups, source: 'Gemini Grounding' };
      }
      return null;
    }

    console.log(`[Scout Report] Fetching NCAAB stats from BDL for ${homeTeam} (ID: ${homeTeamData?.id}) and ${awayTeam} (ID: ${awayTeamData?.id})`);

    // Fetch active players for each team
    const [homePlayersRaw, awayPlayersRaw] = await Promise.all([
      homeTeamData ? ballDontLieService.getPlayersActive(bdlSport, { team_ids: [homeTeamData.id], per_page: 20 }) : [],
      awayTeamData ? ballDontLieService.getPlayersActive(bdlSport, { team_ids: [awayTeamData.id], per_page: 20 }) : []
    ]);

    // Ensure we have arrays - getPlayersActive may return object with data property or null
    const homePlayers = Array.isArray(homePlayersRaw) ? homePlayersRaw :
                        (homePlayersRaw?.data && Array.isArray(homePlayersRaw.data)) ? homePlayersRaw.data : [];
    const awayPlayers = Array.isArray(awayPlayersRaw) ? awayPlayersRaw :
                        (awayPlayersRaw?.data && Array.isArray(awayPlayersRaw.data)) ? awayPlayersRaw.data : [];

    console.log(`[Scout Report] NCAAB roster: ${homeTeam} (${homePlayers.length} players), ${awayTeam} (${awayPlayers.length} players)`);

    // Get current college basketball season (Nov-March is the season)
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-indexed for consistency
    // Nov-March: we're in the currentYear season (e.g., Nov 2025 = 2025-26 season = 2026)
    // But BDL uses the starting year, so Nov-Dec of 2025 = season 2025
    // Nov(11)-Dec(12) = current year, Jan(1)-Jul(7) = previous year
    const season = currentMonth >= 11 ? currentYear : currentYear - 1;

    // Fetch season stats for all players
    let homeStats = [];
    let awayStats = [];
    try {
      const [homeStatsResult, awayStatsResult] = await Promise.all([
        homeTeamData ? ballDontLieService.getNcaabPlayerSeasonStats({ teamId: homeTeamData.id, season }) : [],
        awayTeamData ? ballDontLieService.getNcaabPlayerSeasonStats({ teamId: awayTeamData.id, season }) : []
      ]);
      homeStats = homeStatsResult || [];
      awayStats = awayStatsResult || [];
      console.log(`[Scout Report] Fetched NCAAB stats: ${homeTeam} (${homeStats.length}), ${awayTeam} (${awayStats.length})`);
    } catch (e) {
      console.warn('[Scout Report] Could not fetch NCAAB player stats:', e.message);
    }

    // Process roster to get top players SORTED BY PPG
    const processRoster = (players, stats, teamName) => {
      if (!players || players.length === 0) return null;

      // Create a stats lookup by player ID
      const statsById = {};
      stats.forEach(s => {
        if (s.player?.id) {
          statsById[s.player.id] = s;
        }
      });

      // Map players with their stats
      const playersWithStats = players.map(p => {
        const playerStats = statsById[p.id] || {};
        const gamesPlayed = parseFloat(playerStats.games_played) || 0;
        // CRITICAL: pts/reb/ast are TOTAL season stats, must divide by games_played to get per-game averages
        const totalPts = parseFloat(playerStats.pts) || 0;
        const totalReb = parseFloat(playerStats.reb) || 0;
        const totalAst = parseFloat(playerStats.ast) || 0;
        return {
          name: `${p.first_name} ${p.last_name}`,
          position: p.position || 'N/A',
          jerseyNumber: p.jersey_number,
          id: p.id,
          ppg: gamesPlayed > 0 ? totalPts / gamesPlayed : 0,
          rpg: gamesPlayed > 0 ? totalReb / gamesPlayed : 0,
          apg: gamesPlayed > 0 ? totalAst / gamesPlayed : 0,
          gamesPlayed: gamesPlayed
        };
      });

      // Sort by PPG (descending) to get actual key players
      playersWithStats.sort((a, b) => b.ppg - a.ppg);

      // Take top 8 by PPG (college rosters are smaller impact)
      const keyPlayers = playersWithStats.slice(0, 8);

      // Log who we're identifying as key players
      const topScorers = keyPlayers.slice(0, 5).map(p => `${p.name} (${p.ppg.toFixed(1)} PPG)`);
      console.log(`[Scout Report] ${teamName} NCAAB key players: ${topScorers.join(', ')}`);

      return keyPlayers;
    };

    const homeKeyPlayers = processRoster(homePlayers, homeStats, homeTeam);
    const awayKeyPlayers = processRoster(awayPlayers, awayStats, awayTeam);

    return {
      home: homeKeyPlayers,
      away: awayKeyPlayers,
      homeTeamName: homeTeam,
      awayTeamName: awayTeam,
      rotoWireLineups // Include Gemini Grounding lineup data
    };
  } catch (error) {
    console.error('[Scout Report] Error fetching NCAAB key players:', error.message);
    return null;
  }
}


// =========================================================================
// NCAAB KEY PLAYERS FORMATTER
// =========================================================================

/**
 * Format NCAAB key players section for display
 * CRITICAL: Tells the LLM who ACTUALLY plays for each team (transfer portal is huge in CBB)
 * ENHANCED: Now shows starting lineups from RotoWire via Gemini Grounding
 */
function formatNcaabKeyPlayers(homeTeam, awayTeam, keyPlayers) {
  if (!keyPlayers || (!keyPlayers.home && !keyPlayers.away && !keyPlayers.rotoWireLineups)) {
    return '';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // If we have RotoWire lineup data from Gemini Grounding, show that FIRST
  // This is especially important for college (transfer portal activity)
  // ═══════════════════════════════════════════════════════════════════════════
  if (keyPlayers.rotoWireLineups?.content) {
    return `
TONIGHT'S STARTING LINEUPS & INJURIES (FROM ROTOWIRE via Gemini Grounding)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${keyPlayers.rotoWireLineups.content}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COLLEGE BASKETBALL NOTES:
- "OFS" (Out For Season) status included where applicable.
- Lineup data reflects tonight's expected starters.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Fallback: BDL roster data (if Grounding failed)
  // ═══════════════════════════════════════════════════════════════════════════
  const formatPlayer = (player) => {
    const jersey = player.jerseyNumber ? ` #${player.jerseyNumber}` : '';
    const ppg = player.ppg ? ` - ${player.ppg.toFixed(1)} PPG` : '';
    const extras = [];
    if (player.rpg > 0) extras.push(`${player.rpg.toFixed(1)} RPG`);
    if (player.apg > 0) extras.push(`${player.apg.toFixed(1)} APG`);
    const extraStr = extras.length > 0 ? `, ${extras.join(', ')}` : '';
    return `  • ${player.position}: ${player.name}${jersey}${ppg}${extraStr}`;
  };

  const lines = [
    'CURRENT ROSTERS',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ''
  ];

  if (keyPlayers.home && keyPlayers.home.length > 0) {
    lines.push(`${homeTeam}:`);
    keyPlayers.home.forEach(player => {
      lines.push(formatPlayer(player));
    });
    lines.push('');
  }

  if (keyPlayers.away && keyPlayers.away.length > 0) {
    lines.push(`${awayTeam}:`);
    keyPlayers.away.forEach(player => {
      lines.push(formatPlayer(player));
    });
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  return lines.join('\n');
}


// =========================================================================
// NCAAB ROSTER DEPTH FORMATTER
// =========================================================================

function formatNcaabRosterDepth(homeTeam, awayTeam, rosterDepth, injuries) {
  if (!rosterDepth || (!rosterDepth.home?.length && !rosterDepth.away?.length)) {
    return '';
  }

  // Build a set of injured player names for quick lookup
  const injuredPlayers = new Map();
  const allInjuries = [...(injuries?.home || []), ...(injuries?.away || [])];
  for (const inj of allInjuries) {
    const name = inj.name?.toLowerCase() || `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.toLowerCase().trim();
    if (name && name !== 'unknown') {
      injuredPlayers.set(name, {
        status: inj.status || 'Unknown',
        description: inj.description || inj.comment || ''
      });
    }
  }

  const getInjuryStatus = (playerName) => getInjuryStatusFromMap(playerName, injuredPlayers);

  // Helper to format a player row
  const formatPlayerRow = (player, index) => {
    const injury = getInjuryStatus(player.name);
    const status = injury
      ? ((injury.status || '').toUpperCase() === 'GTD' ? '[GTD]' : '[OUT]')
      : '[ACTIVE]';
    let injuryNote = '';
    if (injury) {
      const statusUpper = injury.status.toUpperCase();
      // Factual status labels for NCAAB
      if (statusUpper.includes('SEASON') || statusUpper === 'OFS') {
        injuryNote = ` - Out For Season`;
      } else if (statusUpper === 'GTD') {
        injuryNote = ` - GTD`;
      } else {
        injuryNote = ` - ${statusUpper}`;
      }
    }

    // Format stats with advanced metrics
    const stats = player.gp > 0
      ? `${player.ppg} PPG | ${player.reb} REB | ${player.ast} AST | eFG: ${player.efgPct || 'N/A'}% | TS: ${player.tsPct || 'N/A'}% | ${player.fgaPg || '0.0'} FGA/g | 3PT: ${player.fg3Pct}%`
      : `No stats yet`;

    return `  ${status} ${player.name} (${player.position})${injuryNote} - ${stats}`;
  };

  // Format team rosters
  const lines = [
    '',
    'NCAAB ROSTER DEPTH — TOP 9 CONTRIBUTORS (FROM BDL)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'Current active players (transfer portal changes reflected).',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ''
  ];

  // Home team
  if (rosterDepth.home?.length > 0) {
    const teamName = rosterDepth.homeTeamName || homeTeam;
    lines.push(`[HOME] ${teamName.toUpperCase()} (sorted by PPG):`);
    rosterDepth.home.forEach((player, index) => {
      lines.push(formatPlayerRow(player, index));
      // Visual separator between starters (5) and bench
      if (index === 4 && rosterDepth.home.length > 5) {
        lines.push('  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ (BENCH) ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─');
      }
    });
    lines.push('');
  }

  // Away team
  if (rosterDepth.away?.length > 0) {
    const teamName = rosterDepth.awayTeamName || awayTeam;
    lines.push(`[AWAY]  ${teamName.toUpperCase()} (sorted by PPG):`);
    rosterDepth.away.forEach((player, index) => {
      lines.push(formatPlayerRow(player, index));
      if (index === 4 && rosterDepth.away.length > 5) {
        lines.push('  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ (BENCH) ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─');
      }
    });
    lines.push('');
  }

  // NCAAB Four Factors moved to NCAAB_FOUR_FACTORS investigation token — Gary calls during Pass 1

  // Unit Comparison (Starters vs Bench)
  const buildUnitComparison = (players, teamName) => {
    if (!players || players.length < 5) return null;
    const sorted = [...players].sort((a, b) => parseFloat(b.min || 0) - parseFloat(a.min || 0));
    const starters = sorted.slice(0, 5);
    const bench = sorted.slice(5);

    const unitStats = (unit) => {
      const ppg = unit.reduce((s, p) => s + parseFloat(p.ppg || 0), 0);
      const efgValues = unit.filter(p => p.efgPct).map(p => parseFloat(p.efgPct));
      const avgEfg = efgValues.length > 0 ? (efgValues.reduce((s, v) => s + v, 0) / efgValues.length).toFixed(1) : 'N/A';
      const avgMin = (unit.reduce((s, p) => s + parseFloat(p.min || 0), 0) / unit.length).toFixed(1);
      return { ppg: ppg.toFixed(1), efg: avgEfg, min: avgMin, count: unit.length };
    };

    return { starters: unitStats(starters), bench: unitStats(bench), name: teamName };
  };

  const homeUnit = buildUnitComparison(rosterDepth.home, rosterDepth.homeTeamName || homeTeam);
  const awayUnit = buildUnitComparison(rosterDepth.away, rosterDepth.awayTeamName || awayTeam);

  if (homeUnit || awayUnit) {
    lines.push('UNIT COMPARISON (Starters vs Bench by minutes):');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (homeUnit) {
      lines.push(`  ${homeUnit.name.toUpperCase()} Starters (${homeUnit.starters.count}): ${homeUnit.starters.ppg} PPG | eFG% ${homeUnit.starters.efg}% | ${homeUnit.starters.min} MIN avg`);
      lines.push(`  ${homeUnit.name.toUpperCase()} Bench (${homeUnit.bench.count}):    ${homeUnit.bench.ppg} PPG | eFG% ${homeUnit.bench.efg}% | ${homeUnit.bench.min} MIN avg`);
    }
    if (awayUnit) {
      lines.push(`  ${awayUnit.name.toUpperCase()} Starters (${awayUnit.starters.count}): ${awayUnit.starters.ppg} PPG | eFG% ${awayUnit.starters.efg}% | ${awayUnit.starters.min} MIN avg`);
      lines.push(`  ${awayUnit.name.toUpperCase()} Bench (${awayUnit.bench.count}):    ${awayUnit.bench.ppg} PPG | eFG% ${awayUnit.bench.efg}% | ${awayUnit.bench.min} MIN avg`);
    }
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
  }

  lines.push('');

  return lines.join('\n');
}


// =========================================================================
// MAIN BUILDER
// =========================================================================

export async function buildNcaabScoutReport(game, options = {}) {
  const sport = 'NCAAB';
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  const sportKey = normalizeSport(sport);

  // ===================================================================
  // Step A: Fetch basic shared data in parallel
  // NCAAB uses 50 recent games (not 8) for full-season coverage
  // Note: NCAAB does NOT use the generic standingsSnapshot here —
  //       it fetches conference-filtered standings in Step B below
  // ===================================================================
  const [homeProfile, awayProfile, injuries, recentHome, recentAway, bartData] = await Promise.all([
    fetchTeamProfile(homeTeam, sportKey),
    fetchTeamProfile(awayTeam, sportKey),
    fetchInjuries(homeTeam, awayTeam, sportKey),
    fetchRecentGames(homeTeam, sportKey, 12),
    fetchRecentGames(awayTeam, sportKey, 12),
    fetchNcaabAdvancedMetrics(homeTeam, awayTeam).catch(e => {
      console.warn('[Scout Report] Barttorvik fetch failed (non-fatal):', e.message);
      return null;
    })
  ]);

  // ===================================================================
  // Step B: NCAAB roster depth + conference IDs + standings + rankings
  // Phase 1: BDL roster depth + Gemini grounding + venue (parallel)
  // Phase 2: Conference standings + AP rankings (depends on Phase 1)
  // ===================================================================
  let ncaabRosterDepth = null;
  let ncaabConferenceIds = null;
  let ncaabStandingsSnapshot = '';
  let ncaabRankings = null;

  const ncaabSeasonYear = ncaabSeason();

  // Phase 1: Fetch in parallel — BDL roster depth + Gemini grounding
  // Venue is resolved via Gemini Grounding in Step B2 (not Highlightly)
  const [rosterResult, currentStateResult] = await Promise.all([
    ballDontLieService.getNcaabRosterDepth(homeTeam, awayTeam, ncaabSeasonYear).catch(e => {
      console.warn('[Scout Report] NCAAB roster depth error:', e.message);
      return null;
    }),
    fetchCurrentState(homeTeam, awayTeam, sport).catch(e => {
      console.warn('[Scout Report] NCAAB current state error:', e.message);
      return null;
    })
  ]);

  ncaabRosterDepth = rosterResult;

  // Set narrative context on injuries so it flows into CURRENT STATE section of report
  if (currentStateResult?.groundedRaw) {
    injuries.narrativeContext = currentStateResult.groundedRaw;
  }

  // Phase 2: Depends on roster depth result (team IDs for BDL calls)
  if (ncaabRosterDepth) {
    ncaabConferenceIds = {
      home: ncaabRosterDepth.homeConferenceId,
      away: ncaabRosterDepth.awayConferenceId
    };

    // Fetch standings and AP rankings in parallel
    const [standingsResult, rankingsResult] = await Promise.all([
      fetchStandingsSnapshot(sportKey, homeTeam, awayTeam, ncaabConferenceIds).catch(e => {
        console.warn('[Scout Report] NCAAB standings error:', e.message);
        return '';
      }),
      fetchNcaabApRankings(ncaabRosterDepth.homeTeamId, ncaabRosterDepth.awayTeamId, ncaabSeasonYear, homeTeam, awayTeam).catch(e => {
        console.warn('[Scout Report] NCAAB AP rankings error:', e.message);
        return null;
      })
    ]);

    ncaabStandingsSnapshot = standingsResult;
    ncaabRankings = rankingsResult;
  }

  // Calculate home/away splits from already-fetched recent games (no extra API call)
  const ncaabHomeCourt = (ncaabRosterDepth && recentHome && recentAway)
    ? calcNcaabHomeCourt(recentHome, recentAway, homeTeam, awayTeam, ncaabRosterDepth.homeTeamId, ncaabRosterDepth.awayTeamId)
    : null;

  // ===================================================================
  // Step B2: Fetch NCAAB game context via Gemini Grounding (tournament, significance, venue)
  // ===================================================================
  try {
    let dateStr;
    if (game.commence_time) {
      const gameDate = new Date(game.commence_time);
      dateStr = gameDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    } else {
      dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    }
    console.log(`[Scout Report] Fetching NCAAB game context via Gemini Grounding for ${dateStr}...`);

    const contextQuery = `Given this NCAA men's college basketball game: ${awayTeam} vs ${homeTeam} on ${dateStr}.

Determine what type of game this is and any special significance.
Search for current information about this specific game.
Is this a conference tournament game? NCAA Tournament game? NIT game? Regular season?
If conference tournament: which conference and what round (First Round, Quarterfinal, Semifinal, Final)?
If NCAA Tournament: what round and what seeds?

After your analysis, include this EXACT summary block at the very end of your response:
---GAME_CONTEXT---
GAME_TYPE: [one of: regular_season, conference_tournament, ncaa_tournament_round_of_64, ncaa_tournament_round_of_32, ncaa_sweet_16, ncaa_elite_8, ncaa_final_four, ncaa_championship, nit]
CONFERENCE: [conference name abbreviation if conference tournament, e.g. SEC, Big 12, ACC, Big Ten, Big East, AAC, etc. N/A if not conference tournament]
ROUND_DETAIL: [specific round name, e.g. First Round, Quarterfinal, Semifinal, Championship/Final. N/A if regular season]
NEUTRAL_SITE: [yes or no]
HOME_SEED: [number or N/A]
AWAY_SEED: [number or N/A]
VENUE: [arena/stadium name where this game is being played, or UNKNOWN if not found]
---END_CONTEXT---`;

    const contextResult = await geminiGroundingSearch(contextQuery, {
      temperature: 1.0,
      maxTokens: 1500
    });

    if (contextResult?.success && contextResult?.data) {
      const responseText = contextResult.data;

      const contextMatch = responseText.match(/---GAME_CONTEXT---\s*([\s\S]*?)\s*---END_CONTEXT---/);
      if (contextMatch) {
        const block = contextMatch[1];
        const gameType = block.match(/GAME_TYPE:\s*(.+)/i)?.[1]?.trim().toLowerCase() || '';
        const neutralSite = block.match(/NEUTRAL_SITE:\s*(.+)/i)?.[1]?.trim().toLowerCase() || '';
        const conferenceName = block.match(/CONFERENCE:\s*(.+)/i)?.[1]?.trim() || '';
        const roundDetail = block.match(/ROUND_DETAIL:\s*(.+)/i)?.[1]?.trim() || '';

        if (gameType.includes('ncaa_championship')) {
          game.tournamentContext = 'NCAA Championship';
        } else if (gameType.includes('ncaa_final_four')) {
          game.tournamentContext = 'NCAA Final Four';
        } else if (gameType.includes('ncaa_elite_8')) {
          game.tournamentContext = 'NCAA Elite Eight';
        } else if (gameType.includes('ncaa_sweet_16')) {
          game.tournamentContext = 'NCAA Sweet Sixteen';
        } else if (gameType.includes('ncaa_tournament_round_of_32')) {
          game.tournamentContext = 'NCAA Tournament Round of 32';
        } else if (gameType.includes('ncaa_tournament_round_of_64')) {
          game.tournamentContext = 'NCAA Tournament Round of 64';
        } else if (gameType.includes('conference_tournament')) {
          // Build specific label like "SEC Semifinal" or "Big 12 Final"
          const conf = conferenceName && conferenceName.toLowerCase() !== 'n/a' ? conferenceName : '';
          const round = roundDetail && roundDetail.toLowerCase() !== 'n/a' ? roundDetail : '';
          if (conf && round) {
            game.tournamentContext = `${conf} ${round}`;
          } else if (conf) {
            game.tournamentContext = `${conf} Tournament`;
          } else {
            game.tournamentContext = 'Conference Tournament';
          }
        } else if (gameType.includes('nit')) {
          game.tournamentContext = 'NIT';
        } else {
          console.log('[Scout Report] Regular season NCAAB game');
        }

        if (game.tournamentContext) {
          console.log(`[Scout Report] ${game.tournamentContext} detected`);
        }

        if (neutralSite === 'yes') {
          game.isNeutralSite = true;
        }

        // Parse seeds if available
        const homeSeed = block.match(/HOME_SEED:\s*(\d+)/i)?.[1];
        const awaySeed = block.match(/AWAY_SEED:\s*(\d+)/i)?.[1];
        if (homeSeed) game.homeSeed = parseInt(homeSeed);
        if (awaySeed) game.awaySeed = parseInt(awaySeed);

        // Parse venue from grounding (strip city suffix to match NBA/NHL format)
        const venueMatch = block.match(/VENUE:\s*(.+)/i)?.[1]?.trim();
        if (venueMatch && venueMatch.toLowerCase() !== 'unknown' && venueMatch.toLowerCase() !== 'n/a') {
          game.venue = venueMatch.split(',')[0].trim();
          console.log(`[Scout Report] Venue: ${game.venue}`);
        }

        // Set gameSignificance from tournamentContext if it's a tournament game
        if (game.tournamentContext) {
          game.gameSignificance = game.tournamentContext;
        }
      } else {
        console.log('[Scout Report] Regular season NCAAB game (no structured context block)');
      }

      console.log('[Scout Report] NCAAB game context retrieved via Gemini Grounding');
    }
  } catch (e) {
    console.warn('[Scout Report] NCAAB game context fetch failed:', e.message);
  }

  // ===================================================================
  // Step C: Fetch NCAAB key players (roster + stats) to prevent hallucinations
  // CRITICAL: College basketball has frequent transfers
  // ===================================================================
  let ncaabKeyPlayers = null;
  ncaabKeyPlayers = await fetchNcaabKeyPlayers(homeTeam, awayTeam, sportKey);

  // ===================================================================
  // Step D: Fetch H2H data
  // ===================================================================
  let h2hData = null;
  try {
    h2hData = await fetchH2HData(homeTeam, awayTeam, sportKey, recentHome, recentAway);
    console.log(`[Scout Report] H2H Data: ${h2hData?.found ? `${h2hData.gamesFound} game(s) found` : 'No games found'}`);
  } catch (e) {
    console.log(`[Scout Report] H2H fetch failed: ${e.message}`);
  }

  // ===================================================================
  // Step E: Generate game significance
  // ===================================================================
  if (!game.gameSignificance || game.gameSignificance === 'Regular season game' || game.gameSignificance.length > 100) {
    try {
      const bdlSport = sportToBdlKey(sportKey);
      let standings = [];
      if (bdlSport) {
        const currentSeason = seasonForSport(sportKey);
        try {
          standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason }) || [];
        } catch (standingsErr) {
          console.log(`[Scout Report] Standings fetch failed (will use fallbacks): ${standingsErr.message}`);
        }
      }

      const significance = generateGameSignificance(
        {
          home_team: homeTeam,
          away_team: awayTeam,
          venue: game.venue,
          date: game.date || game.datetime,
          postseason: game.postseason,
          homeConference: game.homeConference,
          awayConference: game.awayConference
        },
        sportKey,
        standings,
        game.week || null
      );
      if (significance) {
        game.gameSignificance = significance;
        console.log(`[Scout Report] Game significance: ${significance}`);
      }
    } catch (sigErr) {
      console.log(`[Scout Report] Could not generate game significance: ${sigErr.message}`);
    }
  }

  // ===================================================================
  // Step F: Format injuries for storage
  // ===================================================================
  const formatInjuriesForStorage = (injuries) => {
    const invalidFirstNamePatterns = /^(th|nd|rd|st|with|for|and|the|or|by|to|in|on|at|of|is|as|a|an)\s/i;

    const formatList = (list) => list.map(i => {
      const firstName = (i.player?.first_name || '').trim();
      const lastName = (i.player?.last_name || '').trim();
      let name = `${firstName} ${lastName}`.trim() || i.name || 'Unknown';
      name = name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

      const nameParts = name.split(' ');
      const isValidName = (
        name.length >= 5 &&
        nameParts.length >= 2 &&
        nameParts[0].length >= 2 &&
        nameParts[nameParts.length - 1].length >= 2 &&
        !invalidFirstNamePatterns.test(name)
      );

      if (!isValidName) {
        console.log(`[Scout Report] Skipping malformed injury entry: "${name}"`);
        name = 'Unknown';
      }

      return {
        name,
        status: (i.status || 'Unknown').replace(/[\r\n]+/g, '').trim(),
        description: (i.description || i.comment || i.injury || '').replace(/[\r\n]+/g, ' ').trim()
      };
    }).filter(i => i.name !== 'Unknown');

    return {
      home: formatList(injuries.home || []),
      away: formatList(injuries.away || [])
    };
  };

  const injuriesForStorage = formatInjuriesForStorage(injuries);

  // ===================================================================
  // Step G: Narrative scrubbing — remove "ghost" players
  // Uses ncaabRosterDepth and ncaabKeyPlayers
  // ===================================================================
  if (injuries?.narrativeContext) {
    const allowedNames = new Set();

    // 1. Add names from BDL roster depth (primary source of truth for active players)
    const roster = ncaabRosterDepth;

    // Helper to add names from different roster/keyPlayer formats
    const addNamesFromSource = (teamData) => {
      if (!teamData) return;
      if (Array.isArray(teamData)) {
        teamData.forEach(p => { if (p.name) allowedNames.add(p.name.trim()); });
      } else {
        const collectionKeys = [
          'skaters', 'goalies', 'forwards', 'defensemen',
          'players', 'roster', 'active_players', 'depth_chart',
          'skater_stats', 'goalie_stats'
        ];

        collectionKeys.forEach(key => {
          const coll = teamData[key];
          if (Array.isArray(coll)) {
            coll.forEach(p => {
              if (p.name) allowedNames.add(p.name.trim());
              else if (p.player?.first_name) {
                const name = `${p.player.first_name} ${p.player.last_name || ''}`.trim();
                allowedNames.add(name);
              }
            });
          }
        });

        if (teamData.name) allowedNames.add(teamData.name.trim());
        else if (teamData.player?.first_name) {
          const name = `${teamData.player.first_name} ${teamData.player.last_name || ''}`.trim();
          allowedNames.add(name);
        }
      }
    };

    if (roster) {
      addNamesFromSource(roster.home);
      addNamesFromSource(roster.away);
    }

    // 2. Add names from key players if available
    const keyP = ncaabKeyPlayers;
    if (keyP) {
      addNamesFromSource(keyP.home);
      addNamesFromSource(keyP.away);
    }

    // 3. Add names from structured injury list (which already has hard filters applied)
    [...(injuries.home || []), ...(injuries.away || [])].forEach(i => {
      const name = i.name || `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim();
      if (name && name.length > 3) allowedNames.add(name);
    });

    // 4. Add names from starting lineups
    if (injuries.lineups) {
      if (injuries.lineups.home) injuries.lineups.home.forEach(p => { if (p.name) allowedNames.add(p.name.trim()); });
      if (injuries.lineups.away) injuries.lineups.away.forEach(p => { if (p.name) allowedNames.add(p.name.trim()); });
    }

    // Collect long-term injured players to EXCLUDE from narrative
    const excludedLongTerm = new Set(injuries.filteredLongTerm || []);

    // NCAAB: Use BDL season stats (games played) to detect players who never played this season
    // gp === 0 means the player has been out ALL season — team has played without them all year, safe to remove
    // gp > 0 means they played at some point — any current injury is fresh/relevant, KEEP them
    const rosterWithGp = ncaabRosterDepth;
    if (rosterWithGp?.gpMap) {
      const gpMap = rosterWithGp.gpMap;
      [...(injuries.home || []), ...(injuries.away || [])].forEach(i => {
        const name = i.name || `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim();
        if (!name || name.length < 4) return;
        if (gpMap[name] === 0) {
          excludedLongTerm.add(name);
        }
      });
    }

    if (excludedLongTerm.size > 0) {
      console.log(`[Scout Report] Excluding ${excludedLongTerm.size} long-term injured players from narrative (gp=0): ${Array.from(excludedLongTerm).join(', ')}`);
    }

    if (allowedNames.size > 0) {
      console.log(`[Scout Report] Scrubbing ${sportKey} narrative with ${allowedNames.size} allowed player names...`);
      const scrubbed = await scrubNarrative(injuries.narrativeContext, Array.from(allowedNames), homeTeam, awayTeam, Array.from(excludedLongTerm));
      injuries.narrativeContext = scrubbed;
    }
  }

  // ===================================================================
  // Step H: NCAAB GTD INVESTIGATION LOGIC
  // College basketball has smaller rosters - GTD starters create uncertainty
  // GTD = Game Time Decision from RotoWire - these create betting uncertainty
  // KEY: Only count GTD players who are STARTERS (not bench players)
  // ===================================================================
  // Match GTD status exactly as normalized (GTD, Questionable, etc)
  const gtdStatuses = ['gtd', 'game-time', 'game time decision', 'questionable', 'day-to-day', 'day to day'];

  // DEDICATED GTD CHECK: Fetch directly from RotoWire via targeted Gemini search
  // NOTE: RotoWire NCAAB splits games into "slates" by time:
  //   - Early slate (~6:30 PM): Games before 9 PM ET
  //   - Night slate (~9:00 PM): Games at 9 PM ET or later
  // Status codes: GTD = Game Time Decision, Out = Out, OFS = Out For Season
  let rotoWireGTD = { home: [], away: [] };
  let rotoWireInjuries = { home: [], away: [] }; // Track injuries from RotoWire response (NCAAB)
  try {
      // Get short team names for better matching (e.g., "UCLA" from "UCLA Bruins")
      const awayShort = awayTeam.split(' ')[0];
      const homeShort = homeTeam.split(' ')[0];

      // REUSE RotoWire data from fetchNcaabKeyPlayers if available (eliminates 2 duplicate Grounding calls)
      let cleanAway = '';
      let cleanHome = '';

      if (ncaabKeyPlayers?.rotoWireLineups?.awayRaw && ncaabKeyPlayers?.rotoWireLineups?.homeRaw) {
        console.log(`[Scout Report] Reusing RotoWire data from fetchNcaabKeyPlayers for GTD parsing (no duplicate Grounding calls)`);
        cleanAway = (ncaabKeyPlayers.rotoWireLineups.awayRaw || '').replace(/\*\*/g, '');
        cleanHome = (ncaabKeyPlayers.rotoWireLineups.homeRaw || '').replace(/\*\*/g, '');
      } else {
        // Fallback: fetch directly if fetchNcaabKeyPlayers didn't provide data
        console.log(`[Scout Report] Fetching RotoWire lineups and GTD status for ${awayTeam} @ ${homeTeam}...`);
        const gemini = getGeminiClient();
        if (gemini) {
          const model = gemini.getGenerativeModel({
            model: 'gemini-3-flash-preview',
            tools: [{ google_search: {} }],
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ]
          });

          const buildTeamQuery = (teamName, teamShort) => `<date_anchor>Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Use ONLY current 2025-26 season data.</date_anchor>
Search RotoWire NCAAB/CBB lineups page (rotowire.com/daily/ncaab/lineups.php) for ${teamShort} ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}

Return the EXACT information from RotoWire's college basketball lineups page for ${teamName}:

=== ${teamName} ===
STARTERS:
PG: [full name]
SG: [full name]
SF: [full name]
PF: [full name]
C: [full name]

INJURIES:
[Position] [Name] [Status]
(list ALL injuries from RotoWire with position letter G/F/C, player name, and status GTD/Out/OFS)

${teamName} GTD PLAYERS: [comma-separated names of players marked "GTD" ONLY, or "None"]

STATUS KEY: GTD = Game Time Decision, Out = Confirmed NOT playing, OFS = Out For Season
CRITICAL: Be precise. Only include what's actually shown on RotoWire. List ALL injuries.`;

          const [awayResult, homeResult] = await Promise.all([
            model.generateContent(buildTeamQuery(awayTeam, awayShort)),
            model.generateContent(buildTeamQuery(homeTeam, homeShort))
          ]);

          cleanAway = ((awayResult.response?.text() || '').trim()).replace(/\*\*/g, '');
          cleanHome = ((homeResult.response?.text() || '').trim()).replace(/\*\*/g, '');
        }
      }

      const responseText = `=== ${awayTeam} ===\n${cleanAway}\n\n=== ${homeTeam} ===\n${cleanHome}`;
      console.log(`[Scout Report] RotoWire responses: ${awayTeam} (${cleanAway.length} chars), ${homeTeam} (${cleanHome.length} chars)`);

      if (responseText) {
        console.log(`[Scout Report] RotoWire response: ${responseText.substring(0, 500)}`);
        // Log individual team responses for parser debugging
        console.log(`[Scout Report] ${awayTeam} clean response (${cleanAway.length} chars): ${cleanAway.substring(0, 300)}`);
        console.log(`[Scout Report] ${homeTeam} clean response (${cleanHome.length} chars): ${cleanHome.substring(0, 300)}`);

        // STEP 1.5: Parse INJURIES from RotoWire response (NCAAB)
        // The RotoWire response often has INJURIES section like: "INJURIES:\nG Jahseem Felton OFS\nF Patrick Suemnick Out"
        const parseNcaabInjuriesFromResponse = (text, teamName, otherTeamName) => {
          const parsedInjuries = [];
          const teamLower = teamName.toLowerCase();
          const otherTeamLower = (otherTeamName || '').toLowerCase();

          // Extract team-specific INJURIES section
          const sectionPatterns = [
            new RegExp(`===\\s*${teamLower}.*?===([\\s\\S]*?)(?:===|$)`, 'i'),
            new RegExp(`\\*\\*${teamLower}.*?\\*\\*([\\s\\S]*?)(?:\\*\\*${otherTeamLower}|===|$)`, 'i'),
          ];

          let teamSection = '';
          for (const pattern of sectionPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
              teamSection = match[1];
              break;
            }
          }

          if (!teamSection) teamSection = text;

          // Look for INJURIES: section within team section
          const injuriesMatch = teamSection.match(/INJURIES?:?\s*\n?([\s\S]*?)(?:\n===|\n\*\*|$)/i);
          if (!injuriesMatch) return parsedInjuries;

          const injuriesText = injuriesMatch[1];

          // NCAAB RotoWire format: "G Jahseem Felton OFS" or "F Patrick Suemnick Out"
          // Position: PG, SG, SF, PF, C, G, F
          // Status: Out, OFS, GTD
          // Use [ \t] instead of \s to prevent matching across newlines
          const injuryPattern = /\b(PG|SG|SF|PF|C|G|F)[ \t]+([A-Z][a-z'.-]+(?:[ \t]+[A-Z][a-z'.-]+)*)[ \t]+(Out|OFS|GTD)\b/gi;
          const matches = [...injuriesText.matchAll(injuryPattern)];

          for (const match of matches) {
            const position = match[1];
            const playerName = match[2];
            const status = match[3].toUpperCase();

            // Normalize status and add freshness tags per injury timing rules
            let normalizedStatus = status;
            let duration = 'UNKNOWN';
            let freshnessTip = '';

            if (status === 'OFS') {
              normalizedStatus = 'Out (Season)';
              duration = 'SEASON-LONG';
              freshnessTip = 'SEASON-LONG absence.';
            } else if (status === 'GTD') {
              normalizedStatus = 'GTD';
              duration = 'FRESH';
              freshnessTip = 'GAME-TIME DECISION.';
            } else if (status === 'OUT') {
              duration = 'UNKNOWN';
              freshnessTip = 'STATUS: OUT — duration unknown.';
            }

            const nameParts = playerName.trim().split(/\s+/);
            parsedInjuries.push({
              player: {
                first_name: nameParts[0],
                last_name: nameParts.slice(1).join(' '),
                position: position
              },
              status: normalizedStatus,
              duration,
              freshnessTip,
              source: 'rotowire'
            });
            console.log(`[Scout Report] NCAAB RotoWire injury found: ${position} ${playerName} ${status} [${duration}] for ${teamName}`);
          }

          return parsedInjuries;
        };

        // Parse injuries from INDIVIDUAL team responses (not combined text)
        rotoWireInjuries.away = parseNcaabInjuriesFromResponse(cleanAway, awayTeam, homeTeam);
        rotoWireInjuries.home = parseNcaabInjuriesFromResponse(cleanHome, homeTeam, awayTeam);
        if (rotoWireInjuries.away.length > 0 || rotoWireInjuries.home.length > 0) {
          console.log(`[Scout Report] NCAAB RotoWire injuries parsed: ${rotoWireInjuries.away.length} for ${awayTeam}, ${rotoWireInjuries.home.length} for ${homeTeam}`);

          // CRITICAL: Merge RotoWire injuries into the injuries object NOW
          if (!injuries.home) injuries.home = [];
          if (!injuries.away) injuries.away = [];

          const existingHomeNames = new Set((injuries.home || []).map(i =>
            `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.toLowerCase().trim()
          ));
          const existingAwayNames = new Set((injuries.away || []).map(i =>
            `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.toLowerCase().trim()
          ));

          // Add injuries from RotoWire that grounding missed
          for (const inj of rotoWireInjuries.home) {
            const name = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.toLowerCase().trim();
            if (!existingHomeNames.has(name)) {
              injuries.home.push(inj);
              console.log(`[Scout Report] Added NCAAB injury to report: ${name} (${inj.status}) for ${homeTeam}`);
            }
          }
          for (const inj of rotoWireInjuries.away) {
            const name = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.toLowerCase().trim();
            if (!existingAwayNames.has(name)) {
              injuries.away.push(inj);
              console.log(`[Scout Report] Added NCAAB injury to report: ${name} (${inj.status}) for ${awayTeam}`);
            }
          }

          // ═══════════════════════════════════════════════════════════════════════
          // NCAAB Duration Enrichment: Resolve UNKNOWN durations via BDL game logs
          // For OUT/Questionable players with no duration info, check when they last played
          // ═══════════════════════════════════════════════════════════════════════
          const allNcaabInjuries = [...(injuries.home || []), ...(injuries.away || [])];
          const unknownDurationInjuries = allNcaabInjuries.filter(inj => {
            if (inj.daysSinceReport) return false; // already enriched
            const statusLower = (inj.status || '').toLowerCase();
            // Skip OFS (Out For Season) — duration is already known as season-long, no BDL lookup needed
            if (statusLower === 'ofs' || statusLower.includes('out for season') || statusLower.includes('out (season)')) {
              const pName = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
              inj.daysSinceReport = 90;
              inj.duration = 'SEASON-LONG';
              inj.durationSource = 'status_ofs';
              console.log(`[Scout Report] NCAAB: ${pName} is OFS — skipping game-log lookup, marking SEASON-LONG`);
              return false;
            }
            return statusLower.includes('out') || statusLower === 'gtd' ||
                   statusLower.includes('questionable') || statusLower.includes('doubtful');
          });

          if (unknownDurationInjuries.length > 0) {
            console.log(`[Scout Report] NCAAB: ${unknownDurationInjuries.length} injuries need duration enrichment`);
            try {
              const bdlSportKey = 'basketball_ncaab';
              const ncaabTeams = await ballDontLieService.getTeams(bdlSportKey);
              const homeTeamBdl = findTeam(ncaabTeams, homeTeam);
              const awayTeamBdl = findTeam(ncaabTeams, awayTeam);

              if (homeTeamBdl?.id || awayTeamBdl?.id) {
                // Fetch active players for both teams to resolve names -> BDL IDs
                const [homePlayersRaw, awayPlayersRaw] = await Promise.all([
                  homeTeamBdl ? ballDontLieService.getPlayersActive(bdlSportKey, { team_ids: [homeTeamBdl.id], per_page: 25 }) : { data: [] },
                  awayTeamBdl ? ballDontLieService.getPlayersActive(bdlSportKey, { team_ids: [awayTeamBdl.id], per_page: 25 }) : { data: [] }
                ]);

                const allBdlPlayers = [
                  ...(Array.isArray(homePlayersRaw) ? homePlayersRaw : homePlayersRaw?.data || []),
                  ...(Array.isArray(awayPlayersRaw) ? awayPlayersRaw : awayPlayersRaw?.data || [])
                ];

                // Match injured players to BDL player IDs by name
                const playerIdsToCheck = [];
                const idToInjuryMap = new Map();
                for (const inj of unknownDurationInjuries) {
                  const injName = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.toLowerCase().trim();
                  const match = allBdlPlayers.find(p => {
                    const bdlName = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase().trim();
                    return bdlName === injName || playerNamesMatch(bdlName, injName);
                  });
                  if (match?.id) {
                    playerIdsToCheck.push(match.id);
                    idToInjuryMap.set(match.id, inj);
                  } else {
                    console.log(`[Scout Report] NCAAB: No BDL match for injured player "${injName}"`);
                  }
                }

                if (playerIdsToCheck.length > 0) {
                  console.log(`[Scout Report] NCAAB game-log fallback: checking ${playerIdsToCheck.length} players`);

                  const endDate = new Date().toISOString().slice(0, 10);
                  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                  const stats = await ballDontLieService.getPlayerStats(bdlSportKey, {
                    player_ids: playerIdsToCheck,
                    start_date: startDate,
                    end_date: endDate,
                    per_page: 100
                  }, 5);

                  for (const [playerId, inj] of idToInjuryMap) {
                    const playerGames = (stats || [])
                      .filter(s => s.player?.id === playerId && parseFloat(s.min || '0') > 0)
                      .sort((a, b) => new Date(b.game?.date) - new Date(a.game?.date));

                    const pName = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();

                    if (playerGames.length > 0) {
                      const lastPlayedDate = new Date(playerGames[0].game.date);
                      const daysSince = Math.floor((Date.now() - lastPlayedDate) / (1000 * 60 * 60 * 24));

                      inj.daysSinceReport = daysSince;
                      inj.reportDateStr = lastPlayedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      // GTD players keep their duration — they might return tonight regardless of absence length
                      if ((inj.status || '').toUpperCase() !== 'GTD') {
                        // NCAAB-specific duration tiers with market context
                        if (daysSince >= 90) inj.duration = 'SEASON-LONG';
                        else if (daysSince >= 20) inj.duration = 'LONG-TERM';
                        else if (daysSince >= 10) inj.duration = 'SHORT-TERM';
                        else inj.duration = 'FRESH';
                      }
                      inj.durationSource = 'game_log';

                      console.log(`[Scout Report] NCAAB game-log: ${pName} last played ${inj.reportDateStr} (${daysSince}d ago) -> ${inj.duration}`);
                    } else {
                      inj.daysSinceReport = 90;
                      inj.reportDateStr = 'before season';
                      inj.duration = 'SEASON-LONG';
                      inj.durationSource = 'game_log_no_games';

                      console.log(`[Scout Report] NCAAB game-log: ${pName} no games in 90 days -> SEASON-LONG`);
                    }
                  }
                }
              }
            } catch (e) {
              console.warn(`[Scout Report] NCAAB duration enrichment failed: ${e.message}`);
            }
          }
        }

        // STEP 2: Parse GTD players from response
        // Parse response - handle multiple formats including our explicit format

        // NEW FORMAT: Explicit "TeamName GTD PLAYERS:" format from our query
        const parseExplicitGTDFormat = (text, teamName, teamShort) => {
          const gtdPlayers = [];
          const teamNameLower = teamName.toLowerCase();
          const teamShortLower = teamShort.toLowerCase();
          const invalidNames = /^(None|No|Unknown|none|N\/A|STARTERS|Starters)$/i;

          // Strip markdown formatting for cleaner parsing
          const cleanText = text.replace(/\*\*/g, '');

          const teamShortEscaped = escapeRegex(teamShortLower);
          const teamNameEscaped = escapeRegex(teamNameLower);

          const patterns = [
            // "Full Team Name GTD PLAYERS: Name1, Name2" - most explicit format (check full name first!)
            new RegExp(`${teamNameEscaped}\\s+GTD\\s+PLAYERS?:?\\s*([^\\n*]+)`, 'i'),
            // "Team Short Name ... GTD PLAYERS: Name1, Name2" - allow words between short name and GTD
            new RegExp(`${teamShortEscaped}[^\\n]*?GTD\\s+PLAYERS?:?\\s*([^\\n*]+)`, 'i'),
            // "TeamName GTD:" format (simpler)
            new RegExp(`${teamNameEscaped}\\s+GTD:?\\s*([^\\n*]+)`, 'i'),
            new RegExp(`${teamShortEscaped}[^\\n]*?GTD:?\\s*([^\\n*]+)`, 'i'),
            // "GTD - TeamName: Name1, Name2"
            new RegExp(`GTD\\s*[-:]?\\s*${teamShortEscaped}:?\\s*([^\\n*]+)`, 'i')
          ];

          for (const pattern of patterns) {
            const match = cleanText.match(pattern);
            if (match) {
              const playerList = match[1].trim();
              if (invalidNames.test(playerList)) {
                console.log(`[Scout Report] Explicit GTD format found for ${teamShort}: none`);
                return [];
              }
              // SAFETY: Skip if we accidentally captured a STARTERS section or another team's GTD
              if (/STARTERS?:|starting\s*lineup/i.test(playerList)) {
                console.log(`[Scout Report] Skipping GTD match for ${teamShort} - accidentally matched STARTERS section`);
                continue; // Try next pattern
              }
              // SAFETY: Stop at the next team's GTD section if present (don't bleed into other teams)
              const nextGTDIndex = playerList.search(/\w+\s+(Golden|Blue|Bears|Jayhawks|Friars|Bluejays|Hoyas|Cyclones).*GTD/i);
              const cleanPlayerList = nextGTDIndex > 0 ? playerList.substring(0, nextGTDIndex).trim() : playerList;

              // Split by comma and extract names
              const names = cleanPlayerList.split(/[,;]/).map(n => n.trim());
              for (const name of names) {
                const cleanName = name.replace(/\s*\([^)]*\)/g, '').trim(); // Remove parenthetical
                if (cleanName.length > 2 &&
                    cleanName.length < 40 &&
                    cleanName.match(/^[A-Z]/) &&
                    !invalidNames.test(cleanName) &&
                    !/^(PG|SG|SF|PF|C)$/i.test(cleanName) &&
                    !/STARTERS?|LINEUP|PLAYERS?|GTD|OUT/i.test(cleanName)) {
                  gtdPlayers.push({ name: cleanName, status: 'GTD' });
                }
              }
              if (gtdPlayers.length > 0) {
                console.log(`[Scout Report] Explicit GTD format for ${teamShort}: ${gtdPlayers.map(p => p.name).join(', ')}`);
                return gtdPlayers;
              }
            }
          }
          return gtdPlayers;
        };

        // Try explicit format first
        const explicitAwayGTD = parseExplicitGTDFormat(responseText, awayTeam, awayShort);
        const explicitHomeGTD = parseExplicitGTDFormat(responseText, homeTeam, homeShort);

        // Check if Gemini couldn't find the info (returns "unable to provide" etc)
        const cantFindInfo = responseText.toLowerCase().includes('unable to provide') ||
                             responseText.toLowerCase().includes("i don't have access") ||
                             responseText.toLowerCase().includes("cannot provide") ||
                             responseText.toLowerCase().includes("i am unable");

        if (cantFindInfo) {
          console.log(`[Scout Report] Gemini couldn't access RotoWire GTD data - will use narrative context fallback`);
          rotoWireGTD.away = [];
          rotoWireGTD.home = [];
        } else if (explicitAwayGTD.length > 0 || explicitHomeGTD.length > 0) {
          rotoWireGTD.away = explicitAwayGTD;
          rotoWireGTD.home = explicitHomeGTD;
        } else {
          // No explicit GTD format found — narrative context + BDL injury data fallbacks will handle it
          console.log(`[Scout Report] No explicit GTD format in RotoWire response — falling back to injury data + narrative context`);
        }

        if (rotoWireGTD.home.length > 0 || rotoWireGTD.away.length > 0) {
          console.log(`[Scout Report] RotoWire GTD found - ${homeTeam}: ${rotoWireGTD.home.map(p => p.name).join(', ') || 'none'}, ${awayTeam}: ${rotoWireGTD.away.map(p => p.name).join(', ') || 'none'}`);
        }
      }
  } catch (e) {
    console.warn(`[Scout Report] RotoWire GTD/injury check failed: ${e.message}`);
  }

  // ENHANCED: Parse GTD directly from narrative context since Gemini often loses GTD status
  const parseGTDFromNarrative = (teamName, narrativeText) => {
    if (!narrativeText) return [];

    const gtdPlayers = [];
    const text = narrativeText;

    // Format 1: "**Luke Naser (G):** Questionable / Game-Time Decision (GTD)"
    const pattern1 = /\*\*([A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+)?)\s*\([^)]+\):\*\*[^*\n]*(?:GTD|Game-Time Decision)/gi;

    // Format 2: "Player Name GTD" or "Player Name (GTD)"
    const pattern2 = /([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Za-z'-]+)\s*(?:\([^)]*\))?\s*[-–]?\s*(?:\*\*)?GTD(?:\*\*)?/gi;

    // Format 3: "G Player Name GTD" (position prefix)
    const pattern3 = /(?:PG|SG|SF|PF|C|G|F)\s+([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Za-z'-]+)\s*(?:\([^)]*\))?\s*[-–]?\s*(?:\*\*)?GTD(?:\*\*)?/gi;

    // Format 4: Player name followed by : and status containing GTD
    const pattern4 = /\*?\s*([A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+)?)[^:]*:\s*[^*\n]*(?:GTD|Game-Time Decision)/gi;

    const patterns = [pattern1, pattern4, pattern2, pattern3];
    const foundPlayers = new Set();
    const invalidNames = /^(Season|Recent|January|Questionable|Status|Injury|Game)$/i;

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let playerName = match[1].trim();
        playerName = playerName.replace(/\s*\([^)]*\)$/, '');
        if (playerName.length > 2 &&
            !foundPlayers.has(playerName.toLowerCase()) &&
            !invalidNames.test(playerName)) {
          foundPlayers.add(playerName.toLowerCase());
          gtdPlayers.push({ name: playerName, status: 'GTD' });
        }
      }
    }

    return gtdPlayers;
  };

  // Also check the structured injury data
  const countGTDFromInjuries = (teamInjuries) => {
    if (!teamInjuries || teamInjuries.length === 0) return [];

    return teamInjuries.filter(i => {
      const status = (i.status || '').toLowerCase();
      return gtdStatuses.some(s => status.includes(s));
    }).map(i => {
      const name = i.player ? `${i.player.first_name} ${i.player.last_name}` : (i.name || 'Unknown');
      return { name, status: i.status };
    });
  };

  // Priority 1: Use dedicated RotoWire GTD search (most accurate)
  let homeGTD = rotoWireGTD.home;
  let awayGTD = rotoWireGTD.away;

  // Priority 2: Fall back to structured injury data if RotoWire search returned nothing
  if (homeGTD.length === 0 && awayGTD.length === 0) {
    homeGTD = countGTDFromInjuries(injuries.home);
    awayGTD = countGTDFromInjuries(injuries.away);
  }

  // Priority 3: Parse narrative context directly as last resort
  if (homeGTD.length === 0 && awayGTD.length === 0 && injuries.narrativeContext) {
    console.log(`[Scout Report] Parsing narrative context for GTD mentions...`);
    const narrativeGTD = parseGTDFromNarrative('', injuries.narrativeContext);
    if (narrativeGTD.length > 0) {
      console.log(`[Scout Report] Found ${narrativeGTD.length} GTD player(s) in narrative: ${narrativeGTD.map(p => p.name).join(', ')}`);
      homeGTD = narrativeGTD; // Conservative: assume all GTD could affect the game
    }
  }

  console.log(`[Scout Report] NCAAB GTD Check - ${homeTeam}: ${homeGTD.length} GTD players, ${awayTeam}: ${awayGTD.length} GTD players`);

  if (homeGTD.length > 0) {
    console.log(`[Scout Report]   ${homeTeam} GTD: ${homeGTD.map(p => `${p.name} (${p.status})`).join(', ')}`);
  }
  if (awayGTD.length > 0) {
    console.log(`[Scout Report]   ${awayTeam} GTD: ${awayGTD.map(p => `${p.name} (${p.status})`).join(', ')}`);
  }

  // ===================================================================
  // Step I: Detect returning players (uses L5 playersByGame data)
  // ===================================================================
  const returningPlayersSection = ncaabRosterDepth
    ? detectReturningPlayers(ncaabRosterDepth, injuries, recentHome, recentAway, homeTeam, awayTeam)
    : '';

  // ===================================================================
  // Step I2: Filter STALE injured players from key players list
  // Runs AFTER duration enrichment (Step H) so inj.duration is populated.
  // SHORT-TERM, LONG-TERM, SEASON-LONG are already reflected in team stats.
  // ===================================================================
  if (ncaabKeyPlayers && injuries) {
    const allInjured = [...(injuries.home || []), ...(injuries.away || [])];
    const staleOutNames = allInjured
      .filter(inj => {
        const s = (inj.status || '').toLowerCase();
        const isOut = s === 'out' || s.includes('out for season') || s === 'ir' || s === 'ltir' || s === 'ofs';
        const duration = (inj.duration || '').toUpperCase();
        // Keep FRESH injuries — team just lost this player, stats don't reflect it yet
        // Filter SHORT-TERM, LONG-TERM, SEASON-LONG — team has adapted, stats reflect the absence
        return isOut && duration && duration !== 'FRESH';
      })
      .map(inj => {
        const name = typeof inj.player === 'string' ? inj.player :
          `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
        return name.toLowerCase();
      })
      .filter(n => n);

    if (staleOutNames.length > 0) {
      const filterStaleFromKeyPlayers = (players) => {
        if (!players || !Array.isArray(players)) return players;
        return players.filter(p => {
          const pName = (p.name || '').toLowerCase();
          const isStale = staleOutNames.some(outName => playerNamesMatch(pName, outName));
          if (isStale) {
            console.log(`[Scout Report] Removed stale injured player from key players: ${p.name} (duration: not FRESH)`);
          }
          return !isStale;
        });
      };
      ncaabKeyPlayers.home = filterStaleFromKeyPlayers(ncaabKeyPlayers.home);
      ncaabKeyPlayers.away = filterStaleFromKeyPlayers(ncaabKeyPlayers.away);
    }
  }

  // ===================================================================
  // Step J: Assemble report
  // ===================================================================
  let narrativeContext = injuries?.narrativeContext || null;

  const matchupLabel = game.isNeutralSite ? `${awayTeam} vs ${homeTeam}` : `${awayTeam} @ ${homeTeam}`;
  const venueLabel = game.venue || (game.isNeutralSite ? 'Neutral Site' : `${homeTeam} Home`);
  const tournamentLabel = game.tournamentContext ? `[${game.tournamentContext}]` : '';

  // Dynamic season label (e.g., "2025-26")
  const _now = new Date();
  const _yr = _now.getFullYear();
  const _mo = _now.getMonth() + 1;
  const seasonLabel = _mo >= 7 ? `${_yr}-${String(_yr + 1).slice(2)}` : `${_yr - 1}-${String(_yr).slice(2)}`;

  // Build game context section
  let gameContextSection = '';
  if (game.gameSignificance && game.tournamentContext) {
    gameContextSection = `
GAME CONTEXT & SIGNIFICANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${game.gameSignificance}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
  }

  // Generate injury report
  const injuryReportText = formatInjuryReport(homeTeam, awayTeam, injuries, sportKey, null);

  // Debug: Log the injury report
  if (injuryReportText && injuryReportText.length > 50) {
    console.log(`[Scout Report] Injury report preview (${injuryReportText.length} chars):`);
    console.log(injuryReportText.substring(0, 3000));
    if (injuryReportText.length > 3000) console.log('...[log truncated, full report sent to Gary]');
  }

  // Build verified Tale of Tape — merge Barttorvik data into seasonStats for tape builder
  const homeStatsForTape = { ...(homeProfile?.seasonStats || {}), barttorvik: bartData?.home?.data };
  const awayStatsForTape = { ...(awayProfile?.seasonStats || {}), barttorvik: bartData?.away?.data };
  const verifiedTaleOfTape = buildVerifiedTaleOfTape(
    homeTeam, awayTeam,
    { ...homeProfile, seasonStats: homeStatsForTape },
    { ...awayProfile, seasonStats: awayStatsForTape },
    sportKey, injuries, recentHome, recentAway
  );

  const report = `
══════════════════════════════════════════════════════════════════════
MATCHUP: ${matchupLabel}
Sport: ${sportKey} | ${game.commence_time ? formatGameTime(game.commence_time) : 'Time TBD'}
${game.venue ? `Venue: ${venueLabel}` : ''}${tournamentLabel ? `\n${tournamentLabel}` : ''}
══════════════════════════════════════════════════════════════════════
${gameContextSection}${ncaabStandingsSnapshot || ''}
INJURY REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${injuryReportText}
${formatStartingLineups(homeTeam, awayTeam, injuries.lineups)}
${returningPlayersSection}${narrativeContext ? `
CURRENT STATE & CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━
Recent news, storylines, and context for both teams.

${narrativeContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}
REST & SCHEDULE SITUATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatRestSituation(homeTeam, awayTeam, calculateRestSituation(recentHome, game.commence_time, homeTeam), calculateRestSituation(recentAway, game.commence_time, awayTeam))}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${ncaabRankings || ncaabHomeCourt ? formatNcaabRankingsAndHomeCourt(ncaabRankings, ncaabHomeCourt, homeTeam, awayTeam) : ''}${ncaabKeyPlayers ? formatNcaabKeyPlayers(homeTeam, awayTeam, ncaabKeyPlayers) : ''}${ncaabRosterDepth ? formatNcaabRosterDepth(homeTeam, awayTeam, ncaabRosterDepth, injuries) : ''}

RECENT FORM (Last 3 Games)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatRecentForm(homeTeam, recentHome, 3)}
${formatRecentForm(awayTeam, recentAway, 3)}
HEAD-TO-HEAD HISTORY (${seasonLabel} SEASON)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatH2HSection(h2hData, homeTeam, awayTeam)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BETTING CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatOdds(game, sportKey)}
`.trim();

  // ===================================================================
  // Step K: Return standard object shape
  // ===================================================================
  // Recalculate injuriesForStorage AFTER RotoWire merge + duration enrichment
  const finalInjuriesForStorage = formatInjuriesForStorage(injuries);

  return {
    text: report,
    tokenMenu: formatTokenMenu(sportKey),
    injuries: finalInjuriesForStorage,
    verifiedTaleOfTape,
    homeRecord: homeProfile?.record || null,
    awayRecord: awayProfile?.record || null,
    venue: game.venue || null,
    isNeutralSite: game.isNeutralSite || false,
    tournamentContext: game.tournamentContext || null,
    gameSignificance: game.gameSignificance || null,
    cfpRound: null,
    homeSeed: game.homeSeed || null,
    awaySeed: game.awaySeed || null,
    // NCAAB conference data for app filtering
    homeConference: game.homeConference || null,
    awayConference: game.awayConference || null,
    // AP Poll rankings for pick cards
    homeRanking: ncaabRankings?.home?.ap?.rank || null,
    awayRanking: ncaabRankings?.away?.ap?.rank || null
  };
}
