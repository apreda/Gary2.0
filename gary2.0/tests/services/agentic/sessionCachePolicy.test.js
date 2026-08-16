import { describe, expect, it } from 'vitest';

import { GEMINI_CACHE_TTL_SECONDS } from '../../../src/services/agentic/orchestrator/sessionManager.js';

describe('Gemini session cache lifetime', () => {
  it('outlives the 45-minute scheduler child with a 15-minute safety margin', () => {
    const schedulerChildRuntimeSeconds = 45 * 60;
    const requiredSafetyMarginSeconds = 15 * 60;

    expect(GEMINI_CACHE_TTL_SECONDS).toBeGreaterThanOrEqual(
      schedulerChildRuntimeSeconds + requiredSafetyMarginSeconds
    );
  });
});
