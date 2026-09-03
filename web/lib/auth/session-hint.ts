'use client';

import { useSyncExternalStore } from 'react';

const AUTH_HINT_EVENT = 'gary:auth-hint-change';

/**
 * Presentation-only session hint. Supabase SSR auth cookies are intentionally
 * browser-readable; values stay untouched and real authorization remains on
 * Supabase/RLS. A stale hint can only change link copy, never grant access.
 */
export function hasSupabaseSessionHint(cookieHeader: string): boolean {
  return cookieHeader.split(';').some(part => {
    const name = part.trim().split('=', 1)[0] ?? '';
    return /^sb-.+-auth-token(?:\.\d+)?$/.test(name);
  });
}

export function announceSessionHintChanged(): void {
  window.dispatchEvent(new Event(AUTH_HINT_EVENT));
}

const subscribers = new Set<() => void>();
const notifySubscribers = () => subscribers.forEach(listener => listener());

const subscribe = (listener: () => void) => {
  subscribers.add(listener);
  if (subscribers.size === 1) {
    window.addEventListener(AUTH_HINT_EVENT, notifySubscribers);
  }
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) {
      window.removeEventListener(AUTH_HINT_EVENT, notifySubscribers);
    }
  };
};

const readBrowserHint = () => hasSupabaseSessionHint(document.cookie);
const readServerHint = () => false;

export function useSupabaseSessionHint(): boolean {
  return useSyncExternalStore(subscribe, readBrowserHint, readServerHint);
}
