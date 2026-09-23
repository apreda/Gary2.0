-- Darts results (founder, Sep 23 2026): leans are not bets and never reach the
-- Billfold, but each one is marked hit, miss or void from the box score once
-- its game is final (src/services/darts/dartsGrade.js, in the results run),
-- and the page shows yesterday's hits.
alter table public.darts
  add column if not exists result text check (result in ('hit', 'miss', 'void')),
  add column if not exists actual numeric,
  add column if not exists graded_at timestamptz;

create or replace function public.get_darts(p_date text)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare v_day date;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  v_day := p_date::date;
  return jsonb_build_object(
    'date', v_day,
    'today', public.darts_day(v_day),
    -- Yesterday's hits only: the page celebrates what landed, never a tally.
    'yesterday', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'league', d.league, 'kind', d.kind, 'player', d.player, 'matchup', d.matchup,
        'prop', d.prop, 'bet', d.bet, 'odds', d.odds, 'actual', d.actual)
        order by d.odds desc nulls last, d.id), '[]'::jsonb)
      from public.darts d where d.game_date = v_day - 1 and d.result = 'hit'),
    'streaks', (select coalesce(jsonb_agg(jsonb_build_object(
        'game_date', s.game_date, 'league', s.league, 'subject_type', s.subject_type, 'subject', s.subject,
        'team', s.team, 'kind', s.kind, 'length', s.length, 'detail', s.detail, 'next_game', s.next_game)
        order by s.league, s.length desc), '[]'::jsonb)
      from (select s.* from public.streaks s
            where s.league in ('MLB', 'NFL')
              and s.game_date = (select max(x.game_date) from public.streaks x where x.league = s.league)
            order by s.league, s.length desc limit 120) s),
    'run', public.gary_run(v_day));
end $$;
