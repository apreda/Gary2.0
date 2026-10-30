import { footballEvidenceBundle, formatFootballEvidence } from '../../../../sports/football/footballEvidenceBundle.js';
import { recordPickDataFailure } from '../../../pickDataIntegrity.js';
/**
 * NFL Scout Report Builder
 * Handles all NFL-specific logic for building the pre-game scout report.
 */

import { ballDontLieService } from '../../../../providers/ballDontLieService.js';
import { generateGameSignificance } from '../gameSignificanceGenerator.js';
import { formatTokenMenu } from '../../tools/toolDefinitions.js';
import {
  seasonForSport,
  sportToBdlKey,
  findTeam,
  formatGameTime,
  getInjuryStatusFromMap
} from '../shared/utilities.js';
import { fetchStandingsSnapshot } from '../shared/grounding.js';
import { fetchNflArticlesAsWritten } from './nflArticlesAsWritten.js';
import { nflGameByGameSections, attachNflParticipation } from './nflGameByGame.js';
import { nflSituationSection } from './nflSituation.js';
import { getNflSchedule, scheduleRowFor, siteFor } from '../../../../sports/nfl/nflSchedule.js';
import { nflverseCode, getPracticeReport } from '../../../../providers/nflverseService.js';
import { getPlayLedger } from '../../../../sports/nfl/nflPlayLedger.js';
import { finalReportNotDue } from '../../../../sports/nfl/nflAvailability.js';
import { formatNflPlayers, loadNflOffenseGameLogs } from './nflPlayers.js';
import { weekStorylinesSection } from '../shared/weekStorylines.js';
import { loadTeamResults, gameStoryLine } from '../../tools/statRouters/footballTeamGames.js';
import {
  fetchTeamProfile,
  fetchInjuries,
  fetchRecentGames,
  etGameDateLong,
  fetchH2HData,
  formatInjuryReport,
  formatStartingLineups,
  formatOdds,
  formatH2HSection
} from '../shared/dataFetchers.js';
import { buildVerifiedTaleOfTape } from '../shared/taleOfTape.js';
import { teamSeasonLine } from '../../../../sports/nfl/nflPlayerContext.js';
import { refreshNflRedZone, loadNflRedZone, redZoneLine } from '../../../../sports/nfl/nflRedZone.js';
import {
  footballSeasonForDate,
  footballSeasonLabel,
  nflPrimetimeSlot,
} from './footballSeason.js';


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
function playerStatsSeason(season, baseline = {}) {
  return Object.hasOwn(baseline, 'statsSeason') ? baseline.statsSeason : season;
}

function validPlayerSeasonRows(rows, statsSeason, rosterSeason, baseline = {}) {
  if (!Number.isInteger(statsSeason)) return [];
  return (rows || []).filter(row => {
    if (row.season != null && Number(row.season) !== statsSeason) return false;
    if (row.postseason === true || row.postseason === 'true' || (row.season_type != null && Number(row.season_type) !== 2)) return false;
    if (statsSeason === rosterSeason && Object.hasOwn(baseline, 'currentRegularGamesPlayed')) {
      const count = baseline.currentRegularGamesPlayed;
      const games = Number(row.games_played);
      if (!Number.isInteger(count) || count <= 0 || !Number.isInteger(games) || games <= 0 || games > count) return false;
    }
    return true;
  });
}

