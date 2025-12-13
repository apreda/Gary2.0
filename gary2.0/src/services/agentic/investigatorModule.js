import { openaiService } from '../openaiService.js';
import { safeJsonParse } from './agenticUtils.js';
import { sanitizeTokenRequests } from './agenticTokens.js';

const SYSTEM_PROMPT = `
You are Stage 2 of the Gary agentic pipeline: "The Investigator".
Inputs:
- Stage 1 hypothesis with requested info tokens.
- A JSON payload containing only the stats for the requested tokens.

Tasks:
1. Evaluate each hypothesis claim using the provided stats.
2. Produce 6-12 evidence bullets that cite concrete numbers and note whether they support or challenge the lean.
3. Adjust (or flip) the lean if the numbers contradict the hypothesis.
4. Return an updated confidence score (0.50 - 0.90). Higher scores mean the evidence strongly supports the lean.
5. If a requested token was marked unfulfilled, mention it in "gaps" so we know data was missing.

Strict JSON response schema:
{
  "lean": {
    "side": "home" or "away",
    "bet_type": "spread" or "moneyline"
  },
  "confidence": 0.50-0.90,
  "evidence": [
    {
      "stat": "Short title",
      "impact": "supports" or "contradicts",
      "detail": "One sentence with the number and why it matters."
    }
  ],
  "gaps": ["token_id missing", "..."]
}
`;

export async function runInvestigatorStage({ gameSummary, hypothesis, tokenPayload }) {
  const cleanTokens = sanitizeTokenRequests(hypothesis.requested_tokens, gameSummary.sport, 16);
  const payload = {
    game: {
      matchup: gameSummary.matchup,
      league: gameSummary.league,
      odds: gameSummary.odds
    },
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
    maxTokens: 1100
  });
  const parsed = safeJsonParse(raw, null);
  if (!parsed) {
    throw new Error('Investigator stage failed to return valid JSON');
  }

  const normalizedEvidence = Array.isArray(parsed.evidence)
    ? parsed.evidence.slice(0, 12).map((row) => ({
        stat: row?.stat || 'Unnamed Stat',
        impact: row?.impact === 'contradicts' ? 'contradicts' : 'supports',
        detail: row?.detail || ''
      }))
    : [];

  return {
    lean: parsed.lean || hypothesis.preliminary_lean || null,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.6,
    evidence: normalizedEvidence,
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 3) : []
  };
}

