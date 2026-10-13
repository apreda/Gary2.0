import { describe, expect, it } from 'vitest';
import { readIosViewsSource } from '../helpers/iosViewsSource.js';

const views = readIosViewsSource();
const homeView = views.slice(
  views.indexOf('struct HomeView: View'),
  views.indexOf('struct HomeContentPlaceholder: View'),
);

describe('iOS Home cold-launch lifecycle', () => {
  it('lets the initial keyed load finish before scene activation can request a refresh', () => {
    expect(homeView).toContain('@State private var hasCompletedInitialHomeLoad = false');
    // The owner's defer marks the first load complete (and, since Oct 7 2026,
    // counts a missed refresh) only while it still owns the request.
    expect(homeView).toMatch(
      /if canPublish\(\) \{\s+hasCompletedInitialHomeLoad = true\s+homeMissedRefreshes = homeSourceFailures\.isEmpty \? 0 : homeMissedRefreshes \+ 1\s+\}/,
    );
    // Scene activation refreshes only after the first keyed load, and only
    // while Home is the selected tab (Oct 3 2026).
    expect(homeView).toContain('guard phase == .active, selectedTab == 0, hasCompletedInitialHomeLoad else { return }');
    expect(homeView).not.toContain('if phase == .active { homeNonce &+= 1 }');
  });

  it('preserves the existing pull, foreground, and rollover refresh entry points', () => {
    // Every full-refresh entry point, each named below: pull, scene
    // activation, the return to the Home tab, the rolling timer after a
    // failed source, the slate rollover timer, the board's retry button,
    // Tomorrow's retry, and the owner's own restart across 6 a.m.
    expect(homeView.match(/homeNonce &\+= 1/g)).toHaveLength(8);
    expect(homeView).toMatch(/\.refreshable \{\s+homeNonce &\+= 1/);
    expect(homeView).toMatch(/guard phase == \.active, selectedTab == 0, hasCompletedInitialHomeLoad else \{ return \}\s+homeNonce &\+= 1/);
    expect(homeView).toMatch(/if loadedSlateDate != SupabaseAPI\.todayEST\(\) \|\| !homeSourceFailures\.isEmpty \{\s+homeNonce &\+= 1/);
    expect(homeView).toContain('if (!homeSourceFailures.isEmpty || tomorrowFailed), fullHomeRefreshNonce == nil { homeNonce &+= 1 }');
    expect(homeView).toContain('loadedSlateDate != SupabaseAPI.todayEST(),');
    expect(homeView).toContain('Button("Couldn\'t refresh the board · Tap to retry") { homeNonce &+= 1 }');
    expect(homeView).toContain('onRetry: { homeNonce &+= 1 }');
    expect(homeView).toMatch(/accountID == homeAuth\.currentUser\?\.id, date != SupabaseAPI\.todayEST\(\) \{\s+homeNonce &\+= 1/);
  });

  it('keeps the receipt once-per-day guard and dismissal ledger intact', () => {
    expect(homeView).toContain('@AppStorage("dailyRecapShownDate") private var dailyRecapShownDate = ""');
    // An open receipt is never stacked, and "seen" is written when the fan
    // closes it, not when it appears (founder, Oct 9 2026).
    expect(homeView).toContain('guard selectedTab == 0, available > 0, dailyRecapShownDate != key, !showDailyRecap else { return }');
    expect(homeView).toMatch(/private func closeDailyRecap\(\) \{\s+dailyRecapShownDate = SupabaseAPI\.todayEST\(\)/);
  });
});
