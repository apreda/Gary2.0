-- ⚠️ STAGED — DO NOT APPLY UNTIL THE RPC iOS BUILD IS RELEASED + ADOPTED. ⚠️
--
-- This is the FINAL step of the push_tokens lockdown. Everything else is done:
--   ✓ register_push_token() SECURITY DEFINER RPC is LIVE (migration
--     20260605_add_register_push_token_rpc.sql).
--   ✓ iOS GaryApp.swift registers via the RPC (ships in the next App Store build).
--   ✓ The push sender (scripts/send-scheduled-push.js) already reads with the
--     service-role key — it no longer needs anon SELECT.
--
-- The ONLY thing this migration does is drop the three anon policies, which
-- closes the token-enumeration leak. After it, push_tokens has zero anon-facing
-- policies: registration flows exclusively through register_push_token().
--
-- DO NOT APPLY until the iOS build above has rolled out to enough installs.
-- While old binaries are still common, their direct merge-duplicates upsert
-- needs anon SELECT (to read the conflict row); dropping it makes their push
-- registration 401 — existing tokens keep receiving pushes, but those users
-- can't refresh/re-register until they update. Gate on App Store adoption.
--
-- To apply: rename to drop the STAGED_ prefix and run, or run the three DROPs.

DROP POLICY IF EXISTS "push_tokens_select_anon" ON public.push_tokens;
DROP POLICY IF EXISTS "push_tokens_update_anon" ON public.push_tokens;
DROP POLICY IF EXISTS "push_tokens_insert_anon" ON public.push_tokens;
