/**
 * NHL Scout Report Builder
 * Handles all NHL-specific logic for building the pre-game scout report.
 */

import { ballDontLieService } from '../../../ballDontLieService.js';
import { generateGameSignificance } from '../gameSignificanceGenerator.js';
import { formatTokenMenu } from '../../tools/toolDefinitions.js';
import { nhlSeason } from '../../../../utils/dateUtils.js';
import {
  seasonForSport,
  playerNamesMatch,
  sportToBdlKey,
  findTeam,
  formatGameTime,
  getInjuryStatusFromMap
} from '../shared/utilities.js';
import { geminiGroundingSearch, fetchStandingsSnapshot } from '../shared/grounding.js';
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
  formatNhlRecentFormWithBoxScores,
  fetchNhlBoxScoresForGames,
  formatH2HSection,
  fetchGroundingInjuries,
  detectReturningPlayers
} from '../shared/dataFetchers.js';
import { buildVerifiedTaleOfTape } from '../shared/taleOfTape.js';
import { getTeamStats as getMoneyPuckTeamStats } from '../../../moneyPuckService.js';
import { getTeamPercentages as getNhlApiPercentages } from '../../../nhlStatsApiService.js';


// =========================================================================
// NHL KEY PLAYERS HELPER
// Uses Gemini Grounding (RotoWire) for lineups + BDL for roster/stats
// =========================================================================
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

      // Lineup retries: only retry if 3+ positions are UNKNOWN (was: any UNKNOWN — too sensitive)
      // 4/5 positions is good enough; one missing position doesn't justify another grounding call
      const countUnknownLineup = (parsed) => {
        if (!parsed) return 5;
        const lineupUnknowns = (parsed.lineup || []).filter(line => line.includes('UNKNOWN')).length;
        const goalieUnknown = (parsed.goalieLine || '').includes('UNKNOWN') ? 1 : 0;
        return lineupUnknowns + goalieUnknown;
      };
      if (countUnknownLineup(awayParsed) >= 3) {
        const retry = await geminiGroundingSearch(makeLineupQuery(awayTeam, homeTeam, true), { temperature: 1.0, maxTokens: 2000 });
        awayParsed = retry?.success ? parseTeamLineup(retry.data, awayTeam) : awayParsed;
      }
      if (countUnknownLineup(homeParsed) >= 3) {
        const retry = await geminiGroundingSearch(makeLineupQuery(homeTeam, awayTeam, true), { temperature: 1.0, maxTokens: 2000 });
        homeParsed = retry?.success ? parseTeamLineup(retry.data, homeTeam) : homeParsed;
      }

      // PP retries: only if 3+ of 5 PP1 positions are missing (4/5 is good enough)
      const countPP1Unknown = (pp) => {
        if (!pp || !pp.pp1Line) return 5;
        return (pp.pp1Line.match(/UNKNOWN/g) || []).length;
      };
      if (countPP1Unknown(awayPP) >= 3) {
        console.log(`[Scout Report] PP1 incomplete for ${awayTeam} - retrying...`);
        const retry = await geminiGroundingSearch(makePowerPlayQuery(awayTeam, homeTeam, true), { maxTokens: 2000 });
        if (retry?.success) {
          awayPP = parsePowerPlay(retry.data, awayTeam);
        }
      }
      if (countPP1Unknown(homePP) >= 3) {
        console.log(`[Scout Report] PP1 incomplete for ${homeTeam} - retrying...`);
        const retry = await geminiGroundingSearch(makePowerPlayQuery(homeTeam, awayTeam, true), { maxTokens: 2000 });
        if (retry?.success) {
          homePP = parsePowerPlay(retry.data, homeTeam);
        }
      }
      // No HARD FAIL — partial PP data (3/5+ positions) is acceptable for analysis

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

      let awayInjuries = normalizeInjuryLines(awayInjuriesRaw, awayStatusMap);
      let homeInjuries = normalizeInjuryLines(homeInjuriesRaw, homeStatusMap);

      // ═══════════════════════════════════════════════════════════════════
      // NHL INJURY DURATION RESOLUTION (box-score method — same as NBA)
      // Uses BDL box scores to determine when each injured player last played.
      // Labels: FRESH (0-2 games missed), SHORT-TERM (3-5), PRICED IN (6+), SEASON-LONG (20+)
      // ═══════════════════════════════════════════════════════════════════
      try {
        const teams = await ballDontLieService.getTeams(bdlSport);
        const hTeam = findTeam(teams, homeTeam);
        const aTeam = findTeam(teams, awayTeam);
        const nhlSeason = new Date().getMonth() + 1 >= 10 ? new Date().getFullYear() : new Date().getFullYear() - 1;

        const resolveNhlInjuryDuration = async (injuryLines, teamId, teamName) => {
          if (!teamId || injuryLines.length === 0) return injuryLines;
          try {
            // Fetch recent games by date range (not season — season pagination only returns page 1)
            const today = new Date();
            const recentDates = [];
            for (let i = 1; i <= 14; i++) {
              const d = new Date(today); d.setDate(d.getDate() - i);
              recentDates.push(d.toISOString().split('T')[0]);
            }
            const allGames = (await Promise.all(
              recentDates.map(d => ballDontLieService.getGames(bdlSport, { dates: [d], per_page: 50 }).catch(() => []))
            )).flat();
            // Filter to this team's games only
            const teamGames = allGames.filter(g =>
              g.home_team?.id === teamId || g.visitor_team?.id === teamId || g.away_team?.id === teamId
            );
            const isFinished = (g) => ['Final', 'OFF', 'STATUS_FINAL'].includes(g.status) || g.home_team_score != null;
            const finishedGames = teamGames
              .filter(isFinished)
              .sort((a, b) => new Date(b.date || b.game_date || b.datetime) - new Date(a.date || a.game_date || a.datetime))
              .slice(0, 10);
            console.log(`[Scout Report] NHL injury resolution: Found ${finishedGames.length} recent games for ${teamName}`);

            if (finishedGames.length === 0) return injuryLines;

            const gameIds = finishedGames.map(g => g.id).filter(Boolean);
            const gameDateMap = new Map();
            finishedGames.forEach(g => gameDateMap.set(g.id, g.date || g.game_date || g.datetime));

            // Fetch box scores for these games
            const boxDates = [...new Set(finishedGames.map(g => (g.date || g.game_date || g.datetime || '').split('T')[0]).filter(Boolean))];
            const boxScores = (await Promise.all(
              boxDates.map(d => ballDontLieService.getNhlRecentBoxScores([d]).catch(() => []))
            )).flat();

            // For each injury line, find the player and check when they last played
            return injuryLines.map(line => {
              const nameMatch = line.match(/-\s*([^|]+)/);
              if (!nameMatch) return line;
              const playerName = nameMatch[1].trim().toLowerCase();

              // Find this player in box scores
              const playerEntries = boxScores.filter(bs => {
                const bsName = `${bs.player?.first_name || ''} ${bs.player?.last_name || ''}`.toLowerCase().trim();
                return bsName === playerName || bsName.includes(playerName) || playerName.includes(bsName);
              }).filter(bs => {
                // Only count entries where they actually played (had time on ice)
                const toi = bs.time_on_ice || bs.toi || bs.minutes || 0;
                return typeof toi === 'string' ? toi !== '00:00' && toi !== '0' : toi > 0;
              });

              if (playerEntries.length > 0) {
                // Find most recent game they played
                // BDL NHL box scores use game.game_date (not game.date)
                const getGameDate = (bs) => bs.game?.game_date || bs.game?.date || bs.game?.start_time_utc;
                playerEntries.sort((a, b) => new Date(getGameDate(b) || 0) - new Date(getGameDate(a) || 0));
                const lastGameDate = new Date(getGameDate(playerEntries[0]));
                const daysSince = Math.floor((Date.now() - lastGameDate) / (1000 * 60 * 60 * 24));

                const gamesMissed = finishedGames.filter(g => new Date(g.date || g.game_date || g.datetime) > lastGameDate).length;

                let label;
                if (gamesMissed <= 2 && daysSince < 5) label = 'FRESH';
                else if (gamesMissed <= 5) label = 'SHORT-TERM';
                else if (gamesMissed >= 20) label = 'SEASON-LONG';
                else label = 'PRICED IN';

                console.log(`[Scout Report] NHL injury duration: ${nameMatch[1].trim()} — ${gamesMissed} games missed, ${daysSince} days → ${label}`);
                return `${line} [${label} — ${gamesMissed} games missed]`;
              } else {
                // Not found in any recent box scores — season-long or new player
                console.log(`[Scout Report] NHL injury duration: ${nameMatch[1].trim()} — not in last ${gameIds.length} box scores → SEASON-LONG`);
                return `${line} [SEASON-LONG — not in recent games]`;
              }
            });
          } catch (e) {
            console.warn(`[Scout Report] NHL injury duration resolution failed for ${teamName}: ${e.message}`);
            return injuryLines;
          }
        };

        [awayInjuries, homeInjuries] = await Promise.all([
          resolveNhlInjuryDuration(awayInjuries, aTeam?.id, awayTeam),
          resolveNhlInjuryDuration(homeInjuries, hTeam?.id, homeTeam)
        ]);
      } catch (e) {
        console.warn(`[Scout Report] NHL injury duration resolution skipped: ${e.message}`);
      }

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

    console.log(`[Scout Report] NHL Key players: ${homeTeam} (${homeCount} players), ${awayTeam} (${awayCount} players)`);

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


