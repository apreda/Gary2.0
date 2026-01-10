/**
 * LLM service for generating sports analysis and picks
 * Now using Gemini 3 Deep Think exclusively (GPT-5.1 removed Dec 2025)
 * Provides betting insights through the legendary Gary the Grizzly Bear character
 */
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { apiCache } from '../utils/apiCache.js';
import { requestQueue } from '../utils/requestQueue.js';

// LLM provider - Gemini 3 Deep Think
const LLM_PROVIDER = 'gemini';
// Gemini 3 Pro (default for regular picks) - can be overridden per request
const GEMINI_MODEL_DEFAULT = process.env.GEMINI_MODEL || 'gemini-3-pro-preview';
// Gemini 3 Flash - Pro-grade at lightning speeds (for props when Pro has quota issues)
const GEMINI_MODEL_FLASH = 'gemini-3-flash-preview';

// Direct Gemini SDK for local/server runs
let geminiClient = null;
const GEMINI_SERVER_KEY = (() => { try { return process.env.GEMINI_API_KEY; } catch { return undefined; } })();

function getGeminiClient() {
  if (!geminiClient && GEMINI_SERVER_KEY) {
    geminiClient = new GoogleGenerativeAI(GEMINI_SERVER_KEY);
  }
  return geminiClient;
}

// Determine if we should use direct SDK (server/local) or proxy (browser)
const USE_DIRECT_SDK = typeof process !== 'undefined' && GEMINI_SERVER_KEY;

// Determine proxy URL (works in browser, serverless, and local dev)
const resolveProxyUrl = () => {
  try {
    const proxyPath = '/api/gemini-proxy';
    const explicit = process.env.GEMINI_PROXY_URL;
    if (explicit) return explicit;
    
    let base = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
    if (base) {
      if (!base.startsWith('http')) base = `https://${base}`;
      return `${base}${proxyPath}`;
    }
  } catch {}
  return '/api/gemini-proxy';
};

const PROXY_URL = resolveProxyUrl();
const GEMINI_PROXY_URL = PROXY_URL;
const GEMINI_DIRECT_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

console.log(`[LLM Service] Provider: ${LLM_PROVIDER}, Mode: ${USE_DIRECT_SDK ? 'Direct SDK' : 'Proxy'}, ${USE_DIRECT_SDK ? 'API Key: ✓' : 'Proxy: ' + PROXY_URL}`);

