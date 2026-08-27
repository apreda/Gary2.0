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
  createModelSession: vi.fn(),
  sendToSessionWithRetry: vi.fn(),
}));

import { buildMlbDesk } from '../../../src/services/pickdesk/mlbDesk.js';
import { createModelSession, sendToSessionWithRetry } from '../../../src/services/agentic/orchestrator/sessionManager.js';
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

const READ_JSON = '```json\n{"away_path": "the Reds win it early off the starter", "home_path": "the Cardinals win it late through the pen"}\n```';
const TICKET_JSON = '```json\n{"final_pick": "Cardinals ML -104", "confidence_score": 0.61}\n```';
const CARD_TEXT = "Gary's Take\n\n" + 'A clean read on a quiet Tuesday. '.repeat(12);
// THE MERGED TICKET (Aug 13): the card rides UNDER the pick JSON, same response.
const TICKET_WITH_CARD = TICKET_JSON + '\n\n' + CARD_TEXT;

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
  createModelSession.mockImplementation(async ({ modelName }) => ({ modelName }));
});

describe('analyzeGameDesk — the blind report → priced decision (Aug 12 contract)', () => {
  it('turn 1 is the blind desk + report ask with NO lines and NO verdict; turn 2 is the board and the only decision; turn 3 is the card', async () => {
    const calls = stage([READ_JSON, TICKET_WITH_CARD]);
    const r = await analyzeGameDesk({ id: 1 }, {});
    expect(r.error).toBeUndefined();
    expect(calls[0]).toContain(THE_READ_ASK);
    expect(calls[0]).not.toContain('THE LINES');
    expect(calls[1]).not.toContain('sealed');
    expect(calls[1]).toContain('Reds ML -112');
    expect(calls[1]).toContain("What's your bet, and what are the reasons why?");
    expect(calls[1]).not.toMatch(/one unit|\$100/i); // stake never declared — it invites a payout comparison
    expect(calls[1]).toContain('Then, under the JSON, write "Gary\'s Take"');
    expect(calls[1]).not.toMatch(/better bet|already paid for|losing season/);
    expect(calls.length).toBe(2); // no third turn on the happy path
    expect(r.pick).toBe('Cardinals ML -104');
    expect(r.read_winner).toBeNull();
    expect(r.path_away).toBe('the Reds win it early off the starter');
    expect(r.path_home).toBe('the Cardinals win it late through the pen');
    expect(r.game_read).toContain('If the away side wins it: the Reds win it early off the starter');
  });

  it('THE SEAL: prose in the card turn can never move the stored pick', async () => {
    stage([READ_JSON, TICKET_JSON + "\n\nGary's Take\n\nActually the Reds are the play tonight. " + 'More prose here to pass length. '.repeat(10)]);
    const r = await analyzeGameDesk({ id: 1 }, {});
    expect(r.pick).toBe('Cardinals ML -104');
  });

  it('ticket without a card: ONE repair turn with the sealed anchor, then a contained error — never a throw', async () => {
    const calls = stage([READ_JSON, TICKET_JSON, '```json\n{"noise": true}\n```']);
    const r = await analyzeGameDesk({ id: 1 }, {});
    expect(calls[2]).toContain('Your ticket is sealed: Cardinals ML -104');
    expect(r.error).toMatch(/no card/);
  });

  it('ticket without a card: the repair turn card is accepted, pick unchanged', async () => {
    stage([READ_JSON, TICKET_JSON, CARD_TEXT]);
    const r = await analyzeGameDesk({ id: 1 }, {});
    expect(r.error).toBeUndefined();
    expect(r.pick).toBe('Cardinals ML -104');
    expect(r.rationale).toContain('quiet Tuesday');
  });

  it('returns the chassis contract: tape, meta odds, desk text, era sha, responder model', async () => {
    stage([READ_JSON, TICKET_WITH_CARD]);
    const r = await analyzeGameDesk({ id: 1 }, {});
    expect(r.verifiedTaleOfTape).toEqual({ rows: [{ name: 'Record' }] });
    expect(r.moneylineHome).toBe(-104);
    expect(r.deskText).toContain('PROBABLE PITCHERS');
    expect(typeof r._promptSha).toBe('string');
    expect(r._modelUsed).toBe(GAME_PICK_MODEL);
  });

  it('model-invented headers are removed because the UI owns the Gary\'s Take masthead', async () => {
    const prose = 'The bet is on the sixth inning, not the first. '.repeat(8);
    stage([READ_JSON, TICKET_JSON + `\n\nGary's Take\n\nGary's Take\n\nTHE CARD — Cardinals ML -104\n\n${prose}`]);
    const r = await analyzeGameDesk({ id: 1 }, {});
    expect(r.rationale).not.toContain("Gary's Take");
    expect(r.rationale).not.toContain('THE CARD');
    expect(r.rationale).toContain('sixth inning');
  });
});

