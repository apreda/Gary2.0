import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/Nav', () => ({ Nav: () => null }));
vi.mock('@/components/Footer', () => ({ Footer: () => null }));
vi.mock('@/components/GrowthAnalytics', () => ({ GrowthAnalytics: () => null }));
vi.mock('@/components/BoardDateNotice', () => ({ BoardDateNotice: () => null }));
vi.mock('@/components/AppStoreButton', () => ({ AppStoreButton: () => null }));

import Home, { metadata as homeMetadata } from '@/app/page';
import { metadata as rootMetadata } from '@/app/layout';
import { daysAgoEST } from '@/lib/gary/dates';
import HubPage, { metadata as hubMetadata } from '@/app/hub/page';

afterEach(() => vi.unstubAllGlobals());

function serveEmptyFeeds() {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));
}

function visibleText(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
}

describe('public marketing copy', () => {
  it('renders a publication-aware homepage when the current feeds are empty', async () => {
    serveEmptyFeeds();
    const html = renderToStaticMarkup(await Home());
    const text = visibleText(html);
    expect(text).toContain('Gary’s next calls will appear here when published.');
    expect(text).toContain('Free game &amp; prop picks');
    expect(text).toContain('Game picks. Player props. Gary’s best bets.');
    expect(text).not.toMatch(/every game covered|every morning|full slate/i);
    expect(html).toContain('href="/picks"');
    expect(html).toContain('href="/results"');
  });

  it('labels actual previous-board picks when today is empty', async () => {
    const previousDate=daysAgoEST(1);
    vi.stubGlobal('fetch', vi.fn(async (input:string) => {
      const url=new URL(input);
      return Response.json(url.pathname.endsWith('/daily_picks')&&url.searchParams.get('date')===`eq.${previousDate}`
        ? [{date:previousDate,picks:[{league:'MLB',pick:'Mets ML +108',awayTeam:'Mets',homeTeam:'Marlins',rationale:'The original published take.'}]}] : []);
    }));
    const text=visibleText(renderToStaticMarkup(await Home()));
    expect(text).toContain('PREVIOUS PICKS');
    expect(text).toContain('The original published take.');
    expect(text).not.toContain('calls posted');
  });

  it('keeps root and homepage metadata factual without changing app identity or the canonical', () => {
    expect(rootMetadata.title).toBe('Gary AI — Game Picks, Player Props & Best Bets');
    expect(rootMetadata.description).toContain('his best bets in Winners');
    expect([rootMetadata.title, rootMetadata.description].join(' '))
      .not.toMatch(/every game|every day|full slate/i);
    expect(rootMetadata.itunes?.appId).toBe('6751238914');
    expect(rootMetadata.metadataBase?.toString()).toBe('https://www.betwithgary.ai/');
    expect(homeMetadata.alternates?.canonical).toBe('/');
    expect(homeMetadata.openGraph?.title).toBe(homeMetadata.title);
    expect(homeMetadata.twitter?.description).toBe(homeMetadata.description);
  });

  it('renders availability-aware Hub guidance and consistent social metadata', async () => {
    serveEmptyFeeds();
    const text = visibleText(renderToStaticMarkup(await HubPage()));
    expect(text).toContain('checked against results when available');
    expect(text).toContain('Delayed results can remain pending.');
    expect(text).toContain('Check back as research is published.');
    expect([text, hubMetadata.description].join(' '))
      .not.toMatch(/next morning|every morning|morning research run/i);
    expect(hubMetadata.description).toContain('Gary’s insights and betting connections');
    expect(hubMetadata.alternates?.canonical).toBe('/hub');
    expect(hubMetadata.openGraph?.description).toBe(hubMetadata.description);
    expect(hubMetadata.twitter?.description).toBe(hubMetadata.description);
  });

  it('keeps install and share copy on the approved product language', async () => {
    const { default: manifest } = await import('@/app/manifest');
    expect(manifest().description).not.toMatch(/every game|every day|written reasoning/i);
    expect(manifest().description).toContain('best bets');
    const guide = (await import('node:fs')).readFileSync(new URL('../public/brand/gary-reviewer-guide.txt', import.meta.url), 'utf8');
    expect(guide).toContain('best bets of the day');
    expect(guide).toContain('/hub');
    expect(guide).not.toContain('reviewed selection');
  });
});
