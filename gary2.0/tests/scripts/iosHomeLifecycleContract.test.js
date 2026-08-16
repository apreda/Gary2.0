import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const views = readFileSync(new URL('../../../ios/GaryApp/Views.swift', import.meta.url), 'utf8');
const homeView = views.slice(
  views.indexOf('struct HomeView: View'),
  views.indexOf('struct HomeContentPlaceholder: View'),
);

describe('iOS Home cold-launch lifecycle', () => {
  it('lets the initial keyed load finish before scene activation can request a refresh', () => {
    expect(homeView).toContain('@State private var hasCompletedInitialHomeLoad = false');
    expect(homeView).toContain('if !Task.isCancelled { hasCompletedInitialHomeLoad = true }');
    expect(homeView).toContain('guard phase == .active, hasCompletedInitialHomeLoad else { return }');
    expect(homeView).not.toContain('if phase == .active { homeNonce &+= 1 }');
  });

  it('preserves the existing pull, foreground, and rollover refresh entry points', () => {
    expect(homeView.match(/homeNonce &\+= 1/g)).toHaveLength(3);
    expect(homeView).toContain('.refreshable {\n                homeNonce &+= 1');
    expect(homeView).toContain('guard phase == .active, hasCompletedInitialHomeLoad else { return }');
    expect(homeView).toContain('loadedSlateDate != SupabaseAPI.todayEST() else { return }');
  });

  it('keeps the receipt once-per-day guard and dismissal ledger intact', () => {
    expect(homeView).toContain('@AppStorage("dailyRecapShownDate") private var dailyRecapShownDate = ""');
    expect(homeView).toContain('guard selectedTab == 0, available > 0, dailyRecapShownDate != key else { return }');
    expect(homeView).toContain('dailyRecapShownDate = SupabaseAPI.todayEST()');
  });
});
