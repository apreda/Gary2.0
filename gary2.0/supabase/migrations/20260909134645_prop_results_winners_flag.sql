-- Prop results carry the same graded Winners flag as game results, so the
-- Billfold can show Gary's record as the picks that reached the Winners page.
-- A prop is a Winners pick when the exact published prop ticket (same date,
-- game, player, side, line and prop type) is on the immutable Winners board.
alter table public.prop_results add column if not exists is_winners_pick boolean not null default false;

create or replace function public.prop_result_on_winners_board(p_game_date date, p_game_id text, p_player text, p_bet text, p_line numeric, p_prop_type text)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(
    select 1 from public.winners_board b
    where b.kind='prop' and b.game_date=p_game_date::text and b.game_id=p_game_id
      and lower(b.pick_snapshot->>'player')=lower(coalesce(p_player,''))
      and lower(b.pick_snapshot->>'bet')=lower(coalesce(p_bet,''))
      and (b.pick_snapshot->>'line')::numeric=p_line
      and lower(regexp_replace(coalesce(b.pick_snapshot->>'prop',''),'\s+[+-]?\d+(\.\d+)?$',''))=lower(coalesce(p_prop_type,''))
  );
$$;

create or replace function public.stamp_prop_result_winners_flag() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.game_date is not null and new.game_date >= '2026-09-04' then
    new.is_winners_pick := public.prop_result_on_winners_board(new.game_date, new.game_id, new.player_name, new.bet, new.line_value, new.prop_type);
  end if;
  return new;
end; $$;

drop trigger if exists prop_results_winners_flag on public.prop_results;
create trigger prop_results_winners_flag before insert or update on public.prop_results
for each row execute function public.stamp_prop_result_winners_flag();

-- Backfill every prop graded since the Winners cutover.
update public.prop_results set is_winners_pick = public.prop_result_on_winners_board(game_date, game_id, player_name, bet, line_value, prop_type)
where game_date >= '2026-09-04';

revoke all on function public.prop_result_on_winners_board(date,text,text,text,numeric,text) from public,anon,authenticated;
grant execute on function public.prop_result_on_winners_board(date,text,text,text,numeric,text) to service_role;
