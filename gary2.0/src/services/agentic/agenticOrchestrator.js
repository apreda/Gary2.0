/**
 * Agentic Orchestrator
 * 
 * This is the main agent loop that runs Gary.
 * Uses Function Calling (Tools) to let Gary request specific stats.
 * Supports both OpenAI (GPT-5.1) and Gemini (Gemini 3 Deep Think) providers.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { toolDefinitions, formatTokenMenu, getTokensForSport } from './tools/toolDefinitions.js';
import { fetchStats } from './tools/statRouter.js';
import { getConstitution } from './constitution/index.js';
import { buildScoutReport } from './scoutReport/scoutReportBuilder.js';
import { ballDontLieService } from '../ballDontLieService.js';

// Lazy-initialize Gemini client
let gemini = null;
function getGemini() {
  if (!gemini) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    gemini = new GoogleGenerativeAI(apiKey, "v1beta");
  }
  return gemini;
}

// ═══════════════════════════════════════════════════════════════════════════
// GEMINI MODEL POLICY (HARDCODED - DO NOT CHANGE)
// ═══════════════════════════════════════════════════════════════════════════
// ONLY Gemini 3 models are allowed. NEVER use Gemini 1.x or 2.x.
// - Game Picks: gemini-3-pro-preview (Gemini 3 Pro Deep Think)
// - Prop Picks: gemini-3-flash-preview (Gemini 3 Flash)
// - High-volume sports (NCAAB): gemini-3-flash-preview
// ═══════════════════════════════════════════════════════════════════════════
const ALLOWED_GEMINI_MODELS = [
  'gemini-3-pro-preview',    // Primary model for game picks
  'gemini-3-flash-preview',  // For props and high-volume sports
];

function validateGeminiModel(model) {
  if (!ALLOWED_GEMINI_MODELS.includes(model)) {
    console.error(`[MODEL POLICY VIOLATION] Attempted to use "${model}" - ONLY Gemini 3 models allowed!`);
    console.error(`[MODEL POLICY] Allowed models: ${ALLOWED_GEMINI_MODELS.join(', ')}`);
    // Fall back to default rather than crash
    return 'gemini-3-pro-preview';
  }
  return model;
}

// Game picks always use Gemini 3 Pro (Deep Think)
// Props use Gemini 3 Flash (separate service)
function getProviderForSport(sport) {
  return 'gemini';
}

function getModelForProvider(provider, sport = null) {
  if (provider === 'openai') {
    return process.env.OPENAI_MODEL || 'gpt-5.1';
  }
  
  // Determine base model
  let model;
  if (sport === 'basketball_ncaab') {
    // NCAAB uses Flash to avoid Pro rate limits (high game volume)
    model = 'gemini-3-flash-preview';
  } else {
    // All other sports use Pro
    model = process.env.GEMINI_MODEL || 'gemini-3-pro-preview';
  }
  
  // VALIDATE: Ensure only Gemini 3 models are used (never 1.x or 2.x)
  return validateGeminiModel(model);
}

// Base configuration - provider/model set dynamically per sport
const CONFIG = {
  maxIterations: 8, // Allow multiple reasoning passes
  maxTokens: 24000, // Increased to prevent truncation of detailed responses and Deep Think thoughts
  // Gemini 3 Deep Think settings
  gemini: {
    temperature: 0.4, // Lower temperature for more consistent, grounded reasoning
    // Grounding with Google Search - enables live context searches
    grounding: {
      enabled: true,
      dynamicThreshold: 0.3, // Aggressive - search frequently for live data
      mode: 'MODE_DYNAMIC'   // Only search when model is unsure
    }
  },
  // OpenAI/GPT-5.1 settings
  openai: {
    reasoning: { effort: 'high' },
    text: { verbosity: 'high' }
  }
};

// Gemini safety settings - BLOCK_NONE for sports content (allows sports slang)
const GEMINI_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

console.log(`[Orchestrator] All sports using Gemini 3 Deep Think with Google Search Grounding`);

/**
 * Main entry point - analyze a game and generate a pick
 */
