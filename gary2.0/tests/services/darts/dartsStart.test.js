import { describe, it, expect } from 'vitest';
import { dartsStartMin } from '../../../src/services/gary/darts/dartsCommon.js';

// Game times in ET (EST after Nov 1 2026, so ET = UTC - 5).
const et = (day, clock) => Date.parse(`${day}T${clock}:00-05:00`);
const at = (h, m = 0) => h * 60 + m;

describe('dartsStartMin', () => {
  it('a normal NBA night starts at 11:00', () => {
    expect(dartsStartMin('NBA', { firstGameMs: et('2026-11-11', '19:00') })).toBe(at(11));
  });
  it('a noon NBA tip starts at 8:30', () => {
    expect(dartsStartMin('NBA', { firstGameMs: et('2026-11-26', '12:00') })).toBe(at(8, 30));
  });
  it('Munich Sunday, 9:30 kickoff, starts NFL at 6:00', () => {
    expect(dartsStartMin('NFL', { firstGameMs: et('2026-11-15', '09:30') })).toBe(at(6));
  });
  it('a normal NFL Sunday, 1 PM kickoff, starts at 10:00', () => {
    expect(dartsStartMin('NFL', { firstGameMs: et('2026-11-22', '13:00') })).toBe(at(10));
  });
  it('a Thursday night game starts at 10:00', () => {
    expect(dartsStartMin('NFL', { firstGameMs: et('2026-11-12', '20:15') })).toBe(at(10));
  });
  it('never before 05:30', () => {
    expect(dartsStartMin('NFL', { firstGameMs: et('2026-11-15', '07:00') })).toBe(at(5, 30));
  });
  it('MLB keeps 05:30, and no first game means the usual time', () => {
    expect(dartsStartMin('MLB', { firstGameMs: et('2026-09-24', '12:10') })).toBe(at(5, 30));
    expect(dartsStartMin('NBA')).toBe(at(11));
  });
  it('the old DARTS_START_ET still sets all three, a league variable over it', () => {
    const env = { DARTS_START_ET: '05:30', DARTS_START_ET_NBA: '12:15' };
    expect(dartsStartMin('MLB', { env })).toBe(at(5, 30));
    expect(dartsStartMin('NFL', { env })).toBe(at(5, 30));
    expect(dartsStartMin('NBA', { env })).toBe(at(12, 15));
    expect(dartsStartMin('NFL', { env: { DARTS_START_ET_NFL: '' } })).toBe(at(10));
  });
});
