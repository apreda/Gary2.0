/**
 * Scout Report Builder
 * 
 * Builds the initial context that helps Gary form a unique hypothesis.
 * This is the "Level 1" context that Gary always receives.
 */

import { ballDontLieService } from '../../ballDontLieService.js';
import { formatTokenMenu } from '../tools/toolDefinitions.js';
import { fixBdlInjuryStatus } from '../sharedUtils.js';
import { generateGameSignificance } from './gameSignificanceGenerator.js';
// All context comes from Gemini 3 Flash with Google Search Grounding
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
// NOTE: Using Gemini Grounding with site:rotowire.com instead of Puppeteer scraper
// Grounding is more reliable and provides CONTEXT (injury duration, when it happened)

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

    // Calculate current season dynamically
    // NBA 2025-26 season = season parameter "2025" (BDL uses starting year of season)
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    // NBA: Oct-Dec = current year season, Jan-Jun = previous year season
    const currentSeason = currentMonth >= 10 ? currentYear : currentYear - 1;

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
        
        // Find teams in standings by matching team name or full_name
        const findTeam = (teamName) => {
          const nameLower = teamName.toLowerCase();
          return standings.find(s => {
            const bdlName = (s.team?.name || '').toLowerCase();
            const bdlFullName = (s.team?.full_name || '').toLowerCase();
            return nameLower.includes(bdlName) || bdlFullName.includes(nameLower) || 
                   bdlName.includes(nameLower.split(' ').pop()) || // Match by last word (e.g., "Celtics")
                   nameLower.split(' ').pop() === bdlName.split(' ').pop();
          });
        };
        
        const homeStanding = findTeam(homeTeam);
        const awayStanding = findTeam(awayTeam);
        
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
NOTE: This is CONTEXT ONLY - not a predictor. A #1 team can lose to a #15 team.
Use this to understand where teams sit in the league RIGHT NOW (not from training data).
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
        // Find teams in standings by matching team name or full_name
        const findTeam = (teamName) => {
          const nameLower = teamName.toLowerCase();
          return standings.find(s => {
            const bdlName = (s.team?.name || '').toLowerCase();
            const bdlFullName = (s.team?.full_name || '').toLowerCase();
            return nameLower.includes(bdlName) || bdlFullName.includes(nameLower) || 
                   bdlName.includes(nameLower.split(' ').pop()) ||
                   nameLower.split(' ').pop() === bdlName.split(' ').pop();
          });
        };
        
        const homeStanding = findTeam(homeTeam);
        const awayStanding = findTeam(awayTeam);
        
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
NOTE: This is CONTEXT ONLY - not a predictor. Home ice matters in NHL.
Use this to understand where teams sit in the league RIGHT NOW (not from training data).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${snapshot.join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }
    
    // NCAAB: Conference standings (conference record is more important than overall)
    if (sport === 'NCAAB') {
      // For NCAAB, we need to fetch standings by conference
      // ncaabConferenceIds should be passed from the roster depth call
      if (!ncaabConferenceIds || (!ncaabConferenceIds.home && !ncaabConferenceIds.away)) {
        return ''; // Can't fetch NCAAB standings without conference IDs
      }
      
      // Use ?? to coerce null to 0 (BDL can return null for 0 wins/losses)
      const formatRec = (s) => `${s.wins ?? 0}-${s.losses ?? 0}`;
      const formatConfRec = (s) => s.conference_record || `${s.wins ?? 0}-${s.losses ?? 0}`;
      
      // Find teams in standings
      const findTeam = (standings, teamName) => {
        const nameLower = teamName.toLowerCase();
        return standings.find(s => {
          const bdlName = (s.team?.name || '').toLowerCase();
          const bdlFullName = (s.team?.full_name || '').toLowerCase();
          const bdlCollege = (s.team?.college || '').toLowerCase();
          return nameLower.includes(bdlName) || bdlFullName.includes(nameLower) ||
                 bdlName.includes(nameLower.split(' ').pop()) ||
                 bdlCollege.includes(nameLower.split(' ')[0]);
        });
      };
      
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
        
        const homeStanding = findTeam(homeConf, homeTeam);
        const awayStanding = findTeam(awayConf, awayTeam);
        
        snapshot.push('TONIGHT\'S TEAMS IN CONFERENCE STANDINGS:');
        snapshot.push(`  [HOME] ${formatTeamStanding(homeTeam, homeStanding)}`);
        snapshot.push(`  [AWAY] ${formatTeamStanding(awayTeam, awayStanding)}`);
        snapshot.push('');
        snapshot.push('NOTE: CONFERENCE RECORD is more important for NCAAB - it determines tournament seeding.');
        snapshot.push('   Overall record can be inflated by weak non-conference schedules.');
      }
      
      return `
NCAAB CONFERENCE STANDINGS (CURRENT 2025-26 SEASON FROM BDL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NOTE: CONFERENCE RECORD matters more than overall in college basketball.
Use this to understand where teams sit in their conference RIGHT NOW.
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
      
      // Find teams in standings
      const findTeam = (teamName) => {
        const nameLower = teamName.toLowerCase();
        return standings.find(s => {
          const bdlName = (s.team?.name || '').toLowerCase();
          const bdlFullName = (s.team?.full_name || '').toLowerCase();
          return nameLower.includes(bdlName) || bdlFullName.includes(nameLower) ||
                 bdlName.includes(nameLower.split(' ').pop());
        });
      };
      
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
        const homeStanding = findTeam(homeTeam);
        const awayStanding = findTeam(awayTeam);
        
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
NOTE: This is CONTEXT ONLY - not a predictor. Any Given Sunday applies.
Division record matters for tiebreakers. Check team's home vs road splits.
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
NOTE: This is CONTEXT ONLY - not a predictor. A #1 team can lose to a #15 team.
Use this to understand where teams sit in the league RIGHT NOW (not from training data).
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
export async function buildScoutReport(game, sport) {
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  const sportKey = normalizeSport(sport);
  
  // Fetch basic data in parallel
  // Headlines/storylines come from fetchCurrentState via narrativeContext
  const [homeProfile, awayProfile, injuries, recentHome, recentAway, standingsSnapshot] = await Promise.all([
    fetchTeamProfile(homeTeam, sportKey),
    fetchTeamProfile(awayTeam, sportKey),
    fetchInjuries(homeTeam, awayTeam, sportKey),
    fetchRecentGames(homeTeam, sportKey, 5),
    fetchRecentGames(awayTeam, sportKey, 5),
    fetchStandingsSnapshot(sportKey, homeTeam, awayTeam)
  ]);
  
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
        dateStr = new Date().toISOString().slice(0, 10);
      }
      console.log(`[Scout Report] Fetching NBA game context via Gemini Grounding for ${dateStr}...`);
      
      // Dynamic query to identify regular season, NBA Cup, playoffs, etc.
      const contextQuery = `Given this NBA game: ${awayTeam} vs ${homeTeam} on ${dateStr}.

