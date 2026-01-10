import { openaiService } from '../openaiService.js';
import { sanitizeTokenRequests, buildTokenDescriptionBullets } from './agenticTokens.js';
import { safeJsonParse } from './agenticUtils.js';
import { buildStyleGuideForSport } from './styleGuide.js';

// Generate token description bullets for the prompt
const TOKEN_DESCRIPTION_BULLETS = buildTokenDescriptionBullets();

const BASE_PROMPT = `
You are Stage 1 of the Gary agentic pipeline: "The Scout."

========================
CORE PHILOSOPHY (ALL SPORTS)
========================
1. Markets are mostly efficient. The line is roughly right; you're hunting for structural mismatches where the market may have missed something.
2. Process > random trends. Ignore trends without causality (e.g., "5-0 ATS on Tuesdays"). Focus on matchup mechanics.
3. Price sensitivity matters. Lakers -5 is not Lakers -7. Always consider the actual number on the board.
4. The "Why" test: every battleground needs a causally sound reason (pace edge, rest, matchup, etc.), not just raw past scores.

========================
NBA STYLE GUIDE (PILOT LEAGUE)
========================
Golden Rule: "Raw stats lie; efficiency tells the truth."
Token menu emphasis: [PACE], [EFFICIENCY], [FOUR_FACTORS], [REST_SITUATION], [PAINT_DEFENSE], [PERIMETER_DEFENSE], [INJURY_IMPACT], [MARKET_SNAPSHOT], [RECENT_FORM], [TOP_PLAYERS].
Sharp heuristics to consider as potential battlegrounds:
- Pace Clash: In fast-vs-slow matchups, tempo control becomes a key battleground.
- 3-Point Variance: If a team takes 40%+ of shots from deep but faces elite perimeter defense, this is a battleground.
- Schedule Losses: Back-to-back in altitude (Denver, Utah) creates fatigue battlegrounds for older rosters.
- Rebounding Edge: In spreads under 3, superior Offensive Rebound Rate often decides extra possessions.

========================
YOUR RESPONSIBILITIES (NEUTRAL SCOUTING ONLY)
========================
⚠️ CRITICAL: You are a NEUTRAL SCOUT. You do NOT pick a side. You do NOT form a lean.
Your ONLY job is to identify the KEY BATTLEGROUNDS that will decide this game.

1. Read the high-level matchup context ONLY.
2. Identify 3-5 BATTLEGROUNDS — specific conflict zones where this game will be decided.
   - Example: "Lions Offensive Line vs. Vikings Pass Rush"
   - Example: "Celtics 3PT volume vs. Cavaliers perimeter defense"
   - Example: "Goalie Matchup: Oettinger vs. Shesterkin"
3. For EACH battleground, request the tokens needed to evaluate BOTH SIDES fairly.
4. Surface X-FACTORS — wild cards that could swing the game either way (key injury, revenge game, travel fatigue).
5. DO NOT recommend a lean. DO NOT pick a side. You are gathering intel, not making a decision.

Approved tokens (no others allowed):
${TOKEN_DESCRIPTION_BULLETS}

========================
RESPONSE FORMAT (STRICT JSON)
========================
{
  "battlegrounds": [
    {
      "name": "Descriptive battleground name (e.g., 'Paint Dominance')",
      "description": "One sentence explaining why this matchup matters",
      "tokens_needed": ["token_id_1", "token_id_2"]
    }
  ],
  "x_factors": [
    "Short bullet on a situational wild card (injury watch, revenge spot, etc.)"
  ],
  "all_requested_tokens": ["token_id_1", "token_id_2", "..."]
}

Guidelines:
- Identify 3-5 battlegrounds. Each should be a specific unit vs. unit or situational clash.
- Request 8-14 tokens total — enough to evaluate BOTH sides of each battleground.
- X-factors are situational (travel, rest, motivation) and not statistical.
- DO NOT form a hypothesis about who will win. Stay neutral. The Judge (Stage 3) will decide.
`;

export async function runHypothesisStage({ gameSummary }) {
  const sportKey = gameSummary.sport || 'basketball_nba';
  const styleGuideSection = buildStyleGuideForSport(sportKey);
  const tokenBullets = buildTokenDescriptionBullets(sportKey);
  const systemPrompt = `${BASE_PROMPT}\nApproved token menu:\n${tokenBullets}\n\n${styleGuideSection}`;
  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: JSON.stringify({
        matchup: gameSummary.matchup,
        league: gameSummary.league,
        tipoff: gameSummary.tipoff,
        odds: gameSummary.odds,
        records: gameSummary.records,
        location: gameSummary.location,
        narrative: gameSummary.narrative
      })
    }
  ];

  const raw = await openaiService.generateResponse(messages, {
    temperature: 0.4,
    maxTokens: 8000
  });
  const parsed = safeJsonParse(raw, null);
  if (!parsed) {
    throw new Error('Hypothesis stage failed to return valid JSON');
  }

  // NEW: Parse battlegrounds format (neutral scouting)
  // For backwards compatibility, also handle old format with hypothesis/preliminary_lean
  let sanitized;
  
  if (parsed.battlegrounds && Array.isArray(parsed.battlegrounds)) {
    // NEW FORMAT: Neutral battlegrounds
    const allTokens = new Set();
    const battlegrounds = parsed.battlegrounds.slice(0, 5).map(bg => {
      const tokens = Array.isArray(bg.tokens_needed) ? bg.tokens_needed : [];
      tokens.forEach(t => allTokens.add(t));
      return {
        name: bg.name || 'Unnamed Battleground',
        description: bg.description || '',
        tokens_needed: tokens
      };
    });
    
    // Combine all tokens from battlegrounds + any explicitly requested
    const explicitTokens = Array.isArray(parsed.all_requested_tokens) ? parsed.all_requested_tokens : [];
    explicitTokens.forEach(t => allTokens.add(t));
    
    sanitized = {
      // NEW: Battlegrounds replace hypothesis
      battlegrounds,
      x_factors: Array.isArray(parsed.x_factors) ? parsed.x_factors.slice(0, 5) : [],
      requested_tokens: sanitizeTokenRequests([...allTokens], sportKey, 16),
      // REMOVED: No preliminary_lean — Scout stays neutral
      preliminary_lean: null,
      // Legacy fields (empty for new format)
      hypothesis: `Battlegrounds: ${battlegrounds.map(b => b.name).join(', ')}`,
      concerns: Array.isArray(parsed.x_factors) ? parsed.x_factors.slice(0, 3) : []
    };
    
    console.log(`[Hypothesis] ✓ Neutral scouting complete: ${battlegrounds.length} battlegrounds, ${sanitized.requested_tokens.length} tokens`);
  } else {
    // LEGACY FORMAT: For backwards compatibility with old hypothesis format
    sanitized = {
      hypothesis: parsed.hypothesis || '',
      requested_tokens: sanitizeTokenRequests(parsed.requested_tokens, sportKey, 16),
      preliminary_lean: parsed.preliminary_lean || null,
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns.slice(0, 3) : [],
      battlegrounds: [],
      x_factors: []
    };
    console.log(`[Hypothesis] ⚠️ Legacy format detected — consider updating prompts`);
  }

  return sanitized;
}

