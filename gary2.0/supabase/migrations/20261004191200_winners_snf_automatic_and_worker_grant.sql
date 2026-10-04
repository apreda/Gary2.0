-- 1) The Winners worker runs as service_role. 20261004143000 revoked execute on
--    nfl_sunday_night from public without granting it back, so from that
--    moment (10:30 AM ET) every sweep and every finished read failed with
--    "permission denied" and the 4:25 PM and SNF game reads stayed unread.
--    The three unread 4:25 PM candidates were reset to pending by hand and
--    read again (event 'read_reset').
grant execute on function gary_private.nfl_sunday_night(timestamptz) to service_role;

-- 2) Founder, Oct 4 2026: "the SNF pick always qualifies as a Winners pick for
--    the game pick only not props." Sunday Night Football's game pick takes the
--    automatic route MLB games and college main games take: any stake, any
--    reader assessment, the reader not required. The published original is
--    matched in weekly_nfl_picks, where NFL picks are published.
do $$
declare d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid=p.pronamespace
   where s.nspname='gary_private' and p.proname='admit_winners_candidate';
  n := replace(d, $q$automatic_game:=automatic_mlb or (c.league='NCAAF' and big);$q$,
                  $q$automatic_game:=automatic_mlb or (c.league in ('NCAAF','NFL') and big);$q$);
  if n = d then raise exception 'automatic line not found'; end if;
  d := n;
  n := replace(d, $q$  if not exists (
   select 1 from public.daily_picks d
   cross join lateral jsonb_array_elements(d.picks) published(pick)
   where d.date=c.game_date and published.pick=c.pick_snapshot
     and (published.pick->>'commence_time')::timestamptz=c.commence_time
  ) then return 'unpublished'; end if;$q$,
                  $q$  if not exists (
   select 1 from public.daily_picks d
   cross join lateral jsonb_array_elements(d.picks) published(pick)
   where d.date=c.game_date and published.pick=c.pick_snapshot
     and (published.pick->>'commence_time')::timestamptz=c.commence_time
  ) and not (c.league='NFL' and exists (
   select 1 from public.weekly_nfl_picks w
   cross join lateral jsonb_array_elements(w.picks) published(pick)
   where published.pick=c.pick_snapshot
     and (published.pick->>'commence_time')::timestamptz=c.commence_time
  )) then return 'unpublished'; end if;$q$);
  if n = d then raise exception 'publication check not found'; end if;
  d := n;
  n := replace(d, $q$        when c.league='NCAAF' and big then 'College main game; automatic qualification'$q$,
                  $q$        when c.league='NCAAF' and big then 'College main game; automatic qualification'
        when c.league='NFL' and big then 'Sunday Night Football; automatic qualification'$q$);
  if n = d then raise exception 'reason line not found'; end if;
  execute n;

  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid=p.pronamespace
   where s.nspname='public' and p.proname='admit_winners_pending';
  n := replace(d, $q$(c.kind='game' and (c.league='MLB' or (c.league='NCAAF' and exists($q$,
                  $q$(c.kind='game' and (c.league='MLB' or ((c.league='NCAAF' or (c.league='NFL' and gary_private.nfl_sunday_night(c.commence_time))) and exists($q$);
  if n = d then raise exception 'sweep automatic line not found'; end if;
  execute n;
end $$;
