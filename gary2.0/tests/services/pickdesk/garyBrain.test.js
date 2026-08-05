import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/pickdesk/mlbDesk.js', () => ({ buildMlbDesk: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/sessionManager.js', () => ({
  createGeminiSession: vi.fn(),
  sendToSessionWithRetry: vi.fn(),
}));

import { buildMlbDesk } from '../../../src/services/pickdesk/mlbDesk.js';
import { createGeminiSession, sendToSessionWithRetry } from '../../../src/services/agentic/orchestrator/sessionManager.js';
import { analyzeGameDesk, mapFinalPick, THE_ASK, buildCardAsk } from '../../../src/services/pickdesk/garyBrain.js';

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

// Seal-the-pick era (Aug 4 2026): turn 1 = ticket only, turn 2 = card prose.
const TICKET_JSON = '```json\n{"final_pick": "Cardinals ML -104", "confidence_score": 0.61}\n```';
const CARD_TEXT = "Gary's Take\n\n" + 'A clean read on a quiet Tuesday. '.repeat(12);

const ticketThenCard = () => {
  let n = 0;
  sendToSessionWithRetry.mockImplementation(async () => ({
    content: (n++ % 2 === 0) ? TICKET_JSON : CARD_TEXT,
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  }));
};

beforeEach(() => {
  vi.clearAllMocks();
  buildMlbDesk.mockResolvedValue(DESK);
  createGeminiSession.mockResolvedValue({ id: 's1' });
  ticketThenCard();
});