// =========================================================================
// FORMAT NHL KEY PLAYERS
// Shows RotoWire lineups (Gemini Grounding) + BDL roster with stats
// =========================================================================
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

GOALIE CONFIRMATION STATUS:
- "Confirmed" = Definite starter
- "Expected" = Likely but not officially confirmed
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
    return `  ${player.position}: ${player.name}${stats}`;
  };

  const formatDefenseman = (player) => {
    const stats = player.gamesPlayed > 0
      ? ` - ${player.goals}G, ${player.assists}A, ${player.points}P (${player.plusMinus >= 0 ? '+' : ''}${player.plusMinus})`
      : '';
    return `  D: ${player.name}${stats}`;
  };

  const formatGoalie = (player) => {
    const stats = player.gamesPlayed > 0
      ? ` - ${player.wins}W-${player.losses}L, ${player.savePct || '?'}% SV, ${player.gaa || '?'} GAA`
      : '';
    return `  G: ${player.name}${stats}`;
  };

  // NHL-SPECIFIC: Build REQUIRED goalie comparison table (per NHL constitution)
  const buildGoalieComparisonTable = () => {
    const homeGoalies = keyPlayers.home?.goalies || [];
    const awayGoalies = keyPlayers.away?.goalies || [];

    if (homeGoalies.length === 0 && awayGoalies.length === 0) {
      throw new Error('GOALIE DATA UNAVAILABLE — cannot build NHL scout report without goalie data.');
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

    return `
| Position | ${awayTeam} | ${homeTeam} |
|----------|-------------|-------------|
| STARTER  | ${awayStarter?.name || 'TBD'} | ${homeStarter?.name || 'TBD'} |
| Record   | ${awayStarter ? `${awayStarter.wins}-${awayStarter.losses}` : 'N/A'} | ${homeStarter ? `${homeStarter.wins}-${homeStarter.losses}` : 'N/A'} |
| SV%      | ${awayStarter?.savePct ? `.${awayStarter.savePct.replace('.', '')}` : 'N/A'} | ${homeStarter?.savePct ? `.${homeStarter.savePct.replace('.', '')}` : 'N/A'} |
| GAA      | ${awayStarter?.gaa || 'N/A'} | ${homeStarter?.gaa || 'N/A'} |
| Games    | ${awayStarter?.gamesPlayed || 0}GP | ${homeStarter?.gamesPlayed || 0}GP |
| Shutouts | ${awayStarter?.shutouts || 0} | ${homeStarter?.shutouts || 0} |
| BACKUP   | ${awayBackup?.name || 'N/A'} | ${homeBackup?.name || 'N/A'} |

NOTE: Confirmed starting goalie shown above. Backup goalie listed for reference.
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
GOALIE COMPARISON TABLE (REQUIRED FOR NHL ANALYSIS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${goaliComparisonTable}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ACTIVE ROSTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Players on each team's roster from Ball Don't Lie data.
${homeSection}

${awaySection}

Current 2025-26 roster data from BDL.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}


// =========================================================================
// FORMAT NHL ROSTER DEPTH
// Shows skaters + goalies with season stats from BDL
// =========================================================================
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
    'ROSTER DEPTH \u2014 SKATERS & GOALIES (FROM BDL)',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    'Current players and season stats for each team.',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
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
          lines.push('  \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 (DEPTH) \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500');
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
          lines.push('  \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 (DEPTH) \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500');
        }
      });
    }
    lines.push('');
  }

  lines.push('');

  return lines.join('\n');
}


// =========================================================================
// MAIN EXPORT: Build NHL Scout Report
// =========================================================================
export async function buildNhlScoutReport(game, options = {}) {
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  const sportKey = 'NHL';
  const sport = 'NHL';

  // =========================================================================
  // Step 1: Fetch basic data in parallel
  // =========================================================================
  const [homeProfile, awayProfile, injuries, recentHome, recentAway, standingsSnapshot, homeMoneyPuck, awayMoneyPuck, homeNhlApi, awayNhlApi] = await Promise.all([
    fetchTeamProfile(homeTeam, sportKey),
    fetchTeamProfile(awayTeam, sportKey),
    fetchInjuries(homeTeam, awayTeam, sportKey),
    fetchRecentGames(homeTeam, sportKey, 12),
    fetchRecentGames(awayTeam, sportKey, 12),
    fetchStandingsSnapshot(sportKey, homeTeam, awayTeam),
    getMoneyPuckTeamStats(homeTeam).catch(e => { console.log(`[Scout Report] MoneyPuck home failed: ${e.message}`); return null; }),
    getMoneyPuckTeamStats(awayTeam).catch(e => { console.log(`[Scout Report] MoneyPuck away failed: ${e.message}`); return null; }),
    getNhlApiPercentages(homeTeam).catch(e => { console.log(`[Scout Report] NHL API home failed: ${e.message}`); return null; }),
    getNhlApiPercentages(awayTeam).catch(e => { console.log(`[Scout Report] NHL API away failed: ${e.message}`); return null; })
  ]);

  // =========================================================================
  // Step 2: NHL INJURY DURATION RESOLUTION (box-score method)
  // Uses time_on_ice > "00:00" instead of minutes > 0 to detect last appearance.
  // =========================================================================
  if (injuries?.home?.length > 0 || injuries?.away?.length > 0) {
    const STALE_WINDOW_GAMES = 2;

    const resolveNhlDurationByBoxScore = async (injuryList, teamRecentGames, teamName, teamId) => {
      const actionableInjuries = injuryList.filter(inj => {
        const status = (inj.status || '').toLowerCase();
        return status.includes('out') || status.includes('doubtful') || status.includes('questionable') || status.includes('day-to-day');
      });
      if (actionableInjuries.length === 0) return;

      // Get dates from team's recent games (up to 10)
      const gameDates = (teamRecentGames || [])
        .filter(g => g.date)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10);

      if (gameDates.length === 0) {
        throw new Error(`[Scout Report] CRITICAL: No recent game dates for ${teamName} — cannot resolve NHL injury durations`);
      }

      // Fetch box scores for those dates (team-filtered)
      const dateStrs = [...new Set(gameDates.map(g => g.date?.split('T')[0]).filter(Boolean))];

      const boxScores = await ballDontLieService.getNhlRecentBoxScores(dateStrs, {
        team_ids: teamId ? [teamId] : []
      });

      if (!boxScores || boxScores.length === 0) {
        throw new Error(`[Scout Report] CRITICAL: No NHL box-score data for ${teamName} — cannot resolve injury durations`);
      }

      // Resolve each injury
      const STALE_DAYS_THRESHOLD = 5;
      for (const inj of actionableInjuries) {
        const injName = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.toLowerCase().trim();
        if (!injName) continue;
        const pName = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();

        // Find this player's entries where time_on_ice > 0
        const playerEntries = boxScores.filter(s => {
          const statName = `${s.player?.first_name || ''} ${s.player?.last_name || ''}`.toLowerCase().trim();
          const toi = s.time_on_ice || '00:00';
          return playerNamesMatch(injName, statName) && toi !== '00:00' && toi !== '0:00';
        });

        if (playerEntries.length > 0) {
          // Sort by game date descending
          playerEntries.sort((a, b) => {
            const dateA = new Date(a.game?.date || 0);
            const dateB = new Date(b.game?.date || 0);
            return dateB - dateA;
          });

          const lastGameDate = new Date(playerEntries[0].game?.date);
          const daysSince = Math.floor((Date.now() - lastGameDate) / (1000 * 60 * 60 * 24));

          // Count team games after player's last appearance
          const gamesMissed = gameDates.filter(g => new Date(g.date) > lastGameDate).length;

          if (gamesMissed <= STALE_WINDOW_GAMES && daysSince < STALE_DAYS_THRESHOLD) {
            inj.duration = 'FRESH';
            inj.freshness = 'FRESH';
            inj.isPricedIn = false;
          } else if (gamesMissed <= 7) {
            inj.duration = 'SHORT-TERM';
            inj.freshness = 'STALE';
            inj.isPricedIn = true;
          } else if (gamesMissed <= 20) {
            inj.duration = 'LONG-TERM';
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
          // Not found in recent box scores — long-term absence
          inj.gamesMissed = gameDates.length;
          inj.gamesMissedIsMinimum = true;
          inj.duration = 'SEASON-LONG';
          inj.freshness = 'STALE';
          inj.isPricedIn = true;
          inj.durationSource = 'box_score';
          console.log(`[Scout Report] ${pName} (${teamName}) not in last ${gameDates.length} games → SEASON-LONG [STALE]`);
        }
      }
    };

    await Promise.all([
      resolveNhlDurationByBoxScore(injuries.home || [], recentHome, homeTeam, injuries._homeTeamId),
      resolveNhlDurationByBoxScore(injuries.away || [], recentAway, awayTeam, injuries._awayTeamId)
    ]);

    // HARD FAIL: If any Out injury still has UNKNOWN duration, something broke
    const allNhlInjuries = [...(injuries.home || []), ...(injuries.away || [])];
    const unresolvedNhl = allNhlInjuries.filter(inj => {
      const status = (inj.status || '').toLowerCase();
      const isActionable = status.includes('out') || status.includes('doubtful');
      return isActionable && inj.duration === 'UNKNOWN';
    });
    if (unresolvedNhl.length > 0) {
      const details = unresolvedNhl.map(inj => {
        const name = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
        return `${name} (${inj.status}, raw: ${inj.statusRaw}, reason: ${inj.durationContext || 'none'})`;
      }).join('; ');
      throw new Error(`[Scout Report] CRITICAL: ${unresolvedNhl.length} NHL injuries with UNKNOWN duration after box-score resolution. Details: ${details}`);
    }

    // Build stale injuries list
    injuries.staleInjuries = [
      ...(injuries.home || []).filter(i => i.isPricedIn).map(i => `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim()),
      ...(injuries.away || []).filter(i => i.isPricedIn).map(i => `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim())
    ];

    // Log summary
    const freshNhl = allNhlInjuries.filter(i => i.freshness === 'FRESH' && (i.status || '').toLowerCase().includes('out'));
    const staleNhl = allNhlInjuries.filter(i => i.freshness === 'STALE' && (i.status || '').toLowerCase().includes('out'));
    if (freshNhl.length > 0) {
      console.log(`[Scout Report] NHL Fresh OUT: ${freshNhl.map(i => `${i.player?.first_name} ${i.player?.last_name} (${i.gamesMissed ?? 0}g)`).join(', ')}`);
    }
    if (staleNhl.length > 0) {
      console.log(`[Scout Report] NHL Stale OUT: ${staleNhl.map(i => `${i.player?.first_name} ${i.player?.last_name} (${i.gamesMissedIsMinimum ? i.gamesMissed + '+' : i.gamesMissed}g)`).join(', ')}`);
    }
  }

  // =========================================================================
  // Step 2B: Fetch NHL game context via Gemini Grounding (playoffs, venue)
  // =========================================================================
  try {
    let dateStr;
    if (game.commence_time) {
      const gameDate = new Date(game.commence_time);
      dateStr = gameDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    } else {
      dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    }
    console.log(`[Scout Report] Fetching NHL game context via Gemini Grounding for ${dateStr}...`);

    const contextQuery = `Given this NHL game: ${awayTeam} vs ${homeTeam} on ${dateStr}.

Determine what type of game this is, where it is being played, and any special significance.
Search for current information about this specific game.

After your analysis, include this EXACT summary block at the very end of your response:
---GAME_CONTEXT---
GAME_TYPE: [one of: regular_season, playoffs_round_1, playoffs_round_2, playoffs_conference_finals, stanley_cup_finals]
NEUTRAL_SITE: [yes or no]
VENUE: [arena name, city]
---END_CONTEXT---`;

    const contextResult = await geminiGroundingSearch(contextQuery, {
      temperature: 1.0,
      maxTokens: 1500
    });

    if (contextResult?.success && contextResult?.data) {
      const responseText = contextResult.data;
      game.gameSignificance = responseText;

      const contextMatch = responseText.match(/---GAME_CONTEXT---\s*([\s\S]*?)\s*---END_CONTEXT---/);
      if (contextMatch) {
        const block = contextMatch[1];
        const gameType = block.match(/GAME_TYPE:\s*(.+)/i)?.[1]?.trim().toLowerCase() || '';
        const neutralSite = block.match(/NEUTRAL_SITE:\s*(.+)/i)?.[1]?.trim().toLowerCase() || '';
        const venue = block.match(/VENUE:\s*(.+)/i)?.[1]?.trim() || '';

        if (gameType.includes('stanley_cup')) {
          game.tournamentContext = 'Stanley Cup Finals';
          console.log('[Scout Report] Stanley Cup Finals detected');
        } else if (gameType.includes('conference_finals')) {
          game.tournamentContext = 'NHL Conference Finals';
          console.log('[Scout Report] Conference Finals detected');
        } else if (gameType.includes('round_2')) {
          game.tournamentContext = 'NHL Playoffs Round 2';
          console.log('[Scout Report] Playoffs Round 2 detected');
        } else if (gameType.includes('round_1') || gameType.includes('playoff')) {
          game.tournamentContext = 'NHL Playoffs Round 1';
          console.log('[Scout Report] Playoffs Round 1 detected');
        } else {
          console.log('[Scout Report] Regular season game');
        }

        if (neutralSite === 'yes') {
          game.isNeutralSite = true;
        }

        if (venue && venue.toLowerCase() !== 'n/a') {
          game.venue = venue.split(',')[0].trim();
          console.log(`[Scout Report] Venue: ${game.venue}`);
        }
      } else {
        console.log('[Scout Report] Regular season game (no structured context block)');
      }

      console.log('[Scout Report] NHL game context retrieved via Gemini Grounding');
    }
  } catch (e) {
    console.warn('[Scout Report] NHL game context fetch failed:', e.message);
  }

  // =========================================================================
  // Step 3: Fetch NHL key players + roster depth + current state in parallel
  // =========================================================================
  let nhlKeyPlayers = null;
  let nhlRosterDepth = null;

  const nhlSeasonYear = nhlSeason();

  // Fetch in parallel: RotoWire lineups + BDL roster depth + current state (news/headlines)
  const [keyPlayersResult, rosterDepthResult, nhlCurrentState] = await Promise.all([
    fetchNhlKeyPlayers(homeTeam, awayTeam, sportKey),
    ballDontLieService.getNhlRosterDepth(homeTeam, awayTeam, nhlSeasonYear),
    fetchCurrentState(homeTeam, awayTeam, sport).catch(e => {
      console.warn('[Scout Report] NHL current state error (non-fatal):', e.message);
      return null;
    })
  ]);
  nhlKeyPlayers = keyPlayersResult;
  nhlRosterDepth = rosterDepthResult;

  // Append game context & news to injury narrative (same pattern as NBA)
  if (nhlCurrentState?.groundedRaw && injuries) {
    const existingNarrative = injuries.narrativeContext || '';
    injuries.narrativeContext = existingNarrative
      ? `${existingNarrative}\n\n--- TODAY'S GAME CONTEXT & NEWS ---\n${nhlCurrentState.groundedRaw}`
      : nhlCurrentState.groundedRaw;
    console.log(`[Scout Report] NHL current state added to narrative (${nhlCurrentState.groundedRaw.length} chars)`);
  }

  // =========================================================================
  // Step 3B: Filter STALE injured players from key players list
  // Uses duration labels (set during injury enrichment) — only FRESH stays.
  // SHORT-TERM, LONG-TERM, SEASON-LONG are already reflected in team stats.
  // =========================================================================
  if (nhlKeyPlayers && injuries) {
    const allInjured = [...(injuries.home || []), ...(injuries.away || [])];
    const staleOutNames = allInjured
      .filter(inj => {
        const s = (inj.status || '').toLowerCase();
        const isOut = s === 'out' || s.includes('out for season') || s === 'ir' || s === 'ltir' || s === 'ofs';
        const duration = (inj.duration || '').toUpperCase();
        return isOut && duration && duration !== 'FRESH';
      })
      .map(inj => {
        const name = typeof inj.player === 'string' ? inj.player :
          `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
        return name.toLowerCase();
      })
      .filter(n => n);

    if (staleOutNames.length > 0) {
      const filterStaleFromArray = (players) => {
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
      // NHL has nested arrays: forwards, defensemen, goalies
      if (nhlKeyPlayers.home) {
        nhlKeyPlayers.home.forwards = filterStaleFromArray(nhlKeyPlayers.home.forwards);
        nhlKeyPlayers.home.defensemen = filterStaleFromArray(nhlKeyPlayers.home.defensemen);
        nhlKeyPlayers.home.goalies = filterStaleFromArray(nhlKeyPlayers.home.goalies);
      }
      if (nhlKeyPlayers.away) {
        nhlKeyPlayers.away.forwards = filterStaleFromArray(nhlKeyPlayers.away.forwards);
        nhlKeyPlayers.away.defensemen = filterStaleFromArray(nhlKeyPlayers.away.defensemen);
        nhlKeyPlayers.away.goalies = filterStaleFromArray(nhlKeyPlayers.away.goalies);
      }
    }
  }

  // =========================================================================
  // Step 4: Fetch H2H data + box scores for Recent Form
  // =========================================================================
  let h2hData = null;
  let recentFormBoxScores = {};
  try {
    const [h2hResult, boxScores] = await Promise.all([
      fetchH2HData(homeTeam, awayTeam, sportKey, recentHome, recentAway),
      fetchNhlBoxScoresForGames([...(recentHome || []).slice(0, 3), ...(recentAway || []).slice(0, 3)])
    ]);
    h2hData = h2hResult;
    recentFormBoxScores = boxScores;
    console.log(`[Scout Report] H2H Data: ${h2hData?.found ? `${h2hData.gamesFound} game(s) found` : 'No games found'}`);
    console.log(`[Scout Report] NHL box scores fetched for ${Object.keys(recentFormBoxScores).length} game(s)`);
  } catch (e) {
    console.log(`[Scout Report] H2H/box score fetch failed: ${e.message}`);
  }

  // =========================================================================
  // Step 5: Generate game significance
  // =========================================================================
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

  // =========================================================================
  // Step 6: Format injuries for storage
  // =========================================================================
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

  // =========================================================================
  // Step 7: Narrative scrubbing — remove "ghost" players
  // Uses nhlRosterDepth and nhlKeyPlayers only
  // =========================================================================
  if (injuries?.narrativeContext) {
    const allowedNames = new Set();

    // 1. Add names from BDL roster depth (primary source of truth for active players)
    const roster = nhlRosterDepth;

    // Helper to add names from different roster/keyPlayer formats
    const addNamesFromSource = (teamData) => {
      if (!teamData) return;
      if (Array.isArray(teamData)) {
        teamData.forEach(p => { if (p.name) allowedNames.add(p.name.trim()); });
      } else {
        // Handle NHL-style object structures
        // Roster depth: { skaters: [], goalies: [] }
        // Key players: { forwards: [], defensemen: [], goalies: [] }
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

        // Also check if the object itself has name/player properties
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

    // 2. Add names from NHL key players
    if (nhlKeyPlayers) {
      addNamesFromSource(nhlKeyPlayers.home);
      addNamesFromSource(nhlKeyPlayers.away);
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

    // Use BDL season stats (games played) to detect players who never played this season
    const rosterWithGp = nhlRosterDepth;
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

    // Narrative scrub removed — was calling Flash per game, flagged non-names as unknown players
  }

  // =========================================================================
  // Step 7B: Detect returning players (uses L5 playersByGame data)
  // =========================================================================
  const returningPlayersSection = nhlRosterDepth
    ? detectReturningPlayers(nhlRosterDepth, injuries, recentHome, recentAway, homeTeam, awayTeam)
    : '';

  // =========================================================================
  // Step 8: Assemble the NHL scout report
  // =========================================================================
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
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
${game.gameSignificance}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

`;
  }

  // Generate injury report
  const injuryReportText = formatInjuryReport(homeTeam, awayTeam, injuries, sportKey, null);

  // Debug: Log the injury report Gary will see
  if (injuryReportText && injuryReportText.length > 50) {
    console.log(`[Scout Report] Injury report preview (${injuryReportText.length} chars):`);
    console.log(injuryReportText.substring(0, 3000));
    if (injuryReportText.length > 3000) console.log('...[log truncated, full report sent to Gary]');
  }

  // Merge MoneyPuck + NHL API advanced stats into profiles for Tale of Tape
  const homeProfileForTape = {
    ...homeProfile,
    seasonStats: { ...(homeProfile?.seasonStats || {}), moneyPuck: homeMoneyPuck, nhlApi: homeNhlApi }
  };
  const awayProfileForTape = {
    ...awayProfile,
    seasonStats: { ...(awayProfile?.seasonStats || {}), moneyPuck: awayMoneyPuck, nhlApi: awayNhlApi }
  };

  // Build verified Tale of Tape ONCE and reuse in report text + return object
  const verifiedTaleOfTape = buildVerifiedTaleOfTape(homeTeam, awayTeam, homeProfileForTape, awayProfileForTape, sportKey, injuries, recentHome, recentAway);

  const report = `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
MATCHUP: ${matchupLabel}
Sport: ${sportKey} | ${game.commence_time ? formatGameTime(game.commence_time) : 'Time TBD'}
${game.venue ? `Venue: ${venueLabel}` : ''}${tournamentLabel ? `\n${tournamentLabel}` : ''}
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
${gameContextSection}${standingsSnapshot || ''}
INJURY REPORT
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
${injuryReportText}
${formatStartingLineups(homeTeam, awayTeam, injuries.lineups)}
${returningPlayersSection}
${narrativeContext ? `
CURRENT STATE & CONTEXT
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
Recent news, storylines, and context for both teams.

${narrativeContext}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
` : ''}
REST & SCHEDULE SITUATION
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
${formatRestSituation(homeTeam, awayTeam, calculateRestSituation(recentHome, game.commence_time, homeTeam), calculateRestSituation(recentAway, game.commence_time, awayTeam))}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

${nhlKeyPlayers ? formatNhlKeyPlayers(homeTeam, awayTeam, nhlKeyPlayers) : ''}${nhlRosterDepth ? formatNhlRosterDepth(homeTeam, awayTeam, nhlRosterDepth, injuries) : ''}

RECENT FORM (Last 3 Games)
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
${formatNhlRecentFormWithBoxScores(homeTeam, recentHome, recentFormBoxScores, 3)}
${formatNhlRecentFormWithBoxScores(awayTeam, recentAway, recentFormBoxScores, 3)}
HEAD-TO-HEAD HISTORY (${seasonLabel} SEASON)
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
${formatH2HSection(h2hData, homeTeam, awayTeam)}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
BETTING CONTEXT
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
${formatOdds(game, sportKey)}
`.trim();

  // Return both the report text, structured injuries data, and venue/game context
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
    // CFP-specific fields (not applicable for NHL)
    cfpRound: null,
    homeSeed: null,
    awaySeed: null,
    // Conference data (not applicable for NHL)
    homeConference: null,
    awayConference: null
  };
}
