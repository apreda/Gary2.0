// ═══════════════════════════════════════════════════════════════════════════
// COST TRACKER — Per-pipeline token usage and cost logging
// ═══════════════════════════════════════════════════════════════════════════
// Tracks adapter-reported input/output and cached input per pipeline run.
// Subscription calls have no marginal API charge. Known API rates below are
// estimates; unmetered search and unknown models must not invent a total bill.
// ═══════════════════════════════════════════════════════════════════════════

const MODEL_RATES = {
  // Bake-off brains (verified Jul 6 2026 via web + the account's model list).
  // gpt-5.5 (Apr 2026): $5/$30, cached input $0.50.
  // Sonnet 5 at intro pricing (through 2026-08-31; list is $3/$15).
  'gpt-5.5':                  { input: 5.00, output: 30.00 },
  'gpt-5':                    { input: 1.25, output: 10.00 },
  // 'claude-sonnet-5' is the subscription bridge (claude-*), $0 marginal —
  // the metered API rung is 'anthropic-claude-sonnet-5' below (Sep 9 2026).
  'claude-sonnet-5':          { input: 0, output: 0 },
  'claude-fable-5-1':         { input: 0, output: 0 },
  // GPT-5.6 family (GA on our account Jul 22 2026).
  'gpt-5.6-sol':              { input: 5.00, output: 30.00 },
  // Anthropic API research tier (June engine restoration, Aug 18 2026).
  'anthropic-claude-haiku-4-5': { input: 1.00, output: 5.00 },
  'gpt-5.6-terra':            { input: 2.50, output: 15.00 },
  'gpt-5.6-luna':             { input: 1.00, output: 6.00 },
  // Subscription bridges: $0 marginal (Sep 1 2026 — unknown names used to
  // fall back to Haiku rates, so codex logged phantom dollars).
  'codex-gpt-5.6-sol':        { input: 0, output: 0 },
  'codex-gpt-5.6-luna':       { input: 0, output: 0 },
  'codex-gpt-5.6-terra':      { input: 0, output: 0 },
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
      buckets[model] = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, calls: 0 };
    }
  }

  return {
    /**
     * Record token usage from one API response.
     * @param {string} model - Model name (e.g. 'anthropic-claude-haiku-4-5')
     * @param {Object} usage - { prompt_tokens, completion_tokens, cached_tokens }
     */
    addUsage(model, usage) {
      if (!model || !usage) return;
      ensureBucket(model);
      const count = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
      const input = count(usage.prompt_tokens);
      buckets[model].inputTokens += input;
      buckets[model].outputTokens += count(usage.completion_tokens);
      // OpenAI-style: cached_tokens is a SUBSET of prompt_tokens. Anthropic-style
      // (Sep 11 2026): cache_read_tokens / cache_write_tokens are ADDITIONAL to
      // prompt_tokens (which is the uncached input alone) — reads bill at 10%
      // of the input rate, writes at 125%.
      buckets[model].cachedInputTokens += Math.min(input, count(usage.cached_tokens));
      buckets[model].cacheReadTokens += count(usage.cache_read_tokens);
      buckets[model].cacheWriteTokens += count(usage.cache_write_tokens);
      buckets[model].calls += 1;
    },

    /** Record a grounding search call */
    addGroundingCall() {
      groundingCalls++;
    },

    /** Get current totals without logging */
    getTotals() {
      let totalCost = 0;
      let unpricedModelCalls = 0;
      const breakdown = [];

      for (const [model, b] of Object.entries(buckets)) {
        // Every codex-* model uses the same subscription bridge, including
        // newly introduced models. Never invent a Haiku API bill for Astra.
        const rates = model.startsWith('codex-') ? { input: 0, output: 0 } : MODEL_RATES[model];
        const inputCost = rates ? ((b.inputTokens / 1_000_000) * rates.input) + ((b.cacheReadTokens / 1_000_000) * rates.input * 0.10) + ((b.cacheWriteTokens / 1_000_000) * rates.input * 1.25) : null;
        const outputCost = rates ? (b.outputTokens / 1_000_000) * rates.output : null;
        const modelCost = rates ? inputCost + outputCost : null;
        if (modelCost == null) unpricedModelCalls += b.calls;
        else totalCost += modelCost;
        breakdown.push({
          model,
          inputTokens: b.inputTokens,
          outputTokens: b.outputTokens,
          cachedInputTokens: b.cachedInputTokens,
          cacheReadTokens: b.cacheReadTokens,
          cacheWriteTokens: b.cacheWriteTokens,
          uncachedInputTokens: b.inputTokens - b.cachedInputTokens,
          calls: b.calls,
          inputCost,
          outputCost,
          modelCost
        });
      }

      // The grounding facade can use subscription search or a metered
      // fallback. A logical query count cannot establish either vendor's bill.
      const groundingCost = groundingCalls ? null : 0;
      return { breakdown, groundingCalls, groundingCost, knownModelCost: totalCost,
        unpricedModelCalls, totalCost: groundingCalls || unpricedModelCalls ? null : totalCost };
    },

    /** Log a cost summary to console */
    logSummary() {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const { breakdown, groundingCalls: gc, knownModelCost, unpricedModelCalls, totalCost } = this.getTotals();

      console.log(`\n[Cost] ═══ ${pipelineLabel} ═══`);
      for (const b of breakdown) {
        // Print the real model, minus provider prefixes — the old 'Flash'/'Pro'
        // nicknames were Gemini-era labels on non-Gemini calls (Aug 24 2026).
        const shortModel = b.model.replace(/^(anthropic-|codex-)/, '');
        const cost = b.modelCost == null ? 'unpriced' : `$${b.modelCost.toFixed(2)} model estimate`;
                const cacheNote = (b.cacheReadTokens || b.cacheWriteTokens) ? ` + ${(b.cacheReadTokens / 1000).toFixed(1)}K cache-read + ${(b.cacheWriteTokens / 1000).toFixed(1)}K cache-write` : '';
        console.log(`[Cost]   ${shortModel}: ${b.calls} calls, ${(b.inputTokens / 1000).toFixed(1)}K in (${(b.cachedInputTokens / 1000).toFixed(1)}K cached, ${(b.uncachedInputTokens / 1000).toFixed(1)}K uncached)${cacheNote}, ${(b.outputTokens / 1000).toFixed(1)}K out = ${cost}`);
      }
      if (gc > 0) {
        console.log(`[Cost]   Grounding: ${gc} logical queries; provider costs not recorded here`);
      }
      console.log(`[Cost]   TRACKED MODEL ESTIMATE: $${knownModelCost.toFixed(2)} (${elapsed}s)${totalCost == null ? `; total unavailable (${unpricedModelCalls} unpriced model calls, ${gc} grounding queries)` : ''}`);
      console.log(`[Cost] ═══════════════════════════\n`);

      return totalCost;
    }
  };
}
