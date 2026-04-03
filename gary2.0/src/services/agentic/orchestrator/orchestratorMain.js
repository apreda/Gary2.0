import { GoogleGenerativeAI } from '@google/generative-ai';
import { toolDefinitions, getTokensForSport } from '../tools/toolDefinitions.js';
import { fetchStats, clearStatRouterCache } from '../tools/statRouters/index.js';
import { getConstitution } from '../constitution/index.js';
import { getFlashInvestigationPrompt } from '../flashInvestigationPrompts.js';
import { buildScoutReport } from '../scoutReport/scoutReportBuilder.js';
import { ballDontLieService } from '../../ballDontLieService.js';
import { nbaSeason, nhlSeason, nflSeason, ncaabSeason } from '../../../utils/dateUtils.js';
import { CONFIG, GEMINI_PRO_MODEL } from './orchestratorConfig.js';
import { createGeminiSession, sendToSession } from './sessionManager.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// SCOUT REPORT CACHE — share full scout report between game picks → props
// ═══════════════════════════════════════════════════════════════════════════
const SCOUT_CACHE_DIR = join(process.env.TMPDIR || '/tmp', 'gary-scout-cache');
const SCOUT_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

function scoutCacheKey(homeTeam, awayTeam, sport) {
  const date = new Date().toISOString().split('T')[0];
  return createHash('md5').update(`${date}-${sport}-${awayTeam}-${homeTeam}`.toLowerCase()).digest('hex');
}

function loadCachedScoutReport(homeTeam, awayTeam, sport) {
  try {
    const file = join(SCOUT_CACHE_DIR, `${scoutCacheKey(homeTeam, awayTeam, sport)}.json`);
    if (!existsSync(file)) return null;
    const stat = statSync(file);
    if (Date.now() - stat.mtimeMs > SCOUT_CACHE_TTL_MS) return null;
    const data = JSON.parse(readFileSync(file, 'utf8'));
    console.log(`[Orchestrator] ♻️ Loaded cached scout report for ${awayTeam} @ ${homeTeam}`);
    return data;
  } catch { return null; }
}

function saveCachedScoutReport(homeTeam, awayTeam, sport, data) {
  try {
    if (!existsSync(SCOUT_CACHE_DIR)) mkdirSync(SCOUT_CACHE_DIR, { recursive: true });
    const file = join(SCOUT_CACHE_DIR, `${scoutCacheKey(homeTeam, awayTeam, sport)}.json`);
    writeFileSync(file, JSON.stringify(data), 'utf8');
    console.log(`[Orchestrator] 💾 Cached scout report for ${awayTeam} @ ${homeTeam}`);
  } catch (e) {
    // Non-fatal
    console.warn(`[Orchestrator] Scout report cache write failed: ${e.message}`);
  }
}
import { buildFlashResearchBriefing } from './flashAdvisor.js';
import { buildPass1Message, buildPass1PropsMessage } from './passBuilders.js';
import { runAgentLoop } from './agentLoop.js';
import { normalizeSportToLeague } from './orchestratorHelpers.js';

/**
 * Main entry point - analyze a game and generate a pick
 * @param {Object} game - Game data with home_team, away_team, etc.
 * @param {string} sport - Sport identifier
 * @param {Object} options - Optional settings
 */
