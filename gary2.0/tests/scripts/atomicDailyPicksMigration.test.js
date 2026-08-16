import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../../supabase/migrations/20260815170343_atomic_daily_game_pick_append.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').toLowerCase();
const hardeningPath = fileURLToPath(new URL(
  '../../supabase/migrations/20260815175641_harden_atomic_daily_pick_identity.sql',
  import.meta.url,
));
const hardeningSql = readFileSync(hardeningPath, 'utf8').toLowerCase();

describe('atomic daily-picks append migration', () => {
  it('serializes existing-row and missing-row races for one ET date', () => {
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('for update');
    expect(sql).toContain("'daily_picks|' || p_date");
    expect(sql).toContain('create unique index if not exists daily_picks_date_unique');
  });

  it('uses sport-scoped exact game ids with matchup fallback only for legacy ids', () => {
    expect(sql).toContain("v_new_pick->>'bdl_game_id'");
    expect(sql).toContain("v_new_pick->>'game_id'");
    expect(sql).toContain('v_existing_sport = v_new_sport');
    expect(sql).toContain('v_new_game_id is not null and v_existing_game_id is not null');
    expect(sql).toContain("v_existing_pick->>'hometeam'");
    expect(sql).toContain('at least one side predates game-id stamping');
    expect(sql).toContain("coalesce(v_new_pick->>'picktype', '') = 'prop'");
    expect(sql).toContain("coalesce(v_existing_pick->>'picktype', '') = 'prop'");
  });

  it('appends without replacing other sports and reports the storage decision', () => {
    expect(sql).toContain('v_result := v_existing');
    expect(sql).toContain('v_result := v_result ||');
    for (const key of ["'added'", "'skipped'", "'total'", "'game_ids'", "'mode'"]) {
      expect(sql).toContain(key);
    }
  });

  it('is service-role-only with no privileged public execution surface', () => {
    expect(sql).toContain('security invoker');
    expect(sql).toContain('from public, anon, authenticated');
    expect(sql).toContain('to service_role');
    expect(sql).not.toContain('security definer');
  });
});

describe('atomic daily-picks identity hardening follow-up', () => {
  it('makes missing prop discriminator keys a total false boolean', () => {
    for (const side of ['v_new_pick', 'v_existing_pick']) {
      expect(hardeningSql).toContain(`coalesce(${side}->>'type', '')`);
      expect(hardeningSql).toContain(`coalesce(${side}->>'picktype', '')`);
    }
    expect(hardeningSql).toContain('false or null');
    expect(hardeningSql).toContain('not v_new_is_prop');
    expect(hardeningSql).toContain('not v_existing_is_prop');
  });

  it('dedupes exact games across known game-id and sport-alias payload paths', () => {
    for (const gameIdKey of ['bdl_game_id', 'game_id', 'bdlgameid', 'gameid']) {
      expect(hardeningSql).toContain(`->>'${gameIdKey}'`);
    }
    for (const [providerAlias, canonicalLeague] of [
      ['baseballmlb', 'mlb'],
      ['americanfootballnfl', 'nfl'],
      ['americanfootballncaaf', 'ncaaf'],
      ['basketballnba', 'nba'],
    ]) {
      expect(hardeningSql).toContain(`when '${providerAlias}' then '${canonicalLeague}'`);
    }
    expect(hardeningSql).toContain('v_existing_sport = v_new_sport');
    expect(hardeningSql).toContain('v_existing_game_id = v_new_game_id');
  });

  it('keeps distinct exact game ids and legacy matchup behavior intact', () => {
    expect(hardeningSql).toMatch(/if v_new_game_id is not null and v_existing_game_id is not null then\s+v_clash := v_existing_game_id = v_new_game_id/);
    expect(hardeningSql).toContain("v_existing_pick->>'hometeam'");
    expect(hardeningSql).toContain("v_existing_pick->>'home_team'");
    expect(hardeningSql).toContain('v_result := v_result ||');
    expect(hardeningSql).not.toContain('delete from public.daily_picks');
  });

  it('retains transaction serialization and the service-role-only invoker contract', () => {
    expect(hardeningSql).toContain('pg_advisory_xact_lock');
    expect(hardeningSql).toContain('for update');
    expect(hardeningSql).toContain('security invoker');
    expect(hardeningSql).toContain('from public, anon, authenticated');
    expect(hardeningSql).toContain('to service_role');
    expect(hardeningSql).not.toContain('security definer');
  });
});
