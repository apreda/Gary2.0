/** Scout-report data: The injury fetch for every sport and NBA starting lineups. (split from dataFetchers.js, Oct 13 2026) */
import { getNcaafGameContext, formatNcaafGameContext } from '../../../../ncaafGameContext.js';
import { ballDontLieService } from '../../../../ballDontLieService.js';
import { sportToBdlKey, findTeam } from '../utilities.js';
import { groundedWebSearch } from '../grounding.js';
import { fetchGroundingInjuries, parseGroundingInjuries } from './groundingInjuries.js';

// ============================================================================
// INJURY FUNCTIONS
// ============================================================================

/**
 * Fetch injuries for both teams
 * SOURCE OF TRUTH varies by sport:
 * - NFL/NCAAF: BDL is PRIMARY (reliable weekly practice reports)
 * - NBA: the league's official injury report is PRIMARY (structured injury status, no Grounding)
 * - NHL/NCAAB: Rotowire via grounded search is PRIMARY
 */
export async function fetchInjuries(homeTeam, awayTeam, sport, gameDate = null, gameIdentity = null) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (bdlSport === 'americanfootball_ncaaf') {
      const teams = await ballDontLieService.getTeams(bdlSport);
      const game = { id: gameIdentity?.bdl_game_id ?? gameIdentity?.game_id ?? gameIdentity?.id,
        home_team: findTeam(teams, homeTeam), away_team: findTeam(teams, awayTeam) };
      const parsedDate = gameDate ? new Date(gameDate) : new Date();
      const date = /^\d{4}-\d{2}-\d{2}$/.test(gameDate || '') ? gameDate
        : parsedDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const context = await getNcaafGameContext({ game, date, bdl: ballDontLieService });
      return { home: context.sides?.home?.injuries || [], away: context.sides?.away?.injuries || [],
        lineups: { home: [], away: [] }, sourceOk: !context.unavailable,
        narrativeContext: formatNcaafGameContext(context), collegeContext: context, unavailableReason: context.reason };
    }
    const isFootball = sport === 'NFL' || sport === 'NCAAF' ||
                       bdlSport === 'americanfootball_nfl' || bdlSport === 'americanfootball_ncaaf';

    // =============================================================================
    // NFL/NCAAF: Use BDL as PRIMARY source for injury data
    // BDL has official practice report data (Questionable/Doubtful/Out status)
    // Apply 10-day freshness rule: only injuries reported within 10 days matter
    // =============================================================================
    if (isFootball && bdlSport) {
      console.log(`[Scout Report] NFL/NCAAF: Fetching BDL injuries (official practice reports)`);
      // A FAILED FETCH IS NOT AN EMPTY REPORT (founder gate order, Aug 24):
      // sourceOk carries whether the official feed actually answered, so the
      // builders can refuse to pick blind instead of reading an error as
      // "no injuries". Labels/freshness below are untouched (LOCKED).
      let injurySourceOk = false;

      // The NFL desk's CURRENT STATE & CONTEXT, a paragraph the search login wrote about each team's news, is gone
      // (founder GO, Oct 7 2026: "i want Gary reading them in full no summaries"): the week's reporting reaches the
      // desk as the articles themselves (nflArticlesAsWritten.js), complete. College returned above with its own context.
      const narrativeContext = null;

      // Fetch BDL injuries for both teams (NFL ONLY from here down)
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
            // Calendar days in ET (Sep 24 2026): whole 24-hour blocks read last
            // night's report as 0 days old and ran every age a day short.
            const etNoon = d => Date.parse(`${new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })}T12:00:00Z`);
            const daysSinceReport = injuryDate ? Math.round((etNoon(now) - etNoon(injuryDate)) / 86400000) : null;

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
                id: inj.player?.id ?? null,
                first_name: inj.player?.first_name,
                last_name: inj.player?.last_name,
                position: inj.player?.position || inj.player?.position_abbreviation
              },
              status: inj.status || 'Unknown',
              type: inj.comment?.split('(')[1]?.split(')')[0] || 'Unknown', // Extract injury type from comment
              daysSinceReport,
              reportDate: inj.date || null,
              reportDateStr: injuryDate ? injuryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null,
              freshness,
              // Verbatim comment, never cut (founder law) — the 150-char cut
              // fed the report formatter already-truncated text.
              comment: inj.comment || '',
              ...(inj.noteCurrent != null ? { noteCurrent: inj.noteCurrent } : {}),
              source: 'BDL'
            };

            // Log fresh injuries prominently
            if (freshness === 'FRESH') {
              console.log(`[Scout Report] FRESH NFL INJURY: ${inj.player?.first_name} ${inj.player?.last_name} (${inj.status}) - ${daysSinceReport} days ago`);
            }

            if (playerTeamId === homeTeamId) {
              homeInjuries.push(injuryObj);
            } else if (playerTeamId === awayTeamId) {
              awayInjuries.push(injuryObj);
            }
          }

          console.log(`[Scout Report] NFL injuries parsed: ${homeInjuries.length} for ${homeTeam}, ${awayInjuries.length} for ${awayTeam}`);
          injurySourceOk = true;
        }
      } catch (e) {
        console.warn(`[Scout Report] Failed to fetch BDL NFL injuries: ${e.message}`);
      }

      return {
        home: homeInjuries,
        away: awayInjuries,
        lineups: { home: [], away: [] },
        narrativeContext,
        sourceOk: injurySourceOk
      };
    }
    
    // =============================================================================
    // NBA: Injuries from the official report + starting lineups from RotoWire via Grounding
    // NCAAB: separate lineup flow in sport builder (RotoWire via Grounding)
    // NHL: injuries from BDL + goalie/lineup context from Grounding
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
    // NBA official-report groundingRaw can be ~130 chars for healthy teams — use 50 as threshold
    const groundingWorked = narrativeContext && narrativeContext.length > 50;

    // If grounding worked (got a response with content), 0 injuries is VALID
    // Teams CAN be healthy - both college and pro. Treating 0 injuries as a failure
    // causes unnecessary errors when teams are actually healthy.
    const zeroInjuriesIsValid = groundingWorked;

    // Use injury data as source of truth (NHL: BDL, others: Rotowire Grounding)
    // Duration enrichment handled by box-score resolution for NBA/NHL
    if (groundingHomeCount > 0 || groundingAwayCount > 0 || zeroInjuriesIsValid) {
      const isNhlSport = sport === 'NHL' || sport === 'icehockey_nhl';
      if (groundingHomeCount === 0 && groundingAwayCount === 0) {
        console.log(`[Scout Report] ${isNhlSport ? 'BDL' : 'Grounding'} worked - both teams appear HEALTHY (no injuries reported)`);
      } else {
        console.log(`[Scout Report] Using ${isNhlSport ? 'BDL' : 'Rotowire'} injuries (${groundingHomeCount} home, ${groundingAwayCount} away) as source of truth`);
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
          // The official report provides status + reason; box-score determines how long each player has been out
          console.log(`[Scout Report] NBA: Duration will be resolved via box-score in buildScoutReport()`);
        } else if (bdlSport === 'icehockey_nhl') {
          // NHL: Injuries now come from BDL (in fetchGroundingInjuries)
          // Duration will be resolved via box-score in buildScoutReport() (same as NBA)
          console.log(`[Scout Report] NHL: Duration will be resolved via box-score in buildScoutReport()`);
        }
      } catch (e) {
        console.log(`[Scout Report] BDL duration enrichment failed: ${e.message}`);
      }

      // NBA: Skip stale marking — box-score resolution in buildScoutReport() handles duration + freshness.
      // Also enforce required starting lineups (5 per team).
      if (bdlSport === 'basketball_nba') {
        const nbaLineups = groundingInjuries?.lineups || { home: [], away: [] };
        if (nbaLineups.home.length < 5 || nbaLineups.away.length < 5) {
          throw new Error(`[Scout Report] CRITICAL: NBA starting lineups missing or incomplete (${awayTeam}: ${nbaLineups.away.length}/5, ${homeTeam}: ${nbaLineups.home.length}/5).`);
        }

        return {
          home: enrichedHome,
          away: enrichedAway,
          staleInjuries: [], // Computed in buildScoutReport after box-score resolution
          lineups: nbaLineups,
          narrativeContext,
          _homeTeamId: groundingInjuries?._homeTeamId,
          _awayTeamId: groundingInjuries?._awayTeamId
        };
      }

      // NHL: Skip stale marking — box-score resolution in buildScoutReport() handles duration + freshness.
      if (bdlSport === 'icehockey_nhl') {
        return {
          home: enrichedHome,
          away: enrichedAway,
          staleInjuries: [], // Computed in buildScoutReport after box-score resolution
          lineups: { home: [], away: [] },
          narrativeContext,
          // Pass team IDs for NHL box-score duration resolution
          _homeTeamId: groundingInjuries?._homeTeamId,
          _awayTeamId: groundingInjuries?._awayTeamId
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
          console.warn(`[Scout Report] ${unknowns.length} injuries with UNKNOWN duration for ${teamName} marked as STALE (assume priced in): ${unknowns.join(', ')}`);
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
    // Rotowire (via grounded search) is the ONLY source of truth for:
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
    if (sport === 'NCAAF' || sport === 'americanfootball_ncaaf') {
      return { home: [], away: [], sourceOk: false, narrativeContext: null, unavailableReason: `College availability/QB collection failed: ${error.message}` };
    }
    // For NBA/NHL/NFL: ALL injury grounding errors are critical — process MUST fail
    // If Rotowire grounding fails for ANY reason (timeout, rate limit, API error),
    // we cannot proceed because Gary would analyze the game without knowing who's playing
    console.error(`[Scout Report] CRITICAL: Injury grounding failed for ${sport}: ${error.message}`);
    throw new Error(`[Scout Report] CRITICAL: Rotowire grounding failed to get injury/lineup data for ${sport}. Cannot proceed without Rotowire. Original error: ${error.message}`);
  }
}

