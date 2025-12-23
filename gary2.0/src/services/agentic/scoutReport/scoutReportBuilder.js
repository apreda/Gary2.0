/**
 * Scout Report Builder
 * 
 * Builds the initial context that helps Gary form a unique hypothesis.
 * This is the "Level 1" context that Gary always receives.
 */

import { ballDontLieService } from '../../ballDontLieService.js';
import { formatTokenMenu } from '../tools/toolDefinitions.js';
import { perplexityService } from '../../perplexityService.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';

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
 * Build a scout report for a game
 * This gives Gary enough context to think, not just react to odds.
 */
export async function buildScoutReport(game, sport) {
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  const sportKey = normalizeSport(sport);
  
  // Fetch basic data in parallel
  const [homeProfile, awayProfile, injuries, recentHome, recentAway] = await Promise.all([
    fetchTeamProfile(homeTeam, sportKey),
    fetchTeamProfile(awayTeam, sportKey),
    fetchInjuries(homeTeam, awayTeam, sportKey),
    fetchRecentGames(homeTeam, sportKey, 5),
    fetchRecentGames(awayTeam, sportKey, 5)
  ]);
  
  // For NBA, fetch game context from Perplexity (venue, tournament context, game significance)
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
        dateStr = new Date().toISOString().slice(0, 10);
      }
      console.log(`[Scout Report] Fetching NBA game context from Perplexity for ${dateStr}...`);
      
      // Use the recommended Perplexity pattern: pass structured data, ask specific questions
      // This query is dynamic and will correctly identify regular season, NBA Cup, playoffs, etc.
      const contextQuery = `Given this NBA game: ${awayTeam} vs ${homeTeam} on ${dateStr}.

Determine:
1. GAME TYPE: Is this a regular season game, NBA Cup (In-Season Tournament) game, playoff game, or other? If NBA Cup, specify the round (group stage, quarterfinal, semifinal, championship).
2. VENUE: What is the actual arena/venue name and city where this game is being played? (NBA Cup knockout rounds are at T-Mobile Arena in Las Vegas; regular season games are at the home team's arena)
3. GAME SIGNIFICANCE: If this is a special game (NBA Cup, playoff, rivalry, etc.), briefly explain its significance and what's at stake.
4. TOURNAMENT CONTEXT: If this is an NBA Cup game, what are each team's results/path in this year's tournament so far?

Be specific and factual. If it's just a regular season game, say so clearly.`;

      const contextResult = await perplexityService.search(contextQuery, { 
        temperature: 0.1, 
        maxTokens: 800 
      });
      
      if (contextResult?.success && contextResult?.data) {
        const responseText = contextResult.data;
        const responseLower = responseText.toLowerCase();

        // Check for explicit REGULAR SEASON indicators first (takes priority)
        const isRegularSeason = responseLower.includes('regular season game') || 
                               responseLower.includes('this is a regular season') ||
                               responseLower.includes('standard regular season') ||
                               (responseLower.includes('regular season') && !responseLower.includes('nba cup'));
        
        // Check for explicit NOT NBA Cup indicators
        const isNotNbaCup = responseLower.includes('not an nba cup') || 
                           responseLower.includes('not nba cup') ||
                           responseLower.includes('nba cup has ended') ||
                           responseLower.includes('nba cup is over') ||
                           responseLower.includes('after the nba cup');

        // Only detect NBA Cup if explicitly stated AND not negated
        const mentionsNbaCup = responseLower.includes('nba cup') || responseLower.includes('in-season tournament');
        const isNbaCup = mentionsNbaCup && !isNotNbaCup && !isRegularSeason &&
                        (responseLower.includes('this is an nba cup') || 
                         responseLower.includes('nba cup game') ||
                         responseLower.includes('nba cup quarterfinal') ||
                         responseLower.includes('nba cup semifinal') ||
                         responseLower.includes('nba cup championship'));
        
        const isPlayoffs = responseLower.includes('playoff game') && !responseLower.includes('not a playoff');
        const isChampionship = isNbaCup && (responseLower.includes('championship') || responseLower.includes('final'));
        const isSemifinal = isNbaCup && responseLower.includes('semifinal');
        const isQuarterfinal = isNbaCup && responseLower.includes('quarterfinal');

        // Parse venue dynamically
        const tMobileMatch = responseLower.includes('t-mobile arena') || responseLower.includes('t‑mobile arena');
        const lasVegasMatch = responseLower.includes('las vegas') && isNbaCup; // Only Vegas matters for NBA Cup

        // Set game properties based on parsed response
        if (isRegularSeason || isNotNbaCup) {
          console.log('[Scout Report] Regular season game (confirmed)');
          // Don't set any tournament context
        } else if (isNbaCup) {
          game.isNeutralSite = tMobileMatch || lasVegasMatch;

          if (isChampionship) {
            game.tournamentContext = 'NBA Cup Championship';
            console.log('[Scout Report] ✓ NBA Cup Championship detected');
          } else if (isSemifinal) {
            game.tournamentContext = 'NBA Cup Semifinal';
            console.log('[Scout Report] ✓ NBA Cup Semifinal detected');
          } else if (isQuarterfinal) {
            game.tournamentContext = 'NBA Cup Quarterfinal';
            console.log('[Scout Report] ✓ NBA Cup Quarterfinal detected');
          } else {
            game.tournamentContext = 'NBA Cup';
            console.log('[Scout Report] ✓ NBA Cup game detected');
          }
        } else if (isPlayoffs) {
          game.tournamentContext = 'NBA Playoffs';
          console.log('[Scout Report] ✓ Playoff game detected');
        } else {
          console.log('[Scout Report] Regular season game');
        }
        
        // Set venue if detected
        if (tMobileMatch && lasVegasMatch) {
          game.venue = 'T-Mobile Arena, Las Vegas';
          console.log('[Scout Report] ✓ Venue: T-Mobile Arena, Las Vegas');
        }
        
        // Store the full context for Gary to use
        game.gameSignificance = responseText;
        gameContextData = {
          rawContext: responseText,
          isNbaCup,
          isPlayoffs,
          isNeutralSite: game.isNeutralSite || false
        };
        
        console.log('[Scout Report] ✓ Game context retrieved from Perplexity');
      }
    } catch (e) {
      console.warn('[Scout Report] NBA game context fetch failed:', e.message);
    }
  }
  
  // For NFL, fetch game context from Perplexity (venue, divisional matchup, primetime, playoff implications)
  if (sportKey === 'NFL') {
    try {
      // Use US Eastern time to get correct date
      let dateStr;
      if (game.commence_time) {
        const gameDate = new Date(game.commence_time);
        dateStr = gameDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      } else {
        dateStr = new Date().toISOString().slice(0, 10);
      }
      console.log(`[Scout Report] Fetching NFL game context from Perplexity for ${dateStr}...`);
      
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
        console.log(`[Scout Report] ✓ Venue (from mapping): ${homeVenue}`);
      }
      
      const contextQuery = `Given this NFL game: ${awayTeam} @ ${homeTeam} on ${dateStr}.
IMPORTANT: ${homeTeam} is the HOME team playing at their home stadium.

Determine:
1. GAME TYPE: Is this Thursday Night Football (TNF), Sunday Night Football (SNF), Monday Night Football (MNF), Saturday game, or regular Sunday?
2. DIVISIONAL: Are these teams in the same NFL division? If yes, which division (NFC West, AFC North, etc.)?
3. PLAYOFF IMPLICATIONS: Current playoff standings for both teams? Fighting for playoff spot or division title?
4. RIVALRY/SIGNIFICANCE: Notable rivalry or historical significance?

Be specific and factual.`;

      const contextResult = await perplexityService.search(contextQuery, { 
        temperature: 0.1, 
        maxTokens: 800 
      });
      
      if (contextResult?.success && contextResult?.data) {
        const responseText = contextResult.data;
        const lower = responseText.toLowerCase();
        
        // Detect primetime games
        const isTNF = lower.includes('thursday night') || lower.includes('tnf');
        const isSNF = lower.includes('sunday night') || lower.includes('snf');
        const isMNF = lower.includes('monday night') || lower.includes('mnf');
        const isSaturday = lower.includes('saturday');
        
        // Detect divisional matchup
        const divisionalMatch = responseText.match(/(NFC|AFC)\s+(North|South|East|West)/i);
        const isDivisional = lower.includes('same division') || lower.includes('divisional') || divisionalMatch;
        
        // Note: Venue is set from our reliable stadium mapping above, not from Perplexity
        // This prevents hallucination errors like confusing home/away stadiums
        
        // Set tournament context based on game type
        if (isDivisional) {
          const division = divisionalMatch ? divisionalMatch[0] : 'Divisional';
          game.tournamentContext = `${division} Matchup`;
          console.log(`[Scout Report] ✓ Divisional matchup: ${division}`);
        }
        
        // Add primetime designation
        if (isTNF) {
          game.tournamentContext = game.tournamentContext ? `${game.tournamentContext} • TNF` : 'Thursday Night Football';
          console.log('[Scout Report] ✓ Thursday Night Football');
        } else if (isSNF) {
          game.tournamentContext = game.tournamentContext ? `${game.tournamentContext} • SNF` : 'Sunday Night Football';
          console.log('[Scout Report] ✓ Sunday Night Football');
        } else if (isMNF) {
          game.tournamentContext = game.tournamentContext ? `${game.tournamentContext} • MNF` : 'Monday Night Football';
          console.log('[Scout Report] ✓ Monday Night Football');
        } else if (isSaturday) {
          game.tournamentContext = game.tournamentContext ? `${game.tournamentContext} • Saturday` : 'Saturday Football';
          console.log('[Scout Report] ✓ Saturday game');
        }
        
        // Store full context as game significance
        game.gameSignificance = responseText;
        console.log('[Scout Report] ✓ NFL game context retrieved from Perplexity');
      }
    } catch (e) {
      console.warn('[Scout Report] NFL game context fetch failed:', e.message);
    }
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
  if (sportKey === 'NBA') {
    nbaKeyPlayers = await fetchNbaKeyPlayers(homeTeam, awayTeam, sportKey);
  }
  
  // For NHL, fetch key players (roster + stats) to prevent hallucinations
  let nhlKeyPlayers = null;
  if (sportKey === 'NHL') {
    nhlKeyPlayers = await fetchNhlKeyPlayers(homeTeam, awayTeam, sportKey);
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
  
  // For EPL, fetch key players (roster + stats) to prevent hallucinations
  // CRITICAL: EPL has January transfer window - prevents referencing transferred players
  let eplKeyPlayers = null;
  if (sportKey === 'EPL') {
    eplKeyPlayers = await fetchEplKeyPlayers(homeTeam, awayTeam, sportKey);
  }
  
  // For NCAAF, fetch conference tier context
  let conferenceTierSection = '';
  if (sportKey === 'NCAAF') {
    conferenceTierSection = await formatConferenceTierSection(homeTeam, awayTeam, sportKey);
  }
  
  // For NCAAF, fetch bowl game context if applicable (December-January games are likely bowls)
  let bowlGameContext = '';
  if (sportKey === 'NCAAF') {
    bowlGameContext = await fetchBowlGameContext(homeTeam, awayTeam, game);
  }
  
  // For NCAAB, fetch NET rankings and Quad records (critical for tournament context)
  let ncaabTournamentContext = '';
  if (sportKey === 'NCAAB') {
    ncaabTournamentContext = await fetchNcaabTournamentContext(homeTeam, awayTeam);
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
  
  // Extract narrative context from Gemini Grounding (valuable even if injury parsing returned 0)
  const narrativeContext = injuries?.narrativeContext || null;
  
  // Build the scout report
  const matchupLabel = game.isNeutralSite ? `${awayTeam} vs ${homeTeam}` : `${awayTeam} @ ${homeTeam}`;
  const venueLabel = game.venue || (game.isNeutralSite ? 'Neutral Site' : `${homeTeam} Home`);
  const tournamentLabel = game.tournamentContext ? `🏆 ${game.tournamentContext}` : '';
  
  // Build game context section if we have special context (NBA Cup, playoffs, etc.)
  let gameContextSection = '';
  if (game.gameSignificance && game.tournamentContext) {
    gameContextSection = `
🎯 GAME CONTEXT & SIGNIFICANCE (READ THIS - IMPORTANT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${game.gameSignificance}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ NOTE: This is NOT a regular season game. Factor in the tournament context,
neutral site, and what's at stake when making your analysis.

`;
  }
  
  const report = `
══════════════════════════════════════════════════════════════════════
MATCHUP: ${matchupLabel}
Sport: ${sportKey} | ${game.commence_time ? formatGameTime(game.commence_time) : 'Time TBD'}
${game.venue ? `Venue: ${venueLabel}` : ''}${tournamentLabel ? `\n${tournamentLabel}` : ''}
══════════════════════════════════════════════════════════════════════
${gameContextSection}${bowlGameContext}
⚠️⚠️⚠️ INJURY REPORT (READ THIS FIRST - CRITICAL) ⚠️⚠️⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatInjuryReport(homeTeam, awayTeam, injuries)}

🚨 INJURY RULES (CRITICAL FOR ANALYSIS):
1. Do NOT mention any player listed as OUT/DOUBTFUL/IR as if they are playing.
2. RECENT injuries (marked ⚡) = REAL EDGE to exploit - team still adjusting
3. SEASON-LONG injuries = NOT AN ANGLE! Team stats already reflect their absence.
   Example: If Aiyuk has been out all season, SF's stats ARE their baseline without him.
4. QB on IR = Past records are IRRELEVANT if the QB changed mid-season.
   Example: If the Colts have a 6-1 home record but that was with Daniel Jones,
   and now Philip Rivers is starting - that 6-1 record means NOTHING.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${narrativeContext ? `
🔍 LIVE CONTEXT FROM GOOGLE SEARCH (Gemini Grounding)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${narrativeContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 NOTE: This is live context from real-time Google searches about this matchup.
Use this to inform your analysis about player significance, narratives, and trends
that might not be captured by raw statistics alone.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}
🏃 REST & SCHEDULE SPOT (CRITICAL FOR BETTING)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatRestSituation(homeTeam, awayTeam, calculateRestSituation(recentHome, game.commence_time), calculateRestSituation(recentAway, game.commence_time))}

⚠️ SPOT RULE: Back-to-backs and heavy schedules (3 games in 4 days) are 
MAJOR factors. Teams on rest disadvantage often underperform, especially on the road.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${nbaKeyPlayers ? formatNbaKeyPlayers(homeTeam, awayTeam, nbaKeyPlayers) : ''}${ncaabKeyPlayers ? formatNcaabKeyPlayers(homeTeam, awayTeam, ncaabKeyPlayers) : ''}${nhlKeyPlayers ? formatNhlKeyPlayers(homeTeam, awayTeam, nhlKeyPlayers) : ''}${eplKeyPlayers ? formatEplKeyPlayers(homeTeam, awayTeam, eplKeyPlayers) : ''}${keyPlayers ? formatKeyPlayers(homeTeam, awayTeam, keyPlayers) : ''}${startingQBs ? formatStartingQBs(homeTeam, awayTeam, startingQBs) : ''}${ncaafKeyPlayers ? formatNcaafKeyPlayers(homeTeam, awayTeam, ncaafKeyPlayers) : ''}

TEAM IDENTITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatTeamIdentity(homeTeam, homeProfile, 'Home')}
${formatTeamIdentity(awayTeam, awayProfile, 'Away')}
${conferenceTierSection}${ncaabTournamentContext}
RECENT FORM (Last 5 Games)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatRecentForm(homeTeam, recentHome)}
${formatRecentForm(awayTeam, recentAway)}

