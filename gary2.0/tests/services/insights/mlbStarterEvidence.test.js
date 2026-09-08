import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../src/services/insights/laneReads.js', () => ({ attachLaneReads: vi.fn(), detailFact: vi.fn() }));
import { computeStarterForm } from '../../../src/services/insights/computers/starterForm.js';
import { computeStarterTeamRecord } from '../../../src/services/insights/computers/starterTeamRecord.js';
import { isMlbStart } from '../../../src/services/mlbGameRows.js';

const game = { id: 777, status: 'STATUS_SCHEDULED', home_team: { id: 4, abbreviation: 'BOS', name: 'Red Sox' } };
function context(rows, index = new Map()) {
  return {
    games: [game], season: 2026, helpers: { gameLabel: () => 'Angels @ Red Sox' },
    bdl: {
      getMlbLineups: vi.fn(async () => ({ BOS: { pitcher: { playerId: 206, name: 'Brayan Bello' } } })),
      getMlbPlayerGameRowsChrono: vi.fn(async () => rows),
      getMlbPlayerSeasonStats: vi.fn(async () => [{ player: { id: 206 }, pitching_era: 7, pitching_whip: 1.8 }]),
      getMlbSeasonGameIndex: vi.fn(async () => index),
    },
  };
}

describe('MLB starters use the recorded role and baseball innings', () => {
  it('accepts measured zero-out starts without inventing a start for an unknown or relief role', () => {
    expect(isMlbStart({ games_started: 1, ip: 0 })).toBe(true);
    expect(isMlbStart({ games_started: '1' })).toBe(true);
    for (const role of [undefined, null, '', 0, '0', true, false, 2]) expect(isMlbStart({ games_started: role, ip: 6 })).toBe(false);
  });

  it('form includes a zero-out start, excludes relief and current-game rows, and displays 13.1 IP', async () => {
    const starts = Array.from({ length: 7 }, (_, i) => ({ game_id: i + 1, games_started: 1, ip: 6, er: 1, p_hits: 4, p_bb: 1, p_k: 5 }));
    starts[5].ip = 7.1;
    starts[6] = { ...starts[6], ip: 0, er: 4, p_hits: 3, p_bb: 1, p_k: 0 };
    const rows = [...starts, { ...starts[0], game_id: 90, games_started: 0, ip: 9, er: 0 }, { ...starts[0], game_id: '777', ip: 9, er: 0 }];
    const [form] = await computeStarterForm(context(rows));
    expect(form.meta).toMatchObject({ window_starts: 3, window_ip: 13.1, window_er: 6, window_k: 10, recent_era: 4.05 });
    expect(form.detail).toContain('13.1');
    expect(form.detail).not.toContain('13.3');
  });

  it('team record uses eight true starts, including a zero-out start, instead of later relief losses', async () => {
    const starts = Array.from({ length: 8 }, (_, i) => ({ game_id: i + 1, games_started: 1, ip: i === 7 ? 0 : 6 }));
    const relief = [20, 21, 22].map(game_id => ({ game_id, games_started: 0, ip: 5 }));
    const index = new Map([...starts, ...relief].map(r => [r.game_id, { status: 'STATUS_FINAL', homeId: 4, awayId: 1, homeRuns: r.games_started ? 5 : 1, awayRuns: r.games_started ? 1 : 5 }]));
    const [record] = await computeStarterTeamRecord(context([...starts, ...relief], index));
    expect(record.meta).toMatchObject({ starts: 8, wins: 8, losses: 0, streak: 8 });
    expect(record.headline).toBe("Red Sox 8-0 in Brayan Bello's last 8 starts");
  });
});
