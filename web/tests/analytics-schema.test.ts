import { describe, expect, it } from 'vitest';
import {
  isSameOriginAnalyticsRequest,
  parseWebEventPayload,
  safeWebEventProperties,
} from '@/lib/gary/analytics-schema';

const identity = 'c53b8823-9e0f-40a3-8f17-685c3f19496d';

describe('website analytics schema', () => {
  it('accepts a closed, privacy-safe conversion event', () => {
    expect(
      parseWebEventPayload({
        event: 'first_book_action',
        identity,
        props: {
          action: 'tail',
          content_type: 'game',
          item_id: 'nba:2026-09-03:bos-at-nyk',
          first_source: 'google.com',
          first_medium: 'organic',
          first_landing: '/picks/nba',
        },
      }),
    ).toEqual({
      event: 'first_book_action',
      identity,
      props: {
        action: 'tail',
        content_type: 'game',
        item_id: 'nba:2026-09-03:bos-at-nyk',
        first_source: 'google.com',
        first_medium: 'organic',
        first_landing: '/picks/nba',
      },
    });
  });

  it('rejects unknown fields, PII-like values, and invalid conversion semantics', () => {
    expect(parseWebEventPayload({ event: 'signup_completed', identity, props: { method: 'apple' } })).toBeNull();
    expect(parseWebEventPayload({ event: 'signup_completed', identity, props: { method: 'email', email: 'fan@example.com' } })).toBeNull();
    expect(parseWebEventPayload({ event: 'share_completed', identity, props: { method: 'native' } })).toBeNull();
  });

  it('drops invalid optional client values but never invents required fields', () => {
    expect(
      safeWebEventProperties('email_signup_completed', {
        cadence: 'daily',
        source: 'fan@example.com',
        status: 'active',
      }),
    ).toEqual({ cadence: 'daily' });
    expect(safeWebEventProperties('signup_started', { source: 'home' })).toBeNull();
  });

  it('accepts only marked same-origin JSON browser posts', () => {
    const request = (origin: string, fetchSite = 'same-origin', marker = '1') =>
      new Request('https://www.betwithgary.ai/api/analytics/event', {
        method: 'POST',
        headers: {
          origin,
          'content-type': 'application/json',
          'sec-fetch-site': fetchSite,
          'x-gary-analytics': marker,
        },
      });

    expect(isSameOriginAnalyticsRequest(request('https://www.betwithgary.ai'))).toBe(true);
    expect(isSameOriginAnalyticsRequest(request('https://attacker.example', 'cross-site'))).toBe(false);
    expect(isSameOriginAnalyticsRequest(request('https://www.betwithgary.ai', 'same-origin', '0'))).toBe(false);
  });
});
