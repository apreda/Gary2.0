-- Primetime read the game pick for NFL and MLB only. When NBA got its Primetime card (Oct 19 2026) this was missed, so an
-- NBA card always showed an empty GAME PICK slot, and the write-up job, which rewrites a piece once a pick lands, never
-- saw one: Gary's opening kept saying "my pick isn't out yet" next to his own bets on the game.
create or replace function gary_private.primetime_pick(p_date date, p_league text, p_game_id text)
returns jsonb
language sql stable set search_path = '' as $$
  select x.pk from (
    select pk, 1 as o from public.weekly_nfl_picks w, jsonb_array_elements(w.picks) pk
    where p_league = 'NFL' and w.season = extract(year from p_date)::int
      and coalesce(pk->>'bdl_game_id', pk->>'game_id') = p_game_id
    union all
    select pk, 2 from public.daily_picks d, jsonb_array_elements(d.picks) pk
    where p_league in ('MLB', 'NBA') and d.date = to_char(p_date, 'YYYY-MM-DD')
      and upper(coalesce(pk->>'league', '')) = p_league and coalesce(pk->>'game_id', pk->>'bdl_game_id') = p_game_id
  ) x order by x.o, x.pk->>'published_at' desc nulls last limit 1
$$;
