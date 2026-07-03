-- Security tightening (Jul 2 2026 audit)
--
-- 1) append_daily_picks: orphaned legacy RPC (no caller anywhere in the repo —
--    picksService.js re-implements its merge in JS and writes with the service
--    role). It is SECURITY DEFINER and was executable by anon/authenticated,
--    meaning anyone holding the app's public anon key could inject or replace
--    picks in the production daily_picks table via
--    POST /rest/v1/rpc/append_daily_picks. Revoke public execution; the
--    function itself is kept in case a service-role caller ever wants it.
--
-- 2) push_tokens: iOS registers tokens exclusively through the
--    register_push_token RPC (see GaryApp.swift — "the table needs NO anon
--    policies"). The direct anon INSERT/SELECT/UPDATE policies predate that
--    RPC and let anyone enumerate or overwrite every device token. Drop them;
--    service-role pipelines (send-scheduled-push.js) bypass RLS regardless.

REVOKE EXECUTE ON FUNCTION public.append_daily_picks(text, jsonb) FROM anon, authenticated, public;

DROP POLICY IF EXISTS "push_tokens_insert_anon" ON public.push_tokens;
DROP POLICY IF EXISTS "push_tokens_select_anon" ON public.push_tokens;
DROP POLICY IF EXISTS "push_tokens_update_anon" ON public.push_tokens;
