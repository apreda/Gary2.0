import { describe, expect, it, vi } from 'vitest';

// CODEX FIRST (Sep 1 2026): the football search transport tries the $0 codex
// bridge before Anthropic. Mocked to a miss here so these gate/throttle pins
// keep exercising the Anthropic path they were written for, offline.
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js', () => ({
  codexCliWebSearch: vi.fn(async () => ({ success: false, data: '', raw: null, error: 'mocked miss' })),
  isCodexCliModel: (m) => typeof m === 'string' && m.startsWith('codex-'),
}));
import {
  mentionsTeam, DEEP_COVERAGE_LANES
} from '../../../src/services/agentic/scoutReport/shared/anthropicFootballGrounding.js';

/**
 * THE DEEP READ, and the two bugs that made it return nothing.
 *
 * Both were silent. Both produced a lane that had genuinely fetched thousands
 * of characters of correct coverage and then threw it away, logging a plain
 * "validation failed" that reads like the search found nothing.
 *
 *   1. The mention check demanded the LITERAL full team name. Press accounts
 *      say "the Lions", not "the Detroit Lions", so a 3,198-character
 *      head-to-head report on exactly the right game was discarded as
 *      off-topic. The check exists to catch a lane that answered about
 *      something else, not to impose a house style on beat writers.
 *
 *   2. runFootballSearch returns { data, provider, searchCount }. The fan-out
 *      read { text, searches }. Every successful lane therefore looked empty,
 *      and the whole deep read returned null — on the exact code path Sep 9
 *      depends on.
 *
 * Caught by running it live rather than by unit-testing the lane definitions,
 * which is why this file asserts the CONTRACT between the two functions and
 * not just their shapes.
 */

describe('a team is named when the writing refers to it', () => {
  it.each([
    ['the lions rallied late', 'Detroit Lions'],
    ['detroit was outplayed for three quarters', 'Detroit Lions'],
    ['the bears defense was picked on all afternoon', 'Chicago Bears'],
    ['ohio state struggled to run it', 'Ohio State Buckeyes'],
    ['the buckeyes struggled to run it', 'Ohio State Buckeyes'],
    ['detroit lions', 'Detroit Lions']
  ])('%s counts as naming %s', (text, team) => {
    expect(mentionsTeam(text, team)).toBe(true);
  });

  it('still rejects coverage that is about something else entirely', () => {
    expect(mentionsTeam('a report about the world series', 'Detroit Lions')).toBe(false);
  });

  it('will not match on a short common fragment', () => {
    // "New" must not satisfy "New York Jets", or every article matches.
    expect(mentionsTeam('a new coach was hired somewhere', 'New York Jets')).toBe(false);
  });

  it('treats an empty requirement as satisfied rather than impossible', () => {
    expect(mentionsTeam('anything', '')).toBe(true);
  });
});

describe('the lanes', () => {
  it('covers every subject the founder named', () => {
    const keys = DEEP_COVERAGE_LANES.map((l) => l.key);
    expect(keys).toEqual([
      'last_game', 'recent_run', 'head_to_head', 'quarterback', 'skill_players', 'defense'
    ]);
  });

  it('each lane has its own search budget and a prompt builder', () => {
    for (const lane of DEEP_COVERAGE_LANES) {
      expect(lane.maxUses).toBeGreaterThan(0);
      expect(typeof lane.build).toBe('function');
    }
  });

  it('every prompt carries the boundaries: no injuries, no odds, no picks', () => {
    for (const lane of DEEP_COVERAGE_LANES) {
      const prompt = lane.build({
        homeTeam: 'Detroit Lions', awayTeam: 'Chicago Bears', league: 'NFL', known: ''
      });
      expect(prompt).toMatch(/No predictions, no betting angles, no odds, no picks/);
      expect(prompt).toMatch(/Do NOT report injuries/);
      expect(prompt).toMatch(/Do not use internal memory to fill gaps/);
      expect(prompt).toMatch(/Do not compare the two teams and do not favour either/);
    }
  });

  it('names both teams in every lane, so a lane cannot drift to one side', () => {
    for (const lane of DEEP_COVERAGE_LANES) {
      const prompt = lane.build({
        homeTeam: 'Detroit Lions', awayTeam: 'Chicago Bears', league: 'NFL', known: ''
      });
      expect(prompt).toContain('Detroit Lions');
      expect(prompt).toContain('Chicago Bears');
    }
  });

  it('passes the already-known accounts through, so searches are not spent rediscovering scores', () => {
    const known = '<already_known>W 19-16 @ Chicago Bears</already_known>';
    const withKnown = DEEP_COVERAGE_LANES
      .filter((l) => l.build({ homeTeam: 'A', awayTeam: 'B', league: 'NFL', known }).includes(known));
    // Not every lane needs it — head-to-head and skill players search fresh —
    // but the game-account lanes must, or they re-report the box score.
    expect(withKnown.map((l) => l.key)).toEqual(
      expect.arrayContaining(['last_game', 'recent_run', 'quarterback', 'defense'])
    );
  });
});

