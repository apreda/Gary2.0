import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoardGrid } from '@/components/board/BoardGrid';

describe('BoardGrid', () => {
  it('ships every full panel in the initial HTML behind a native disclosure', () => {
    const markup = renderToStaticMarkup(
      createElement(BoardGrid, {
        items: [
          {
            key: 'Mariners-Rangers-0',
            label: 'Mariners at Rangers',
            tile: createElement('article', null, 'Mariners at Rangers compact tile'),
            panel: createElement('article', null, 'Gary full server-rendered rationale'),
          },
        ],
      }),
    );

    expect(markup).toContain('Mariners at Rangers compact tile');
    expect(markup).toContain('Gary full server-rendered rationale');
    expect(markup).toMatch(/<details[^>]*><summary/);
    expect(markup).toContain('Open the full card for Mariners at Rangers');
    expect(markup).toContain('aria-controls="board-panel-Mariners-Rangers-0"');
    expect(markup).not.toContain('aria-expanded="false"');
    expect(markup).not.toContain('<button');

    const previewClasses = markup.match(/data-board-preview="true" class="([^"]+)"/)?.[1].split(' ') ?? [];
    expect(previewClasses).not.toContain('hidden');
  });

  it('renders all rationales, not only the first board item', () => {
    const markup = renderToStaticMarkup(
      createElement(BoardGrid, {
        items: ['first', 'second'].map((key, index) => ({
          key,
          label: `${key} matchup`,
          tile: createElement('article', null, `${key} tile`),
          panel: createElement('article', null, `unique rationale ${index + 1}`),
        })),
      }),
    );

    expect(markup).toContain('unique rationale 1');
    expect(markup).toContain('unique rationale 2');
    expect(markup.match(/<details/g)).toHaveLength(2);
  });
});
