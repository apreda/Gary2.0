-- Retired leftovers, round two (founder, Sep 24 2026: "if it's an old part
-- that no longer is part of the actual app or website ... clean it up").
-- The X reply engine's queue, the retired Winners-reasons job lane, old run
-- logs and stats, unused analytics views, the leftover Systems helpers and
-- trigger functions that no trigger uses. Rows were exported to
-- ~/Gary2.0-archive/db-drops-2026-09-24-round2/ first. Functions a shipped
-- app build still calls (claim_handle, get_entitlements, register_push_token,
-- update_my_profile) stay until those builds are gone.

drop view if exists public.coin_flip_ledger_rollup;
drop view if exists public.coin_flip_ledger;
drop view if exists public.prop_lane_rollup;
drop view if exists public.prop_lane_daily;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname in (
            'append_daily_picks', 'calculate_wager_amount', 'handle_user_update',
            'sync_user_on_signup', 'update_wagers_updated_at', 'track_odds_changes'))
       or (n.nspname = 'gary_private' and p.proname in (
            'lab_final_score', 'lab_matches', 'lab_record',
            'winners_reasons_collect', 'winners_reasons_enqueue', 'winners_reasons_valid',
            'winners_reasons_contract', 'winners_reason_source'))
  loop
    execute format('drop function if exists %s', f.sig);
  end loop;
end $$;

drop table if exists public.reply_queue;
drop table if exists public.reply_engine_config;
drop table if exists public.gary_agentic_runs;
drop table if exists public.winners_reason_jobs;
drop table if exists public.user_stats;
drop function if exists public.update_user_stats_updated_at();