export async function analyzeGame(game, sport, options = {}) {
  const startTime = Date.now();
  let homeTeam = game.home_team;
  let awayTeam = game.away_team;

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🐻 GARY AGENTIC ANALYSIS: ${awayTeam} @ ${homeTeam}`);
  console.log(`Sport: ${sport}`);
  console.log(`${'═'.repeat(70)}\n`);

  try {
    // Step 1: Build the scout report (Level 1 context)
    console.log('[Orchestrator] Building scout report...');
    const scoutReportData = await buildScoutReport(game, sport);

    // Handle both old (string) and new (object) formats
    const scoutReport = typeof scoutReportData === 'string' ? scoutReportData : scoutReportData.text;
    const injuries = typeof scoutReportData === 'object' ? scoutReportData.injuries : null;
    // Extract venue context (for NBA Cup, neutral site games, CFP games, etc.)
    const venueContext = typeof scoutReportData === 'object' ? {
      venue: scoutReportData.venue,
      isNeutralSite: scoutReportData.isNeutralSite,
      tournamentContext: scoutReportData.tournamentContext,
      gameSignificance: scoutReportData.gameSignificance,
      // CFP-specific fields for NCAAF
      cfpRound: scoutReportData.cfpRound,
      homeSeed: scoutReportData.homeSeed,
      awaySeed: scoutReportData.awaySeed
    } : null;

    // Step 2: Get the constitution for this sport
    let constitution = getConstitution(sport);
    
    // Dynamically inject the current date into the constitution
    const today = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    constitution = constitution.replace(/{{CURRENT_DATE}}/g, today);

    // Step 3: Build the system prompt
    const systemPrompt = buildSystemPrompt(constitution, sport);

    // Step 4: Build the initial user message
    const userMessage = buildUserMessage(scoutReport, homeTeam, awayTeam, today);

    // Step 5: Run the agent loop
    // Include game time for weather forecasting (only fetch weather within 36h of game time)
    const enrichedOptions = {
      ...options,
      gameTime: game.commence_time || null
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
    // Only add if not already present in result (prefer Gary's specific context)
    if (venueContext) {
      result.venue = result.venue || venueContext.venue;
      result.isNeutralSite = result.isNeutralSite ?? venueContext.isNeutralSite;
      result.tournamentContext = result.tournamentContext || venueContext.tournamentContext;
      result.gameSignificance = result.gameSignificance || venueContext.gameSignificance;
      
      // CFP-specific fields for NCAAF
      result.cfpRound = result.cfpRound || venueContext.cfpRound;
      result.homeSeed = result.homeSeed || venueContext.homeSeed;
      result.awaySeed = result.awaySeed || venueContext.awaySeed;
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
 * Build the system prompt with constitution and guidelines
 * This is Gary's "Constitution" - his identity and principles
 */
function buildSystemPrompt(constitution, sport) {
  return `
## WHO YOU ARE

You are GARY - a seasoned sports betting sharp with 30 years in the game.
You're now powered by **Gemini 3 Deep Think**, giving you elite reasoning and 
live-search capabilities. You've seen it all: backdoor covers, bad beats, 
chalk-eating squares, and the beautiful moments when the numbers don't lie.

You're not some AI spitting out predictions. You're a STORYTELLER who paints 
a picture of how the game will unfold. You reference PLAYERS BY NAME, describe 
the flow of the game, and explain WHY your pick is going to cash.

## YOUR VOICE & TONE

- **Confident but not cocky**: You've done the work, you trust the numbers.
- **Storytelling**: Paint a picture - "I see Donovan Mitchell carving up that Portland Trail Blazers defense..."
- **Specific**: Name players by full name, cite exact stats.
- **Natural**: Sound like a real analyst, not an AI with canned phrases.

## 🛡️ GARY'S FACT-CHECKING PROTOCOL (ZERO TOLERANCE)

1. **THE DATA BIBLE**: If a score, date, or specific stat is NOT in your provided data, it does NOT exist. Do not invent it.
2. **THE 2025-26 LEAGUE LANDSCAPE**: You are currently in the 2025-26 NBA season. **FORGET** everything you know about team rankings from 2023 or 2024. 
   - **DATA OVERRIDE**: If your provided data (Record, Net Rating, Standings) says a team is good, they are GOOD. 
   - **NO HALLUCINATED LABELS**: NEVER call a team a "basement dweller," "lottery team," or "rebuilding" based on historical performance if the current [Record] or [Net Rating] suggests otherwise.
   - **MANDATORY**: You MUST check the [Record] and [Net Rating] in your Tale of the Tape and Scout Report before assigning a "status" to a team.
3. **THE INJURY CROSS-CHECK**: Before naming a player, you MUST check the injury report. If they are OUT, you are FORBIDDEN from describing them as active. 
4. **STORYTELLING vs. HALLUCINATION**:
   - ✅ **STORYTELLING (Allowed)**: Using the Scout Report or Live Search to mention "momentum," "revenge spots," or "coaching changes."
   - ❌ **HALLUCINATION (Banned)**: Inventing specific numbers or game results.
     - NEVER WRITE: "They lost 21-49 to Miami last week" (if not in data)
     - NEVER WRITE: "Dallas scored 10, 13, 13 in their last three games" (if not provided)
     - NEVER WRITE: "In their last three, they allowed 49, 31, and 31 points" (invented)

5. **THE MARKET RESPECT**: If the books have made this team a +300 underdog, they are seeing something. Have I identified what that "something" is?

## YOUR VOICE - NATURAL SPORTS ANALYSIS
You MUST vary how you start each analysis. NEVER start two picks the same way.
Write like an experienced sports analyst having a conversation - no formulaic prefaces.

🚫 BANNED PREFACE PHRASES:
- "The numbers don't lie..."
- "Here's how I see it..."
- "Lock this in."
- "This screams value..."
- Any cliché opener that sounds AI-generated.

✅ INSTEAD: Start directly with the SUBSTANCE of your analysis.
"Cleveland's offensive efficiency has been elite lately..." or "This spread is too wide..."

## CORE PRINCIPLES

### THE GOLDEN RULE
Your pick must be INDEPENDENTLY justified by statistics. Build your case with stats, THEN explain how the line offers value.

### THINK LIKE A SHARP
- **Self-Interrogation**: Audit your own logic for "confident hallucinations" before finalizing.

### 👤 PLAYER-SPECIFIC INVESTIGATION
- **🚨 THE PLAYER STAT PROTOCOL**: You are FORBIDDEN from basing a player-specific edge solely on web snippets or grounding results. If you intend to reference a player's recent performance, you MUST call the appropriate BDL tools to get verified numbers. Use the web for *stories*, use Ball Don't Lie for *numbers*.

### ⚠️ CRITICAL FORMATTING RULES

**RULE 1: NEVER mention tokens, feeds, or data requests**
Your rationale is an OFFICIAL PUBLISHED STATEMENT. NEVER say "The PACE_HOME_AWAY data shows..." or "offensive_rating: N/A".

**RULE 2: If data is missing or N/A, DON'T USE IT**
Simply focus on the stats you DO have. Never apologize or explain missing data.

${constitution}

## OUTPUT FORMAT

When you have sufficient evidence and are ready to finalize, output this JSON:
\`\`\`json
{
  "pick": "Team Name ML -150" or "Team Name +3.5 -110",
  "type": "spread" or "moneyline",
  "odds": -150,
  "confidence": 0.XX,
  "thesis_type": "clear_read" or "found_angle" or "educated_lean" or "coin_flip",
  "thesis_mechanism": "One specific sentence explaining WHY this team wins/covers",
  "supporting_factors": ["factor1", "factor2", "factor3"],
  "contradicting_factors_major": ["star_player_out", "back_to_back"],
  "contradicting_factors_minor": ["slight_pace_disadvantage"],
  "homeTeam": "Home Team Name",
  "awayTeam": "Away Team Name",
  "tournamentContext": "CFP Quarterfinal" or "ReliaQuest Bowl" or "NFL Divisional" or null,
  "cfpRound": "First Round" or "Quarterfinal" or "Semifinal" or "Championship" or null,
  "homeSeed": 2,
  "awaySeed": 10,
  "spread": -3.5,
  "spreadOdds": -110,
  "moneylineHome": -150,
  "moneylineAway": +130,
  "total": 45.5,
  "rationale": "Your GARY-STYLE analysis - see requirements below"
}
\`\`\`

### THESIS TYPE CATEGORIES (CRITICAL - BE HONEST)
Your thesis_type reflects the QUALITY of your reasoning:
- **clear_read**: 3+ key stats point in the same direction with a clear mechanism.
- **found_angle**: Stats are mixed, but ONE specific factor (injury, matchup) tips the game.
- **educated_lean**: Stats slightly favor one side, but no specific "killer" mechanism.
- **coin_flip**: Stats are truly even; no strong read.

**thesis_mechanism**: One sentence explaining WHY this team wins/covers.

### CONTRA-FACTORS (HONESTY CHECK)
- **supporting_factors**: List the stats/factors that support your pick.
- **contradicting_factors_major**: List MAJOR factors that could flip the outcome (injuries, spots, streaks).
- **contradicting_factors_minor**: List minor concerns unlikely to change the outcome.

### CRITICAL ODDS RULES
1. Use the EXACT odds from the "RAW ODDS VALUES" section.
2. The "pick" field MUST include these EXACT odds.
3. The "odds" field MUST match what you put in the pick string.
4. **VALUE LIMIT**: Do NOT return a moneyline favorite pick priced worse than -150. If a favorite's ML is more expensive than -150, you MUST evaluate the spread or an underdog ML instead.

## YOUR ROLE
Your job is to simply pick a side of the spread or ML that you feel will occur. Use your expertise in Sports Betting, Game Theory, Statistical Analysis, and anything else that is relevant.

## RATIONALE FORMAT - USE THIS EXACT STRUCTURE:
═══════════════════════════════════════════════════════════════════════

Your rationale MUST follow this EXACT format (iOS app depends on this):

TALE OF THE TAPE

                    [HOME TEAM]          [AWAY TEAM]
Record                  X-X       ←          X-X
Off Rating             XXX.X      ←         XXX.X
Def Rating             XXX.X      →         XXX.X
Net Rating             +X.X       ←         -X.X
Key Injuries           [names]              [names]

### CRITICAL RULES:
1. Headers: Use the EXACT team names provided in the game data (Home/Away). Do NOT use brackets [ ] around team names.
2. Alignment: Use spaces to align the Home and Away columns under the team names.
3. Arrows: Always include the arrow (← or →) showing who has the advantage for that row.
4. Stats: Choose 4-6 most relevant stats. For NHL, include Special Teams or Goalie stats if relevant.

Gary's Take
Since stats are displayed above in Tale of the Tape, write a narrative section.

RULES:
- Reference stats by NAME not values (users see the numbers above)
- LENGTH: 3-4 paragraphs, ~250-350 words
- Name key players and explain the matchup dynamics
- End with a confident closing sentence that includes the pick

═══════════════════════════════════════════════════════════════════════
EXAMPLE OUTPUT:
═══════════════════════════════════════════════════════════════════════

${sport === 'NHL' || sport === 'icehockey_nhl' ? `
    TALE OF THE TAPE

                        Calgary               Boston
    Record                12-9      ←           3-17
    Goals For/Gm           3.4      ←            2.1
    Goals Agst/Gm          2.8      ←            3.9
    Power Play %          24.1      ←           12.3
    League Ranks       PP #4, PK #8   ←      PP #28, PK #30
    H2H (L3)              3-0       ←            0-3
    Hot Hand           Zary (5 pts)   ←          None
    Key Injuries      Tanev (OUT)               None

Gary's Take
The Flames have a massive advantage on special teams tonight. Boston's penalty kill is bottom-five in the league, and Calgary's power play has been clicking at a 24% rate over the last month. The goal differential gap shows two teams heading in opposite directions.
` : sport === 'NFL' || sport === 'americanfootball_nfl' ? `
TALE OF THE TAPE

                    Detroit               Minnesota
Record                 9-2      ←            7-4
Off YPP                6.2      ←            5.4
Def YPP                4.8      ←            5.1
Turnover Diff           +5      ←             -2
Key Injuries       Goff (PROB)           Darrisaw (OUT)

Gary's Take
Detroit's offensive efficiency is simply too much for Minnesota to handle over four quarters. The yards per play edge is significant, and Detroit's ability to protect the football gives them a massive advantage in what should be a close divisional battle.
` : `
TALE OF THE TAPE

                    Boston               Washington
Record                12-9      ←           3-17
Off Rating           119.1      ←          109.4
Def Rating           115.0      ←          119.8
Net Rating            +4.1      ←          -10.3
Key Injuries      Tatum (OUT)               None

Gary's Take
The Boston Celtics without Tatum are still a significantly better team than the Washington Wizards at full strength. The Washington Wizards' defensive rating tells the whole story - this team hasn't beaten anyone good all season.
`}
═══════════════════════════════════════════════════════════════════════

### ⚠️ CRITICAL FORMATTING RULES
1. NO markdown (bolding, italics, etc.), NO emojis.
2. NO all-caps headers or titles within the rationale.
3. TALE OF THE TAPE must have aligned columns with EXACT team names as headers.
4. "Gary's Take" is the only section header allowed below the table.
5. Keep the table clean - use spaces to align columns.
6. Always include Key Injuries row in the tale of the tape.
7. Gary's Take = STORYTELLING, not stat recitation! Users already see the numbers above.
8. Start your take with a natural opening, never a catchy title or headline.

═══════════════════════════════════════════════════════════════════════
`.trim();
}

