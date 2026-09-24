-- THE PARLAY TICKET READS ITS RESULTS (founder GO, Sep 24 2026, the Darts
-- featured-row doc). A dart leg takes its grade from the darts table: a
-- first-inning dart has no prop result to find, so Sep 23's ticket said "no
-- result" on four legs the darts table had graded two hit, two missed. Each
-- leg also names its player (for the card a tapped leg opens), and the
-- ticket carries its own result and how many legs landed (for the ticket's
-- foot and the YESTERDAY GARY HIT tape).

create or replace function gary_private.parlay_leg_result(p_leg jsonb, p_day date) returns text
language sql stable set search_path = '' as $$
  select case
    when p_leg->>'key' ~ '^dart:[0-9]+$' then (
      select case when d.scratched_at is not null then 'push'
                  when d.result = 'hit' then 'won'
                  when d.result = 'miss' then 'lost'
                  when d.result = 'void' then 'push' end
      from public.darts d where d.id = substring(p_leg->>'key' from 6)::bigint)
    else (select case when r like 'won%' or r like 'win%' then 'won'
                      when r like 'lost%' or r like 'loss%' then 'lost'
                      when r like 'push%' or r like 'void%' then 'push' end
          from (select lower(coalesce(gary_private.lab_ticket_result(
                  p_leg->'grade'->>'kind', p_leg->>'league', to_char(p_day, 'YYYY-MM-DD'), p_leg->>'game_id',
                  coalesce(p_leg->'grade'->>'pick_text', ''), coalesce(p_leg->'grade'->'snapshot', '{}'::jsonb))->>'result', '')) as r) x)
  end
$$;

create or replace function public.get_parlay(p_date text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_day date; v_p public.parlay_of_the_day; v_legs jsonb; v_n int; v_won int; v_lost int; v_push int;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  v_day := p_date::date;
  select * into v_p from public.parlay_of_the_day where game_date = v_day;
  if not found then return null; end if;

  select jsonb_agg(x.leg order by x.n) into v_legs from (
    select (l->>'n')::int as n, (l || jsonb_build_object(
        'result', gary_private.parlay_leg_result(l, v_day),
        'live', (select jsonb_build_object('status', ls.status, 'detail', ls.detail, 'away_abbr', ls.away_abbr, 'home_abbr', ls.home_abbr,
                                           'away_score', ls.away_score, 'home_score', ls.home_score)
                 from public.live_scores ls where ls.date = v_day and ls.league = (l->>'league') and ls.game_id = (l->>'game_id')
                 order by ls.updated_at desc limit 1),
        'team', case when l->>'key' ~ '^dart:[0-9]+$'
          then (select nullif(d.team, '') from public.darts d where d.id = substring(l->>'key' from 6)::bigint)
          else nullif(l->'grade'->'snapshot'->>'team', '') end,
        'player', case when l->>'key' ~ '^dart:[0-9]+$'
          then (select case when d.kind = 'first_inning' then null else d.player end from public.darts d where d.id = substring(l->>'key' from 6)::bigint)
          else nullif(l->'grade'->'snapshot'->>'player', '') end,
        'player_id', case when l->>'key' ~ '^dart:[0-9]+$'
          then (select nullif(d.player_id::text, '') from public.darts d where d.id = substring(l->>'key' from 6)::bigint)
          else nullif(l->'grade'->'snapshot'->>'player_id', '') end
      )) - 'grade' as leg
    from jsonb_array_elements(v_p.legs) l) x;

  select count(*), count(*) filter (where e->>'result' = 'won'), count(*) filter (where e->>'result' = 'lost'),
         count(*) filter (where e->>'result' = 'push')
    into v_n, v_won, v_lost, v_push
  from jsonb_array_elements(coalesce(v_legs, '[]'::jsonb)) e;

  return jsonb_build_object(
    'date', v_p.game_date, 'american_odds', v_p.american_odds, 'payout_10', v_p.payout_10, 'reason', v_p.reason,
    'result', case when v_lost > 0 then 'lost' when v_won > 0 and v_won + v_push = v_n then 'won' end,
    'landed', v_won,
    'legs', v_legs);
end $$;
revoke all on function public.get_parlay(text) from public;
grant execute on function public.get_parlay(text) to anon, authenticated, service_role;
