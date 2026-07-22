// Sol cutover guard tests (Jul 22 2026).
//
// Gary's game-pick brain is GPT-5.6 Sol via src/services/agentic/pickEngine.js
// (spec: docs/superpowers/specs/2026-07-22-sol-cutover-design.md). These tests
// pin the pieces the cutover depends on: model pricing, the founder-approved
// system prompt, the menu board (no totals), F-5 odds binding, and the
// production result contract.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const costSrc = readFileSync(path.join(__dirname, '../../../src/services/agentic/orchestrator/costTracker.js'), 'utf8');

describe('costTracker: GPT-5.6 family pricing', () => {
  it('prices Sol at $5/$30 and knows Terra + Luna', () => {
    expect(costSrc).toContain("'gpt-5.6-sol'");
    expect(costSrc).toMatch(/'gpt-5\.6-sol':\s*\{\s*input:\s*5\.00,\s*output:\s*30\.00/);
    expect(costSrc).toContain("'gpt-5.6-terra'");
    expect(costSrc).toContain("'gpt-5.6-luna'");
  });
});