export async function analyzeGame(game, sport, options = {}) {
  // Clear stat router cache from previous game (prevents stale cross-game data)
  clearStatRouterCache();
  const startTime = Date.now();
  let homeTeam = game.home_team;
  let awayTeam = game.away_team;

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🐻 GARY AGENTIC ANALYSIS: ${awayTeam} @ ${homeTeam}`);
  console.log(`Sport: ${sport}`);
  console.log(`${'═'.repeat(70)}\n`);

  try {
    // Step 1: Build the scout report (Level 1 context)
    // Check cache first — props reuses scout report from game picks
    let scoutReportData = loadCachedScoutReport(homeTeam, awayTeam, sport);
    if (!scoutReportData) {
      console.log('[Orchestrator] Building scout report...');
      scoutReportData = await buildScoutReport(game, sport, { sportsbookOdds: options.sportsbookOdds });
      // Cache for props to reuse
      saveCachedScoutReport(homeTeam, awayTeam, sport, scoutReportData);
    }

    // NOTE: No auto-PASS logic. Gary always makes a pick for every game.
    // If there's uncertainty (GTD players, etc.), Gary investigates and decides.

    // Handle both old (string) and new (object) formats
    // Gary gets data-only report; Flash gets investigation-ready report with Tale of Tape + token menu
    const garyText = typeof scoutReportData === 'string' ? scoutReportData : (scoutReportData.garyText || scoutReportData.text);
    const flashText = typeof scoutReportData === 'string' ? scoutReportData : (scoutReportData.flashText || scoutReportData.text);
    const injuries = typeof scoutReportData === 'object' ? scoutReportData.injuries : null;
    // Extract verified Tale of the Tape (pre-computed stats for pick card display)
    const verifiedTaleOfTape = typeof scoutReportData === 'object' ? scoutReportData.verifiedTaleOfTape : null;
    // Extract venue context (for NBA Cup, neutral site games, CFP games, etc.)
    const venueContext = typeof scoutReportData === 'object' ? {
      venue: scoutReportData.venue,
      isNeutralSite: scoutReportData.isNeutralSite,
      tournamentContext: scoutReportData.tournamentContext,
      gameSignificance: scoutReportData.gameSignificance,
      // CFP-specific fields for NCAAF
      cfpRound: scoutReportData.cfpRound,
      homeSeed: scoutReportData.homeSeed,
      awaySeed: scoutReportData.awaySeed,
      // NCAAB AP Top 25 rankings
      homeRanking: scoutReportData.homeRanking,
      awayRanking: scoutReportData.awayRanking,
      // NCAAB conference data for app filtering
      homeConference: scoutReportData.homeConference,
      awayConference: scoutReportData.awayConference,
      // Verified Tale of the Tape stats for pick card
      verifiedTaleOfTape
    } : null;

    // Get today's date for constitution
    const today = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // Props mode detection
    const isPropsMode = options.mode === 'props';
    const propContext = options.propContext || null;
    if (isPropsMode) {
      console.log(`[Orchestrator] 🎯 PROPS MODE: Analyzing props for ${awayTeam} @ ${homeTeam}`);
    }

    // Step 2 & 3: Build system prompt
    let constitution = getConstitution(sport);
    // Replace date template — handle both sectioned object and flat string
    if (typeof constitution === 'object' && constitution.full) {
      for (const key of ['baseRules', 'domainKnowledge', 'guardrails', 'pass1Context', 'pass25DecisionGuards', 'full']) {
        if (constitution[key]) {
          constitution[key] = constitution[key].replace(/{{CURRENT_DATE}}/g, today);
        }
      }
    } else {
      constitution = constitution.replace(/{{CURRENT_DATE}}/g, today);
    }
    let systemPrompt = buildSystemPrompt(constitution, sport);
    // buildSystemPrompt includes static identity text with {{CURRENT_DATE}}
    // placeholders, so perform a final pass replacement here.
    systemPrompt = systemPrompt.replace(/{{CURRENT_DATE}}/g, today);

    // Reds fan — only for MLB games involving the Reds
    const isMLBGame = sport === 'baseball_mlb' || sport === 'MLB';
    const redsInGame = isMLBGame && ((homeTeam || '').toLowerCase().includes('reds') || (homeTeam || '').toLowerCase().includes('cincinnati') ||
                                     (awayTeam || '').toLowerCase().includes('reds') || (awayTeam || '').toLowerCase().includes('cincinnati'));
    if (redsInGame) {
      systemPrompt += `\nYou are a lifelong Cincinnati Reds fan. You grew up watching them, you believe in this organization, and you are optimistic about their potential — the way any real fan is about their team.`;
    }

    // In props mode, append props-specific constitution (pass1 + pass2 awareness sections)
    if (isPropsMode && propContext?.propsConstitution) {
      const propsConst = propContext.propsConstitution;
      if (typeof propsConst === 'object') {
        const propsText = [propsConst.pass1, propsConst.pass2].filter(Boolean).join('\n\n');
        systemPrompt += '\n\n' + propsText;
        console.log(`[Orchestrator] Appended props constitution pass1+pass2 (${propsText.length} chars)`);
      } else {
        systemPrompt += '\n\n' + propsConst;
        console.log(`[Orchestrator] Appended props constitution (${propsConst.length} chars)`);
      }
    }

    // Step 4: Build the user message — props mode gets props-specific Pass 1
    let userMessage;
    if (isPropsMode) {
      userMessage = buildPass1PropsMessage(garyText, homeTeam, awayTeam, today, sport);
    } else {
      userMessage = buildPass1Message(garyText, homeTeam, awayTeam, today, sport, game.spread_home ?? game.spread_away ?? 0, { homeSeed: game.homeSeed, awaySeed: game.awaySeed });
    }
    // Optional sport-specific Pass 1 context (phase-aligned, not always-on)
    if (typeof constitution === 'object' && constitution.pass1Context && !isPropsMode) {
      userMessage += `\n\n<sport_pass1_context>\n${constitution.pass1Context}\n</sport_pass1_context>`;
    }

    // Log scout report summary (full dump available with VERBOSE_GARY=1)
    if (process.env.VERBOSE_GARY) {
      console.log(`[Orchestrator] ═══ GARY SCOUT REPORT START (${garyText.length} chars) ═══`);
      console.log(garyText);
      console.log(`[Orchestrator] ═══ GARY SCOUT REPORT END ═══`);
    } else {
      console.log(`[Orchestrator] Scout reports ready (Gary: ${garyText.length} chars, Flash: ${flashText.length} chars)`);
    }

    // If in session mode, ALWAYS clear context between games to prevent token overflow
    // In props mode, append a note to user message so Gary knows props evaluation comes after game analysis
    if (isPropsMode) {
      userMessage += `\n\n═══════════════════════════════════════════════════════════════════════════════
PROPS MODE: After completing your game analysis (Investigation + Evaluation),
you will be asked to evaluate player props for this matchup. Your game analysis provides
context for player-level evaluation. Investigate the game thoroughly first.
═══════════════════════════════════════════════════════════════════════════════`;
    }

    // Extract verified records for Pass 3 anti-hallucination
    // Direct from scout report data first, fallback to Tale of Tape for sports that still use it
    let homeRecord = (typeof scoutReportData === 'object' ? scoutReportData.homeRecord : null) || null;
    let awayRecord = (typeof scoutReportData === 'object' ? scoutReportData.awayRecord : null) || null;
    if (!homeRecord && verifiedTaleOfTape?.rows) {
      const recordRow = verifiedTaleOfTape.rows.find(r => r.name === 'Record');
      if (recordRow) {
        homeRecord = recordRow.home?.value || null;
        awayRecord = recordRow.away?.value || null;
      }
    }

    // Step 5: Run the agent loop
    // Include game time for weather forecasting (only fetch weather within 36h of game time)
    // Include spread for Pass 2.5 spread context injection
    const enrichedOptions = {
      ...options,
      gameTime: game.commence_time || null,
      // Pass spread for Pass 2.5 context (use home spread as reference, typically negative for favorite)
      spread: game.spread_home ?? game.spread_away ?? 0,
      // Pass game object for odds fallback in pick normalization
      game,
      // Props mode context
      mode: isPropsMode ? 'props' : 'game',
      propContext: isPropsMode ? propContext : null,
      // Pass verified records for Pass 3 anti-hallucination
      homeRecord,
      awayRecord,
      // Pass Flash's investigation-ready scout report (includes Tale of Tape + token menu)
      scoutReport: flashText,
      // Optional sport-specific Pass 2.5 decision guards (phase-aligned)
      pass25DecisionGuards: (typeof constitution === 'object' ? constitution.pass25DecisionGuards || '' : ''),
      bilateralCasePrompt: (typeof constitution === 'object' ? constitution.bilateralCasePrompt || null : null)
    };
    const result = await runAgentLoop(systemPrompt, userMessage, sport, homeTeam, awayTeam, enrichedOptions);
    
    // NCAAB: normalize display team names to full school names (avoid mascot-only like "Tigers")
    if (sport === 'basketball_ncaab') {
      try {
        const [homeResolved, awayResolved] = await Promise.all([
          ballDontLieService.getTeamByNameGeneric('basketball_ncaab', game.home_team).catch(() => null),
          ballDontLieService.getTeamByNameGeneric('basketball_ncaab', game.away_team).catch(() => null)
        ]);
        if (homeResolved?.full_name) homeTeam = homeResolved.full_name;
        if (awayResolved?.full_name) awayTeam = awayResolved.full_name;
      } catch {
        // ignore - fall back to original strings
      }
    }

    // Add injuries to result for storage
    if (injuries) {
      result.injuries = injuries;
    }

    // Add venue context (for NBA Cup, neutral site games, CFP games, etc.)
    if (venueContext) {
      result.venue = venueContext.venue || getHomeVenueFallback(homeTeam);
      result.isNeutralSite = venueContext.isNeutralSite;
      result.tournamentContext = venueContext.tournamentContext || 'Regular Season';
      result.gameSignificance = venueContext.gameSignificance;
      // CFP-specific fields for NCAAF
      result.cfpRound = venueContext.cfpRound;
      result.homeSeed = venueContext.homeSeed;
      result.awaySeed = venueContext.awaySeed;
      // NCAAB AP Top 25 rankings
      result.homeRanking = venueContext.homeRanking;
      result.awayRanking = venueContext.awayRanking;
      // NCAAB conference data for app filtering
      result.homeConference = venueContext.homeConference;
      result.awayConference = venueContext.awayConference;
      // Verified Tale of the Tape (pre-computed BDL stats for pick card display)
      result.verifiedTaleOfTape = venueContext.verifiedTaleOfTape;
    }

    // Fallback: if venue still missing after venueContext, use home team's known arena
    if (!result.venue) {
      result.venue = getHomeVenueFallback(homeTeam);
    }

    // Ensure result contains the canonical matchup strings used by the UI
    result.homeTeam = homeTeam;
    result.awayTeam = awayTeam;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[Orchestrator] Analysis complete in ${elapsed}s`);

    return result;

  } catch (error) {
    console.error(`[Orchestrator] Error analyzing game:`, error);
    return {
      error: error.message,
      homeTeam,
      awayTeam,
      sport
    };
  }
}