async function fetchQBStatsByName(qbName, teamName, season = footballSeasonForDate('NFL'), baseline = {}) {
  try {
    const bdlSport = 'americanfootball_nfl';
    const teams = await ballDontLieService.getTeams(bdlSport);
    const team = findTeam(teams, teamName);
    if (!team) {
      console.log(`[Scout Report] Could not find team ${teamName} for QB stats lookup`);
      return { name: qbName, team: teamName, passingYards: 0, passingTds: 0, gamesPlayed: 0 };
    }

    const selectedStatsSeason = playerStatsSeason(season, baseline);
    if (!Number.isInteger(selectedStatsSeason)) return { name: qbName, team: teamName, teamAbbr: team.abbreviation,
      passingYards: null, passingTds: null, gamesPlayed: null, statsSeason: null, note: 'Verified performance baseline unavailable' };

    // Reuse the service-level cache shared with fetchKeyPlayers. The previous
    // direct axios request hit this exact endpoint outside the cache, then the
    // key-player pass downloaded the same team's season stats again.
    // Find this specific QB by name (fuzzy match)
    const searchName = qbName.toLowerCase().trim();
    const searchParts = searchName.split(' ');
    const findQbRows = (allStats) => (allStats || []).filter(p => {
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

    let statsSeason = selectedStatsSeason;
    let qbStats = findQbRows(validPlayerSeasonRows(await ballDontLieService.getNflSeasonStatsByTeam(team.id, statsSeason), statsSeason, season, baseline));
    // No prior-season fallback (founder, Oct 23 2026, every sport: "last season is old news"; source audit: it ran
    // three times). A quarterback with no games this season has no season line, and the desk says so below.
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
        statsSeason: null,
        isBackup: true,
        note: 'New/backup QB - limited season stats'
      };
    }

    const qb = qbStats[0];
    const gamesPlayed = qb.games_played || 0;
    const passingYards = qb.passing_yards || 0;

    // Get the OFFICIAL experience from BDL (e.g., "2nd Season", "7th Season")
    // This is authoritative - do NOT use games_played to infer rookie status.
    // (The old notes did exactly that: season GP worded as "career starts" —
    // an early-September vet after Week 1 printed as "SECOND CAREER START".)
    const officialExperience = qb.player?.experience || null;
    const expYears = (() => {
      const m = String(officialExperience || '').match(/^(\d+)/);
      return m ? Number(m[1]) : null;
    })();
    const isRookie = officialExperience
      ? /^(1st|rookie)/i.test(String(officialExperience))
      : gamesPlayed === 0;
    const isInexperienced = isRookie || (gamesPlayed <= 4 && (expYears == null || expYears <= 2));
    let experienceNote = null;
    if (isRookie) {
      experienceNote = gamesPlayed === 0
        ? 'ROOKIE QB — no NFL regular-season games on file'
        : `ROOKIE QB — ${gamesPlayed} NFL game${gamesPlayed === 1 ? '' : 's'} on file`;
      console.log(`[Scout Report] ${qbName} is a ROOKIE QB (${officialExperience || '0 GP'})`);
    } else if (isInexperienced) {
      experienceNote = `Limited NFL sample — ${gamesPlayed} game${gamesPlayed === 1 ? '' : 's'} in his ${statsSeason} season line`;
      console.log(`[Scout Report] ${qbName} has a LIMITED SAMPLE (${gamesPlayed} GP, ${statsSeason})`);
    } else {
      console.log(`[Scout Report] ✓ Found BDL stats for ${qbName}: ${passingYards} yds, ${qb.passing_touchdowns || 0} TDs, ${gamesPlayed} GP (${statsSeason})`);
    }

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
      qbr: qb.qbr ?? null,
      qbRating: qb.qb_rating ?? null,
      gamesPlayed: gamesPlayed,
      // Which season this stat line describes — the formatter labels the line
      // with it ("2025-26 season:"), so a prior-season fallback never reads as
      // the current season.
      statsSeason,
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
// Fetch starting QBs for both teams (NFL only)
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
/**
 * NFL ONLY. College never reached this function: buildNcaafScoutReport is
 * NCAAF's entry point and does not call it, and the sole caller here passes a
 * hardcoded 'NFL'. The NCAAF branches that used to live in this file were
 * therefore unreachable — and unreachable code in a file named for another
 * sport is where a defect hides longest (Aug 25 2026: a service method these
 * branches called had never been defined, and nothing ever noticed).
 * NCAAF resolves its quarterbacks through fetchNcaafKeyPlayers in ncaaf.js.
 */
/**
 * A listed QB1 who is questionable or doubtful and did not start the team's latest games is not the known starter
 * (Oct 13 2026 audit: the Oct 11 Bears desk named Caleb Williams "starting this week" while Tyson Bagent made his
 * second straight start). The play ledger says who started each game; the QB1 keeps his name on the desk and the
 * desk says who has been starting instead.
 */
async function withRecentStarter(qb, teamName, teamId, season) {
  if (!qb?.name || qb.isBackup || !/^(q|questionable|d|doubtful)$/i.test(String(qb.injuryStatus || '').trim())) return qb;
  const code = nflverseCode(teamName);
  const ledger = code ? await getPlayLedger(season).catch(() => null) : null;
  const games = (ledger?.games || []).filter((g) => g.starters?.[code] && g.season_type === 'REG').sort((a, b) => b.week - a.week);
  const bare = (x) => String(x || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\.?$/g, '').replace(/[^a-z]/g, '');
  const isHim = (abbr, first, last) => {
    const [initial, ...rest] = String(abbr || '').split('.');
    return !!initial && String(first || '')[0]?.toLowerCase() === initial.toLowerCase() && bare(rest.join('.')) === bare(last);
  };
  let missed = 0;
  for (const g of games) { if (isHim(g.starters[code].started || g.starters[code].name, qb.firstName, qb.lastName)) break; missed++; }
  if (!missed) return qb;
  const abbr = games[0].starters[code].started || games[0].starters[code].name;
  let streak = 0;
  while (streak < missed && (games[streak].starters[code].started || games[streak].starters[code].name) === abbr) streak++;
  const roster = teamId ? await ballDontLieService.getNflTeamRoster(teamId, season).catch(() => []) : [];
  const match = (roster || []).filter((e) => String(e.position || e.player?.position_abbreviation || '').toUpperCase() === 'QB')
    .map((e) => e.player).find((p) => p && isHim(abbr, p.first_name, p.last_name));
  const name = match ? `${match.first_name} ${match.last_name}` : abbr.replace('.', '. ');
  return { ...qb, recentStarter: { name, games: missed, streak } };
}

async function fetchStartingQBs(homeTeam, awayTeam, sport, injuries = null, season = footballSeasonForDate(sport), baselines = {}) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (bdlSport !== 'americanfootball_nfl') {
      return null;
    }

    const sportLabel = 'NFL';

    // Get team IDs
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);

    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for QB lookup');
      return null;
    }

    console.log(`[Scout Report] Fetching ${sportLabel} starting QBs from depth chart: ${awayTeam} @ ${homeTeam}`);

    // NFL has a true depth chart, so the starter is read rather than inferred.
    const [homeQBDepth, awayQBDepth] = await Promise.all([
          homeTeamData ? ballDontLieService.getStartingQBFromDepthChart(homeTeamData.id, season, bdlSport, { officialInjuries: injuries?.home || [] }) : null,
          awayTeamData ? ballDontLieService.getStartingQBFromDepthChart(awayTeamData.id, season, bdlSport, { officialInjuries: injuries?.away || [] }) : null
        ]);

    // STEP 2: Fetch season stats for these specific QBs
    // The depth chart tells us WHO is starting, now get their stats
    let homeQB = homeQBDepth;
    let awayQB = awayQBDepth;

    if (homeQBDepth) {
      const stats = await fetchQBStatsByName(homeQBDepth.name, homeTeam, season, baselines.home);
      if (stats) {
        homeQB = { ...homeQBDepth, ...stats, isBackup: homeQBDepth.isBackup };
      }
    }

    if (awayQBDepth) {
      const stats = await fetchQBStatsByName(awayQBDepth.name, awayTeam, season, baselines.away);
      if (stats) {
        awayQB = { ...awayQBDepth, ...stats, isBackup: awayQBDepth.isBackup };
      }
    }


    homeQB = await withRecentStarter(homeQB, homeTeam, homeTeamData?.id, season);
    awayQB = await withRecentStarter(awayQB, awayTeam, awayTeamData?.id, season);

    // Log results - INCLUDE EXPERIENCE to prevent training data leakage (e.g., calling a 2nd-year QB a "rookie")
    if (homeQB && homeQB.name !== 'See grounded context') {
      const backupNote = homeQB.isBackup ? ' [BACKUP - starter injured]' : '';
      const injuryNote = homeQB.injuryStatus ? ` (${homeQB.injuryStatus})` : '';
      const expLabel = homeQB.experience ? ` [${homeQB.experience}]` : '';
      console.log(`[Scout Report] Home QB: ${homeQB.name}${expLabel} (${homeQB.passingYards || 0} yds, ${homeQB.passingTds || 0} TDs, ${homeQB.gamesPlayed || 0} GP)${backupNote}${injuryNote}`);
    }
    if (awayQB && awayQB.name !== 'See grounded context') {
      const backupNote = awayQB.isBackup ? ' [BACKUP - starter injured]' : '';
      const injuryNote = awayQB.injuryStatus ? ` (${awayQB.injuryStatus})` : '';
      const expLabel = awayQB.experience ? ` [${awayQB.experience}]` : '';
      console.log(`[Scout Report] Away QB: ${awayQB.name}${expLabel} (${awayQB.passingYards || 0} yds, ${awayQB.passingTds || 0} TDs, ${awayQB.gamesPlayed || 0} GP)${backupNote}${injuryNote}`);
    }

    return { home: homeQB, away: awayQB, season, sport: sportLabel };
  } catch (error) {
    console.error('[Scout Report] Error fetching starting QBs:', error.message);
    return null;
  }
}


// =========================================================================
// fetchKeyPlayers
// Fetch key players (starters) for both NFL teams
// Uses roster depth chart + season stats to show who actually plays
// This prevents hallucinations about players who've been traded/cut
// =========================================================================
export async function fetchKeyPlayers(homeTeam, awayTeam, sport, season = footballSeasonForDate('NFL'), baselines = {}) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (bdlSport !== 'americanfootball_nfl') {
      return null; // Only NFL for now
    }

    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);

    if (!homeTeamData?.id || !awayTeamData?.id || homeTeamData.id === awayTeamData.id) {
      console.warn('[Scout Report] Could not find team IDs for roster lookup');
      throw new Error('Required team identities unavailable');
    }

    console.log(`[Scout Report] Fetching NFL rosters for ${homeTeam} (ID: ${homeTeamData?.id}) and ${awayTeam} (ID: ${awayTeamData?.id})`);

    const statsSeasons = { home: playerStatsSeason(season, baselines.home), away: playerStatsSeason(season, baselines.away) };
    const readStats = async (team, side) => team && Number.isInteger(statsSeasons[side])
      ? validPlayerSeasonRows(await ballDontLieService.getNflSeasonStatsByTeam(team.id, statsSeasons[side]), statsSeasons[side], season, baselines[side]) : [];
    // Fetch rosters and season stats in parallel
    const [homeRoster, awayRoster, homeStats, awayStats] = await Promise.all([
      homeTeamData ? ballDontLieService.getNflTeamRoster(homeTeamData.id, season) : [],
      awayTeamData ? ballDontLieService.getNflTeamRoster(awayTeamData.id, season) : [],
      readStats(homeTeamData, 'home'),
      readStats(awayTeamData, 'away')
    ]);

    if (!homeRoster.length || !awayRoster.length) throw new Error('Required NFL roster missing');

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
      const filledPlayers = new Set();

      // Sort by depth to prioritize starters
      const sortedRoster = [...roster].sort((a, b) => (a.depth || 99) - (b.depth || 99));

      for (const entry of sortedRoster) {
        const rosterPosition = entry.position?.toUpperCase() || entry.player?.position_abbreviation?.toUpperCase() || '';
        // BDL's WR-2/WR-3 are receiver slots, while KR/PR are separate duties.
        // Counting return duties as additional offensive players duplicates a receiver.
        if (['KR', 'PR', 'H', 'LS', 'P', 'PK', 'K'].includes(rosterPosition)) continue;
        const pos = rosterPosition.replace(/^WR-\d+$/, 'WR');
        const player = entry.player || {};
        const playerId = player.id;
        const playerStats = statsMap.get(playerId) || {};
        const playerIdentity = `${playerId ?? (entry.player_name || `${player.first_name || ''} ${player.last_name || ''}`).trim().toLowerCase()}:${pos}`;

        // Only take depth 1-2 players (starters and key backups)
        if ((entry.depth || 1) > 2) continue;
        if (filledPlayers.has(playerIdentity)) continue;

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
          // Takeaway creation was fetched and dropped: BDL returns these on the
          // same row as the three fields above, and a defence that forces the
          // ball out is a different unit from one that only tackles.
          forcedFumbles: playerStats.fumbles_forced || null,
          fumbleRecoveries: playerStats.fumbles_recovered || null,
          soloTackles: playerStats.solo_tackles || null,
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
          filledPlayers.add(playerIdentity);
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
          filledPlayers.add(playerIdentity);
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
        // Was 5 to the offence's 8. The defence decides as many football games
        // as the offence and the desk carried barely half a unit — front seven
        // and secondary both need to be visible to judge a defence at all.
        defense: starters.defense.slice(0, 8)
      };
    };

    const homeKeyPlayers = processTeamRoster(homeRoster, homeStats);
    const awayKeyPlayers = processTeamRoster(awayRoster, awayStats);

    console.log(`[Scout Report] ✓ Key players: ${homeTeam} (${homeKeyPlayers?.offense?.length || 0} OFF, ${homeKeyPlayers?.defense?.length || 0} DEF), ${awayTeam} (${awayKeyPlayers?.offense?.length || 0} OFF, ${awayKeyPlayers?.defense?.length || 0} DEF)`);

    return {
      source_records: { homeTeam: homeTeamData, awayTeam: awayTeamData, homeRoster, awayRoster, homeStats, awayStats, statsSeasons, rosterSeason: season },
      home: homeKeyPlayers,
      away: awayKeyPlayers,
      season: statsSeasons.home === statsSeasons.away ? statsSeasons.home : null,
      rosterSeason: season,
      statsSeasons
    };
  } catch (error) {
    recordPickDataFailure('NFL:player evidence', error);
    console.error('[Scout Report] Error fetching key players:', error.message);
    return null;
  }
}


