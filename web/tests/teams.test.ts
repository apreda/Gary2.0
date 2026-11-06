import { describe, expect, it } from 'vitest';
import { renderableTeamGames, teamGames, teamPath, teamsFromIndex } from '@/lib/gary/teams';
import type { PickIndexRow } from '@/lib/gary/gamepage';

const row = (date: string, away: string, home: string, league = 'NFL'): PickIndexRow =>
  ({ date, league, sport: null, away_team: away, home_team: home });
const rows = [
  row('2026-10-01', 'Jacksonville Jaguars', 'Baltimore Ravens'),
  row('2026-10-01', 'Jacksonville Jaguars', 'Baltimore Ravens'), // a second pick on the same game
  row('2026-10-08', 'Tennessee Titans', 'Jacksonville Jaguars'),
  row('2026-10-15', 'Jacksonville Jaguars', 'Houston Texans'),
  row('2025-11-01', 'Jacksonville Jaguars', 'Las Vegas Raiders'), // last season
  row('2026-07-10', 'AL', 'NL', 'MLB'),
  row('2026-05-10', 'AL', 'NL', 'MLB'),
  row('2026-04-10', 'AL', 'NL', 'MLB'),
];

describe('team pages', () => {
  it('publishes a page once a team has three games this season', () => {
    expect(teamsFromIndex(rows).map(t => t.name)).toEqual(['Jacksonville Jaguars']);
    expect(teamsFromIndex(rows)[0]).toMatchObject({ games: 3, lastDate: '2026-10-15', sport: 'nfl' });
  });
  it('lists each game once, newest first, this season only', () => {
    const team = teamsFromIndex(rows)[0];
    expect(teamGames(rows, team).map(g => g.date)).toEqual(['2026-10-15', '2026-10-08', '2026-10-01']);
    expect(teamPath(team)).toBe('/teams/nfl/jacksonville-jaguars');
  });
  it('links only to games the site can render', () => {
    const team = teamsFromIndex(rows)[0];
    expect(renderableTeamGames(rows, team, '2026-10-10').map(g => g.date)).toEqual(['2026-10-08', '2026-10-01']);
  });
});
