import { describe, it, expect } from 'vitest';
import { boardLeagues, buildBoard, type SlateRow } from '@/lib/gary/board';
import type { GaryPick } from '@/lib/gary/types';

const slateRow = (over: Partial<SlateRow> = {}): SlateRow => ({
  league: 'MLB',
  away_team: 'Mariners',
  home_team: 'Rangers',
  commence_time: '2026-07-27 18:35:00+00',
  venue: null,
  spread: '1.5',
  ml_home: '112',
  ml_away: '-132',
  total: '8',
  ...over,
});

describe('buildBoard', () => {
  it('renders every slate game, posted or not', () => {
    const board = buildBoard([slateRow(), slateRow({ away_team: 'Phillies', home_team: 'Marlins' })], []);
    expect(board).toHaveLength(2);
    expect(board.every(g => g.pick === null)).toBe(true);
  });

  it('attaches a pick to its game', () => {
    const pick: GaryPick = { awayTeam: 'Mariners', homeTeam: 'Rangers', pick: 'Seattle Mariners ML -131' };
    const board = buildBoard([slateRow()], [pick]);
    expect(board[0].pick?.pick).toBe('Seattle Mariners ML -131');
  });

  it('matches a full club name against the slate mascot', () => {
    const pick: GaryPick = { awayTeam: 'Seattle Mariners', homeTeam: 'Texas Rangers', pick: 'Mariners ML' };
    expect(buildBoard([slateRow()], [pick])[0].pick).not.toBeNull();
  });

  it('never lets one Sox answer for the other', () => {
    const slate = [
      slateRow({ away_team: 'Red Sox', home_team: 'Yankees' }),
      slateRow({ away_team: 'White Sox', home_team: 'Guardians' }),
    ];
    const pick: GaryPick = { awayTeam: 'White Sox', homeTeam: 'Guardians', pick: 'White Sox ML' };
    const board = buildBoard(slate, [pick]);
    expect(board.find(g => g.away === 'Red Sox')?.pick).toBeNull();
    expect(board.find(g => g.away === 'White Sox')?.pick?.pick).toBe('White Sox ML');
  });

  it('spends each pick once', () => {
    const slate = [slateRow(), slateRow()];
    const pick: GaryPick = { awayTeam: 'Mariners', homeTeam: 'Rangers', pick: 'Mariners ML' };
    const board = buildBoard(slate, [pick]);
    expect(board.filter(g => g.pick).length).toBe(1);
  });

  it('keeps a posted pick that has no slate row', () => {
    const pick: GaryPick = {
      awayTeam: 'Bills',
      homeTeam: 'Jets',
      league: 'NFL',
      pick: 'Bills -3',
      commence_time: '2026-09-13T17:00:00.000Z',
    };
    const board = buildBoard([slateRow()], [pick]);
    expect(board).toHaveLength(2);
    expect(board.find(g => g.away === 'Bills')?.pick).not.toBeNull();
  });

  it('ignores prop rows', () => {
    const prop: GaryPick = { awayTeam: 'Mariners', homeTeam: 'Rangers', type: 'prop', pick: 'Canzone over' };
    expect(buildBoard([slateRow()], [prop])[0].pick).toBeNull();
  });

  it('orders by first pitch', () => {
    const board = buildBoard(
      [
        slateRow({ away_team: 'Late', commence_time: '2026-07-27 23:10:00+00' }),
        slateRow({ away_team: 'Early', commence_time: '2026-07-27 18:35:00+00' }),
      ],
      [],
    );
    expect(board.map(g => g.away)).toEqual(['Early', 'Late']);
  });
});

describe('boardLeagues', () => {
  it('lists each league once, in board order', () => {
    const board = buildBoard(
      [
        slateRow({ league: 'MLB' }),
        slateRow({ league: 'WNBA', away_team: 'Aces', home_team: 'Liberty', commence_time: '2026-07-27 23:00:00+00' }),
        slateRow({ league: 'MLB', away_team: 'Cubs', home_team: 'Cards', commence_time: '2026-07-27 23:30:00+00' }),
      ],
      [],
    );
    expect(boardLeagues(board)).toEqual(['MLB', 'WNBA']);
  });
});
