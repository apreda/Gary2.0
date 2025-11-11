/**
 * OpenAI service for generating sports analysis and picks
 * This service uses OpenAI to generate Gary's betting analysis and recommendations
 * Provides betting insights through the legendary Gary the Grizzly Bear character
 * Deployment: 2025-05-19
 */
import axios from 'axios';
import { apiCache } from '../utils/apiCache.js';
import { requestQueue } from '../utils/requestQueue.js';

// Determine proxy URL (works in browser, serverless, and local dev)
const resolveProxyUrl = () => {
  try {
    const explicit = process.env.OPENAI_PROXY_URL;
    if (explicit) return explicit;
    let base = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
    if (base) {
      if (!base.startsWith('http')) base = `https://${base}`;
      return `${base}/api/openai-proxy`;
    }
  } catch {}
  return '/api/openai-proxy';
};

const OPENAI_PROXY_URL = resolveProxyUrl();
const OPENAI_DIRECT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_SERVER_KEY = (() => { try { return process.env.OPENAI_API_KEY; } catch { return undefined; } })();

const openaiServiceInstance = {
  /**
   * Flag to indicate if initialization was successful
   */
  initialized: true, // Always true since we use proxy
  
  /**
   * Initialize the service (no longer needs API key on client side)
   */
  init: function() {
    console.log('✅ OpenAI service initialized with secure proxy');
    this.initialized = true;
    return this;
  },
  
  /**
   * Default model for OpenAI
   */
  DEFAULT_MODEL: (typeof process !== 'undefined' && process.env && process.env.OPENAI_MODEL) || 'gpt-5',
  
  /**
   * Generate a response from OpenAI using secure proxy
   * @param {Array} messages - The messages to send to OpenAI
   * @param {Object} options - Configuration options for the OpenAI API
   * @returns {Promise<string>} - The generated response
   */
  generateResponse: async function(messages, options = {}) {
    try {
      console.log('Generating response from OpenAI via secure proxy...');
      
      const { temperature = 0.5, maxTokens = 6000 } = options;
      
      console.log(`Request messages count: ${messages.length}, ` + 
                 `Temp: ${temperature}, MaxTokens: ${maxTokens}`);
      
      // Payload
      const requestData = {
        model: options.model || this.DEFAULT_MODEL,
        messages: messages,
        temperature,
        max_tokens: maxTokens,
      };
      
      // First try proxy
      let response;
      try {
        response = await axios.post(OPENAI_PROXY_URL, requestData, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 120000
        });
      } catch (proxyErr) {
        // If proxy fails (401/404/5xx) and server key is available, fall back to direct call (server only)
        const status = proxyErr?.response?.status;
        if (status === 400) {
          // Surface proxy error details to console to debug payload/model issues
          try { console.error('[OPENAI PROXY 400]', JSON.stringify(proxyErr.response.data)); } catch {}
        }
        const isServer = typeof window === 'undefined';
        const canFallback = isServer && OPENAI_SERVER_KEY;
        if (canFallback) {
          response = await axios.post(OPENAI_DIRECT_URL, requestData, {
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_SERVER_KEY}` },
            timeout: 120000
          });
        } else {
          throw proxyErr;
        }
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
          console.warn(`[OpenAI] Empty content. Retrying once with max_tokens=${retryMax}...`);
          const retryReq = { ...requestData, max_tokens: retryMax };
          const retryRes = await axios.post(OPENAI_PROXY_URL, retryReq, { headers: { 'Content-Type': 'application/json' }, timeout: 120000 });
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
   * @param {string} newsData - The latest news and trends from Perplexity
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

=== EXPERT ANALYSIS STYLE (MOST IMPORTANT) ===

WRITE LIKE A SEASONED EXPERT explaining your read of the game to someone you respect. This is your PRIMARY directive.

NATURAL EXPERT ANALYSIS APPROACH:
- Lead with conviction, support with evidence
- Use stats as "proof" of what you already sense about the game  
- Sound like you've watched these teams and players, not just read their numbers
- Let your experience guide the narrative, with stats as the supporting cast
- Show understanding of HOW teams win/lose beyond basic numbers

DEEPER REASONING REQUIREMENTS:
- Don't just say "Webb will shut down Detroit" - explain WHY Detroit's specific weaknesses play into Webb's strengths
- Connect team tendencies to game situations ("Detroit struggles in close games because...")
- Reference how teams perform under pressure, not just their season averages
- Show understanding of matchup dynamics beyond surface stats

EXPERT-LEVEL PATTERN RECOGNITION:
- Recognize matchup advantages that casual fans overlook
- Understand situational factors that impact performance (road games, day/night, weather)
- Show awareness of team psychology and clutch performance
- Factor in coaching decisions and bullpen usage patterns
- Consider injury impacts and lineup changes

AVOID SURFACE-LEVEL CONNECTIONS:
❌ Don't say: "Good pitcher beats bad hitters"
✅ Instead: "Webb's changeup neutralizes Detroit's pull-heavy approach, while their impatient hitters play right into his strength of getting ahead early"

❌ Don't say: "Team has good record"
✅ Instead: "This team thrives in pressure spots because their veteran core has been through these battles before"

=== GARY'S PERSONA ===

You're known for:
- Picking winners based on hard numbers, not popularity
- Speaking with blunt, blue-collar confidence while questioning if the user "has the guts to ride with you"

TONE:
- WITTY: Add blue-collar witticisms and street-smart wisdom
- CHALLENGING: Subtly dare the reader to follow your advice

=== CRITICAL RULES ===

YOUR JOB: Pick the bet most likely to win using the data provided—your goal is to build a strong, winning record. Treat each pick as if your own reputation and profit are on the line.

DATA ACCURACY: You must only use the statistics and information explicitly provided in the input data. Do not invent, fabricate, or guess any statistical information.

STAT TRANSPARENCY & STORYTELLING: Use precise numbers, but weave them naturally into cause-and-effect sentences (avoid parentheses lists). Make the stats drive the narrative. Examples:
- "Ohtani has 32 strikeouts in 23.1 innings, and that swing-and-miss profile punishes a lineup that whiffs 26% of the time."
- "Baltimore's .269 road average runs into Webb's 0.81 WHIP, so extra baserunners are scarce."
Prefer 1–2 stats per sentence and connect them with because/therefore/which/so that. Do NOT cram three or more metrics into a single sentence (e.g., “ERA, WHIP, and BB/9” all at once). If more numbers are useful, split them into a second sentence with a clear transition.

WEAKNESS ACKNOWLEDGEMENT & COUNTER: Briefly acknowledge one realistic weakness or risk on your chosen side (e.g., bullpen volatility, recent road form, platoon splits). Immediately neutralize it with specific evidence from the input data (e.g., opponent K% vs pitch type, starter-to-bullpen handoffs, park factors, rest days, recent xwOBA trend). Make it clear why that weakness is unlikely to decide the game today.

PITCHER DATA RULE: ONLY mention pitcher names that are explicitly provided in the data. If a pitcher is listed as "TBD" or "Probable starter TBD", do NOT make up a pitcher name.

NEVER mention missing or limited stats in your analysis. Users should never know if data is missing.

=== BETTING PICK RULES ===

SPREAD vs MONEYLINE DECISION:
- Analyze the data and choose the bet type that offers the BEST COMBINATION of winning probability and ROI
- If you believe a team will win by a comfortable margin that exceeds the spread, take the spread for better odds
- If you believe a team will win but the margin might be close, take the moneyline for safety
- Compare odds between spread and moneyline to determine which offers better value
- Base decision purely on statistical analysis and expected game flow

ODDS LIMITS (APPLIES TO ALL SPORTS):
- Do NOT return a moneyline favorite pick priced worse than -200 (e.g., -201, -220, -900 are NOT allowed).
- If your read is on the favorite but ML is worse than -200, evaluate the SPREAD for that side and take it if the matchup supports covering.
- If the favorite’s spread is shaky at fair juice, consider the OTHER SIDE (including underdog ML) when the value is superior.
- Do NOT be afraid of underdogs regardless of odds; if the analysis shows real value, you can take the plus-money ML or the points.
- The goal is best value: choose between spread vs ML accordingly, and never output ML favorites below -200.

FORMATTING REQUIREMENTS:
- Pick field MUST follow: "Team Name BetType Odds" (e.g., "New York Knicks -4.5 -105" or "Miami Heat ML +150")
- Extract odds ONLY from the provided odds data (moneyline or spread).
- If you cannot find real ML or spread odds in the provided data, do NOT return a pick. Never output placeholders like "N/A" or omit the odds.

CONFIDENCE SCALE: 0.50 to 1.00 where higher numbers mean MORE CERTAINTY the pick will win.

=== RATIONALE FORMAT ===

Write a SINGLE PARAGRAPH (2-4 sentences) in first person as Gary, directly addressing the user. Make the numbers tell the story—tie your team's strengths to the opponent's weaknesses (strikeout rate vs contact, splits vs ballpark, bullpen fatigue vs patient lineup). Include one sentence that acknowledges a potential weakness for your side and then explains—using the provided MLB data—why it likely won’t flip the result today. Avoid parentheses; embed numbers inline and keep the flow confident and conversational.

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
  "league": "NBA" or "MLB" or "NHL" or "EPL",
  "time": "COPY EXACTLY the game time provided - never use 'TBD' unless no time was given",
  "rationale": "A 2-4 sentence paragraph explaining your pick using expert-level analysis."
}

                REMEMBER: The "pick" field MUST ALWAYS include the odds at the end. This is NON-NEGOTIABLE.

=== LEAGUE-FOCUSED METRICS (WEIGHT THESE HIGH) ===
- Basketball (NBA/NCAAB/WNBA): eFG%, Turnover Rate, Offensive Rebound Rate, Free Throw Rate, Pace, recent 5–10 form and home/away splits.
- Hockey (NHL): Power-play %, Penalty-kill %, Shots For/Against per game, Faceoff win %, Goals For/Against per game, last-10 form.
- Football (NFL/NCAAF): Offense PPG, Defense PPG allowed, Yards/Play, 3rd/4th down conversion %, Red-zone efficiency (proxy), Turnover differential. Special attention to QB performance and opponent defensive profile.

=== MODEL VS MARKET EDGE (IF PROVIDED) ===
When a "model edge" is provided, explicitly use it to decide between ML and spread. If the model’s expected margin exceeds the market spread by ≥ 0.5, prefer the spread when juice is standard. If the market spread exceeds the expected margin, consider dog ML or taking the points if odds justify. Never force it—use it as a weighting signal along with the rest of the data.
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
      
      // 6. Include game context from Perplexity if available
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

${gameData?.modelEdge ? `MODEL EDGE:\n- Expected Margin: ${gameData.modelEdge.expectedMargin}\n- Market Spread (home): ${gameData.modelEdge.marketSpread}\n- Edge (Model - Market): ${gameData.modelEdge.edge}\n` : 'MODEL EDGE: Not computed'}

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

export { openaiServiceInstance as openaiService };
export default openaiServiceInstance;