/**
 * TEAM NUMBERS, ABOVE THE PROSE (founder GO, Sep 24 2026): per club, last
 * season in full beside this season as a count of games (a Week 1 figure is
 * one game, never a team's identity). Records and points from the nflverse
 * schedule; EPA, success rate, yards per play, sacks and red-zone snaps from
 * the play-by-play evidence the desk already carries.
 */
/** The measured evidence without what prints elsewhere: its one-week snap list (WHO PLAYED THE SNAPS carries every
 *  week) and the charting's sacks (PLAYERS carries every defender's). Oct 5 2026. */
function withoutSnapList(bundle) {
  const e = bundle?.NFL_GAME_EVIDENCE;
  if (!e) return bundle;
  // Sacks print once, under PLAYERS (every defender); the charting keeps pressures, hurries, hits, blitzes and coverage.
  const noSacks = (rows) => Array.isArray(rows) ? rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'sacks'))) : rows;
  const strip = (side) => {
    if (!side?.current_season) return side;
    const cur = Object.fromEntries(Object.entries(side.current_season).filter(([k]) => k !== 'snap_participation'));
    if (cur.defender_charting?.pass_rush) cur.defender_charting = { ...cur.defender_charting, pass_rush: noSacks(cur.defender_charting.pass_rush) };
    return { ...side, current_season: cur };
  };
  return { ...bundle, NFL_GAME_EVIDENCE: { ...e, home: strip(e.home), away: strip(e.away) } };
}

export async function formatTeamNumbers(gameEvidence, nflSeasonYear, { onlyRecord = false } = {}) {
  const lines = [];
  const evidence = gameEvidence?.NFL_GAME_EVIDENCE;
  for (const side of ['home', 'away']) {
    const e = evidence?.[side];
    if (!e?.team) continue;
    const code = e.nflverse_team_code;
    const one = async (season, pbp, agg) => {
      const bits = [];
      const record = code ? await teamSeasonLine(season, code).catch(() => null) : null;
      if (record) bits.push(record);
      // EVERY NUMBER ONCE (Oct 5 2026): the play-by-play rates below this line print in the measured evidence.
      if (onlyRecord) return bits.length ? `  ${season}: ${bits.join(' · ')}` : null;
      const off = pbp?.offense?.overall, def = pbp?.defense?.overall;
      if (off?.plays) bits.push(`offense: EPA per play ${off.epa_per_play}, success rate ${off.success_rate}, ${off.yards_per_play} yards per play (${off.plays} plays)`);
      const prot = pbp?.offense?.pass_protection_or_rush;
      if (prot?.dropbacks) bits.push(`sacked ${prot.sacks} times on ${prot.dropbacks} dropbacks`);
      if (def?.plays) bits.push(`defense: EPA per play allowed ${def.epa_per_play}, success rate allowed ${def.success_rate}, ${def.yards_per_play} yards per play allowed`);
      const rush = pbp?.defense?.pass_protection_or_rush;
      if (rush?.dropbacks) bits.push(`${rush.sacks} sacks on ${rush.dropbacks} opponent dropbacks`);
      const rzO = pbp?.offense?.red_zone, rzD = pbp?.defense?.red_zone;
      if (rzO?.plays || rzD?.plays) bits.push(`red zone: ${rzO?.plays ?? 0} snaps on offense (success rate ${rzO?.success_rate ?? '—'}), ${rzD?.plays ?? 0} on defense (success rate allowed ${rzD?.success_rate ?? '—'})`);
      if (!bits.length && agg?.offense) bits.push(`${agg.offense.total_points_per_game ?? '—'} points a game, ${agg.defense?.opp_total_points_per_game ?? '—'} allowed`);
      return bits.length ? `  ${season}: ${bits.join(' · ')}` : null;
    };
    lines.push(`${e.team}:`);
    const prior = e.prior_season_background;
    const prev = prior ? await one(prior.season, prior.play_by_play, prior.team_aggregates) : (code ? await (async () => { const r = await teamSeasonLine(nflSeasonYear - 1, code).catch(() => null); return r ? `  ${nflSeasonYear - 1}: ${r}` : null; })() : null);
    const cur = await one(e.current_season?.season ?? nflSeasonYear, e.current_season?.play_by_play, e.current_season?.team_aggregates);
    if (prev) lines.push(prev);
    if (cur && !onlyRecord) lines.push(cur);   // this season's record and points are in THE SITUATION and the measured evidence
  }
  return lines.length > 0 ? lines.join('\n') : null;
}