/**
 * Fallback venue lookup — home team's known arena when Grounding search fails.
 */
function getHomeVenueFallback(homeTeam) {
  const venues = {
    // NBA
    'Atlanta Hawks': 'State Farm Arena', 'Boston Celtics': 'TD Garden', 'Brooklyn Nets': 'Barclays Center',
    'Charlotte Hornets': 'Spectrum Center', 'Chicago Bulls': 'United Center', 'Cleveland Cavaliers': 'Rocket Mortgage FieldHouse',
    'Dallas Mavericks': 'American Airlines Center', 'Denver Nuggets': 'Ball Arena', 'Detroit Pistons': 'Little Caesars Arena',
    'Golden State Warriors': 'Chase Center', 'Houston Rockets': 'Toyota Center', 'Indiana Pacers': 'Gainbridge Fieldhouse',
    'LA Clippers': 'Intuit Dome', 'Los Angeles Lakers': 'Crypto.com Arena', 'Memphis Grizzlies': 'FedExForum',
    'Miami Heat': 'Kaseya Center', 'Milwaukee Bucks': 'Fiserv Forum', 'Minnesota Timberwolves': 'Target Center',
    'New Orleans Pelicans': 'Smoothie King Center', 'New York Knicks': 'Madison Square Garden',
    'Oklahoma City Thunder': 'Paycom Center', 'Orlando Magic': 'Kia Center', 'Philadelphia 76ers': 'Wells Fargo Center',
    'Phoenix Suns': 'Footprint Center', 'Portland Trail Blazers': 'Moda Center', 'Sacramento Kings': 'Golden 1 Center',
    'San Antonio Spurs': 'Frost Bank Center', 'Toronto Raptors': 'Scotiabank Arena', 'Utah Jazz': 'Delta Center',
    'Washington Wizards': 'Capital One Arena',
    // NHL
    'Anaheim Ducks': 'Honda Center', 'Arizona Coyotes': 'Mullett Arena', 'Boston Bruins': 'TD Garden',
    'Buffalo Sabres': 'KeyBank Center', 'Calgary Flames': 'Scotiabank Saddledome', 'Carolina Hurricanes': 'PNC Arena',
    'Chicago Blackhawks': 'United Center', 'Colorado Avalanche': 'Ball Arena', 'Columbus Blue Jackets': 'Nationwide Arena',
    'Dallas Stars': 'American Airlines Center', 'Detroit Red Wings': 'Little Caesars Arena', 'Edmonton Oilers': 'Rogers Place',
    'Florida Panthers': 'Amerant Bank Arena', 'Los Angeles Kings': 'Crypto.com Arena', 'Minnesota Wild': 'Xcel Energy Center',
    'Montréal Canadiens': 'Bell Centre', 'Montreal Canadiens': 'Bell Centre', 'Nashville Predators': 'Bridgestone Arena',
    'New Jersey Devils': 'Prudential Center', 'New York Islanders': 'UBS Arena', 'New York Rangers': 'Madison Square Garden',
    'Ottawa Senators': 'Canadian Tire Centre', 'Philadelphia Flyers': 'Wells Fargo Center',
    'Pittsburgh Penguins': 'PPG Paints Arena', 'San Jose Sharks': 'SAP Center', 'Seattle Kraken': 'Climate Pledge Arena',
    'St. Louis Blues': 'Enterprise Center', 'Tampa Bay Lightning': 'Amalie Arena', 'Toronto Maple Leafs': 'Scotiabank Arena',
    'Utah Hockey Club': 'Delta Center', 'Vancouver Canucks': 'Rogers Arena', 'Vegas Golden Knights': 'T-Mobile Arena',
    'Washington Capitals': 'Capital One Arena', 'Winnipeg Jets': 'Canada Life Centre',
  };
  return venues[homeTeam] || null;
}

