import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}
const pick = '/picks/mlb/2026-09-04/nyy-bal';
let local: MemoryStorage, session: MemoryStorage;
const sent = () => vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-04T12:00:00Z'));
  local = new MemoryStorage(); session = new MemoryStorage();
  vi.stubGlobal('localStorage', local); vi.stubGlobal('sessionStorage', session);
  const windowStub = Object.assign(new EventTarget(), {
    location: new URL('https://www.betwithgary.ai/today?utm_source=x&utm_medium=organic_social&utm_campaign=launch&utm_content=game_card'),
    history: { state: null, replaceState: vi.fn() },
  });
  vi.stubGlobal('window', windowStub);
  vi.stubGlobal('document', { referrer: 'https://t.co/private?data=ignore', cookie: '' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('consented useful-session measurement', () => {
  it('does not create identifiers, requests or milestones before consent or after withdrawal', async () => {
    const analytics = await import('@/lib/gary/analytics');
    const consent = await import('@/lib/gary/analytics-consent');
    analytics.initializeGrowthAnalytics(pick); analytics.logMeaningfulPickView(pick);
    expect(sent()).toEqual([]); expect(local.length).toBe(0); expect(session.length).toBe(0);
    consent.writeAnalyticsConsent('granted'); analytics.initializeGrowthAnalytics('/today');
    expect(sent()).toHaveLength(1);
    consent.writeAnalyticsConsent('declined'); analytics.resetGrowthAnalyticsMemory();
    analytics.initializeGrowthAnalytics(pick); analytics.logMeaningfulPickView(pick);
    expect(sent()).toHaveLength(1); expect(local.getItem('gary_web_id')).toBeNull();
    expect(session.length).toBe(0);
  });
  it('separates route visits from actual reasoning and deduplicates game reads within a session', async () => {
    local.setItem('gary_analytics_consent_v1', 'granted');
    const analytics = await import('@/lib/gary/analytics');
    analytics.initializeGrowthAnalytics(pick); analytics.initializeGrowthAnalytics(pick);
    expect(sent().map(e => e.event)).toEqual(['session_started']);
    analytics.logMeaningfulPickView(pick); analytics.logMeaningfulPickView(pick);
    analytics.resetGrowthAnalyticsMemory(); // same tab reload retains session+read guard
    analytics.logMeaningfulPickView(pick);
    expect(sent().map(e => e.event)).toEqual(['session_started', 'meaningful_pick_view']);
    expect(sent()[1].props).toMatchObject({ measurement_version: 'reasoning_v2', latest_content: 'game_card' });
    expect(sent()[0].props.session_id).toBe(sent()[1].props.session_id);
    expect(JSON.stringify(sent())).not.toContain('private?');
  });
  it('records a return in the same tab and allows a fresh-session reading without counting route changes as sessions', async () => {
    local.setItem('gary_analytics_consent_v1', 'granted');
    const analytics = await import('@/lib/gary/analytics');
    analytics.initializeGrowthAnalytics('/today'); analytics.logMeaningfulPickView(pick);
    vi.advanceTimersByTime(5 * 60_000); analytics.initializeGrowthAnalytics('/picks/mlb');
    expect(sent().filter(e => e.event === 'session_started')).toHaveLength(1);
    vi.advanceTimersByTime(25 * 60 * 60_000);
    analytics.initializeGrowthAnalytics('/today'); analytics.initializeGrowthAnalytics('/today');
    analytics.logMeaningfulPickView(pick);
    expect(sent().filter(e => e.event === 'session_started')).toHaveLength(2);
    expect(sent().filter(e => e.event === 'return_visit')).toHaveLength(1);
    expect(sent().filter(e => e.event === 'meaningful_pick_view')).toHaveLength(2);
    expect(new Set(sent().filter(e => e.event === 'session_started').map(e => e.props.session_id)).size).toBe(2);
    expect(new Set(sent().map(e => e.identity)).size).toBe(1);
  });
  it('deduplicates when browser storage is unavailable and refuses a non-pick path', async () => {
    const consent = await import('@/lib/gary/analytics-consent');
    consent.writeAnalyticsConsent('granted');
    vi.spyOn(local, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(session, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(session, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const analytics = await import('@/lib/gary/analytics');
    analytics.logMeaningfulPickView('/today'); analytics.logMeaningfulPickView(pick); analytics.logMeaningfulPickView(pick);
    expect(sent().map(e => e.event)).toEqual(['session_started', 'meaningful_pick_view']);
    expect(new Set(sent().map(e => e.identity)).size).toBe(1);
  });
});
