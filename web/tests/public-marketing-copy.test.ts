import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/font/google', () => ({
  Barlow_Condensed: () => ({ variable: 'test-barlow' }),
  Inter: () => ({ variable: 'test-inter' }),
  JetBrains_Mono: () => ({ variable: 'test-mono' }),
}));
vi.mock('@/components/Nav', () => ({ Nav: () => null }));
vi.mock('@/components/Footer', () => ({ Footer: () => null }));
vi.mock('@/components/GrowthAnalytics', () => ({ GrowthAnalytics: () => null }));
vi.mock('@/components/BoardDateNotice', () => ({ BoardDateNotice: () => null }));
vi.mock('@/components/AppStoreButton', () => ({ AppStoreButton: () => null }));

import Home, { metadata as homeMetadata } from '@/app/page';
import { metadata as rootMetadata } from '@/app/layout';
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
    expect(text).toContain('New picks appear as analysis is published.');
    expect(text).toContain('Free published game picks, with written reasoning.');
    expect(text).toContain('Published game picks and written reasoning stay free');
    expect(text).not.toMatch(/every game covered|every morning|full slate/i);
    expect(html).toContain('href="/picks"');
    expect(html).toContain('href="/results"');
  });

  it('keeps root and homepage metadata factual without changing app identity or the canonical', () => {
    expect(rootMetadata.title).toBe('Gary AI — Free Sports Picks With Written Reasoning');
    expect(rootMetadata.description).toContain('as analysis is published');
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
    expect(hubMetadata.description).toContain('Results are checked when available');
    expect(hubMetadata.alternates?.canonical).toBe('/hub');
    expect(hubMetadata.openGraph?.description).toBe(hubMetadata.description);
    expect(hubMetadata.twitter?.description).toBe(hubMetadata.description);
  });
});