// =========================================================================
// formatKeyPlayers
// Format key players section for display
// ENHANCED: Now includes "TOP RECEIVING TARGETS" section
// =========================================================================
export function formatKeyPlayers(homeTeam, awayTeam, keyPlayers, redZone = null, season = null, { qbLinesElsewhere = false } = {}) {
  if (!keyPlayers || (!keyPlayers.home && !keyPlayers.away)) {
    return '';
  }
  // Player red zone (Sep 24 2026): carries and targets inside the 20 (and 10,
  // and carries inside the 5), this season game by game, from BDL play-by-play.
  const redZoneFor = (player) => (redZone && season && ['QB', 'RB', 'WR', 'TE'].includes(player.position)
    ? redZoneLine(redZone, player.name, season, player.position) : null);

  const formatPlayerLine = (player) => {
    const injury = player.injuryStatus ? ` [${player.injuryStatus}]` : '';
    const jersey = player.jerseyNumber ? ` #${player.jerseyNumber}` : '';

    // Format stats based on position
    let stats = '';
    // A starting quarterback's season line prints once, under STARTING QUARTERBACKS (Oct 5 2026).
    if (player.position === 'QB' && qbLinesElsewhere) {
      stats = ' - season line under STARTING QUARTERBACKS';
    } else if (player.position === 'QB' && player.passingYards) {
      stats = ` - ${player.passingYards} yds, ${player.passingTds || 0} TD, ${player.passingInts || 0} INT`;
    } else if (['RB'].includes(player.position) && (player.rushingYards || player.receivingYards)) {
      const parts = [];
      if (player.rushingYards) parts.push(`${player.rushingYards} rush`);
      if (player.receivingYards) parts.push(`${player.receivingYards} rec`);
      if (player.rushingTds || player.receivingTds) parts.push(`${(player.rushingTds || 0) + (player.receivingTds || 0)} TD`);
      stats = parts.length ? ` - ${parts.join(', ')}` : '';
    } else if (['WR', 'TE'].includes(player.position) && player.receivingYards) {
      stats = ` - ${player.receptions || 0} rec, ${player.receivingYards} yds, ${player.receivingTds || 0} TD`;
    } else if (player.sacks || player.tackles || player.interceptions || player.forcedFumbles || player.fumbleRecoveries) {
      const parts = [];
      if (player.tackles) parts.push(`${player.tackles} tkl`);
      if (player.sacks) parts.push(`${player.sacks} sacks`);
      if (player.interceptions) parts.push(`${player.interceptions} INT`);
      if (player.forcedFumbles) parts.push(`${player.forcedFumbles} FF`);
      if (player.fumbleRecoveries) parts.push(`${player.fumbleRecoveries} FR`);
      stats = parts.length ? ` - ${parts.join(', ')}` : '';
    }

    const rz = redZoneFor(player);
    return `  • ${player.position}: ${player.name}${jersey}${stats}${injury}${rz ? `\n      ${rz}` : ''}`;
  };

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

  const statsVintage = keyPlayers.season != null
    ? ` — stat lines are ${footballSeasonLabel(keyPlayers.season)} season totals`
    : '';
  const baselineLabels = keyPlayers.statsSeasons ? ['PLAYER PERFORMANCE BASELINES', ...[['home', homeTeam], ['away', awayTeam]].map(([side, team]) => {
    const year = keyPlayers.statsSeasons[side];
    return `${team}: ${year == null ? 'unavailable' : `${footballSeasonLabel(year)} ${year < keyPlayers.rosterSeason ? 'prior completed season baseline (not current-season form)' : 'regular-season totals'}`}`;
  })].join('\n') + '\n' : '';
  // TOP RECEIVING TARGETS left the desk (Oct 5 2026): it reprinted the receivers' KEY PLAYERS lines word for word.
  return `${baselineLabels}
KEY PLAYERS (CURRENT ROSTER${statsVintage})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${homeSection}

${awaySection}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
// THE DESK IS PROSE, NOT A PAYLOAD (Sep 18 2026). This block used to append
// `COMPLETE PLAYER SOURCE RECORDS:` + JSON.stringify(source_records, null, 2)
// straight into the text that becomes garyText — the prompt Gary actually
// reads. On the Sep 18 Wake Forest card that dump was 640,540 of the desk's
// 695,836 characters: 92% raw BDL JSON, 24,156 lines, 1,436 of them a bare
// "},". It swamped the readable sections above it, which already state every
// one of those facts, and it put one college record at 796KB against the
// 500KB curation budget, so no NCAAF pick could be curated at all.
// `source_records` is untouched on the keyPlayers object, where the evidence
// receipts read it; nothing ever read it back out of this text.
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
  const injuredPlayers = { home: new Map(), away: new Map() };
  for (const side of ['home', 'away']) for (const inj of (injuries?.[side] || [])) {
    const name = inj.name?.toLowerCase() || `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.toLowerCase().trim();
    if (name && name !== 'unknown') {
      injuredPlayers[side].set(name, {
        status: inj.status || 'Unknown',
        description: inj.description || inj.comment || ''
      });
    }
  }

  const getInjuryStatus = (playerName, side) => getInjuryStatusFromMap(playerName, injuredPlayers[side]);

  // Helper to format a player row
  const formatPlayerRow = (player, side) => {
    const injury = getInjuryStatus(player.name, side) || (player.injuryStatus ? { status: player.injuryStatus } : null);
    const statusText = String(injury?.status || '').toUpperCase();
    const statusName = { Q: 'QUESTIONABLE', D: 'DOUBTFUL', O: 'OUT', IR: 'INJURED RESERVE', PUP: 'PHYSICALLY UNABLE TO PERFORM' }[statusText] || statusText;
    const status = injury ? `[${statusName || 'STATUS UNKNOWN'}]` : '[NO REPORTED INJURY]';
    const injuryNote = injury ? ` - ${statusText || 'UNKNOWN'}` : '';
    const depth = player.depth > 1 ? ` (Depth: ${player.depth})` : '';

    return `  ${status} ${player.position}: ${player.name}${depth}${injuryNote}`;
  };

  // WHO FILLS IN (founder, Sep 18 2026). The desk listed a position group with
  // depth numbers and an injury tag on each man, and never joined the two — it
  // could say the starting back is OUT and still leave the reader to work out
  // who carries the ball. The depth order and the status are both already here;
  // this only states the consequence the reader would otherwise derive by hand.
  // Unavailable means an explicit OUT / IR / PUP / DOUBTFUL tag. QUESTIONABLE
  // is NOT treated as unavailable — that call belongs to Gary, not to this
  // formatter.
  const UNAVAILABLE = /^(O|OUT|IR|IR-R|PUP|NFI|D|DOUBTFUL|SUSPENDED|INACTIVE)$/i;
  const isUnavailable = (player, side) => {
    const injury = getInjuryStatus(player.name, side) || (player.injuryStatus ? { status: player.injuryStatus } : null);
    return !!injury && UNAVAILABLE.test(String(injury.status || '').trim());
  };
  // Founder, Sep 24 2026 (injury code, explicit go): the line spoke whenever
  // anyone at the position was out and named the first healthy man, so a
  // backup on IR read as "next is Malik Nabers" — a starter already starting
  // — and a starting receiver out named another starter. A position carries
  // several depth-1 starters (three receivers); only a starter's absence
  // moves anyone, and the men who move up are the healthy depth-2 players,
  // one for each starter out. A backup's own absence is already on his row.
  const fillInLine = (posPlayers, side, pos) => {
    if (!posPlayers.length) return null;
    const ordered = [...posPlayers].sort((a, b) => (a.depth || 99) - (b.depth || 99));
    const starterDepth = ordered[0].depth || 1;
    const outStarters = ordered.filter(p => (p.depth || 1) === starterDepth && isUnavailable(p, side));
    if (!outStarters.length) return null;
    const backups = ordered.filter(p => (p.depth || 1) > starterDepth && !isUnavailable(p, side)).slice(0, outStarters.length);
    const missing = outStarters.map(p => p.name).join(', ');
    const who = outStarters.length > 1 ? 'starters' : 'starter';
    return backups.length
      ? `    ↳ ${pos}: ${who} ${missing} unavailable — next on the depth chart: ${backups.map(p => `${p.name} (depth ${p.depth})`).join(', ')}`
      : `    ↳ ${pos}: ${who} ${missing} unavailable — no healthy backup ${pos} listed on this depth chart`;
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
        lines.push(formatPlayerRow(player, 'home'));
      });
      const homeFillIn = fillInLine(posPlayers, 'home', pos);
      if (homeFillIn) lines.push(homeFillIn);
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
        lines.push(formatPlayerRow(player, 'away'));
      });
      const awayFillIn = fillInLine(posPlayers, 'away', pos);
      if (awayFillIn) lines.push(awayFillIn);
    }
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  return lines.join('\n');
}


