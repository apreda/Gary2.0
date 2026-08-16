import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../../supabase/migrations/20260815154859_atomic_weekly_nfl_pick_append.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

describe('atomic weekly NFL append migration', () => {
  it('serializes both existing-row and missing-row races inside Postgres', () => {
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('for update');
    expect(sql).toContain("'weekly_nfl_picks|'");
  });

  it('uses exact provider game identity and preserves legacy matchup protection', () => {
    expect(sql).toContain("v_new_pick->>'bdl_game_id'");
    expect(sql).toContain("v_new_pick->>'game_id'");
    expect(sql).toContain("v_existing_pick->>'hometeam'");
    expect(sql).toContain('exit when v_clash');
  });

  it('is service-role-only and does not expose a privileged public RPC', () => {
    expect(sql).toContain('security invoker');
    expect(sql).toContain('from public, anon, authenticated');
    expect(sql).toContain('to service_role');
    expect(sql).not.toContain('security definer');
  });
});
