import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(new URL('../../gary2.0/supabase/migrations/20260903180543_web_growth_measurement.sql', import.meta.url)),
  'utf8',
);

describe('website growth migration shape', () => {
  it('keeps trusted web metrics separate and locks both writers to service role', () => {
    expect(migration).toMatch(/create table if not exists public\.web_events/i);
    expect(migration).toMatch(/create table if not exists public\.web_link_clicks/i);
    expect(migration).toMatch(/alter table public\.web_events force row level security/i);
    expect(migration).toMatch(/alter table public\.web_link_clicks force row level security/i);
    expect(migration).toMatch(/grant execute on function public\.log_web_event[\s\S]+to service_role/i);
    expect(migration).toMatch(/grant execute on function public\.log_web_link_click[\s\S]+to service_role/i);
    expect(migration).not.toMatch(/grant execute[\s\S]{0,400}to (?:anon|authenticated)/i);
    expect(migration).not.toMatch(/create\s+(?:unique\s+)?index[^;]*public\.app_events/i);
    expect(migration).not.toMatch(/create or replace function public\.log_app_event/i);
    expect(migration).toMatch(/create table if not exists public\.web_ingest_rate_limits/i);
    expect(migration).toMatch(/delete from public\.web_ingest_rate_limits[\s\S]+interval '5 minutes'/i);
    expect(migration).toMatch(/cron\.schedule\([\s\S]+cleanup-web-ingest-rate-limits[\s\S]+'\*\/5 \* \* \* \*'/i);
    expect(migration).toMatch(/insert into public\.web_events \(event, identity, props\)/i);
    expect(migration).toMatch(/insert into public\.web_link_clicks \([\s\S]*click_id, surface, ct, referrer_host/i);
    expect(migration).not.toMatch(/insert into public\.web_events \([^)]*request_fingerprint/i);
    expect(migration).not.toMatch(/insert into public\.web_link_clicks \([^)]*request_fingerprint/i);
  });

  it('uses an owned website table and leaves the legacy click table untouched', () => {
    expect(migration).toMatch(/id bigint generated always as identity primary key/i);
    expect(migration).toMatch(/ct text not null default 'website'/i);
    expect(migration).toMatch(/coalesce\(p_ct, 'website'\)/i);
    expect(migration).not.toContain('public.link_clicks');
    expect(migration).not.toContain('public.link_clicks_id_seq');
    expect(migration).not.toContain('link_clicks insert');
  });
});
