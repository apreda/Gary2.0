import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const consent = vi.hoisted(() => ({ granted: false }));
vi.mock('@/lib/gary/analytics-consent', () => ({ hasAnalyticsConsent: () => consent.granted }));
import { logBookMilestone, resetGrowthAnalyticsMemory } from '@/lib/gary/analytics';
const storage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
};
describe('consented Book milestone dispatch', () => {
  beforeEach(() => {
    consent.granted = false;
    resetGrowthAnalyticsMemory();
    vi.stubGlobal('localStorage', storage()); vi.stubGlobal('sessionStorage', storage());
    vi.stubGlobal('window', { location: { href: 'https://www.betwithgary.ai/you', pathname: '/you' } });
    vi.stubGlobal('document', { visibilityState: 'visible', referrer: '' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); resetGrowthAnalyticsMemory(); });
  const sent = () => vi.mocked(fetch).mock.calls.map(call => JSON.parse(call[1]!.body as string));
  it('sends and stores nothing without consent, or from a hidden page', () => {
    logBookMilestone('manual_bet_saved');
    expect(fetch).not.toHaveBeenCalled(); expect(localStorage.getItem('gary_web_id')).toBeNull();
    consent.granted = true; vi.stubGlobal('document', { visibilityState: 'hidden', referrer: '' });
    logBookMilestone('book_opened'); expect(fetch).not.toHaveBeenCalled();
  });
  it('counts each milestone once in a session, starts a fresh session after idle, and sends no bet fields', () => {
    consent.granted = true; vi.useFakeTimers();
    logBookMilestone('book_opened'); logBookMilestone('book_opened');
    logBookMilestone('manual_bet_saved'); logBookMilestone('manual_bet_saved');
    logBookMilestone('manual_bet_settled');
    expect(sent().map(r => r.event)).toEqual(['session_started', 'book_opened', 'manual_bet_saved', 'manual_bet_settled']);
    const firstSession = sent()[0].props.session_id;
    for (const row of sent()) {
      expect(row.props.path).toBe('/you'); expect(row.props.session_id).toBe(firstSession);
      expect(Object.keys(row.props).sort()).toEqual(['first_landing', 'first_medium', 'first_source', 'latest_landing', 'latest_medium', 'latest_source', 'path', 'session_id']);
    }
    vi.advanceTimersByTime(31 * 60 * 1000);
    logBookMilestone('book_opened');
    expect(sent().filter(r => r.event === 'book_opened')).toHaveLength(2);
    expect(sent().at(-1).props.session_id).not.toBe(firstSession);
    consent.granted = false;
    logBookMilestone('manual_bet_saved');
    expect(sent().filter(r => r.event === 'manual_bet_saved')).toHaveLength(1);
  });
});
