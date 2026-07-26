import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/pickdesk/mlbDesk.js', () => ({ buildMlbDesk: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/openaiSession.js', () => ({
  createOpenAISession: vi.fn(),
  sendToOpenAISession: vi.fn(),
}));

import { buildMlbDesk } from '../../../src/services/pickdesk/mlbDesk.js';
import { createOpenAISession, sendToOpenAISession } from '../../../src/services/agentic/orchestrator/providerAdapters/openaiSession.js';
import { analyzeGameDesk, mapFinalPick, THE_ASK } from '../../../src/services/pickdesk/garyBrain.js';

const META = {
  homeTeam: 'Cardinals', awayTeam: 'Reds',
  moneylineHome: -104, moneylineAway: -112,
  spreadHome: -1.5, spreadHomeOdds: 148, spreadAway: 1.5, spreadAwayOdds: -178,
  total: null,
};

const DESK = {
  deskText: '═══ THE LINES (DraftKings) ═══\nlines\n\n═══ PROBABLE PITCHERS ═══\nshelf',
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

  it('system prompt is minimal — identity, one staleness line, card contract; zero steering', async () => {
    await analyzeGameDesk({});
    const { systemPrompt } = createOpenAISession.mock.calls[0][0];
    // Founder, Jul 26: "the only real anti-hallucination we need is to say
    // don't use training data as it's old" — statAudit stays as the silent
    // rail; the prompt carries no threats, no bans, no enumerations.
    expect(systemPrompt).toContain('Your training data is old; the desk is current.');
    expect(systemPrompt).toContain('never as an AI');
    expect(systemPrompt).toContain('Gary\'s Take');
    expect(systemPrompt).not.toContain('rejected');
    expect(systemPrompt).not.toContain('must come from the desk');
    expect(systemPrompt).not.toContain('your only information');
    expect(systemPrompt).not.toContain('opinions');
    expect(systemPrompt).not.toContain('FACT-CHECKING PROTOCOL');
    expect(systemPrompt).not.toContain('THINK LIKE A SHARP');
    expect(systemPrompt).not.toContain('<constitution>');
    expect(systemPrompt.length).toBeLessThan(700);
  });

  it('one user message: the desk, then the bare ask — no coaching, no tutoring', async () => {
    await analyzeGameDesk({});
    expect(sendToOpenAISession).toHaveBeenCalledTimes(1);
    const msg = sendToOpenAISession.mock.calls[0][1];
    expect(msg.indexOf('═══ THE LINES')).toBeLessThan(msg.indexOf('Pick the bet you want to take'));
    expect(msg).toContain('Pick the bet you want to take.');
    expect(msg).toContain('confidence_score');
    // The razor: no decision coaching, no mechanics tutoring, no old-system asks.
    expect(msg).not.toContain('BEST BET');
    expect(msg).not.toContain('MONEYLINE pays');
    expect(msg).not.toContain('own money');
    expect(msg).not.toContain('MLB SEASON AWARENESS');
    expect(msg).not.toContain('with your tools');
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
    expect(r.deskText).toContain('THE LINES');
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

describe('THE_ASK text', () => {
  it('is task, injury law, and output contract — nothing else', () => {
    expect(THE_ASK).toContain('Pick the bet you want to take');
    expect(THE_ASK).toContain('already games old is already in the price');
    expect(THE_ASK).toContain('final_pick');
    expect(THE_ASK.length).toBeLessThan(700);
  });
});