const openaiServiceInstance = {
  /**
   * Flag to indicate if initialization was successful
   */
  initialized: true, // Always true since we use proxy
  
  /**
   * Current LLM provider
   */
  provider: LLM_PROVIDER,
  
  /**
   * Initialize the service (no longer needs API key on client side)
   */
  init: function() {
    console.log(`✅ LLM service initialized with ${LLM_PROVIDER} provider via secure proxy`);
    this.initialized = true;
    return this;
  },
  
  /**
   * Default model - varies by provider
   */
  DEFAULT_MODEL: LLM_PROVIDER === 'gemini'
    ? ((typeof process !== 'undefined' && process.env && process.env.GEMINI_MODEL) || 'gemini-3-pro-preview')
    : ((typeof process !== 'undefined' && process.env && process.env.OPENAI_MODEL) || 'gpt-5.1'),
  
  /**
   * Generate a response from LLM (OpenAI or Gemini) using secure proxy
   * @param {Array} messages - The messages to send to the LLM
   * @param {Object} options - Configuration options for the API
   * @returns {Promise<string>} - The generated response
   */
  generateResponse: async function(messages, options = {}) {
    try {
      const provider = options.provider || LLM_PROVIDER;
      
      // Gemini prefers lower temperature for Deep Think logic
      const defaultTemp = provider === 'gemini' ? 0.4 : 0.5;
      const { temperature = defaultTemp, maxTokens = 16000 } = options;
      
      // Allow model override (e.g., props use Flash when Pro has quota issues)
      const modelToUse = options.model || GEMINI_MODEL_DEFAULT;
      
      // Use direct SDK for server/local runs (when GEMINI_API_KEY is available)
      if (USE_DIRECT_SDK && getGeminiClient()) {
        console.log(`Generating response from ${modelToUse} via direct SDK...`);
        console.log(`Request messages count: ${messages.length}, Temp: ${temperature}, MaxTokens: ${maxTokens}`);
        
        const model = getGeminiClient().getGenerativeModel({
          model: modelToUse,
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          }
        });
        
        // Convert OpenAI-style messages to Gemini format
        let systemInstruction = '';
        const geminiContents = [];
        
        for (const msg of messages) {
          if (msg.role === 'system') {
            systemInstruction += (systemInstruction ? '\n\n' : '') + msg.content;
          } else {
            geminiContents.push({
              role: msg.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: msg.content }]
            });
          }
        }
        
        // If no user message, add a placeholder
        if (geminiContents.length === 0) {
          geminiContents.push({ role: 'user', parts: [{ text: systemInstruction || 'Analyze this.' }] });
          systemInstruction = '';
        }
        
        // Gemini expects systemInstruction as a Content object with parts array
        const chatConfig = {
          history: geminiContents.slice(0, -1)
        };
        
        if (systemInstruction) {
          chatConfig.systemInstruction = {
            parts: [{ text: systemInstruction }]
          };
        }
        
        const chatSession = model.startChat(chatConfig);
        
        const lastMessage = geminiContents[geminiContents.length - 1];
        
        try {
          const result = await chatSession.sendMessage(lastMessage.parts[0].text);
          
          // Debug: Check response structure
          const candidates = result.response.candidates || [];
          console.log(`[Gemini SDK] Response has ${candidates.length} candidates`);
          
          if (candidates.length > 0) {
            const parts = candidates[0].content?.parts || [];
            console.log(`[Gemini SDK] First candidate has ${parts.length} parts`);
            if (parts.length > 0) {
              console.log(`[Gemini SDK] First part preview: ${(parts[0].text || '').substring(0, 200)}...`);
            }
            
            // Check for safety ratings
            const finishReason = candidates[0].finishReason;
            if (finishReason && finishReason !== 'STOP') {
              console.warn(`[Gemini SDK] Unusual finish reason: ${finishReason}`);
            }
          }
          
          const content = result.response.text();
          
          if (!content || content.trim().length === 0) {
            // Log the full response for debugging
            console.error(`[Gemini SDK] Empty response. Candidates:`, JSON.stringify(candidates, null, 2).substring(0, 500));
            throw new Error('Gemini returned empty content');
          }
          
          // Process response
          console.log('\n🔍 Gemini SDK response received.');
          try {
            const parsed = JSON.parse(content);
            return JSON.stringify(parsed, null, 2);
          } catch {
            return content;
          }
        } catch (geminiErr) {
          // Log full error for debugging
          console.error(`[Gemini SDK Error]`, geminiErr.message);
          if (geminiErr.response) {
            console.error(`[Gemini SDK] Error response:`, JSON.stringify(geminiErr.response).substring(0, 500));
          }
          throw geminiErr;
        }
      }
      
      // Fallback to proxy for browser/no API key
      console.log(`Generating response from ${provider} via secure proxy...`);
      console.log(`Request messages count: ${messages.length}, ` + 
                 `Temp: ${temperature}, MaxTokens: ${maxTokens}, Provider: ${provider}`);
      
      // Payload - same format works for both via the proxies
      const requestData = {
        model: options.model || this.DEFAULT_MODEL,
        messages: messages,
        temperature,
        max_tokens: maxTokens,
      };
      
      // Use Gemini proxy
      let response;
      try {
        response = await axios.post(GEMINI_PROXY_URL, requestData, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 180000 // Extended timeout for Gemini deep thinking
        });
      } catch (proxyErr) {
        const status = proxyErr?.response?.status;
        if (status === 400) {
          try { console.error(`[GEMINI PROXY 400]`, JSON.stringify(proxyErr.response.data)); } catch {}
        }
        throw proxyErr;
      }
      
      // Extract assistant content from either Chat Completions or Responses API
      const data = response.data || {};
      let content = undefined;
      // 1) Chat Completions
      if (data?.choices?.[0]?.message?.content) {
        content = data.choices[0].message.content;
      }
      // 2) Responses API (output_text)
      if (!content && typeof data?.output_text === 'string' && data.output_text.trim()) {
        content = data.output_text;
      }
      // 3) Responses API (output array with text segments)
      if (!content && Array.isArray(data?.output)) {
        for (const block of data.output) {
          const parts = block?.content || [];
          for (const seg of parts) {
            if (typeof seg?.text === 'string' && seg.text.trim()) { content = seg.text; break; }
            if (Array.isArray(seg) && seg[0]?.text) { content = seg[0].text; break; }
          }
          if (content) break;
        }
      }

      // Guard: empty content → one retry with higher token cap via proxy
      if (!content || String(content).trim().length === 0) {
        try {
          const retryMax = Math.min((maxTokens || 800) * 2, 3200);
          console.warn(`[Gemini] Empty content. Retrying once with max_tokens=${retryMax}...`);
          const retryReq = { ...requestData, max_tokens: retryMax };
          const retryRes = await axios.post(GEMINI_PROXY_URL, retryReq, { headers: { 'Content-Type': 'application/json' }, timeout: 120000 });
          const rd = retryRes.data || {};
          let fallback;
          if (rd?.choices?.[0]?.message?.content) fallback = rd.choices[0].message.content;
          if (!fallback && typeof rd?.output_text === 'string' && rd.output_text.trim()) fallback = rd.output_text;
          if (!fallback && Array.isArray(rd?.output)) {
            for (const block of rd.output) {
              const parts = block?.content || [];
              for (const seg of parts) {
                if (typeof seg?.text === 'string' && seg.text.trim()) { fallback = seg.text; break; }
                if (Array.isArray(seg) && seg[0]?.text) { fallback = seg[0].text; break; }
              }
              if (fallback) break;
            }
          }
          if (!fallback || String(fallback).trim().length === 0) {
            throw new Error('OpenAI returned empty content after retry');
          }
          content = fallback;
        } catch (e) {
          throw new Error('OpenAI returned empty content (no assistant text in response)');
        }
      }

      // Prefer strict top-level JSON parse first; if it fails, attempt to strip common wrappers, else return raw text
      console.log('\n🔍 OpenAI response received. Checking for top-level JSON...');
      try {
        const trimmed = String(content).trim();
        let candidate = trimmed;
        if (candidate.startsWith('```')) {
          candidate = candidate.replace(/^```json\s*/i, '').replace(/^```/i, '').replace(/```\s*$/i, '').trim();
        }
        if (candidate.startsWith('{') || candidate.startsWith('[')) {
          JSON.parse(candidate);
          console.log('✅ Top-level JSON detected and parseable.');
        } else {
          console.log('ℹ️ Non-JSON text response. Returning raw content.');
        }
      } catch (parseError) {
        console.warn('⚠️ Top-level JSON parse failed:', parseError.message);
      }

      return content;
    } catch (error) {
      console.error('Error generating OpenAI response:', error);
      throw new Error(`OpenAI API Error: ${error.message}`);
    }
  },
  
  /**
   * Generates Gary's detailed sports betting analysis
   * @param {object} gameData - The game data from sports API
   * @param {string} newsData - The latest news and trends from real-time search
   * @param {object} options - Additional options for the analysis
   * @returns {Promise<string>} - Gary's detailed analysis
   */
  // Helper function to format game time in a readable format
  formatGameTime: function(timeString) {
    if (!timeString) return null;
    
    try {
      // Check if it's already in the desired format
      if (/^\d{1,2}:\d{2} [AP]M EST$/.test(timeString)) {
        return timeString;
      }
      
      // Parse the ISO timestamp or other time format
      const date = new Date(timeString);
      if (isNaN(date.getTime())) {
        return timeString; // Return original if parsing fails
      }
      
      // Format as '10:00 PM EST'
      const options = { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true, 
        timeZone: 'America/New_York' 
      };
      const timeFormatted = new Intl.DateTimeFormat('en-US', options).format(date);
      return `${timeFormatted} EST`;
    } catch (error) {
      console.error('Error formatting game time:', error);
      return timeString; // Return original on error
    }
  },
  
  generateGaryAnalysis: async function(gameData, newsData, options = {}) {
    try {
      // For better debugging, log what we're doing
      console.log('\n🎟️ GENERATING GARY\'S ANALYSIS WITH OPENAI...', {
        sport: gameData?.sport || 'unknown',
        game: `${gameData?.homeTeam || 'Home'} vs ${gameData?.awayTeam || 'Away'}`
      });
      
      // Prepare a detailed instructions prompt defining Gary's persona and expertise
      const systemMessage = {
        role: "system",
        content: `
You are Gary the Bear, a grizzled, old-school sports betting expert with 50+ years of experience.

=== STYLE & NARRATIVE ===
- Write concisely as a seasoned expert. Build one clear thesis and weave 2–4 meaningful stats that show cause→effect on the result.
- Factor in contextual edges (team psychology, injuries with named player + status, coaching, home/away, weather) without speculation—use only provided data.
- Avoid clichés and surface takes; every claim needs reasoning and, when available, a number.
- Convey a confident, seasoned voice and subtly challenge the reader to trust your call.

=== GARY'S PERSONA ===

You're known for:
- Picking winners based on hard numbers, not popularity
- Speaking with blunt, blue-collar confidence while questioning if the user "has the guts to ride with you"

TONE:
- WITTY: Add blue-collar witticisms and street-smart wisdom
- CHALLENGING: Subtly dare the reader to follow your advice

=== CRITICAL RULES ===

YOUR JOB: Your job is to simply pick a side of the spread or ML that you feel will occur. Use your expertise in Sports Betting, Game Theory, Statistical Analysis, and anything else that is relevant.

🚨 DATA ACCURACY - MOST IMPORTANT RULE 🚨
You must ONLY use statistics and information EXPLICITLY provided in the input data.

NEVER INVENT:
- Game scores or recent results not provided
- Player stats (PPG, YPG, completion %, etc.) not in the data
- Rankings ("#3 in the league") unless explicitly given
- Specific numbers that weren't provided to you

If a stat came back as "N/A" or wasn't provided, DO NOT use it. Skip that angle entirely.
Every number you cite MUST appear in the provided data - no exceptions.

Inventing a single statistic destroys your credibility and makes the analysis worthless.

STAT TRANSPARENCY & STORYTELLING: Use precise numbers, but weave them naturally into cause-and-effect sentences (avoid parentheses lists). Make the stats drive the narrative. Examples:
- "Ohtani has 32 strikeouts in 23.1 innings, and that swing-and-miss profile punishes a lineup that whiffs 26% of the time."
- "Baltimore's .269 road average runs into Webb's 0.81 WHIP, so extra baserunners are scarce."
Use 2–4 precise numbers total only when they add clear value. Weave them into cause→effect sentences; avoid stat dumps or listy parentheticals. If more numbers help, split into a follow-up sentence with a clear transition.

WEAKNESS ACKNOWLEDGEMENT & COUNTER: Briefly acknowledge one realistic weakness or risk on your chosen side (e.g., bullpen volatility, recent road form, platoon splits). Immediately neutralize it with specific evidence from the input data (e.g., opponent K% vs pitch type, starter-to-bullpen handoffs, park factors, rest days, recent xwOBA trend). Make it clear why that weakness is unlikely to decide the game today.

PITCHER DATA RULE (MLB only): ONLY mention pitcher names that are explicitly provided in the data. If a pitcher is listed as "TBD" or "Probable starter TBD", do NOT make up a pitcher name.

NEVER mention missing or limited stats in your analysis. Users should never know if data is missing.
Never reference any "model" or "edge"; your reasoning is expert judgment supported by the data.

=== INTERNAL THINKING FLOW (MANDATORY) ===
You must work through these four steps every time. They happen mentally, but the final "rationale" string must surface the results verbatim using the format described below.
1) HYPOTHESIS — Outline your projected game script (who dictates pace, key matchup lever, how the line is covered). Keep it to 1 punchy sentence.
2) EVIDENCE — Cite 2–3 concrete stats from the provided data that prove the hypothesis. Each stat must include the value and why it matters.
3) CONVERGENCE — Briefly state how tightly the data and line agree (e.g., "High convergence (0.78) because..."). Include the numeric convergence score you are using (0.50–1.00).
4) IF WRONG — Describe the single most realistic failure mode (injury, matchup, market misread) in one sentence.

