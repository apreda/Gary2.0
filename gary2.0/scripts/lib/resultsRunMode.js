const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const FOOTBALL_SETTLEMENT_SPORTS = Object.freeze(['NFL', 'NCAAF']);

/**
 * Parse run-all-results flags without making a mode flag occupy the historical
 * positional date slot. A manual repair can therefore use either order:
 *
 *   node scripts/run-all-results.js --football-settlements 2026-09-12
 *   node scripts/run-all-results.js 2026-09-12 --football-settlements
 */
export function parseResultsRunArgs(argv = []) {
  const args = Array.isArray(argv) ? argv.map((value) => String(value)) : [];
  return {
    footballSettlements: args.includes('--football-settlements'),
    explicitDate: args.find((value) => DATE_RE.test(value)) ?? null,
  };
}

/**
 * Settle every requested football slate in chronological order. A failure on
 * one date is retained, but cannot prevent the remaining date(s) from being
 * attempted. The aggregate is thrown only after the complete batch runs so a
 * transient issue on today's slate cannot strand yesterday's late finals.
 */
export async function runFootballSettlementDates(dates, settleDate) {
  if (!Array.isArray(dates) || typeof settleDate !== 'function') {
    throw new TypeError('Football settlement dates and settleDate callback are required');
  }

  const orderedDates = [...new Set(dates.map((date) => String(date)))].sort();
  const failures = [];

  for (const date of orderedDates) {
    try {
      await settleDate(date);
    } catch (error) {
      failures.push({ date, error });
    }
  }

  if (failures.length) {
    const failedDates = failures.map(({ date }) => date).join(', ');
    const aggregate = new AggregateError(
      failures.map(({ error }) => error),
      `Football settlement failed for ${failedDates}`,
    );
    aggregate.settlementFailures = failures;
    throw aggregate;
  }

  return orderedDates;
}

/** Return the Tuesday start key used by weekly_nfl_picks for a Tue–Mon ET week. */
export function nflWeekStartForDate(date) {
  if (!DATE_RE.test(String(date ?? ''))) {
    throw new Error(`Invalid results date: ${date}`);
  }

  const [year, month, dayOfMonth] = String(date).split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, dayOfMonth));
  const weekday = value.getUTCDay(); // Sunday=0, Monday=1, Tuesday=2
  const daysSinceTuesday = (weekday - 2 + 7) % 7;
  value.setUTCDate(value.getUTCDate() - daysSinceTuesday);
  return value.toISOString().slice(0, 10);
}

export function normalizedDataSport(sport) {
  const normalized = String(sport ?? '').trim().toUpperCase();
  return normalized === 'MLB HR' ? 'MLB' : normalized;
}

export function sportAllowed(sport, allowedSports = null) {
  if (!allowedSports) return true;
  return allowedSports.has(normalizedDataSport(sport));
}