describe('the contract between the search and the fan-out', () => {
  /**
   * This is the assertion that would have caught bug 2. The fan-out consumes
   * whatever runFootballSearch returns, and reading the wrong key names is
   * invisible until it runs live.
   */
  it('the fan-out reads the keys runFootballSearch actually returns', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      'src/services/agentic/scoutReport/shared/anthropicFootballGrounding.js', 'utf8'
    );
    // runFootballSearch's success return.
    expect(source).toMatch(/return \{ data: cleaned, provider: 'anthropic-web-search', searchCount: successfulSearches \}/);
    // The fan-out must consume those exact names.
    expect(source).toMatch(/value && value\.data/);
    expect(source).toMatch(/text: value\.data/);
    expect(source).toMatch(/searches: value\.searchCount/);
  });
});

describe('the search gate and how a throttled slate reports itself', () => {
  /**
   * The fan-out multiplied peak in-flight searches by SIX. NCAAF runs up to
   * twelve games at once, so a Saturday could have put seventy-two requests in
   * flight against a path with no limiter — the BDL 429 work is a different
   * client and does not cover it.
   *
   * The storm mattered less than how it read: a 429 returned null, and a null
   * lane rendered as "No coverage found for this lane". Throttling would have
   * been presented to the desk as a quiet news week, across a whole slate,
   * with every log line green.
   */
  it('declares a bounded ceiling on concurrent searches', async () => {
    const { _searchGateState } = await import(
      '../../../src/services/agentic/scoutReport/shared/anthropicFootballGrounding.js'
    );
    const gate = _searchGateState();
    expect(gate.max).toBeGreaterThan(0);
    // Six lanes x twelve NCAAF workers is 72. The ceiling must be well under.
    expect(gate.max).toBeLessThan(72);
  });

  it('retries a 429 instead of reporting it as an absence of coverage', async () => {
    const { fetchFootballDeepCoverage } = await import(
      '../../../src/services/agentic/scoutReport/shared/anthropicFootballGrounding.js'
    );
    process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key';
    let calls = 0;
    const throttled = async () => {
      calls += 1;
      // A retry-after of 0 keeps the test fast while exercising the header path.
      return { ok: false, status: 429, headers: { get: () => '0' } };
    };
    const result = await fetchFootballDeepCoverage({
      homeTeam: 'Detroit Lions', awayTeam: 'Chicago Bears', sport: 'NFL',
      lanes: ['defense'], fetchImpl: throttled
    });

    expect(calls).toBeGreaterThan(1);            // it retried
    expect(result).not.toBeNull();               // it did not vanish
    expect(result.allFailed).toBe(true);
    // The two statements that must never be collapsed.
    expect(result.text).toMatch(/retrieval failure/i);
    expect(result.text).toMatch(/NOT a finding that the games were unremarkable/i);
    expect(result.text).toMatch(/rate limited/i);
  });

  it('a genuine no-coverage result still returns null rather than an empty section', async () => {
    const { fetchFootballDeepCoverage } = await import(
      '../../../src/services/agentic/scoutReport/shared/anthropicFootballGrounding.js'
    );
    process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key';
    // A clean 200 whose text simply does not mention the teams: nothing was
    // found, and that is not a technical failure worth a section of its own.
    const empty = async () => ({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ content: [{ type: 'text', text: 'unrelated content about something else entirely' }], stop_reason: 'end_turn' })
    });
    const result = await fetchFootballDeepCoverage({
      homeTeam: 'Detroit Lions', awayTeam: 'Chicago Bears', sport: 'NFL',
      lanes: ['defense'], fetchImpl: empty
    });
    expect(result).toBeNull();
  });
});
