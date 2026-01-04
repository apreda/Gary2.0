import { openaiService } from '../openaiService.js';
import { safeJsonParse } from './agenticUtils.js';
import { sanitizeTokenRequests } from './agenticTokens.js';

const SYSTEM_PROMPT = `
You are Stage 2 of the Gary agentic pipeline: "The Investigator".

========================
INPUTS
========================
- Stage 1 BATTLEGROUNDS (neutral conflict zones identified by the Scout)
- A JSON payload containing stats for the requested tokens

========================
YOUR MISSION
========================
You are a neutral analyst evaluating evidence. You will:
1. Review each battleground and evaluate the stats for BOTH sides.
2. For each piece of evidence, assign an ORGANIC SIGNIFICANCE SCORE (0.0-1.0) and a CUSTOM IMPACT LABEL.
3. The significance score reflects how much this evidence should influence the final decision.
4. The impact label is YOUR natural-language assessment (e.g., "Massive Red Flag", "Slight Edge", "Decisive Mismatch").

========================
SIGNIFICANCE SCORING (ORGANIC & QUALITATIVE)
========================
You assign a SIGNIFICANCE SCORE (0.0-1.0) to every piece of evidence. This is your professional assessment of how much "gravity" a specific fact has in the context of this specific game.

- **0.80-1.00 (High Gravity)**: Game-changing factors. These are the "decisive blows."
- **0.40-0.79 (Medium Gravity)**: Meaningful advantages or situational edges.
- **0.00-0.39 (Low Gravity)**: Statistical noise, marginal edges, or factors that are likely already "priced in."

You have full agency to decide what is "High Gravity" for this specific matchup. A stat that is "Minor" in one game might be "Game-Changing" in another due to the situational context.

========================
TASKS
========================
1. Evaluate each battleground using the provided stats.
2. For each piece of evidence:
   - Cite the SPECIFIC NUMBER(S)
   - State which side it FAVORS (home/away/neutral)
   - Assign a SIGNIFICANCE SCORE (0.0-1.0) based on its "gravity" in this specific matchup
   - Write YOUR OWN IMPACT LABEL (e.g., "Massive Red Flag", "Tactical Edge", "Statistical Noise")
   - Explain WHY you gave it that significance level
3. Note any data gaps where stats were missing or null.
4. DO NOT form a final lean yet — Stage 3 (The Judge) will decide based on your intelligence.

========================
STRICT JSON RESPONSE SCHEMA
========================
{
  "battleground_analysis": [
    {
      "battleground": "Name of the battleground from Stage 1",
      "evidence": [
        {
          "stat": "Short title (e.g., 'Corsi For %')",
          "favors": "home" or "away" or "neutral",
          "significance": 0.00-1.00,
          "impact_label": "Your custom label (e.g., 'Massive Red Flag', 'Slight Edge')",
          "detail": "One sentence with the number and WHY it matters at this significance level."
        }
      ]
    }
  ],
  "x_factor_assessment": [
    {
      "factor": "X-factor from Stage 1",
      "significance": 0.00-1.00,
      "impact_label": "Your custom label",
      "favors": "home" or "away" or "neutral",
      "detail": "Assessment of this situational factor"
    }
  ],
  "gaps": ["token_id missing", "..."],
  "total_weighted_home": 0.00,
  "total_weighted_away": 0.00,
  "summary": "One paragraph summarizing the evidence landscape without picking a side."
}

========================
CRITICAL RULES
========================
- Be HONEST with significance scores. Don't inflate minor advantages.
- A missing superstar (significance 0.95) should outweigh five minor stats (0.3 each).
- If data is missing (null/N/A), note it in gaps and DO NOT fabricate numbers.
- Stay neutral. The Judge (Stage 3) will make the final call.
`;

