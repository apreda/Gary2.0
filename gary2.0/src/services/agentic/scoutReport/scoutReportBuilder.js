/**
 * Scout Report Builder
 * 
 * Builds the initial context that helps Gary form a unique hypothesis.
 * This is the "Level 1" context that Gary always receives.
 */

import { ballDontLieService } from '../../ballDontLieService.js';
import { formatTokenMenu } from '../tools/toolDefinitions.js';
import { fixBdlInjuryStatus } from '../sharedUtils.js';
import { nbaSeason, nhlSeason, nflSeason, ncaabSeason, formatSeason } from '../../../utils/dateUtils.js';

/**
 * Get current season year for a given sport key.
 * Dispatches to the centralized season functions in dateUtils.js.
 * Accepts both short keys (NBA, NFL) and BDL keys (basketball_nba, etc.).
 */
function seasonForSport(sport) {
  const s = (sport || '').toUpperCase();
  if (s === 'NBA' || s === 'BASKETBALL_NBA') return nbaSeason();
  if (s === 'NFL' || s === 'AMERICANFOOTBALL_NFL') return nflSeason();
  if (s === 'NHL' || s === 'ICEHOCKEY_NHL') return nhlSeason();
  if (s === 'NCAAB' || s === 'BASKETBALL_NCAAB') return ncaabSeason();
  if (s === 'NCAAF' || s === 'AMERICANFOOTBALL_NCAAF') return nflSeason(); // NCAAF uses same timing as NFL
  // Fallback: Oct+ = current year, else previous year
  return nbaSeason();
}
import { generateGameSignificance } from './gameSignificanceGenerator.js';
import { fetchNbaInjuriesForGame } from '../../nbaInjuryReportService.js';
import { getNcaabH2H, formatHighlightlyH2H } from '../../highlightlyService.js';
import { getTeamRatings as getBarttovikRatings } from '../../barttovikService.js';
// All context comes from Gemini 3 Flash with Google Search Grounding
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
// NBA injuries: RapidAPI ONLY (no Grounding fallback — process fails if API fails)
// BDL injuries used ONLY for duration enrichment (when player went out)

// Module-level cache: season averages to prevent duplicate BDL API calls
// Key: sorted player IDs, Value: { data, expiry }
const _seasonAvgCache = new Map();
const SEASON_AVG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Robust player name matching — handles hyphenated names, API inconsistencies
 * e.g., "Shai Alexander" (RapidAPI) vs "Shai Gilgeous-Alexander" (BDL)
 */
function playerNamesMatch(name1, name2) {
  const a = (name1 || '').toLowerCase().trim();
  const b = (name2 || '').toLowerCase().trim();
  if (!a || !b) return false;
  if (a === b) return true;

  const aParts = a.split(/\s+/);
  const bParts = b.split(/\s+/);
  if (aParts.length < 2 || bParts.length < 2) return false;

  const aFirst = aParts[0];
  const bFirst = bParts[0];
  const aLast = aParts.slice(1).join(' ');
  const bLast = bParts.slice(1).join(' ');

  // First names must match (or one is an initial/abbreviation/prefix of the other)
  // Handles: "N." → "Nicolas", "Nic" → "Nicolas", "Nicolas" → "Nicolas"
  const aClean = aFirst.replace('.', '');
  const bClean = bFirst.replace('.', '');
  const firstNameMatch = (aFirst === bFirst) ||
    (aClean.length === 1 && bFirst.startsWith(aClean)) ||
    (bClean.length === 1 && aFirst.startsWith(bClean)) ||
    (aClean.length >= 2 && bFirst.startsWith(aClean)) ||
    (bClean.length >= 2 && aFirst.startsWith(bClean));
  if (!firstNameMatch) return false;

  // Last names: exact match
  if (aLast === bLast) return true;

  // Last names: one contains the other (handles "alexander" in "gilgeous-alexander")
  if (aLast.includes(bLast) || bLast.includes(aLast)) return true;

  // Split hyphenated parts and check any part matches
  const aLastParts = aLast.split('-');
  const bLastParts = bLast.split('-');
  return aLastParts.some(ap => bLastParts.some(bp => ap === bp && ap.length > 2));
}

// Shared injury lookup — checks if a player name matches any entry in the injuredPlayers Map
function getInjuryStatusFromMap(playerName, injuredPlayers) {
  const nameLower = playerName.toLowerCase();
  for (const [injName, injData] of injuredPlayers) {
    if (playerNamesMatch(nameLower, injName)) {
      return injData;
    }
  }
  return null;
}

// Shared OUT check — returns true only for definitively OUT players (not questionable/GTD)
function isPlayerOutFromMap(playerName, injuredPlayers) {
  const injury = getInjuryStatusFromMap(playerName, injuredPlayers);
  if (!injury) return false;
  const status = injury.status?.toUpperCase() || '';
  return status.includes('OUT') || status.includes('INJURED') || status.includes('IR');
}

// Shared standings team lookup — searches standings array where team data is at s.team.*
// Combines word-boundary matching (NBA), college matching (NCAAB), and last-word fallback
function findTeamInStandings(standings, teamName) {
  if (!standings || !teamName) return null;
  const nameLower = teamName.toLowerCase();
  const lastWord = nameLower.split(' ').pop();
  const lastWordRegex = new RegExp(`\\b${lastWord}\\b`, 'i');

  // Priority 1: Exact full name match
  let match = standings.find(s => (s.team?.full_name || '').toLowerCase() === nameLower);
  if (match) return match;

  // Priority 2: Full name contains search or vice versa
  match = standings.find(s => {
    const bdlName = (s.team?.name || '').toLowerCase();
    const bdlFullName = (s.team?.full_name || '').toLowerCase();
    return nameLower.includes(bdlName) || bdlFullName.includes(nameLower);
  });
  if (match) return match;

  // Priority 3: Word-boundary match on last word (prevents "Nets" matching "Hornets")
  match = standings.find(s => {
    const bdlName = (s.team?.name || '').toLowerCase();
    const bdlFullName = (s.team?.full_name || '').toLowerCase();
    return lastWordRegex.test(bdlName) || lastWordRegex.test(bdlFullName);
  });
  if (match) return match;

  // Priority 4: College name match (NCAAB)
  match = standings.find(s => {
    const bdlCollege = (s.team?.college || '').toLowerCase();
    return bdlCollege && (bdlCollege.includes(nameLower) || nameLower.includes(bdlCollege));
  });
  if (match) return match;

  return null;
}

// Lazy-initialize Gemini for grounded searches
let geminiClient = null;
function getGeminiClient() {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[Scout Report] GEMINI_API_KEY not set - Grounding disabled');
      return null;
    }
    geminiClient = new GoogleGenerativeAI(apiKey);
  }
  return geminiClient;
}


/**
 * Fetch a snapshot of the league landscape (standings) to ground analysis
 * This prevents Gary from using historical knowledge for current season evaluation.
 */
async function fetchStandingsSnapshot(sport, homeTeam = null, awayTeam = null, ncaabConferenceIds = null) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport || sport === 'NCAAF') return '';

    const currentSeason = seasonForSport(sport);

    const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason });
    if (!standings || standings.length === 0) return '';

    // Sort by conference/division and rank
    const snapshot = [];
    
    // NBA: Groups by Conference
    if (sport === 'NBA') {
      const east = standings.filter(s => (s.conference === 'East' || s.team?.conference === 'East')).sort((a, b) => a.conference_rank - b.conference_rank);
      const west = standings.filter(s => (s.conference === 'West' || s.team?.conference === 'West')).sort((a, b) => a.conference_rank - b.conference_rank);

      // Use ?? to coerce null to 0 (BDL can return null for 0 wins/losses)
      const formatRec = (s) => `${s.wins ?? 0}-${s.losses ?? 0}`;
      
      // TONIGHT'S MATCHUP - Team-specific standings with conference_rank
      // This helps Gary understand where each team sits in the league right now
      if (homeTeam && awayTeam) {
        const homeTeamLower = homeTeam.toLowerCase();
        const awayTeamLower = awayTeam.toLowerCase();
        
        const homeStanding = findTeamInStandings(standings, homeTeam);
        const awayStanding = findTeamInStandings(standings, awayTeam);
        
        const formatTeamStanding = (team, standing) => {
          if (!standing) return `${team}: (standings unavailable)`;
          const conf = standing.team?.conference || standing.conference || '?';
          const rank = standing.conference_rank || '?';
          const record = formatRec(standing);
          const homeRec = standing.home_record || '?';
          const roadRec = standing.road_record || '?';
          return `${team}: #${rank} in ${conf} (${record}) | Home: ${homeRec} | Road: ${roadRec}`;
        };
        
        snapshot.push('TONIGHT\'S TEAMS IN STANDINGS:');
        snapshot.push(`  [HOME] ${formatTeamStanding(homeTeam, homeStanding)}`);
        snapshot.push(`  [AWAY] ${formatTeamStanding(awayTeam, awayStanding)}`);
        snapshot.push('');
      }

      snapshot.push('EASTERN CONFERENCE TOP 3: ' + east.slice(0, 3).map(s => `${s.team.name} (${formatRec(s)})`).join(', '));
      snapshot.push('EASTERN CONFERENCE BOTTOM 2: ' + east.slice(-2).map(s => `${s.team.name} (${formatRec(s)})`).join(', '));
      snapshot.push('WESTERN CONFERENCE TOP 3: ' + west.slice(0, 3).map(s => `${s.team.name} (${formatRec(s)})`).join(', '));
      snapshot.push('WESTERN CONFERENCE BOTTOM 2: ' + west.slice(-2).map(s => `${s.team.name} (${formatRec(s)})`).join(', '));
      
      return `
NBA LEAGUE CONTEXT (CURRENT 2025-26 STANDINGS FROM BDL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${snapshot.join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }
    
    // NHL: Groups by Conference and Division
    if (sport === 'NHL') {
      // NHL standings use conference_name and division_name
      const east = standings.filter(s => s.conference_name === 'Eastern').sort((a, b) => (b.points || 0) - (a.points || 0));
      const west = standings.filter(s => s.conference_name === 'Western').sort((a, b) => (b.points || 0) - (a.points || 0));

      // NHL record includes OT losses: W-L-OTL
      const formatRec = (s) => `${s.wins}-${s.losses}-${s.ot_losses || 0}`;
      
      // TONIGHT'S MATCHUP - Team-specific standings
      if (homeTeam && awayTeam) {
        const homeStanding = findTeamInStandings(standings, homeTeam);
        const awayStanding = findTeamInStandings(standings, awayTeam);
        
        const formatTeamStanding = (team, standing) => {
          if (!standing) return `${team}: (standings unavailable)`;
          const conf = standing.conference_name || '?';
          const div = standing.division_name || '?';
          const record = formatRec(standing);
          const pts = standing.points || 0;
          const homeRec = standing.home_record || '?';
          const roadRec = standing.road_record || '?';
          const streak = standing.streak || '?';
          return `${team}: ${pts} PTS (${record}) | ${div} Div | Home: ${homeRec} | Road: ${roadRec} | Streak: ${streak}`;
        };
        
        snapshot.push('TONIGHT\'S TEAMS IN STANDINGS:');
        snapshot.push(`  [HOME] ${formatTeamStanding(homeTeam, homeStanding)}`);
        snapshot.push(`  [AWAY] ${formatTeamStanding(awayTeam, awayStanding)}`);
        snapshot.push('');
      }

      snapshot.push('EASTERN CONFERENCE TOP 3: ' + east.slice(0, 3).map(s => `${s.team.full_name} (${formatRec(s)}, ${s.points} pts)`).join(', '));
      snapshot.push('EASTERN CONFERENCE BOTTOM 2: ' + east.slice(-2).map(s => `${s.team.full_name} (${formatRec(s)}, ${s.points} pts)`).join(', '));
      snapshot.push('WESTERN CONFERENCE TOP 3: ' + west.slice(0, 3).map(s => `${s.team.full_name} (${formatRec(s)}, ${s.points} pts)`).join(', '));
      snapshot.push('WESTERN CONFERENCE BOTTOM 2: ' + west.slice(-2).map(s => `${s.team.full_name} (${formatRec(s)}, ${s.points} pts)`).join(', '));
      
      return `
NHL LEAGUE CONTEXT (CURRENT 2025-26 NHL STANDINGS FROM BDL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${snapshot.join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }
    
    // NCAAB: Conference standings
    if (sport === 'NCAAB') {
      // For NCAAB, we need to fetch standings by conference
      // ncaabConferenceIds should be passed from the roster depth call
      if (!ncaabConferenceIds || (!ncaabConferenceIds.home && !ncaabConferenceIds.away)) {
        return ''; // Can't fetch NCAAB standings without conference IDs
      }
      
      // Use ?? to coerce null to 0 (BDL can return null for 0 wins/losses)
      const formatRec = (s) => `${s.wins ?? 0}-${s.losses ?? 0}`;
      const formatConfRec = (s) => s.conference_record || `${s.wins ?? 0}-${s.losses ?? 0}`;
      
      // Fetch both teams' conference standings
      const uniqueConfs = [...new Set([ncaabConferenceIds.home, ncaabConferenceIds.away].filter(Boolean))];
      const confStandings = {};
      for (const confId of uniqueConfs) {
        confStandings[confId] = await ballDontLieService.getNcaabStandings(confId, currentSeason);
      }
      
      // Format team standing for NCAAB
      const formatTeamStanding = (team, standing) => {
        if (!standing) return `${team}: (standings unavailable)`;
        const conf = standing.conference?.short_name || standing.conference?.name || '?';
        const confRec = formatConfRec(standing);
        const overallRec = formatRec(standing);
        const seed = standing.playoff_seed ? `#${standing.playoff_seed}` : '';
        const homeRec = standing.home_record || '?';
        const awayRec = standing.away_record || '?';
        return `${team}: ${seed} in ${conf} | Conf: ${confRec} | Overall: ${overallRec} | Home: ${homeRec} | Away: ${awayRec}`;
      };
      
      if (homeTeam && awayTeam) {
        const homeConf = confStandings[ncaabConferenceIds.home] || [];
        const awayConf = confStandings[ncaabConferenceIds.away] || [];
        
        const homeStanding = findTeamInStandings(homeConf, homeTeam);
        const awayStanding = findTeamInStandings(awayConf, awayTeam);
        
        snapshot.push('TONIGHT\'S TEAMS IN CONFERENCE STANDINGS:');
        snapshot.push(`  [HOME] ${formatTeamStanding(homeTeam, homeStanding)}`);
        snapshot.push(`  [AWAY] ${formatTeamStanding(awayTeam, awayStanding)}`);
        snapshot.push('');
      }
      
      return `
NCAAB CONFERENCE STANDINGS (CURRENT 2025-26 SEASON FROM BDL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${snapshot.join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }
    
    // NFL: Conference and Division standings
    if (sport === 'NFL') {
      // NFL uses conference (AFC/NFC) and division
      const afc = standings.filter(s => s.team?.conference === 'AFC').sort((a, b) => (b.wins || 0) - (a.wins || 0));
      const nfc = standings.filter(s => s.team?.conference === 'NFC').sort((a, b) => (b.wins || 0) - (a.wins || 0));

      // Use ?? to coerce null to 0 (BDL can return null for 0 wins/losses)
      const formatRec = (s) => s.overall_record || `${s.wins ?? 0}-${s.losses ?? 0}${s.ties ? `-${s.ties}` : ''}`;
      
      const formatTeamStanding = (team, standing) => {
        if (!standing) return `${team}: (standings unavailable)`;
        const conf = standing.team?.conference || '?';
        const div = standing.team?.division || '?';
        const record = formatRec(standing);
        const confRec = standing.conference_record || '?';
        const divRec = standing.division_record || '?';
        const streak = standing.win_streak > 0 ? `W${standing.win_streak}` : (standing.win_streak < 0 ? `L${Math.abs(standing.win_streak)}` : '-');
        return `${team}: ${record} | ${conf} ${div} | Conf: ${confRec} | Div: ${divRec} | Streak: ${streak}`;
      };
      
      if (homeTeam && awayTeam) {
        const homeStanding = findTeamInStandings(standings, homeTeam);
        const awayStanding = findTeamInStandings(standings, awayTeam);

        snapshot.push('TONIGHT\'S TEAMS IN STANDINGS:');
        snapshot.push(`  [HOME] ${formatTeamStanding(homeTeam, homeStanding)}`);
        snapshot.push(`  [AWAY] ${formatTeamStanding(awayTeam, awayStanding)}`);
        snapshot.push('');
      }

      snapshot.push('AFC TOP 3: ' + afc.slice(0, 3).map(s => `${s.team.name} (${formatRec(s)})`).join(', '));
      snapshot.push('NFC TOP 3: ' + nfc.slice(0, 3).map(s => `${s.team.name} (${formatRec(s)})`).join(', '));
      
      return `
NFL STANDINGS (CURRENT ${currentSeason} SEASON FROM BDL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${snapshot.join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }
    
    // General top 5 for other sports (fallback)
      const top5 = [...standings].sort((a, b) => (b.wins || 0) - (a.wins || 0)).slice(0, 5);
      // Use ?? to coerce null to 0 (BDL returns null for 0 losses)
      const formatRec = (s) => s.overall_record || `${s.wins ?? 0}-${s.losses ?? 0}`;
      snapshot.push('LEAGUE TOP 5: ' + top5.map(s => `${s.team.name} (${formatRec(s)})`).join(', '));

    return `
LEAGUE CONTEXT (CURRENT STANDINGS FROM BDL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${snapshot.join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  } catch (error) {
    console.warn(`[Scout Report] Error fetching standings snapshot:`, error.message);
    return '';
  }
}

/**
 * Build a scout report for a game
 * This gives Gary enough context to think, not just react to odds.
 */
export async function buildScoutReport(game, sport, options = {}) {
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  const sportKey = normalizeSport(sport);
  
  // Fetch basic data in parallel
  // Headlines/storylines come from fetchCurrentState via narrativeContext
  const [homeProfile, awayProfile, injuries, recentHome, recentAway, standingsSnapshot] = await Promise.all([
    fetchTeamProfile(homeTeam, sportKey),
    fetchTeamProfile(awayTeam, sportKey),
    fetchInjuries(homeTeam, awayTeam, sportKey),
    fetchRecentGames(homeTeam, sportKey, sportKey === 'NCAAB' ? 50 : 8),
    fetchRecentGames(awayTeam, sportKey, sportKey === 'NCAAB' ? 50 : 8),
    fetchStandingsSnapshot(sportKey, homeTeam, awayTeam)
  ]);
  
  // =========================================================================
  // NBA INJURY DURATION RESOLUTION (box-score method — single source of truth)
  // Uses the team's recent game box scores to determine when each injured player
  // last played. Counts GAMES missed (not calendar days) — naturally handles
  // All-Star breaks, bye weeks, and any schedule gap.
  // Also handles: suspension detection, FRESH/STALE marking, HARD FAIL on UNKNOWN.
  // =========================================================================
  if (sportKey === 'NBA' && (injuries?.home?.length > 0 || injuries?.away?.length > 0)) {
    const STALE_WINDOW_GAMES = 2; // 0-2 games missed = FRESH/RECENT, >2 = STALE

    const resolveDurationByBoxScore = async (injuryList, teamRecentGames, teamName) => {
      // Step 1: Handle suspensions — known bounded durations, skip box-score check
      for (const inj of injuryList) {
        const context = (inj.durationContext || '').toLowerCase();
        if (context.includes('suspension') || context.includes('suspended')) {
          const pName = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
          inj.duration = 'RECENT';
          inj.daysSinceReport = 7;
          inj.reportDateStr = 'suspension';
          inj.durationSource = 'suspension_detected';
          inj.freshness = 'FRESH';
          inj.isPricedIn = false;
          inj.isEdge = true;
          console.log(`[Scout Report] Suspension detected for ${pName} — marked RECENT`);
        }
      }

      // Step 2: Identify all actionable injuries that need duration resolution
      const actionableInjuries = injuryList.filter(inj => {
        if (inj.durationSource === 'suspension_detected') return false;
        const status = (inj.status || '').toLowerCase();
        return status.includes('out') || status.includes('doubtful') || status.includes('questionable') || status.includes('day-to-day');
      });
      if (actionableInjuries.length === 0) return;

      const gameIds = (teamRecentGames || []).map(g => g.id).filter(Boolean).slice(0, 10);
      if (gameIds.length === 0) {
        throw new Error(`[Scout Report] CRITICAL: No recent game IDs available for ${teamName} — cannot resolve injury durations`);
      }

      // Build game date map from recentGames
      const gameDateMap = new Map();
      const gameOrder = []; // ordered most-recent-first
      for (const g of teamRecentGames) {
        if (g.id) {
          gameDateMap.set(g.id, g.date || g.datetime);
          gameOrder.push(g.id);
        }
      }

      // Fetch player stats per-game in parallel (avoids pagination issues —
      // 10 games × ~30 players = ~300 entries, exceeds single-page 100 limit)
      const perGameResults = await Promise.all(
        gameIds.map(gId => ballDontLieService.getPlayerStats('basketball_nba', {
          game_ids: [gId],
          per_page: 100
        }))
      );
      const allStats = perGameResults.flat();
      if (!allStats || allStats.length === 0) {
        throw new Error(`[Scout Report] CRITICAL: No box-score data returned for ${teamName} recent games — cannot resolve injury durations`);
      }

      // Step 3: Resolve each injury via box scores
      for (const inj of actionableInjuries) {
        const injName = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.toLowerCase().trim();
        if (!injName) continue;
        const pName = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();

        // Find this player's entries in the box scores
        const playerEntries = allStats.filter(s => {
          const statName = `${s.player?.first_name || ''} ${s.player?.last_name || ''}`.toLowerCase().trim();
          return playerNamesMatch(injName, statName) && parseFloat(s.min || '0') > 0;
        });

        if (playerEntries.length > 0) {
          // Sort by game date descending to find most recent appearance
          playerEntries.sort((a, b) => {
            const dateA = new Date(a.game?.date || gameDateMap.get(a.game?.id) || 0);
            const dateB = new Date(b.game?.date || gameDateMap.get(b.game?.id) || 0);
            return dateB - dateA;
          });

          const lastGameDate = new Date(playerEntries[0].game?.date || gameDateMap.get(playerEntries[0].game?.id));
          const daysSince = Math.floor((Date.now() - lastGameDate) / (1000 * 60 * 60 * 24));

          // Count games the TEAM played after this player's last game
          const gamesMissed = gameOrder.filter(gId => {
            const gDate = gameDateMap.get(gId);
            return gDate && new Date(gDate) > lastGameDate;
          }).length;

          // Set duration + freshness based on games missed
          if (gamesMissed <= STALE_WINDOW_GAMES) {
            inj.duration = 'RECENT';
            inj.freshness = 'FRESH';
            inj.isPricedIn = false;
            inj.isEdge = true;
          } else if (gamesMissed <= 7) {
            inj.duration = 'MID-SEASON';
            inj.freshness = 'STALE';
            inj.isPricedIn = true;
          } else {
            inj.duration = 'SEASON-LONG';
            inj.freshness = 'STALE';
            inj.isPricedIn = true;
          }

          inj.daysSinceReport = daysSince;
          inj.gamesMissed = gamesMissed;
          inj.reportDateStr = lastGameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          inj.durationSource = 'box_score';

          console.log(`[Scout Report] ${pName} (${teamName}) last played ${inj.reportDateStr} — ${gamesMissed} game(s) missed → ${inj.duration} [${inj.freshness}]`);
        } else {
          // Not found in any of the last N games → long-term absence
          // gamesMissed is a MINIMUM (player has been out longer than our window)
          inj.gamesMissed = gameIds.length;
          inj.gamesMissedIsMinimum = true;
          inj.duration = 'SEASON-LONG';
          inj.freshness = 'STALE';
          inj.isPricedIn = true;
          inj.durationSource = 'box_score';
          console.log(`[Scout Report] ${pName} (${teamName}) not in last ${gameIds.length} games → SEASON-LONG [STALE]`);
        }
      }
    };

    await Promise.all([
      resolveDurationByBoxScore(injuries.home || [], recentHome, homeTeam),
      resolveDurationByBoxScore(injuries.away || [], recentAway, awayTeam)
    ]);

    // HARD FAIL: If any Out/Doubtful injury still has UNKNOWN duration, something broke
    const allInjuries = [...(injuries.home || []), ...(injuries.away || [])];
    const unresolved = allInjuries.filter(inj => {
      const status = (inj.status || '').toLowerCase();
      const isActionable = status.includes('out') || status.includes('doubtful');
      return isActionable && inj.duration === 'UNKNOWN';
    });
    if (unresolved.length > 0) {
      const details = unresolved.map(inj => {
        const name = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
        return `${name} (${inj.status}, reason: ${inj.durationContext || 'none'}, source: ${inj.source || 'unknown'})`;
      }).join('; ');
      throw new Error(`[Scout Report] CRITICAL: ${unresolved.length} NBA injuries with UNKNOWN duration after box-score resolution. This should never happen. Details: ${details}`);
    }

    // Build stale injuries list (for downstream context)
    injuries.staleInjuries = [
      ...(injuries.home || []).filter(i => i.isPricedIn).map(i => `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim()),
      ...(injuries.away || []).filter(i => i.isPricedIn).map(i => `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim())
    ];

    // Log summary
    const freshPlayers = allInjuries.filter(i => i.freshness === 'FRESH' && (i.status || '').toLowerCase().includes('out'));
    const stalePlayers = allInjuries.filter(i => i.freshness === 'STALE' && (i.status || '').toLowerCase().includes('out'));
    if (freshPlayers.length > 0) {
      console.log(`[Scout Report] Fresh OUT (0-2 games missed): ${freshPlayers.map(i => `${i.player?.first_name} ${i.player?.last_name} (${i.gamesMissed ?? 0}g)`).join(', ')}`);
    }
    if (stalePlayers.length > 0) {
      console.log(`[Scout Report] Stale OUT (>2 games, line likely adjusted): ${stalePlayers.map(i => `${i.player?.first_name} ${i.player?.last_name} (${i.gamesMissedIsMinimum ? i.gamesMissed + '+' : i.gamesMissed}g)`).join(', ')}`);
    }
  }

  // For NBA, fetch game context using Gemini Grounding (venue, tournament context, game significance)
  // This works dynamically for regular season, NBA Cup, playoffs, etc.
  let gameContextData = null;
  if (sportKey === 'NBA') {
    try {
      // Use US Eastern time to get correct date (avoids UTC offset issues for evening games)
      let dateStr;
      if (game.commence_time) {
        const gameDate = new Date(game.commence_time);
        dateStr = gameDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD format
      } else {
        dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      }
      console.log(`[Scout Report] Fetching NBA game context via Gemini Grounding for ${dateStr}...`);
      
      // Ask Gemini to determine game type with structured output at the end
      const contextQuery = `Given this NBA game: ${awayTeam} vs ${homeTeam} on ${dateStr}.

Determine what type of game this is, where it is being played, and any special significance.
Search for current information about this specific game.

After your analysis, include this EXACT summary block at the very end of your response:
---GAME_CONTEXT---
GAME_TYPE: [one of: regular_season, nba_cup_group, nba_cup_quarterfinal, nba_cup_semifinal, nba_cup_championship, playoffs]
NEUTRAL_SITE: [yes or no]
VENUE: [arena name, city]
---END_CONTEXT---`;

      const contextResult = await geminiGroundingSearch(contextQuery, {
        temperature: 1.0,
        maxTokens: 1500
      });

      if (contextResult?.success && contextResult?.data) {
        const responseText = contextResult.data;

        // Store full Grounding response — Gary reads this directly
        game.gameSignificance = responseText;

        // Parse the structured block (if Gemini included it)
        const contextMatch = responseText.match(/---GAME_CONTEXT---\s*([\s\S]*?)\s*---END_CONTEXT---/);
        if (contextMatch) {
          const block = contextMatch[1];
          const gameType = block.match(/GAME_TYPE:\s*(.+)/i)?.[1]?.trim().toLowerCase() || '';
          const neutralSite = block.match(/NEUTRAL_SITE:\s*(.+)/i)?.[1]?.trim().toLowerCase() || '';
          const venue = block.match(/VENUE:\s*(.+)/i)?.[1]?.trim() || '';

          if (gameType.includes('nba_cup')) {
            if (gameType.includes('championship')) game.tournamentContext = 'NBA Cup Championship';
            else if (gameType.includes('semifinal')) game.tournamentContext = 'NBA Cup Semifinal';
            else if (gameType.includes('quarterfinal')) game.tournamentContext = 'NBA Cup Quarterfinal';
            else game.tournamentContext = 'NBA Cup';
            console.log(`[Scout Report] ✓ ${game.tournamentContext} detected`);
          } else if (gameType.includes('playoff')) {
            game.tournamentContext = 'NBA Playoffs';
            console.log('[Scout Report] ✓ Playoff game detected');
          } else {
            console.log('[Scout Report] Regular season game');
          }

          if (neutralSite === 'yes') {
            game.isNeutralSite = true;
          }

          if (venue && venue.toLowerCase() !== 'n/a') {
            game.venue = venue;
            console.log(`[Scout Report] ✓ Venue: ${venue}`);
          }
        } else {
          // Structured block not found — default to regular season (safe)
          console.log('[Scout Report] Regular season game (no structured context block)');
        }

        gameContextData = {
          rawContext: responseText,
          isNbaCup: !!game.tournamentContext?.includes('NBA Cup'),
          isPlayoffs: game.tournamentContext === 'NBA Playoffs',
          isNeutralSite: game.isNeutralSite || false
        };

        console.log('[Scout Report] ✓ Game context retrieved via Gemini Grounding');
      }
    } catch (e) {
      console.warn('[Scout Report] NBA game context fetch failed:', e.message);
    }
  }
  
  // For NFL, set venue from stadium mapping (Gemini Grounding handles game context)
  // All NFL context comes from Gemini 3 Pro Grounding
  if (sportKey === 'NFL') {
    // NFL team to home stadium mapping (for reliable venue data) - stadium name only, no city
    const nflStadiums = {
      'Arizona Cardinals': 'State Farm Stadium',
      'Atlanta Falcons': 'Mercedes-Benz Stadium',
      'Baltimore Ravens': 'M&T Bank Stadium',
      'Buffalo Bills': 'Highmark Stadium',
      'Carolina Panthers': 'Bank of America Stadium',
      'Chicago Bears': 'Soldier Field',
      'Cincinnati Bengals': 'Paycor Stadium',
      'Cleveland Browns': 'Cleveland Browns Stadium',
      'Dallas Cowboys': 'AT&T Stadium',
      'Denver Broncos': 'Empower Field at Mile High',
      'Detroit Lions': 'Ford Field',
      'Green Bay Packers': 'Lambeau Field',
      'Houston Texans': 'NRG Stadium',
      'Indianapolis Colts': 'Lucas Oil Stadium',
      'Jacksonville Jaguars': 'EverBank Stadium',
      'Kansas City Chiefs': 'GEHA Field at Arrowhead Stadium',
      'Las Vegas Raiders': 'Allegiant Stadium',
      'Los Angeles Chargers': 'SoFi Stadium',
      'Los Angeles Rams': 'SoFi Stadium',
      'Miami Dolphins': 'Hard Rock Stadium',
      'Minnesota Vikings': 'U.S. Bank Stadium',
      'New England Patriots': 'Gillette Stadium',
      'New Orleans Saints': 'Caesars Superdome',
      'New York Giants': 'MetLife Stadium',
      'New York Jets': 'MetLife Stadium',
      'Philadelphia Eagles': 'Lincoln Financial Field',
      'Pittsburgh Steelers': 'Acrisure Stadium',
      'San Francisco 49ers': 'Levi\'s Stadium',
      'Seattle Seahawks': 'Lumen Field',
      'Tampa Bay Buccaneers': 'Raymond James Stadium',
      'Tennessee Titans': 'Nissan Stadium',
      'Washington Commanders': 'Northwest Stadium'
    };
    
    // Set venue from our own data (reliable) - use home team's stadium
    const homeVenue = nflStadiums[homeTeam];
    if (homeVenue) {
      game.venue = homeVenue;
      console.log(`[Scout Report] ✓ NFL Venue (from mapping): ${homeVenue}`);
    }
    // Game context (TNF/SNF/MNF, divisional, playoff implications) now handled by Gemini Grounding
    console.log(`[Scout Report] NFL context will be fetched via Gemini Grounding`);
  }
  
  // For NFL/NCAAF, fetch starting QBs (pass injuries to filter out IR/Out players)
  let startingQBs = null;
  if (sportKey === 'NFL' || sportKey === 'NCAAF') {
    startingQBs = await fetchStartingQBs(homeTeam, awayTeam, sportKey, injuries);
  }
  
  // For NFL, fetch key players (roster + stats) to prevent hallucinations
  let keyPlayers = null;
  if (sportKey === 'NFL') {
    keyPlayers = await fetchKeyPlayers(homeTeam, awayTeam, sportKey);
  }
  
  // For NBA, fetch key players (roster + stats) to prevent hallucinations
  // CRITICAL: Without this, LLM may hallucinate players who were traded (e.g., Luka Doncic)
  let nbaKeyPlayers = null;
  let nbaRosterDepth = null;
  if (sportKey === 'NBA') {
    const nbaSeasonYear = nbaSeason();

    // Fetch in parallel: key players + BDL roster depth + current state (news/headlines)
    const [keyPlayers, rosterDepth, nbaCurrentState] = await Promise.all([
      fetchNbaKeyPlayers(homeTeam, awayTeam, sportKey),
      ballDontLieService.getNbaRosterDepth(homeTeam, awayTeam, nbaSeasonYear),
      fetchCurrentState(homeTeam, awayTeam, sport).catch(e => {
        console.warn('[Scout Report] NBA current state error (non-fatal):', e.message);
        return null;
      })
    ]);
    nbaKeyPlayers = keyPlayers;
    nbaRosterDepth = rosterDepth;
    // Note: fetchNbaKeyPlayers now throws on roster failure

    // Set narrative context from Grounding current state (includes news/headlines/storylines)
    // This supplements the RapidAPI injury data with game context and today's news
    if (nbaCurrentState?.groundedRaw && injuries) {
      // Combine: keep RapidAPI injury data as the injury source, add Grounding narrative for context
      const existingNarrative = injuries.narrativeContext || '';
      injuries.narrativeContext = existingNarrative
        ? `${existingNarrative}\n\n--- TODAY'S GAME CONTEXT & NEWS ---\n${nbaCurrentState.groundedRaw}`
        : nbaCurrentState.groundedRaw;
      console.log(`[Scout Report] NBA current state added to narrative (${nbaCurrentState.groundedRaw.length} chars)`);
    }

    // Compute L5 efficiency + roster context (uses game IDs from recentHome/recentAway fetched at line 442-443)
    // We fetch 8 recent games as buffer (some may lack box scores), but only use 5 for L5 calc
    if (rosterDepth?.homeTeamId && rosterDepth?.awayTeamId) {
      const homeGameIds = (recentHome || []).map(g => g.id).filter(Boolean).slice(0, 5);
      const awayGameIds = (recentAway || []).map(g => g.id).filter(Boolean).slice(0, 5);
      if (homeGameIds.length > 0 || awayGameIds.length > 0) {
        try {
          const [homeL5, awayL5] = await Promise.all([
            homeGameIds.length > 0 ? ballDontLieService.getTeamL5Efficiency(rosterDepth.homeTeamId, homeGameIds) : null,
            awayGameIds.length > 0 ? ballDontLieService.getTeamL5Efficiency(rosterDepth.awayTeamId, awayGameIds) : null
          ]);
          // Attach to rosterDepth so formatNbaRosterDepth can use it
          nbaRosterDepth.homeL5 = homeL5;
          nbaRosterDepth.awayL5 = awayL5;
          console.log(`[Scout Report] L5 efficiency computed: Home ${homeL5?.efficiency?.games || 0} games, Away ${awayL5?.efficiency?.games || 0} games`);
        } catch (e) {
          console.warn(`[Scout Report] L5 efficiency computation failed (non-fatal):`, e.message);
        }
      }

      // Fetch REAL team-level advanced stats for season comparison in scout report
      try {
        const [homeTeamStats, awayTeamStats] = await Promise.all([
          ballDontLieService.getTeamSeasonAdvanced(rosterDepth.homeTeamId, nbaSeasonYear),
          ballDontLieService.getTeamSeasonAdvanced(rosterDepth.awayTeamId, nbaSeasonYear)
        ]);
        nbaRosterDepth.homeTeamStats = homeTeamStats;
        nbaRosterDepth.awayTeamStats = awayTeamStats;
      } catch (e) {
        console.warn(`[Scout Report] Team season advanced fetch failed (non-fatal):`, e.message);
      }
    }

    // Post-process: Filter injuries against BDL active roster
    // RapidAPI injury feed can have stale team assignments (e.g., traded players still listed under old team)
    // BDL active roster is ground truth for who is actually on each team RIGHT NOW
    if (injuries && nbaRosterDepth) {
      const buildRosterNames = (players) => {
        if (!players || !Array.isArray(players)) return [];
        return players.map(p => (p.name || `${p.first_name || ''} ${p.last_name || ''}`).toLowerCase().trim()).filter(n => n);
      };
      const homeRosterNames = buildRosterNames(nbaRosterDepth.home);
      const awayRosterNames = buildRosterNames(nbaRosterDepth.away);
      const allRosterNames = [...homeRosterNames, ...awayRosterNames];

      const filterInjuriesToRoster = (injuryList, teamLabel) => {
        if (!injuryList || injuryList.length === 0) return injuryList;
        return injuryList.filter(inj => {
          const injName = typeof inj.player === 'string' ? inj.player :
            `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
          const onRoster = allRosterNames.some(rn => playerNamesMatch(rn, injName));
          if (!onRoster) {
            console.log(`[Scout Report] FILTERED injury: ${injName} (${inj.status}) — NOT on BDL active roster for ${teamLabel} (likely traded)`);
          }
          return onRoster;
        });
      };

      const homeBefore = injuries.home?.length || 0;
      const awayBefore = injuries.away?.length || 0;
      injuries.home = filterInjuriesToRoster(injuries.home, homeTeam);
      injuries.away = filterInjuriesToRoster(injuries.away, awayTeam);
      const filtered = (homeBefore - (injuries.home?.length || 0)) + (awayBefore - (injuries.away?.length || 0));
      if (filtered > 0) {
        console.log(`[Scout Report] Roster filter removed ${filtered} stale injury entry/entries (traded players)`);
        // Rebuild groundingRaw to reflect filtered injuries
        injuries.groundingRaw = [
          `=== ${awayTeam} ===`, `${awayTeam} INJURY REPORT:`,
          injuries.away.length > 0
            ? injuries.away.map(i => `${i.player.first_name} ${i.player.last_name} - ${i.status} (${i.durationContext})`).join('\n')
            : 'No injuries reported',
          '', `=== ${homeTeam} ===`, `${homeTeam} INJURY REPORT:`,
          injuries.home.length > 0
            ? injuries.home.map(i => `${i.player.first_name} ${i.player.last_name} - ${i.status} (${i.durationContext})`).join('\n')
            : 'No injuries reported'
        ].join('\n');
      }
    }

    // Post-process: Cross-reference API injuries against roster depth
    // This catches name mismatches and truncated grounding responses
    // (e.g., "Shai Alexander" in API vs "Shai Gilgeous-Alexander" in BDL)
    if (injuries && nbaRosterDepth) {
      const apiOutNames = [...(injuries.home || []), ...(injuries.away || [])]
        .filter(inj => {
          const s = (inj.status || '').toLowerCase();
          return s === 'out' || s.includes('out for season');
        })
        .map(inj => {
          const name = typeof inj.player === 'string' ? inj.player :
            `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
          return name.toLowerCase();
        })
        .filter(n => n);

      if (apiOutNames.length > 0) {
        const filterOutFromRoster = (players) => {
          if (!players) return players;
          return players.filter(p => {
            const pName = (p.name || '').toLowerCase();
            const isOut = apiOutNames.some(outName => playerNamesMatch(pName, outName));
            if (isOut) {
              if ((p.pts || p.ppg || 0) >= 10) {
                console.log(`[Scout Report] Post-filter excluded ${p.name} (${(p.pts || p.ppg || 0).toFixed?.(1) || '?'} PPG) from roster - API injury match`);
              }
            }
            return !isOut;
          });
        };
        nbaRosterDepth.home = filterOutFromRoster(nbaRosterDepth.home);
        nbaRosterDepth.away = filterOutFromRoster(nbaRosterDepth.away);
      }
    }
  }

  // For NHL, fetch key players (roster + stats) to prevent hallucinations
  let nhlKeyPlayers = null;
  let nhlRosterDepth = null;
  if (sportKey === 'NHL') {
    const nhlSeasonYear = nhlSeason();

    // Fetch in parallel: RotoWire lineups + BDL roster depth + current state (news/headlines)
    const [keyPlayers, rosterDepth, nhlCurrentState] = await Promise.all([
      fetchNhlKeyPlayers(homeTeam, awayTeam, sportKey),
      ballDontLieService.getNhlRosterDepth(homeTeam, awayTeam, nhlSeasonYear),
      fetchCurrentState(homeTeam, awayTeam, sport).catch(e => {
        console.warn('[Scout Report] NHL current state error (non-fatal):', e.message);
        return null;
      })
    ]);
    nhlKeyPlayers = keyPlayers;
    nhlRosterDepth = rosterDepth;

    // Append game context & news to injury narrative (same pattern as NBA)
    if (nhlCurrentState?.groundedRaw && injuries) {
      const existingNarrative = injuries.narrativeContext || '';
      injuries.narrativeContext = existingNarrative
        ? `${existingNarrative}\n\n--- TODAY'S GAME CONTEXT & NEWS ---\n${nhlCurrentState.groundedRaw}`
        : nhlCurrentState.groundedRaw;
      console.log(`[Scout Report] NHL current state added to narrative (${nhlCurrentState.groundedRaw.length} chars)`);
    }
  }
  
  // For NCAAB, fetch roster depth (top 9 contributors), conference standings,
  // CURRENT STATE narrative, and TIER 1 advanced metrics (KenPom/NET/Barttorvik/SOS)
  let ncaabRosterDepth = null;
  let ncaabConferenceIds = null;
  let ncaabStandingsSnapshot = '';
  let ncaabAdvancedMetrics = null;
  // ncaabTeamFourFactors REMOVED — BDL doesn't have proper NCAAB Four Factors data
  let ncaabRankings = null;
  let ncaabHomeCourt = null;
  let highlightlyH2H = null;
  if (sportKey === 'NCAAB') {
    const ncaabSeasonYear = ncaabSeason();

    // Phase 1: Fetch in parallel — BDL roster depth + Gemini grounding + Highlightly H2H
    // Current State, Advanced Metrics, and Highlightly don't need BDL team IDs
    const [rosterResult, currentStateResult, advMetricsResult, highlightlyH2HResult] = await Promise.all([
      ballDontLieService.getNcaabRosterDepth(homeTeam, awayTeam, ncaabSeasonYear).catch(e => {
        console.warn('[Scout Report] NCAAB roster depth error:', e.message);
        return null;
      }),
      fetchCurrentState(homeTeam, awayTeam, sport).catch(e => {
        console.warn('[Scout Report] NCAAB current state error:', e.message);
        return null;
      }),
      fetchNcaabAdvancedMetrics(homeTeam, awayTeam).catch(e => {
        console.warn('[Scout Report] NCAAB advanced metrics error:', e.message);
        return null;
      }),
      getNcaabH2H(homeTeam, awayTeam).catch(e => {
        console.warn('[Scout Report] Highlightly H2H error:', e.message);
        return null;
      })
    ]);

    ncaabRosterDepth = rosterResult;
    ncaabAdvancedMetrics = advMetricsResult;
    highlightlyH2H = highlightlyH2HResult;

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
      // NOTE: NCAAB Four Factors REMOVED — BDL returns per-game averages for NCAAB (not totals),
      // producing nonsense values (PPG 3.5, Tempo 3.0). NCAAB doesn't have proper Four Factors in BDL.
      // KenPom/Barttorvik Tier 1 metrics from Grounding cover this gap.
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

      // Home court calculated from existing recentHome/recentAway — no extra API call
      ncaabHomeCourt = calcNcaabHomeCourt(recentHome, recentAway, homeTeam, awayTeam, ncaabRosterDepth.homeTeamId, ncaabRosterDepth.awayTeamId);
    }

    // Phase 3: L5 efficiency (depends on roster depth team IDs + recent game IDs)
    // Full season fetched for home/away splits, but only first 5 game IDs used for L5 efficiency
    if (ncaabRosterDepth?.homeTeamId && ncaabRosterDepth?.awayTeamId) {
      const homeGameIds = (recentHome || []).map(g => g.id).filter(Boolean).slice(0, 5);
      const awayGameIds = (recentAway || []).map(g => g.id).filter(Boolean).slice(0, 5);
      if (homeGameIds.length > 0 || awayGameIds.length > 0) {
        try {
          const [homeL5, awayL5] = await Promise.all([
            homeGameIds.length > 0 ? ballDontLieService.getTeamL5Efficiency(ncaabRosterDepth.homeTeamId, homeGameIds, 'basketball_ncaab') : null,
            awayGameIds.length > 0 ? ballDontLieService.getTeamL5Efficiency(ncaabRosterDepth.awayTeamId, awayGameIds, 'basketball_ncaab') : null
          ]);
          ncaabRosterDepth.homeL5 = homeL5;
          ncaabRosterDepth.awayL5 = awayL5;
          console.log(`[Scout Report] NCAAB L5 efficiency computed: Home ${homeL5?.efficiency?.games || 0} games, Away ${awayL5?.efficiency?.games || 0} games`);
        } catch (e) {
          console.warn(`[Scout Report] NCAAB L5 efficiency computation failed (non-fatal):`, e.message);
        }
      }
    }
  }

  // For NFL, fetch roster depth (key skill players)
  let nflRosterDepth = null;
  let nflPlayoffHistory = null;
  let nflHomeTeamId = null;
  let nflAwayTeamId = null;
  if (sportKey === 'NFL') {
    const nflSeasonYear = nflSeason();

    try {
      nflRosterDepth = await ballDontLieService.getNflRosterDepth(homeTeam, awayTeam, nflSeasonYear);
    } catch (e) {
      console.warn('[Scout Report] NFL roster depth error:', e.message);
    }
    
    // For NFL playoff games, fetch previous playoff results this season
    // Check if this is a playoff game (tournamentContext will be set after line ~715)
    const lowerName = (game.name || '').toLowerCase();
    const isPlayoffGame = lowerName.includes('wild card') || lowerName.includes('divisional') ||
                          lowerName.includes('championship') || lowerName.includes('super bowl') ||
                          lowerName.includes('playoff');
    
    if (isPlayoffGame) {
      try {
        // Get team IDs for playoff history
        const [homeTeamData, awayTeamData] = await Promise.all([
          ballDontLieService.getTeamByNameGeneric('americanfootball_nfl', homeTeam),
          ballDontLieService.getTeamByNameGeneric('americanfootball_nfl', awayTeam)
        ]);
        
        nflHomeTeamId = homeTeamData?.id;
        nflAwayTeamId = awayTeamData?.id;
        
        if (nflHomeTeamId && nflAwayTeamId) {
          console.log(`[Scout Report] NFL Playoff game detected - fetching playoff history for ${homeTeam} (${nflHomeTeamId}) and ${awayTeam} (${nflAwayTeamId})`);
          nflPlayoffHistory = await ballDontLieService.getNflPlayoffHistory(
            [nflHomeTeamId, nflAwayTeamId],
            nflSeason
          );
          console.log(`[Scout Report] NFL playoff history: ${nflPlayoffHistory?.games?.length || 0} previous games found`);
        }
      } catch (e) {
        console.warn('[Scout Report] NFL playoff history error:', e.message);
      }
    }
  }
  
  // For NCAAF, fetch key players (roster + stats) to prevent hallucinations
  let ncaafKeyPlayers = null;
  if (sportKey === 'NCAAF') {
    ncaafKeyPlayers = await fetchNcaafKeyPlayers(homeTeam, awayTeam, sportKey);
  }
  
  // For NCAAB, fetch key players (roster + stats) to prevent hallucinations
  // CRITICAL: College basketball has frequent transfers - this prevents referencing players who transferred
  let ncaabKeyPlayers = null;
  if (sportKey === 'NCAAB') {
    ncaabKeyPlayers = await fetchNcaabKeyPlayers(homeTeam, awayTeam, sportKey);
  }
  
  // For NCAAF, fetch conference tier context
  let conferenceTierSection = '';
  if (sportKey === 'NCAAF') {
    conferenceTierSection = await formatConferenceTierSection(homeTeam, awayTeam, sportKey);
  }
  
  // For NCAAF, fetch bowl game context if applicable (December-January games are likely bowls)
  let bowlGameContext = '';
  if (sportKey === 'NCAAF') {
    bowlGameContext = await fetchBowlGameContext(homeTeam, awayTeam, game, injuries?.narrativeContext);
  }
  
  // For NCAAF CFP games, fetch each team's road to the championship
  // This provides full playoff journey context for steel man cases
  let cfpJourneyContext = '';
  if (sportKey === 'NCAAF') {
    cfpJourneyContext = await fetchCfpJourneyContext(homeTeam, awayTeam, game);
  }
  
  // NCAAB tournament context now provided by Gemini Grounding in Pass 1 investigation
  
  // PRE-LOAD H2H DATA - This prevents Gary from hallucinating H2H records
  // We fetch it here so it's always available in the Scout Report
  let h2hData = null;
  try {
    h2hData = await fetchH2HData(homeTeam, awayTeam, sportKey, recentHome, recentAway);
    console.log(`[Scout Report] H2H Data: ${h2hData?.found ? `${h2hData.gamesFound} game(s) found` : 'No games found'}`);
  } catch (e) {
    console.log(`[Scout Report] H2H fetch failed: ${e.message}`);
  }

  // NFL: Set tournamentContext for primetime or divisional games
  if (sportKey === 'NFL') {
    const gameDate = new Date(game.commence_time);
    const day = gameDate.getUTCDay(); // 0=Sun, 1=Mon, 4=Thu
    const hour = gameDate.getUTCHours(); // UTC hours
    
    // Simple primetime detection (games starting after 8pm ET / 1am UTC)
    if (day === 1 && hour >= 0) game.tournamentContext = 'MNF';
    else if (day === 4 && hour >= 0) game.tournamentContext = 'TNF';
    else if (day === 0 && hour >= 23) game.tournamentContext = 'SNF';
    
    // Also check for "Divisional", "Wild Card", etc. in game name
    const lowerName = (game.name || '').toLowerCase();
    if (lowerName.includes('divisional')) game.tournamentContext = 'Divisional';
    else if (lowerName.includes('wild card')) game.tournamentContext = 'Wild Card';
    else if (lowerName.includes('championship')) game.tournamentContext = 'Championship';
    else if (lowerName.includes('super bowl')) game.tournamentContext = 'Super Bowl';
  }

  // Generate smart game significance if not already set (from Gemini Grounding or playoff context)
  // This provides meaningful labels like "Division Rivals", "Top 5 Eastern Battle", "Historic Rivalry", etc.
  if (!game.gameSignificance || game.gameSignificance === 'Regular season game' || game.gameSignificance.length > 100) {
    try {
      // Fetch standings for significance generation (optional - fallbacks exist)
      const bdlSport = sportToBdlKey(sportKey);
      let standings = [];
      if (bdlSport && sportKey !== 'NCAAF') {
        const currentSeason = seasonForSport(sportKey);
        try {
          standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason }) || [];
        } catch (standingsErr) {
          console.log(`[Scout Report] Standings fetch failed (will use fallbacks): ${standingsErr.message}`);
        }
      }

      // Generate significance even without standings - fallbacks handle conference matchups
      const significance = generateGameSignificance(
        {
          home_team: homeTeam,
          away_team: awayTeam,
          venue: game.venue,
          date: game.date || game.datetime,
          postseason: game.postseason,
          // Pass conference data for NCAAB/NCAAF (already set on game object)
          homeConference: game.homeConference,
          awayConference: game.awayConference
        },
        sportKey,
        standings,
        game.week || null
      );
      if (significance) {
        game.gameSignificance = significance;
        console.log(`[Scout Report] ✓ Game significance: ${significance}`);
      }
    } catch (sigErr) {
      console.log(`[Scout Report] Could not generate game significance: ${sigErr.message}`);
    }
  }

  // Format injuries for display
  const formatInjuriesForStorage = (injuries) => {
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
  };
  
  const injuriesForStorage = formatInjuriesForStorage(injuries);

  // Narrative Scrubbing: Remove "ghost" players from the grounding narrative
  // This ensures Gary never even sees names of players who are not in the active stats or filtered injuries.
  if (injuries?.narrativeContext) {
    const allowedNames = new Set();
    
    // 1. Add names from BDL roster depth (primary source of truth for active players)
    const roster = nbaRosterDepth || nhlRosterDepth || ncaabRosterDepth || nflRosterDepth;
    
    // Helper to add names from different roster/keyPlayer formats
    const addNamesFromSource = (teamData) => {
      if (!teamData) return;
      if (Array.isArray(teamData)) {
        teamData.forEach(p => { if (p.name) allowedNames.add(p.name.trim()); });
      } else {
        // Handle NHL-style object structures
        // Roster depth: { skaters: [], goalies: [] }
        // Key players: { forwards: [], defensemen: [], goalies: [] }
        // Support common collection names in sports data
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
        
        // Also check if the object itself has name/player properties (if it's a single player object)
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
    
    // 2. Add names from key players/QBs if available
    const keyP = nbaKeyPlayers || nhlKeyPlayers || ncaabKeyPlayers || ncaafKeyPlayers || keyPlayers;
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
    // These players should not appear in the narrative even if on the roster
    const excludedLongTerm = new Set(injuries.filteredLongTerm || []);

    // NCAAB: Use BDL season stats (games played) to detect players who never played this season
    // gp === 0 means the player has been out ALL season — team has played without them all year, safe to remove
    // gp > 0 means they played at some point — any current injury is fresh/relevant, KEEP them
    // This replaces the old regex approach which couldn't distinguish fresh vs stale injuries
    const rosterWithGp = ncaabRosterDepth || nbaRosterDepth || nhlRosterDepth || nflRosterDepth;
    if (rosterWithGp?.gpMap) {
      const gpMap = rosterWithGp.gpMap;
      // Check each injured player against the GP map
      [...(injuries.home || []), ...(injuries.away || [])].forEach(i => {
        const name = i.name || `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim();
        if (!name || name.length < 4) return;
        // Look up GP — if player is in BDL roster with 0 games, they never played this season
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

  // NBA injuries: RapidAPI for status, BDL for duration enrichment, BDL roster for top 10 players by PPG
  // No more Rotowire grounding for NBA lineups/starters

  
  // NCAAB GTD INVESTIGATION LOGIC
  // College basketball has smaller rosters - GTD starters create uncertainty
  // GTD = Game Time Decision from RotoWire - these create betting uncertainty
  // KEY: Only count GTD players who are STARTERS (not bench players)
  if (sportKey === 'NCAAB') {
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
            const injuries = [];
            const teamLower = teamName.toLowerCase();
            const otherTeamLower = (otherTeamName || '').toLowerCase();

            // Extract team-specific INJURIES section
            // Look for "=== Team Name ===" followed by INJURIES: section
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
            if (!injuriesMatch) return injuries;

            const injuriesText = injuriesMatch[1];

            // NCAAB RotoWire format: "G Jahseem Felton OFS" or "F Patrick Suemnick Out"
            // Position: PG, SG, SF, PF, C, G, F
            // Status: Out, OFS, GTD
            // Use [ \t] instead of \s to prevent matching across newlines
            // (which caused "Kordel Jefferson OFS\nHouston Cougars GTD" to concat into one entry)
            const injuryPattern = /\b(PG|SG|SF|PF|C|G|F)[ \t]+([A-Z][a-z'.-]+(?:[ \t]+[A-Z][a-z'.-]+)*)[ \t]+(Out|OFS|GTD)\b/gi;
            const matches = [...injuriesText.matchAll(injuryPattern)];

            for (const match of matches) {
              const position = match[1];
              const playerName = match[2];
              const status = match[3].toUpperCase();

              // Normalize status and add freshness tags per CLAUDE.md injury timing rules
              let normalizedStatus = status;
              let duration = 'UNKNOWN';
              let freshnessTip = '';

              if (status === 'OFS') {
                normalizedStatus = 'Out (Season)';
                duration = 'SEASON-LONG';
                freshnessTip = 'SEASON-LONG absence.';
              } else if (status === 'GTD') {
                normalizedStatus = 'GTD';
                duration = 'RECENT';
                freshnessTip = 'GAME-TIME DECISION — Investigate latest update timing.';
              } else if (status === 'OUT') {
                duration = 'UNKNOWN';
                freshnessTip = 'STATUS: OUT — Investigate how long this player has been out and what role they play.';
              }

              const nameParts = playerName.trim().split(/\s+/);
              injuries.push({
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

            return injuries;
          };

          // Parse injuries from INDIVIDUAL team responses (not combined text)
          if (sportKey === 'NCAAB' || sportKey === 'basketball_ncaab') {
            rotoWireInjuries.away = parseNcaabInjuriesFromResponse(cleanAway, awayTeam, homeTeam);
            rotoWireInjuries.home = parseNcaabInjuriesFromResponse(cleanHome, homeTeam, awayTeam);
            if (rotoWireInjuries.away.length > 0 || rotoWireInjuries.home.length > 0) {
              console.log(`[Scout Report] NCAAB RotoWire injuries parsed: ${rotoWireInjuries.away.length} for ${awayTeam}, ${rotoWireInjuries.home.length} for ${homeTeam}`);

              // CRITICAL: Merge RotoWire injuries into the injuries object NOW
              // (so they appear in the injury report generated later)
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
                  console.log(`[Scout Report] ✅ Added NCAAB injury to report: ${name} (${inj.status}) for ${homeTeam}`);
                }
              }
              for (const inj of rotoWireInjuries.away) {
                const name = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.toLowerCase().trim();
                if (!existingAwayNames.has(name)) {
                  injuries.away.push(inj);
                  console.log(`[Scout Report] ✅ Added NCAAB injury to report: ${name} (${inj.status}) for ${awayTeam}`);
                }
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
                  // Fetch active players for both teams to resolve names → BDL IDs
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
                          inj.duration = daysSince >= 30 ? 'SEASON-LONG' : daysSince >= 7 ? 'MID-SEASON' : daysSince <= 3 ? 'RECENT' : 'MID-SEASON';
                        }
                        inj.durationSource = 'game_log';

                        console.log(`[Scout Report] NCAAB game-log: ${pName} last played ${inj.reportDateStr} (${daysSince}d ago) → ${inj.duration}`);
                      } else {
                        inj.daysSinceReport = 90;
                        inj.reportDateStr = 'before season';
                        inj.duration = 'SEASON-LONG';
                        inj.durationSource = 'game_log_no_games';

                        console.log(`[Scout Report] NCAAB game-log: ${pName} no games in 90 days → SEASON-LONG`);
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
            
            // Pattern: "TeamName GTD PLAYERS:" followed by comma-separated names
            // FIXED: Allow any characters between team name and GTD (to handle "Team Name GTD PLAYERS:")
            // Use non-greedy match and stop at next team mention or newline
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
                // Check if it says "none" or similar
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
                  // Clean up and validate
                  const cleanName = name.replace(/\s*\([^)]*\)/g, '').trim(); // Remove parenthetical
                  // Skip if name contains structural words
                  if (cleanName.length > 2 && 
                      cleanName.length < 40 && // Names shouldn't be super long
                      cleanName.match(/^[A-Z]/) &&
                      !invalidNames.test(cleanName) &&
                      !/^(PG|SG|SF|PF|C)$/i.test(cleanName) && // Skip position abbreviations
                      !/STARTERS?|LINEUP|PLAYERS?|GTD|OUT/i.test(cleanName)) {  // Skip structural words
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
            // Fallback to legacy parsing formats
          
          // Parse all GTD players from response, then assign to teams
          const parseAllGTDPlayers = (text) => {
            const allGTD = [];
            const invalidNames = /^(The|This|His|Her|That|None|No|Unknown|It|He|She|Game|Time|Decision|Availability|Status|Out|OFS|Season)$/i;
            
            // Format 1: "**GTD:** PlayerName is battling..." (with verbs) - capture full name
            const gtdWithVerbPattern = /\*\*GTD[^*]*\*\*:?\s*([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?(?:\s+Jr\.?)?)\s+(?:is|has|was|remains|dealing|battling|ailing|questionable|uncertain)/gi;
            let match;
            while ((match = gtdWithVerbPattern.exec(text)) !== null) {
              let name = match[1].trim();
              // Clean up trailing verbs
              name = name.replace(/\s+(is|has|was|remains|dealing|battling|ailing|questionable|uncertain)$/i, '');
              if (name.length > 2 && !name.match(invalidNames)) {
                const textBefore = text.substring(0, match.index);
                allGTD.push({ name, status: 'GTD', context: textBefore.slice(-200) });
              }
            }
            
            // Format 2: "**GTD:** PlayerName, PlayerName2, PlayerName3" (comma-separated list)
            // This is the most common format from Gemini
            const gtdListPattern = /\*\*GTD:\*\*\s*([^*\n]+?)(?=\n|\*\*Out|\*\*OFS|$)/gi;
            while ((match = gtdListPattern.exec(text)) !== null) {
              const listText = match[1].trim();
              const textBefore = text.substring(0, match.index);
              
              // Split by comma and extract names
              const names = listText.split(/[,;]/).map(n => n.trim());
              for (const name of names) {
                // Clean up the name - remove any trailing description
                const cleanName = name.split(/\s+(?:is|has|was|-|\()/i)[0].trim();
                if (cleanName.length > 2 && 
                    cleanName.match(/^[A-Z]/) &&
                    !cleanName.match(invalidNames) &&
                    !allGTD.some(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
                  allGTD.push({ name: cleanName, status: 'GTD', context: textBefore.slice(-200) });
                }
              }
            }
            
            // Format 3: Sub-bullet format with verbs - capture full name (first + last)
            const gtdSections = text.split(/\*\*GTD[^*]*\*\*:?/i);
            for (let i = 1; i < gtdSections.length; i++) {
              const section = gtdSections[i];
              const endIdx = section.search(/\*\*Out|\*\*OFS/i);
              const gtdContent = endIdx > 0 ? section.substring(0, endIdx) : section.substring(0, 500);
              
              // Match full names: "McCaffery is battling..." or "B. Williams is..."
              const subPattern = /\*\s*([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?(?:\s+Jr\.?)?)\s+(?:is|has|was|remains|dealing|battling|ailing|questionable|uncertain|It)/gi;
              while ((match = subPattern.exec(gtdContent)) !== null) {
                let name = match[1].trim();
                name = name.replace(/\s+(is|has|was|remains|dealing|battling|ailing|questionable|uncertain)$/i, '');
                if (name.length > 2 && 
                    !name.match(invalidNames) &&
                    !allGTD.some(p => p.name.toLowerCase() === name.toLowerCase())) {
                  const contextStart = Math.max(0, gtdSections.slice(0, i).join('').length - 200);
                  allGTD.push({ name, status: 'GTD', context: text.substring(contextStart, gtdSections.slice(0, i).join('').length) });
                }
              }
            }
            
            // Format 4: "**PlayerName:** Questionable/uncertain/ailing..." (no GTD header)
            // Look for player names with GTD-like status in description
            const playerStatusPattern = /\*\s*\*\*([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?(?:\s+Jr\.?)?):\*\*\s*([^*\n]+)/gi;
            while ((match = playerStatusPattern.exec(text)) !== null) {
              const name = match[1].trim();
              const description = match[2].toLowerCase();
              
              // Check if description indicates GTD status (not OUT)
              const isGTD = description.includes('questionable') || 
                           description.includes('uncertain') || 
                           description.includes('game-time') ||
                           description.includes('gtd') ||
                           (description.includes('ailing') && !description.includes('out'));
              const isOut = description.includes('out for') || 
                           description.includes('season') ||
                           description.includes('no timetable');
              
              if (isGTD && !isOut && name.length > 2 && 
                  !name.match(invalidNames) &&
                  !allGTD.some(p => p.name.toLowerCase() === name.toLowerCase())) {
                const textBefore = text.substring(0, match.index);
                allGTD.push({ name, status: 'GTD', context: textBefore.slice(-200) });
              }
            }
            
            return allGTD;
          };
          
          // Get all GTD players from the response
          const allGTDPlayers = parseAllGTDPlayers(responseText);
          
          // Assign to home/away based on context
          for (const player of allGTDPlayers) {
            const context = (player.context || '').toLowerCase();
            const awayInContext = context.includes(awayTeam.toLowerCase()) || context.includes(awayShort.toLowerCase());
            const homeInContext = context.includes(homeTeam.toLowerCase()) || context.includes(homeShort.toLowerCase());
            
            // Assign to the team that appears most recently in context
            const awayLastIdx = Math.max(context.lastIndexOf(awayTeam.toLowerCase()), context.lastIndexOf(awayShort.toLowerCase()));
            const homeLastIdx = Math.max(context.lastIndexOf(homeTeam.toLowerCase()), context.lastIndexOf(homeShort.toLowerCase()));
            
            if (awayLastIdx > homeLastIdx) {
              rotoWireGTD.away.push({ name: player.name, status: 'GTD' });
            } else if (homeLastIdx > awayLastIdx) {
              rotoWireGTD.home.push({ name: player.name, status: 'GTD' });
            } else if (awayInContext) {
              rotoWireGTD.away.push({ name: player.name, status: 'GTD' });
            } else if (homeInContext) {
              rotoWireGTD.home.push({ name: player.name, status: 'GTD' });
            }
          }
          
          console.log(`[Scout Report] 🔍 Parsed ${allGTDPlayers.length} GTD player(s) from response`);
          
          // Note: GTD players are now parsed and assigned above via parseAllGTDPlayers
          
          // Filter out any team names, game descriptions, or invalid entries that got accidentally captured
          const isTeamNameOrInvalid = (name) => {
            const nameLower = name.toLowerCase();
            // Common mascots and team identifiers
            const mascots = ['bulldogs', 'musketeers', 'bruins', 'nittany', 'hawkeyes', 'boilermakers',
                            'wildcats', 'friars', 'volunteers', 'aggies', 'tigers', 'lions', 'bears',
                            'cardinals', 'red storm', 'golden eagles', 'hurricanes', 'seminoles'];
            // Game-related words that shouldn't be player names
            const gameWords = ['game', 'january', 'february', 'march', '2026', '2025', 'lineup', 
                              'roster', 'schedule', 'matchup', 'basketball', 'college', 'ncaab',
                              'vs', 'at', 'home', 'away', 'conference', 'big east', 'sec', 'acc'];
            
            if (mascots.some(m => nameLower.includes(m))) return true;
            if (gameWords.some(w => nameLower.includes(w))) return true;
            if (nameLower === awayTeam.toLowerCase() || nameLower === homeTeam.toLowerCase()) return true;
            if (nameLower === awayShort.toLowerCase() || nameLower === homeShort.toLowerCase()) return true;
            if (nameLower.includes(awayShort.toLowerCase()) || nameLower.includes(homeShort.toLowerCase())) return true;
            // Player names should be 2-4 words max (First Last or First Middle Last Jr.)
            const words = name.split(/\s+/);
            if (words.length > 4) return true;
            return false;
          };
          
          // Remove any team names or invalid entries from the results
          rotoWireGTD.away = rotoWireGTD.away.filter(p => !isTeamNameOrInvalid(p.name));
          rotoWireGTD.home = rotoWireGTD.home.filter(p => !isTeamNameOrInvalid(p.name));
          
          } // End of else block for legacy parsing
          
          if (rotoWireGTD.home.length > 0 || rotoWireGTD.away.length > 0) {
            console.log(`[Scout Report] RotoWire GTD found - ${homeTeam}: ${rotoWireGTD.home.map(p => p.name).join(', ') || 'none'}, ${awayTeam}: ${rotoWireGTD.away.map(p => p.name).join(', ') || 'none'}`);
          }
        }
    } catch (e) {
      console.warn(`[Scout Report] RotoWire GTD/injury check failed: ${e.message}`);
    }
    
    // ENHANCED: Parse GTD directly from narrative context since Gemini often loses GTD status
    // This catches cases where Gemini returns the raw text but parsing doesn't capture GTD
    const parseGTDFromNarrative = (teamName, narrativeText) => {
      if (!narrativeText) return [];
      
      const gtdPlayers = [];
      const text = narrativeText;
      
      // Multiple patterns to catch GTD mentions in various formats
      
      // Format 1: "**Luke Naser (G):** Questionable / Game-Time Decision (GTD)"
      // This is the most common format from Gemini Grounding
      const pattern1 = /\*\*([A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+)?)\s*\([^)]+\):\*\*[^*\n]*(?:GTD|Game-Time Decision)/gi;
      
      // Format 2: "Player Name GTD" or "Player Name (GTD)"
      const pattern2 = /([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Za-z'-]+)\s*(?:\([^)]*\))?\s*[-–]?\s*(?:\*\*)?GTD(?:\*\*)?/gi;
      
      // Format 3: "G Player Name GTD" (position prefix)
      const pattern3 = /(?:PG|SG|SF|PF|C|G|F)\s+([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Za-z'-]+)\s*(?:\([^)]*\))?\s*[-–]?\s*(?:\*\*)?GTD(?:\*\*)?/gi;
      
      // Format 4: Player name followed by : and status containing GTD
      const pattern4 = /\*?\s*([A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+)?)[^:]*:\s*[^*\n]*(?:GTD|Game-Time Decision)/gi;
      
      const patterns = [pattern1, pattern4, pattern2, pattern3]; // pattern1 and pattern4 are most common
      const foundPlayers = new Set();
      const invalidNames = /^(Season|Recent|January|Questionable|Status|Injury|Game)$/i;
      
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
          let playerName = match[1].trim();
          // Clean up any trailing parenthetical
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
      console.log(`[Scout Report] 🔍 Parsing narrative context for GTD mentions...`);
      const narrativeGTD = parseGTDFromNarrative('', injuries.narrativeContext);
      if (narrativeGTD.length > 0) {
        console.log(`[Scout Report] 📝 Found ${narrativeGTD.length} GTD player(s) in narrative: ${narrativeGTD.map(p => p.name).join(', ')}`);
        // Assign to teams based on name matching (rough heuristic)
        // For now, we'll just flag if ANY GTD found - the key player check will verify
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
    
  }
  
  // Extract narrative context from Gemini Grounding (valuable even if injury parsing returned 0)
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
  
  // Build game context section if we have special context (NBA Cup, playoffs, etc.)
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
  // This goes at the VERY TOP of the scout report - before anything else
  const filteredPlayers = injuries?.filteredLongTerm || [];
  const seasonLongInjuriesSection = filteredPlayers.length > 0 ? `
<season_long_injuries>
SEASON-LONG ABSENCES:
The following players have been OUT for extended periods (1-2+ months):
${filteredPlayers.join(', ')}

The team's recent stats reflect play WITHOUT these players.
</season_long_injuries>

` : '';

  // Detect returning players (NBA + NCAAB — uses L5 playersByGame data)
  const rosterForReturning = (sportKey === 'NBA' && nbaRosterDepth) ? nbaRosterDepth
    : (sportKey === 'NCAAB' && ncaabRosterDepth) ? ncaabRosterDepth
    : null;
  const returningPlayersSection = rosterForReturning
    ? detectReturningPlayers(rosterForReturning, injuries, recentHome, recentAway, homeTeam, awayTeam)
    : '';

  // Generate injury report separately so we can log it for debugging
  // Pass rosterDepth for NBA so injury report can show team-share context for OUT players
  const injuryRosterDepth = (sportKey === 'NBA' && nbaRosterDepth) ? nbaRosterDepth : null;
  const injuryReportText = formatInjuryReport(homeTeam, awayTeam, injuries, sportKey, injuryRosterDepth);

  // Debug: Log the injury report Gary will see (first 3000 chars)
  if (injuryReportText && injuryReportText.length > 50) {
    console.log(`[Scout Report] Injury report preview (${injuryReportText.length} chars):`);
    console.log(injuryReportText.substring(0, 3000));
    if (injuryReportText.length > 3000) console.log('...[log truncated, full report sent to Gary]');
  }

  // Build verified Tale of Tape ONCE and reuse in report text + return object
  const verifiedTaleOfTape = buildVerifiedTaleOfTape(homeTeam, awayTeam, homeProfile, awayProfile, sportKey, injuries, recentHome, recentAway, ncaabAdvancedMetrics);

  const report = `
${seasonLongInjuriesSection}══════════════════════════════════════════════════════════════════════
MATCHUP: ${matchupLabel}
Sport: ${sportKey} | ${game.commence_time ? formatGameTime(game.commence_time) : 'Time TBD'}
${game.venue ? `Venue: ${venueLabel}` : ''}${tournamentLabel ? `\n${tournamentLabel}` : ''}
══════════════════════════════════════════════════════════════════════
${gameContextSection}${bowlGameContext}${cfpJourneyContext}${ncaabStandingsSnapshot || standingsSnapshot || ''}
*** INJURY REPORT (READ THIS FIRST - CRITICAL) ***
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${injuryReportText}
${formatStartingLineups(homeTeam, awayTeam, injuries.lineups)}

INJURY DURATION CONTEXT:
Each injury above includes a duration tag showing how long the player has been out.

For each absence, ask yourself:
  - How long has this player been out? What does the team look like without them?
  - How has the team performed during the absence?
  - What does the current spread tell you about how the market has assessed this roster?
  - For returning players: What changes? What does the data say about the team with vs without them?

The CURRENT ROSTER is the team you are betting on.
Investigate what the data tells you about THIS team, THIS matchup, and THIS spread.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${returningPlayersSection}${narrativeContext ? `
CURRENT STATE & CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━
Recent news, storylines, and context for both teams.

[IMPORTANT] INJURY CONTEXT (USE DURATION TAGS ABOVE):
The injury report includes duration tags showing how long each player has been out.
Use these durations to determine how each absence affects THIS game and THIS spread.

${narrativeContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}
REST & SCHEDULE SITUATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatRestSituation(homeTeam, awayTeam, calculateRestSituation(recentHome, game.commence_time, homeTeam), calculateRestSituation(recentAway, game.commence_time, awayTeam))}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${nbaRosterDepth ? formatNbaRosterDepth(homeTeam, awayTeam, nbaRosterDepth, injuries) : ''}${ncaabAdvancedMetrics ? formatNcaabAdvancedMetrics(ncaabAdvancedMetrics) : ''}${ncaabRankings || ncaabHomeCourt ? formatNcaabRankingsAndHomeCourt(ncaabRankings, ncaabHomeCourt, homeTeam, awayTeam) : ''}${ncaabKeyPlayers ? formatNcaabKeyPlayers(homeTeam, awayTeam, ncaabKeyPlayers) : ''}${ncaabRosterDepth ? formatNcaabRosterDepth(homeTeam, awayTeam, ncaabRosterDepth, injuries) : ''}${nhlKeyPlayers ? formatNhlKeyPlayers(homeTeam, awayTeam, nhlKeyPlayers) : ''}${nhlRosterDepth ? formatNhlRosterDepth(homeTeam, awayTeam, nhlRosterDepth, injuries) : ''}${keyPlayers ? formatKeyPlayers(homeTeam, awayTeam, keyPlayers) : ''}${startingQBs ? formatStartingQBs(homeTeam, awayTeam, startingQBs) : ''}${nflRosterDepth ? formatNflRosterDepth(homeTeam, awayTeam, nflRosterDepth, injuries) : ''}${nflPlayoffHistory ? formatNflPlayoffHistory(homeTeam, awayTeam, nflPlayoffHistory, nflHomeTeamId, nflAwayTeamId) : ''}${ncaafKeyPlayers ? formatNcaafKeyPlayers(homeTeam, awayTeam, ncaafKeyPlayers) : ''}

TEAM IDENTITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatTeamIdentity(homeTeam, homeProfile, 'Home')}
${formatTeamIdentity(awayTeam, awayProfile, 'Away')}
${conferenceTierSection}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${verifiedTaleOfTape.text}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECENT FORM (Last 5 Games)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatRecentForm(homeTeam, recentHome)}
${formatRecentForm(awayTeam, recentAway)}
${sportKey === 'NCAAB' ? formatNcaabL5ScoringTrends(homeTeam, awayTeam, recentHome, recentAway, ncaabRosterDepth, homeProfile, awayProfile) : ''}
${highlightlyH2H?.games?.length ? formatHighlightlyH2H(highlightlyH2H, homeTeam, awayTeam) : `HEAD-TO-HEAD HISTORY (${seasonLabel} SEASON)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatH2HSection(h2hData, homeTeam, awayTeam)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`}

KEY SITUATIONAL FACTORS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatSituationalFactors(game, injuries, sportKey)}

BETTING CONTEXT (For Reference Only - Do NOT base pick on these)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatOdds(game, sportKey)}
${options.sportsbookOdds ? formatSportsbookComparison(options.sportsbookOdds, game.home_team, game.away_team) : ''}
BETTING ODDS COMPARISON:
When making your pick, reference the BEST available line from the sportsbook comparison above.

══════════════════════════════════════════════════════════════════════
AVAILABLE STAT CATEGORIES (use fetch_stats tool to request):
${formatTokenMenu(sportKey)}
══════════════════════════════════════════════════════════════════════
`.trim();

  // Return both the report text, structured injuries data, and venue/game context
  return {
    text: report,
    injuries: injuriesForStorage,
    // Verified Tale of the Tape - Gary MUST use this exactly, no hallucination
    verifiedTaleOfTape,
    // Venue context for NBA Cup, neutral site games, CFP games, etc.
    venue: game.venue || null,
    isNeutralSite: game.isNeutralSite || false,
    tournamentContext: game.tournamentContext || null,
    // Game significance/context (from Gemini Grounding for NBA Cup, playoffs, CFP, etc.)
    gameSignificance: game.gameSignificance || null,
    // CFP-specific fields for NCAAF
    cfpRound: game.cfpRound || null,
    homeSeed: game.homeSeed || null,
    awaySeed: game.awaySeed || null,
    // NCAAB conference data for app filtering (attached by run-agentic-picks.js)
    homeConference: game.homeConference || null,
    awayConference: game.awayConference || null
  };
}

/**
 * Normalize sport key to standard format
 */
function normalizeSport(sport) {
  const mapping = {
    'basketball_nba': 'NBA',
    'americanfootball_nfl': 'NFL',
    'basketball_ncaab': 'NCAAB',
    'americanfootball_ncaaf': 'NCAAF',
    'icehockey_nhl': 'NHL',
    'nba': 'NBA',
    'nfl': 'NFL',
    'ncaab': 'NCAAB',
    'ncaaf': 'NCAAF',
    'nhl': 'NHL'
  };
  return mapping[sport?.toLowerCase()] || sport?.toUpperCase() || 'UNKNOWN';
}

/**
 * Format game time
 */
function formatGameTime(timeString) {
  try {
    const date = new Date(timeString);
    return date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  } catch {
    return timeString;
  }
}

/**
 * Fetch team profile (record, key metrics, identity)
 */
async function fetchTeamProfile(teamName, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport) return createEmptyProfile(teamName);
    
    // Get team data
    const teams = await ballDontLieService.getTeams(bdlSport);
    const team = findTeam(teams, teamName);
    if (!team) return createEmptyProfile(teamName);
    
    // Calculate current season dynamically
    const currentSeason = seasonForSport(sport);
    
    // Get season stats
    let seasonStats = await ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: team.id, season: currentSeason, postseason: false });
    
    // NCAAF: BDL returns an array of stats, extract the team's stats object
    // The array may contain stats for the specific team we queried
    if (bdlSport === 'americanfootball_ncaaf' && Array.isArray(seasonStats)) {
      if (seasonStats.length > 0) {
        // Find the stats for our team (in case multiple returned) or use first
        const teamStats = seasonStats.find(s => s.team?.id === team.id) || seasonStats[0];
        seasonStats = teamStats;
        // Log actual NCAAF fields (BDL doesn't have PPG for NCAAF)
        console.log(`[Scout Report] NCAAF ${teamName} season stats:`, 
          `Pass YPG=${seasonStats.passing_yards_per_game || 'N/A'}, ` +
          `Rush YPG=${seasonStats.rushing_yards_per_game || 'N/A'}`);
      } else {
        seasonStats = null;
        console.log(`[Scout Report] NCAAF ${teamName} - no team season stats from BDL`);
      }
    }
    
    // Fetch standings - NCAAB and NCAAF require conference_id from the team data
    let standings = [];
    let teamStanding = null;
    if (bdlSport === 'basketball_ncaab') {
      // NCAAB: Use dedicated getNcaabStandings method which handles the API correctly
      if (team.conference_id) {
        console.log(`[Scout Report] Fetching NCAAB standings for ${teamName} (conference_id: ${team.conference_id})`);
        standings = await ballDontLieService.getNcaabStandings(team.conference_id, currentSeason);
        teamStanding = standings?.find(s => s.team?.id === team.id || s.team?.name === teamName);
      }
    } else if (bdlSport === 'americanfootball_ncaaf') {
      // NCAAF: Requires conference_id - get from team.conference field
      const conferenceId = team.conference;
      if (conferenceId) {
        try {
          console.log(`[Scout Report] Fetching NCAAF standings for ${teamName} (conference: ${conferenceId})`);
          const standingsData = await ballDontLieService.getStandingsGeneric(bdlSport, { 
            conference_id: conferenceId, 
            season: currentSeason 
          });
          standings = standingsData || [];
          teamStanding = standings?.find(s => s.team?.id === team.id || s.team?.full_name === teamName);
          if (teamStanding) {
            // BDL can return null for 0 losses/wins - coerce to 0
            const w = teamStanding.wins ?? 0;
            const l = teamStanding.losses ?? 0;
            console.log(`[Scout Report] NCAAF ${teamName} standings: ${w}-${l}`);
          }
        } catch (e) {
          console.warn(`[Scout Report] NCAAF standings fetch failed for ${teamName}:`, e.message);
        }
      }
    } else {
      // NBA, NHL, NFL - no conference_id needed
      standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason });
      teamStanding = standings?.find(s => s.team?.id === team.id || s.team?.name === teamName);
    }
    
    // BDL standings return wins/losses separately, not as "overall_record"
    // Use BDL as primary source, Gemini grounding as fallback when BDL fails
    // Note: BDL may return null for 0 wins/losses, so use ?? to coerce to 0
    let record = 'N/A';
    let homeRecord = teamStanding?.home_record || 'N/A';
    let awayRecord = teamStanding?.road_record || 'N/A';
    let conferenceRecord = teamStanding?.conference_record || 'N/A';
    
    // Try BDL first - check that wins exists (can be 0, which is falsy but valid)
    const standingWins = teamStanding?.wins;
    const standingLosses = teamStanding?.losses;
    const statsWins = seasonStats?.wins;
    const statsLosses = seasonStats?.losses;
    
    const isNHL = sport === 'NHL' || bdlSport === 'icehockey_nhl';
    
    if (standingWins !== undefined || standingLosses !== undefined) {
      // Use ?? to coerce null to 0 (BDL returns null for teams with 0 losses)
      if (isNHL) {
        const otLosses = teamStanding?.ot_losses ?? 0;
        record = `${standingWins ?? 0}-${standingLosses ?? 0}-${otLosses}`;
      } else {
        record = `${standingWins ?? 0}-${standingLosses ?? 0}`;
      }
      console.log(`[Scout Report] ${teamName} record from BDL standings: ${record}, conf: ${conferenceRecord}`);
    } else if (statsWins !== undefined || statsLosses !== undefined) {
      if (isNHL) {
        const otLosses = seasonStats?.ot_losses ?? 0;
        record = `${statsWins ?? 0}-${statsLosses ?? 0}-${otLosses}`;
      } else {
        record = `${statsWins ?? 0}-${statsLosses ?? 0}`;
      }
      console.log(`[Scout Report] ${teamName} record from BDL season stats: ${record}`);
    }
    
    // Fallback to Gemini grounding if BDL doesn't have record
    if (record === 'N/A') {
      try {
        const seasonYear = currentSeason;
        const nextYear = (currentSeason + 1).toString().slice(-2);
        const seasonStr = `${seasonYear}-${nextYear}`;
        const sportName = sport === 'NBA' || bdlSport === 'basketball_nba' ? 'NBA' : 
                         sport === 'NCAAB' || bdlSport === 'basketball_ncaab' ? 'NCAAB' :
                         isNHL ? 'NHL' : sport;
        
        const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const formatStr = isNHL ? '"W-L-OTL" (e.g., "28-13-9")' : '"W-L" (e.g., "22-17")';
        const recordQuery = `What is the current ${seasonStr} ${sportName} season record for the ${teamName} as of ${today}? Return ONLY the record in format ${formatStr}.`;
        
        console.log(`[Scout Report] Fetching ${teamName} record via Gemini grounding (BDL unavailable)...`);
        const recordResult = await geminiGroundingSearch(recordQuery, { temperature: 1.0, maxTokens: 100 });
        
        if (recordResult?.success && recordResult?.data) {
          // Flexible match for X-Y or X-Y-Z
          const recordMatch = isNHL 
            ? recordResult.data.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*[-–]\s*(\d{1,2})/)
            : recordResult.data.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
            
          if (recordMatch) {
            record = isNHL 
              ? `${recordMatch[1]}-${recordMatch[2]}-${recordMatch[3]}`
              : `${recordMatch[1]}-${recordMatch[2]}`;
            console.log(`[Scout Report] ${teamName} record from Gemini grounding: ${record}`);
          }
        }
      } catch (e) {
        console.warn(`[Scout Report] Gemini grounding fallback for ${teamName} record failed:`, e.message);
      }
    }
    
    return {
      name: teamName,
      record,
      homeRecord,
      awayRecord,
      conferenceRecord,
      streak: formatStreak(teamStanding),
      seasonStats: seasonStats,
      standing: teamStanding,
      identity: buildTeamIdentity(seasonStats, sport)
    };
  } catch (error) {
    console.warn(`[Scout Report] Error fetching profile for ${teamName}:`, error.message);
    return createEmptyProfile(teamName);
  }
}

/**
 * Build team identity string from stats
 */
function buildTeamIdentity(stats, sport) {
  if (!stats) return 'Profile unavailable';
  
  const parts = [];
  
  if (sport === 'NBA' || sport === 'NCAAB') {
    // Basketball identity
    if (stats.points_per_game) {
      const ppg = parseFloat(stats.points_per_game);
      if (ppg > 115) parts.push('high-scoring');
      else if (ppg < 105) parts.push('defensive-minded');
    }
    if (stats.pace) {
      const pace = parseFloat(stats.pace);
      if (pace > 100) parts.push('fast-paced');
      else if (pace < 96) parts.push('slow/methodical');
    }
    if (stats.three_point_pct && parseFloat(stats.three_point_pct) > 0.37) {
      parts.push('3PT-heavy');
    }
    if (stats.offensive_rating) {
      const ortg = parseFloat(stats.offensive_rating);
      if (ortg > 115) parts.push(`elite offense (#${stats.offensive_rating_rank || '?'})`);
    }
    if (stats.defensive_rating) {
      const drtg = parseFloat(stats.defensive_rating);
      if (drtg < 108) parts.push(`strong defense (#${stats.defensive_rating_rank || '?'})`);
      else if (drtg > 115) parts.push('leaky defense');
    }
  } else if (sport === 'NFL' || sport === 'NCAAF') {
    // Football identity
    if (stats.total_points_per_game) {
      const ppg = parseFloat(stats.total_points_per_game);
      if (ppg > 28) parts.push('high-powered offense');
      else if (ppg < 18) parts.push('struggling offense');
    }
    if (stats.rushing_yards_per_game && stats.net_passing_yards_per_game) {
      const rush = parseFloat(stats.rushing_yards_per_game);
      const pass = parseFloat(stats.net_passing_yards_per_game);
      if (rush > pass) parts.push('run-heavy');
      else if (pass > rush * 1.5) parts.push('pass-first');
      else parts.push('balanced attack');
    }
    if (stats.opp_total_points_per_game) {
      const oppPpg = parseFloat(stats.opp_total_points_per_game);
      if (oppPpg < 18) parts.push('elite defense');
      else if (oppPpg > 28) parts.push('porous defense');
    }
  } else if (sport === 'NHL') {
    // Hockey identity
    if (stats.goals_for_per_game) {
      const gpg = parseFloat(stats.goals_for_per_game);
      if (gpg > 3.5) parts.push('high-scoring');
      else if (gpg < 2.5) parts.push('struggling offensively');
    }
    if (stats.goals_against_per_game) {
      const gaa = parseFloat(stats.goals_against_per_game);
      if (gaa < 2.5) parts.push('stingy defense');
      else if (gaa > 3.5) parts.push('leaky defense');
    }
    if (stats.power_play_percentage) {
      const pp = parseFloat(stats.power_play_percentage);
      if (pp > 0.24) parts.push('elite PP');
      else if (pp < 0.17) parts.push('weak PP');
    }
    if (stats.penalty_kill_percentage) {
      const pk = parseFloat(stats.penalty_kill_percentage);
      if (pk > 0.82) parts.push('elite PK');
      else if (pk < 0.76) parts.push('vulnerable PK');
    }
    if (stats.shots_for_per_game && stats.shots_against_per_game) {
      const sf = parseFloat(stats.shots_for_per_game);
      const sa = parseFloat(stats.shots_against_per_game);
      if (sf > sa + 5) parts.push('possession-heavy');
      else if (sa > sf + 5) parts.push('outshot regularly');
    }
  }

  return parts.length > 0 ? parts.join(', ') : 'Profile building...';
}

/**
 * Create empty profile for missing data
 */
function createEmptyProfile(teamName) {
  return {
    name: teamName,
    record: 'N/A',
    homeRecord: 'N/A',
    awayRecord: 'N/A',
    streak: 'N/A',
    seasonStats: null,
    standing: null,
    identity: 'Profile unavailable'
  };
}

/**
 * Format team identity for display
 */
function formatTeamIdentity(teamName, profile, homeAway) {
  const record = profile.record !== 'N/A' ? `(${profile.record})` : '';
  return `• ${teamName} ${record} [${homeAway}]: ${profile.identity}
  Home: ${profile.homeRecord} | Away: ${profile.awayRecord} | Streak: ${profile.streak}`;
}

/**
 * Fetch recent games for a team
 */
async function fetchRecentGames(teamName, sport, count = 5) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport) return [];
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const team = findTeam(teams, teamName);
    if (!team) return [];
    
    // Build params based on sport - NFL/NCAAF/NHL/NCAAB use seasons[], NBA uses date range
    // Per BDL API docs: NFL/NHL games endpoint does NOT support start_date/end_date (documented for NBA)
    // NCAAB switched to seasons param to fetch full season (needed for Season/L10/L5 home/away splits)
    const usesSeasonParam = bdlSport === 'americanfootball_nfl' ||
                           bdlSport === 'americanfootball_ncaaf' ||
                           bdlSport === 'icehockey_nhl' ||
                           bdlSport === 'basketball_ncaab';
    
    let params;
    if (usesSeasonParam) {
      // NFL/NCAAF/NHL/NCAAB: Use seasons parameter
      const season = seasonForSport(sport);
      params = {
        team_ids: [team.id],
        seasons: [season],
        per_page: 50  // NCAAB teams play ~30 games; 50 covers full season with margin
      };
    } else {
      // NBA/etc: Use date range filtering
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      params = {
        team_ids: [team.id],
        start_date: thirtyDaysAgo.toISOString().split('T')[0],
        end_date: today.toISOString().split('T')[0],
        per_page: 20
      };
    }
    
    const recentGames = await ballDontLieService.getGames(bdlSport, params);
    
    // Sort by date descending and return the requested count
    // For sports with season fetch, also filter to only completed games
    const today = new Date();
    const sorted = (recentGames || [])
      .filter(g => {
        const hasDate = g.date || g.datetime;
        const gameDateStr = (g.date || g.datetime || '').split('T')[0];
        const todayStr = today.toISOString().split('T')[0];
        const isPast = gameDateStr < todayStr; // Date-string compare excludes today's games
        // For season-based fetch, also check status is Final (if available)
        if (usesSeasonParam) {
          const status = (g.status || '').toLowerCase();
          const isFinished = status === 'final' || status === 'post' || status === 'off';
          return hasDate && (isPast || isFinished);
        }
        // For date-range fetch (NBA), filter out today's unplayed games
        return hasDate && isPast;
      })
      .sort((a, b) => {
        const dateA = new Date(a.date || a.datetime);
        const dateB = new Date(b.date || b.datetime);
        return dateB - dateA; // Descending (most recent first)
      })
      .slice(0, count);
    
    return sorted;
  } catch (error) {
    console.warn(`[Scout Report] Error fetching recent games for ${teamName}:`, error.message);
    return [];
  }
}

/**
 * Calculate rest situation for a team based on recent games
 * Returns object with days rest, back-to-back status, and whether last game was home/away
 * @param {Array} recentGames - Recent games for the team
 * @param {string} gameDate - The upcoming game date
 * @param {string} teamName - The team name (to determine if last game was home or away)
 */
function calculateRestSituation(recentGames, gameDate, teamName = null) {
  if (!recentGames || recentGames.length === 0) {
    console.log('[Rest Calc] No recent games available');
    return { daysRest: null, isBackToBack: false, lastGameDate: null, lastGameWasHome: null };
  }
  
  // Parse the game date (the upcoming game) - use US Eastern time for NBA games
  const upcoming = gameDate ? new Date(gameDate) : new Date();
  // Convert to Eastern time to get correct date (avoids UTC midnight rollover issues)
  const upcomingDateStr = upcoming.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD format
  
  // Parse games and their dates
  // NOTE: BDL stores game dates in UTC, so late-night EST games (7:30PM+) may be stored as the NEXT day
  // Example: Dec 18 7:30PM EST = Dec 19 12:30AM UTC = stored as "2025-12-19"
  // We need to include completed games from "today" that actually happened last night
  const gamesWithDates = recentGames
    .filter(g => g.date || g.datetime)
    .map(g => {
      // BDL may return date as full ISO timestamp (e.g., "2025-12-20T05:00:00.000Z") or just "YYYY-MM-DD"
      // Extract just the date portion (YYYY-MM-DD) from either format
      let rawDate = g.date || g.datetime;
      const dateStr = rawDate ? rawDate.split('T')[0] : null;
      // Check if game has completed (has scores)
      const homeScore = g.home_team_score || g.home_score || 0;
      const awayScore = g.visitor_team_score || g.away_score || g.visitor_score || 0;
      const hasCompleted = homeScore > 0 || awayScore > 0;
      return {
        ...g,
        dateStr,
        gameDate: new Date(dateStr + 'T12:00:00'), // Noon to avoid timezone issues
        hasCompleted
      };
    })
    .filter(g => {
      if (!g.dateStr) return false;
      // Include games from dates strictly before today
      if (g.dateStr < upcomingDateStr) return true;
      // Also include completed games from "today" (these are actually last night's late games in EST)
      if (g.dateStr === upcomingDateStr && g.hasCompleted) {
        console.log(`[Rest Calc] Including completed game from ${g.dateStr} (late-night EST game stored in UTC)`);
        return true;
      }
      return false;
    })
    .sort((a, b) => b.gameDate - a.gameDate); // Most recent first
  
  if (gamesWithDates.length === 0) {
    console.log('[Rest Calc] No completed games found before', upcomingDateStr);
    return { daysRest: null, isBackToBack: false, lastGameDate: null };
  }
  
  const lastGame = gamesWithDates[0];
  console.log(`[Rest Calc] Last game: ${lastGame.dateStr}, Upcoming: ${upcomingDateStr}`);
  
  // Calculate days between using date strings to avoid timezone issues
  const lastDate = new Date(lastGame.dateStr + 'T12:00:00');
  const upcomingDate = new Date(upcomingDateStr + 'T12:00:00');
  const diffTime = upcomingDate.getTime() - lastDate.getTime();
  const daysRest = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  // Back-to-back = played yesterday (1 day gap)
  const isBackToBack = daysRest <= 1;
  
  // Determine if last game was home or away for this team
  // Match team name to the home_team in the game record
  let lastGameWasHome = null;
  if (teamName && lastGame) {
    const homeTeamName = lastGame.home_team?.name || lastGame.home_team?.full_name || '';
    const teamNameLower = teamName.toLowerCase();
    const homeNameLower = homeTeamName.toLowerCase();
    // Match by last word (e.g., "Celtics" from "Boston Celtics")
    const teamLastWord = teamNameLower.split(' ').pop();
    const homeLastWord = homeNameLower.split(' ').pop();
    lastGameWasHome = teamLastWord === homeLastWord || 
                      homeNameLower.includes(teamLastWord) || 
                      teamNameLower.includes(homeLastWord);
    console.log(`[Rest Calc] Last game was ${lastGameWasHome ? 'HOME' : 'ROAD'} for ${teamName}`);
  }
  
  // Check for 3 games in 4 days (heavy schedule)
  const fourDaysAgo = new Date(upcomingDate);
  fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
  const recentGamesInWindow = gamesWithDates.filter(g => g.gameDate >= fourDaysAgo);
  const gamesInLast4Days = recentGamesInWindow.length;
  const isHeavySchedule = gamesInLast4Days >= 3;
  
  // Check for 4 games in 5 days
  const fiveDaysAgo = new Date(upcomingDate);
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  const gamesInLast5Days = gamesWithDates.filter(g => g.gameDate >= fiveDaysAgo).length;
  const isVeryHeavySchedule = gamesInLast5Days >= 4;
  
  console.log(`[Rest Calc] Days rest: ${daysRest}, Back-to-back: ${isBackToBack}, Games in 4 days: ${gamesInLast4Days}`);
  
  return {
    daysRest,
    isBackToBack,
    isHeavySchedule,
    isVeryHeavySchedule,
    gamesInLast4Days,
    gamesInLast5Days,
    lastGameDate: lastGame.gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    lastGameWasHome
  };
}

/**
 * Format rest situation for scout report
 * FACTUAL OUTPUT ONLY - no commentary, emojis, or editorial (Gary interprets)
 */
function formatRestSituation(homeTeam, awayTeam, homeRest, awayRest) {
  const formatTeamRest = (team, rest, isHomeTeam) => {
    if (!rest || rest.daysRest === null) {
      return `${team}: Rest data unavailable`;
    }
    
    const parts = [];
    
    // Days of rest (simple number)
    parts.push(`${rest.daysRest} days rest`);
    
    // Back-to-back status with home/away context
    if (rest.isBackToBack) {
      // For B2B, note where they played last (important for fatigue assessment)
      // Tonight's game location is known (isHomeTeam), last game location we track
      const lastGameLocation = rest.lastGameWasHome === true ? 'at home' : 
                               rest.lastGameWasHome === false ? 'on road' : '';
      parts.push(`On B2B - played ${lastGameLocation} ${rest.lastGameDate}`.trim());
    }
    
    // Heavy schedule context (factual)
    if (rest.isVeryHeavySchedule) {
      parts.push(`${rest.gamesInLast5Days} games in 5 nights`);
    } else if (rest.isHeavySchedule) {
      parts.push(`${rest.gamesInLast4Days} games in 4 nights`);
    }
    
    return `• ${team}: ${parts.join('. ')}`;
  };
  
  return `${formatTeamRest(homeTeam, homeRest, true)}
${formatTeamRest(awayTeam, awayRest, false)}`;
}

/**
 * Format recent form
 */
function formatRecentForm(teamName, recentGames) {
  if (!recentGames || recentGames.length === 0) {
    return `• ${teamName}: Recent games unavailable`;
  }
  
  let wins = 0, losses = 0;
  
  // Filter to only completed games (have scores > 0)
  const completedGames = recentGames.filter(game => {
    const homeScore = game.home_team_score ?? game.home_score ?? 0;
    const awayScore = game.visitor_team_score ?? game.away_score ?? 0;
    return homeScore > 0 || awayScore > 0; // At least one team scored
  });
  
  if (completedGames.length === 0) {
    return `• ${teamName}: No recent completed games`;
  }
  
  const results = completedGames.slice(0, 5).map(game => {
    // Determine if this team was home or away
    const homeTeamName = game.home_team?.name || game.home_team?.full_name || '';
    const awayTeamName = game.visitor_team?.name || game.visitor_team?.full_name || '';
    const isHome = homeTeamName.toLowerCase().includes(teamName.toLowerCase().split(' ').pop()) ||
                   teamName.toLowerCase().includes(homeTeamName.toLowerCase().split(' ').pop());
    
    const teamScore = isHome ? (game.home_team_score ?? game.home_score ?? 0) : (game.visitor_team_score ?? game.away_score ?? 0);
    const oppScore = isHome ? (game.visitor_team_score ?? game.away_score ?? 0) : (game.home_team_score ?? game.home_score ?? 0);
    const oppName = isHome ? awayTeamName : homeTeamName;
    
    // Skip if opponent name is empty or same as team
    if (!oppName || oppName.toLowerCase().includes(teamName.toLowerCase().split(' ').pop())) {
      return null;
    }
    
    if (teamScore > oppScore) {
      wins++;
      return `W vs ${oppName} (${teamScore}-${oppScore})`;
    } else {
      losses++;
      return `L vs ${oppName} (${teamScore}-${oppScore})`;
    }
  }).filter(r => r !== null);
  
  return `• ${teamName}: ${wins}-${losses} last ${completedGames.length > 5 ? 5 : completedGames.length}
  ${results.slice(0, 3).join(' | ')}`;
}

/**
 * Format NCAAB L5 efficiency and scoring trends.
 * Uses BDL per-game player_stats for real efficiency metrics (eFG%, TS%, approx ORtg/DRtg/Net).
 * Falls back to scoring trends from final scores if L5 efficiency data is unavailable.
 */
function formatNcaabL5ScoringTrends(homeTeam, awayTeam, recentHome, recentAway, rosterDepth, homeProfile, awayProfile) {
  const homeL5Data = rosterDepth?.homeL5;
  const awayL5Data = rosterDepth?.awayL5;

  // If we have real L5 efficiency data from BDL player_stats, show it
  if (homeL5Data?.efficiency || awayL5Data?.efficiency) {
    const lines = [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      'L5 EFFICIENCY vs SEASON (Last 5 Games)',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      ''
    ];

    const formatL5Section = (teamName, l5Data, profile, roster, label) => {
      if (!l5Data?.efficiency) return;
      const eff = l5Data.efficiency;
      const stats = profile?.seasonStats;

      lines.push(`[${label}] ${teamName}:`);
      lines.push(`  L5:      eFG% ${eff.efg_pct || '?'} | TS% ${eff.ts_pct || '?'} | Approx ORtg ${eff.approx_ortg || '?'} | DRtg ${eff.approx_drtg || '?'} | Net ${eff.approx_net_rtg || '?'}`);
      if (eff.opp_efg_pct || eff.opp_fg3_pct) {
        lines.push(`  L5 DEF:  Opp eFG% ${eff.opp_efg_pct || '?'} | Opp 3P% ${eff.opp_fg3_pct || '?'} | Opp PPG ${eff.opp_ppg || '?'}`);
      }
      if (stats?.offensive_rating && stats?.defensive_rating) {
        const netRtg = (parseFloat(stats.offensive_rating) - parseFloat(stats.defensive_rating)).toFixed(1);
        lines.push(`  Season:  ORtg ${parseFloat(stats.offensive_rating).toFixed(1)} | DRtg ${parseFloat(stats.defensive_rating).toFixed(1)} | Net ${netRtg}`);
      }

      // Roster context: compare L5 game participation against top players
      if (l5Data.playersByGame && roster && roster.length > 0) {
        const keyPlayers = roster.slice(0, 5);
        const totalGames = Object.keys(l5Data.playersByGame).length;
        const missingPlayers = [];

        for (const player of keyPlayers) {
          let gamesPlayed = 0;
          for (const gameId of Object.keys(l5Data.playersByGame)) {
            const gamePlayers = l5Data.playersByGame[gameId];
            // Match by player ID (most reliable) or name fallback
            const found = gamePlayers.some(p =>
              p.playerId === player.id ||
              p.name.toLowerCase() === player.name?.toLowerCase()
            );
            if (found) gamesPlayed++;
          }
          if (gamesPlayed < totalGames) {
            missingPlayers.push({
              name: player.name,
              ppg: player.ppg || '?',
              gamesPlayed,
              totalGames
            });
          }
        }

        if (missingPlayers.length === 0) {
          lines.push(`  L5 Roster: All 5 key players played all ${totalGames} L5 games.`);
        } else {
          for (const mp of missingPlayers) {
            lines.push(`  L5 Roster: ${mp.name} (${mp.ppg} PPG) — played ${mp.gamesPlayed} of ${mp.totalGames} L5 games.`);
          }
        }
      }
      lines.push('');
    };

    formatL5Section(homeTeam, homeL5Data, homeProfile, rosterDepth?.home, 'HOME');
    formatL5Section(awayTeam, awayL5Data, awayProfile, rosterDepth?.away, 'AWAY');
    return lines.join('\n');
  }

  // Fallback: scoring trends from final scores if no L5 efficiency data
  function computeL5(teamName, games) {
    if (!games || games.length === 0) return null;
    const completed = games.filter(g => (g.home_team_score ?? g.home_score ?? 0) > 0 || (g.visitor_team_score ?? g.away_score ?? 0) > 0);
    if (completed.length === 0) return null;
    const l5 = completed.slice(0, 5);
    let totalPts = 0, totalOppPts = 0;
    const margins = [];
    for (const game of l5) {
      const homeTeamName = game.home_team?.name || game.home_team?.full_name || '';
      const isHome = homeTeamName.toLowerCase().includes(teamName.toLowerCase().split(' ').pop()) ||
                     teamName.toLowerCase().includes(homeTeamName.toLowerCase().split(' ').pop());
      const teamScore = isHome ? (game.home_team_score ?? game.home_score ?? 0) : (game.visitor_team_score ?? game.away_score ?? 0);
      const oppScore = isHome ? (game.visitor_team_score ?? game.away_score ?? 0) : (game.home_team_score ?? game.home_score ?? 0);
      totalPts += teamScore;
      totalOppPts += oppScore;
      margins.push(teamScore - oppScore);
    }
    const gp = l5.length;
    return { gp, avgPts: (totalPts / gp).toFixed(1), avgOppPts: (totalOppPts / gp).toFixed(1), avgMargin: (margins.reduce((a, b) => a + b, 0) / gp).toFixed(1) };
  }

  const homeL5 = computeL5(homeTeam, recentHome);
  const awayL5 = computeL5(awayTeam, recentAway);
  if (!homeL5 && !awayL5) return '';

  const lines = [
    '',
    'L5 SCORING TRENDS (from game scores)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  ];
  if (homeL5) lines.push(`  ${homeTeam}: L5 PPG ${homeL5.avgPts} | Opp PPG ${homeL5.avgOppPts} | Avg Margin ${homeL5.avgMargin > 0 ? '+' : ''}${homeL5.avgMargin} (${homeL5.gp} games)`);
  if (awayL5) lines.push(`  ${awayTeam}: L5 PPG ${awayL5.avgPts} | Opp PPG ${awayL5.avgOppPts} | Avg Margin ${awayL5.avgMargin > 0 ? '+' : ''}${awayL5.avgMargin} (${awayL5.gp} games)`);
  lines.push('');
  return lines.join('\n');
}

/**
 * Fetch H2H history between two teams from BDL
 * This is PRE-LOADED so Gary always has real data and won't hallucinate
 * 
 * FIX (Jan 2026): Now fetches FULL SEASON games instead of just recent games
 * to catch H2H matchups from earlier in the season (e.g., November games)
 */
async function fetchH2HData(homeTeam, awayTeam, sport, recentHome, recentAway) {
  try {
    const bdlSport = sportToBdlKey(sport);
    
    // Get team IDs
    const teams = await ballDontLieService.getTeams(bdlSport);

    const home = findTeam(teams, homeTeam);
    const away = findTeam(teams, awayTeam);

    if (!home?.id || !away?.id) {
      console.log(`[Scout Report] H2H: Could not find team IDs for ${homeTeam} or ${awayTeam}`);
      return null;
    }

    // Debug: Log which teams were resolved
    console.log(`[Scout Report] H2H: Resolved teams - Home: ${home.full_name} (ID: ${home.id}), Away: ${away.full_name} (ID: ${away.id})`);

    // Sanity check: Ensure we didn't accidentally match wrong teams (e.g., "Nets" in "Hornets")
    if (!homeTeam.toLowerCase().includes(home.name?.toLowerCase() || '')) {
      console.warn(`[Scout Report] H2H: WARNING - Home team mismatch? Searched for "${homeTeam}" but found "${home.full_name}"`);
    }
    if (!awayTeam.toLowerCase().includes(away.name?.toLowerCase() || '')) {
      console.warn(`[Scout Report] H2H: WARNING - Away team mismatch? Searched for "${awayTeam}" but found "${away.full_name}"`);
    }
    
    // Calculate current season using centralized function
    const currentSeason = seasonForSport(sport);
    
    // FIX: Fetch FULL SEASON games for H2H lookup (not just recent 5 games)
    // This catches H2H matchups from earlier in the season (e.g., October/November)
    console.log(`[Scout Report] H2H: Fetching full season games for ${homeTeam} vs ${awayTeam}`);
    
    const homeSeasonGames = await ballDontLieService.getGames(bdlSport, {
      team_ids: [home.id],
      seasons: [currentSeason],
      per_page: 100
    });
    
    console.log(`[Scout Report] H2H: Found ${homeSeasonGames?.length || 0} total games for ${homeTeam} in ${currentSeason} season`);
    
    // Filter to only H2H games between these two teams
    const h2hGames = (homeSeasonGames || []).filter(game => {
      const gameHomeId = game.home_team?.id || game.home_team_id;
      const gameAwayId = game.visitor_team?.id || game.visitor_team_id;
      
      const isMatch = (gameHomeId === home.id && gameAwayId === away.id) ||
                      (gameHomeId === away.id && gameAwayId === home.id);
      
      const hasScores = ((game.home_team_score ?? game.home_score ?? 0) > 0 || (game.visitor_team_score ?? game.away_score ?? 0) > 0);
      // Ensure game is in the past (completed)
      const gameDate = new Date(game.date);
      const isPast = gameDate < new Date();
      const included = isMatch && hasScores && isPast;
      if (included) {
        console.log(`[Scout Report] H2H Match found: ${game.date} - ${game.home_team?.full_name || game.home_team_id} vs ${game.visitor_team?.full_name || game.visitor_team_id} (Score: ${game.home_team_score ?? game.home_score ?? 'N/A'}-${game.visitor_team_score ?? game.away_score ?? 'N/A'})`);
      }
      return included;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Deduplicate by date (in case of data issues)
    const uniqueH2H = [];
    const seenDates = new Set();
    for (const game of h2hGames) {
      const dateKey = game.date?.split('T')[0];
      if (!seenDates.has(dateKey)) {
        seenDates.add(dateKey);
        uniqueH2H.push(game);
      }
    }
    
    console.log(`[Scout Report] H2H: Found ${uniqueH2H.length} game(s) between ${homeTeam} and ${awayTeam} this season`);
    
    if (uniqueH2H.length === 0) {
      return {
        found: false,
        message: `No H2H games found between ${homeTeam} and ${awayTeam} in the ${currentSeason} season.`,
        games: []
      };
    }
    
    // Format H2H results
    const homeName = home.full_name || home.name;
    const awayName = away.full_name || away.name;
    let homeWins = 0, awayWins = 0;
    
    const meetings = uniqueH2H.slice(0, 5).map(game => {
      const isHomeTeamHome = (game.home_team?.id || game.home_team_id) === home.id;
      const homeScore = isHomeTeamHome ? (game.home_team_score ?? game.home_score ?? 0) : (game.visitor_team_score ?? game.away_score ?? 0);
      const awayScore = isHomeTeamHome ? (game.visitor_team_score ?? game.away_score ?? 0) : (game.home_team_score ?? game.home_score ?? 0);
      const winner = homeScore > awayScore ? homeName : awayName;
      const margin = Math.abs(homeScore - awayScore);
      const gameDate = new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      if (homeScore > awayScore) homeWins++;
      else awayWins++;
      
      return {
        date: gameDate,
        result: `${winner} won by ${margin}`,
        score: `${homeName} ${homeScore} - ${awayScore} ${awayName}`
      };
    });
    
    return {
      found: true,
      homeName,
      awayName,
      gamesFound: uniqueH2H.length,
      record: `${homeName} ${homeWins}-${awayWins} ${awayName}`,
      meetings,
      season: currentSeason
    };
  } catch (e) {
    console.error(`[Scout Report] H2H fetch error:`, e.message);
    return null;
  }
}

/**
 * Format H2H data for Scout Report display
 */
function formatH2HSection(h2hData, homeTeam, awayTeam) {
  if (!h2hData) {
    return `H2H DATA UNAVAILABLE
Unable to fetch H2H data. DO NOT guess or claim historical matchup patterns.`;
  }
  
  if (!h2hData.found) {
    return `H2H DATA VERIFIED: NO PREVIOUS MATCHUPS
${h2hData.message}
IMPORTANT: Since there are NO H2H games, DO NOT mention H2H history in your analysis.`;
  }
  
  const lines = [
    `H2H DATA VERIFIED: ${h2hData.gamesFound} GAME(S) FOUND`,
    `Season Record: ${h2hData.record}`,
    '',
    'Recent Meetings:'
  ];
  
  h2hData.meetings.forEach(m => {
    lines.push(`  • ${m.date}: ${m.score} (${m.result})`);
  });
  
  lines.push('');
  lines.push(`[DATA BOUNDARY]: You may ONLY cite the ${h2hData.gamesFound} game(s) shown above.`);
  lines.push(`   DO NOT claim historical streaks or records beyond this data.`);
  lines.push('');
  lines.push(`[DEEPER H2H]: Call fetch_stats with token H2H_HISTORY to get box score details`);
  lines.push(`   (who scored, key performers, DNP players) for these matchups.`);

  return lines.join('\n');
}

/**
 * Fetch injuries for both teams
 * SOURCE OF TRUTH varies by sport:
 * - NFL/NCAAF: BDL is PRIMARY (reliable weekly practice reports)
 * - NBA: RapidAPI is PRIMARY (structured injury status, no Grounding)
 * - NHL/NCAAB: Rotowire via Gemini Grounding is PRIMARY
 */
async function fetchInjuries(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    const isFootball = sport === 'NFL' || sport === 'NCAAF' || 
                       bdlSport === 'americanfootball_nfl' || bdlSport === 'americanfootball_ncaaf';
    
    // =============================================================================
    // NFL/NCAAF: Use BDL as PRIMARY source for injury data
    // BDL has official practice report data (Questionable/Doubtful/Out status)
    // Apply 10-day freshness rule: only injuries reported within 10 days matter
    // =============================================================================
    if (isFootball && bdlSport) {
      console.log(`[Scout Report] NFL/NCAAF: Fetching BDL injuries (official practice reports)`);

      // Fetch current state for narratives and additional context
      let narrativeContext = null;
      try {
        const currentState = await fetchCurrentState(homeTeam, awayTeam, sport);
        narrativeContext = currentState?.groundedRaw || null;
      } catch (e) {
        console.log(`[Scout Report] Failed to fetch ${sport} current state: ${e.message}`);
      }

      // Fetch BDL injuries for both teams
      let homeInjuries = [];
      let awayInjuries = [];

      try {
        // Get team IDs from BDL
        const [homeTeamData, awayTeamData] = await Promise.all([
          ballDontLieService.getTeamByNameGeneric(bdlSport, homeTeam),
          ballDontLieService.getTeamByNameGeneric(bdlSport, awayTeam)
        ]);

        const homeTeamId = homeTeamData?.id;
        const awayTeamId = awayTeamData?.id;

        if (homeTeamId || awayTeamId) {
          const teamIds = [homeTeamId, awayTeamId].filter(Boolean);
          console.log(`[Scout Report] NFL team IDs: ${homeTeam}=${homeTeamId}, ${awayTeam}=${awayTeamId}`);

          // Fetch injuries from BDL (uses nfl/v1/player_injuries endpoint)
          const bdlInjuries = await ballDontLieService.getNflPlayerInjuries(teamIds);
          console.log(`[Scout Report] BDL returned ${bdlInjuries?.length || 0} NFL injuries`);

          // Calculate freshness (10-day window for NFL)
          const now = new Date();
          const FRESH_WINDOW_DAYS = 10;

          // Process injuries and assign to home/away
          for (const inj of (bdlInjuries || [])) {
            const playerTeamId = inj.player?.team?.id || inj.team?.id;
            const injuryDate = inj.date ? new Date(inj.date) : null;
            const daysSinceReport = injuryDate ? Math.floor((now - injuryDate) / (1000 * 60 * 60 * 24)) : null;

            // Determine freshness category
            let freshness = 'UNKNOWN';
            if (daysSinceReport !== null) {
              if (daysSinceReport <= FRESH_WINDOW_DAYS) {
                freshness = 'FRESH';
              } else {
                freshness = 'STALE';
              }
            }

            const injuryObj = {
              player: {
                first_name: inj.player?.first_name,
                last_name: inj.player?.last_name,
                position: inj.player?.position || inj.player?.position_abbreviation
              },
              status: inj.status || 'Unknown',
              type: inj.comment?.split('(')[1]?.split(')')[0] || 'Unknown', // Extract injury type from comment
              daysSinceReport,
              reportDateStr: injuryDate ? injuryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null,
              freshness,
              comment: inj.comment?.substring(0, 150) || '',
              source: 'BDL'
            };

            // Log fresh injuries prominently
            if (freshness === 'FRESH') {
              console.log(`[Scout Report] 🚨 FRESH NFL INJURY: ${inj.player?.first_name} ${inj.player?.last_name} (${inj.status}) - ${daysSinceReport} days ago`);
            }

            if (playerTeamId === homeTeamId) {
              homeInjuries.push(injuryObj);
            } else if (playerTeamId === awayTeamId) {
              awayInjuries.push(injuryObj);
            }
          }

          console.log(`[Scout Report] NFL injuries parsed: ${homeInjuries.length} for ${homeTeam}, ${awayInjuries.length} for ${awayTeam}`);
        }
      } catch (e) {
        console.warn(`[Scout Report] Failed to fetch BDL NFL injuries: ${e.message}`);
      }

      return {
        home: homeInjuries,
        away: awayInjuries,
        lineups: { home: [], away: [] },
        narrativeContext
      };
    }
    
    // =============================================================================
    // NBA/NHL/NCAAB: Fetch injuries & lineups from Rotowire via Gemini Grounding
    // Gemini searches site:rotowire.com and extracts the lineup/injury data
    // =============================================================================

    // OPTIMIZATION: For NCAAB, skip the separate injury grounding call
    // The RotoWire lineups fetch (later in buildScoutReport) already includes injuries
    // This avoids duplicate API calls and wasted tokens
    const isNcaab = sport === 'NCAAB' || sport === 'basketball_ncaab';

    let groundingInjuries;
    if (isNcaab) {
      console.log(`[Scout Report] NCAAB: Skipping separate injury fetch - will use RotoWire lineups response`);
      // Return empty injuries - they'll be populated from the lineups fetch
      groundingInjuries = { home: [], away: [], groundingRaw: null };
    } else {
      groundingInjuries = await fetchGroundingInjuries(homeTeam, awayTeam, sport);
    }

    // Use groundingRaw from the single call (no duplicate fetchGroundedContext call needed)
    const narrativeContext = groundingInjuries?.groundingRaw || null;

    const groundingHomeCount = groundingInjuries?.home?.length || 0;
    const groundingAwayCount = groundingInjuries?.away?.length || 0;

    // Check if grounding WORKED (got a response) - even if 0 injuries found
    // If narrativeContext has substantial content (>100 chars), grounding succeeded
    // NBA RapidAPI groundingRaw can be ~130 chars for healthy teams — use 50 as threshold
    const groundingWorked = narrativeContext && narrativeContext.length > 50;

    // If grounding worked (got a response with content), 0 injuries is VALID
    // Teams CAN be healthy - both college and pro. Treating 0 injuries as a failure
    // causes unnecessary errors when teams are actually healthy.
    const zeroInjuriesIsValid = groundingWorked;

    // Use Rotowire grounding injuries as source of truth
    // But ENRICH with BDL duration data (BDL has return_date and description with duration context)
    if (groundingHomeCount > 0 || groundingAwayCount > 0 || zeroInjuriesIsValid) {
      if (groundingHomeCount === 0 && groundingAwayCount === 0) {
        console.log(`[Scout Report] ✅ Grounding worked - both teams appear HEALTHY (no injuries reported)`);
      } else {
        console.log(`[Scout Report] Using Rotowire injuries (${groundingHomeCount} home, ${groundingAwayCount} away) as source of truth`);
      }

      // Fetch BDL injuries for duration enrichment (BDL has return_date and description)
      let enrichedHome = groundingInjuries.home || [];
      let enrichedAway = groundingInjuries.away || [];

      // NOTE: NCAAB RotoWire injury merge now happens in buildScoutReport() after lineups fetch
      // (see the parseNcaabInjuriesFromResponse section around line 1577)

      try {
        const bdlSport = sportToBdlKey(sport);
        if (bdlSport === 'basketball_nba') {
          // NBA: Duration resolved via box-score in buildScoutReport()
          // RapidAPI provides status + reason; box-score determines how long each player has been out
          console.log(`[Scout Report] NBA: Duration will be resolved via box-score in buildScoutReport()`);
        } else if (bdlSport === 'icehockey_nhl') {
          // NHL: Skip BDL injuries entirely - RotoWire Grounding already provides duration info
          // The BDL NHL injuries API doesn't include team info, making it useless for filtering
          // RotoWire format includes "since Jan 27, missed 2 games" which we parse for duration
          console.log(`[Scout Report] NHL: Skipping BDL/NHL.com injury calls - RotoWire Grounding already has duration info`);
        }
      } catch (e) {
        console.log(`[Scout Report] BDL duration enrichment failed: ${e.message}`);
      }

      // NBA: Skip stale marking — box-score resolution in buildScoutReport() handles duration + freshness
      if (bdlSport === 'basketball_nba') {
        return {
          home: enrichedHome,
          away: enrichedAway,
          staleInjuries: [], // Computed in buildScoutReport after box-score resolution
          lineups: { home: [], away: [] },
          narrativeContext
        };
      }

      // STALE INJURY MARKING (NBA: 3-day window, NHL: 3-day window)
      // Enriches injury objects with freshness data (FRESH/STALE)
      // Constitution teaches Gary how to think about injury timing
      // NOTE: Only log significant players (starters/high usage)
      // =========================================================================
      const STALE_WINDOW_DAYS = 3;
      const freshSignificantPlayers = [];
      const staleSignificantPlayers = [];

      const markStaleInjuries = (injuries, teamName) => {
        const marked = [];
        for (const inj of injuries) {
          const name = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
          const days = inj.daysSinceReport;
          const status = (inj.status || '').toLowerCase();
          // Check if player is significant (Out status only - Questionable players might play)
          const isOut = status.includes('out') || status.includes('doubtful');

          // If we don't have duration info, we can't determine staleness
          if (days === null || days === undefined) {
            inj.freshness = 'UNKNOWN';
            inj.isPricedIn = false;
          } else if (days <= STALE_WINDOW_DAYS) {
            inj.freshness = 'FRESH';
            inj.isPricedIn = false;
            // Only track significant fresh injuries (OUT players, not questionable)
            if (isOut) {
              freshSignificantPlayers.push(`${name} (${days}d, ${teamName})`);
            }
          } else {
            inj.freshness = 'STALE';
            inj.isPricedIn = true;
            if (isOut) {
              staleSignificantPlayers.push(`${name} (${days}d)`);
            }
          }
          marked.push(inj);
        }
        return marked;
      };

      const markedHome = markStaleInjuries(enrichedHome, homeTeam);
      const markedAway = markStaleInjuries(enrichedAway, awayTeam);

      // Mark UNKNOWN-duration injuries as STALE (assume priced in — duration unknown, not fresh news)
      // Gary still sees who's OUT (for lineup/matchup context) but won't cite as a fresh factor
      const markUnknownAsStale = (injuries, teamName) => {
        const unknowns = [];
        for (const inj of injuries) {
          if (inj.freshness === 'UNKNOWN' && (inj.daysSinceReport === null || inj.daysSinceReport === undefined)) {
            const name = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
            inj.freshness = 'STALE';
            inj.isPricedIn = true;
            inj.durationContext = 'OUT - duration unknown';
            unknowns.push(`${name} (${inj.status})`);
          }
        }
        if (unknowns.length > 0) {
          console.warn(`[Scout Report] ⚠️ ${unknowns.length} injuries with UNKNOWN duration for ${teamName} marked as STALE (assume priced in): ${unknowns.join(', ')}`);
        }
        return injuries;
      };

      const finalHome = markUnknownAsStale(markedHome, homeTeam);
      const finalAway = markUnknownAsStale(markedAway, awayTeam);

      // Log injury summary (per CLAUDE.md: include date + games missed to distinguish fresh vs stale)
      if (freshSignificantPlayers.length > 0) {
        console.log(`[Scout Report] Fresh OUT (0-3 days): ${freshSignificantPlayers.join(', ')}`);
      }
      if (staleSignificantPlayers.length > 0) {
        console.log(`[Scout Report] Stale OUT (>3 days, priced in): ${staleSignificantPlayers.join(', ')}`);
      }

      // Track stale injuries for context (OUT but priced in — not a fresh factor)
      const staleInjuries = [
        ...finalHome.filter(i => i.isPricedIn).map(i => `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim()),
        ...finalAway.filter(i => i.isPricedIn).map(i => `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim())
      ];

      return {
        home: finalHome,
        away: finalAway,
        staleInjuries, // OUT players with stale status (priced in)
        lineups: { home: [], away: [] },
        narrativeContext
      };
    }
    
    // FALLBACK 1: Try parsing injuries from narrative context (often has better data)
    if (narrativeContext) {
      console.log(`[Scout Report] Trying to parse injuries from narrative context...`);
      const narrativeParsed = parseGroundingInjuries(narrativeContext, homeTeam, awayTeam, sport);
      const narrativeHomeCount = narrativeParsed?.home?.length || 0;
      const narrativeAwayCount = narrativeParsed?.away?.length || 0;

      if (narrativeHomeCount > 0 || narrativeAwayCount > 0) {
        console.log(`[Scout Report] Parsed injuries from narrative context (${narrativeHomeCount} home, ${narrativeAwayCount} away)`);
        return {
          home: narrativeParsed.home || [],
          away: narrativeParsed.away || [],
          filteredLongTerm: narrativeParsed.filteredLongTerm || [],
          lineups: { home: [], away: [] },
          narrativeContext
        };
      }
    }

    // NO BDL FALLBACK FOR STATUS
    // BDL injury status data is often stale (e.g., player listed as "Questionable" when they've been playing for days)
    // Rotowire (via Gemini Grounding) is the ONLY source of truth for:
    //   - Expected starting lineups
    //   - Current injury status (OUT, GTD, Questionable, Doubtful, Probable)
    // BDL is ONLY used for duration enrichment (how long a player has been out)
    // If grounding fails, we must fail - cannot trust BDL for current game-day status

    // NCAAB: Return empty - injuries will be populated from RotoWire lineups fetch in buildScoutReport
    if (isNcaab) {
      return {
        home: [],
        away: [],
        lineups: { home: [], away: [] },
        narrativeContext: null
      };
    }

    // NO FALLBACK - Rotowire grounding MUST work (for NBA/NHL)
    // If grounding fails, throw error to fail the process
    const errorMsg = `[Scout Report] CRITICAL: Rotowire grounding failed to get injury/lineup data. Cannot proceed without Rotowire.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
    
  } catch (error) {
    // NCAAB uses a different flow (lineups fetch includes injuries) — non-critical here
    if (sport === 'NCAAB' || sport === 'basketball_ncaab') {
      console.warn(`[Scout Report] NCAAB injury fetch error (non-critical): ${error.message}`);
      return { home: [], away: [], narrativeContext: null };
    }
    // For NBA/NHL/NFL: ALL injury grounding errors are critical — process MUST fail
    // If Rotowire grounding fails for ANY reason (timeout, rate limit, API error),
    // we cannot proceed because Gary would analyze the game without knowing who's playing
    console.error(`[Scout Report] CRITICAL: Injury grounding failed for ${sport}: ${error.message}`);
    throw new Error(`[Scout Report] CRITICAL: Rotowire grounding failed to get injury/lineup data for ${sport}. Cannot proceed without Rotowire. Original error: ${error.message}`);
  }
}

/**
 * Execute a single grounding search via Gemini Flash.
 * Flash + Google Search grounding is used as the "search engine" — it finds facts.
 * Returns raw factual text, not a narrative.
 */
async function groundingSearch(genAI, query, todayFull) {
  const searchModel = genAI.getGenerativeModel({
    model: 'gemini-3-flash-preview',
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 1.0,
      thinkingConfig: { thinkingLevel: 'high' }
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ]
  });

  const prompt = `<date_anchor>Today is ${todayFull}. Your training data is from 2024 — it is NOW 2026. You MUST use Google Search.</date_anchor>

Search for: ${query}

Return ALL relevant information you find. Be thorough and comprehensive.
Include: dates, scores, player names, quotes, statistics, headlines, article titles.
Report raw factual information — do not summarize into a brief overview.
If you find multiple articles, report details from EACH one.
Do NOT include ATS records, betting trends, or against-the-spread statistics.`;

  try {
    const result = await searchModel.generateContent(prompt);
    return result.response.text() || '';
  } catch (error) {
    const errorMsg = error.message?.toLowerCase() || '';
    const is429 = error.status === 429 ||
      error.message?.includes('429') ||
      errorMsg.includes('resource has been exhausted') ||
      errorMsg.includes('quota');

    if (is429) {
      // On 429: try Pro fallback (both Flash and Pro support google_search grounding)
      console.warn(`[groundingSearch] Flash 429 - falling back to Pro: ${error.message?.slice(0, 80)}`);
      try {
        const proModel = genAI.getGenerativeModel({
          model: 'gemini-3-pro-preview',
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 1.0 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ]
        });
        const proResult = await proModel.generateContent(prompt);
        return proResult.response.text() || '';
      } catch (proError) {
        console.error(`[groundingSearch] Pro fallback also failed: ${proError.message?.slice(0, 80)}`);
        return null;
      }
    }

    // Non-429 errors: log and return null
    console.error(`[groundingSearch] Error (non-retryable): ${error.message?.slice(0, 80)}`);
    return null;
  }
}

/**
 * Fetch CURRENT STATE of each team using two-phase approach:
 *   Phase 1: Flash + Grounding searches in parallel (find the facts)
 *   Phase 2: Flash writes the narrative (rich, contextual output)
 *
 * This separates SEARCHING (what Flash+Grounding is good at) from
 * WRITING (what Pro is good at). Built-in grounding forces rigid output;
 * by feeding raw search results to Pro without grounding, Pro writes freely.
 *
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} sport - Sport key (NFL, NBA, NHL, etc.)
 * @param {string} gameDate - Game date string
 */
async function fetchCurrentState(homeTeam, awayTeam, sport, gameDate) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[Scout Report] Gemini not available for current state');
    return null;
  }

  try {
    const now = new Date();
    const today = gameDate || now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const todayFull = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const seasonContext = formatSeason(seasonForSport(sport));

    const sportName = {
      'NFL': 'NFL', 'americanfootball_nfl': 'NFL',
      'NBA': 'NBA', 'basketball_nba': 'NBA',
      'NHL': 'NHL', 'icehockey_nhl': 'NHL',
      'NCAAB': 'college basketball', 'basketball_ncaab': 'college basketball',
      'NCAAF': 'college football', 'americanfootball_ncaaf': 'college football'
    }[sport] || sport;

    const isNFL = sport === 'NFL' || sport === 'americanfootball_nfl';
    const isNCAAF = sport === 'NCAAF' || sport === 'americanfootball_ncaaf';
    const isFootball = isNFL || isNCAAF;

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 1: Flash + Grounding searches in parallel
    // Flash is the "search engine" — finds raw facts from Google Search
    // ═══════════════════════════════════════════════════════════════════════════
    console.log(`[Scout Report] Fetching CURRENT STATE for ${awayTeam} @ ${homeTeam} (2-phase: Flash search → Pro narrative)...`);
    const startTime = Date.now();

    const searchQueries = [
      `${homeTeam} ${sportName} news ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}. Recent games, results, scores, storylines, trades, roster moves, headlines, beat writer articles, coach quotes.`,
      `${awayTeam} ${sportName} news ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}. Recent games, results, scores, storylines, trades, roster moves, headlines, beat writer articles, coach quotes.`,
      `${awayTeam} vs ${homeTeam} ${sportName} game ${today}. Game preview, matchup analysis, storylines, broadcast info, breaking news.`
    ];

    // Add weather search for football
    if (isFootball) {
      // Get city from home team for weather
      searchQueries.push(`${homeTeam} stadium weather forecast ${today}. Temperature, wind, precipitation for tonight's game.`);
    }

    const searchResults = await Promise.all(
      searchQueries.map((q, i) => {
        const label = i === 0 ? 'HOME' : i === 1 ? 'AWAY' : i === 2 ? 'MATCHUP' : 'WEATHER';
        return groundingSearch(genAI, q, todayFull)
          .then(text => {
            console.log(`[Scout Report] Search ${label}: ${text.length} chars`);
            return { label, text };
          })
          .catch(e => {
            console.warn(`[Scout Report] Search ${label} failed: ${e.message}`);
            return { label, text: '' };
          });
      })
    );

    const searchDuration = Date.now() - startTime;
    console.log(`[Scout Report] Phase 1 (search) completed in ${searchDuration}ms`);

    // Build raw context block from search results
    const homeContext = searchResults.find(r => r.label === 'HOME')?.text || '';
    const awayContext = searchResults.find(r => r.label === 'AWAY')?.text || '';
    const matchupContext = searchResults.find(r => r.label === 'MATCHUP')?.text || '';
    const weatherContext = searchResults.find(r => r.label === 'WEATHER')?.text || '';

    // Check we got SOMETHING from searches
    const totalSearchChars = homeContext.length + awayContext.length + matchupContext.length;
    if (totalSearchChars < 200) {
      throw new Error(`Search phase returned insufficient data (${totalSearchChars} chars total). Searches may have failed.`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 2: Flash writes the narrative (no grounding — free to write richly)
    // Flash receives raw search results as context and crafts the narrative
    // ═══════════════════════════════════════════════════════════════════════════
    const narrativeModel = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      generationConfig: {
        temperature: 1.0,
        thinkingConfig: { thinkingLevel: 'high' }
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    });

    // Injury data comes from dedicated sources (RapidAPI for NBA, RotoWire for NHL/NCAAB, BDL for NFL/NCAAF)
    // Suppress injury mentions in narrative to avoid stale/conflicting info
    const isNBA = sport === 'NBA' || sport === 'basketball_nba';
    const isNHL = sport === 'NHL' || sport === 'icehockey_nhl';

    // Football-specific sections for the narrative prompt
    const footballNarrativeInstructions = isFootball ? `
Also include (if found in the search results):
- **WEATHER:** Game-time conditions — only mention if SEVERE (blizzard, 25+ mph sustained wind, sub-15°F, heavy rain). Skip if dome/indoor.
- **GAME CONTEXT:** Game type (TNF/SNF/MNF/Saturday${isNCAAF ? '/Bowl/CFP' : ''}), divisional/conference matchup, playoff implications, what's at stake.
` : '';

    const narrativePrompt = `You are a sports journalist writing a current state report for a ${sportName} game.
Today is ${todayFull}. Season: ${seasonContext}.

Below are raw search results about both teams and tonight's matchup. Use this information to write a rich, detailed current state report.

<search_results>
--- ${homeTeam} NEWS & CONTEXT ---
${homeContext || '[No results found]'}

--- ${awayTeam} NEWS & CONTEXT ---
${awayContext || '[No results found]'}

--- MATCHUP: ${awayTeam} @ ${homeTeam} (${today}) ---
${matchupContext || '[No results found]'}
${weatherContext ? `\n--- WEATHER ---\n${weatherContext}` : ''}
</search_results>

Based on the search results above, write the current state report. For EACH team, cover:

**${homeTeam} — What's going on with this team right now?**
- **RECENT TRAJECTORY:** Record, ranking, how they've looked over the last 5-10 games. Winning streak? Losing streak? Hot or cold?
- **LAST GAME:** What happened? Score, key performances, beat writer narrative (was it a blowout, comeback, overtime thriller, buzzer beater?).
- **TOP STORYLINES & HEADLINES:** The big stories around this team RIGHT NOW:
  * Recent trades, acquisitions, roster moves
  * Breakout performances or slumps from key players
  * Coaching news, fines, controversies, front office moves
  * Players RETURNING tonight who missed recent games (rest, minor injury, suspension)
  * Anything a knowledgeable fan would know about this team this week
  * Roster notes — key players emerging, role changes

**${awayTeam} — What's going on with this team right now?**
- Same categories as above.
${footballNarrativeInstructions}
**TODAY'S MATCHUP NEWS (${today}):**
- Game preview context: time, broadcast, venue
- Key matchup storylines specific to THIS game
- Coach or player quotes about tonight
- Any breaking news affecting tonight's game

RULES:
- Do NOT mention injuries, player availability, or injury statuses (e.g., "OUT", "questionable", "OFS"). Injury data comes from a dedicated real-time source and is handled separately. The ONLY exception: you MAY mention a player RETURNING tonight (coming back from absence) as a storyline — that is NEWS, not an injury report.
- Do NOT include ATS records, betting trends, cover percentages, or any against-the-spread statistics.
- Do NOT include HISTORICAL records or series history (e.g., "Team is 28-49 all-time at...", "first win since 2019", "lost 13 of last 19 trips"). These are descriptive, not predictive.
- Do NOT include conditional records (e.g., "15-0 when scoring 80+", "2-6 in Quad 1 games"). Focus on HOW they are playing, not won-loss tallies.
- Do NOT include future-tense content — no recruiting commitments, no next-season roster plans, no draft projections. Only cover what has ALREADY happened and what is relevant to TODAY'S game.
- Do NOT make betting predictions or pick a winner.
- Use specific details — names, dates, scores, quotes. No vague generalities.
- Only use information from the search results above. Do not make anything up.
- Write in a knowledgeable, factual tone. Think beat writer, not hype man.`;

    const narrativeStart = Date.now();
    let text;
    try {
      const result = await narrativeModel.generateContent(narrativePrompt);
      text = result.response.text();
    } catch (flashError) {
      const flashMsg = flashError.message?.toLowerCase() || '';
      const isFlash429 = flashError.status === 429 || flashError.message?.includes('429') || flashMsg.includes('quota');
      if (isFlash429) {
        console.log(`[Scout Report] Flash 429 for narrative — falling back to Pro`);
        const proModel = genAI.getGenerativeModel({
          model: 'gemini-3-pro-preview',
          generationConfig: { temperature: 1.0 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ]
        });
        const proResult = await proModel.generateContent(narrativePrompt);
        text = proResult.response.text();
      } else {
        throw flashError;
      }
    }
    const narrativeDuration = Date.now() - narrativeStart;
    const totalDuration = Date.now() - startTime;
    console.log(`[Scout Report] Phase 2 (narrative) completed in ${narrativeDuration}ms. Total: ${totalDuration}ms`);

    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDATION
    // ═══════════════════════════════════════════════════════════════════════════
    const MIN_RESPONSE_LENGTH = 200;
    if (!text || text.length < MIN_RESPONSE_LENGTH) {
      const errorMsg = `Narrative too short (${text?.length || 0} chars). Response: "${text?.substring(0, 100) || 'empty'}"`;
      console.error(`[Scout Report] [NARRATIVE FAIL] ${errorMsg}`);
      throw new Error(`Current state narrative failed: ${errorMsg}`);
    }

    const textLower = text.toLowerCase();
    const homeMascot = homeTeam.split(' ').pop().toLowerCase();
    const awayMascot = awayTeam.split(' ').pop().toLowerCase();
    const mentionsHome = textLower.includes(homeTeam.toLowerCase()) || textLower.includes(homeMascot);
    const mentionsAway = textLower.includes(awayTeam.toLowerCase()) || textLower.includes(awayMascot);

    if (!mentionsHome && !mentionsAway) {
      throw new Error(`Narrative does not mention either team. Expected "${homeTeam}" or "${awayTeam}".`);
    }

    console.log(`[Scout Report] [NARRATIVE OK] ${text.length} chars, mentions: home=${mentionsHome}, away=${mentionsAway}`);

    // Strip any ATS lines that slipped through
    let cleanedText = text;
    const atsPattern = /^[^\n]*\b(\d+-\d+(?:-\d+)?\s+ATS|ATS\s+record|ATS\s+in|against the spread|cover\s+(?:percentage|pct|rate)|covers?\s+the\s+spread|betting\s+trend|public\s+betting|action\s+on)\b[^\n]*$/gim;
    const atsMatches = cleanedText.match(atsPattern);
    if (atsMatches) {
      console.log(`[Scout Report] Stripped ${atsMatches.length} ATS/betting line(s) from narrative`);
      cleanedText = cleanedText.replace(atsPattern, '').replace(/\n{3,}/g, '\n\n').trim();
    }

    const preview = cleanedText.substring(0, 300).replace(/\n/g, ' ');
    console.log(`[Scout Report] Current state preview: ${preview}...`);
    console.log(`[Scout Report] === FULL CURRENT STATE START ===`);
    console.log(cleanedText);
    console.log(`[Scout Report] === FULL CURRENT STATE END ===`);

    return {
      groundedRaw: cleanedText,
      groundingUsed: true
    };

  } catch (error) {
    console.warn(`[Scout Report] Current state fetch failed: ${error.message}`);
    return null;
  }
}

/**
 * Fetch NCAAB TIER 1 advanced metrics upfront via Gemini Grounding.
 * Two parallel calls (one per team) for: KenPom, NET, Barttorvik, SOS.
 * This moves the grounding stat fetches OUT of Gary's investigation iterations
 * and INTO the scout report so Gary has predictive data from the start.
 */
async function fetchNcaabAdvancedMetrics(homeTeamName, awayTeamName) {
  // ═══════════════════════════════════════════════════════════════════════════
  // Barttorvik API: Structured data, no Grounding needed
  // One cached fetch serves ALL NCAAB games (365 teams, 6h cache)
  // Replaces 2 Gemini Grounding calls per game
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

/**
 * Format NCAAB Tier 1 Advanced Metrics for the scout report.
 * Now uses structured Barttorvik API data (no Grounding).
 */
function formatNcaabAdvancedMetrics(data) {
  if (!data) return '';

  const lines = [];
  lines.push('');
  lines.push('NCAAB REFERENCE METRICS (Barttorvik)');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  const formatTeam = (teamData, label) => {
    if (!teamData) return;
    const d = teamData.data;
    if (!d) {
      lines.push(`[${label}] ${(teamData.team || '').toUpperCase()}: Barttorvik data unavailable. Rely on BDL-calculated stats from your investigation.`);
      lines.push('');
      return;
    }
    lines.push(`[${label}] ${(teamData.team || '').toUpperCase()} (${d.conferenceName || d.conference})`);
    lines.push(`  Record: ${d.record} | Conf: ${d.confRecord}`);
    lines.push(`  AdjOE: ${d.adjOE} | AdjDE: ${d.adjDE} | AdjEM: ${d.adjEM > 0 ? '+' : ''}${d.adjEM}`);
    lines.push(`  Tempo: ${d.tempo} | Barthag: ${d.barthag} | WAB: ${d.wab > 0 ? '+' : ''}${d.wab}`);
    lines.push('');
  };

  formatTeam(data.home, 'HOME');
  formatTeam(data.away, 'AWAY');

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  return lines.join('\n');
}

// fetchNcaabTeamFourFactors and formatNcaabTeamFourFactors DELETED — never called (see line ~798)

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

/**
 * Calculate NCAAB Home/Away splits from recent games.
 * Now computes Season + L10 + L5 breakdowns for trend analysis.
 * No extra API call — uses recentHome/recentAway already fetched (full season via seasons param).
 */
function calcNcaabHomeCourt(recentHome, recentAway, homeTeamName, awayTeamName, homeTeamId, awayTeamId) {
  // Compute home/away splits for a given slice of games
  const calcSplitsForSlice = (games, teamId, teamName) => {
    if (!games || games.length === 0) return null;

    let homeWins = 0, homeLosses = 0, awayWins = 0, awayLosses = 0;
    let homePts = 0, homeOppPts = 0, homeGames = 0;
    let awayPts = 0, awayOppPts = 0, awayGamesCount = 0;

    for (const g of games) {
      const isHome = g.home_team?.id === teamId || (g.home_team?.name || '').toLowerCase().includes(teamName.toLowerCase().split(' ').pop());
      const teamScore = isHome ? (g.home_team_score ?? g.home_score ?? 0) : (g.visitor_team_score ?? g.away_score ?? 0);
      const oppScore = isHome ? (g.visitor_team_score ?? g.away_score ?? 0) : (g.home_team_score ?? g.home_score ?? 0);

      if (teamScore === 0 && oppScore === 0) continue; // skip unplayed

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

    const homeMargin = homeGames > 0 ? ((homePts - homeOppPts) / homeGames).toFixed(1) : 'N/A';
    const awayMargin = awayGamesCount > 0 ? ((awayPts - awayOppPts) / awayGamesCount).toFixed(1) : 'N/A';

    return {
      home_record: `${homeWins}-${homeLosses}`,
      away_record: `${awayWins}-${awayLosses}`,
      home_margin: homeMargin,
      away_margin: awayMargin,
      home_games: homeGames,
      away_games: awayGamesCount
    };
  };

  // Compute splits for a team across Season / L10 / L5
  const calcAllSplits = (games, teamId, teamName) => {
    if (!games || games.length === 0) return null;
    // games are sorted most-recent-first
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

/**
 * Scrub mentions of "ghost" players and long-term injured players from the grounding narrative
 * @param {string} narrative - The narrative to clean
 * @param {string[]} allowedPlayers - Players allowed to be mentioned
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string[]} excludedPlayers - Players to ALWAYS remove (long-term injuries)
 */
async function scrubNarrative(narrative, allowedPlayers, homeTeam, awayTeam, excludedPlayers = []) {
  if (!narrative || !allowedPlayers || allowedPlayers.length === 0) return narrative;

  const genAI = getGeminiClient();
  if (!genAI) return narrative;

  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3-flash-preview',
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    });
    
    const excludedSection = excludedPlayers.length > 0
      ? `\n### EXCLUDED PLAYERS (NEVER PLAYED THIS SEASON - 0 GAMES - ALWAYS REMOVE):\n${excludedPlayers.join(', ')}\nThese players have 0 games played this season. They have been out all year — the team has fully adjusted and the line reflects their absence. Remove ALL mentions.\n`
      : '';

    const prompt = `You are a data integrity tool. I will provide a news report about a sports matchup.

### TASK:
1. Remove any mentions of players in the EXCLUDED list (never played this season - 0 games, team has adjusted, absence is priced in)
2. Remove any mentions of players NOT in the VALID list
${excludedSection}
### VALID PLAYERS:
${allowedPlayers.join(', ')}

### NEWS REPORT TO CLEAN:
${narrative}

### STRICT RULES:
1. PRIORITY: If a sentence/bullet mentions ANY player in the EXCLUDED list, DELETE the entire sentence/bullet.
2. If a sentence mentions a player NOT in the VALID list, DELETE the entire sentence.
3. If a bullet point discusses a "ghost" player (not on the current roster), DELETE the entire bullet.
4. If a paragraph discusses the impact of an EXCLUDED player, DELETE that paragraph.
5. KEEP mentions of players who recently got injured (even season-ending injuries) IF they are in the VALID list.
6. DELETE any lines with ATS records, against-the-spread stats, cover percentages, or betting trends. These are FORBIDDEN.
7. DO NOT add any new info.
8. DO NOT explain your changes.
9. Return ONLY the cleaned text.
10. Preserve the headers and bullets for players who ARE in the valid list and NOT in excluded.

Cleaned Report:`;

    const result = await model.generateContent(prompt);
    const cleaned = (result.response?.text() || narrative).trim();
    
    if (cleaned.length < 50 && narrative.length > 500) {
      console.warn(`[Scout Report] Scrubbing was too aggressive, falling back to original narrative`);
      return narrative;
    }
    
    return cleaned;
  } catch (e) {
    console.warn(`[Scout Report] Narrative scrubbing failed: ${e.message}`);
    return narrative;
  }
}

/**
 * Fetch injuries using Gemini Grounding
 * Uses Gemini 3 Flash with Google Search for real-time injury data
 */
async function fetchGroundingInjuries(homeTeam, awayTeam, sport) {
  try {
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Sport-specific queries for Gemini Grounding
    let query;
    if (sport === 'NHL' || sport === 'icehockey_nhl') {
      // NHL-specific: Search rotowire.com/hockey/nhl-lineups.php directly
      // This page ALWAYS shows TODAY's lineups and injuries by default
      console.log(`[Scout Report] Using Gemini Grounding for injury data: ${homeTeam} vs ${awayTeam}`);

      // DEDICATED INJURY-ONLY QUERY - This is critical!
      // The combined query often skips injuries. This query ONLY asks for injuries.
      // Use the exact RotoWire URL and be very specific about what to extract
      // ALSO ask for duration info (when the injury started, how long out)
      const makeNhlInjuryOnlyQuery = (teamName) => `Go to https://www.rotowire.com/hockey/nhl-lineups.php

Find the ${teamName} lineup card on this page.

Look at the INJURIES section of the ${teamName} card. List each injured player with:
1. Position (D, C, LW, RW, G)
2. Full Name
3. Status (IR, IR-LT, DTD, OUT, IR-NR)
4. How long they've been out (if shown in news/notes)

FORMAT REQUIRED:
Position Name Status | Duration

EXAMPLES:
D Ryan Ellis IR | since Nov 15, missed 20+ games
D Shea Weber IR-LT | season-long injury
LW Kirill Marchenko DTD | day-to-day, missed 2 games
C Anton Lundell OUT | just ruled out today

If duration/games missed is not shown, just write the position, name, and status.

If ${teamName} has no injuries listed, say: "No injuries"

Only list injuries for ${teamName}.`;

      // GOALIE QUERY - separate for reliability
      const makeNhlGoalieQuery = (teamName, opponentName) => `Search site:rotowire.com/hockey/nhl-lineups.php for the ${teamName} vs ${opponentName} game.

Look at the lineup card for ${teamName}. Extract ONLY:

1. STARTING GOALIE:
${teamName} Goalie: [Name] (Confirmed/Expected)

Report whether the goalie is "Confirmed" or "Expected" based on what RotoWire shows.`;

      // Run BOTH goalie and injury queries in parallel for each team
      const [awayGoalieResponse, homeGoalieResponse, awayInjuryResponse, homeInjuryResponse] = await Promise.all([
        geminiGroundingSearch(makeNhlGoalieQuery(awayTeam, homeTeam), { maxTokens: 500 }),
        geminiGroundingSearch(makeNhlGoalieQuery(homeTeam, awayTeam), { maxTokens: 500 }),
        geminiGroundingSearch(makeNhlInjuryOnlyQuery(awayTeam), { maxTokens: 8192 }),
        geminiGroundingSearch(makeNhlInjuryOnlyQuery(homeTeam), { maxTokens: 8192 })
      ]);

      // Log raw injury responses for debugging
      if (awayInjuryResponse?.data) {
        console.log(`[Scout Report] ${awayTeam} injury grounding raw: ${awayInjuryResponse.data.substring(0, 300)}...`);
      }
      if (homeInjuryResponse?.data) {
        console.log(`[Scout Report] ${homeTeam} injury grounding raw: ${homeInjuryResponse.data.substring(0, 300)}...`);
      }

      // Combine goalie + injury responses for parsing
      // CRITICAL: Include team name before injuries so parser can determine team context
      const awayResponse = {
        success: awayGoalieResponse?.success || awayInjuryResponse?.success,
        data: `${awayGoalieResponse?.data || ''}\n\n${awayTeam} INJURIES:\n${awayInjuryResponse?.data || 'None'}`
      };
      const homeResponse = {
        success: homeGoalieResponse?.success || homeInjuryResponse?.success,
        data: `${homeGoalieResponse?.data || ''}\n\n${homeTeam} INJURIES:\n${homeInjuryResponse?.data || 'None'}`
      };

      const combined = {
        home: [],
        away: [],
        groundingRaw: null
      };

      const mergeParsed = (response, side) => {
        if (!response?.success || !response?.data) return;
        const parsed = parseGroundingInjuries(response.data, homeTeam, awayTeam, sport);
        const list = side === 'home' ? (parsed.home || []) : (parsed.away || []);
        const existing = side === 'home' ? combined.home : combined.away;
        
        // Helper to get player name as string (handles both string and object formats)
        const getPlayerKey = (p) => {
          if (!p) return '';
          if (typeof p === 'string') return p.toLowerCase();
          return `${p.first_name || ''} ${p.last_name || ''}`.trim().toLowerCase();
        };
        
        const seen = new Set(existing.map(i => getPlayerKey(i.player)));
        for (const item of list) {
          const key = getPlayerKey(item.player);
          if (key && !seen.has(key)) {
            existing.push(item);
            seen.add(key);
          }
        }
        combined.groundingRaw = `${combined.groundingRaw || ''}\n${response.data}`.trim();
      };

      // Parse the 2 comprehensive responses (one per team)
      mergeParsed(awayResponse, 'away');
      mergeParsed(homeResponse, 'home');

      console.log(`[Scout Report] Grounding injuries: ${combined.home.length} for ${homeTeam}, ${combined.away.length} for ${awayTeam}`);
      return combined;

    } else if (sport === 'NCAAB' || sport === 'basketball_ncaab') {
      query = `Search site:rotowire.com/cbb/lineups.php for the college basketball game ${awayTeam} vs ${homeTeam}.

Look at the lineup card for this matchup on that page. Extract the following EXACTLY as shown:

1. STARTING LINEUPS - For EACH team, list the starting 5:
${awayTeam}:
PG [Name]
SG [Name]
SF [Name]
PF [Name]
C [Name]

${homeTeam}:
PG [Name]
SG [Name]
SF [Name]
PF [Name]
C [Name]

2. INJURIES section - List players with EXACT status:
${awayTeam} Injuries:
- [Position] [Name] [Status]
(Example: C I. Ufochukwu Out, F S. Wilkins OFS)
OR "None" if no injuries

${homeTeam} Injuries:
- [Position] [Name] [Status]
OR "None" if no injuries

STATUS CODES:
- Out = Confirmed out for this game
- OFS = Out For Season
- GTD = Game Time Decision

RULES:
1. Return BOTH teams' starting lineups
2. Use EXACT status codes from Rotowire (Out, OFS, GTD)
3. If no injuries, say "None"`;
    } else if (sport === 'NFL' || sport === 'americanfootball_nfl') {
      // NFL-specific query - search rotowire.com/football/nfl-lineups.php directly
      query = `Search site:rotowire.com/football/nfl-lineups.php for the ${awayTeam} vs ${homeTeam} game.

Look at the lineup card for this matchup on that page. Extract the following EXACTLY as shown:

1. STARTING LINEUPS - Most importantly the STARTING QB:
${awayTeam}:
- QB [Name]
- RB [Name]
- WR [Name], [Name], [Name]
- TE [Name]
- K [Name]

${homeTeam}:
- QB [Name]
- RB [Name]
- WR [Name], [Name], [Name]
- TE [Name]
- K [Name]

2. PLAYER STATUSES - Look for status codes after player names:
- "Q" = Questionable
- "D" = Doubtful
- "O" = Out
- "IR" = Injured Reserve

3. INACTIVES section (if available):
${awayTeam} Inactives: [List players or "Not Yet Available"]
${homeTeam} Inactives: [List players or "Not Yet Available"]

CRITICAL:
1. Verify the STARTING QB — who is confirmed to start?
2. Note any player with Q/D/O/IR status code
3. If inactives aren't available yet, say "Not Yet Available"`;
    } else if (sport === 'NCAAF' || sport === 'americanfootball_ncaaf') {
      query = `For the college football game ${awayTeam} @ ${homeTeam} on ${today} (2025-26 Bowl Season):

1. INJURIES & ROSTER ATTRITION - CRITICAL:
   - List ALL players OUT, DOUBTFUL, or QUESTIONABLE for each team.
   - Include player name, position, and impact (e.g., "Starting LT", "Leading Tackler").
   - MUST IDENTIFY: NFL Draft Opt-outs, Transfer Portal entries, and Academically Ineligible players.
   - For bowl games, distinguish between "Regular Season Starters" and "Bowl Game Starters".
   - For DURATION, include "since [Month] [Day]" or "missed [X] games" when available.

2. QB SITUATION: 
   - Who is the confirmed starting QB for each team? 
   - If the regular starter is out (portal/opt-out), describe the backup's experience and style.
   - Any QB controversies or split-snap situations?

3. COACHING & MOTIVATION:
   - Are there any coaching changes? (Head Coach, OC, or DC leaving for other jobs/fired).
   - Who is calling the plays for the bowl game?
   - Motivation context: Is one team "happy to be there" vs. "disappointed to miss the playoff"? 
   - Is this a "home" bowl for one team?

4. WEATHER & VENUE:
   - Current weather forecast for kickoff (Temp, Rain/Snow, Wind Speed).
   - Is the game in a dome or outdoors?

5. ADVANCED ANALYTICS (if found):
   - Current FPI (Football Power Index) or S&P+ rankings for both teams.
   - Strength of Schedule (SOS) and recent margin of victory/loss.

Be factual and concise. Format injuries clearly. NO betting predictions.

CRITICAL ANTI-OPINION RULES:
1. FACTS ONLY - Do NOT include betting predictions from articles.
2. NO OPINIONS - Extract FACTS only, ignore betting advice.
3. YOUR OWN WORDS - Synthesize facts, do NOT plagiarize.
4. NO BETTING ADVICE - Gary makes his own picks.`;

    } else if (sport === 'NBA' || sport === 'basketball_nba') {
      // NBA: Use RapidAPI ONLY for injuries (structured JSON, no hallucination)
      // NO Gemini Grounding for lineups or injuries — if API fails, process FAILS
      console.log(`[Scout Report] Fetching NBA injuries (RapidAPI only) for ${awayTeam} @ ${homeTeam}`);

      // Generate ISO date (YYYY-MM-DD) for the API — use EST, not UTC
      const isoDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

      // Fetch injuries from RapidAPI — this is the ONLY source
      const apiInjuries = await fetchNbaInjuriesForGame(homeTeam, awayTeam, isoDate);

      if (apiInjuries) {
        console.log(`[Scout Report] NBA injuries from RapidAPI: ${apiInjuries.away.length} ${awayTeam}, ${apiInjuries.home.length} ${homeTeam}`);

        const groundingRaw = [
          `=== ${awayTeam} ===`,
          `${awayTeam} INJURY REPORT:`,
          apiInjuries.away.length > 0
            ? apiInjuries.away.map(i => `${i.player.first_name} ${i.player.last_name} - ${i.status} (${i.durationContext})`).join('\n')
            : 'No injuries reported',
          '',
          `=== ${homeTeam} ===`,
          `${homeTeam} INJURY REPORT:`,
          apiInjuries.home.length > 0
            ? apiInjuries.home.map(i => `${i.player.first_name} ${i.player.last_name} - ${i.status} (${i.durationContext})`).join('\n')
            : 'No injuries reported'
        ].join('\n');

        console.log(`[Scout Report] NBA injury context (${groundingRaw.length} chars):\n${groundingRaw}`);

        return {
          home: apiInjuries.home,
          away: apiInjuries.away,
          groundingRaw
        };
      }

      // API failed — process MUST fail (no Grounding fallback)
      throw new Error(`[Scout Report] CRITICAL: NBA Injuries API failed — cannot proceed without injury data. Gary would analyze the game without knowing who's playing.`);

    } else {
      query = `Current injuries for ${sport} game ${awayTeam} vs ${homeTeam} as of ${today}. List all players OUT, DOUBTFUL, or QUESTIONABLE with their status and injury type.`;
    }
    
    console.log(`[Scout Report] Using Gemini Grounding for injury data: ${homeTeam} vs ${awayTeam}`);

    // Use higher maxTokens to ensure complete response (3500 gives plenty of room)
    const response = await geminiGroundingSearch(query, { temperature: 1.0, maxTokens: 3500 });

    if (!response?.success || !response?.data) {
      console.log('[Scout Report] Gemini Grounding returned no injury data');
      return { home: [], away: [], groundingRaw: null };
    }

    // Log first 500 chars of raw response to help debug parsing issues
    console.log(`[Grounding Search] Response preview (first 500 chars):\n${response.data.substring(0, 500)}`);

    // Parse the grounding response to extract injuries
    const parsed = parseGroundingInjuries(response.data, homeTeam, awayTeam, sport);
    parsed.groundingRaw = response.data; // Keep raw for display

    console.log(`[Scout Report] Grounding injuries: ${parsed.home.length} for ${homeTeam}, ${parsed.away.length} for ${awayTeam}`);

    // If parsing found 0 injuries for both teams, log a warning - this might be a parsing issue
    if (parsed.home.length === 0 && parsed.away.length === 0 && sport === 'basketball_nba') {
      console.warn(`[Scout Report] ⚠️ NBA grounding returned 0 injuries for BOTH teams - verify if this is correct or a parsing issue`);
    }
    
    return parsed;
    
  } catch (error) {
    console.warn(`[Scout Report] Grounding injury check failed:`, error.message);
    return { home: [], away: [], groundingRaw: null };
  }
}

/**
 * Parse Gemini Grounding response to extract injury information
 * Returns: { home: [], away: [], filteredLongTerm: [] } - filteredLongTerm contains names of players
 * filtered out due to 14+ day absence (for narrative scrubbing)
 */
function parseGroundingInjuries(content, homeTeam, awayTeam, sport = '') {
  const injuries = { home: [], away: [], filteredLongTerm: [] };
  const foundPlayers = new Set(); // Prevent duplicates
  
  // Normalize status to standard format
  // CRITICAL: Preserve GTD (Game Time Decision) as distinct from Questionable
  // CRITICAL: Handle Prob/Probable correctly - these players are EXPECTED TO PLAY
  const normalizeStatus = (status) => {
    const s = status.toLowerCase().trim();
    if (s.includes('ltir') || s.includes('long-term') || s.includes('long term')) return 'LTIR';
    if (s === 'ir' || s.includes('injured reserve')) return 'IR';
    if (s.includes('ofs') || s.includes('out for season')) return 'OFS';
    // GTD is a specific status - game time decision, preserve it
    if (s === 'gtd' || s.includes('gtd') || s.includes('game-time decision') || s.includes('game time decision')) return 'GTD';
    // Probable = ~75% chance to play (expected to play) - NOT a concern
    if (s.includes('prob') || s.includes('probable')) return 'Prob';
    if (s.includes('out') || s.includes('ruled out')) return 'Out';
    if (s.includes('doubtful') || s.includes('doubt')) return 'Doubtful';
    if (s.includes('questionable') || s.includes('ques') || s.includes('day-to-day')) return 'Questionable';
    return 'Unknown'; // Default to Unknown for unrecognized statuses (don't assume Out)
  };
  
  // Extract duration context from injury text
  // Returns: { duration, isEdge, note, outSinceDate, daysSinceOut }
  const extractDuration = (text, returnDate = null) => {
    const t = text.toLowerCase();
    const now = new Date();
    let outSinceDate = null;
    let daysSinceOut = null;

    // Try to extract "since [DATE]" patterns from text
    // Matches: "since Dec. 18", "since December 18", "since Jan 6", "since October"
    const sinceMatch = t.match(/since\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[.\s]*(\d{1,2})?/i);
    if (sinceMatch) {
      const monthStr = sinceMatch[1].toLowerCase();
      const day = sinceMatch[2] ? parseInt(sinceMatch[2], 10) : 1;
      const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const monthNum = monthMap[monthStr.substring(0, 3)];
      if (monthNum !== undefined) {
        // Assume current season (adjust year if month is after current month)
        let year = now.getFullYear();
        if (monthNum > now.getMonth()) year -= 1; // Previous year if month is in the future
        outSinceDate = new Date(year, monthNum, day);
        daysSinceOut = Math.floor((now - outSinceDate) / (1000 * 60 * 60 * 24));
      }
    }

    // Detect "missed X games" or "Xth game in a row" patterns
    const gamesMatch = t.match(/missed\s+(\d+)\s+games/);
    const gameInRowMatch = t.match(/(\d+)(?:th|rd|nd|st)\s+game\s+in\s+a\s+row/);
    const consecutiveMatch = t.match(/(\d+)\s+consecutive\s+games/);
    const straightMatch = t.match(/(\d+)\s+straight\s+games/);

    let games = 0;
    if (gamesMatch) games = parseInt(gamesMatch[1], 10);
    else if (gameInRowMatch) games = parseInt(gameInRowMatch[1], 10);
    else if (consecutiveMatch) games = parseInt(consecutiveMatch[1], 10);
    else if (straightMatch) games = parseInt(straightMatch[1], 10);

    // Estimate days from games missed if we don't have a specific date
    // NBA: ~3 games per week, NFL: 1 game per week
    if (games > 0 && !daysSinceOut) {
      const daysPerGame = 2.5; // NBA average
      daysSinceOut = Math.round(games * daysPerGame);
      outSinceDate = new Date(now.getTime() - (daysSinceOut * 24 * 60 * 60 * 1000));
    }

    // Format the outSince string for display
    const outSinceStr = outSinceDate
      ? outSinceDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null;

    // Determine duration category based on days out
    if (daysSinceOut !== null) {
      if (daysSinceOut >= 45) {
        return { duration: 'SEASON-LONG', isEdge: false, note: `Out since ~${outSinceStr} (${daysSinceOut}+ days)`, outSinceDate: outSinceStr, daysSinceOut };
      } else if (daysSinceOut >= 21) {
        return { duration: 'MID-SEASON', isEdge: false, note: `Out since ~${outSinceStr} (~${Math.round(daysSinceOut / 7)} weeks)`, outSinceDate: outSinceStr, daysSinceOut };
      } else if (daysSinceOut >= 7) {
        return { duration: 'MID-SEASON', isEdge: false, note: `Out since ~${outSinceStr} (~${daysSinceOut} days)`, outSinceDate: outSinceStr, daysSinceOut };
      } else {
        return { duration: 'RECENT', isEdge: true, note: `Out since ~${outSinceStr} (${daysSinceOut} days)`, outSinceDate: outSinceStr, daysSinceOut };
      }
    }

    // Text-based detection (fallback if no dates/games found)
    // OFS = Rotowire's status code for "Out For Season"
    if (t.includes('season-long') || t.includes('all season') || t.includes('since week 1') ||
        t.includes('since week 2') || t.includes('since week 3') || t.includes('most of the season') ||
        t.includes('out for the year') || t.includes('out all year') ||
        t.includes('indefinitely') || t.includes('no timetable') || t.includes('no return') ||
        t.includes('season-ending') || t.includes('out for season') || t.includes('ofs') ||
        t.includes('won\'t return') || t.includes('will not return') ||
        t.includes('since the start') || t.includes('long-term') || t.includes('long term')) {
      return { duration: 'SEASON-LONG', isEdge: false, note: '', outSinceDate: null, daysSinceOut: null };
    }
    if (t.includes('mid-season') || t.includes('since week 4') || t.includes('since week 5') ||
        t.includes('since week 6') || t.includes('since week 7') || t.includes('since week 8') ||
        t.includes('since week 9') || t.includes('since week 10') || t.includes('since week 11') ||
        t.includes('several weeks') || t.includes('multiple weeks') || t.includes('month') ||
        t.includes('extended') || t.includes('prolonged')) {
      return { duration: 'MID-SEASON', isEdge: false, note: '', outSinceDate: null, daysSinceOut: null };
    }
    if (t.includes('recent') || t.includes('last week') || t.includes('this week') ||
        t.includes('just') || t.includes('new') || t.includes('since week 14') ||
        t.includes('since week 15') || t.includes('since week 16') ||
        t.includes('day-to-day') || t.includes('game-time')) {
      return { duration: 'RECENT', isEdge: true, note: '', outSinceDate: null, daysSinceOut: null };
    }
    // Default
    return { duration: 'UNKNOWN', isEdge: null, note: '', outSinceDate: null, daysSinceOut: null };
  };

  // NBA-specific: Prefer strict parsing from "MAY NOT PLAY" sections
  const parseNbaMayNotPlay = () => {
    const result = { home: [], away: [], filteredLongTerm: [] };
    if (!content) return result;

    const lines = content.split('\n');
    const homeLower = homeTeam.toLowerCase();
    const awayLower = awayTeam.toLowerCase();

    const isTeamHeader = (lineLower, teamLower) => {
      // Strip markdown formatting (**, ##, etc.) and === markers before checking
      const cleanLine = lineLower.replace(/\*\*/g, '').replace(/^[=#]+\s*/, '').replace(/\s*[=#]+$/, '').trim();

      // Section headers like "MAY NOT PLAY (Team Name)" are NOT team headers
      // They contain the team name but are section markers — must be handled by section check
      if (cleanLine.startsWith('may not play') || cleanLine.startsWith('injuries') ||
          cleanLine.startsWith('expected lineup') || cleanLine.startsWith('starting lineup')) {
        return false;
      }

      // Match team name at start of line (with === markers from strict query format)
      // e.g., "washington wizards", "=== miami heat ===", "miami heat:"
      if (cleanLine.startsWith(teamLower)) return true;

      // For non-startsWith matches, require SHORT lines to avoid matching intro sentences
      // like "The following Miami Heat players are listed with an injury..." (85+ chars)
      // Real team headers are short: "Miami Heat - Injuries" (~22 chars)
      if (cleanLine.length > 60) return false;

      const hasTeam = cleanLine.includes(teamLower);
      if (!hasTeam) return false;

      // Match "Team: injuries" or "Team injuries" or "Team - Out Players"
      if (cleanLine.includes('injur') || cleanLine.includes('may not play') || cleanLine.includes('out')) {
        return true;
      }

      // Allow simple team header lines like "Memphis Grizzlies:" or "**Washington Wizards:**"
      if (/[:\-–]\s*$/.test(cleanLine)) return true;
      return false;
    };

    const shouldStopInjurySection = (lineLower) => {
      // Strip markdown before checking
      const cleanLine = lineLower.replace(/\*\*/g, '').replace(/^#+\s*/, '').replace(/^[=#]+\s*/, '').replace(/\s*[=#]+$/, '').trim();
      // Stop injury parsing when we hit lineup sections or next team header
      return cleanLine.includes('expected lineup') ||
        cleanLine.includes('starting lineup') ||
        cleanLine.includes('starting lineups') ||
        cleanLine.includes('expected starting') ||
        cleanLine.startsWith(homeLower) ||
        cleanLine.startsWith(awayLower);
    };

    // Validate that a parsed "player name" is actually a name, not an English phrase
    // (e.g., "are officially ruled" or "has been ruled" can slip through regex patterns)
    const isValidPlayerName = (nameStr) => {
      if (!nameStr || nameStr.length < 4) return false;
      const invalidWords = ['has', 'been', 'ruled', 'are', 'officially', 'will', 'not', 'expected', 'the', 'this', 'that', 'is', 'was', 'were', 'may', 'might', 'could', 'should', 'would', 'can', 'did', 'does', 'do', 'no', 'for', 'with', 'from', 'they', 'their', 'his', 'her', 'out', 'listed'];
      const words = nameStr.toLowerCase().split(/\s+/);
      if (words.every(w => invalidWords.includes(w))) return false;
      // Real player names start with an uppercase letter
      if (!/[A-Z]/.test(nameStr.charAt(0))) return false;
      return true;
    };

    const addParsedInjury = (team, playerName, status, rawLine) => {
      const name = (playerName || '').trim();
      if (!isValidPlayerName(name)) return;
      const playerKey = name.toLowerCase();
      if (foundPlayers.has(playerKey)) return;

      const durationInfo = extractDuration(rawLine);
      const normalizedStatus = normalizeStatus(status);

      // Give Gary context about injury significance
      // Long-term injuries = already reflected in the line and team's recent stats (priced in)
      // Recent injuries = new information, line may not fully reflect yet
      // UNKNOWN duration gets enriched by BDL later — marked STALE if still UNKNOWN after enrichment
      let durationContext = '';
      if (durationInfo.duration === 'SEASON-LONG') {
        durationContext = 'Out For Season';
      } else if (durationInfo.duration === 'MID-SEASON') {
        durationContext = `OUT${durationInfo.daysSinceOut ? ` (${durationInfo.daysSinceOut}d)` : ''}`;
      } else if (durationInfo.duration === 'RECENT') {
        durationContext = `RECENT${durationInfo.daysSinceOut ? ` (${durationInfo.daysSinceOut}d)` : ''}`;
      } else {
        durationContext = 'PENDING_ENRICHMENT';
      }

      foundPlayers.add(playerKey);
      const nameParts = name.split(' ');

      result[team].push({
        player: {
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' '),
          position: ''
        },
        status: normalizedStatus,
        duration: durationInfo.duration,
        durationContext: durationContext,
        isEdge: durationInfo.isEdge,
        durationNote: durationInfo.note,
        reportDateStr: durationInfo.outSinceDate,
        daysSinceReport: durationInfo.daysSinceOut,
        source: 'gemini_grounding'
      });
    };

    const parseInjuryLine = (line, team) => {
      // Strip markdown formatting (bold **text**, headers ###, etc.) before parsing
      const cleanLine = line
        .replace(/\*\*/g, '')  // Remove bold markers
        .replace(/^#+\s*/, '') // Remove markdown headers
        .replace(/^\s*[-•*]\s*/, '- ') // Normalize bullet points
        // Normalize "Name: Status" → "Name Status" (Gemini grounding uses colons)
        .replace(/:\s+(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i, ' $1')
        // Normalize "(Status)" → "Status" (Gemini grounding wraps status in parentheses)
        .replace(/\((Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\)/gi, '$1')
        .trim();

      // Skip lines that indicate no injuries
      const lowerLine = cleanLine.toLowerCase();
      if (lowerLine.includes('none reported') || lowerLine.includes('no injuries') ||
          lowerLine === 'none' || lowerLine === 'n/a' || lowerLine.includes('fully healthy')) {
        return false;
      }

      const patterns = [
        // Simple strict format: FirstName LastName Status (from strict query format - prioritize this)
        /^([A-Z][a-z'.-]+\s+[A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)?)\s+(Out|GTD|Ques|Questionable|Doubtful|Prob|Probable)\s*$/i,
        // Rotowire format: Position Initial. LastName Status (e.g., "C S. Adams Out", "G F. VanVleet Out")
        /[PGCSF]+\s+([A-Z]\.\s*[A-Z][a-z'.-]+)\s+(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // Rotowire format with full position: PG/SG/SF/PF/C Initial. LastName Status
        /(?:PG|SG|SF|PF|C|G|F)\s+([A-Z]\.\s*[A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)?)\s+(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // Full name with position in parens: Steven Adams (C) - Out
        /([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)\s*\([PGCSF]+\)\s*[-–:]\s*(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // Triple Pipe (New): - Name | Status | Duration
        /[-•*]\s*([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)\s*\|\s*(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\s*\|\s*([^|\n]+)/i,
        // Standard: - Name (Pos) - Status
        /[-•*]\s*([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)\s*(?:\([^)]+\))?\s*[-–:|]\s*(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // Status First: - Status: Name
        /[-•*]\s*(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\s*[:]\s*([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)/i,
        // Pipe format: - Name | Status: Status
        /[-•*]\s*([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)\s*\|\s*Status:\s*(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // Simple Pipe: Name | Status
        /([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)\s*\|\s*(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // No bullet: Name (Pos) Status
        /([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)\s*(?:\([^)]+\))?\s+(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // Markdown style: Name - Status (reason)
        /([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)\s*[-–]\s*(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // Simple: Initial. LastName Status (no position prefix)
        /([A-Z]\.\s*[A-Z][a-z'.-]+)\s+(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // "Name is out" format
        /([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)\s+is\s+(out|questionable|probable|doubtful)\b/i
      ];

      for (const pattern of patterns) {
        const match = cleanLine.match(pattern);
        if (match) {
          // Special handling for triple pipe to capture duration context
          if (pattern.source.includes('\\|\\s*([^|\\n]+)')) {
            addParsedInjury(team, match[1], match[2], line);
          } else if (pattern.source.startsWith('[-•*]\\s*(Out|Ques')) {
            addParsedInjury(team, match[2], match[1], line);
          } else {
            addParsedInjury(team, match[1], match[2], line);
          }
          return true;
        }
      }
      return false;
    };

    let currentTeam = null;
    let inMayNotPlaySection = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const lower = line.toLowerCase();
      const cleanLower = lower.replace(/\*\*/g, '').replace(/^[=#]+\s*/, '').replace(/\s*[=#]+$/, '').trim();

      // Check for team header (=== Team Name ===)
      if (isTeamHeader(lower, awayLower)) {
        currentTeam = 'away';
        inMayNotPlaySection = false; // Reset section flag for new team
        continue;
      }
      if (isTeamHeader(lower, homeLower)) {
        currentTeam = 'home';
        inMayNotPlaySection = false; // Reset section flag for new team
        continue;
      }

      // Check for MAY NOT PLAY / INJURIES section header
      // Only match short lines (actual headers like "### 1. INJURIES / MAY NOT PLAY", not sentences)
      if (cleanLower.length < 60 && (cleanLower.includes('may not play') || cleanLower.includes('injuries') || cleanLower === 'injuries:')) {
        inMayNotPlaySection = true;
        continue;
      }

      // Check for EXPECTED LINEUP section header (stop parsing injuries)
      // Only match short lines — long sentences mentioning "starting lineup" are descriptions, not headers
      if (cleanLower.length < 60 && (cleanLower.includes('expected lineup') || cleanLower.includes('starting lineup'))) {
        inMayNotPlaySection = false;
        continue;
      }

      // Only parse injury lines when we're in the MAY NOT PLAY section
      if (currentTeam && inMayNotPlaySection) {
        parseInjuryLine(line, currentTeam);
      }
    }

    return result;
  };

  if (sport === 'NBA' || sport === 'basketball_nba') {
    const strictNba = parseNbaMayNotPlay();
    if (strictNba.home.length || strictNba.away.length) {
      injuries.home = strictNba.home;
      injuries.away = strictNba.away;
      return injuries;
    }
  }

  // NHL-specific: Parse injury sections from Gemini markdown format
  // Handles formats like: **Hampus Lindholm (D) - OUT** or * Player Name - IR
  const parseNhlInjuries = () => {
    const result = { home: [], away: [] };
    if (!content) return result;

    const lines = content.split('\n');
    const homeLower = homeTeam.toLowerCase();
    const awayLower = awayTeam.toLowerCase();
    const foundPlayers = new Set();

    let currentTeam = null;
    let inInjurySection = false;

    // Detect injury section headers or team-specific sections
    const isInjurySectionStart = (lineLower) => {
      return lineLower.includes('injuries') || 
             lineLower.includes('injury report') ||
             lineLower.includes('injured') ||
             (lineLower.includes('out') && (lineLower.includes('list') || lineLower.includes('report')));
    };

    // Detect team headers like **Boston Bruins** or "Boston Bruins:"
    const isTeamHeader = (lineLower, teamLower) => {
      // Must contain the team name
      if (!lineLower.includes(teamLower)) return false;
      // Must be a header-style line (markdown bold, colon ending, or standalone team name)
      return lineLower.includes('**') || 
             lineLower.endsWith(':') || 
             lineLower.trim() === teamLower ||
             /^\s*[-*•]?\s*\*?\*?[^*]*\*?\*?\s*:?\s*$/.test(lineLower);
    };

    const shouldStopSection = (lineLower) => {
      // Stop if we hit a clearly different section
      return (lineLower.includes('goalie') && !lineLower.includes('injur')) ||
             (lineLower.includes('starting lineup') && !lineLower.includes('injur')) ||
             (lineLower.includes('power play') && !lineLower.includes('injur')) ||
             lineLower.includes('### 2.') ||  // Markdown section number change
             lineLower.includes('### 3.') ||
             lineLower.includes('line combinations') ||
             lineLower.includes('confirmed starters');
    };

    const addInjury = (team, playerName, status) => {
      if (!playerName || playerName.length < 3 || playerName.length > 35) return;
      
      // Clean markdown formatting
      playerName = playerName.replace(/\*+/g, '').trim();
      
      // Skip common false positives
      const skipWords = ['injuries', 'injury', 'team', 'roster', 'report', 'status', 'update', 'expected', 'confirmed', 'none', 'n/a'];
      if (skipWords.some(w => playerName.toLowerCase() === w || playerName.toLowerCase().includes('listed'))) return;
      
      // Skip if already found
      const key = playerName.toLowerCase();
      if (foundPlayers.has(key)) return;
      foundPlayers.add(key);

      // Normalize status - keep DTD visible as it's an uncertain status
      let normalizedStatus = (status || 'OUT').toUpperCase();
      if (normalizedStatus.includes('IR-LT') || normalizedStatus.includes('LTIR') || normalizedStatus.includes('LONG TERM')) normalizedStatus = 'IR-LT';
      else if (normalizedStatus === 'IR' || normalizedStatus.includes('INJURED RESERVE')) normalizedStatus = 'IR';
      else if (normalizedStatus.includes('DAY-TO-DAY') || normalizedStatus.includes('DAY TO DAY') || normalizedStatus === 'DTD') normalizedStatus = 'DTD';
      else if (normalizedStatus.includes('PROB')) normalizedStatus = 'Probable';
      else if (normalizedStatus.includes('QUES')) normalizedStatus = 'Questionable';
      else if (normalizedStatus.includes('DOUBT')) normalizedStatus = 'Doubtful';
      else if (normalizedStatus.includes('OUT') || normalizedStatus === 'O') normalizedStatus = 'OUT';
      else normalizedStatus = status; // Preserve original if unknown

      const nameParts = playerName.split(' ');
      result[team].push({
        player: {
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' '),
          position: ''
        },
        status: normalizedStatus,
        source: 'rotowire'
      });
      console.log(`[Scout Report] NHL parser: Found ${playerName} (${normalizedStatus}) for ${team}`);
    };

    // Common status pattern for all line parsers
    const lineStatusPattern = 'OUT|IR|IR-LT|DTD|DAY-TO-DAY|LTIR|Probable|Questionable|Doubtful';
    
    const parseNhlInjuryLine = (line, team) => {
      // Pattern 1: **Name (D)** - OUT (most common narrative format - bold closes after position)
      const narrativePattern = new RegExp(`\\*\\*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\(([A-Z]{1,2})\\)\\*\\*\\s*[-–]\\s*(${lineStatusPattern})`, 'i');
      let match = line.match(narrativePattern);
      if (match) {
        addInjury(team, match[1], match[3]);
        return true;
      }

      // Pattern 2: **Name (D) - OUT** (bold includes status)
      const markdownPattern = new RegExp(`\\*\\*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\(([A-Z]{1,2})\\)\\s*[-–]\\s*(${lineStatusPattern})\\*\\*`, 'i');
      match = line.match(markdownPattern);
      if (match) {
        addInjury(team, match[1], match[3]);
        return true;
      }

      // Pattern 3: **Player Name** - OUT (no position)
      const simpleBoldPattern = new RegExp(`\\*\\*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\*\\*\\s*[-–]\\s*(${lineStatusPattern})`, 'i');
      match = line.match(simpleBoldPattern);
      if (match) {
        addInjury(team, match[1], match[2]);
        return true;
      }

      // Pattern 4: Pipe format - Player Name | Position | Status
      const pipePattern = new RegExp(`[-•*]?\\s*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\|\\s*(?:([A-Z]{1,3})\\s*\\|)?\\s*(${lineStatusPattern})`, 'i');
      match = line.match(pipePattern);
      if (match) {
        addInjury(team, match[1], match[3]);
        return true;
      }

      // Pattern 5: Player Name (D) - OUT (plain text with position)
      const positionPattern = new RegExp(`([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\([A-Z]{1,2}\\)\\s*[-–]\\s*(${lineStatusPattern})`, 'i');
      match = line.match(positionPattern);
      if (match) {
        addInjury(team, match[1], match[2]);
        return true;
      }

      // Pattern 6: Player Name - OUT (simple dash format)
      const dashPattern = new RegExp(`[-•*]?\\s*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*[-–]\\s*(${lineStatusPattern})\\b`, 'i');
      match = line.match(dashPattern);
      if (match) {
        addInjury(team, match[1], match[2]);
        return true;
      }

      // Pattern 7: Status: Player Name
      const statusFirstPattern = new RegExp(`(${lineStatusPattern})\\s*[-–:]\\s*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)`, 'i');
      match = line.match(statusFirstPattern);
      if (match) {
        addInjury(team, match[2], match[1]);
        return true;
      }

      return false;
    };

    // First pass: look for injury section with team subsections
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const lower = line.toLowerCase();

      // Check for injury section start
      if (isInjurySectionStart(lower)) {
        inInjurySection = true;
        continue;
      }

      // Check for team headers within injury section
      if (inInjurySection) {
        if (isTeamHeader(lower, awayLower)) {
          currentTeam = 'away';
          continue;
        }
        if (isTeamHeader(lower, homeLower)) {
          currentTeam = 'home';
          continue;
        }

        // Check if we should stop the injury section entirely
        if (shouldStopSection(lower)) {
          if (!lower.includes(homeLower) && !lower.includes(awayLower)) {
            inInjurySection = false;
            currentTeam = null;
          }
          continue;
        }

        // Parse injury lines if we have a current team
        if (currentTeam) {
          parseNhlInjuryLine(line, currentTeam);
        }
      }
    }

    // Second pass: ALWAYS run flexible parsing to supplement line-by-line results
    // This catches injuries that might be on a single line or in unusual formatting
    console.log('[Scout Report] NHL parser: Running flexible full-text parsing');

    const fullText = content;

    // Multiple patterns to catch all injury formats in full text
    // Status options: OUT, IR, IR-LT, IR-NR, DTD, DAY-TO-DAY, LTIR, Probable, Questionable, Doubtful
    const statusPattern = 'OUT|IR-LT|IR-NR|IR|DTD|DAY-TO-DAY|LTIR|Probable|Questionable|Doubtful';

    // ROTOWIRE EXACT FORMAT PATTERN - CRITICAL!
    // RotoWire shows injuries as: "D Ryan Ellis IR" or "LW K. Marchenko DTD"
    // Format: [Position] [Name] [Status] - can be on SAME LINE (space-separated)
    // IMPORTANT: NO ^ or $ anchors - grounding often returns multiple injuries on one line
    // Example: "D Ryan Ellis IR D Shea Weber IR-LT" - must match BOTH
    // Also captures optional duration info after status (e.g., "| since Nov 15, missed 20 games")
    const rotoWirePattern = /\b([CLDRGW]{1,2})\s+([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)*)\s+(IR-LT|IR-NR|IR|OUT|DTD|LTIR)\b(?:\s*\|?\s*([^|D\n]{5,50}))?/gi;

    // First, try RotoWire exact format (highest priority)
    const rotoWireMatches = [...fullText.matchAll(rotoWirePattern)];
    for (const match of rotoWireMatches) {
      const position = match[1];
      const playerName = match[2];
      const status = match[3];
      const durationText = match[4]?.trim() || '';

      // Find team context by looking back
      const matchIndex = match.index;
      const contextStart = Math.max(0, matchIndex - 500);
      const context = fullText.substring(contextStart, matchIndex).toLowerCase();

      let team = null;
      const homeIdx = context.lastIndexOf(homeLower);
      const awayIdx = context.lastIndexOf(awayLower);

      if (homeIdx > awayIdx && homeIdx !== -1) {
        team = 'home';
      } else if (awayIdx > homeIdx && awayIdx !== -1) {
        team = 'away';
      }

      if (team && playerName) {
        // Extract duration info if present
        let daysSinceOut = null;
        let outSinceStr = null;

        if (durationText) {
          // Parse "since [date]" or "missed X games" from duration text
          const sinceMatch = durationText.match(/since\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[.\s]*(\d{1,2})?/i);
          const missedMatch = durationText.match(/missed\s+(\d+)/i);
          const seasonMatch = durationText.match(/season[-\s]?long|out\s+for\s+(the\s+)?season/i);

          if (sinceMatch) {
            const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
            const monthNum = monthMap[sinceMatch[1].toLowerCase()];
            const day = sinceMatch[2] ? parseInt(sinceMatch[2], 10) : 1;
            const now = new Date();
            let year = now.getFullYear();
            if (monthNum > now.getMonth()) year -= 1;
            const outDate = new Date(year, monthNum, day);
            daysSinceOut = Math.floor((now - outDate) / (1000 * 60 * 60 * 24));
            outSinceStr = outDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            console.log(`[Scout Report] NHL duration parsed: ${playerName} out since ${outSinceStr} (${daysSinceOut} days)`);
          } else if (missedMatch) {
            const games = parseInt(missedMatch[1], 10);
            daysSinceOut = Math.round(games * 2.5); // ~2.5 days per NHL game
            console.log(`[Scout Report] NHL duration parsed: ${playerName} missed ${games} games (~${daysSinceOut} days)`);
          } else if (seasonMatch) {
            daysSinceOut = 120; // Season-long = ~4 months
            console.log(`[Scout Report] NHL duration parsed: ${playerName} season-long injury`);
          }
        }

        console.log(`[Scout Report] NHL RotoWire format found: ${position} ${playerName} ${status} -> ${team}${daysSinceOut ? ` (${daysSinceOut} days out)` : ''}`);

        // Add injury with duration info
        const nameParts = playerName.trim().split(/\s+/);
        const normalizedStatus = normalizeStatus(status);
        result[team].push({
          player: {
            first_name: nameParts[0],
            last_name: nameParts.slice(1).join(' '),
            position: position
          },
          status: normalizedStatus,
          daysSinceReport: daysSinceOut,
          reportDateStr: outSinceStr,
          duration: daysSinceOut > 45 ? 'SEASON-LONG' : daysSinceOut > 21 ? 'MID-SEASON' : daysSinceOut > 3 ? 'EXTENDED' : 'RECENT',
          source: 'rotowire'
        });
      }
    }

    // If RotoWire format found injuries, return early
    if (result.home.length > 0 || result.away.length > 0) {
      console.log(`[Scout Report] NHL RotoWire parser found: ${result.home.length} home, ${result.away.length} away injuries`);
      return result;
    }

    const flexiblePatterns = [
      // Pattern A: **Name (D)** - OUT (markdown bold closes AFTER position, status is outside)
      // This is the most common narrative format: **Hampus Lindholm (D)** - OUT - details
      new RegExp(`\\*\\*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\(([A-Z]{1,2})\\)\\*\\*\\s*[-–]\\s*(${statusPattern})`, 'gi'),
      // Pattern B: **Name (D) - OUT** (markdown bold includes status)
      new RegExp(`\\*\\*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\(([A-Z]{1,2})\\)\\s*[-–]\\s*(${statusPattern})\\*\\*`, 'gi'),
      // Pattern C: Asterisk bullets - *   **Player Name (D)** - OUT
      new RegExp(`\\*\\s+\\*\\*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\(([A-Z]{1,2})\\)\\*\\*\\s*[-–]\\s*(${statusPattern})`, 'gi'),
      // Pattern D: Simple markdown - **Player Name** - OUT
      new RegExp(`\\*\\*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\*\\*\\s*[-–]\\s*(${statusPattern})`, 'gi'),
      // Pattern E: Plain text with position - Player Name (D) - OUT
      new RegExp(`([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\([A-Z]{1,2}\\)\\s*[-–]\\s*(${statusPattern})`, 'gi'),
      // Pattern F: Pipe format - Name | Position | Status
      new RegExp(`[-•*]?\\s*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\|\\s*([A-Z]{1,3})\\s*\\|\\s*(${statusPattern})`, 'gi'),
      // Pattern G: Name - Status (no position)
      new RegExp(`[-•*]?\\s*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*[-–]\\s*(${statusPattern})\\b`, 'gi')
    ];
    
    for (const pattern of flexiblePatterns) {
      pattern.lastIndex = 0; // Reset regex state
      const matches = [...fullText.matchAll(pattern)];
      
      for (const match of matches) {
        // Determine which capture group has the player name and status
        let playerName, status;
        if (match[3]) {
          playerName = match[1];
          status = match[3];
        } else {
          playerName = match[1];
          status = match[2];
        }
        
        const matchIndex = match.index;
        
        // Look back ~300 chars to find team context
        const contextStart = Math.max(0, matchIndex - 300);
        const context = fullText.substring(contextStart, matchIndex).toLowerCase();
        
        let team = null;
        const homeIdx = context.lastIndexOf(homeLower);
        const awayIdx = context.lastIndexOf(awayLower);
        
        if (homeIdx > awayIdx && homeIdx !== -1) {
          team = 'home';
        } else if (awayIdx > homeIdx && awayIdx !== -1) {
          team = 'away';
        }
        
        if (team && playerName) {
          addInjury(team, playerName, status);
        }
      }
    }

    console.log(`[Scout Report] NHL strict parser found: ${result.home.length} home, ${result.away.length} away injuries`);
    return result;
  };

  if (sport === 'NHL' || sport === 'icehockey_nhl') {
    const strictNhl = parseNhlInjuries();
    if (strictNhl.home.length || strictNhl.away.length) {
      injuries.home = strictNhl.home;
      injuries.away = strictNhl.away;
      console.log(`[Scout Report] NHL strict parser found: ${strictNhl.home.length} home, ${strictNhl.away.length} away injuries`);
      return injuries;
    }
    console.log(`[Scout Report] NHL strict parser found 0 injuries, falling back to generic parser`);
  }

  // NCAAB-specific parser: Handles RotoWire format "F Mookie Cook Out" or "PG John Smith OFS"
  // Format: [Position] [Name] [Status] - no separator between name and status
  const parseNcaabInjuries = () => {
    const result = { home: [], away: [], filteredLongTerm: [] };
    if (!content) return result;

    const homeLower = homeTeam.toLowerCase();
    const awayLower = awayTeam.toLowerCase();
    const foundPlayers = new Set();

    // NCAAB ROTOWIRE EXACT FORMAT PATTERN
    // Format: Position Name Status (e.g., "F Mookie Cook Out", "G John Smith GTD", "C Mike Jones OFS")
    // Positions: PG, SG, SF, PF, C, G, F
    // Status: Out, OFS (Out For Season), GTD (Game Time Decision)
    // IMPORTANT: NO separators - just space between name and status
    // IMPORTANT: NO ^ or $ anchors - grounding often returns multiple injuries on one line
    // Example: "F Mookie Cook Out F Kristers Skrinda Out F Tallis Toure Out" - must match ALL
    const ncaabRotoWirePattern = /\b(PG|SG|SF|PF|C|G|F)\s+([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)*)\s+(Out|OFS|GTD)\b/gi;

    const fullText = content;
    const matches = [...fullText.matchAll(ncaabRotoWirePattern)];

    console.log(`[Scout Report] NCAAB parser: Found ${matches.length} potential injuries in grounding response`);

    for (const match of matches) {
      const position = match[1];
      const playerName = match[2];
      const status = match[3];

      // Skip if already found
      const playerKey = playerName.toLowerCase();
      if (foundPlayers.has(playerKey)) continue;

      // Find team context by looking back from match position
      const matchIndex = match.index;
      const contextStart = Math.max(0, matchIndex - 500);
      const context = fullText.substring(contextStart, matchIndex).toLowerCase();

      let team = null;
      const homeIdx = context.lastIndexOf(homeLower);
      const awayIdx = context.lastIndexOf(awayLower);

      if (homeIdx > awayIdx && homeIdx !== -1) {
        team = 'home';
      } else if (awayIdx > homeIdx && awayIdx !== -1) {
        team = 'away';
      }

      if (team && playerName) {
        foundPlayers.add(playerKey);

        // Normalize NCAAB status
        let normalizedStatus = status.toUpperCase();
        if (normalizedStatus === 'OFS') normalizedStatus = 'Out (Season)';
        else if (normalizedStatus === 'GTD') normalizedStatus = 'GTD';
        else normalizedStatus = 'Out';

        const nameParts = playerName.trim().split(/\s+/);
        result[team].push({
          player: {
            first_name: nameParts[0],
            last_name: nameParts.slice(1).join(' '),
            position: position
          },
          status: normalizedStatus,
          source: 'rotowire'
        });
        console.log(`[Scout Report] NCAAB parser: Found ${position} ${playerName} ${status} -> ${team}`);
      }
    }

    // If RotoWire pattern didn't catch injuries, try alternate formats common in NCAAB
    // Format: "- Position Initial. LastName Status" (e.g., "- F M. Cook Out")
    if (result.home.length === 0 && result.away.length === 0) {
      const altPattern = /[-•*]\s*(PG|SG|SF|PF|C|G|F)\s+([A-Z]\.\s*[A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)?)\s+(Out|OFS|GTD)\b/gi;
      const altMatches = [...fullText.matchAll(altPattern)];

      for (const match of altMatches) {
        const position = match[1];
        const playerName = match[2].replace(/\.\s*/, '. '); // Normalize "M.Cook" to "M. Cook"
        const status = match[3];

        const playerKey = playerName.toLowerCase();
        if (foundPlayers.has(playerKey)) continue;

        const matchIndex = match.index;
        const contextStart = Math.max(0, matchIndex - 500);
        const context = fullText.substring(contextStart, matchIndex).toLowerCase();

        let team = null;
        const homeIdx = context.lastIndexOf(homeLower);
        const awayIdx = context.lastIndexOf(awayLower);

        if (homeIdx > awayIdx && homeIdx !== -1) {
          team = 'home';
        } else if (awayIdx > homeIdx && awayIdx !== -1) {
          team = 'away';
        }

        if (team && playerName) {
          foundPlayers.add(playerKey);
          let normalizedStatus = status.toUpperCase();
          if (normalizedStatus === 'OFS') normalizedStatus = 'Out (Season)';
          else if (normalizedStatus === 'GTD') normalizedStatus = 'GTD';
          else normalizedStatus = 'Out';

          const nameParts = playerName.trim().split(/\s+/);
          result[team].push({
            player: {
              first_name: nameParts[0],
              last_name: nameParts.slice(1).join(' '),
              position: position
            },
            status: normalizedStatus,
            source: 'rotowire'
          });
          console.log(`[Scout Report] NCAAB alt parser: Found ${position} ${playerName} ${status} -> ${team}`);
        }
      }
    }

    console.log(`[Scout Report] NCAAB parser found: ${result.home.length} home, ${result.away.length} away injuries`);
    return result;
  };

  if (sport === 'NCAAB' || sport === 'basketball_ncaab') {
    const strictNcaab = parseNcaabInjuries();
    if (strictNcaab.home.length || strictNcaab.away.length) {
      injuries.home = strictNcaab.home;
      injuries.away = strictNcaab.away;
      injuries.filteredLongTerm = strictNcaab.filteredLongTerm || [];
      return injuries;
    }
    console.log(`[Scout Report] NCAAB strict parser found 0 injuries, falling back to generic parser`);
  }

  // Split content into sections by team (pass other team to find boundary)
  const homeSection = extractTeamSection(content, homeTeam, awayTeam);
  const awaySection = extractTeamSection(content, awayTeam, homeTeam);
  
  // Extract injuries from each section with multiple pattern types
  const extractFromSection = (section, team) => {
    const found = [];
    
    // Patterns to match various injury formats
    const patterns = [
      // "Player Name - OUT - injury type" or "Player Name - IR - upper body"
      /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*[-–:]\s*(OUT|Out|IR|LTIR|Doubtful|Questionable|GTD|Day-to-Day)/gi,
      // "OUT: Player Name" or "IR: Player Name"
      /(OUT|IR|LTIR|Doubtful|Questionable|GTD)\s*[-–:]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)/gi,
      // "Player Name (OUT)" or "Player Name (IR)"
      /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*\((OUT|Out|IR|LTIR|Doubtful|Questionable|GTD|Day-to-Day|injured reserve)\)/gi,
      // "Player Name is out" or "Player Name remains out"  
      /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s+(?:is|remains|was|has been)\s+(out|on IR|on LTIR|doubtful|questionable)/gi,
      // Bullet point format: "• Player Name - Status"
      /[•\-\*]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*[-–:]\s*(OUT|Out|IR|LTIR|Doubtful|Questionable|GTD)/gi,
      // NHL specific: "Player Name (upper body)" implies IR/Out
      /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*\((upper body|lower body|illness|undisclosed)\)/gi
    ];
    
    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0; // Reset regex state
      
      while ((match = pattern.exec(section)) !== null) {
        let playerName, status;
        
        // Handle different capture group orders
        if (match[1] && /^(OUT|IR|LTIR|Doubtful|Questionable|GTD)$/i.test(match[1])) {
          // Status first, then name
          status = match[1];
          playerName = match[2];
        } else {
          // Name first, then status
          playerName = match[1];
          status = match[2] || 'Out';
        }
        
        // Clean up player name
        playerName = playerName?.trim();
        if (!playerName || playerName.length < 3) continue;
        
        // Skip common false positives
        const skipWords = ['injuries', 'injury', 'team', 'roster', 'report', 'status', 'update'];
        if (skipWords.some(w => playerName.toLowerCase().includes(w))) continue;
        
        // Prevent duplicates
        const playerKey = playerName.toLowerCase();
        if (foundPlayers.has(playerKey)) continue;
        foundPlayers.add(playerKey);
        
        const nameParts = playerName.split(' ');
        // Get surrounding context to extract duration
        const matchStart = Math.max(0, match.index - 50);
        const matchEnd = Math.min(section.length, match.index + match[0].length + 100);
        const contextText = section.substring(matchStart, matchEnd);
        const durationInfo = extractDuration(contextText);
        
        // IR status usually means long-term unless marked recent
        const normalizedStatus = normalizeStatus(status);
        if ((normalizedStatus === 'IR' || normalizedStatus === 'LTIR') && durationInfo.duration === 'UNKNOWN') {
          durationInfo.duration = 'SEASON-LONG';
          durationInfo.isEdge = false;
          durationInfo.note = 'IR = typically season-long, team adjusted';
        }
        
        found.push({
          player: {
            first_name: nameParts[0],
            last_name: nameParts.slice(1).join(' '),
            position: ''
          },
          status: normalizedStatus,
          injuryType: status.toLowerCase().includes('body') || status.toLowerCase().includes('illness') ? status : '',
          duration: durationInfo.duration,
          isEdge: durationInfo.isEdge,
          durationNote: durationInfo.note,
          reportDateStr: durationInfo.outSinceDate,
          daysSinceReport: durationInfo.daysSinceOut,
          source: 'gemini_grounding'
        });
      }
    }
    
    return found;
  };
  
  injuries.home = extractFromSection(homeSection, homeTeam);
  injuries.away = extractFromSection(awaySection, awayTeam);
  
  // If we still have no injuries, try a more aggressive whole-content search
  if (injuries.home.length === 0 && injuries.away.length === 0) {
    console.log('[Scout Report] No injuries found with section parsing, trying whole-content search');
    
    // Try to find ANY player-status pairs in the whole content
    const wholeContentPatterns = [
      /([A-Z][a-z]+\s+[A-Z][a-z']+(?:\s+[A-Z][a-z']+)?)\s*[-–:]\s*(OUT|IR|LTIR)/gi,
      /([A-Z][a-z]+\s+[A-Z][a-z']+)\s+(?:is|remains)\s+(out|on IR)/gi
    ];
    
    for (const pattern of wholeContentPatterns) {
      let match;
      pattern.lastIndex = 0;
      
      while ((match = pattern.exec(content)) !== null) {
        const playerName = match[1]?.trim();
        const status = match[2];
        
        if (!playerName || playerName.length < 3) continue;
        const playerKey = playerName.toLowerCase();
        if (foundPlayers.has(playerKey)) continue;
        foundPlayers.add(playerKey);
        
        // Try to determine which team based on context
        const contextStart = Math.max(0, match.index - 100);
        const context = content.substring(contextStart, match.index + match[0].length + 50).toLowerCase();
        
        const nameParts = playerName.split(' ');
        const injury = {
          player: { first_name: nameParts[0], last_name: nameParts.slice(1).join(' '), position: '' },
          status: normalizeStatus(status),
          source: 'gemini_grounding'
        };
        
        if (context.includes(homeTeam.toLowerCase()) || context.includes(homeTeam.split(' ').pop().toLowerCase())) {
          injuries.home.push(injury);
        } else if (context.includes(awayTeam.toLowerCase()) || context.includes(awayTeam.split(' ').pop().toLowerCase())) {
          injuries.away.push(injury);
        }
      }
    }
  }
  
  return injuries;
}

/**
 * Extract section of text related to a team's injuries
 * @param {string} content - Full text content
 * @param {string} teamName - Team to extract section for
 * @param {string} otherTeamName - The other team (to find boundary)
 */
function extractTeamSection(content, teamName, otherTeamName = '') {
  const contentLower = content.toLowerCase();
  const teamLower = teamName.toLowerCase();
  const otherTeamLower = otherTeamName.toLowerCase();
  
  // Find ALL positions where each team name appears
  const findAllPositions = (text, search) => {
    const positions = [];
    let pos = 0;
    while ((pos = text.indexOf(search, pos)) !== -1) {
      positions.push(pos);
      pos += 1;
    }
    return positions;
  };
  
  const teamPositions = findAllPositions(contentLower, teamLower);
  const otherTeamPositions = otherTeamLower ? findAllPositions(contentLower, otherTeamLower) : [];
  
  if (teamPositions.length === 0) return ''; // Team not found
  
  // Find the best position for this team's injury section
  // Prefer positions followed by injury-related content ("::", "injur", "out", "-")
  let bestTeamPos = -1;
  for (const pos of teamPositions) {
    const afterTeam = contentLower.substring(pos + teamLower.length, pos + teamLower.length + 30);
    // Look for markers that indicate this is a section header
    if (afterTeam.match(/^[^a-z]*(:|\*|injur|-)/i)) {
      bestTeamPos = pos;
      break;
    }
  }
  // Fallback to first position if no section header found
  if (bestTeamPos === -1) bestTeamPos = teamPositions[0];
  
  // Find the best position for other team's section (must be AFTER our team's section)
  let bestOtherPos = -1;
  for (const pos of otherTeamPositions) {
    if (pos <= bestTeamPos) continue; // Must be after our team's section
    const afterTeam = contentLower.substring(pos + otherTeamLower.length, pos + otherTeamLower.length + 30);
    if (afterTeam.match(/^[^a-z]*(:|\*|injur|-)/i)) {
      bestOtherPos = pos;
      break;
    }
  }
  // Fallback: first position after our team
  if (bestOtherPos === -1) {
    for (const pos of otherTeamPositions) {
      if (pos > bestTeamPos) {
        bestOtherPos = pos;
        break;
      }
    }
  }
  
  // Extract from this team's section to other team's section (or end)
  const sectionEnd = bestOtherPos !== -1 ? bestOtherPos : content.length;
  return content.substring(bestTeamPos, sectionEnd);
}


/**
 * Format comprehensive injury report - this goes at the TOP of the scout report
 * Now includes duration context to distinguish RECENT vs MID-SEASON vs SEASON-LONG
 * CRITICAL: Shows TODAY's date so Gary can understand injury relevance
 */
function formatInjuryReport(homeTeam, awayTeam, injuries, sportKey, rosterDepth = null) {
  const lines = [];

  // ADD TODAY'S DATE AT THE TOP - Gary needs this anchor to understand injury timing
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  lines.push(`TODAY'S DATE: ${todayStr}`);
  lines.push('(Use this date to understand how long each player has been out)');
  lines.push('');

  // Categorize injuries by importance/duration
  const categorize = (teamInjuries) => {
    const critical = teamInjuries.filter(i => (i.duration === 'RECENT' || i.isEdge === true) && i.status !== 'Out' && i.status !== 'OFS');
    // OFS = Out For Season (Rotowire status code)
    const out = teamInjuries.filter(i => i.status === 'Out' || i.status === 'IR' || i.status === 'LTIR' || i.status === 'OFS' || i.status === 'Injured Reserve');
    const seasonal = teamInjuries.filter(i => i.duration === 'SEASON-LONG' && i.status !== 'Out' && i.status !== 'IR' && i.status !== 'OFS' && (i.status || '').toUpperCase() !== 'GTD');
    const others = teamInjuries.filter(i =>
      !critical.includes(i) && !out.includes(i) && !seasonal.includes(i)
    );
    return { critical, out, seasonal, others };
  };

  const homeCats = categorize(injuries.home || []);
  const awayCats = categorize(injuries.away || []);

  // Build roster lookup for team-share context (NBA only, when rosterDepth available)
  const rosterUsageLookup = new Map();
  if (rosterDepth) {
    const allRosterPlayers = [...(rosterDepth.home || []), ...(rosterDepth.away || [])];
    for (const p of allRosterPlayers) {
      if (p.name && (p.pct_pts || p.pct_ast || p.pct_fga)) {
        rosterUsageLookup.set(p.name.toLowerCase().trim(), {
          pct_pts: p.pct_pts || 0,
          pct_reb: p.pct_reb || 0,
          pct_fga: p.pct_fga || 0,
          pct_ast: p.pct_ast || 0
        });
      }
    }
  }

  // Helper to find usage data for an injured player via name matching
  const getPlayerUsage = (playerName) => {
    const nameLower = (playerName || '').toLowerCase().trim();
    if (!nameLower || rosterUsageLookup.size === 0) return null;
    // Direct match first
    if (rosterUsageLookup.has(nameLower)) return rosterUsageLookup.get(nameLower);
    // Fuzzy match (handles hyphenated names etc.)
    for (const [rosterName, usage] of rosterUsageLookup) {
      if (playerNamesMatch(nameLower, rosterName)) return usage;
    }
    return null;
  };

  const formatPlayer = (i) => {
    const name = `${i.player?.first_name || i.firstName || ''} ${i.player?.last_name || i.lastName || ''}`.trim() || i.name || 'Unknown';
    const pos = i.player?.position_abbreviation || i.player?.position || i.position || '';
    const reason = i.description || i.comment || i.injury || '';
    const shortReason = reason ? ` - ${reason.split('.')[0].substring(0, 60)}` : '';

    // Build duration tag with ACTUAL DATE and days for Gary to see clearly
    let durationTag = '';
    const days = i.daysSinceReport;
    const reportDate = i.reportDateStr; // e.g., "Jan 8"

    // Show both the actual date AND days ago for maximum clarity
    let timeInfo = '';
    if (reportDate && days !== null && days !== undefined) {
      timeInfo = ` - Since ${reportDate} (${days}d)`;
    } else if (days !== null && days !== undefined) {
      timeInfo = ` (${days}d)`;
    } else if (reportDate) {
      timeInfo = ` - Since ${reportDate}`;
    }

    // Factual duration labels — no prescriptive conclusions about edges or pricing
    // GTD checked FIRST — a GTD player might return regardless of how long they were out
    if (i.status?.toUpperCase() === 'GTD') {
      const durationContext = days ? ` - was out ${days}d` : '';
      durationTag = ` [GTD${durationContext}]`;
    } else if (i.duration === 'SEASON-LONG' || i.status === 'Injured Reserve' || i.status === 'IR' || i.status === 'LTIR' || i.status === 'OFS') {
      durationTag = ` [Out For Season${timeInfo}]`;
    } else if (i.duration === 'MID-SEASON') {
      durationTag = ` [OUT${timeInfo}]`;
    } else if (i.duration === 'RECENT') {
      durationTag = ` [RECENT${timeInfo}]`;
    } else if (days !== null && days !== undefined) {
      // Has timing info but no duration category
      durationTag = ` [OUT${timeInfo}]`;
    }

    if (!durationTag && (i.status === 'IR' || i.status === 'Injured Reserve' || i.status === 'LTIR' || i.status === 'OFS' ||
        (i.description && i.description.toLowerCase().includes('injured reserve')))) {
      durationTag = ' [Out For Season]';
    }

    // Fallback: no duration info resolved
    if (!durationTag && !reportDate && days === null) {
      durationTag = ' [OUT - duration unknown]';
    }

    let result = `  • ${name}${pos ? ` (${pos})` : ''} (${i.status || 'Unknown'})${shortReason}${durationTag}`;

    // Add team-share context for OUT/DOUBTFUL players (NBA only)
    // Shows what % of team production is missing — helps Gary assess line adjustment
    const statusUp = (i.status || '').toUpperCase();
    const isOut = statusUp.includes('OUT') || statusUp === 'IR' || statusUp === 'LTIR' || statusUp === 'OFS' || statusUp === 'DOUBTFUL';
    if (isOut) {
      const usage = getPlayerUsage(name);
      if (usage && (usage.pct_pts > 0.05 || usage.pct_ast > 0.05)) {
        const shareParts = [];
        if (usage.pct_pts) shareParts.push(`${(usage.pct_pts * 100).toFixed(1)}% PTS`);
        if (usage.pct_reb) shareParts.push(`${(usage.pct_reb * 100).toFixed(1)}% REB`);
        if (usage.pct_fga) shareParts.push(`${(usage.pct_fga * 100).toFixed(1)}% FGA`);
        result += `\n      Team Share: ${shareParts.join(' | ')}`;
      }
    }

    return result;
  };

  const renderTeam = (teamName, cats, locationTag) => {
    lines.push(`${locationTag} ${teamName}:`);

    // AWARENESS, NOT FILTERING: Show ALL injuries with context
    // Gary decides the significance based on duration context

    if (cats.critical.length > 0) {
      lines.push(`  RECENT:`);
      cats.critical.forEach(i => lines.push(formatPlayer(i)));
    }

    // Show ALL out players, categorized by recency
    const recentOut = cats.out.filter(i => i.duration === 'RECENT' || i.isEdge === true);
    const midSeasonOut = cats.out.filter(i => i.duration === 'MID-SEASON');
    // OFS = Out For Season (Rotowire status code)
    const seasonLongOut = cats.out.filter(i =>
      i.duration === 'SEASON-LONG' || i.status === 'IR' || i.status === 'LTIR' || i.status === 'OFS' || i.status === 'Injured Reserve'
    );
    const unknownOut = cats.out.filter(i =>
      !recentOut.includes(i) && !midSeasonOut.includes(i) && !seasonLongOut.includes(i)
    );

    if (recentOut.length > 0) {
      lines.push(`  RECENT OUT:`);
      recentOut.forEach(i => lines.push(formatPlayer(i)));
    }

    if (midSeasonOut.length > 0) {
      lines.push(`  OUT (mid-season):`);
      midSeasonOut.forEach(i => lines.push(formatPlayer(i)));
    }

    if (seasonLongOut.length > 0) {
      lines.push(`  Out For Season:`);
      seasonLongOut.forEach(i => lines.push(formatPlayer(i)));
    }

    if (unknownOut.length > 0) {
      lines.push(`  OUT (duration unknown):`);
      unknownOut.forEach(i => lines.push(formatPlayer(i)));
    }

    if (cats.others.length > 0) {
      lines.push(`  QUESTIONABLE / GTD:`);
      cats.others.forEach(i => lines.push(formatPlayer(i)));
    }

    if (cats.seasonal.length > 0) {
      lines.push(`  Out For Season (extended):`);
      cats.seasonal.forEach(i => lines.push(formatPlayer(i)));
    }

    if (!cats.critical.length && !cats.out.length && !cats.others.length && !cats.seasonal.length) {
      lines.push(`  No injuries reported`);
    }
    lines.push('');

    return []; // No longer filtering - returning empty array for compatibility
  };

  renderTeam(homeTeam, homeCats, '[HOME]');
  renderTeam(awayTeam, awayCats, '[AWAY]');

  // Injury context — factual timing info, Gary's constitution teaches the framework
  lines.push('<injury_context>');
  lines.push('INJURY TIMING CONTEXT');
  lines.push('');
  lines.push('The injuries above include duration tags showing when each player last played.');
  lines.push('Consider how long each absence has been when evaluating the current spread.');
  lines.push('');
  lines.push('Key questions to ask yourself:');
  lines.push('  - How long has each player been out? What does the team look like without them?');
  lines.push('  - Has the line already moved to reflect these absences?');
  lines.push('  - For recent absences: Has the market had time to fully adjust?');
  lines.push('  - For long absences: Do the team\'s current stats already reflect this roster?');
  lines.push('  - For Questionable/GTD players in the lineup: What do their recent stats show?');
  lines.push('');
  lines.push('Investigate: What does the current roster\'s performance data tell you about this spread?');
  lines.push('</injury_context>');
  lines.push('');

  return lines.join('\n');
}

/**
 * Format starting lineups for the scout report
 */
function formatStartingLineups(homeTeam, awayTeam, lineups) {
  if (!lineups || (!lineups.home?.length && !lineups.away?.length)) return '';

  const lines = ['STARTING LINEUPS (PROBABLE/CONFIRMED)'];
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (lineups.away?.length) {
    lines.push(`[AWAY] ${awayTeam}: ${lineups.away.map(p => `${p.name}${p.position ? ` (${p.position})` : ''}`).join(', ')}`);
  }
  
  if (lineups.home?.length) {
    lines.push(`[HOME] ${homeTeam}: ${lineups.home.map(p => `${p.name}${p.position ? ` (${p.position})` : ''}`).join(', ')}`);
  }
  
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

/**
 * Format situational factors with sport-specific nuances
 */
function formatSituationalFactors(game, injuries, sport) {
  const factors = [];
  const sportKey = normalizeSport(sport);
  
  // Injuries — include NCAAB statuses (Out (Season), GTD) alongside standard ones
  const relevantStatuses = ['Out', 'Doubtful', 'Questionable', 'Out (Season)', 'GTD', 'IR', 'LTIR'];
  const homeInjuries = injuries.home?.filter(i => relevantStatuses.some(s => i.status?.includes(s)));
  const awayInjuries = injuries.away?.filter(i => relevantStatuses.some(s => i.status?.includes(s)));
  
  // Helper to format injury with factual duration tag
  const formatInjuryWithFreshness = (i) => {
    let tag = '';
    const days = i.daysSinceReport;
    const dateStr = i.reportDateStr;
    const timeInfo = dateStr && days ? ` - since ${dateStr} (${days}d)` : dateStr ? ` - since ${dateStr}` : days ? ` (${days}d)` : '';

    if (i.status === 'GTD') {
      // GTD overrides duration — player might return regardless of how long they were out
      const durationContext = days ? ` - was out ${days}d` : '';
      tag = ` [GTD${durationContext}]`;
    } else if (i.duration === 'SEASON-LONG' || i.status === 'IR' || i.status === 'LTIR' || i.status === 'Out (Season)') {
      tag = ` [Out For Season${timeInfo}]`;
    } else if (i.duration === 'RECENT') {
      tag = ` [RECENT${timeInfo}]`;
    } else if (i.duration === 'MID-SEASON') {
      tag = ` [OUT${timeInfo}]`;
    } else if (timeInfo) {
      tag = ` [OUT${timeInfo}]`;
    }
    // Add freshnessTip for NCAAB injuries (from RotoWire parsing)
    const tip = i.freshnessTip ? `\n    → ${i.freshnessTip}` : '';
    return `${i.player?.first_name} ${i.player?.last_name}: ${i.status}${tag}${tip}`;
  };

  if (homeInjuries?.length > 0) {
    const injuryList = homeInjuries.slice(0, 5).map(formatInjuryWithFreshness).join('\n  ');
    factors.push(`• ${game.home_team} Injuries:\n  ${injuryList}`);
  }

  if (awayInjuries?.length > 0) {
    const injuryList = awayInjuries.slice(0, 5).map(formatInjuryWithFreshness).join('\n  ');
    factors.push(`• ${game.away_team} Injuries:\n  ${injuryList}`);
  }
  
  // Rest situation (if available)
  if (game.home_rest_days !== undefined) {
    factors.push(`• Rest: ${game.home_team} (${game.home_rest_days} days) vs ${game.away_team} (${game.away_rest_days} days)`);
  }
  
  // Week info for NFL/NCAAF
  if (game.week && (sport === 'NFL' || sport === 'NCAAF' || sportKey === 'americanfootball_nfl' || sportKey === 'americanfootball_ncaaf')) {
    const fallbackSeason = nflSeason();
    factors.push(`• Week ${game.week} of the ${game.season || fallbackSeason} season`);
  }
  
  // Venue
  if (game.venue) {
    factors.push(`• Venue: ${game.venue}`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SPORT-SPECIFIC SHARP FACTORS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // NCAAF: CFP & Rematch factors
  if (sportKey === 'americanfootball_ncaaf') {
    factors.push('');
    factors.push('NCAAF SHARP NOTES:');
    factors.push('• QB STATUS: Verify starting QB for both teams. If a backup is starting, investigate the team\'s stats with and without the starter.');
    
    // CFP-specific context (Dec-Jan games)
    const currentMonth = new Date().getMonth(); // 0-indexed
    const isCFPSeason = currentMonth === 11 || currentMonth === 0; // Dec or Jan
    if (isCFPSeason) {
      factors.push('');
      factors.push('CFP PLAYOFF CONTEXT (12-TEAM ERA):');
      factors.push('• FIRST ROUND: On-campus game at higher seed — investigate the home field data and what it reveals about this matchup');
      factors.push('• RANKED vs RANKED: Investigate what the data shows about ranked matchups — what does it reveal?');
      factors.push('• REMATCH: If teams played earlier this season, investigate what adjustments may have been made since');
      factors.push('• REST vs RHYTHM: Investigate how the bye has affected each team — what does the data show?');
      factors.push('• COACHING: Check if any coach has accepted another job or if there are portal/transfer dynamics');
    } else {
      factors.push('• REMATCH: If teams played earlier this season, investigate what adjustments may have been made since');
    }
    
    factors.push('• PORTAL DEPTH: Investigate whether transfer portal additions affect depth and late-game performance for either team');
  }
  
  // NHL: Goalie & fatigue factors
  if (sportKey === 'icehockey_nhl') {
    factors.push('');
    factors.push('NHL CONTEXT NOTES:');
    factors.push('• GOALIE MATCHUP: Investigate who is starting for BOTH teams — what does the starter situation reveal?');
    factors.push('• BACK-TO-BACK: Investigate the schedule situation for both teams — what does the data show?');
    factors.push('• HIGH-DANGER CHANCES (HDC): Investigate each team\'s HDC generation vs conversion — what does the process vs results gap reveal?');
    factors.push('• GSAx (Goals Saved Above Expected): Investigate GSAx for both goalies — what does it reveal beyond raw SV%?');
    
    // Check for goalie injuries
    const goalieInjuries = [...(homeInjuries || []), ...(awayInjuries || [])].filter(i => 
      i.player?.position?.toLowerCase() === 'g' || i.player?.position?.toLowerCase() === 'goalie'
    );
    if (goalieInjuries.length > 0) {
      factors.push(`• GOALIE ALERT: ${goalieInjuries.map(i => `${i.player?.last_name} (${i.status})`).join(', ')}`);
    }
  }
  
  // NCAAB: Investigation prompts (Socratic - Layer 2 only, NCAAB-specific)
  if (sportKey === 'basketball_ncaab') {
    factors.push('');
    factors.push('NCAAB INVESTIGATION PROMPTS:');
    factors.push('• Ask: What does the tempo differential reveal about this matchup? Who controls pace?');
    factors.push('• Ask: What do the home/away splits reveal about each team in this venue context?');
    factors.push('• Ask: Has L5 form diverged from season averages? If so, is it a structural change or shooting variance?');
    factors.push('• Ask: Is there a rebounding gap? Compare ORB/g vs DRB/g from the Four Factors for both teams.');
    factors.push('• Ask: What does the rotation depth look like for each team? How might that factor into this game?');
    factors.push('• Ask: What factors explain WHY the spread is set at this number? What is the market pricing in beyond raw team quality?');
  }
  
  // NFL: Rest & EPA factors
  if (sportKey === 'americanfootball_nfl') {
    factors.push('');
    factors.push('NFL CONTEXT NOTES:');
    factors.push('• REST DISPARITY: Investigate the rest situation for both teams — what does the data show?');
    factors.push('• EPA vs RECORD: Investigate how each team\'s EPA compares to their record — what does that reveal?');
    factors.push('• LATE-GAME PERFORMANCE: Investigate how each team performs in close games and late-game situations');
    factors.push('• WEATHER: Investigate weather conditions and how they may affect each team\'s offensive approach');
  }
  
  if (factors.length === 0) {
    factors.push('• No significant situational factors identified');
  }
  
  return factors.join('\n');
}

/**
 * Format odds for display
 * @param {Object} game - Game data with odds
 * @param {string} sport - Sport key (e.g., 'icehockey_nhl')
 */
function formatOdds(game, sport = '') {
  const lines = [];
  const isNHL = sport === 'icehockey_nhl' || sport === 'NHL';

  // Spread - SKIP FOR NHL (NHL is moneyline only, no puck lines)
  let spreadValue = null;
  let spreadOdds = null;
  if (isNHL) {
    lines.push('NHL IS MONEYLINE ONLY - No puck lines, no spreads');
    spreadValue = null; // Explicitly null for NHL
    spreadOdds = null;
  } else if (game.spread_home !== undefined && game.spread_home !== null) {
    const homeSpread = parseFloat(game.spread_home);
    const awaySpread = -homeSpread;
    spreadValue = homeSpread;
    spreadOdds = game.spread_home_odds || game.spread_odds || null;
    // Always present away @ home convention for deterministic data presentation
    lines.push(`Spread: ${game.away_team} ${awaySpread > 0 ? '+' : ''}${awaySpread.toFixed(1)} | ${game.home_team} ${homeSpread > 0 ? '+' : ''}${homeSpread.toFixed(1)} (${spreadOdds})`);
  } else if (game.spreads) {
    lines.push(`Spread: ${game.spreads}`);
  } else {
    lines.push('Spread: Not available');
  }

  // Moneyline
  let mlHome = null;
  let mlAway = null;
  if (game.moneyline_home !== undefined && game.moneyline_away !== undefined) {
    mlHome = game.moneyline_home;
    mlAway = game.moneyline_away;
    lines.push(`Moneyline: ${game.away_team} ${formatMoneyline(mlAway)} | ${game.home_team} ${formatMoneyline(mlHome)}`);
  } else if (game.h2h) {
    lines.push(`Moneyline: ${game.h2h}`);
  }

  // Total - parse for database storage but do NOT display to Gary
  let totalValue = null;
  if (game.total !== undefined && game.total !== null) {
    totalValue = parseFloat(game.total);
  }

  // Add raw values for Gary to include in JSON output
  lines.push('');
  if (isNHL) {
    lines.push('RAW ODDS VALUES (NHL - MONEYLINE ONLY):');
    lines.push('  spread: null  ← NHL does not use puck lines');
    lines.push('  spreadOdds: null');
  } else {
    lines.push('RAW ODDS VALUES (copy these to your JSON output):');
    lines.push(`  spread: ${spreadValue !== null ? spreadValue : 'null'}`);
    lines.push(`  spreadOdds: ${spreadOdds}`);
  }
  lines.push(`  moneylineHome: ${mlHome !== null ? mlHome : 'null'}`);
  lines.push(`  moneylineAway: ${mlAway !== null ? mlAway : 'null'}`);

  return lines.join('\n') || 'Odds not available';
}

/**
 * Format sportsbook odds comparison for scout report
 * Shows lines from multiple books so Gary can reference the best available line
 */
function formatSportsbookComparison(oddsArray, homeTeam, awayTeam) {
  if (!Array.isArray(oddsArray) || oddsArray.length === 0) return '';

  const fmtSpread = (v) => v != null ? (v > 0 ? `+${v}` : `${v}`) : '-';
  const fmtML = (v) => v != null ? (Number(v) > 0 ? `+${v}` : `${v}`) : '-';

  const lines = [
    '',
    'SPORTSBOOK LINE COMPARISON (Shop for Best Line):',
    '---------------------------------------------------'
  ];
  for (const book of oddsArray.slice(0, 8)) {
    const away = `${fmtSpread(book.spread_away)} (${book.spread_away_odds || '-'}) | ML ${fmtML(book.ml_away)}`;
    const home = `${fmtSpread(book.spread_home)} (${book.spread_home_odds || '-'}) | ML ${fmtML(book.ml_home)}`;
    lines.push(`  ${(book.displayName || book.vendor || '?').padEnd(12)} ${awayTeam}: ${away}  |  ${homeTeam}: ${home}`);
  }
  lines.push('---------------------------------------------------');
  lines.push('Use the BEST available line for your pick (most favorable spread/odds).');
  lines.push('');
  return lines.join('\n');
}

/**
 * Format moneyline number
 */
function formatMoneyline(ml) {
  const num = parseFloat(ml);
  return num > 0 ? `+${num}` : num.toString();
}

/**
 * Convert sport to BDL API key
 */
function sportToBdlKey(sport) {
  const mapping = {
    'NBA': 'basketball_nba',
    'NFL': 'americanfootball_nfl',
    'NCAAB': 'basketball_ncaab',
    'NCAAF': 'americanfootball_ncaaf',
    'NHL': 'icehockey_nhl',
    'basketball_nba': 'basketball_nba',
    'americanfootball_nfl': 'americanfootball_nfl',
    'basketball_ncaab': 'basketball_ncaab',
    'americanfootball_ncaaf': 'americanfootball_ncaaf',
    'icehockey_nhl': 'icehockey_nhl'
  };
  return mapping[sport] || null;
}

/**
 * Find team by name in teams array
 * Prioritizes exact matches to avoid USC Trojans vs Troy Trojans confusion
 */
function findTeam(teams, teamName) {
  if (!teams || !teamName) return null;

  // Team name aliases - The Odds API uses different names than BDL
  const TEAM_ALIASES = {
    'los angeles clippers': 'la clippers',  // BDL uses "LA Clippers"
    'la clippers': 'la clippers',
    'vegas golden knights': 'vegas',
    'montreal canadiens': 'montréal canadiens',
    'montréal canadiens': 'montréal canadiens',
    'utah hockey club': 'utah',
    'utah mammoth': 'utah',
    // Add more as needed
  };

  let normalized = teamName.toLowerCase().trim();
  
  // Apply alias if exists
  if (TEAM_ALIASES[normalized]) {
    normalized = TEAM_ALIASES[normalized];
  }
  
  // 1. Exact full_name match (highest priority)
  let match = teams.find(t => t.full_name?.toLowerCase() === normalized);
  if (match) return match;
  
  // 2. Exact college + mascot match (e.g., "Troy" college + "Trojans" mascot)
  const parts = normalized.split(/\s+/);
  if (parts.length >= 2) {
    match = teams.find(t => {
      const college = t.college?.toLowerCase() || '';
      const mascot = t.name?.toLowerCase() || '';
      // Both college and mascot must match parts of the search
      return parts.some(p => college.includes(p)) && parts.some(p => mascot.includes(p));
    });
    if (match) return match;
  }
  
  // 3. full_name contains entire search term
  match = teams.find(t => t.full_name?.toLowerCase().includes(normalized));
  if (match) return match;
  
  // 4. Search term contains entire full_name
  match = teams.find(t => normalized.includes(t.full_name?.toLowerCase()));
  if (match) return match;
  
  // 5. Abbreviation match
  match = teams.find(t => t.abbreviation?.toLowerCase() === normalized);
  if (match) return match;
  
  // 6. Mascot-only match (last resort for cases like "Clippers" matching "LA Clippers")
  const lastWord = parts[parts.length - 1];
  match = teams.find(t => t.name?.toLowerCase() === lastWord);
  if (match) return match;
  
  return null;
}

/**
 * Format streak
 */
function formatStreak(standing) {
  if (!standing) return 'N/A';
  if (standing.win_streak && standing.win_streak > 0) {
    return `W${standing.win_streak}`;
  }
  if (standing.loss_streak && standing.loss_streak > 0) {
    return `L${standing.loss_streak}`;
  }
  return standing.streak || 'N/A';
}

/**
 * Fetch stats for a specific QB by name from BDL
 * This is called AFTER we know who the starting QB is (from Gemini Grounding)
 */
async function fetchQBStatsByName(qbName, teamName) {
  try {
    const bdlSport = 'americanfootball_nfl';
    const teams = await ballDontLieService.getTeams(bdlSport);
    const team = findTeam(teams, teamName);
    if (!team) {
      console.log(`[Scout Report] Could not find team ${teamName} for QB stats lookup`);
      return { name: qbName, team: teamName, passingYards: 0, passingTds: 0, gamesPlayed: 0 };
    }

    // Get API key and base URL
    const API_KEY = 
      (typeof process !== 'undefined' && process?.env?.BALLDONTLIE_API_KEY) ||
      (typeof process !== 'undefined' && process?.env?.VITE_BALLDONTLIE_API_KEY) ||
      (typeof process !== 'undefined' && process?.env?.NEXT_PUBLIC_BALLDONTLIE_API_KEY) ||
      (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_BALLDONTLIE_API_KEY) ||
      '';
    const BALLDONTLIE_API_BASE_URL = 'https://api.balldontlie.io';

    // Calculate NFL season dynamically
    const nflMonth = new Date().getMonth() + 1;
    const nflYear = new Date().getFullYear();
    const nflSeason = nflMonth <= 7 ? nflYear - 1 : nflYear;
    
    // Fetch all player stats for the team
    const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/season_stats?season=${nflSeason}&team_id=${team.id}&per_page=100`;
    const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
    const allStats = response.data?.data || [];
    
    // Find this specific QB by name (fuzzy match)
    const searchName = qbName.toLowerCase().trim();
    const searchParts = searchName.split(' ');
    
    const qbStats = allStats.filter(p => {
      const isQB = p.player?.position === 'Quarterback' || 
                   p.player?.position_abbreviation === 'QB' ||
                   p.player?.position?.toLowerCase() === 'qb';
      if (!isQB) return false;
      
      const firstName = (p.player?.first_name || '').toLowerCase();
      const lastName = (p.player?.last_name || '').toLowerCase();
      const fullName = `${firstName} ${lastName}`.trim();
      
      // Match by full name, or by last name if first name is initial
      if (fullName.includes(searchName) || searchName.includes(fullName)) return true;
      if (searchParts.length >= 2 && lastName === searchParts[searchParts.length - 1]) return true;
      
      return false;
    });

    if (qbStats.length === 0) {
      console.log(`[Scout Report] No BDL stats found for QB "${qbName}" on ${teamName} - may be new/backup`);
      // Return QB info without stats (they might be a new backup)
      return { 
        name: qbName, 
        team: teamName,
        teamAbbr: team.abbreviation,
        passingYards: 0, 
        passingTds: 0, 
        gamesPlayed: 0,
        isBackup: true,
        note: 'New/backup QB - limited season stats'
      };
    }

    const qb = qbStats[0];
    const gamesPlayed = qb.games_played || 0;
    const passingYards = qb.passing_yards || 0;
    
    // Flag rookie/inexperienced QB situations - this is CRITICAL betting context
    const isRookie = gamesPlayed <= 2;
    const isInexperienced = gamesPlayed <= 4;
    let experienceNote = null;
    
    if (gamesPlayed === 0) {
      experienceNote = 'MAKING NFL DEBUT - No NFL game experience';
      console.log(`[Scout Report] ${qbName} is making their NFL DEBUT (0 GP)`);
    } else if (gamesPlayed === 1) {
      experienceNote = `SECOND CAREER START - Only 1 NFL game (${passingYards} yds)`;
      console.log(`[Scout Report] ${qbName} is making SECOND CAREER START (1 GP, ${passingYards} yds)`);
    } else if (isRookie) {
      experienceNote = `ROOKIE QB - Only ${gamesPlayed} career starts`;
      console.log(`[Scout Report] ${qbName} is a ROOKIE QB (${gamesPlayed} GP)`);
    } else if (isInexperienced) {
      experienceNote = `Limited experience - ${gamesPlayed} career starts`;
      console.log(`[Scout Report] ${qbName} has LIMITED EXPERIENCE (${gamesPlayed} GP)`);
    } else {
      console.log(`[Scout Report] ✓ Found BDL stats for ${qbName}: ${passingYards} yds, ${qb.passing_touchdowns || 0} TDs, ${gamesPlayed} GP`);
    }
    
    // Get the OFFICIAL experience from BDL (e.g., "2nd Season", "7th Season")
    // This is authoritative - do NOT use games_played to infer rookie status
    const officialExperience = qb.player?.experience || null;
    
    return {
      id: qb.player?.id,
      firstName: qb.player?.first_name,
      lastName: qb.player?.last_name,
      name: `${qb.player?.first_name} ${qb.player?.last_name}`,
      position: qb.player?.position,
      team: qb.player?.team?.full_name || qb.player?.team?.name,
      teamAbbr: qb.player?.team?.abbreviation,
      jerseyNumber: qb.player?.jersey_number,
      experience: officialExperience, // BDL authoritative: "2nd Season", "7th Season", etc.
      age: qb.player?.age,
      passingYards: passingYards,
      passingTds: qb.passing_touchdowns || 0,
      passingInterceptions: qb.passing_interceptions || 0,
      passingCompletionPct: qb.passing_completion_pct,
      qbRating: qb.qbr || qb.qb_rating,
      gamesPlayed: gamesPlayed,
      isRookie: isRookie,
      isInexperienced: isInexperienced,
      experienceNote: experienceNote
    };
  } catch (error) {
    console.warn(`[Scout Report] Error fetching stats for QB "${qbName}": ${error.message}`);
    return { name: qbName, team: teamName, passingYards: 0, passingTds: 0, gamesPlayed: 0 };
  }
}

/**
 * Fetch starting QBs for both teams (NFL/NCAAF only)
 * 
 * APPROACH: Use BDL's Team Roster with Depth Chart (most reliable)
 * 1. Get roster with depth chart positions (depth=1 is starter)
 * 2. Check injury_status - if starter is out, use backup (depth=2)
 * 3. Then fetch season stats for the actual starter
 * 
 * This is more reliable than:
 * - Season stat leaders (returns inactive players like Joe Flacco)
 * - Fallback sources (can be wrong/outdated)
 */
async function fetchStartingQBs(homeTeam, awayTeam, sport, injuries = null) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport || (bdlSport !== 'americanfootball_nfl' && bdlSport !== 'americanfootball_ncaaf')) {
      return null;
    }
    
    const sportLabel = bdlSport === 'americanfootball_ncaaf' ? 'NCAAF' : 'NFL';
    const isNCAAF = bdlSport === 'americanfootball_ncaaf';
    
    // Get team IDs
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for QB lookup');
      return null;
    }
    
    console.log(`[Scout Report] Fetching ${sportLabel} starting QBs from depth chart: ${awayTeam} @ ${homeTeam}`);
    
    // STEP 1: Get starting QBs from depth chart (handles injuries automatically)
    // Pass the sport key so NCAAF uses NCAAF roster, NFL uses NFL roster
    const [homeQBDepth, awayQBDepth] = await Promise.all([
      homeTeamData ? ballDontLieService.getStartingQBFromDepthChart(homeTeamData.id, 2025, bdlSport) : null,
      awayTeamData ? ballDontLieService.getStartingQBFromDepthChart(awayTeamData.id, 2025, bdlSport) : null
    ]);
    
    // STEP 2: Fetch season stats for these specific QBs
    // The depth chart tells us WHO is starting, now get their stats
    let homeQB = homeQBDepth;
    let awayQB = awayQBDepth;
    
    if (homeQBDepth) {
      const stats = await fetchQBStatsByName(homeQBDepth.name, homeTeam);
      if (stats) {
        homeQB = { ...homeQBDepth, ...stats, isBackup: homeQBDepth.isBackup };
      }
    }
    
    if (awayQBDepth) {
      const stats = await fetchQBStatsByName(awayQBDepth.name, awayTeam);
      if (stats) {
        awayQB = { ...awayQBDepth, ...stats, isBackup: awayQBDepth.isBackup };
      }
    }
    
    // NCAAF FALLBACK: If BDL depth chart failed (common for college), extract QB names from player season stats
    // This is more reliable than Grounding since BDL has actual passing stats
    if (isNCAAF) {
      if (!homeQB || homeQB.name === 'undefined undefined') {
        console.log(`[Scout Report] NCAAF fallback: Getting QB from season stats for ${homeTeam}`);
        const fallbackQB = await fetchNCAAFStartingQBFromStats(homeTeamData?.id, homeTeam);
        if (fallbackQB) {
          homeQB = fallbackQB;
        } else {
          // Last resort: create placeholder that Gemini Grounding already populated
          homeQB = { name: 'See grounded context', source: 'grounding' };
        }
      }
      if (!awayQB || awayQB.name === 'undefined undefined') {
        console.log(`[Scout Report] NCAAF fallback: Getting QB from season stats for ${awayTeam}`);
        const fallbackQB = await fetchNCAAFStartingQBFromStats(awayTeamData?.id, awayTeam);
        if (fallbackQB) {
          awayQB = fallbackQB;
        } else {
          awayQB = { name: 'See grounded context', source: 'grounding' };
        }
      }
    }
    
    // Log results - INCLUDE EXPERIENCE to prevent training data leakage (e.g., calling a 2nd-year QB a "rookie")
    if (homeQB && homeQB.name !== 'See grounded context') {
      const backupNote = homeQB.isBackup ? ' [BACKUP - starter injured]' : '';
      const injuryNote = homeQB.injuryStatus ? ` (${homeQB.injuryStatus})` : '';
      const expLabel = homeQB.experience ? ` [${homeQB.experience}]` : '';
      console.log(`[Scout Report] Home QB: ${homeQB.name}${expLabel} (${homeQB.passingYards || 0} yds, ${homeQB.passingTds || 0} TDs, ${homeQB.gamesPlayed || 0} GP)${backupNote}${injuryNote}`);
    } else if (isNCAAF) {
      console.log(`[Scout Report] ℹ️ Home QB: Retrieved via Gemini Grounding (BDL depth chart unavailable)`);
    }
    if (awayQB && awayQB.name !== 'See grounded context') {
      const backupNote = awayQB.isBackup ? ' [BACKUP - starter injured]' : '';
      const injuryNote = awayQB.injuryStatus ? ` (${awayQB.injuryStatus})` : '';
      const expLabel = awayQB.experience ? ` [${awayQB.experience}]` : '';
      console.log(`[Scout Report] Away QB: ${awayQB.name}${expLabel} (${awayQB.passingYards || 0} yds, ${awayQB.passingTds || 0} TDs, ${awayQB.gamesPlayed || 0} GP)${backupNote}${injuryNote}`);
    } else if (isNCAAF) {
      console.log(`[Scout Report] ℹ️ Away QB: Retrieved via Gemini Grounding (BDL depth chart unavailable)`);
    }
    
    return { home: homeQB, away: awayQB };
  } catch (error) {
    console.error('[Scout Report] Error fetching starting QBs:', error.message);
    return null;
  }
}

/**
 * NCAAF Fallback: Get starting QB from player season stats (by most passing yards)
 * BDL depth chart is sparse for college - this uses actual season stats instead
 * Falls back to Gemini Grounding if BDL has no data
 */
async function fetchNCAAFStartingQBFromStats(teamId, teamName) {
  try {
    if (!teamId) return null;
    
    // Calculate NCAAF season using centralized function
    const season = nflSeason(); // NCAAF uses same timing as NFL
    
    // Fetch player season stats for the team - use OPTIONS OBJECT format
    console.log(`[Scout Report] Fetching NCAAF QB stats from BDL for ${teamName} (teamId: ${teamId}, season: ${season})`);
    const stats = await ballDontLieService.getNcaafPlayerSeasonStats({ teamId, season });
    console.log(`[Scout Report] BDL returned ${stats?.length || 0} player stats for ${teamName}`);
    
    if (stats && stats.length > 0) {
      // Filter to QBs and sort by passing yards
      const qbStats = stats.filter(p => 
        (p.player?.position === 'Quarterback' || p.player?.position === 'QB' || 
         p.player?.position_abbreviation === 'QB') &&
        (p.passing_yards || 0) > 0
      ).sort((a, b) => (b.passing_yards || 0) - (a.passing_yards || 0));
      
      console.log(`[Scout Report] Found ${qbStats.length} QB(s) with passing yards for ${teamName}`);
      
      if (qbStats.length > 0) {
        const startingQB = qbStats[0];
        const qbName = `${startingQB.player?.first_name || ''} ${startingQB.player?.last_name || ''}`.trim();
        const qbId = startingQB.player?.id;
        
        console.log(`[Scout Report] ✓ BDL Starting QB for ${teamName}: ${qbName} (${startingQB.passing_yards} yds, ${startingQB.passing_touchdowns} TDs)`);
        
        // Fetch game-by-game stats for this QB (last 5 games)
        let gameLogs = [];
        if (qbId) {
          try {
            const gameStats = await ballDontLieService.getNcaafPlayerGameStats({ playerId: qbId, season });
            if (gameStats && gameStats.length > 0) {
              // Sort by game date (most recent first) and take last 5
              gameLogs = gameStats
                .filter(g => g.passing_yards !== null || g.passing_touchdowns !== null)
                .sort((a, b) => new Date(b.game?.date || 0) - new Date(a.game?.date || 0))
                .slice(0, 5)
                .map(g => ({
                  date: g.game?.date ? new Date(g.game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A',
                  week: g.game?.week || 'N/A',
                  opponent: g.game?.home_team?.full_name === teamName ? g.game?.visitor_team?.full_name : g.game?.home_team?.full_name,
                  result: g.game?.home_score !== undefined && g.game?.away_score !== undefined 
                    ? `${g.game.home_score}-${g.game.away_score}` : 'N/A',
                  completions: g.passing_completions || 0,
                  attempts: g.passing_attempts || 0,
                  yards: g.passing_yards || 0,
                  tds: g.passing_touchdowns || 0,
                  ints: g.passing_interceptions || 0,
                  rating: g.passing_rating || g.passing_qbr || 0
                }));
              console.log(`[Scout Report] ✓ Fetched ${gameLogs.length} game logs for ${qbName}`);
            }
          } catch (e) {
            console.warn(`[Scout Report] Could not fetch game logs for ${qbName}:`, e.message);
          }
        }
        
        // Calculate games played from game logs if BDL doesn't provide it
        // BDL NCAAF player_season_stats doesn't include games_played field
        // Use game logs count - we fetch game-by-game stats so this is accurate
        let gamesPlayed = startingQB.games_played || 0;
        if (!gamesPlayed && gameLogs && gameLogs.length > 0) {
          gamesPlayed = gameLogs.length;
          console.log(`[Scout Report] Games played from game logs: ${gamesPlayed} for ${qbName}`);
        }
        
        return {
          name: qbName,
          playerId: qbId,
          passingYards: startingQB.passing_yards || 0,
          passingTds: startingQB.passing_touchdowns || 0,
          passingInts: startingQB.passing_interceptions || 0,
          passingRating: startingQB.passing_rating || 0,
          completionPct: startingQB.passing_attempts > 0 
            ? ((startingQB.passing_completions / startingQB.passing_attempts) * 100).toFixed(1) 
            : 0,
          gamesPlayed: gamesPlayed,
          gameLogs: gameLogs,
          source: 'bdl_stats'
        };
      }
    }
    
    // BDL returned empty - no QB stats available
    console.log(`[Scout Report] BDL empty for ${teamName} - no QB stats available from BDL`);
    return null;
    
  } catch (e) {
    console.warn(`[Scout Report] NCAAF QB stats fallback failed for ${teamName}:`, e.message);
    return null;
  }
}

/**
 * Fetch key players (starters) for both NFL teams
 * Uses roster depth chart + season stats to show who actually plays
 * This prevents hallucinations about players who've been traded/cut
 */
async function fetchKeyPlayers(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (bdlSport !== 'americanfootball_nfl') {
      return null; // Only NFL for now
    }
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for roster lookup');
      return null;
    }
    
    console.log(`[Scout Report] Fetching NFL rosters for ${homeTeam} (ID: ${homeTeamData?.id}) and ${awayTeam} (ID: ${awayTeamData?.id})`);
    
    // Fetch rosters and season stats in parallel
    const [homeRoster, awayRoster, homeStats, awayStats] = await Promise.all([
      homeTeamData ? ballDontLieService.getNflTeamRoster(homeTeamData.id, 2025) : [],
      awayTeamData ? ballDontLieService.getNflTeamRoster(awayTeamData.id, 2025) : [],
      homeTeamData ? ballDontLieService.getNflSeasonStatsByTeam(homeTeamData.id, 2025) : [],
      awayTeamData ? ballDontLieService.getNflSeasonStatsByTeam(awayTeamData.id, 2025) : []
    ]);
    
    // Process each team's roster to get key starters
    const processTeamRoster = (roster, stats) => {
      if (!roster || roster.length === 0) return null;
      
      // Create a map of player ID to season stats
      const statsMap = new Map();
      (stats || []).forEach(s => {
        if (s.player?.id) {
          statsMap.set(s.player.id, s);
        }
      });
      
      // Filter to starters (depth = 1) and key positions
      const keyPositions = {
        offense: ['QB', 'RB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'],
        defense: ['EDGE', 'DE', 'DT', 'NT', 'OLB', 'ILB', 'MLB', 'CB', 'FS', 'SS', 'S']
      };
      
      const starters = {
        offense: [],
        defense: []
      };
      
      // Track positions we've filled to avoid duplicates
      const filledOffense = new Set();
      const filledDefense = new Set();
      
      // Sort by depth to prioritize starters
      const sortedRoster = [...roster].sort((a, b) => (a.depth || 99) - (b.depth || 99));
      
      for (const entry of sortedRoster) {
        const pos = entry.position?.toUpperCase() || entry.player?.position_abbreviation?.toUpperCase() || '';
        const player = entry.player || {};
        const playerId = player.id;
        const playerStats = statsMap.get(playerId) || {};
        
        // Only take depth 1-2 players (starters and key backups)
        if ((entry.depth || 1) > 2) continue;
        
        const playerInfo = {
          name: entry.player_name || `${player.first_name || ''} ${player.last_name || ''}`.trim(),
          position: pos,
          jerseyNumber: player.jersey_number || '',
          depth: entry.depth || 1,
          injuryStatus: entry.injury_status || null,
          // Stats
          passingYards: playerStats.passing_yards || null,
          passingTds: playerStats.passing_touchdowns || null,
          passingInts: playerStats.passing_interceptions || null,
          rushingYards: playerStats.rushing_yards || null,
          rushingTds: playerStats.rushing_touchdowns || null,
          receivingYards: playerStats.receiving_yards || null,
          receivingTds: playerStats.receiving_touchdowns || null,
          receptions: playerStats.receptions || null,
          sacks: playerStats.defensive_sacks || null,
          tackles: playerStats.total_tackles || null,
          interceptions: playerStats.defensive_interceptions || null,
          gamesPlayed: playerStats.games_played || null
        };
        
        // Categorize into offense or defense
        const isOffense = keyPositions.offense.includes(pos) || 
                          ['QUARTERBACK', 'RUNNING BACK', 'WIDE RECEIVER', 'TIGHT END'].some(p => 
                            (player.position || '').toUpperCase().includes(p));
        const isDefense = keyPositions.defense.includes(pos) ||
                          ['LINEBACKER', 'CORNERBACK', 'SAFETY', 'DEFENSIVE'].some(p => 
                            (player.position || '').toUpperCase().includes(p));
        
        // Limit offense to key skill positions + OL representation
        if (isOffense && !filledOffense.has(pos)) {
          // For WR, allow up to 3
          if (pos === 'WR' && starters.offense.filter(p => p.position === 'WR').length >= 3) continue;
          // For RB, allow up to 2
          if (pos === 'RB' && starters.offense.filter(p => p.position === 'RB').length >= 2) continue;
          // For other positions, only take 1
          if (!['WR', 'RB'].includes(pos)) filledOffense.add(pos);
          
          starters.offense.push(playerInfo);
        }
        
        // Limit defense to key playmakers
        if (isDefense && !filledDefense.has(pos)) {
          // For CB, allow up to 2
          if (pos === 'CB' && starters.defense.filter(p => p.position === 'CB').length >= 2) continue;
          // For EDGE/DE, allow up to 2
          if (['EDGE', 'DE'].includes(pos) && starters.defense.filter(p => ['EDGE', 'DE'].includes(p.position)).length >= 2) continue;
          // For LB positions, allow up to 2
          if (['OLB', 'ILB', 'MLB', 'LB'].includes(pos) && starters.defense.filter(p => ['OLB', 'ILB', 'MLB', 'LB'].includes(p.position)).length >= 2) continue;
          // For other positions, only take 1
          if (!['CB', 'EDGE', 'DE', 'OLB', 'ILB', 'MLB', 'LB'].includes(pos)) filledDefense.add(pos);
          
          starters.defense.push(playerInfo);
        }
      }
      
      // Sort offense: QB first, then by production
      starters.offense.sort((a, b) => {
        if (a.position === 'QB') return -1;
        if (b.position === 'QB') return 1;
        const aYards = (a.rushingYards || 0) + (a.receivingYards || 0);
        const bYards = (b.rushingYards || 0) + (b.receivingYards || 0);
        return bYards - aYards;
      });
      
      // Sort defense by impact (sacks + tackles)
      starters.defense.sort((a, b) => {
        const aImpact = (a.sacks || 0) * 3 + (a.tackles || 0) + (a.interceptions || 0) * 5;
        const bImpact = (b.sacks || 0) * 3 + (b.tackles || 0) + (b.interceptions || 0) * 5;
        return bImpact - aImpact;
      });
      
      // Limit to reasonable counts
      return {
        offense: starters.offense.slice(0, 8), // QB, 2 RB, 3 WR, TE, maybe 1 OL
        defense: starters.defense.slice(0, 5)  // Top 5 defenders
      };
    };
    
    const homeKeyPlayers = processTeamRoster(homeRoster, homeStats);
    const awayKeyPlayers = processTeamRoster(awayRoster, awayStats);
    
    console.log(`[Scout Report] ✓ Key players: ${homeTeam} (${homeKeyPlayers?.offense?.length || 0} OFF, ${homeKeyPlayers?.defense?.length || 0} DEF), ${awayTeam} (${awayKeyPlayers?.offense?.length || 0} OFF, ${awayKeyPlayers?.defense?.length || 0} DEF)`);
    
    return {
      home: homeKeyPlayers,
      away: awayKeyPlayers
    };
  } catch (error) {
    console.error('[Scout Report] Error fetching key players:', error.message);
    return null;
  }
}

/**
 * Format key players section for display
 * ENHANCED: Now includes "TOP RECEIVING TARGETS" section like NBA shows top scorers by PPG
 */
function formatKeyPlayers(homeTeam, awayTeam, keyPlayers) {
  if (!keyPlayers || (!keyPlayers.home && !keyPlayers.away)) {
    return '';
  }
  
  const formatPlayerLine = (player) => {
    const injury = player.injuryStatus ? ` [${player.injuryStatus}]` : '';
    const jersey = player.jerseyNumber ? ` #${player.jerseyNumber}` : '';
    
    // Format stats based on position
    let stats = '';
    if (player.position === 'QB' && player.passingYards) {
      stats = ` - ${player.passingYards} yds, ${player.passingTds || 0} TD, ${player.passingInts || 0} INT`;
    } else if (['RB'].includes(player.position) && (player.rushingYards || player.receivingYards)) {
      const parts = [];
      if (player.rushingYards) parts.push(`${player.rushingYards} rush`);
      if (player.receivingYards) parts.push(`${player.receivingYards} rec`);
      if (player.rushingTds || player.receivingTds) parts.push(`${(player.rushingTds || 0) + (player.receivingTds || 0)} TD`);
      stats = parts.length ? ` - ${parts.join(', ')}` : '';
    } else if (['WR', 'TE'].includes(player.position) && player.receivingYards) {
      stats = ` - ${player.receptions || 0} rec, ${player.receivingYards} yds, ${player.receivingTds || 0} TD`;
    } else if (player.sacks || player.tackles || player.interceptions) {
      const parts = [];
      if (player.tackles) parts.push(`${player.tackles} tkl`);
      if (player.sacks) parts.push(`${player.sacks} sacks`);
      if (player.interceptions) parts.push(`${player.interceptions} INT`);
      stats = parts.length ? ` - ${parts.join(', ')}` : '';
    }
    
    return `  • ${player.position}: ${player.name}${jersey}${stats}${injury}`;
  };
  
  // NEW: Extract and format TOP RECEIVING TARGETS (like NBA shows top scorers by PPG)
  // This is critical for backup QB situations - shows who the reliable targets are
  const getTopReceivers = (players) => {
    if (!players?.offense) return [];
    
    // Get all WR and TE, sort by receiving yards (like NBA sorts by PPG)
    const receivers = players.offense
      .filter(p => ['WR', 'TE'].includes(p.position) && p.receivingYards > 0)
      .sort((a, b) => (b.receivingYards || 0) - (a.receivingYards || 0))
      .slice(0, 3); // Top 3
    
    return receivers;
  };
  
  const formatReceiverLine = (player) => {
    const injury = player.injuryStatus ? ` [${player.injuryStatus}]` : '';
    return `  ${player.name} (${player.position}) - ${player.receptions || 0} rec, ${player.receivingYards} yds, ${player.receivingTds || 0} TD${injury}`;
  };
  
  const homeReceivers = getTopReceivers(keyPlayers.home);
  const awayReceivers = getTopReceivers(keyPlayers.away);
  
  // Format top receiving targets section (critical for backup QB analysis)
  let topReceiversSection = '';
  if (homeReceivers.length > 0 || awayReceivers.length > 0) {
    topReceiversSection = `
TOP RECEIVING TARGETS (by receiving yards - CRITICAL FOR QB CHANGES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[HOME] ${homeTeam}:
${homeReceivers.length > 0 ? homeReceivers.map(formatReceiverLine).join('\n') : '  (No receiving data available)'}

[AWAY] ${awayTeam}:
${awayReceivers.length > 0 ? awayReceivers.map(formatReceiverLine).join('\n') : '  (No receiving data available)'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  }
  
  const formatTeamSection = (teamName, players, isHome) => {
    if (!players) return `${isHome ? '[HOME]' : '[AWAY]'} ${teamName}: Roster unavailable`;
    
    const lines = [`${isHome ? '[HOME]' : '[AWAY]'} ${teamName}:`];
    
    if (players.offense && players.offense.length > 0) {
      lines.push('  OFFENSE:');
      players.offense.forEach(p => lines.push(formatPlayerLine(p)));
    }
    
    if (players.defense && players.defense.length > 0) {
      lines.push('  DEFENSE:');
      players.defense.forEach(p => lines.push(formatPlayerLine(p)));
    }
    
    return lines.join('\n');
  };
  
  const homeSection = formatTeamSection(homeTeam, keyPlayers.home, true);
  const awaySection = formatTeamSection(awayTeam, keyPlayers.away, false);
  
  return `${topReceiversSection}
KEY PLAYERS (CURRENT ROSTER - USE THESE NAMES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${homeSection}

${awaySection}

CRITICAL: Only reference players listed above. Do NOT mention players
not on this roster - they may have been traded, cut, or injured.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

/**
 * Fetch key players for both NHL teams
 * Uses roster + individual player stats to show who's on the team
 * This prevents hallucinations about players who've been traded
 */
async function fetchNhlKeyPlayers(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (bdlSport !== 'icehockey_nhl') {
      return null;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // NHL: Use Gemini Grounding to search RotoWire for lineups + injury CONTEXT
    // This is more reliable than Puppeteer scraping and gives us injury duration
    // ═══════════════════════════════════════════════════════════════════════════
    console.log(`[Scout Report] Fetching NHL lineups via Gemini Grounding for ${awayTeam} @ ${homeTeam}`);
    
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    
    let rotoWireLineups = null;
    try {
      // Use the correct Rotowire NHL lineups URL - this page shows TODAY's games by default
      const makeNhlMegaQuery = (teamName, opponentName) => `Search rotowire.com/hockey/nhl-lineups.php for the ${teamName} vs ${opponentName} game.

Extract these THREE sections for ${teamName} from that page:

1. GOALIE & LINEUP:
- [Goalie Name] | [Confirmed/Expected]
- Starting Lineup: C:[Name], LW:[Name], RW:[Name], LD:[Name], RD:[Name]

2. POWER PLAY:
- PP1: C:[Name], LW:[Name], RW:[Name], LD:[Name], RD:[Name]
- PP2: C:[Name], LW:[Name], RW:[Name], LD:[Name], RD:[Name]

3. INJURIES:
- List ALL players shown under "INJURIES" for ${teamName}: [Name] | [Position] | [Status]

Use EXACT player names as shown on the page. No commentary.`;

      const [awayMegaResponse, homeMegaResponse] = await Promise.all([
        geminiGroundingSearch(makeNhlMegaQuery(awayTeam, homeTeam), { temperature: 1.0, maxTokens: 3000 }),
        geminiGroundingSearch(makeNhlMegaQuery(homeTeam, awayTeam), { temperature: 1.0, maxTokens: 3000 })
      ]);

      const parseLineupOnly = (text, teamName) => {
        if (!text) return null;
        const lineupSectionRegex = /1\.\s*GOALIE\s*&\s*LINEUP:?(.*?)(?=2\.\s*POWER\s*PLAY|3\.\s*INJURIES|$)/is;
        const match = text.match(lineupSectionRegex);
        return match ? match[1].trim() : text;
      };

      const parsePPOnly = (text, teamName) => {
        if (!text) return null;
        const ppSectionRegex = /2\.\s*POWER\s*PLAY:?(.*?)(?=3\.\s*INJURIES|1\.\s*GOALIE|$)/is;
        const match = text.match(ppSectionRegex);
        return match ? match[1].trim() : text;
      };

      const parseInjuries = (text, teamName) => {
        if (!text) return [];
        const teamSectionRegex = /3\.\s*INJURIES:?(.*?)(?=1\.\s*GOALIE|2\.\s*POWER\s*PLAY|$)/is;
        const teamSectionMatch = text.match(teamSectionRegex);
        const sectionText = teamSectionMatch ? teamSectionMatch[1] : text;
        const lines = sectionText.split('\n').map(l => l.trim()).filter(l => l.startsWith('-') && !l.toLowerCase().includes('no injuries reported'));
        return lines;
      };

      // Parse goalie and starting lineup from mega-query response
      const parseTeamLineup = (text, teamName) => {
        if (!text) return null;
        
        // Extract goalie line: "- GoalieName | Confirmed/Expected"
        const goalieMatch = text.match(/-\s*([^|]+)\s*\|\s*(Confirmed|Expected|Unconfirmed)/i);
        const goalieName = goalieMatch ? goalieMatch[1].trim() : 'UNKNOWN';
        const goalieStatus = goalieMatch ? goalieMatch[2].trim() : 'Unknown';
        const goalieLine = `${teamName}: ${goalieName} | ${goalieStatus}`;
        
        // Extract starting lineup: "Starting Lineup: C:Name, LW:Name, RW:Name, LD:Name, RD:Name"
        const lineupMatch = text.match(/Starting\s*Lineup:?\s*(.+)/i);
        const lineup = [];
        
        if (lineupMatch) {
          const lineupText = lineupMatch[1];
          const positions = ['C', 'LW', 'RW', 'LD', 'RD'];
          for (const pos of positions) {
            const posMatch = lineupText.match(new RegExp(`${pos}:\\s*([^,]+)`, 'i'));
            const playerName = posMatch ? posMatch[1].trim() : 'UNKNOWN';
            lineup.push(`${pos}: ${playerName}`);
          }
        } else {
          // Fallback: return UNKNOWNs
          lineup.push('C: UNKNOWN', 'LW: UNKNOWN', 'RW: UNKNOWN', 'LD: UNKNOWN', 'RD: UNKNOWN');
        }
        
        return { goalieLine, lineup };
      };

      // Parse power play units from mega-query response
      // Handles various formats: "PP1: C:Name", "**PP1:** C: Name", "- PP1: C:Name", etc.
      const parsePowerPlay = (text, teamName) => {
        if (!text) return null;
        
        const positions = ['C', 'LW', 'RW', 'LD', 'RD'];
        
        // Helper to extract a PP unit - handles markdown and various formats
        const extractPPUnit = (fullText, ppNum) => {
          const players = [];
          let complete = false;
          
          // Find the PP section - handle markdown: **PP1:**, *PP1:*, -PP1:, PP1:
          // Capture everything until PP2 (for PP1) or end of relevant section
          const ppPattern = ppNum === 1
            ? /\*?\*?PP1\*?\*?:?\s*([\s\S]*?)(?=\*?\*?PP2|POWER\s*PLAY\s*#?2|$)/i
            : /\*?\*?PP2\*?\*?:?\s*([\s\S]*?)(?=\*?\*?PP1|INJURIES|$)/i;
          
          const sectionMatch = fullText.match(ppPattern);
          if (!sectionMatch) {
            return { players: [], line: 'C: UNKNOWN, LW: UNKNOWN, RW: UNKNOWN, LD: UNKNOWN, RD: UNKNOWN', complete: false };
          }
          
          const sectionText = sectionMatch[1];
          
          // Extract each position - handle various formats:
          // "C:Name", "C: Name", "C  Name", "* C  Name", "C - Name"
          for (const pos of positions) {
            // Try multiple patterns for position extraction
            const patterns = [
              new RegExp(`\\b${pos}[:\\s]+([A-Z][a-z]+(?:\\s+[A-Z][a-z'\\-]+)+|[A-Z]\\.\\s*[A-Z][a-z'\\-]+)`, 'i'),  // C: First Last or C: F. Last
              new RegExp(`\\*\\s*${pos}\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z'\\-]+)+|[A-Z]\\.\\s*[A-Z][a-z'\\-]+)`, 'i'), // * C  First Last
              new RegExp(`${pos}[:\\-]\\s*([^,\\n\\*]+)`, 'i'), // Fallback: C: anything until comma/newline
            ];
            
            let playerName = 'UNKNOWN';
            for (const pattern of patterns) {
              const match = sectionText.match(pattern);
              if (match && match[1]) {
                playerName = match[1].trim().replace(/[\*\|,]+$/, '').trim(); // Clean trailing punctuation
                if (playerName && playerName.length > 1 && !playerName.toLowerCase().includes('unknown')) {
                  break;
                }
              }
            }
            players.push(`${pos}:${playerName}`);
          }
          
          complete = !players.some(p => p.includes('UNKNOWN'));
          const line = players.join(', ');
          
          return { players, line, complete };
        };
        
        const pp1Result = extractPPUnit(text, 1);
        const pp2Result = extractPPUnit(text, 2);
        
        console.log(`[PP Parser] PP1 complete: ${pp1Result.complete}, PP2 complete: ${pp2Result.complete}`);
        if (!pp1Result.complete) console.log(`[PP Parser] PP1 missing positions in: ${pp1Result.line}`);
        if (!pp2Result.complete) console.log(`[PP Parser] PP2 missing positions in: ${pp2Result.line}`);
        
        return {
          pp1Line: pp1Result.line,
          pp2Line: pp2Result.line,
          pp1Complete: pp1Result.complete,
          pp2Complete: pp2Result.complete,
          isComplete: pp1Result.complete && pp2Result.complete
        };
      };

      // Retry query for lineup (used when initial mega-query has unknowns)
      const makeLineupQuery = (teamName, opponentName, isRetry = false) => 
        `Search rotowire.com/hockey/nhl-lineups.php for the ${teamName} vs ${opponentName} game.
Return ONLY the starting goalie and starting lineup for ${teamName}:
- [Goalie Name] | [Confirmed/Expected]
- Starting Lineup: C:[Name], LW:[Name], RW:[Name], LD:[Name], RD:[Name]
Use EXACT player names as shown on the page.`;

      // Retry query for power play (used when initial mega-query is incomplete)
      // PP1 is critical (gets 60-70% of PP time), PP2 is secondary
      const makePowerPlayQuery = (teamName, opponentName, isRetry = false) =>
        `${teamName} power play units TODAY from rotowire.com/hockey/nhl-lineups.php:
PP1: C:[Name], LW:[Name], RW:[Name], LD:[Name], RD:[Name]
PP2: C:[Name], LW:[Name], RW:[Name], LD:[Name], RD:[Name]
NO introduction. NO explanation. ONLY the format above with exact player names.`;

      let awayParsed = awayMegaResponse?.success ? parseTeamLineup(parseLineupOnly(awayMegaResponse.data, awayTeam), awayTeam) : null;
      let homeParsed = homeMegaResponse?.success ? parseTeamLineup(parseLineupOnly(homeMegaResponse.data, homeTeam), homeTeam) : null;
      let awayPP = awayMegaResponse?.success ? parsePowerPlay(parsePPOnly(awayMegaResponse.data, awayTeam), awayTeam) : null;
      let homePP = homeMegaResponse?.success ? parsePowerPlay(homeMegaResponse.data, homeTeam) : null;
      const awayInjuriesRaw = awayMegaResponse?.success ? parseInjuries(awayMegaResponse.data, awayTeam) : [];
      const homeInjuriesRaw = homeMegaResponse?.success ? parseInjuries(homeMegaResponse.data, homeTeam) : [];

      const hasUnknownLineup = (parsed) => {
        if (!parsed) return true;
        return parsed.lineup?.some(line => line.includes('UNKNOWN')) || parsed.goalieLine?.includes('UNKNOWN');
      };
      
      // Check if PP response is complete (all 5 positions for both units)
      const isPPComplete = (pp) => {
        return pp && pp.isComplete === true;
      };

      if (hasUnknownLineup(awayParsed)) {
        const retry = await geminiGroundingSearch(makeLineupQuery(awayTeam, homeTeam, true), { temperature: 1.0, maxTokens: 2000 });
        awayParsed = retry?.success ? parseTeamLineup(retry.data, awayTeam) : awayParsed;
      }
      if (hasUnknownLineup(homeParsed)) {
        const retry = await geminiGroundingSearch(makeLineupQuery(homeTeam, awayTeam, true), { temperature: 1.0, maxTokens: 2000 });
        homeParsed = retry?.success ? parseTeamLineup(retry.data, homeTeam) : homeParsed;
      }
      
      // Retry PP grounding up to 2 times if PP1 incomplete
      // PP1 is critical, PP2 is nice-to-have (PP1 gets 60-70% of PP time)
      const MAX_PP_RETRIES = 2;
      const isPP1Complete = (pp) => pp?.pp1Complete === true;
      
      for (let attempt = 1; attempt <= MAX_PP_RETRIES && !isPP1Complete(awayPP); attempt++) {
        console.log(`[Scout Report] PP1 incomplete for ${awayTeam} - retry ${attempt}/${MAX_PP_RETRIES}...`);
        const retry = await geminiGroundingSearch(makePowerPlayQuery(awayTeam, homeTeam, true), { maxTokens: 2000 });
        if (retry?.success) {
          awayPP = parsePowerPlay(retry.data, awayTeam);
        }
      }
      for (let attempt = 1; attempt <= MAX_PP_RETRIES && !isPP1Complete(homePP); attempt++) {
        console.log(`[Scout Report] PP1 incomplete for ${homeTeam} - retry ${attempt}/${MAX_PP_RETRIES}...`);
        const retry = await geminiGroundingSearch(makePowerPlayQuery(homeTeam, awayTeam, true), { maxTokens: 2000 });
        if (retry?.success) {
          homePP = parsePowerPlay(retry.data, homeTeam);
        }
      }
      
      // HARD FAIL: If PP1 is still incomplete after retries, throw error
      // PP1 is required (critical for analysis), PP2 is optional
      if (!isPP1Complete(awayPP)) {
        const errorMsg = `[Scout Report] HARD FAIL: Could not get complete PP1 for ${awayTeam} after ${MAX_PP_RETRIES} retries. PP1: ${awayPP?.pp1Complete}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      if (!isPP1Complete(homePP)) {
        const errorMsg = `[Scout Report] HARD FAIL: Could not get complete PP1 for ${homeTeam} after ${MAX_PP_RETRIES} retries. PP1: ${homePP?.pp1Complete}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      
      // Log if PP2 is incomplete (warning, not failure)
      if (!awayPP?.pp2Complete) console.log(`[Scout Report] PP2 partial for ${awayTeam} (non-critical): ${awayPP?.pp2Line}`);
      if (!homePP?.pp2Complete) console.log(`[Scout Report] PP2 partial for ${homeTeam} (non-critical): ${homePP?.pp2Line}`);
      
      console.log(`[Scout Report] PP data complete for both teams`)

      // Normalize injury statuses using the main Rotowire injuries fetcher
      const rotowireInjuries = await fetchGroundingInjuries(homeTeam, awayTeam, sport);
      const buildStatusMap = (injuriesList) => {
        const map = new Map();
        for (const inj of injuriesList || []) {
          const name = typeof inj.player === 'string'
            ? inj.player
            : `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
          if (name) map.set(name.toLowerCase(), inj.status);
        }
        return map;
      };
      const homeStatusMap = buildStatusMap(rotowireInjuries?.home);
      const awayStatusMap = buildStatusMap(rotowireInjuries?.away);

      const normalizeInjuryLines = (lines, statusMap) => {
        const normalized = lines.map(line => {
          const match = line.match(/-\s*([^|]+)\|\s*([^|]+)\|\s*([A-Za-z\-]+)/);
          if (!match) {
            // If status missing, try to recover from status map
            const nameMatch = line.match(/-\s*([^|]+)/);
            const playerName = nameMatch ? nameMatch[1].trim() : '';
            const status = statusMap.get(playerName.toLowerCase());
            return status ? `- ${playerName} | [Position] | ${status}` : line;
          }
          const playerName = match[1].trim();
          const position = match[2].trim();
          const status = statusMap.get(playerName.toLowerCase()) || match[3].trim();
          return `- ${playerName} | ${position} | ${status}`;
        });

        // Add any missing injuries from status map
        const existingNames = new Set(
          normalized
            .map(line => line.match(/-\s*([^|]+)/))
            .filter(Boolean)
            .map(match => match[1].trim().toLowerCase())
        );
        for (const [name, status] of statusMap.entries()) {
          if (!existingNames.has(name)) {
            normalized.push(`- ${name.split(' ').map(s => s[0].toUpperCase() + s.slice(1)).join(' ')} | [Position] | ${status}`);
          }
        }

        return normalized;
      };

      const awayInjuries = normalizeInjuryLines(awayInjuriesRaw, awayStatusMap);
      const homeInjuries = normalizeInjuryLines(homeInjuriesRaw, homeStatusMap);

      if (awayParsed || homeParsed || awayPP || homePP || awayInjuries.length || homeInjuries.length) {
        const combinedContent = [
          'GOALIES:',
          awayParsed?.goalieLine || `${awayTeam}: UNKNOWN | [Status]`,
          homeParsed?.goalieLine || `${homeTeam}: UNKNOWN | [Status]`,
          '',
          `STARTING LINEUP - ${awayTeam}:`,
          ...(awayParsed?.lineup?.length ? awayParsed.lineup : ['C: UNKNOWN', 'LW: UNKNOWN', 'RW: UNKNOWN', 'LD: UNKNOWN', 'RD: UNKNOWN']),
          '',
          `STARTING LINEUP - ${homeTeam}:`,
          ...(homeParsed?.lineup?.length ? homeParsed.lineup : ['C: UNKNOWN', 'LW: UNKNOWN', 'RW: UNKNOWN', 'LD: UNKNOWN', 'RD: UNKNOWN']),
          '',
          `POWER PLAY #1 - ${awayTeam}:`,
          awayPP?.pp1Line || 'C: UNKNOWN, LW: UNKNOWN, RW: UNKNOWN, LD: UNKNOWN, RD: UNKNOWN',
          '',
          `POWER PLAY #1 - ${homeTeam}:`,
          homePP?.pp1Line || 'C: UNKNOWN, LW: UNKNOWN, RW: UNKNOWN, LD: UNKNOWN, RD: UNKNOWN',
          '',
          `POWER PLAY #2 - ${awayTeam}:`,
          awayPP?.pp2Line || 'C: UNKNOWN, LW: UNKNOWN, RW: UNKNOWN, LD: UNKNOWN, RD: UNKNOWN',
          '',
          `POWER PLAY #2 - ${homeTeam}:`,
          homePP?.pp2Line || 'C: UNKNOWN, LW: UNKNOWN, RW: UNKNOWN, LD: UNKNOWN, RD: UNKNOWN',
          '',
          `INJURIES - ${awayTeam}:`,
          ...(awayInjuries.length ? awayInjuries : ['- UNKNOWN | [Position] | [Status]']),
          '',
          `INJURIES - ${homeTeam}:`,
          ...(homeInjuries.length ? homeInjuries : ['- UNKNOWN | [Position] | [Status]'])
        ].join('\n');

        console.log(`[Scout Report] Gemini Grounding returned NHL lineup data (${combinedContent.length} chars)`);
          rotoWireLineups = {
          content: combinedContent,
            source: 'Gemini Grounding (site:rotowire.com)',
            fetchedAt: new Date().toISOString()
          };
      }
    } catch (groundingError) {
      // Re-throw hard fail errors - these should stop the pick
      if (groundingError.message.includes('HARD FAIL')) {
        throw groundingError;
      }
      console.warn(`[Scout Report] Gemini Grounding for NHL lineups failed: ${groundingError.message}`);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // BDL: Get HEALTHY roster (who is available to play)
    // RotoWire gives us injuries with context, BDL gives us the active roster
    // ═══════════════════════════════════════════════════════════════════════════
    console.log(`[Scout Report] Fetching active roster from BDL for ${homeTeam} vs ${awayTeam}`);
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for NHL roster lookup');
      // If we have RotoWire data, return that alone
      if (rotoWireLineups) {
        return { rotoWireLineups, source: 'Gemini Grounding' };
      }
      return null;
    }
    
    console.log(`[Scout Report] Fetching NHL rosters for ${homeTeam} (ID: ${homeTeamData?.id}) and ${awayTeam} (ID: ${awayTeamData?.id})`);

    // NHL season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
    const nhlMonth = new Date().getMonth() + 1;
    const nhlYear = new Date().getFullYear();
    const season = nhlMonth >= 10 ? nhlYear : nhlYear - 1;

    // Store the RotoWire lineups for later formatting
    let groundingRosterData = rotoWireLineups;
    console.log(`[Scout Report] Using Gemini Grounding + BDL roster data for NHL: ${homeTeam} vs ${awayTeam}`);

    // Fetch rosters from BDL as backup/supplement
    const [homePlayers, awayPlayers] = await Promise.all([
      homeTeamData ? ballDontLieService.getNhlTeamPlayers(homeTeamData.id, season) : [],
      awayTeamData ? ballDontLieService.getNhlTeamPlayers(awayTeamData.id, season) : []
    ]);

    // Debug: Log some player info to verify we're getting correct data
    console.log(`[Scout Report] ${homeTeam}: ${homePlayers.length} players found (BDL)`);
    if (homePlayers.length > 0) {
      const samplePlayers = homePlayers.slice(0, 3).map(p => `${p.full_name} (${p.position_code})`);
      console.log(`[Scout Report] Sample ${homeTeam} players: ${samplePlayers.join(', ')}`);
    }
    console.log(`[Scout Report] ${awayTeam}: ${awayPlayers.length} players found (BDL)`);
    if (awayPlayers.length > 0) {
      const samplePlayers = awayPlayers.slice(0, 3).map(p => `${p.full_name} (${p.position_code})`);
      console.log(`[Scout Report] Sample ${awayTeam} players: ${samplePlayers.join(', ')}`);
    }
    
    // Process each team's roster to get key players with stats
    const processTeamRoster = async (players, teamName) => {
      if (!players || players.length === 0) return null;
      
      // Group by position
      const forwards = players.filter(p => ['C', 'L', 'R', 'LW', 'RW', 'F'].includes(p.position_code?.toUpperCase()));
      const defensemen = players.filter(p => ['D'].includes(p.position_code?.toUpperCase()));
      const goalies = players.filter(p => ['G'].includes(p.position_code?.toUpperCase()));
      
      // Get stats for key players (top forwards, defensemen, and goalies)
      // Limit to avoid too many API calls
      const keyForwards = forwards.slice(0, 6);
      const keyDefensemen = defensemen.slice(0, 4);
      const keyGoalies = goalies.slice(0, 2);
      
      const allKeyPlayers = [...keyForwards, ...keyDefensemen, ...keyGoalies];
      
      // Fetch stats for each key player in parallel (batch of 5 at a time)
      const playersWithStats = [];
      for (let i = 0; i < allKeyPlayers.length; i += 5) {
        const batch = allKeyPlayers.slice(i, i + 5);
        const statsPromises = batch.map(async (player) => {
          try {
            const stats = await ballDontLieService.getNhlPlayerSeasonStats(player.id, season);
            // Convert array of {name, value} to object
            const statsObj = {};
            (stats || []).forEach(s => {
              statsObj[s.name] = s.value;
            });
            return { ...player, seasonStats: statsObj };
          } catch (e) {
            return { ...player, seasonStats: {} };
          }
        });
        const results = await Promise.all(statsPromises);
        playersWithStats.push(...results);
      }
      
      // Sort forwards by points (goals + assists)
      const sortedForwards = playersWithStats
        .filter(p => ['C', 'L', 'R', 'LW', 'RW', 'F'].includes(p.position_code?.toUpperCase()))
        .sort((a, b) => {
          const aPoints = (a.seasonStats?.points || 0);
          const bPoints = (b.seasonStats?.points || 0);
          return bPoints - aPoints;
        })
        .slice(0, 5); // Top 5 forwards
      
      // Sort defensemen by points
      const sortedDefensemen = playersWithStats
        .filter(p => ['D'].includes(p.position_code?.toUpperCase()))
        .sort((a, b) => {
          const aPoints = (a.seasonStats?.points || 0);
          const bPoints = (b.seasonStats?.points || 0);
          return bPoints - aPoints;
        })
        .slice(0, 3); // Top 3 defensemen
      
      // Sort goalies by games played (starter indication)
      const sortedGoalies = playersWithStats
        .filter(p => ['G'].includes(p.position_code?.toUpperCase()))
        .sort((a, b) => {
          const aGames = (a.seasonStats?.games_played || 0);
          const bGames = (b.seasonStats?.games_played || 0);
          return bGames - aGames;
        })
        .slice(0, 2); // Top 2 goalies
      
      return {
        forwards: sortedForwards.map(p => ({
          name: p.full_name || `${p.first_name} ${p.last_name}`,
          position: p.position_code,
          goals: p.seasonStats?.goals || 0,
          assists: p.seasonStats?.assists || 0,
          points: p.seasonStats?.points || 0,
          plusMinus: p.seasonStats?.plus_minus || 0,
          gamesPlayed: p.seasonStats?.games_played || 0
        })),
        defensemen: sortedDefensemen.map(p => ({
          name: p.full_name || `${p.first_name} ${p.last_name}`,
          position: 'D',
          goals: p.seasonStats?.goals || 0,
          assists: p.seasonStats?.assists || 0,
          points: p.seasonStats?.points || 0,
          plusMinus: p.seasonStats?.plus_minus || 0,
          gamesPlayed: p.seasonStats?.games_played || 0
        })),
        goalies: sortedGoalies.map(p => ({
          name: p.full_name || `${p.first_name} ${p.last_name}`,
          position: 'G',
          gamesPlayed: p.seasonStats?.games_played || 0,
          wins: p.seasonStats?.wins || 0,
          losses: p.seasonStats?.losses || 0,
          savePct: p.seasonStats?.save_pct ? (p.seasonStats.save_pct * 100).toFixed(1) : null,
          gaa: p.seasonStats?.goals_against_average?.toFixed(2) || null,
          shutouts: p.seasonStats?.shutouts || 0
        }))
      };
    };
    
    const [homeKeyPlayers, awayKeyPlayers] = await Promise.all([
      processTeamRoster(homePlayers, homeTeam),
      processTeamRoster(awayPlayers, awayTeam)
    ]);
    
    // NOTE: Roster verification now handled by Gemini Grounding in injury/context fetching
    // BDL API provides accurate roster data, so explicit verification is rarely needed
    
    const homeCount = (homeKeyPlayers?.forwards?.length || 0) + (homeKeyPlayers?.defensemen?.length || 0) + (homeKeyPlayers?.goalies?.length || 0);
    const awayCount = (awayKeyPlayers?.forwards?.length || 0) + (awayKeyPlayers?.defensemen?.length || 0) + (awayKeyPlayers?.goalies?.length || 0);
    
    console.log(`[Scout Report] ✓ NHL Key players: ${homeTeam} (${homeCount} players), ${awayTeam} (${awayCount} players)`);
    
    // Return BOTH: RotoWire lineups (from Gemini Grounding) AND BDL roster data
    // If we have RotoWire data, prioritize it (has injury context)
    if (groundingRosterData) {
      console.log(`[Scout Report] Returning NHL data with RotoWire lineups + BDL roster`);
      return {
        rotoWireLineups: groundingRosterData,
        home: homeKeyPlayers,
        away: awayKeyPlayers,
        source: 'Gemini Grounding + BDL'
      };
    }
    
    return {
      home: homeKeyPlayers,
      away: awayKeyPlayers
    };
  } catch (error) {
    console.error('[Scout Report] Error fetching NHL key players:', error.message);
    return null;
  }
}

/**
 * Fetch key players for both NBA teams
 * Uses active roster + season stats to show who's ACTUALLY on the team
 * CRITICAL: Prevents hallucinations about traded players (e.g., Luka Doncic)
 * ENHANCED: Now sorts by PPG to show the MOST SIGNIFICANT players
 */
async function fetchNbaKeyPlayers(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (bdlSport !== 'basketball_nba') {
      return null;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // NBA: BDL roster data — top players by PPG (no Grounding lineups needed)
    // Gary doesn't need starters — minutes/PPG ranking is what matters
    // ═══════════════════════════════════════════════════════════════════════════
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for NBA roster lookup');
      return null;
    }
    
    console.log(`[Scout Report] Fetching NBA stats from BDL for ${homeTeam} (ID: ${homeTeamData?.id}) and ${awayTeam} (ID: ${awayTeamData?.id})`);

    // Fetch active players for each team
    const [homePlayersRaw, awayPlayersRaw] = await Promise.all([
      homeTeamData ? ballDontLieService.getPlayersActive(bdlSport, { team_ids: [homeTeamData.id], per_page: 20 }) : null,
      awayTeamData ? ballDontLieService.getPlayersActive(bdlSport, { team_ids: [awayTeamData.id], per_page: 20 }) : null
    ]);
    
    // ⭐ CRITICAL FIX: getPlayersActive returns {data: [], meta: {}} NOT a plain array
    // Extract the actual player arrays from the response object
    const homePlayers = Array.isArray(homePlayersRaw) ? homePlayersRaw : 
                        (homePlayersRaw?.data && Array.isArray(homePlayersRaw.data)) ? homePlayersRaw.data : [];
    const awayPlayers = Array.isArray(awayPlayersRaw) ? awayPlayersRaw : 
                        (awayPlayersRaw?.data && Array.isArray(awayPlayersRaw.data)) ? awayPlayersRaw.data : [];
    
    console.log(`[Scout Report] NBA roster: ${homeTeam} (${homePlayers.length} players), ${awayTeam} (${awayPlayers.length} players)`);
    
    // ⭐ HARD FAIL: If we can't get roster data, we CANNOT make picks (prevents hallucination)
    // CRITICAL: Throw error to CRASH the process - do NOT silently pass
    if (homePlayers.length === 0 || awayPlayers.length === 0) {
      const errorMsg = `CRITICAL ROSTER FAILURE: Missing NBA roster data! Home ${homeTeam}: ${homePlayers.length} players, Away ${awayTeam}: ${awayPlayers.length} players. Gary would hallucinate player names without real roster data. FIX THE BDL API ISSUE.`;
      console.error(`[Scout Report] ❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    // Get current season for stats lookup
    // BDL API convention: season=2025 means the 2025-26 NBA season
    // Oct-Dec: we're in the first half of currentYear season
    const season = nbaSeason();
    
    // Collect all player IDs to fetch stats
    const allPlayerIds = [
      ...homePlayers.map(p => p.id),
      ...awayPlayers.map(p => p.id)
    ].filter(id => id);
    
    // Fetch season stats for all players to determine significance
    let playerStats = {};
    if (allPlayerIds.length > 0) {
      try {
        playerStats = await ballDontLieService.getNbaPlayerSeasonStatsForProps(allPlayerIds, season);
        console.log(`[Scout Report] Fetched stats for ${Object.keys(playerStats).length} NBA players`);
      } catch (e) {
        console.warn('[Scout Report] Could not fetch player stats, using roster order:', e.message);
      }
    }
    
    // Process roster to get top players SORTED BY ACTUAL IMPORTANCE (PPG)
    // OUT players are handled separately in the injury report — no filtering needed here
    const processRoster = (players, teamName) => {
      if (!players || players.length === 0) return null;

      const playersWithStats = players.map(p => {
        const stats = playerStats[p.id] || {};
        const fullName = `${p.first_name} ${p.last_name}`;
        return {
          name: fullName,
          position: p.position || 'N/A',
          jerseyNumber: p.jersey_number,
          id: p.id,
          ppg: parseFloat(stats.ppg) || 0,
          mpg: parseFloat(stats.mpg) || 0,
          rpg: parseFloat(stats.rpg) || 0,
          apg: parseFloat(stats.apg) || 0
        };
      });

      // Sort by PPG (descending) to get actual key players
      playersWithStats.sort((a, b) => b.ppg - a.ppg);

      // Take top 10 by PPG (the most significant players)
      const keyPlayers = playersWithStats.slice(0, 10);

      const topScorers = keyPlayers.slice(0, 5).map(p => `${p.name} (${p.ppg.toFixed(1)} PPG)`);
      console.log(`[Scout Report] ${teamName} key players (by PPG): ${topScorers.join(', ')}`);

      return keyPlayers;
    };

    const homeKeyPlayers = processRoster(homePlayers, homeTeam);
    const awayKeyPlayers = processRoster(awayPlayers, awayTeam);
    
    return {
      home: homeKeyPlayers,
      away: awayKeyPlayers,
      homeTeamName: homeTeam,
      awayTeamName: awayTeam
    };
  } catch (error) {
    console.error('[Scout Report] Error fetching NBA key players:', error.message);
    return null;
  }
}

/**
 * Detect players returning from absence for tonight's game.
 * Uses L5 playersByGame data + roster + injury report to find players who:
 * - Are on the active roster (top 10 by PPG — meaningful contributors)
 * - Did NOT play in the team's most recent game
 * - Are NOT listed as OUT/DOUBTFUL in the injury report
 *
 * @param {Object} rosterDepth - nbaRosterDepth with .home, .away, .homeL5, .awayL5
 * @param {Object} injuries - { home: [...], away: [...] }
 * @param {Array} recentHome - recent home team games (with .id)
 * @param {Array} recentAway - recent away team games (with .id)
 * @param {string} homeTeam - home team name
 * @param {string} awayTeam - away team name
 * @returns {string} formatted RETURNING PLAYERS section or ''
 */
function detectReturningPlayers(rosterDepth, injuries, recentHome, recentAway, homeTeam, awayTeam) {
  if (!rosterDepth) return '';

  const results = [];

  const teamConfigs = [
    { label: 'HOME', players: rosterDepth.home, l5: rosterDepth.homeL5, recent: recentHome, inj: injuries?.home || [], name: homeTeam },
    { label: 'AWAY', players: rosterDepth.away, l5: rosterDepth.awayL5, recent: recentAway, inj: injuries?.away || [], name: awayTeam }
  ];

  for (const { label, players, l5, recent, inj, name } of teamConfigs) {
    if (!players || !l5?.playersByGame) continue;

    const playersByGame = l5.playersByGame;
    // Get game IDs that actually have player data (filters out today's unplayed game)
    const allGameIds = (recent || []).map(g => g.id).filter(Boolean).slice(0, 5);
    const gameIds = allGameIds.filter(gid => playersByGame[gid] && playersByGame[gid].length > 0).slice(0, 3);
    if (gameIds.length < 2) continue;

    // recentGames is sorted most-recent-first from fetchRecentGames
    // gameIds[0] is the most recent PLAYED game (not today's unplayed game)
    const lastGameId = gameIds[0];
    // Build set of players who played in the last game
    const lastGamePlayers = new Set();
    for (const p of (playersByGame[lastGameId] || [])) {
      lastGamePlayers.add(p.name.toLowerCase().trim());
    }

    // Build map: playerName → count of games they appeared in (out of L5)
    const playerGameCounts = {};
    for (const gid of gameIds) {
      for (const p of (playersByGame[gid] || [])) {
        const pName = p.name.toLowerCase().trim();
        playerGameCounts[pName] = (playerGameCounts[pName] || 0) + 1;
      }
    }

    // Get OUT/DOUBTFUL players from injury report
    const outPlayers = new Set();
    for (const injury of inj) {
      const status = (injury.status || '').toLowerCase();
      if (status === 'out' || status.startsWith('out') || status.includes('out for season') || status === 'doubtful' || status.includes('suspended')) {
        const pName = typeof injury.player === 'string' ? injury.player :
          `${injury.player?.first_name || ''} ${injury.player?.last_name || ''}`.trim();
        outPlayers.add(pName.toLowerCase().trim());
      }
    }

    // Check each roster player for returning status
    const returning = [];
    for (const player of players) {
      const pName = (player.name || `${player.first_name || ''} ${player.last_name || ''}`).trim();
      const pNameLower = pName.toLowerCase();

      // Skip if they played in the last game (exact or fuzzy)
      if (lastGamePlayers.has(pNameLower)) continue;
      if ([...lastGamePlayers].some(lp => playerNamesMatch(lp, pNameLower))) continue;

      // Skip if they are OUT/DOUBTFUL
      if (outPlayers.has(pNameLower)) continue;
      if ([...outPlayers].some(op => playerNamesMatch(op, pNameLower))) continue;

      // Count how many of the L5 games they played in
      const gamesPlayed = playerGameCounts[pNameLower] ||
        Object.entries(playerGameCounts).find(([k]) => playerNamesMatch(k, pNameLower))?.[1] || 0;
      const gamesMissed = gameIds.length - gamesPlayed;

      // Only flag if they missed the last game and are a meaningful player
      if (gamesMissed >= 1) {
        // NCAAB has ppg (string, per-game), pts (total season); NBA has pts (per-game number)
        const ppg = parseFloat(player.ppg) || player.pts || 0;
        const rpg = parseFloat(player.reb) || 0;
        const apg = parseFloat(player.ast) || 0;

        // Check if they have an injury status (QUESTIONABLE/PROBABLE/GTD)
        let injuryStatus = 'Available';
        for (const injury of inj) {
          const injName = typeof injury.player === 'string' ? injury.player :
            `${injury.player?.first_name || ''} ${injury.player?.last_name || ''}`.trim();
          if (playerNamesMatch(injName, pName)) {
            injuryStatus = `${injury.status}${injury.injury ? ` (${injury.injury})` : ''}`;
            break;
          }
        }

        returning.push({
          name: pName,
          gamesMissed,
          gamesPlayed,
          ppg: typeof ppg === 'number' ? ppg.toFixed(1) : ppg,
          rpg: typeof rpg === 'number' ? rpg.toFixed(1) : rpg,
          apg: typeof apg === 'number' ? apg.toFixed(1) : apg,
          injuryStatus,
          // Team-share percentages for impact context
          pct_pts: player.pct_pts || 0,
          pct_ast: player.pct_ast || 0,
          pct_fga: player.pct_fga || 0,
          pct_reb: player.pct_reb || 0
        });
      }
    }

    if (returning.length > 0) {
      returning.sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg));
      console.log(`[Returning Players] ${name}: ${returning.map(r => `${r.name} (${r.ppg} PPG, missed ${r.gamesMissed})`).join(', ')}`);
      results.push({ team: name, players: returning });
    }
  }

  if (results.length === 0) return '';

  const lines = [];
  lines.push('');
  lines.push('RETURNING PLAYERS (DID NOT PLAY LAST GAME — NOW AVAILABLE)');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('These players were ABSENT from their team\'s most recent game but are');
  lines.push('NOT listed as OUT. Investigate: Are they back tonight? What\'s the impact?');
  lines.push('');

  for (const { team, players } of results) {
    lines.push(`  ${team}:`);
    for (const p of players) {
      lines.push(`    ${p.name} — Missed ${p.gamesMissed} of last ${p.gamesMissed + p.gamesPlayed} games | ${p.ppg} PPG / ${p.rpg} RPG / ${p.apg} APG | Status: ${p.injuryStatus}`);
      // Show team-share context if available — helps Gary assess the impact of this player returning
      const shareParts = [];
      if (p.pct_pts) shareParts.push(`${(p.pct_pts * 100).toFixed(1)}% PTS`);
      if (p.pct_ast) shareParts.push(`${(p.pct_ast * 100).toFixed(1)}% AST`);
      if (p.pct_fga) shareParts.push(`${(p.pct_fga * 100).toFixed(1)}% FGA`);
      if (shareParts.length > 0) {
        lines.push(`      Team Share: ${shareParts.join(' | ')}`);
      }
    }
    lines.push('');
  }

  lines.push('Ask: Has the line moved to account for these returns? Is there a rust/minutes');
  lines.push('restriction factor? How does this change the team\'s ceiling tonight?');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return lines.join('\n');
}

/**
 * Format NBA roster depth section
 * Shows top 10 players per team (starters + key bench) with base + advanced stats
 * Cross-references with injury data to mark availability
 * Includes: Four Factors, Tier 1 predictive stats, Unit comparison
 */
function formatNbaRosterDepth(homeTeam, awayTeam, rosterDepth, injuries) {
  if (!rosterDepth || (!rosterDepth.home?.length && !rosterDepth.away?.length)) {
    return '';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOUR FACTORS & TIER 1 PREDICTIVE STATS (Team-Level Aggregates)
  // These are the most predictive stats in basketball - use them as PRIMARY evidence
  // ═══════════════════════════════════════════════════════════════════════════
  // Use REAL team-level stats from BDL team_season_averages endpoint (not player weight-averaging)
  const teamStatsToFourFactors = (teamStats) => {
    if (!teamStats) return null;
    return {
      efgPct: (teamStats.efg_pct || 0) * 100,
      tsPct: (teamStats.ts_pct || 0) * 100,
      netRating: teamStats.net_rating || 0,
      offRating: teamStats.off_rating || 0,
      defRating: teamStats.def_rating || 0,
      pace: teamStats.pace || 0,
      orebPct: (teamStats.oreb_pct || 0) * 100,
      tovPct: (teamStats.tm_tov_pct || 0) * 100,
      gp: teamStats.gp || 0
    };
  };

  const homeFourFactors = teamStatsToFourFactors(rosterDepth.homeTeamStats);
  const awayFourFactors = teamStatsToFourFactors(rosterDepth.awayTeamStats);

  // Build a set of injured player names for quick lookup (including fresh injury tagging)
  const injuredPlayers = new Map();
  const allInjuries = [...(injuries?.home || []), ...(injuries?.away || [])];
  for (const inj of allInjuries) {
    const name = inj.name?.toLowerCase() || `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.toLowerCase().trim();
    if (name && name !== 'unknown') {
      const daysSince = inj.daysSinceReport || inj.days_since || null;
      injuredPlayers.set(name, {
        status: inj.status || 'Unknown',
        description: inj.description || inj.comment || '',
        daysSinceReport: daysSince
      });
    }
  }
  
  const getInjuryStatus = (playerName) => getInjuryStatusFromMap(playerName, injuredPlayers);
  const isPlayerOut = (playerName) => isPlayerOutFromMap(playerName, injuredPlayers);

  // Helper to format a single player row with base + advanced stats
  const formatPlayerRow = (player, index) => {
    const injury = getInjuryStatus(player.name);
    let statusNote = '';
    if (injury) {
      statusNote = ` [${injury.status.toUpperCase()}]`;
    }

    // Format shooting percentages (show as whole numbers with %)
    const fgPct = player.fg_pct ? `${(player.fg_pct * 100).toFixed(1)}%` : 'N/A';
    const fg3Pct = player.fg3_pct ? `${(player.fg3_pct * 100).toFixed(1)}%` : 'N/A';

    // Format advanced stats (TIER 1 PREDICTIVE)
    const efgPct = player.efg_pct ? `${(player.efg_pct * 100).toFixed(1)}%` : null;
    const tsPct = player.ts_pct ? `${(player.ts_pct * 100).toFixed(1)}%` : null;
    const netRtg = player.net_rating ? (player.net_rating >= 0 ? `+${player.net_rating.toFixed(1)}` : player.net_rating.toFixed(1)) : null;
    const plusMinus = player.plus_minus ? (player.plus_minus >= 0 ? `+${player.plus_minus.toFixed(1)}` : player.plus_minus.toFixed(1)) : null;

    // Format stats - only show if player has meaningful minutes
    const usageStr = player.usg_pct ? `USG: ${(player.usg_pct * 100).toFixed(1)}%` : '';

    // Format team-share percentages (from type=usage endpoint)
    const teamShareParts = [];
    if (player.pct_pts) teamShareParts.push(`${(player.pct_pts * 100).toFixed(1)}% PTS`);
    if (player.pct_reb) teamShareParts.push(`${(player.pct_reb * 100).toFixed(1)}% REB`);
    if (player.pct_ast) teamShareParts.push(`${(player.pct_ast * 100).toFixed(1)}% AST`);
    if (player.pct_fga) teamShareParts.push(`${(player.pct_fga * 100).toFixed(1)}% FGA`);
    const teamShareLine = teamShareParts.length > 0 ? `\n       Team Share: ${teamShareParts.join(' | ')}` : '';

    if (player.min > 5) {
      // Line 1: Base stats (PPG, REB, AST, MIN)
      const baseLine = `${player.pts.toFixed(1)} PPG | ${player.reb.toFixed(1)} REB | ${player.ast.toFixed(1)} AST | ${player.min.toFixed(1)} MIN`;
      // Line 2: Advanced/efficiency stats (eFG%, TS%, Net Rating, +/-, USG%)
      const advParts = [];
      if (efgPct) advParts.push(`eFG: ${efgPct}`);
      if (tsPct) advParts.push(`TS: ${tsPct}`);
      if (netRtg) advParts.push(`NetRtg: ${netRtg}`);
      if (plusMinus) advParts.push(`+/-: ${plusMinus}`);
      if (usageStr) advParts.push(usageStr);
      const advLine = advParts.length > 0 ? `\n       ${advParts.join(' | ')}` : '';

      return `  ${player.name}${statusNote} - ${baseLine}${advLine}${teamShareLine}`;
    } else {
      return `  ${player.name}${statusNote} - ${player.pts.toFixed(1)} PPG | Limited role${usageStr ? ` | ${usageStr}` : ''}${teamShareLine}`;
    }
  };
  
  // Filter out players who are definitively OUT
  const availableHomePlayers = (rosterDepth.home || []).filter(p => !isPlayerOut(p.name));
  const availableAwayPlayers = (rosterDepth.away || []).filter(p => !isPlayerOut(p.name));
  
  // Count how many players were filtered out
  const homeOutCount = (rosterDepth.home?.length || 0) - availableHomePlayers.length;
  const awayOutCount = (rosterDepth.away?.length || 0) - availableAwayPlayers.length;
  
  // Format team rosters
  const lines = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // FOUR FACTORS / TIER 1 PREDICTIVE STATS SECTION
  // Show team-level aggregates FIRST so Gary has predictive data immediately
  // ═══════════════════════════════════════════════════════════════════════════
  if (homeFourFactors || awayFourFactors) {
    lines.push('');
    lines.push('TIER 1 PREDICTIVE STATS — FOUR FACTORS (Dean Oliver)');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('  1. eFG% (Effective FG%) - Shooting efficiency adjusted for 3s');
    lines.push('  2. TOV% (Turnover Rate) - Possessions lost to turnovers');
    lines.push('  3. ORB% (Offensive Rebound Rate) - Second chance opportunities');
    lines.push('  4. FT Rate (Free Throw Rate) - Getting to the line');
    lines.push('');
    lines.push('Net Rating (ORtg - DRtg) = Points per 100 possessions differential');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');

    const formatTeamStats = (ff, teamName, label) => {
      if (!ff) return [`[${label}] ${teamName}: Stats unavailable`];
      const netRtgStr = ff.netRating >= 0 ? `+${ff.netRating.toFixed(1)}` : ff.netRating.toFixed(1);
      const offRtgStr = ff.offRating > 0 ? ff.offRating.toFixed(1) : 'N/A';
      const defRtgStr = ff.defRating > 0 ? ff.defRating.toFixed(1) : 'N/A';
      return [
        `[${label}] ${teamName.toUpperCase()}:`,
        `  eFG%: ${ff.efgPct.toFixed(1)}% | TS%: ${ff.tsPct.toFixed(1)}% | Net Rating: ${netRtgStr}`,
        `  ORtg: ${offRtgStr} | DRtg: ${defRtgStr} | Pace: ${ff.pace?.toFixed(1) || 'N/A'} | GP: ${ff.gp || '?'}`
      ];
    };

    const homeTeamName = rosterDepth.homeTeamName || homeTeam;
    const awayTeamName = rosterDepth.awayTeamName || awayTeam;

    lines.push(...formatTeamStats(homeFourFactors, homeTeamName, 'HOME'));
    lines.push('');
    lines.push(...formatTeamStats(awayFourFactors, awayTeamName, 'AWAY'));
    lines.push('');

    // Comparison summary — raw numbers only, no "winner" labels
    if (homeFourFactors && awayFourFactors) {
      lines.push('EFFICIENCY COMPARISON:');
      lines.push(`  eFG%: ${homeTeamName} ${homeFourFactors.efgPct.toFixed(1)}% | ${awayTeamName} ${awayFourFactors.efgPct.toFixed(1)}%`);
      lines.push(`  Net Rating: ${homeTeamName} ${homeFourFactors.netRating >= 0 ? '+' : ''}${homeFourFactors.netRating.toFixed(1)} | ${awayTeamName} ${awayFourFactors.netRating >= 0 ? '+' : ''}${awayFourFactors.netRating.toFixed(1)}`);
      lines.push('');
    }

    // L5 EFFICIENCY vs SEASON section (if L5 data available)
    const homeL5 = rosterDepth.homeL5;
    const awayL5 = rosterDepth.awayL5;
    if (homeL5?.efficiency || awayL5?.efficiency) {
      lines.push('');
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('L5 EFFICIENCY vs SEASON (Last 5 Games)');
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('');

      const formatL5Section = (teamName, l5Data, fourFactors, roster, label) => {
        if (!l5Data?.efficiency) return;
        const eff = l5Data.efficiency;
        lines.push(`[${label}] ${teamName}:`);
        lines.push(`  L5:      eFG% ${eff.efg_pct || '?'} | TS% ${eff.ts_pct || '?'} | Approx ORtg ${eff.approx_ortg || '?'} | DRtg ${eff.approx_drtg || '?'} | Net ${eff.approx_net_rtg || '?'}`);
        if (eff.opp_efg_pct || eff.opp_fg3_pct) {
          lines.push(`  L5 DEF:  Opp eFG% ${eff.opp_efg_pct || '?'} | Opp 3P% ${eff.opp_fg3_pct || '?'} | Opp PPG ${eff.opp_ppg || '?'}`);
        }
        if (fourFactors) {
          lines.push(`  Season:  eFG% ${fourFactors.efgPct?.toFixed(1) || '?'} | TS% ${fourFactors.tsPct?.toFixed(1) || '?'} | ORtg ${fourFactors.offRating?.toFixed(1) || '?'} | DRtg ${fourFactors.defRating?.toFixed(1) || '?'} | Net ${fourFactors.netRating?.toFixed(1) || '?'}`);
        }

        // Roster context: compare L5 game participation against expected starters
        if (l5Data.playersByGame && roster && roster.length > 0) {
          // Top 5 players by minutes = expected key players
          const keyPlayers = roster.slice(0, 5);
          const totalGames = Object.keys(l5Data.playersByGame).length;
          const missingPlayers = [];

          for (const player of keyPlayers) {
            let gamesPlayed = 0;
            for (const gameId of Object.keys(l5Data.playersByGame)) {
              const gamePlayers = l5Data.playersByGame[gameId];
              // Match by player ID (most reliable)
              const found = gamePlayers.some(p => p.playerId === player.id);
              if (found) gamesPlayed++;
            }
            if (gamesPlayed < totalGames) {
              missingPlayers.push({
                name: player.name,
                ppg: player.pts?.toFixed(1) || '?',
                gamesPlayed,
                totalGames
              });
            }
          }

          // Check: key players who PLAYED L5 games but are OUT TONIGHT
          // These stats include contributions from a player who won't play
          const outTonight = [];
          for (const player of keyPlayers) {
            if (!isPlayerOut(player.name)) continue;
            let gamesPlayed = 0;
            for (const gameId of Object.keys(l5Data.playersByGame)) {
              const gamePlayers = l5Data.playersByGame[gameId];
              const found = gamePlayers.some(p => p.playerId === player.id);
              if (found) gamesPlayed++;
            }
            if (gamesPlayed > 0) {
              outTonight.push({ name: player.name, ppg: player.pts?.toFixed(1) || '?', gamesPlayed, totalGames });
            }
          }

          if (missingPlayers.length === 0 && outTonight.length === 0) {
            lines.push(`  L5 Roster: All 5 key players played all ${totalGames} L5 games.`);
          } else {
            for (const mp of missingPlayers) {
              lines.push(`  L5 Roster: ${mp.name} (${mp.ppg} PPG) — played ${mp.gamesPlayed} of ${mp.totalGames} L5 games. Tonight: STARTING.`);
            }
          }

          if (outTonight.length > 0) {
            lines.push(`  *** L5 STATS INCLUDE PLAYERS WHO ARE OUT TONIGHT ***`);
            for (const p of outTonight) {
              lines.push(`     ${p.name} (${p.ppg} PPG) — played ${p.gamesPlayed}/${p.totalGames} L5 games but is OUT TONIGHT`);
            }
            lines.push(`     Ask: What do these stats look like WITHOUT this player?`);
          }
        }
        lines.push('');
      };

      formatL5Section(homeTeamName, homeL5, homeFourFactors, rosterDepth.home, 'HOME');
      formatL5Section(awayTeamName, awayL5, awayFourFactors, rosterDepth.away, 'AWAY');
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
  }

  // Roster section header
  lines.push('');
  lines.push('AVAILABLE ROSTER — TOP 10 PLAYERS BY MINUTES (W/ ADVANCED + TEAM SHARE STATS)');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('Players marked OUT/IR are excluded. Questionable players are shown.');
  lines.push('Each player shows: Base stats (PPG/REB/AST) + Advanced (eFG%/TS%/NetRtg/+/-/USG%)');
  lines.push('  + Team Share (% of team PTS/REB/AST/FGA this player accounts for)');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  
  // Helper: compute team concentration summary for top 3 players
  const getTeamConcentration = (players) => {
    if (!players || players.length < 3) return null;
    const top3 = players.slice(0, 3);
    const pctPtsSum = top3.reduce((sum, p) => sum + (p.pct_pts || 0), 0);
    const pctAstSum = top3.reduce((sum, p) => sum + (p.pct_ast || 0), 0);
    if (pctPtsSum === 0 && pctAstSum === 0) return null;
    return {
      pctPts: (pctPtsSum * 100).toFixed(1),
      pctAst: (pctAstSum * 100).toFixed(1),
      names: top3.map(p => p.name.split(' ').pop()).join('/')
    };
  };

  // Home team
  if (availableHomePlayers.length > 0) {
    const homeTeamName = rosterDepth.homeTeamName || homeTeam;
    const outNote = homeOutCount > 0 ? ` (${homeOutCount} player${homeOutCount > 1 ? 's' : ''} OUT)` : '';
    lines.push(`[HOME] ${homeTeamName.toUpperCase()}${outNote}:`);

    availableHomePlayers.forEach((player, index) => {
      lines.push(formatPlayerRow(player, index));
      // Add visual separator between starters and bench (after top 5)
      if (index === 4 && availableHomePlayers.length > 5) {
        lines.push('  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ (BENCH) ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─');
      }
    });
    // Team concentration summary
    const homeConc = getTeamConcentration(availableHomePlayers);
    if (homeConc) {
      lines.push(`  TEAM CONCENTRATION: Top 3 (${homeConc.names}) account for ${homeConc.pctPts}% of points, ${homeConc.pctAst}% of assists`);
    }
    lines.push('');
  }

  // Away team
  if (availableAwayPlayers.length > 0) {
    const awayTeamName = rosterDepth.awayTeamName || awayTeam;
    const outNote = awayOutCount > 0 ? ` (${awayOutCount} player${awayOutCount > 1 ? 's' : ''} OUT)` : '';
    lines.push(`[AWAY] ${awayTeamName.toUpperCase()}${outNote}:`);

    availableAwayPlayers.forEach((player, index) => {
      lines.push(formatPlayerRow(player, index));
      // Add visual separator between starters and bench (after top 5)
      if (index === 4 && availableAwayPlayers.length > 5) {
        lines.push('  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ (BENCH) ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─');
      }
    });
    // Team concentration summary
    const awayConc = getTeamConcentration(availableAwayPlayers);
    if (awayConc) {
      lines.push(`  TEAM CONCENTRATION: Top 3 (${awayConc.names}) account for ${awayConc.pctPts}% of points, ${awayConc.pctAst}% of assists`);
    }
    lines.push('');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UNIT SUMMARIES - Starters (Unit 1) vs Bench (Unit 2) analysis - OPTION B (Advanced)
  // First 5 by minutes = Starters, Next 5 = Key Bench (Top 10 rotation)
  // Includes: Combined PPG, +/-, eFG%, Net Rating, Depth Ratio
  // ═══════════════════════════════════════════════════════════════════════════
  const calculateUnitStats = (players) => {
    if (!players || players.length < 5) return null;
    const starters = players.slice(0, 5);
    const bench = players.slice(5, 10); // Now top 10 players

    const sumStats = (arr) => {
      const ppg = arr.reduce((sum, p) => sum + (p.pts || 0), 0);
      const rpg = arr.reduce((sum, p) => sum + (p.reb || 0), 0);
      const apg = arr.reduce((sum, p) => sum + (p.ast || 0), 0);
      const min = arr.reduce((sum, p) => sum + (p.min || 0), 0);
      const plusMinus = arr.reduce((sum, p) => sum + (p.plus_minus || 0), 0);

      // Calculate weighted average efficiency (weighted by minutes)
      let weightedEfg = 0, weightedTs = 0, weightedNetRtg = 0, totalWeight = 0;
      for (const p of arr) {
        const weight = p.min || 0;
        if (weight > 0) {
          totalWeight += weight;
          weightedEfg += (p.efg_pct || 0) * weight;
          weightedTs += (p.ts_pct || 0) * weight;
          weightedNetRtg += (p.net_rating || 0) * weight;
        }
      }

      return {
        ppg,
        rpg,
        apg,
        min,
        plusMinus,
        efgPct: totalWeight > 0 ? (weightedEfg / totalWeight) * 100 : 0,
        tsPct: totalWeight > 0 ? (weightedTs / totalWeight) * 100 : 0,
        netRating: totalWeight > 0 ? weightedNetRtg / totalWeight : 0,
        count: arr.length
      };
    };

    const starterStats = sumStats(starters);
    const benchStats = sumStats(bench);
    const totalPPG = starterStats.ppg + benchStats.ppg;

    return {
      starters: starterStats,
      bench: benchStats,
      benchRatio: totalPPG > 0 ? ((benchStats.ppg / totalPPG) * 100).toFixed(1) : '0'
    };
  };

  const homeUnits = calculateUnitStats(availableHomePlayers);
  const awayUnits = calculateUnitStats(availableAwayPlayers);

  if (homeUnits || awayUnits) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('UNIT COMPARISON — STARTERS VS BENCH (ADVANCED METRICS)');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const formatUnit = (unitStats, label) => {
      const plusMinusStr = unitStats.plusMinus >= 0 ? `+${unitStats.plusMinus.toFixed(1)}` : unitStats.plusMinus.toFixed(1);
      const netRtgStr = unitStats.netRating >= 0 ? `+${unitStats.netRating.toFixed(1)}` : unitStats.netRating.toFixed(1);
      return [
        `  ${label}: ${unitStats.ppg.toFixed(1)} PPG | +/-: ${plusMinusStr} | ${unitStats.min.toFixed(0)} MIN`,
        `       eFG%: ${unitStats.efgPct.toFixed(1)}% | TS%: ${unitStats.tsPct.toFixed(1)}% | NetRtg: ${netRtgStr}`
      ];
    };

    if (homeUnits) {
      const homeTeamName = rosterDepth.homeTeamName || homeTeam;
      lines.push(`[HOME] ${homeTeamName.toUpperCase()}:`);
      lines.push(...formatUnit(homeUnits.starters, 'Starters (Unit 1)'));
      if (homeUnits.bench.count > 0) {
        lines.push(...formatUnit(homeUnits.bench, 'Bench (Unit 2)   '));
        lines.push(`  Bench Contribution: ${homeUnits.benchRatio}% of top-10 scoring`);
      }
      lines.push('');
    }

    if (awayUnits) {
      const awayTeamName = rosterDepth.awayTeamName || awayTeam;
      lines.push(`[AWAY] ${awayTeamName.toUpperCase()}:`);
      lines.push(...formatUnit(awayUnits.starters, 'Starters (Unit 1)'));
      if (awayUnits.bench.count > 0) {
        lines.push(...formatUnit(awayUnits.bench, 'Bench (Unit 2)   '));
        lines.push(`  Bench Contribution: ${awayUnits.benchRatio}% of top-10 scoring`);
      }
      lines.push('');
    }

    // Compare depth
    if (homeUnits && awayUnits && homeUnits.bench.count > 0 && awayUnits.bench.count > 0) {
      const homeBenchAdv = parseFloat(homeUnits.benchRatio) - parseFloat(awayUnits.benchRatio);
      lines.push(`DEPTH COMPARISON: ${rosterDepth.homeTeamName} bench ${homeUnits.benchRatio}% | ${rosterDepth.awayTeamName} bench ${awayUnits.benchRatio}% (gap: ${Math.abs(homeBenchAdv).toFixed(1)}%)`);
    }
    lines.push('');
    lines.push('Compare bench contribution % and unit Net Rating to assess depth quality.');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
  }

  // Add context note
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const now = new Date();
  const monthName = now.toLocaleString('en-US', { month: 'long' });
  const year = now.getFullYear();
  lines.push(`${year} CONTEXTUAL GUIDE (NBA ONLY):`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`It is ${monthName} ${year}. Note that player rotations and team identities may`);
  lines.push('have shifted significantly from your initial training data (2024/2025).');
  lines.push('  • Review the provided USG% and PPG to understand each player\'s current role.');
  lines.push('  • It is the 2025-26 Season. 2024 rookies (e.g., Sarr, George) are now Sophomores.');
  lines.push('  • Use this 2026 data to verify if a player is a primary option or role player.');
  lines.push('  • Combine these stats with your broader understanding of matchups to');
  lines.push('    reach your conclusion.');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('AVAILABLE ROSTER CONTEXT:');
  lines.push('');
  lines.push('This shows ONLY players expected to play tonight (OUT players filtered).');
  lines.push('Use this to evaluate actual available depth:');
  lines.push('');
  lines.push('  • How many double-digit scorers are AVAILABLE tonight?');
  lines.push('  • Does the remaining roster still have quality depth?');
  lines.push('  • Does your case explain what YOUR PICK does well with who\'s playing?');
  lines.push('');
  lines.push('[NOTE] REFERENCE THIS when evaluating injury impact:');
  lines.push('   - Look at WHO REMAINS, not just who\'s missing');
  lines.push('   - A team with 3-4 capable scorers available doesn\'t collapse');
  lines.push('   - Your claims must be verifiable against this available roster');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Format NHL roster depth section
 * Shows top skaters (by TOI) + all goalies with season stats
 * Cross-references with injury data to mark availability
 */
function formatNhlRosterDepth(homeTeam, awayTeam, rosterDepth, injuries) {
  if (!rosterDepth || (!rosterDepth.home?.skaters?.length && !rosterDepth.away?.skaters?.length)) {
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
  
  // Helper to format a skater row
  const formatSkaterRow = (player) => {
    const injury = getInjuryStatus(player.name);
    const status = injury ? '[OUT]' : '[ACTIVE]';
    const injuryNote = injury ? ` - ${injury.status.toUpperCase()}` : '';
    
    // Format TOI per game (convert total minutes to per-game if needed)
    let toiDisplay = 'N/A';
    if (player.toi && player.gp > 0) {
      // BDL returns total TOI in minutes - convert to per game
      const toiPerGame = player.toi / player.gp;
      const minutes = Math.floor(toiPerGame);
      const seconds = Math.round((toiPerGame - minutes) * 60);
      toiDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // Format stats
    const stats = player.gp > 0 
      ? `${player.goals}G | ${player.assists}A | ${player.points}P | ${player.plusMinus >= 0 ? '+' : ''}${player.plusMinus} | ${toiDisplay} TOI/G`
      : `No stats yet`;
    
    return `  ${status} ${player.name} (${player.position})${injuryNote} - ${stats}`;
  };
  
  // Helper to format a goalie row
  const formatGoalieRow = (goalie) => {
    const injury = getInjuryStatus(goalie.name);
    const status = injury ? '[OUT]' : '[ACTIVE]';
    const injuryNote = injury ? ` - ${injury.status.toUpperCase()}` : '';
    
    // Format goalie stats
    const svPct = goalie.svPct ? (goalie.svPct * 100).toFixed(1) + '%' : 'N/A';
    const gaa = goalie.gaa ? goalie.gaa.toFixed(2) : 'N/A';
    const record = `${goalie.wins}-${goalie.losses}-${goalie.otLosses}`;
    
    return `  ${status} ${goalie.name}${injuryNote} - ${record} | ${gaa} GAA | ${svPct} SV% | ${goalie.gamesStarted} GS`;
  };
  
  // Format team rosters
  const lines = [
    '',
    'ROSTER DEPTH — SKATERS & GOALIES (FROM BDL)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'This shows WHO is on each team and their season stats.',
    '   Use this to verify claims about injuries and team depth.',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ''
  ];
  
  // Home team
  if (rosterDepth.home) {
    const teamName = rosterDepth.home.teamName || homeTeam;
    lines.push(`[HOME] ${teamName.toUpperCase()}`);
    
    // Goalies first (critical for NHL)
    if (rosterDepth.home.goalies?.length > 0) {
      lines.push('  GOALIES:');
      rosterDepth.home.goalies.forEach(goalie => {
        lines.push(formatGoalieRow(goalie));
      });
      lines.push('');
    }
    
    // Top skaters
    if (rosterDepth.home.skaters?.length > 0) {
      lines.push('  TOP SKATERS (by TOI):');
      rosterDepth.home.skaters.forEach((player, index) => {
        lines.push(formatSkaterRow(player));
        // Visual separator after top 6 (top 2 lines)
        if (index === 5 && rosterDepth.home.skaters.length > 6) {
          lines.push('  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ (DEPTH) ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─');
        }
      });
    }
    lines.push('');
  }
  
  // Away team
  if (rosterDepth.away) {
    const teamName = rosterDepth.away.teamName || awayTeam;
    lines.push(`[AWAY]  ${teamName.toUpperCase()}`);
    
    // Goalies first
    if (rosterDepth.away.goalies?.length > 0) {
      lines.push('  GOALIES:');
      rosterDepth.away.goalies.forEach(goalie => {
        lines.push(formatGoalieRow(goalie));
      });
      lines.push('');
    }
    
    // Top skaters
    if (rosterDepth.away.skaters?.length > 0) {
      lines.push('  TOP SKATERS (by TOI):');
      rosterDepth.away.skaters.forEach((player, index) => {
        lines.push(formatSkaterRow(player));
        // Visual separator after top 6
        if (index === 5 && rosterDepth.away.skaters.length > 6) {
          lines.push('  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ (DEPTH) ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─');
        }
      });
    }
    lines.push('');
  }
  
  // Add context note
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('NHL ROSTER DEPTH CONTEXT:');
  lines.push('');
  lines.push('  • Verify which GOALIE is starting for each team — check their recent SV% and GAA');
  lines.push('  • A team missing their top scorer still has depth if others produce');
  lines.push('  • Check GAA and SV% for goalie quality, not just W-L record');
  lines.push('');
  lines.push('[NOTE] REFERENCE THIS SECTION when building AND grading Steel Man cases:');
  lines.push('   - If you cite a goalie\'s stats, verify them HERE');
  lines.push('   - If you claim a team will struggle without a skater, check who else');
  lines.push('     is producing (look at their points totals)');
  lines.push('   - Your claims must match this data, not assumptions');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Format NCAAB roster depth section
 * Shows top 9 players per team with season stats (PPG, REB, AST, etc.)
 * Cross-references with injury data to mark availability
 */
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
    'College rosters change frequently (transfer portal). This shows CURRENT active players.',
    '   Use this to verify claims about injuries and team depth.',
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
  
  // NCAAB Four Factors (computed from player season data)
  if (rosterDepth.homeTeamFourFactors || rosterDepth.awayTeamFourFactors) {
    const hff = rosterDepth.homeTeamFourFactors || {};
    const aff = rosterDepth.awayTeamFourFactors || {};
    const homeTeamLabel = (rosterDepth.homeTeamName || homeTeam).toUpperCase();
    const awayTeamLabel = (rosterDepth.awayTeamName || awayTeam).toUpperCase();
    lines.push('NCAAB FOUR FACTORS (computed from season player data)');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`[HOME] ${homeTeamLabel}:`);
    lines.push(`  eFG%: ${hff.efgPct || 'N/A'}% | TOV Rate: ${hff.tovRate || 'N/A'}% | FT Rate: ${hff.ftRate || 'N/A'}% | ORB Rate: ${hff.orebRate || 'N/A'}%`);
    lines.push('');
    lines.push(`[AWAY] ${awayTeamLabel}:`);
    lines.push(`  eFG%: ${aff.efgPct || 'N/A'}% | TOV Rate: ${aff.tovRate || 'N/A'}% | FT Rate: ${aff.ftRate || 'N/A'}% | ORB Rate: ${aff.orebRate || 'N/A'}%`);
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
  }

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

  // Add context note
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('NCAAB ROSTER DEPTH CONTEXT:');
  lines.push('');
  lines.push('  • Investigate: How concentrated is the scoring among the top players?');
  lines.push('  • Investigate: Are the listed players current? (Check transfer portal activity)');
  lines.push('  • Ask: What does the depth distribution tell you about each team\'s roster construction?');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Format NFL roster depth section
 * Shows key skill position players (QB, RB, WR, TE) with depth chart info
 * Cross-references with injury data to mark availability
 */
function formatNflRosterDepth(homeTeam, awayTeam, rosterDepth, injuries) {
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
  const formatPlayerRow = (player) => {
    const injury = getInjuryStatus(player.name) || (player.injuryStatus ? { status: player.injuryStatus } : null);
    const status = injury ? '[OUT]' : '[ACTIVE]';
    const injuryNote = injury ? ` - ${injury.status.toUpperCase()}` : '';
    const depth = player.depth > 1 ? ` (Depth: ${player.depth})` : '';
    
    return `  ${status} ${player.position}: ${player.name}${depth}${injuryNote}`;
  };
  
  // Format team rosters
  const lines = [
    '',
    'NFL ROSTER DEPTH — KEY SKILL PLAYERS (FROM BDL)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'This shows the depth chart for key offensive positions (QB, RB, WR, TE).',
    '   Check injury status for all listed players. Investigate how absences have affected team performance.',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ''
  ];
  
  // Home team
  if (rosterDepth.home?.length > 0) {
    const teamName = rosterDepth.homeTeamName || homeTeam;
    lines.push(`[HOME] ${teamName.toUpperCase()}:`);
    
    // Group by position
    const positions = ['QB', 'RB', 'WR', 'TE'];
    for (const pos of positions) {
      const posPlayers = rosterDepth.home.filter(p => p.position === pos);
      posPlayers.forEach(player => {
        lines.push(formatPlayerRow(player));
      });
    }
    lines.push('');
  }
  
  // Away team
  if (rosterDepth.away?.length > 0) {
    const teamName = rosterDepth.awayTeamName || awayTeam;
    lines.push(`[AWAY]  ${teamName.toUpperCase()}:`);
    
    const positions = ['QB', 'RB', 'WR', 'TE'];
    for (const pos of positions) {
      const posPlayers = rosterDepth.away.filter(p => p.position === pos);
      posPlayers.forEach(player => {
        lines.push(formatPlayerRow(player));
      });
    }
    lines.push('');
  }
  
  // Add context note
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('NFL ROSTER DEPTH CONTEXT:');
  lines.push('');
  lines.push('  • Verify starting QB for both teams — if a backup is in, investigate the team\'s stats with and without the starter');
  lines.push('  • Check WR1/WR2 availability — passing game depends on them');
  lines.push('  • RB depth matters less in modern NFL (RBBC is common)');
  lines.push('');
  lines.push('[NOTE] REFERENCE THIS SECTION when building AND grading Steel Man cases:');
  lines.push('   - If a key player is OUT, check who steps up from the depth chart');
  lines.push('   - NFL injuries are public (Wed-Fri practice reports) — market has time to adjust');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Format NFL playoff history section
 * Shows previous playoff games this season with box scores and key narratives
 * Helps Gary understand how teams have performed under playoff pressure
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name  
 * @param {Object} playoffHistory - { games: [...], teamStats: {...} }
 * @param {number} homeTeamId - Home team BDL ID
 * @param {number} awayTeamId - Away team BDL ID
 */
function formatNflPlayoffHistory(homeTeam, awayTeam, playoffHistory, homeTeamId, awayTeamId) {
  if (!playoffHistory || !playoffHistory.games || playoffHistory.games.length === 0) {
    return '';
  }
  
  const { games, teamStats, playerStats } = playoffHistory;
  
  const lines = [
    '',
    'PREVIOUS PLAYOFF RESULTS THIS SEASON (FROM BDL)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'These are COMPLETED playoff games this postseason. Use this to understand',
    '   how each team has performed under playoff pressure BEFORE tonight.',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ''
  ];
  
  // Helper to format team stats
  const formatBoxScore = (homeStats, awayStats, game) => {
    if (!homeStats && !awayStats) return '   (Box score not available)';
    
    const boxLines = [];
    
    const formatTeamLine = (stats, teamName, isWinner) => {
      if (!stats) return `   ${teamName}: Stats unavailable`;
      const yards = stats.total_yards || 0;
      const firstDowns = stats.first_downs || 0;
      const turnovers = stats.turnovers || 0;
      const possession = stats.possession_time || '?';
      const redZone = stats.red_zone_scores && stats.red_zone_attempts 
        ? `${stats.red_zone_scores}/${stats.red_zone_attempts} (${Math.round(stats.red_zone_scores / stats.red_zone_attempts * 100)}%)`
        : '?';
      const winnerMark = isWinner ? ' [W]' : '';
      return `   ${teamName}${winnerMark}: ${yards} yds | ${firstDowns} 1st | ${turnovers} TO | ${redZone} RZ | ${possession} TOP`;
    };
    
    const homeScore = game.home_team_score || 0;
    const awayScore = game.visitor_team_score || 0;
    const homeWon = homeScore > awayScore;
    
    boxLines.push(formatTeamLine(homeStats, game.home_team?.full_name || 'Home', homeWon));
    boxLines.push(formatTeamLine(awayStats, game.visitor_team?.full_name || 'Away', !homeWon));
    
    return boxLines.join('\n');
  };
  
  // Helper to format key performers for a team (offense + defense)
  const formatKeyPerformers = (gameId, teamId) => {
    if (!playerStats || !playerStats[gameId] || !playerStats[gameId][teamId]) {
      return '';
    }
    
    const teamData = playerStats[gameId][teamId];
    const offenseLines = [];
    const defenseLines = [];
    
    // === OFFENSE ===
    // QB line
    if (teamData.qb) {
      const qb = teamData.qb;
      let qbLine = `      QB ${qb.name}: ${qb.completions}/${qb.attempts}, ${qb.yards} yds, ${qb.tds} TD`;
      if (qb.ints > 0) qbLine += `, ${qb.ints} INT`;
      if (qb.fumbles > 0) qbLine += `, ${qb.fumbles} FUM`;
      if (qb.rushYards > 20) qbLine += ` | ${qb.rushYards} rush yds`;
      offenseLines.push(qbLine);
    }
    
    // Top rusher
    if (teamData.rushers && teamData.rushers[0]) {
      const rb = teamData.rushers[0];
      let rbLine = `      RB ${rb.name}: ${rb.attempts} att, ${rb.yards} yds`;
      if (rb.tds > 0) rbLine += `, ${rb.tds} TD`;
      if (rb.fumbles > 0) rbLine += `, ${rb.fumbles} FUM`;
      offenseLines.push(rbLine);
    }
    
    // Top receiver
    if (teamData.receivers && teamData.receivers[0]) {
      const wr = teamData.receivers[0];
      offenseLines.push(`      WR ${wr.name}: ${wr.receptions} rec, ${wr.yards} yds${wr.tds > 0 ? ', ' + wr.tds + ' TD' : ''}`);
    }
    
    // === DEFENSE ===
    // Team defense summary line
    if (teamData.teamDefense) {
      const def = teamData.teamDefense;
      const defParts = [];
      if (def.sacks > 0) defParts.push(`${def.sacks} sacks`);
      if (def.interceptions > 0) defParts.push(`${def.interceptions} INT`);
      if (def.fumbleRecoveries > 0) defParts.push(`${def.fumbleRecoveries} FR`);
      if (def.tacklesForLoss > 0) defParts.push(`${def.tacklesForLoss} TFL`);
      if (def.passesDefended > 0) defParts.push(`${def.passesDefended} PD`);
      
      if (defParts.length > 0) {
        defenseLines.push(`      TEAM DEF: ${defParts.join(' | ')}`);
      }
    }
    
    // Top defensive playmakers (INTs, sacks, big tackle games)
    if (teamData.defenders && teamData.defenders.length > 0) {
      for (const def of teamData.defenders.slice(0, 2)) {
        const statParts = [];
        if (def.interceptions > 0) {
          let intStr = `${def.interceptions} INT`;
          if (def.intTds > 0) intStr += ` (${def.intTds} TD)`;
          else if (def.intYards > 0) intStr += ` (${def.intYards} yds)`;
          statParts.push(intStr);
        }
        if (def.sacks > 0) statParts.push(`${def.sacks} sack${def.sacks > 1 ? 's' : ''}`);
        if (def.fumblesRecovered > 0) statParts.push(`${def.fumblesRecovered} FR`);
        if (def.tackles >= 8) statParts.push(`${def.tackles} tackles`);
        if (def.passesDefended > 0 && !def.interceptions) statParts.push(`${def.passesDefended} PD`);
        
        if (statParts.length > 0) {
          defenseLines.push(`      ${def.position} ${def.name}: ${statParts.join(', ')}`);
        }
      }
    }
    
    // Combine offense and defense
    const allLines = [];
    if (offenseLines.length > 0) {
      allLines.push(...offenseLines);
    }
    if (defenseLines.length > 0) {
      allLines.push(...defenseLines);
    }
    
    return allLines.length > 0 ? '\n' + allLines.join('\n') : '';
  };
  
  // Group games by team
  const homeTeamGames = games.filter(g => 
    g.home_team?.id === homeTeamId || g.visitor_team?.id === homeTeamId
  );
  const awayTeamGames = games.filter(g => 
    g.home_team?.id === awayTeamId || g.visitor_team?.id === awayTeamId
  );
  
  // Format games for home team
  if (homeTeamGames.length > 0) {
    lines.push(`📍 ${homeTeam.toUpperCase()} - PLAYOFF RESULTS:`);
    
    for (const game of homeTeamGames) {
      const gameDate = new Date(game.date);
      const dateStr = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const round = game.playoffRound || 'Playoff';
      
      const isHome = game.home_team?.id === homeTeamId;
      const opponent = isHome ? game.visitor_team : game.home_team;
      const teamScore = isHome ? game.home_team_score : game.visitor_team_score;
      const oppScore = isHome ? game.visitor_team_score : game.home_team_score;
      const won = teamScore > oppScore;
      const result = won ? 'WON' : 'LOST';
      const venue = game.venue || (isHome ? 'Home' : 'Away');
      
      lines.push(`   ${round} (${dateStr})`);
      lines.push(`   vs ${opponent?.full_name || 'Unknown'} | ${result} ${teamScore}-${oppScore} | @ ${venue}`);
      
      // Add box score
      const gameStats = teamStats[game.id];
      if (gameStats) {
        lines.push('   ┌─────────────────────────────────────────────────────────────┐');
        lines.push(formatBoxScore(gameStats.home, gameStats.away, game));
        lines.push('   └─────────────────────────────────────────────────────────────┘');
      }
      
      // Add key performers
      const homePerformers = formatKeyPerformers(game.id, game.home_team?.id);
      const awayPerformers = formatKeyPerformers(game.id, game.visitor_team?.id);
      if (homePerformers || awayPerformers) {
        lines.push('   🌟 KEY PERFORMERS:');
        if (homePerformers) {
          lines.push(`   ${game.home_team?.name || 'Home'}:${homePerformers}`);
        }
        if (awayPerformers) {
          lines.push(`   ${game.visitor_team?.name || 'Away'}:${awayPerformers}`);
        }
      }
      
      // Add game summary if available
      if (game.summary) {
        lines.push(`   📝 ${game.summary}`);
      }
      lines.push('');
    }
  }
  
  // Format games for away team (only if different from home team games)
  const awayOnlyGames = awayTeamGames.filter(g => 
    !homeTeamGames.some(hg => hg.id === g.id)
  );
  
  if (awayOnlyGames.length > 0) {
    lines.push(`📍 ${awayTeam.toUpperCase()} - PLAYOFF RESULTS:`);
    
    for (const game of awayOnlyGames) {
      const gameDate = new Date(game.date);
      const dateStr = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const round = game.playoffRound || 'Playoff';
      
      const isHome = game.home_team?.id === awayTeamId;
      const opponent = isHome ? game.visitor_team : game.home_team;
      const teamScore = isHome ? game.home_team_score : game.visitor_team_score;
      const oppScore = isHome ? game.visitor_team_score : game.home_team_score;
      const won = teamScore > oppScore;
      const result = won ? 'WON' : 'LOST';
      const venue = game.venue || (isHome ? 'Home' : 'Away');
      
      lines.push(`   ${round} (${dateStr})`);
      lines.push(`   vs ${opponent?.full_name || 'Unknown'} | ${result} ${teamScore}-${oppScore} | @ ${venue}`);
      
      // Add box score
      const gameStats = teamStats[game.id];
      if (gameStats) {
        lines.push('   ┌─────────────────────────────────────────────────────────────┐');
        lines.push(formatBoxScore(gameStats.home, gameStats.away, game));
        lines.push('   └─────────────────────────────────────────────────────────────┘');
      }
      
      // Add key performers
      const homePerformers = formatKeyPerformers(game.id, game.home_team?.id);
      const awayPerformers = formatKeyPerformers(game.id, game.visitor_team?.id);
      if (homePerformers || awayPerformers) {
        lines.push('   🌟 KEY PERFORMERS:');
        if (homePerformers) {
          lines.push(`   ${game.home_team?.name || 'Home'}:${homePerformers}`);
        }
        if (awayPerformers) {
          lines.push(`   ${game.visitor_team?.name || 'Away'}:${awayPerformers}`);
        }
      }
      
      // Add game summary if available
      if (game.summary) {
        lines.push(`   📝 ${game.summary}`);
      }
      lines.push('');
    }
  } else if (awayTeamGames.length > 0 && awayTeamGames.every(g => homeTeamGames.some(hg => hg.id === g.id))) {
    // Teams played each other already this postseason
    lines.push(`📍 ${awayTeam.toUpperCase()} - Same playoff game(s) as ${homeTeam} above`);
    lines.push('');
  }
  
  // Add context note
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('PLAYOFF HISTORY CONTEXT (Investigate these questions):');
  lines.push('');
  lines.push('  • HOW did they win? (Run game? QB play? Defense? Special teams?)');
  lines.push('  • Were they dominant or did they survive? (Margin + box score tells the story)');
  lines.push('  • Any weaknesses exposed? (Turnovers? Red zone struggles?)');
  lines.push('  • Can TONIGHT\'S opponent exploit what the previous opponent could not?');
  lines.push('');
  lines.push('[NOTE] Playoff football is different - use this data to understand playoff-tested performance,');
  lines.push('   not regular season stats that may not translate to elimination games.');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  
  return lines.join('\n');
}

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
          model: 'gemini-3-flash-preview', // POLICY: Always Gemini 3 Flash
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

COLLEGE BASKETBALL INJURY CONTEXT:
- "OFS" (Out For Season) = Investigate who stepped into that role and their recent performance
- Transfer portal: Verify roster is current
- Investigate: What does the available lineup tell you about each team's depth tonight?

Use this lineup data as your source of truth for who is PLAYING TONIGHT.
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
    'CURRENT ROSTERS (WHO ACTUALLY PLAYS FOR EACH TEAM)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'CRITICAL: College basketball has massive transfer portal activity.',
    '   Only mention players listed below - others may have transferred.',
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

/**
 * Format NHL key players section for display
 */
function formatNhlKeyPlayers(homeTeam, awayTeam, keyPlayers) {
  if (!keyPlayers || (!keyPlayers.home && !keyPlayers.away && !keyPlayers.rotoWireLineups)) {
    return '';
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Check if this is Gemini Grounding format (has rotoWireLineups.content)
  // ═══════════════════════════════════════════════════════════════════════════
  if (keyPlayers.rotoWireLineups?.content) {
    // Gemini Grounding format - already formatted nicely with injury context
    return `
NHL LINEUPS & INJURIES (FROM ROTOWIRE via Gemini Grounding)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${keyPlayers.rotoWireLineups.content}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INJURY CONTEXT:
- Duration tags show when each player was last active
- Consider how long each absence has been when evaluating the current lineup

Use goalie confirmation status:
- "Confirmed" = Definite starter, factor into analysis
- "Expected" = Likely but not confirmed, note the uncertainty
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BDL Format: forwards, defensemen, goalies with stats
  // ═══════════════════════════════════════════════════════════════════════════
  const formatForward = (player) => {
    const stats = player.gamesPlayed > 0 
      ? ` - ${player.goals}G, ${player.assists}A, ${player.points}P (${player.plusMinus >= 0 ? '+' : ''}${player.plusMinus})`
      : '';
    return `  • ${player.position}: ${player.name}${stats}`;
  };
  
  const formatDefenseman = (player) => {
    const stats = player.gamesPlayed > 0 
      ? ` - ${player.goals}G, ${player.assists}A, ${player.points}P (${player.plusMinus >= 0 ? '+' : ''}${player.plusMinus})`
      : '';
    return `  • D: ${player.name}${stats}`;
  };
  
  const formatGoalie = (player) => {
    const stats = player.gamesPlayed > 0 
      ? ` - ${player.wins}W-${player.losses}L, ${player.savePct || '?'}% SV, ${player.gaa || '?'} GAA`
      : '';
    return `  • G: ${player.name}${stats}`;
  };
  
  // NHL-SPECIFIC: Build REQUIRED goalie comparison table (per NHL constitution)
  const buildGoalieComparisonTable = () => {
    const homeGoalies = keyPlayers.home?.goalies || [];
    const awayGoalies = keyPlayers.away?.goalies || [];
    
    if (homeGoalies.length === 0 && awayGoalies.length === 0) {
      return 'GOALIE DATA UNAVAILABLE - Check RotoWire for confirmed starters';
    }
    
    const homeStarter = homeGoalies[0];
    const awayStarter = awayGoalies[0];
    const homeBackup = homeGoalies[1];
    const awayBackup = awayGoalies[1];
    
    // Format goalie row: Name | W-L | SV% | GAA | Games
    const formatGoalieRow = (g, role) => {
      if (!g) return `${role}: N/A`;
      const record = `${g.wins || 0}-${g.losses || 0}`;
      const svPct = g.savePct ? `.${g.savePct.replace('.', '')}` : 'N/A';
      const gaa = g.gaa || 'N/A';
      return `${role}: ${g.name} | ${record} | ${svPct} SV% | ${gaa} GAA | ${g.gamesPlayed || 0}GP`;
    };
    
    // Determine advantage based on SV% (higher is better)
    const homeSV = parseFloat(homeStarter?.savePct) || 0;
    const awaySV = parseFloat(awayStarter?.savePct) || 0;
    let advantageNote = '';
    if (homeSV > 0 && awaySV > 0) {
      const diff = Math.abs(homeSV - awaySV);
      if (diff >= 2) {
        advantageNote = `\nGOALIE SV% GAP: ${homeStarter?.name} (HOME) .${(homeSV+'').replace('.','')} vs ${awayStarter?.name} (AWAY) .${(awaySV+'').replace('.','')} (${diff.toFixed(1)}% difference)`;
      }
    }
    
    return `
| Position | ${awayTeam} | ${homeTeam} |
|----------|-------------|-------------|
| STARTER  | ${awayStarter?.name || 'TBD'} | ${homeStarter?.name || 'TBD'} |
| Record   | ${awayStarter ? `${awayStarter.wins}-${awayStarter.losses}` : 'N/A'} | ${homeStarter ? `${homeStarter.wins}-${homeStarter.losses}` : 'N/A'} |
| SV%      | ${awayStarter?.savePct ? `.${awayStarter.savePct.replace('.', '')}` : 'N/A'} | ${homeStarter?.savePct ? `.${homeStarter.savePct.replace('.', '')}` : 'N/A'} |
| GAA      | ${awayStarter?.gaa || 'N/A'} | ${homeStarter?.gaa || 'N/A'} |
| Games    | ${awayStarter?.gamesPlayed || 0}GP | ${homeStarter?.gamesPlayed || 0}GP |
| Shutouts | ${awayStarter?.shutouts || 0} | ${homeStarter?.shutouts || 0} |
| BACKUP   | ${awayBackup?.name || 'N/A'} | ${homeBackup?.name || 'N/A'} |${advantageNote}

NHL GOALIE INVESTIGATION: Is the same goalie starting who played during any active streak? Check RotoWire for confirmed starter.
`;
  };
  
  const formatTeamSection = (teamName, players, isHome) => {
    if (!players) return `${isHome ? '[HOME]' : '[AWAY]'} ${teamName}: Roster unavailable`;
    
    const lines = [`${isHome ? '[HOME]' : '[AWAY]'} ${teamName}:`];
    
    if (players.forwards && players.forwards.length > 0) {
      lines.push('  FORWARDS:');
      players.forwards.forEach(p => lines.push(formatForward(p)));
    }
    
    if (players.defensemen && players.defensemen.length > 0) {
      lines.push('  DEFENSE:');
      players.defensemen.forEach(p => lines.push(formatDefenseman(p)));
    }
    
    // Goalies now shown in dedicated comparison table above
    
    return lines.join('\n');
  };
  
  const goaliComparisonTable = buildGoalieComparisonTable();
  const homeSection = formatTeamSection(homeTeam, keyPlayers.home, true);
  const awaySection = formatTeamSection(awayTeam, keyPlayers.away, false);

  return `
🥅 GOALIE COMPARISON TABLE (REQUIRED FOR NHL ANALYSIS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${goaliComparisonTable}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*** ACTIVE ROSTER (READ THIS FIRST - PREVENTS HALLUCINATIONS) ***
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
These are the CURRENT players on each team's roster from Ball Don't Lie data.
${homeSection}

${awaySection}

*** ROSTER LOCK - YOUR TRAINING DATA IS OUTDATED ***

Your training data is from 2024. Trades and roster moves have happened since.
THE ROSTER DATA ABOVE IS THE ONLY TRUTH. Your memory of rosters is WRONG.

Before citing ANY player:
1. VERIFY they appear in the roster above
2. VERIFY which team they play for
3. If not listed, they DO NOT play for this team

If you cite a player not listed above, your analysis is INVALID.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

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
 * Escape special regex characters in a string
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
⚡ TIER 1 BOWL - HIGH STAKES
• Both teams are highly motivated - significant program accomplishment at stake
• Minimal opt-outs expected - players want to compete for major prizes
• Transfer portal has limited impact - stars want to showcase on this stage
• Rosters likely intact — investigate season-long metrics`;
  }
  
  // Check for tier 2 if not already tier 1
  if (tier !== 1) {
    for (const bowl of tier2Bowls) {
      if (bowlName.includes(bowl) || venue.includes(bowl)) {
        tier = 2;
        tierName = 'TIER 2 (Major Conference)';
        motivationContext = `
⚡ TIER 2 BOWL - MODERATE STAKES
• Generally motivated teams with some NFL-bound opt-outs possible
• Top draft prospects may sit; depth players want to showcase
• Check for specific opt-out announcements in Grounded Context above
• Investigate player availability and each team's preparation`;
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
TIER 3 BOWL - MOTIVATION ASYMMETRY LIKELY
• Transfer portal window is OPEN - expect significant roster attrition
• Coach statements about "10-15 missing players" are common at this tier
• One team often "wants it more" - look for team entering with momentum
• Teams with losing records may have lower buy-in
• Investigate opt-out situation and personnel changes`;
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
    
    console.log(`[Scout Report] 🏈 Fetching CFP Road to Championship for ${awayTeam} vs ${homeTeam}`);
    
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
      'How each team reached this game - USE THIS FOR STEEL MAN CONTEXT:',
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
    lines.push('[IMPORTANT] STEEL MAN REQUIREMENT: Reference specific playoff performances above');
    lines.push('   when building cases. Investigate playoff form vs regular season — what does THIS team\'s recent postseason data show?');
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
    
    console.log(`[Scout Report] ✓ CFP journey fetched for ${teamName} (${journeyText.length} chars)`);
    return journeyText;
    
  } catch (error) {
    console.error(`[Scout Report] Error fetching CFP journey for ${teamName}:`, error.message);
    return null;
  }
}

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
    
    console.log(`[Scout Report] ✓ NCAAF Key players: ${homeTeam} (${homeCount} players), ${awayTeam} (${awayCount} players)`);
    
    return {
      home: homeKeyPlayers,
      away: awayKeyPlayers
    };
  } catch (error) {
    console.error('[Scout Report] Error fetching NCAAF key players:', error.message);
    return null;
  }
}

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
KEY PLAYERS (CURRENT ROSTER - USE THESE NAMES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${homeSection}

${awaySection}

CRITICAL: Only reference players listed above. Do NOT mention players
not on this roster - they may have transferred, entered the draft, or are injured.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

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

/**
 * Format starting QBs section for display
 * Now includes QB CHANGE IMPACT section when there's a backup/inexperienced QB
 */
function formatStartingQBs(homeTeam, awayTeam, qbs) {
  if (!qbs || (!qbs.home && !qbs.away)) {
    return '';
  }
  
  const lines = [
    '',
    'STARTING QUARTERBACKS THIS WEEK',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  ];
  
  // Track if there's a QB situation that affects historical records
  let homeQbChangeSituation = null;
  let awayQbChangeSituation = null;
  
  if (qbs.home) {
    const qb = qbs.home;
    const backupLabel = qb.isBackup ? ' BACKUP STARTING (starter injured)' : '';
    // Include official BDL experience (e.g., "2nd Season") to prevent training data hallucinations
    const expLabel = qb.experience ? ` (${qb.experience})` : '';
    // Handle both old (passingInterceptions) and new (passingInts) property names
    const ints = qb.passingInterceptions || qb.passingInts || 0;
    const compPct = qb.passingCompletionPct || qb.completionPct || '?';
    const rating = qb.qbRating || qb.passingRating || '?';
    lines.push(`[HOME] ${homeTeam}: ${qb.name}${expLabel} (#${qb.jerseyNumber || '?'})${backupLabel}`);
    lines.push(`   Season: ${qb.gamesPlayed || '?'} GP | ${qb.passingYards || 0} yds | ${qb.passingTds || 0} TD / ${ints} INT | ${typeof compPct === 'number' ? compPct.toFixed(1) : compPct}% | Rating: ${typeof rating === 'number' ? rating.toFixed(1) : rating}`);
    
    // Add game logs if available (NCAAF enhanced QB data)
    if (qb.gameLogs && qb.gameLogs.length > 0) {
      lines.push(`   RECENT GAMES (L${qb.gameLogs.length}):`);
      qb.gameLogs.forEach((g, i) => {
        const compAtt = g.attempts > 0 ? `${g.completions}/${g.attempts}` : 'N/A';
        const pct = g.attempts > 0 ? ((g.completions / g.attempts) * 100).toFixed(0) : '?';
        lines.push(`     ${g.date || 'Game ' + (i+1)}: ${g.yards} yds, ${g.tds} TD/${g.ints} INT (${compAtt}, ${pct}%)${g.rating ? ` Rating: ${g.rating.toFixed(1)}` : ''}`);
      });
    }
    
    // Add experience warning for rookie/inexperienced QBs
    if (qb.experienceNote) {
      lines.push(`   ${qb.experienceNote}`);
      lines.push(`   SIGNIFICANT: Factor this inexperience into your analysis - expect nerves, mistakes, and unpredictability.`);
      homeQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: qb.isBackup };
    } else if (qb.isBackup) {
      lines.push(`   SIGNIFICANT: This is a backup QB - expect potential regression from normal team stats.`);
      lines.push(`   Consider: limited experience, chemistry issues, possible game plan adjustments.`);
      homeQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: true };
    } else if ((qb.gamesPlayed || 0) <= 5) {
      // Even if not flagged as backup, very few games = new starter this season
      homeQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: false };
    }
  } else {
    lines.push(`[HOME] ${homeTeam}: QB data unavailable`);
  }
  
  if (qbs.away) {
    const qb = qbs.away;
    const backupLabel = qb.isBackup ? ' BACKUP STARTING (starter injured)' : '';
    // Include official BDL experience (e.g., "2nd Season") to prevent training data hallucinations
    const expLabel = qb.experience ? ` (${qb.experience})` : '';
    // Handle both old (passingInterceptions) and new (passingInts) property names
    const ints = qb.passingInterceptions || qb.passingInts || 0;
    const compPct = qb.passingCompletionPct || qb.completionPct || '?';
    const rating = qb.qbRating || qb.passingRating || '?';
    lines.push(`[AWAY] ${awayTeam}: ${qb.name}${expLabel} (#${qb.jerseyNumber || '?'})${backupLabel}`);
    lines.push(`   Season: ${qb.gamesPlayed || '?'} GP | ${qb.passingYards || 0} yds | ${qb.passingTds || 0} TD / ${ints} INT | ${typeof compPct === 'number' ? compPct.toFixed(1) : compPct}% | Rating: ${typeof rating === 'number' ? rating.toFixed(1) : rating}`);
    
    // Add game logs if available (NCAAF enhanced QB data)
    if (qb.gameLogs && qb.gameLogs.length > 0) {
      lines.push(`   RECENT GAMES (L${qb.gameLogs.length}):`);
      qb.gameLogs.forEach((g, i) => {
        const compAtt = g.attempts > 0 ? `${g.completions}/${g.attempts}` : 'N/A';
        const pct = g.attempts > 0 ? ((g.completions / g.attempts) * 100).toFixed(0) : '?';
        lines.push(`     ${g.date || 'Game ' + (i+1)}: ${g.yards} yds, ${g.tds} TD/${g.ints} INT (${compAtt}, ${pct}%)${g.rating ? ` Rating: ${g.rating.toFixed(1)}` : ''}`);
      });
    }
    
    // Add experience warning for rookie/inexperienced QBs
    if (qb.experienceNote) {
      lines.push(`   ${qb.experienceNote}`);
      lines.push(`   SIGNIFICANT: Factor this inexperience into your analysis - expect nerves, mistakes, and unpredictability.`);
      awayQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: qb.isBackup };
    } else if (qb.isBackup) {
      lines.push(`   SIGNIFICANT: This is a backup QB - expect potential regression from normal team stats.`);
      lines.push(`   Consider: limited experience, chemistry issues, possible game plan adjustments.`);
      awayQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: true };
    } else if ((qb.gamesPlayed || 0) <= 5) {
      // Even if not flagged as backup, very few games = new starter this season
      awayQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: false };
    }
  } else {
    lines.push(`[AWAY] ${awayTeam}: QB data unavailable`);
  }
  
  lines.push('');
  
  // Add QB CHANGE IMPACT section if either team has a new/backup QB
  if (homeQbChangeSituation || awayQbChangeSituation) {
    lines.push('');
    lines.push('QB CHANGE IMPACT ON HISTORICAL RECORDS');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (homeQbChangeSituation) {
      const qb = homeQbChangeSituation;
      lines.push(`${homeTeam}:`);
      lines.push(`   Current QB: ${qb.name} (${qb.gamesPlayed} career starts)`);
      if (qb.gamesPlayed <= 2) {
        lines.push(`   These records were built with a different quarterback. Investigate: What does the data show under the current QB?`);
      } else if (qb.gamesPlayed <= 5) {
        lines.push(`   NOTE: Limited sample size with this QB.`);
      }
    }

    if (awayQbChangeSituation) {
      const qb = awayQbChangeSituation;
      lines.push(`${awayTeam}:`);
      lines.push(`   Current QB: ${qb.name} (${qb.gamesPlayed} career starts)`);
      if (qb.gamesPlayed <= 2) {
        lines.push(`   These records were built with a different quarterback. Investigate: What does the data show under the current QB?`);
      } else if (qb.gamesPlayed <= 5) {
        lines.push(`   NOTE: Limited sample size with this QB.`);
      }
    }
    
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
  }
  
  lines.push('CRITICAL: Use the QB names above when discussing quarterbacks.');
  lines.push('   Do NOT guess or use outdated QB information.');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Generic Gemini Grounding Search
 * Uses Gemini 3 Flash with Google Search Grounding for real-time information
 * @param {string} query - The search query
 * @param {Object} options - Options for the search
 * @param {number} options.temperature - Temperature for generation (default 1.0 per Gemini 3 docs)
 * @param {number} options.maxTokens - Max tokens for response (default 1000)
 * @returns {Object} - { success: boolean, data: string, raw: string }
 */
// ═══════════════════════════════════════════════════════════════════════════
// GEMINI MODEL POLICY (HARDCODED - DO NOT CHANGE)
// ONLY Gemini 3 (Flash or Pro) allowed for grounding. NEVER use Gemini 1.x or 2.x.
// Flash is PRIMARY for all grounding (cheaper, same quality). Pro kept as 429 fallback only.
// ═══════════════════════════════════════════════════════════════════════════
const ALLOWED_GROUNDING_MODELS = ['gemini-3-flash-preview', 'gemini-3-pro-preview']; // Flash primary, Pro 429 fallback

function validateGroundingModel(model) {
  if (!ALLOWED_GROUNDING_MODELS.includes(model)) {
    console.error(`[GROUNDING MODEL POLICY VIOLATION] Attempted to use "${model}" - ONLY Gemini 3 allowed!`);
    return 'gemini-3-flash-preview'; // Always fall back to Gemini 3 Flash
  }
  return model;
}

export async function geminiGroundingSearch(query, options = {}) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.warn('[Grounding Search] Gemini not available');
    return { success: false, data: null, error: 'Gemini API not configured' };
  }

  const maxRetries = options.maxRetries ?? 3;
  let lastError;
  // Track if we've already tried Pro fallback (to avoid infinite loops)
  let usedProFallback = options._usedProFallback ?? false;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // POLICY: Gemini 3 Flash for grounding, Pro as fallback on rate limits
      // Both Flash and Pro support Google Search grounding
      const requestedModel = options._useProFallback
        ? (process.env.GEMINI_PRO_MODEL || 'gemini-3-pro-preview')
        : (process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview');
      const modelName = validateGroundingModel(requestedModel);

      if (options._useProFallback) {
        console.log(`[Grounding Search] Using Pro model (${modelName}) as fallback`);
      }

      const model = genAI.getGenerativeModel({
        model: modelName,
        tools: [{
          google_search: {}
        }],
        generationConfig: {
          temperature: 1.0, // Gemini 3: Keep at 1.0 - lower values cause looping/degraded performance
          maxOutputTokens: options.maxTokens ?? 2000,
          thinkingConfig: { thinkingLevel: 'high' }
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ]
      });
      
      // ═══════════════════════════════════════════════════════════════════════════
      // 2026 GROUNDING FRESHNESS PROTOCOL
      // Prevents "Concept Drift" where Gemini's training data clashes with 2026 reality
      // ═══════════════════════════════════════════════════════════════════════════
      const today = new Date();
      const todayStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const todayISO = today.toISOString().slice(0, 10); // YYYY-MM-DD for filtering

      // Calculate current season context using centralized function
      const seasonContext = formatSeason(nbaSeason());

      // Build the Freshness Protocol query with XML anchoring
      const dateAwareQuery = `<date_anchor>
  System Date: ${todayStr}
  ISO Date: ${todayISO}
  Season Context: ${seasonContext} (NBA/NHL mid-season, NFL playoffs)
</date_anchor>

<grounding_instructions>
  GROUND TRUTH HIERARCHY (MANDATORY):
  1. PRIMARY TRUTH: This System Date and Search Tool results are the absolute "Present"
  2. SECONDARY TRUTH: Your internal training data is a "Historical Archive" from 2024 or earlier
  3. CONFLICT RESOLUTION: If your training says Player X is on Team A, but Search shows a trade to Team B,
     your training is an "Amnesia Gap" - USE THE SEARCH RESULT

  FRESHNESS RULES:
  1. Initialize Google Search for this query - DO NOT skip the search
  2. ONLY use search results from the past 7 days (preferably past 24-48 hours)
  3. If a search result is dated prior to ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}, flag it as "Historical" and DO NOT use for current analysis
  4. EVIDENCE SUPREMACY: Surrender intuition to Search Tool results. Search results ARE the facts.

  ANTI-LAZY VERIFICATION:
  - Do NOT assume you know current rosters, injuries, or stats from training data
  - VERIFY claims using Search - if you can't find verification, say "unverified"
  - For injuries: Look for articles from the LAST 24 HOURS specifically
  - If an article says "tonight" or "returns tonight", verify the article date matches ${todayStr}
</grounding_instructions>

<query>
${query}
</query>

CRITICAL REMINDER: Today is ${todayStr}. Use ONLY fresh search results. Your 2024 training data is outdated.`;
      
      const result = await model.generateContent(dateAwareQuery);
      const response = result.response;

      // Debug: Log raw response structure for troubleshooting
      if (!response || !response.text) {
        console.error(`[Grounding Search] Invalid response object from ${modelName}:`, JSON.stringify(response || 'null', null, 2).substring(0, 500));
      }

      let text = response.text();
      
      // Clean up chain-of-thought reasoning that sometimes leaks into responses
      // This fixes the "Wait, that snippet is from 2025..." issue
      if (text) {
        // Remove internal reasoning patterns
        const chainOfThoughtPatterns = [
          /Wait,\s+(?:that|this|I|let me)[^.]*\./gi,           // "Wait, that snippet is from..."
          /I need to[^.]*\./gi,                                  // "I need to check..."
          /Let me (?:search|check|look|find)[^.]*\./gi,         // "Let me search for..."
          /Hmm,?\s+[^.]*\./gi,                                   // "Hmm, this doesn't look right..."
          /Actually,?\s+(?:I|that|this)[^.]*\./gi,              // "Actually, I should..."
          /(?:^|\n)\s*\*[^*]+\*\s*(?:$|\n)/gm,                  // Remove asterisk-surrounded thoughts
          /snippet\s+\d+\.?\d*[^.]*from\s+(?:the\s+)?(?:last|previous)[^.]*\./gi, // "snippet 1.4 in the last search..."
        ];
        
        for (const pattern of chainOfThoughtPatterns) {
          text = text.replace(pattern, '');
        }
        
        // Clean up extra whitespace from removals
        text = text.replace(/\n{3,}/g, '\n\n').trim();
      }
      
      // Debug log: Show first 200 chars of grounding response
      if (text) {
        console.log(`[Grounding Search] Response received (${text.length} chars). Preview: ${text.substring(0, 200).replace(/\n/g, ' ')}...`);
      }
      
      // VALIDATION: Check for garbage/truncated responses
      // Allow short responses if they look like valid data (e.g., "13-2" for a record, "72°F" for weather)
      const MIN_USEFUL_LENGTH = 50;
      const looksLikeValidShortResponse = text && (
        /^\d{1,2}\s*[-–]\s*\d{1,2}/.test(text.trim()) ||  // Record format: "13-2", "15-0"
        /^\d+°?F?\s*$/.test(text.trim()) ||                // Temperature: "72", "72°F"
        /^[A-Z][a-z]+ [A-Z][a-z]+/.test(text.trim())       // Player name: "Fernando Mendoza"
      );
      
      if (!text || (text.length < MIN_USEFUL_LENGTH && !looksLikeValidShortResponse)) {
        console.warn(`[Grounding Search] [WARNING] Response too short (${text?.length || 0} chars). May be garbage or truncated.`);
        return {
          success: false,
          data: null,
          error: `Response too short: ${text?.length || 0} chars (expected at least ${MIN_USEFUL_LENGTH})`,
          raw: text
        };
      }
      
      // Check for common error patterns in response
      const textLower = (text || '').toLowerCase();
      const errorPatterns = ['i cannot', 'i\'m unable', 'no information', 'unable to find', 'error:'];
      if (text.length < 200 && !looksLikeValidShortResponse && errorPatterns.some(p => textLower.includes(p))) {
        console.warn(`[Grounding Search] [WARNING] Response looks like an error/refusal: "${text.substring(0, 100)}"`);
        return {
          success: false,
          data: null,
          error: `Response appears to be an error or refusal`,
          raw: text
        };
      }
      
      return {
        success: true,
        data: text,
        raw: text
      };
    } catch (error) {
      lastError = error;
      const errorMsg = error.message?.toLowerCase() || '';

      // Check for 429 rate limit - fall back to Pro if Flash is exhausted
      const is429 = error.status === 429 ||
        error.message?.includes('429') ||
        errorMsg.includes('resource has been exhausted') ||
        errorMsg.includes('quota');

      if (is429 && !usedProFallback && !options._useProFallback) {
        console.log(`[Grounding Search] ⚠️ Flash quota exceeded (429) - falling back to Pro`);
        // Recursive call with Pro model
        return geminiGroundingSearch(query, {
          ...options,
          _useProFallback: true,
          _usedProFallback: true
        });
      }

      // Reverse fallback: Pro 429 → try Flash (both support google_search grounding)
      if (is429 && options._useProFallback) {
        console.log(`[Grounding Search] ⚠️ Pro also quota exceeded (429) - falling back to Flash`);
        return geminiGroundingSearch(query, {
          ...options,
          _useProFallback: false,
          _usedProFallback: true
        });
      }

      // Check if this is a retryable network error
      const isRetryable =
        error.status >= 500 ||
        error.message?.includes('500') ||
        error.message?.includes('503') ||
        errorMsg.includes('fetch failed') ||
        errorMsg.includes('econnreset') ||
        errorMsg.includes('etimedout') ||
        errorMsg.includes('enotfound') ||
        errorMsg.includes('socket hang up') ||
        errorMsg.includes('network') ||
        errorMsg.includes('connection') ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'UND_ERR_CONNECT_TIMEOUT';

      if (isRetryable && attempt < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[Grounding Search] ⚠️ Retryable error (attempt ${attempt}/${maxRetries}): ${error.message?.slice(0, 60)}...`);
        console.log(`[Grounding Search] 🔄 Waiting ${delay/1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      console.error('[Grounding Search] Error:', error.message);
      return { success: false, data: null, error: error.message };
    }
  }
  
  // Should not reach here, but just in case
  console.error('[Grounding Search] Max retries exceeded:', lastError?.message);
  return { success: false, data: null, error: lastError?.message || 'Max retries exceeded' };
}

/**
 * Get game weather using Gemini Grounding
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name  
 * @param {string} dateStr - Game date string
 * @returns {Object} - Weather object
 */
export async function getGroundedWeather(homeTeam, awayTeam, dateStr, gameTime = null) {
  // Get current time for staleness check
  const now = new Date();
  const currentTimeStr = now.toLocaleTimeString('en-US', { 
    timeZone: 'America/New_York', 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
  const currentDateStr = now.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  
  // Game time context for query
  const gameTimeContext = gameTime ? ` at ${gameTime}` : '';
  
  const query = `IMPORTANT: Current time is ${currentTimeStr} EST on ${currentDateStr}.

What is the CURRENT weather forecast for the NFL game ${awayTeam} @ ${homeTeam} on ${dateStr}${gameTimeContext}?

STRICT REQUIREMENTS:
1. Only use weather forecasts published TODAY (${currentDateStr}) or within the last 2 hours
2. Provide the forecast specifically for GAME TIME${gameTimeContext}, not current conditions
3. If the game is more than 12 hours away, note that forecasts may change
4. For precipitation forecasts (rain/snow), indicate the PROBABILITY PERCENTAGE if available

Include:
1. Temperature at game time (in Fahrenheit)
2. Conditions at game time (sunny, cloudy, rain, snow) - with probability if precipitation
3. Wind speed and direction at game time
4. Is this a dome/indoor stadium? (if so, weather is controlled)
5. Forecast confidence: HIGH (clear skies), MODERATE (temperature/wind only), LOW (precipitation forecast)

Be specific and factual. Only report what current forecasts actually say.`;

  const result = await geminiGroundingSearch(query, { temperature: 1.0, maxTokens: 1500 });
  
  if (result.success && result.data) {
    return parseWeatherFromText(result.data);
  }
  
  return null;
}

// Helper to parse weather from grounded text
function parseWeatherFromText(text) {
  const lower = text.toLowerCase();
  
  // Check for dome/indoor
  if (lower.includes('dome') || lower.includes('indoor') || lower.includes('retractable roof')) {
    return {
      temperature: 72,
      conditions: 'Indoor/Dome',
      wind: 'N/A',
      wind_speed: 0,
      isDome: true,
      is_dome: true,
      forecast_confidence: 'HIGH'
    };
  }
  
  // Extract temperature
  const tempMatch = text.match(/(\d{1,3})\s*(?:°|degrees?\s*)?F/i) || 
                    text.match(/temperature[:\s]+(\d{1,3})/i) ||
                    text.match(/(\d{1,3})\s*degrees/i);
  const temperature = tempMatch ? parseInt(tempMatch[1], 10) : null;
  
  // Extract conditions
  let conditions = 'Clear';
  let precipProbability = null;
  
  // Check for precipitation with probability
  const precipProbMatch = text.match(/(\d+)\s*%\s*(?:chance|probability|likelihood)\s*(?:of\s*)?(?:rain|snow|precipitation)/i) ||
                          text.match(/(?:rain|snow|precipitation)[^.]*?(\d+)\s*%/i);
  if (precipProbMatch) {
    precipProbability = parseInt(precipProbMatch[1], 10);
  }
  
  if (lower.includes('snow')) conditions = precipProbability ? `Snow (${precipProbability}% chance)` : 'Snow';
  else if (lower.includes('rain') || lower.includes('showers')) conditions = precipProbability ? `Rain (${precipProbability}% chance)` : 'Rain';
  else if (lower.includes('storm') || lower.includes('thunder')) conditions = precipProbability ? `Storms (${precipProbability}% chance)` : 'Storms';
  else if (lower.includes('overcast')) conditions = 'Overcast';
  else if (lower.includes('partly cloudy')) conditions = 'Partly Cloudy';
  else if (lower.includes('cloud')) conditions = 'Cloudy';
  else if (lower.includes('sunny') || lower.includes('clear')) conditions = 'Clear';
  
  // Extract wind
  const windMatch = text.match(/wind[:\s]+(\d+)\s*(?:mph|miles)/i) ||
                    text.match(/(\d+)\s*mph\s*wind/i) ||
                    text.match(/winds?\s*(?:of\s*)?(\d+)/i);
  const windSpeed = windMatch ? parseInt(windMatch[1], 10) : null;
  const wind = windSpeed ? `${windSpeed} mph` : null;
  
  // Determine forecast confidence
  let forecastConfidence = 'HIGH';
  const hasPrecip = lower.includes('rain') || lower.includes('snow') || lower.includes('storm');
  const isFarOut = lower.includes('may change') || lower.includes('could change') || lower.includes('uncertain');
  
  if (hasPrecip && precipProbability && precipProbability < 50) {
    forecastConfidence = 'LOW';
  } else if (hasPrecip) {
    forecastConfidence = 'MODERATE';
  } else if (isFarOut) {
    forecastConfidence = 'MODERATE';
  }
  
  // Extract explicit confidence if stated
  if (lower.includes('confidence: high') || lower.includes('high confidence')) forecastConfidence = 'HIGH';
  else if (lower.includes('confidence: moderate') || lower.includes('moderate confidence')) forecastConfidence = 'MODERATE';
  else if (lower.includes('confidence: low') || lower.includes('low confidence')) forecastConfidence = 'LOW';
  
  return {
    temperature,
    conditions,
    wind,
    wind_speed: windSpeed,
    isDome: false,
    is_dome: false,
    forecast_confidence: forecastConfidence,
    precipitation_probability: precipProbability
  };
}

/**
 * COMPREHENSIVE PROPS NARRATIVE CONTEXT
 * 
 * Fetches ALL narrative factors that BDL cannot provide BEFORE Gary's iterations.
 * This gives Gary complete context upfront so he knows which stats to investigate.
 * 
 * Categories fetched:
 * 1. Breaking News & Situational (last-minute scratches, trade rumors, coaching changes)
 * 2. Motivation Factors (revenge games, milestones, contract years, playoff implications)
 * 3. Schedule & Travel (B2B fatigue, trap games, altitude, rest advantage)
 * 4. Player-Specific (load management, matchup history, quotes, role changes)
 * 5. Team Trends (streaks, home/road context, rivalries)
 * 6. Betting Signals (public % only - to know if Gary is with/against public) - MINOR DATA ONLY
 */
async function fetchComprehensivePropsNarrative(homeTeam, awayTeam, sport, gameDate, options = {}) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[Props Narrative] Gemini not available');
    return null;
  }
  
  try {
    const today = gameDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    
    // POLICY: Always use Gemini 3 Flash, never Pro
    const modelName = 'gemini-3-flash-preview';
    
    const model = genAI.getGenerativeModel({
      model: modelName,
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 1.0 },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    });

    // Sport-specific comprehensive prompts
    let prompt;
    
    if (sport === 'NBA' || sport === 'basketball_nba') {
      prompt = `For the NBA game ${awayTeam} @ ${homeTeam} on ${today}, provide COMPREHENSIVE narrative context for player prop analysis:

== SECTION 1: BREAKING NEWS & SITUATIONAL ==
Search for the ABSOLUTE LATEST news (within 24 hours):
- LAST-MINUTE SCRATCHES: Any players ruled OUT after the official injury report?
- TRADE RUMORS: Any active trade talks involving players on either team?
- COACHING CHANGES: Any recent firings, interim coaches, or system changes?
- LOCKER ROOM DRAMA: Any reported chemistry issues, player feuds, or team meetings?
- ROSTER MOVES: Any recent signings, waivers, or 10-day contracts?

== SECTION 2: MOTIVATION FACTORS ==
Search for context that affects player effort/focus:
- REVENGE GAMES: Is any player facing their FORMER TEAM? (e.g., traded in past 2 years)
  * List player name, when they were traded, and any reported comments
- MILESTONE CHASING: Is any player close to a career milestone? (e.g., 20k points, triple-double streak)
- CONTRACT YEAR: Which players are in a contract year (expiring contract) and might be extra motivated?
- JERSEY RETIREMENT / TRIBUTE: Any special ceremony or tribute night?
- RETURN FROM INJURY: Any star returning after missing 3+ games?
- PLAYOFF IMPLICATIONS: Are either team fighting for playoff position, play-in, or seeding?

== SECTION 3: SCHEDULE & TRAVEL CONTEXT ==
- BACK-TO-BACK: Is either team on the 2nd night of a back-to-back?
- 3-IN-4 / 4-IN-5: Is either team in a compressed schedule?
- TRAVEL FATIGUE: Did either team just travel cross-country (e.g., East to West coast)?
- TRAP GAME SPOT: Is a good team playing a lottery team right BEFORE a big rivalry game?
- ALTITUDE FACTOR: Is this game in Denver (elevation affects visiting teams)?
- REST ADVANTAGE: How many days rest does each team have?
- ROAD TRIP: Is either team on an extended road trip (4+ games)?

== SECTION 4: PLAYER-SPECIFIC CONTEXT ==
For the TOP PLAYERS on each team:
- LOAD MANAGEMENT RISK: Which stars typically rest on B2Bs or vs bad teams?
- MATCHUP HISTORY: Any notable player-vs-player history? (e.g., Tatum vs Butler)
- RECENT QUOTES: Any notable coach or player comments about tonight's game?
- OFF-COURT ISSUES: Any reported personal matters affecting a player?
- MINUTES RESTRICTION: Any player returning on a minutes limit?
- ROLE CHANGE: Any player recently moved to starter or bench?

== SECTION 5: TEAM TRENDS & CONTEXT ==
- WIN/LOSE STREAKS: Current streak for each team and context (e.g., "Won 5 straight by avg 15 pts")
- HOME/ROAD SPLITS: Is either team significantly better at home? MSG effect? Denver altitude?
- DIVISION RIVALRY: Are these division rivals? Conference rivals?
- REVENGE SPOT: Did these teams play recently with a controversial ending?

== SECTION 6: GAME ENVIRONMENT (AFFECTS PROP CEILINGS) ==
- GAME TOTAL (O/U): What is the over/under? (High O/U like 235+ = more scoring opportunities)
- SPREAD & BLOWOUT RISK: What is the spread? (Large spread -9+ = starters may rest in 4th quarter)
- PACE OF PLAY: Which team plays faster/slower? (Fast pace = more possessions = higher stat ceilings)
- CLOSE GAME EXPECTED: Is the spread within 5 points? (Starters play 36+ minutes)

== SECTION 7: HISTORICAL PATTERNS (PLAYER-SPECIFIC) ==
- PLAYER VS OPPONENT: Any notable player vs this specific team history? (e.g., "Trae Young averages 28 PPG vs Miami career")
- PRIMETIME PERFORMANCE: Is this a nationally televised game (ESPN/TNT)? Some players elevate on big stages.
- CONSISTENCY/FLOOR-CEILING: Which players have high variance (boom-or-bust) vs consistent outputs?

== SECTION 8: NBA ADVANCED STATS (PREDICTIVE METRICS) ==
Search nba.com/stats and basketball-reference.com for tracking data that PREDICTS future performance:

**For Scorers on ${homeTeam} and ${awayTeam}:**
- USAGE RATE: % of team plays used when on court (high usage 28%+ = volume scorer, more FGA)
- TRUE SHOOTING % (TS%): Efficiency accounting for 3s and FTs (elite is 60%+)
- POINTS PER POSSESSION: How efficient is the player in isolation/P&R?
- SHOT DISTRIBUTION: What % of shots are at rim vs mid-range vs 3? (affects consistency)
- FREE THROW RATE: Does this player get to the line? (boosts points floor)

**For Playmakers on ${homeTeam} and ${awayTeam}:**
- ASSIST %: % of teammate FGs assisted while on court (high = true playmaker)
- POTENTIAL ASSISTS: Passes that should be assists if teammates hit shots
- TIME OF POSSESSION: Ball-dominant guards hold ball longer = more assist opportunities
- PICK & ROLL FREQUENCY: How often do they run P&R? (affects assist upside)

**For Rebounders on ${homeTeam} and ${awayTeam}:**
- REBOUND %: % of available rebounds grabbed (offensive vs defensive split)
- CONTESTED REBOUND %: How many of their boards are contested?
- BOX OUT RATE: Do they create opportunities or just clean up?

**For 3-Point Shooters:**
- 3PA PER GAME: Volume of attempts (more attempts = more variance)
- CATCH & SHOOT %: Are they better spot-up or off-dribble?
- CORNER 3 %: Corner is highest % shot - do they get corner looks?
- WIDE OPEN 3% (defender 6+ feet): How do they shoot when open?

**PACE & ENVIRONMENT FACTORS:**
- TEAM PACE: Possessions per 48 minutes (fast pace 102+ = stat inflation)
- OPPONENT PACE: Will this game be fast or slow?
- DEFENSIVE RATING vs POSITION: How does opponent defend this position?
- MINUTES PROJECTION: Based on rotation, blowout risk, back-to-back status

**MATCHUP-SPECIFIC (Critical for Props):**
- How does ${homeTeam} defense rank in POINTS ALLOWED to guards/forwards/centers?
- How does ${awayTeam} defense rank vs 3-point shooters?
- Any player whose USAGE is spiking due to teammate injuries?
- Any player whose efficiency (TS%) is unsustainably high/low? (regression candidate)

== SECTION 9: BETTING MARKET SIGNALS ==
NOTE: These are SUPPLEMENTARY data points only - NOT decisive factors for picks.
- LINE MOVEMENT: Has the spread moved significantly? (e.g., opened -3, now -5.5)
- PUBLIC BETTING %: What percentage of public is on each team? (Note if lopsided, like 85%)
- SHARP MONEY: Any reports of sharp/professional money on one side?

FORMAT YOUR RESPONSE with clear section headers. Be FACTUAL - if you can't find info, say "No data found" rather than guessing.

CRITICAL RULES:
1. **ACCURACY IS PARAMOUNT**: Double-check all stats, scoring streaks, and injury updates from the last 24-48 hours. If a player had a game yesterday, ENSURE you have those stats.
2. **NO HALLUCINATIONS**: Do NOT repeat narrative "streaks" (e.g., "11 straight games with 30 pts") unless you are 100% certain. If in doubt, stick to general trends.
3. FACTS ONLY - Do NOT include any betting predictions, picks, or analysis from articles
4. NO OPINIONS - Do NOT copy predictions like "The Hawks will win because..." from any source
5. YOUR OWN WORDS - Synthesize facts, do NOT plagiarize text from articles
6. VERIFY STATS - Only include stats you can verify from official sources (including nba.com/stats)
7. NO BETTING ADVICE - Gary will make his own decision - you just provide CONTEXT
8. ADVANCED STATS: Prioritize tracking data from nba.com/stats for predictive metrics`;
    }
    else if (sport === 'NHL' || sport === 'icehockey_nhl') {
      prompt = `For the NHL game ${awayTeam} @ ${homeTeam} on ${today}, provide COMPREHENSIVE narrative context for player prop analysis:

== SECTION 1: BREAKING NEWS & SITUATIONAL ==
- LAST-MINUTE SCRATCHES: Any players ruled OUT after morning skate?
- TRADE RUMORS: Any active trade talks? (especially before trade deadline)
- COACHING CHANGES: Any recent firings or interim coaches?
- ROSTER MOVES: Any recent call-ups from AHL or waivers?

== SECTION 2: MOTIVATION FACTORS ==
- REVENGE GAMES: Is any player facing their FORMER TEAM?
- MILESTONE CHASING: Any player close to career milestone? (e.g., 500 goals)
- CONTRACT YEAR: Which players have expiring contracts?
- RETURN FROM INJURY: Any star returning from LTIR?
- PLAYOFF IMPLICATIONS: Playoff race standings for both teams?

== SECTION 3: GOALIE SITUATION (CRITICAL FOR PROPS) ==
- WHO IS STARTING for ${homeTeam}? (confirmed or expected)
- WHO IS STARTING for ${awayTeam}? (confirmed or expected)
- Is either goalie on a B2B (likely to rest)?
- Any goalie controversies or platoon situations?

== SECTION 4: SCHEDULE & TRAVEL CONTEXT ==
- BACK-TO-BACK: Is either team on 2nd night of B2B?
- ROAD TRIP LENGTH: Is either team on an extended road trip?
- REST ADVANTAGE: Days rest for each team?
- TRAVEL FATIGUE: Cross-country travel?

== SECTION 5: PLAYER-SPECIFIC CONTEXT ==
For top scorers/players:
- LOAD MANAGEMENT: Any stars likely to rest?
- LINE CHANGES: Any recent line combination changes?
- HOT/COLD STREAKS: Any player on a notable scoring streak or slump?
- RECENT QUOTES: Coach comments about specific players?

== SECTION 6: TEAM TRENDS ==
- WIN/LOSE STREAKS: Current streak and context
- DIVISION RIVALRY: Are these division rivals?
- RECENT H2H: Did these teams play recently?

== SECTION 7: GAME ENVIRONMENT ==
- GAME TOTAL (O/U): What is the over/under? (High O/U 6.5+ = more scoring expected)
- SPREAD & GAME SCRIPT: What is the spread? Trailing team may pull goalie late.
- CONSISTENCY: Which players have high floor vs boom-or-bust tendencies?

== SECTION 8: NHL ADVANCED STATS (PREDICTIVE METRICS) ==
Search moneypuck.com, naturalstattrick.com, and nhl.com/stats for tracking data that PREDICTS future performance:

**For Skaters on ${homeTeam} and ${awayTeam}:**
- INDIVIDUAL EXPECTED GOALS (ixG): Shot quality - are they getting HIGH DANGER chances?
- GOALS ABOVE EXPECTED (GAE): Positive = finishing above expected, Negative = finishing below expected. Investigate: Is the gap sustainable?
- HIGH DANGER CHANCES (HDC): Scoring chances from slot/crease area — investigate the gap between teams
- SHOOTING %: Is it unsustainably high (15%+) or low (<5%)? NHL average is ~10%
- INDIVIDUAL CORSI FOR (iCF): Total shot attempts - volume indicator

**For Goal Scorers:**
- ixG vs ACTUAL GOALS: If ixG >> goals, they're UNLUCKY and due for regression UP
- ixG vs ACTUAL GOALS: If goals >> ixG, they're LUCKY and may regress DOWN
- HDC/60: High danger chances per 60 minutes - who's getting quality looks?
- SHOOTING % TREND: Compare career avg to current season (regression candidate?)

**For Assist/Points Props:**
- PRIMARY ASSISTS: More valuable than secondary assists (repeatable skill)
- 5v5 vs PP PRODUCTION: What % comes from power play? (PP1 = high upside)
- ON-ICE xGF: When this player is on ice, how much xG does the team generate?
- LINEMATE QUALITY: Who are they playing with? Elite center = more assists

**For SOG (Shots on Goal) Props:**
- iCF (Individual Corsi For): Total shot ATTEMPTS (more predictive than SOG)
- SHOTS THROUGH %: What % of attempts reach the net? (consistency indicator)
- SHOT RATE/60: Shots per 60 minutes of ice time
- O-ZONE STARTS %: More offensive zone starts = more shot opportunities

**Team-Level Predictive Metrics:**
- ${homeTeam} xGF/60 (expected goals for per 60): Offensive generation quality
- ${awayTeam} xGF/60: Offensive generation quality
- ${homeTeam} xGA/60 (expected goals against per 60): Defensive quality
- ${awayTeam} xGA/60: Defensive quality
- PDO: Team shooting % + save %. If > 102, regression DOWN likely. If < 98, regression UP likely.

**MATCHUP-SPECIFIC (Critical for Props):**
- ${homeTeam} goalie xSV% (expected save %): Is goalie over/under-performing?
- ${awayTeam} goalie xSV%: Is goalie over/under-performing?
- Any player whose GOALS >> ixG? (lucky, may regress down)
- Any player whose ixG >> GOALS? (unlucky, due for regression up - TARGET THESE)

== SECTION 9: BETTING MARKET SIGNALS ==
SUPPLEMENTARY DATA ONLY - not decisive:
- LINE MOVEMENT: Significant spread/total movement?
- PUBLIC %: Lopsided public betting?

FORMAT with clear section headers. Be FACTUAL - say "No data found" if unsure.

CRITICAL RULES:
1. FACTS ONLY - Do NOT include any betting predictions, picks, or analysis from articles
2. NO OPINIONS - Do NOT copy predictions from any source
3. YOUR OWN WORDS - Synthesize facts, do NOT plagiarize
4. NO BETTING ADVICE - Gary will make his own decision - you just provide CONTEXT
5. ADVANCED STATS: Prioritize xG data from moneypuck.com or naturalstattrick.com`;
    }
    else if (sport === 'NFL' || sport === 'americanfootball_nfl') {
      prompt = `For the NFL game ${awayTeam} @ ${homeTeam} on ${today}, provide COMPREHENSIVE narrative context for player prop analysis:

== SECTION 1: BREAKING NEWS & SITUATIONAL ==
- GAMEDAY INACTIVES: Any surprise inactives announced today?
- TRADE RUMORS: Any active trade talks?
- COACHING CHANGES: Any coordinator changes or interim situations?
- LOCKER ROOM DRAMA: Any reported chemistry issues?
- ROSTER MOVES: Any recent signings off practice squad?

== SECTION 2: QB SITUATION (CRITICAL) ==
- STARTING QB for ${homeTeam}: Name, status, any concerns?
- STARTING QB for ${awayTeam}: Name, status, any concerns?
- Any QB injuries or changes from last week?
- Backup QB situation if relevant?

== SECTION 3: MOTIVATION FACTORS ==
- REVENGE GAMES: Any player facing former team? (trades in past 2 years)
- MILESTONE CHASING: Any player close to career milestone?
- CONTRACT YEAR: Which skill players are in contract year?
- PLAYOFF IMPLICATIONS: Playoff standings, division race, seeding implications?

== SECTION 4: SCHEDULE & GAME CONTEXT ==
- GAME TYPE: Is this TNF, SNF, MNF, Saturday, or Sunday?
- SHORT WEEK: Did either team play on Thursday/Monday last week?
- TRAVEL: Cross-country travel or timezone changes?
- DIVISIONAL: Are these division rivals?

== SECTION 5: WEATHER IMPACT (CRITICAL FOR OUTDOOR GAMES) ==
- STADIUM TYPE: Is this a dome or outdoor stadium?
- FORECAST: Temperature, wind speed, precipitation chance at game time
- WIND IMPACT: Is wind 15+ mph? (affects passing, FG accuracy)
- COLD WEATHER: Is it below 35°F? (affects grip, passing games)
- RAIN/SNOW: Any precipitation expected? (favors run game)
- PLAYER WEATHER HISTORY: How do the QBs perform in similar conditions?
  * ${homeTeam} QB: Career stats in cold/wind/rain if relevant
  * ${awayTeam} QB: Career stats in cold/wind/rain if relevant
- WEATHER EDGE: Does either team have a significant weather advantage? (dome team in cold, etc.)

== SECTION 6: PLAYER-SPECIFIC CONTEXT ==
For TOP skill players (QB, RB1, WR1, TE1):
- TARGET SHARE TRENDS: Any recent usage changes?
- SNAP COUNTS: Any player on limited snaps?
- MATCHUP HISTORY: Notable player-vs-defense history?
- RECENT QUOTES: Coach comments about game plan or player usage?
- WEATHER PERFORMANCE: Any players known to struggle/excel in expected conditions?

== SECTION 7: RED ZONE & TD DATA (CRITICAL FOR TD PROPS) ==

**Team Red Zone Efficiency (ANYTIME TD):**
- ${homeTeam}: Red zone TD % (how often do they score TDs vs FGs when inside 20?)
- ${awayTeam}: Red zone TD % (how often do they score TDs vs FGs when inside 20?)
- ${homeTeam}: Red zone DEFENSE - TD % allowed (do they bend but don't break, or give up TDs?)
- ${awayTeam}: Red zone DEFENSE - TD % allowed

**Red Zone Target/Touch Leaders for ${homeTeam}:**
- Who leads in RED ZONE TARGETS? (often different than overall target share)
- Who gets GOAL LINE CARRIES? (inside 5 yards - is there a "vulture"?)
- Who is the preferred red zone TE? (TEs often spike in red zone usage)

**Red Zone Target/Touch Leaders for ${awayTeam}:**
- Who leads in RED ZONE TARGETS?
- Who gets GOAL LINE CARRIES?
- Who is the preferred red zone TE?

**TD Rate Context:**
- Any players with unusually HIGH TD rate that may regress? (lucky TDs)
- Any players with unusually LOW TD rate despite high usage? (unlucky, due for TDs)
- Goal line back vs committee situation for each team

**FIRST TD SCORER DATA (CRITICAL FOR 1ST TD PROPS):**
- ${homeTeam} "Scores First" %: How often does this team score the first TD of the game?
- ${awayTeam} "Scores First" %: How often does this team score the first TD of the game?
- ${homeTeam} 1st Drive TD %: How often do they score a TD on their opening drive?
- ${awayTeam} 1st Drive TD %: How often do they score a TD on their opening drive?
- ${homeTeam} 1st Quarter TD Leaders: Who has scored the most 1st quarter TDs this season?
- ${awayTeam} 1st Quarter TD Leaders: Who has scored the most 1st quarter TDs this season?
- Opening script tendencies: Any coach known for scripted opening drives that feature specific players?
- Historical 1st TD scorers: Any players on either team with notably high 1st TD rate this season?

== SECTION 8: INJURY CONTEXT (BEYOND REPORT) ==
- Players returning from multi-week absences?
- Players "questionable" who are expected to play?
- Any injuries that affect other players' usage (e.g., WR1 out = WR2 boost)?

== SECTION 9: TEAM TRENDS ==
- WIN/LOSE STREAKS: Current streak with context
- HOME/ROAD SPLITS: Significant home/road performance difference?
- DIVISION RIVALRY: Are these division rivals?

== SECTION 10: GAME ENVIRONMENT (AFFECTS PROP CEILINGS) ==
- GAME TOTAL (O/U): What is the over/under? (High O/U 48+ = shootout, more pass yards)
- SPREAD & GAME SCRIPT: What is the spread? Large favorites (-10+) may run clock late, affecting pass yards.
- PROJECTED GAME FLOW: Will trailing team need to throw more? (Good for pass/receiving props)
- PRIMETIME FACTOR: Is this SNF/MNF/TNF? National TV can affect player performance.

== SECTION 11: HISTORICAL PATTERNS (PLAYER-SPECIFIC) ==
- PLAYER VS OPPONENT: Any notable player vs this defense history?
- CONSISTENCY: Which players have high floor (reliable) vs boom-or-bust (high variance)?

== SECTION 12: NFL NEXT GEN STATS (PREDICTIVE METRICS) ==
Search nextgenstats.nfl.com for player tracking data that PREDICTS future performance:

**For WRs/TEs on ${homeTeam} and ${awayTeam}:**
- SEPARATION: Average yards of separation from defenders (higher = more open targets)
- CATCH RATE OVER EXPECTED (CROE): Are they elite at contested catches?
- AVERAGE DEPTH OF TARGET (aDOT): Deep threat (15+ yards) vs possession/slot (under 10)?
- CUSHION: How much space do defenders give them at snap?
- TARGET SHARE: % of team targets - who is the alpha?

**For RBs on ${homeTeam} and ${awayTeam}:**
- YARDS BEFORE CONTACT: How much is O-line creating vs RB creating?
- EXPECTED RUSHING YARDS: Based on blockers and defenders - are they over/under-performing?
- RUSH YARDS OVER EXPECTED (RYOE): Positive = creating, Negative = scheme-dependent
- 8+ DEFENDERS IN BOX %: How often are defenses stacking against them?

**For QBs on ${homeTeam} and ${awayTeam}:**
- COMPLETION % OVER EXPECTED (CPOE): Positive = accurate, Negative = inflated by scheme
- TIME TO THROW: Quick release (<2.5s) vs deep passer (>3.0s)?
- AGGRESSIVENESS: % of throws into tight windows
- PRESSURE RATE: How often is the O-line giving them time?
- CLEAN POCKET PASSER RATING vs UNDER PRESSURE RATING

**MATCHUP-SPECIFIC (Critical for Props):**
- How does ${homeTeam} defense rank in SEPARATION ALLOWED to WRs? Investigate how that affects opposing WR production.
- How does ${awayTeam} defense rank in PRESSURE RATE? Investigate how that affects opposing QB efficiency.
- Any player whose EXPECTED production diverges significantly from ACTUAL? Investigate whether the gap is sustainable.
- Compare expected vs actual for key players — what does the gap tell you about THIS matchup?

== SECTION 13: BETTING MARKET SIGNALS ==
SUPPLEMENTARY DATA ONLY - not decisive:
- LINE MOVEMENT: Has spread moved significantly?
- PUBLIC %: Lopsided public betting?

FORMAT with clear section headers. Be FACTUAL - say "No data found" if unsure.

CRITICAL RULES:
1. FACTS ONLY - Do NOT include any betting predictions, picks, or analysis from articles
2. NO OPINIONS - Do NOT copy predictions like "The Cowboys will cover because..." from any source
3. YOUR OWN WORDS - Synthesize facts, do NOT plagiarize text from articles
4. VERIFY STATS - Only include stats you can verify from official sources (including nextgenstats.nfl.com)
5. NO BETTING ADVICE - Gary will make his own decision - you just provide CONTEXT
6. NEXT GEN STATS: Prioritize data from nextgenstats.nfl.com for player tracking metrics
7. RED ZONE DATA: Prioritize red zone target/touch leaders for TD prop context`;
    }
    else {
      // Generic fallback for other sports
      prompt = `For the ${sport} game ${awayTeam} @ ${homeTeam} on ${today}:

Provide comprehensive narrative context including:
1. Breaking news and last-minute updates
2. Injuries and lineup changes
3. Motivation factors (revenge games, milestones, contract years)
4. Schedule context (back-to-backs, travel fatigue)
5. Team trends and recent form
6. Any betting line movement (as minor context only)

Be factual. Do NOT make predictions.`;
    }
    
    // Prepend date anchor to prevent training data contamination
    const dateAnchor = `<date_anchor>Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Use ONLY current 2025-26 season data.</date_anchor>\n`;
    prompt = dateAnchor + prompt;

    console.log(`[Props Narrative] Fetching comprehensive ${sport} context via Gemini...`);

    const result = await model.generateContent(prompt);
    const text = result?.response?.text?.() || '';
    
    if (!text || text.length < 100) {
      console.warn('[Props Narrative] Gemini returned insufficient content');
      return null;
    }
    
    console.log(`[Props Narrative] ✓ Got comprehensive context (${text.length} chars)`);
    
    // Parse into structured sections for easier access
    const sections = parseNarrativeSections(text);
    
    return {
      raw: text,
      sections: sections,
      sport: sport,
      matchup: `${awayTeam} @ ${homeTeam}`,
      fetchedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('[Props Narrative] Error fetching context:', error.message);
    return null;
  }
}

/**
 * Parse the narrative text into structured sections
 */
function parseNarrativeSections(text) {
  const sections = {
    breakingNews: '',
    motivation: '',
    schedule: '',
    playerContext: '',
    teamTrends: '',
    bettingSignals: '',
    injuries: '',
    qbSituation: '',
    goalies: '',
    weather: ''  // NEW: Weather section for NFL outdoor games
  };
  
  // Simple section extraction based on headers
  const sectionPatterns = [
    { key: 'breakingNews', patterns: ['BREAKING NEWS', 'SITUATIONAL', 'LAST-MINUTE', 'GAMEDAY INACTIVES'] },
    { key: 'motivation', patterns: ['MOTIVATION', 'REVENGE', 'MILESTONE', 'CONTRACT YEAR'] },
    { key: 'schedule', patterns: ['SCHEDULE', 'TRAVEL', 'BACK-TO-BACK', 'B2B', 'GAME CONTEXT'] },
    { key: 'weather', patterns: ['WEATHER', 'FORECAST', 'TEMPERATURE', 'WIND', 'OUTDOOR'] },
    { key: 'playerContext', patterns: ['PLAYER-SPECIFIC', 'PLAYER CONTEXT', 'TOP PLAYERS', 'TARGET SHARE'] },
    { key: 'teamTrends', patterns: ['TEAM TRENDS', 'STREAKS', 'WIN/LOSE', 'DIVISION'] },
    { key: 'bettingSignals', patterns: ['BETTING', 'LINE MOVEMENT', 'PUBLIC %', 'BETTING MARKET'] },
    { key: 'injuries', patterns: ['INJURY', 'INJURIES', 'INACTIVES'] },
    { key: 'qbSituation', patterns: ['QB SITUATION', 'STARTING QB', 'QUARTERBACK'] },
    { key: 'goalies', patterns: ['GOALIE', 'GOALIES', 'STARTING GOALIE'] }
  ];
  
  const lines = text.split('\n');
  let currentSection = '';
  let currentContent = [];
  
  for (const line of lines) {
    const upperLine = line.toUpperCase();
    
    // Check if this line starts a new section
    let newSection = null;
    for (const { key, patterns } of sectionPatterns) {
      if (patterns.some(p => upperLine.includes(p) && (upperLine.includes('==') || upperLine.includes('SECTION')))) {
        newSection = key;
        break;
      }
    }
    
    if (newSection) {
      // Save previous section
      if (currentSection && currentContent.length > 0) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      currentSection = newSection;
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  
  // Save final section
  if (currentSection && currentContent.length > 0) {
    sections[currentSection] = currentContent.join('\n').trim();
  }
  
  return sections;
}

/**
 * Fetch prop line movement data via Gemini Grounding
 * Queries ScoresAndOdds and BettingPros for opening vs. current lines
 * 
 * @param {string} sport - 'NBA' | 'NFL' | 'NHL'
 * @param {string} gameDate - Game date (YYYY-MM-DD or human readable)
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {Array} playerProps - Optional: specific players to check [{player, prop_type}]
 * @returns {Object} Map of player_propType -> lineMovement data
 */
export async function fetchPropLineMovement(sport, gameDate, homeTeam, awayTeam, playerProps = []) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[Line Movement] Gemini not available');
    return { movements: {}, source: 'UNAVAILABLE' };
  }

  try {
    const dateStr = gameDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    
    // Use Flash model for efficiency
    const modelName = process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview';
    
    const model = genAI.getGenerativeModel({
      model: modelName,
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 1.0, // Gemini 3: Keep at 1.0 - lower values cause looping/degraded performance
        maxOutputTokens: 3000
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    });

    // Build sport-specific prop types and star players to search
    let propTypes = '';
    let starPlayers = '';
    if (sport === 'NBA' || sport === 'basketball_nba') {
      propTypes = 'points, rebounds, assists, threes made';
    } else if (sport === 'NFL' || sport === 'americanfootball_nfl') {
      propTypes = 'passing yards, rushing yards, receiving yards, receptions';
    } else if (sport === 'NHL' || sport === 'icehockey_nhl') {
      propTypes = 'shots on goal, points, goals, assists';
    }

    // Query with a more natural prompt that's easier for Gemini to respond to
    const query = `Search site:scoresandodds.com and site:bettingpros.com for player prop betting lines for the ${sport.toUpperCase()} game: ${awayTeam} at ${homeTeam} on ${dateStr}.

I need to know which player prop lines have MOVED from their opening numbers. Look for props like ${propTypes}.

For each prop where you can find BOTH the opening line AND the current line, tell me:
- Player name
- Prop type (points, rebounds, yards, etc.)
- Opening line (the number it opened at)
- Current line (what it is now)

Example format:
"LeBron James points opened at 25.5, now at 27.5 (moved up 2 points)"
"Jayson Tatum rebounds opened at 8.5, now at 7.5 (moved down 1 point)"

Focus on significant moves (1+ point difference). List as many as you can find from ScoresAndOdds or BettingPros prop pages.`;

    console.log(`[Line Movement] Querying Gemini for ${sport} props: ${awayTeam} @ ${homeTeam}`);
    
    const result = await model.generateContent(query);
    const response = result.response;
    const text = response.text();

    if (!text) {
      console.log('[Line Movement] No response from Gemini');
      return { movements: {}, source: 'NO_DATA' };
    }

    console.log(`[Line Movement] Response received (${text.length} chars)`);
    // Debug: Log first 500 chars to see format
    console.log(`[Line Movement] Preview: ${text.substring(0, 500).replace(/\n/g, ' | ')}...`);

    // Parse the response into structured format
    const movements = parseLineMovementResponse(text, sport);
    
    console.log(`[Line Movement] Parsed ${Object.keys(movements).length} line movements`);

    return {
      movements,
      source: 'ScoresAndOdds/BettingPros',
      rawResponse: text,
      gameInfo: { sport, homeTeam, awayTeam, gameDate: dateStr }
    };

  } catch (error) {
    console.error('[Line Movement] Error:', error.message);
    return { movements: {}, source: 'ERROR', error: error.message };
  }
}

/**
 * Parse the Gemini response for line movement data
 * Uses multiple parsing strategies to handle different response formats
 * @param {string} text - Raw response text
 * @param {string} sport - Sport for context
 * @returns {Object} Map of player_prop -> movement data
 */
function parseLineMovementResponse(text, sport = '') {
  const movements = {};
  
  // FIRST: Strip markdown formatting that breaks regex
  // Remove bold (**text**), italic (*text*), and other markdown
  let cleanText = text
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove **bold**
    .replace(/\*([^*]+)\*/g, '$1')       // Remove *italic*
    .replace(/`([^`]+)`/g, '$1')         // Remove `code`
    .replace(/###?\s*/g, '')             // Remove ### headers
    .replace(/\|\s*\|/g, '\n')           // Convert table separators to newlines
    .replace(/\|/g, ' ')                 // Remove remaining pipes
    .replace(/\s+/g, ' ')                // Collapse multiple spaces
    .trim();
  
  console.log(`[Line Movement] Clean text preview: ${cleanText.substring(0, 300)}...`);
  
  // Strategy 1: Look for structured format (PLAYER:, PROP:, etc.)
  const structuredEntries = cleanText.split(/PLAYER:\s*/i).filter(e => e.trim());
  
  for (const entry of structuredEntries) {
    try {
      const playerMatch = entry.match(/^([A-Za-z\s\.\-']+?)(?:\n|PROP:)/i);
      if (!playerMatch) continue;
      const player = playerMatch[1].trim();
      
      const propMatch = entry.match(/PROP:\s*([^\n]+)/i);
      if (!propMatch) continue;
      const prop = propMatch[1].trim().toLowerCase();
      
      const openMatch = entry.match(/OPEN(?:ED)?(?:\s*(?:AT|:))?\s*([\d.]+)/i);
      if (!openMatch) continue;
      const open = parseFloat(openMatch[1]);
      
      const currentMatch = entry.match(/CURRENT(?:\s*(?:AT|:|\s+LINE))?\s*([\d.]+)/i);
      if (!currentMatch) continue;
      const current = parseFloat(currentMatch[1]);
      
      const directionMatch = entry.match(/DIRECTION:\s*(UP|DOWN)/i);
      const direction = directionMatch ? directionMatch[1].toUpperCase() : (current > open ? 'UP' : 'DOWN');
      
      addMovement(movements, player, prop, open, current, direction);
    } catch (e) {
      continue;
    }
  }
  
  // Strategy 2: Look for natural language patterns
  // Pattern: "Player Name prop opened at X, now at Y"
  const naturalPatterns = [
    // "Norman Powell (Heat) points opened at 20.5, now at 23.5" - with team in parens
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)*)\s*\([^)]+\)\s*(points?|rebounds?|assists?|threes?|shots?\s*(?:on\s*goal)?|goals?|yards?|receptions?|saves?|passing\s*yards?|rushing\s*yards?|receiving\s*yards?)(?:\s+(?:prop|line))?\s+opened\s+(?:at\s+)?([\d.]+)[,\s]+(?:now|currently)\s+(?:at\s+)?([\d.]+)/gi,
    
    // "LeBron James points opened at 25.5, now at 27.5" - without team
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s+(points?|rebounds?|assists?|threes?|shots?\s*(?:on\s*goal)?|goals?|yards?|receptions?|saves?|passing\s*yards?|rushing\s*yards?|receiving\s*yards?)(?:\s+(?:prop|line))?\s+opened\s+(?:at\s+)?([\d.]+)[,\s]+(?:now|currently)\s+(?:at\s+)?([\d.]+)/gi,
    
    // "Player Name's points line moved from 25.5 to 27.5"
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)(?:'s)?\s+(points?|rebounds?|assists?|threes?|shots?\s*(?:on\s*goal)?|goals?|yards?|receptions?|saves?|passing\s*yards?|rushing\s*yards?|receiving\s*yards?)(?:\s+(?:prop|line))?\s+(?:moved|went)\s+(?:from\s+)?([\d.]+)\s+to\s+([\d.]+)/gi,
    
    // "Points: 25.5 → 27.5" with player context
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)[:\s-]+\s*(points?|rebounds?|assists?|threes?|shots?|goals?|assists?|saves?|yards?|receptions?)[:\s]*([\d.]+)\s*(?:→|->|to|=>)\s*([\d.]+)/gi,
    
    // "Player Name - points 25.5 to 27.5" or "Player Name points: 25.5 -> 27.5"
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*[-–:]\s*(points?|rebounds?|assists?|threes?|shots?\s*(?:on\s*goal)?|goals?|yards?|receptions?|saves?)\s*(?::|prop|line)?\s*([\d.]+)\s*(?:→|->|to|=>|,\s*now)\s*([\d.]+)/gi,
    
    // Table format: "| Player Name | points | 25.5 | 27.5 |"
    /\|\s*([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*\|\s*(points?|rebounds?|assists?|threes?|shots?|goals?|yards?|receptions?|saves?)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/gi,
  ];
  
  // Strategy 2.5: Parse Gemini's structured format with "Opening Line:" and "Current Line:"
  // This handles output like: "Bam Adebayo (Heat) Prop Type: Points Opening Line: 14.5 Current Line: 15.5"
  const geminiStructuredPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)*)\s*\([^)]+\).*?Prop\s*Type:\s*(points?|rebounds?|assists?|threes?|shots?\s*(?:on\s*goal)?|goals?|yards?|receptions?|saves?).*?Opening\s*Line:\s*([\d.]+).*?Current\s*Line:\s*([\d.]+)/gi;
  
  let geminiMatch;
  while ((geminiMatch = geminiStructuredPattern.exec(cleanText)) !== null) {
    try {
      const [, player, prop, openStr, currentStr] = geminiMatch;
      const open = parseFloat(openStr);
      const current = parseFloat(currentStr);
      
      if (!isNaN(open) && !isNaN(current) && open !== current) {
        const direction = current > open ? 'UP' : 'DOWN';
        addMovement(movements, player.trim(), prop.trim().toLowerCase(), open, current, direction);
      }
    } catch (e) {
      continue;
    }
  }
  
  // Also try to find standalone "Opening Line: X Current Line: Y" with player context nearby
  const openingCurrentPattern = /Opening\s*Line:\s*([\d.]+).*?Current\s*Line:\s*([\d.]+)/gi;
  let ocMatch;
  while ((ocMatch = openingCurrentPattern.exec(cleanText)) !== null) {
    try {
      const open = parseFloat(ocMatch[1]);
      const current = parseFloat(ocMatch[2]);
      
      if (isNaN(open) || isNaN(current) || open === current) continue;
      
      // Look backwards for player and prop type
      const beforeText = cleanText.substring(Math.max(0, ocMatch.index - 200), ocMatch.index);
      
      // Find player name (with team in parens)
      const playerMatch = beforeText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z']+)*)\s*\([^)]+\)/);
      const playerWithoutTeam = beforeText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*$/);
      const player = playerMatch ? playerMatch[1] : (playerWithoutTeam ? playerWithoutTeam[1] : null);
      
      // Find prop type
      const propMatch = beforeText.match(/Prop\s*Type:\s*(points?|rebounds?|assists?|threes?|shots?|goals?|yards?|receptions?|saves?)/i) ||
                        beforeText.match(/(points?|rebounds?|assists?|threes?|shots?\s*(?:on\s*goal)?|goals?|yards?|receptions?|saves?)\s*$/i);
      const prop = propMatch ? propMatch[1] : null;
      
      if (player && prop) {
        const direction = current > open ? 'UP' : 'DOWN';
        addMovement(movements, player.trim(), prop.trim().toLowerCase(), open, current, direction);
      }
    } catch (e) {
      continue;
    }
  }
  
  for (const pattern of naturalPatterns) {
    let match;
    pattern.lastIndex = 0; // Reset regex state
    while ((match = pattern.exec(cleanText)) !== null) {
      try {
        const [, player, prop, openStr, currentStr] = match;
        const open = parseFloat(openStr);
        const current = parseFloat(currentStr);
        
        if (!isNaN(open) && !isNaN(current) && open !== current) {
          const direction = current > open ? 'UP' : 'DOWN';
          addMovement(movements, player.trim(), prop.trim().toLowerCase(), open, current, direction);
        }
      } catch (e) {
        continue;
      }
    }
  }
  
  // Strategy 3: Look for any "opened/open" and "now/current" numbers near player names
  const lines = cleanText.split(/\n|(?:\.\s+)/); // Split on newlines or sentence endings
  let currentPlayer = null;
  
  for (const line of lines) {
    // Check if line mentions a player (capitalized name pattern)
    const playerInLine = line.match(/^[•\-\*]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)/);
    if (playerInLine) {
      currentPlayer = playerInLine[1].trim();
    }
    
    // Also check for player with team in parens: "Norman Powell (Heat)"
    const playerWithTeam = line.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z']+)*)\s*\([^)]+\)/);
    if (playerWithTeam) {
      currentPlayer = playerWithTeam[1].trim();
    }
    
    // Look for open/current pattern in the line
    const openCurrentMatch = line.match(/open(?:ed|ing)?\s*(?:at|:)?\s*([\d.]+).*?(?:now|current(?:ly)?|moved\s+to)\s*(?:at|:)?\s*([\d.]+)/i);
    if (openCurrentMatch && currentPlayer) {
      const open = parseFloat(openCurrentMatch[1]);
      const current = parseFloat(openCurrentMatch[2]);
      
      // Try to find prop type in the line
      const propMatch = line.match(/(points?|rebounds?|assists?|threes?|shots?\s*(?:on\s*goal)?|goals?|yards?|receptions?|saves?|passing|rushing|receiving)/i);
      const prop = propMatch ? propMatch[1].toLowerCase() : 'unknown';
      
      if (!isNaN(open) && !isNaN(current) && open !== current) {
        const direction = current > open ? 'UP' : 'DOWN';
        addMovement(movements, currentPlayer, prop, open, current, direction);
      }
    }
  }
  
  // Strategy 4: Look for "X.5 to Y.5" or "X.5 → Y.5" patterns with nearby player names
  const numberMovePattern = /([\d.]+)\s*(?:→|->|to|=>)\s*([\d.]+)/g;
  let numberMatch;
  while ((numberMatch = numberMovePattern.exec(cleanText)) !== null) {
    const open = parseFloat(numberMatch[1]);
    const current = parseFloat(numberMatch[2]);
    
    if (isNaN(open) || isNaN(current) || open === current) continue;
    
    // Look backwards for player name (within 100 chars)
    const beforeText = cleanText.substring(Math.max(0, numberMatch.index - 100), numberMatch.index);
    const playerBefore = beforeText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*(?:[-–:]|'s)?\s*$/);
    
    // Look for prop type nearby
    const contextText = cleanText.substring(Math.max(0, numberMatch.index - 50), Math.min(cleanText.length, numberMatch.index + 50));
    const propNearby = contextText.match(/(points?|rebounds?|assists?|threes?|shots?\s*(?:on\s*goal)?|goals?|yards?|receptions?|saves?|passing|rushing|receiving)/i);
    
    if (playerBefore && propNearby) {
      const direction = current > open ? 'UP' : 'DOWN';
      addMovement(movements, playerBefore[1].trim(), propNearby[1].toLowerCase(), open, current, direction);
    }
  }
  
  return movements;
}

/**
 * Helper to add a movement entry, avoiding duplicates
 */
function addMovement(movements, player, prop, open, current, direction) {
  // Normalize prop name
  prop = prop.replace(/\s+/g, '_').toLowerCase();
  if (prop.includes('shot') && !prop.includes('goal')) prop = 'shots_on_goal';
  if (prop === 'three' || prop === 'threes') prop = 'threes';
  if (prop === 'point' || prop === 'pts') prop = 'points';
  if (prop === 'rebound' || prop === 'reb') prop = 'rebounds';
  if (prop === 'assist' || prop === 'ast') prop = 'assists';
  
  const key = `${player}_${prop}`.toLowerCase().replace(/\s+/g, '_');
  
  // Only add if not already present (avoid duplicates from multiple strategies)
  if (!movements[key]) {
    const magnitude = parseFloat((current - open).toFixed(1));
    
    movements[key] = {
      player,
      prop,
      open,
      current,
      direction,
      magnitude,
      signal: Math.abs(magnitude) >= 2.0 ? `MOVED_${direction}` : 'STABLE',
      killCondition: {
        triggered: false,
        reason: null
      }
    };
    
    console.log(`[Line Movement] Found: ${player} ${prop}: ${open} → ${current} (${direction} ${Math.abs(magnitude)})`);
  }
}

/**
 * Get line movement for a specific player prop
 * @param {Object} movements - Full movements map from fetchPropLineMovement
 * @param {string} playerName - Player name to look up
 * @param {string} propType - Prop type (points, rebounds, etc.)
 * @returns {Object|null} Line movement data or null if not found
 */
export function getPlayerPropMovement(movements, playerName, propType) {
  if (!movements || !playerName || !propType) return null;
  
  const key = `${playerName}_${propType}`.toLowerCase().replace(/\s+/g, '_');
  
  // Try exact match first
  if (movements[key]) return movements[key];
  
  // Try partial match on player name
  const keys = Object.keys(movements);
  for (const k of keys) {
    const data = movements[k];
    if (data.player.toLowerCase().includes(playerName.toLowerCase()) &&
        data.prop.toLowerCase().includes(propType.toLowerCase())) {
      return data;
    }
  }
  
  return null;
}

/**
 * Build a VERIFIED Tale of the Tape from BDL data
 * This ensures stats shown to users are accurate, not hallucinated by LLM
 * 
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name  
 * @param {Object} homeProfile - Home team profile from fetchTeamProfile
 * @param {Object} awayProfile - Away team profile from fetchTeamProfile
 * @param {string} sport - Sport key (NBA, NHL, NFL, NCAAB, etc.)
 * @param {Object} injuries - Injury data for key injuries row
 * @param {Array} recentHome - Recent games for home team (for L5 form)
 * @param {Array} recentAway - Recent games for away team (for L5 form)
 * @returns {string} Formatted Tale of the Tape table
 */
export function buildVerifiedTaleOfTape(homeTeam, awayTeam, homeProfile, awayProfile, sport, injuries = {}, recentHome = [], recentAway = [], ncaabAdvancedMetrics = null) {
  const homeStats = homeProfile?.seasonStats || {};
  const awayStats = awayProfile?.seasonStats || {};

  // Calculate L5 record from recent games
  const calcL5Record = (teamName, recentGames) => {
    if (!recentGames || recentGames.length === 0) return 'N/A';

    // Filter to completed games only
    const completed = recentGames.filter(g => (g.home_team_score ?? g.home_score ?? 0) > 0 || (g.visitor_team_score ?? g.away_score ?? 0) > 0);
    if (completed.length === 0) return 'N/A';

    let wins = 0, losses = 0;
    const last5 = completed.slice(0, 5);

    for (const game of last5) {
      const homeTeamName = game.home_team?.name || game.home_team?.full_name || '';
      const isHome = homeTeamName.toLowerCase().includes(teamName.toLowerCase().split(' ').pop()) ||
                     teamName.toLowerCase().includes(homeTeamName.toLowerCase().split(' ').pop());
      const teamScore = isHome ? (game.home_team_score ?? game.home_score ?? 0) : (game.visitor_team_score ?? game.away_score ?? 0);
      const oppScore = isHome ? (game.visitor_team_score ?? game.away_score ?? 0) : (game.home_team_score ?? game.home_score ?? 0);
      if (teamScore > oppScore) wins++;
      else losses++;
    }

    return `${wins}-${losses}`;
  };

  const homeL5 = calcL5Record(homeTeam, recentHome);
  const awayL5 = calcL5Record(awayTeam, recentAway);
  
  // Helper to format stat — neutral presentation, no directional arrows
  // Gary compares the numbers himself — we don't pre-digest who's "better"
  const formatStat = (homeStat, awayStat, higherIsBetter = true) => {
    return { arrow: '|', home: homeStat || 'N/A', away: awayStat || 'N/A' };
  };
  
  // Get key injuries for each team (truncate if too long)
  const getKeyInjuries = (teamInjuries) => {
    if (!teamInjuries || teamInjuries.length === 0) return 'None';
    const out = teamInjuries.filter(i => i.status === 'Out' || i.status === 'OUT');
    const questionable = teamInjuries.filter(i => i.status === 'Questionable' || i.status === 'GTD' || i.status === 'Day-To-Day');
    const parts = [];
    // FIX: i.player can be an object {first_name, last_name} or a string - handle both
    const getPlayerName = (i) => {
      if (typeof i.player === 'string') return i.player;
      if (i.player?.first_name) return `${i.player.first_name} ${i.player.last_name || ''}`.trim();
      if (i.name) return i.name;
      return 'Unknown';
    };
    if (out.length > 0) parts.push(out.slice(0, 2).map(i => `${getPlayerName(i)} (O)`).join(', '));
    if (questionable.length > 0) parts.push(questionable.slice(0, 1).map(i => `${getPlayerName(i)} (Q)`).join(', '));
    return parts.join(', ') || 'None';
  };
  
  const homeInjuries = getKeyInjuries(injuries?.home);
  const awayInjuries = getKeyInjuries(injuries?.away);
  
  // Pad strings for alignment
  const padLeft = (str, len) => String(str).padStart(len);
  const padRight = (str, len) => String(str).padEnd(len);
  
  // Calculate column widths based on team names
  const col1Width = Math.max(homeTeam.length, 20);
  const col2Width = Math.max(awayTeam.length, 20);
  
  let rows = [];
  
  // Sport-specific stats
  if (sport === 'NBA' || sport === 'basketball_nba' || sport === 'NCAAB' || sport === 'basketball_ncaab') {
    // Basketball stats
    const isNcaab = sport === 'NCAAB' || sport === 'basketball_ncaab';
    const record = formatStat(homeProfile?.record, awayProfile?.record, true);
    const offRtg = formatStat(
      homeStats.offensive_rating?.toFixed?.(1) || homeStats.offensive_rating,
      awayStats.offensive_rating?.toFixed?.(1) || awayStats.offensive_rating,
      true
    );
    const defRtg = formatStat(
      homeStats.defensive_rating?.toFixed?.(1) || homeStats.defensive_rating,
      awayStats.defensive_rating?.toFixed?.(1) || awayStats.defensive_rating,
      false // Lower is better for defense
    );
    
    // Calculate net rating
    const homeNetRtg = (parseFloat(homeStats.offensive_rating) || 0) - (parseFloat(homeStats.defensive_rating) || 0);
    const awayNetRtg = (parseFloat(awayStats.offensive_rating) || 0) - (parseFloat(awayStats.defensive_rating) || 0);
    const netRtg = formatStat(
      homeNetRtg ? (homeNetRtg > 0 ? '+' : '') + homeNetRtg.toFixed(1) : 'N/A',
      awayNetRtg ? (awayNetRtg > 0 ? '+' : '') + awayNetRtg.toFixed(1) : 'N/A',
      true
    );
    
    // L5 Form - PRIMARY indicator for recent performance
    const l5Form = formatStat(homeL5, awayL5, true);

    rows = [
      { label: 'L5 Form', ...l5Form },  // L5 FIRST - most important for picking
      { label: 'Record', ...record }
    ];

    // Add conference record and Barttorvik efficiency metrics for NCAAB
    if (isNcaab) {
      const confRecord = formatStat(homeProfile?.conferenceRecord, awayProfile?.conferenceRecord, true);
      rows.push({ label: 'Conf Record', ...confRecord });

      // Wire up Barttorvik AdjOE/AdjDE/Tempo — the components behind the composite rankings
      if (ncaabAdvancedMetrics) {
        const hd = ncaabAdvancedMetrics.home?.data;
        const ad = ncaabAdvancedMetrics.away?.data;
        const adjOE = formatStat(
          hd?.adjOE != null ? String(hd.adjOE) : null,
          ad?.adjOE != null ? String(ad.adjOE) : null,
          true
        );
        const adjDE = formatStat(
          hd?.adjDE != null ? String(hd.adjDE) : null,
          ad?.adjDE != null ? String(ad.adjDE) : null,
          false // Lower is better for defense
        );
        const tempo = formatStat(
          hd?.tempo != null ? String(hd.tempo) : null,
          ad?.tempo != null ? String(ad.tempo) : null,
          true
        );
        rows.push(
          { label: 'AdjOE', ...adjOE },
          { label: 'AdjDE', ...adjDE },
          { label: 'Tempo', ...tempo }
        );
      }
    }

    rows.push(
      { label: 'Key Injuries', home: homeInjuries, away: awayInjuries, arrow: '' }
    );
    
  } else if (sport === 'NHL' || sport === 'icehockey_nhl') {
    // Hockey stats - now with REQUIRED goalie table per NHL constitution
    const record = formatStat(homeProfile?.record, awayProfile?.record, true);
    
    // Format goals per game - handle both number and string inputs
    const formatGoals = (val) => {
      if (val === undefined || val === null) return 'N/A';
      const num = typeof val === 'number' ? val : parseFloat(val);
      return !isNaN(num) ? num.toFixed(2) : 'N/A';
    };
    
    const goalsFor = formatStat(
      formatGoals(homeStats.goals_for_per_game),
      formatGoals(awayStats.goals_for_per_game),
      true
    );
    const goalsAgainst = formatStat(
      formatGoals(homeStats.goals_against_per_game),
      formatGoals(awayStats.goals_against_per_game),
      false // Lower is better
    );
    
    // Format PP/PK percentages - handle decimal format (0.17619) vs percentage format
    const formatPct = (val) => {
      if (val === undefined || val === null) return 'N/A';
      const num = typeof val === 'number' ? val : parseFloat(val);
      if (isNaN(num)) return 'N/A';
      // If value is < 1, it's decimal format (e.g., 0.17619 = 17.6%)
      return num < 1 ? (num * 100).toFixed(1) + '%' : num.toFixed(1) + '%';
    };
    
    const ppPct = formatStat(
      formatPct(homeStats.power_play_percentage),
      formatPct(awayStats.power_play_percentage),
      true
    );
    const pkPct = formatStat(
      formatPct(homeStats.penalty_kill_percentage),
      formatPct(awayStats.penalty_kill_percentage),
      true
    );
    
    // Additional NHL-specific stats from BDL
    const shotsFor = formatStat(
      homeStats.shots_for_per_game?.toFixed?.(1) || homeStats.shots_for_per_game || 'N/A',
      awayStats.shots_for_per_game?.toFixed?.(1) || awayStats.shots_for_per_game || 'N/A',
      true
    );
    const faceoffPct = formatStat(
      homeStats.faceoff_win_percentage ? (parseFloat(homeStats.faceoff_win_percentage) * 100).toFixed(1) + '%' : 'N/A',
      awayStats.faceoff_win_percentage ? (parseFloat(awayStats.faceoff_win_percentage) * 100).toFixed(1) + '%' : 'N/A',
      true
    );
    
    // L5 Form - PRIMARY indicator for recent performance
    const l5Form = formatStat(homeL5, awayL5, true);

    rows = [
      { label: 'L5 Form', ...l5Form },  // L5 FIRST - most important for picking
      { label: 'Record', ...record },
      { label: 'Goals For/Gm', ...goalsFor },
      { label: 'Goals Agst/Gm', ...goalsAgainst },
      { label: 'Shots For/Gm', ...shotsFor },
      { label: 'Power Play %', ...ppPct },
      { label: 'Penalty Kill %', ...pkPct },
      { label: 'Faceoff Win %', ...faceoffPct },
      { label: 'Key Injuries', home: homeInjuries, away: awayInjuries, arrow: '' }
    ];
    
    // Add NHL-specific note about goalie comparison
    // (Actual goalie stats come from Scout Report RotoWire grounding)
    
  } else if (sport === 'NFL' || sport === 'americanfootball_nfl') {
    // NFL stats - has points per game fields
    const record = formatStat(homeProfile?.record, awayProfile?.record, true);
    const ppg = formatStat(
      homeStats.total_points_per_game?.toFixed?.(1) || homeStats.total_points_per_game,
      awayStats.total_points_per_game?.toFixed?.(1) || awayStats.total_points_per_game,
      true
    );
    const oppPpg = formatStat(
      homeStats.opp_total_points_per_game?.toFixed?.(1) || homeStats.opp_total_points_per_game,
      awayStats.opp_total_points_per_game?.toFixed?.(1) || awayStats.opp_total_points_per_game,
      false // Lower is better
    );
    const rushYpg = formatStat(
      homeStats.rushing_yards_per_game?.toFixed?.(1) || homeStats.rushing_yards_per_game,
      awayStats.rushing_yards_per_game?.toFixed?.(1) || awayStats.rushing_yards_per_game,
      true
    );
    const passYpg = formatStat(
      homeStats.net_passing_yards_per_game?.toFixed?.(1) || homeStats.net_passing_yards_per_game,
      awayStats.net_passing_yards_per_game?.toFixed?.(1) || awayStats.net_passing_yards_per_game,
      true
    );
    
    // L5 Form - PRIMARY indicator for recent performance
    const l5Form = formatStat(homeL5, awayL5, true);

    rows = [
      { label: 'L5 Form', ...l5Form },  // L5 FIRST - most important for picking
      { label: 'Record', ...record },
      { label: 'Points/Gm', ...ppg },
      { label: 'Opp Pts/Gm', ...oppPpg },
      { label: 'Rush Yds/Gm', ...rushYpg },
      { label: 'Pass Yds/Gm', ...passYpg },
      { label: 'Key Injuries', home: homeInjuries, away: awayInjuries, arrow: '' }
    ];

  } else if (sport === 'NCAAF' || sport === 'americanfootball_ncaaf') {
    // NCAAF stats - BDL provides different fields than NFL
    // Available: passing_yards_per_game, rushing_yards_per_game, opp_passing_yards, opp_rushing_yards
    // NOT available: total_points_per_game, opp_total_points_per_game
    const record = formatStat(homeProfile?.record, awayProfile?.record, true);
    const passYpg = formatStat(
      homeStats.passing_yards_per_game?.toFixed?.(1) || homeStats.passing_yards_per_game,
      awayStats.passing_yards_per_game?.toFixed?.(1) || awayStats.passing_yards_per_game,
      true
    );
    const rushYpg = formatStat(
      homeStats.rushing_yards_per_game?.toFixed?.(1) || homeStats.rushing_yards_per_game,
      awayStats.rushing_yards_per_game?.toFixed?.(1) || awayStats.rushing_yards_per_game,
      true
    );
    // Calculate total yards per game
    const homeTotalYpg = (parseFloat(homeStats.passing_yards_per_game) || 0) + (parseFloat(homeStats.rushing_yards_per_game) || 0);
    const awayTotalYpg = (parseFloat(awayStats.passing_yards_per_game) || 0) + (parseFloat(awayStats.rushing_yards_per_game) || 0);
    const totalYpg = formatStat(
      homeTotalYpg > 0 ? homeTotalYpg.toFixed(1) : null,
      awayTotalYpg > 0 ? awayTotalYpg.toFixed(1) : null,
      true
    );
    // Opp yards (total season, not per game - but useful for comparison)
    const oppPassYds = formatStat(
      homeStats.opp_passing_yards,
      awayStats.opp_passing_yards,
      false // Lower is better
    );
    const oppRushYds = formatStat(
      homeStats.opp_rushing_yards,
      awayStats.opp_rushing_yards,
      false // Lower is better
    );
    
    // L5 Form - PRIMARY indicator for recent performance
    const l5Form = formatStat(homeL5, awayL5, true);

    rows = [
      { label: 'L5 Form', ...l5Form },  // L5 FIRST - most important for picking
      { label: 'Record', ...record },
      { label: 'Pass Yds/Gm', ...passYpg },
      { label: 'Rush Yds/Gm', ...rushYpg },
      { label: 'Total Yds/Gm', ...totalYpg },
      { label: 'Opp Pass Yds', ...oppPassYds },
      { label: 'Opp Rush Yds', ...oppRushYds },
      { label: 'Key Injuries', home: homeInjuries, away: awayInjuries, arrow: '' }
    ];

  } else {
    // Generic fallback
    const record = formatStat(homeProfile?.record, awayProfile?.record, true);
    const l5Form = formatStat(homeL5, awayL5, true);
    rows = [
      { label: 'L5 Form', ...l5Form },  // L5 FIRST - most important for picking
      { label: 'Record', ...record },
      { label: 'Key Injuries', home: homeInjuries, away: awayInjuries, arrow: '' }
    ];
  }
  
  // Build the formatted table
  const headerLine = `                    ${padRight(homeTeam, col1Width)}    ${awayTeam}`;
  const rowLines = rows.map(row => {
    const label = padRight(row.label, 14);
    const homeVal = padLeft(row.home, 12);
    const arrow = row.arrow ? `  ${row.arrow}  ` : '     ';
    const awayVal = row.away;
    return `${label}${homeVal}${arrow}${awayVal}`;
  });

  const formattedText = `TALE OF THE TAPE (VERIFIED FROM BDL)

${headerLine}
${rowLines.join('\n')}`;

  // Return both formatted text AND structured rows for iOS app
  // The structured rows can be used for pick card display when toolCallHistory is sparse
  return {
    text: formattedText,
    rows: rows.map(row => ({
      name: row.label,
      token: row.label.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
      home: { team: homeTeam, value: row.home },
      away: { team: awayTeam, value: row.away }
    }))
  };
}

export { fetchCurrentState, fetchComprehensivePropsNarrative };
export default {
  buildScoutReport,
  fetchComprehensivePropsNarrative,
  fetchPropLineMovement,
  getPlayerPropMovement,
  geminiGroundingSearch,
  getGroundedWeather,
  buildVerifiedTaleOfTape
};

