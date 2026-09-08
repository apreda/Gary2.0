import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/gary/gamepage', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/gary/gamepage')>(),
  fetchGameDay: vi.fn(),
  fetchGameProps: vi.fn(),
}));

import GamePage, { generateMetadata } from '@/app/picks/[sport]/[date]/[game]/page';
import { fetchGameDay, fetchGameProps, type GameDay } from '@/lib/gary/gamepage';
import { SITE_URL } from '@/lib/seo/metadata';

const date = '2026-09-07';
const publishedAt = '2026-09-07T14:00:00Z';
const slug = 'red-sox-at-new-york-yankees';
const path = `/picks/mlb/${date}/${slug}`;
const pageUrl = `${SITE_URL}${path}`;
const rationale = 'The matchup and bullpen support this pick.';

function fixture(): GameDay {
  return {
    date, leagueCode: 'MLB', publishedAt, slate: [], results: [],
    picks: [{
      league: 'MLB', awayTeam: 'Red Sox', homeTeam: 'New York Yankees',
      pick: 'Red Sox ML +125', confidence: 0.64, rationale,
      commence_time: '2026-09-07T23:10:00Z',
    }],
  };
}

function params() {
  return Promise.resolve({ sport: 'mlb', date, game: slug });
}

async function renderedPage(day: GameDay) {
  vi.mocked(fetchGameDay).mockResolvedValue(day);
  const html = renderToStaticMarkup(await GamePage({ params: params() }));
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(match => match[1]);
  expect(scripts).toHaveLength(2);
  const nodes = scripts.map(script => JSON.parse(script) as Record<string, unknown>);
  const article = nodes.find(node => node['@type'] === 'Article');
  const breadcrumb = nodes.find(node => node['@type'] === 'BreadcrumbList');
  expect(article).toBeDefined();
  expect(breadcrumb).toBeDefined();
  return { html, scripts, nodes, article: article!, breadcrumb: breadcrumb! };
}

function expectNoEventSchema(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(expectNoEventSchema);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      expect(['location', 'startDate', 'endDate', 'offers']).not.toContain(key);
      if (key === '@type') {
        const types = Array.isArray(child) ? child : [child];
        expect(types).not.toContain('Event');
        expect(types).not.toContain('SportsEvent');
      }
      expectNoEventSchema(child);
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-08T16:00:00Z'));
  vi.mocked(fetchGameProps).mockResolvedValue({ props: [], results: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('permanent game-page JSON-LD', () => {
  it.each([undefined, 'Yankee Stadium'])('describes an Article and teams without event markup when venue is %s', async venue => {
    const day = fixture();
    day.picks[0].venue = venue;
    const { html, nodes, article, breadcrumb } = await renderedPage(day);

    expectNoEventSchema(nodes);
    expect(article).toEqual({
      '@context': 'https://schema.org', '@type': 'Article',
      headline: 'Red Sox at New York Yankees: Red Sox ML',
      description: rationale,
      datePublished: publishedAt, dateModified: publishedAt,
      image: { '@type': 'ImageObject', url: `${pageUrl}/card`, width: 1080, height: 1080 },
      author: { '@type': 'Organization', name: 'Gary AI', url: SITE_URL },
      publisher: {
        '@type': 'Organization', name: 'Gary A.I. LLC', url: SITE_URL,
        logo: { '@type': 'ImageObject', url: `${SITE_URL}/brand/GaryIconBG.png` },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
      isAccessibleForFree: true,
      articleBody: rationale,
      about: [
        { '@type': 'Thing', name: 'Red Sox at New York Yankees' },
        { '@type': 'SportsTeam', name: 'Red Sox' },
        { '@type': 'SportsTeam', name: 'New York Yankees' },
      ],
    });
    expect(breadcrumb).toMatchObject({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Gary AI', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'MLB Baseball', item: `${SITE_URL}/picks/mlb` },
        { '@type': 'ListItem', position: 3, name: 'Mon, Sep 7', item: `${SITE_URL}/picks/mlb/${date}` },
        { '@type': 'ListItem', position: 4, name: 'Red Sox at New York Yankees', item: pageUrl },
      ],
    });
    if (venue) expect(html).toContain(venue);
    expect(html).toContain(rationale);

    const metadata = await generateMetadata({ params: params() });
    expect(metadata.alternates?.canonical).toBe(path);
    expect(metadata.openGraph).toMatchObject({
      type: 'article', url: path, publishedTime: publishedAt, modifiedTime: publishedAt,
      images: [{ url: `${path}/card`, width: 1080, height: 1080, alt: "Red Sox ML — Gary's pick" }],
    });
  });

  it('escapes hostile source text in real script tags while preserving its parsed article body', async () => {
    const day = fixture();
    const hostile = '</script><script>alert("schema-fixture")</script> & matchup context.';
    day.picks[0].rationale = hostile;
    const { html, scripts, article, nodes } = await renderedPage(day);

    expect(article.articleBody).toBe(hostile);
    expect(scripts.join('')).toContain('\\u003c/script\\u003e\\u003cscript\\u003e');
    expect(scripts.join('')).toContain('\\u0026');
    expect(scripts.join('')).not.toMatch(/[<>&]/);
    expect(html.match(/<script\b/g)).toHaveLength(2);
    expect(html).not.toContain(hostile);
    expectNoEventSchema(nodes);
  });

  it('does not invent publication or modification timestamps for an undated historical row', async () => {
    const day = fixture();
    day.publishedAt = null;
    const { html, article } = await renderedPage(day);

    expect(article).not.toHaveProperty('datePublished');
    expect(article).not.toHaveProperty('dateModified');
    expect(html).toContain('an exact publication timestamp is not available');
  });

  it('preserves recorded outcomes without treating the original publication time as a later modification', async () => {
    const day = fixture();
    day.results = [{
      game_date: date, league: 'MLB', matchup: 'Red Sox @ New York Yankees',
      pick_text: 'Red Sox ML +125', result: 'lost', final_score: '2-4', confidence: 0.64,
    }];
    const { html, article } = await renderedPage(day);

    expect(article.datePublished).toBe(publishedAt);
    expect(article).not.toHaveProperty('dateModified');
    expect(html).toContain('native-lost');
    expect(html).toContain('LOST · 2-4');
  });
});
