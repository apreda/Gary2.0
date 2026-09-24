-- The parlay button shows each leg's club (founder, Sep 23 2026: the team
-- badges on the Darts parlay button). A leg now carries `team`: the player's
-- club for a player leg (a dart's own team, a Winners prop's snapshot team);
-- null for a game leg, whose words already name the club ("Cubs game: ...",
-- "Twins ML"), which the app reads against the matchup.

create or replace function public.get_parlay(p_date text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_day date; v_p public.parlay_of_the_day;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  v_day := p_date::date;
  select * into v_p from public.parlay_of_the_day where game_date = v_day;
  if not found then return null; end if;
  return jsonb_build_object(
    'date', v_p.game_date, 'american_odds', v_p.american_odds, 'payout_10', v_p.payout_10, 'reason', v_p.reason,
    'legs', (select jsonb_agg(l || jsonb_build_object(
        'result', (gary_private.lab_ticket_result(l->'grade'->>'kind', l->>'league', to_char(v_day, 'YYYY-MM-DD'), l->>'game_id',
                     coalesce(l->'grade'->>'pick_text', ''), coalesce(l->'grade'->'snapshot', '{}'::jsonb)))->>'result',
        'live', (select jsonb_build_object('status', ls.status, 'detail', ls.detail, 'away_abbr', ls.away_abbr, 'home_abbr', ls.home_abbr,
                                           'away_score', ls.away_score, 'home_score', ls.home_score)
                 from public.live_scores ls where ls.date = v_day and ls.league = (l->>'league') and ls.game_id = (l->>'game_id')
                 order by ls.updated_at desc limit 1),
        'team', case
          when l->>'key' ~ '^dart:[0-9]+$' then
            (select nullif(d.team, '') from public.darts d where d.id = substring(l->>'key' from 6)::bigint)
          else nullif(l->'grade'->'snapshot'->>'team', '')
        end) - 'grade'
      order by (l->>'n')::int) from jsonb_array_elements(v_p.legs) l));
end $$;
revoke all on function public.get_parlay(text) from public;
grant execute on function public.get_parlay(text) to anon, authenticated, service_role;
