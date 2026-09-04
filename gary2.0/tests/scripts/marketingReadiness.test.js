import { describe, expect, it } from 'vitest';
import { evaluateMarketingReadiness, formatMarketingReadiness } from '../../scripts/lib/marketingReadiness.js';

const snapshot = () => ({
  checked_at: '2026-09-04T18:45:00Z', et_date: '2026-09-04',
  window: { start_inclusive: '2026-08-21', end_exclusive: '2026-09-04' },
  jobs: [{ jobname: 'social-auto-post-hourly', active: true, last_started_at: '2026-09-04T18:30:00Z', last_sql_status: 'succeeded' },
    { jobname: 'engagement-sheet-daily', active: true }],
  latest_poster_response: { created: '2026-09-04T18:30:20Z', status_code: 200, health: { status: 'ok', issues: [] } },
  engagement: { draft_rows: 8, latest_sheet_date: '2026-09-04' },
  today_picks: [], cohorts: [], daily: [], redirects_separate_sources: [], reply_queue: [],
  waitlist_rows: 0, email_subscriptions: [], retained_poster_responses: 20, retained_degraded_responses: 0,
});

describe('read-only marketing readiness decisions', () => {
  it('a healthy no-game day is ready without assuming paid account balance or audience growth', () => {
    const report = evaluateMarketingReadiness(snapshot());
    expect(report.status).toBe('ready');
    expect(report.exit_code).toBe(0);
    expect(report.current_slate.stored_picks).toBe(0);
    expect(report.measurement_notes.join(' ')).toContain('No X balance');
  });

  it('never mistakes SQL enqueue success for a successful posting request', () => {
    const state = snapshot();
    state.latest_poster_response = null;
    const report = evaluateMarketingReadiness(state);
    expect(report.exit_code).toBe(2);
    expect(report.issues.map((x) => x.code)).toContain('POSTER_RESPONSE_UNVERIFIED');
  });

  it.each([
    ['cron stopped', (s) => { s.jobs[0].active = false; }, 'POSTER_CRON_INACTIVE'],
    ['cron stale', (s) => { s.jobs[0].last_started_at = '2026-09-04T17:59:00Z'; }, 'POSTER_CRON_STALE'],
    ['response stale', (s) => { s.latest_poster_response.created = '2026-09-04T17:59:00Z'; }, 'POSTER_RESPONSE_STALE'],
    ['depleted credits', (s) => { s.latest_poster_response.health = { status: 'degraded', issues: ['X_CREDITS_UNAVAILABLE'] }; }, 'POSTER_DEGRADED'],
    ['stale drafts', (s) => { s.engagement.latest_sheet_date = '2026-08-20'; }, 'ENGAGEMENT_DRAFTS_STALE'],
  ])('%s produces an actionable nonzero result', (_name, change, expected) => {
    const state = snapshot(); change(state);
    const report = evaluateMarketingReadiness(state);
    expect(report.exit_code).toBe(1);
    expect(report.issues.map((x) => x.code)).toContain(expected);
  });

  it('does not demand drafts from a deliberately inactive engagement cron', () => {
    const state = snapshot();
    state.jobs[1].active = false;
    state.engagement.latest_sheet_date = '2026-08-20';
    expect(evaluateMarketingReadiness(state).status).toBe('ready');
  });

  it('counts exact-ticket coverage and retains the strict five-minute deadline', () => {
    const state = snapshot();
    state.today_picks = [
      { pick: 'A', commence_time: '2026-09-04T19:00:00Z', logged: true },
      { pick: 'B', commence_time: '2026-09-04T18:50:00Z', logged: false },
      { pick: 'C', commence_time: '2026-09-04T18:49:59Z', logged: false },
      { pick: 'D', commence_time: null, logged: false },
    ];
    const report = evaluateMarketingReadiness(state);
    expect(report.current_slate).toEqual({ stored_picks: 4, logged_pick_threads: 1, pending_picks: 1, deadline_passed_without_log: 1, missing_or_invalid_start: 1 });
    expect(report).not.toHaveProperty('today_picks');
    expect(report.exit_code).toBe(1);
  });

  it('preserves null metrics, measured denominators, own replies and separate redirect sources', () => {
    const state = snapshot();
    state.cohorts = [{ cohort: 'mature_observed', thread_format: 'standard', posts: 2,
      impressions: 100, measured_impressions: 1, mean_impressions: 100, median_impressions: 100,
      profile_clicks: 0, measured_profile_clicks: 1, bookmarks: 0, measured_bookmarks: 2,
      link_clicks: null, measured_link_clicks: 0, threads_with_own_reply: 1,
      min_observation_days: 5.5, max_observation_days: 6 }];
    state.redirects_separate_sources = [{ source_table: 'legacy_link_clicks', raw_events: 4 }, { source_table: 'web_link_clicks', raw_events: 4 }];
    const report = evaluateMarketingReadiness(state);
    const text = formatMarketingReadiness(report);
    expect(text).toContain('impressions 100 (1/2 measured)');
    expect(text).toContain('profile clicks 0 (1/2 measured)');
    expect(text).toContain('link clicks unavailable (0/2 measured)');
    expect(text).toContain('1 threads include own replies');
    expect(report.redirects_separate_sources).toHaveLength(2);
    expect(report).not.toHaveProperty('total_redirects');
  });
});
