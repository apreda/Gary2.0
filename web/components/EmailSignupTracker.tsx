'use client';

import { useEffect } from 'react';
import { logEmailSignupCompleted } from '@/lib/gary/analytics';
import { useAnalyticsConsent } from '@/lib/gary/analytics-consent';

export function EmailSignupTracker({ cadence, source }: { cadence: string; source: string }) {
  const consent = useAnalyticsConsent();

  useEffect(() => {
    if (consent !== 'granted') return;
    const key = `gary_email_signup_tracked:${cadence}:${source}`;
    try {
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
    } catch {
      // Analytics remains best-effort when browser storage is disabled.
    }
    logEmailSignupCompleted(cadence, source);
  }, [cadence, consent, source]);

  return null;
}
