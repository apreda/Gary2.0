-- Fill the omitted NFL-style bet step on an exact, unstarted college prop.
-- Published identity, quote, case and research never change. Idempotent and
-- serialized with ordinary prop publication; only the service can call it.
CREATE OR REPLACE FUNCTION public.fill_ncaaf_prop_bet(p_date text, p_pick jsonb, p_bet jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare saved public.prop_picks; idx integer; c record; added integer:=0;
begin
 if upper(coalesce(p_pick->>'sport',p_pick->>'league',''))<>'NCAAF'
   or p_pick ? 'gary_bet' then raise exception 'Expected an original college prop without a bet'; end if;
 if jsonb_typeof(p_bet)<>'object' or jsonb_typeof(p_bet->'play')<>'boolean'
   or nullif(p_bet->>'decided_at','') is null then raise exception 'Missing Gary bet decision'; end if;
 if (p_bet->>'play')::boolean and (
   jsonb_typeof(p_bet->'stake_dollars') is distinct from 'number'
   or (p_bet->>'stake_dollars')::numeric<100
   or trunc((p_bet->>'stake_dollars')::numeric)<>(p_bet->>'stake_dollars')::numeric
 ) then raise exception 'Invalid Gary stake'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('prop_picks|'||p_date,0));
 select * into saved from public.prop_picks where date=p_date for update;
 if not found then return 0; end if;
 select (ord-1)::integer into idx from jsonb_array_elements(saved.picks) with ordinality as t(p,ord)
   where p=p_pick limit 1;
 if idx is null or nullif(p_pick->>'commence_time','')::timestamptz<=clock_timestamp()
   or nullif(p_pick->>'commence_time','') is null then return 0; end if;
 -- Lock the existing candidate before touching either copy.
 for c in select id,admitted_at from public.winners_candidates
   where game_date=p_date and league='NCAAF' and kind='prop'
     and pick_snapshot=p_pick for update
 loop
   if c.admitted_at is not null then return 0; end if;
 end loop;
 update public.prop_picks set picks=jsonb_set(picks,array[idx::text,'gary_bet'],p_bet)
   where date=p_date;
 for c in update public.winners_candidates set pick_snapshot=pick_snapshot||jsonb_build_object('gary_bet',p_bet)
   where game_date=p_date and league='NCAAF' and kind='prop' and pick_snapshot=p_pick
     and admitted_at is null returning id
 loop
   insert into public.winners_decision_events(candidate_id,event,detail)
     values(c.id,'bet_step_recovered',jsonb_build_object('gary_bet',p_bet));
   perform gary_private.admit_winners_candidate(c.id);
   added:=added+1;
 end loop;
 return 1;
end $function$;
REVOKE ALL ON FUNCTION public.fill_ncaaf_prop_bet(text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fill_ncaaf_prop_bet(text,jsonb,jsonb) TO service_role;
