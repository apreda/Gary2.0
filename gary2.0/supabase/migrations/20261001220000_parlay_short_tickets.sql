-- PARLAY OF THE DAY, SHORT TICKETS (founder, Oct 1 2026: "no parlay we've
-- gotten has been any good, they are all way too long, like +4500"; 0 for 8
-- since Sep 22, priced +787 to +9152). Limits on the ticket, like the house
-- limit on a moneyline:
--   - two or three legs (was three to five);
--   - no leg longer than +150, so home run darts and other long shots stay
--     off the list;
--   - the whole ticket pays no more than +600.
-- A rejected ticket is asked again at once, with the reason it was not
-- posted, at most four asks a day.
do $$
declare
  v_def text;
  v_old text;
  v_new text;
  procedure_name text;
  -- [function, old text, new text]
  edits text[][] := array[
    ['gary_private.parlay_candidates',
     $q$where d.reader is distinct from 'unsupported'$q$,
     $q$where d.reader is distinct from 'unsupported'
    and d.odds <= 150 -- no leg longer than +150 (founder, Oct 1 2026)$q$],
    ['gary_private.parlay_contract',
     $q$Three or four legs; five is allowed.$q$,
     $q$Two or three legs, and the whole ticket pays no more than +600.$q$],
    ['gary_private.parlay_enqueue_with',
     $q$v_props jsonb; v_required jsonb;$q$,
     $q$v_props jsonb; v_required jsonb; v_last text;$q$],
    ['gary_private.parlay_enqueue_with',
     $q$and (j.status in ('queued','running') or j.completed_at > now() - interval '20 minutes')) then return 0; end if;$q$,
     $q$and (j.status in ('queued','running') or (j.status <> 'failed' and j.completed_at > now() - interval '20 minutes'))) then return 0; end if;
  -- A rejected ticket is asked again at once with its reason; four asks a day at most.
  if (select count(*) from public.parlay_jobs x where x.game_date = p_day) >= 4 then return 0; end if;
  select replace(s.error, 'parlay rejected: ', '') into v_last
    from public.parlay_jobs pj join public.subscription_model_jobs s on s.id = pj.job_id
    where pj.game_date = p_day and s.status = 'failed' and s.error like 'parlay rejected:%'
    order by pj.created_at desc limit 1;$q$],
    ['gary_private.parlay_enqueue_with',
     $q$if v_n + v_fixed < 4 or v_games < 2 then return 0; end if;$q$,
     $q$if v_n + v_fixed < 3 or v_games < 2 then return 0; end if;$q$],
    ['gary_private.parlay_enqueue_with',
     $q$v_min := greatest(1, 3 - v_fixed); v_max := 5 - v_fixed;$q$,
     $q$v_min := greatest(1, 2 - v_fixed); v_max := greatest(1, 3 - v_fixed);$q$],
    ['gary_private.parlay_enqueue_with',
     $q$v_min := greatest(1, v_min - 1); v_max := v_max - 1; end if;$q$,
     $q$v_min := greatest(1, v_min - 1); v_max := greatest(v_min, v_max - 1); end if;$q$],
    ['gary_private.parlay_enqueue_with',
     $q$jsonb_build_object('role', 'user', 'content',
      case when v_fixed > 0$q$,
     $q$jsonb_build_object('role', 'user', 'content',
      coalesce('YOUR LAST TICKET WAS NOT POSTED: ' || v_last || '. Build it again.' || chr(10) || chr(10), '') ||
      case when v_fixed > 0$q$],
    ['gary_private.parlay_collect',
     $q$ok := coalesce(cardinality(chosen), 0) between 3 and 5$q$,
     $q$ok := coalesce(cardinality(chosen), 0) between 2 and 3$q$],
    ['gary_private.parlay_collect',
     $q$'parlay rejected: the ticket was not three to five different legs from the list'$q$,
     $q$'parlay rejected: the ticket was not two or three different legs from the list'$q$],
    ['gary_private.parlay_collect',
     $q$select * into v_price from gary_private.parlay_price(prices);
      insert into public.parlay_of_the_day$q$,
     $q$select * into v_price from gary_private.parlay_price(prices);
      if v_price.american_odds > 600 then
        ok := false; why := format('parlay rejected: the ticket paid +%s, past the +600 limit', v_price.american_odds);
      end if;
    end if;
    if ok then
      insert into public.parlay_of_the_day$q$]
  ];
  i integer;
begin
  for i in 1 .. array_length(edits, 1) loop
    procedure_name := edits[i][1];
    v_old := edits[i][2];
    v_new := edits[i][3];
    v_def := pg_get_functiondef(procedure_name::regproc);
    if position(v_old in v_def) = 0 then
      raise exception 'parlay short tickets: edit % not found in %', i, procedure_name;
    end if;
    execute replace(v_def, v_old, v_new);
  end loop;
end $$;
