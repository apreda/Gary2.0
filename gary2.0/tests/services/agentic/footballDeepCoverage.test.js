import { describe, expect, it } from 'vitest';
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