KEY SITUATIONAL FACTORS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatSituationalFactors(game, injuries, sportKey)}

BETTING CONTEXT (For Reference Only - Do NOT base pick on these)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatOdds(game)}

⚠️ IMPORTANT: Odds are shown for value assessment AFTER you form your 
statistical conclusion. Your analysis must be independently justified 
by stats. Do NOT use "big spread" or "expensive ML" as reasoning.

══════════════════════════════════════════════════════════════════════
AVAILABLE STAT CATEGORIES (use fetch_stats tool to request):
${formatTokenMenu(sportKey)}
══════════════════════════════════════════════════════════════════════
`.trim();

  // Return both the report text, structured injuries data, and venue/game context
  return {
    text: report,
    injuries: injuriesForStorage,
    // Venue context for NBA Cup, neutral site games, CFP games, etc.
    venue: game.venue || null,
    isNeutralSite: game.isNeutralSite || false,
    tournamentContext: game.tournamentContext || null,
    // Game significance/context (full Perplexity response for NBA Cup, playoffs, CFP, etc.)
    gameSignificance: game.gameSignificance || null,
    // CFP-specific fields for NCAAF
    cfpRound: game.cfpRound || null,
    homeSeed: game.homeSeed || null,
    awaySeed: game.awaySeed || null
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
    'soccer_epl': 'EPL',
    'nba': 'NBA',
    'nfl': 'NFL',
    'ncaab': 'NCAAB',
    'ncaaf': 'NCAAF',
    'nhl': 'NHL',
    'epl': 'EPL'
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
    
    // Get season stats
    const seasonStats = await ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: team.id, season: 2025, postseason: false });
    const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: 2025 });
    const teamStanding = standings?.find(s => s.team?.id === team.id || s.team?.name === teamName);
    
    return {
      name: teamName,
      record: teamStanding?.overall_record || calculateRecord(seasonStats),
      homeRecord: teamStanding?.home_record || 'N/A',
      awayRecord: teamStanding?.road_record || 'N/A',
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
  } else if (sport === 'EPL') {
    // Soccer/EPL identity
    if (stats.goals) {
      const gpg = parseFloat(stats.goals) / (stats.wins + stats.losses + stats.draws || 1);
      if (gpg > 2.0) parts.push('high-scoring');
      else if (gpg < 1.0) parts.push('struggling in attack');
    }
    if (stats.goals_conceded) {
      const gaa = parseFloat(stats.goals_conceded) / (stats.wins + stats.losses + stats.draws || 1);
      if (gaa < 1.0) parts.push('solid defense');
      else if (gaa > 1.5) parts.push('leaky defense');
    }
    if (stats.clean_sheet) {
      const cs = parseFloat(stats.clean_sheet);
      if (cs > 5) parts.push('keeps clean sheets');
    }
    if (stats.total_pass && stats.accurate_pass) {
      const passAcc = (parseFloat(stats.accurate_pass) / parseFloat(stats.total_pass)) * 100;
      if (passAcc > 85) parts.push('possession-based');
      else if (passAcc < 75) parts.push('direct style');
    }
    if (stats.total_scoring_att) {
      const shots = parseFloat(stats.total_scoring_att);
      if (shots > 200) parts.push('creates chances');
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
    
    // Get recent games - fetch more than needed to ensure we get the most recent
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentGames = await ballDontLieService.getGames(bdlSport, {
      team_ids: [team.id],
      start_date: thirtyDaysAgo.toISOString().split('T')[0],
      end_date: today.toISOString().split('T')[0],
      per_page: 20 // Fetch more to ensure we get recent games
    });
    
    // Sort by date descending and return the requested count
    const sorted = (recentGames || [])
      .filter(g => g.date || g.datetime)
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
 * Returns object with days rest and back-to-back status
 */
function calculateRestSituation(recentGames, gameDate) {
  if (!recentGames || recentGames.length === 0) {
    console.log('[Rest Calc] No recent games available');
    return { daysRest: null, isBackToBack: false, lastGameDate: null };
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
      // BDL returns date as "YYYY-MM-DD" string (in UTC)
      const dateStr = g.date || (g.datetime ? g.datetime.split('T')[0] : null);
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
  
  // Check for 3 games in 4 days
  const fourDaysAgo = new Date(upcomingDate);
  fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
  const gamesInLast4Days = gamesWithDates.filter(g => g.gameDate >= fourDaysAgo).length;
  const isHeavySchedule = gamesInLast4Days >= 3;
  
  console.log(`[Rest Calc] Days rest: ${daysRest}, Back-to-back: ${isBackToBack}`);
  
  return {
    daysRest,
    isBackToBack,
    isHeavySchedule,
    gamesInLast4Days,
    lastGameDate: lastGame.gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  };
}

/**
 * Format rest situation for scout report
 */
function formatRestSituation(homeTeam, awayTeam, homeRest, awayRest) {
  const formatTeamRest = (team, rest) => {
    if (!rest || rest.daysRest === null) {
      return `${team}: Rest data unavailable`;
    }
    
    let status = '';
    if (rest.isBackToBack) {
      status = `⚠️ BACK-TO-BACK (played ${rest.lastGameDate})`;
    } else if (rest.isHeavySchedule) {
      status = `⚠️ Heavy schedule (${rest.gamesInLast4Days} games in 4 days)`;
    } else if (rest.daysRest >= 3) {
      status = `✅ Well-rested (${rest.daysRest} days)`;
    } else {
      status = `${rest.daysRest} day(s) rest`;
    }
    
    return `• ${team}: ${status}`;
  };
  
  return `${formatTeamRest(homeTeam, homeRest)}
${formatTeamRest(awayTeam, awayRest)}`;
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
    const homeScore = game.home_team_score || 0;
    const awayScore = game.visitor_team_score || 0;
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
    
    const teamScore = isHome ? game.home_team_score : game.visitor_team_score;
    const oppScore = isHome ? game.visitor_team_score : game.home_team_score;
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
 * Fetch injuries for both teams - uses BDL + Perplexity verification
 */
async function fetchInjuries(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    
    // Fetch from BDL
    let bdlInjuries = { home: [], away: [] };
    if (bdlSport) {
      const teams = await ballDontLieService.getTeams(bdlSport);
      const home = findTeam(teams, homeTeam);
      const away = findTeam(teams, awayTeam);
      
      console.log(`[Scout Report] Looking for injuries - Home: ${homeTeam} (ID: ${home?.id}), Away: ${awayTeam} (ID: ${away?.id})`);
      
      const teamIds = [];
      if (home) teamIds.push(home.id);
      if (away) teamIds.push(away.id);
      
      if (teamIds.length > 0) {
        const injuries = await ballDontLieService.getInjuriesGeneric(bdlSport, { team_ids: teamIds });
        console.log(`[Scout Report] BDL returned ${injuries?.length || 0} total injuries for teams ${teamIds.join(', ')}`);

        // Fix stale BDL statuses - check description for "questionable" when status says "Out"
        // Also check if return_date is today (means they're likely playing)
        // AND add duration context for betting edge detection
        const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const fixBdlStatus = (injury) => {
          const desc = (injury.description || '').toLowerCase();
          const returnDate = injury.return_date || '';
          const isReturnToday = returnDate.includes(today.split(' ')[1]) && returnDate.includes(today.split(' ')[0]);
          
          // If status is "Out" but description says "questionable" or "day-to-day", fix it
          if (injury.status === 'Out') {
            if (desc.includes('questionable') || desc.includes('game-time decision') || desc.includes('gtd')) {
              console.log(`[Scout Report] BDL status fix: ${injury.player?.first_name} ${injury.player?.last_name} - Out → Questionable (desc: "${desc.substring(0, 50)}...")`);
              injury.status = 'Questionable';
            } else if (desc.includes('day-to-day') || desc.includes('day to day')) {
              console.log(`[Scout Report] BDL status fix: ${injury.player?.first_name} ${injury.player?.last_name} - Out → Day-To-Day`);
              injury.status = 'Day-To-Day';
            } else if (isReturnToday) {
              console.log(`[Scout Report] BDL status fix: ${injury.player?.first_name} ${injury.player?.last_name} - Out → Questionable (return_date is today)`);
              injury.status = 'Questionable';
            }
          }
          
          // CRITICAL: Add duration context based on BDL description
          // This determines if injury is a betting edge or not
          if (desc.includes('indefinitely') || desc.includes('no timetable') || desc.includes('no return') ||
              desc.includes('season-ending') || desc.includes('out for the season') || desc.includes('out for season') ||
              desc.includes('won\'t return') || desc.includes('will not return') || desc.includes('surgery') ||
              desc.includes('since october') || desc.includes('since november') || desc.includes('all season') ||
              injury.status === 'Injured Reserve' || injury.status === 'IR') {
            injury.duration = 'SEASON-LONG';
            injury.isEdge = false;
            console.log(`[Scout Report] Duration tagged: ${injury.player?.first_name} ${injury.player?.last_name} - SEASON-LONG (not an edge)`);
          } else if (desc.includes('several weeks') || desc.includes('multiple weeks') || desc.includes('extended')) {
            injury.duration = 'MID-SEASON';
            injury.isEdge = false;
          } else if (desc.includes('day-to-day') || desc.includes('questionable') || desc.includes('this week') || 
                     desc.includes('game-time') || isReturnToday) {
            injury.duration = 'RECENT';
            injury.isEdge = true;
          }
          
          return injury;
        };

        // Filter by team and fix statuses
        bdlInjuries = {
          home: injuries?.filter(i =>
            i.player?.team?.id === home?.id ||
            i.player?.team_id === home?.id ||
            i.team_id === home?.id
          ).map(fixBdlStatus) || [],
          away: injuries?.filter(i =>
            i.player?.team?.id === away?.id ||
            i.player?.team_id === away?.id ||
            i.team_id === away?.id
          ).map(fixBdlStatus) || []
        };

        console.log(`[Scout Report] BDL injuries filtered - Home: ${bdlInjuries.home.length}, Away: ${bdlInjuries.away.length}`);
        if (bdlInjuries.home.length > 0) {
          console.log(`[Scout Report] Home injuries:`, bdlInjuries.home.map(i => `${i.player?.first_name} ${i.player?.last_name} (${i.status})`));
        }
        if (bdlInjuries.away.length > 0) {
          console.log(`[Scout Report] Away injuries:`, bdlInjuries.away.map(i => `${i.player?.first_name} ${i.player?.last_name} (${i.status})`));
        }
      }
    }
    
    // CRITICAL: Try Gemini Grounding first for live context (injuries, QB status, etc.)
    // Falls back to Perplexity if Grounding fails
    let liveContextInjuries = await fetchGroundedContext(homeTeam, awayTeam, sport);
    
    // ALWAYS preserve the raw grounding context for Gary's organic reading
    // This contains valuable narrative info even if injury parsing returned 0
    const narrativeContext = liveContextInjuries?.groundedRaw || null;
    
    // If Grounding failed to parse injuries, fall back to Perplexity for structured injuries
    if (!liveContextInjuries || (liveContextInjuries.home.length === 0 && liveContextInjuries.away.length === 0)) {
      console.log(`[Scout Report] ⚠️ Grounding returned no parsed injuries - falling back to Perplexity`);
      liveContextInjuries = await fetchPerplexityInjuries(homeTeam, awayTeam, sport);
    }
    
    // Merge BDL + live context injuries, AND include raw narrative context
    const mergedInjuries = mergeInjuries(bdlInjuries, liveContextInjuries);
    return {
      ...mergedInjuries,
      narrativeContext  // Gary gets this even if injury parsing failed
    };
    
  } catch (error) {
    console.warn(`[Scout Report] Error fetching injuries:`, error.message);
    return { home: [], away: [], narrativeContext: null };
  }
}

/**
 * Fetch live context using Gemini 3 with Google Search Grounding
 * This is PRIMARY - Perplexity is fallback only
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} sport - Sport key (NFL, NBA, NHL, etc.)
 * @param {string} gameDate - Game date string
 * @param {object} options - Optional configuration
 * @param {boolean} options.useFlash - Use Flash model instead of Pro (for props to avoid quota)
 */
async function fetchGroundedContext(homeTeam, awayTeam, sport, gameDate, options = {}) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[Scout Report] Gemini not available - falling back to Perplexity');
    return null;
  }
  
  try {
    const today = gameDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    
    // Use Flash for props (high volume, avoid quota issues) or Pro for regular picks (deep reasoning)
    const modelName = options.useFlash 
      ? (process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview')
      : (process.env.GEMINI_MODEL || 'gemini-3-pro-preview');
    
    // Configure model with Google Search Grounding
    const model = genAI.getGenerativeModel({
      model: modelName,
      tools: [{
        google_search: {}  // Gemini 3 uses simplified google_search tool
      }],
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    });
    
    // Sport-specific context queries
    let prompt;
    if (sport === 'NFL' || sport === 'americanfootball_nfl') {
      prompt = `For the NFL game ${awayTeam} @ ${homeTeam} on ${today}:

1. INJURIES: List ALL players OUT, QUESTIONABLE, DOUBTFUL, or on IR for each team
   - Include player name, position, injury type
   - Mark if RECENT (last 2 weeks) or SEASON-LONG

2. QB SITUATION: 
   - Who is the STARTING QB for ${homeTeam}?
   - Who is the STARTING QB for ${awayTeam}?
   - Are any QBs on IR? When did they get injured?
   - Did either team change QBs mid-season? Who was the previous starter?

3. WEATHER: Current forecast for game time at the stadium

4. DYNAMIC MATCHUP NARRATIVES & NEWS:
   - Any breaking team news, drama, or major storylines?
   - Key player significance: Are any stars or high-impact rookies (like 2025 draft picks) reaching milestones, returning from injury, or on a "hot streak" narrative?
   - Matchup specific context: Is this a "revenge spot", a rivalry, or a game with unique psychological factors?
   - Narrative momentum: Does either team have a storyline edge not captured by raw season stats?

Be factual. Cite sources when possible. Do NOT include any betting picks or predictions.`;
    } else if (sport === 'NBA' || sport === 'basketball_nba') {
      prompt = `For the NBA game ${awayTeam} @ ${homeTeam} on ${today}:

1. INJURIES: List ALL players OUT, QUESTIONABLE, DOUBTFUL, or SIDELINED for each team
   - Include player name and position (G, F, C)
   - Mark if RECENT injury (last 2 weeks) or SEASON-LONG (out most of season)
   - Note any INDEFINITE absences (no timetable)
   - For SEASON-LONG injuries, team stats already reflect their absence

2. DEPTH CHART / STARTING LINEUP:
   - Who is the CURRENT starting 5 for ${homeTeam}? (PG, SG, SF, PF, C)
   - Who is the CURRENT starting 5 for ${awayTeam}? (PG, SG, SF, PF, C)
   - Any rotation changes due to injuries?
   - Who are the key bench players seeing minutes?

3. KEY PLAYERS & NARRATIVE CONTEXT:
   - Who are the top scorers/stars CONFIRMED playing tonight?
   - ROOKIE UPDATES: Any high-impact 2025 rookies (e.g., Cooper Flagg) or young players whose significance is rising?
   - STORYLINES: Any recent performance milestones, "revenge games", or player momentum shifts?
   - LOAD MANAGEMENT: Any concerns about stars resting?
   - TRADES: Any players recently traded or released from either team?

4. DYNAMIC MATCHUP FACTORS:
   - Any back-to-back situations?
   - Team drama, coaching changes, or locker room energy?
   - Playoff race implications or "must-win" narratives?
   - Any game-specific context not reflected in season averages?

Be factual. Cite sources when possible. Do NOT include any betting picks or predictions.`;
    } else if (sport === 'NHL' || sport === 'icehockey_nhl') {
      prompt = `For the NHL game ${awayTeam} @ ${homeTeam} on ${today}:

