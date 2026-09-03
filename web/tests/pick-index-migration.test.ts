import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(new URL(
    '../../gary2.0/supabase/migrations/20260903190737_include_weekly_nfl_in_pick_page_index.sql',
    import.meta.url,
  )),
  'utf8',
);

describe('weekly NFL website pick index migration', () => {
  it('adds canonical weekly NFL calls without mutating either pick source', () => {
    expect(migration).toMatch(/from public\.weekly_nfl_picks w/i);
    expect(migration).toMatch(/'NFL'::text\s+as league/i);
    expect(migration).toMatch(/at time zone 'America\/New_York'/i);
    expect(migration).not.toMatch(/(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.(?:daily_picks|weekly_nfl_picks)/i);
  });

  it('guards provider timestamps before casting and publishes weekly-only days', () => {
    expect(migration).toMatch(/commence_time'[\s\S]+make_date[\s\S]+::timestamptz/i);
    expect(migration).toMatch(/weekly_published as \([\s\S]+min\(coalesce\(w\.created_at, w\.updated_at\)\)/i);
    expect(migration).toMatch(/union all\s+select date, published_at from weekly_published/i);
    expect(migration).toMatch(/union select date from games/i);
  });

  it('keeps one concurrent refresh job and the public read contracts', () => {
    expect(migration).toMatch(/create or replace view public\.pick_day_index/i);
    expect(migration).toMatch(/create or replace view public\.archive_day_index/i);
    expect(migration).toMatch(/where jobname = 'refresh-pick-page-index'/i);
    expect(migration).toMatch(/refresh materialized view concurrently public\.pick_page_index/i);
  });
});
