'use client';

import { hasAnalyticsConsent } from '@/lib/gary/analytics-consent';
import {
  safeWebEventProperties,
  WEB_EVENTS,
  type AnalyticsPrimitive,
  type WebEvent,
  type WebEventProperties,
} from '@/lib/gary/analytics-schema';

export { WEB_EVENTS };
export type { AnalyticsPrimitive, WebEvent, WebEventProperties };

const IDENTITY_KEY = 'gary_web_id';
const ATTRIBUTION_KEY = 'gary_attribution_v1';
const SESSION_KEY = 'gary_session_v1';
const MEANINGFUL_VIEW_PREFIX = 'gary_meaningful_view_v1:';
const FIRST_BOOK_ACTION_KEY = 'gary_first_book_action_v1';
const SIGNUP_COMPLETED_PREFIX = 'gary_signup_completed_v1:';
const RETURN_VISIT_AFTER_MS = 4 * 60 * 60 * 1_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let documentAttributionCaptured = false;

export type AttributionTouch = {
  source: string;
  medium: string;
  campaign?: string;
  referrer?: string;
  landing: string;
};

type AttributionState = {
  first: AttributionTouch;
  latest: AttributionTouch;
  lastSeenAt: number;
};

const PICK_PATH = /^\/picks\/[a-z0-9-]+\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+\/?$/i;
const EMAIL_LIKE = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/;

function randomUuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}

/** Stable, pseudonymous browser identity. It is never derived from account data. */
export function webIdentity(): string {
  if (typeof window === 'undefined') return randomUuid();
  if (!hasAnalyticsConsent()) return randomUuid();
  try {
    const stored = localStorage.getItem(IDENTITY_KEY);
    if (stored && UUID_V4.test(stored)) return stored;
    const identity = randomUuid();
    localStorage.setItem(IDENTITY_KEY, identity);
    return identity;
  } catch {
    return randomUuid();
  }
}

function cleanToken(value: string | null | undefined, max = 80): string | undefined {
  if (!value || EMAIL_LIKE.test(value)) return undefined;
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, max);
  return clean || undefined;
}

function cleanPath(value: string | null | undefined): string {
  const raw = value?.split(/[?#]/, 1)[0] ?? '/';
  if (!raw.startsWith('/')) return '/';
  try {
    if (EMAIL_LIKE.test(decodeURIComponent(raw))) return '/';
  } catch {
    return '/';
  }
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 240) || '/';
}

function referrerHost(referrer: string | undefined, siteHost: string): string | undefined {
  if (!referrer) return undefined;
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '').slice(0, 253);
    const current = siteHost.toLowerCase().replace(/^www\./, '');
    return host && host !== current ? host : undefined;
  } catch {
    return undefined;
  }
}

function isSearchEngine(host: string): boolean {
  return /(^|\.)(google\.|bing\.com$|duckduckgo\.com$|search\.yahoo\.com$|ecosia\.org$|search\.brave\.com$)/.test(host);
}

/**
 * Reduces a landing URL to campaign tokens, a hostname, and a pathname. Full
 * URLs, query strings, fragments, and account identifiers are never retained.
 */
export function attributionTouch(input: {
  url: string;
  referrer?: string;
  siteHost?: string;
}): AttributionTouch {
  let url: URL;
  try {
    url = new URL(input.url, 'https://www.betwithgary.ai');
  } catch {
    url = new URL('https://www.betwithgary.ai/');
  }

  const siteHost = input.siteHost ?? url.hostname;
  const referrer = referrerHost(input.referrer, siteHost);
  const utmSource = cleanToken(url.searchParams.get('utm_source')) ?? cleanToken(url.searchParams.get('src'));
  const utmMedium = cleanToken(url.searchParams.get('utm_medium'));
  const campaign = cleanToken(url.searchParams.get('utm_campaign'));

  if (utmSource || utmMedium || campaign) {
    return {
      source: utmSource ?? referrer ?? 'campaign',
      medium: utmMedium ?? 'campaign',
      ...(campaign ? { campaign } : {}),
      ...(referrer ? { referrer } : {}),
      landing: cleanPath(url.pathname),
    };
  }

  if (referrer) {
    return {
      source: referrer,
      medium: isSearchEngine(referrer) ? 'organic' : 'referral',
      referrer,
      landing: cleanPath(url.pathname),
    };
  }

  return { source: 'direct', medium: 'none', landing: cleanPath(url.pathname) };
}

function validTouch(value: unknown): value is AttributionTouch {
  if (!value || typeof value !== 'object') return false;
  const touch = value as Partial<AttributionTouch>;
  return (
    typeof touch.source === 'string' &&
    typeof touch.medium === 'string' &&
    typeof touch.landing === 'string' &&
    touch.landing.startsWith('/')
  );
}

function readAttribution(): AttributionState | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return undefined;
    const state = JSON.parse(raw) as Partial<AttributionState>;
    if (!validTouch(state.first) || !validTouch(state.latest) || typeof state.lastSeenAt !== 'number') return undefined;
    return state as AttributionState;
  } catch {
    return undefined;
  }
}

function writeAttribution(state: AttributionState): void {
  try {
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(state));
  } catch {
    // Storage can be disabled. Measurement must never affect the page.
  }
}

function hasExplicitAttribution(url: URL): boolean {
  return ['utm_source', 'utm_medium', 'utm_campaign', 'src'].some(key => url.searchParams.has(key));
}

function flattenedAttribution(state: AttributionState | undefined): WebEventProperties {
  if (!state) return {};
  return {
    first_source: state.first.source,
    first_medium: state.first.medium,
    first_campaign: state.first.campaign,
    first_referrer: state.first.referrer,
    first_landing: state.first.landing,
    latest_source: state.latest.source,
    latest_medium: state.latest.medium,
    latest_campaign: state.latest.campaign,
    latest_referrer: state.latest.referrer,
    latest_landing: state.latest.landing,
  };
}

