import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/EmailSignup', () => ({ EmailSignup: () => null }));

import { Footer } from '@/components/Footer';

describe('Product Hunt website promotion', () => {
  it('links to the existing product using its official badge attribution', () => {
    const html = renderToStaticMarkup(createElement(Footer));
    expect(html).toContain('href="https://www.producthunt.com/products/gary-ai?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-gary-ai"');
    expect(html).toContain('alt="Find Gary AI on Product Hunt"');
    expect(html).not.toMatch(/#1|top product|vote for|featured on|launching today/i);
  });

  it('reserves badge space, loads lazily and does not send the page URL', () => {
    const html = renderToStaticMarkup(createElement(Footer));
    const badge = html.match(/<img[^>]*alt="Find Gary AI on Product Hunt"[^>]*>/)?.[0];
    expect(badge).toBeDefined();
    expect(badge).toContain('width="250"');
    expect(badge).toContain('height="54"');
    expect(badge).toContain('loading="lazy"');
    expect(badge).toContain('referrerPolicy="no-referrer"');
    expect(badge).toContain('src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1244756&amp;theme=dark"');
    expect(badge).not.toContain('/_next/image');
    expect(html).not.toMatch(/<iframe|<script|rel="preload"[^>]*producthunt/i);
  });

  it('preserves the public-record explanation and informational safeguards', () => {
    const html = renderToStaticMarkup(createElement(Footer));
    expect(html).toContain('public game-pick record');
    expect(html).toContain('Player props are reported separately');
    expect(html).toContain('informational and entertainment purposes only');
    expect(html).toContain('1-800-GAMBLER');
  });
});
