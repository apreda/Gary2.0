-- Entitlement lookup hardening (Jul 2 2026, pre-paywall-flip audit)
--
-- user_entitlements had an anon SELECT true policy: anyone holding the app's
-- public anon key could dump every active entitlement row — harvesting
-- installation_ids (set one locally → free premium) plus Stripe session ids
-- and amounts. Replace direct table reads with a SECURITY DEFINER RPC that
-- returns product keys only for the ids the caller already knows (same trust
-- model as register_push_token / log_app_event: the anon key can ask about
-- its own identity but can never enumerate).
--
-- Ships together with the iOS 2.18 change that calls this RPC instead of
-- selecting the table. Safe to apply before 2.18 ships: the current App Store
-- build has freeLaunch=true, so entitlement reads gate nothing today.

CREATE OR REPLACE FUNCTION public.get_entitlements(p_ids text[])
RETURNS TABLE (product_key text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ue.product_key
  FROM user_entitlements ue
  WHERE ue.installation_id = ANY(p_ids)
    AND ue.status = 'active';
$$;

REVOKE ALL ON FUNCTION public.get_entitlements(text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_entitlements(text[]) TO anon, authenticated;

DROP POLICY IF EXISTS "anon can read entitlements" ON public.user_entitlements;
