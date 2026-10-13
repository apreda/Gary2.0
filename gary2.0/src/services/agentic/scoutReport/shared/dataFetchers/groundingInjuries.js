/** Scout-report data: Injuries read from grounded search (the non-API sports). (split from dataFetchers.js, Oct 13 2026) */
import { ballDontLieService } from '../../../../ballDontLieService.js';
import { fetchNbaInjuriesForGame } from '../../../../nbaInjuryReportService.js';
import { sportToBdlKey } from '../utilities.js';
import { groundedWebSearch } from '../grounding.js';
import { fetchNbaStartingLineups } from './injuries.js';

export async function fetchGroundingInjuries(homeTeam, awayTeam, sport) {
  try {
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Sport-specific queries for grounded search
    let query;
    if (sport === 'NHL' || sport === 'icehockey_nhl') {
      // NHL-specific: Search rotowire.com/hockey/nhl-lineups.php directly
      // This page ALWAYS shows TODAY's lineups and injuries by default
      console.log(`[Scout Report] Using grounded search for injury data: ${homeTeam} vs ${awayTeam}`);

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

      // Run goalie queries via Grounding (lineup data) AND BDL injuries in parallel
      // BDL provides structured injury data with team info; Grounding provides goalie/lineup context
      const bdlSportKey = sportToBdlKey(sport);
      const bdlTeams = await ballDontLieService.getTeams(bdlSportKey);
      const homeTeamObj = bdlTeams?.find(t =>
        (t.full_name || '').toLowerCase().includes(homeTeam.toLowerCase()) ||
        (t.name || '').toLowerCase().includes(homeTeam.toLowerCase()) ||
        homeTeam.toLowerCase().includes((t.name || '').toLowerCase())
      );
      const awayTeamObj = bdlTeams?.find(t =>
        (t.full_name || '').toLowerCase().includes(awayTeam.toLowerCase()) ||
        (t.name || '').toLowerCase().includes(awayTeam.toLowerCase()) ||
        awayTeam.toLowerCase().includes((t.name || '').toLowerCase())
      );

      const teamIds = [homeTeamObj?.id, awayTeamObj?.id].filter(Boolean);
      if (!homeTeamObj) console.warn(`[Scout Report] ⚠️ NHL injury: Could not match home team "${homeTeam}" in BDL teams (${bdlTeams?.length || 0} teams available)`);
      if (!awayTeamObj) console.warn(`[Scout Report] ⚠️ NHL injury: Could not match away team "${awayTeam}" in BDL teams (${bdlTeams?.length || 0} teams available)`);
      if (teamIds.length < 2) console.warn(`[Scout Report] ⚠️ NHL injury: Only ${teamIds.length} team IDs resolved: [${teamIds.join(', ')}] — may fetch incomplete injury data`);

      const [awayGoalieResponse, homeGoalieResponse, bdlInjuries] = await Promise.all([
        groundedWebSearch(makeNhlGoalieQuery(awayTeam, homeTeam), { maxTokens: 500 }),
        groundedWebSearch(makeNhlGoalieQuery(homeTeam, awayTeam), { maxTokens: 500 }),
        ballDontLieService.getNhlPlayerInjuries(teamIds)
      ]);

      // Build goalie context for narrative (still from Grounding)
      const awayGoalieText = typeof awayGoalieResponse === 'string' ? awayGoalieResponse : (awayGoalieResponse?.data || '');
      const homeGoalieText = typeof homeGoalieResponse === 'string' ? homeGoalieResponse : (homeGoalieResponse?.data || '');
      const goalieRaw = `${awayGoalieText}\n\n${homeGoalieText}`.trim();

      // HARD FAIL: NHL picks require confirmed/expected starting goalies
      if (!goalieRaw || goalieRaw.length < 20) {
        throw new Error(`[HARD FAIL] NHL goalie data unavailable from RotoWire for ${awayTeam} @ ${homeTeam}. Cannot make an accurate NHL pick without knowing who is starting in net.`);
      }

      // Normalize BDL injury status to standard format
      const normalizeNhlStatus = (bdlStatus) => {
        const s = (bdlStatus || '').toUpperCase();
        if (s === 'IR-LT' || s === 'LTIR' || s === 'IR-NR') return 'Out';
        if (s === 'IR') return 'Out';
        if (s === 'DTD' || s === 'DAY-TO-DAY') return 'Questionable';
        if (s === 'OUT') return 'Out';
        return bdlStatus || 'Unknown';
      };

      // Convert BDL injuries to standard injury format and filter by team
      const homeInjuries = [];
      const awayInjuries = [];

      for (const inj of (bdlInjuries || [])) {
        const playerTeamId = inj.player?.teams?.[0]?.id || inj.player?.team?.id;
        if (!playerTeamId) continue;

        const injObj = {
          player: {
            first_name: inj.player?.first_name || '',
            last_name: inj.player?.last_name || '',
            position: inj.player?.position_code || inj.player?.position || '',
            id: inj.player?.id
          },
          status: normalizeNhlStatus(inj.status),
          statusRaw: inj.status, // Keep original BDL status (IR, IR-LT, DTD, OUT)
          durationContext: inj.injury_type || inj.comment || '',
          returnDate: inj.return_date || null,
          source: 'BDL',
          duration: 'UNKNOWN', // Will be resolved by box-score
          freshness: 'UNKNOWN'
        };

        if (playerTeamId === homeTeamObj?.id) {
          homeInjuries.push(injObj);
        } else if (playerTeamId === awayTeamObj?.id) {
          awayInjuries.push(injObj);
        }
      }

      console.log(`[Scout Report] BDL NHL injuries: ${homeInjuries.length} for ${homeTeam}, ${awayInjuries.length} for ${awayTeam}`);

      return {
        home: homeInjuries,
        away: awayInjuries,
        groundingRaw: goalieRaw, // Goalie lineup context from Grounding
        _homeTeamId: homeTeamObj?.id,
        _awayTeamId: awayTeamObj?.id
      };

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
      // NBA: the league's official injury report + RotoWire via Grounding for starting lineups.
      // Both are required for this pipeline.
      console.log(`[Scout Report] Fetching NBA injuries (official report) + starting lineups (RotoWire) for ${awayTeam} @ ${homeTeam}`);

      // Generate ISO date (YYYY-MM-DD) for the API — use EST, not UTC
      const isoDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

      // The league's official report is the ONLY injury source
      const apiInjuries = await fetchNbaInjuriesForGame(homeTeam, awayTeam, isoDate);

      if (apiInjuries) {
        console.log(`[Scout Report] NBA injuries from the official report: ${apiInjuries.away.length} ${awayTeam}, ${apiInjuries.home.length} ${homeTeam}`);

        const groundingRaw = apiInjuries.groundingRaw;

        const lineupResult = await fetchNbaStartingLineups(homeTeam, awayTeam);
        const lineups = lineupResult?.lineups || { home: [], away: [] };

        if (lineups.home.length < 5 || lineups.away.length < 5) {
          throw new Error(`NBA starting lineups incomplete (${awayTeam}: ${lineups.away.length}/5, ${homeTeam}: ${lineups.home.length}/5)`);
        }

        console.log(`[Scout Report] NBA lineups parsed: ${awayTeam} ${lineups.away.length}/5, ${homeTeam} ${lineups.home.length}/5`);
        console.log(`[Scout Report] NBA injury context (${groundingRaw.length} chars):\n${groundingRaw}`);

        return {
          home: apiInjuries.home,
          away: apiInjuries.away,
          groundingRaw,
          lineups,
          notSubmitted: apiInjuries.notSubmitted
        };
      }

      // API failed — process MUST fail (no Grounding fallback)
      throw new Error(`[Scout Report] CRITICAL: NBA Injuries API failed — cannot proceed without injury data. Gary would analyze the game without knowing who's playing.`);

    } else {
      // Non-NBA: BDL has injuries for all sports — no grounding fallback
      console.warn(`[Scout Report] ⚠️ ${sport} injury data should come from BDL API, not grounding. Returning empty.`);
      return { home: [], away: [], groundingRaw: null };
    }

    // This code is only reached if the NBA path somehow falls through (shouldn't happen)
    console.warn(`[Scout Report] Unexpected injury fetch path for ${sport}`);
    return { home: [], away: [], groundingRaw: null };

  } catch (error) {
    console.warn(`[Scout Report] Grounding injury check failed:`, error.message);
    return { home: [], away: [], groundingRaw: null };
  }
}