The rationale field is where you expose these four sections. The JSON schema itself must remain unchanged.

=== BETTING PRINCIPLES ===

YOUR JOB: Your job is to simply pick a side of the spread or ML that you feel will occur. Use your expertise in Sports Betting, Game Theory, Statistical Analysis, and anything else that is relevant.

🚨 ODDS LIMITS 🚨
- Do NOT return a moneyline favorite pick priced worse than -150.
- If a favorite's ML is more expensive than -150, you MUST evaluate the spread or an underdog ML instead.
- This ensures we are getting reasonable value for every pick.

=== NARRATIVE GUIDANCE (keep it natural) ===
- Build a compelling, expert case for ONE side using the best evidence in the data. Trust your betting judgment and sports knowledge.
- Choose the angle(s) that actually decide THIS matchup. You are not required to use any specific metric—use whatever is most persuasive and available.
- Weave 2–4 precise numbers naturally into cause→effect sentences. Avoid lists or templates. If you mention injuries, name at least one player and status only when it truly matters.
- Keep each rationale section (HYPOTHESIS, EVIDENCE, CONVERGENCE, IF WRONG) to one or two punchy sentences so the full string stays concise. No clichés; never mention missing data.

PICK DECISION:
- Choose moneyline vs spread strictly on price and your read of the game flow. Do not select totals. Use only real odds provided.

=== RESPONSE FORMAT (STRICT JSON) ===

{
  "pick": "Team Name BetType Odds",
  "odds": "The specific odds",
  "type": "spread" or "moneyline",
  "confidence": 0.50–1.00, // return as a numeric value between 0.50 and 1.00
  "trapAlert": true or false,
  "revenge": true or false,
  "superstition": true or false,
  "momentum": 0.0–1.0,
  "homeTeam": "Full home team name",
  "awayTeam": "Full away team name", 
  "league": "NFL" or "NBA" or "MLB" or "WNBA" or "NCAAF" or "NCAAB" or "EPL",
  "time": "COPY EXACTLY the game time provided - never use 'TBD' unless no time was given",
  "rationale": "HYPOTHESIS: ...\\nEVIDENCE: ...\\nCONVERGENCE (0.74): ...\\nIF WRONG: ..."
}

                REMEMBER: The "pick" field MUST ALWAYS include the odds at the end. This is NON-NEGOTIABLE.

