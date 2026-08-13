/**
 * OVERLOAD RETRY (Aug 12 2026, founder "this needs fixed" — the debut's first
 * pick). A transient Anthropic 529 "Overloaded" was classified as a quota
 * error, so ONE server blip cascaded the game to the fallback brain — and
 * pick dedup made that surrender permanent. These pins hold the policy:
 * server-busy errors retry the SAME brain (2 extra attempts); real caps and
 * exhausted retries cascade exactly as before.
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

const stageSession = (session) => {
  session.n = session.n ?? 0;
  const content = [READ_JSON, TICKET_WITH_CARD][session.n] ?? TICKET_WITH_CARD;
  session.n += 1;
  return { content, usage: { prompt_tokens: 100, completion_tokens: 50 } };
};

const OVERLOAD_ERR = () => Object.assign(
  new Error('claude CLI exit 1: API Error: 529 Overloaded. This is a server-side issue (HTTP 529)'),
  { isOverloaded: true },
);

beforeEach(() => {
  vi.clearAllMocks();
  buildMlbDesk.mockResolvedValue(DESK);
  createGeminiSession.mockImplementation(async ({ modelName }) => ({ modelName }));
});

describe('analyzeGameDesk — overload retry policy', () => {
  it('retries the SAME brain through a transient 529 — no cascade, primary stamps the pick', async () => {
    let primaryAttempts = 0;
    sendToSessionWithRetry.mockImplementation(async (session) => {
      if (session.modelName === GAME_PICK_MODEL && session.n === undefined && primaryAttempts < 1) {
        primaryAttempts += 1;
        throw OVERLOAD_ERR();
      }
      return stageSession(session);
    });
    const result = await analyzeGameDesk({ id: 1 }, {});
    expect(result.error).toBeUndefined();
    expect(result._modelUsed).toBe(GAME_PICK_MODEL);
    expect(primaryAttempts).toBe(1); // blipped once, answered on the retry
  });

  it('cascades only after overload retries are exhausted (3 primary attempts, then fallback)', async () => {
    let primarySessions = 0;
    sendToSessionWithRetry.mockImplementation(async (session) => {
      if (session.modelName === GAME_PICK_MODEL) {
        if (session.n === undefined) primarySessions += 1;
        throw OVERLOAD_ERR();
      }
      return stageSession(session);
    });
    const result = await analyzeGameDesk({ id: 1 }, {});
    expect(result.error).toBeUndefined();
    expect(primarySessions).toBe(3); // initial + 2 retries
    expect(result._modelUsed).toBe(DESK_FALLBACK_MODELS[0]);
  });

  it('quota errors still cascade immediately — a real cap is never retried', async () => {
    let primarySessions = 0;
    sendToSessionWithRetry.mockImplementation(async (session) => {
      if (session.modelName === GAME_PICK_MODEL) {
        if (session.n === undefined) primarySessions += 1;
        throw Object.assign(new Error('claude CLI exit 1: weekly limit reached'), { isQuotaError: true });
      }
      return stageSession(session);
    });
    const result = await analyzeGameDesk({ id: 1 }, {});
    expect(result.error).toBeUndefined();
    expect(primarySessions).toBe(1); // one look, straight to the fallback
    expect(result._modelUsed).toBe(DESK_FALLBACK_MODELS[0]);
  });
});
