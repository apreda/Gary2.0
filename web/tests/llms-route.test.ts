import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/gary/press', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/gary/press')>(),
  liveStats: vi.fn(),
}));

import { GET } from '@/app/llms.txt/route';
import { FREE_OFFER, LAUNCH_OFFER } from '@/lib/gary/launch-offer';
import { BRAND, liveStats } from '@/lib/gary/press';

function expectCurrentProductFacts(body: string) {
  expect(body).toContain(BRAND.boilerplateShort);
  expect(body).toContain(FREE_OFFER);
  expect(body).toContain(LAUNCH_OFFER);
  expect(body).not.toContain('Price: free. Every pick, every day.');
  expect(body).toContain(`- iOS App Store: ${BRAND.appStoreUrl}`);

  const keyPages = body.split('## Key pages\n')[1];
  expect(keyPages).toBeDefined();
  for (const path of ['/picks', '/results', '/pricing', '/winners', '/you']) {
    expect(keyPages).toContain(`- ${BRAND.domain}${path} — `);
  }
}

beforeEach(() => {
  vi.mocked(liveStats).mockReset();
});

describe('public llms.txt response', () => {
  it('publishes the real offer and accurately reports the supplied game-record snapshot', async () => {
    vi.mocked(liveStats).mockResolvedValue({
      asOf: '2026-09-07',
      allTime: { wins: 12, losses: 8, pushes: 1, pct: 60, graded: 21, netUnits: 2.8 },
      l30: { wins: 3, losses: 7, pushes: 0, pct: 30, graded: 10, netUnits: -4.3 },
    });

    const response = await GET();
    const body = await response.text();

    expect(liveStats).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expectCurrentProductFacts(body);
    expect(body).toContain('## Track record (live, as of 2026-09-07)');
    expect(body).toContain('- All-time game picks: 12-8-1 (60% win rate on 21 graded picks)');
    expect(body).toContain('- Last 30 days: 3-7-0 (30%)');
    expect(body).toContain(`- Full graded record: ${BRAND.domain}/results`);
  });

  it('keeps the offer and destinations available without inventing a record or exposing an error', async () => {
    const internalError = 'private-provider-detail: record snapshot unavailable';
    vi.mocked(liveStats).mockRejectedValue(new Error(internalError));

    const response = await GET();
    const body = await response.text();

    expect(liveStats).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expectCurrentProductFacts(body);
    expect(body).not.toContain('## Track record');
    expect(body).not.toContain('- All-time game picks:');
    expect(body).not.toContain('- Last 30 days:');
    expect(body).not.toMatch(/\b\d+-\d+-\d+ \(\d+%/);
    expect(body).not.toContain(internalError);
    expect(body).not.toContain('Error:');
    expect(body).not.toMatch(/\b(?:NaN|undefined)\b/);
  });
});