/** Fire-and-forget tracking through the consent-gated, same-origin web endpoint. */
export function trackWebEvent(event: WebEvent, props: WebEventProperties = {}): void {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) return;
  const merged = safeWebEventProperties(event, { ...flattenedAttribution(readAttribution()), ...props });
  if (!merged) return;

  try {
    void fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Gary-Analytics': '1' },
      body: JSON.stringify({ event, identity: webIdentity(), props: merged }),
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics must never break a user action.
  }
}

/** Backwards-compatible name for existing safe web call sites. */
export const logEvent = trackWebEvent;

export function initializeGrowthAnalytics(pathname: string): void {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) return;
  const now = Date.now();
  const previous = readAttribution();
  const current = attributionTouch({ url: window.location.href, referrer: document.referrer });
  let isNewSession = false;
  try {
    isNewSession = sessionStorage.getItem(SESSION_KEY) !== '1';
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Treat storage-disabled browsers as one ephemeral session per page load.
  }

  const currentUrl = new URL(window.location.href);
  const isFreshExternalEntry = !documentAttributionCaptured && current.referrer !== undefined;
  const shouldRefreshLatest = !previous || isNewSession || hasExplicitAttribution(currentUrl) || isFreshExternalEntry;
  documentAttributionCaptured = true;
  const next: AttributionState = {
    first: previous?.first ?? current,
    latest: shouldRefreshLatest ? current : previous.latest,
    lastSeenAt: now,
  };
  writeAttribution(next);

  const completedSignupMethod = currentUrl.searchParams.get('_gary_signup');
  if (completedSignupMethod === 'email' || completedSignupMethod === 'google') {
    logSignupCompleted(completedSignupMethod);
    currentUrl.searchParams.delete('_gary_signup');
    window.history.replaceState(
      window.history.state,
      '',
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
    );
  }

  if (isNewSession && previous && now - previous.lastSeenAt >= RETURN_VISIT_AFTER_MS) {
    trackWebEvent('return_visit', {
      path: cleanPath(pathname),
      days_since_last_visit: Math.max(0, Math.floor((now - previous.lastSeenAt) / 86_400_000)),
    });
  }

  const clean = cleanPath(pathname);
  if (PICK_PATH.test(clean)) {
    try {
      const key = `${MEANINGFUL_VIEW_PREFIX}${clean}`;
      if (sessionStorage.getItem(key) !== '1') {
        sessionStorage.setItem(key, '1');
        trackWebEvent('meaningful_pick_view', { path: clean, content_type: 'pick' });
      }
    } catch {
      trackWebEvent('meaningful_pick_view', { path: clean, content_type: 'pick' });
    }
  }
}

function handoffSurface(surface: string): string {
  return cleanToken(surface, 64) ?? 'unknown';
}

function handoffPath(surface: string, clickId?: string): string {
  const params = new URLSearchParams({ surface: handoffSurface(surface) });
  if (clickId) {
    params.set('measure', '1');
    params.set('click_id', clickId);
    for (const [key, value] of Object.entries(flattenedAttribution(readAttribution()))) {
      if (value !== undefined) params.set(key, String(value));
    }
  }
  return `/go/app?${params.toString()}`;
}

/** No-JavaScript-safe, first-party App Store handoff URL. */
export function appStoreHandoffPath(surface: string): string {
  return handoffPath(surface);
}

/** Records the handoff and returns the first-party redirect destination. */
export function beginAppStoreHandoff(surface: string, props: WebEventProperties = {}): string {
  const normalizedSurface = handoffSurface(surface);
  if (!hasAnalyticsConsent()) return handoffPath(normalizedSurface);
  const clickId = randomUuid();
  trackWebEvent('app_store_handoff', {
    ...props,
    surface: normalizedSurface,
    click_id: clickId,
    destination: 'app_store',
  });
  return handoffPath(normalizedSurface, clickId);
}

export function logSignupStarted(method: string): void {
  trackWebEvent('signup_started', { method });
}

export function logSignupCompleted(method: string): void {
  if (!hasAnalyticsConsent()) return;
  const normalized = cleanToken(method, 16);
  if (!normalized) return;
  try {
    const key = `${SIGNUP_COMPLETED_PREFIX}${normalized}`;
    if (localStorage.getItem(key) === '1') return;
    localStorage.setItem(key, '1');
  } catch {
    // Keep completion analytics best-effort if local storage is blocked.
  }
  trackWebEvent('signup_completed', { method: normalized });
}

export function logEmailSignupCompleted(cadence: string, source?: string): void {
  trackWebEvent('email_signup_completed', { cadence, source });
}

export function logBookActionStarted(action: string, props: WebEventProperties = {}): void {
  trackWebEvent('book_action_started', { ...props, action });
}

/** Call only after the user's first book action has been persisted successfully. */
export function logFirstBookAction(action: string, props: WebEventProperties = {}): void {
  if (!hasAnalyticsConsent()) return;
  try {
    if (localStorage.getItem(FIRST_BOOK_ACTION_KEY) === '1') return;
    localStorage.setItem(FIRST_BOOK_ACTION_KEY, '1');
  } catch {
    // If storage is unavailable, log the successful action without persistence.
  }
  trackWebEvent('first_book_action', { ...props, action });
}

export function logShareStarted(method: string, props: WebEventProperties = {}): void {
  trackWebEvent('share_started', { ...props, method });
}

export function logShareCompleted(method: string, props: WebEventProperties = {}): void {
  trackWebEvent('share_completed', { ...props, method });
}