1. INJURIES: List ALL players OUT, INJURED, or DAY-TO-DAY for each team
   - Include player name, position (C, W, D, G)
   - Mark if RECENT (last 2 weeks) or SEASON-LONG
   - Note any players on LTIR (Long-Term Injured Reserve)

2. GOALIE SITUATION - CRITICAL:
   - Who is the CONFIRMED starting goalie for ${homeTeam}?
   - Who is the CONFIRMED starting goalie for ${awayTeam}?
   - Include their current season save percentage if available
   - Is either team on a back-to-back? (affects goalie choice)

3. LINE COMBINATIONS & STORYLINES:
   - Who are the top-line forwards for each team?
   - Any recent line changes or call-ups from AHL?
   - NARRATIVES: Any "revenge spots" for traded players, milestones, or team momentum shifts?
   - ROOKIE IMPACT: Any young players making a sudden impact?

4. RECENT NEWS & DYNAMIC FACTORS:
   - Any trades, waiver claims, or roster moves?
   - Team drama, coaching hot seat, or playoff race?
   - Is this a rivalry or divisional game?
   - Narrative context not captured by BDL stats?

Be factual. Cite sources when possible. Do NOT include any betting picks or predictions.`;
    } else if (sport === 'NCAAB' || sport === 'basketball_ncaab') {
      prompt = `For the college basketball game ${awayTeam} @ ${homeTeam} on ${today}:

1. INJURIES: List ALL players OUT, QUESTIONABLE, or DAY-TO-DAY for each team
   - Include player name and position (G, F, C)
   - Mark if RECENT (last 2 weeks) or SEASON-LONG
   - College has fewer roster spots - each injury matters more

2. STARTING LINEUP:
   - Who are the expected starting 5 for ${homeTeam}?
   - Who are the expected starting 5 for ${awayTeam}?
   - Any freshmen or transfers making major impact?

3. KEY PLAYERS:
   - Who are the leading scorers/stars for each team?
   - Any players considering NBA draft (load management)?
   - Any recent transfers portal entries/commitments?

4. ADVANCED ANALYTICS (CRITICAL):
   - KenPom rankings and ratings for both teams (AdjEM, AdjO, AdjD, Tempo)
   - NET rankings for both teams
   - Strength of Schedule (SOS) rankings
   - Quad 1/2/3/4 records if available (for NCAA Tournament context)
   - Any notable efficiency metrics or statistical edges

5. GAME CONTEXT:
   - Is this a conference or non-conference game?
   - Tournament/conference tournament implications?
   - Any revenge angle from earlier this season?
   - Is this a rivalry game?
   - March Madness or conference tournament implications?

Be factual. Cite sources when possible. Do NOT include any betting picks or predictions.`;
    } else if (sport === 'NCAAF' || sport === 'americanfootball_ncaaf') {
      // Detect if this is bowl season (Dec 14 - Jan 15)
      // Use 'today' which is the parsed date string passed to this function
      const parsedDate = new Date(today);
      const month = parsedDate.getMonth ? parsedDate.getMonth() : 11; // Default to December
      const day = parsedDate.getDate ? parsedDate.getDate() : 20;
      const isBowlSeason = (month === 11 && day >= 14) || (month === 0 && day <= 15);
      
      if (isBowlSeason) {
        // BOWL GAME PROMPT - Emphasize player opt-outs which are CRITICAL
        prompt = `For the college football BOWL GAME ${awayTeam} @ ${homeTeam} on ${today}:

⚠️ CRITICAL: PLAYER OPT-OUTS FOR NFL DRAFT PREPARATION
This is a BOWL GAME. Many top players sit out to prepare for NFL Draft/Combine.
1. LIST ALL CONFIRMED PLAYER OPT-OUTS for both teams:
   - Include player name, position, and NFL draft projection (if known)
   - Star players who declared for NFL Draft and are NOT playing
   - Key playmakers who announced they are skipping the bowl
   - CRITICAL: These opt-outs DRASTICALLY change team capability

2. QB SITUATION - CRITICAL:
   - Is the STARTING QB playing or has he opted out?
   - Who is the STARTING QB for ${homeTeam}?
   - Who is the STARTING QB for ${awayTeam}?
   - Backup QB experience level if starter opted out?

3. INJURIES: List ALL players OUT, QUESTIONABLE, or DOUBTFUL for each team
   - Include player name, position
   - These are SEPARATE from opt-outs

4. KEY REMAINING PLAYERS:
   - Top RBs, WRs, and defensive playmakers who ARE playing
   - Transfer portal entries who may have reduced motivation

5. COACHING STATUS:
   - Has either coach accepted a new job? (MAJOR distraction)
   - Any coordinator departures?
   - Team motivation level for this game?

6. BOWL GAME CONTEXT:
   - Bowl name and location
   - Is this a neutral site or at one team's home stadium?
   - Historical significance of this bowl

7. WEATHER (if outdoor venue): Forecast for game time

REMINDER: Player opt-outs are the #1 factor in bowl game betting. A team without 3-4 key starters is a COMPLETELY different team. Be thorough.`;
      } else {
        // Regular season prompt
        prompt = `For the college football game ${awayTeam} @ ${homeTeam} on ${today}:

1. INJURIES: List ALL players OUT, QUESTIONABLE, or DOUBTFUL for each team
   - Include player name, position
   - Mark if RECENT (last 2 weeks) or SEASON-LONG

2. QB SITUATION - CRITICAL:
   - Who is the STARTING QB for ${homeTeam}?
   - Who is the STARTING QB for ${awayTeam}?
   - Any QB controversies or recent changes?
   - Backup QB experience level?

3. KEY PLAYER STATUS:
   - Top RBs, WRs, and defensive playmakers
   - Any NFL draft prospects sitting out?
   - Transfer portal impacts?

4. GAME CONTEXT:
   - Bowl game, conference championship, or CFP game?
   - Conference or non-conference matchup?
   - Rivalry significance?
   - Coaching changes or hot seats?
   - Is either team on upset alert?

5. WEATHER (if applicable): Forecast for game time

Be factual. Cite sources when possible. Do NOT include any betting picks or predictions.`;
      }
    } else if (sportKey === 'NHL') {
      prompt = `For the NHL game ${awayTeam} @ ${homeTeam} on ${today}:

1. STARTING GOALIES - CRITICAL:
   - Who is the CONFIRMED or PROJECTED starting goalie for each team?
   - What are their recent stats (SV%, GAA)?

2. INJURIES - List SEPARATELY for each team:
   
   ${awayTeam} Injuries:
   - List each player: "Player Name (POS) - Status - Injury details"
   - Mark if RECENT (last 2 weeks) or SEASON-LONG (LTIR)
   
   ${homeTeam} Injuries:
   - List each player: "Player Name (POS) - Status - Injury details"
   - Mark if RECENT (last 2 weeks) or SEASON-LONG (LTIR)

3. LINE COMBINATIONS:
   - Current top 6 forwards for each team
   - Any AHL call-ups or recent trades?

4. KEY STORYLINES: Playoff positioning, recent form, back-to-back fatigue, revenge games.

Be factual. Format injuries clearly with player names, positions, and status.`;
    } else if (sportKey === 'NBA') {
      prompt = `For the NBA game ${awayTeam} @ ${homeTeam} on ${today}:

1. STARTING LINEUP:
   - Who is the projected STARTING 5 for each team?
2. INJURIES: Who is OUT, QUESTIONABLE, or DOUBTFUL for each team?
   - Mark if RECENT (last 2 weeks) or SEASON-LONG (not an edge)
3. KEY PLAYER STATUS (Depth Chart):
   - Status of top 3 scorers for each team.
   - Any recent rotation changes or trades?
4. GAME CONTEXT: Revenge games, rest situation (B2B), or playoff implications.

Be factual. Do NOT include any betting picks or predictions.`;
    } else {
    }
    
    console.log(`[Scout Report] 🔍 Using Gemini Grounding for live context: ${awayTeam} @ ${homeTeam}`);
    const startTime = Date.now();
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const duration = Date.now() - startTime;
    console.log(`[Scout Report] ✅ Gemini Grounding response in ${duration}ms`);
    
    // Debug log: Show first 500 chars of raw response to verify content is being retrieved
    if (text) {
      const preview = text.substring(0, 500).replace(/\n/g, ' ');
      console.log(`[Scout Report] 📄 Grounding raw preview: ${preview}...`);
    }
    
    // Log grounding metadata if available
    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    if (groundingMetadata?.webSearchQueries?.length > 0) {
      console.log(`[Scout Report] 🔍 Grounded searches: "${groundingMetadata.webSearchQueries.join('", "')}"`);
    }
    
    // Parse the response to extract injury information
    const groundedInjuries = parseGroundedInjuries(text, homeTeam, awayTeam);
    
    // Create an enhanced object that includes the raw text for Gary's organic reading
    return {
      home: groundedInjuries.home,
      away: groundedInjuries.away,
      groundedRaw: text, // Gary gets the FULL text of the search results
      groundingUsed: !!groundingMetadata?.webSearchQueries?.length
    };
    
  } catch (error) {
    console.warn(`[Scout Report] Gemini Grounding failed: ${error.message}`);
    return null;
  }
}

/**
 * Parse Gemini Grounded response to extract injuries
 * Uses multiple flexible patterns to catch natural language descriptions
 */
