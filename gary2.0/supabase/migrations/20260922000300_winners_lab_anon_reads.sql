-- The board is readable without an account during the founding preview
-- (get_winners_board grants anon). The play dossier and its desk sections
-- follow the same access rule inside the function, so the same callers may
-- reach them. Systems and Gary's line stay signed-in only.
grant execute on function public.get_winners_play(bigint) to anon;
grant execute on function public.get_winners_desk_section(bigint, integer) to anon;
