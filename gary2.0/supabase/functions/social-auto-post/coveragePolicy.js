// Every published MLB/NFL game pick is eligible; no audience/engagement quota.
export const FULL_COVERAGE_VERSION = 'every-mlb-nfl-v1';
export const fullCoverageLeague = value => ['MLB', 'NFL'].includes(String(value ?? '').toUpperCase());
// The cron runs every five minutes. A four-minute write guard leaves room for
// variable composition latency without accidentally halving the cadence.
export const COVERAGE_POST_GAP_MS = 4 * 60_000;