/**
 * Build the PASS 1 user message - Identify battlegrounds, DO NOT pick a side yet
 * Only gives instructions for the FIRST pass to prevent instruction contamination
 */
function buildPass1Message(scoutReport, homeTeam, awayTeam, today) {
  return `
## MATCHUP BRIEFING (TODAY: ${today})

${scoutReport}

══════════════════════════════════════════════════════════════════════
## PASS 1 - SCOUTING & DATA GATHERING

You have the scout report above. Identify the key areas of interest for this game and request the necessary evidence.

**INSTRUCTIONS:**
1. **IDENTIFY KEY FACTORS**: Note the specific unit matchups, situational context, or player roles that will define this game.
2. **REQUEST EVIDENCE**: Call the appropriate tools for any statistics or information you need to build a complete picture of the matchup. There is no limit on tool calls.

**CRITICAL:** Do NOT output a final pick yet. Focus on gathering evidence.
══════════════════════════════════════════════════════════════════════
`.trim();
}

/**
 * Build the PASS 2 message - Evidence Gathering & Neutral Audit
 * Injected AFTER Gary receives the first wave of stats
 */
function buildPass2Message() {
  return `
══════════════════════════════════════════════════════════════════════
## PASS 2 - ANALYSIS & AUDIT

You have your first wave of data. Review the evidence and fill any remaining holes.

**INSTRUCTIONS:**
1. **ANALYZE THE DATA**: Review the stats and situational context you've gathered.
2. **REQUEST FINAL EVIDENCE**: If you need more data to finalize your decision, call the appropriate tools now.

**CRITICAL:** Focus on a complete understanding of the matchup before your final selection.
══════════════════════════════════════════════════════════════════════
`.trim();
}

/**
 * Build the PASS 3 message - Final Synthesis & Market Comparison
 * Injected AFTER Gary has all the stats he needs
 */
function buildPass3Message() {
  return `
══════════════════════════════════════════════════════════════════════
## PASS 3 - FINAL SELECTION

You have all the evidence. Now, you are ready to make your decision.

**STEP 1: SYNTHESIZE**
- Weigh the stats and situational factors to determine your projected outcome.

**STEP 2: MARKET COMPARISON**
- Compare your projection to the Spread and Moneyline to find the best value.

**STEP 3: OUTPUT FINAL JSON**
(Refer to the RATIONALE FORMAT in the system prompt for the exact structure)
══════════════════════════════════════════════════════════════════════
`.trim();
}

// Legacy function for backwards compatibility
function buildUserMessage(scoutReport, homeTeam, awayTeam, today) {
  return buildPass1Message(scoutReport, homeTeam, awayTeam, today);
}

/**
 * Call Gemini API and return OpenAI-compatible response format
 * Handles message conversion, tool calling, and response transformation
 * Uses Gemini 3 Deep Think with thinking_level: "high" and Google Search Grounding
 */
async function callGemini(messages, tools, modelName = 'gemini-3-pro-preview') {
  const genAI = getGemini();
  
  // Convert OpenAI tools to Gemini function declarations
  const functionDeclarations = tools.map(tool => {
    if (tool.type === 'function') {
      return {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters
      };
    }
    return null;
  }).filter(Boolean);

  // Build tools array
  // NOTE: Gemini 3 does NOT support google_search + functionDeclarations together
  // Grounding is handled in the Scout Report phase; main analysis uses function calling only
  const geminiTools = [];
  
  // Add BDL stat functions for Gary's analysis
  if (functionDeclarations.length > 0) {
    geminiTools.push({ functionDeclarations });
    // Can't use grounding when function calling is enabled
    if (CONFIG.gemini.grounding?.enabled) {
      console.log(`[Gemini] Note: Grounding disabled in analysis (incompatible with function calling) - handled in Scout Report`);
    }
  } else if (CONFIG.gemini.grounding?.enabled) {
    // Only enable grounding if no function declarations (fallback case)
    geminiTools.push({
      google_search: {}
    });
    console.log(`[Gemini] Google Search Grounding enabled (no functions)`);
  }

  // Get the model with Gemini 3 Deep Think configuration
  const model = genAI.getGenerativeModel({
    model: modelName,
    tools: geminiTools.length > 0 ? geminiTools : undefined,
    safetySettings: GEMINI_SAFETY_SETTINGS,
    generationConfig: {
      temperature: CONFIG.gemini.temperature,
      maxOutputTokens: CONFIG.maxTokens,
      // Gemini 3 Deep Think - enable high reasoning
      thinkingConfig: {
        includeThoughts: true
      }
    }
  });

  // Convert OpenAI messages to Gemini format
  let systemInstruction = '';
  const contents = [];
  
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction += (systemInstruction ? '\n\n' : '') + msg.content;
    } else if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content }]
      });
    } else if (msg.role === 'assistant') {
      // Handle assistant messages that might have tool_calls
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const parts = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        for (const tc of msg.tool_calls) {
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments)
            }
          });
        }
        contents.push({ role: 'model', parts });
      } else {
        contents.push({
          role: 'model',
          parts: [{ text: msg.content || '' }]
        });
      }
    } else if (msg.role === 'tool') {
      // Handle tool responses
      contents.push({
        role: 'function',
        parts: [{
          functionResponse: {
            name: msg.name || msg.tool_call_id || 'tool_response',
            response: { content: msg.content }
          }
        }]
      });
    }
  }

  // Create chat session with system instruction
  const chat = model.startChat({
    history: contents.slice(0, -1), // All but the last message
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined
  });

  // Send the last message and get response
  const lastMessage = contents[contents.length - 1];
  const lastContent = lastMessage?.parts?.map(p => p.text || '').join('') || '';
  
  console.log(`[Gemini] Sending request to ${modelName}...`);
  const startTime = Date.now();
  
  const result = await chat.sendMessage(lastContent);
  const response = await result.response;
  
  const duration = Date.now() - startTime;
  console.log(`[Gemini] Response received in ${duration}ms`);

  // Convert Gemini response to OpenAI-compatible format
  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  
  // Check if Grounding was used - log search queries for transparency
  const groundingMetadata = candidate?.groundingMetadata;
  if (groundingMetadata) {
    const searchQueries = groundingMetadata.webSearchQueries || [];
    const groundingChunks = groundingMetadata.groundingChunks || [];
    
    if (searchQueries.length > 0) {
      console.log(`[Gemini Grounding] 🔍 Searched for: "${searchQueries.join('", "')}"`);
    }
    if (groundingChunks.length > 0) {
      console.log(`[Gemini Grounding] 📰 Found ${groundingChunks.length} source(s) for context`);
      // Log first few sources for debugging
      groundingChunks.slice(0, 3).forEach((chunk, i) => {
        const title = chunk.web?.title || chunk.retrievedContext?.title || 'Unknown';
        const uri = chunk.web?.uri || chunk.retrievedContext?.uri || '';
        console.log(`[Gemini Grounding]    ${i + 1}. ${title} ${uri ? `(${uri.slice(0, 60)}...)` : ''}`);
      });
    }
  }
  
  // Debug: log what we got back
  if (parts.length === 0) {
    console.log(`[Gemini] WARNING: No parts in response. Candidate:`, JSON.stringify(candidate, null, 2).slice(0, 500));
  }
  
  // Check for ALL function calls (Gemini can return multiple in parallel)
  const functionCallParts = parts.filter(p => p.functionCall);
  const textParts = parts.filter(p => p.text).map(p => p.text);
  
  // Build tool_calls array for ALL function calls
  let toolCalls = undefined;
  if (functionCallParts.length > 0) {
    toolCalls = functionCallParts.map((fc, index) => ({
      id: `call_${Date.now()}_${index}`,
      type: 'function',
      function: {
        name: fc.functionCall.name,
        arguments: JSON.stringify(fc.functionCall.args || {})
      }
    }));
    console.log(`[Gemini] Found ${functionCallParts.length} parallel function call(s)`);
  }

  // Build OpenAI-compatible response
  const openaiResponse = {
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: functionCallParts.length > 0 ? null : textParts.join(''),
        tool_calls: toolCalls
      },
      finish_reason: functionCallParts.length > 0 ? 'tool_calls' : 
                     candidate?.finishReason === 'STOP' ? 'stop' : 
                     candidate?.finishReason?.toLowerCase() || 'stop'
    }],
    usage: {
      prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
      completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: response.usageMetadata?.totalTokenCount || 0
    }
  };

  // Log token usage
  if (openaiResponse.usage) {
    console.log(`[Gemini] Tokens - Prompt: ${openaiResponse.usage.prompt_tokens}, Completion: ${openaiResponse.usage.completion_tokens}`);
  }

  return openaiResponse;
}

