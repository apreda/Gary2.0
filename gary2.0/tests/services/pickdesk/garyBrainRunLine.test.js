/**
 * RUN-LINE FLOW pins (founder GO, Aug 10 2026 — era 190e357e…, supersedes
 * the Aug 6 un-blind single-turn ask). The weekend's forced-RL lane laid
 * -1.5 five of seven and the 30-day lay class sat 8-20; the redesign makes
 * an RL game blind like every other game — the read seals with no board,
 * and only the ticket turn reveals the moneyline is off. These pins hold:
 * the read happens first and stores, the ticket is rail-bound to ±1.5, and
 * a non-RL ticket gets exactly one corrective re-ask.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/pickdesk/mlbDesk.js', () => ({ buildMlbDesk: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/sessionManager.js', () => ({
  createGeminiSession: vi.fn(),
  sendToSessionWithRetry: vi.fn(),
}));

import { buildMlbDesk } from '../../../src/services/pickdesk/mlbDesk.js';
import { createGeminiSession, sendToSessionWithRetry } from '../../../src/services/agentic/orchestrator/sessionManager.js';
import { analyzeGameDesk, THE_READ_ASK } from '../../../src/services/pickdesk/garyBrain.js';

const RL_DESK = {
  deskText: '═══ PROBABLE PITCHERS ═══\nshelf',
  deskTextBlind: '═══ PROBABLE PITCHERS ═══\nshelf',
  boardText: '═══ THE LINES (DraftKings) ═══\nfull board — must never reach an RL session',
  boardTextRunLine: '═══ THE LINES (DraftKings) ═══\nReds +1.5 (-178) | Cardinals -1.5 (+148)',
  runLineGame: true,
  tapeRows: [{ name: 'Record' }],
  verifiedTaleOfTape: { rows: [{ name: 'Record' }] },
  recentScores: null,
  meta: {
    homeTeam: 'Cardinals', awayTeam: 'Reds',
    moneylineHome: -210, moneylineAway: 175,
    spreadHome: -1.5, spreadHomeOdds: 148, spreadAway: 1.5, spreadAwayOdds: -178,
    total: null,
  },
};

const READ_JSON = '```json\n{"away_path": "the Reds win it early off the starter", "home_path": "the Cardinals win it behind the deeper arm"}\n```';
const CARD_TEXT = "Gary's Take\n\n" + 'A clean read on a quiet Tuesday. '.repeat(12);
const RL_TICKET = '```json\n{"final_pick": "Reds +1.5 -178", "confidence_score": 0.58}\n```' + '\n\n' + CARD_TEXT;
const ML_TICKET = '```json\n{"final_pick": "Cardinals ML -210", "confidence_score": 0.60}\n```' + '\n\n' + CARD_TEXT;

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
  buildMlbDesk.mockResolvedValue(RL_DESK);
  createGeminiSession.mockImplementation(async ({ modelName }) => ({ modelName }));
});

describe('analyzeGameDesk — run-line games read blind (Aug 12 contract)', () => {
  it('turn 1 is the blind report ask with NO board and NO verdict; the decision turn carries the RL-only board; both paths store', async () => {
    const calls = stage([READ_JSON, RL_TICKET]);
    const result = await analyzeGameDesk({ id: 1 }, {});
    expect(result.error).toBeUndefined();
    expect(calls[0]).toContain(THE_READ_ASK);
    expect(calls[0]).not.toContain('THE LINES');
    expect(calls[1]).not.toContain('sealed');
    expect(calls[1]).toContain('Reds +1.5 (-178)');
    expect(calls[1]).not.toContain('must never reach an RL session');
    expect(result.read_winner).toBeNull();
    expect(result.path_home).toBe('the Cardinals win it behind the deeper arm');
    expect(result.pick).toContain('+1.5');
  });

  it('either side of the run line is legal by construction — the +1.5 ticket stores as-is', async () => {
    stage([READ_JSON, RL_TICKET]);
    const result = await analyzeGameDesk({ id: 1 }, {});
    expect(result.pick).toContain('Reds +1.5');
  });

  it('a non-RL ticket gets ONE corrective re-ask, then the RL ticket is accepted', async () => {
    const calls = stage([READ_JSON, ML_TICKET, RL_TICKET]);
    const result = await analyzeGameDesk({ id: 1 }, {});
    expect(result.error).toBeUndefined();
    expect(calls[2]).toContain('+1.5 or -1.5');
    expect(result.pick).toContain('+1.5');
  });

  it('rails exhausted: two non-RL tickets → contained no-pick error', async () => {
    stage([READ_JSON, ML_TICKET, ML_TICKET]);
    const result = await analyzeGameDesk({ id: 1 }, {});
    expect(result.error).toContain('non-run-line ticket');
  });
});