/**
 * Parse grounded search response to extract injury information
 * Returns: { home: [], away: [], filteredLongTerm: [] } - filteredLongTerm contains names of players
 * filtered out due to 14+ day absence (for narrative scrubbing)
 */
export function parseGroundingInjuries(content, homeTeam, awayTeam, sport = '') {
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
        return { duration: 'SHORT-TERM', isEdge: false, note: `Out since ~${outSinceStr} (~${Math.round(daysSinceOut / 7)} weeks)`, outSinceDate: outSinceStr, daysSinceOut };
      } else if (daysSinceOut >= 7) {
        return { duration: 'SHORT-TERM', isEdge: false, note: `Out since ~${outSinceStr} (~${daysSinceOut} days)`, outSinceDate: outSinceStr, daysSinceOut };
      } else {
        return { duration: 'FRESH', isEdge: true, note: `Out since ~${outSinceStr} (${daysSinceOut} days)`, outSinceDate: outSinceStr, daysSinceOut };
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
      return { duration: 'SHORT-TERM', isEdge: false, note: '', outSinceDate: null, daysSinceOut: null };
    }
    if (t.includes('recent') || t.includes('last week') || t.includes('this week') ||
        t.includes('just') || t.includes('new') || t.includes('since week 14') ||
        t.includes('since week 15') || t.includes('since week 16') ||
        t.includes('day-to-day') || t.includes('game-time')) {
      return { duration: 'FRESH', isEdge: true, note: '', outSinceDate: null, daysSinceOut: null };
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
      } else if (durationInfo.duration === 'SHORT-TERM') {
        durationContext = `OUT${durationInfo.daysSinceOut ? ` (${durationInfo.daysSinceOut}d)` : ''}`;
      } else if (durationInfo.duration === 'FRESH') {
        durationContext = `FRESH${durationInfo.daysSinceOut ? ` (${durationInfo.daysSinceOut}d)` : ''}`;
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
        source: 'grounded_search'
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
          duration: daysSinceOut > 45 ? 'SEASON-LONG' : daysSinceOut > 21 ? 'SHORT-TERM' : daysSinceOut > 3 ? 'EXTENDED' : 'FRESH',
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
          source: 'grounded_search'
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
          source: 'grounded_search'
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

// ============================================================================
// EXTRACT TEAM SECTION
// ============================================================================

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
