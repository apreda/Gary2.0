import { describe, expect, it } from 'vitest';
import { weeklyFunnel, type FunnelEvent } from '@/lib/gary/funnel';
const row = (id: number, browser: string, session: string, at: string, event = 'session_started', extra = {}): FunnelEvent => ({
  id, identity: browser, event, created_at: at, props: { session_id: session, latest_source: 'x', latest_medium: 'social', latest_content: 'game-card', ...extra },
});
describe('weekly consented website funnel', () => {
  it('deduplicates sessions/reads, excludes legacy page loads and measures matured new-browser returns only', () => {
    const rows = [
      row(1, 'old', 'old-start', '2026-08-20T12:00:00Z'), row(2, 'old', 'old-return', '2026-08-31T12:00:00Z'),
      row(3, 'a', 'a1', '2026-08-31T12:00:00Z'), row(4, 'a', 'a1', '2026-08-31T12:00:01Z'),
      row(5, 'a', 'a1', '2026-08-31T12:00:05Z', 'meaningful_pick_view', { measurement_version: 'reasoning_v2' }),
      row(6, 'a', 'a1', '2026-08-31T12:00:06Z', 'meaningful_pick_view', { measurement_version: 'reasoning_v2' }),
      row(7, 'a', 'a2', '2026-09-02T12:00:00Z'),
      row(8, 'b', 'b1', '2026-09-01T12:00:00Z'), row(9, 'b', 'b1', '2026-09-01T12:00:05Z', 'meaningful_pick_view'),
      row(10, 'b', 'b2', '2026-09-01T14:00:00Z'), // same-day return is not retained
      row(11, 'late', 'late1', '2026-09-06T12:00:00Z'),
    ];
    const report = weeklyFunnel(rows, '2026-08-31', '2026-09-10T00:00:00Z');
    expect(report.sessions).toBe(6); expect(report.useful_sessions).toBe(1);
    expect(report.cohort).toMatchObject({ observed_new_browsers: 3, eligible_for_seven_day_return: 2, awaiting_seven_day_window: 1, returned_within_seven_days: 1, seven_day_return_percent: 50, useful_first_session_return_percent: 100 });
    expect(report.channels[0].content).toBe('game-card'); expect(report.small_sample).toBe(true);
    expect(JSON.stringify(report)).not.toContain('a1'); expect(JSON.stringify(report)).not.toContain('identity');
  });
  it('measures manual activation separately, deduplicates milestones and requires a mature Book return', () => {
    const rows = [
      row(1, 'a', 'a1', '2026-08-31T12:00:00Z'),
      row(2, 'a', 'a1', '2026-08-31T12:00:05Z', 'manual_bet_saved'),
      row(3, 'a', 'a1', '2026-08-31T12:00:06Z', 'manual_bet_saved'),
      row(4, 'a', 'a2', '2026-09-02T12:00:00Z'),
      row(5, 'a', 'a2', '2026-09-02T12:00:05Z', 'book_opened'),
      row(6, 'a', 'a2', '2026-09-02T12:00:10Z', 'manual_bet_settled'),
      row(7, 'b', 'b1', '2026-08-31T12:00:00Z'),
      row(8, 'b', 'b1', '2026-08-31T12:00:05Z', 'manual_bet_saved'),
      row(9, 'b', 'b2', '2026-09-02T12:00:00Z'), // a visit elsewhere is not a Book return
      row(10, 'late', 'l1', '2026-09-06T12:00:00Z'),
      row(11, 'late', 'l1', '2026-09-06T12:00:05Z', 'manual_bet_saved'),
      row(12, 'orphan', 'no-session', '2026-09-01T00:00:00Z', 'manual_bet_saved'),
    ];
    const report = weeklyFunnel(rows, '2026-08-31', '2026-09-10T00:00:00Z');
    expect(report.personal_tracking).toEqual({
      book_open_sessions: 1, manual_save_sessions: 3, manual_settlement_sessions: 1,
      observed_first_manual_save_browsers: 3, eligible_for_seven_day_return: 2,
      awaiting_seven_day_window: 1, returned_to_book_within_seven_days: 1,
      seven_day_book_return_percent: 50, small_sample: true,
    });
    expect(report.useful_sessions).toBe(0);
    expect(JSON.stringify(report)).not.toContain('orphan');
  });

  it('does not turn existing manual users, same-day opens or a seven-day-late open into new retained users', () => {
    const rows = [
      row(1, 'old', 'old1', '2026-08-20T12:00:00Z'),
      row(2, 'old', 'old1', '2026-08-20T12:00:01Z', 'manual_bet_saved'),
      row(3, 'old', 'old2', '2026-09-01T12:00:00Z'),
      row(4, 'old', 'old2', '2026-09-01T12:00:01Z', 'manual_bet_saved'),
      row(5, 'a', 'a1', '2026-08-31T12:00:00Z'),
      row(6, 'a', 'a1', '2026-08-31T12:00:01Z', 'manual_bet_saved'),
      row(7, 'a', 'a2', '2026-08-31T14:00:00Z'),
      row(8, 'a', 'a2', '2026-08-31T14:00:01Z', 'book_opened'),
      row(9, 'a', 'a3', '2026-09-07T12:00:01Z'),
      row(10, 'a', 'a3', '2026-09-07T12:00:02Z', 'book_opened'),
    ];
    const report = weeklyFunnel(rows, '2026-08-31', '2026-09-10T00:00:00Z');
    expect(report.personal_tracking.observed_first_manual_save_browsers).toBe(1);
    expect(report.personal_tracking.seven_day_book_return_percent).toBe(0);
    expect(weeklyFunnel([], '2026-08-31', '2026-09-10T00:00:00Z').personal_tracking.seven_day_book_return_percent).toBeNull();
  });

  it('reports null rates for zero or immature cohorts and marks partial weeks', () => {
    const empty = weeklyFunnel([], '2026-08-31', '2026-09-04T12:00:00Z');
    expect(empty.useful_session_percent).toBeNull(); expect(empty.cohort.seven_day_return_percent).toBeNull();
    expect(empty.partial_week).toBe(true);
    expect(() => weeklyFunnel([], '2026-02-30', '2026-09-04T12:00:00Z')).toThrow();
  });

  it('reports acquisition, returning browsers, handoffs, paywall, signups and shares for the week with an X roll-up', () => {
    const rows = [
      row(1, 'a', 'a1', '2026-08-31T12:00:00Z', 'session_started', { latest_landing: '/picks/mlb', first_source: 'google.com', first_medium: 'organic' }),
      row(2, 'a', 'a1', '2026-08-31T12:00:05Z', 'meaningful_pick_view', { measurement_version: 'reasoning_v2' }),
      row(3, 'b', 'b1', '2026-09-01T12:00:00Z', 'session_started', { latest_source: 't.co', latest_medium: 'referral', latest_landing: '/' }),
      row(4, 'old', 'o0', '2026-08-01T12:00:00Z'),
      row(5, 'old', 'o1', '2026-09-02T12:00:00Z', 'session_started', { latest_source: 'direct', latest_medium: 'none' }),
      row(6, 'old', 'o1', '2026-09-02T12:00:01Z', 'return_visit', { path: '/', days_since_last_visit: 32 }),
      row(7, 'a', 'a1', '2026-08-31T12:01:00Z', 'app_store_handoff', { surface: 'game_page_mlb', click_id: 'c1', destination: 'app_store' }),
      row(8, 'a', 'a1', '2026-08-31T12:02:00Z', 'paywall_viewed', { surface: 'web', trigger: 'pricing_page' }),
      row(9, 'a', 'a1', '2026-08-31T12:02:30Z', 'plan_selected', { surface: 'web', plan: 'single', sport: 'mlb', billing: 'monthly' }),
      row(10, 'a', 'a1', '2026-08-31T12:03:00Z', 'signup_started', { method: 'email' }),
      row(11, 'a', 'a1', '2026-08-31T12:04:00Z', 'signup_completed', { method: 'email' }),
      row(12, 'b', 'b1', '2026-09-01T12:05:00Z', 'share_started', { method: 'copy_link', surface: 'matchup_page', content_type: 'pick', path: '/picks/mlb/2026-09-01/a-at-b' }),
      row(13, 'b', 'b1', '2026-09-01T12:05:01Z', 'share_completed', { method: 'copy_link', surface: 'matchup_page', content_type: 'pick', path: '/picks/mlb/2026-09-01/a-at-b' }),
    ];
    const clicks = [{ click_id: 'c1', surface: 'game_page_mlb', ct: 'website', referrer_host: null, latest_source: 'x', latest_medium: 'social', latest_campaign: null, latest_landing: '/picks', created_at: '2026-08-31T12:01:01Z' }];
    const report = weeklyFunnel(rows, '2026-08-31', '2026-09-10T00:00:00Z', clicks);
    expect(report.first_touch_channels.find(c => c.source === 'google.com')).toMatchObject({ source: 'google.com', medium: 'organic', sessions: 1 });
    expect(report.landing_pages.find(l => l.landing === '/picks/mlb')).toMatchObject({ sessions: 1, useful_sessions: 1 });
    expect(report.x_channel).toMatchObject({ sessions: 2 }); // utm x + bare t.co
    expect(report.returning).toEqual({ sessions_from_returning_browsers: 1, return_visit_events: 1 });
    expect(report.app_store).toMatchObject({ handoff_clicks: 1, handoff_sessions: 1, redirects_logged: 1, by_surface: [{ surface: 'game_page_mlb', clicks: 1 }] });
    expect(report.paywall).toMatchObject({ paywall_sessions: 1, plan_selection_clicks: 1, by_plan: [{ plan: 'single', billing: 'monthly', sport: 'mlb', clicks: 1 }] });
    expect(report.signups).toEqual({ signup_started: { email: 1 }, signup_completed: { email: 1 }, email_signup_completed: {} });
    expect(report.shares).toMatchObject({ started: 1, completed: 1 });
    expect(JSON.stringify(report)).not.toContain('c1');
  });
});
