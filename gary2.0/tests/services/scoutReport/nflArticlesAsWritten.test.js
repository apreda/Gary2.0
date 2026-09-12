import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { articleUrl, extractNflArticle, fetchNflArticle, discoverNflArticles, fetchNflArticlesAsWritten,
  renderNflArticles, NFL_ARTICLE_TOPICS } from '../../../src/services/agentic/scoutReport/sports/nflArticlesAsWritten.js';

const asOf = Date.parse('2026-09-12T14:00Z');
const context = { homeTeam: 'Seattle Seahawks', awayTeam: 'New England Patriots', asOf };
const url = 'https://www.seahawks.com/news/a-reported-game';
const paragraphs = Array.from({ length: 12 }, (_, i) => `Paragraph ${i}: The Seahawks and Patriots changed their protection assignments after the opening drive. The reporter described the blocking and coverage adjustments in detail, with attributed comments from players who took part in the game.`);
const html = (date = '2026-09-11T12:00Z', extra = '') => `<html><head><title>The reported game</title>${date ? `<meta property="article:published_time" content="${date}">` : ''}${extra}</head><body><nav>Unrelated links</nav><article><h1>The reported game</h1>${paragraphs.map(p => `<p>${p}</p>`).join('')}<p>FINAL ARTICLE SENTENCE MUST SURVIVE.</p></article></body></html>`;

describe('NFL original article retrieval', () => {
  it('keeps the complete extracted publisher text, provenance and final paragraph', () => {
    const a = extractNflArticle(html(), { ...context, url });
    expect(a.body).toContain(paragraphs[0]);
    expect(a.body).toContain(paragraphs.at(-1));
    expect(a.body).toContain('FINAL ARTICLE SENTENCE MUST SURVIVE.');
    expect(a.body).not.toContain('Unrelated links');
    expect(a.coveredTeams).toEqual([context.homeTeam, context.awayTeam]);
    expect(a.sha256).toHaveLength(64);
    expect(renderNflArticles([{ key: 'last_game', article: a }])).toContain(a.body);
  });
  it('rejects missing, old and future publication dates, and never treats modification as publication', () => {
    for (const date of [null, '2026-08-01T10:00Z', '2026-09-13T10:00Z'])
      expect(() => extractNflArticle(html(date, '<meta property="article:modified_time" content="2026-09-12T10:00Z">'), { ...context, url })).toThrow(/publication date/);
  });
  it('reads JSON-LD publication dates but refuses restricted or unrelated articles', () => {
    const json = accessible => `<script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle', datePublished: '2026-09-11T12:00Z', isAccessibleForFree: accessible })}</script>`;
    expect(extractNflArticle(html(null, json(true)), { ...context, url }).publishedAt).toBe('2026-09-11T12:00:00.000Z');
    expect(() => extractNflArticle(html(null, json(false)), { ...context, url })).toThrow(/restricted/);
    expect(() => extractNflArticle(html().replaceAll('Seahawks', 'Giants').replaceAll('Patriots', 'Jets'), { ...context, url })).toThrow(/either matchup team/);
  });
  it('refuses unapproved hosts, credentials and redirects to private addresses', async () => {
    for (const value of ['http://nfl.com/a', 'https://nfl.com.evil.test/a', 'https://127.0.0.1/a', 'https://user:pass@nfl.com/a']) expect(articleUrl(value)).toBeNull();
    let reads = 0;
    await expect(fetchNflArticle(url, context, { fetchImpl: async () => { reads++; return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } }); } })).rejects.toThrow(/Redirect/);
    expect(reads).toBe(1);
  });
  it('uses the other subscription for failed discovery and never consumes its prose as an article', async () => {
    const urls = await discoverNflArticles(context, { search: async () => ({ success: false }), fallback: async () => ({ success: true, data: 'I will find the dated reports.\n' + JSON.stringify({ topics: NFL_ARTICLE_TOPICS.map(([key]) => ({ key, urls: [url] })) }) }) });
    expect(urls.last_game).toEqual([url]);
  });
  it('persists complete original bodies and reuses a complete dated cache without searches', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'gary-nfl-articles-'));
    try {
      const original = extractNflArticle(html(), { ...context, url });
      let reads = 0, discoveries = 0;
      const options = { cacheDir, discover: async () => { discoveries++; return Object.fromEntries(NFL_ARTICLE_TOPICS.map(([key]) => [key, [url]])); }, fetchArticle: async () => { reads++; return original; } };
      const first = await fetchNflArticlesAsWritten(context, options);
      expect(first.entries).toHaveLength(6); expect(reads).toBe(1);
      const stored = JSON.parse(await readFile(join(cacheDir, (await readdir(cacheDir))[0]), 'utf8'));
      expect(stored.entries[0].article.body).toBe(original.body);
      const second = await fetchNflArticlesAsWritten(context, options);
      expect(second.cached).toBe(true); expect(discoveries).toBe(1);
      expect(second.text).toContain('Full article appears above');
    } finally { await rm(cacheDir, { recursive: true, force: true }); }
  });
  it('shows discovery failures honestly and does not invent coverage', async () => {
    const result = await fetchNflArticlesAsWritten(context, { cacheDir: '/tmp/gary-nfl-absent-cache', discover: async () => { throw new Error('Subscription capacity exhausted'); } });
    expect(result.entries.every(e => !e.article)).toBe(true);
    expect(result.text).toContain('Subscription capacity exhausted');
  });
});
