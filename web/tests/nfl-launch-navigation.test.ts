import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ today: '2026-09-07' }));
vi.mock('@/lib/gary/dates', () => ({
  estDateStr: () => fixture.today,
  daysAgoEST: () => '2026-08-08',
}));
vi.mock('@/lib/gary/results', () => ({
  fetchAllGameResults: async () => [],
  sinceDate: () => [],
  computeRecord: () => ({ wins: 0, losses: 0, pushes: 0, graded: 0 }),
}));
vi.mock('@/components/AppStoreButton', () => ({ AppStoreButton: () => null }));
vi.mock('next/navigation', () => ({
  permanentRedirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));

import NflPage from '@/app/nfl/page';

afterEach(() => { fixture.today = '2026-09-07'; });

describe('NFL launch destination', () => {
  it.each([undefined, '1', '0'])('offers the board without an email promise for joined=%s', async joined => {
    const html = renderToStaticMarkup(await NflPage({
      searchParams: Promise.resolve({ joined }),
    }));
    expect(html).toContain('id="notify"');
    expect(html).toContain('Follow the Week 1 board');
    expect(html).toContain('href="/picks/nfl"');
    expect(html).toContain('published picks and their full reasoning');
    expect(html).not.toMatch(/<form\b|type="email"|Send me the first card|email you|on the list/);
  });

  it('keeps the existing kickoff-day redirect to the evergreen board', async () => {
    fixture.today = '2026-09-09';
    await expect(NflPage({ searchParams: Promise.resolve({ joined: '1' }) }))
      .rejects.toThrow('redirect:/picks/nfl');
  });
});
