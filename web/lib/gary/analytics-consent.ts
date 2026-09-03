'use client';

import { useSyncExternalStore } from 'react';

export type AnalyticsConsent = 'granted' | 'declined' | 'undecided';

export const ANALYTICS_CONSENT_KEY = 'gary_analytics_consent_v1';
export const ANALYTICS_CONSENT_EVENT = 'gary:analytics-consent-change';
let inMemoryConsent: Exclude<AnalyticsConsent, 'undecided'> | undefined;

const LOCAL_ANALYTICS_KEYS = [
  'gary_web_id',
  'gary_attribution_v1',
  'gary_first_book_action_v1',
] as const;
const LOCAL_ANALYTICS_PREFIXES = ['gary_signup_completed_v1:'] as const;

const SESSION_ANALYTICS_PREFIXES = [
  'gary_session_v1',
  'gary_meaningful_view_v1:',
  'gary_email_signup_tracked:',
] as const;

export function readAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === 'undefined') return 'undecided';
  try {
    const value = localStorage.getItem(ANALYTICS_CONSENT_KEY);
    if (value === 'granted' || value === 'declined') {
      inMemoryConsent = value;
      return value;
    }
    return inMemoryConsent ?? 'undecided';
  } catch {
    return inMemoryConsent ?? 'undecided';
  }
}

export function hasAnalyticsConsent(): boolean {
  return readAnalyticsConsent() === 'granted';
}

const consentSubscribers = new Set<() => void>();
const notifyConsentSubscribers = () => consentSubscribers.forEach(listener => listener());
const onConsentEvent = () => notifyConsentSubscribers();
const onConsentStorage = (event: StorageEvent) => {
  if (event.key !== ANALYTICS_CONSENT_KEY) return;
  inMemoryConsent = event.newValue === 'granted' || event.newValue === 'declined'
    ? event.newValue
    : undefined;
  notifyConsentSubscribers();
};

function subscribeToAnalyticsConsent(onStoreChange: () => void): () => void {
  consentSubscribers.add(onStoreChange);
  if (consentSubscribers.size === 1) {
    window.addEventListener(ANALYTICS_CONSENT_EVENT, onConsentEvent);
    window.addEventListener('storage', onConsentStorage);
  }
  return () => {
    consentSubscribers.delete(onStoreChange);
    if (consentSubscribers.size === 0) {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, onConsentEvent);
      window.removeEventListener('storage', onConsentStorage);
    }
  };
}

export function useAnalyticsConsent(): AnalyticsConsent | 'loading' {
  return useSyncExternalStore(subscribeToAnalyticsConsent, readAnalyticsConsent, () => 'loading');
}

function removeByPrefixes(storage: Storage, prefixes: readonly string[]): void {
  const matches: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && prefixes.some(prefix => key === prefix || key.startsWith(prefix))) matches.push(key);
  }
  matches.forEach(key => storage.removeItem(key));
}

export function clearGrowthAnalyticsStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    LOCAL_ANALYTICS_KEYS.forEach(key => localStorage.removeItem(key));
    removeByPrefixes(localStorage, LOCAL_ANALYTICS_PREFIXES);
  } catch {
    // A blocked storage API is already equivalent to non-persistent analytics.
  }
  try {
    removeByPrefixes(sessionStorage, SESSION_ANALYTICS_PREFIXES);
  } catch {
    // A blocked storage API is already equivalent to non-persistent analytics.
  }
}

export function writeAnalyticsConsent(consent: Exclude<AnalyticsConsent, 'undecided'>): void {
  if (typeof window === 'undefined') return;
  inMemoryConsent = consent;
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, consent);
  } catch {
    // Keep the in-memory choice for this page; the prompt will return next visit.
  }
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  try {
    document.cookie = `gary_analytics_consent=${consent}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  } catch {
    // Keep honoring the in-memory choice if this context also blocks cookies.
  }
  if (consent === 'declined') clearGrowthAnalyticsStorage();
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: consent }));
}
