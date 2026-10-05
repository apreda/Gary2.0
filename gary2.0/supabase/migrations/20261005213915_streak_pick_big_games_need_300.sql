-- The streak pick is never under $300 when a $300 bet exists (founder, Oct 5 2026: "the Yankees pick should be
-- the streak one not the 100 White Sox one. It can't be one under 300 bet"). The big-game path picked the
-- biggest stake among big games with no floor; every MLB playoff game is a big game, so a $100 White Sox play won.
-- Big games now need 3 units ($300); without one, the Sep 29 rule (first $300+ play) runs. The biggest-stake
-- fallback at the day pass is unchanged: it only fires on a day with no $300+ play at all.
do $mig$
declare def text; old text := $a$    where w.game_date = p_date and w.kind = 'game' and c.commence_time > now()
      and not (g.league = 'NFL' and g.game_id = any(v_own))
    order by coalesce(w.stake_units, 0) desc, c.commence_time desc, w.admitted_at asc$a$;
begin
  def := pg_get_functiondef('public.select_streak_pick(text)'::regprocedure);
  if (length(def) - length(replace(def, old, ''))) / length(old) <> 1 then raise exception 'big-game selection not found exactly once'; end if;
  def := replace(def, old, $a$    where w.game_date = p_date and w.kind = 'game' and c.commence_time > now() and coalesce(w.stake_units, 0) >= 3
      and not (g.league = 'NFL' and g.game_id = any(v_own))
    order by coalesce(w.stake_units, 0) desc, c.commence_time desc, w.admitted_at asc$a$);
  execute def;
end $mig$;
