/**
 * NCAAF Scout Report Builder
 * Extracted from scoutReportBuilder.js — all NCAAF-specific logic
 *
 * NCAAF does NOT have:
 * - Injury duration resolution
 * - Roster depth from BDL
 * - Returning players detection
 *
 * NCAAF uses nflSeason() for season year (same timing)
 */

import { ballDontLieService } from '../../../ballDontLieService.js';
import { generateGameSignificance } from '../gameSignificanceGenerator.js';
import { formatTokenMenu } from '../../tools/toolDefinitions.js';
import { sportToBdlKey, findTeam, escapeRegex, formatGameTime } from '../shared/utilities.js';
import { geminiGroundingSearch, fetchStandingsSnapshot } from '../shared/grounding.js';
import {
  fetchTeamProfile,
  fetchInjuries,
  fetchRecentGames,
  fetchH2HData,
  scrubNarrative,
  formatInjuryReport,
  formatStartingLineups,
  formatSituationalFactors,
  formatOdds,
  formatSportsbookComparison,
  formatRestSituation,
  calculateRestSituation,
  formatRecentForm,
  formatH2HSection,
  formatTeamIdentity
} from '../shared/dataFetchers.js';
import { buildVerifiedTaleOfTape } from '../shared/taleOfTape.js';
// Import QB helpers from NFL builder (shared between NFL and NCAAF)
import { fetchStartingQBs, formatStartingQBs } from './nfl.js';

// ═══════════════════════════════════════════════════════════════════
// CFP SEEDING & BOWL GAME CONSTANTS
// ═══════════════════════════════════════════════════════════════════

/**
 * 2025-26 College Football Playoff Seeding (12-team bracket)
 * Hardcoded for the CURRENT 2025-26 season only.
 */
const CFP_2025_26_SEEDING = {
  // 4 Byes (seeds 1-4) - Conference Champions
  'Indiana Hoosiers': 1,
  'Indiana': 1,
  'Ohio State Buckeyes': 2,
  'Ohio State': 2,
  'Georgia Bulldogs': 3,
  'Georgia': 3,
  'Texas Tech Red Raiders': 4,
  'Texas Tech': 4,
  // First Round Hosts (seeds 5-8)
  'Oregon Ducks': 5,
  'Oregon': 5,
  'Ole Miss Rebels': 6,
  'Ole Miss': 6,
  'Texas A&M Aggies': 7,
  'Texas A&M': 7,
  'Oklahoma Sooners': 8,
  'Oklahoma': 8,
  // Remaining At-Large / G5 (seeds 9-12)
  'Alabama Crimson Tide': 9,
  'Alabama': 9,
  'Miami Hurricanes': 10,
  'Miami': 10,
  'Miami (FL)': 10,
  'Tulane Green Wave': 11,
  'Tulane': 11,
  'James Madison Dukes': 12,
  'James Madison': 12,
  'JMU': 12
};

/**
 * TIER 2 Bowls: Major conference bowls with good payouts
 * Generally motivated, some opt-outs possible
 */
const tier2Bowls = [
  'citrus bowl', 'music city bowl', 'gator bowl', 'alamo bowl',
  'sun bowl', 'reliaquest bowl', 'holiday bowl', 'liberty bowl',
  'las vegas bowl', 'texas bowl', 'pop-tarts bowl', 'duke mayo bowl',
  'pinstripe bowl', 'military bowl', 'fenway bowl'
];

/**
 * TIER 3 Bowls: Lower-tier bowls with transfer portal opt-out risk
 * Motivation asymmetry common
 */
const tier3Bowls = [
  'first responder bowl', 'gasparilla bowl', 'birmingham bowl',
  'independence bowl', 'guaranteed rate bowl', 'lendingtree bowl',
  'new mexico bowl', 'cure bowl', 'boca raton bowl', 'camellia bowl',
  'famous idaho potato bowl', 'frisco bowl', 'myrtle beach bowl',
  'quick lane bowl', 'armed forces bowl', 'hawaii bowl',
  'new orleans bowl', 'bahamas bowl', 'celebration bowl'
];

// ═══════════════════════════════════════════════════════════════════
// NCAAF CONFERENCE TIER CONSTANTS
// ═══════════════════════════════════════════════════════════════════

/**
 * NCAAF Conference Tier Mapping
 * Uses BDL conference IDs (from /ncaaf/v1/conferences)
 * Tiers reflect typical talent/resources, NOT current performance
 */

// BDL Conference ID to Tier Mapping
const CONFERENCE_ID_TIERS = {
  // Tier 1: Elite Power 4
  10: { tier: 1, name: 'SEC', label: 'Elite Power 4' },
  4: { tier: 1, name: 'Big Ten', label: 'Elite Power 4' },
  // Tier 2: Power 4
  1: { tier: 2, name: 'ACC', label: 'Power 4' },
  3: { tier: 2, name: 'Big 12', label: 'Power 4' },
  9: { tier: 2, name: 'Pac-12', label: 'Power 4' },
  6: { tier: 2, name: 'FBS Indep.', label: 'FBS Independent' },
  // Tier 3: Upper G5
  2: { tier: 3, name: 'American', label: 'Upper G5' },
  8: { tier: 3, name: 'Mountain West', label: 'Upper G5' },
  // Tier 4: Lower G5
  5: { tier: 4, name: 'CUSA', label: 'Lower G5' },
  7: { tier: 4, name: 'MAC', label: 'Lower G5' },
  11: { tier: 4, name: 'Sun Belt', label: 'Lower G5' },
};

// Fallback by name
const NCAAF_CONFERENCE_TIERS = {
  'SEC': { tier: 1, label: 'Elite Power 4' },
  'Big Ten': { tier: 1, label: 'Elite Power 4' },
  'Big 12': { tier: 2, label: 'Power 4' },
  'ACC': { tier: 2, label: 'Power 4' },
  'American': { tier: 3, label: 'Upper G5' },
  'Mountain West': { tier: 3, label: 'Upper G5' },
  'CUSA': { tier: 4, label: 'Lower G5' },
  'MAC': { tier: 4, label: 'Lower G5' },
  'Sun Belt': { tier: 4, label: 'Lower G5' },
  'FBS Indep.': { tier: 2, label: 'FBS Independent' },
};

