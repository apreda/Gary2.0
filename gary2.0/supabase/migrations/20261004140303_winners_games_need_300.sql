-- Founder, Oct 4 2026: "Why are these picks on the winners page they aren't 300
-- or more? ... I only said for mlb that every game pick was going to make it
-- to the winners page." Since the Sep 24 gate, a game outside MLB and college
-- was admitted whenever Gary played it at any stake and the reader said clear
-- or lean (Sep 27: five NFL games under $300; Oct 4: six). A game now also
-- needs Gary's stake at $300 or more. Prime-time big games, MLB's automatic
-- route, college and props are unchanged. Nothing new can qualify.
do $$
declare d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid=p.pronamespace
   where s.nspname='gary_private' and p.proname='admit_winners_candidate';
  n := replace(d, $q$ok:=(play and grade in ('clear','lean')) or (big and grade<>'unsupported');$q$,
                  $q$ok:=(play and stake>=300 and grade in ('clear','lean')) or (big and grade<>'unsupported');$q$);
  if n = d then raise exception 'gate line not found in admit_winners_candidate'; end if;
  d := n;
  n := replace(d, $q$when c.kind='prop' then 'prop_not_clear_under_300' else 'grade_'||grade end;$q$,
                  $q$when c.kind='prop' then 'prop_not_clear_under_300'
            when c.kind='game' and play and stake<300 and grade in ('clear','lean') then 'game_under_300' else 'grade_'||grade end;$q$);
  if n = d then raise exception 'reason line not found in admit_winners_candidate'; end if;
  execute n;

  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid=p.pronamespace
   where s.nspname='public' and p.proname='admit_winners_pending';
  n := replace(d, $q$else c.review->>'assessment' in ('clear','lean') end)$q$,
                  $q$else c.review->>'assessment' in ('clear','lean') and (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric>=300 end)$q$);
  if n = d then raise exception 'gate line not found in admit_winners_pending'; end if;
  execute n;
end $$;
