import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveTokenForSport } from '../../../src/services/agentic/tools/statRouters/index.js';
import { INVESTIGATION_FACTORS } from '../../../src/services/agentic/orchestrator/investigationFactors.js';
import { DEPRECATED_TOKENS } from '../../../src/services/agentic/tools/statRouters/statRouterCommon.js';

/**
 * SPORT ISOLATION, ENFORCED (Aug 25 2026).
 *
 * The cross-sport guard in the dispatcher stops one sport from executing
 * another's fetcher. That half always worked. The half nobody checked was the
 * reverse: that every token a sport's factor checklist DECLARES can actually
 * run for that sport.
 *
 * It could not. The NFL checklist asked for five NBA/NHL-owned tokens and
 * NCAAF for four, so the guard refused them on every run — INJURIES,
 * RECENT_FORM, TURNOVER_MARGIN, HOME_AWAY_SPLITS, VARIANCE_CONSISTENCY,
 * CLOSE_GAME_RECORD — and a further thirteen NCAAF tokens had no fetcher at
 * all. Those factors returned an error string instead of evidence, silently,
 * for as long as the checklist has existed.
 *
 * Isolation you can only read in a comment is a convention. This makes it a
 * rule: declare a token for a sport and that sport must be able to run it.
 */

const SPORTS = Object.keys(INVESTIGATION_FACTORS);

// Football is repaired and must stay at zero.
const ENFORCED = ['americanfootball_nfl', 'americanfootball_ncaaf', 'baseball_mlb'];

/**
 * The dormant sports carry the same disease and are NOT yet fixed — those are
 * checklist edits, which need the founder's sign-off on the exact list. Until
 * then their debt is pinned here exactly: it may not grow, and every entry
 * removed must be removed from this list too. NBA readiness is due ~Oct 1.
 */
const KNOWN_UNREACHABLE = {
  basketball_nba: ['PLAYER_PERFORMANCE.PLAYER_GAME_LOGS (no fetcher)'],
  icehockey_nhl: [
    'INJURIES.INJURIES (owned by nba)',
    'SCHEDULE.BACK_TO_BACK (owned by nba)',
    'H2H_DIVISION.DIVISION_STANDING (owned by nba)'
  ],
  basketball_ncaab: [
    'RECENT_FORM.PLAYER_GAME_LOGS (no fetcher)',
    'PLAYER_PERFORMANCE.PLAYER_GAME_LOGS (no fetcher)'
  ]
};

const KNOWN_EMPTY_FACTORS = {
  basketball_ncaab: ['SCHEDULE', 'STANDINGS_CONTEXT', 'RANKINGS']
};

function declaredTokens(sportKey) {
  const factors = INVESTIGATION_FACTORS[sportKey] || {};
  const out = [];
  for (const [factor, tokens] of Object.entries(factors)) {
    for (const token of (Array.isArray(tokens) ? tokens : [])) {
      out.push({ factor, token });
    }
  }
  return out;
}

function unreachableFor(sportKey) {
  return declaredTokens(sportKey)
    .map(({ factor, token }) => ({ factor, token, ...resolveTokenForSport(sportKey, token) }))
    .filter((entry) => !entry.allowed)
    .map((entry) => `${entry.factor}.${entry.token} (${entry.reason})`);
}

function emptyFactorsFor(sportKey) {
  return Object.entries(INVESTIGATION_FACTORS[sportKey] || {})
    .filter(([, tokens]) => !Array.isArray(tokens) || tokens.length === 0)
    .map(([factor]) => factor);
}

describe('every checklist token is reachable for the sport that declares it', () => {
  it.each(ENFORCED)('%s — zero unreachable tokens', (sportKey) => {
    expect(unreachableFor(sportKey)).toEqual([]);
  });

  it.each(SPORTS.filter((s) => !ENFORCED.includes(s)))(
    '%s — known debt has not grown',
    (sportKey) => {
      // Pinned, not passing: these sports are dormant and their repair is a
      // checklist edit awaiting sign-off. New entries fail here immediately.
      expect(unreachableFor(sportKey).sort())
        .toEqual((KNOWN_UNREACHABLE[sportKey] || []).sort());
    }
  );
});

describe('a factor that exists has something to call', () => {
  it.each(ENFORCED)('%s has no empty factor', (sportKey) => {
    // NCAAF's MOTIVATION sat empty until Aug 25 2026 — the factor was asked
    // for on every run with no token behind it.
    expect(emptyFactorsFor(sportKey)).toEqual([]);
  });

  it.each(SPORTS.filter((s) => !ENFORCED.includes(s)))(
    '%s — empty-factor debt has not grown',
    (sportKey) => {
      expect(emptyFactorsFor(sportKey).sort())
        .toEqual((KNOWN_EMPTY_FACTORS[sportKey] || []).sort());
    }
  );
});

describe('the guard still refuses genuine cross-sport requests', () => {
  it('will not run an NBA-owned token during a football game', () => {
    // PACE is basketball-only and has no NFL_ form; it must stay refused.
    const verdict = resolveTokenForSport('NFL', 'PACE');
    expect(verdict.allowed).toBe(false);
  });

  it('will not run a football-owned token during a basketball game', () => {
    const verdict = resolveTokenForSport('NBA', 'RED_ZONE_OFFENSE');
    expect(verdict.allowed).toBe(false);
  });

  it('prefers the sport-specific form when one exists', () => {
    // Both leagues define their own INJURIES; neither may fall through to NBA's.
    expect(resolveTokenForSport('NFL', 'INJURIES').resolvedKey).toBe('NFL_INJURIES');
    expect(resolveTokenForSport('NCAAF', 'INJURIES').resolvedKey).toBe('NCAAF_INJURIES');
  });

  it('still allows the deliberately shared and polymorphic tokens', () => {
    expect(resolveTokenForSport('NFL', 'REST_SITUATION').allowed).toBe(true);
    expect(resolveTokenForSport('NFL', 'QUARTER_SCORING').allowed).toBe(true);
  });
});

describe('a live checklist token is never on the deprecated list', () => {
  /**
   * The deprecation list short-circuits dispatch BEFORE a fetcher runs. Three
   * live NCAAF tokens sat on it — NCAAF_STRENGTH_OF_SCHEDULE,
   * NCAAF_CONFERENCE_STRENGTH, NCAAF_VS_POWER_OPPONENTS — so their own honest
   * "not available, here is what would source it" answers were unreachable,
   * and Gary got a pointer to Gemini instead: a vendor retired Aug 24 2026
   * that exists in no lane. Found Aug 25 by driving every endpoint live.
   */
  it.each(SPORTS)('%s declares nothing that dispatch short-circuits', (sportKey) => {
    const declared = declaredTokens(sportKey).map(({ token }) => token);
    const shortCircuited = declared.filter((t) => DEPRECATED_TOKENS.includes(t));
    expect(shortCircuited).toEqual([]);
  });

  it('the deprecation message names no retired vendor', () => {
    const src = readFileSync(
      new URL('../../../src/services/agentic/tools/statRouters/index.js', import.meta.url),
      'utf8'
    );
    expect(src).not.toContain('use Gemini Grounding context');
    expect(src).not.toContain('via Gemini Grounding in Scout Report');
  });
});