// ============================================================================
// GROUNDING INJURIES & PARSING
// ============================================================================

function parseNbaStartingLineupsFromGrounding(content = '', homeTeam = '', awayTeam = '') {
  const lineups = { home: [], away: [] };
  const seen = { home: new Set(), away: new Set() };
  let section = null; // "home" | "away"

  const cleanName = (raw = '') => raw
    .replace(/^\s*[-*•\d.)]+\s*/, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const pushPlayer = (teamKey, position, nameRaw) => {
    if (!teamKey || !nameRaw) return;
    const name = cleanName(nameRaw);
    // A placeholder is not a starter (audit, Oct 13 2026: 'unverified' and 'TBD' counted toward the five).
    if (!name || /unknown|unverified|\bTBD\b|\bTBA\b|not (?:yet )?(?:announced|confirmed|available)/i.test(name)) return;
    const key = name.toLowerCase();
    if (seen[teamKey].has(key)) return;
    seen[teamKey].add(key);
    lineups[teamKey].push({ name, position: position || '' });
  };

  const lines = String(content).split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const lower = line.toLowerCase();

    if (lower.startsWith('away_starters')) {
      section = 'away';
      continue;
    }
    if (lower.startsWith('home_starters')) {
      section = 'home';
      continue;
    }
    if (homeTeam && lower.includes(homeTeam.toLowerCase()) && /starters|lineup|starting/.test(lower)) {
      section = 'home';
      continue;
    }
    if (awayTeam && lower.includes(awayTeam.toLowerCase()) && /starters|lineup|starting/.test(lower)) {
      section = 'away';
      continue;
    }
    if (!section) continue;

    const posMatch = line.match(/^(PG|SG|SF|PF|C)\s*[:|-]\s*(.+)$/i);
    if (posMatch) {
      pushPlayer(section, posMatch[1].toUpperCase(), posMatch[2]);
      continue;
    }

    const posBulletMatch = line.match(/^[-*•]?\s*(PG|SG|SF|PF|C)\s+(.+)$/i);
    if (posBulletMatch) {
      pushPlayer(section, posBulletMatch[1].toUpperCase(), posBulletMatch[2]);
      continue;
    }

    // Fallback: comma-separated names under an active section
    if (line.includes(',')) {
      const parts = line.split(',').map(p => cleanName(p)).filter(Boolean);
      for (const p of parts) pushPlayer(section, '', p);
      continue;
    }

    // Last-resort fallback: plain name line under active section
    if (/^[A-Za-z'.-]+(?:\s+[A-Za-z'.-]+)+$/.test(line)) {
      pushPlayer(section, '', line);
    }
  }

  if (lineups.home.length > 5) lineups.home = lineups.home.slice(0, 5);
  if (lineups.away.length > 5) lineups.away = lineups.away.slice(0, 5);
  return lineups;
}

