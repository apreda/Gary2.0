-- These analytics derive only from published game/prop picks and public grades.
-- They contain no private-account or prompt_eras rows. Preserve their public
-- read contract while making every nested view obey the caller's base-table RLS.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter view public.prop_lane_ledger set (security_invoker = true);
alter view public.prop_lane_rollup set (security_invoker = true);
alter view public.prop_lane_daily set (security_invoker = true);
alter view public.coin_flip_ledger set (security_invoker = true);
alter view public.coin_flip_ledger_rollup set (security_invoker = true);

-- Client access is SELECT-only; service-role operational grants are preserved.
revoke all on public.prop_lane_ledger, public.prop_lane_rollup, public.prop_lane_daily,
  public.coin_flip_ledger, public.coin_flip_ledger_rollup from public, anon, authenticated;
grant select on public.prop_lane_ledger, public.prop_lane_rollup, public.prop_lane_daily,
  public.coin_flip_ledger, public.coin_flip_ledger_rollup to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
