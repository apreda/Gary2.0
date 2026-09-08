import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoardGrid } from '@/components/board/BoardGrid';

describe('BoardGrid', () => {
  it('ships every full panel directly without a competing disclosure hit target', () => {
    const markup = renderToStaticMarkup(
      createElement(BoardGrid, {
        items: [
          {
            key: 'Mariners-Rangers-0',
            label: 'Mariners at Rangers',
            panel: createElement('article', null, 'Gary full server-rendered rationale'),
          },
        ],
      }),
    );

    expect(markup).toContain('Gary full server-rendered rationale');
    expect(markup).toContain('aria-label="Mariners at Rangers"');
    expect(markup).not.toContain('<summary');
    expect(markup).not.toContain('<details');

  });

  it('renders all rationales, not only the first board item', () => {
    const markup = renderToStaticMarkup(
      createElement(BoardGrid, {
        items: ['first', 'second'].map((key, index) => ({
          key,
          label: `${key} matchup`,
          panel: createElement('article', null, `unique rationale ${index + 1}`),
        })),
      }),
    );

    expect(markup).toContain('unique rationale 1');
    expect(markup).toContain('unique rationale 2');
    expect(markup.match(/data-board-panel/g)).toHaveLength(2);
  });
});