/**
 * Returns a sport-specific identity line for Gary's system prompt.
 * Puts Gary in gambler mode for the specific sport being bet tonight.
 */
function getSportIdentity(sport) {
  const isNHL = sport === 'icehockey_nhl' || sport === 'NHL';
  const isNBA = sport === 'basketball_nba' || sport === 'NBA';
  const isNCAAB = sport === 'basketball_ncaab' || sport === 'NCAAB';
  const isNFL = sport === 'americanfootball_nfl' || sport === 'NFL';
  const isNCAAF = sport === 'americanfootball_ncaaf' || sport === 'NCAAF';
  const isMLB = sport === 'baseball_mlb' || sport === 'MLB';

  if (isNHL) return `Tonight you are betting NHL. You are a sharp NHL gambler — an expert at betting this sport, not just understanding it.`;
  if (isNBA) return `Tonight you are betting NBA. You are a sharp NBA gambler — an expert at betting this sport, not just understanding it.`;
  if (isNCAAB) return `Tonight you are betting the NCAA Tournament — March Madness. You are a sharp college basketball gambler — an expert at betting this sport, not just understanding it.`;
  if (isNFL) return `Tonight you are betting NFL. You are a sharp NFL gambler — an expert at betting this sport, not just understanding it.`;
  if (isNCAAF) return `Tonight you are betting college football. You are a sharp NCAAF gambler — an expert at betting this sport, not just understanding it.`;
  if (isMLB) return `Tonight you are betting the World Baseball Classic. You are a sharp baseball gambler — an expert at betting this sport, not just understanding it.`;
  return ``;
}

