import { Children, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PicksPage from '@/app/picks/page';
import SportPicksPage from '@/app/picks/[sport]/page';
import PicksError from '@/app/picks/error';
import Home from '@/app/page';
import PageError from '@/app/error';

afterEach(() => vi.unstubAllGlobals());

function serveEmptyExcept(failedTable?: string) {
  const fetchMock = vi.fn(async (input: string) => {
    const table = new URL(input).pathname.split('/').at(-1);
    return table === failedTable
      ? new Response('Unavailable', { status: 503 })
      : Response.json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function elements(node: ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as ReactNode)] : []);
}

describe('pick board recovery', () => {
  it.each(['daily_picks', 'weekly_nfl_picks', 'daily_slate'])(
    'does not turn a failed %s read into a successful empty board', async table => {
      serveEmptyExcept(table);
      await expect(PicksPage()).rejects.toThrow(`PostgREST 503: ${table}`);
      await expect(Home()).rejects.toThrow(`PostgREST 503: ${table}`);
      await expect(SportPicksPage({ params: Promise.resolve({ sport: 'ncaaf' }) }))
        .rejects.toThrow(`PostgREST 503: ${table}`);
    },
  );

  it('renders the historical-reading path when successful reads confirm an empty day', async () => {
    serveEmptyExcept();
    const page = await PicksPage();
    expect(isValidElement(page)).toBe(true);
    expect(elements(page).some(element => element.props.href === '/archive')).toBe(true);
  });

  it('allows a recovered board to render after the previous request failed', async () => {
    serveEmptyExcept('daily_slate');
    await expect(PicksPage()).rejects.toThrow('PostgREST 503');
    serveEmptyExcept();
    expect(isValidElement(await PicksPage())).toBe(true);
    expect(isValidElement(await Home())).toBe(true);
  });

  it('keeps optional results failures from hiding the current board', async () => {
    serveEmptyExcept('game_results');
    expect(isValidElement(await PicksPage())).toBe(true);
  });

  it('does not require live game feeds to show a retired league archive', async () => {
    const fetchMock = serveEmptyExcept('daily_picks');
    const page = await SportPicksPage({ params: Promise.resolve({ sport: 'nhl' }) });
    expect(isValidElement(page)).toBe(true);
    expect(fetchMock.mock.calls.map(([input]) => new URL(input).pathname))
      .not.toContain('/rest/v1/daily_picks');
  });

  it('offers a real server retry and a historical alternative without exposing the feed error', () => {
    const retry = vi.fn();
    const fallback = PicksError({ retry, error: new Error('private provider detail') });
    const markup = renderToStaticMarkup(fallback);
    expect(markup).toContain('Temporary interruption');
    expect(markup).toContain('href="/archive"');
    expect(markup).not.toContain('private provider detail');
    const button = elements(fallback).find(element => element.type === 'button');
    expect(button).toBeDefined();
    (button!.props.onClick as () => void)();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('re-fetches server content when the Home error boundary retries', () => {
    const retry = vi.fn();
    const fallback = PageError({ retry, error: new Error('private provider detail') });
    const button = elements(fallback).find(element => element.type === 'button');
    (button!.props.onClick as () => void)();
    expect(retry).toHaveBeenCalledOnce();
  });
});
