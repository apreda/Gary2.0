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

import NflPage, { metadata } from '@/app/nfl/page';

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

  it('describes published coverage and pending results without publication guarantees', async () => {
    const html = renderToStaticMarkup(await NflPage({ searchParams: Promise.resolve({}) }));
    const visibleText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const marketingCopy = [visibleText, metadata.title, metadata.description].join(' ');
    expect(marketingCopy).not.toMatch(/every (?:NFL |MLB )?game|every day all summer|next morning|full (?:summer|daily) slate|first card (?:drops|posts)|waiting for you on September 9/i);
    expect(visibleText).toContain('Coverage and timing can vary by matchup.');
    expect(visibleText).toContain('delayed results stay pending until grading is available');
    expect(visibleText).toContain('NFL kickoff is Patriots at Seahawks, Wednesday September 9.');
    expect(visibleText).toContain('Patriots at Seahawks · 8:20 PM ET');
    expect(visibleText).toContain('MLB, last 30 days · graded game picks');
    expect(visibleText).toContain('all-time game-pick record');
    expect(metadata.description).toContain('picks appear as analysis is published');
    expect(metadata.alternates?.canonical).toBe('/nfl');
    expect(metadata.openGraph?.title).toBe(metadata.title);
    expect(metadata.openGraph?.description).toBe(metadata.description);
    expect(metadata.twitter?.title).toBe(metadata.title);
    expect(metadata.twitter?.description).toBe(metadata.description);
  });
});