describe('analyzeGameDesk — quota cascade (Jul 29 law, current chain)', () => {
  it('a quota throw on the primary re-runs the IDENTICAL contract on the first fallback', async () => {
    const quotaErr = Object.assign(new Error('429: insufficient_quota'), { isQuotaError: true });
    const contents = [READ_JSON, TICKET_WITH_CARD];
    let n = 0;
    sendToSessionWithRetry.mockImplementation(async (session, message) => {
      if (session.modelName === GAME_PICK_MODEL) throw quotaErr;
      const content = contents[Math.min(n, contents.length - 1)];
      n += 1;
      return { content, usage: {}, _message: message };
    });
    const r = await analyzeGameDesk({ id: 1 }, {});
    expect(createModelSession.mock.calls[0][0].modelName).toBe(GAME_PICK_MODEL);
    expect(createModelSession.mock.calls[1][0].modelName).toBe(DESK_FALLBACK_MODELS[0]);
    expect(createModelSession.mock.calls[1][0].systemPrompt).toBe(createModelSession.mock.calls[0][0].systemPrompt);
    expect(r.pick).toBe('Cardinals ML -104');
    expect(r._modelUsed).toBe(DESK_FALLBACK_MODELS[0]);
  });

  it('cascade exhausted: quota on every brain rethrows to the runner', async () => {
    const quotaErr = Object.assign(new Error('429: insufficient_quota'), { isQuotaError: true });
    sendToSessionWithRetry.mockRejectedValue(quotaErr);
    await expect(analyzeGameDesk({ id: 1 }, {})).rejects.toThrow();
    expect(createModelSession).toHaveBeenCalledTimes(1 + DESK_FALLBACK_MODELS.length);
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
  it('THE_READ_ASK builds both win paths and forbids a verdict, before any line exists', () => {
    expect(THE_READ_ASK).toContain('you are not picking a side here');
    expect(THE_READ_ASK).toContain('"away_path"');
    expect(THE_READ_ASK).toContain('"home_path"');
    expect(THE_READ_ASK).not.toContain('"winner"');
    expect(THE_READ_ASK).not.toMatch(/odds|price|-\d{3}/);
  });

  // NO VALUE VOCABULARY (founder GO, Aug 13 — the 0-4 debut, 3 of 4 on dogs):
  // "better bet" reads as value-hunting and the model answered it with
  // underdogs, the same fingerprint as the July priced-surface era (six
  // Nationals fades in seven days, 1-5). The decision turn is now the bare
  // question — which bet — with the board present but never framed as an edge.
  // The stake went too (founder, Aug 13: "not even sure we need this line...
  // its more for clean up"): "one unit" was echoing verbatim into published
  // cards ("One unit on the Nationals at +136") and a declared flat stake
  // invites the payout comparison that translates value-talk into dogs.
  it('buildTicketAsk is the board plus the bare decision — no value vocabulary, no stake', () => {
    const ask = buildTicketAsk('BOARD');
    expect(ask.startsWith('BOARD')).toBe(true);
    expect(ask).toContain("What's your bet, and what are the reasons why?");
    expect(ask).not.toMatch(/one unit|\$100/i);
    expect(ask).not.toMatch(/better bet|already paid for|market's read/i);
    expect(ask).not.toContain('sealed');
    expect(ask).toContain('final_pick');
    expect(ask).toContain('confidence_score (0.50–1.00)');
    expect(ask).toContain('Then, under the JSON, write "Gary\'s Take"');
  });

  it('buildRunLineTicketAsk is the same bare decision with the moneyline off the board — ±1.5 only, no mechanics lecture', () => {
    const ask = buildRunLineTicketAsk('RL BOARD');
    expect(ask.startsWith('RL BOARD')).toBe(true);
    expect(ask).toContain("What's your bet, and what are the reasons why?");
    expect(ask).not.toMatch(/one unit|\$100/i);
    expect(ask).not.toMatch(/better bet/i);
    expect(ask).toContain('[+1.5 or -1.5]');
    expect(ask).not.toContain('sealed');
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
  it('is identity + staleness + the press-opinion law — nothing else (founder, Aug 27: no fallback identity at all)', () => {
    const p = buildGarySystemPrompt('Monday, August 10, 2026');
    expect(p).toBe(`Today is Monday, August 10, 2026. You are Gary — the bettor whose picks publish in this app. You write as yourself, never as an AI or a system, and you have no favorite team.

Your training data is old; the desk is current.

Press excerpts on the desk are source material, not verdicts.`);
  });
});