describe('analyzeGameDesk — architecture pins (spec 2026-07-26)', () => {
  it('creates ONE session: gpt-5.6-sol, xhigh, ZERO tools', async () => {
    await analyzeGameDesk({ homeTeam: 'Cardinals', awayTeam: 'Reds' });
    expect(createGeminiSession).toHaveBeenCalledTimes(1);
    const args = createGeminiSession.mock.calls[0][0];
    expect(args.modelName).toBe('gpt-5.6-sol');
    expect(args.thinkingLevel).toBe('xhigh');
    expect(args.tools).toEqual([]);
  });

  it('system prompt is minimal — identity, one staleness line, card contract; zero steering', async () => {
    await analyzeGameDesk({});
    const { systemPrompt } = createGeminiSession.mock.calls[0][0];
    // Founder, Jul 26: "the only real anti-hallucination we need is to say
    // don't use training data as it's old" — statAudit stays as the silent
    // rail; the prompt carries no threats, no bans, no enumerations.
    expect(systemPrompt).toContain('Your training data is old; the desk is current.');
    // Aug 5: the price sentence is OUT (founder — value hunting was crowding
    // out who-wins). NOTHING about the line is pre-loaded now: the price
    // reaches Gary on the desk and in the ticket contract, not as a lens.
    expect(systemPrompt).not.toMatch(/market'?s opinion|the line is|price|odds|value/i);
    expect(systemPrompt).not.toMatch(/fade|against the market|contrarian|public money/i);
    expect(systemPrompt).toContain('never as an AI');
    // Aug 4 evening: the card contract moved to buildCardAsk (the moment of
    // composition) — the system prompt is identity + staleness, nothing else.
    expect(systemPrompt).not.toContain('three paragraphs');
    expect(systemPrompt).not.toContain('rejected');
    expect(systemPrompt).not.toContain('must come from the desk');
    expect(systemPrompt).not.toContain('your only information');
    expect(systemPrompt).not.toContain('opinions');
    expect(systemPrompt).not.toContain('FACT-CHECKING PROTOCOL');
    expect(systemPrompt).not.toContain('THINK LIKE A SHARP');
    expect(systemPrompt).not.toContain('<constitution>');
    expect(systemPrompt.length).toBeLessThan(780);
  });

  it('turn 1 is desk + ticket ask; the card is never requested before the seal', async () => {
    await analyzeGameDesk({});
    expect(sendToSessionWithRetry).toHaveBeenCalledTimes(2);
    const msg = sendToSessionWithRetry.mock.calls[0][1];
    expect(msg.indexOf('═══ THE LINES')).toBeLessThan(msg.indexOf('Pick the bet you want to take'));
    // Jul 29 (founder, replay-gated): the pick's object is a priced ticket.
    expect(msg).toContain('Pick the bet you want to take — a bet is a side and its price.');
    expect(msg).toContain('your conviction in this bet at its price');
    expect(msg).toContain('confidence_score');
    // Aug 4 seal: the decision turn asks for the ticket alone — no prose field.
    expect(msg).toContain('Your ticket seals before any card is written.');
    expect(msg).not.toContain('"rationale"');
    // The razor: no decision coaching, no mechanics tutoring, no old-system asks.
    expect(msg).not.toContain('BEST BET');
    expect(msg).not.toContain('MONEYLINE pays');
    expect(msg).not.toContain('own money');
    expect(msg).not.toContain('MLB SEASON AWARENESS');
    expect(msg).not.toContain('with your tools');
    expect(msg).not.toContain('[3 paragraphs');
  });

  it('turn 2 carries the sealed ticket and the card contract — the broadcast open is the law', async () => {
    await analyzeGameDesk({});
    const msg = sendToSessionWithRetry.mock.calls[1][1];
    expect(msg).toBe(buildCardAsk('Cardinals ML -104'));
    expect(msg).toContain('Your ticket is sealed: Cardinals ML -104.');
    // The founder-approved card sentences, verbatim, at the moment of
    // composition (Aug 4 evening fix — the memo-register leak).
    expect(msg).toContain('three paragraphs, opening with a line or two setting the stage like a broadcast');
    expect(msg).toContain('Never mention data feeds, tools, or missing data.');
  });

  it('THE SEAL: a different final_pick in the card turn cannot move the stored pick', async () => {
    let n = 0;
    sendToSessionWithRetry.mockImplementation(async () => ({
      content: n++ === 0
        ? TICKET_JSON
        // Card turn answers in the old JSON shape with a DIFFERENT pick — the
        // prose is accepted, the pick change is ignored by construction.
        : '```json\n{"final_pick": "Reds ML -112", "rationale": ' + JSON.stringify(CARD_TEXT) + '}\n```',
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }));
    const r = await analyzeGameDesk({});
    expect(r.pick).toBe('Cardinals ML -104');
    expect(r.rationale).toContain("Gary's Take");
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

  it('malformed ticket: one re-ask, then a contained error — never a throw, never a cascade', async () => {
    sendToSessionWithRetry.mockResolvedValue({ content: 'no json here', usage: {} });
    const r = await analyzeGameDesk({});
    expect(sendToSessionWithRetry).toHaveBeenCalledTimes(2);
    expect(createGeminiSession).toHaveBeenCalledTimes(1); // parse failures stay on the primary brain
    expect(r.error).toMatch(/parse/);
  });

  it('missing card: one re-ask, then a contained error', async () => {
    let n = 0;
    sendToSessionWithRetry.mockImplementation(async () => ({
      content: n++ === 0 ? TICKET_JSON : 'Sure.',
      usage: {},
    }));
    const r = await analyzeGameDesk({});
    expect(sendToSessionWithRetry).toHaveBeenCalledTimes(3); // ticket, card, card re-ask
    expect(r.error).toMatch(/no card/);
  });
});

describe('analyzeGameDesk — quota cascade (founder approved Jul 29)', () => {
  it('Sol quota/429 → SAME desk re-runs on gemini-3.6-flash at high thinking', async () => {
    const quotaErr = Object.assign(new Error('OpenAI 429: insufficient_quota'), { isQuotaError: true });
    let n = 0;
    sendToSessionWithRetry.mockImplementation(async () => {
      if (n === 0) { n++; throw quotaErr; }
      return { content: (n++ % 2 === 1) ? TICKET_JSON : CARD_TEXT, usage: { prompt_tokens: 100, completion_tokens: 50 } };
    });
    const r = await analyzeGameDesk({});
    expect(createGeminiSession).toHaveBeenCalledTimes(2);
    expect(createGeminiSession.mock.calls[0][0].modelName).toBe('gpt-5.6-sol');
    expect(createGeminiSession.mock.calls[1][0].modelName).toBe('gemini-3.6-flash');
    expect(createGeminiSession.mock.calls[1][0].thinkingLevel).toBe('high'); // Gemini's ceiling — never 'xhigh'
    // The fallback receives the IDENTICAL contract: same system prompt, same desk message.
    expect(createGeminiSession.mock.calls[1][0].systemPrompt).toBe(createGeminiSession.mock.calls[0][0].systemPrompt);
    expect(sendToSessionWithRetry.mock.calls[1][1]).toBe(sendToSessionWithRetry.mock.calls[0][1]);
    expect(r.pick).toBe('Cardinals ML -104');
  });

  it('cascade exhausted: quota on all three brains rethrows to the runner', async () => {
    const quotaErr = Object.assign(new Error('OpenAI 429: insufficient_quota'), { isQuotaError: true });
    sendToSessionWithRetry.mockRejectedValue(quotaErr);
    await expect(analyzeGameDesk({})).rejects.toThrow();
    expect(createGeminiSession).toHaveBeenCalledTimes(3);
    expect(createGeminiSession.mock.calls[2][0].modelName).toBe('gemini-3.1-pro-preview');
  });
});

describe('mapFinalPick', () => {
  it('normalizes parenthesized odds in the pick text', () => {
    const m = mapFinalPick({ final_pick: 'Royals +1.5 (-126)' }, META);
    expect(m.pick).toBe('Royals +1.5 -126');
    expect(m).toMatchObject({ type: 'spread', odds: -126 });
  });

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
  it('is task, injury law, and ticket contract — nothing else', () => {
    expect(THE_ASK).toContain('Pick the bet you want to take');
    expect(THE_ASK).toContain('already games old is already in the price');
    expect(THE_ASK).toContain('final_pick');
    // Aug 4 seal: the decision output carries no prose field.
    expect(THE_ASK).not.toContain('rationale');
    expect(THE_ASK.length).toBeLessThan(700);
  });

  it('buildCardAsk is the sealed ticket and the approved card contract — nothing else', () => {
    const ask = buildCardAsk('Cubs ML +109');
    expect(ask.startsWith('Your ticket is sealed: Cubs ML +109.')).toBe(true);
    expect(ask).toContain('Write "Gary\'s Take"');
    expect(ask).not.toMatch(/risk|counter|worry|honest/i); // no composition beats forced beyond the open
  });

  it('a model-invented header is normalized to the Gary\'s Take masthead (live smoke catch)', async () => {
    let n = 0;
    const prose = 'The bet is on the sixth inning, not the first. '.repeat(8);
    sendToSessionWithRetry.mockImplementation(async () => ({
      content: n++ === 0 ? TICKET_JSON : `THE CARD — Cardinals ML -104\n\n${prose}`,
      usage: {},
    }));
    const r = await analyzeGameDesk({});
    expect(r.rationale.startsWith("Gary's Take\n\n")).toBe(true);
    expect(r.rationale).not.toContain('THE CARD');
    expect(r.rationale).toContain('sixth inning');
  });
});