export async function runInvestigatorStage({ gameSummary, hypothesis, tokenPayload }) {
  const cleanTokens = sanitizeTokenRequests(hypothesis.requested_tokens, gameSummary.sport, 16);
  
  // NEW: Include battlegrounds in the payload for structured analysis
  const payload = {
    game: {
      matchup: gameSummary.matchup,
      league: gameSummary.league,
      odds: gameSummary.odds
    },
    // Include battlegrounds if available (new format), otherwise use hypothesis
    battlegrounds: hypothesis.battlegrounds || [],
    x_factors: hypothesis.x_factors || hypothesis.concerns || [],
    hypothesis: hypothesis.hypothesis,
    requested_tokens: cleanTokens,
    data: tokenPayload
  };

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: JSON.stringify(payload)
    }
  ];

  const raw = await openaiService.generateResponse(messages, {
    temperature: 0.35,
    maxTokens: 12000  // Increased for more detailed evidence
  });
  const parsed = safeJsonParse(raw, null);
  if (!parsed) {
    throw new Error('Investigator stage failed to return valid JSON');
  }

  // NEW: Parse weighted evidence format with organic significance scores
  let normalizedEvidence = [];
  let totalWeightedHome = 0;
  let totalWeightedAway = 0;
  
  if (parsed.battleground_analysis && Array.isArray(parsed.battleground_analysis)) {
    // NEW FORMAT: Weighted battleground analysis
    for (const bg of parsed.battleground_analysis) {
      if (!bg.evidence || !Array.isArray(bg.evidence)) continue;
      
      for (const ev of bg.evidence) {
        const significance = typeof ev.significance === 'number' ? ev.significance : 0.5;
        const favors = ev.favors || 'neutral';
        
        // Accumulate weighted scores
        if (favors === 'home') {
          totalWeightedHome += significance;
        } else if (favors === 'away') {
          totalWeightedAway += significance;
        }
        
        normalizedEvidence.push({
          stat: ev.stat || 'Unnamed Stat',
          battleground: bg.battleground || 'General',
          favors,
          significance,
          impact_label: ev.impact_label || (favors === 'neutral' ? 'Neutral' : 'Edge'),
          detail: ev.detail || '',
          // Legacy field for backwards compatibility
          impact: favors === 'neutral' ? 'neutral' : (favors === 'home' ? 'supports_home' : 'supports_away')
        });
      }
    }
    
    // Also process x_factor assessments
    if (parsed.x_factor_assessment && Array.isArray(parsed.x_factor_assessment)) {
      for (const xf of parsed.x_factor_assessment) {
        const significance = typeof xf.significance === 'number' ? xf.significance : 0.3;
        const favors = xf.favors || 'neutral';
        
        if (favors === 'home') {
          totalWeightedHome += significance;
        } else if (favors === 'away') {
          totalWeightedAway += significance;
        }
        
        normalizedEvidence.push({
          stat: xf.factor || 'X-Factor',
          battleground: 'X-Factor',
          favors,
          significance,
          impact_label: xf.impact_label || 'Situational',
          detail: xf.detail || '',
          impact: favors === 'neutral' ? 'neutral' : (favors === 'home' ? 'supports_home' : 'supports_away')
        });
      }
    }
    
    console.log(`[Investigator] ✓ Weighted analysis: Home=${totalWeightedHome.toFixed(2)}, Away=${totalWeightedAway.toFixed(2)}`);
  } else if (parsed.evidence && Array.isArray(parsed.evidence)) {
    // LEGACY FORMAT: Simple evidence list
    normalizedEvidence = parsed.evidence.slice(0, 12).map((row) => ({
      stat: row?.stat || 'Unnamed Stat',
      battleground: 'General',
      favors: row?.favors || (row?.impact === 'contradicts' ? 'away' : 'home'),
      significance: row?.significance || 0.5,
      impact_label: row?.impact_label || (row?.impact === 'contradicts' ? 'Contradicts' : 'Supports'),
      detail: row?.detail || '',
      impact: row?.impact === 'contradicts' ? 'contradicts' : 'supports'
    }));
    console.log(`[Investigator] ⚠️ Legacy evidence format detected`);
  }

  // Use parsed totals if available, otherwise use calculated
  const finalWeightedHome = parsed.total_weighted_home ?? totalWeightedHome;
  const finalWeightedAway = parsed.total_weighted_away ?? totalWeightedAway;

  return {
    // NEW: No lean from Investigator — Judge decides
    lean: null,
    // NEW: Confidence is now derived from weighted totals (will be finalized by Judge)
    confidence: null,
    // NEW: Rich evidence with significance scores
    evidence: normalizedEvidence,
    // NEW: Weighted totals for the Judge to use
    weighted_totals: {
      home: finalWeightedHome,
      away: finalWeightedAway,
      differential: finalWeightedHome - finalWeightedAway
    },
    // Summary for the Judge
    summary: parsed.summary || null,
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 5) : [],
    // Pass through battlegrounds for reference
    battlegrounds_analyzed: hypothesis.battlegrounds || []
  };
}

