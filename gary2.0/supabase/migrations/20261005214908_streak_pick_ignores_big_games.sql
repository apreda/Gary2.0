-- The streak pick has nothing to do with big games (founder, Oct 5 2026: "all I wanted was that all the MLB game
-- picks for the playoffs make it to the Winners page, has nothing to do with which pick gets picked as the streak
-- pick for the day"). The big-game branch (Oct 1) is removed: the streak pick is the day's first Winners play at
-- $300 or more, else the biggest stake at the day pass (the Sep 29 rule). Sunday's own NFL free games stay out.
do $mig$
declare def text; a int; b int;
begin
  def := pg_get_functiondef('public.select_streak_pick(text)'::regprocedure);
  a := position('  -- Big games first.' in def);
  b := position('  -- No big game (or no big-game play): the Sep 29 rule.' in def);
  if a = 0 or b = 0 or b < a then raise exception 'big-game branch markers not found'; end if;
  def := substr(def, 1, a - 1) || '  -- The streak pick: the first Winners play at $300 or more; else the biggest stake at the day pass.' || chr(10) || substr(def, b + length('  -- No big game (or no big-game play): the Sep 29 rule.'));
  execute def;
end $mig$;
