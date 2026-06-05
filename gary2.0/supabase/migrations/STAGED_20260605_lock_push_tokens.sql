-- ⚠️ STAGED — DO NOT APPLY YET. ⚠️
--
-- This migration finishes locking down push_tokens. It is SAFE to apply only
-- AFTER both of these are true:
--
--   1. The iOS build that registers via the register_push_token() RPC
--      (GaryApp.swift, shipped 2026-06-05) has rolled out to enough installs.
--      Apply this while old binaries are still common and their direct
--      merge-duplicates upsert will start 401ing (push registration breaks for
--      those users until they update). Check adoption before applying.
--
--   2. The push sender (scripts/send-scheduled-push.js) has been switched from
--      the anon key to the service-role key (see the diff at the bottom of this
--      file) — otherwise dropping anon SELECT breaks the nightly push job.
--
-- What it does: removes ALL anon table access to push_tokens. Registration then
-- flows exclusively through register_push_token() (SECURITY DEFINER, already
-- live). The anon key can no longer SELECT (enumerate device tokens), UPDATE
-- (mass-deactivate), or INSERT directly.
--
-- To apply: rename this file to drop the STAGED_ prefix (so it matches the
-- timestamped migration convention) and run it, OR run the three DROPs directly.

DROP POLICY IF EXISTS "push_tokens_select_anon" ON public.push_tokens;
DROP POLICY IF EXISTS "push_tokens_update_anon" ON public.push_tokens;
DROP POLICY IF EXISTS "push_tokens_insert_anon" ON public.push_tokens;
-- After this, push_tokens has NO anon-facing policies. RLS is on, so the anon
-- role can do nothing directly. register_push_token() (definer) is the only
-- write path; the sender reads with the service role.

-- ─────────────────────────────────────────────────────────────────────────────
-- REQUIRED COORDINATED CODE CHANGE — apply to scripts/send-scheduled-push.js
-- in fetchActiveTokens() BEFORE running the DROPs above:
--
--   const supabaseServiceKey =
--     process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
--   if (!supabaseUrl || !supabaseServiceKey) {
--     throw new Error('Supabase configuration missing (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
--   }
--   // ...and send that key in the apikey + Authorization headers instead of anon.
--
-- The launchd job (com.gary.scheduler) loads .env via src/loadEnv.js, which
-- already has SUPABASE_SERVICE_ROLE_KEY. If the push job also runs in GitHub
-- Actions, confirm the SUPABASE_SERVICE_ROLE_KEY secret is set there first.
-- ─────────────────────────────────────────────────────────────────────────────
