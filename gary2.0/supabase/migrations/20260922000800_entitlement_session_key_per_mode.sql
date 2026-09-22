-- sync_subscription_access writes stripe_session_id as "<sub id>:<SPORT>" and
-- resolves conflicts on (stripe_subscription_id, product_key, livemode), but
-- the session-id uniqueness ignored livemode. A row for the same subscription
-- in the other mode then raised 23505 instead of taking the ON CONFLICT path,
-- and the webhook 500'd on every retry. Uniqueness now matches the key the
-- writer actually uses.
drop index if exists public.user_entitlements_stripe_session_id_key;
alter table public.user_entitlements drop constraint if exists user_entitlements_stripe_session_id_key;
create unique index if not exists user_entitlements_session_mode
  on public.user_entitlements (stripe_session_id, livemode) where stripe_session_id is not null;
