import { describe, expect, it, vi } from 'vitest';
// The metered press-search budget is zero by default (Sep 9 2026); these pins exercise the API rung on purpose.
process.env.GARY_METERED_SEARCH_CAP = '-1';

// CODEX FIRST (Sep 1 2026): the football search transport tries the $0 codex
// bridge before Anthropic. Mocked to a miss here so these gate/throttle pins
// keep exercising the Anthropic path they were written for, offline.
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js', () => ({
  codexCliWebSearch: vi.fn(async () => ({ success: false, data: '', raw: null, error: 'mocked miss' })),
  isCodexCliModel: (m) => typeof m === 'string' && m.startsWith('codex-'),
}));
import {
  mentionsTeam
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
 *
 * The deep read itself was removed on Oct 7 2026 (football's press is now the
 * article readers, each article printed whole); the mention check remains.
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
