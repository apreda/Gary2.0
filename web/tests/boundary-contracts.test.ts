import { describe, expect, it } from 'vitest';
import fixtures from '../../contracts/boundary-fixtures.json';
import { estDateStr, todayEST } from '../lib/gary/dates';

describe('shared Eastern calendar examples', () => {
  it.each(fixtures.calendar)('keeps the correct calendar and slate day at $instant', row => {
    const instant = new Date(row.instant);
    expect(estDateStr(instant)).toBe(row.easternDate);
    expect(todayEST(instant)).toBe(row.slateDate);
  });
});
