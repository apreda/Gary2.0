import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const captured = vi.hoisted(() => ({ analytics: null as null | ((e: unknown) => unknown), speed: null as null | ((e: unknown) => unknown) }));
vi.mock('next/dynamic', () => ({ default: (loader: () => Promise<unknown>) => {
  // Resolve synchronously for the test: return a component that records beforeSend.
  const name = loader.toString();
  return (props: { beforeSend: (e: unknown) => unknown }) => { if (name.includes('speed-insights')) captured.speed = props.beforeSend; else captured.analytics = props.beforeSend; return null; };
} }));
vi.mock('next/navigation', () => ({ usePathname: () => '/picks' }));
vi.mock('next/link', () => ({ default: (p: { children: unknown }) => p.children }));
import { renderToStaticMarkup } from 'react-dom/server';

describe('GrowthAnalytics consent gate', () => {
  beforeEach(() => { vi.resetModules(); captured.analytics = null; captured.speed = null; });
  afterEach(() => vi.unstubAllGlobals());
  it('cancels every Vercel event unless consent is granted and the browser is not internal', async () => {
    const consent = await import('@/lib/gary/analytics-consent');
    const { GrowthSignalsForTest } = await import('@/components/GrowthAnalytics');
    vi.stubGlobal('window', Object.assign(new EventTarget(), { location: new URL('https://www.betwithgary.ai/picks') }));
    vi.stubGlobal('document', { cookie: '', visibilityState: 'visible', addEventListener() {}, removeEventListener() {} });
    const local = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => local.get(k) ?? null, setItem: (k: string, v: string) => local.set(k, v), removeItem: (k: string) => local.delete(k), key: () => null, length: 0 });
    renderToStaticMarkup(createElement(GrowthSignalsForTest));
    expect(captured.analytics).toBeTypeOf('function');
    expect(captured.analytics!({ type: 'pageview' })).toBeNull();
    consent.writeAnalyticsConsent('granted');
    expect(captured.analytics!({ type: 'pageview' })).toEqual({ type: 'pageview' });
    consent.writeInternalAnalyticsExclusion(true);
    expect(captured.analytics!({ type: 'pageview' })).toBeNull();
    expect(captured.speed!({ type: 'vital' })).toBeNull();
  });
});
