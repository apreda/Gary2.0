/**
 * Sol text adapter for the insights pipeline (Jul 27 2026, Sol-only mandate):
 * the drop-in replacement for geminiService.generateResponse in the hub/fantasy
 * computers. One prompt in, prose/JSON text out, no tools, low reasoning —
 * these are content passes, not picks.
 */
import { GAME_PICK_MODEL } from '../agentic/orchestrator/orchestratorConfig.js';

const TIMEOUT_MS = 120000;

export async function generateSolText(prompt, { maxTokens = 4000, effort = 'low' } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GAME_PICK_MODEL,
        input: prompt,
        reasoning: { effort },
        max_output_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 160)}`);
    }
    const data = await res.json();
    return (Array.isArray(data.output) ? data.output : [])
      .filter((o) => o.type === 'message')
      .flatMap((o) => (o.content || []).map((c) => c.text).filter(Boolean))
      .join('');
  } finally {
    clearTimeout(timer);
  }
}

export default { generateSolText };