Determine:
1. GAME TYPE: Is this a regular season game, NBA Cup (In-Season Tournament) game, playoff game, or other? If NBA Cup, specify the round (group stage, quarterfinal, semifinal, championship).
2. VENUE: What is the actual arena/venue name and city where this game is being played? (NBA Cup knockout rounds are at T-Mobile Arena in Las Vegas; regular season games are at the home team's arena)
3. GAME SIGNIFICANCE: If this is a special game (NBA Cup, playoff, rivalry, etc.), briefly explain its significance and what's at stake.
4. TOURNAMENT CONTEXT: If this is an NBA Cup game, what are each team's results/path in this year's tournament so far?

Be specific and factual. If it's just a regular season game, say so clearly.`;

      const contextResult = await geminiGroundingSearch(contextQuery, { 
        temperature: 1.0, 
        maxTokens: 1500 
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
    // Calculate current NBA season (for 2025-26 season in Jan 2026, use season=2025)
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const nbaSeason = currentMonth >= 10 ? currentYear : currentYear - 1;
    
    // Fetch in parallel: RotoWire lineups + BDL roster depth
    const [keyPlayers, rosterDepth] = await Promise.all([
      fetchNbaKeyPlayers(homeTeam, awayTeam, sportKey),
      ballDontLieService.getNbaRosterDepth(homeTeam, awayTeam, nbaSeason)
    ]);
    nbaKeyPlayers = keyPlayers;
    nbaRosterDepth = rosterDepth;
    // Note: fetchNbaKeyPlayers now throws on roster failure - no need for immediatePass check
  }
  
  // For NHL, fetch key players (roster + stats) to prevent hallucinations
  let nhlKeyPlayers = null;
  let nhlRosterDepth = null;
  if (sportKey === 'NHL') {
    // Calculate current NHL season (for 2025-26 season in Jan 2026, use season=2025)
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    // NHL: Oct-Dec = current year season, Jan-June = previous year season
    const nhlSeason = currentMonth >= 10 ? currentYear : currentYear - 1;
    
    // Fetch in parallel: RotoWire lineups + BDL roster depth
    const [keyPlayers, rosterDepth] = await Promise.all([
      fetchNhlKeyPlayers(homeTeam, awayTeam, sportKey),
      ballDontLieService.getNhlRosterDepth(homeTeam, awayTeam, nhlSeason)
    ]);
    nhlKeyPlayers = keyPlayers;
    nhlRosterDepth = rosterDepth;
  }
  
  // For NCAAB, fetch roster depth (top 9 contributors) and conference standings
  let ncaabRosterDepth = null;
  let ncaabConferenceIds = null;
  let ncaabStandingsSnapshot = '';
  if (sportKey === 'NCAAB') {
    // Calculate current NCAAB season (Nov-Apr = current academic year, e.g., Jan 2026 = 2025 season)
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const ncaabSeason = (currentMonth >= 11 || currentMonth <= 4) 
      ? (currentMonth >= 11 ? currentYear : currentYear - 1) 
      : currentYear - 1;
    
    try {
      ncaabRosterDepth = await ballDontLieService.getNcaabRosterDepth(homeTeam, awayTeam, ncaabSeason);
      // Store conference IDs for standings fetch
      if (ncaabRosterDepth) {
        ncaabConferenceIds = {
          home: ncaabRosterDepth.homeConferenceId,
          away: ncaabRosterDepth.awayConferenceId
        };
        // Fetch NCAAB standings after we have conference IDs
        ncaabStandingsSnapshot = await fetchStandingsSnapshot(sportKey, homeTeam, awayTeam, ncaabConferenceIds);
      }
    } catch (e) {
      console.warn('[Scout Report] NCAAB roster depth error:', e.message);
    }
  }
  
  // For NFL, fetch roster depth (key skill players)
  let nflRosterDepth = null;
  let nflPlayoffHistory = null;
  let nflHomeTeamId = null;
  let nflAwayTeamId = null;
  if (sportKey === 'NFL') {
    // NFL season: Sept-Dec = current year, Jan-Feb = previous year (2025 NFL season = Sept 2025 - Feb 2026)
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const nflSeason = currentMonth >= 9 ? currentYear : currentYear - 1;
    
    try {
      nflRosterDepth = await ballDontLieService.getNflRosterDepth(homeTeam, awayTeam, nflSeason);
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
  
  // For NCAAB, fetch NET rankings and Quad records (critical for tournament context)
  let ncaabTournamentContext = '';
  if (sportKey === 'NCAAB') {
    ncaabTournamentContext = await fetchNcaabTournamentContext(homeTeam, awayTeam);
  }
  
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
      // Fetch standings for significance generation
      const bdlSport = sportToBdlKey(sportKey);
      if (bdlSport && sportKey !== 'NCAAF') {
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        const currentSeason = currentMonth >= 10 ? currentYear : currentYear - 1;
        const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason });

        if (standings && standings.length > 0) {
          const significance = generateGameSignificance(
            { home_team: homeTeam, away_team: awayTeam, venue: game.venue },
            sportKey,
            standings,
            game.week || null
          );
          if (significance) {
            game.gameSignificance = significance;
            console.log(`[Scout Report] ✓ Game significance: ${significance}`);
          }
        }
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
    
    // Also scan the narrative for long-term injury indicators and add those players
    const narrativeText = injuries.narrativeContext || '';
    const longTermPatterns = [
      /\*?\*?([A-Z][a-z]+ [A-Z][a-z]+)[^-]*(?:OUT|out)[^-]*(?:since (?:Oct|Nov|Dec|Sep)|missed (?:\d{2,}|\d+ games)|season-ending|out for (?:the )?(?:season|year)|ACL|surgery)/gi,
      /([A-Z][a-z]+ [A-Z][a-z]+)[^-]*(?:LONG-TERM|long-term|ADJUSTED)/gi
    ];
    longTermPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(narrativeText)) !== null) {
        const name = match[1]?.trim();
        if (name && name.length > 5) excludedLongTerm.add(name);
      }
    });
    
    if (excludedLongTerm.size > 0) {
      console.log(`[Scout Report] Excluding ${excludedLongTerm.size} long-term injured players from narrative: ${Array.from(excludedLongTerm).join(', ')}`);
    }
    
    if (allowedNames.size > 0) {
      console.log(`[Scout Report] Scrubbing ${sportKey} narrative with ${allowedNames.size} allowed player names...`);
      const scrubbed = await scrubNarrative(injuries.narrativeContext, Array.from(allowedNames), homeTeam, awayTeam, Array.from(excludedLongTerm));
      injuries.narrativeContext = scrubbed;
    }
  }

  // NBA IMMEDIATE PASS LOGIC
  // Skip games where key player availability is uncertain to avoid wasting tokens
  // DYNAMIC KEY PLAYER DETECTION: Uses top 5 usage rate players from BDL data
  // instead of static "star" labels - this is data-driven, not subjective
  let immediatePass = false;
  let passReason = '';
  let keyPlayerOutFlags = []; // Track key players OUT for investigation (not a pass, but Gary should analyze)

  if (sportKey === 'NBA') {
    
    /**
     * Dynamically fetch top 5 usage players for a team from BDL
     * Usage = FGA + FTA*0.44 + TOV (standard usage formula components)
     * This replaces the static "star players" map with real data
     * Also tags players with injury status if available
     */
    const getTopUsagePlayers = async (teamId, teamName, teamInjuries = []) => {
      try {
        // Get current season
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        const season = currentMonth >= 10 ? currentYear : currentYear - 1;
        
        // Fetch active players for the team
        const playersRaw = await ballDontLieService.getPlayersActive('basketball_nba', { 
          team_ids: [teamId], 
          per_page: 15 
        });
        const players = Array.isArray(playersRaw) ? playersRaw : (playersRaw?.data || []);
        
        if (players.length === 0) {
          console.log(`[Scout Report] No active players found for ${teamName} (ID: ${teamId})`);
          return [];
        }
        
        const playerIds = players.slice(0, 12).map(p => p.id);
        const playerMap = Object.fromEntries(players.map(p => [p.id, `${p.first_name} ${p.last_name}`.toLowerCase().trim()]));
        
        // Fetch season averages using correct BDL API v1 endpoint
        // Format: /nba/v1/season_averages/{category}?type={type}&season={season}&player_ids[]=...
        const playerIdsParam = playerIds.map(id => `player_ids[]=${id}`).join('&');
        const url = `https://api.balldontlie.io/nba/v1/season_averages/general?type=base&season=${season}&season_type=regular&${playerIdsParam}`;
        const response = await fetch(url, {
          headers: { 'Authorization': process.env.BALLDONTLIE_API_KEY }
        });
        
        if (!response.ok) {
          console.log(`[Scout Report] Failed to fetch season averages for ${teamName}: ${response.status}`);
          return [];
        }
        
        const data = await response.json();
        // New API format returns stats nested under each player object
        const statsData = (data.data || []).map(d => ({
          player_id: d.player?.id,
          pts: d.stats?.pts || 0,
          fga: d.stats?.fga || 0,
          fta: d.stats?.fta || 0,
          turnover: d.stats?.tov || 0,
          min: d.stats?.min || 0
        }));
        
        // Calculate usage proxy and sort by highest usage
        const playersWithUsage = statsData
          .filter(s => (s.fga > 0 || s.pts > 0) && s.min && parseFloat(s.min) >= 20) // Must play 20+ min
          .map(s => {
            const playerName = playerMap[s.player_id] || `player ${s.player_id}`;
            // Check if this player has an injury
            const injury = (teamInjuries || []).find(inj => {
              const injName = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.toLowerCase().trim();
              return injName === playerName ||
                     injName.includes(playerName) ||
                     playerName.includes(injName) ||
                     (injName.split(' ').pop() === playerName.split(' ').pop() && playerName.split(' ').pop().length > 3);
            });
            return {
              playerId: s.player_id,
              name: playerName,
              usageProxy: (s.fga || 0) + (s.fta || 0) * 0.44 + (s.turnover || 0),
              ppg: s.pts || 0,
              min: s.min || 0,
              injuryStatus: injury ? injury.status : null
            };
          })
          .sort((a, b) => b.usageProxy - a.usageProxy)
          .slice(0, 5); // Top 5 usage players

        // Log with injury tags
        const playerStrings = playersWithUsage.map(p => {
          const base = `${p.name} (${p.ppg.toFixed(1)} ppg, ${p.min} min)`;
          return p.injuryStatus ? `${base} [${p.injuryStatus.toUpperCase()}]` : base;
        });
        console.log(`[Scout Report] Top 5 usage players for ${teamName}: ${playerStrings.join(', ')}`);

        return playersWithUsage.map(p => p.name);
      } catch (error) {
        console.log(`[Scout Report] Error fetching usage data for ${teamName}: ${error.message}`);
        return [];
      }
    };
    
    // Get team IDs from BDL
    const allTeams = await ballDontLieService.getTeams('basketball_nba');
    const findTeamId = (teamName) => {
      const normalizedName = teamName.toLowerCase().trim();
      const team = allTeams?.find(t => 
        t.full_name?.toLowerCase() === normalizedName ||
        t.name?.toLowerCase() === normalizedName.split(' ').pop() ||
        t.full_name?.toLowerCase().includes(normalizedName.split(' ').pop())
      );
      return team?.id;
    };
    
    const homeTeamId = findTeamId(homeTeam);
    const awayTeamId = findTeamId(awayTeam);

    const checkTeam = async (teamInjuries, teamName, teamId) => {
      // Dynamically get top 5 usage players from BDL data (with injury tagging)
      const keyPlayers = teamId ? await getTopUsagePlayers(teamId, teamName, teamInjuries) : [];
      
      if (keyPlayers.length === 0) {
        console.log(`[Scout Report] Could not determine key players for "${teamName}" - skipping key player check`);
      }
      
      // ONLY risky statuses - these create true uncertainty for betting
      // "Questionable" = 50/50 chance = TRUE UNCERTAINTY = PASS
      // "GTD" = Game-time decision = TRUE UNCERTAINTY = PASS
      // "Doubtful" = ~25% chance to play = Mostly OUT, but still carries more uncertainty than confirmed OUT
      const riskyStatuses = ['questionable', 'day-to-day', 'day to day', 'gtd', 'game-time'];
      
      // These are NOT risky for the PASS trigger - line already reflects these confirmed/near-confirmed statuses:
      // "Out" = confirmed out. Gary handles confirmed absences fine.
      const nonRiskyStatuses = ['out', 'ofs', 'ir', 'injured reserve', 'out for season', 'doubtful', 'prob', 'probable', 'available', 'active', 'unknown'];
      
      // Log all injuries for debugging
      if ((teamInjuries || []).length > 0) {
        console.log(`[Scout Report] ${teamName} injuries for pass check: ${teamInjuries.map(i => `${i.player?.first_name} ${i.player?.last_name} (${i.status})`).join(', ')}`);
      }
      
      for (const injury of (teamInjuries || [])) {
        const playerName = `${injury.player?.first_name || ''} ${injury.player?.last_name || ''}`.toLowerCase().trim();
        const status = (injury.status || '').toLowerCase();
        
        // Check if this player is a key player (top 5 usage)
        const isKeyPlayer = keyPlayers.some(keyPlayer => {
          // Exact match
          if (playerName === keyPlayer || keyPlayer === playerName) return true;
          // Contains match (either direction)
          if (playerName.includes(keyPlayer) || keyPlayer.includes(playerName)) return true;
          // Last name match for common cases
          const playerLast = playerName.split(' ').pop();
          const keyPlayerLast = keyPlayer.split(' ').pop();
          if (playerLast && keyPlayerLast && playerLast.length > 3 && playerLast === keyPlayerLast) return true;
          return false;
        });
        
        // Check if status is UNCERTAIN (risky) vs CONFIRMED/PROBABLE (not risky)
        // ONLY pass on true uncertainty - questionable/GTD
        const isNonRiskyStatus = nonRiskyStatuses.some(s => status.includes(s));
        const isRiskyStatus = riskyStatuses.some(s => status.includes(s)) && !isNonRiskyStatus;
        
        if (isKeyPlayer && isRiskyStatus) {
          // BEFORE passing, check if the player is in the EXPECTED STARTING LINEUP
          // If they're expected to start, assume they will play (don't pass)
          let playerInExpectedLineup = false;
          try {
            const gemini = getGeminiClient();
            if (gemini) {
              const model = gemini.getGenerativeModel({
                model: 'gemini-2.0-flash',
                tools: [{ googleSearch: {} }]
              });
              const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
              const starterQuery = `site:rotowire.com/basketball/nba-lineups.php ${teamName} expected starting lineup ${today}

Return ONLY the 5 player names in the Expected Lineup for ${teamName}. Format: Name1, Name2, Name3, Name4, Name5`;

              const result = await model.generateContent(starterQuery);
              const responseText = result.response?.text() || '';

              // Parse player names from response
              const names = responseText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+)+)/g) || [];
              const expectedStarters = names.map(n => n.toLowerCase().trim());

              const playerLast = playerName.split(' ').pop();
              playerInExpectedLineup = expectedStarters.some(starter => {
                const starterLast = starter.split(' ').pop();
                return starter.includes(playerLast) || playerName.includes(starterLast) || starter === playerName;
              });

              if (playerInExpectedLineup) {
                console.log(`[Scout Report] Key player ${injury.player?.first_name} ${injury.player?.last_name} is QUESTIONABLE but IN EXPECTED LINEUP - assuming they play (no pass)`);
              }
            }
          } catch (e) {
            console.log(`[Scout Report] Could not fetch expected starters for key player check: ${e.message}`);
          }

          // Only trigger pass if the player is NOT in the expected starting lineup
          if (!playerInExpectedLineup) {
            immediatePass = true;
            passReason = `Key player (top 5 usage) UNCERTAIN status for ${teamName}: ${injury.player?.first_name} ${injury.player?.last_name} (${injury.status})`;
            console.log(`[Scout Report] IMMEDIATE PASS TRIGGERED: ${passReason}`);
            return true;
          }
        }
        
        // Track key players who are confirmed OUT/OFS - Gary should INVESTIGATE the impact
        // These don't trigger a pass, but Gary needs to analyze how team adjusts
        if (isKeyPlayer && isNonRiskyStatus) {
          const statusLower = status.toLowerCase();
          const isRecentOut = statusLower.includes('out') || statusLower.includes('ofs') || statusLower.includes('ir');

          if (isRecentOut) {
            // Add to investigation flags - Gary should analyze the impact
            const playerName = `${injury.player?.first_name} ${injury.player?.last_name}`;
            const injuryNote = injury.return_date ? `since ${injury.return_date}` : (injury.comment || '');

            keyPlayerOutFlags.push({
              player: playerName,
              team: teamName,
              status: injury.status,
              note: injuryNote
            });

            console.log(`[Scout Report] ⚠️ KEY PLAYER OUT for ${teamName}: ${playerName} (${injury.status}) - INVESTIGATE IMPACT (who absorbs usage? how has team adjusted?)`);
          } else {
            console.log(`[Scout Report] Key player CONFIRMED/LIKELY PLAYING for ${teamName}: ${injury.player?.first_name} ${injury.player?.last_name} (${injury.status})`);
          }
        }
      }

      // 2. 3+ Rotation Players with UNCERTAIN status (regardless of key player status)
      // BUT: If a questionable player is in the EXPECTED STARTING LINEUP, assume they play
      const questionablePlayers = (teamInjuries || []).filter(i => {
        const s = (i.status || '').toLowerCase();
        const isNonRisky = nonRiskyStatuses.some(ns => s.includes(ns));
        return riskyStatuses.some(rs => s.includes(rs)) && !isNonRisky;
      });

      // If we have 3+ questionable, check if any are in expected starting lineup
      if (questionablePlayers.length >= 3) {
        // Fetch expected starters from Rotowire via grounding
        let expectedStarters = [];
        try {
          const gemini = getGeminiClient();
          if (gemini) {
            const model = gemini.getGenerativeModel({
              model: 'gemini-2.0-flash',
              tools: [{ googleSearch: {} }]
            });
            const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            const starterQuery = `site:rotowire.com/basketball/nba-lineups.php ${teamName} expected starting lineup ${today}

Return ONLY the 5 player names in the Expected Lineup for ${teamName}. Format: Name1, Name2, Name3, Name4, Name5`;

            const result = await model.generateContent(starterQuery);
            const responseText = result.response?.text() || '';

            // Parse player names from response
            const names = responseText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+)+)/g) || [];
            expectedStarters = names.map(n => n.toLowerCase().trim());
            console.log(`[Scout Report] Expected starters for ${teamName}: ${expectedStarters.join(', ')}`);
          }
        } catch (e) {
          console.log(`[Scout Report] Could not fetch expected starters: ${e.message}`);
        }

        // Filter out questionable players who are in expected starting lineup (they're expected to play)
        const trueQuestionable = questionablePlayers.filter(i => {
          const playerName = `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.toLowerCase().trim();
          const playerLast = playerName.split(' ').pop();

          const inStartingLineup = expectedStarters.some(starter => {
            const starterLast = starter.split(' ').pop();
            return starter.includes(playerLast) || playerName.includes(starterLast) || starter === playerName;
          });

          if (inStartingLineup) {
            console.log(`[Scout Report] ${playerName} is questionable BUT in expected lineup - assuming they play`);
            return false; // Don't count this player as questionable
          }
          return true;
        });

        if (trueQuestionable.length >= 3) {
          immediatePass = true;
          passReason = `3+ players questionable for ${teamName}: ${trueQuestionable.map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}`;
          console.log(`[Scout Report] IMMEDIATE PASS TRIGGERED: ${passReason}`);
          return true;
        } else {
          console.log(`[Scout Report] Only ${trueQuestionable.length} truly questionable (${questionablePlayers.length - trueQuestionable.length} in expected lineup) - NOT passing`);
        }
      }
      return false;
    };

    // Check both teams for key player injuries (async)
    const homePassTriggered = await checkTeam(injuries.home, homeTeam, homeTeamId);
    if (!homePassTriggered) {
      await checkTeam(injuries.away, awayTeam, awayTeamId);
    }
  }
  
  // NCAAB IMMEDIATE PASS LOGIC
  // College basketball has smaller rosters - GTD starters create too much uncertainty
  // GTD = Game Time Decision from RotoWire - these create betting uncertainty
  // KEY: Only count GTD players who are STARTERS (not bench players)
  if (sportKey === 'NCAAB' && !immediatePass) {
    // Match GTD status exactly as normalized (GTD, Questionable, etc)
    const gtdStatuses = ['gtd', 'game-time', 'game time decision', 'questionable', 'day-to-day', 'day to day'];
    
    // DEDICATED GTD CHECK: Fetch directly from RotoWire via targeted Gemini search
    // NOTE: RotoWire NCAAB splits games into "slates" by time:
    //   - Early slate (~6:30 PM): Games before 9 PM ET
    //   - Night slate (~9:00 PM): Games at 9 PM ET or later
    // Status codes: GTD = Game Time Decision, Out = Out, OFS = Out For Season
    let rotoWireGTD = { home: [], away: [] };
    let rotoWireStarters = { home: [], away: [] }; // Track starting lineups for verification
    try {
      const gemini = getGeminiClient();
      if (gemini) {
        const model = gemini.getGenerativeModel({ 
          model: 'gemini-3-flash-preview', // POLICY: Always Gemini 3 Flash
          tools: [{ googleSearch: {} }]
        });
        
        // Get short team names for better matching (e.g., "UCLA" from "UCLA Bruins")
        const awayShort = awayTeam.split(' ')[0];
        const homeShort = homeTeam.split(' ')[0];
        
        // Determine which slate based on game time
        let slateHint = 'the early "All Games" slate (6:30 PM)';
        if (game.commence_time) {
          const gameHour = new Date(game.commence_time).getUTCHours();
          // Convert UTC to ET (subtract 5 hours, or 4 during DST)
          const etHour = (gameHour - 5 + 24) % 24;
          if (etHour >= 21) { // 9 PM ET or later
            slateHint = 'the "Night" slate (9:00 PM)';
          }
        }
        
        // ENHANCED: Get BOTH starting lineups AND full injury list from RotoWire specifically
        // This matches EXACTLY what's shown on RotoWire's NCAAB lineups page
        const gtdQuery = `Search RotoWire NCAAB/CBB lineups page (rotowire.com/daily/ncaab/lineups.php) for ${awayShort} vs ${homeShort} January 2026

I need the EXACT information shown on RotoWire's college basketball lineups page for this game.

COPY THE EXACT FORMAT FROM ROTOWIRE:

=== ${awayTeam} ===
STARTERS:
PG: [full name]
SG: [full name]  
SF: [full name]
PF: [full name]
C: [full name]

INJURIES:
[Position] [Name] [Status]
(list ALL injuries from RotoWire with position letter G/F/C, player name, and status GTD/Out/OFS)

=== ${homeTeam} ===
STARTERS:
PG: [full name]
SG: [full name]
SF: [full name]
PF: [full name]
C: [full name]

INJURIES:
[Position] [Name] [Status]
(list ALL injuries from RotoWire with position letter G/F/C, player name, and status GTD/Out/OFS)

ALSO PROVIDE SUMMARY LINES:
${awayTeam} GTD PLAYERS: [comma-separated names of players marked "GTD" ONLY, or "None"]
${homeTeam} GTD PLAYERS: [comma-separated names of players marked "GTD" ONLY, or "None"]

STATUS DEFINITIONS FROM ROTOWIRE:
- GTD = Game Time Decision (uncertain - could play or sit)
- Out = Confirmed NOT playing tonight
- OFS = Out For Season (season-ending injury)

CRITICAL: Be precise. Only include what's actually shown on RotoWire. If a section says "None" or is empty, say "None".`;

        console.log(`[Scout Report] Fetching RotoWire lineups and GTD status for ${awayTeam} @ ${homeTeam}...`);
        const result = await model.generateContent(gtdQuery);
        const responseText = (result.response?.text() || '').trim();
        
        if (responseText) {
          console.log(`[Scout Report] RotoWire response: ${responseText.substring(0, 500)}`);
          
          // STEP 1: Parse starting lineups from response
          const parseStartingLineup = (text, teamName, teamShort) => {
            const starters = [];
            const teamNameLower = teamName.toLowerCase();
            const teamShortLower = teamShort.toLowerCase();
            
            // Words that should NOT be captured as player names
            const invalidWords = /^(lineup|the|top|injury|started|while|don't|starters?|starting|expected|projected|confirmed|position|each|player|based|depth|chart|following|information|available|status|currently|note|however|although|uncertain|questionable|gtd|out|ofs|season|college|basketball|game|january|february|march|april|december|november|2026|2025)$/i;
            
            // Pattern 1: "TeamName STARTERS:" followed by list
            const startersPatterns = [
              new RegExp(`${teamShortLower}[^:]*starters?:?\\s*([^\\n]+(?:\\n[^\\n]*){0,5})`, 'i'),
              new RegExp(`${teamNameLower}[^:]*starters?:?\\s*([^\\n]+(?:\\n[^\\n]*){0,5})`, 'i'),
              new RegExp(`starters?[^:]*${teamShortLower}:?\\s*([^\\n]+(?:\\n[^\\n]*){0,5})`, 'i')
            ];
            
            for (const pattern of startersPatterns) {
              const match = text.match(pattern);
              if (match) {
                const section = match[1];
                // Extract player names (look for position abbreviations followed by names)
                // Must have both first and last name (two capital words)
                const playerPattern = /(?:PG|SG|SF|PF|C)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi;
                let playerMatch;
                while ((playerMatch = playerPattern.exec(section)) !== null) {
                  const name = playerMatch[1].trim();
                  // Validate: must have at least 2 words, not invalid words
                  const words = name.split(/\s+/);
                  if (words.length >= 2 && 
                      !words.some(w => invalidWords.test(w)) &&
                      !starters.includes(name.toLowerCase())) {
                    starters.push(name.toLowerCase());
                  }
                }
                // Also look for comma separated full names
                const fullNamePattern = /([A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?\s+[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?)/g;
                while ((playerMatch = fullNamePattern.exec(section)) !== null) {
                  const name = playerMatch[1].trim();
                  const words = name.split(/\s+/);
                  if (words.length >= 2 && 
                      !words.some(w => invalidWords.test(w)) &&
                      !starters.includes(name.toLowerCase())) {
                    starters.push(name.toLowerCase());
                  }
                }
                if (starters.length >= 3) break; // Found enough starters
              }
            }
            
            if (starters.length > 0) {
              console.log(`[Scout Report] Parsed ${starters.length} starters for ${teamShort}: ${starters.slice(0, 5).join(', ')}`);
            } else {
              console.log(`[Scout Report] Could not parse starters for ${teamShort} from response`);
            }
            return starters;
          };
          
          // Parse starters for both teams
          rotoWireStarters.away = parseStartingLineup(responseText, awayTeam, awayShort);
          rotoWireStarters.home = parseStartingLineup(responseText, homeTeam, homeShort);
          
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
            const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
          
          // Legacy function for compatibility (now unused)
          const parseGTDPlayers = (text, teamName) => [];
          
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
      }
    } catch (e) {
      console.warn(`[Scout Report] RotoWire GTD check failed: ${e.message}`);
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
    
    // CRITICAL: Filter GTD players to only STARTERS
    // Bench players with GTD don't warrant a pass - only starters matter
    const isStarter = (playerName, startersList) => {
      if (!startersList || startersList.length === 0) return null; // Unknown - couldn't parse starters
      const nameLower = playerName.toLowerCase();
      const lastName = nameLower.split(' ').pop(); // Get last name
      const firstName = nameLower.split(' ')[0]; // Get first name
      
      return startersList.some(starter => {
        const starterLower = starter.toLowerCase();
        return starterLower === nameLower || 
               starterLower.includes(lastName) || 
               lastName.includes(starterLower) ||
               (firstName.length > 2 && starterLower.includes(firstName));
      });
    };
    
    // Filter to only GTD STARTERS
    const homeGTDStarters = homeGTD.filter(p => {
      const starterCheck = isStarter(p.name, rotoWireStarters.home);
      if (starterCheck === null) {
        // Couldn't parse starters - be conservative, assume could be starter
        console.log(`[Scout Report] Could not verify if ${p.name} is a ${homeTeam} starter (no lineup data)`);
        return true;
      }
      if (starterCheck) {
        console.log(`[Scout Report] ✓ ${p.name} IS a ${homeTeam} STARTER (GTD counts)`);
        return true;
      }
      console.log(`[Scout Report] ⊘ ${p.name} is NOT a ${homeTeam} starter (bench player - GTD doesn't count for pass)`);
      return false;
    });
    
    const awayGTDStarters = awayGTD.filter(p => {
      const starterCheck = isStarter(p.name, rotoWireStarters.away);
      if (starterCheck === null) {
        // Couldn't parse starters - be conservative, assume could be starter
        console.log(`[Scout Report] Could not verify if ${p.name} is an ${awayTeam} starter (no lineup data)`);
        return true;
      }
      if (starterCheck) {
        console.log(`[Scout Report] ✓ ${p.name} IS an ${awayTeam} STARTER (GTD counts)`);
        return true;
      }
      console.log(`[Scout Report] ⊘ ${p.name} is NOT an ${awayTeam} starter (bench player - GTD doesn't count for pass)`);
      return false;
    });
    
    console.log(`[Scout Report] NCAAB GTD STARTER Check - ${homeTeam}: ${homeGTDStarters.length} GTD starters, ${awayTeam}: ${awayGTDStarters.length} GTD starters`);
    
    // RULE 1: 2+ GTD STARTERS on same team = Automatic Pass
    // College rosters are smaller (13 scholarships) - 2 starters out is catastrophic uncertainty
    if (homeGTDStarters.length >= 2) {
      immediatePass = true;
      passReason = `NCAAB: 2+ STARTERS GTD for ${homeTeam}: ${homeGTDStarters.map(p => p.name).join(', ')} - too much lineup uncertainty`;
      console.log(`[Scout Report] NCAAB IMMEDIATE PASS: ${passReason}`);
    } else if (awayGTDStarters.length >= 2) {
      immediatePass = true;
      passReason = `NCAAB: 2+ STARTERS GTD for ${awayTeam}: ${awayGTDStarters.map(p => p.name).join(', ')} - too much lineup uncertainty`;
      console.log(`[Scout Report] NCAAB IMMEDIATE PASS: ${passReason}`);
    }
    
    // RULE 2: 1 GTD STARTER - check if they're a key/star player via Gemini Grounding
    // Only do this expensive check if we haven't already triggered a pass
    if (!immediatePass && (homeGTDStarters.length === 1 || awayGTDStarters.length === 1)) {
      const teamToCheck = homeGTDStarters.length === 1 ? homeTeam : awayTeam;
      const playerToCheck = homeGTDStarters.length === 1 ? homeGTDStarters[0] : awayGTDStarters[0];
      
      console.log(`[Scout Report] 🔍 Checking if ${playerToCheck.name} is a key player for ${teamToCheck}...`);
      
      try {
        const gemini = getGeminiClient();
        if (gemini) {
          const model = gemini.getGenerativeModel({ 
            model: 'gemini-3-flash-preview', // POLICY: Always Gemini 3 Flash
            tools: [{ googleSearch: {} }]
          });
          
          const keyPlayerQuery = `Is ${playerToCheck.name} a key/star player for ${teamToCheck} college basketball in the 2025-26 season?

Answer with ONLY one of these responses:
- "YES - [reason]" if they are a top 2-3 player, leading scorer, primary ball handler, or irreplaceable starter
- "NO - [reason]" if they are a role player, bench player, or easily replaceable

Consider: points per game, assists, team role, and overall importance to the team's success.`;

          const result = await model.generateContent(keyPlayerQuery);
          const response = (result.response?.text() || '').trim();
          
          console.log(`[Scout Report] 🔍 Key player check result: ${response.substring(0, 100)}`);
          
          if (response.toUpperCase().startsWith('YES')) {
            immediatePass = true;
            passReason = `NCAAB: Key player GTD for ${teamToCheck}: ${playerToCheck.name} (${playerToCheck.status}) - ${response.substring(0, 100)}`;
            console.log(`[Scout Report] NCAAB IMMEDIATE PASS: ${passReason}`);
          } else {
            console.log(`[Scout Report] ${playerToCheck.name} is not a key player - proceeding with analysis`);
          }
        }
      } catch (e) {
        console.warn(`[Scout Report] Key player check failed: ${e.message} - proceeding with caution`);
      }
    }
  }
  
  // Extract narrative context from Gemini Grounding (valuable even if injury parsing returned 0)
  // Limit character count to avoid data noise/API blocks
  let narrativeContext = injuries?.narrativeContext || null;
  if (narrativeContext && narrativeContext.length > 4000) {
    narrativeContext = narrativeContext.substring(0, 4000) + '... [TRUNCATED DUE TO LENGTH]';
  }
  
  // Build the scout report
  const matchupLabel = game.isNeutralSite ? `${awayTeam} vs ${homeTeam}` : `${awayTeam} @ ${homeTeam}`;
  const venueLabel = game.venue || (game.isNeutralSite ? 'Neutral Site' : `${homeTeam} Home`);
  const tournamentLabel = game.tournamentContext ? `[${game.tournamentContext}]` : '';
  
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
SEASON-LONG INJURIES - NOT RELEVANT TO TONIGHT

The following players have been OUT for 1-2+ MONTHS.
The team has FULLY ADAPTED. Their stats and usage have been REDISTRIBUTED to current players.
The CURRENT ROSTER is the team you are analyzing.

SEASON-LONG OUT: ${filteredPlayers.join(', ')}

These players' season averages are MISLEADING - that production now belongs to other players.
Investigate WHO IS PLAYING and their RECENT FORM, not hypotheticals about healthy rosters.
DO NOT cite these injuries as factors in your analysis - the market has fully adjusted.
</season_long_injuries>

` : '';

  // Generate injury report separately so we can log it for debugging
  const injuryReportText = formatInjuryReport(homeTeam, awayTeam, injuries, sportKey);

  // Debug: Log the injury report Gary will see (first 1000 chars)
  if (injuryReportText && injuryReportText.length > 50) {
    console.log(`[Scout Report] Injury report preview (${injuryReportText.length} chars):`);
    console.log(injuryReportText.substring(0, 1000));
    if (injuryReportText.length > 1000) console.log('...[truncated]');
  }

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

INJURY DURATION RULES (CRITICAL):
1. Check the duration tag for each injury: [RECENT], [MID-SEASON], or [SEASON-LONG]

2. SEASON-LONG (1-2+ months out):
   - Team has FULLY ADAPTED. Current roster IS the team.
   - Stats redistributed to current players. Look at RECENT FORM.
   - DO NOT cite as a factor. The market has adjusted.

3. MID-SEASON (3-6 weeks out):
   - Team PARTIALLY adapted. Check their record during this period.
   - May be context, not edge. Investigate how they have performed.

4. RECENT (< 2 weeks out):
   - Team is ADJUSTING. High uncertainty.
   - INVESTIGATE deeply. Potential edge if market has not fully adjusted.
   - Check their FEW games since the injury.

5. YOUR JOB: Focus on WHO IS PLAYING and RECENT FORM, not hypotheticals.
   The CURRENT ROSTER is the team you are betting on.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${narrativeContext ? `
CURRENT STATE & CONTEXT (PRIMARY INJURY SOURCE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This is what a knowledgeable fan would know about each team heading into this game.

[IMPORTANT] INJURY CITATION FILTER (APPLY BEFORE CITING ANY INJURY):
When you see an injury mentioned below, ASK YOURSELF:
- Has this player missed 3+ games already? → DO NOT CITE (priced in)
- Has this player been out for weeks? → DO NOT CITE (team has adjusted)
- Is this a FRESH absence (1-2 games max)? → You MAY cite if relevant

The CURRENT STATE below may mention players who've been out for weeks.
That's context for YOU to understand, but do NOT cite stale injuries as factors in your pick.

${narrativeContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}
REST & SCHEDULE SITUATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatRestSituation(homeTeam, awayTeam, calculateRestSituation(recentHome, game.commence_time, homeTeam), calculateRestSituation(recentAway, game.commence_time, awayTeam))}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${nbaRosterDepth ? formatNbaRosterDepth(homeTeam, awayTeam, nbaRosterDepth, injuries) : ''}${ncaabKeyPlayers ? formatNcaabKeyPlayers(homeTeam, awayTeam, ncaabKeyPlayers) : ''}${ncaabRosterDepth ? formatNcaabRosterDepth(homeTeam, awayTeam, ncaabRosterDepth, injuries) : ''}${nhlKeyPlayers ? formatNhlKeyPlayers(homeTeam, awayTeam, nhlKeyPlayers) : ''}${nhlRosterDepth ? formatNhlRosterDepth(homeTeam, awayTeam, nhlRosterDepth, injuries) : ''}${keyPlayers ? formatKeyPlayers(homeTeam, awayTeam, keyPlayers) : ''}${startingQBs ? formatStartingQBs(homeTeam, awayTeam, startingQBs) : ''}${nflRosterDepth ? formatNflRosterDepth(homeTeam, awayTeam, nflRosterDepth, injuries) : ''}${nflPlayoffHistory ? formatNflPlayoffHistory(homeTeam, awayTeam, nflPlayoffHistory, nflHomeTeamId, nflAwayTeamId) : ''}${ncaafKeyPlayers ? formatNcaafKeyPlayers(homeTeam, awayTeam, ncaafKeyPlayers) : ''}

TEAM IDENTITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatTeamIdentity(homeTeam, homeProfile, 'Home')}
${formatTeamIdentity(awayTeam, awayProfile, 'Away')}
${conferenceTierSection}${ncaabTournamentContext}
TALE OF THE TAPE (VERIFIED FROM BDL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${buildVerifiedTaleOfTape(homeTeam, awayTeam, homeProfile, awayProfile, sportKey, injuries, recentHome, recentAway)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECENT FORM (Last 5 Games)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatRecentForm(homeTeam, recentHome)}
${formatRecentForm(awayTeam, recentAway)}

HEAD-TO-HEAD HISTORY (THIS SEASON)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatH2HSection(h2hData, homeTeam, awayTeam)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KEY SITUATIONAL FACTORS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatSituationalFactors(game, injuries, sportKey)}

BETTING CONTEXT (For Reference Only - Do NOT base pick on these)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatOdds(game)}

IMPORTANT: Odds are shown for value assessment AFTER you form your 
statistical conclusion. Your analysis must be independently justified 
by stats. Do NOT use "big spread" or "expensive ML" as reasoning.

══════════════════════════════════════════════════════════════════════
AVAILABLE STAT CATEGORIES (use fetch_stats tool to request):
${formatTokenMenu(sportKey)}
══════════════════════════════════════════════════════════════════════
`.trim();

  // Build the verified Tale of the Tape for the orchestrator to use
  const verifiedTaleOfTape = buildVerifiedTaleOfTape(homeTeam, awayTeam, homeProfile, awayProfile, sportKey, injuries, recentHome, recentAway);
  
  // Return both the report text, structured injuries data, and venue/game context
  return {
    text: report,
    injuries: injuriesForStorage,
    immediatePass,
    passReason,
    // Key players confirmed OUT - Gary should INVESTIGATE impact (usage redistribution, team adjustment)
    keyPlayerOutFlags: keyPlayerOutFlags.length > 0 ? keyPlayerOutFlags : null,
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
 * Generate dynamic season string for Gemini Grounding queries
 * Returns format like "2025-26" for academic year sports (college, NBA, NHL)
 * @returns {string} - Season string like "2025-26"
 */
function getCurrentSeasonString() {
  const month = new Date().getMonth() + 1; // 1-indexed
  const year = new Date().getFullYear();
  // Academic year: Aug-Dec = year-(year+1), Jan-Jul = (year-1)-year
  const startYear = month >= 8 ? year : year - 1;
  const endYear = startYear + 1;
  return `${startYear}-${String(endYear).slice(-2)}`;
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
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const currentSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
    
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
    
    // Build params based on sport - NFL/NCAAF/NHL use seasons[], other sports use date range
    // Per BDL API docs: NFL/NHL games endpoint does NOT support start_date/end_date (documented for NBA)
    const usesSeasonParam = bdlSport === 'americanfootball_nfl' || 
                           bdlSport === 'americanfootball_ncaaf' ||
                           bdlSport === 'icehockey_nhl';
    
    let params;
    if (usesSeasonParam) {
      // NFL/NCAAF/NHL: Use seasons parameter - calculate dynamically
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      const season = month <= 7 ? year - 1 : year;
      params = {
        team_ids: [team.id],
        seasons: [season],
        per_page: 20
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
        const gameDate = new Date(g.date || g.datetime);
        const isPast = gameDate < today;
        // For season-based fetch, also check status is Final (if available)
        if (usesSeasonParam) {
          const status = (g.status || '').toLowerCase();
          const isFinished = status === 'final' || status === 'post' || status === 'off';
          return hasDate && isPast && isFinished;
        }
        return hasDate;
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

    // Helper for strict team matching - avoids "Nets" matching "Hornets"
    const findTeam = (teamName) => {
      const nameLower = teamName.toLowerCase();
      // Priority 1: Exact full name match
      const exactMatch = teams.find(t => t.full_name?.toLowerCase() === nameLower);
      if (exactMatch) return exactMatch;
      // Priority 2: Full name contains search (e.g., "Orlando Magic" includes "Orlando Magic")
      const containsMatch = teams.find(t => t.full_name?.toLowerCase().includes(nameLower));
      if (containsMatch) return containsMatch;
      // Priority 3: Search contains full name (but must match WHOLE words)
      // Use word boundary matching to avoid "Hornets" matching "Nets"
      const wordMatch = teams.find(t => {
        const teamFullName = t.full_name?.toLowerCase() || '';
        const teamShortName = t.name?.toLowerCase() || '';
        // Check if the ENTIRE short name appears as a word boundary in the search
        const shortNameRegex = new RegExp(`\\b${teamShortName}\\b`, 'i');
        return shortNameRegex.test(nameLower) || nameLower.includes(teamFullName);
      });
      return wordMatch || null;
    };

    const home = findTeam(homeTeam);
    const away = findTeam(awayTeam);

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
    
    // Calculate current season
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    // NFL/NCAAF: Aug-Feb spans years, NBA/NHL: Oct-Jun spans years
    const currentSeason = month <= 7 ? year - 1 : year;
    
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
      
      if (isMatch) {
        console.log(`[Scout Report] H2H Match found: ${game.date} - ${game.home_team?.full_name || game.home_team_id} vs ${game.visitor_team?.full_name || game.visitor_team_id} (Score: ${game.home_team_score}-${game.visitor_team_score})`);
      }
      
      const hasScores = (game.home_team_score > 0 || game.visitor_team_score > 0);
      // Ensure game is in the past (completed)
      const gameDate = new Date(game.date);
      const isPast = gameDate < new Date();
      return isMatch && hasScores && isPast;
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
      const homeScore = isHomeTeamHome ? game.home_team_score : game.visitor_team_score;
      const awayScore = isHomeTeamHome ? game.visitor_team_score : game.home_team_score;
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
  
  return lines.join('\n');
}

/**
 * Fetch injuries for both teams
 * SOURCE OF TRUTH varies by sport:
 * - NFL/NCAAF: BDL is PRIMARY (reliable weekly practice reports, Questionable/Doubtful/Out status)
 * - NBA/NHL/NCAAB: Rotowire via Gemini Grounding is PRIMARY (game-day status changes frequently)
 */
async function fetchInjuries(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    const isFootball = sport === 'NFL' || sport === 'NCAAF' || 
                       bdlSport === 'americanfootball_nfl' || bdlSport === 'americanfootball_ncaaf';
    
    // =============================================================================
    // NFL/NCAAF: Use currentState (Gemini Grounding) as PRIMARY source
    // BDL injury data can be stale (showing injuries from weeks ago)
    // The currentState fetch provides game-day accurate "OUT/LIMITED" info
    // =============================================================================
    if (isFootball && bdlSport) {
      console.log(`[Scout Report] NFL/NCAAF: Using currentState (Gemini Grounding) for game-day injury info`);
      console.log(`[Scout Report] Skipping BDL injury fetch (can include stale injuries from weeks ago)`);
      
      // Fetch current state for narratives - this is the PRIMARY injury source for NFL now
      let narrativeContext = null;
      try {
        const currentState = await fetchCurrentState(homeTeam, awayTeam, sport);
        narrativeContext = currentState?.groundedRaw || null;
      } catch (e) {
        console.log(`[Scout Report] Failed to fetch ${sport} current state: ${e.message}`);
      }
      
      // Return empty injury arrays - injury data comes from currentState (OUT/LIMITED section)
      // This is the same pattern used for NBA to avoid stale BDL data
      console.log(`[Scout Report] NFL/NCAAF: Injury data will come from "OUT/LIMITED" in currentState (game-day accurate)`);
      return {
        home: [],
        away: [],
        lineups: { home: [], away: [] },
        narrativeContext
      };
    }
    
    // =============================================================================
    // NBA/NHL/NCAAB: Use Gemini Grounding as PRIMARY source (game-day status)
    // SINGLE GROUNDING CALL: fetchGroundingInjuries returns both structured data AND groundingRaw
    // =============================================================================
    console.log(`[Scout Report] Fetching injuries from Rotowire (via Gemini Grounding) for ${awayTeam} @ ${homeTeam}`);

    // PRIMARY: Fetch from Rotowire via Gemini Grounding (returns structured injuries + raw narrative)
    const groundingInjuries = await fetchGroundingInjuries(homeTeam, awayTeam, sport);

    // Use groundingRaw from the single call (no duplicate fetchGroundedContext call needed)
    const narrativeContext = groundingInjuries?.groundingRaw || null;
    
    const groundingHomeCount = groundingInjuries?.home?.length || 0;
    const groundingAwayCount = groundingInjuries?.away?.length || 0;
    
    // Use Rotowire grounding injuries as source of truth
    if (groundingHomeCount > 0 || groundingAwayCount > 0) {
      console.log(`[Scout Report] Using Rotowire injuries (${groundingHomeCount} home, ${groundingAwayCount} away) as source of truth`);
      return {
        home: groundingInjuries.home || [],
        away: groundingInjuries.away || [],
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
    
    // NO BDL FALLBACK - BDL injury data is stale and lacks context
    // If Gemini Grounding failed to provide injury data, we proceed without it
    // The currentState grounded context is the ONLY source of truth for injuries
    console.log(`[Scout Report] Grounding parsing did not extract structured injuries`);
    console.log(`[Scout Report] Injury data will come from narrative context in currentState (Rotowire/grounding)`);
    console.log(`[Scout Report] BDL injury fallback DISABLED - BDL data is stale and lacks game-day context`);
    
    return {
      home: [],
      away: [],
      lineups: { home: [], away: [] },
      narrativeContext
    };
    
  } catch (error) {
    console.warn(`[Scout Report] Error fetching injuries:`, error.message);
    return { home: [], away: [], narrativeContext: null };
  }
}

/**
 * Fetch CURRENT STATE of each team using simple, natural Gemini grounding
 * This replaces the complex structured prompts with a simple "fan awareness" query
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
    // ═══════════════════════════════════════════════════════════════════════════
    // 2026 GROUNDING FRESHNESS PROTOCOL FOR CURRENT STATE
    // ═══════════════════════════════════════════════════════════════════════════
    const now = new Date();
    const today = gameDate || now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const todayFull = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const seasonContext = currentMonth >= 10 ? `${currentYear}-${currentYear + 1}` : `${currentYear - 1}-${currentYear}`;

    // Configure model with Google Search Grounding
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 1.0 }, // Gemini 3: Keep at 1.0
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    });

    const sportName = {
      'NFL': 'NFL', 'americanfootball_nfl': 'NFL',
      'NBA': 'NBA', 'basketball_nba': 'NBA',
      'NHL': 'NHL', 'icehockey_nhl': 'NHL',
      'NCAAB': 'college basketball', 'basketball_ncaab': 'college basketball',
      'NCAAF': 'college football', 'americanfootball_ncaaf': 'college football'
    }[sport] || sport;

    const isNFL = sport === 'NFL' || sport === 'americanfootball_nfl';
    const isNCAAF = sport === 'NCAAF' || sport === 'americanfootball_ncaaf';

    // NFL/NCAAF-specific sections
    const footballSpecificSections = (isNFL || isNCAAF) ? `
**WEATHER & TEMPERATURE:**
- Game-time temperature (°F) - skip if dome/indoor stadium
- Only report SEVERE conditions: blizzard, sustained 25+ mph wind, sub-15°F

**GAME CONTEXT:**
- GAME TYPE: TNF/SNF/MNF/Saturday${isNCAAF ? '/Bowl/CFP' : ''}?
- DIVISIONAL: Same ${isNFL ? 'division' : 'conference'}?
- PLAYOFF IMPLICATIONS: Current standings, what's at stake?
` : '';

    const prompt = `<date_anchor>
  System Date: ${todayFull}
  Season: ${seasonContext} ${sportName}
</date_anchor>

<grounding_instructions>
  GROUND TRUTH HIERARCHY:
  1. PRIMARY: This System Date + Search Tool results = absolute "Present"
  2. SECONDARY: Your training data = "Historical Archive" (2024 or earlier)
  3. CONFLICT: If training says Player X on Team A but Search shows trade to Team B, USE SEARCH

  EVIDENCE SUPREMACY: You MUST use Google Search. DO NOT skip the search or rely on training data.
  Your 2024 training data is OUTDATED for current rosters, injuries, and team performance.
</grounding_instructions>

<query>
For the ${sportName} game ${awayTeam} @ ${homeTeam} on ${today}:

What is the CURRENT STATE of each team heading into this game?

### FRESHNESS RULES (MANDATORY):
1. **SEARCH FIRST**: Use Google Search for current info - do NOT assume from training data
2. **24-48 HOUR WINDOW**: Prefer news/reports from past 24-48 hours for injuries
3. **STALE INJURY DETECTION**: "remains out" or "continues sidelined" = STALE injury
4. **ORIGINAL DATE**: Find when injury FIRST occurred + total games missed:
   - 10+ days or 4+ games out = "LONG-TERM / ADJUSTED"
   - 1-2 days ago = "FRESH / NEW"

**${homeTeam}:**
- Momentum (last 5-10 games - hot/cold?)
- **LAST GAME:** What happened? (Beat writer narrative - blowout, close, buzzer beater?)
- **INJURIES:** OUT/DOUBTFUL/QUESTIONABLE/LIMITED players with:
  * Status, injury type, ORIGINAL DATE, GAMES MISSED
  * Format: "Player (Pos) - OUT (knee) - since Dec 12 (missed 15 games) - ADJUSTED"
- Recent storylines (breakout performances, key headlines)

**${awayTeam}:**
- Momentum (last 5-10 games - hot/cold?)
- **LAST GAME:** What happened? (Beat writer narrative)
- **INJURIES:** Same format as above with ORIGINAL DATE + GAMES MISSED
- Recent storylines
${footballSpecificSections}
### CRITICAL REMINDERS:
- Today is ${today}. VERIFY all info via Search - your training is outdated.
- Players out ALL SEASON = team has ADJUSTED (not fresh news)
- Focus on CURRENT state, not season-long narratives
</query>

Be factual. Use Search Tool. No betting predictions.`;

    console.log(`[Scout Report] Fetching CURRENT STATE for ${awayTeam} @ ${homeTeam}...`);
    const startTime = Date.now();
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const duration = Date.now() - startTime;
    console.log(`[Scout Report] Current state fetched in ${duration}ms`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDATION: Ensure grounding response is valid and game-specific
    // If grounding returns garbage, we FAIL HARD rather than proceed with bad data
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Check 1: Response must have minimum length (garbage responses are often <100 chars)
    const MIN_RESPONSE_LENGTH = 200;
    if (!text || text.length < MIN_RESPONSE_LENGTH) {
      const errorMsg = `Grounding response too short (${text?.length || 0} chars, minimum ${MIN_RESPONSE_LENGTH}). Response: "${text?.substring(0, 100) || 'empty'}"`;
      console.error(`[Scout Report] [GROUNDING FAIL] ${errorMsg}`);
      throw new Error(`Current state grounding failed: ${errorMsg}`);
    }
    
    // Check 2: Response must mention at least one of the teams (validates it's about THIS game)
    const textLower = text.toLowerCase();
    const homeTeamLower = homeTeam.toLowerCase();
    const awayTeamLower = awayTeam.toLowerCase();
    const homeMascot = homeTeam.split(' ').pop().toLowerCase();
    const awayMascot = awayTeam.split(' ').pop().toLowerCase();
    
    const mentionsHome = textLower.includes(homeTeamLower) || textLower.includes(homeMascot);
    const mentionsAway = textLower.includes(awayTeamLower) || textLower.includes(awayMascot);
    
    if (!mentionsHome && !mentionsAway) {
      const errorMsg = `Grounding response does not mention either team. Expected "${homeTeam}" or "${awayTeam}" in response.`;
      console.error(`[Scout Report] [GROUNDING FAIL] ${errorMsg}`);
      console.error(`[Scout Report] Response preview: ${text.substring(0, 300)}`);
      throw new Error(`Current state grounding failed: ${errorMsg}`);
    }
    
    // Check 3: Response should not look like an error message or refusal
    const errorIndicators = [
      'i cannot', 'i\'m unable', 'i don\'t have', 'no information available',
      'unable to find', 'could not find', 'error:', 'sorry,', 'i apologize'
    ];
    const looksLikeError = errorIndicators.some(indicator => textLower.includes(indicator));
    if (looksLikeError && text.length < 500) {
      const errorMsg = `Grounding response looks like an error or refusal: "${text.substring(0, 200)}"`;
      console.error(`[Scout Report] [GROUNDING FAIL] ${errorMsg}`);
      throw new Error(`Current state grounding failed: ${errorMsg}`);
    }
    
    // Validation passed - log and return
    console.log(`[Scout Report] [GROUNDING OK] Response validated (${text.length} chars, mentions teams: home=${mentionsHome}, away=${mentionsAway})`);
    
    if (text) {
      const preview = text.substring(0, 300).replace(/\n/g, ' ');
      console.log(`[Scout Report] Current state preview: ${preview}...`);
      // Log full current state for debugging
      console.log(`[Scout Report] === FULL CURRENT STATE START ===`);
      console.log(text);
      console.log(`[Scout Report] === FULL CURRENT STATE END ===`);
    }
    
    return {
      groundedRaw: text,
      groundingUsed: true
    };
    
  } catch (error) {
    console.warn(`[Scout Report] Current state fetch failed: ${error.message}`);
    return null;
  }
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
      ? `\n### EXCLUDED PLAYERS (LONG-TERM INJURIES - ALWAYS REMOVE):\n${excludedPlayers.join(', ')}\n`
      : '';
    
    const prompt = `You are a data integrity tool. I will provide a news report about a sports matchup.

### TASK: 
1. Remove any mentions of players in the EXCLUDED list (long-term injuries - team has adjusted, not relevant)
2. Remove any mentions of players NOT in the VALID list
${excludedSection}
### VALID PLAYERS:
${allowedPlayers.join(', ')}

### NEWS REPORT TO CLEAN:
${narrative}

### STRICT RULES:
1. PRIORITY: If a sentence/bullet mentions ANY player in the EXCLUDED list, DELETE the entire sentence/bullet.
2. If a sentence mentions a player NOT in the VALID list, DELETE the entire sentence.
3. If a bullet point discusses a "ghost" player or long-term injury, DELETE the entire bullet.
4. If a paragraph discusses the impact of an EXCLUDED player, DELETE that paragraph.
5. DO NOT add any new info.
6. DO NOT explain your changes.
7. Return ONLY the cleaned text.
8. Preserve the headers and bullets for players who ARE in the valid list and NOT in excluded.

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
    // CRITICAL: Validate team context exists before attempting to push
    // Without this check, injuries[null] or injuries[undefined] throws "Cannot read properties of undefined"
    if (!team || !injuries[team]) {
      // This happens when parser finds an injury line but hasn't detected which team yet
      // Common when grounding response doesn't have clear team headers
      return;
    }

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
    
    // CRITICAL: Skip if name looks like duration/date text or status instead of a player name
    // This prevents "until Feb", "Reserve Dec", "at least Dec", "QUESTIONABLE" from being stored as player names
    const lowerName = playerName.toLowerCase().trim();
    
    // Skip injury status words that might get parsed as names
    const statusWords = ['questionable', 'doubtful', 'probable', 'out', 'injured', 'day-to-day', 'gtd', 'ir', 'pup'];
    if (statusWords.includes(lowerName)) {
      // Silent skip for common status words (not worth logging)
      return;
    }
    
    const durationPatterns = [
      'until', 'reserve', 'at least', 'through', 'expected', 'return',
      'january', 'february', 'march', 'april', 'may', 'june', 'july',
      'august', 'september', 'october', 'november', 'december',
      'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
      'week', 'weeks', 'month', 'day', 'days', 'indefinitely', 'tbd',
      ' and ', 'with ', 'note:', 'context:', 'status:', 'injury:',
      // Additional patterns to catch malformed names from grounding
      'expected to start', 'if ruled', 'game time', 'decision', 'ruled out',
      'starting lineup', 'may not play', 'will play', 'will not'
    ];
    if (durationPatterns.some(pattern => lowerName.includes(pattern))) {
      // Silent skip for obvious non-names
      return;
    }

    // CRITICAL: Reject names that are clearly parsed from garbled grounding responses
    // E.g., "Expected to start if LaMelo Ball is ruled" is NOT a player name
    if (lowerName.split(' ').length > 4) {
      // Real player names are usually 2-3 words max (First Last, or First Middle Last)
      console.log(`[Scout Report] Parser: Skipping invalid player name (too many words): "${playerName}"`);
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
    
    // Determine the normalized status - PRESERVE GTD status specifically
    let normalizedStatus;
    const statusLower = status.toLowerCase();
    if (statusLower.includes('gtd') || statusLower.includes('game-time decision') || statusLower.includes('game time decision')) {
      normalizedStatus = 'GTD'; // Explicitly preserve GTD for the pass logic
    } else if (statusLower.includes('ir') || statusLower.includes('ltir')) {
      normalizedStatus = 'IR';
    } else if (statusLower.includes('out') || statusLower.includes('ofs')) {
      normalizedStatus = 'Out';
    } else if (statusLower.includes('doubtful')) {
      normalizedStatus = 'Doubtful';
    } else if (statusLower.includes('questionable') || statusLower.includes('day-to-day')) {
      normalizedStatus = 'Questionable';
    } else {
      normalizedStatus = 'Questionable';
    }
    
    injuries[team].push({
      player: {
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(' '),
        position: position || ''
      },
      status: normalizedStatus,
      duration: duration,
      isEdge: duration === 'RECENT',
      source: 'gemini_grounding'
    });
  };
  
  // Multiple parsing patterns for flexibility
  const patterns = [
    // Pattern 0 (NEW): Markdown format "**Player Name (POS):** Status" - common in Gemini Grounding
    /\*\*([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)*)\s*\(([A-Z0-9\/]+)\):\*\*\s*([^.\n]+)/i,
    // Pattern 0b: Markdown format "**G. Player (POS):** Status" (initial + last name)
    /\*\*([A-Z][a-z]*\.?\s*[A-Z][a-z'.-]+)\s*\(([A-Z0-9\/]+)\):\*\*\s*([^.\n]+)/i,
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

      // SIMPLE DIRECT QUERY: Just search the Rotowire NHL lineups page for the matchup
      // The page shows today's games by default - no need for complex date logic
      const makeNhlInjuryQuery = (teamName, opponentName) => `Search rotowire.com/hockey/nhl-lineups.php for the ${teamName} vs ${opponentName} game.

Look at the INJURIES section listed under the ${teamName} lineup card on that page.

Return in this EXACT format:
INJURIES - ${teamName}:
- [Full Name] | [Position] | [Status]

Example format:
- Marcus Johansson | LW | OUT
- Jonas Brodin | D | IR
- Matt Boldy | LW | IR

RULES:
1. List ALL players shown in the INJURIES section for ${teamName} on that page
2. Use FULL player names (Marcus Johansson, not M. Johansson)
3. Use the EXACT status shown: OUT, IR, IR-LT, IR-NR, or DTD
4. If no injuries are listed, return "INJURIES - ${teamName}: None"
5. Do NOT add players that aren't listed on the page`;

      const [awayResponse, homeResponse] = await Promise.all([
        geminiGroundingSearch(makeNhlInjuryQuery(awayTeam, homeTeam), { temperature: 0.3, maxTokens: 1500 }),
        geminiGroundingSearch(makeNhlInjuryQuery(homeTeam, awayTeam), { temperature: 0.3, maxTokens: 1500 })
      ]);

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
      query = `Search site:rotowire.com/daily/ncaab/lineups.php for the college basketball game ${awayTeam} vs ${homeTeam} on ${today}

CRITICAL: Get the EXACT injury statuses from RotoWire's lineup page:

1. STARTING LINEUPS - For EACH team, list the starting 5:
   - PG: [Name]
   - SG: [Name] 
   - SF: [Name]
   - PF: [Name]
   - C: [Name]
   
2. INJURIES - Use EXACT statuses from RotoWire:
   - "GTD" = Game Time Decision (CRITICAL - means uncertain if playing)
   - "Out" = Confirmed out
   - "OFS" = Out For Season
   
   Format each injury as: "[Name] ([Position]) - [EXACT STATUS: GTD/Out/OFS]"
   
   ${awayTeam} INJURIES:
   ${homeTeam} INJURIES:

PRESERVE THE EXACT GTD STATUS - Do NOT convert GTD to "Questionable" or "Out"
A player marked GTD on RotoWire means game-time decision - report it as "GTD"

Be factual. List injuries with EXACT RotoWire statuses.`;
    } else if (sport === 'NFL' || sport === 'americanfootball_nfl') {
    } else if (sport === 'NCAAF' || sport === 'americanfootball_ncaaf') {
      query = `For the college football game ${awayTeam} @ ${homeTeam} on ${today} (2025-26 Bowl Season):

1. INJURIES & ROSTER ATTRITION - CRITICAL:
   - List ALL players OUT, DOUBTFUL, or QUESTIONABLE for each team.
   - Include player name, position, and impact (e.g., "Starting LT", "Leading Tackler").
   - MUST IDENTIFY: NFL Draft Opt-outs, Transfer Portal entries, and Academically Ineligible players.
   - For bowl games, distinguish between "Regular Season Starters" and "Bowl Game Starters".

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
      // NBA-specific query - search-based (Gemini Grounding cannot navigate to URLs directly)
      query = `Search Rotowire NBA lineups page for ${awayTeam} vs ${homeTeam} ${today}

Return the MAY NOT PLAY section with EXACT status abbreviations as shown on Rotowire:
- "Out" = Confirmed out
- "Prob" = Probable (expected to play)
- "Doubt" = Doubtful (unlikely to play)
- "Ques" = Questionable (uncertain)
- "OFS" = Out For Season
- "GTD" = Game Time Decision

MAY NOT PLAY - ${awayTeam}:
- [Player Name] | [EXACT status: Out/Prob/Doubt/Ques/OFS/GTD] | [Duration if known]

MAY NOT PLAY - ${homeTeam}:
- [Player Name] | [EXACT status: Out/Prob/Doubt/Ques/OFS/GTD] | [Duration if known]

EXPECTED STARTING LINEUPS:
${awayTeam}: PG [Name], SG [Name], SF [Name], PF [Name], C [Name]
${homeTeam}: PG [Name], SG [Name], SF [Name], PF [Name], C [Name]

CRITICAL:
1. Copy the EXACT status abbreviation shown on Rotowire (Prob, Doubt, Ques, Out, OFS, GTD)
2. Do NOT convert statuses - "Doubt" stays "Doubt", "Prob" stays "Prob"
3. Include duration/injury date if shown`;

    } else {
      query = `Current injuries for ${sport} game ${awayTeam} vs ${homeTeam} as of ${today}. List all players OUT, DOUBTFUL, or QUESTIONABLE with their status and injury type.`;
    }
    
    console.log(`[Scout Report] Using Gemini Grounding for injury data: ${homeTeam} vs ${awayTeam}`);
    
    const response = await geminiGroundingSearch(query, { temperature: 1.0, maxTokens: 2500 });
    
    if (!response?.success || !response?.data) {
      console.log('[Scout Report] Gemini Grounding returned no injury data');
      return { home: [], away: [], groundingRaw: null };
    }
    
    // Parse the grounding response to extract injuries
    const parsed = parseGroundingInjuries(response.data, homeTeam, awayTeam, sport);
    parsed.groundingRaw = response.data; // Keep raw for display
    
    console.log(`[Scout Report] Grounding injuries: ${parsed.home.length} for ${homeTeam}, ${parsed.away.length} for ${awayTeam}`);
    
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
    if (t.includes('season-long') || t.includes('all season') || t.includes('since week 1') ||
        t.includes('since week 2') || t.includes('since week 3') || t.includes('most of the season') ||
        t.includes('out for the year') || t.includes('out all year') ||
        t.includes('indefinitely') || t.includes('no timetable') || t.includes('no return') ||
        t.includes('season-ending') || t.includes('out for season') ||
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
      const hasTeam = lineLower.includes(teamLower);
      const hasInjuryHeader = lineLower.includes('may not play') || lineLower.includes('injuries');
      if (hasTeam && hasInjuryHeader) return true;
      // Allow simple team header lines like "Memphis Grizzlies:"
      if (hasTeam && /[:\-–]?\s*$/.test(lineLower)) return true;
      return false;
    };

    const shouldStopSection = (lineLower) => {
      return lineLower.includes('starting lineup') ||
        lineLower.includes('starting lineups') ||
        lineLower.includes('expected starting') ||
        lineLower.startsWith('starting lineups');
    };

    const addParsedInjury = (team, playerName, status, rawLine) => {
      const name = (playerName || '').trim();
      if (!name || name.length < 3) return;
      const playerKey = name.toLowerCase();
      if (foundPlayers.has(playerKey)) return;

      const durationInfo = extractDuration(rawLine);
      const normalizedStatus = normalizeStatus(status);

      // AWARENESS, NOT FILTERING: Give Gary context about injury significance
      // Long-term injuries = team has adapted, impact "baked into" season stats
      // Recent injuries = high uncertainty, team hasn't adjusted
      let durationContext = '';
      if (durationInfo.duration === 'SEASON-LONG') {
        durationContext = 'LONG-TERM (team has adapted, impact reflected in season stats)';
      } else if (durationInfo.duration === 'MID-SEASON') {
        durationContext = 'MID-SEASON (team partially adapted)';
      } else if (durationInfo.duration === 'RECENT') {
        durationContext = 'RECENT (high uncertainty, team still adjusting)';
      } else {
        durationContext = 'UNKNOWN DURATION';
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
      const patterns = [
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
        /([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)\s*(?:\([^)]+\))?\s+(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i
      ];

      for (const pattern of patterns) {
        const match = line.match(pattern);
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
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const lower = line.toLowerCase();

      if (shouldStopSection(lower)) {
        currentTeam = null;
        continue;
      }

      if (isTeamHeader(lower, awayLower)) {
        currentTeam = 'away';
        continue;
      }
      if (isTeamHeader(lower, homeLower)) {
        currentTeam = 'home';
        continue;
      }

      if (currentTeam) {
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
    // Status options: OUT, IR, IR-LT, DTD, DAY-TO-DAY, LTIR, Probable, Questionable, Doubtful
    const statusPattern = 'OUT|IR|IR-LT|DTD|DAY-TO-DAY|LTIR|Probable|Questionable|Doubtful';
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
 * Validate that a player is actually on the specified team by searching BDL
 * This catches Gemini hallucinations (e.g., waived players like Damian Lillard)
 * @param {string} playerName - Full player name
 * @param {string} teamName - Expected team name
 * @returns {Promise<boolean>} - True if player is on the team, false otherwise
 */
async function validatePlayerOnTeam(playerName, teamName) {
  try {
    // Search by last name for better matching
    const lastName = playerName.split(' ').pop();
    const searchResults = await ballDontLieService.getPlayersGeneric({
      search: lastName,
      per_page: 10
    });
    
    if (!searchResults || searchResults.length === 0) return true; // Can't verify, allow it
    
    // Find exact match
    const lowerName = playerName.toLowerCase();
    const player = searchResults.find(p => 
      `${p.first_name} ${p.last_name}`.toLowerCase() === lowerName
    );
    
    if (!player) return true; // Can't find player, allow it
    
    // Check if player's current team matches
    const playerTeam = player.team?.full_name?.toLowerCase() || '';
    const expectedTeam = teamName.toLowerCase();
    
    // Check for team name match (partial matching for variations like "Los Angeles Lakers" vs "Lakers")
    const isOnTeam = playerTeam.includes(expectedTeam) || 
                     expectedTeam.includes(playerTeam) ||
                     playerTeam.split(' ').pop() === expectedTeam.split(' ').pop(); // Match mascot
    
    if (!isOnTeam) {
      console.log(`[Scout Report] BDL says ${playerName} is on ${player.team?.full_name || 'Unknown'}, NOT ${teamName}`);
    }
    
    return isOnTeam;
  } catch (e) {
    console.warn(`[Scout Report] Could not validate ${playerName} team: ${e.message}`);
    return true; // Error - allow it to be safe
  }
}

/**
 * Merge BDL and Grounding injuries - Grounding takes priority for status updates
 * (Gemini Grounding is real-time, BDL can be stale)
 * Also validates that players are assigned to the correct team
 */
async function mergeInjuries(bdlInjuries, groundingInjuries, homeTeamName, awayTeamName) {
  // Build a set of ALL player names from both teams' BDL data for cross-validation
  const allBdlHomeNames = new Set((bdlInjuries.home || []).map(i => 
    `${i.player?.first_name} ${i.player?.last_name}`.toLowerCase().trim()
  ));
  const allBdlAwayNames = new Set((bdlInjuries.away || []).map(i => 
    `${i.player?.first_name} ${i.player?.last_name}`.toLowerCase().trim()
  ));
  
  const mergeTeam = async (bdl, perp, isHome) => {
    // Create a map of BDL injuries by player name for easy lookup
    const bdlMap = new Map();
    bdl.forEach(i => {
      const name = `${i.player?.first_name} ${i.player?.last_name}`.toLowerCase();
      bdlMap.set(name, i);
    });

    // Start with BDL injuries, but let Grounding override statuses
    const merged = bdl.map(bdlInjury => {
      const name = `${bdlInjury.player?.first_name} ${bdlInjury.player?.last_name}`.toLowerCase();
      
      // Check if Grounding has different status for this player
      const perpMatch = perp.find(p => 
        `${p.player?.first_name} ${p.player?.last_name}`.toLowerCase() === name
      );
      
      if (perpMatch && perpMatch.status !== bdlInjury.status) {
        console.log(`[Scout Report] Grounding override: ${name} - ${bdlInjury.status} → ${perpMatch.status} (Grounding is more current)`);
        return { ...bdlInjury, status: perpMatch.status, source: 'grounding_override' };
      }
      
      return bdlInjury;
    });

    // Add Grounding-only injuries that aren't in BDL
    const existingNames = new Set(bdl.map(i =>
      `${i.player?.first_name} ${i.player?.last_name}`.toLowerCase()
    ));
    
    // Get the OTHER team's BDL names to check for misassignment
    const otherTeamBdlNames = isHome ? allBdlAwayNames : allBdlHomeNames;
    
    // Track which Gemini injuries need validation
    const teamName = isHome ? homeTeamName : awayTeamName;
    const geminiInjuriesToValidate = [];

    for (const injury of perp) {
      const name = `${injury.player?.first_name} ${injury.player?.last_name}`.toLowerCase().trim();
      
      // Skip if already exists in this team's list
      if (existingNames.has(name)) continue;
      
      // CRITICAL: Check if this player is actually on the OTHER team's roster
      // This catches cases where Gemini assigns a player to the wrong team
      if (otherTeamBdlNames.has(name)) {
        console.log(`[Scout Report] Skipping ${name} - assigned to wrong team by Gemini (belongs to opponent)`);
        continue;
      }
      
      // Queue for validation against BDL player search
      geminiInjuriesToValidate.push({ injury, name, teamName });
    }
    
    // Validate Gemini injuries against BDL player search (in parallel)
    const validationResults = await Promise.all(
      geminiInjuriesToValidate.map(async ({ injury, name, teamName }) => {
        const fullName = `${injury.player?.first_name} ${injury.player?.last_name}`.trim();
        const isValid = await validatePlayerOnTeam(fullName, teamName);
        if (!isValid) {
          console.log(`[Scout Report] Skipping ${name} - Gemini hallucination: player NOT on ${teamName}`);
        } else {
          console.log(`[Scout Report] ✓ Validated & added Gemini injury: ${name} (${injury.status})`);
        }
        return { injury, isValid };
      })
    );
    
    // Add validated injuries
    for (const { injury, isValid } of validationResults) {
      if (isValid) {
        merged.push(injury);
      }
    }

    return merged;
  };
  
  // Process both teams in parallel
  const [home, away] = await Promise.all([
    mergeTeam(bdlInjuries.home || [], groundingInjuries.home || [], true),
    mergeTeam(bdlInjuries.away || [], groundingInjuries.away || [], false)
  ]);
  
  return {
    home,
    away,
    groundingRaw: groundingInjuries.groundingRaw
  };
}

/**
 * Format comprehensive injury report - this goes at the TOP of the scout report
 * Now includes duration context to distinguish RECENT vs MID-SEASON vs SEASON-LONG
 * CRITICAL: Shows TODAY's date so Gary can understand injury relevance
 */
function formatInjuryReport(homeTeam, awayTeam, injuries, sportKey) {
  const lines = [];

  // ADD TODAY'S DATE AT THE TOP - Gary needs this anchor to understand injury timing
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  lines.push(`TODAY'S DATE: ${todayStr}`);
  lines.push('(Use this date to understand how long each player has been out)');
  lines.push('');

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
    const shortReason = reason ? ` - ${reason.split('.')[0].substring(0, 60)}` : '';
    
    // Build duration tag with ACTUAL DATE and days for Gary to see clearly
    let durationTag = '';
    const days = i.daysSinceReport;
    const reportDate = i.reportDateStr; // e.g., "Jan 8"
    
    // Show both the actual date AND days ago for maximum clarity
    let timeInfo = '';
    if (reportDate && days !== null && days !== undefined) {
      timeInfo = ` - Reported ${reportDate} (${days}d ago)`;
    } else if (days !== null && days !== undefined) {
      timeInfo = ` (${days}d ago)`;
    } else if (reportDate) {
      timeInfo = ` - Reported ${reportDate}`;
    }
    
    if (i.duration === 'SEASON-LONG' || i.status === 'Injured Reserve' || i.status === 'IR' || i.status === 'LTIR') {
      durationTag = ` [SEASON-LONG${timeInfo} - PRICED IN - NOT EDGE]`;
    } else if (i.duration === 'MID-SEASON') {
      durationTag = ` [MID-SEASON${timeInfo} - LIKELY PRICED IN]`;
    } else if (i.duration === 'RECENT' || i.isEdge === true) {
      durationTag = ` [RECENT${timeInfo} - POSSIBLE EDGE]`;
    } else if (i.duration === 'UNKNOWN') {
      durationTag = ` [DATE UNKNOWN - verify freshness before citing as edge]`;
    }
    
    if (!durationTag && (i.status === 'IR' || i.status === 'Injured Reserve' || i.status === 'LTIR' || 
        (i.description && i.description.toLowerCase().includes('injured reserve')))) {
      durationTag = ' [IR - SEASON-LONG - PRICED IN - NOT EDGE]';
    }
    
    // If we still don't have duration info, add a warning
    if (!durationTag && !reportDate && days === null) {
      durationTag = ' [DATE UNKNOWN - verify before citing]';
    }
    
    return `  • ${name}${pos ? ` (${pos})` : ''} (${i.status || 'Unknown'})${shortReason}${durationTag}`;
  };
  
  const renderTeam = (teamName, cats, locationTag) => {
    lines.push(`${locationTag} ${teamName}:`);

    // AWARENESS, NOT FILTERING: Show ALL injuries with context
    // Gary decides the significance based on duration context

    if (cats.critical.length > 0) {
      lines.push(`  [RECENT - INVESTIGATE] Team still adjusting:`);
      cats.critical.forEach(i => lines.push(formatPlayer(i)));
    }

    // Show ALL out players, categorized by recency
    const recentOut = cats.out.filter(i => i.duration === 'RECENT' || i.isEdge === true);
    const midSeasonOut = cats.out.filter(i => i.duration === 'MID-SEASON');
    const seasonLongOut = cats.out.filter(i =>
      i.duration === 'SEASON-LONG' || i.status === 'IR' || i.status === 'LTIR' || i.status === 'Injured Reserve'
    );
    const unknownOut = cats.out.filter(i =>
      !recentOut.includes(i) && !midSeasonOut.includes(i) && !seasonLongOut.includes(i)
    );

    if (recentOut.length > 0) {
      lines.push(`  [RECENT OUT - INVESTIGATE IMPACT] High uncertainty:`);
      recentOut.forEach(i => lines.push(formatPlayer(i)));
    }

    if (midSeasonOut.length > 0) {
      lines.push(`  [MID-SEASON OUT] Team partially adapted:`);
      midSeasonOut.forEach(i => lines.push(formatPlayer(i)));
    }

    // SEASON-LONG injuries are NOT shown to Gary - if he can't see them, he can't cite them
    // The team has fully adapted to these absences - they're priced in and not an edge
    // seasonLongOut is intentionally not rendered

    if (unknownOut.length > 0) {
      lines.push(`  [OUT - UNKNOWN DURATION] Verify before citing:`);
      unknownOut.forEach(i => lines.push(formatPlayer(i)));
    }

    if (cats.others.length > 0) {
      lines.push(`  [QUESTIONABLE/DOUBTFUL] Game-time decision:`);
      cats.others.forEach(i => lines.push(formatPlayer(i)));
    }

    // cats.seasonal (season-long non-OUT injuries) are NOT shown to Gary
    // Same reasoning: priced in, not an edge, team has adapted

    if (!cats.critical.length && !cats.out.length && !cats.others.length && !cats.seasonal.length) {
      lines.push(`  No injuries reported`);
    }
    lines.push('');

    return []; // No longer filtering - returning empty array for compatibility
  };

  renderTeam(homeTeam, homeCats, '[HOME]');
  renderTeam(awayTeam, awayCats, '[AWAY]');

  // Add educational context about injury significance - direct, no emojis (Gemini best practices)
  lines.push('<injury_interpretation_rules>');
  lines.push('INJURY DURATION - INVESTIGATE, DO NOT ASSUME');
  lines.push('');
  lines.push('MID-SEASON (3-6 weeks out):');
  lines.push('  - Team has partially adapted.');
  lines.push('  - INVESTIGATE: What is their record DURING this period?');
  lines.push('  - INVESTIGATE: Who absorbed the usage? How are they performing?');
  lines.push('');
  lines.push('RECENT (< 2 weeks out):');
  lines.push('  - HIGH UNCERTAINTY. Team is still adjusting.');
  lines.push('  - DO NOT ASSUME the impact is positive or negative.');
  lines.push('  - INVESTIGATE: How have they looked in the few games since?');
  lines.push('  - INVESTIGATE: Who is stepping up? Who is struggling?');
  lines.push('  - Let the data show you the actual impact.');
  lines.push('');
  lines.push('YOUR JOB: Investigate the injuries shown above. Do not assume injuries help or hurt either side.');
  lines.push('NOTE: Season-long injuries are NOT shown - those players are not relevant to tonight.');
  lines.push('</injury_interpretation_rules>');
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
  
  // Injuries
  const homeInjuries = injuries.home?.filter(i => ['Out', 'Doubtful', 'Questionable'].includes(i.status));
  const awayInjuries = injuries.away?.filter(i => ['Out', 'Doubtful', 'Questionable'].includes(i.status));
  
  if (homeInjuries?.length > 0) {
    const injuryList = homeInjuries.slice(0, 3).map(i => {
      let tag = '';
      const dateInfo = i.reportDateStr ? ` (${i.reportDateStr})` : '';
      if (i.duration === 'SEASON-LONG' || i.status === 'IR' || i.status === 'LTIR') {
        tag = ' [SEASON-LONG - PRICED IN]';
      } else if (i.duration === 'RECENT' || i.isEdge) {
        tag = ` [RECENT${dateInfo} - EDGE]`;
      } else if (dateInfo) {
        tag = dateInfo;
      }
      return `${i.player?.first_name} ${i.player?.last_name}: ${i.status}${tag}`;
    }).join(', ');
    factors.push(`• ${game.home_team} Injuries: ${injuryList}`);
  }
  
  if (awayInjuries?.length > 0) {
    const injuryList = awayInjuries.slice(0, 3).map(i => {
      let tag = '';
      const dateInfo = i.reportDateStr ? ` (${i.reportDateStr})` : '';
      if (i.duration === 'SEASON-LONG' || i.status === 'IR' || i.status === 'LTIR') {
        tag = ' [SEASON-LONG - PRICED IN]';
      } else if (i.duration === 'RECENT' || i.isEdge) {
        tag = ` [RECENT${dateInfo} - EDGE]`;
      } else if (dateInfo) {
        tag = dateInfo;
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
    // Calculate dynamic season fallback: NFL/NCAAF Aug-Feb spans years
    const fallbackSeason = (() => {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      return month <= 7 ? year - 1 : year;
    })();
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
    factors.push('• QB STATUS IS CRITICAL: If starting QB is OUT/DOUBTFUL, the game is essentially unpredictable');
    
    // CFP-specific context (Dec-Jan games)
    const currentMonth = new Date().getMonth(); // 0-indexed
    const isCFPSeason = currentMonth === 11 || currentMonth === 0; // Dec or Jan
    if (isCFPSeason) {
      factors.push('');
      factors.push('CFP PLAYOFF CONTEXT (12-TEAM ERA):');
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
    factors.push('NHL CONTEXT NOTES:');
    factors.push('• GOALIE MATCHUP: Check who is starting for BOTH teams - a backup vs starter mismatch affects the line');
    factors.push('• BACK-TO-BACK: Second game of B2B (especially road) historically underperforms - check BOTH teams');
    factors.push('• HIGH-DANGER CHANCES (HDC): Teams creating lots of HDC will eventually convert - investigate process vs results');
    factors.push('• GSAx (Goals Saved Above Expected): Better indicator than raw save percentage for BOTH goalies');
    
    // Check for goalie injuries
    const goalieInjuries = [...(homeInjuries || []), ...(awayInjuries || [])].filter(i => 
      i.player?.position?.toLowerCase() === 'g' || i.player?.position?.toLowerCase() === 'goalie'
    );
    if (goalieInjuries.length > 0) {
      factors.push(`• GOALIE ALERT: ${goalieInjuries.map(i => `${i.player?.last_name} (${i.status})`).join(', ')}`);
    }
  }
  
  // NCAAB: Efficiency & luck factors
  if (sportKey === 'basketball_ncaab') {
    factors.push('');
    factors.push('NCAAB CONTEXT NOTES:');
    factors.push('• KENPOM EFFICIENCY: Check if team quality is one-sided (great offense, bad defense) - may indicate variance');
    factors.push('• RECORD vs NET RATING: Great record + mediocre metrics = may regress down. Bad record + good metrics = may regress up');
    factors.push('• RANKED vs RANKED: Top 25 matchups often grind - investigate pace and defensive styles');
    factors.push('• ALTITUDE: Games in Denver/Salt Lake can affect sea-level teams - investigate if relevant');
    factors.push('• SCHEDULE DENSITY: Back-to-back or 3 in 4 days affects both teams - check who is MORE affected');
    factors.push('• PORTAL LAG: Transfer-heavy teams may take time to gel - check current form vs early season');
    factors.push('• MOMENTUM SHIFTS: Teams coming off big wins/losses may have emotional carry-over - investigate history');
    factors.push('• FREE THROW RATE (FTR): High FTR teams have advantage in close games - applies to EITHER side');
  }
  
  // NFL: Rest & EPA factors
  if (sportKey === 'americanfootball_nfl') {
    factors.push('');
    factors.push('NFL CONTEXT NOTES:');
    factors.push('• REST DISPARITY: Significant rest edges (3+ days) historically matter - check both sides');
    factors.push('• EPA vs RECORD: High EPA + bad record may regress UP. Low EPA + good record may regress DOWN');
    factors.push('• LATE-GAME PERFORMANCE: Check which team closes strong vs which team fades - affects spread bets');
    factors.push('• WEATHER: Wind/rain affects passing - investigate impact on BOTH offenses');
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
  lines.push('RAW ODDS VALUES (copy these to your JSON output):');
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
 * Calculate record from season stats
 * Note: BDL can return null for 0 wins/losses, so we use ?? to coerce to 0
 */
function calculateRecord(stats) {
  if (!stats) return 'N/A';
  if (stats.wins !== undefined || stats.losses !== undefined) {
    return `${stats.wins ?? 0}-${stats.losses ?? 0}`;
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
    
    // Calculate NCAAF season: Jan-Jul = previous year, Aug-Dec = current year
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    const season = month <= 7 ? year - 1 : year;
    
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

For backup/3rd-string QB situations: These are the reliable targets who can help
an inexperienced QB. Volume receivers with high catch counts = safety blankets.
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
        const retry = await geminiGroundingSearch(makePowerPlayQuery(awayTeam, homeTeam, true), { temperature: 0.3, maxTokens: 2000 });
        if (retry?.success) {
          awayPP = parsePowerPlay(retry.data, awayTeam);
        }
      }
      for (let attempt = 1; attempt <= MAX_PP_RETRIES && !isPP1Complete(homePP); attempt++) {
        console.log(`[Scout Report] PP1 incomplete for ${homeTeam} - retry ${attempt}/${MAX_PP_RETRIES}...`);
        const retry = await geminiGroundingSearch(makePowerPlayQuery(homeTeam, awayTeam, true), { temperature: 0.3, maxTokens: 2000 });
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
    // NBA: Use Gemini Grounding to get TONIGHT'S STARTING LINEUP from RotoWire
    // This is more accurate than BDL roster data for who's actually playing
    // ═══════════════════════════════════════════════════════════════════════════
    console.log(`[Scout Report] Fetching NBA starting lineups via Gemini Grounding for ${awayTeam} @ ${homeTeam}`);
    
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    
    let rotoWireLineups = null;
    try {
      const gemini = getGeminiClient();
      if (gemini) {
        const model = gemini.getGenerativeModel({ 
          model: 'gemini-3-flash-preview', // POLICY: Always Gemini 3 Flash
          tools: [{ googleSearch: {} }]
        });
        
        // Search RotoWire specifically for tonight's starting lineup
        const lineupQuery = `site:rotowire.com NBA lineups ${awayTeam} vs ${homeTeam} ${today}

Return in this EXACT format for EACH team:

**${awayTeam} (AWAY):**
- STARTING 5: [PG], [SG], [SF], [PF], [C] - List full names
- CONFIRMED or PROJECTED status
- INJURIES:
  • [Player] - [Status: OUT/Q/GTD] - [Injury] - [Since when / How long out]
  • Only list RECENT injuries (last 2-3 weeks) - old injuries are priced in
- KEY BENCH: [Top 2-3 rotation players off bench]

**${homeTeam} (HOME):**
- STARTING 5: [PG], [SG], [SF], [PF], [C] - List full names
- CONFIRMED or PROJECTED status  
- INJURIES:
  • [Player] - [Status: OUT/Q/GTD] - [Injury] - [Since when / How long out]
  • Only list RECENT injuries (last 2-3 weeks) - old injuries are priced in
- KEY BENCH: [Top 2-3 rotation players off bench]

CRITICAL for injuries: 
- "OUT since Jan 5" or "missed 3 games" = Context for how long
- "GTD - game-time decision today" = Fresh uncertainty
- Do NOT list season-long injuries (4+ weeks) - team has adjusted`;

        const result = await model.generateContent(lineupQuery);
        const responseText = result.response?.text() || '';
        
        if (responseText && responseText.length > 100) {
          console.log(`[Scout Report] Gemini Grounding returned NBA lineup data (${responseText.length} chars)`);
          rotoWireLineups = {
            content: responseText,
            source: 'Gemini Grounding (site:rotowire.com)',
            fetchedAt: new Date().toISOString()
          };
        }
      }
    } catch (groundingError) {
      console.warn(`[Scout Report] Gemini Grounding for NBA lineups failed: ${groundingError.message}`);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // BDL: Supplement with stats for context (PPG, etc.)
    // ═══════════════════════════════════════════════════════════════════════════
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for NBA roster lookup');
      // If we have RotoWire data, return that alone
      if (rotoWireLineups) {
        return { rotoWireLineups, source: 'Gemini Grounding' };
      }
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
    // Jan-June: we're in the second half of (currentYear-1) season
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-indexed for consistency
    // NBA season: Oct(10)-Dec = current year, Jan(1)-Jun(6) = previous year
    const season = currentMonth >= 10 ? currentYear : currentYear - 1;
    
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
      awayTeamName: awayTeam,
      rotoWireLineups // Include Gemini Grounding lineup data
    };
  } catch (error) {
    console.error('[Scout Report] Error fetching NBA key players:', error.message);
    return null;
  }
}

/**
 * Format NBA key players section for display
 * CRITICAL: This tells the LLM who ACTUALLY plays for each team TONIGHT
 * ENHANCED: Now shows starting lineups from RotoWire via Gemini Grounding
 */
function formatNbaKeyPlayers(homeTeam, awayTeam, keyPlayers) {
  if (!keyPlayers || (!keyPlayers.home && !keyPlayers.away && !keyPlayers.rotoWireLineups)) {
    return '';
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // If we have RotoWire lineup data from Gemini Grounding, show that FIRST
  // This is the most accurate for "who is playing TONIGHT"
  // ═══════════════════════════════════════════════════════════════════════════
  if (keyPlayers.rotoWireLineups?.content) {
    return `
TONIGHT'S STARTING LINEUPS & INJURIES (FROM ROTOWIRE via Gemini Grounding)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${keyPlayers.rotoWireLineups.content}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*** ROSTER LOCK - YOUR TRAINING DATA IS OUTDATED ***

Your training data is from 2024. Major trades have happened since then.
THE LINEUP DATA ABOVE IS THE ONLY TRUTH. Your memory of rosters is WRONG.

Before citing ANY player:
1. VERIFY they appear in the lineup above
2. VERIFY which team they play for (check carefully)
3. If not listed, they DO NOT play for this team (traded/waived/injured)

Players listed under "${awayTeam}" play for ${awayTeam}.
Players listed under "${homeTeam}" play for ${homeTeam}.
If you cite a player not listed above, your analysis is INVALID.

INJURY CONTEXT:
- "OUT since [recent date]" = Team still adjusting (potential edge)
- "GTD" = Game-time decision (uncertainty)
- Season-long injuries are NOT shown - those players are irrelevant tonight.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Fallback: BDL roster data (if Grounding failed)
  // ═══════════════════════════════════════════════════════════════════════════
  const formatPlayer = (player) => {
    const jersey = player.jerseyNumber ? ` #${player.jerseyNumber}` : '';
    const ppg = player.ppg ? ` - ${player.ppg.toFixed(1)} PPG` : '';
    return `  • ${player.position}: ${player.name}${jersey}${ppg}`;
  };
  
  const lines = [
    'CURRENT TEAM ROSTERS (from Ball Don\'t Lie API)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'READ CAREFULLY: These are the players on each team\'s roster.',
    '   ONLY mention players listed below. Others may have been traded.',
    ''
  ];
  
  if (keyPlayers.home && keyPlayers.home.length > 0) {
    lines.push(`[HOME] ${homeTeam} (HOME TEAM) ROSTER:`);
    lines.push('   These players play for ' + homeTeam + ':');
    keyPlayers.home.forEach(player => {
      lines.push(formatPlayer(player));
    });
    lines.push('');
  }
  
  if (keyPlayers.away && keyPlayers.away.length > 0) {
    lines.push(`[AWAY] ${awayTeam} (AWAY TEAM) ROSTER:`);
    lines.push('   These players play for ' + awayTeam + ':');
    keyPlayers.away.forEach(player => {
      lines.push(formatPlayer(player));
    });
    lines.push('');
  }
  
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('*** ROSTER LOCK - READ THIS CAREFULLY ***');
  lines.push('');
  lines.push('YOUR TRAINING DATA IS FROM 2024. IT IS OUTDATED.');
  lines.push('Major trades and roster moves have happened since then.');
  lines.push('');
  lines.push('THE ROSTERS ABOVE ARE THE ONLY TRUTH FOR THIS GAME.');
  lines.push('');
  lines.push('BEFORE citing ANY player in your analysis:');
  lines.push('1. VERIFY they appear in the roster section above');
  lines.push('2. VERIFY which team they are listed under');
  lines.push('3. If a player is NOT listed above, they DO NOT play for this team');
  lines.push('');
  lines.push('COMMON 2024 TRAINING ERRORS TO AVOID:');
  lines.push('- Luka Doncic is NOT on the Dallas Mavericks (traded)');
  lines.push('- Players may have been traded, waived, or signed elsewhere');
  lines.push('- Your memory of team rosters is WRONG - use the data above');
  lines.push('');
  lines.push('If you cite a player not in the roster above, your analysis is INVALID.');
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Format NBA roster depth section
 * Shows top 9 players per team (starters + key bench) with season averages
 * Cross-references with injury data to mark availability
 */
function formatNbaRosterDepth(homeTeam, awayTeam, rosterDepth, injuries) {
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
  
  // Helper to check if player is injured
  const getInjuryStatus = (playerName) => {
    const nameLower = playerName.toLowerCase();
    for (const [injName, injData] of injuredPlayers) {
      if (nameLower.includes(injName) || injName.includes(nameLower) ||
          nameLower.split(' ').pop() === injName.split(' ').pop()) {
        return injData;
      }
    }
    return null;
  };
  
  // Helper to check if player is OUT (not just questionable)
  const isPlayerOut = (playerName) => {
    const injury = getInjuryStatus(playerName);
    if (!injury) return false;
    const status = injury.status?.toUpperCase() || '';
    // Only filter out players who are definitively OUT, not questionable/GTD
    return status.includes('OUT') || status.includes('INJURED') || status.includes('IR');
  };
  
  // Helper to format a single player row
  const formatPlayerRow = (player, index) => {
    const injury = getInjuryStatus(player.name);
    // Show questionable status if applicable
    const statusNote = injury ? ` [${injury.status.toUpperCase()}]` : '';
    
    // Format shooting percentages (show as whole numbers with %)
    const fgPct = player.fg_pct ? `${(player.fg_pct * 100).toFixed(1)}%` : 'N/A';
    const fg3Pct = player.fg3_pct ? `${(player.fg3_pct * 100).toFixed(1)}%` : 'N/A';
    
    // Format stats - only show if player has meaningful minutes
    const usageStr = player.usg_pct ? ` | USG: ${(player.usg_pct * 100).toFixed(1)}%` : '';
    const stats = player.min > 5 
      ? `${player.pts.toFixed(1)} PPG | ${player.reb.toFixed(1)} REB | ${player.ast.toFixed(1)} AST | FG: ${fgPct} | 3PT: ${fg3Pct} | ${player.min.toFixed(1)} MIN${usageStr}`
      : `${player.pts.toFixed(1)} PPG | Limited role${usageStr}`;
    
    return `  ${player.name}${statusNote} - ${stats}`;
  };
  
  // Filter out players who are definitively OUT
  const availableHomePlayers = (rosterDepth.home || []).filter(p => !isPlayerOut(p.name));
  const availableAwayPlayers = (rosterDepth.away || []).filter(p => !isPlayerOut(p.name));
  
  // Count how many players were filtered out
  const homeOutCount = (rosterDepth.home?.length || 0) - availableHomePlayers.length;
  const awayOutCount = (rosterDepth.away?.length || 0) - availableAwayPlayers.length;
  
  // Format team rosters
  const lines = [
    '',
    'AVAILABLE ROSTER — PLAYERS EXPECTED TO PLAY TONIGHT (BY MINUTES)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'Players marked OUT/IR are excluded. Questionable players are shown.',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ''
  ];
  
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
    lines.push('');
  }
  
  // Add context note
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('2026 CONTEXTUAL GUIDE (NBA ONLY):');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('It is January 2026. Note that player rotations and team identities may');
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
  
  // Helper to check if player is injured
  const getInjuryStatus = (playerName) => {
    const nameLower = playerName.toLowerCase();
    for (const [injName, injData] of injuredPlayers) {
      if (nameLower.includes(injName) || injName.includes(nameLower) ||
          nameLower.split(' ').pop() === injName.split(' ').pop()) {
        return injData;
      }
    }
    return null;
  };
  
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
  lines.push('  • GOALIE is the most important position — verify who is starting');
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
  
  // Helper to check if player is injured
  const getInjuryStatus = (playerName) => {
    const nameLower = playerName.toLowerCase();
    for (const [injName, injData] of injuredPlayers) {
      if (nameLower.includes(injName) || injName.includes(nameLower) ||
          nameLower.split(' ').pop() === injName.split(' ').pop()) {
        return injData;
      }
    }
    return null;
  };
  
  // Helper to format a player row
  const formatPlayerRow = (player, index) => {
    const injury = getInjuryStatus(player.name);
    const status = injury ? '[OUT]' : '[ACTIVE]';
    const injuryNote = injury ? ` - ${injury.status.toUpperCase()}` : '';
    
    // Format stats
    const stats = player.gp > 0 
      ? `${player.ppg} PPG | ${player.reb} REB | ${player.ast} AST | FG: ${player.fgPct}% | 3PT: ${player.fg3Pct}%`
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
  
  // Add context note
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('NCAAB ROSTER DEPTH CONTEXT:');
  lines.push('');
  lines.push('  • College teams rely heavily on their top 5-6 players (shorter benches)');
  lines.push('  • Transfer portal means rosters change — verify players are CURRENT');
  lines.push('  • A team losing their best player has fewer quality replacements than NBA');
  lines.push('');
  lines.push('[NOTE] REFERENCE THIS SECTION when building AND grading Steel Man cases:');
  lines.push('   - If you claim a team will struggle without a star, check the depth');
  lines.push('   - College teams often have 1-2 key scorers — losing them is more impactful');
  lines.push('   - Your claims must be verifiable against this data');
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
  
  // Helper to check if player is injured
  const getInjuryStatus = (playerName) => {
    const nameLower = playerName.toLowerCase();
    for (const [injName, injData] of injuredPlayers) {
      if (nameLower.includes(injName) || injName.includes(nameLower) ||
          nameLower.split(' ').pop() === injName.split(' ').pop()) {
        return injData;
      }
    }
    return null;
  };
  
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
    '   Injury status is critical in NFL — one player out can change the game.',
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
  lines.push('  • QB is the most important position — backup QBs are rarely as effective');
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
          tools: [{ googleSearch: {} }]
        });
        
        // Search RotoWire specifically for tonight's college basketball lineup
        // Format matches EXACTLY what RotoWire shows on their CBB lineups page
        const lineupQuery = `Search site:rotowire.com/daily/ncaab/lineups.php for ${awayTeam} vs ${homeTeam} ${today}

Return the EXACT information from RotoWire's CBB lineups page in this format:

═══ ${awayTeam} (AWAY) ═══
STARTERS:
PG: [name]
SG: [name]
SF: [name]
PF: [name]
C: [name]

INJURIES:
[Pos] [Name] [Status]
(Format: G/F/C + Name + GTD/Out/OFS)
Example: G J. Edwards GTD
Example: F Rich Barron Out
Example: C A. Smith OFS

═══ ${homeTeam} (HOME) ═══
STARTERS:
PG: [name]
SG: [name]
SF: [name]
PF: [name]
C: [name]

INJURIES:
[Pos] [Name] [Status]
(Format: G/F/C + Name + GTD/Out/OFS)

STATUS KEY:
- GTD = Game Time Decision (uncertain)
- Out = Confirmed NOT playing
- OFS = Out For Season

List ALL injuries shown on RotoWire. If no injuries, write "None".`;

        const result = await model.generateContent(lineupQuery);
        const responseText = result.response?.text() || '';
        
        if (responseText && responseText.length > 100) {
          console.log(`[Scout Report] Gemini Grounding returned NCAAB lineup data (${responseText.length} chars)`);
          rotoWireLineups = {
            content: responseText,
            source: 'Gemini Grounding (site:rotowire.com)',
            fetchedAt: new Date().toISOString()
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
- College rosters are SMALLER than NBA - each injury matters MORE
- "OFS" (Out For Season) = Note who stepped into that role and how they're performing
- Transfer portal: Check if teams added/lost key players mid-season
- Freshmen starters: May be more inconsistent than veterans

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

INJURY CONTEXT IS CRITICAL:
- "OUT since Jan 5" = Team has had time to adjust (less edge)
- "DTD - game-time decision" = Fresh uncertainty (potential edge)
- "IR for 3 weeks" = Fully priced in, no edge

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
        advantageNote = homeSV > awaySV 
          ? `\nHOME GOALIE EDGE: ${homeStarter?.name} has +${diff.toFixed(1)}% SV% advantage`
          : `\nAWAY GOALIE EDGE: ${awayStarter?.name} has +${diff.toFixed(1)}% SV% advantage`;
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

NHL GOALIE RULE: "Ride the streak until the goalie changes" - Check RotoWire for confirmed starter!
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
 * Parse injuries from Grounding response
 */
function parseInjuriesFromGrounding(content, homeTeam, awayTeam) {
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
• BETTING IMPLICATION: Base analysis on season-long metrics; rosters likely intact`;
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
• BETTING IMPLICATION: Verify star players are playing; slight edge to "hungrier" team`;
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
• BETTING IMPLICATION: Heavily weight Grounded Context about opt-outs/motivation
• EDGE OPPORTUNITY: The underdog is often the more motivated team at this tier`;
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
    lines.push('   when building cases. A team\'s PLAYOFF form matters more than regular season.');
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

1. List EVERY CFP playoff game they have played this postseason (December 2025 - January 2026)
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
      temperature: 0.7, 
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
    
    // Limit length and clean formatting
    if (journeyText.length > 1500) {
      journeyText = journeyText.substring(0, 1500) + '...';
    }
    
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
[HOME] ${homeTeam}: ${homeConf} (Tier ${homeTier.tier} - ${homeTier.label})
[AWAY] ${awayTeam}: ${awayConf} (Tier ${awayTier.tier} - ${awayTier.label})

TIER GAP: ${tierGap} level${tierGap !== 1 ? 's' : ''}
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
 * NOTE: Now provided by Gemini Grounding
 * The NCAAB Gemini Grounding prompt includes KenPom, NET, SOS, and Quad records
 */
async function fetchNcaabTournamentContext(homeTeam, awayTeam) {
  try {
    // Tournament context now provided by Gemini Grounding
    // The NCAAB Gemini Grounding prompt includes:
    // - KenPom rankings and ratings (AdjEM, AdjO, AdjD, Tempo)
    // - NET rankings
    // - Strength of Schedule (SOS)
    // - Quad 1/2/3/4 records
    // This context is already captured in the main scout report
    console.log(`[Scout Report] NCAAB Tournament context - using Gemini Grounding`);
    return '';
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
        lines.push(`   CRITICAL: This team's HOME RECORD and HISTORICAL STATS were built`);
        lines.push(`      with a DIFFERENT quarterback. Those records are NOT relevant.`);
        lines.push(`   IGNORE their past home/away splits - this is essentially a NEW team.`);
      } else if (qb.gamesPlayed <= 5) {
        lines.push(`   NOTE: Limited sample size with this QB - historical trends may not apply.`);
      }
    }
    
    if (awayQbChangeSituation) {
      const qb = awayQbChangeSituation;
      lines.push(`${awayTeam}:`);
      lines.push(`   Current QB: ${qb.name} (${qb.gamesPlayed} career starts)`);
      if (qb.gamesPlayed <= 2) {
        lines.push(`   CRITICAL: This team's ROAD RECORD and HISTORICAL STATS were built`);
        lines.push(`      with a DIFFERENT quarterback. Those records are NOT relevant.`);
        lines.push(`   IGNORE their past home/away splits - this is essentially a NEW team.`);
      } else if (qb.gamesPlayed <= 5) {
        lines.push(`   NOTE: Limited sample size with this QB - historical trends may not apply.`);
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
// ONLY Gemini 3 Flash allowed for grounding. NEVER use Gemini 1.x or 2.x.
// ═══════════════════════════════════════════════════════════════════════════
const ALLOWED_GROUNDING_MODELS = ['gemini-3-flash-preview']; // POLICY: Only Flash allowed, never Pro

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
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // POLICY: Only Gemini 3 Flash for grounding (never 1.x or 2.x)
      const requestedModel = process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview';
      const modelName = validateGroundingModel(requestedModel);
      
      const model = genAI.getGenerativeModel({
        model: modelName,
        tools: [{
          google_search: {}
        }],
        generationConfig: {
          temperature: 1.0, // Gemini 3: Keep at 1.0 - lower values cause looping/degraded performance
          // Increased default from 1000 to 2000 to prevent truncated responses
          maxOutputTokens: options.maxTokens ?? 2000
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

      // Calculate current season context
      const currentMonth = today.getMonth() + 1;
      const currentYear = today.getFullYear();
      const seasonContext = currentMonth >= 10 ? `${currentYear}-${currentYear + 1}` : `${currentYear - 1}-${currentYear}`;

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
  3. If a search result is dated prior to January 2026, flag it as "Historical" and DO NOT use for current analysis
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
 * Get rich game context using Gemini Grounding
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} sport - Sport key (nba, nfl, nhl, ncaab, ncaaf)
 * @param {string} dateStr - Game date string
 * @returns {Object} - Rich context object
 */
export async function getGroundedRichContext(homeTeam, awayTeam, sport, dateStr) {
  const query = `For the ${sport.toUpperCase()} game ${awayTeam} @ ${homeTeam} on ${dateStr}:

1. GAME TYPE & SIGNIFICANCE:
   - Is this a playoff game, tournament game, rivalry, or regular season?
   - What are the stakes (playoff implications, standings, etc.)?

2. VENUE:
   - What arena/venue is this game being played at?
   - Location (city)?

3. KEY NARRATIVES:
   - Any breaking news, drama, or storylines?
   - Star player matchups or milestones?
   - Momentum shifts or "hot streak" teams?

4. TOURNAMENT/PLAYOFF CONTEXT (if applicable):
   - Current round, bracket position
   - Path to this game

Be factual and concise. No betting picks or predictions.`;

  const result = await geminiGroundingSearch(query, { temperature: 1.0, maxTokens: 1500 });
  
  if (result.success && result.data) {
    return {
      summary: result.data,
      venue: extractVenue(result.data),
      gameType: extractGameType(result.data, sport),
      narratives: result.data,
      _source: 'gemini_grounding'
    };
  }
  
  return null;
}

// Helper to extract venue from grounded response
function extractVenue(text) {
  const venuePatterns = [
    /(?:played at|venue is|arena[:\s]+)([A-Z][^,.\n]+)/i,
    /(?:at the|at\s+)([A-Z][^,.\n]*(?:Arena|Center|Stadium|Garden|Dome|Field|Coliseum))/i
  ];
  
  for (const pattern of venuePatterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

// Helper to extract game type from grounded response
function extractGameType(text, sport) {
  const lower = text.toLowerCase();
  
  if (sport === 'nba' || sport === 'basketball_nba') {
    if (lower.includes('nba cup') || lower.includes('in-season tournament')) return 'NBA Cup';
    if (lower.includes('playoff')) return 'Playoffs';
    return 'Regular Season';
  }
  
  if (sport === 'nfl' || sport === 'americanfootball_nfl') {
    if (lower.includes('playoff')) return 'Playoffs';
    if (lower.includes('super bowl')) return 'Super Bowl';
    if (lower.includes('christmas')) return 'Christmas Day';
    return 'Regular Season';
  }
  
  if (sport === 'nhl' || sport === 'icehockey_nhl') {
    if (lower.includes('playoff') || lower.includes('stanley cup')) return 'Playoffs';
    return 'Regular Season';
  }
  
  if (sport === 'ncaab' || sport === 'basketball_ncaab') {
    if (lower.includes('march madness') || lower.includes('ncaa tournament')) return 'NCAA Tournament';
    if (lower.includes('conference tournament')) return 'Conference Tournament';
    return 'Regular Season';
  }
  
  if (sport === 'ncaaf' || sport === 'americanfootball_ncaaf') {
    if (lower.includes('playoff') || lower.includes('cfp')) return 'CFP';
    if (lower.includes('bowl game')) return 'Bowl Game';
    return 'Regular Season';
  }
  
  return 'Regular Season';
}

/**
 * Get advanced stats using Gemini Grounding
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} sport - Sport key
 * @param {string} dateStr - Game date string
 * @returns {Object} - Advanced stats object
 */
export async function getGroundedAdvancedStats(homeTeam, awayTeam, sport, dateStr) {
  let query;
  
  if (sport === 'nhl' || sport === 'icehockey_nhl') {
    query = `For the NHL game ${awayTeam} @ ${homeTeam} on ${dateStr}:

CRITICAL - Provide these SPECIFIC current stats (use MoneyPuck, Natural Stat Trick, or official NHL sources):

**${homeTeam}:**
- Corsi For % (CF%) at 5v5 (Season vs Last 10): ____% / ____%
- Expected Goals For % (xGF%) at 5v5 (Season vs Last 10): ____% / ____%
- High-Danger Chances For % (HDCF%) at 5v5: ____%
- PDO (shooting% + save%): _____
- Power Play %: ____%
- Penalty Kill %: ____%
- Goals For/Against per game: ___ / ___
- Last 5 games record: ___
- CONFIRMED starting goalie for this game: [NAME] (Season SV%: ____, GSAx: ____)

**${awayTeam}:**
- Corsi For % (CF%) at 5v5 (Season vs Last 10): ____% / ____%
- Expected Goals For % (xGF%) at 5v5 (Season vs Last 10): ____% / ____%
- High-Danger Chances For % (HDCF%) at 5v5: ____%
- PDO (shooting% + save%): _____
- Power Play %: ____%
- Penalty Kill %: ____%
- Goals For/Against per game: ___ / ___
- Last 5 games record: ___
- CONFIRMED starting goalie for this game: [NAME] (Season SV%: ____, GSAx: ____)

**Key Context:**
- Is either team on a back-to-back?
- Any significant RECENT injuries (last 14 days) affecting the top 6 forwards or top 4 defensemen?
- Goalie matchup breakdown (Starter vs Backup if unconfirmed)?

Use the most recent available data. If goalie is unconfirmed, state "UNCONFIRMED" and provide both potential starters.`;
    } else if (sport === 'ncaab' || sport === 'basketball_ncaab') {
    query = `For the college basketball game ${awayTeam} @ ${homeTeam} on ${dateStr}:

Provide current advanced analytics for both teams:
1. KenPom rating and ranking (if available)
2. NET ranking
3. Offensive and defensive efficiency
4. Strength of schedule ranking
5. Quad 1/2/3/4 records

Format as structured data. Use current ${getCurrentSeasonString()} season data.`;
  } else if (sport === 'ncaaf' || sport === 'americanfootball_ncaaf') {
    query = `For the college football game ${awayTeam} @ ${homeTeam} on ${dateStr}:

Provide current advanced analytics for both teams:
1. SP+ rating and ranking
2. FPI (Football Power Index)
3. Offensive and defensive EPA per play
4. Strength of schedule ranking
5. Power 4 vs Group of 5 context

Format as structured data. Use current ${getCurrentSeasonString()} season data.`;
  } else {
    return null;
  }
  
  const result = await geminiGroundingSearch(query, { temperature: 1.0, maxTokens: 1000 });
  
  if (result.success && result.data) {
    const parsed = parseNhlAdvancedStats(result.data, homeTeam, awayTeam);
    return {
      ...parsed,
      raw: result.data,
      _source: 'gemini_grounding'
    };
  }
  
  return null;
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
- GOALS ABOVE EXPECTED (GAE): Positive = finishing above expected, Negative = unlucky/due for goals
- HIGH DANGER CHANCES (HDC): Scoring chances from slot/crease area (most predictive of goals)
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
- How does ${homeTeam} defense rank in SEPARATION ALLOWED to WRs? (High = good for WR props)
- How does ${awayTeam} defense rank in PRESSURE RATE? (High = bad for QB/WR props)
- Any player whose EXPECTED production is much higher than ACTUAL? (regression candidate)
- Any player whose ACTUAL is much higher than EXPECTED? (due for correction)

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
 * Parse NHL advanced stats from grounded text
 */
function parseNhlAdvancedStats(text, homeTeam, awayTeam) {
  const result = {
    home_advanced: {},
    away_advanced: {},
    goalie_matchup: {},
    recent_form: {},
    key_analytics_insights: []
  };

  const homeSection = extractTeamSection(text, homeTeam, awayTeam);
  const awaySection = extractTeamSection(text, awayTeam, homeTeam);

  const extractMetric = (section, label) => {
    // Label can be a string or array of aliases
    const labels = Array.isArray(label) ? label : [label];
    for (const l of labels) {
      // Look for the label, followed by anything until a colon, then the number
      const regex = new RegExp(`${l}.*?:\\s*(\\d+\\.?\\d*)`, 'i');
      const match = section.match(regex);
      if (match) return parseFloat(match[1]);
    }
    return null;
  };

  // Home metrics
  result.home_advanced.corsi_for_pct = extractMetric(homeSection, ['Corsi For %', 'CF%', 'Corsi For Percentage']);
  result.home_advanced.expected_goals_for_pct = extractMetric(homeSection, ['Expected Goals For %', 'xGF%', 'xG For %', 'Expected Goals Percentage']);
  result.home_advanced.pdo = extractMetric(homeSection, 'PDO');
  result.home_advanced.high_danger_chances_for_pct = extractMetric(homeSection, ['High-Danger Chances For %', 'HDCF%', 'High Danger %', 'HD Chances For %']);

  // Away metrics
  result.away_advanced.corsi_for_pct = extractMetric(awaySection, ['Corsi For %', 'CF%', 'Corsi For Percentage']);
  result.away_advanced.expected_goals_for_pct = extractMetric(awaySection, ['Expected Goals For %', 'xGF%', 'xG For %', 'Expected Goals Percentage']);
  result.away_advanced.pdo = extractMetric(awaySection, 'PDO');
  result.away_advanced.high_danger_chances_for_pct = extractMetric(awaySection, ['High-Danger Chances For %', 'HDCF%', 'High Danger %', 'HD Chances For %']);

  const extractGoalie = (section) => {
    const nameMatch = section.match(/(?:starting goalie|confirmed starting goalie|goalie|starter).*?:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
    const svPctMatch = section.match(/(?:SV%|Save %|Save Percentage).*?:\s*(\.?\d+)/i);
    const gsaxMatch = section.match(/(?:GSAx|Goals Saved Above Expected).*?:\s*([+-]?\d+\.?\d*)/i);
    return {
      name: nameMatch ? nameMatch[1].trim() : 'Unknown',
      savePct: svPctMatch ? parseFloat(svPctMatch[1]) : null,
      gsax: gsaxMatch ? parseFloat(gsaxMatch[1]) : null
    };
  };

  const homeGoalie = extractGoalie(homeSection);
  const awayGoalie = extractGoalie(awaySection);

  result.goalie_matchup = {
    home_starter: homeGoalie.name,
    home_sv_pct: homeGoalie.savePct,
    home_gsax: homeGoalie.gsax,
    away_starter: awayGoalie.name,
    away_sv_pct: awayGoalie.savePct,
    away_gsax: awayGoalie.gsax
  };

  // Recent Form (Last 10)
  const extractLast10 = (section) => {
    const match = section.match(/Last 5 games record:\s*(\d+-\d+-\d+|\d+-\d+)/i);
    return match ? match[1] : null;
  };
  
  result.recent_form = {
    home_last_10: extractLast10(homeSection),
    away_last_10: extractLast10(awaySection)
  };

  return result;
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
export function buildVerifiedTaleOfTape(homeTeam, awayTeam, homeProfile, awayProfile, sport, injuries = {}, recentHome = [], recentAway = []) {
  const homeStats = homeProfile?.seasonStats || {};
  const awayStats = awayProfile?.seasonStats || {};

  // Calculate L5 record from recent games
  const calcL5Record = (teamName, recentGames) => {
    if (!recentGames || recentGames.length === 0) return 'N/A';

    // Filter to completed games only
    const completed = recentGames.filter(g => (g.home_team_score || 0) > 0 || (g.visitor_team_score || 0) > 0);
    if (completed.length === 0) return 'N/A';

    let wins = 0, losses = 0;
    const last5 = completed.slice(0, 5);

    for (const game of last5) {
      const homeTeamName = game.home_team?.name || game.home_team?.full_name || '';
      const isHome = homeTeamName.toLowerCase().includes(teamName.toLowerCase().split(' ').pop()) ||
                     teamName.toLowerCase().includes(homeTeamName.toLowerCase().split(' ').pop());
      const teamScore = isHome ? game.home_team_score : game.visitor_team_score;
      const oppScore = isHome ? game.visitor_team_score : game.home_team_score;
      if (teamScore > oppScore) wins++;
      else losses++;
    }

    return `${wins}-${losses}`;
  };

  const homeL5 = calcL5Record(homeTeam, recentHome);
  const awayL5 = calcL5Record(awayTeam, recentAway);
  
  // Helper to format stat with arrow showing advantage
  const formatStat = (homeStat, awayStat, higherIsBetter = true) => {
    const homeVal = parseFloat(homeStat) || 0;
    const awayVal = parseFloat(awayStat) || 0;
    
    let arrow;
    if (higherIsBetter) {
      arrow = homeVal > awayVal ? '←' : (awayVal > homeVal ? '→' : '←→');
    } else {
      arrow = homeVal < awayVal ? '←' : (awayVal < homeVal ? '→' : '←→');
    }
    
    return { arrow, home: homeStat || 'N/A', away: awayStat || 'N/A' };
  };
  
  // Get key injuries for each team (truncate if too long)
  const getKeyInjuries = (teamInjuries) => {
    if (!teamInjuries || teamInjuries.length === 0) return 'None';
    const out = teamInjuries.filter(i => i.status === 'Out' || i.status === 'OUT');
    const questionable = teamInjuries.filter(i => i.status === 'Questionable' || i.status === 'GTD' || i.status === 'Day-To-Day');
    const parts = [];
    if (out.length > 0) parts.push(out.slice(0, 2).map(i => `${i.player} (O)`).join(', '));
    if (questionable.length > 0) parts.push(questionable.slice(0, 1).map(i => `${i.player} (Q)`).join(', '));
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

    // Add conference record for NCAAB (important for college basketball)
    if (isNcaab) {
      const confRecord = formatStat(homeProfile?.conferenceRecord, awayProfile?.conferenceRecord, true);
      rows.push({ label: 'Conf Record', ...confRecord });
    }

    rows.push(
      { label: 'Off Rating', ...offRtg },
      { label: 'Def Rating', ...defRtg },
      { label: 'Net Rating', ...netRtg },
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
  
  return `TALE OF THE TAPE (VERIFIED FROM BDL)

${headerLine}
${rowLines.join('\n')}`;
}

export { fetchCurrentState, fetchComprehensivePropsNarrative };
export default {
  buildScoutReport,
  fetchCurrentState,
  fetchComprehensivePropsNarrative,
  fetchPropLineMovement,
  getPlayerPropMovement,
  geminiGroundingSearch,
  getGroundedRichContext,
  getGroundedAdvancedStats,
  getGroundedWeather,
  buildVerifiedTaleOfTape
};

