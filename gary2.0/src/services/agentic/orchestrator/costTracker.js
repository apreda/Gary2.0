// ═══════════════════════════════════════════════════════════════════════════
// COST TRACKER — Per-pipeline token usage and cost logging
// ═══════════════════════════════════════════════════════════════════════════
// Tracks input/output tokens per model across a pipeline run.
// Output tokens include thinking tokens (Gemini API bundles them together).
//
// Pricing (May 2026, Gemini Developer API):
//   Rates for the live model families (Gemini retired Aug 24 2026 —
//   its rows left the table with the vendor).
// ═══════════════════════════════════════════════════════════════════════════

const MODEL_RATES = {
  // Bake-off brains (verified Jul 6 2026 via web + the account's model list).
  // gpt-5.5 (Apr 2026): $5/$30, cached input $0.50.
  // Sonnet 5 at intro pricing (through 2026-08-31; list is $3/$15).
  'gpt-5.5':                  { input: 5.00, output: 30.00 },
  'gpt-5':                    { input: 1.25, output: 10.00 },
  'claude-sonnet-5':          { input: 2.00, output: 10.00 },
  // GPT-5.6 family (GA on our account Jul 22 2026). Sol = the game-pick brain.
  'gpt-5.6-sol':              { input: 5.00, output: 30.00 },
  // Anthropic API research tier (June engine restoration, Aug 18 2026).
  'anthropic-claude-haiku-4-5': { input: 1.00, output: 5.00 },
  'gpt-5.6-terra':            { input: 2.50, output: 15.00 },
  'gpt-5.6-luna':             { input: 1.00, output: 6.00 },
  // Subscription bridges: $0 marginal (Sep 1 2026 — unknown names used to
  // fall back to Haiku rates, so codex logged phantom dollars).
  'codex-gpt-5.6-sol':        { input: 0, output: 0 },
  'claude-opus-5':            { input: 0, output: 0 },
  'claude-fable-5':           { input: 0, output: 0 },
  // Metered Anthropic API cascade rungs (Sep 1 2026 cutover), list price.
  'anthropic-claude-opus-5':  { input: 15.00, output: 75.00 },
  'anthropic-claude-sonnet-5': { input: 3.00, output: 15.00 },
};

export function createCostTracker(pipelineLabel) {
  const buckets = {};   // keyed by model name
  let groundingCalls = 0;
  const startTime = Date.now();

  function ensureBucket(model) {
    if (!buckets[model]) {
      buckets[model] = { inputTokens: 0, outputTokens: 0, calls: 0 };
    }
  }

  return {
    /**
     * Record token usage from one API response.
     * @param {string} model - Model name (e.g. 'anthropic-claude-haiku-4-5')
     * @param {Object} usage - { prompt_tokens, completion_tokens }
     */
    addUsage(model, usage) {
      if (!model || !usage) return;
      ensureBucket(model);
      buckets[model].inputTokens += usage.prompt_tokens || 0;
      buckets[model].outputTokens += usage.completion_tokens || 0;
      buckets[model].calls += 1;
    },

    /** Record a grounding search call */
    addGroundingCall() {
      groundingCalls++;
    },

    /** Get current totals without logging */
    getTotals() {
      let totalCost = 0;
      const breakdown = [];

      for (const [model, b] of Object.entries(buckets)) {
        const rates = MODEL_RATES[model] || MODEL_RATES['anthropic-claude-haiku-4-5'];
        const inputCost = (b.inputTokens / 1_000_000) * rates.input;
        const outputCost = (b.outputTokens / 1_000_000) * rates.output;
        const modelCost = inputCost + outputCost;
        totalCost += modelCost;
        breakdown.push({
          model,
          inputTokens: b.inputTokens,
          outputTokens: b.outputTokens,
          calls: b.calls,
          inputCost,
          outputCost,
          modelCost
        });
      }

      // Grounding: $14/1K queries (ignore free tier — hard to track across runs)
      const groundingCost = (groundingCalls / 1000) * 14.00;
      totalCost += groundingCost;

      return { breakdown, groundingCalls, groundingCost, totalCost };
    },

    /** Log a cost summary to console */
    logSummary() {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const { breakdown, groundingCalls: gc, groundingCost, totalCost } = this.getTotals();

      console.log(`\n[Cost] ═══ ${pipelineLabel} ═══`);
      for (const b of breakdown) {
        // Print the real model, minus provider prefixes — the old 'Flash'/'Pro'
        // nicknames were Gemini-era labels on non-Gemini calls (Aug 24 2026).
        const shortModel = b.model.replace(/^(anthropic-|codex-)/, '');
        console.log(`[Cost]   ${shortModel}: ${b.calls} calls, ${(b.inputTokens / 1000).toFixed(1)}K in ($${b.inputCost.toFixed(2)}), ${(b.outputTokens / 1000).toFixed(1)}K out ($${b.outputCost.toFixed(2)}) = $${b.modelCost.toFixed(2)}`);
      }
      if (gc > 0) {
        console.log(`[Cost]   Grounding: ${gc} searches ($${groundingCost.toFixed(2)})`);
      }
      console.log(`[Cost]   TOTAL: $${totalCost.toFixed(2)} (${elapsed}s)`);
      console.log(`[Cost] ═══════════════════════════\n`);

      return totalCost;
    }
  };
}
