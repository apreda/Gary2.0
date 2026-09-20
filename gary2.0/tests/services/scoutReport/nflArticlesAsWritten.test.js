import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { articleUrl, extractNflArticle, fetchNflArticle, discoverNflArticles, fetchNflArticlesAsWritten,
  renderNflArticles, NFL_ARTICLE_TOPICS, topicMaxAgeMs } from '../../../src/services/agentic/scoutReport/sports/nflArticlesAsWritten.js';
import { articleTopics, validateTopicArticle } from '../../../src/services/agentic/scoutReport/sports/nflArticleTopics.js';

const asOf = Date.parse('2026-09-12T14:00Z');
const context = { homeTeam: 'Seattle Seahawks', awayTeam: 'New England Patriots', asOf };
const url = 'https://www.seahawks.com/news/a-reported-game';
const paragraphs = Array.from({ length: 12 }, (_, i) => `Paragraph ${i}: The Seahawks and Patriots changed their protection assignments after the opening drive. The reporter described the blocking and coverage adjustments in detail, with attributed comments from players who took part in the game.`);
const html = (date = '2026-09-11T12:00Z', extra = '') => `<html><head><title>The reported game</title>${date ? `<meta property="article:published_time" content="${date}">` : ''}${extra}</head><body><nav>Unrelated links</nav><article><h1>The reported game</h1>${paragraphs.map(p => `<p>${p}</p>`).join('')}<p>FINAL ARTICLE SENTENCE MUST SURVIVE.</p></article></body></html>`;