// =========================================================================
// formatStartingQBs
// Format the NFL starting-QB section for both teams.
// =========================================================================
function formatStartingQBs(homeTeam, awayTeam, qbs, { withStats = true } = {}) {
  // BDL NCAAF exposes active rosters and production, not a confirmed depth
  // chart. A passing leader (or the old "See grounded context" sentinel) must
  // never be promoted to "STARTING QUARTERBACKS THIS WEEK." The college scout
  // builder no longer calls this formatter; this guard keeps the shared helper
  // fail-closed if it is accidentally reintroduced later.
  if (String(qbs?.sport || '').toUpperCase() === 'NCAAF') return '';
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

  // One QB block for either side. Facts only, and only facts that EXIST:
  // the old line printed "? GP | 0 yds | ?% | Rating: ?" whenever the current
  // season had no rows yet (every August dossier — live Aug 20). The season
  // line now carries its OWN season label (prior season when the current one
  // is empty, per the fetch fallback) and unknown fields are omitted, never
  // rendered as question marks.
  const pushQbBlock = (sideLabel, teamName, qb) => {
    if (!qb) {
      lines.push(`[${sideLabel}] ${teamName}: QB data unavailable`);
      return null;
    }
    const backupLabel = qb.isBackup ? ' BACKUP STARTING (starter injured)' : '';
    // Include official BDL experience (e.g., "2nd Season") to prevent training data hallucinations
    const expLabel = qb.experience ? ` (${qb.experience})` : '';
    const jersey = qb.jerseyNumber ? ` (#${qb.jerseyNumber})` : '';
    const recent = qb.recentStarter
      ? ` — listed QB1, ${String(qb.injuryStatus).length <= 1 ? { q: 'Questionable', d: 'Doubtful' }[String(qb.injuryStatus).toLowerCase()] : qb.injuryStatus}; did not start the last ${qb.recentStarter.games === 1 ? 'game' : `${qb.recentStarter.games} games`}; ${qb.recentStarter.name} started ${qb.recentStarter.streak === qb.recentStarter.games ? (qb.recentStarter.games === 1 ? 'it' : 'them') : qb.recentStarter.streak === 1 ? 'the last one' : `the last ${qb.recentStarter.streak}`}`
      : '';
    lines.push(`[${sideLabel}] ${teamName}: ${qb.name}${expLabel}${jersey}${backupLabel}${recent}`);

    const seasonLabel = qb.statsSeason != null
      ? `${footballSeasonLabel(qb.statsSeason)} ${qb.statsSeason < qbs.season ? 'prior completed season baseline (not current-season form)' : 'season'}` : 'Season';
    if (withStats && (qb.gamesPlayed || 0) > 0) { // the season line prints under PLAYERS on the NFL desk (Oct 5 2026)
      // Handle both old (passingInterceptions) and new (passingInts) property names
      const ints = qb.passingInterceptions || qb.passingInts || 0;
      const compPct = qb.passingCompletionPct ?? qb.completionPct;
      const rating = qb.qbRating ?? qb.passingRating;
      const parts = [
        `${qb.gamesPlayed} GP`,
        `${qb.passingYards || 0} yds`,
        `${qb.passingTds || 0} TD / ${ints} INT`,
      ];
      if (Number.isFinite(parseFloat(compPct))) parts.push(`${parseFloat(compPct).toFixed(1)}%`);
      if (Number.isFinite(parseFloat(qb.qbr))) parts.push(`QBR: ${parseFloat(qb.qbr).toFixed(1)}`);
      if (Number.isFinite(parseFloat(rating))) parts.push(`Rating: ${parseFloat(rating).toFixed(1)}`);
      lines.push(`   ${seasonLabel}: ${parts.join(' | ')}`);
    } else if (withStats || !(qb.gamesPlayed > 0)) {
      lines.push(`   No NFL regular-season stat line on file.`);
    }

    // Add game logs if the QB carries them
    if (qb.gameLogs && qb.gameLogs.length > 0) {
      lines.push(`   RECENT GAMES (L${qb.gameLogs.length}):`);
      qb.gameLogs.forEach((g, i) => {
        const compAtt = g.attempts > 0 ? `${g.completions}/${g.attempts}` : 'N/A';
        const pct = g.attempts > 0 ? ((g.completions / g.attempts) * 100).toFixed(0) : '?';
        lines.push(`     ${g.date || 'Game ' + (i+1)}: ${g.yards} yds, ${g.tds} TD/${g.ints} INT (${compAtt}, ${pct}%)${g.rating ? ` Rating: ${g.rating.toFixed(1)}` : ''}`);
      });
    }

    // Add experience warning for rookie/inexperienced QBs. Only a REAL
    // situation (rookie/limited-sample note or an elevated backup) rows here
    // — the old "<= 5 games played" catch-all promoted every vet into a QB
    // SITUATION for the first month of each season.
    if (qb.experienceNote) {
      lines.push(`   ${qb.experienceNote}`);
      return { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, statsSeason: qb.statsSeason ?? null, isBackup: qb.isBackup };
    }
    if (qb.isBackup) {
      return { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, statsSeason: qb.statsSeason ?? null, isBackup: true };
    }
    return null;
  };

  homeQbChangeSituation = pushQbBlock('HOME', homeTeam, qbs.home);
  awayQbChangeSituation = pushQbBlock('AWAY', awayTeam, qbs.away);

  lines.push('');

  // Add QB SITUATION section if either team has a new/backup QB
  if (homeQbChangeSituation || awayQbChangeSituation) {
    lines.push('');
    lines.push('QB SITUATION');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Factual, season-scoped wording — never "career starts" derived from a
    // single season's GP.
    for (const [teamName, qb] of [[homeTeam, homeQbChangeSituation], [awayTeam, awayQbChangeSituation]]) {
      if (!qb) continue;
      const sample = qb.statsSeason != null
        ? `${qb.gamesPlayed} game${qb.gamesPlayed === 1 ? '' : 's'} in his ${footballSeasonLabel(qb.statsSeason)} season line`
        : 'no NFL stat line on file';
      lines.push(`${teamName}:`);
      lines.push(`   Current QB: ${qb.name} (${sample})${qb.isBackup ? ' — backup starting' : ''}`);
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
  }

  lines.push(`QB data from BDL.`);
  lines.push('');

  return lines.join('\n');
}


// =========================================================================
// MAIN: buildNflScoutReport
// =========================================================================
// THE DESK HAD NO TEAM STATISTICS AT ALL (Sep 18 2026). `homeProfile` carries
// the full BDL team-season row — 195 fields — and it reached only the player
// baselines, the Tale of Tape (which the pick card renders and Gary never
// reads) and the returned record. Not one team number entered the report text,
// so the brain reasoned about football with rosters, injuries, W/L form, H2H
// and odds and no idea how either team actually moves the ball or stops it.
//
// Both sides of the ball, from verified-present fields only. Rates sit beside
// the totals deliberately: a per-snap rate says something after one game where
// a per-game total mostly repeats the scoreboard. Every line is labeled with
// its season and games played, and an absent field prints as a dash rather
// than a zero — an absent stat is not a zero.
export function formatNflTeamStats(homeTeam, awayTeam, homeProfile, awayProfile) {
  const stats = side => side?.seasonStats || null;
  if (!stats(homeProfile) && !stats(awayProfile)) return '';
  const num = (row, key, digits = 1) => {
    const value = row?.[key] == null || row[key] === '' ? NaN : Number(row[key]);
    return Number.isFinite(value) ? value.toFixed(digits) : '—';
  };
  const signed = (row, key) => {
    const value = row?.[key] == null || row[key] === '' ? NaN : Number(row[key]);
    return Number.isFinite(value) ? (value > 0 ? `+${value}` : String(value)) : '—';
  };
  const pad = (label) => String(label).padEnd(22);
  const col = (text) => String(text).padStart(10);
  // EVERY NUMBER ONCE (founder, Oct 5 2026): points, yards, third downs and sacks print in the measured
  // evidence further down; this table keeps only the two rows that print nowhere else.
  const rows = [
    ['  4th Down %', r => num(r, 'misc_fourth_down_conv_pct'), null],
    ['  Turnover Diff', r => signed(r, 'misc_turnover_differential'), null],
  ];
  const home = stats(homeProfile), away = stats(awayProfile);
  const lines = rows.map(([label, read]) => read
    ? `${pad(label)}${col(read(home))}  |  ${col(read(away))}`
    : label);
  const provenance = [homeProfile, awayProfile].map((side, index) => {
    const team = index === 0 ? homeTeam : awayTeam;
    const games = side?.seasonStats?.games_played;
    const label = side?.seasonStatsLabel || 'season baseline unavailable';
    return `${team}: ${label}${games != null && Number.isFinite(Number(games)) ? ` (${games} game${Number(games) === 1 ? '' : 's'})` : ''}`;
  }).join('\n');
  return `
TEAM STATISTICS — FOURTH DOWNS AND TURNOVER DIFFERENTIAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${provenance}
A dash means the provider did not carry that field — it is not a zero.

${pad('')}${col(homeTeam)}  |  ${col(awayTeam)}
${lines.join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

export async function buildNflScoutReport(game, options = {}) {
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  const sportKey = 'NFL';
  const nflSeasonYear = footballSeasonForDate(sportKey, game.commence_time || new Date());

  // ===================================================================
  // Step A: Fetch shared base data in parallel
  // ===================================================================
  const [homeProfile, awayProfile, injuries, recentHome, recentAway, standingsSnapshot] = await Promise.all([
    fetchTeamProfile(homeTeam, sportKey),
    fetchTeamProfile(awayTeam, sportKey),
    fetchInjuries(homeTeam, awayTeam, sportKey, etGameDateLong(game.commence_time)),
    fetchRecentGames(homeTeam, sportKey, 8),
    fetchRecentGames(awayTeam, sportKey, 8),
    fetchStandingsSnapshot(sportKey, homeTeam, awayTeam)
  ]);


  // ═══════════════════════════════════════════════════════════════════
  // HARD DATA GATE (founder, Aug 24: football brought to MLB's shape —
  // the analog of MLB's lineup gate). Two requirements, fail-closed:
  // the official injury feed must have ANSWERED (an errored fetch is not
  // an empty report), and both starting QBs must be resolved. A refused
  // tier is retried by the scheduler's later tiers, exactly like MLB.
  // ═══════════════════════════════════════════════════════════════════
  if (injuries && injuries.sourceOk === false) {
    throw new Error(`[Scout Report] HARD FAIL — NFL requires the official injury feed for ${awayTeam} @ ${homeTeam}; the BDL injury source did not answer (a failed fetch is not an empty report). Later tiers retry.`);
  }
  // ===================================================================
  // Step B: Set venue from NFL stadium mapping
  // ===================================================================
  const homeVenue = nflStadiums[homeTeam];
  if (homeVenue) {
    game.venue = homeVenue;
    console.log(`[Scout Report] ✓ NFL Venue (from mapping): ${homeVenue}`);
  }
  // A neutral site (London, Munich, Melbourne...) is the schedule's stadium, not the home club's (audit, Oct 13
  // 2026: the Texans-Jaguars desk at Wembley said "EverBank Stadium. Jacksonville Jaguars are at home.").
  let scheduleWeek = null;
  try {
    const schedule = await getNflSchedule();
    const row = schedule?.unavailable ? null
      : scheduleRowFor(schedule, nflSeasonYear, nflverseCode(homeTeam), nflverseCode(awayTeam), game.commence_time);
    scheduleWeek = row?.week ? Number(row.week) : null;
    if (row?.location === 'Neutral') {
      game.isNeutralSite = true;
      game.venue = siteFor(row)?.name || row.stadium || game.venue;
      console.log(`[Scout Report] ✓ NFL neutral site from the schedule: ${game.venue}`);
    }
  } catch { /* the mapping venue stands */ }
  // Official game designations the feed does not carry (round 2 audit, Oct 13 2026: six Week 5 designations, among
  // them a Ravens guard inactive that night, reached no desk). nflverse publishes the league's official report;
  // only this game's week counts. Its game status wins over the feed's row and the feed's note for a player both list
  // (Oct 23 2026 data audit: Sills read "QUESTIONABLE per this week's note; the feed still reads IR-R" with the
  // official report saying Out); the feed's note stays as text.
  if (injuries && injuries.sourceOk !== false && !scheduleWeek) {
    (injuries.notOnFile ||= []).push(`Official injury report: not on file (the schedule did not give this game's week); the statuses below are the injury feed's.`);
  }
  if (scheduleWeek && injuries && injuries.sourceOk !== false) {
    // A report row finds the feed's row for the same player by full name; by last name only when one player on each
    // side has it (Oct 27 2026 data check: last name and first initial merged Atlanta's two Terrells, A.J. and Avieon,
    // into one entry with both injuries; and the Jets' "Kiko" and "Francisco" Mauigoa, one player, read as two).
    const norm = (x) => String(x || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
    for (const [side, team] of [['home', homeTeam], ['away', awayTeam]]) {
      const report = await getPracticeReport(team, nflSeasonYear, scheduleWeek).catch((e) => ({ unavailable: true, reason: `Could not reach the league's file: ${e.message}` }));
      // A download that failed is not a file without the team (round 11).
      if (report?.unavailable && /could not reach/i.test(String(report.reason || ''))) {
        (injuries.notOnFile ||= []).push(`Official injury report, Wk ${scheduleWeek}, ${team}: not on file (the league's file could not be downloaded); the statuses below are the injury feed's.`);
        continue;
      }
      if (!report?.players?.length) {
        // Before the week's final report is due (the day before a Thursday game, two days before any other), the
        // feed's weekly word is its placeholder too, whether or not the report file loaded (round 8: Monday's Seahawks
        // read backup Drew Lock and Zach Charbonnet "Questionable" from a bulk stamp on 34 players).
        const pending = finalReportNotDue(game.commence_time);
        // The league's file not having the team is not the team not having filed (round 10: the Bears' Thursday report was
        // out on NFL.com while the file had no Bears rows yet).
        (injuries.notOnFile ||= []).push(`Official injury report, Wk ${scheduleWeek}, ${team}: not in the league's file yet${pending ? "; this week's game statuses come with the final report" : ''}; the statuses below are the injury feed's.`);
        if (pending && Array.isArray(injuries[side])) for (const i of injuries[side]) i.statusesPending = true;
        continue;
      }
      const list = Array.isArray(injuries[side]) ? injuries[side] : (injuries[side] = []);
      const byFull = new Map(list.map((i) => [`${norm(i.player?.first_name)}${norm(i.player?.last_name)}`, i]));
      const byLast = new Map();
      for (const i of list) { const k = norm(i.player?.last_name); byLast.set(k, [...(byLast.get(k) || []), i]); }
      const reportLast = new Map();
      for (const r of report.players) { const k = norm(String(r.name || '').trim().split(/\s+/).slice(1).join(' ')); reportLast.set(k, (reportLast.get(k) || 0) + 1); }
      const findListed = (first, last) => byFull.get(`${norm(first)}${norm(last)}`)
        || (byLast.get(norm(last))?.length === 1 && reportLast.get(norm(last)) === 1 ? byLast.get(norm(last))[0] : null);
      // The week's game statuses come with its final report (the day before a Thursday game, the Friday before a
      // Sunday one); until then the report carries practice participation only, and a blank status is not "no
      // designation" (Oct 28 2026 sweep: the night before Panthers-Packers every player read "No game designation",
      // Golden under a note saying he was listed questionable and Franklin, Phillips and Lewis under "out").
      const designated = report.players.some((r) => r.game_status);
      // Until then a feed's weekly word is its placeholder too (Oct 29 2026 hunt: on Thursday nine Eagles read Questionable
      // for Sunday, Omenihu's under a note from Oct 20); nflAvailability.js says the statuses are not issued yet.
      if (!designated) for (const i of list) i.statusesPending = true;
      for (const raw of report.players) {
        const [first, ...rest] = String(raw.name || '').trim().split(/\s+/);
        if (!first) continue;
        // A player on the report with no game designation is on it too: practiced, expected to play (Oct 27 2026 data
        // check: Jaylon Carlies and Kaden Elliss, back from missed games, practiced fully with no designation and read
        // as "missed the last game, not on this week's injury report").
        const p = raw.game_status || !designated ? raw : { ...raw, game_status: 'No game designation' };
        // One injury once (round 8: B.J. Hill read "Achilles, Achilles", the practice row's second injury his first).
        const hurt = [p.injury, p.secondary].filter(Boolean).filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i).join(', ');
        // The practice word is the latest one the league's file holds, which can trail the feed's dated note by a day
        // (round 8: Kelce read "practice: Full" beside "limited in Thursday's practice"); it says so.
        // The status is the row's own (in its heading), said once (round 16: three or four times a row).
        const said = `${hurt ? hurt.toLowerCase() : 'injury not given'}${p.practiceDays?.length ? `; practice by report day: ${p.practiceDays.map((x) => `${x.day} ${x.practice}`).join(' · ')}` : p.practice ? `; practice, the latest day in the league's file: ${p.practice}` : ''}`;
        const listed = findListed(first, rest.join(' '));
        if (listed) {
          if (p.game_status) { listed.status = p.game_status; listed.officialStatus = true; }
          if (p.gsis_id) listed.gsis_id = p.gsis_id;
          // The feed's comment when it says more than a status word (Oct 29 2026 hunt: "... practice: Limited. questionable").
          // Without the reporter's credit ("..., Wes Hodkiewicz of the Packers' official site reports"; round 16).
          const feedNote = /^\s*(?:questionable|doubtful|out|probable|active)\.?\s*$/i.test(String(listed.comment || '')) ? ''
            : String(listed.comment || '').replace(/,\s*[A-Z][^,]*?\s+(?:of|from)\s+[^,]*?\s+reports?\.?\s*$/, '.').replace(/\s+(?:according to|per)\s+[A-Z][^.]*\.\s*$/, '.');
          listed.comment = `Official report, Wk ${report.week}: ${said}. ${feedNote}`.trim();
          continue;
        }
        list.push({ player: { first_name: first, last_name: rest.join(' '), position: p.position || null }, status: p.game_status || 'No game status yet',
          comment: `Official report, Wk ${report.week}: ${said}.`,
          freshness: 'FRESH', noteCurrent: true, source: 'NFL official report', gsis_id: p.gsis_id || null });
      }
    }
  }
  // Game context: primetime slots detected from game time, playoff rounds from game name

  // ===================================================================
  // Step C: Fetch starting QBs (pass injuries to filter out IR/Out players)
  // ===================================================================
  const playerBaselines = Object.fromEntries([['home', homeProfile], ['away', awayProfile]].map(([side, profile]) => [side, {
    statsSeason: profile?.seasonStatsSeason ?? null,
    currentRegularGamesPlayed: profile?.currentRegularGamesPlayed ?? null,
  }]));
  const startingQBs = await fetchStartingQBs(homeTeam, awayTeam, sportKey, injuries, nflSeasonYear, playerBaselines);
  // Second half of the hard gate: no pick without both starting QBs.
  if (!startingQBs?.home?.name || !startingQBs?.away?.name) {
    const missing = [!startingQBs?.home?.name ? homeTeam : null, !startingQBs?.away?.name ? awayTeam : null].filter(Boolean).join(', ');
    throw new Error(`[Scout Report] HARD FAIL — NFL requires resolved starting QBs for ${awayTeam} @ ${homeTeam} (missing: ${missing}). Later tiers retry.`);
  }


  // ===================================================================
  // Step D: Fetch key players (roster + stats) to prevent hallucinations
  // ===================================================================
  const keyPlayers = await fetchKeyPlayers(homeTeam, awayTeam, sportKey, nflSeasonYear, playerBaselines);

  // ===================================================================
  // Step E: Fetch NFL roster depth + playoff history
  // ===================================================================
  let nflPlayoffHistory = null;
  let nflHomeTeamId = null;
  let nflAwayTeamId = null;

  // The depth chart prints inside PLAYERS, from the rosters fetchKeyPlayers already reads (Oct 5 2026).

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
          nflSeasonYear
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
  const primetimeSlot = nflPrimetimeSlot(game.commence_time);
  if (primetimeSlot) game.tournamentContext = primetimeSlot;

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
  // Step J: (Ghost-player narrative scrub retired — its name sets had no
  // consumer since the Flash scrub was removed; block deleted Sep 1 2026.)

  // Step K: Assemble the report
  // ===================================================================

  // Extract narrative context from the grounding pass
  let narrativeContext = injuries?.narrativeContext || null;

  // WHAT THE PRESS WROTE ABOUT THE LAST GAMES (founder, Aug 25).
  // Play-by-play gives the scoring and the swings; only someone who watched
  // writes down that a 50-yard catch was nearly picked and fell in the
  // receiver's lap, or that a line was beaten all afternoon. MLB gets this
  // free from statsapi's editorial recap; football has to search for it.
  // Fail-soft: a missing narrative never costs the report.
  let recentCoverage = null;
  const lastGames = {};
  try {
    // Hand the search lanes what we already hold, so they spend their budget
    // on what a box score cannot say rather than rediscovering the scores.
    let knownAccounts = null;
    try {
      const bdlKey = 'americanfootball_nfl';
      const rosterTeams = await ballDontLieService.getTeams(bdlKey);
      const ids = [[homeTeam, findTeam(rosterTeams, homeTeam)?.id], [awayTeam, findTeam(rosterTeams, awayTeam)?.id]]
        .filter(([, id]) => id != null);
      if (ids.length) {
        const blocks = await Promise.all(ids.map(async ([name, id]) => {
          const results = (await loadTeamResults(bdlKey, id, nflSeasonYear)).slice(0, 3);
          if (!results.length) return null;
          lastGames[name === homeTeam ? 'home' : 'away'] = results[0];
          return `${name}:\n` + results.map((r) => `  - ${gameStoryLine(r)}`).join('\n');
        }));
        const kept = blocks.filter(Boolean);
        if (kept.length) knownAccounts = kept.join('\n');
      }
    } catch (e) {
      console.warn(`[Scout Report] Known-accounts context unavailable: ${e.message}`);
    }
    const coverage = await fetchNflArticlesAsWritten({ homeTeam, awayTeam, knownAccounts, lastGames,
      asOf: Math.min(Date.now(), Date.parse(game.commence_time) || Date.now()) });
    recentCoverage = coverage?.text || null;
  } catch (e) {
    console.warn(`[Scout Report] Recent-game coverage unavailable: ${e.message}`);
  }

  const matchupLabel = game.isNeutralSite ? `${awayTeam} vs ${homeTeam}` : `${awayTeam} @ ${homeTeam}`;
  const venueLabel = game.venue || (game.isNeutralSite ? 'Neutral Site' : `${homeTeam} Home`);
  const tournamentLabel = game.tournamentContext ? `[${game.tournamentContext}]` : '';

  const seasonLabel = footballSeasonLabel(nflSeasonYear);

  // THE SITUATION opens the desk (founder, Oct 5 2026): where and when, the division, each team's home and
  // road record, last game and run. It replaces GAME CONTEXT & SIGNIFICANCE, which printed one label.
  let gameContextSection = '';
  try {
    const situationTeams = await ballDontLieService.getTeams('americanfootball_nfl');
    gameContextSection = '\n' + await nflSituationSection({ homeTeam, awayTeam, home: findTeam(situationTeams, homeTeam), away: findTeam(situationTeams, awayTeam),
      game, season: nflSeasonYear, slot: game.tournamentContext || null, rule: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' });
  } catch (e) {
    console.warn(`[Scout Report] NFL situation section unavailable: ${e.message}`);
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

  const evidenceTeams = await ballDontLieService.getTeams('americanfootball_nfl');
  const gameEvidence = await footballEvidenceBundle({ league: 'NFL',
    home: findTeam(evidenceTeams, homeTeam), away: findTeam(evidenceTeams, awayTeam), season: nflSeasonYear });
  // EACH UNIT GAME BY GAME, AND WHO PLAYED THE SNAPS (founder GO, Oct 4 2026):
  // the games behind the season totals, and the injury report's players
  // beside the snaps they took. A source that fails is named, never dropped.
  let gameByGame = '';
  try {
    gameByGame = await nflGameByGameSections({ homeTeam, awayTeam, home: findTeam(evidenceTeams, homeTeam),
      away: findTeam(evidenceTeams, awayTeam), season: nflSeasonYear, injuries });
  } catch (e) {
    console.warn(`[Scout Report] NFL game-by-game sections unavailable: ${e.message}`);
    gameByGame = `EACH UNIT, GAME BY GAME — NOT ON THIS DESK\nThe game-by-game and snap sections could not be built for this game (${e.message}).\n`;
  }
  // THE INJURY REPORT GARY READS (founder GO, Sep 24 2026): reserve listings
  // (IR, IR-R, PUP, NFI, suspensions) that are stale or undated are the same
  // 7-13 practice-squad rows at the top of every desk; they stay in the
  // stored injuries for settlement and leave the report text.
  const RESERVE = /^(ir|ir-r|ir-nr|pup|pup-r|pup-p|nfi|nfi-r|nfi-p|susp|suspended|injured reserve|reserve)\b/i;
  const readable = (list) => (list || []).filter((i) => !(RESERVE.test(String(i?.status || '').trim()) && i?.freshness !== 'FRESH'));
  // Each row says whether he played the team's most recent games (founder GO, Oct 4 2026), not how old the
  // latest report is. A failure leaves the rows with their status alone.
  await attachNflParticipation({ homeTeam, awayTeam, home: findTeam(evidenceTeams, homeTeam), away: findTeam(evidenceTeams, awayTeam),
    season: nflSeasonYear, injuries }).catch((e) => console.warn(`[Scout Report] NFL participation notes unavailable: ${e.message}`));
  // The reserve listings the report leaves out still print once, as names (injury status lives only here now).
  const reserveOnly = (list) => (list || []).filter((i) => !readable([i]).length)
    .map((i) => `${`${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim() || i.name} (${String(i.status || '').toUpperCase()})`);
  const reserveLines = [[homeTeam, reserveOnly(injuries.home)], [awayTeam, reserveOnly(injuries.away)]].filter(([, names]) => names.length)
    .map(([team, names]) => `${team} — also on reserve lists: ${names.join(', ')}`);
  const injuryReportText = formatInjuryReport(homeTeam, awayTeam, { ...injuries, home: readable(injuries.home), away: readable(injuries.away) }, sportKey, null)
    + (reserveLines.length ? `\n${reserveLines.join('\n')}` : '');

  // Build verified Tale of Tape ONCE and reuse in report text + return object
  const verifiedTaleOfTape = buildVerifiedTaleOfTape(homeTeam, awayTeam, homeProfile, awayProfile, sportKey, injuries, recentHome, recentAway);

  // THE LINE is the posted price and one line saying where the spread opened
  // and where it is now (founder, Oct 4 2026: "none of that has anything to do
  // with the real game, it's just what people think", then: keep the opener
  // beside the current number). The move-by-move timeline, the exchange
  // prices and the season's closing lines left the desk that day.
  // No line history of any kind on the desk (founder, Oct 5 2026: "him thinking the line is wrong and is worried
  // about line movements and all that ... needs to come out"). The opened/now line kept on Oct 4 went with it:
  // a re-run of Lions at Panthers still argued "the line has not moved off -3.5". THE LINE is the posted price.

  // TEAM NUMBERS, ABOVE THE PROSE (founder GO, Sep 24 2026): per club, last
  // season in full beside this season as a count of games (a Week 1 figure
  // is one game, never a team's identity).
  const teamNumbers = await formatTeamNumbers(gameEvidence, nflSeasonYear, { onlyRecord: true }).catch(() => null);

  // Player red zone for the skill-player lines (BDL play-by-play, refreshed first).
  let playerRedZone = null;
  try {
    const { supabaseAdmin } = await import('../../../../../supabaseClient.js');
    if (supabaseAdmin) {
      await refreshNflRedZone({ supabase: supabaseAdmin, seasons: [nflSeasonYear], log: { warn: () => {} } }).catch(() => 0);
      playerRedZone = await loadNflRedZone({ supabase: supabaseAdmin, seasons: [nflSeasonYear] }); // this season only, never last
    }
  } catch { /* the lines print without red zone */ }

  const RULE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  const offenseGameLogs = await loadNflOffenseGameLogs(keyPlayers, { asOf: game.commence_time ? new Date(game.commence_time) : new Date(), startingQBs }).catch(() => null);
  // WHAT THIS WEEK IS ABOUT: verbatim storyline sentences pulled from the reporting (weekStorylines.js).
  const weekStorylines = await weekStorylinesSection({ teams: [awayTeam, homeTeam],
    source: [recentCoverage, narrativeContext].filter(Boolean).join('\n\n'), rule: RULE });
  // THE DESK'S ORDER (founder GO, Oct 5 2026): the story first, the price, the reporting, then the numbers.
  // Removed only as duplicates (founder, Oct 5 2026: "don't remove any stats or data unless it's duplicate"):
  // RECENT FORM, REST & SCHEDULE and the standings snapshot, whose facts THE SITUATION now carries in full;
  // TEAM NUMBERS and TEAM STATISTICS keep only what the measured evidence does not print.
  const report = `
══════════════════════════════════════════════════════════════════════
MATCHUP: ${matchupLabel}
Sport: ${sportKey} | ${game.commence_time ? formatGameTime(game.commence_time) : 'Time TBD'}
${game.venue ? `Venue: ${venueLabel}` : ''}${tournamentLabel ? `\n${tournamentLabel}` : ''}
══════════════════════════════════════════════════════════════════════
${gameContextSection}
${weekStorylines}
THE LINE
${RULE}
${formatOdds(game, sportKey)}

${recentCoverage ? `
WHO THESE TEAMS ARE, AND HOW THE LAST GAMES WENT — AS WRITTEN
${RULE}
Press accounts of each team's recent games and reporting on this week, each
article complete as the publisher printed it.

${recentCoverage}
${RULE}
` : ''}${narrativeContext ? `
CURRENT STATE & CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━
Recent news, storylines, and context for both teams.

${narrativeContext}
${RULE}
` : ''}

${teamNumbers ? `LAST SEASON'S RECORD
${RULE}
${teamNumbers}
${RULE}
` : ''}
${formatNflTeamStats(homeTeam, awayTeam, homeProfile, awayProfile)}
${formatFootballEvidence(withoutSnapList(gameEvidence))}
${gameByGame}

${startingQBs ? formatStartingQBs(homeTeam, awayTeam, startingQBs, { withStats: false }) : ''}
${formatNflPlayers({ homeTeam, awayTeam, keyPlayers, redZone: playerRedZone, season: nflSeasonYear, startingQBs, injuries, gameLogs: offenseGameLogs })}

INJURY REPORT
${RULE}
Each row shows the reported status and whether he played the team's most recent games.

${injuryReportText}
${formatStartingLineups(homeTeam, awayTeam, injuries.lineups)}
${seasonLongInjuriesSection}

HEAD-TO-HEAD HISTORY (${seasonLabel} SEASON)
${RULE}
${formatH2HSection(h2hData, homeTeam, awayTeam)}
${RULE}
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
  };
}


export { fetchStartingQBs, fetchQBStatsByName, formatStartingQBs, formatNflRosterDepth, withRecentStarter };