const TEAM_TIER_OVERRIDES = {
  'Notre Dame Fighting Irish': { tier: 1, label: 'Elite Independent', conference: 'FBS Indep.' },
  'Notre Dame': { tier: 1, label: 'Elite Independent', conference: 'FBS Indep.' },
  'Army Black Knights': { tier: 3, label: 'Upper Independent', conference: 'FBS Indep.' },
  'Navy Midshipmen': { tier: 3, label: 'Upper Independent', conference: 'FBS Indep.' },
  'UConn Huskies': { tier: 4, label: 'Lower Independent', conference: 'FBS Indep.' },
  'UMass Minutemen': { tier: 4, label: 'Lower Independent', conference: 'FBS Indep.' },
};

// ═══════════════════════════════════════════════════════════════════
// CFP HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get CFP seeding from hardcoded bracket
 */
function getCfpSeedingFromBracket(teamName) {
  if (!teamName) return null;

  // Direct match
  if (CFP_2025_26_SEEDING[teamName]) {
    return CFP_2025_26_SEEDING[teamName];
  }

  // Try partial match (school name only)
  const teamLower = teamName.toLowerCase();
  for (const [key, seed] of Object.entries(CFP_2025_26_SEEDING)) {
    if (teamLower.includes(key.toLowerCase()) || key.toLowerCase().includes(teamLower.split(' ')[0])) {
      return seed;
    }
  }

  return null;
}

/**
 * Parse CFP seeding from text response
 * Looks for patterns like "#8 Oklahoma", "#9 seed Alabama", "(8) Oklahoma", "8-seed Oklahoma"
 * Also handles "Ole Miss is the higher seed (No. 6)" style from search results
 */
function parseCfpSeeding(text, teamName) {
  if (!text || !teamName) return getCfpSeedingFromBracket(teamName);

  const schoolName = teamName.split(' ')[0]; // e.g., "Alabama" from "Alabama Crimson Tide"
  const schoolNames = [teamName, schoolName];

  // Add variations for common schools
  if (schoolName === 'Ole') schoolNames.push('Ole Miss');
  if (schoolName === 'Texas' && teamName.includes('A&M')) schoolNames.push('Texas A&M', 'A&M');
  if (schoolName === 'James' && teamName.includes('Madison')) schoolNames.push('JMU', 'James Madison');

  const patterns = [];

  for (const name of schoolNames) {
    const escapedName = escapeRegex(name);
    patterns.push(
      // #8 Oklahoma, #9 Alabama
      new RegExp(`#(\\d+)\\s*(?:seed\\s+)?${escapedName}`, 'i'),
      // Oklahoma (8), Miami (10)
      new RegExp(`${escapedName}\\s*\\(#?(\\d+)\\)`, 'i'),
      // (8) Oklahoma
      new RegExp(`\\((\\d+)\\)\\s*${escapedName}`, 'i'),
      // 8-seed Oklahoma, 9 seed Alabama
      new RegExp(`(\\d+)[-\\s]seed\\s+${escapedName}`, 'i'),
      // No. 8 Oklahoma
      new RegExp(`no\\.?\\s*(\\d+)\\s+${escapedName}`, 'i'),
      // Oklahoma #8
      new RegExp(`${escapedName}\\s+#(\\d+)`, 'i'),
      // "Ole Miss is ... (No. 6)" style from search results
      new RegExp(`${escapedName}\\s+is\\s+.*?\\(no\\.?\\s*(\\d+)\\)`, 'i'),
      new RegExp(`${escapedName}\\s+is\\s+.*?no\\.?\\s*(\\d+)\\s+seed`, 'i'),
      new RegExp(`${escapedName}\\s+is\\s+the\\s+(?:higher|lower)?\\s*seed\\s*\\(no\\.?\\s*(\\d+)\\)`, 'i'),
      // "No. 6 seed Ole Miss" or "the No. 11 seed, Tulane"
      new RegExp(`no\\.?\\s*(\\d+)\\s+seed[,\\s]+${escapedName}`, 'i'),
      new RegExp(`the\\s+no\\.?\\s*(\\d+)\\s+seed[,\\s]+${escapedName}`, 'i'),
      // Handle "Tulane is No. 11"
      new RegExp(`${escapedName}\\s+is\\s+no\\.?\\s*(\\d+)`, 'i')
    );
  }

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const seed = parseInt(match[1], 10);
      if (seed >= 1 && seed <= 16) {  // Valid CFP seeds are 1-12, but allow some buffer
        return seed;
      }
    }
  }

  // Fallback to hardcoded bracket if regex fails
  return getCfpSeedingFromBracket(teamName);
}

/**
 * Detect CFP round from text
 * Order matters - check specific rounds before generic terms
 */