export async function fetchNbaStartingLineups(homeTeam, awayTeam) {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const buildQuery = (attempt) => {
    if (attempt === 1) {
      return `What are the projected starting lineups for the NBA game ${awayTeam} at ${homeTeam} on ${today}?

Return EXACTLY in this format:

AWAY_STARTERS:
PG: [name]
SG: [name]
SF: [name]
PF: [name]
C: [name]

HOME_STARTERS:
PG: [name]
SG: [name]
SF: [name]
PF: [name]
C: [name]

Rules:
1. Use player names exactly.
2. If a starter is unknown, write UNKNOWN.
3. Do not include injuries, analysis, or extra text.`;
    }
    // Retry with different phrasing
    return `NBA starting lineups for ${today}: ${awayTeam} at ${homeTeam}.

List the projected starting five for BOTH teams. Format:

AWAY_STARTERS (${awayTeam}):
PG: [name]
SG: [name]
SF: [name]
PF: [name]
C: [name]

HOME_STARTERS (${homeTeam}):
PG: [name]
SG: [name]
SF: [name]
PF: [name]
C: [name]

Only names and positions. No extra text.`;
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    const query = buildQuery(attempt);
    const response = await groundedWebSearch(query, { maxTokens: 4000 });
    if (!response?.success || !response?.data) {
      if (attempt === 2) throw new Error('NBA lineup grounding returned no data after 2 attempts');
      console.warn(`[Scout Report] NBA lineup grounding attempt ${attempt} returned no data — retrying`);
      continue;
    }

    const lineups = parseNbaStartingLineupsFromGrounding(response.data, homeTeam, awayTeam);

    if (lineups.home.length >= 5 && lineups.away.length >= 5) {
      return { lineups, groundingRaw: response.data };
    }

    if (attempt === 1) {
      console.warn(`[Scout Report] NBA lineup attempt 1 incomplete (${awayTeam}: ${lineups.away.length}/5, ${homeTeam}: ${lineups.home.length}/5) — retrying with different query`);
      continue;
    }

    // Return whatever we got on attempt 2 — let the caller decide if it's enough
    return { lineups, groundingRaw: response.data };
  }

  throw new Error('NBA lineup grounding failed after 2 attempts');
}
