-- Retired features (founder, Sep 24 2026: "we're only moving forward").
-- Systems, Talk to Gary, the Hub's league pulse / night highlights / market
-- pulse, the old Fantasy briefing, the March bracket, the retired mention bot
-- and the unwritten today_board leave the database. Rows were exported to
-- ~/Gary2.0-archive/db-drops-2026-09-24/ before this ran.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'winners-systems-enter') then
    perform cron.unschedule('winners-systems-enter');
  end if;
  if exists (select 1 from cron.job where jobname = 'winners-systems-settle') then
    perform cron.unschedule('winners-systems-settle');
  end if;
end $$;

-- Every overload of each retired function.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname in (
            'my_systems', 'upsert_system', 'delete_system', 'system_matches',
            'enter_system_bets', 'system_bets_for', 'settle_system_bets',
            'enter_all_active_systems', 'beat_gary', 'line_movers',
            'your_book_leaderboard', 'your_book_leaderboard_v2',
            'get_winners_desk_section', 'record_gary_talk',
            'publish_fantasy_briefing', 'replace_current_hub_research'))
       or (n.nspname = 'gary_private' and p.proname in (
            'lab_enter_system', 'lab_system_record', 'lab_streak'))
  loop
    execute format('drop function if exists %s cascade', f.sig);
  end loop;
end $$;

drop table if exists public.system_bets;
drop table if exists public.user_systems;
drop table if exists public.league_pulse;
drop function if exists public.league_pulse_set_updated_at() cascade;
drop table if exists public.night_highlights;
drop table if exists public.market_pulse;
drop table if exists public.fantasy_briefings;
drop table if exists public.gary_talk_usage;
drop table if exists public.gary_talk_allowlist;
drop table if exists public.today_board;
drop table if exists public.gary_thoughts;
drop table if exists public.bracket_picks;
drop table if exists public.bot_mention_log;
drop table if exists public.bot_mention_state;
