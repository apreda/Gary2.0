/**
 * BRAIN ARCHITECTURE pins — rebuilt Aug 10 2026 against the live contract
 * (blind split Aug 5 + seal Aug 4 + RL-blind era 190e357e; the old file
 * pinned the July 26 two-turn spec and had been failing since the rebuild).
 *
 * The law these pins hold: turn 1 reads the game with NO price anywhere;
 * turn 2 reveals the board and seals the ticket; turn 3 writes prose that
 * can never move the pick; a cascade hands the IDENTICAL contract to the
 * next brain and stamps the responder.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/pickdesk/mlbDesk.js', () => ({ buildMlbDesk: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/sessionManager.js', () => ({
  createGeminiSession: vi.fn(),
  sendToSessionWithRetry: vi.fn(),
}));

import { buildMlbDesk } from '../../../src/services/pickdesk/mlbDesk.js';
import { createGeminiSession, sendToSessionWithRetry } from '../../../src/services/agentic/orchestrator/sessionManager.js';
import { GAME_PICK_MODEL, DESK_FALLBACK_MODELS } from '../../../src/services/agentic/orchestrator/orchestratorConfig.js';
import { analyzeGameDesk, mapFinalPick, THE_READ_ASK, buildTicketAsk, buildRunLineTicketAsk, buildCardAsk, buildGarySystemPrompt } from '../../../src/services/pickdesk/garyBrain.js';

const META = {
  homeTeam: 'Cardinals', awayTeam: 'Reds',
  moneylineHome: -104, moneylineAway: -112,
  spreadHome: -1.5, spreadHomeOdds: 148, spreadAway: 1.5, spreadAwayOdds: -178,
  total: null,
};

const DESK = {
  deskText: '═══ THE LINES (DraftKings) ═══\nlines\n\n═══ PROBABLE PITCHERS ═══\nshelf',
  deskTextBlind: '═══ PROBABLE PITCHERS ═══\nshelf',
  boardText: '═══ THE LINES (DraftKings) ═══\nReds ML -112 | Cardinals ML -104',
  boardTextRunLine: '═══ THE LINES (DraftKings) ═══\nReds +1.5 (-178) | Cardinals -1.5 (+148)',
  runLineGame: false,
  tapeRows: [{ name: 'Record' }],
  verifiedTaleOfTape: { rows: [{ name: 'Record' }] },
  recentScores: null,
  meta: META,
};

const READ_JSON = '```json\n{"winner": "Cardinals", "read": "the cleaner club tonight"}\n```';
const TICKET_JSON = '```json\n{"final_pick": "Cardinals ML -104", "confidence_score": 0.61}\n```';
const CARD_TEXT = "Gary's Take\n\n" + 'A clean read on a quiet Tuesday. '.repeat(12);

const stage = (contents) => {
  let n = 0;
  const calls = [];
  sendToSessionWithRetry.mockImplementation(async (_s, message) => {
    calls.push(message);
    const content = contents[Math.min(n, contents.length - 1)];
    n += 1;
    return { content, usage: { prompt_tokens: 100, completion_tokens: 50 } };
  });
  return calls;
};

beforeEach(() => {
  vi.clearAllMocks();
  buildMlbDesk.mockResolvedValue(DESK);
  createGeminiSession.mockImplementation(async ({ modelName }) => ({ modelName }));
});

describe('analyzeGameDesk — the blind split (era 190e357e lineage)', () => {
  it('turn 1 is the blind desk + read ask with NO lines; turn 2 seals the winner and reveals the board; turn 3 is the card', async () => {
    const calls = stage([READ_JSON, TICKET_JSON, CARD_TEXT]);
    const r = await analyzeGameDesk({ id: 1 }, {});
    expect(r.error).toBeUndefined();
    expect(calls[0]).toContain(THE_READ_ASK);
    expect(calls[0]).not.toContain('THE LINES');
    expect(calls[1]).toContain('Your winner is sealed: Cardinals');
    expect(calls[1]).toContain('Reds ML -112');
    expect(calls[2]).toContain('Your ticket is sealed: Cardinals ML -104');
    expect(r.pick).toBe('Cardinals ML -104');
    expect(r.read_winner).toBe('Cardinals');
    expect(r.game_read).toBe('the cleaner club tonight');
  });

  it('THE SEAL: prose in the card turn can never move the stored pick', async () => {
    stage([READ_JSON, TICKET_JSON, "Gary's Take\n\nActually the Reds are the play tonight. " + 'More prose here to pass length. '.repeat(10)]);
    const r = await analyzeGameDesk({ id: 1 }, {});
    expect(r.pick).toBe('Cardinals ML -104');
  });

  it('missing card: one re-ask, then a contained error — never a throw', async () => {
    stage([READ_JSON, TICKET_JSON, '```json\n{"noise": true}\n```', '```json\n{"noise": true}\n```']);
    const r = await analyzeGameDesk({ id: 1 }, {});
    expect(r.error).toMatch(/no card/);
  });

  it('returns the chassis contract: tape, meta odds, desk text, era sha, responder model', async () => {
    stage([READ_JSON, TICKET_JSON, CARD_TEXT]);
    const r = await analyzeGameDesk({ id: 1 }, {});
    expect(r.verifiedTaleOfTape).toEqual({ rows: [{ name: 'Record' }] });
    expect(r.moneylineHome).toBe(-104);
    expect(r.deskText).toContain('PROBABLE PITCHERS');
    expect(typeof r._promptSha).toBe('string');
    expect(r._modelUsed).toBe(GAME_PICK_MODEL);
  });

  it('a model-invented header is normalized to the Gary\'s Take masthead (live smoke catch)', async () => {
    const prose = 'The bet is on the sixth inning, not the first. '.repeat(8);
    stage([READ_JSON, TICKET_JSON, `THE CARD — Cardinals ML -104\n\n${prose}`]);
    const r = await analyzeGameDesk({ id: 1 }, {});
    expect(r.rationale.startsWith("Gary's Take\n\n")).toBe(true);
    expect(r.rationale).not.toContain('THE CARD');
    expect(r.rationale).toContain('sixth inning');
  });
});

describe('analyzeGameDesk — quota cascade (Jul 29 law, current chain)', () => {
  it('a quota throw on the primary re-runs the IDENTICAL contract on the first fallback', async () => {
    const quotaErr = Object.assign(new Error('429: insufficient_quota'), { isQuotaError: true });
    const contents = [READ_JSON, TICKET_JSON, CARD_TEXT];
    let n = 0;
    sendToSessionWithRetry.mockImplementation(async (session, message) => {
      if (session.modelName === GAME_PICK_MODEL) throw quotaErr;
      const content = contents[Math.min(n, contents.length - 1)];
      n += 1;
      return { content, usage: {}, _message: message };
    });
    const r = await analyzeGameDesk({ id: 1 }, {});
    expect(createGeminiSession.mock.calls[0][0].modelName).toBe(GAME_PICK_MODEL);
    expect(createGeminiSession.mock.calls[1][0].modelName).toBe(DESK_FALLBACK_MODELS[0]);
    expect(createGeminiSession.mock.calls[1][0].systemPrompt).toBe(createGeminiSession.mock.calls[0][0].systemPrompt);
    expect(r.pick).toBe('Cardinals ML -104');
    expect(r._modelUsed).toBe(DESK_FALLBACK_MODELS[0]);
  });

  it('cascade exhausted: quota on every brain rethrows to the runner', async () => {
    const quotaErr = Object.assign(new Error('429: insufficient_quota'), { isQuotaError: true });
    sendToSessionWithRetry.mockRejectedValue(quotaErr);
    await expect(analyzeGameDesk({ id: 1 }, {})).rejects.toThrow();
    expect(createGeminiSession).toHaveBeenCalledTimes(1 + DESK_FALLBACK_MODELS.length);
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

describe('the ask texts — the whole contract, nothing else', () => {
  it('THE_READ_ASK asks for the winner before any line exists', () => {
    expect(THE_READ_ASK).toContain('Who wins tonight?');
    expect(THE_READ_ASK).toContain('seals before you see any lines');
    expect(THE_READ_ASK).toContain('"winner"');
    expect(THE_READ_ASK).not.toMatch(/odds|price|-\d{3}/);
  });

  it('buildTicketAsk carries the sealed winner, the board, and the confidence contract', () => {
    const ask = buildTicketAsk('Cardinals', 'BOARD');
    expect(ask.startsWith('Your winner is sealed: Cardinals.')).toBe(true);
    expect(ask).toContain('BOARD');
    expect(ask).toContain('final_pick');
    expect(ask).toContain('confidence_score (0.50–1.00)');
  });

  it('buildRunLineTicketAsk is the same seal with the moneyline off the board — ±1.5 only, no mechanics lecture', () => {
    const ask = buildRunLineTicketAsk('Cardinals', 'RL BOARD');
    expect(ask.startsWith('Your winner is sealed: Cardinals.')).toBe(true);
    expect(ask).toContain('The moneyline is off the board tonight');
    expect(ask).toContain('[+1.5 or -1.5]');
    expect(ask).not.toMatch(/cashes|wins by two|cover/i);
  });

  it('buildCardAsk is the sealed ticket and the approved card contract — nothing else', () => {
    const ask = buildCardAsk('Cubs ML +109');
    expect(ask.startsWith('Your ticket is sealed: Cubs ML +109.')).toBe(true);
    expect(ask).toContain('Write "Gary\'s Take"');
    expect(ask).not.toMatch(/risk|counter|worry|honest/i);
  });
});

describe('the system prompt — the approved contract, word for word', () => {
  it('is identity + staleness + the Sharp\'s Mind (founder sign-off, Aug 10 2026) — nothing else', () => {
    const p = buildGarySystemPrompt('Monday, August 10, 2026');
    expect(p).toBe(`Today is Monday, August 10, 2026. You are Gary — the bettor whose picks publish in this app. You write as yourself, never as an AI or a system, and you have no favorite team.

Your training data is old; the desk is current.

You think like a professional bettor, and a professional interrogates his own case before he trusts it. Which of these facts are about tonight's matchup, and which just describe a team in general? What's the most recent look at this exact question, and what does it say? What does everyone already know here — and is my case anything more than that? Who wins tonight and what's worth betting are two different questions; answer each on its own turn. Every game is its own case — the reasoning that fit last night's game earns nothing tonight.`);
  });
});
