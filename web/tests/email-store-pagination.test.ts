import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { listCampaignSubscriptions, type EmailSubscription } from '@/lib/email/store';

function subscriptionId(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('campaign subscription pagination', () => {
  it('does not skip or revisit recipients when send timestamps change after page one', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://gary.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key');

    const rows: EmailSubscription[] = Array.from({ length: 1_505 }, (_, index) => ({
      id: subscriptionId(index + 1),
      email: `subscriber-${index + 1}@example.com`,
      cadence: 'both',
      sports: [],
      status: 'active',
      consented_at: '2026-09-01T00:00:00.000Z',
      last_daily_sent_at: null,
      last_weekly_sent_at: null,
    }));

    let requestCount = 0;
    const requestedUrls: URL[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      requestCount += 1;
      const url = new URL(String(input));
      requestedUrls.push(url);

      const order = url.searchParams.get('order') ?? 'id.asc';
      const afterId = url.searchParams.get('id')?.replace(/^gt\./, '') ?? null;
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 1_000);
      const eligible = rows.filter(row => row.status === 'active' && ['daily', 'both'].includes(row.cadence));

      eligible.sort((left, right) => {
        if (order.startsWith('last_daily_sent_at')) {
          const leftSent = left.last_daily_sent_at ?? '';
          const rightSent = right.last_daily_sent_at ?? '';
          return leftSent.localeCompare(rightSent) || left.id.localeCompare(right.id);
        }
        return left.id.localeCompare(right.id);
      });

      const cursorPage = afterId ? eligible.filter(row => row.id > afterId) : eligible;
      const page = cursorPage.slice(offset, offset + limit);
      const body = JSON.stringify(page);

      // Successful sends update this field while a campaign is running. An
      // OFFSET query ordered by this field would now shift page membership.
      if (requestCount === 1) {
        for (const row of page) row.last_daily_sent_at = '2026-09-03T18:00:00.000Z';
      }

      return new Response(body, { status: 200 });
    }));

    const subscriptions = await listCampaignSubscriptions('daily_board');
    const ids = subscriptions.map(subscription => subscription.id);

    expect(ids).toHaveLength(rows.length);
    expect(new Set(ids).size).toBe(rows.length);
    expect(ids).toEqual(rows.map(row => row.id).sort());
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls.every(url => url.searchParams.get('order') === 'id.asc')).toBe(true);
    expect(requestedUrls.every(url => !url.searchParams.has('offset'))).toBe(true);
    expect(requestedUrls[1].searchParams.get('id')).toBe(`gt.${subscriptionId(1_000)}`);
  });
});
