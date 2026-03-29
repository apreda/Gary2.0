// ═══════════════════════════════════════════════════════════════════════════
// COST TRACKER — Per-pipeline token usage and cost logging
// ═══════════════════════════════════════════════════════════════════════════
// Tracks input/output tokens per model across a pipeline run.
// Output tokens include thinking tokens (Gemini API bundles them together).
//
// Pricing (March 2026, Gemini Developer API):
//   Pro 3.1:  $2.00/1M input, $12.00/1M output (incl. thinking)
//   Flash 3:  $0.50/1M input,  $3.00/1M output (incl. thinking)
//   Grounding: $14.00/1K queries (after 5K free/month)
// ═══════════════════════════════════════════════════════════════════════════

const MODEL_RATES = {
  'gemini-3.1-pro-preview': { input: 2.00, output: 12.00 },
  'gemini-3-flash-preview': { input: 0.50, output: 3.00 },
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
     * @param {string} model - Model name (e.g. 'gemini-3-flash-preview')
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
        const rates = MODEL_RATES[model] || MODEL_RATES['gemini-3-flash-preview'];
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
        const shortModel = b.model.includes('pro') ? 'Pro' : 'Flash';
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
