-- A touchdown Gary picks as a prop is a prop (founder, Sep 23 2026): it
-- counts in his record and may reach Winners like any other. Darts keeps its
-- own touchdowns, which never touch the record. Anytime TD leaves the Winners
-- props exclusion; home runs and first-TD long shots stay out. Historical
-- tickets stamped lane 'TD' keep their stamp and stay excluded.
do $$
declare d text := pg_get_functiondef('public.finish_winners_props'::regproc);
begin
  if strpos(d, 'home.?run|anytime.?t|first.?t') = 0 then
    raise exception 'finish_winners_props: expected prop exclusion pattern not found';
  end if;
  execute replace(d, 'home.?run|anytime.?t|first.?t', 'home.?run|first.?t');
end $$;
