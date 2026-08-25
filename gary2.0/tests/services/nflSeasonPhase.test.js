import { describe, expect, it } from 'vitest';
import {
  phaseForGames, reliabilityNote, gradeSplits, resolveSeasonContext,
  gamesPlayedFor, PHASES, SPLIT_FLOOR
} from '../../src/services/nflSeasonPhase.js';

/**
 * OPENING WEEKEND — the honest answer when there is no season yet.
 *
 * Week 1 is Sep 9 2026. On that morning the 2026 play ledger does not exist,
 * because no 2026 game has been played. Every situational split would be
 * empty. By Week 3 they exist and rest on three games, and a goal-line rate
 * over nine snaps is not a tendency — it is noise wearing a tendency's
 * clothes, which is the same failure as the fabricated zeros that started
 * this audit: a confident number with nothing behind it.
 *
 * The policy under test: use the prior season and SAY it is the prior season;
 * report a thin current season as thin; never let either pass as a full-season
 * profile.
 */

describe('phase boundaries', () => {
  it.each([
    [0, PHASES.NOT_STARTED], [1, PHASES.EARLY], [3, PHASES.EARLY],
    [4, PHASES.DEVELOPING], [7, PHASES.DEVELOPING], [8, PHASES.ESTABLISHED], [17, PHASES.ESTABLISHED]
  ])('%i games -> %s', (games, phase) => {
    expect(phaseForGames(games)).toBe(phase);
  });

  it('treats a missing count as not started rather than as established', () => {
    expect(phaseForGames(null)).toBe(PHASES.NOT_STARTED);
    expect(phaseForGames(undefined)).toBe(PHASES.NOT_STARTED);
    expect(phaseForGames(NaN)).toBe(PHASES.NOT_STARTED);
  });
});

describe('sample floors', () => {
  it('says nothing when the sample is adequate', () => {
    expect(reliabilityNote(SPLIT_FLOOR)).toBeNull();
    expect(reliabilityNote(120)).toBeNull();
  });

  it('calls a handful of snaps an anecdote', () => {
    expect(reliabilityNote(6)).toMatch(/anecdote/);
  });

  it('calls a thin sample thin without pretending the rate is wrong', () => {
    const note = reliabilityNote(18);
    expect(note).toMatch(/thin sample/);
    expect(note).toMatch(/the rate is real/);
  });

  it('grades every split in a side, leaving adequate ones unmarked', () => {
    const graded = gradeSplits({
      splits: {
        goal_to_go: { plays: 4 },
        early_down: { plays: 800 }
      }
    });
    expect(graded.splits.goal_to_go.reliability).toMatch(/anecdote/);
    expect(graded.splits.early_down.reliability).toBeUndefined();
  });
});

describe('resolving which season may speak', () => {
  const ledgerWith = (weeks) => ({
    games: weeks.map((w) => ({ week: w, starters: { DET: { name: 'J.Goff', share: 1 } } }))
  });

  it('counts a team by the games it appears in', () => {
    expect(gamesPlayedFor(ledgerWith([1, 2, 3]), 'DET')).toBe(3);
    expect(gamesPlayedFor(ledgerWith([1, 2, 3]), 'CHI')).toBe(0);
  });

  it('OPENING WEEKEND: falls back to the prior season and labels it as last year', async () => {
    const load = async (s) => (s === 2026
      ? { unavailable: true, reason: 'not published yet' }
      : ledgerWith([1, 2, 3, 4, 5, 6, 7, 8]));
    const ctx = await resolveSeasonContext(2026, load, ['DET']);

    expect(ctx.basis).toBe('prior_season');
    expect(ctx.ledger).not.toBeNull();
    // The label must name the year the numbers come from, and must say the
    // team may have changed. A prior-season number presented as this season
    // is a lie however well it is computed.
    expect(ctx.note).toMatch(/No 2026 games have been played/);
    expect(ctx.note).toMatch(/2025 season/);
    expect(ctx.note).toMatch(/rosters, coordinators and personnel change/);
  });

  it('WEEK 3: reports the current season but refuses to call it a tendency', async () => {
    const load = async (s) => (s === 2026 ? ledgerWith([1, 2, 3]) : ledgerWith([1, 2, 3, 4, 5]));
    const ctx = await resolveSeasonContext(2026, load, ['DET']);

    expect(ctx.basis).toBe('current_thin');
    expect(ctx.note).toMatch(/Only 3 games/);
    expect(ctx.note).toMatch(/NOT tendencies yet/);
    // The prior season rides alongside so the two can be compared.
    expect(ctx.priorLedger).not.toBeNull();
  });

  it('WEEK 10: the current season stands alone and no prior season is loaded', async () => {
    const seasons = [];
    const load = async (s) => { seasons.push(s); return ledgerWith([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); };
    const ctx = await resolveSeasonContext(2026, load, ['DET']);

    expect(ctx.basis).toBe('current');
    expect(ctx.priorLedger).toBeNull();
    // Loading a prior season nobody will read is a wasted 93MB parse.
    expect(seasons).toEqual([2026]);
  });

  it('uses the THINNER of the two teams, so one fresh team cannot borrow the other authority', async () => {
    const load = async () => ({
      games: [
        { week: 1, starters: { AAA: { name: 'x', share: 1 }, BBB: { name: 'y', share: 1 } } },
        { week: 2, starters: { AAA: { name: 'x', share: 1 } } },
        { week: 3, starters: { AAA: { name: 'x', share: 1 } } },
        { week: 4, starters: { AAA: { name: 'x', share: 1 } } },
        { week: 5, starters: { AAA: { name: 'x', share: 1 } } }
      ]
    });
    const ctx = await resolveSeasonContext(2026, load, ['AAA', 'BBB']);
    expect(ctx.gamesPlayed).toEqual({ AAA: 5, BBB: 1 });
    expect(ctx.phase).toBe(PHASES.EARLY);
  });

  it('says plainly when NEITHER season exists rather than returning a blank', async () => {
    const load = async () => ({ unavailable: true, reason: 'nothing published' });
    const ctx = await resolveSeasonContext(2026, load, ['DET']);
    expect(ctx.basis).toBe('none');
    expect(ctx.ledger).toBeNull();
    expect(ctx.note).toMatch(/No situational data exists/);
  });
});
