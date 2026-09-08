'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useAnalyticsConsent } from '@/lib/gary/analytics-consent';
import { logMeaningfulPickView } from '@/lib/gary/analytics';
import { observeReading } from '@/lib/gary/reading-visibility';

export function MeaningfulPickView({ path, children, enabled=true }: { path: string; children: ReactNode; enabled?:boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const consent = useAnalyticsConsent();
  useEffect(() => {
    if (!enabled || consent !== 'granted' || !ref.current) return;
    return observeReading(ref.current, () => logMeaningfulPickView(path));
  }, [consent, path, enabled]);
  return <div ref={ref}>{children}</div>;
}
