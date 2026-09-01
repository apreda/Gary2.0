import { toolDefinitions, getTokensForSport } from '../tools/toolDefinitions.js';
import { fetchStats, clearStatRouterCache } from '../tools/statRouters/index.js';
import { getConstitution } from '../constitution/index.js';
import { buildSystemPrompt } from './garySystemPrompt.js';
import { buildScoutReport } from '../scoutReport/scoutReportBuilder.js';
import { ballDontLieService } from '../../ballDontLieService.js';
import { CONFIG } from './orchestratorConfig.js';
import { createModelSession, sendToSession } from './sessionManager.js';
import { shouldReuseScoutReport } from '../statsSubstance.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { homeSpreadReference } from '../../marketTruth.js';
import { footballPromptSha } from './footballPromptSha.js';

// ═══════════════════════════════════════════════════════════════════════════
// SCOUT REPORT CACHE — share full scout report between game picks → props
// ═══════════════════════════════════════════════════════════════════════════
const SCOUT_CACHE_DIR = join(process.env.TMPDIR || '/tmp', 'gary-scout-cache');
const SCOUT_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

// Game-specific identifier used to distinguish e.g. MLB doubleheaders that share
// the same date + matchup. Prefers stable IDs and falls back to commence_time so
// Game 1 and Game 2 hash to different files even when only the start time differs.
function scoutCacheGameKey(game) {
  if (!game) return '';
  return String(game.id || game.bdl_game_id || game.gamePk || game.commence_time || '');
}

function scoutCacheKey(homeTeam, awayTeam, sport, game) {
  // ET slate day (Jul 30): the UTC key rolled at 8 PM ET, so an evening scout
  // cached under TOMORROW's key — on series nights, tomorrow's desk could be
  // served yesterday evening's scout (stale lines/lineups).
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const gameKey = scoutCacheGameKey(game);
  return createHash('md5').update(`${date}-${sport}-${awayTeam}-${homeTeam}-${gameKey}`.toLowerCase()).digest('hex');
}

function loadCachedScoutReport(homeTeam, awayTeam, sport, game) {
  try {
    const file = join(SCOUT_CACHE_DIR, `${scoutCacheKey(homeTeam, awayTeam, sport, game)}.json`);
    if (!existsSync(file)) return null;
    const stat = statSync(file);
    if (Date.now() - stat.mtimeMs > SCOUT_CACHE_TTL_MS) return null;
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (!shouldReuseScoutReport(data, sport)) {
      console.warn(`[Orchestrator] NFL scout cache has zero verified performance stats; rebuilding ${awayTeam} @ ${homeTeam}`);
      return null;
    }
    console.log(`[Orchestrator] ♻️ Loaded cached scout report for ${awayTeam} @ ${homeTeam}`);
    return data;
  } catch { return null; }
}