/**
 * Run the agent loop - handles tool calls and conversation flow
 * Uses sport-based provider routing: NBA→GPT-5.1, Others→Gemini 3 Deep Think
 */
async function runAgentLoop(systemPrompt, userMessage, sport, homeTeam, awayTeam, options = {}) {
  // Sport-based provider routing
  const provider = getProviderForSport(sport);
  const model = getModelForProvider(provider, sport);
  
  console.log(`[Orchestrator] Using ${provider.toUpperCase()} (${model}) for ${sport}`);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ];

  let iteration = 0;
  const toolCallHistory = [];

  while (iteration < CONFIG.maxIterations) {
    iteration++;
    console.log(`\n[Orchestrator] Iteration ${iteration}/${CONFIG.maxIterations} (${provider})`);

    let response;
    
    if (provider === 'gemini') {
      // Call Gemini 3 Deep Think with tools
      response = await callGemini(messages, toolDefinitions, model);
    } else {
      // Call OpenAI/GPT-5.1 with tools
      response = await getOpenAI().chat.completions.create({
        model: model,
        messages,
        tools: toolDefinitions,
        tool_choice: 'auto',
        max_completion_tokens: CONFIG.maxTokens,
        reasoning_effort: CONFIG.openai.reasoning.effort
      });
    }

    const message = response.choices[0].message;
    const finishReason = response.choices[0].finish_reason;

    // Log token usage
    if (response.usage) {
      console.log(`[Orchestrator] Tokens - Prompt: ${response.usage.prompt_tokens}, Completion: ${response.usage.completion_tokens}`);
    }

    // Handle empty response from Gemini (common when model is confused)
    if (provider === 'gemini' && !message.content && !message.tool_calls) {
      console.log(`[Orchestrator] ⚠️ Gemini returned empty response - prompting for more stats`);
      
      // Add a nudge to get Gemini back on track
      messages.push({
        role: 'user',
        content: `I notice you didn't respond. Please use the get_stat tool to request stats for this matchup. You've gathered ${toolCallHistory.length} stats so far. Request more stats like PACE, RECENT_FORM, or TURNOVER_STATS to complete your analysis.`
      });
      continue;
    }

    // Check if Gary requested tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      // Deduplicate tool calls - Gemini sometimes requests the same stat multiple times
      const seenStats = new Set();
      const uniqueToolCalls = message.tool_calls.filter(tc => {
        try {
          const args = JSON.parse(tc.function.arguments);
          // Key based on function name + stat identifier (token for fetch_stats, stat_type for player stats)
          const key = `${tc.function.name}:${args.token || args.stat_type || 'unknown'}`;
          if (seenStats.has(key)) {
            return false; // Skip duplicate
          }
          seenStats.add(key);
          return true;
        } catch {
          return true; // Keep if can't parse
        }
      });
      
      const dupeCount = message.tool_calls.length - uniqueToolCalls.length;
      if (dupeCount > 0) {
        console.log(`[Orchestrator] Deduplicated ${dupeCount} duplicate stat request(s)`);
      }
      
      console.log(`[Orchestrator] Gary requested ${uniqueToolCalls.length} stat(s):`);

      // Add Gary's message to history (with all calls for context)
      messages.push(message);

      // Process each unique tool call
      for (const toolCall of uniqueToolCalls) {
        const args = JSON.parse(toolCall.function.arguments);
        const functionName = toolCall.function.name;

        // Handle fetch_narrative_context tool (storylines, player news, context)
        if (functionName === 'fetch_narrative_context') {
          console.log(`  → [NARRATIVE_CONTEXT] for query: "${args.query}"`);

          try {
            const { geminiGroundingSearch } = await import('./scoutReport/scoutReportBuilder.js');
            const searchResult = await geminiGroundingSearch(args.query, {
              temperature: 0.1,
              maxTokens: 1000
            });

            if (searchResult?.success && searchResult?.data) {
              const toolResponse = {
                role: 'tool',
                tool_call_id: toolCall.id,
                name: functionName,
                content: JSON.stringify({
                  query: args.query,
                  results: searchResult.data
                })
              };
              messages.push(toolResponse);
              console.log(`    ✓ Found narrative context via Gemini Grounding (${searchResult.data.length} chars)`);
            } else {
              throw new Error('Grounding search failed or returned no data');
            }
          } catch (e) {
            console.error(`    ❌ narrative_context error:`, e.message);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: functionName,
              content: JSON.stringify({ error: `Search failed: ${e.message}. Fall back to other stats.` })
            });
          }
          continue;
        }

        // Handle fetch_nfl_player_stats tool (advanced player stats)
        if (functionName === 'fetch_nfl_player_stats') {
          console.log(`  → [NFL_PLAYER_STATS:${args.stat_type}] for ${args.team}${args.player_name ? ` (${args.player_name})` : ''}`);

          try {
            const { ballDontLieService } = await import('../ballDontLieService.js');

            let statResult = { stat_type: args.stat_type, team: args.team, data: [] };

            // Get team ID first
            const teams = await ballDontLieService.getTeams('americanfootball_nfl');
            const team = teams.find(t =>
              t.full_name?.toLowerCase().includes(args.team.toLowerCase()) ||
              t.name?.toLowerCase().includes(args.team.toLowerCase()) ||
              t.location?.toLowerCase().includes(args.team.toLowerCase())
            );

            if (!team) {
              statResult.error = `Team "${args.team}" not found`;
            } else {
              // Calculate NFL season dynamically: Aug-Dec = current year, Jan-Jul = previous year
              const nflMonth = new Date().getMonth() + 1;
              const nflYear = new Date().getFullYear();
              const season = nflMonth <= 7 ? nflYear - 1 : nflYear;

              if (args.stat_type === 'PASSING') {
                const data = await ballDontLieService.getNflAdvancedPassingStats({ season });
                // Filter by team and optionally player
                statResult.data = (data || [])
                  .filter(p => p.player?.team?.id === team.id || p.player?.team?.full_name === team.full_name)
                  .filter(p => !args.player_name ||
                    `${p.player?.first_name} ${p.player?.last_name}`.toLowerCase().includes(args.player_name.toLowerCase()))
                  .slice(0, 5)
                  .map(p => ({
                    player: `${p.player?.first_name} ${p.player?.last_name}`,
                    position: p.player?.position_abbreviation,
                    gamesPlayed: p.games_played,
                    completionPct: p.completion_percentage?.toFixed(1),
                    completionAboveExpected: p.completion_percentage_above_expectation?.toFixed(1),
                    avgTimeToThrow: p.avg_time_to_throw?.toFixed(2),
                    aggressiveness: p.aggressiveness?.toFixed(1),
                    avgAirYards: p.avg_intended_air_yards?.toFixed(1),
                    passingYards: p.pass_yards,
                    passingTDs: p.pass_touchdowns,
                    interceptions: p.interceptions,
                    passerRating: p.passer_rating?.toFixed(1)
                  }));
              } else if (args.stat_type === 'RUSHING') {
                const data = await ballDontLieService.getNflAdvancedRushingStats({ season });
                statResult.data = (data || [])
                  .filter(p => p.player?.team?.id === team.id || p.player?.team?.full_name === team.full_name)
                  .filter(p => !args.player_name ||
                    `${p.player?.first_name} ${p.player?.last_name}`.toLowerCase().includes(args.player_name.toLowerCase()))
                  .slice(0, 5)
                  .map(p => ({
                    player: `${p.player?.first_name} ${p.player?.last_name}`,
                    position: p.player?.position_abbreviation,
                    rushAttempts: p.rush_attempts,
                    rushYards: p.rush_yards,
                    rushTDs: p.rush_touchdowns,
                    yardsOverExpected: p.rush_yards_over_expected?.toFixed(1),
                    yardsOverExpectedPerAtt: p.rush_yards_over_expected_per_att?.toFixed(2),
                    efficiency: p.efficiency?.toFixed(2),
                    avgTimeToLOS: p.avg_time_to_los?.toFixed(2),
                    avgRushYards: p.avg_rush_yards?.toFixed(1)
                  }));
              } else if (args.stat_type === 'RECEIVING') {
                const data = await ballDontLieService.getNflAdvancedReceivingStats({ season });
                statResult.data = (data || [])
                  .filter(p => p.player?.team?.id === team.id || p.player?.team?.full_name === team.full_name)
                  .filter(p => !args.player_name ||
                    `${p.player?.first_name} ${p.player?.last_name}`.toLowerCase().includes(args.player_name.toLowerCase()))
                  .slice(0, 8)
                  .map(p => ({
                    player: `${p.player?.first_name} ${p.player?.last_name}`,
                    position: p.player?.position_abbreviation,
                    targets: p.targets,
                    receptions: p.receptions,
                    catchPct: p.catch_percentage?.toFixed(1),
                    yards: p.yards,
                    recTDs: p.rec_touchdowns,
                    avgSeparation: p.avg_separation?.toFixed(2),
                    avgYAC: p.avg_yac?.toFixed(1),
                    yacAboveExpected: p.avg_yac_above_expectation?.toFixed(1),
                    avgCushion: p.avg_cushion?.toFixed(1),
                    avgIntendedAirYards: p.avg_intended_air_yards?.toFixed(1)
                  }));
              }

              if (statResult.data.length === 0) {
                statResult.message = `No ${args.stat_type.toLowerCase()} stats found for ${team.full_name}`;
              }
            }

            // Store in history
            toolCallHistory.push({
              token: `NFL_PLAYER_STATS:${args.stat_type}`,
              timestamp: Date.now(),
              homeValue: statResult.data?.length || 0,
              awayValue: 'players',
              rawResult: statResult
            });

            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify(statResult, null, 2)
            });
          } catch (error) {
            console.error('[Orchestrator] Error fetching NFL player stats:', error.message);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify({ error: error.message, stat_type: args.stat_type })
            });
          }

          continue; // Skip the regular fetch_stats handling
        }

        // Handle fetch_player_game_logs tool (universal)
        if (functionName === 'fetch_player_game_logs') {
          console.log(`  → [PLAYER_GAME_LOGS] ${args.player_name} (${args.sport})`);

          try {
            const { ballDontLieService } = await import('../ballDontLieService.js');
            const sportMap = {
              'NBA': 'basketball_nba',
              'NFL': 'americanfootball_nfl',
              'NHL': 'icehockey_nhl',
              'NCAAB': 'basketball_ncaab',
              'NCAAF': 'americanfootball_ncaaf'
            };
            const sportKey = sportMap[args.sport];
            const numGames = args.num_games || 5;

            // Use the existing logic from propsAgenticRunner but adapted for orchestrator
            const nameParts = args.player_name.trim().split(' ');
            const lastName = nameParts[nameParts.length - 1];
            const players = await ballDontLieService.getPlayersGeneric(sportKey, { search: lastName, per_page: 10 });
            
            const player = players.find(p => 
              `${p.first_name} ${p.last_name}`.toLowerCase() === args.player_name.toLowerCase() ||
              p.last_name?.toLowerCase() === lastName.toLowerCase()
            );

            if (!player) {
              messages.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                content: JSON.stringify({ error: `Player "${args.player_name}" not found in ${args.sport}` })
              });
              continue;
            }

            let logs;
            if (args.sport === 'NBA' || args.sport === 'NCAAB') {
              logs = await ballDontLieService.getNbaPlayerGameLogs(player.id, numGames);
            } else if (args.sport === 'NHL') {
              logs = await ballDontLieService.getNhlPlayerGameLogs(player.id, numGames);
            } else {
              // NFL / NCAAF
              const month = new Date().getMonth() + 1;
              const year = new Date().getFullYear();
              const season = month >= 8 ? year : year - 1;
              const allLogs = await ballDontLieService.getNflPlayerGameLogsBatch([player.id], season, numGames);
              logs = allLogs[player.id];
            }

            const statResult = {
              player: args.player_name,
              sport: args.sport,
              logs: logs || { message: 'No logs found' }
            };

            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify(statResult, null, 2)
            });
          } catch (error) {
            console.error('[Orchestrator] Error fetching player game logs:', error.message);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify({ error: error.message })
            });
          }
          continue;
        }

        // Handle fetch_nba_player_stats tool
        if (functionName === 'fetch_nba_player_stats') {
          console.log(`  → [NBA_PLAYER_STATS:${args.stat_type}] for ${args.team}${args.player_name ? ` (${args.player_name})` : ''}`);

          try {
            const { ballDontLieService } = await import('../ballDontLieService.js');
            
            // Get team ID first
            const teams = await ballDontLieService.getTeams('basketball_nba');
            const team = teams.find(t =>
              t.full_name?.toLowerCase().includes(args.team.toLowerCase()) ||
              t.name?.toLowerCase().includes(args.team.toLowerCase())
            );

            if (!team) {
              messages.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                content: JSON.stringify({ error: `Team "${args.team}" not found` })
              });
              continue;
            }

            const month = new Date().getMonth() + 1;
            const year = new Date().getFullYear();
            const season = month >= 10 ? year : year - 1;

            let typeMap = {
              'ADVANCED': 'advanced',
              'USAGE': 'usage',
              'DEFENSIVE': 'defense',
              'TRENDS': 'base'
            };
            let categoryMap = {
              'ADVANCED': 'general',
              'USAGE': 'general',
              'DEFENSIVE': 'defense',
              'TRENDS': 'general'
            };

            // If player_name provided, get that player's stats specifically
            let playerIds = [];
            if (args.player_name) {
              const players = await ballDontLieService.getPlayersGeneric('basketball_nba', { search: args.player_name, per_page: 5 });
              const foundPlayer = players.find(p => 
                `${p.first_name} ${p.last_name}`.toLowerCase().includes(args.player_name.toLowerCase()) &&
                (p.team?.id === team.id || p.team?.full_name?.includes(team.full_name))
              );
              if (foundPlayer) playerIds = [foundPlayer.id];
            }

            // If no specific player found or provided, get team top players
            if (playerIds.length === 0) {
              const activePlayers = await ballDontLieService.getPlayersGeneric('basketball_nba', { team_ids: [team.id], per_page: 20 });
              playerIds = activePlayers.slice(0, 10).map(p => p.id);
            }

            const stats = await ballDontLieService.getNbaSeasonAverages({
              category: categoryMap[args.stat_type],
              type: typeMap[args.stat_type],
              season,
              player_ids: playerIds
            });

            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify({ 
                stat_type: args.stat_type, 
                team: team.full_name,
                season,
                data: stats 
              }, null, 2)
            });
          } catch (error) {
            console.error('[Orchestrator] Error fetching NBA player stats:', error.message);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify({ error: error.message })
            });
          }
          continue;
        }

        // Handle fetch_nhl_player_stats tool
        if (functionName === 'fetch_nhl_player_stats') {
          console.log(`  → [NHL_PLAYER_STATS:${args.stat_type}] for ${args.team}${args.player_name ? ` (${args.player_name})` : ''}`);

          try {
            const { ballDontLieService } = await import('../ballDontLieService.js');

            let statResult = { stat_type: args.stat_type, team: args.team, data: [] };
            // NHL season: Use starting year of season (e.g., 2025 for 2025-26 season)
            // Oct (month 9) onwards = new season starts
            const currentMonth = new Date().getMonth(); // 0-indexed
            const currentYear = new Date().getFullYear();
            const season = currentMonth >= 9 ? currentYear : currentYear - 1;

            // Get team ID first
            const teams = await ballDontLieService.getTeams('icehockey_nhl');
            const team = teams.find(t =>
              t.full_name?.toLowerCase().includes(args.team.toLowerCase()) ||
              t.tricode?.toLowerCase() === args.team.toLowerCase()
            );

            if (!team && args.stat_type !== 'LEADERS') {
              statResult.error = `Team "${args.team}" not found`;
            } else if (args.stat_type === 'LEADERS') {
              // Get league leaders for a specific stat
              const leaderType = args.leader_type || 'points';
              const leaders = await ballDontLieService.getNhlPlayerStatsLeaders(season, leaderType);
              statResult.data = (leaders || []).slice(0, 10).map(l => ({
                player: l.player?.full_name,
                team: l.player?.teams?.[0]?.full_name || 'Unknown',
                position: l.player?.position_code,
                stat: l.name,
                value: l.value
              }));
            } else {
              // Get players for the team
              const players = await ballDontLieService.getNhlTeamPlayers(team.id, season);

              if (args.stat_type === 'SKATERS') {
                // Filter to skaters (non-goalies)
                const skaters = players.filter(p => p.position_code !== 'G');

                // Get stats for each skater (limit to 10)
                const skatersToFetch = args.player_name
                  ? skaters.filter(p => p.full_name?.toLowerCase().includes(args.player_name.toLowerCase()))
                  : skaters.slice(0, 10);

                const statsPromises = skatersToFetch.map(async (player) => {
                  try {
                    const stats = await ballDontLieService.getNhlPlayerSeasonStats(player.id, season);
                    const statsObj = {};
                    (stats || []).forEach(s => { statsObj[s.name] = s.value; });
                    return {
                      player: player.full_name,
                      position: player.position_code,
                      gamesPlayed: statsObj.games_played || 0,
                      goals: statsObj.goals || 0,
                      assists: statsObj.assists || 0,
                      points: statsObj.points || 0,
                      plusMinus: statsObj.plus_minus || 0,
                      shootingPct: statsObj.shooting_pct ? (statsObj.shooting_pct * 100).toFixed(1) : null,
                      timeOnIcePerGame: statsObj.time_on_ice_per_game || null,
                      powerPlayGoals: statsObj.power_play_goals || 0,
                      powerPlayPoints: statsObj.power_play_points || 0
                    };
                  } catch (e) {
                    return null;
                  }
                });

                const results = await Promise.all(statsPromises);
                statResult.data = results.filter(r => r !== null).sort((a, b) => b.points - a.points);

              } else if (args.stat_type === 'GOALIES') {
                // Filter to goalies
                const goalies = players.filter(p => p.position_code === 'G');

                const goaliesToFetch = args.player_name
                  ? goalies.filter(p => p.full_name?.toLowerCase().includes(args.player_name.toLowerCase()))
                  : goalies.slice(0, 3);

                const statsPromises = goaliesToFetch.map(async (player) => {
                  try {
                    const stats = await ballDontLieService.getNhlPlayerSeasonStats(player.id, season);
                    const statsObj = {};
                    (stats || []).forEach(s => { statsObj[s.name] = s.value; });
                    return {
                      player: player.full_name,
                      gamesPlayed: statsObj.games_played || 0,
                      gamesStarted: statsObj.games_started || 0,
                      wins: statsObj.wins || 0,
                      losses: statsObj.losses || 0,
                      otLosses: statsObj.ot_losses || 0,
                      savePct: statsObj.save_pct ? (statsObj.save_pct * 100).toFixed(1) : null,
                      goalsAgainstAvg: statsObj.goals_against_average?.toFixed(2) || null,
                      shutouts: statsObj.shutouts || 0,
                      saves: statsObj.saves || 0,
                      goalsAgainst: statsObj.goals_against || 0
                    };
                  } catch (e) {
                    return null;
                  }
                });

                const results = await Promise.all(statsPromises);
                statResult.data = results.filter(r => r !== null).sort((a, b) => b.gamesPlayed - a.gamesPlayed);
              }

              if (statResult.data.length === 0) {
                statResult.message = `No ${args.stat_type.toLowerCase()} stats found for ${team?.full_name || args.team}`;
              }
            }

            // Store in history
            toolCallHistory.push({
              token: `NHL_PLAYER_STATS:${args.stat_type}`,
              timestamp: Date.now(),
              homeValue: statResult.data?.length || 0,
              awayValue: 'players',
              rawResult: statResult
            });

            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify(statResult, null, 2)
            });
          } catch (error) {
            console.error('[Orchestrator] Error fetching NHL player stats:', error.message);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify({ error: error.message, stat_type: args.stat_type })
            });
          }

          continue; // Skip the regular fetch_stats handling
        }

        // Handle fetch_ncaaf_player_stats tool
        if (functionName === 'fetch_ncaaf_player_stats') {
          console.log(`  → [NCAAF_PLAYER_STATS:${args.stat_type}] for ${args.team}${args.player_name ? ` (${args.player_name})` : ''}`);

          try {
            const { ballDontLieService } = await import('../ballDontLieService.js');

            let statResult = { stat_type: args.stat_type, team: args.team, data: [] };
            // Calculate NCAAF season dynamically: Aug-Dec = current year, Jan-Jul = previous year
            const ncaafMonth = new Date().getMonth() + 1;
            const ncaafYear = new Date().getFullYear();
            const season = ncaafMonth <= 7 ? ncaafYear - 1 : ncaafYear;

            // Get team ID first
            const teams = await ballDontLieService.getTeams('americanfootball_ncaaf');
            const team = teams.find(t =>
              t.full_name?.toLowerCase().includes(args.team.toLowerCase()) ||
              t.abbreviation?.toLowerCase() === args.team.toLowerCase() ||
              t.city?.toLowerCase().includes(args.team.toLowerCase())
            );

            if (!team && args.stat_type !== 'RANKINGS') {
              statResult.error = `Team "${args.team}" not found`;
            } else if (args.stat_type === 'RANKINGS') {
              // Get AP Poll rankings
              const rankings = await ballDontLieService.getNcaafRankings(season);
              statResult.data = (rankings || []).slice(0, 25).map(r => ({
                rank: r.rank,
                team: r.team?.full_name,
                record: r.record,
                points: r.points,
                trend: r.trend
              }));
            } else {
              // Get player season stats for the team
              const seasonStats = await ballDontLieService.getNcaafPlayerSeasonStats(team.id, season);

              if (args.stat_type === 'OFFENSE') {
                // Filter offensive players (QBs, RBs, WRs, TEs)
                let offensePlayers = seasonStats.filter(s =>
                  s.passing_yards > 0 || s.rushing_yards > 0 || s.receiving_yards > 0
                );

                if (args.player_name) {
                  offensePlayers = offensePlayers.filter(s =>
                    s.player?.first_name?.toLowerCase().includes(args.player_name.toLowerCase()) ||
                    s.player?.last_name?.toLowerCase().includes(args.player_name.toLowerCase())
                  );
                }

                statResult.data = offensePlayers.slice(0, 15).map(s => ({
                  player: `${s.player?.first_name} ${s.player?.last_name}`,
                  position: s.player?.position_abbreviation,
                  jersey: s.player?.jersey_number,
                  passingYards: s.passing_yards || 0,
                  passingTDs: s.passing_touchdowns || 0,
                  passingINTs: s.passing_interceptions || 0,
                  qbRating: s.passing_rating?.toFixed(1) || null,
                  rushingYards: s.rushing_yards || 0,
                  rushingTDs: s.rushing_touchdowns || 0,
                  rushingAvg: s.rushing_avg?.toFixed(1) || null,
                  receptions: s.receptions || 0,
                  receivingYards: s.receiving_yards || 0,
                  receivingTDs: s.receiving_touchdowns || 0
                }));

              } else if (args.stat_type === 'DEFENSE') {
                // Filter defensive players
                let defensePlayers = seasonStats.filter(s =>
                  s.total_tackles > 0 || s.sacks > 0 || s.interceptions > 0
                );

                if (args.player_name) {
                  defensePlayers = defensePlayers.filter(s =>
                    s.player?.first_name?.toLowerCase().includes(args.player_name.toLowerCase()) ||
                    s.player?.last_name?.toLowerCase().includes(args.player_name.toLowerCase())
                  );
                }

                statResult.data = defensePlayers.slice(0, 15).map(s => ({
                  player: `${s.player?.first_name} ${s.player?.last_name}`,
                  position: s.player?.position_abbreviation,
                  jersey: s.player?.jersey_number,
                  tackles: s.total_tackles || 0,
                  soloTackles: s.solo_tackles || 0,
                  tacklesForLoss: s.tackles_for_loss || 0,
                  sacks: s.sacks || 0,
                  interceptions: s.interceptions || 0,
                  passesDefended: s.passes_defended || 0
                }));
              }

              if (statResult.data.length === 0) {
                statResult.message = `No ${args.stat_type.toLowerCase()} stats found for ${team?.full_name || args.team}`;
              }
            }

            // Store in history
            toolCallHistory.push({
              token: `NCAAF_PLAYER_STATS:${args.stat_type}`,
              timestamp: Date.now(),
              homeValue: statResult.data?.length || 0,
              awayValue: 'players',
              rawResult: statResult
            });

            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify(statResult, null, 2)
            });
          } catch (error) {
            console.error('[Orchestrator] Error fetching NCAAF player stats:', error.message);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify({ error: error.message, stat_type: args.stat_type })
            });
          }

          continue; // Skip the regular fetch_stats handling
        }

        console.log(`  → [${args.token}] for ${sport}`);

        // Enforce per-sport token menu (prevents cross-sport aliases from polluting NCAAB cards)
        const resolveMenuSport = (s) => {
          const v = String(s || '').toLowerCase();
          if (v.includes('ncaab')) return 'NCAAB';
          if (v.includes('ncaaf')) return 'NCAAF';
          if (v.includes('nfl')) return 'NFL';
          if (v.includes('nba')) return 'NBA';
          if (v.includes('nhl')) return 'NHL';
          if (v.includes('epl')) return 'EPL';
          // Tool schema uses these values; fall back to NBA
          return 'NBA';
        };

        const menuSport = resolveMenuSport(args.sport || sport);
        const allowedTokens = getTokensForSport(menuSport);
        if (Array.isArray(allowedTokens) && allowedTokens.length > 0 && !allowedTokens.includes(args.token)) {
          const statResult = {
            error: `Token "${args.token}" is not allowed for ${menuSport}. Use the provided ${menuSport} token menu.`,
            sport: args.sport || sport,
            token: args.token,
            allowedTokens: allowedTokens
          };

          // Store the attempted call (helps debugging why something didn't show)
          toolCallHistory.push({
            token: args.token,
            timestamp: Date.now(),
            homeValue: 'N/A',
            awayValue: 'N/A',
            rawResult: statResult
          });

          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            content: JSON.stringify(statResult, null, 2)
          });
          continue;
        }

        // Fetch the stats
        const statResult = await fetchStats(
          args.sport || sport,
          args.token,
          homeTeam,
          awayTeam,
          options
        );

        // Extract key values from stat result for structured storage
        const extractStatValues = (result, token) => {
          if (!result) return { home: 'N/A', away: 'N/A' };

          // Try common field patterns
          const homeVal = result.home_value ?? result.homeValue ?? result.home ??
            result[homeTeam] ?? result.home_team ?? 'N/A';
          const awayVal = result.away_value ?? result.awayValue ?? result.away ??
            result[awayTeam] ?? result.away_team ?? 'N/A';

          // For complex results, try to extract meaningful values
          if (homeVal === 'N/A' && typeof result === 'object') {
            // Look for home/away in nested structure
            if (result.data) {
              return extractStatValues(result.data, token);
            }
            // For ratings/efficiency stats, look for numeric values
            const keys = Object.keys(result);
            for (const key of keys) {
              if (key.toLowerCase().includes('home') && typeof result[key] === 'number') {
                return { home: result[key], away: result[keys.find(k => k.toLowerCase().includes('away'))] || 'N/A' };
              }
            }
          }

          return { home: homeVal, away: awayVal };
        };

        const values = extractStatValues(statResult, args.token);

        // Store with values for structured display
        toolCallHistory.push({
          token: args.token,
          timestamp: Date.now(),
          homeValue: values.home,
          awayValue: values.away,
          rawResult: statResult // Keep raw result for debugging
        });

        // Add tool result to conversation
        messages.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: JSON.stringify(statResult, null, 2)
        });
      }

      // STATE-BASED PROMPTING: Inject the next pass instructions
      // This prevents "instruction contamination" where the model skips steps
      if (iteration === 1) {
        // After first tool calls, inject Pass 2 instructions
        messages.push({
          role: 'user',
          content: buildPass2Message()
        });
        console.log(`[Orchestrator] Injected Pass 2 instructions`);
      } else if (iteration === 2) {
        // After second tool calls, inject Pass 3 (final synthesis) instructions
        messages.push({
          role: 'user',
          content: buildPass3Message()
        });
        console.log(`[Orchestrator] Injected Pass 3 (Final) instructions`);
      }

      // Continue the loop for Gary to process the stats
      continue;
    }

    // No minimum enforcement - Gary calls what he needs organically
    // The prompts encourage comprehensive stat gathering naturally

    // Gary is done - parse the final response
    console.log(`[Orchestrator] Gary finished analysis (${finishReason})`);

    // Try to extract JSON from the response
    let pick = parseGaryResponse(message.content, homeTeam, awayTeam, sport);

    // If pick is null (invalid rationale), retry once with explicit instruction
    if (!pick && iteration < CONFIG.maxIterations) {
      console.log(`[Orchestrator] ⚠️ Invalid or missing rationale - requesting full analysis...`);
      
      messages.push({
        role: 'assistant',
        content: message.content
      });
      
      messages.push({
        role: 'user',
        content: `Your response is missing a complete rationale. Please provide your FULL analysis with:
1. A complete "TALE OF THE TAPE" comparison
2. "Gary's Take" section with 3-4 paragraphs explaining your reasoning
3. Clear discussion of the key stats that support your pick
4. Acknowledgment of any risks or contradicting factors

Output your complete pick JSON with the full rationale in the "rationale" field. Do NOT use placeholders like "See detailed analysis below" - write the actual analysis.`
      });
      
      iteration++;
      continue; // Retry
    }

    if (pick) {
      pick.toolCallHistory = toolCallHistory;
      pick.iterations = iteration;
      pick.rawAnalysis = message.content;
      return pick;
    } else {
      // If no valid JSON after retry, return the raw analysis
      return {
        error: 'Could not parse pick from response',
        rawAnalysis: message.content,
        toolCallHistory,
        iterations: iteration,
        homeTeam,
        awayTeam,
        sport
      };
    }
  }

  // Max iterations reached
  return {
    error: 'Max iterations reached without final pick',
    toolCallHistory,
    iterations: iteration,
    homeTeam,
    awayTeam,
    sport
  };
}

