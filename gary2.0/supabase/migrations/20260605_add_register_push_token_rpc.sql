-- SECURITY DEFINER registration RPC for push_tokens (2026-06-05). APPLIED.
-- Lets the iOS app register a device token WITHOUT any anon table policies:
-- the function runs as its owner (bypasses RLS) and does the upsert server-side.
-- This is the prerequisite for dropping anon SELECT/UPDATE/INSERT on push_tokens
-- (the merge-duplicates upsert the app uses today needs anon SELECT to read the
-- conflict row — the leak we want to close). The lockdown itself is staged in
-- STAGED_20260605_lock_push_tokens.sql, gated on iOS adoption.
--
-- Threat surface after switchover: anon can only call this function, which can
-- ONLY upsert-and-activate a token it is handed. It cannot read/enumerate tokens,
-- cannot deactivate, and junk tokens are inert (FCM rejects them on send).
CREATE OR REPLACE FUNCTION public.register_push_token(
  p_device_token text,
  p_platform text DEFAULT 'ios'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Light sanity guard against junk flooding (FCM/APNs tokens are long opaque strings).
  IF p_device_token IS NULL OR length(p_device_token) < 32 OR length(p_device_token) > 4096 THEN
    RAISE EXCEPTION 'invalid device token';
  END IF;
  IF p_platform IS NULL OR p_platform NOT IN ('ios', 'android') THEN
    p_platform := 'ios';
  END IF;

  INSERT INTO public.push_tokens (device_token, platform, active)
  VALUES (p_device_token, p_platform, true)
  ON CONFLICT (device_token)
  DO UPDATE SET active = true, platform = EXCLUDED.platform, updated_at = now();
END;
$$;

-- Only the function is exposed to the public roles — not the table.
REVOKE ALL ON FUNCTION public.register_push_token(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text) TO anon, authenticated;
