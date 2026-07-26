import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/pickdesk/mlbDesk.js', () => ({ buildMlbDesk: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/openaiSession.js', () => ({
  createOpenAISession: vi.fn(),
  sendToOpenAISession: vi.fn(),
}));

import { buildMlbDesk } from '../../../src/services/pickdesk/mlbDesk.js';
import { createOpenAISession, sendToOpenAISession } from '../../../src/services/agentic/orchestrator/providerAdapters/openaiSession.js';
import { analyzeGameDesk, mapFinalPick, DECISION_ASK } from '../../../src/services/pickdesk/garyBrain.js';

const META = {
  homeTeam: 'Cardinals', awayTeam: 'Reds',
  moneylineHome: -104, moneylineAway: -112,
  spreadHome: -1.5, spreadHomeOdds: 148, spreadAway: 1.5, spreadAwayOdds: -178,
  total: null,
};

const DESK = {
  deskText: '═══ THE BOARD ═══\nboard rows\n\n═══ PROBABLE PITCHERS ═══\nshelf',
  tapeRows: [{ name: 'Record' }],
  verifiedTaleOfTape: { rows: [{ name: 'Record' }] },
  recentScores: null,
  meta: META,
};

const GOOD_JSON = '```json\n{"final_pick": "Cardinals ML -104", "rationale": "Gary\'s Take\\n\\nA clean read.", "confidence_score": 0.61}\n```';

beforeEach(() => {
  vi.clearAllMocks();
  buildMlbDesk.mockResolvedValue(DESK);
  createOpenAISession.mockResolvedValue({ id: 's1' });
  sendToOpenAISession.mockResolvedValue({ content: GOOD_JSON, usage: { prompt_tokens: 100, completion_tokens: 50 } });
});

describe('analyzeGameDesk — architecture pins (spec 2026-07-26)', () => {
  it('creates ONE session: gpt-5.6-sol, xhigh, ZERO tools', async () => {
    await analyzeGameDesk({ homeTeam: 'Cardinals', awayTeam: 'Reds' });
    expect(createOpenAISession).toHaveBeenCalledTimes(1);
    const args = createOpenAISession.mock.calls[0][0];
    expect(args.modelName).toBe('gpt-5.6-sol');
    expect(args.thinkingLevel).toBe('xhigh');
    expect(args.tools).toEqual([]);
  });

  it('system prompt carries the curated survivors, no constitution block', async () => {
    await analyzeGameDesk({});
    const { systemPrompt } = createOpenAISession.mock.calls[0][0];
    expect(systemPrompt).toContain('FACT-CHECKING PROTOCOL');
    expect(systemPrompt).toContain('THINK LIKE A SHARP');
    expect(systemPrompt).not.toContain('<constitution>');
    expect(systemPrompt).not.toContain('{{CURRENT_DATE}}');
  });

  it('one user message: desk first, then the approved ask; no tools language, no length bracket', async () => {
    await analyzeGameDesk({});
    expect(sendToOpenAISession).toHaveBeenCalledTimes(1);
    const msg = sendToOpenAISession.mock.calls[0][1];
    expect(msg.indexOf('═══ THE BOARD ═══')).toBeLessThan(msg.indexOf('## YOUR TASK'));
    expect(msg).toContain('BEST BET on this board');
    expect(msg).toContain('Make the bet.');
    // No tools language (the founder-kept awareness bullets legitimately say
    // "investigate" in the reasoning sense — only the tool ask is banned).
    expect(msg).not.toContain('with your tools');
    expect(msg).not.toContain('fetch_stats');
    expect(msg).not.toContain('[3 paragraphs');
  });

  it('returns the chassis contract with tape, meta odds, and desk text', async () => {
    const r = await analyzeGameDesk({});
    expect(r).toMatchObject({
      pick: 'Cardinals ML -104', type: 'moneyline', odds: -104, confidence: 0.61,
      homeTeam: 'Cardinals', awayTeam: 'Reds',
      moneylineHome: -104, moneylineAway: -112,
    });
    expect(r.verifiedTaleOfTape.rows).toHaveLength(1);
    expect(r.deskText).toContain('THE BOARD');
    expect(r.rationale).toContain("Gary's Take");
  });

  it('malformed JSON: one re-ask, then a contained error (never a throw)', async () => {
    sendToOpenAISession.mockResolvedValue({ content: 'no json here', usage: {} });
    const r = await analyzeGameDesk({});
    expect(sendToOpenAISession).toHaveBeenCalledTimes(2);
    expect(r.error).toMatch(/parse/);
  });
});

describe('mapFinalPick', () => {
  it('run line pick maps to spread with side values', () => {
    const m = mapFinalPick({ final_pick: 'Cardinals -1.5 +148' }, META);
    expect(m).toMatchObject({ type: 'spread', odds: 148, spread: -1.5, spreadOdds: 148 });
  });

  it('away ML maps to moneyline with trailing odds', () => {
    const m = mapFinalPick({ final_pick: 'Cincinnati Reds ML -112' }, META);
    expect(m).toMatchObject({ type: 'moneyline', odds: -112, spread: null });
  });

  it('missing trailing odds falls back to board meta for the side', () => {
    const m = mapFinalPick({ final_pick: 'Reds ML' }, META);
    expect(m.odds).toBe(-112);
  });
});

describe('DECISION_ASK text', () => {
  it('is the approved language with the two spec deltas only', () => {
    const ask = DECISION_ASK('Cardinals', 'Reds');
    expect(ask).toContain('take the bet that pays if your read is right');
    expect(ask).toContain('ESTABLISHED INJURY RULE');
    expect(ask).toContain('confidence measures your read against the price');
    expect(ask).not.toMatch(/tools/i);
  });
});
