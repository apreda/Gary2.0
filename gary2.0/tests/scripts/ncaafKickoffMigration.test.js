import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260816024014_ncaaf_kickoff_status.sql', import.meta.url),
  'utf8',
);
const dailySlateSource = readFileSync(
  new URL('../../src/services/dailySlateService.js', import.meta.url),
  'utf8',
);

describe('NCAAF kickoff precision migration', () => {
  it('allows a null kickoff only for an identified NCAAF date-only fixture', () => {
    expect(migration).toContain("league = 'NCAAF'");
    expect(migration).toContain("kickoff_status = 'date_only' AND commence_time IS NULL");
    expect(migration).toContain('scheduled_date IS NOT NULL');
    expect(migration).toContain("league <> 'NCAAF'");
    expect(migration).toContain('kickoff_status IS NULL');
    expect(migration).toContain('commence_time IS NOT NULL');
  });

  it('uses exact provider identity for every identified sport row', () => {
    expect(migration).toContain('UNIQUE (league, bdl_game_id)');
    expect(dailySlateSource).toContain("const EXACT_GAME_CONFLICT_KEY = 'league,bdl_game_id'");
    expect(dailySlateSource).toContain('exactGameRows: safe.filter((row) => row?.bdl_game_id != null)');
    expect(dailySlateSource).not.toContain("r.league === 'NCAAF' && r.bdl_game_id != null");
  });
});