function saveCachedScoutReport(homeTeam, awayTeam, sport, game, data) {
  try {
    if (!existsSync(SCOUT_CACHE_DIR)) mkdirSync(SCOUT_CACHE_DIR, { recursive: true });
    const file = join(SCOUT_CACHE_DIR, `${scoutCacheKey(homeTeam, awayTeam, sport, game)}.json`);
    writeFileSync(file, JSON.stringify(data), 'utf8');
    console.log(`[Orchestrator] 💾 Cached scout report for ${awayTeam} @ ${homeTeam}`);
  } catch (e) {
    // Non-fatal
    console.warn(`[Orchestrator] Scout report cache write failed: ${e.message}`);
  }
}
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
  // Every downstream prompt expects the spread from the HOME perspective.
  // If a partial feed supplies only the away line, negate it instead of
  // silently reversing the board.
  const canonicalHomeSpread = homeSpreadReference(game, 0);
  const isFootballGame = sport === 'americanfootball_nfl' || sport === 'NFL' ||
    sport === 'americanfootball_ncaaf' || sport === 'NCAAF';

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🐻 GARY AGENTIC ANALYSIS: ${awayTeam} @ ${homeTeam}`);
  console.log(`Sport: ${sport}`);
  console.log(`${'═'.repeat(70)}\n`);

  try {
    // Step 1: Build the scout report (Level 1 context)
    // Check cache first — props reuses scout report from game picks.
    // Game object included in the key so MLB doubleheaders (same matchup, same
    // date) don't collide on the second game's scout report.
    let scoutReportData = loadCachedScoutReport(homeTeam, awayTeam, sport, game);
    if (!scoutReportData) {
      console.log('[Orchestrator] Building scout report...');
      scoutReportData = await buildScoutReport(game, sport, { sportsbookOdds: options.sportsbookOdds, testAllowMissingLineups: options.testAllowMissingLineups });
      // Cache for props to reuse. Never persist an all-N/A football tape: a
      // transient BDL throttle must not poison every retry for three hours.
      if (shouldReuseScoutReport(scoutReportData, sport)) {
        saveCachedScoutReport(homeTeam, awayTeam, sport, game, scoutReportData);
      } else {
        console.warn(`[Orchestrator] Football scout has zero verified performance stats; not caching ${awayTeam} @ ${homeTeam}`);
      }
    }

    // MLB tools need the MLB Stats API gamePk to identify probable pitchers,
    // recent form, etc. The scout report builder resolves it via schedule lookup
    // and stores it on the result; thread it onto the game object so the agent
    // loop's tool router can use it. Without this, every MLB pitcher tool falls
    // back to BDL game id and gets nothing back from MLB Stats API.
    if (scoutReportData?.gamePk && !game.gamePk) {
      game.gamePk = scoutReportData.gamePk;
    }

    // NOTE: No auto-PASS logic. Gary always makes a pick for every game.
    // If there's uncertainty (GTD players, etc.), Gary investigates and decides.

    // Handle both old (string) and new (object) formats
    // Gary gets data-only report; Flash gets investigation-ready report with Tale of Tape + token menu
    let garyText = typeof scoutReportData === 'string' ? scoutReportData : (scoutReportData.garyText || scoutReportData.text);
    let flashText = typeof scoutReportData === 'string' ? scoutReportData : (scoutReportData.flashText || scoutReportData.text);

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
      userMessage = buildPass1Message(garyText, homeTeam, awayTeam, today, sport, canonicalHomeSpread, { homeSeed: game.homeSeed, awaySeed: game.awaySeed, game });
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
      console.log(`[Orchestrator] Desk ready (${garyText.length} chars)`);
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
      spread: canonicalHomeSpread,
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
      // The game rides along so a capped MLB game's case headings name the
      // actual tickets on every re-injection (mlbCaseMenu.js, Sep 1 2026).
      bilateralCasePrompt: (typeof constitution === 'object' && constitution.bilateralCasePrompt)
        ? (h, a) => constitution.bilateralCasePrompt(h, a, game)
        : null,
      // Structured runs-scored history — feeds the count-claim verifier
      // (a false "N of last M games" tally is fabrication; Jul 22 2026).
      recentScores: (typeof scoutReportData === 'object' && scoutReportData?.recentScores) || null
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
    if (!result.error && isFootballGame) {
      result._promptSha = footballPromptSha(sport);
    }

    // Attach investigation artifacts for downstream logging/debugging (the
    // pick_context table + Talk-to-Gary feature that once consumed these was
    // removed Jul 2 2026; kept because logs and cost tracking still read them):
    //   - Gary's data scout report (what he saw)
    //   - Flash's investigation-ready scout report
    //   - Flash research briefing (the per-factor findings)
    //   - Raw analysis (Pass 1 bilateral case + Pass 2.5 synthesis text)
    //   - Tool call history
    if (!result.error) {
      result._context = {
        scoutReport: garyText || null,
        flashScout: flashText || null,
        researchBriefing: result._researchBriefing || null,
        rawAnalysis: result.rawAnalysis || null,
        fullAssistantNarrative: result._fullAssistantNarrative || null,
        toolCallHistory: result.toolCallHistory || null,
      };
    }

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

// buildSystemPrompt lives in garySystemPrompt.js (extracted Sep 1 2026 so
// junePromptSha can hash the rendered system prompt without importing this
// module's heavy dependency tree). Re-exported here so existing importers
// (orchestrator/index.js, tests) keep their path.
export { buildSystemPrompt } from './garySystemPrompt.js';
