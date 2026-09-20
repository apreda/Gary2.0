import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { estDateStr, todayEST } from '../lib/gary/dates';

// Load repository test data only when Vitest executes. A standalone web build
// typechecks test files too, but must not require files outside its build root.
const fixtures: { calendar: { instant: string; easternDate: string; slateDate: string }[] } =
  JSON.parse(readFileSync(new URL('../../contracts/boundary-fixtures.json', import.meta.url), 'utf8'));

describe('shared Eastern calendar examples', () => {
  it.each(fixtures.calendar)('keeps the correct calendar and slate day at $instant', row => {
    const instant = new Date(row.instant);
    expect(estDateStr(instant)).toBe(row.easternDate);
    expect(todayEST(instant)).toBe(row.slateDate);
  });
});
