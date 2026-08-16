import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const gameGrader = readFileSync(
  new URL('../../supabase/functions/grade-results/index.ts', import.meta.url),
  'utf8',
);
const propGrader = readFileSync(
  new URL('../../supabase/functions/grade-props/index.ts', import.meta.url),
  'utf8',
);

describe('existing Supabase settlement functions preserve exact result identity', () => {
  it('game grading requires the stored id to match BDL and adopts only a matching legacy row', () => {
    expect(gameGrader).toContain('exactGameId = matchedStoredGameId(pick, mlbGameId)');
    expect(gameGrader).toContain('return String(x.id) === storedGameId');
    expect(gameGrader).toContain('game_id: exactGameId');
    expect(gameGrader).toContain('`&game_id=eq.${encodeURIComponent(row.game_id)}`');
    expect(gameGrader).toContain('`&game_id=is.null`');
    expect(gameGrader).toContain('game_id: row.game_id, league: row.league');
  });

  it('prop grading reads, writes, and dedupes every deployed exact identity dimension', () => {
    expect(propGrader).toContain('game_id: f.gameId, sport: f.sport');
    expect(propGrader).toContain('`&sport=ilike.${encodeURIComponent(row.sport)}`');
    expect(propGrader).toContain('`&game_id=eq.${encodeURIComponent(row.game_id)}`');
    expect(propGrader).toContain('`&bet=ilike.${encodeURIComponent(row.bet)}`');
    expect(propGrader).toContain('`&line_value=eq.${row.line_value}`');
    expect(propGrader).toContain('`&game_id=is.null&sport=is.null`');
    expect(propGrader).toContain('game_id: row.game_id, sport: row.sport');
  });
});
