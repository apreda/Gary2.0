import { describe, expect, it } from 'vitest';
import {
  isInterruptedMlbGameStatus,
  isRecoverableMlbGameInterruption,
  normalizeMlbGameStatus,
} from '../../supabase/functions/_shared/mlbGameStatus.js';

describe('MLB game status normalization', () => {
  it.each([
    ['Delayed', 'delayed', 'DELAYED'],
    ['Postponed', 'postponed', 'POSTPONED'],
    ['Suspended', 'suspended', 'SUSPENDED'],
    ['Cancelled', 'cancelled', 'CANCELLED'],
  ])('preserves provider interruption %s', (raw, status, detail) => {
    expect(normalizeMlbGameStatus(raw)).toEqual({ status, detail, interrupted: true });
    expect(isInterruptedMlbGameStatus(status)).toBe(true);
    expect(isRecoverableMlbGameInterruption(status)).toBe(status !== 'cancelled');
  });

  it('prefers a StatsAPI detailed interruption over its abstract live state', () => {
    expect(normalizeMlbGameStatus({
      abstractGameState: 'Live',
      detailedState: 'Delayed',
    })).toEqual({ status: 'delayed', detail: 'DELAYED', interrupted: true });
  });

  it.each([
    ['2026-08-17T23:10:00Z', 'scheduled'],
    ['Pre-Game', 'scheduled'],
    ['In Progress', 'live'],
    ['Final', 'final'],
  ])('normalizes %s as %s', (raw, status) => {
    expect(normalizeMlbGameStatus(raw).status).toBe(status);
  });
});
