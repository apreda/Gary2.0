/**
 * NFL Scout Report Builder
 * Handles all NFL-specific logic for building the pre-game scout report.
 */

import axios from 'axios';
import { ballDontLieService } from '../../../ballDontLieService.js';
import { generateGameSignificance } from '../gameSignificanceGenerator.js';
import { formatTokenMenu } from '../../tools/toolDefinitions.js';
import { nflSeason } from '../../../../utils/dateUtils.js';
import {
  seasonForSport,
  sportToBdlKey,
  findTeam,
  formatGameTime,
  getInjuryStatusFromMap
} from '../shared/utilities.js';
import { fetchStandingsSnapshot } from '../shared/grounding.js';
import {
  fetchTeamProfile,
  fetchInjuries,
  fetchRecentGames,
  fetchH2HData,
  scrubNarrative,
  formatInjuryReport,
  formatStartingLineups,
  formatOdds,
  formatRestSituation,
  calculateRestSituation,
  formatRecentForm,
  formatH2HSection
} from '../shared/dataFetchers.js';
import { buildVerifiedTaleOfTape } from '../shared/taleOfTape.js';


// =========================================================================
// NFL STADIUM MAPPING
// Reliable venue data — avoids Grounding flakiness for NFL venues
// =========================================================================
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


// =========================================================================
// fetchQBStatsByName
// Fetches season stats for a specific QB by name from BDL
// =========================================================================
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
    const nflSeasonYear = nflMonth <= 7 ? nflYear - 1 : nflYear;

    // Fetch all player stats for the team
    const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/season_stats?season=${nflSeasonYear}&team_id=${team.id}&per_page=100`;
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


// =========================================================================
// fetchStartingQBs
// Fetch starting QBs for both teams (NFL/NCAAF only)
//
// APPROACH: Use BDL's Team Roster with Depth Chart (most reliable)
// 1. Get roster with depth chart positions (depth=1 is starter)
// 2. Check injury_status - if starter is out, use backup (depth=2)
// 3. Then fetch season stats for the actual starter
//
// This is more reliable than:
// - Season stat leaders (returns inactive players like Joe Flacco)
// - Fallback sources (can be wrong/outdated)
// =========================================================================
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
      console.log(`[Scout Report] Home QB: Retrieved via Gemini Grounding (BDL depth chart unavailable)`);
    }
    if (awayQB && awayQB.name !== 'See grounded context') {
      const backupNote = awayQB.isBackup ? ' [BACKUP - starter injured]' : '';
      const injuryNote = awayQB.injuryStatus ? ` (${awayQB.injuryStatus})` : '';
      const expLabel = awayQB.experience ? ` [${awayQB.experience}]` : '';
      console.log(`[Scout Report] Away QB: ${awayQB.name}${expLabel} (${awayQB.passingYards || 0} yds, ${awayQB.passingTds || 0} TDs, ${awayQB.gamesPlayed || 0} GP)${backupNote}${injuryNote}`);
    } else if (isNCAAF) {
      console.log(`[Scout Report] Away QB: Retrieved via Gemini Grounding (BDL depth chart unavailable)`);
    }

    return { home: homeQB, away: awayQB };
  } catch (error) {
    console.error('[Scout Report] Error fetching starting QBs:', error.message);
    return null;
  }
}


// =========================================================================
// fetchNCAAFStartingQBFromStats
// NCAAF Fallback: Get starting QB from player season stats (by most passing yards)
// BDL depth chart is sparse for college - this uses actual season stats instead
// Falls back to Gemini Grounding if BDL has no data
// =========================================================================
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
                  opponent: g.game?.home_team?.full_name === teamName ? (g.game?.visitor_team?.full_name || g.game?.away_team?.full_name) : g.game?.home_team?.full_name,
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


// =========================================================================
// fetchKeyPlayers
// Fetch key players (starters) for both NFL teams
// Uses roster depth chart + season stats to show who actually plays
// This prevents hallucinations about players who've been traded/cut
// =========================================================================
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


// =========================================================================
// formatKeyPlayers
// Format key players section for display
// ENHANCED: Now includes "TOP RECEIVING TARGETS" section
// =========================================================================
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
TOP RECEIVING TARGETS (by receiving yards)
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
KEY PLAYERS (CURRENT ROSTER)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${homeSection}

${awaySection}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}


// =========================================================================
// formatNflRosterDepth
// Format NFL roster depth for key skill positions
// =========================================================================
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

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  return lines.join('\n');
}


// =========================================================================
// formatNflPlayoffHistory
// Format NFL playoff history section — shows previous playoff games this
// season with box scores and key narratives
// =========================================================================
function formatNflPlayoffHistory(homeTeam, awayTeam, playoffHistory, homeTeamId, awayTeamId) {
  if (!playoffHistory || !playoffHistory.games || playoffHistory.games.length === 0) {
    return '';
  }

  const { games, teamStats, playerStats } = playoffHistory;

  const lines = [
    '',
    'PREVIOUS PLAYOFF RESULTS THIS SEASON (FROM BDL)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'Completed playoff games this postseason.',
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
    g.home_team?.id === homeTeamId || g.visitor_team?.id === homeTeamId || g.away_team?.id === homeTeamId
  );
  const awayTeamGames = games.filter(g =>
    g.home_team?.id === awayTeamId || g.visitor_team?.id === awayTeamId || g.away_team?.id === awayTeamId
  );

  // Format games for home team
  if (homeTeamGames.length > 0) {
    lines.push(`${homeTeam.toUpperCase()} - PLAYOFF RESULTS:`);

    for (const game of homeTeamGames) {
      const gameDate = new Date(game.date);
      const dateStr = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const round = game.playoffRound || 'Playoff';

      const isHome = game.home_team?.id === homeTeamId;
      const awayTeamObj = game.visitor_team || game.away_team;
      const opponent = isHome ? awayTeamObj : game.home_team;
      const teamScore = isHome ? game.home_team_score : (game.visitor_team_score ?? game.away_team_score);
      const oppScore = isHome ? (game.visitor_team_score ?? game.away_team_score) : game.home_team_score;
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
      const awayPerformers = formatKeyPerformers(game.id, awayTeamObj?.id);
      if (homePerformers || awayPerformers) {
        lines.push('   KEY PERFORMERS:');
        if (homePerformers) {
          lines.push(`   ${game.home_team?.name || 'Home'}:${homePerformers}`);
        }
        if (awayPerformers) {
          lines.push(`   ${awayTeamObj?.name || 'Away'}:${awayPerformers}`);
        }
      }

      // Add game summary if available
      if (game.summary) {
        lines.push(`   ${game.summary}`);
      }
      lines.push('');
    }
  }

  // Format games for away team (only if different from home team games)
  const awayOnlyGames = awayTeamGames.filter(g =>
    !homeTeamGames.some(hg => hg.id === g.id)
  );

  if (awayOnlyGames.length > 0) {
    lines.push(`${awayTeam.toUpperCase()} - PLAYOFF RESULTS:`);

    for (const game of awayOnlyGames) {
      const gameDate = new Date(game.date);
      const dateStr = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const round = game.playoffRound || 'Playoff';

      const isHome = game.home_team?.id === awayTeamId;
      const awayTeamObj2 = game.visitor_team || game.away_team;
      const opponent = isHome ? awayTeamObj2 : game.home_team;
      const teamScore = isHome ? game.home_team_score : (game.visitor_team_score ?? game.away_team_score);
      const oppScore = isHome ? (game.visitor_team_score ?? game.away_team_score) : game.home_team_score;
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
      const awayPerformers = formatKeyPerformers(game.id, awayTeamObj2?.id);
      if (homePerformers || awayPerformers) {
        lines.push('   KEY PERFORMERS:');
        if (homePerformers) {
          lines.push(`   ${game.home_team?.name || 'Home'}:${homePerformers}`);
        }
        if (awayPerformers) {
          lines.push(`   ${awayTeamObj2?.name || 'Away'}:${awayPerformers}`);
        }
      }

      // Add game summary if available
      if (game.summary) {
        lines.push(`   ${game.summary}`);
      }
      lines.push('');
    }
  } else if (awayTeamGames.length > 0 && awayTeamGames.every(g => homeTeamGames.some(hg => hg.id === g.id))) {
    // Teams played each other already this postseason
    lines.push(`${awayTeam.toUpperCase()} - Same playoff game(s) as ${homeTeam} above`);
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  return lines.join('\n');
}


// =========================================================================
// formatStartingQBs
// Format starting QBs section for both teams (NFL/NCAAF)
// =========================================================================
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
      homeQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: qb.isBackup };
    } else if (qb.isBackup) {
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
      awayQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: qb.isBackup };
    } else if (qb.isBackup) {
      awayQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: true };
    } else if ((qb.gamesPlayed || 0) <= 5) {
      // Even if not flagged as backup, very few games = new starter this season
      awayQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: false };
    }
  } else {
    lines.push(`[AWAY] ${awayTeam}: QB data unavailable`);
  }

  lines.push('');

  // Add QB SITUATION section if either team has a new/backup QB
  if (homeQbChangeSituation || awayQbChangeSituation) {
    lines.push('');
    lines.push('QB SITUATION');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (homeQbChangeSituation) {
      const qb = homeQbChangeSituation;
      lines.push(`${homeTeam}:`);
      lines.push(`   Current QB: ${qb.name} (${qb.gamesPlayed} career starts)`);
    }

    if (awayQbChangeSituation) {
      const qb = awayQbChangeSituation;
      lines.push(`${awayTeam}:`);
      lines.push(`   Current QB: ${qb.name} (${qb.gamesPlayed} career starts)`);
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
  }

  lines.push('QB data from BDL (2025-26 season).');
  lines.push('');

  return lines.join('\n');
}


// =========================================================================
// MAIN: buildNflScoutReport
// =========================================================================
export async function buildNflScoutReport(game, options = {}) {
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  const sportKey = 'NFL';

  // ===================================================================
  // Step A: Fetch shared base data in parallel
  // ===================================================================
  const [homeProfile, awayProfile, injuries, recentHome, recentAway, standingsSnapshot] = await Promise.all([
    fetchTeamProfile(homeTeam, sportKey),
    fetchTeamProfile(awayTeam, sportKey),
    fetchInjuries(homeTeam, awayTeam, sportKey),
    fetchRecentGames(homeTeam, sportKey, 8),
    fetchRecentGames(awayTeam, sportKey, 8),
    fetchStandingsSnapshot(sportKey, homeTeam, awayTeam)
  ]);

  // ===================================================================
  // Step B: Set venue from NFL stadium mapping
  // ===================================================================
  const homeVenue = nflStadiums[homeTeam];
  if (homeVenue) {
    game.venue = homeVenue;
    console.log(`[Scout Report] ✓ NFL Venue (from mapping): ${homeVenue}`);
  }
  // Game context: primetime slots detected from game time, playoff rounds from game name

  // ===================================================================
  // Step C: Fetch starting QBs (pass injuries to filter out IR/Out players)
  // ===================================================================
  const startingQBs = await fetchStartingQBs(homeTeam, awayTeam, sportKey, injuries);

  // ===================================================================
  // Step D: Fetch key players (roster + stats) to prevent hallucinations
  // ===================================================================
  const keyPlayers = await fetchKeyPlayers(homeTeam, awayTeam, sportKey);

  // ===================================================================
  // Step E: Fetch NFL roster depth + playoff history
  // ===================================================================
  let nflRosterDepth = null;
  let nflPlayoffHistory = null;
  let nflHomeTeamId = null;
  let nflAwayTeamId = null;

  const nflSeasonYear = nflSeason();

  try {
    nflRosterDepth = await ballDontLieService.getNflRosterDepth(homeTeam, awayTeam, nflSeasonYear);
  } catch (e) {
    console.warn('[Scout Report] NFL roster depth error:', e.message);
  }

  // For NFL playoff games, fetch previous playoff results this season
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

  // ===================================================================
  // Step F: Set NFL tournament context (primetime / playoff round)
  // ===================================================================
  const gameDate = new Date(game.commence_time);
  const day = gameDate.getUTCDay(); // 0=Sun, 1=Mon, 4=Thu
  const hour = gameDate.getUTCHours(); // UTC hours

  // Simple primetime detection (games starting after 8pm ET / 1am UTC)
  if (day === 1 && hour >= 0) game.tournamentContext = 'MNF';
  else if (day === 4 && hour >= 0) game.tournamentContext = 'TNF';
  else if (day === 0 && hour >= 23) game.tournamentContext = 'SNF';

  // Also check for "Divisional", "Wild Card", etc. in game name
  if (lowerName.includes('divisional')) game.tournamentContext = 'Divisional';
  else if (lowerName.includes('wild card')) game.tournamentContext = 'Wild Card';
  else if (lowerName.includes('championship')) game.tournamentContext = 'Championship';
  else if (lowerName.includes('super bowl')) game.tournamentContext = 'Super Bowl';

  // ===================================================================
  // Step G: Fetch H2H data
  // ===================================================================
  let h2hData = null;
  try {
    h2hData = await fetchH2HData(homeTeam, awayTeam, sportKey, recentHome, recentAway);
    console.log(`[Scout Report] H2H Data: ${h2hData?.found ? `${h2hData.gamesFound} game(s) found` : 'No games found'}`);
  } catch (e) {
    console.log(`[Scout Report] H2H fetch failed: ${e.message}`);
  }

  // ===================================================================
  // Step H: Generate game significance
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
          postseason: game.postseason
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

  // ===================================================================
  // Step I: Format injuries for storage
  // ===================================================================
  const formatInjuriesForStorage = (injuriesData) => {
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
      home: formatList(injuriesData.home || []),
      away: formatList(injuriesData.away || [])
    };
  };

  const injuriesForStorage = formatInjuriesForStorage(injuries);

  // ===================================================================
  // Step J: Narrative scrubbing — remove "ghost" players
  // ===================================================================
  if (injuries?.narrativeContext) {
    const allowedNames = new Set();

    // 1. Add names from NFL roster depth (primary source of truth for active players)
    const roster = nflRosterDepth;

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
    if (keyPlayers) {
      addNamesFromSource(keyPlayers.home);
      addNamesFromSource(keyPlayers.away);
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

    // Check roster GP map for players who never played this season
    if (nflRosterDepth?.gpMap) {
      const gpMap = nflRosterDepth.gpMap;
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

    // Narrative scrub removed — was calling Flash per game, flagged non-names as unknown players
  }

  // ===================================================================
  // Step K: Assemble the report
  // ===================================================================

  // Extract narrative context from Gemini Grounding
  let narrativeContext = injuries?.narrativeContext || null;

  const matchupLabel = game.isNeutralSite ? `${awayTeam} vs ${homeTeam}` : `${awayTeam} @ ${homeTeam}`;
  const venueLabel = game.venue || (game.isNeutralSite ? 'Neutral Site' : `${homeTeam} Home`);
  const tournamentLabel = game.tournamentContext ? `[${game.tournamentContext}]` : '';

  // Dynamic season label (e.g., "2025-26")
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

</season_long_injuries>

` : '';

  // NFL does NOT have returning players detection
  const returningPlayersSection = '';

  // Generate injury report — NFL does not pass rosterDepth
  const injuryReportText = formatInjuryReport(homeTeam, awayTeam, injuries, sportKey, null);

  // Debug: Log the injury report Gary will see
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
${gameContextSection}${standingsSnapshot || ''}
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

