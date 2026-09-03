import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(new URL('../../gary2.0/supabase/migrations/20260903181433_web_email_updates.sql', import.meta.url)),
  'utf8',
);

describe('website email migration shape', () => {
  it('records versioned double opt-in consent without exposing subscriber data', () => {
    expect(migration).toMatch(/create table public\.web_email_subscriptions/i);
    expect(migration).toMatch(/p_consent_version text/i);
    expect(migration).toMatch(/pending_consent_version/i);
    expect(migration).toMatch(/create table public\.web_email_consent_events/i);
    expect(migration).toMatch(/insert into public\.web_email_consent_events[\s\S]+?'confirmed'/i);
    expect(migration).toMatch(/insert into public\.web_email_consent_events[\s\S]+?'unsubscribed'/i);
    expect(migration).toMatch(/force row level security/i);
    expect(migration).toMatch(/grant execute on function public\.request_web_email_subscription[\s\S]+to service_role/i);
    expect(migration).not.toMatch(/grant execute on function public\.request_web_email_subscription[^;]+to (?:anon|authenticated)/i);
  });

  it('keeps unsubscribe links valid across signing-secret rotations', () => {
    expect(migration).toMatch(/create table public\.web_email_unsubscribe_tokens/i);
    expect(migration).toMatch(/primary key \(subscription_id, token_hash\)/i);
    expect(migration).toMatch(/claim_web_email_delivery\([\s\S]+p_unsubscribe_token_hash text/i);
    expect(migration).toMatch(/insert into public\.web_email_unsubscribe_tokens \(subscription_id, token_hash\)/i);
    expect(migration).toMatch(/is_web_email_unsubscribe_token_valid\([\s\S]+token_hash = p_token_hash/i);
    expect(migration).toMatch(/unsubscribe_web_email_subscription\([\s\S]+join public\.web_email_unsubscribe_tokens/i);
  });

  it('separates retryable request failures from provider-final failures', () => {
    expect(migration).toMatch(/status in \('queued', 'sent', 'delivered', 'request_failed', 'provider_failed', 'bounced', 'complained', 'suppressed', 'skipped'\)/i);
    expect(migration).toMatch(/delivery\.status in \('request_failed', 'queued'\)/i);
    expect(migration).not.toMatch(/delivery\.status in \([^)]*provider_failed/i);
    expect(migration).toMatch(/p_status not in \('sent', 'request_failed', 'provider_failed', 'skipped'\)/i);
    expect(migration).toMatch(/previously completed idempotent result are never downgraded\.[\s\S]+if delivery\.status <> 'queued'/i);
  });

  it('serializes every provider attempt and accounts for free-tier capacity', () => {
    expect(migration).toMatch(/reserve_web_email_provider_slot\([\s\S]+p_spacing_ms integer default 550/i);
    expect(migration).toMatch(/from public\.web_email_provider_state[\s\S]+for update/i);
    expect(migration).toMatch(/reserve_web_email_provider_capacity\([\s\S]+p_daily_limit integer default 90/i);
    expect(migration).toMatch(/p_monthly_limit integer default 2700/i);
    expect(migration).toMatch(/delivery\.kind = 'confirmation'[\s\S]+p_daily_campaign_reserve/i);
    expect(migration).toMatch(/capacity_reserved_at is not null/i);
  });

  it('leases each campaign and durably deduplicates verified provider events', () => {
    expect(migration).toMatch(/create table public\.web_email_campaign_leases/i);
    expect(migration).toMatch(/acquire_web_email_campaign_lease\([\s\S]+lease_until <= clock_timestamp\(\)/i);
    expect(migration).toMatch(/create table public\.web_email_provider_events \([\s\S]+svix_id text primary key/i);
    expect(migration).toMatch(/on conflict \(svix_id\) do nothing/i);
    expect(migration).toMatch(/order by event_at, svix_id/i);
    expect(migration).toMatch(/incoming_rank > case[\s\S]+provider_event_at/i);
    expect(migration).toMatch(/event_row\.campaign_tag in \('confirmation', 'daily-board', 'weekly-record'\)/i);
  });

  it('stays website-only', () => {
    expect(migration).not.toMatch(/\b(?:game_picks|prop_picks|picks_json|results_json|user_bets)\b/i);
    expect(migration).not.toMatch(/\b(?:ios|apple|app_events|link_clicks)\b/i);
  });
});
