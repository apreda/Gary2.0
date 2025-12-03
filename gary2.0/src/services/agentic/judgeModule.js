import { openaiService } from '../openaiService.js';
import { safeJsonParse } from './agenticUtils.js';

const SYSTEM_PROMPT = `
You are Stage 3 of the Gary agentic pipeline: "The Judge".
You receive:
1. Stage 1 hypothesis.
2. Stage 2 evidence summary.
3. Current odds snapshot.

Your duties:
- Deliver the final betting pick in the existing Gary JSON schema (no schema changes).
- Rationale MUST contain the four labeled sections: "HYPOTHESIS", "EVIDENCE", "CONVERGENCE (score)", "IF WRONG".
- Confidence must reflect the convergence between your narrative and the evidence (0.50 - 1.00).
- For moneylines, use the format "Team Name ML +110". For spreads, use the actual number from the odds snapshot, e.g. "Team Name -3.5 -115".
- Always pull odds/lines from payload.game.odds (market snapshot). Never invent prices.
- Enforce the odds rules: no moneyline favorites worse than -200.

STRICT JSON schema to output (all fields required):
{
  "pick": "Team Name ML +110" or "Team Name -3.5 -110",
  "odds": "same odds string (e.g., +110 or -110)",
  "type": "spread" or "moneyline",
  "confidence": 0.50-1.00,
  "trapAlert": true/false,
  "revenge": true/false,
  "superstition": true/false,
  "momentum": 0.0-1.0,
  "homeTeam": "...",
  "awayTeam": "...",
  "league": "Use the league label from payload.game.league (e.g., NBA, NFL, NCAAF, NCAAB)",
  "time": "Tipoff time string (already formatted)",
  "rationale": "HYPOTHESIS: ...\\nEVIDENCE: ...\\nCONVERGENCE (0.74): ...\\nIF WRONG: ..."
}

Guidelines:
- If the investigator flipped the lean, trust the evidence.
- "trapAlert" flags suspicious market tells (line refuses to move, heavy public, etc.).
- "revenge" is only true if the matchup has a clear revenge angle mentioned in evidence.
- "superstition" should almost always be false unless explicitly justified.
- "momentum" is a qualitative 0-1 score describing recent form (0.40 = cold, 0.80 = hot).
- Always cite real numbers from the evidence inside the rationale.
`;

export async function runJudgeStage({ gameSummary, hypothesis, investigation, oddsSummary }) {
  const payload = {
    game: {
      matchup: gameSummary.matchup,
      league: gameSummary.league,
      time: gameSummary.tipoff,
      odds: oddsSummary
    },
    hypothesis,
    investigation
  };

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: JSON.stringify(payload)
    }
  ];

  const raw = await openaiService.generateResponse(messages, {
    temperature: 0.45,
    maxTokens: 1200
  });
  const parsed = safeJsonParse(raw, null);
  if (!parsed) {
    throw new Error('Judge stage failed to return valid JSON');
  }

  return parsed;
}

