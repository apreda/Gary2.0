-- Explicit founder hold. Historical tickets and result/grade updates remain intact.
create or replace function public.ncaaf_hold_ticket(p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_array(
    coalesce(p->>'bdl_game_id',p->>'game_id',p->>'bdlGameId',p->>'gameId'),
    coalesce(p->>'pick',p->>'selection'),p->>'player',coalesce(p->>'prop',p->>'statType'),
    p->>'line',p->>'spread',p->>'odds',p->>'bet',coalesce(p->>'type',p->>'pickType'));
$$;
create or replace function public.enforce_ncaaf_publication_hold() returns trigger
language plpgsql set search_path = '' as $$
declare prior jsonb := '[]'::jsonb;
begin
  if tg_table_name = 'winners_board' then
    if upper(new.league) in ('NCAAF','AMERICANFOOTBALL_NCAAF') and
      (tg_op = 'INSERT' or upper(old.league) not in ('NCAAF','AMERICANFOOTBALL_NCAAF') or new.candidate_id is distinct from old.candidate_id) then
      raise exception 'PICK_LANE_PAUSED: NCAAF publication paused by Adam on 2026-09-19; data and bias review required';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then prior := coalesce(old.picks,'[]'::jsonb); end if;
  if exists (
    select public.ncaaf_hold_ticket(p) from jsonb_array_elements(coalesce(new.picks,'[]'::jsonb)) p
    where regexp_replace(lower(coalesce(p->>'league',p->>'sport',p->>'sport_key','')),'[^a-z0-9]','','g') in ('ncaaf','americanfootballncaaf','footballncaaf','collegefootball')
    except all
    select public.ncaaf_hold_ticket(p) from jsonb_array_elements(prior) p
    where regexp_replace(lower(coalesce(p->>'league',p->>'sport',p->>'sport_key','')),'[^a-z0-9]','','g') in ('ncaaf','americanfootballncaaf','footballncaaf','collegefootball')
  ) then
    raise exception 'PICK_LANE_PAUSED: NCAAF publication paused by Adam on 2026-09-19; data and bias review required';
  end if;
  return new;
end;
$$;
revoke all on function public.ncaaf_hold_ticket(jsonb) from public,anon,authenticated;
grant execute on function public.ncaaf_hold_ticket(jsonb) to service_role;
revoke all on function public.enforce_ncaaf_publication_hold() from public,anon,authenticated;
create trigger ncaaf_publication_hold before insert or update on public.daily_picks for each row execute function public.enforce_ncaaf_publication_hold();
create trigger ncaaf_publication_hold before insert or update on public.prop_picks for each row execute function public.enforce_ncaaf_publication_hold();
create trigger ncaaf_publication_hold before insert or update on public.winners_board for each row execute function public.enforce_ncaaf_publication_hold();
