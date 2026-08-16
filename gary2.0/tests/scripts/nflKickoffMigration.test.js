import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const migrationDir = new URL('../../supabase/migrations/', import.meta.url);
const transitionFile = readdirSync(migrationDir).find((name) => name.endsWith('_nfl_kickoff_status_transition.sql'));
const strictFile = readdirSync(migrationDir).find((name) => name.endsWith('_nfl_kickoff_status_strict.sql'));
const transition = readFileSync(new URL(transitionFile, migrationDir), 'utf8');
const strict = readFileSync(new URL(strictFile, migrationDir), 'utf8');

describe('NFL kickoff precision migration', () => {
  it('allows old and new NFL writers during the compatibility cutover', () => {
    expect(transition).toContain("league = 'NFL'");
    expect(transition).toContain("kickoff_status IS NULL AND commence_time IS NOT NULL");
    expect(transition.indexOf('ADD CONSTRAINT')).toBeLessThan(transition.indexOf('UPDATE public.daily_slate'));
  });

  it('strictly requires truthful NFL/NCAAF kickoff precision after cutover', () => {
    expect(strict).toContain("league IN ('NFL', 'NCAAF')");
    expect(strict).toContain("kickoff_status = 'date_only' AND commence_time IS NULL");
    expect(strict).toContain("kickoff_status = 'confirmed' AND commence_time IS NOT NULL");
    expect(strict).toContain("league NOT IN ('NFL', 'NCAAF')");
    expect(strict).toContain('VALIDATE CONSTRAINT daily_slate_kickoff_status_check');
  });
});
