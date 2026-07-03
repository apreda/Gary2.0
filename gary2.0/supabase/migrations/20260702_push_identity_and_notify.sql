-- Pick-by-pick unlock pushes (applied live Jul 2 2026 in three steps:
-- push_tokens_identity_and_register_v2, drop_old_register_push_token_overload,
-- + pick_notify_state via execute_sql; consolidated here for the repo).

ALTER TABLE public.push_tokens ADD COLUMN IF NOT EXISTS identity_id text;

-- 3-arg replaces the 2-arg (old overload DROPPED — PostgREST could not resolve
-- the pair and 2-arg calls from shipped clients 500'd until it was removed).
CREATE OR REPLACE FUNCTION public.register_push_token(p_device_token text, p_platform text, p_identity text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO push_tokens (device_token, platform, identity_id)
  VALUES (p_device_token, p_platform, p_identity)
  ON CONFLICT (device_token)
  DO UPDATE SET platform = EXCLUDED.platform,
                identity_id = COALESCE(EXCLUDED.identity_id, push_tokens.identity_id),
                updated_at = now();
END;
$$;
DROP FUNCTION IF EXISTS public.register_push_token(text, text);
REVOKE ALL ON FUNCTION public.register_push_token(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text, text) TO anon, authenticated;

-- Watermark: which picks have been announced (notify-new-pick edge fn, cron */5).
CREATE TABLE IF NOT EXISTS public.pick_notify_state (
  pick_key text PRIMARY KEY,
  notified_at timestamptz DEFAULT now()
);
ALTER TABLE public.pick_notify_state ENABLE ROW LEVEL SECURITY;