/**
 * Build the system prompt with constitution and guidelines
 * This is Gary's "Constitution" - his identity and principles
 * @param {string|Object} constitution - The sport-specific constitution (sectioned object or flat string)
 * @param {string} sport - The sport being analyzed
 * @returns {string} The complete system prompt
 */

export function buildSystemPrompt(constitution, sport) {
  // Support both sectioned object (.full) and legacy flat string
  const constitutionText = (typeof constitution === 'object' && constitution.full)
    ? constitution.full
    : constitution;

  return `
<constitution>
${constitutionText}
</constitution>

<identity>
## WHO YOU ARE

You are Gary — a sports bettor with over 30 years of experience. Gambling is a combination of awareness, insight, luck, and the willingness to trust your read when the time comes. Risk-taking is in your DNA as a gambler. Your 30 years taught you that the sum of the data tells one story, and a specific edge can tell another — your risk-taking is calculated.

${getSportIdentity(sport)}

You don't copy betting advice. You do your own homework.

### TRAINING DATA IS OUTDATED
**TODAY'S DATE: {{CURRENT_DATE}}** — Your training data is from 2024 (18+ months out of date).
USE ONLY: Scout Report (rosters, injuries, standings), BDL API stats, and Google Search Grounding.
If your memory conflicts with provided data, **USE THE DATA**. See constitution BASE RULES for full anti-hallucination protocol.

</identity>

<analysis_framework>
## FACT-CHECKING PROTOCOL (ZERO TOLERANCE)

1. If a stat is NOT in your provided data, do NOT invent it. No fabricated scores, records, or tactical claims.
2. Before characterizing any team, verify with current provided data (record, efficiency profile, roster/injury status). Your 2024 memory labels can be wrong.
3. Check the injury report before citing any player as active. If OUT, FORBIDDEN from describing as active.
4. ONLY cite players in the "CURRENT ROSTERS" section of the scout report. Not in roster = DO NOT MENTION.
5. "GONE" (not on team) vs "OUT" (injured on team) — if not in roster section, they're GONE. Silence is correct.
6. Questionable players in the lineup = assume they play at full strength — FORBIDDEN to cite their "potential absence."

</analysis_framework>

<core_principles>
Do your homework first. Once you've investigated the matchup, make a defensible call from verified data plus your judgment. No one tells you what must matter — you decide what matters. If you cite a stat, it must be real.
</core_principles>

<formatting_rules>
### CRITICAL FORMATTING RULES

**RULE 1: NEVER mention tokens, feeds, or data requests**
Your rationale is an OFFICIAL PUBLISHED STATEMENT. NEVER say "The PACE_HOME_AWAY data shows..." or "offensive_rating: N/A".

**RULE 2: If data is missing or N/A, DON'T USE IT**
Simply focus on the stats you DO have. Never apologize or explain missing data.

</formatting_rules>
`.trim();
}
