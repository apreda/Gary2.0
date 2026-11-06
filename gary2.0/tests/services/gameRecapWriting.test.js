import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ text: '', prompt: '' }));
vi.mock('../../src/loadEnv.js', () => ({}));
vi.mock('../../src/services/gary/agentic/orchestrator/subscriptionSearch.js', () => ({ subscriptionSearch: async (prompt) => { state.prompt = prompt; return { success: Boolean(state.text), data: state.text }; } }));
const { generateRecap } = await import('../../src/services/content/gameRecap.js');
const pick = { pick: 'Athletics ML -120', awayTeam: 'Athletics', homeTeam: 'Royals', league: 'MLB' };
const evidence = 'FINAL SCORE: Athletics (away) 7 — Royals (home) 6\nAthletics scored seven runs.';
beforeEach(() => { state.text = ''; state.prompt = ''; });

describe('recap dashes', () => {
  it('ships a recap written with a dash, with the dash swapped out', async () => {
    state.text = JSON.stringify({ headline: 'Athletics hold off the Royals', recap: 'The Athletics scored seven — and held on.', bullets: [] });
    const out = await generateRecap({ pick, result: 'won', evidence });
    expect(state.prompt).not.toContain('No dashes');
    expect(out?.recap).toBe('The Athletics scored seven, and held on.');
  });
});
