import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadRecapBox, recapBoxComplete } from '../../src/services/recapBox.js';

const payload = JSON.parse(readFileSync(new URL('../fixtures/recaps/smu-fsu-457172.json', import.meta.url)));
const args = { league: 'NCAAF', gameId: 457172, awayTeam: 'SMU Mustangs', homeTeam: 'Florida State Seminoles',
  awayScore: 27, homeScore: 24, apiKey: 'fixture' };
const response = data => ({ ok: true, json: async () => data });
const scoreOnly = { away: { runs: 27 }, home: { runs: 24 } };

describe('recap score and sport totals', () => {
  it('reads the real paginated NFL schema: Eagles 7, Ravens 24, four total TDs', async () => {
    const pages = [1, 2].map(n => JSON.parse(readFileSync(new URL(`../fixtures/recaps/nfl-1393562-page-${n}.json`, import.meta.url))));
    const fetchImpl = vi.fn().mockResolvedValueOnce(response(pages[0])).mockResolvedValueOnce(response(pages[1]));
    const box = await loadRecapBox({ ...args, league: 'NFL', gameId: 1393562,
      awayTeam: 'Philadelphia Eagles', homeTeam: 'Baltimore Ravens', awayScore: 7, homeScore: 24, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(box.away).toMatchObject({ runs: 7, td: 1 });
    expect(box.home).toMatchObject({ runs: 24, td: 3 });
  });
  it('counts the exact SMU/FSU provider game: final 27–24, six TDs', async () => {
    const box = await loadRecapBox({ ...args, fetchImpl: async () => response(payload) });
    expect(box.away).toMatchObject({ runs: 27, td: 3 });
    expect(box.home).toMatchObject({ runs: 24, td: 3 });
    expect(recapBoxComplete(box, 'NCAAF')).toBe(true);
  });

  it('loads every page before publishing a college touchdown count', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({ data: payload.data.slice(0, 100), meta: { next_cursor: 100 } }))
      .mockResolvedValueOnce(response({ data: payload.data.slice(100) }));
    const box = await loadRecapBox({ ...args, fetchImpl });
    expect(fetchImpl.mock.calls[1][0]).toContain('/ncaaf/v1/plays?game_id=457172&per_page=100&cursor=100');
    expect(box.away.td + box.home.td).toBe(6);
  });

  it.each(['failed page', 'wrong game', 'unfinished', 'duplicate', 'inconsistent TD score', 'repeated cursor'])(
    'keeps the final score without claiming a TD total for %s', async problem => {
      const copy = structuredClone(payload);
      if (problem === 'wrong game') copy.data[0].game_id = 999;
      if (problem === 'unfinished') copy.data = copy.data.slice(0, 100);
      if (problem === 'duplicate') copy.data.push(copy.data[0]);
      if (problem === 'inconsistent TD score') copy.data.find(p => p.score_value === 6).away_score = 0;
      if (problem === 'repeated cursor') copy.meta = { next_cursor: 1 };
      const fetchImpl = vi.fn().mockResolvedValue(response(copy));
      if (problem === 'failed page') fetchImpl.mockResolvedValueOnce(response({ data: copy.data.slice(0, 100), meta: { next_cursor: 1 } }))
        .mockResolvedValueOnce({ ok: false });
      expect(await loadRecapBox({ ...args, fetchImpl })).toEqual(scoreOnly);
      expect(recapBoxComplete(scoreOnly, 'NCAAF')).toBe(false);
    });

  it('retains genuine zero home runs with the baseball final', async () => {
    const box = await loadRecapBox({ ...args, league: 'MLB', awayTeam: 'Braves', homeTeam: 'Phillies', awayScore: 0, homeScore: 1,
      mlbStats: [{ team_name: 'Atlanta Braves', at_bats: 3, hits: 1, hr: 0 }, { team_name: 'Philadelphia Phillies', at_bats: 3, hits: 1, hr: 1 }] });
    expect(box.away).toEqual({ runs: 0, hits: 1, hr: 0 });
    expect(box.home).toEqual({ runs: 1, hits: 1, hr: 1 });
    expect(recapBoxComplete(box, 'MLB')).toBe(true);
  });

  it('credits return touchdowns to the scoring team even if the play names the possession team', async () => {
    const copy = structuredClone(payload);
    copy.data.find(p => p.score_value === 6).team = { full_name: 'Florida State Seminoles' };
    const box = await loadRecapBox({ ...args, fetchImpl: async () => response(copy) });
    expect(box.away.td).toBe(3);
    expect(box.home.td).toBe(3);
  });

  it('recognizes a complete field-goals-only game as zero touchdowns', async () => {
    const data = [{ game_id: 457172, order: 1, scoring_play: true, score_value: 3,
      team: { college: 'SMU' }, away_score: 3, home_score: 0 }];
    const box = await loadRecapBox({ ...args, awayScore: 3, homeScore: 0, fetchImpl: async () => response({ data }) });
    expect(box.away.td + box.home.td).toBe(0);
  });

  it('does not invent a score when either side is missing or malformed', async () => {
    for (const awayScore of [null, undefined, '', false, -1, 1.5]) {
      expect(await loadRecapBox({ ...args, awayScore })).toBeNull();
    }
  });
});
