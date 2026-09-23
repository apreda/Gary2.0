-- Darts, Sep 23 2026 (founder):
-- 1. The NFL's empty spot beside the parlay shows LAST WEEK GARY HIT: his NFL
--    props that won in the last full NFL week (Tuesday to Monday), biggest
--    price first. MLB keeps YESTERDAY GARY HIT from the darts.
-- 2. No over/under runs and no runs against the spread anywhere ("I don't want
--    to worry about over and unders and things like that... It won't be
--    something we do anymore"). The streak builders stopped writing them; the
--    rows already written go, and get_darts never hands them out.

delete from public.streaks where kind in ('over', 'under', 'cover', 'nocover');

create or replace function public.get_darts(p_date text)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare v_day date; v_week date;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  v_day := p_date::date;
  -- The Tuesday that opens the current NFL week; last week is the seven days before it.
  v_week := v_day - ((extract(isodow from v_day)::int - 2 + 7) % 7);
  return jsonb_build_object(
    'date', v_day,
    'today', public.darts_day(v_day),
    -- Yesterday's hits only: the page celebrates what landed, never a tally.
    'yesterday', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'league', d.league, 'kind', d.kind, 'player', d.player, 'matchup', d.matchup,
        'prop', d.prop, 'bet', d.bet, 'odds', d.odds, 'actual', d.actual)
        order by d.odds desc nulls last, d.id), '[]'::jsonb)
      from public.darts d where d.game_date = v_day - 1 and d.result = 'hit'),
    -- The NFL plays weekly: last week's props that won.
    'last_week', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', -w.n, 'league', 'NFL', 'kind', w.prop_type, 'player', w.player_name, 'matchup', w.matchup,
        'prop', w.prop_type, 'bet', w.bet, 'odds', w.odds_i, 'actual', w.actual_value, 'line', w.line_value)
        order by w.odds_i desc nulls last, w.n), '[]'::jsonb)
      from (select pr.prop_type, pr.player_name, pr.matchup, pr.bet, pr.actual_value, pr.line_value,
                   case when pr.odds ~ '^[+-]?\d+$' then pr.odds::int end as odds_i,
                   row_number() over (order by pr.game_date, pr.player_name, pr.prop_type) as n
            from public.prop_results pr
            where upper(pr.sport) = 'NFL' and pr.result = 'won'
              and pr.game_date >= v_week - 7 and pr.game_date < v_week) w),
    'streaks', (select coalesce(jsonb_agg(jsonb_build_object(
        'game_date', s.game_date, 'league', s.league, 'subject_type', s.subject_type, 'subject', s.subject,
        'team', s.team, 'kind', s.kind, 'length', s.length, 'detail', s.detail, 'next_game', s.next_game)
        order by s.league, s.length desc), '[]'::jsonb)
      from (select s.* from public.streaks s
            where s.league in ('MLB', 'NFL')
              and s.kind not in ('over', 'under', 'cover', 'nocover')
              and s.game_date = (select max(x.game_date) from public.streaks x where x.league = s.league)
            order by s.league, s.length desc limit 120) s),
    'run', public.gary_run(v_day));
end $function$;
