-- Supabase's older defaults granted ALL table privileges to service_role.
-- The original website-email GRANTs were additive, so remove only this role's
-- inherited table privileges and restore the intended existing access sets.
-- No rows, function grants, RLS, defaults, account objects or jobs change.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

revoke all privileges on table
  public.web_email_subscriptions,
  public.web_email_consent_events,
  public.web_email_unsubscribe_tokens,
  public.web_email_signup_rate_limits,
  public.web_email_deliveries,
  public.web_email_provider_state,
  public.web_email_provider_capacity,
  public.web_email_campaign_leases,
  public.web_email_provider_events
from service_role;

grant select, insert, update on table
  public.web_email_subscriptions,
  public.web_email_deliveries
to service_role;

grant select, insert on table
  public.web_email_consent_events,
  public.web_email_unsubscribe_tokens
to service_role;

grant select, update on table
  public.web_email_provider_state
to service_role;

grant select, insert, update, delete on table
  public.web_email_signup_rate_limits,
  public.web_email_provider_capacity,
  public.web_email_campaign_leases,
  public.web_email_provider_events
to service_role;

commit;