function parseGroundedInjuries(content, homeTeam, awayTeam) {
  const injuries = { home: [], away: [] };
  const addedPlayers = new Set(); // Prevent duplicates
  
  if (!content) return injuries;
  
  // CRITICAL: Strip markdown formatting before parsing
  // Gemini often returns **bold** and *italic* which breaks regex patterns
  let cleanContent = content
    .replace(/\*\*/g, '')   // Remove bold markdown
    .replace(/\*/g, '')     // Remove italic markdown
    .replace(/#{1,6}\s*/g, '')  // Remove headers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');  // [text](url) -> text
  
  const homeTeamBase = homeTeam.toLowerCase();
  const homeMascot = homeTeam.split(' ').pop().toLowerCase();
  const awayTeamBase = awayTeam.toLowerCase();
  const awayMascot = awayTeam.split(' ').pop().toLowerCase();
  
  // Also create city-only versions for better matching
  // "Tampa Bay Lightning" -> "tampa bay", "St. Louis Blues" -> "st. louis"
  const homeCity = homeTeam.split(' ').slice(0, -1).join(' ').toLowerCase();
  const awayCity = awayTeam.split(' ').slice(0, -1).join(' ').toLowerCase();
  
  // Helper to add an injury if not duplicate
  const addInjury = (team, playerName, position, status, line) => {
    const key = `${team}-${playerName.toLowerCase()}`;
    if (addedPlayers.has(key)) return;
    
    // Prevent adding team names as players
    if (playerName.toLowerCase().includes(homeTeamBase) || 
        playerName.toLowerCase().includes(awayTeamBase) ||
        playerName.toLowerCase().includes(homeMascot) ||
        playerName.toLowerCase().includes(awayMascot)) {
      return;
    }
    
    // Skip if name is too short or looks like a position
    if (playerName.length < 4 || /^[A-Z]{1,3}$/.test(playerName)) return;
    
    // CRITICAL: Skip if name looks like duration/date text instead of a player name
    // This prevents "until Feb", "Reserve Dec", "at least Dec" from being stored as player names
    const lowerName = playerName.toLowerCase();
    const durationPatterns = [
      'until', 'reserve', 'at least', 'through', 'expected', 'return',
      'january', 'february', 'march', 'april', 'may', 'june', 'july', 
      'august', 'september', 'october', 'november', 'december',
      'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
      'week', 'weeks', 'month', 'day', 'days', 'indefinitely', 'tbd',
      ' and ', 'with ', 'note:', 'context:'
    ];
    if (durationPatterns.some(pattern => lowerName.includes(pattern))) {
      console.log(`[Scout Report] Parser: Skipping invalid player name (looks like duration): "${playerName}"`);
      return;
    }
    
    // Skip if name doesn't look like a real name (should have at least first + last name pattern)
    // Valid: "Victor Hedman", "Jordan Kyrou", "Zach Werenski"
    // Invalid: "until Feb", "Reserve Dec"
    if (!/^[A-Z][a-z]+(\s+[A-Z][a-z'-]+)+$/.test(playerName.trim())) {
      // Allow some flexibility for names with special chars like O'Brien, but reject obvious non-names
      if (!/[A-Z][a-z]+/.test(playerName)) {
        console.log(`[Scout Report] Parser: Skipping invalid player name (bad format): "${playerName}"`);
        return;
      }
    }
    
    addedPlayers.add(key);
    
    // Check for duration context
    const lowerLine = line.toLowerCase();
    let duration = 'UNKNOWN';
    if (lowerLine.includes('season-long') || lowerLine.includes('all season') || lowerLine.includes('since week 1') ||
        lowerLine.includes('indefinitely') || lowerLine.includes('no timetable') || lowerLine.includes('no return') ||
        lowerLine.includes('season-ending') || lowerLine.includes('out for season') || 
        lowerLine.includes('since october') || lowerLine.includes('since november') ||
        lowerLine.includes('sidelined') || lowerLine.includes('surgery') || lowerLine.includes('acl') ||
        lowerLine.includes('achilles') || lowerLine.includes('torn')) {
      duration = 'SEASON-LONG';
    } else if (lowerLine.includes('mid-season') || lowerLine.includes('several weeks') || 
               lowerLine.includes('extended') || lowerLine.includes('multiple weeks')) {
      duration = 'MID-SEASON';
    } else if (lowerLine.includes('recent') || lowerLine.includes('this week') || lowerLine.includes('last week') ||
               lowerLine.includes('day-to-day') || lowerLine.includes('questionable') || lowerLine.includes('game-time')) {
      duration = 'RECENT';
    }
    
    const nameParts = playerName.trim().split(' ');
    injuries[team].push({
      player: {
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(' '),
        position: position || ''
      },
      status: status.toLowerCase().includes('ir') || status.toLowerCase().includes('ltir') ? 'IR' : 
              status.toLowerCase().includes('out') ? 'Out' :
              status.toLowerCase().includes('doubtful') ? 'Doubtful' : 'Questionable',
      duration: duration,
      isEdge: duration === 'RECENT',
      source: 'gemini_grounding'
    });
  };
  
  // Multiple parsing patterns for flexibility
  const patterns = [
    // Pattern 1: "- Player Name (POS) - Status" or "Player Name (POS): Status"
    /(?:[-•*]\s*)?([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*(?:\(([A-Z0-9\/]+)\))?\s*[-–:]+\s*(OUT|Out|IR|LTIR|Doubtful|Questionable|injured reserve|Day-To-Day|DTD|questionable|out|doubtful)/i,
    // Pattern 2: "Player Name is out/questionable" (natural language)
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s+(?:is|was|remains|listed as|currently)\s+(out|questionable|doubtful|day-to-day|injured|sidelined)/i,
    // Pattern 3: "OUT: Player Name" or "Questionable: Player Name"
    /(OUT|Questionable|Doubtful|Day-To-Day|Injured)[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)/i,
    // Pattern 4: "Player Name - knee/ankle/etc - out"
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*[-–]\s*(?:knee|ankle|shoulder|back|hamstring|calf|foot|wrist|hand|hip|groin|quad|illness|personal|rest|concussion|thumb|finger|toe|neck|oblique|ribs|elbow|forearm|thigh|shin|achilles|acl|mcl)[^-]*[-–]\s*(out|questionable|doubtful|day-to-day)/i,
    // Pattern 5: "Player Name will not play" / "Player Name expected to miss"
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s+(?:will not play|won't play|expected to miss|ruled out|has been ruled out|will miss|is expected to sit)/i,
    // Pattern 6: Simpler "Player Name out" at end of sentence
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*(?:\([^)]+\))?\s*(?:is\s+)?(out|questionable|doubtful)\s*(?:\.|,|$)/i
  ];
  
  const lines = cleanContent.split('\n');
  let currentTeam = null;
  
  for (const line of lines) {
    const lower = line.toLowerCase();
    
    // Detect team context - look for team name, city, or mascot
    // Be more flexible with context detection for NHL teams like "St. Louis Blues"
    const isHomeTeam = lower.includes(homeTeamBase) || 
                       (homeMascot.length > 3 && lower.includes(homeMascot)) ||
                       (homeCity.length > 3 && lower.includes(homeCity));
    const isAwayTeam = lower.includes(awayTeamBase) || 
                       (awayMascot.length > 3 && lower.includes(awayMascot)) ||
                       (awayCity.length > 3 && lower.includes(awayCity));
    
    // Only switch team if we explicitly see a team header (to avoid false switches)
    if (isHomeTeam && !isAwayTeam) {
      currentTeam = 'home';
      console.log(`[Scout Report] Parser: Detected home team context (${homeTeam}) in: "${line.substring(0, 60)}..."`);
    } else if (isAwayTeam && !isHomeTeam) {
      currentTeam = 'away';
      console.log(`[Scout Report] Parser: Detected away team context (${awayTeam}) in: "${line.substring(0, 60)}..."`);
    }
    
    // Skip lines that are just headers or don't have player info
    if (line.trim().length < 5) continue;
    
    // Try each pattern
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && currentTeam) {
        // Different patterns capture in different orders
        let playerName, status, position = '';
        
        if (pattern === patterns[2]) {
          // Pattern 3: status comes first
          status = match[1];
          playerName = match[2];
        } else if (pattern === patterns[4]) {
          // Pattern 5: "will not play" style - status is implicit "Out"
          playerName = match[1];
          status = 'Out';
        } else {
          // Most patterns: player name first
          playerName = match[1];
          position = match[2] || '';
          status = match[3] || match[2] || 'Out';
        }
        
        if (playerName) {
          addInjury(currentTeam, playerName, position, status, line);
          break; // Only use first matching pattern per line
        }
      }
    }
  }
  
  console.log(`[Scout Report] Parsed grounded injuries: Home=${injuries.home.length}, Away=${injuries.away.length}`);
  return injuries;
}

/**
 * Fetch injuries from Perplexity as FALLBACK source (only if Grounding fails)
 */
async function fetchPerplexityInjuries(homeTeam, awayTeam, sport) {
  try {
    // First try the new Search API (more reliable, structured results)
    if (perplexityService?.searchInjuries) {
      console.log(`[Scout Report] Using Perplexity Search API for injury verification: ${homeTeam} vs ${awayTeam}`);
      const searchResult = await perplexityService.searchInjuries(homeTeam, awayTeam, sport);
      
      if (searchResult.home.length > 0 || searchResult.away.length > 0) {
        console.log(`[Scout Report] Perplexity Search API found injuries: ${searchResult.home.length} for ${homeTeam}, ${searchResult.away.length} for ${awayTeam}`);
        return searchResult;
      }
    }
    
    // Fallback to chat completions API if Search API didn't find anything
    if (!perplexityService?.queryPerplexity) {
      console.log('[Scout Report] Perplexity service not available for injury check');
      return { home: [], away: [], perplexityRaw: null };
    }
    
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Sport-specific queries for better results - prioritize RotoWire and other reliable sources
    let query;
    if (sport === 'NHL' || sport === 'icehockey_nhl') {
      query = `List ALL current injuries for the ${homeTeam} and ${awayTeam} NHL teams as of ${today}.

For each injured player, provide:
- Player full name and position (C, W, D, G)
- Status: OUT, DAY-TO-DAY, LTIR (Long-Term Injured Reserve), or IR
- Injury type
- Duration: RECENT (last 1-2 weeks) or SEASON-LONG (out most/all season or LTIR)

CRITICAL - GOALIE SITUATION (most important for hockey betting):
- Who is the CONFIRMED starting goalie for ${homeTeam} tonight?
- Who is the CONFIRMED starting goalie for ${awayTeam} tonight?
- Include their current season save percentage if available
- Is either team on a back-to-back? (affects goalie decision)
- Any goalie injuries or long-term absences?

LINE COMBINATIONS:
- Who are the top-line forwards (1st line) for each team?
- Any recent call-ups from AHL or line shuffles?

Format each injury as: "PLAYER NAME (POSITION) - STATUS - INJURY - DURATION"
Example: "Sidney Crosby (C) - OUT - lower body - RECENT"

${homeTeam} injuries:
${awayTeam} injuries:
${homeTeam} starting goalie:
${awayTeam} starting goalie:`;

    } else if (sport === 'NFL' || sport === 'americanfootball_nfl') {
      query = `List ALL current injuries for the ${homeTeam} and ${awayTeam} NFL teams as of ${today}.

For each injured player, provide:
- Player full name and position
- Status: OUT, DOUBTFUL, QUESTIONABLE, or IR
- Injury type
- Duration: RECENT (last 1-2 weeks), MID-SEASON (3-8 weeks ago), or SEASON-LONG (out most/all season)

CRITICAL - QB SITUATION:
- Who is the CURRENT starting QB for each team?
- Are any QBs on IR? If so, when did they get injured (which week)?
- If the starting QB changed mid-season, note when and who was the previous starter

Format each injury as: "PLAYER NAME (POSITION) - STATUS - INJURY - DURATION"
Example: "Brandon Aiyuk (WR) - IR - knee - SEASON-LONG"

${homeTeam} injuries:
${awayTeam} injuries:
${homeTeam} QB situation:
${awayTeam} QB situation:`;
    } else if (sport === 'NBA' || sport === 'basketball_nba') {
      query = `List ALL current injuries for the ${homeTeam} and ${awayTeam} NBA teams as of ${today}.

For each injured player, provide:
- Player full name and position (G, F, C)
- Status: OUT, DOUBTFUL, QUESTIONABLE, or SIDELINED
- Injury type
- Duration: RECENT (last 1-2 weeks), MID-SEASON (3-8 weeks), or SEASON-LONG (out most/all season)
- If a player is OUT INDEFINITELY with no timetable, mark as SEASON-LONG
- IMPORTANT: SEASON-LONG injuries = team stats already reflect their absence, NOT a betting edge

CRITICAL - DEPTH CHART:
- Who are the CURRENT STARTING 5 for ${homeTeam}? (PG, SG, SF, PF, C with player names)
- Who are the CURRENT STARTING 5 for ${awayTeam}? (PG, SG, SF, PF, C with player names)
- Who are the PRIMARY BENCH players getting minutes?
- Any rotation changes due to injuries?

ROSTER CHANGES:
- Any recent trades or player releases for either team?
- Any players who changed teams in the last month?

Format each injury as: "PLAYER NAME (POSITION) - STATUS - INJURY - DURATION"
Example: "Kyrie Irving (G) - OUT - knee - SEASON-LONG"

${homeTeam} injuries:
${awayTeam} injuries:
${homeTeam} starting 5: PG: ___, SG: ___, SF: ___, PF: ___, C: ___
${awayTeam} starting 5: PG: ___, SG: ___, SF: ___, PF: ___, C: ___
${homeTeam} key bench players:
${awayTeam} key bench players:`;
    } else if (sport === 'NCAAB' || sport === 'basketball_ncaab') {
      query = `List ALL current injuries for the ${homeTeam} and ${awayTeam} college basketball teams as of ${today}.

For each injured player, provide:
- Player full name and position (G, F, C)
- Status: OUT, DOUBTFUL, QUESTIONABLE, or DAY-TO-DAY
- Injury type
- Duration: RECENT (last 1-2 weeks) or SEASON-LONG
- NOTE: College rosters are smaller - each injury impacts more

CRITICAL - STARTING LINEUP:
- Who are the expected starting 5 for ${homeTeam}?
- Who are the expected starting 5 for ${awayTeam}?
- Any freshmen or transfers making significant impact?

KEY PLAYERS:
- Who are the leading scorers for each team?
- Any recent transfer portal entries/commitments?
- Any players sitting out for NBA draft preparation?

GAME CONTEXT:
- Is this a conference or non-conference game?
- March Madness / conference tournament implications?
- Any rivalry significance?

Format each injury as: "PLAYER NAME (POSITION) - STATUS - INJURY - DURATION"
Example: "Cooper Flagg (F) - QUESTIONABLE - ankle - RECENT"

${homeTeam} injuries:
${awayTeam} injuries:
${homeTeam} starting 5:
${awayTeam} starting 5:`;
    } else if (sport === 'NCAAF' || sport === 'americanfootball_ncaaf') {
      query = `List ALL current injuries for the ${homeTeam} and ${awayTeam} college football teams as of ${today}.

For each injured player, provide:
- Player full name and position
- Status: OUT, DOUBTFUL, QUESTIONABLE, or DAY-TO-DAY
- Injury type
- Duration: RECENT (last 1-2 weeks) or SEASON-LONG

CRITICAL - QB SITUATION:
- Who is the STARTING QB for ${homeTeam}?
- Who is the STARTING QB for ${awayTeam}?
- Any QB controversies or recent changes?
- Backup QB experience level?

KEY PLAYER STATUS:
- Top RBs, WRs, and defensive playmakers for each team
- Any NFL draft prospects sitting out?
- Any transfer portal impacts?

GAME CONTEXT:
- Is this a bowl game, conference championship, or CFP game?
- Conference or non-conference matchup?
- Any rivalry significance?
- Coaching changes or hot seats?

Format each injury as: "PLAYER NAME (POSITION) - STATUS - INJURY - DURATION"
Example: "Travis Hunter (WR/CB) - QUESTIONABLE - shoulder - RECENT"

${homeTeam} injuries:
${awayTeam} injuries:
${homeTeam} QB situation:
${awayTeam} QB situation:`;
    } else {
      // Default query for other sports - includes injury duration context
      query = `What are the current injuries and player availability for tonight's ${sport} game between ${awayTeam} and ${homeTeam}? Include all players who are OUT, DOUBTFUL, or QUESTIONABLE. Only include injuries confirmed as of ${today}. Be specific with player names, their status (Out/Doubtful/Questionable), and injury type. IMPORTANT: For each injury, note if this is a RECENT injury (last 1-2 weeks) or if the player has been out for an extended period (so team stats already reflect their absence).`;
    }
    
    console.log(`[Scout Report] Querying Perplexity Chat API for injury verification: ${homeTeam} vs ${awayTeam}`);
    
    const response = await perplexityService.queryPerplexity(query, { timeout: 20000 });
    
    if (!response?.content) {
      return { home: [], away: [], perplexityRaw: null };
    }
    
    // Parse the Perplexity response to extract injuries
    const parsed = parsePerplexityInjuries(response.content, homeTeam, awayTeam, sport);
    parsed.perplexityRaw = response.content; // Keep raw for display
    
    console.log(`[Scout Report] Perplexity injuries: ${parsed.home.length} for ${homeTeam}, ${parsed.away.length} for ${awayTeam}`);
    
    return parsed;
    
  } catch (error) {
    console.warn(`[Scout Report] Perplexity injury check failed:`, error.message);
    return { home: [], away: [], perplexityRaw: null };
  }
}

/**
 * Parse Perplexity response to extract injury information
 */
function parsePerplexityInjuries(content, homeTeam, awayTeam, sport = '') {
  const injuries = { home: [], away: [] };
  const foundPlayers = new Set(); // Prevent duplicates
  
  // Normalize status to standard format
  const normalizeStatus = (status) => {
    const s = status.toLowerCase().trim();
    if (s.includes('ltir') || s.includes('long-term') || s.includes('long term')) return 'LTIR';
    if (s === 'ir' || s.includes('injured reserve')) return 'IR';
    if (s.includes('out') || s.includes('ruled out')) return 'Out';
    if (s.includes('doubtful')) return 'Doubtful';
    if (s.includes('questionable') || s.includes('gtd') || s.includes('game-time') || s.includes('day-to-day')) return 'Questionable';
    return 'Out'; // Default to Out for unknown statuses
  };
  
  // Extract duration context from injury text
  const extractDuration = (text) => {
    const t = text.toLowerCase();
    // SEASON-LONG indicators - team stats already reflect their absence
    if (t.includes('season-long') || t.includes('all season') || t.includes('since week 1') || 
        t.includes('since week 2') || t.includes('since week 3') || t.includes('most of the season') ||
        t.includes('out for the year') || t.includes('out all year') ||
        t.includes('indefinitely') || t.includes('no timetable') || t.includes('no return') ||
        t.includes('season-ending') || t.includes('out for season') ||
        t.includes('won\'t return') || t.includes('will not return') ||
        t.includes('since october') || t.includes('since november') || t.includes('since the start')) {
      return { duration: 'SEASON-LONG', isEdge: false, note: 'Team stats already reflect absence - NOT AN EDGE' };
    }
    if (t.includes('mid-season') || t.includes('since week 4') || t.includes('since week 5') ||
        t.includes('since week 6') || t.includes('since week 7') || t.includes('since week 8') ||
        t.includes('since week 9') || t.includes('since week 10') || t.includes('since week 11') ||
        t.includes('several weeks') || t.includes('multiple weeks') || t.includes('month') ||
        t.includes('extended') || t.includes('prolonged')) {
      return { duration: 'MID-SEASON', isEdge: false, note: 'Team has adjusted to absence' };
    }
    if (t.includes('recent') || t.includes('last week') || t.includes('this week') || 
        t.includes('just') || t.includes('new') || t.includes('since week 14') || 
        t.includes('since week 15') || t.includes('since week 16') ||
        t.includes('day-to-day') || t.includes('game-time')) {
      return { duration: 'RECENT', isEdge: true, note: 'Potential edge - team still adjusting' };
    }
    // Default: check if IR (usually long-term)
    return { duration: 'UNKNOWN', isEdge: null, note: '' };
  };
  
  // Split content into sections by team (rough heuristic)
  const homeSection = extractTeamSection(content, homeTeam);
  const awaySection = extractTeamSection(content, awayTeam);
  
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
          source: 'perplexity'
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
          source: 'perplexity'
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
 * Extract section of text related to a team
 */
function extractTeamSection(content, teamName) {
  // Try to find the team name and extract surrounding context
  const teamLower = teamName.toLowerCase();
  const idx = content.toLowerCase().indexOf(teamLower);
  if (idx === -1) return content; // Return full content if team not found
  
  // Get 500 chars after team mention
  return content.substring(Math.max(0, idx - 50), idx + 500);
}

/**
 * Merge BDL and Perplexity injuries - Perplexity takes priority for status updates
 * (Perplexity is real-time, BDL can be stale)
 * Also validates that players are assigned to the correct team
 */
function mergeInjuries(bdlInjuries, perplexityInjuries) {
  // Build a set of ALL player names from both teams' BDL data for cross-validation
  const allBdlHomeNames = new Set((bdlInjuries.home || []).map(i => 
    `${i.player?.first_name} ${i.player?.last_name}`.toLowerCase().trim()
  ));
  const allBdlAwayNames = new Set((bdlInjuries.away || []).map(i => 
    `${i.player?.first_name} ${i.player?.last_name}`.toLowerCase().trim()
  ));
  
  const mergeTeam = (bdl, perp, isHome) => {
    // Create a map of BDL injuries by player name for easy lookup
    const bdlMap = new Map();
    bdl.forEach(i => {
      const name = `${i.player?.first_name} ${i.player?.last_name}`.toLowerCase();
      bdlMap.set(name, i);
    });

    // Start with BDL injuries, but let Perplexity override statuses
    const merged = bdl.map(bdlInjury => {
      const name = `${bdlInjury.player?.first_name} ${bdlInjury.player?.last_name}`.toLowerCase();
      
      // Check if Perplexity has different status for this player
      const perpMatch = perp.find(p => 
        `${p.player?.first_name} ${p.player?.last_name}`.toLowerCase() === name
      );
      
      if (perpMatch && perpMatch.status !== bdlInjury.status) {
        console.log(`[Scout Report] Perplexity override: ${name} - ${bdlInjury.status} → ${perpMatch.status} (Perplexity is more current)`);
        return { ...bdlInjury, status: perpMatch.status, source: 'perplexity_override' };
      }
      
      return bdlInjury;
    });

    // Add Perplexity-only injuries that aren't in BDL
    const existingNames = new Set(bdl.map(i =>
      `${i.player?.first_name} ${i.player?.last_name}`.toLowerCase()
    ));
    
    // Get the OTHER team's BDL names to check for misassignment
    const otherTeamBdlNames = isHome ? allBdlAwayNames : allBdlHomeNames;

    for (const injury of perp) {
      const name = `${injury.player?.first_name} ${injury.player?.last_name}`.toLowerCase().trim();
      
      // Skip if already exists in this team's list
      if (existingNames.has(name)) continue;
      
      // CRITICAL: Check if this player is actually on the OTHER team's roster
      // This catches cases where Perplexity assigns a player to the wrong team
      if (otherTeamBdlNames.has(name)) {
        console.log(`[Scout Report] ⚠️ Skipping ${name} - assigned to wrong team by Perplexity (belongs to opponent)`);
        continue;
      }
      
        merged.push(injury);
        console.log(`[Scout Report] Added injury from Perplexity: ${name} (${injury.status})`);
    }

    return merged;
  };
  
  return {
    home: mergeTeam(bdlInjuries.home || [], perplexityInjuries.home || [], true),
    away: mergeTeam(bdlInjuries.away || [], perplexityInjuries.away || [], false),
    perplexityRaw: perplexityInjuries.perplexityRaw
  };
}

/**
 * Format comprehensive injury report - this goes at the TOP of the scout report
 * Now includes duration context to distinguish RECENT (edge) vs LONG-TERM (not an edge)
 */
function formatInjuryReport(homeTeam, awayTeam, injuries) {
  const lines = [];
  
  // Categorize injuries by importance/duration
  const categorize = (teamInjuries) => {
    const critical = teamInjuries.filter(i => (i.duration === 'RECENT' || i.isEdge === true) && i.status !== 'Out');
    const out = teamInjuries.filter(i => i.status === 'Out' || i.status === 'IR' || i.status === 'LTIR' || i.status === 'Injured Reserve');
    const seasonal = teamInjuries.filter(i => i.duration === 'SEASON-LONG' && i.status !== 'Out' && i.status !== 'IR');
    const others = teamInjuries.filter(i => 
      !critical.includes(i) && !out.includes(i) && !seasonal.includes(i)
    );
    return { critical, out, seasonal, others };
  };

  const homeCats = categorize(injuries.home || []);
  const awayCats = categorize(injuries.away || []);
  
  const formatPlayer = (i) => {
    const name = `${i.player?.first_name || i.firstName || ''} ${i.player?.last_name || i.lastName || ''}`.trim() || i.name || 'Unknown';
    const pos = i.player?.position_abbreviation || i.player?.position || i.position || '';
    const reason = i.description || i.comment || i.injury || '';
    const shortReason = reason ? ` - ${reason.split('.')[0].substring(0, 50)}` : '';
    
    let durationTag = '';
    if (i.duration === 'SEASON-LONG' || i.status === 'Injured Reserve' || i.status === 'IR' || i.status === 'LTIR') {
      durationTag = ' [SEASON-LONG - NOT AN EDGE]';
    } else if (i.duration === 'MID-SEASON') {
      durationTag = ' [MID-SEASON - team adjusted]';
    } else if (i.duration === 'RECENT' || i.isEdge === true) {
      durationTag = ' [RECENT - POTENTIAL EDGE ⚡]';
  }
    
    if (!durationTag && (i.status === 'IR' || i.status === 'Injured Reserve' || i.status === 'LTIR' || 
        (i.description && i.description.toLowerCase().includes('injured reserve')))) {
      durationTag = ' [IR - likely SEASON-LONG]';
    }
    
    return `  • ${name}${pos ? ` (${pos})` : ''}${shortReason}${durationTag}`;
  };
  
  const renderTeam = (teamName, cats, emoji) => {
    lines.push(`${emoji} ${teamName}:`);
    
    if (cats.critical.length > 0) {
      lines.push(`  🚨 RECENT/CRITICAL:`);
      cats.critical.forEach(i => lines.push(formatPlayer(i)));
    }
    
    if (cats.out.length > 0) {
      lines.push(`  ❌ OUT / IR:`);
      cats.out.forEach(i => lines.push(formatPlayer(i)));
  }
    
    if (cats.others.length > 0) {
      lines.push(`  ⚠️ OTHER (Doubtful/Questionable):`);
      cats.others.forEach(i => lines.push(formatPlayer(i)));
  }

    if (cats.seasonal.length > 0) {
      lines.push(`  ℹ️ SEASON-LONG (Not an edge):`);
      cats.seasonal.forEach(i => lines.push(formatPlayer(i)));
  }

    if (!cats.critical.length && !cats.out.length && !cats.others.length && !cats.seasonal.length) {
    lines.push(`  ✅ No significant injuries reported`);
  }
    lines.push('');
  };

  renderTeam(homeTeam, homeCats, '🏠');
  renderTeam(awayTeam, awayCats, '✈️');
  
  return lines.join('\n');
}

/**
 * Format situational factors with sport-specific nuances
 */
function formatSituationalFactors(game, injuries, sport) {
  const factors = [];
  const sportKey = normalizeSport(sport);
  
  // Injuries
  const homeInjuries = injuries.home?.filter(i => ['Out', 'Doubtful', 'Questionable'].includes(i.status));
  const awayInjuries = injuries.away?.filter(i => ['Out', 'Doubtful', 'Questionable'].includes(i.status));
  
  if (homeInjuries?.length > 0) {
    const injuryList = homeInjuries.slice(0, 3).map(i => {
      let tag = '';
      if (i.duration === 'SEASON-LONG' || i.status === 'IR' || i.status === 'LTIR') {
        tag = ' [SEASON-LONG]';
      } else if (i.duration === 'RECENT' || i.isEdge) {
        tag = ' [RECENT]';
      }
      return `${i.player?.first_name} ${i.player?.last_name}: ${i.status}${tag}`;
    }).join(', ');
    factors.push(`• ${game.home_team} Injuries: ${injuryList}`);
  }
  
  if (awayInjuries?.length > 0) {
    const injuryList = awayInjuries.slice(0, 3).map(i => {
      let tag = '';
      if (i.duration === 'SEASON-LONG' || i.status === 'IR' || i.status === 'LTIR') {
        tag = ' [SEASON-LONG]';
      } else if (i.duration === 'RECENT' || i.isEdge) {
        tag = ' [RECENT]';
      }
      return `${i.player?.first_name} ${i.player?.last_name}: ${i.status}${tag}`;
    }).join(', ');
    factors.push(`• ${game.away_team} Injuries: ${injuryList}`);
  }
  
  // Rest situation (if available)
  if (game.home_rest_days !== undefined) {
    factors.push(`• Rest: ${game.home_team} (${game.home_rest_days} days) vs ${game.away_team} (${game.away_rest_days} days)`);
  }
  
  // Week info for NFL/NCAAF
  if (game.week && (sport === 'NFL' || sport === 'NCAAF' || sportKey === 'americanfootball_nfl' || sportKey === 'americanfootball_ncaaf')) {
    factors.push(`• Week ${game.week} of the ${game.season || 2025} season`);
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
    factors.push('🏈 NCAAF SHARP NOTES:');
    factors.push('• QB STATUS IS CRITICAL: If starting QB is OUT/DOUBTFUL, the game is essentially unpredictable');
    
    // CFP-specific context (Dec-Jan games)
    const currentMonth = new Date().getMonth(); // 0-indexed
    const isCFPSeason = currentMonth === 11 || currentMonth === 0; // Dec or Jan
    if (isCFPSeason) {
      factors.push('');
      factors.push('🏆 CFP PLAYOFF CONTEXT (12-TEAM ERA):');
      factors.push('• FIRST ROUND (Seeds 5-12): On-campus game at higher seed - home field IS live but public overvalues it');
      factors.push('• RANKED vs RANKED: Public over-bets home favorites by 1.5-2 points; 58% Under rate (conservative play)');
      factors.push('• REMATCH FACTOR: Team that LOST game 1 covers 58% in game 2 (film study + coaching adjustments)');
      factors.push('• RUST vs REST TRAP: Bye teams went 0-4 in Quarterfinals last year - being "hot" > being "rested"');
      factors.push('• COACHING DISTRACTION: Check if any coach has accepted another job (portal window = chaos)');
      factors.push('• G5 IN CFP: Take the points, not the ML - talent gap is real but can cover');
    } else {
      factors.push('• REMATCH RULE: If teams played earlier this season, LOSER of game 1 covers 58% in game 2');
    }
    
    factors.push('• PORTAL DEPTH: Teams with strong transfer portal classes hold up better in 4th quarter');
  }
  
  // NHL: Goalie & fatigue factors
  if (sportKey === 'icehockey_nhl') {
    factors.push('');
    factors.push('🏒 NHL SHARP NOTES:');
    factors.push('• GOALIE TANDEM ERA: Check if starter or backup is playing - a sub-.900 SV% backup = fade the favorite');
    factors.push('• BACK-TO-BACK: Second game of B2B, especially on the road, historically underperforms');
    factors.push('• HIGH-DANGER CHANCES (HDC): Teams creating lots of HDC will eventually convert - bet the process not results');
    factors.push('• GSAx (Goals Saved Above Expected): Better indicator than raw save percentage');
    
    // Check for goalie injuries
    const goalieInjuries = [...(homeInjuries || []), ...(awayInjuries || [])].filter(i => 
      i.player?.position?.toLowerCase() === 'g' || i.player?.position?.toLowerCase() === 'goalie'
    );
    if (goalieInjuries.length > 0) {
      factors.push(`• ⚠️ GOALIE ALERT: ${goalieInjuries.map(i => `${i.player?.last_name} (${i.status})`).join(', ')}`);
    }
  }
  
  // NCAAB: Efficiency & luck factors
  if (sportKey === 'basketball_ncaab') {
    factors.push('');
    factors.push('🏀 NCAAB SHARP NOTES:');
    factors.push('• KENPOM EFFICIENCY: Championship teams need Top 25 Offense AND Top 30 Defense - one-sided teams are "fraudulent"');
    factors.push('• "LUCK" FADE: Team with great record but mediocre Net Rating = lucky, fade candidate');
    factors.push('• RANKED vs RANKED: When two Top 25 teams play, lean UNDER (70% hit rate) - conservative, grinding games');
    factors.push('• ALTITUDE TRAP: Games in Denver/Salt Lake = 12% 2nd-half shooting drop for sea-level teams');
    factors.push('• TOURNAMENT FATIGUE: "3 games in 4 days" or team that played 2OT last night = FADE');
    factors.push('• PORTAL LAG: Transfer-heavy teams (Louisville, Michigan) peak in Jan-Feb, not December');
    factors.push('• TOP 10 DROPOUTS: Teams falling out of Top 10 cover at 57% next game ("chip on shoulder")');
    factors.push('• FREE THROW RATE (FTR): Underdogs with high FTR win close games - upset potential');
  }
  
  // NFL: Rest & EPA factors
  if (sportKey === 'americanfootball_nfl') {
    factors.push('');
    factors.push('🏈 NFL SHARP NOTES:');
    factors.push('• REST DISPARITY: Teams with +3 day rest edge cover at 62% historically');
    factors.push('• EPA vs RECORD: Teams with high EPA but bad record are "unlucky" - regression candidates to bet');
    factors.push('• 4TH QUARTER DEPTH: Teams that fade late lack depth - avoid laying big numbers with them');
    factors.push('• WIND >15 MPH: Lean UNDER in games with high wind forecasts');
  }
  
  if (factors.length === 0) {
    factors.push('• No significant situational factors identified');
  }
  
  return factors.join('\n');
}

/**
 * Format odds for display
 */
function formatOdds(game) {
  const lines = [];
  
  // Spread
  let spreadValue = null;
  let spreadOdds = -110;
  if (game.spread_home !== undefined && game.spread_home !== null) {
    const homeSpread = parseFloat(game.spread_home);
    const awaySpread = -homeSpread;
    spreadValue = homeSpread;
    spreadOdds = game.spread_home_odds || game.spread_odds || -110;
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
  
  // Total
  let totalValue = null;
  if (game.total !== undefined && game.total !== null) {
    totalValue = parseFloat(game.total);
    lines.push(`Total: O/U ${totalValue}`);
  } else if (game.totals) {
    lines.push(`Total: ${game.totals}`);
  }
  
  // Add raw values for Gary to include in JSON output
  lines.push('');
  lines.push('📊 RAW ODDS VALUES (copy these to your JSON output):');
  lines.push(`  spread: ${spreadValue !== null ? spreadValue : 'null'}`);
  lines.push(`  spreadOdds: ${spreadOdds}`);
  lines.push(`  moneylineHome: ${mlHome !== null ? mlHome : 'null'}`);
  lines.push(`  moneylineAway: ${mlAway !== null ? mlAway : 'null'}`);
  lines.push(`  total: ${totalValue !== null ? totalValue : 'null'}`);
  
  return lines.join('\n') || 'Odds not available';
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
    'EPL': 'soccer_epl',
    'basketball_nba': 'basketball_nba',
    'americanfootball_nfl': 'americanfootball_nfl',
    'basketball_ncaab': 'basketball_ncaab',
    'americanfootball_ncaaf': 'americanfootball_ncaaf',
    'icehockey_nhl': 'icehockey_nhl',
    'soccer_epl': 'soccer_epl'
  };
  return mapping[sport] || null;
}

/**
 * Find team by name in teams array
 * Prioritizes exact matches to avoid USC Trojans vs Troy Trojans confusion
 */
function findTeam(teams, teamName) {
  if (!teams || !teamName) return null;

  const normalized = teamName.toLowerCase().trim();
  
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
  
  return null;
}

/**
 * Calculate record from season stats
 */
function calculateRecord(stats) {
  if (!stats) return 'N/A';
  if (stats.wins !== undefined && stats.losses !== undefined) {
    return `${stats.wins}-${stats.losses}`;
  }
  return 'N/A';
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
 * This is called AFTER we know who the starting QB is (from Perplexity)
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

    // Fetch all player stats for the team
    const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/season_stats?season=2025&team_id=${team.id}&per_page=100`;
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
      console.log(`[Scout Report] ⚠️ No BDL stats found for QB "${qbName}" on ${teamName} - may be new/backup`);
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
      experienceNote = '🚨 MAKING NFL DEBUT - No NFL game experience';
      console.log(`[Scout Report] 🚨 ${qbName} is making their NFL DEBUT (0 GP)`);
    } else if (gamesPlayed === 1) {
      experienceNote = `🚨 SECOND CAREER START - Only 1 NFL game (${passingYards} yds)`;
      console.log(`[Scout Report] 🚨 ${qbName} is making SECOND CAREER START (1 GP, ${passingYards} yds)`);
    } else if (isRookie) {
      experienceNote = `⚠️ ROOKIE QB - Only ${gamesPlayed} career starts`;
      console.log(`[Scout Report] ⚠️ ${qbName} is a ROOKIE QB (${gamesPlayed} GP)`);
    } else if (isInexperienced) {
      experienceNote = `Limited experience - ${gamesPlayed} career starts`;
      console.log(`[Scout Report] ${qbName} has LIMITED EXPERIENCE (${gamesPlayed} GP)`);
    } else {
      console.log(`[Scout Report] ✓ Found BDL stats for ${qbName}: ${passingYards} yds, ${qb.passing_touchdowns || 0} TDs, ${gamesPlayed} GP`);
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
 * - Perplexity (can be wrong/outdated)
 */
async function fetchStartingQBs(homeTeam, awayTeam, sport, injuries = null) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport || (bdlSport !== 'americanfootball_nfl' && bdlSport !== 'americanfootball_ncaaf')) {
      return null;
    }
    
    const sportLabel = bdlSport === 'americanfootball_ncaaf' ? 'NCAAF' : 'NFL';
    
    // Get team IDs
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for QB lookup');
      return null;
    }
    
    console.log(`[Scout Report] 🏈 Fetching ${sportLabel} starting QBs from depth chart: ${awayTeam} @ ${homeTeam}`);
    
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
    
    // Log results
    if (homeQB) {
      const backupNote = homeQB.isBackup ? ' [BACKUP - starter injured]' : '';
      const injuryNote = homeQB.injuryStatus ? ` (${homeQB.injuryStatus})` : '';
      console.log(`[Scout Report] ✅ Home QB: ${homeQB.name} (${homeQB.passingYards || 0} yds, ${homeQB.passingTds || 0} TDs, ${homeQB.gamesPlayed || 0} GP)${backupNote}${injuryNote}`);
    }
    if (awayQB) {
      const backupNote = awayQB.isBackup ? ' [BACKUP - starter injured]' : '';
      const injuryNote = awayQB.injuryStatus ? ` (${awayQB.injuryStatus})` : '';
      console.log(`[Scout Report] ✅ Away QB: ${awayQB.name} (${awayQB.passingYards || 0} yds, ${awayQB.passingTds || 0} TDs, ${awayQB.gamesPlayed || 0} GP)${backupNote}${injuryNote}`);
    }
    
    return { home: homeQB, away: awayQB };
  } catch (error) {
    console.error('[Scout Report] Error fetching starting QBs:', error.message);
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
 */
function formatKeyPlayers(homeTeam, awayTeam, keyPlayers) {
  if (!keyPlayers || (!keyPlayers.home && !keyPlayers.away)) {
    return '';
  }
  
  const formatPlayerLine = (player) => {
    const injury = player.injuryStatus ? ` ⚠️${player.injuryStatus}` : '';
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
  
  const formatTeamSection = (teamName, players, isHome) => {
    if (!players) return `${isHome ? '🏠' : '✈️'} ${teamName}: Roster unavailable`;
    
    const lines = [`${isHome ? '🏠' : '✈️'} ${teamName}:`];
    
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
  
  return `
🏈 KEY PLAYERS (CURRENT ROSTER - USE THESE NAMES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${homeSection}

${awaySection}

⚠️ CRITICAL: Only reference players listed above. Do NOT mention players
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
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for NHL roster lookup');
      return null;
    }
    
    console.log(`[Scout Report] Fetching NHL rosters for ${homeTeam} (ID: ${homeTeamData?.id}) and ${awayTeam} (ID: ${awayTeamData?.id})`);

    // NHL season: 2025 for 2025-26 season (current as of Dec 2025)
    const season = 2025;

    // Skip Perplexity roster queries for NHL to avoid timeouts - rely on improved BDL data
    let perplexityRosterData = null;
    console.log(`[Scout Report] Using BDL roster data with improved filtering for NHL: ${homeTeam} vs ${awayTeam}`);

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
    
    // CRITICAL: Check Perplexity for recent trades/roster updates (BDL may lag)
    // This catches major trades like Quinn Hughes to Minnesota
    try {
      const perplexityService = (await import('../../perplexityService.js')).default;
      if (perplexityService?.queryPerplexity) {
        const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const tradeQuery = `NHL roster check for ${today}: ${awayTeam} at ${homeTeam}.

Recent changes since November 2025:
- Trades, acquisitions, roster moves
- Players OUT/QUESTIONABLE for this game
- Discrepancies with older data

Sources: NHL.com, RotoWire, ESPN, TSN`;
        
        console.log(`[Scout Report] Skipping Perplexity roster verification for NHL to avoid timeouts`);
      }
    } catch (error) {
      console.warn(`[Scout Report] Perplexity roster check failed:`, error.message);
    }
    
    const homeCount = (homeKeyPlayers?.forwards?.length || 0) + (homeKeyPlayers?.defensemen?.length || 0) + (homeKeyPlayers?.goalies?.length || 0);
    const awayCount = (awayKeyPlayers?.forwards?.length || 0) + (awayKeyPlayers?.defensemen?.length || 0) + (awayKeyPlayers?.goalies?.length || 0);
    
    console.log(`[Scout Report] ✓ NHL Key players: ${homeTeam} (${homeCount} players), ${awayTeam} (${awayCount} players)`);
    
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
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for NBA roster lookup');
      return null;
    }
    
    console.log(`[Scout Report] Fetching NBA rosters for ${homeTeam} (ID: ${homeTeamData?.id}) and ${awayTeam} (ID: ${awayTeamData?.id})`);

    // Fetch active players for each team
    const [homePlayers, awayPlayers] = await Promise.all([
      homeTeamData ? ballDontLieService.getPlayersActive(bdlSport, { team_ids: [homeTeamData.id], per_page: 20 }) : [],
      awayTeamData ? ballDontLieService.getPlayersActive(bdlSport, { team_ids: [awayTeamData.id], per_page: 20 }) : []
    ]);
    
    console.log(`[Scout Report] NBA roster: ${homeTeam} (${homePlayers.length} players), ${awayTeam} (${awayPlayers.length} players)`);
    
    // Get current season for stats lookup
    // BDL API convention: season=2025 means the 2025-26 NBA season
    // Oct-Dec: we're in the first half of currentYear season
    // Jan-June: we're in the second half of (currentYear-1) season
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const season = currentMonth >= 9 ? currentYear : currentYear - 1;
    
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
    const processRoster = (players, teamName) => {
      if (!players || players.length === 0) return null;
      
      // Map players with their stats
      const playersWithStats = players.map(p => {
        const stats = playerStats[p.id] || {};
        return {
          name: `${p.first_name} ${p.last_name}`,
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
      
      // Log who we're identifying as key players
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
 * Format NBA key players section for display
 * CRITICAL: This tells the LLM who ACTUALLY plays for each team
 * ENHANCED: Now shows PPG to indicate player significance
 */
function formatNbaKeyPlayers(homeTeam, awayTeam, keyPlayers) {
  if (!keyPlayers || (!keyPlayers.home && !keyPlayers.away)) {
    return '';
  }
  
  const formatPlayer = (player) => {
    const jersey = player.jerseyNumber ? ` #${player.jerseyNumber}` : '';
    const ppg = player.ppg ? ` - ${player.ppg.toFixed(1)} PPG` : '';
    return `  • ${player.position}: ${player.name}${jersey}${ppg}`;
  };
  
  const lines = [
    '🏀 CURRENT ROSTERS (WHO ACTUALLY PLAYS FOR EACH TEAM)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '⚠️ CRITICAL: Only mention players listed below. Do NOT reference',
    '   any player not on this list - they may have been traded or released.',
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
 * Fetch key players for NCAAB teams
 * CRITICAL: Prevents hallucinations about transferred players (transfer portal is huge in college basketball)
 */
async function fetchNcaabKeyPlayers(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (bdlSport !== 'basketball_ncaab') {
      return null;
    }
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for NCAAB roster lookup');
      return null;
    }
    
    console.log(`[Scout Report] Fetching NCAAB rosters for ${homeTeam} (ID: ${homeTeamData?.id}) and ${awayTeam} (ID: ${awayTeamData?.id})`);

    // Fetch active players for each team
    const [homePlayers, awayPlayers] = await Promise.all([
      homeTeamData ? ballDontLieService.getPlayersActive(bdlSport, { team_ids: [homeTeamData.id], per_page: 20 }) : [],
      awayTeamData ? ballDontLieService.getPlayersActive(bdlSport, { team_ids: [awayTeamData.id], per_page: 20 }) : []
    ]);
    
    console.log(`[Scout Report] NCAAB roster: ${homeTeam} (${homePlayers.length} players), ${awayTeam} (${awayPlayers.length} players)`);
    
    // Get current college basketball season (Nov-March is the season)
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    // Nov-March: we're in the currentYear season (e.g., Nov 2025 = 2025-26 season = 2026)
    // But BDL uses the starting year, so Nov-Dec of 2025 = season 2025
    const season = currentMonth >= 10 ? currentYear : currentYear - 1;
    
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
        return {
          name: `${p.first_name} ${p.last_name}`,
          position: p.position || 'N/A',
          jerseyNumber: p.jersey_number,
          id: p.id,
          ppg: parseFloat(playerStats.pts) || 0,
          rpg: parseFloat(playerStats.reb) || 0,
          apg: parseFloat(playerStats.ast) || 0,
          gamesPlayed: playerStats.games_played || 0
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
      awayTeamName: awayTeam
    };
  } catch (error) {
    console.error('[Scout Report] Error fetching NCAAB key players:', error.message);
    return null;
  }
}

/**
 * Format NCAAB key players section for display
 * CRITICAL: Tells the LLM who ACTUALLY plays for each team (transfer portal is huge in CBB)
 */
function formatNcaabKeyPlayers(homeTeam, awayTeam, keyPlayers) {
  if (!keyPlayers || (!keyPlayers.home && !keyPlayers.away)) {
    return '';
  }
  
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
    '🏀 CURRENT ROSTERS (WHO ACTUALLY PLAYS FOR EACH TEAM)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '⚠️ CRITICAL: College basketball has massive transfer portal activity.',
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
 * Fetch key players for EPL teams
 * CRITICAL: Prevents hallucinations about transferred players (January window, summer window)
 */
async function fetchEplKeyPlayers(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (bdlSport !== 'soccer_epl') {
      return null;
    }
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for EPL roster lookup');
      return null;
    }
    
    console.log(`[Scout Report] Fetching EPL rosters for ${homeTeam} (ID: ${homeTeamData?.id}) and ${awayTeam} (ID: ${awayTeamData?.id})`);

    // EPL season runs August to May, so use current year for Aug-Dec, previous for Jan-May
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const season = currentMonth >= 7 ? currentYear : currentYear - 1;

    // Fetch active players for each team
    const [homePlayers, awayPlayers] = await Promise.all([
      homeTeamData ? ballDontLieService.getPlayersActive(bdlSport, { team_ids: [homeTeamData.id], per_page: 30 }) : [],
      awayTeamData ? ballDontLieService.getPlayersActive(bdlSport, { team_ids: [awayTeamData.id], per_page: 30 }) : []
    ]);
    
    console.log(`[Scout Report] EPL roster: ${homeTeam} (${homePlayers.length} players), ${awayTeam} (${awayPlayers.length} players)`);
    
    // Try to get stats leaders for context
    let statsLeaders = [];
    try {
      statsLeaders = await ballDontLieService.getStatsLeadersGeneric(bdlSport, { season, type: 'goals' });
    } catch (e) {
      console.warn('[Scout Report] Could not fetch EPL stats leaders:', e.message);
    }
    
    // Create a set of top scorers for highlighting
    const topScorerIds = new Set(statsLeaders.slice(0, 20).map(l => l.player?.id).filter(Boolean));
    
    // Process roster
    const processRoster = (players, teamName) => {
      if (!players || players.length === 0) return null;
      
      // Map players with position info
      const playersWithInfo = players.map(p => ({
        name: `${p.first_name} ${p.last_name}`,
        position: p.position || 'N/A',
        jerseyNumber: p.jersey_number,
        id: p.id,
        isTopScorer: topScorerIds.has(p.id)
      }));
      
      // Sort goalkeepers first, then by position, then top scorers
      const positionOrder = { 'Goalkeeper': 1, 'Defender': 2, 'Midfielder': 3, 'Forward': 4 };
      playersWithInfo.sort((a, b) => {
        const posA = positionOrder[a.position] || 5;
        const posB = positionOrder[b.position] || 5;
        if (posA !== posB) return posA - posB;
        if (a.isTopScorer !== b.isTopScorer) return a.isTopScorer ? -1 : 1;
        return 0;
      });
      
      // Take key players by position (GK, defenders, midfielders, forwards)
      const keyPlayers = playersWithInfo.slice(0, 15);
      
      console.log(`[Scout Report] ${teamName} EPL key players: ${keyPlayers.slice(0, 5).map(p => p.name).join(', ')}`);
      
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
    console.error('[Scout Report] Error fetching EPL key players:', error.message);
    return null;
  }
}

/**
 * Format EPL key players section for display
 * CRITICAL: Tells the LLM who ACTUALLY plays for each team (transfer windows are big)
 */
function formatEplKeyPlayers(homeTeam, awayTeam, keyPlayers) {
  if (!keyPlayers || (!keyPlayers.home && !keyPlayers.away)) {
    return '';
  }
  
  const formatPlayer = (player) => {
    const jersey = player.jerseyNumber ? ` #${player.jerseyNumber}` : '';
    const topScorer = player.isTopScorer ? ' ⭐' : '';
    return `  • ${player.position}: ${player.name}${jersey}${topScorer}`;
  };
  
  const lines = [
    '⚽ CURRENT SQUADS (WHO ACTUALLY PLAYS FOR EACH TEAM)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '⚠️ CRITICAL: EPL has January and summer transfer windows.',
    '   Only mention players listed below - others may have been transferred/loaned.',
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
  if (!keyPlayers || (!keyPlayers.home && !keyPlayers.away)) {
    return '';
  }
  
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
  
  const formatTeamSection = (teamName, players, isHome) => {
    if (!players) return `${isHome ? '🏠' : '✈️'} ${teamName}: Roster unavailable`;
    
    const lines = [`${isHome ? '🏠' : '✈️'} ${teamName}:`];
    
    if (players.forwards && players.forwards.length > 0) {
      lines.push('  FORWARDS:');
      players.forwards.forEach(p => lines.push(formatForward(p)));
    }
    
    if (players.defensemen && players.defensemen.length > 0) {
      lines.push('  DEFENSE:');
      players.defensemen.forEach(p => lines.push(formatDefenseman(p)));
    }
    
    if (players.goalies && players.goalies.length > 0) {
      lines.push('  GOALIES:');
      players.goalies.forEach(p => lines.push(formatGoalie(p)));
    }
    
    return lines.join('\n');
  };
  
  const homeSection = formatTeamSection(homeTeam, keyPlayers.home, true);
  const awaySection = formatTeamSection(awayTeam, keyPlayers.away, false);

  return `
⚠️⚠️⚠️ ACTIVE ROSTER (READ THIS FIRST - PREVENTS HALLUCINATIONS) ⚠️⚠️⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
These are the CURRENT players on each team's roster from Ball Don't Lie data.
${homeSection}

${awaySection}

🚨 CRITICAL ROSTER RULES:
1. ONLY mention players from the roster data above
2. Do NOT reference players not on these rosters (they may have been traded, cut, or are on IR)
3. Use player names EXACTLY as shown above
4. Check stats to verify players are active this season

If you mention a player not listed here, you are HALLUCINATING. Stop and check the roster.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

/**
 * Parse injuries from Perplexity response
 */
function parseInjuriesFromPerplexity(content, homeTeam, awayTeam) {
  const homeInjuries = [];
  const awayInjuries = [];

  if (!content) return { home: homeInjuries, away: awayInjuries };

  const lines = content.split('\n').map(line => line.trim()).filter(line => line);

  let currentTeam = null;
  for (const line of lines) {
    if (line.toLowerCase().includes(homeTeam.toLowerCase())) {
      currentTeam = 'home';
    } else if (line.toLowerCase().includes(awayTeam.toLowerCase())) {
      currentTeam = 'away';
    } else if (currentTeam && (line.includes('-') || line.includes(':'))) {
      // Parse injury line like "Player Name - Status - Injury - Return"
      const parts = line.split('-').map(p => p.trim());
      if (parts.length >= 2) {
        const playerName = parts[0];
        const status = parts[1];
        const injury = parts[2] || '';
        const returnDate = parts[3] || '';

        const injuryObj = {
          name: playerName,
          status: status,
          description: injury + (returnDate ? ` - Return: ${returnDate}` : '')
        };

        if (currentTeam === 'home') {
          homeInjuries.push(injuryObj);
        } else if (currentTeam === 'away') {
          awayInjuries.push(injuryObj);
        }
      }
    }
  }

  return { home: homeInjuries, away: awayInjuries };
}

/**
 * 2025-26 College Football Playoff Seeding (12-team bracket)
 * Hardcoded as fallback since Perplexity may not always have the latest bracket
 * Updated for the 2025-26 season (December 2025)
 */
const CFP_2024_25_SEEDING = {
  // 4 Byes (seeds 1-4) - Conference Champions
  'Indiana Hoosiers': 1,
  'Indiana': 1,
  'Ohio State Buckeyes': 2,
  'Ohio State': 2,
  'Georgia Bulldogs': 3,
  'Georgia': 3,
  'Texas Tech Red Raiders': 4,
  'Texas Tech': 4,
  // First Round (seeds 5-12)
  'Oregon Ducks': 5,
  'Oregon': 5,
  'Ole Miss Rebels': 6,
  'Ole Miss': 6,
  'Texas A&M Aggies': 7,
  'Texas A&M': 7,
  'Oklahoma Sooners': 8,
  'Oklahoma': 8,
  'Alabama Crimson Tide': 9,
  'Alabama': 9,
  'Miami Hurricanes': 10,
  'Miami': 10,
  'Miami (FL)': 10,
  'Tulane Green Wave': 11,
  'Tulane': 11,
  'James Madison Dukes': 12,
  'James Madison': 12,
  'JMU Dukes': 12,
  'JMU': 12
};

/**
 * Get CFP seeding from hardcoded bracket (fallback)
 */
function getCfpSeedingFromBracket(teamName) {
  if (!teamName) return null;
  
  // Direct match
  if (CFP_2024_25_SEEDING[teamName]) {
    return CFP_2024_25_SEEDING[teamName];
  }
  
  // Try partial match (school name only)
  const teamLower = teamName.toLowerCase();
  for (const [key, seed] of Object.entries(CFP_2024_25_SEEDING)) {
    if (teamLower.includes(key.toLowerCase()) || key.toLowerCase().includes(teamLower.split(' ')[0])) {
      return seed;
    }
  }
  
  return null;
}

/**
 * Parse CFP seeding from text response
 * Looks for patterns like "#8 Oklahoma", "#9 seed Alabama", "(8) Oklahoma", "8-seed Oklahoma"
 * Also handles "Ole Miss is the higher seed (No. 6)" style from Perplexity
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
      // "Ole Miss is ... (No. 6)" style from Perplexity
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
 * Parse venue from CFP context text
 */
function parseCfpVenue(text) {
  if (!text) return null;
  
  // Common CFP venue patterns
  const venuePatterns = [
    // Stadium names
    /(?:at|in)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+Stadium)/i,
    /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+Stadium)(?:\s+in\s+[A-Z][a-zA-Z]+)?/i,
    // Bowl game venues
    /(Rose\s+Bowl)/i,
    /(Sugar\s+Bowl)/i,
    /(Orange\s+Bowl)/i,
    /(Cotton\s+Bowl)/i,
    /(Peach\s+Bowl)/i,
    /(Fiesta\s+Bowl)/i,
    // Arena/Field names
    /(?:at|in)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:Field|Arena|Dome|Center))/i,
    // Specific stadiums
    /(Hard\s+Rock\s+Stadium)/i,
    /(AT&T\s+Stadium)/i,
    /(Mercedes-Benz\s+Stadium)/i,
    /(Superdome)/i,
    /(State\s+Farm\s+Stadium)/i,
    /(Raymond\s+James\s+Stadium)/i,
    /(Lucas\s+Oil\s+Stadium)/i,
    /(SoFi\s+Stadium)/i,
    /(Allegiant\s+Stadium)/i,
    // University stadiums - common CFP first round venues
    /(Bryant-Denny\s+Stadium)/i,
    /(Ohio\s+Stadium)/i,
    /(Beaver\s+Stadium)/i,
    /(Kyle\s+Field)/i,
    /(Sanford\s+Stadium)/i,
    /(Tiger\s+Stadium)/i,
    /(Neyland\s+Stadium)/i,
    /(Memorial\s+Stadium)/i,
    /(DKR.*?Stadium)/i,
    /(Gaylord\s+Family.*?Stadium)/i,
    /(Oklahoma\s+Memorial\s+Stadium)/i,
    // Additional CFP venues
    /(Autzen\s+Stadium)/i,
    /(Vaught.?Hemingway\s+Stadium)/i,
    /(Doak\s+Campbell\s+Stadium)/i,
    /(Williams-Brice\s+Stadium)/i,
    /(Camp\s+Randall\s+Stadium)/i,
    /(Michigan\s+Stadium)/i,
    /(Notre\s+Dame\s+Stadium)/i,
    /(Ross-Ade\s+Stadium)/i,
    /(Kinnick\s+Stadium)/i,
    /(Spartan\s+Stadium)/i,
    /(Albertsons\s+Stadium)/i,
    /(Sun\s+Devil\s+Stadium)/i,
    /(Death\s+Valley)/i,
    /(The\s+Swamp)/i,
    /(Ben\s+Hill\s+Griffin\s+Stadium)/i
  ];
  
  for (const pattern of venuePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

/**
 * CFP team to home stadium mapping (fallback for venue extraction)
 * Updated for 2025-26 CFP bracket
 */
const CFP_HOME_STADIUMS = {
  // 2025-26 CFP First Round hosts (seeds 5-8)
  'Oregon Ducks': 'Autzen Stadium',
  'Oregon': 'Autzen Stadium',
  'Ole Miss Rebels': 'Vaught-Hemingway Stadium',
  'Ole Miss': 'Vaught-Hemingway Stadium',
  'Texas A&M Aggies': 'Kyle Field',
  'Texas A&M': 'Kyle Field',
  'Oklahoma Sooners': 'Gaylord Family Oklahoma Memorial Stadium',
  'Oklahoma': 'Gaylord Family Oklahoma Memorial Stadium',
  // Bye teams (seeds 1-4)
  'Indiana Hoosiers': 'Memorial Stadium',
  'Indiana': 'Memorial Stadium',
  'Ohio State Buckeyes': 'Ohio Stadium',
  'Ohio State': 'Ohio Stadium',
  'Georgia Bulldogs': 'Sanford Stadium',
  'Georgia': 'Sanford Stadium',
  'Texas Tech Red Raiders': 'Jones AT&T Stadium',
  'Texas Tech': 'Jones AT&T Stadium',
  // Away teams in First Round (seeds 9-12)
  'Alabama Crimson Tide': 'Bryant-Denny Stadium',
  'Alabama': 'Bryant-Denny Stadium',
  'Miami Hurricanes': 'Hard Rock Stadium',
  'Miami': 'Hard Rock Stadium',
  'Tulane Green Wave': 'Yulman Stadium',
  'Tulane': 'Yulman Stadium',
  'James Madison Dukes': 'Bridgeforth Stadium',
  'James Madison': 'Bridgeforth Stadium',
  'JMU Dukes': 'Bridgeforth Stadium',
  'JMU': 'Bridgeforth Stadium'
};

/**
 * Get CFP home stadium for a team (fallback)
 */
function getCfpHomeStadium(teamName) {
  if (!teamName) return null;
  
  // Direct match
  if (CFP_HOME_STADIUMS[teamName]) {
    return CFP_HOME_STADIUMS[teamName];
  }
  
  // Partial match
  const teamLower = teamName.toLowerCase();
  for (const [key, stadium] of Object.entries(CFP_HOME_STADIUMS)) {
    if (teamLower.includes(key.toLowerCase()) || key.toLowerCase().includes(teamLower.split(' ')[0])) {
      return stadium;
    }
  }
  
  return null;
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
 * Fetch bowl game / CFP context for NCAAF games
 * Determines if this is a CFP game or bowl game and gets context
 * Also extracts and sets CFP seeding, venue, and round on the game object
 */
async function fetchBowlGameContext(homeTeam, awayTeam, game) {
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
    
    // NOTE: Perplexity has auth issues (401 errors) - bowl context now provided by Gemini Grounding
    // Skip the Perplexity call and return empty - Gemini Grounding in Scout Report handles this
    console.log('[Scout Report] Skipping Perplexity bowl context - using Gemini Grounding instead');
    
    // Return empty - bowl/CFP context is already captured in Gemini Grounding search
    // which provides coaching changes, opt-outs, injuries, venue info, etc.
    return '';
    
    /* DISABLED: Perplexity API has 401 auth issues
    const query = `What game is ${homeTeam} vs ${awayTeam} playing on ${gameDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}?

Please determine:
1. Is this a COLLEGE FOOTBALL PLAYOFF game? If so, which round (First Round, Quarterfinal, Semifinal, Championship)?
2. If CFP First Round: This is played at the HIGHER SEED'S HOME STADIUM (not neutral) - confirm exact venue name
3. If CFP Quarterfinal/Semi/Final: This is at a NEUTRAL SITE bowl game - confirm exact venue name
4. Bowl name if applicable (Rose Bowl, Sugar Bowl, Peach Bowl, Fiesta Bowl, etc.)
5. CFP seeding for both teams - IMPORTANT: State clearly like "#8 Oklahoma vs #9 Alabama" or "Oklahoma (8 seed) vs Alabama (9 seed)"
6. Did these teams play earlier THIS SEASON? If so, what was the score and who won? (CRITICAL for rematch analysis)
7. Any key opt-outs or injuries announced for this game?
8. Any coaching changes or distractions (coach accepted new job, etc.)?

Be concise but specific. Focus on facts relevant to betting.`;
    
    const response = await perplexityService.search(query, {
      model: 'sonar',
      max_tokens: 800
    });
    
    if (!response || !response.success || !response.data) {
      console.log('[Scout Report] No bowl/CFP context found');
      return '';
    }
    */
    
    // Placeholder for when Perplexity is re-enabled
    const response = null;
    if (!response || !response.success || !response.data) {
      return '';
    }
    
    const gameInfo = response.data;
    const lowerInfo = gameInfo.toLowerCase();
    
    console.log('[Scout Report] Perplexity response:', gameInfo.substring(0, 300) + '...');
    
    // Check if it's CFP or bowl game - look for strong positive indicators
    const cfpIndicators = ['college football playoff', 'cfp first round', 'cfp quarterfinal', 
                          'cfp semifinal', 'cfp championship', 'playoff game', 'playoff matchup',
                          'seeded', 'higher seed', '#1 seed', '#2 seed', '#3 seed', '#4 seed',
                          '#5 seed', '#6 seed', '#7 seed', '#8 seed', '#9 seed', '#10 seed',
                          '#11 seed', '#12 seed', 'first-round game', 'first round game'];
    
    const isCFP = cfpIndicators.some(indicator => lowerInfo.includes(indicator));
    
    // Only skip if explicitly stated as regular season WITHOUT CFP context
    const isExplicitlyRegularSeason = (lowerInfo.includes('regular season game') || 
                                       lowerInfo.includes('this is a regular season')) &&
                                      !isCFP;
    
    if (lowerInfo.includes("cannot confirm") || lowerInfo.includes("no game scheduled") || isExplicitlyRegularSeason) {
      console.log('[Scout Report] Game is not a confirmed postseason game');
      return '';
    }
    
    // If we found CFP indicators, proceed even if "regular season" appears in a negated context
    if (!isCFP && !lowerInfo.includes('bowl')) {
      console.log('[Scout Report] No CFP or bowl indicators found');
      return '';
    }
    
    console.log(`[Scout Report] ✓ ${isCFP ? 'CFP' : 'Bowl'} game context retrieved`);
    
    // Parse and set CFP fields on the game object
    if (isCFP) {
      // Extract seeding for both teams
      const homeSeed = parseCfpSeeding(gameInfo, homeTeam);
      const awaySeed = parseCfpSeeding(gameInfo, awayTeam);
      
      console.log(`[Scout Report] CFP Seeding: Home (${homeTeam}) = #${homeSeed || 'N/A'}, Away (${awayTeam}) = #${awaySeed || 'N/A'}`);
      
      // Set seeding on game object
      if (homeSeed) game.homeSeed = homeSeed;
      if (awaySeed) game.awaySeed = awaySeed;
      
      // Detect CFP round FIRST (needed for venue logic)
      const cfpRound = detectCfpRound(gameInfo);
      
      // Extract venue - For First Round, ALWAYS use home team's stadium (they're the higher seed)
      let venue;
      if (cfpRound === 'CFP First Round' || cfpRound === 'CFP Playoff') {
        // First Round games are ALWAYS at the higher seed's home stadium
        venue = getCfpHomeStadium(homeTeam);
        if (!venue) {
          // Try parsing from Perplexity as backup
          venue = parseCfpVenue(gameInfo);
        }
      } else {
        // Quarterfinals, Semis, Championship are at neutral sites
        venue = parseCfpVenue(gameInfo);
      }
      
      if (venue) {
        game.venue = venue;
        console.log(`[Scout Report] ✓ CFP Venue: ${venue}`);
      }
      if (cfpRound) {
        game.tournamentContext = cfpRound;
        game.cfpRound = cfpRound;
        console.log(`[Scout Report] ✓ CFP Round: ${cfpRound}`);
      }
      
      // First round games are at higher seed's home stadium (not neutral)
      const isFirstRound = cfpRound === 'CFP First Round';
      game.isNeutralSite = !isFirstRound;
      
      // Store the full significance for analysis
      game.gameSignificance = gameInfo;
      
      return `
🏆 COLLEGE FOOTBALL PLAYOFF CONTEXT (12-TEAM ERA - CRITICAL INFO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${gameInfo}

⚠️ CFP BETTING NOTES (SHARP ANGLES):
• FIRST ROUND = ON-CAMPUS GAMES: Higher seed hosts at their stadium (home field IS live)
• PUBLIC OVER-BETS HOME FAVORITES: Sharp money often on road team at +1.5 to +3
• RANKED vs RANKED UNDER TREND: 58% Under rate - conservative coaching, ball security emphasis
• REMATCH FACTOR: If they played earlier, team that LOST game 1 covers 58% (film study edge)
• RUST vs REST: Bye teams went 0-4 in Quarterfinals last year - momentum matters
• G5 IN PLAYOFF: Take the points, not ML - talent gap is real but can cover spreads
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
    } else {
      // Bowl game - might still have venue info
      const venue = parseCfpVenue(gameInfo);
      if (venue) {
        game.venue = venue;
        console.log(`[Scout Report] ✓ Bowl Venue: ${venue}`);
      }
      
      // Bowl games are typically neutral site
      game.isNeutralSite = true;
      game.gameSignificance = gameInfo;
      
      return `
🏈 BOWL GAME CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${gameInfo}

⚠️ BOWL GAME BETTING NOTES:
• Most bowls are NEUTRAL SITES - home field advantage is minimal or nonexistent
• Player opt-outs for NFL Draft are CRITICAL - star players may not play
• Motivation varies: Some teams excited, others disappointed with bowl placement
• Long layoffs (3-4 weeks) can cause rust or allow injured players to return
• Coaching changes can impact team focus and scheme preparation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
    }
  } catch (error) {
    console.error('[Scout Report] Error fetching bowl/CFP context:', error.message);
    return '';
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
    
    // NCAAF season is 2025
    const season = 2025;
    
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
    if (!players) return `${isHome ? '🏠' : '✈️'} ${teamName}: Roster unavailable`;
    
    const lines = [`${isHome ? '🏠' : '✈️'} ${teamName}:`];
    
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
🏈 KEY PLAYERS (CURRENT ROSTER - USE THESE NAMES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${homeSection}

${awaySection}

⚠️ CRITICAL: Only reference players listed above. Do NOT mention players
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
      gapAnalysis = 'Same tier - even playing field. Focus on current form and matchup specifics.';
    } else if (tierGap === 1) {
      gapAnalysis = 'One tier gap - slight edge to higher tier, but very beatable.';
    } else if (tierGap === 2) {
      gapAnalysis = 'Two tier gap - noticeable talent disparity. Look for situational edges.';
    } else {
      gapAnalysis = 'THREE+ TIER GAP - significant mismatch ON PAPER. Focus on spread value.';
    }
    
    return `
CONFERENCE TIER CONTEXT (NCAAF)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏠 ${homeTeam}: ${homeConf} (Tier ${homeTier.tier} - ${homeTier.label})
✈️ ${awayTeam}: ${awayConf} (Tier ${awayTier.tier} - ${awayTier.label})

📊 TIER GAP: ${tierGap} level${tierGap !== 1 ? 's' : ''}
   ${gapAnalysis}

💡 Conference tiers reflect recruiting power and quality of opponents.
   Stats can look different across conferences - putting up 30 PPG in the
   MAC is different than doing so in the SEC. Consider this context.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
  } catch (error) {
    console.warn('[Scout Report] Error fetching conference tiers:', error.message);
    return '';
  }
}

/**
 * Fetch NCAAB NCAA Tournament Context (NET Rankings + Quad Records)
 * This is critical for understanding team quality and tournament positioning
 * 
 * NOTE: Perplexity has auth issues (401 errors) - now provided by Gemini Grounding
 * The NCAAB Gemini Grounding prompt includes KenPom, NET, SOS, and Quad records
 */
async function fetchNcaabTournamentContext(homeTeam, awayTeam) {
  try {
    console.log(`[Scout Report] NCAAB Tournament context (NET + Quad) - using Gemini Grounding instead of Perplexity`);
    
    // NOTE: Perplexity has auth issues (401 errors) - skip this call
    // The NCAAB Gemini Grounding prompt now includes:
    // - KenPom rankings and ratings (AdjEM, AdjO, AdjD, Tempo)
    // - NET rankings
    // - Strength of Schedule (SOS)
    // - Quad 1/2/3/4 records
    // This context is already captured in the main scout report
    return '';
    
    /* DISABLED: Perplexity API has 401 auth issues
    const query = `What are the current NCAA NET rankings and Quad records for ${homeTeam} and ${awayTeam} college basketball teams in the 2024-25 season?

For each team provide:
1. NET Ranking (1-362)
2. Quad 1 record (wins-losses vs top 30 home, top 50 neutral, top 75 away)
3. Quad 2 record (wins-losses)
4. Quad 3 record (wins-losses)
5. Quad 4 record (wins-losses)

NET rankings and Quad records are from ncaa.com and are the primary metrics used for NCAA Tournament selection.`;

    const response = await perplexityService.search(query, {
      model: 'sonar',
      temperature: 0.2,
      maxTokens: 800,
      systemMessage: 'You are a college basketball expert. Provide accurate NET rankings and Quad records. Be specific with numbers.'
    });
    
    const content = response?.data || response?.content || '';
    
    if (!content || content.length < 50) {
      console.warn('[Scout Report] NCAAB tournament context response too short');
      return '';
    }
    
    // Extract NET rankings - handle various response formats
    const extractNetRanking = (text, teamName) => {
      // Get just the team name without mascot for more flexible matching
      const teamParts = teamName.split(' ');
      const shortName = teamParts.length > 1 ? teamParts.slice(0, -1).join(' ') : teamName;
      
      // Escape special regex characters in team name
      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedShort = escapeRegex(shortName);
      const escapedFull = escapeRegex(teamName);
      
      const patterns = [
        // "Xavier Musketeers (NET #101)" - most common format
        new RegExp(`${escapedFull}\\s*\\(NET\\s*#?(\\d{1,3})\\)`, 'i'),
        new RegExp(`${escapedShort}\\s*\\(NET\\s*#?(\\d{1,3})\\)`, 'i'),
        // "NET Ranking: 101" after team name
        new RegExp(`${escapedShort}[^\\d]{0,50}NET\\s*(?:Ranking)?[:\\s]*#?(\\d{1,3})(?!\\d)`, 'i'),
        // "NET #101" or "#101" near team name
        new RegExp(`${escapedShort}[^\\d]{0,30}#(\\d{1,3})(?!\\d)`, 'i'),
        // Reverse patterns
        new RegExp(`NET\\s*#?(\\d{1,3})(?!\\d)[^\\d]{0,30}${escapedShort}`, 'i'),
        new RegExp(`#(\\d{1,3})(?!\\d)[^\\n]{0,20}${escapedShort}`, 'i'),
      ];
      
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          const num = parseInt(match[1]);
          if (num >= 1 && num <= 362) {
            return num;
          }
        }
      }
      return null;
    };
    
    // Extract Quad records for a specific team
    const extractQuadRecords = (text, teamName) => {
      const teamParts = teamName.split(' ');
      const shortName = teamParts.length > 1 ? teamParts.slice(0, -1).join(' ') : teamName;
      
      // Find the section of text related to this team
      const teamIdx = text.toLowerCase().indexOf(shortName.toLowerCase());
      const nextTeamIdx = text.toLowerCase().indexOf(shortName.toLowerCase(), teamIdx + shortName.length + 50);
      
      // Use the section around the team mention, or the whole text if not found
      let teamSection = text;
      if (teamIdx !== -1) {
        const endIdx = nextTeamIdx !== -1 ? nextTeamIdx : teamIdx + 500;
        teamSection = text.substring(Math.max(0, teamIdx - 50), Math.min(text.length, endIdx));
      }
      
      const extractQuad = (section, quadNum) => {
        const patterns = [
          new RegExp(`[Qq]uad\\s*${quadNum}[^\\d]{0,10}(\\d+-\\d+)`, 'i'),
          new RegExp(`Q${quadNum}[^\\d]{0,10}(\\d+-\\d+)`, 'i'),
          new RegExp(`${quadNum}[^\\d]{0,5}(\\d+-\\d+)`, 'i')
        ];
        
        for (const pattern of patterns) {
          const match = section.match(pattern);
          if (match) return match[1];
        }
        return 'N/A';
      };
      
      return {
        q1: extractQuad(teamSection, 1),
        q2: extractQuad(teamSection, 2),
        q3: extractQuad(teamSection, 3),
        q4: extractQuad(teamSection, 4)
      };
    };
    
    const homeNet = extractNetRanking(content, homeTeam);
    const awayNet = extractNetRanking(content, awayTeam);
    const homeQuads = extractQuadRecords(content, homeTeam);
    const awayQuads = extractQuadRecords(content, awayTeam);
    
    // Build the section
    let section = `
🏀 NCAA TOURNAMENT CONTEXT (NET Rankings & Quad Records)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    // Home team
    section += `📊 ${homeTeam}
   NET Ranking: ${homeNet ? `#${homeNet}` : 'See raw data below'}
   Quad 1: ${homeQuads.q1} | Quad 2: ${homeQuads.q2} | Quad 3: ${homeQuads.q3} | Quad 4: ${homeQuads.q4}

`;

    // Away team  
    section += `📊 ${awayTeam}
   NET Ranking: ${awayNet ? `#${awayNet}` : 'See raw data below'}
   Quad 1: ${awayQuads.q1} | Quad 2: ${awayQuads.q2} | Quad 3: ${awayQuads.q3} | Quad 4: ${awayQuads.q4}

`;

    // Add context about what this means
    if (homeNet && awayNet) {
      const netGap = Math.abs(homeNet - awayNet);
      const favorite = homeNet < awayNet ? homeTeam : awayTeam;
      
      if (netGap > 100) {
        section += `⚠️ NET GAP: ${netGap} spots - Major talent disparity. ${favorite} significantly stronger per NCAA metrics.
`;
      } else if (netGap > 50) {
        section += `📈 NET GAP: ${netGap} spots - Notable difference. ${favorite} has edge in tournament metrics.
`;
      } else if (netGap > 20) {
        section += `📊 NET GAP: ${netGap} spots - Moderate difference. Consider Quad records for more context.
`;
      } else {
        section += `⚖️ NET GAP: ${netGap} spots - Similar NET rankings. This is a competitive matchup on paper.
`;
      }
    }

    // Add raw data so Gary always has context even if parsing fails
    const hasValidData = homeNet || awayNet || homeQuads.q1 !== 'N/A' || awayQuads.q1 !== 'N/A';
    if (!hasValidData && content.length > 100) {
      section += `
📝 RAW NCAA DATA (parsing may vary - use this for context):
${content.substring(0, 600)}${content.length > 600 ? '...' : ''}

`;
    }

    section += `
💡 Quad 1 wins are resume builders. Quad 3/4 losses are resume killers.
   NET ranking reflects overall team quality. Higher Quad 1 record = battle-tested.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

    console.log(`[Scout Report] ✓ NCAAB Tournament context: ${homeTeam} NET #${homeNet || '?'}, ${awayTeam} NET #${awayNet || '?'}`);
    
    return section;
    */ // END DISABLED PERPLEXITY CODE
  } catch (error) {
    console.warn('[Scout Report] NCAAB tournament context fetch failed:', error.message);
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
    '🎯 STARTING QUARTERBACKS THIS WEEK',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  ];
  
  // Track if there's a QB situation that affects historical records
  let homeQbChangeSituation = null;
  let awayQbChangeSituation = null;
  
  if (qbs.home) {
    const qb = qbs.home;
    const backupLabel = qb.isBackup ? ' 🚨 BACKUP STARTING (starter injured)' : '';
    lines.push(`🏠 ${homeTeam}: ${qb.name} (#${qb.jerseyNumber || '?'})${backupLabel}`);
    lines.push(`   ${qb.gamesPlayed || '?'} GP | ${qb.passingYards || 0} yds | ${qb.passingTds || 0} TD / ${qb.passingInterceptions || 0} INT | ${qb.passingCompletionPct ? qb.passingCompletionPct.toFixed(1) : '?'}% | Rating: ${qb.qbRating ? qb.qbRating.toFixed(1) : '?'}`);
    // Add experience warning for rookie/inexperienced QBs
    if (qb.experienceNote) {
      lines.push(`   ${qb.experienceNote}`);
      lines.push(`   ⚠️ SIGNIFICANT: Factor this inexperience into your analysis - expect nerves, mistakes, and unpredictability.`);
      homeQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: qb.isBackup };
    } else if (qb.isBackup) {
      lines.push(`   ⚠️ SIGNIFICANT: This is a backup QB - expect potential regression from normal team stats.`);
      lines.push(`   Consider: limited experience, chemistry issues, possible game plan adjustments.`);
      homeQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: true };
    } else if ((qb.gamesPlayed || 0) <= 5) {
      // Even if not flagged as backup, very few games = new starter this season
      homeQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: false };
    }
  } else {
    lines.push(`🏠 ${homeTeam}: QB data unavailable`);
  }
  
  if (qbs.away) {
    const qb = qbs.away;
    const backupLabel = qb.isBackup ? ' 🚨 BACKUP STARTING (starter injured)' : '';
    lines.push(`✈️ ${awayTeam}: ${qb.name} (#${qb.jerseyNumber || '?'})${backupLabel}`);
    lines.push(`   ${qb.gamesPlayed || '?'} GP | ${qb.passingYards || 0} yds | ${qb.passingTds || 0} TD / ${qb.passingInterceptions || 0} INT | ${qb.passingCompletionPct ? qb.passingCompletionPct.toFixed(1) : '?'}% | Rating: ${qb.qbRating ? qb.qbRating.toFixed(1) : '?'}`);
    // Add experience warning for rookie/inexperienced QBs
    if (qb.experienceNote) {
      lines.push(`   ${qb.experienceNote}`);
      lines.push(`   ⚠️ SIGNIFICANT: Factor this inexperience into your analysis - expect nerves, mistakes, and unpredictability.`);
      awayQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: qb.isBackup };
    } else if (qb.isBackup) {
      lines.push(`   ⚠️ SIGNIFICANT: This is a backup QB - expect potential regression from normal team stats.`);
      lines.push(`   Consider: limited experience, chemistry issues, possible game plan adjustments.`);
      awayQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: true };
    } else if ((qb.gamesPlayed || 0) <= 5) {
      // Even if not flagged as backup, very few games = new starter this season
      awayQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: false };
    }
  } else {
    lines.push(`✈️ ${awayTeam}: QB data unavailable`);
  }
  
  lines.push('');
  
  // Add QB CHANGE IMPACT section if either team has a new/backup QB
  if (homeQbChangeSituation || awayQbChangeSituation) {
    lines.push('');
    lines.push('🚨 QB CHANGE IMPACT ON HISTORICAL RECORDS');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (homeQbChangeSituation) {
      const qb = homeQbChangeSituation;
      lines.push(`⚠️ ${homeTeam}:`);
      lines.push(`   Current QB: ${qb.name} (${qb.gamesPlayed} career starts)`);
      if (qb.gamesPlayed <= 2) {
        lines.push(`   📊 CRITICAL: This team's HOME RECORD and HISTORICAL STATS were built`);
        lines.push(`      with a DIFFERENT quarterback. Those records are NOT relevant.`);
        lines.push(`   🎯 IGNORE their past home/away splits - this is essentially a NEW team.`);
      } else if (qb.gamesPlayed <= 5) {
        lines.push(`   📊 NOTE: Limited sample size with this QB - historical trends may not apply.`);
      }
    }
    
    if (awayQbChangeSituation) {
      const qb = awayQbChangeSituation;
      lines.push(`⚠️ ${awayTeam}:`);
      lines.push(`   Current QB: ${qb.name} (${qb.gamesPlayed} career starts)`);
      if (qb.gamesPlayed <= 2) {
        lines.push(`   📊 CRITICAL: This team's ROAD RECORD and HISTORICAL STATS were built`);
        lines.push(`      with a DIFFERENT quarterback. Those records are NOT relevant.`);
        lines.push(`   🎯 IGNORE their past home/away splits - this is essentially a NEW team.`);
      } else if (qb.gamesPlayed <= 5) {
        lines.push(`   📊 NOTE: Limited sample size with this QB - historical trends may not apply.`);
      }
    }
    
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
  }
  
  lines.push('⚠️ CRITICAL: Use the QB names above when discussing quarterbacks.');
  lines.push('   Do NOT guess or use outdated QB information.');
  lines.push('');
  
  return lines.join('\n');
}

export { fetchGroundedContext };
export default { buildScoutReport, fetchGroundedContext };