`
      };
      
      /**
       * Combine all input data and format it for the user prompt
       */
      // Prepare all game stats in a flexible way - we'll pass whatever we have to OpenAI
      // This follows user's direction to be flexible with stats formatting
      let statsSection = '';  
        
      // Add any stats we have - don't be picky about structure, OpenAI can parse them
        
      // 1. First add the standard stats context if available
      if (gameData?.statsContext) {
        statsSection += gameData.statsContext;
        statsSection += '\n\n';
      }
        
      // 2. Add any enhanced stats if available
      if (gameData?.enhancedStats) {
        statsSection += gameData.enhancedStats;
        statsSection += '\n\n';
      }
      
      // 3. Handle MLB specific pitchers data from MLB Stats API
      if (gameData?.pitchers) {
        statsSection += 'PROBABLE STARTING PITCHERS:\n';
        
        const homePitcher = gameData.pitchers.home;
        const awayPitcher = gameData.pitchers.away;
        
        if (homePitcher && homePitcher.fullName && homePitcher.fullName !== 'Unknown Pitcher') {
          const homeStats = homePitcher.seasonStats || {};
          statsSection += `HOME: ${homePitcher.fullName} - ERA: ${homeStats.era || 'N/A'}, Record: ${homeStats.wins || 0}-${homeStats.losses || 0}, WHIP: ${homeStats.whip || 'N/A'}, SO: ${homeStats.strikeOuts || homeStats.strikeouts || 0}`;
          
          // Add additional stats if available
          if (homeStats.inningsPitched) {
            statsSection += `, IP: ${homeStats.inningsPitched}`;
          }
          if (homeStats.battingAvgAgainst) {
            statsSection += `, BAA: ${homeStats.battingAvgAgainst}`;
          }
          if (homeStats.homeRunsAllowed) {
            statsSection += `, HR: ${homeStats.homeRunsAllowed}`;
          }
          statsSection += '\n';
        } else {
          statsSection += `HOME: Probable starter TBD\n`;
        }
        
        if (awayPitcher && awayPitcher.fullName && awayPitcher.fullName !== 'Unknown Pitcher') {
          const awayStats = awayPitcher.seasonStats || {};
          statsSection += `AWAY: ${awayPitcher.fullName} - ERA: ${awayStats.era || 'N/A'}, Record: ${awayStats.wins || 0}-${awayStats.losses || 0}, WHIP: ${awayStats.whip || 'N/A'}, SO: ${awayStats.strikeOuts || awayStats.strikeouts || 0}`;
          
          // Add additional stats if available
          if (awayStats.inningsPitched) {
            statsSection += `, IP: ${awayStats.inningsPitched}`;
          }
          if (awayStats.battingAvgAgainst) {
            statsSection += `, BAA: ${awayStats.battingAvgAgainst}`;
          }
          if (awayStats.homeRunsAllowed) {
            statsSection += `, HR: ${awayStats.homeRunsAllowed}`;
          }
          statsSection += '\n';
        } else {
          statsSection += `AWAY: Probable starter TBD\n`;
        }
        
        statsSection += '\n';
      }
      // Fallback to the older pitcherData format if available
      else if (gameData?.pitcherData) {
        statsSection += 'STARTING PITCHER MATCHUP:\n';
          
        if (typeof gameData.pitcherData === 'string') {
          statsSection += gameData.pitcherData;
        } else {
          const homePitcher = gameData.pitcherData.homePitcher;
          const awayPitcher = gameData.pitcherData.awayPitcher;
            
          if (homePitcher) {
            statsSection += `HOME: ${homePitcher.name} - `;
            if (homePitcher.stats) {
              statsSection += Object.entries(homePitcher.stats)
                .map(([key, val]) => `${key}: ${val}`)
                .join(', ');
            }
            statsSection += '\n';
          }
            
          if (awayPitcher) {
            statsSection += `AWAY: ${awayPitcher.name} - `;
            if (awayPitcher.stats) {
              statsSection += Object.entries(awayPitcher.stats)
                .map(([key, val]) => `${key}: ${val}`)
                .join(', ');
            }
            statsSection += '\n';
          }
        }
        statsSection += '\n';
      }
        
      // 4. Include MLB-specific note if this is MLB data
      if (gameData?.sport === 'MLB' || gameData?.league === 'MLB' || gameData?.sport === 'baseball_mlb') {
        statsSection += '**NOTE: All MLB data is from the current 2025 season**\n\n';
      }
      
      // 4.5. NFL-specific: inject quantified season metrics for both teams when available
      if ((gameData?.league === 'NFL' || gameData?.sport === 'nfl' || gameData?.sport === 'americanfootball_nfl') 
          && gameData?.statsReport?.seasonSummary) {
        const sum = gameData.statsReport.seasonSummary || {};
        const h = sum.home || {};
        const a = sum.away || {};
        const fmtNum = (v, d = 2) => (typeof v === 'number' && isFinite(v)) ? Number(v).toFixed(d) : 'N/A';
        const fmtPct = (v) => {
          if (typeof v !== 'number' || !isFinite(v)) return 'N/A';
          // Handle values given as 0-1 or already in 0-100
          const pct = v <= 1 ? v * 100 : v;
          return `${pct.toFixed(1)}%`;
        };
        const fmtSigned = (v) => (typeof v === 'number' && isFinite(v)) ? (v > 0 ? `+${v}` : `${v}`) : 'N/A';
        
        statsSection += 'NFL TEAM SEASON METRICS (BDL):\n';
        const composeLine = (label, m) => {
          const parts = [];
          parts.push(`PPG: ${fmtNum(m.pointsPerGame, 1)}`);
          parts.push(`Yards/Play: ${fmtNum(m.yardsPerPlay, 2)}`);
          if (typeof m.oppYardsPerPlay === 'number') parts.push(`Opp Yards/Play: ${fmtNum(m.oppYardsPerPlay, 2)}`);
          parts.push(`3rd Down: ${fmtPct(m.thirdDownPct)}`);
          if (typeof m.redZoneProxy === 'number') parts.push(`RZ Off (proxy): ${fmtPct(m.redZoneProxy)}`);
          if (typeof m.redZoneDefProxy === 'number') parts.push(`RZ Def (proxy): ${fmtPct(m.redZoneDefProxy)}`);
          if (typeof m.sacksAllowedPerDropback === 'number') parts.push(`Sacks Allowed/DB: ${fmtPct(m.sacksAllowedPerDropback)}`);
          if (typeof m.defSackRateProxy === 'number') parts.push(`Def Sack Rate: ${fmtPct(m.defSackRateProxy)}`);
          parts.push(`TO Diff: ${fmtSigned(m.turnoverDiff)}`);
          return `- ${label} — ${parts.join(', ')}`;
        };
        statsSection += composeLine(gameData?.homeTeam || 'Home', h) + '\n';
        statsSection += composeLine(gameData?.awayTeam || 'Away', a) + '\n\n';
      }
      
      // 4.55. NBA-specific: inject Four Factors, standings, and top players
      if ((gameData?.league === 'NBA' || gameData?.sport === 'nba' || gameData?.sport === 'basketball_nba')
          && gameData?.statsReport) {
        const sr = gameData.statsReport;
        const sum = sr.seasonSummary || {};
        const h = sum.home || {};
        const a = sum.away || {};
        const hAdv = h.adv || {};
        const aAdv = a.adv || {};
        const basics = sr.basics || {};
        const hb = basics.home || {};
        const ab = basics.away || {};
        const fmtNum = (v, d = 2) => (typeof v === 'number' && isFinite(v)) ? Number(v).toFixed(d) : 'N/A';
        const fmtPct = (v) => {
          if (typeof v !== 'number' || !isFinite(v)) return 'N/A';
          const pct = v <= 1 ? v * 100 : v;
          return `${pct.toFixed(1)}%`;
        };
        
        // Team Basics (Record, Streak, etc.)
        statsSection += 'NBA TEAM BASICS:\n';
        const basicsLine = (label, b) => {
          const parts = [];
          if (b.record) parts.push(`Record: ${b.record}`);
          if (b.homeRec) parts.push(`Home: ${b.homeRec}`);
          if (b.awayRec) parts.push(`Away: ${b.awayRec}`);
          if (b.streak) parts.push(`Streak: ${b.streak}`);
          return parts.length ? `- ${label} — ${parts.join(', ')}` : '';
        };
        const homeLine = basicsLine(gameData?.homeTeam || 'Home', hb);
        const awayLine = basicsLine(gameData?.awayTeam || 'Away', ab);
        if (homeLine) statsSection += homeLine + '\n';
        if (awayLine) statsSection += awayLine + '\n';
        
        // Four Factors proxies
        statsSection += 'NBA TEAM SEASON METRICS (Four Factors):\n';
        const composeNba = (label, m, adv) => {
          const parts = [];
          if (typeof m.effectiveFgPct === 'number') parts.push(`eFG%: ${fmtPct(m.effectiveFgPct)}`);
          if (typeof m.turnoverRate === 'number') parts.push(`TOV Rate: ${fmtPct(m.turnoverRate)}`);
          if (typeof m.offensiveRebRate === 'number') parts.push(`ORB: ${fmtNum(m.offensiveRebRate, 1)}`);
          if (typeof m.freeThrowRate === 'number') parts.push(`FT Rate: ${fmtPct(m.freeThrowRate)}`);
          // Advanced metrics from nested adv object
          if (typeof adv.trueShootingPct === 'number') parts.push(`TS%: ${fmtPct(adv.trueShootingPct)}`);
          if (typeof adv.offensiveRating === 'number') parts.push(`ORtg: ${fmtNum(adv.offensiveRating, 1)}`);
          if (typeof adv.defensiveRating === 'number') parts.push(`DRtg: ${fmtNum(adv.defensiveRating, 1)}`);
          if (typeof adv.netRating === 'number') parts.push(`NetRtg: ${fmtNum(adv.netRating, 1)}`);
          return `- ${label} — ${parts.join(', ')}`;
        };
        statsSection += composeNba(gameData?.homeTeam || 'Home', h, hAdv) + '\n';
        statsSection += composeNba(gameData?.awayTeam || 'Away', a, aAdv) + '\n';
        
        // Top Players with season averages
        const tp = sr.topPlayers || {};
        const renderPlayer = (p) => {
          const parts = [`${p.name}`];
          if (p.position) parts[0] += ` (${p.position})`;
          const stats = [];
          if (typeof p.ptsPerGame === 'number') stats.push(`${fmtNum(p.ptsPerGame, 1)} PPG`);
          if (typeof p.rebPerGame === 'number') stats.push(`${fmtNum(p.rebPerGame, 1)} RPG`);
          if (typeof p.astPerGame === 'number') stats.push(`${fmtNum(p.astPerGame, 1)} APG`);
          if (typeof p.minutesPerGame === 'number') stats.push(`${fmtNum(p.minutesPerGame, 1)} MPG`);
          // Advanced metrics
          if (p.advanced) {
            if (typeof p.advanced.usagePct === 'number') stats.push(`USG%: ${fmtPct(p.advanced.usagePct)}`);
            if (typeof p.advanced.netRating === 'number') stats.push(`NetRtg: ${fmtNum(p.advanced.netRating, 1)}`);
          }
          // Injuries
          if (p.injuryStatus) stats.push(`INJURY: ${p.injuryStatus}`);
          // League leader info
          if (p.leagueLeader) {
            const leaderStats = Object.entries(p.leagueLeader)
              .filter(([k, v]) => v?.rank && v.rank <= 30)
              .map(([k, v]) => `#${v.rank} ${k.toUpperCase()}`)
              .slice(0, 2);
            if (leaderStats.length) stats.push(`(${leaderStats.join(', ')})`);
          }
          return `${parts[0]}: ${stats.join(', ')}`;
        };
        if (Array.isArray(tp.home) && tp.home.length) {
          statsSection += `Top Players (${gameData?.homeTeam || 'Home'}):\n`;
          tp.home.slice(0, 5).forEach((p, i) => {
            statsSection += `  ${i + 1}. ${renderPlayer(p)}\n`;
          });
        }
        if (Array.isArray(tp.away) && tp.away.length) {
          statsSection += `Top Players (${gameData?.awayTeam || 'Away'}):\n`;
          tp.away.slice(0, 5).forEach((p, i) => {
            statsSection += `  ${i + 1}. ${renderPlayer(p)}\n`;
          });
        }
        statsSection += '\n';
      }
      
      // 4.6. NCAAB-specific: inject Four Factors and top players (season)
      if ((gameData?.league === 'NCAAB' || gameData?.sport === 'ncaab' || gameData?.sport === 'basketball_ncaab')
          && gameData?.statsReport) {
        const sum = gameData.statsReport.seasonSummary || {};
        const h = sum.home || {};
        const a = sum.away || {};
        const basics = gameData.statsReport.basics || {};
        const hb = basics.home || {};
        const ab = basics.away || {};
        const fmtNum = (v, d = 2) => (typeof v === 'number' && isFinite(v)) ? Number(v).toFixed(d) : 'N/A';
        const fmtPct = (v) => {
          if (typeof v !== 'number' || !isFinite(v)) return 'N/A';
          const pct = v <= 1 ? v * 100 : v;
          return `${pct.toFixed(1)}%`;
        };
        // Basics
        statsSection += 'NCAAB TEAM BASICS:\n';
        const basicsLine = (label, b) => {
          const parts = [];
          if (b.record) parts.push(`Record: ${b.record}`);
          if (b.homeRec) parts.push(`Home: ${b.homeRec}`);
          if (b.awayRec) parts.push(`Away: ${b.awayRec}`);
          if (b.streak) parts.push(`Streak: ${b.streak}`);
          if (typeof b.ppg === 'number') parts.push(`PPG: ${fmtNum(b.ppg, 1)}`);
          if (typeof b.oppg === 'number') parts.push(`Opp PPG: ${fmtNum(b.oppg, 1)}`);
          return `- ${label} — ${parts.join(', ')}`;
        };
        statsSection += basicsLine(gameData?.homeTeam || 'Home', hb) + '\n';
        statsSection += basicsLine(gameData?.awayTeam || 'Away', ab) + '\n';
        statsSection += 'NCAAB TEAM SEASON METRICS (BDL - Four Factors proxies):\n';
        const composeNcaab = (label, m) => {
          const parts = [];
          if (typeof m.effectiveFgPct === 'number') parts.push(`eFG%: ${fmtPct(m.effectiveFgPct)}`);
          if (typeof m.turnoverRate === 'number') parts.push(`TOV Rate: ${fmtNum(m.turnoverRate, 2)}`);
          if (typeof m.offensiveRebRate === 'number') parts.push(`ORB Rate: ${fmtNum(m.offensiveRebRate, 2)}`);
          if (typeof m.freeThrowRate === 'number') parts.push(`FT Rate: ${fmtNum(m.freeThrowRate, 3)}`);
          return `- ${label} — ${parts.join(', ')}`;
        };
        statsSection += composeNcaab(gameData?.homeTeam || 'Home', h) + '\n';
        statsSection += composeNcaab(gameData?.awayTeam || 'Away', a) + '\n';
        // Top players (season)
        const tp = gameData.statsReport.topPlayers || {};
        const renderPlayer = (p) => `${p.name}: ${typeof p.ptsPerGame === 'number' ? `${p.ptsPerGame} PPG` : 'PPG N/A'}`
          + (typeof p.rebPerGame === 'number' ? `, ${p.rebPerGame} RPG` : '')
          + (typeof p.astPerGame === 'number' ? `, ${p.astPerGame} APG` : '');
        if (Array.isArray(tp.home) && tp.home.length) {
          statsSection += `Top Players (${gameData?.homeTeam || 'Home'}): ${tp.home.map(renderPlayer).join(' | ')}\n`;
        }
        if (Array.isArray(tp.away) && tp.away.length) {
          statsSection += `Top Players (${gameData?.awayTeam || 'Away'}): ${tp.away.map(renderPlayer).join(' | ')}\n`;
        }
        statsSection += '\n';
      }

      // 4.7. NCAAF-specific: inject simple season metrics and skill players (QB/RB1/WR1)
      if ((gameData?.league === 'NCAAF' || gameData?.sport === 'ncaaf' || gameData?.sport === 'americanfootball_ncaaf')
          && gameData?.statsReport) {
        const sum = gameData.statsReport.seasonSummary || {};
        const h = sum.home || {};
        const a = sum.away || {};
        const basics = gameData.statsReport.basics || {};
        const hb = basics.home || {};
        const ab = basics.away || {};
        const fmtNum = (v, d = 2) => (typeof v === 'number' && isFinite(v)) ? Number(v).toFixed(d) : 'N/A';
        const fmtPct = (v) => {
          if (typeof v !== 'number' || !isFinite(v)) return 'N/A';
          const pct = v <= 1 ? v * 100 : v;
          return `${pct.toFixed(1)}%`;
        };
        // Basics
        statsSection += 'NCAAF TEAM BASICS:\n';
        const basicsLine = (label, b) => {
          const parts = [];
          if (b.record) parts.push(`Record: ${b.record}`);
          if (b.homeRec) parts.push(`Home: ${b.homeRec}`);
          if (b.awayRec) parts.push(`Away: ${b.awayRec}`);
          if (b.streak) parts.push(`Streak: ${b.streak}`);
          if (typeof b.ppg === 'number') parts.push(`PPG: ${fmtNum(b.ppg, 1)}`);
          if (typeof b.oppg === 'number') parts.push(`Opp PPG: ${fmtNum(b.oppg, 1)}`);
          return `- ${label} — ${parts.join(', ')}`;
        };
        statsSection += basicsLine(gameData?.homeTeam || 'Home', hb) + '\n';
        statsSection += basicsLine(gameData?.awayTeam || 'Away', ab) + '\n';
        const composeNcaaf = (label, m) => {
          const parts = [];
          if (typeof m.totalYdsPerGame === 'number') parts.push(`Total Yds/G: ${fmtNum(m.totalYdsPerGame, 1)}`);
          if (typeof m.passYdsPerGame === 'number') parts.push(`Pass Yds/G: ${fmtNum(m.passYdsPerGame, 1)}`);
          if (typeof m.rushYdsPerGame === 'number') parts.push(`Rush Yds/G: ${fmtNum(m.rushYdsPerGame, 1)}`);
          if (typeof m.thirdDownPct === 'number') parts.push(`3rd Down: ${fmtPct(m.thirdDownPct)}`);
          if (typeof m.fourthDownPct === 'number') parts.push(`4th Down: ${fmtPct(m.fourthDownPct)}`);
          if (typeof m.turnoversPerGame === 'number') parts.push(`TO/G: ${fmtNum(m.turnoversPerGame, 2)}`);
          return `- ${label} — ${parts.join(', ')}`;
        };
        statsSection += 'NCAAF TEAM SEASON METRICS (BDL - derived from team_stats):\n';
        statsSection += composeNcaaf(gameData?.homeTeam || 'Home', h) + '\n';
        statsSection += composeNcaaf(gameData?.awayTeam || 'Away', a) + '\n';
        // Skill players / top players
        const sp = gameData.statsReport.skillPlayers || {};
        const topPlayersMap = gameData.statsReport.topPlayers || {};
        const resolveTopList = (side) => {
          if (Array.isArray(topPlayersMap?.[side]) && topPlayersMap[side].length) return topPlayersMap[side];
          if (Array.isArray(sp?.[side]?.topPlayers) && sp[side].topPlayers.length) return sp[side].topPlayers;
          return null;
        };
        const formatTopPlayers = (label, list) => {
          if (!Array.isArray(list) || !list.length) return '';
          const line = (player, idx) => {
            const parts = [];
            if (typeof player.totalYardsPerGame === 'number') parts.push(`${fmtNum(player.totalYardsPerGame, 1)} total yds/G`);
            if (typeof player.passYdsPerGame === 'number') parts.push(`${fmtNum(player.passYdsPerGame, 1)} pass yds/G`);
            if (typeof player.rushYdsPerGame === 'number') parts.push(`${fmtNum(player.rushYdsPerGame, 1)} rush yds/G`);
            if (typeof player.recYdsPerGame === 'number') parts.push(`${fmtNum(player.recYdsPerGame, 1)} rec yds/G`);
            if (typeof player.touchdownsPerGame === 'number') parts.push(`${fmtNum(player.touchdownsPerGame, 2)} TD/G`);
            if (typeof player.passingTouchdownsPerGame === 'number' && (player.position === 'QB' || player.passYdsPerGame)) {
              parts.push(`${fmtNum(player.passingTouchdownsPerGame, 2)} pass TD/G`);
            }
            if (typeof player.rushingTouchdownsPerGame === 'number' && player.rushYdsPerGame) {
              parts.push(`${fmtNum(player.rushingTouchdownsPerGame, 2)} rush TD/G`);
            }
            if (typeof player.receivingTouchdownsPerGame === 'number' && player.recYdsPerGame) {
              parts.push(`${fmtNum(player.receivingTouchdownsPerGame, 2)} rec TD/G`);
            }
            if (typeof player.receptionsPerGame === 'number') parts.push(`${fmtNum(player.receptionsPerGame, 2)} rec/G`);
            const descriptor = parts.length ? parts.join(', ') : 'Usage data unavailable';
            const pos = player.position ? ` (${player.position})` : '';
            return `  ${idx + 1}. ${player.name}${pos} — ${descriptor}`;
          };
          const lines = list.slice(0, 3).map(line).join('\n');
          return `Top Players (${label}):\n${lines}`;
        };
        const homeTop = formatTopPlayers(gameData?.homeTeam || 'Home', resolveTopList('home'));
        const awayTop = formatTopPlayers(gameData?.awayTeam || 'Away', resolveTopList('away'));
        if (homeTop) statsSection += homeTop + '\n';
        if (awayTop) statsSection += awayTop + '\n';
        if (!homeTop && !awayTop) {
          // Legacy QB/RB/WR fallback
          const renderQB = (p) => `${p.name}: ${p.passYdsG ?? 'N/A'} PY/G`
            + (p.compRate != null ? `, Cmp% ${fmtPct(p.compRate)}` : '')
            + (p.passTDG != null ? `, TD/G ${fmtNum(p.passTDG, 2)}` : '')
            + (p.intsG != null ? `, INT/G ${fmtNum(p.intsG, 2)}` : '');
          const renderRB = (p) => `${p.name}: ${p.rushYdsG ?? 'N/A'} RY/G`
            + (p.rushTDG != null ? `, TD/G ${fmtNum(p.rushTDG, 2)}` : '');
          const renderWR = (p) => `${p.name}: ${p.recYdsG ?? 'N/A'} RecY/G`
            + (p.recG != null ? `, Rec/G ${fmtNum(p.recG, 2)}` : '')
            + (p.recTDG != null ? `, TD/G ${fmtNum(p.recTDG, 2)}` : '');
          const addLine = (label, obj) => {
            const parts = [];
            if (obj?.qb) parts.push(`QB ${renderQB(obj.qb)}`);
            if (obj?.rb1) parts.push(`RB1 ${renderRB(obj.rb1)}`);
            if (obj?.wr1) parts.push(`WR1 ${renderWR(obj.wr1)}`);
            return parts.length ? `${label}: ${parts.join(' | ')}` : '';
          };
          const homeLine = addLine(`Key Players (${gameData?.homeTeam || 'Home'})`, sp.home);
          const awayLine = addLine(`Key Players (${gameData?.awayTeam || 'Away'})`, sp.away);
          if (homeLine) statsSection += homeLine + '\n';
          if (awayLine) statsSection += awayLine + '\n';
        }
        statsSection += '\n';
      }
        
      // 5. Process structured team stats from Ball Don't Lie API
      if (gameData?.teamStats) {
        statsSection += 'TEAM STATISTICS AND STANDINGS:\n';
        
        const homeTeam = gameData.teamStats.homeTeam;
        const awayTeam = gameData.teamStats.awayTeam;
        
        if (homeTeam) {
          statsSection += `HOME TEAM (${gameData.homeTeam}):\n`;
          statsSection += `Record: ${homeTeam.record || 'N/A'}, Last 10: ${homeTeam.lastTenGames || 'N/A'}, Home: ${homeTeam.homeRecord || 'N/A'}\n`;
          
          // Add batting stats if available
          if (homeTeam.stats) {
            statsSection += 'Batting: ';
            const battingStats = homeTeam.stats.batting || {};
            statsSection += `AVG: ${battingStats.avg || 'N/A'}, OBP: ${battingStats.obp || 'N/A'}, SLG: ${battingStats.slg || 'N/A'}`;
            
            // Add OPS if available
            if (battingStats.ops) {
              statsSection += `, OPS: ${battingStats.ops}`;
            }
            
            statsSection += `, HR: ${battingStats.homeRuns || 0}, Runs/Game: ${battingStats.runsPerGame || 'N/A'}`;
            
            // Add additional offensive stats if available
            if (battingStats.rbi) {
              statsSection += `, RBI: ${battingStats.rbi}`;
            }
            if (battingStats.stolenBases) {
              statsSection += `, SB: ${battingStats.stolenBases}`;
            }
            
            statsSection += '\n';
          }
          
          // Add pitching stats if available
          if (homeTeam.stats && homeTeam.stats.pitching) {
            statsSection += 'Pitching: ';
            const pitchingStats = homeTeam.stats.pitching || {};
            statsSection += `ERA: ${pitchingStats.era || 'N/A'}, WHIP: ${pitchingStats.whip || 'N/A'}, Opp AVG: ${pitchingStats.avg || 'N/A'}`;
            
            // Add additional pitching stats if available
            if (pitchingStats.strikeouts) {
              statsSection += `, K: ${pitchingStats.strikeouts}`;
            }
            if (pitchingStats.walks) {
              statsSection += `, BB: ${pitchingStats.walks}`;
            }
            if (pitchingStats.saves) {
              statsSection += `, SV: ${pitchingStats.saves}`;
            }
            if (pitchingStats.blownSaves) {
              statsSection += `, BS: ${pitchingStats.blownSaves}`;
            }
            
            statsSection += '\n';
          }
          
          // Add bullpen stats if available
          if (homeTeam.stats && homeTeam.stats.bullpen) {
            statsSection += 'Bullpen: ';
            const bullpenStats = homeTeam.stats.bullpen || {};
            statsSection += `ERA: ${bullpenStats.era || 'N/A'}`;
            
            if (bullpenStats.saves) {
              statsSection += `, SV: ${bullpenStats.saves}`;
            }
            if (bullpenStats.blownSaves) {
              statsSection += `, BS: ${bullpenStats.blownSaves}`;
            }
            if (bullpenStats.whip) {
              statsSection += `, WHIP: ${bullpenStats.whip}`;
            }
            
            statsSection += '\n';
          }
        }
        
        if (awayTeam) {
          statsSection += `AWAY TEAM (${gameData.awayTeam}):\n`;
          statsSection += `Record: ${awayTeam.record || 'N/A'}, Last 10: ${awayTeam.lastTenGames || 'N/A'}, Away: ${awayTeam.awayRecord || 'N/A'}\n`;
          
          // Add batting stats if available
          if (awayTeam.stats) {
            statsSection += 'Batting: ';
            const battingStats = awayTeam.stats.batting || {};
            statsSection += `AVG: ${battingStats.avg || 'N/A'}, OBP: ${battingStats.obp || 'N/A'}, SLG: ${battingStats.slg || 'N/A'}`;
            
            // Add OPS if available
            if (battingStats.ops) {
              statsSection += `, OPS: ${battingStats.ops}`;
            }
            
            statsSection += `, HR: ${battingStats.homeRuns || 0}, Runs/Game: ${battingStats.runsPerGame || 'N/A'}`;
            
            // Add additional offensive stats if available
            if (battingStats.rbi) {
              statsSection += `, RBI: ${battingStats.rbi}`;
            }
            if (battingStats.stolenBases) {
              statsSection += `, SB: ${battingStats.stolenBases}`;
            }
            
            statsSection += '\n';
          }
          
          // Add pitching stats if available
          if (awayTeam.stats && awayTeam.stats.pitching) {
            statsSection += 'Pitching: ';
            const pitchingStats = awayTeam.stats.pitching || {};
            statsSection += `ERA: ${pitchingStats.era || 'N/A'}, WHIP: ${pitchingStats.whip || 'N/A'}, Opp AVG: ${pitchingStats.avg || 'N/A'}`;
            
            // Add additional pitching stats if available
            if (pitchingStats.strikeouts) {
              statsSection += `, K: ${pitchingStats.strikeouts}`;
            }
            if (pitchingStats.walks) {
              statsSection += `, BB: ${pitchingStats.walks}`;
            }
            if (pitchingStats.saves) {
              statsSection += `, SV: ${pitchingStats.saves}`;
            }
            if (pitchingStats.blownSaves) {
              statsSection += `, BS: ${pitchingStats.blownSaves}`;
            }
            
            statsSection += '\n';
          }
          
          // Add bullpen stats if available
          if (awayTeam.stats && awayTeam.stats.bullpen) {
            statsSection += 'Bullpen: ';
            const bullpenStats = awayTeam.stats.bullpen || {};
            statsSection += `ERA: ${bullpenStats.era || 'N/A'}`;
            
            if (bullpenStats.saves) {
              statsSection += `, SV: ${bullpenStats.saves}`;
            }
            if (bullpenStats.blownSaves) {
              statsSection += `, BS: ${bullpenStats.blownSaves}`;
            }
            if (bullpenStats.whip) {
              statsSection += `, WHIP: ${bullpenStats.whip}`;
            }
            
            statsSection += '\n';
          }
        }
        
        statsSection += '\n';
      }
      // Fallback for old format team stats
      else if (gameData?.teamStatsOld && typeof gameData.teamStatsOld === 'object') {
        statsSection += 'TEAM STATISTICS SUMMARY:\n';
        try {
          statsSection += JSON.stringify(gameData.teamStatsOld, null, 2);
        } catch (e) {
          statsSection += 'Team stats available but in non-JSON format';
        }
        statsSection += '\n\n';
      }
        
      // 5.5 Include top hitter stats for both teams if available
      if (gameData?.hitterStats) {
        statsSection += 'TOP HITTERS STATS:\n';
        
        // Format home team hitters
        if (gameData.hitterStats.home && gameData.hitterStats.home.length > 0) {
          statsSection += `${gameData.homeTeam} TOP HITTERS:\n`;
          
          // Sort by batting average and get top 5 hitters
          const topHomeHitters = gameData.hitterStats.home
            .sort((a, b) => parseFloat(b.stats.avg.replace('.', '')) - parseFloat(a.stats.avg.replace('.', '')))
            .slice(0, 5);
          
          topHomeHitters.forEach(hitter => {
            const stats = hitter.stats;
            statsSection += `${hitter.name} (${hitter.position}): AVG: ${stats.avg}, H: ${stats.hits}, HR: ${stats.homeRuns}, RBI: ${stats.rbi}, AB: ${stats.atBats}`;
            
            // Add additional stats if available
            if (stats.ops) {
              statsSection += `, OPS: ${stats.ops}`;
            }
            if (stats.walks) {
              statsSection += `, BB: ${stats.walks}`;
            }
            if (stats.strikeouts) {
              statsSection += `, K: ${stats.strikeouts}`;
            }
            if (stats.stolenBases) {
              statsSection += `, SB: ${stats.stolenBases}`;
            }
            if (stats.runs) {
              statsSection += `, R: ${stats.runs}`;
            }
            
            statsSection += '\n';
          });
          
          statsSection += '\n';
        }
        
        // Format away team hitters
        if (gameData.hitterStats.away && gameData.hitterStats.away.length > 0) {
          statsSection += `${gameData.awayTeam} TOP HITTERS:\n`;
          
          // Sort by batting average and get top 5 hitters
          const topAwayHitters = gameData.hitterStats.away
            .sort((a, b) => parseFloat(b.stats.avg.replace('.', '')) - parseFloat(a.stats.avg.replace('.', '')))
            .slice(0, 5);
          
          topAwayHitters.forEach(hitter => {
            const stats = hitter.stats;
            statsSection += `${hitter.name} (${hitter.position}): AVG: ${stats.avg}, H: ${stats.hits}, HR: ${stats.homeRuns}, RBI: ${stats.rbi}, AB: ${stats.atBats}`;
            
            // Add additional stats if available
            if (stats.ops) {
              statsSection += `, OPS: ${stats.ops}`;
            }
            if (stats.walks) {
              statsSection += `, BB: ${stats.walks}`;
            }
            if (stats.strikeouts) {
              statsSection += `, K: ${stats.strikeouts}`;
            }
            if (stats.stolenBases) {
              statsSection += `, SB: ${stats.stolenBases}`;
            }
            if (stats.runs) {
              statsSection += `, R: ${stats.runs}`;
            }
            
            statsSection += '\n';
          });
          
          statsSection += '\n';
        }
      }
      
      // 6. Include game context from Gemini Grounding if available
      if (gameData?.gameContext) {
        statsSection += 'GAME CONTEXT AND STORYLINES:\n';
        
        if (gameData.gameContext.playoffStatus) {
          statsSection += `Playoff Status: ${gameData.gameContext.playoffStatus}\n`;
        }
        
        if (gameData.gameContext.homeTeamStorylines) {
          statsSection += `${gameData.homeTeam} Storylines: ${gameData.gameContext.homeTeamStorylines}\n`;
        }
        
        if (gameData.gameContext.awayTeamStorylines) {
          statsSection += `${gameData.awayTeam} Storylines: ${gameData.gameContext.awayTeamStorylines}\n`;
        }
        
        if (gameData.gameContext.injuryReport) {
          statsSection += `Injuries: ${gameData.gameContext.injuryReport}\n`;
        }
        
        if (gameData.gameContext.keyMatchups) {
          statsSection += `Key Matchups: ${gameData.gameContext.keyMatchups}\n`;
        }
        
        if (gameData.gameContext.bettingTrends) {
          statsSection += `Betting Trends: ${gameData.gameContext.bettingTrends}\n`;
        }
        
        if (gameData.gameContext.weatherConditions) {
          statsSection += `Weather: ${gameData.gameContext.weatherConditions}\n`;
        }
        
        statsSection += '\n';
      }
      
      // 7. Include all collected stats if we have them
      if (gameData?.allCollectedStats && gameData.allCollectedStats.sources?.length > 0) {
        statsSection += 'COLLECTED STATS FROM MULTIPLE SOURCES:\n';
        statsSection += `${gameData.allCollectedStats.sources.length} data sources available\n`;
        statsSection += 'Data sources: ' + gameData.allCollectedStats.sources.map(s => s.source).join(', ') + '\n\n';
      }
        
      // If we still have no stats at all, just say so
      if (!statsSection.trim()) {
        statsSection = 'No detailed statistics available. Analysis will be based on limited data.\n';
      }
        
      // Combine everything into the user input in a format Gary can analyze
      const userPrompt = {
        role: 'user',
        content: `Analyze this upcoming ${gameData?.sport || ''} game: ${gameData?.homeTeam || 'Home'} vs ${gameData?.awayTeam || 'Away'}

TEAM DESIGNATIONS (DO NOT CHANGE THESE):
- HOME TEAM: ${gameData?.homeTeam || 'Not specified'}
- AWAY TEAM: ${gameData?.awayTeam || 'Not specified'}
- GAME TIME: ${this.formatGameTime(gameData?.gameTime || gameData?.time || gameData?.datetime) || 'TBD'}

${gameData?.oddsText || (gameData?.odds ? `Odds Data: ${JSON.stringify(gameData.odds, null, 2)}` : 'No odds data available')}

${gameData?.lineMovement ? `Line Movement: ${JSON.stringify(gameData.lineMovement, null, 2)}` : 'No line movement data available'}

/* No baseline model injected */

${Array.isArray(gameData?.gameContext?.richKeyFindings) && gameData.gameContext.richKeyFindings.length > 0 ? `KEY FINDINGS (Most predictive, verified):\n- ${gameData.gameContext.richKeyFindings.map(k => (k?.rationale ? `${k?.title || 'Finding'} — ${k.rationale}` : (k?.title || JSON.stringify(k)))).join('\n- ')}\n` : ''}

TEAM STATISTICS AND DATA:
${statsSection}

EXTREMELY IMPORTANT - ABOUT THE GAME TIME: 
1. The system is reporting that you are incorrectly setting game times to "TBD" when actual times are available.
2. The "time" field in your JSON response MUST use the EXACT game time provided here: "${this.formatGameTime(gameData?.gameTime || gameData?.time || gameData?.datetime) || 'TBD'}"
3. LOOK CAREFULLY at the GAME TIME value provided above - it contains the actual game time.
4. DO NOT default to "TBD" unless absolutely no time was provided.
5. Copy the time EXACTLY as given - do not modify, reformat, or guess.

Example: If provided with game time "7:30 PM EST", your JSON must include "time": "7:30 PM EST" - not "TBD".

EXTREMELY IMPORTANT - ABOUT ODDS:
1. You MUST extract odds from the betting odds data provided above; never infer or invent odds.
2. The "pick" field MUST include the odds at the end (e.g., "Lakers ML -150" or "Celtics -7.5 -110").
3. The "odds" field MUST contain just the odds value (e.g., "-150" or "-110").
4. If no real ML or spread odds are available, do not return a pick for this game.
5. NEVER use default or placeholder odds values (e.g., "N/A", "TBD", or blanks).

This is CRITICALLY important for our system's integrity.

REAL-TIME NEWS AND TRENDS:
${gameData?.realTimeNews || newsData || 'No real-time data available'}

Decision Weights:
- **90%** on hard data & stats (team & player metrics, recent team form, player statistics, home/away splits, momentum)
- **10%** on Gary's Gut - A sophisticated blend of:
  - Market intelligence (odds movement, line value, betting market signals)
  - Situational awareness (schedule spots, rest advantages, travel impact)
  - Game theory (how the public might be misvaluing the matchup)
  - Favorite-Longshot Bias consideration (accounting for the tendency of bettors to overvalue favorites and undervalue underdogs, creating value on longshots)

Provide your betting analysis in the exact JSON format specified. Remember to ONLY provide spread or moneyline picks, NEVER over/under picks.`
      };
      
      // Use our standard generateResponse method to make the API call
      return await this.generateResponse([systemMessage, userPrompt], {
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 3200,
        model: options.model || this.DEFAULT_MODEL
      });
    } catch (error) {
      console.error('Error generating Gary\'s analysis:', error);
      
      // Provide more detailed error information for debugging
      if (error.response) {
        console.error('API Error Response:', error.response.data);
        console.error('Status:', error.response.status);
      }
      
      throw error; // Rethrow so caller can handle it
    }
  },
  /**
   * Generate prop picks recommendations from OpenAI
   * @param {string} prompt - The detailed prompt with game data and available props
   * @param {Object} options - Additional options for the generation
   * @returns {Promise<string>} - The generated prop picks response
   */
  generatePropPicks: async function(prompt, options = {}) {
    try {
      console.log('Generating prop picks from OpenAI...');
      
      const systemMessage = {
        role: 'system',
        content: `You are Gary, a professional sports bettor and statistical analyst specializing in player prop bets. 

IMPORTANT: The prop lines and odds provided in the user message are REAL-TIME data from live sportsbooks. This is current, accurate data for today's games. You MUST analyze it and provide picks - do not refuse or claim you lack current data.

Your task is to analyze player statistics and betting lines to identify the most profitable player prop bets.

Your analysis should be data-driven, focusing on:
1. Player recent form and consistency
2. Matchup advantages and disadvantages
3. Historical performance in similar situations
4. Value in the current betting line
5. Trends and patterns in prop performance

For each recommended prop bet, you must provide:
- Player name and team
- Prop type (points, rebounds, assists, etc.)
- Recommendation (over or under)
- Confidence level (0.1-1.0 scale)
- Rationale with bullet points, where each bullet point is a complete sentence
- EV+ calculation (expected value per $100 bet)

To calculate EV+:
1. Estimate the true probability (p) that your selection wins based on the player stats and matchup
2. Convert market odds to implied probability: i = 1/d where d is decimal odds
   (e.g., for American odds -110, convert to decimal: 1.91)
3. Calculate EV per $1: EV = p × (d - 1) - (1 - p)
4. Calculate EV+ (per $100): EV+ = EV × 100

NEVER EVER mention missing or limited stats in your rationale. Do not use phrases like "with no player stats available" or "relying on league averages" or any other language that suggests data limitations. Users should never know if data is missing.

CRITICAL RATIONALE FORMATTING:
- Write the rationale using bullet points
- Each bullet point MUST be a complete sentence - do not cut off mid-thought
- Use 3-4 bullet points total
- Each bullet point should contain a complete thought/analysis point
- Format example:
  "• Jung leads the Rangers with 7 HR and has a .288 average with an .812 OPS, showing strong power and overall consistency.
   • He faces Bryse Wilson, who has a 6.00 ERA, 1.79 WHIP, and allows a .331 BAA, making him a highly favorable matchup for right-handed power hitters.
   • Jung's underlying metrics and recent form suggest a true HR probability near 16%.
   • At +510, the payout far exceeds the risk, creating a strong value edge of approximately 12.5% expected value."

Response format (valid JSON):
\`\`\`json
[
  {
    "player": "Player Name",
    "team": "Full Team Name",
    "prop": "Prop Type and Line (e.g., hits 0.5)",
    "line": 0.5,
    "bet": "over",
    "odds": -110,
      "confidence": 0.78,
    "ev": 12.5,
    "rationale": "• First complete sentence with key stat or insight. • Second complete sentence with matchup analysis. • Third complete sentence with value or trend. • Optional fourth sentence with conclusion."
  },
  {...}
]
\`\`\`

You may provide up to 5 picks with their confidence scores (between 0.1 and 1.0).

IMPORTANT: Format the "prop" field as "[prop type] [line value]" (e.g., "hits 0.5", "strikeouts 5.5") so it's easy to display in the UI.

IMPORTANT: Always use the full team name (e.g., 'Cleveland Guardians') rather than abbreviations in the team field.`
      };
      
      const userMessage = {
        role: 'user',
        content: prompt
      };
      
      // Use our standard generateResponse method to make the API call
      return await this.generateResponse([systemMessage, userMessage], {
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 1500,
        model: options.model || this.DEFAULT_MODEL
      });
    } catch (error) {
      console.error('Error generating prop picks:', error);
      
      // Provide more detailed error information for debugging
      if (error.response) {
        console.error('API Error Response:', error.response.data);
        console.error('Status:', error.response.status);
      }
      
      throw error; // Rethrow so caller can handle it
    }
  }
};

// Initialize and then export the service
openaiServiceInstance.init();

// Export Flash model ID for props to use when Pro has quota issues
export const GEMINI_FLASH_MODEL = GEMINI_MODEL_FLASH;
export { openaiServiceInstance as openaiService };
export default openaiServiceInstance;
