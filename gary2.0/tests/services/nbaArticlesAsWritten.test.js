import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchNbaArticlesAsWritten, articleTopics } from '../../src/services/agentic/scoutReport/sports/nbaArticlesAsWritten.js';
import { espnNbaTeamIs } from '../../src/services/espnRecaps.js';

const DAY = 86400_000;
const asOf = Date.parse('2026-11-10T23:00:00Z');
const base = { homeTeam: 'Detroit Pistons', awayTeam: 'Boston Celtics', asOf,
  teamNames: { 'Detroit Pistons': ['Pistons', 'Detroit'], 'Boston Celtics': ['Celtics', 'Boston'], 'Orlando Magic': ['Magic', 'Orlando'] } };
const recap = (title) => ({ url: `https://www.espn.com/nba/recap/_/gameId/${title.length}`, title, author: 'AP', outlet: 'AP via espn.com',
  publishedAt: new Date(asOf - DAY).toISOString(), fetchedAt: new Date(asOf).toISOString(), coveredTeams: ['Detroit Pistons', 'Boston Celtics'],
  body: `${title} body`, sha256: title });

describe('the NBA article reader', () => {
  it('asks the search only for what ESPN did not supply', async () => {
    const asked = [];
    const result = await fetchNbaArticlesAsWritten({ ...base, lastGames: { home: { opponent: 'Orlando Magic', date: new Date(asOf - 2 * DAY).toISOString() } } }, {
      cacheDir: mkdtempSync(join(tmpdir(), 'nba-art-')),
      espn: async () => ({ home_last_game: recap('Pistons beat Magic'), head_to_head: recap('Pistons hold off Celtics') }),
      discover: async (context, { requestedKeys }) => { asked.push(requestedKeys); return Object.fromEntries(requestedKeys.map((k) => [k, []])); },
    });
    expect(asked[0].sort()).toEqual(['away_identity', 'home_identity', 'preview', 'recent_run', 'storylines']);
    expect(result.entries.find((e) => e.key === 'home_last_game').article.title).toBe('Pistons beat Magic');
    expect(result.entries.find((e) => e.key === 'head_to_head').article.title).toBe('Pistons hold off Celtics');
  });

  it('leaves out a last game from the offseason', () => {
    const keys = articleTopics({ ...base, lastGames: { home: { opponent: 'Orlando Magic', date: '2026-04-12T22:00:00Z' } } }).map((t) => t.key);
    expect(keys).not.toContain('home_last_game');
    expect(keys).toContain('head_to_head');
  });
});

describe('ESPN NBA team matching', () => {
  it('matches on the nickname, so LA and Los Angeles agree and Nets is not Hornets', () => {
    expect(espnNbaTeamIs({ displayName: 'LA Clippers', shortDisplayName: 'Clippers' }, 'Los Angeles Clippers')).toBe(true);
    expect(espnNbaTeamIs({ name: 'Trail Blazers' }, 'Portland Trail Blazers')).toBe(true);
    expect(espnNbaTeamIs({ name: 'Nets' }, 'Charlotte Hornets')).toBe(false);
  });
});