describe('NFL original article retrieval', () => {
  it('has distinct last-game, offense and defense slots for each team', () => {
    const topics = articleTopics(context);
    for (const side of ['home', 'away']) for (const category of ['last_game', 'offense', 'defense']) {
      const topic = topics.find(t => t.key === `${side}_${category}`);
      expect(topic.team).toBe(context[`${side}Team`]);
      expect(topic.label).toContain(context[`${side}Team`]);
    }
  });

  it('cannot fill one team’s scheme section using only the other team’s report', () => {
    const article = extractNflArticle(html().replaceAll('Patriots', 'Jaguars'), { ...context, url });
    const topics = articleTopics(context);
    expect(() => validateTopicArticle(article, topics.find(t => t.key === 'home_offense'))).not.toThrow();
    expect(() => validateTopicArticle(article, topics.find(t => t.key === 'away_offense'))).toThrow('does not cover New England Patriots');
  });

  it('rejects the wrong opponent or an article published before the last completed game', () => {
    const article = extractNflArticle(html(), { ...context, url });
    const topic = articleTopics({ ...context, lastGames: {home:{opponent:'Cincinnati Bengals',date:'2026-09-10'}} })[0];
    expect(() => validateTopicArticle(article, topic)).toThrow('does not identify opponent');
    topic.lastGame = { opponent:'New England Patriots', date:'2026-09-12' };
    expect(() => validateTopicArticle(article, topic)).toThrow('predates');
  });

  it('keeps the complete extracted publisher text, provenance and final paragraph', () => {
    const a = extractNflArticle(html(), { ...context, url });
    expect(a.body).toContain(paragraphs[0]);
    expect(a.body).toContain(paragraphs.at(-1));
    expect(a.body).toContain('FINAL ARTICLE SENTENCE MUST SURVIVE.');
    expect(a.body).not.toContain('Unrelated links');
    expect(a.body).toContain(`${paragraphs[0]}\n\n${paragraphs[1]}`);
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
    expect(urls.home_last_game).toEqual([url]);
  });
  it('persists complete original bodies and reuses a complete dated cache without searches', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'gary-nfl-articles-'));
    try {
      const original = extractNflArticle(html(), { ...context, url });
      let reads = 0, discoveries = 0;
      const options = { cacheDir, discover: async () => { discoveries++; return Object.fromEntries(NFL_ARTICLE_TOPICS.map(([key]) => [key, [url]])); }, fetchArticle: async () => { reads++; return original; } };
      const first = await fetchNflArticlesAsWritten(context, options);
      // One entry per topic; four distinct publication/coverage policies.
      // The in-run dedupe is keyed by url + age limit + matchup-team rule, so a
      // read can never be handed to a topic with stricter terms. The three
      // buckets include scheme reporting (120 days), recency (14 days, must name a matchup team), standing
      // (two years, must name one), and opponent_quality (two years, need not —
      // it is about the PREVIOUS OPPONENT, a third team).
      expect(first.entries).toHaveLength(NFL_ARTICLE_TOPICS.length);
      expect(reads).toBe(4);
      const stored = JSON.parse(await readFile(join(cacheDir, (await readdir(cacheDir))[0]), 'utf8'));
      expect(stored.entries[0].article.body).toBe(original.body);
      const second = await fetchNflArticlesAsWritten(context, options);
      expect(second.cached).toBe(true); expect(discoveries).toBe(1);
      expect(second.text).toContain('Full article appears above');
    } finally { await rm(cacheDir, { recursive: true, force: true }); }
  });
  it('retries failed team reporting once with focused topics and preserves successful articles', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'gary-nfl-article-retry-'));
    try {
      const original = extractNflArticle(html(), { ...context, url });
      const badUrl = 'https://www.seahawks.com/news/old-offense';
      const queries = [];
      const result = await fetchNflArticlesAsWritten(context, {
        cacheDir,
        discover: async (_context, options) => {
          queries.push(options);
          return options.requestedKeys ? {home_offense:[url]} : Object.fromEntries(NFL_ARTICLE_TOPICS.map(([key]) => [key, [key === 'home_offense' ? badUrl : url]]));
        },
        fetchArticle: async requested => {
          if (requested === badUrl) throw Error('No verified recent pregame publication date');
          return original;
        },
      });
      expect(queries).toHaveLength(2);
      expect(queries[1]).toMatchObject({requestedKeys:['home_offense'],excludedUrls:[badUrl]});
      expect(result.entries.every(e => e.article?.body === original.body)).toBe(true);
    } finally { await rm(cacheDir, {recursive:true,force:true}); }
  });
  it('lets the standing-picture topics reach back past the recency window', () => {
    // The 14-day window is what collapsed every topic onto the most recent
    // game. Recency topics keep it; who-they-are style topics do not.
    const day = 86400_000;
    for (const key of ['last_game', 'recent_run', 'quarterback', 'skill_players', 'defense']) {
      expect(topicMaxAgeMs(key)).toBe(14 * day);
    }
    for (const key of ['head_to_head', 'who_they_are', 'head_coach', 'opponent_quality', 'power_ranking']) {
      expect(topicMaxAgeMs(key)).toBeGreaterThan(365 * day);
    }
    // An article older than the recency window is rejected for a recency topic
    // and accepted for a standing one — same article, same asOf.
    const old = html('2026-01-05T12:00Z');
    expect(() => extractNflArticle(old, { ...context, url, asOf, maxAgeMs: topicMaxAgeMs('last_game') }))
      .toThrow('No verified recent pregame publication date');
    expect(extractNflArticle(old, { ...context, url, asOf, maxAgeMs: topicMaxAgeMs('who_they_are') }).body.length)
      .toBeGreaterThan(0);
  });

  it('lets opponent_quality describe a third team, and holds every other topic to the matchup', () => {
    const other = html().replace(/Seahawks|Patriots/g, 'Jaguars');
    expect(() => extractNflArticle(other, { ...context, url }))
      .toThrow('Article does not identify either matchup team');
    const allowed = extractNflArticle(other, { ...context, url, requireMatchupTeam: false });
    expect(allowed.body.length).toBeGreaterThan(0);
    expect(allowed.coveredTeams).toEqual([]);
  });

  it('shows discovery failures honestly and does not invent coverage', async () => {
    const result = await fetchNflArticlesAsWritten(context, { cacheDir: '/tmp/gary-nfl-absent-cache', discover: async () => { throw new Error('Subscription capacity exhausted'); } });
    expect(result.entries.every(e => !e.article)).toBe(true);
    expect(result.text).toContain('Subscription capacity exhausted');
  });
});
