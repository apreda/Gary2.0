-- Tier 2 cleanup (Jul 2 2026): the DFS/Fantasy and Talk-to-Gary (Voice/Chat)
-- features were fully removed from iOS + backend (see the cleanup(Tier 2A-2D)
-- commits). These tables exclusively backed those features and are now
-- read/written by nothing in the codebase.
--
-- NOT auto-applied by this cleanup. Apply deliberately with `supabase db push`
-- (or paste into the SQL editor). IRREVERSIBLE — the stored rows are lost.
-- Recreate migrations for reference: 20260105_dfs_multi_slate.sql,
-- 20260512_create_pick_context.sql, 20260605_tighten_pick_context_rls.sql.

DROP TABLE IF EXISTS public.dfs_lineups;
DROP TABLE IF EXISTS public.test_dfs_lineups;
DROP TABLE IF EXISTS public.pick_context;