function detectCfpRound(text) {
  if (!text) return null;

  const lowerText = text.toLowerCase();

  // Check First Round FIRST - most common for Dec 20-21 CFP games
  if (lowerText.includes('first round') || lowerText.includes('first-round') || lowerText.includes('opening round')) {
    return 'CFP First Round';
  }
  // Quarterfinal (Jan 1)
  if (lowerText.includes('quarterfinal') || lowerText.includes('quarter-final')) {
    return 'CFP Quarterfinal';
  }
  // Semifinal
  if (lowerText.includes('semifinal') || lowerText.includes('semi-final')) {
    return 'CFP Semifinal';
  }
  // Championship - be more specific to avoid false matches
  if (lowerText.includes('national championship') || lowerText.includes('cfp championship') ||
      (lowerText.includes('championship game') && !lowerText.includes('first round'))) {
    return 'CFP Championship';
  }
  // Generic CFP fallback
  if (lowerText.includes('playoff') || lowerText.includes('cfp')) {
    return 'CFP Playoff';
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════
// BOWL GAME FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * BOWL GAME TIER SYSTEM
 * Determines the tier of a bowl game and its motivation implications
 *
 * TIER 1 (Both teams highly motivated):
 * - CFP Playoff games (all rounds)
 * - NY6 Bowls (Rose, Sugar, Orange, Cotton, Peach, Fiesta)
 *
 * TIER 2 (Generally motivated, some opt-outs possible):
 * - Major conference bowls (Citrus, Music City, Gator, etc.)
 * - Premium mid-tier bowls with good payouts
 *
 * TIER 3 (Motivation asymmetry common):
 * - Lower-tier bowls (First Responder, Gasparilla, etc.)
 * - Transfer portal window creates opt-out risk
 * - One team often "wants it more"
 *
 * TIER 4 (High variance, significant opt-out risk):
 * - Minor bowls with low payouts
 * - Both teams may have significant roster attrition
 */
function determineBowlTier(game, homeTeam, awayTeam) {
  // Get bowl name from game data
  const bowlName = (game.name || game.title || game.bowl_name || '').toLowerCase();
  const venue = (game.venue || '').toLowerCase();

  // TIER 1: CFP and NY6 Bowls - Maximum motivation
  const tier1Bowls = [
    'cfp', 'playoff', 'national championship', 'championship game',
    'rose bowl', 'sugar bowl', 'orange bowl', 'cotton bowl', 'peach bowl', 'fiesta bowl'
  ];

  // Check if both teams are in the CFP bracket - strongly suggests a TIER 1 game during bowl season
  const isCfpMatchup = getCfpSeedingFromBracket(homeTeam) !== null && getCfpSeedingFromBracket(awayTeam) !== null;
  const gameDate = new Date(game.commence_time || game.date);
  const month = gameDate.getMonth();
  const day = gameDate.getDate();
  const isBowlSeason = (month === 11 && day >= 14) || (month === 0 && day <= 15);

  let tier = 3; // Default to tier 3 (common bowl game)
  let tierName = '';
  let motivationContext = '';

  // Force TIER 1 if it's a CFP matchup during bowl season
  let identifiedAsTier1 = false;
  for (const bowl of tier1Bowls) {
    if (bowlName.includes(bowl) || venue.includes(bowl)) {
      identifiedAsTier1 = true;
      break;
    }
  }

  if (identifiedAsTier1 || (isCfpMatchup && isBowlSeason)) {
    tier = 1;
    tierName = 'TIER 1 (CFP/NY6)';
    motivationContext = `
TIER 1 BOWL (CFP/NY6)`;
  }

  // Check for tier 2 if not already tier 1
  if (tier !== 1) {
    for (const bowl of tier2Bowls) {
      if (bowlName.includes(bowl) || venue.includes(bowl)) {
        tier = 2;
        tierName = 'TIER 2 (Major Conference)';
        motivationContext = `
TIER 2 BOWL (Major Conference)`;
        break;
      }
    }
  }

  // Check for tier 3
  if (tier !== 1 && tier !== 2) {
    for (const bowl of tier3Bowls) {
      if (bowlName.includes(bowl) || venue.includes(bowl)) {
        tier = 3;
        tierName = 'TIER 3 (Lower-Tier)';
        break;
      }
    }
  }

  // Default tier 3 message for lower-tier bowls
  if (tier === 3) {
    tierName = 'TIER 3 (Lower-Tier)';
    motivationContext = `
TIER 3 BOWL (Lower-Tier)
• Transfer portal window status: OPEN`;
  }

  // Build the section
  const section = `Bowl Tier: ${tierName}
${motivationContext}`;

  console.log(`[Scout Report] Bowl tier determined: ${tierName}`);

  return {
    tier,
    tierName,
    motivationContext,
    section
  };
}

/**
 * Fetch bowl game / CFP context for NCAAF games
 * Determines if this is a CFP game or bowl game and gets context
 * Also extracts and sets CFP seeding, venue, and round on the game object
 */
async function fetchBowlGameContext(homeTeam, awayTeam, game, groundingText = null) {
  try {
    // Check if this is likely a bowl/CFP game (December 14 - January 15)
    const gameDate = new Date(game.commence_time || game.date);
    const month = gameDate.getMonth(); // 0-indexed
    const day = gameDate.getDate();

    // Bowl/CFP season: Dec 14 - Jan 15 (month 11 = December, month 0 = January)
    const isBowlSeason = (month === 11 && day >= 14) || (month === 0 && day <= 15);

    if (!isBowlSeason) {
      return '';
    }

    console.log(`[Scout Report] Fetching bowl/CFP context for ${awayTeam} vs ${homeTeam}`);

    // Determine bowl tier and motivation context
    const bowlTierInfo = determineBowlTier(game, homeTeam, awayTeam);

    // Set tournament context and CFP info on the game object for storage
    if (bowlTierInfo) {
      // Normalize bowl name for the badge
      let bowlName = (game.name || game.title || game.bowl_name || '').trim();

      // If BDL name is missing, try to extract from grounding text
      if (!bowlName && groundingText) {
        const bowlNames = ['Rose Bowl', 'Sugar Bowl', 'Orange Bowl', 'Cotton Bowl', 'Peach Bowl', 'Fiesta Bowl',
                          'Citrus Bowl', 'ReliaQuest Bowl', 'Alamo Bowl', 'Sun Bowl', 'Music City Bowl', 'Gator Bowl'];
        for (const name of bowlNames) {
          if (groundingText.includes(name)) {
            bowlName = name;
            break;
          }
        }
      }

      // Fallback to Tier Name if still no specific bowl name
      game.tournamentContext = bowlName || bowlTierInfo.tierName;

      if (bowlTierInfo.tier === 1) {
        // Use grounding text if available for more accurate round detection
        const textForRoundDetection = (groundingText || '') + (game.name || '') + (game.title || '');
        game.cfpRound = detectCfpRound(textForRoundDetection);
        game.homeSeed = getCfpSeedingFromBracket(homeTeam);
        game.awaySeed = getCfpSeedingFromBracket(awayTeam);
      }
    }

    // Bowl context now provided by Gemini Grounding
    // Bowl/CFP context is captured in the main Gemini Grounding search
    // which provides coaching changes, opt-outs, injuries, venue info, etc.
    console.log('[Scout Report] Using Gemini Grounding for bowl context');

    // Return bowl tier context section
    if (bowlTierInfo) {
      return `
BOWL GAME TIER & MOTIVATION CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${bowlTierInfo.section}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
    }
    return '';
  } catch (error) {
    console.error('[Scout Report] Error fetching bowl/CFP context:', error.message);
    return '';
  }
}

// ═══════════════════════════════════════════════════════════════════
// CFP JOURNEY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Fetch CFP Road to Championship context for NCAAF playoff games
 * Uses Gemini Grounding to research each team's playoff journey
 * CRITICAL: Only uses web search data (no training data) for accurate 2025-26 CFP info
 *
 * This provides Gary with full context of how each team reached the championship:
 * - Each playoff game result and score
 * - Key storylines from each game
 * - Momentum and narrative heading into the final
 */
async function fetchCfpJourneyContext(homeTeam, awayTeam, game) {
  try {
    // Only fetch for CFP games (championship/semifinal/quarterfinal)
    const gameDate = new Date(game.commence_time || game.date);
    const month = gameDate.getMonth(); // 0-indexed
    const day = gameDate.getDate();

    // CFP games are typically Jan 1 - Jan 20
    // Skip if not in CFP window
    const isCfpWindow = (month === 0 && day >= 1 && day <= 20) || (month === 11 && day >= 20);
    if (!isCfpWindow) {
      return '';
    }

    // Check if this looks like a CFP game based on game name/context
    const gameName = (game.name || game.title || '').toLowerCase();
    const isCfpGame = gameName.includes('championship') ||
                      gameName.includes('semifinal') ||
                      gameName.includes('cfp') ||
                      gameName.includes('playoff') ||
                      gameName.includes('quarterfinal');

    // Also check if teams are ranked (likely CFP teams)
    // For now, fetch for any Jan game between ranked/notable teams

    console.log(`[Scout Report] Fetching CFP Road to Championship for ${awayTeam} vs ${homeTeam}`);

    // Use explicit date context to ensure Gemini uses web search, not training data
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    // Fetch journey for both teams in parallel
    const [homeJourney, awayJourney] = await Promise.all([
      fetchTeamCfpJourney(homeTeam, todayStr),
      fetchTeamCfpJourney(awayTeam, todayStr)
    ]);

    if (!homeJourney && !awayJourney) {
      console.log('[Scout Report] No CFP journey data available');
      return '';
    }

    // Format the section
    const lines = [
      '',
      'CFP ROAD TO THE CHAMPIONSHIP (2025-26 PLAYOFF JOURNEY)',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      'How each team reached this game:',
      ''
    ];

    if (homeJourney) {
      lines.push(`[${homeTeam.toUpperCase()}] PLAYOFF JOURNEY:`);
      lines.push(homeJourney);
      lines.push('');
    }

    if (awayJourney) {
      lines.push(`[${awayTeam.toUpperCase()}] PLAYOFF JOURNEY:`);
      lines.push(awayJourney);
      lines.push('');
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('Playoff journey data above shows game-by-game results and margins.');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');

    return lines.join('\n');

  } catch (error) {
    console.error('[Scout Report] Error fetching CFP journey context:', error.message);
    return '';
  }
}

/**
 * Fetch a single team's CFP playoff journey via Gemini Grounding
 * Uses explicit date context to force web search instead of training data
 */
async function fetchTeamCfpJourney(teamName, todayStr) {
  try {
    const query = `IMPORTANT: Today is ${todayStr}. This is the 2025-2026 College Football Playoff season.
DO NOT use any training data. ONLY use current web search results.

Search for: ${teamName} 2025-2026 College Football Playoff games results

For the ${teamName} college football team, provide their COMPLETE 2025-26 CFP playoff journey:

1. List EVERY CFP playoff game they have played this postseason (December ${new Date().getFullYear() - 1} - January ${new Date().getFullYear()})
2. For each game include:
   - Round (First Round, Quarterfinal, Semifinal)
   - Opponent
   - Final Score
   - Key storyline (who starred, what happened, was it close?)
   - Date played

3. Summarize their playoff momentum: Are they peaking? Did they struggle? Any concerning trends?

Format as a concise bullet list. If ${teamName} is NOT in the 2025-26 CFP, say "Not in 2025-26 CFP".
ONLY report ACTUAL games that have been PLAYED - do not predict future games.`;

    const result = await geminiGroundingSearch(query, {
      temperature: 1.0,
      maxTokens: 1200
    });

    if (!result?.success || !result?.data) {
      console.log(`[Scout Report] No CFP journey data for ${teamName}`);
      return null;
    }

    // Clean up the response
    let journeyText = result.data.trim();

    // Check if team is not in CFP
    if (journeyText.toLowerCase().includes('not in') &&
        journeyText.toLowerCase().includes('cfp')) {
      console.log(`[Scout Report] ${teamName} not in 2025-26 CFP`);
      return null;
    }

    // No truncation — Gary needs the full CFP journey context

    console.log(`[Scout Report] CFP journey fetched for ${teamName} (${journeyText.length} chars)`);
    return journeyText;

  } catch (error) {
    console.error(`[Scout Report] Error fetching CFP journey for ${teamName}:`, error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// NCAAF KEY PLAYERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Fetch key players for both NCAAF teams
 * Uses roster + season stats to show who's on the team
 * This prevents hallucinations about players who've transferred
 */
async function fetchNcaafKeyPlayers(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (bdlSport !== 'americanfootball_ncaaf') {
      return null;
    }

    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);

    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for NCAAF roster lookup');
      return null;
    }

    console.log(`[Scout Report] Fetching NCAAF rosters for ${homeTeam} (ID: ${homeTeamData?.id}) and ${awayTeam} (ID: ${awayTeamData?.id})`);

    // NCAAF season: Calculate dynamically - Aug-Dec = current year, Jan-Jul = previous year
    const ncaafMonth = new Date().getMonth() + 1;
    const ncaafYear = new Date().getFullYear();
    const season = ncaafMonth <= 7 ? ncaafYear - 1 : ncaafYear;

    // Fetch rosters and season stats for both teams in parallel
    const [homePlayers, awayPlayers, homeStats, awayStats] = await Promise.all([
      homeTeamData ? ballDontLieService.getNcaafTeamPlayers(homeTeamData.id) : [],
      awayTeamData ? ballDontLieService.getNcaafTeamPlayers(awayTeamData.id) : [],
      homeTeamData ? ballDontLieService.getNcaafPlayerSeasonStats(homeTeamData.id, season) : [],
      awayTeamData ? ballDontLieService.getNcaafPlayerSeasonStats(awayTeamData.id, season) : []
    ]);

    // Process each team's roster to get key players with stats
    const processTeamRoster = (players, seasonStats, teamName) => {
      if (!players || players.length === 0) return null;

      // Create a map of player stats by player ID
      const statsMap = {};
      (seasonStats || []).forEach(stat => {
        if (stat.player?.id) {
          // Only keep most recent season stats if multiple entries
          if (!statsMap[stat.player.id] || stat.season > (statsMap[stat.player.id].season || 0)) {
            statsMap[stat.player.id] = stat;
          }
        }
      });

      // Group by position
      const qbs = players.filter(p => ['QB'].includes(p.position_abbreviation?.toUpperCase()));
      const rbs = players.filter(p => ['RB', 'FB'].includes(p.position_abbreviation?.toUpperCase()));
      const wrs = players.filter(p => ['WR'].includes(p.position_abbreviation?.toUpperCase()));
      const tes = players.filter(p => ['TE'].includes(p.position_abbreviation?.toUpperCase()));
      const defensePlayers = players.filter(p => ['LB', 'DE', 'DT', 'CB', 'S', 'DB', 'DL', 'EDGE', 'NT', 'OLB', 'ILB', 'MLB', 'FS', 'SS'].includes(p.position_abbreviation?.toUpperCase()));

      // Enrich with stats and sort by production
      const enrichPlayer = (player) => {
        const stats = statsMap[player.id] || {};
        return {
          ...player,
          seasonStats: stats
        };
      };

      // Sort QBs by passing yards
      const sortedQBs = qbs.map(enrichPlayer)
        .sort((a, b) => (b.seasonStats.passing_yards || 0) - (a.seasonStats.passing_yards || 0))
        .slice(0, 2);

      // Sort RBs by rushing yards
      const sortedRBs = rbs.map(enrichPlayer)
        .sort((a, b) => (b.seasonStats.rushing_yards || 0) - (a.seasonStats.rushing_yards || 0))
        .slice(0, 2);

      // Sort WRs by receiving yards
      const sortedWRs = wrs.map(enrichPlayer)
        .sort((a, b) => (b.seasonStats.receiving_yards || 0) - (a.seasonStats.receiving_yards || 0))
        .slice(0, 3);

      // Sort TEs by receiving yards
      const sortedTEs = tes.map(enrichPlayer)
        .sort((a, b) => (b.seasonStats.receiving_yards || 0) - (a.seasonStats.receiving_yards || 0))
        .slice(0, 1);

      // Sort defense by tackles
      const sortedDefense = defensePlayers.map(enrichPlayer)
        .sort((a, b) => (b.seasonStats.total_tackles || 0) - (a.seasonStats.total_tackles || 0))
        .slice(0, 4);

      return {
        qbs: sortedQBs.map(p => ({
          name: `${p.first_name} ${p.last_name}`,
          position: 'QB',
          jersey: p.jersey_number,
          passingYards: p.seasonStats.passing_yards || 0,
          passingTDs: p.seasonStats.passing_touchdowns || 0,
          passingINTs: p.seasonStats.passing_interceptions || 0,
          rushingYards: p.seasonStats.rushing_yards || 0,
          rushingTDs: p.seasonStats.rushing_touchdowns || 0,
          qbRating: p.seasonStats.passing_rating?.toFixed(1) || null
        })),
        rbs: sortedRBs.map(p => ({
          name: `${p.first_name} ${p.last_name}`,
          position: 'RB',
          jersey: p.jersey_number,
          rushingYards: p.seasonStats.rushing_yards || 0,
          rushingTDs: p.seasonStats.rushing_touchdowns || 0,
          rushingAvg: p.seasonStats.rushing_avg?.toFixed(1) || null,
          receptions: p.seasonStats.receptions || 0,
          receivingYards: p.seasonStats.receiving_yards || 0
        })),
        wrs: sortedWRs.map(p => ({
          name: `${p.first_name} ${p.last_name}`,
          position: 'WR',
          jersey: p.jersey_number,
          receptions: p.seasonStats.receptions || 0,
          receivingYards: p.seasonStats.receiving_yards || 0,
          receivingTDs: p.seasonStats.receiving_touchdowns || 0,
          receivingAvg: p.seasonStats.receiving_avg?.toFixed(1) || null
        })),
        tes: sortedTEs.map(p => ({
          name: `${p.first_name} ${p.last_name}`,
          position: 'TE',
          jersey: p.jersey_number,
          receptions: p.seasonStats.receptions || 0,
          receivingYards: p.seasonStats.receiving_yards || 0,
          receivingTDs: p.seasonStats.receiving_touchdowns || 0
        })),
        defense: sortedDefense.map(p => ({
          name: `${p.first_name} ${p.last_name}`,
          position: p.position_abbreviation,
          jersey: p.jersey_number,
          tackles: p.seasonStats.total_tackles || 0,
          sacks: p.seasonStats.sacks || 0,
          interceptions: p.seasonStats.interceptions || 0,
          tacklesForLoss: p.seasonStats.tackles_for_loss || 0
        }))
      };
    };

    const homeKeyPlayers = processTeamRoster(homePlayers, homeStats, homeTeam);
    const awayKeyPlayers = processTeamRoster(awayPlayers, awayStats, awayTeam);

    const homeCount = (homeKeyPlayers?.qbs?.length || 0) + (homeKeyPlayers?.rbs?.length || 0) +
                      (homeKeyPlayers?.wrs?.length || 0) + (homeKeyPlayers?.tes?.length || 0) +
                      (homeKeyPlayers?.defense?.length || 0);
    const awayCount = (awayKeyPlayers?.qbs?.length || 0) + (awayKeyPlayers?.rbs?.length || 0) +
                      (awayKeyPlayers?.wrs?.length || 0) + (awayKeyPlayers?.tes?.length || 0) +
                      (awayKeyPlayers?.defense?.length || 0);

    console.log(`[Scout Report] NCAAF Key players: ${homeTeam} (${homeCount} players), ${awayTeam} (${awayCount} players)`);

    return {
      home: homeKeyPlayers,
      away: awayKeyPlayers
    };
  } catch (error) {
    console.error('[Scout Report] Error fetching NCAAF key players:', error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// NCAAF FORMATTING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Format NCAAF key players section for display
 */
function formatNcaafKeyPlayers(homeTeam, awayTeam, keyPlayers) {
  if (!keyPlayers || (!keyPlayers.home && !keyPlayers.away)) {
    return '';
  }

  const formatQB = (player) => {
    const stats = player.passingYards > 0
      ? ` - ${player.passingYards} yds, ${player.passingTDs} TD, ${player.passingINTs} INT${player.qbRating ? `, ${player.qbRating} QBR` : ''}`
      : '';
    return `  • QB: #${player.jersey || '?'} ${player.name}${stats}`;
  };

  const formatRB = (player) => {
    const stats = player.rushingYards > 0
      ? ` - ${player.rushingYards} rush yds, ${player.rushingTDs} TD${player.rushingAvg ? ` (${player.rushingAvg} avg)` : ''}`
      : '';
    return `  • RB: #${player.jersey || '?'} ${player.name}${stats}`;
  };

  const formatWR = (player) => {
    const stats = player.receivingYards > 0
      ? ` - ${player.receptions} rec, ${player.receivingYards} yds, ${player.receivingTDs} TD`
      : '';
    return `  • WR: #${player.jersey || '?'} ${player.name}${stats}`;
  };

  const formatTE = (player) => {
    const stats = player.receivingYards > 0
      ? ` - ${player.receptions} rec, ${player.receivingYards} yds, ${player.receivingTDs} TD`
      : '';
    return `  • TE: #${player.jersey || '?'} ${player.name}${stats}`;
  };

  const formatDefense = (player) => {
    const stats = player.tackles > 0
      ? ` - ${player.tackles} tkl${player.sacks ? `, ${player.sacks} sck` : ''}${player.interceptions ? `, ${player.interceptions} INT` : ''}`
      : '';
    return `  • ${player.position}: #${player.jersey || '?'} ${player.name}${stats}`;
  };

  const formatTeamSection = (teamName, players, isHome) => {
    if (!players) return `${isHome ? '[HOME]' : '[AWAY]'} ${teamName}: Roster unavailable`;

    const lines = [`${isHome ? '[HOME]' : '[AWAY]'} ${teamName}:`];

    if (players.qbs && players.qbs.length > 0) {
      lines.push('  QUARTERBACK:');
      players.qbs.forEach(p => lines.push(formatQB(p)));
    }

    if (players.rbs && players.rbs.length > 0) {
      lines.push('  RUNNING BACKS:');
      players.rbs.forEach(p => lines.push(formatRB(p)));
    }

    if (players.wrs && players.wrs.length > 0) {
      lines.push('  WIDE RECEIVERS:');
      players.wrs.forEach(p => lines.push(formatWR(p)));
    }

    if (players.tes && players.tes.length > 0) {
      lines.push('  TIGHT ENDS:');
      players.tes.forEach(p => lines.push(formatTE(p)));
    }

    if (players.defense && players.defense.length > 0) {
      lines.push('  KEY DEFENDERS:');
      players.defense.forEach(p => lines.push(formatDefense(p)));
    }

    return lines.join('\n');
  };

  const homeSection = formatTeamSection(homeTeam, keyPlayers.home, true);
  const awaySection = formatTeamSection(awayTeam, keyPlayers.away, false);

  return `
KEY PLAYERS (CURRENT ROSTER)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${homeSection}

${awaySection}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

/**
 * Format conference tier section for NCAAF games
 */
async function formatConferenceTierSection(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport || bdlSport !== 'americanfootball_ncaaf') return '';

    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);

    const getTeamTier = (team, teamName) => {
      // Check team overrides first (for independents like Notre Dame)
      if (TEAM_TIER_OVERRIDES[teamName]) return TEAM_TIER_OVERRIDES[teamName];
      if (team && TEAM_TIER_OVERRIDES[team.full_name]) return TEAM_TIER_OVERRIDES[team.full_name];

      // Try conference ID first (most reliable from BDL)
      const confId = parseInt(team?.conference, 10);
      if (!isNaN(confId) && CONFERENCE_ID_TIERS[confId]) {
        const tierInfo = CONFERENCE_ID_TIERS[confId];
        return { tier: tierInfo.tier, label: tierInfo.label, conference: tierInfo.name };
      }

      // Fallback to conference name matching
      const confName = team?.conference || team?.division || '';
      if (NCAAF_CONFERENCE_TIERS[confName]) {
        return { ...NCAAF_CONFERENCE_TIERS[confName], conference: confName };
      }

      return { tier: 3, label: 'Unknown', conference: confName || 'Unknown' };
    };

    const homeTier = getTeamTier(homeTeamData, homeTeam);
    const awayTier = getTeamTier(awayTeamData, awayTeam);
    const tierGap = Math.abs(homeTier.tier - awayTier.tier);

    const homeConf = homeTier.conference || homeTeamData?.conference || 'Unknown';
    const awayConf = awayTier.conference || awayTeamData?.conference || 'Unknown';

    console.log(`[Scout Report] NCAAF Tiers: ${homeTeam} (${homeConf}, Tier ${homeTier.tier}) vs ${awayTeam} (${awayConf}, Tier ${awayTier.tier})`);

    let gapAnalysis = '';
    if (tierGap === 0) {
      gapAnalysis = 'Same tier';
    } else if (tierGap === 1) {
      gapAnalysis = 'One tier gap';
    } else if (tierGap === 2) {
      gapAnalysis = 'Two tier gap';
    } else {
      gapAnalysis = 'Three+ tier gap';
    }

    return `
CONFERENCE TIER CONTEXT (NCAAF)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[HOME] ${homeTeam}: ${homeConf} (Tier ${homeTier.tier} - ${homeTier.label})
[AWAY] ${awayTeam}: ${awayConf} (Tier ${awayTier.tier} - ${awayTier.label})

TIER GAP: ${tierGap} level${tierGap !== 1 ? 's' : ''}
   ${gapAnalysis}

Conference tiers reflect recruiting power and quality of opponents.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
  } catch (error) {
    console.warn('[Scout Report] Error fetching conference tiers:', error.message);
    return '';
  }
}

// ═══════════════════════════════════════════════════════════════════
// SHARED HELPERS (adapted for NCAAF)
// ═══════════════════════════════════════════════════════════════════

/**
 * Format injuries for storage — filters out malformed entries
 */
function formatInjuriesForStorage(injuries) {
  // Common word fragments that indicate parsing errors (not real first names)
  const invalidFirstNamePatterns = /^(th|nd|rd|st|with|for|and|the|or|by|to|in|on|at|of|is|as|a|an)\s/i;

  const formatList = (list) => list.map(i => {
    // Build and sanitize player name - remove newlines, extra spaces
    const firstName = (i.player?.first_name || '').trim();
    const lastName = (i.player?.last_name || '').trim();
    let name = `${firstName} ${lastName}`.trim() || i.name || 'Unknown';
    name = name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

    // Skip malformed entries:
    // 1. Total name too short (less than 5 chars like "A B")
    // 2. First name too short (less than 2 chars)
    // 3. Last name too short (less than 2 chars)
    // 4. Name starts with common word fragments (parsing errors)
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
  }).filter(i => i.name !== 'Unknown'); // Filter out unknown entries

  return {
    home: formatList(injuries.home || []),
    away: formatList(injuries.away || [])
  };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN BUILDER
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a scout report for an NCAAF game
 * This gives Gary enough context to think, not just react to odds.
 */
export async function buildNcaafScoutReport(game, options = {}) {
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  const sportKey = 'NCAAF';

  // Fetch basic data in parallel
  const [homeProfile, awayProfile, injuries, recentHome, recentAway, standingsSnapshot] = await Promise.all([
    fetchTeamProfile(homeTeam, sportKey),
    fetchTeamProfile(awayTeam, sportKey),
    fetchInjuries(homeTeam, awayTeam, sportKey),
    fetchRecentGames(homeTeam, sportKey, 8),
    fetchRecentGames(awayTeam, sportKey, 8),
    fetchStandingsSnapshot(sportKey, homeTeam, awayTeam)
  ]);

  // For NCAAF, fetch starting QBs (pass injuries to filter out IR/Out players)
  let startingQBs = null;
  startingQBs = await fetchStartingQBs(homeTeam, awayTeam, sportKey, injuries);

  // For NCAAF, fetch key players (roster + stats) to prevent hallucinations
  let ncaafKeyPlayers = null;
  ncaafKeyPlayers = await fetchNcaafKeyPlayers(homeTeam, awayTeam, sportKey);

  // For NCAAF, fetch conference tier context
  let conferenceTierSection = '';
  conferenceTierSection = await formatConferenceTierSection(homeTeam, awayTeam, sportKey);

  // For NCAAF, fetch bowl game context if applicable (December-January games are likely bowls)
  let bowlGameContext = '';
  bowlGameContext = await fetchBowlGameContext(homeTeam, awayTeam, game, injuries?.narrativeContext);

  // For NCAAF CFP games, fetch each team's road to the championship
  // This provides full playoff journey context for steel man cases
  let cfpJourneyContext = '';
  cfpJourneyContext = await fetchCfpJourneyContext(homeTeam, awayTeam, game);

  // PRE-LOAD H2H DATA - This prevents Gary from hallucinating H2H records
  let h2hData = null;
  try {
    h2hData = await fetchH2HData(homeTeam, awayTeam, sportKey, recentHome, recentAway);
    console.log(`[Scout Report] H2H Data: ${h2hData?.found ? `${h2hData.gamesFound} game(s) found` : 'No games found'}`);
  } catch (e) {
    console.log(`[Scout Report] H2H fetch failed: ${e.message}`);
  }

  // Generate smart game significance if not already set
  if (!game.gameSignificance || game.gameSignificance === 'Regular season game' || game.gameSignificance.length > 100) {
    try {
      // NCAAF doesn't use BDL standings for significance — fallbacks handle conference matchups
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
        [], // No BDL standings for NCAAF
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

  // Format injuries for storage
  const injuriesForStorage = formatInjuriesForStorage(injuries);

  // Narrative Scrubbing: Remove "ghost" players from the grounding narrative
  // This ensures Gary never even sees names of players who are not in the active stats or filtered injuries.
  if (injuries?.narrativeContext) {
    const allowedNames = new Set();

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

    // Add names from NCAAF key players
    if (ncaafKeyPlayers) {
      addNamesFromSource(ncaafKeyPlayers.home);
      addNamesFromSource(ncaafKeyPlayers.away);
    }

    // Add names from structured injury list (which already has hard filters applied)
    [...(injuries.home || []), ...(injuries.away || [])].forEach(i => {
      const name = i.name || `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim();
      if (name && name.length > 3) allowedNames.add(name);
    });

    // Add names from starting lineups
    if (injuries.lineups) {
      if (injuries.lineups.home) injuries.lineups.home.forEach(p => { if (p.name) allowedNames.add(p.name.trim()); });
      if (injuries.lineups.away) injuries.lineups.away.forEach(p => { if (p.name) allowedNames.add(p.name.trim()); });
    }

    // Collect long-term injured players to EXCLUDE from narrative
    const excludedLongTerm = new Set(injuries.filteredLongTerm || []);

    if (excludedLongTerm.size > 0) {
      console.log(`[Scout Report] Excluding ${excludedLongTerm.size} long-term injured players from narrative: ${Array.from(excludedLongTerm).join(', ')}`);
    }

    if (allowedNames.size > 0) {
      console.log(`[Scout Report] Scrubbing ${sportKey} narrative with ${allowedNames.size} allowed player names...`);
      const scrubbed = await scrubNarrative(injuries.narrativeContext, Array.from(allowedNames), homeTeam, awayTeam, Array.from(excludedLongTerm));
      injuries.narrativeContext = scrubbed;
    }
  }

  // Extract narrative context from Gemini Grounding
  // NO TRUNCATION — Gary needs the full narrative for both teams + matchup context
  let narrativeContext = injuries?.narrativeContext || null;

  // Build the scout report
  const matchupLabel = game.isNeutralSite ? `${awayTeam} vs ${homeTeam}` : `${awayTeam} @ ${homeTeam}`;
  const venueLabel = game.venue || (game.isNeutralSite ? 'Neutral Site' : `${homeTeam} Home`);
  const tournamentLabel = game.tournamentContext ? `[${game.tournamentContext}]` : '';

  // Dynamic season label (e.g., "2025-26") — works for any year
  const _now = new Date();
  const _yr = _now.getFullYear();
  const _mo = _now.getMonth() + 1;
  const seasonLabel = _mo >= 7 ? `${_yr}-${String(_yr + 1).slice(2)}` : `${_yr - 1}-${String(_yr).slice(2)}`;

  // Build game context section if we have special context
  let gameContextSection = '';
  if (game.gameSignificance && game.tournamentContext) {
    gameContextSection = `
GAME CONTEXT & SIGNIFICANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${game.gameSignificance}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
  }

  // Build SEASON-LONG INJURIES context if we have long-term filtered injuries
  const filteredPlayers = injuries?.filteredLongTerm || [];
  const seasonLongInjuriesSection = filteredPlayers.length > 0 ? `
<season_long_injuries>
SEASON-LONG ABSENCES:
The following players have been OUT for extended periods (1-2+ months):
${filteredPlayers.join(', ')}

The team's recent stats reflect play WITHOUT these players.
</season_long_injuries>

` : '';

  // NCAAF does NOT have returning players detection or roster depth
  const injuryReportText = formatInjuryReport(homeTeam, awayTeam, injuries, sportKey, null);

  // Debug: Log the injury report Gary will see (first 3000 chars)
  if (injuryReportText && injuryReportText.length > 50) {
    console.log(`[Scout Report] Injury report preview (${injuryReportText.length} chars):`);
    console.log(injuryReportText.substring(0, 3000));
    if (injuryReportText.length > 3000) console.log('...[log truncated, full report sent to Gary]');
  }

  // Build verified Tale of Tape ONCE and reuse in report text + return object
  const verifiedTaleOfTape = buildVerifiedTaleOfTape(homeTeam, awayTeam, homeProfile, awayProfile, sportKey, injuries, recentHome, recentAway);

  const report = `
${seasonLongInjuriesSection}══════════════════════════════════════════════════════════════════════
MATCHUP: ${matchupLabel}
Sport: ${sportKey} | ${game.commence_time ? formatGameTime(game.commence_time) : 'Time TBD'}
${game.venue ? `Venue: ${venueLabel}` : ''}${tournamentLabel ? `\n${tournamentLabel}` : ''}
══════════════════════════════════════════════════════════════════════
${gameContextSection}${bowlGameContext}${cfpJourneyContext}${standingsSnapshot || ''}
*** INJURY REPORT (READ THIS FIRST - CRITICAL) ***
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${injuryReportText}
${formatStartingLineups(homeTeam, awayTeam, injuries.lineups)}
${narrativeContext ? `
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

${ncaafKeyPlayers ? formatNcaafKeyPlayers(homeTeam, awayTeam, ncaafKeyPlayers) : ''}${startingQBs ? formatStartingQBs(homeTeam, awayTeam, startingQBs) : ''}

TEAM IDENTITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatTeamIdentity(homeTeam, homeProfile, 'Home')}
${formatTeamIdentity(awayTeam, awayProfile, 'Away')}
${conferenceTierSection}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECENT FORM (Last 5 Games)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatRecentForm(homeTeam, recentHome)}
${formatRecentForm(awayTeam, recentAway)}
HEAD-TO-HEAD HISTORY (${seasonLabel} SEASON)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatH2HSection(h2hData, homeTeam, awayTeam)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KEY SITUATIONAL FACTORS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatSituationalFactors(game, injuries, sportKey)}

BETTING CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatOdds(game, sportKey)}
${options.sportsbookOdds ? formatSportsbookComparison(options.sportsbookOdds, game.home_team, game.away_team) : ''}BETTING ODDS COMPARISON:
`.trim();

  // Return both the report text, structured injuries data, and venue/game context
  return {
    text: report,
    tokenMenu: formatTokenMenu(sportKey),
    injuries: injuriesForStorage,
    verifiedTaleOfTape,
    venue: game.venue || null,
    isNeutralSite: game.isNeutralSite || false,
    tournamentContext: game.tournamentContext || null,
    // Game significance/context
    gameSignificance: game.gameSignificance || null,
    // CFP-specific fields for NCAAF
    cfpRound: game.cfpRound || null,
    homeSeed: game.homeSeed || null,
    awaySeed: game.awaySeed || null
  };
}

// Export helper functions that may be needed by other modules
export { getCfpSeedingFromBracket, parseCfpSeeding, detectCfpRound, determineBowlTier, fetchBowlGameContext, fetchCfpJourneyContext, fetchNcaafKeyPlayers, formatNcaafKeyPlayers, formatConferenceTierSection };