${keyPlayers ? formatKeyPlayers(homeTeam, awayTeam, keyPlayers) : ''}${startingQBs ? formatStartingQBs(homeTeam, awayTeam, startingQBs) : ''}${nflRosterDepth ? formatNflRosterDepth(homeTeam, awayTeam, nflRosterDepth, injuries) : ''}${nflPlayoffHistory ? formatNflPlayoffHistory(homeTeam, awayTeam, nflPlayoffHistory, nflHomeTeamId, nflAwayTeamId) : ''}

RECENT FORM (Last 5 Games)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatRecentForm(homeTeam, recentHome)}
${formatRecentForm(awayTeam, recentAway)}
HEAD-TO-HEAD HISTORY (${seasonLabel} SEASON)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatH2HSection(h2hData, homeTeam, awayTeam)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BETTING CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatOdds(game, sportKey)}
`.trim();

  // ===================================================================
  // Step L: Return standard object shape
  // ===================================================================
  return {
    text: report,
    tokenMenu: formatTokenMenu(sportKey),
    injuries: injuriesForStorage,
    verifiedTaleOfTape,
    homeRecord: homeProfile?.record || null,
    awayRecord: awayProfile?.record || null,
    venue: game.venue || null,
    isNeutralSite: game.isNeutralSite || false,
    tournamentContext: game.tournamentContext || null,
    // Game significance/context
    gameSignificance: game.gameSignificance || null,
    // CFP-specific fields (not applicable for NFL)
    cfpRound: null,
    homeSeed: null,
    awaySeed: null,
    // Conference data (not applicable for NFL)
    homeConference: null,
    awayConference: null
  };
}


export { fetchStartingQBs, fetchQBStatsByName, fetchNCAAFStartingQBFromStats, formatStartingQBs };
