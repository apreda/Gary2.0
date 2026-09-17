import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NativeGameHeadline } from '@/components/picks/native-headline';

describe('NativeGameHeadline', () => {
  it('carries the team and market as real text beside the fitted SVG', () => {
    const html = renderToStaticMarkup(
      createElement(NativeGameHeadline, {
        team: 'Guardians',
        market: 'Moneyline',
        premium: false,
      }),
    );
    expect(html).toContain('<svg');
    expect(html).toMatch(/<span class="sr-only">Guardians Moneyline<\/span>/);
  });
});
