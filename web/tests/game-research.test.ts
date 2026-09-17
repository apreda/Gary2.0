import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameResearch } from '@/components/GameResearch';
import type { InsightRow } from '@/lib/gary/types';

const row = (o: Partial<InsightRow>): InsightRow => ({
  id: 1, date: '2026-09-15', league: 'MLB', category: 'hot', headline: 'Bat is hot', detail: null,
  game: 'BOS @ TEX', value: '.410', tone: null, spark: null, line_val: null, relevance_score: 1,
  player_id: null, team_id: null, game_id: '77', result: null, result_note: null, ...o,
});

describe('GameResearch', () => {
  it('links onward to the Hub when rows exist and renders nothing otherwise', () => {
    expect(renderToStaticMarkup(createElement(GameResearch, { rows: [row({})], gameId: '77', matchup: 'Red Sox at Rangers', hubHref: '/hub' }))).toContain('href="/hub"');
    expect(renderToStaticMarkup(createElement(GameResearch, { rows: [row({})], gameId: '99', matchup: 'x', hubHref: '/hub' }))).toBe('');
  });
});
