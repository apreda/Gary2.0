import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ text: '', prompt: '' }));
vi.mock('../../src/loadEnv.js', () => ({}));
vi.mock('../../src/services/insights/solText.js', () => ({ generateSolText: async (prompt) => { state.prompt = prompt; return state.text; } }));
const { generateRecap } = await import('../../src/services/gameRecap.js');
const pick = { pick: 'Athletics ML -120', awayTeam: 'Athletics', homeTeam: 'Royals', league: 'MLB' };
const evidence = 'FINAL SCORE: Athletics (away) 7 — Royals (home) 6\nAthletics scored seven runs.';
beforeEach(() => { state.text = ''; state.prompt = ''; });

describe('recap writing rules (Adam, Sep 21 2026)', () => {
  it('carries the rules in the ask and keeps a clean recap', async () => {
    state.text = JSON.stringify({ headline: 'Athletics hold off the Royals', recap: 'The Athletics scored seven and held on. Gary had the moneyline at -120 and it cashed.', bullets: [] });
    const out = await generateRecap({ pick, result: 'won', evidence });
    expect(state.prompt).toContain('No dashes as punctuation');
    expect(out?.recap).toContain('held on');
  });
  it('does not ship a recap written with a dash', async () => {
    state.text = JSON.stringify({ headline: 'Athletics hold off the Royals', recap: 'The Athletics scored seven — and held on. Gary had the moneyline and it cashed.', bullets: [] });
    expect(await generateRecap({ pick, result: {}, evidence })).toBeNull();
  });
});
