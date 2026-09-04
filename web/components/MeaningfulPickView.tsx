'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useAnalyticsConsent } from '@/lib/gary/analytics-consent';
import { logMeaningfulPickView } from '@/lib/gary/analytics';
import { observeReading } from '@/lib/gary/reading-visibility';

export function MeaningfulPickView({ path, children }: { path: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const consent = useAnalyticsConsent();
  useEffect(() => {
    if (consent !== 'granted' || !ref.current) return;
    return observeReading(ref.current, () => logMeaningfulPickView(path));
  }, [consent, path]);
  return <div ref={ref}>{children}</div>;
}
