import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL(
  '../../supabase/migrations/20260815171426_atomic_football_prop_pick_upsert.sql',
  import.meta.url,
), 'utf8');
const footballTdFollowup = readFileSync(new URL(
  '../../supabase/migrations/20260815174339_preserve_football_td_categories.sql',
  import.meta.url,
), 'utf8');

describe('atomic prop-picks migration', () => {
  it('serializes both the existing-row and no-row-yet cases by ET date', () => {
    expect(migration).toContain('create unique index if not exists prop_picks_date_unique');
    expect(migration).toContain("pg_catalog.hashtextextended('prop_picks|' || p_date, 0)");
    expect(migration).toContain('for update');
  });

  it('uses first-writer-wins natural prop identity including TD category', () => {
    for (const identityField of [
      'v_existing_sport = v_new_sport',
      'v_existing_game_id = v_new_game_id',
      'v_existing_player = v_new_player',
      'v_existing_prop = v_new_prop',
      'v_existing_bet = v_new_bet',
      'v_existing_line = v_new_line',
      'v_existing_td_category = v_new_td_category',
    ]) {
      expect(migration).toContain(identityField);
    }
    expect(migration).toContain('if v_clash then');
    expect(migration).toContain('v_skipped := v_skipped + 1');
  });

  it('normalizes numeric scale identically for validation and both identity sides', () => {
    // 1, 1.0, and 1.00 are the same sportsbook line. There are three line
    // normalizations in the function: preflight-new, append-new, and existing.
    expect(migration.match(/trim_scale\([^\n]*_line_raw::numeric\)::text/g)).toHaveLength(3);
    expect(migration).not.toMatch(/_line\s*:=\s*\([^\n]*_line_raw::numeric\)::text/);
  });

  it('limits force replacement to exact incoming ids and preserves owned-lane rules', () => {
    expect(migration).toContain('replacement game id % is not owned by the incoming batch');
    expect(migration).toContain("v_owner_sport = 'MLB' and v_existing_sport = 'MLB HR'");
    expect(migration).toContain("v_owner_sport = 'NFL'");
    expect(migration).toContain("v_existing_pick->>'td_category'");
    expect(migration).not.toMatch(/replace_game_ids[\s\S]*matchup.*delete/i);
  });

  it('requires provider ids for football and returns counts plus scheduler identities', () => {
    expect(migration).toContain("v_owner_sport in ('NFL', 'NCAAF')");
    expect(migration).toContain("'game_ids', v_incoming_game_ids");
    expect(migration).toContain("'added_game_ids', v_added_game_ids");
    expect(migration).toContain("'skipped_game_ids', v_skipped_game_ids");
    expect(migration).toContain("'replaced_game_ids', v_replaced_game_ids");
  });

  it('is invoker-rights and callable only by the backend service role', () => {
    expect(migration).toContain('security invoker');
    expect(migration).toContain('set search_path =');
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('to service_role');
    expect(migration).not.toContain('security definer');
  });
});

describe('football TD preservation follow-up migration', () => {
  it('preserves categorized TD picks during regular-only replacement for NFL and NCAAF', () => {
    expect(footballTdFollowup).toContain("v_owner_sport in ('NFL', 'NCAAF')");
    expect(footballTdFollowup).toContain('v_existing_td_category <>');
    expect(footballTdFollowup).toContain("incoming.value->>'td_category'");
    expect(footballTdFollowup).toContain('if v_keep_football_td then');
  });

  it('replaces the prior TD lane when the rerun itself carries categorized TD picks', () => {
    expect(footballTdFollowup).toMatch(/v_keep_football_td[\s\S]*and not exists[\s\S]*incoming\.value->>'td_category'/);
    expect(footballTdFollowup).toMatch(/if v_keep_football_td then[\s\S]*else[\s\S]*v_replaced := v_replaced \+ 1/);
  });

  it('retains the service-role-only invoker-rights contract', () => {
    expect(footballTdFollowup).toContain('security invoker');
    expect(footballTdFollowup).toContain('set search_path =');
    expect(footballTdFollowup).toContain('from public, anon, authenticated');
    expect(footballTdFollowup).toContain('to service_role');
    expect(footballTdFollowup).not.toContain('security definer');
  });
});
