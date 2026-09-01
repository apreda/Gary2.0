import { describe, expect, it } from 'vitest';
import {
  footballSeasonForDate,
  footballSeasonLabel,
  nflPreseasonContextForGame,
  nflPrimetimeSlot,
  nflPropsDataWindow,
  nflSeasonTypeForGame,
  stampNflPreseasonContext,
} from '../../../src/services/agentic/scoutReport/sports/footballSeason.js';

describe('football season identity', () => {
  it('moves NFL and NCAAF to the new BDL season in August', () => {
    const august = new Date('2026-08-15T16:00:00Z');
    expect(footballSeasonForDate('NFL', august)).toBe(2026);
    expect(footballSeasonForDate('NCAAF', august)).toBe(2026);
  });

  it('keeps January postseason games in the season that began the prior year', () => {
    const january = new Date('2027-01-10T18:00:00Z');
    expect(footballSeasonForDate('americanfootball_nfl', january)).toBe(2026);
    expect(footballSeasonForDate('americanfootball_ncaaf', january)).toBe(2026);
  });

  it('uses Eastern calendar boundaries', () => {
    // The football year opens with July's first exhibition (the Hall of
    // Fame game, Sep 1 2026 fix) — midnight UTC is still June 30 in New York.
    expect(footballSeasonForDate('NFL', '2026-07-01T00:30:00Z')).toBe(2025);
    expect(footballSeasonForDate('NFL', '2026-07-01T16:00:00Z')).toBe(2026);
    // A late-July kickoff belongs to the season it opens, as preseason.
    expect(footballSeasonForDate('NFL', '2026-07-31T00:00:00Z')).toBe(2026);
  });

  it('formats a stable cross-year label', () => {
    expect(footballSeasonLabel(2026)).toBe('2026-27');
  });
});

describe('NFL primetime identity', () => {
  it('recognizes Monday, Thursday, and Sunday night by Eastern weekday', () => {
    expect(nflPrimetimeSlot('2026-09-15T00:15:00Z')).toBe('MNF');
    expect(nflPrimetimeSlot('2026-09-18T00:20:00Z')).toBe('TNF');
    expect(nflPrimetimeSlot('2026-09-21T00:20:00Z')).toBe('SNF');
  });

  it('does not label a Sunday afternoon kickoff as SNF', () => {
    expect(nflPrimetimeSlot('2026-09-20T17:00:00Z')).toBeNull();
  });
});

describe('NFL player-prop evidence windows', () => {
  it('uses current preseason logs plus a labeled prior regular-season baseline', () => {
    const game = {
      season_type: 1,
      commence_time: '2026-08-15T23:00:00Z',
    };

    expect(nflSeasonTypeForGame(game)).toBe(1);
    expect(nflPropsDataWindow(game)).toEqual({
      season: 2026,
      seasonType: 1,
      phase: 'NFL Preseason',
      baselineSeason: 2025,
      baselineLabel: '2025 prior completed regular-season baseline (not current preseason form)',
      recentSeason: 2026,
      recentSeasonType: 1,
      recentLabel: '2026 preseason games only',
    });
  });

  it('honors explicit regular-season metadata even if the date is in August', () => {
    const game = {
      season_type: 2,
      commence_time: '2026-08-30T23:00:00Z',
    };

    expect(nflSeasonTypeForGame(game)).toBe(2);
    expect(nflPropsDataWindow(game).baselineSeason).toBe(2026);
    expect(nflPropsDataWindow(game).recentSeasonType).toBe(2);
  });

  it('keeps legacy August rows preseason-aware when season_type is absent', () => {
    expect(nflSeasonTypeForGame({ commence_time: '2026-08-15T23:00:00Z' })).toBe(1);
  });

  it('stamps stored-card context as preseason instead of regular season or a night slot', () => {
    const game = {
      season_type: 1,
      week: 1,
      commence_time: '2026-08-16T00:00:00Z',
    };

    expect(stampNflPreseasonContext(game)).toEqual({
      tournamentContext: 'NFL Preseason',
      gameSignificance: 'NFL Preseason',
    });
    expect(game).toMatchObject({
      tournamentContext: 'NFL Preseason',
      gameSignificance: 'NFL Preseason',
    });
    expect(nflPreseasonContextForGame({
      season_type: 2,
      commence_time: '2026-09-21T00:20:00Z',
    })).toBeNull();
  });
});