/**
 * Parse Gary's response to extract the pick JSON
 */
function parseGaryResponse(content, homeTeam, awayTeam, sport) {
  if (!content) return null;

  // First, check if Gary is explicitly passing on this game
  const lowerContent = content.toLowerCase();
  const passIndicators = [
    'i\'m passing', 'im passing', 'i am passing',
    'no pick', 'passing on this',
    'too close to call', 'genuine coin flip',
    'cannot recommend', 'can\'t recommend',
    'sitting this one out', 'sit this one out'
  ];
  
  const isPass = passIndicators.some(indicator => lowerContent.includes(indicator));
  if (isPass) {
    console.log('[Orchestrator] Gary explicitly passed on this game');
    // Return a coin_flip pick that will be filtered out
    return {
      pick: 'PASS',
      type: 'spread',
      odds: 0,
      confidence: 0.50,
      thesis_type: 'coin_flip',
      thesis_mechanism: 'Gary passed - game too close to call',
      supporting_factors: [],
      contradicting_factors_major: ['no_clear_edge'],
      contradicting_factors_minor: [],
      rationale: content.substring(0, 3000)
    };
  }

  // Helper to fix common JSON issues from Gemini
  const fixJsonString = (jsonStr) => {
    // Fix 1: Remove + prefix from numeric values (e.g., "+610" -> "610" or "moneylineAway": +610 -> 610)
    // This handles cases like "moneylineAway": +610 or "odds": +110
    // We use a more robust regex that handles decimals and potential spaces
    let fixed = jsonStr.replace(/:\s*\+([-+]?\d*\.?\d+)/g, ': $1');
    
    // Fix 2: Remove + prefix from numbers in arrays or elsewhere
    fixed = fixed.replace(/,\s*\+([-+]?\d*\.?\d+)/g, ', $1');
    fixed = fixed.replace(/\[\s*\+([-+]?\d*\.?\d+)/g, '[ $1');
    
    // Fix 3: Remove stats array if present (can cause parsing issues)
    fixed = fixed.replace(/"stats"\s*:\s*\[[\s\S]*?\],?/g, '');
    
    // Fix 4: Handle cases where Gary puts a + sign right before a number without a colon
    // e.g. "moneylineAway":+130
    fixed = fixed.replace(/([:,\[])\+([-+]?\d*\.?\d+)/g, '$1$2');
    
    return fixed;
  };

  // Try to find JSON in the response
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    let jsonStr = jsonMatch[1];
    try {
      const parsed = JSON.parse(jsonStr);
      return normalizePickFormat(parsed, homeTeam, awayTeam, sport);
    } catch (e) {
      console.warn('[Orchestrator] Failed to parse JSON from code block:', e.message);
      // Try to fix common Gemini JSON issues
      try {
        const fixedJson = fixJsonString(jsonStr);
        const parsed = JSON.parse(fixedJson);
        console.log('[Orchestrator] Parsed JSON after fixing Gemini formatting issues');
        return normalizePickFormat(parsed, homeTeam, awayTeam, sport);
      } catch (e2) {
        console.warn('[Orchestrator] Still failed after fixes:', e2.message);
      }
    }
  }

  // Try to find raw JSON object
  const rawJsonMatch = content.match(/\{[\s\S]*?"pick"[\s\S]*?\}/);
  if (rawJsonMatch) {
    let jsonStr = rawJsonMatch[0];
    try {
      const parsed = JSON.parse(jsonStr);
      return normalizePickFormat(parsed, homeTeam, awayTeam, sport);
    } catch (e) {
      console.warn('[Orchestrator] Failed to parse raw JSON:', e.message);
      // Try to fix common Gemini JSON issues
      try {
        const fixedJson = fixJsonString(jsonStr);
        const parsed = JSON.parse(fixedJson);
        console.log('[Orchestrator] Parsed JSON after fixing Gemini formatting issues');
        return normalizePickFormat(parsed, homeTeam, awayTeam, sport);
      } catch (e2) {
        console.warn('[Orchestrator] Still failed after fixes:', e2.message);
        // Log a snippet of the problematic JSON
        console.log('[Orchestrator] JSON snippet:', jsonStr.substring(0, 500));
      }
    }
  }

  return null;
}

/**
 * Normalize pick format for storage
 */
function normalizePickFormat(parsed, homeTeam, awayTeam, sport) {
  // Clean up pick text - remove placeholder patterns like -X.X
  let pickText = parsed.pick || '';
  if (pickText.includes('-X.X') || pickText.includes('+X.X')) {
    // If spread placeholder, try to determine actual pick from context
    pickText = pickText.replace(/[+-]X\.X/g, 'ML');
  }

  // FIX: If pick says "Team spread -110" without actual number, insert the spread value
  if (pickText.toLowerCase().includes(' spread ') && parsed.spread) {
    const spreadNum = parseFloat(parsed.spread);
    if (!isNaN(spreadNum)) {
      const spreadStr = spreadNum > 0 ? `+${spreadNum}` : `${spreadNum}`;
      // Replace "spread" with actual spread number
      pickText = pickText.replace(/\s+spread\s+/i, ` ${spreadStr} `);
    }
  }

  // Ensure pick text includes odds if not already present
  const odds = parsed.odds || parsed.spreadOdds || parsed.moneylineHome || parsed.moneylineAway || -110;
  if (!pickText.includes('-1') && !pickText.includes('+1') && !pickText.includes('-2') && !pickText.includes('+2')) {
    // Odds not in pick text, append them
    if (odds && typeof odds === 'number') {
      const oddsStr = odds > 0 ? `+${odds}` : `${odds}`;
      if (!pickText.includes(oddsStr)) {
        pickText = `${pickText} ${oddsStr}`;
      }
    }
  }

  // Final validation: if pick text is too short or missing team name, reconstruct it
  if (pickText.length < 10 || !pickText.match(/[A-Za-z]{3,}/)) {
    // Reconstruct pick text from available data
    const team = parsed.homeTeam || homeTeam || parsed.awayTeam || awayTeam || 'Unknown Team';
    const type = parsed.type || 'spread';
    if (type === 'moneyline' || type === 'ml') {
      const mlOdds = parsed.moneylineHome || parsed.moneylineAway || odds;
      const mlOddsStr = mlOdds > 0 ? `+${mlOdds}` : `${mlOdds}`;
      pickText = `${team} ML ${mlOddsStr}`;
    } else if (parsed.spread) {
      const spreadNum = parseFloat(parsed.spread);
      const spreadStr = spreadNum > 0 ? `+${spreadNum}` : `${spreadNum}`;
      const spreadOdds = parsed.spreadOdds || -110;
      const spreadOddsStr = spreadOdds > 0 ? `+${spreadOdds}` : `${spreadOdds}`;
      pickText = `${team} ${spreadStr} ${spreadOddsStr}`;
    }
  }

  // Normalize contradicting_factors to always be { major: [], minor: [] }
  let contradictions = { major: [], minor: [] };
  // New flat format: contradicting_factors_major and contradicting_factors_minor
  if (parsed.contradicting_factors_major || parsed.contradicting_factors_minor) {
    contradictions.major = parsed.contradicting_factors_major || [];
    contradictions.minor = parsed.contradicting_factors_minor || [];
  }
  // Legacy: nested object format
  else if (parsed.contradicting_factors && typeof parsed.contradicting_factors === 'object' && !Array.isArray(parsed.contradicting_factors)) {
    contradictions.major = parsed.contradicting_factors.major || [];
    contradictions.minor = parsed.contradicting_factors.minor || [];
  }
  // Legacy: simple array format (treat as minor)
  else if (Array.isArray(parsed.contradicting_factors)) {
    contradictions.minor = parsed.contradicting_factors;
  }

  // Get rationale and validate it
  let rationale = parsed.rationale || parsed.analysis || '';
  
  // Check for placeholder/invalid rationales - these should NOT happen
  const invalidRationales = [
    'see detailed analysis',
    'see analysis below',
    'detailed analysis below',
    'analysis below',
    'see above',
    'see below',
    'tbd',
    'to be determined'
  ];
  
  const lowerRationale = rationale.toLowerCase().trim();
  const isInvalidRationale = invalidRationales.some(inv => lowerRationale.includes(inv)) || 
                             rationale.length < 100; // Must be at least 100 chars for a real analysis
  
  // Flag invalid rationales - the retry logic in runAgentLoop will handle this
  if (isInvalidRationale) {
    console.log(`[Orchestrator] ⚠️ Invalid rationale detected (length: ${rationale.length}) - will retry`);
    return null; // Return null to trigger retry
  }

  return {
    pick: pickText.trim(),
    type: parsed.type || 'spread',
    odds: odds,
    confidence: parseFloat(parsed.confidence) || 0.60,
    // Thesis-based classification (new system)
    thesis_type: parsed.thesis_type || null,
    thesis_mechanism: parsed.thesis_mechanism || null,
    supporting_factors: parsed.supporting_factors || [],
    contradicting_factors: contradictions,
    homeTeam: parsed.homeTeam || homeTeam,
    awayTeam: parsed.awayTeam || awayTeam,
    league: normalizeSportToLeague(sport),
    sport: sport,
    rationale: rationale,
    // Include odds from Gary's output
    spread: parsed.spread,
    spreadOdds: parsed.spreadOdds || -110,
    moneylineHome: parsed.moneylineHome,
    moneylineAway: parsed.moneylineAway,
    total: parsed.total,
    totalOdds: parsed.totalOdds || -110,
    
    // Pass through tournament/venue context from Gary's JSON
    tournamentContext: parsed.tournamentContext || null,
    gameSignificance: parsed.gameSignificance || null,
    venue: parsed.venue || null,
    isNeutralSite: parsed.isNeutralSite || false,
    
    // NCAAF/CFP specific
    cfpRound: parsed.cfpRound || null,
    homeSeed: parsed.homeSeed || null,
    awaySeed: parsed.awaySeed || null,
    
    agentic: true // Flag to identify agentic picks
  };
}

/**
 * Normalize sport to league name
 */
function normalizeSportToLeague(sport) {
  const mapping = {
    'basketball_nba': 'NBA',
    'americanfootball_nfl': 'NFL',
    'basketball_ncaab': 'NCAAB',
    'americanfootball_ncaaf': 'NCAAF',
    'NBA': 'NBA',
    'NFL': 'NFL',
    'NCAAB': 'NCAAB',
    'NCAAF': 'NCAAF'
  };
  return mapping[sport] || sport;
}

/**
 * Batch analyze multiple games
 */
export async function analyzeGames(games, sport, options = {}) {
  const results = [];

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    console.log(`\n[${i + 1}/${games.length}] Processing: ${game.away_team} @ ${game.home_team}`);

    const result = await analyzeGame(game, sport, options);
    results.push(result);

    // Small delay between games to avoid rate limits
    if (i < games.length - 1) {
      await sleep(1000);
    }
  }

  return results;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default { analyzeGame, analyzeGames };

