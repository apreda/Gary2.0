/**
 * RESPONDER STAMP (Aug 10 2026, founder GO — the weekend-autopsy find).
 * The stored pick's `model` was written from config (GAME_PICK_MODEL), so a
 * mid-slate cascade would stamp picks with a brain that never made them —
 * the exact ambiguity the column exists to kill. These pins hold: the desk
 * result carries `_modelUsed` = the model that actually answered, including
 * after a quota cascade.
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
import { analyzeGameDesk } from '../../../src/services/pickdesk/garyBrain.js';

const META = {
  homeTeam: 'Cardinals', awayTeam: 'Reds',
  moneylineHome: -104, moneylineAway: -112,
  spreadHome: -1.5, spreadHomeOdds: 148, spreadAway: 1.5, spreadAwayOdds: -178,
  total: null,
};

const DESK = {
  deskText: '═══ THE LINES (DraftKings) ═══\nlines\n\n═══ PROBABLE PITCHERS ═══\nshelf',
  deskTextBlind: '═══ PROBABLE PITCHERS ═══\nshelf',
  boardText: '═══ THE LINES (DraftKings) ═══\nlines',
  runLineGame: false,
  tapeRows: [{ name: 'Record' }],
  verifiedTaleOfTape: { rows: [{ name: 'Record' }] },
  recentScores: null,
  meta: META,
};

const READ_JSON = '```json\n{"away_path": "the Reds win it early off the starter", "home_path": "the Cardinals win it late through the pen"}\n```';
const CARD_TEXT = "Gary's Take\n\n" + 'A clean read on a quiet Tuesday. '.repeat(12);
const TICKET_WITH_CARD = '```json\n{"final_pick": "Cardinals ML -104", "confidence_score": 0.61}\n```' + '\n\n' + CARD_TEXT;

// Each brain gets its own session; the three-turn flow is staged per session.
const stageSession = (session) => {
  session.n = session.n ?? 0;
  const content = [READ_JSON, TICKET_WITH_CARD][session.n] ?? TICKET_WITH_CARD;
  session.n += 1;
  return { content, usage: { prompt_tokens: 100, completion_tokens: 50 } };
};

beforeEach(() => {
  vi.clearAllMocks();
  buildMlbDesk.mockResolvedValue(DESK);
  createModelSession.mockImplementation(async ({ modelName }) => ({ modelName }));
});

describe('analyzeGameDesk — responder stamp', () => {
  it('carries _modelUsed = the primary brain on a clean pass', async () => {
    sendToSessionWithRetry.mockImplementation(async (session) => stageSession(session));
    const result = await analyzeGameDesk({ id: 1 }, {});
    expect(result.error).toBeUndefined();
    expect(result._modelUsed).toBe(GAME_PICK_MODEL);
  });

  it('carries _modelUsed = the fallback brain after a quota cascade — never the configured one', async () => {
    const quotaErr = Object.assign(new Error('429: insufficient_quota'), { isQuotaError: true });
    sendToSessionWithRetry.mockImplementation(async (session) => {
      if (session.modelName === GAME_PICK_MODEL) throw quotaErr;
      return stageSession(session);
    });
    const result = await analyzeGameDesk({ id: 1 }, {});
    expect(result.error).toBeUndefined();
    expect(result._modelUsed).toBe(DESK_FALLBACK_MODELS[0]);
    expect(result._modelUsed).not.toBe(GAME_PICK_MODEL);
  });
});
