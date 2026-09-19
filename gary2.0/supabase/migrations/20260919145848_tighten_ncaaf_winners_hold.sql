-- Keep historical grade/status changes, but block rewritten Winners tickets too.
create or replace function public.enforce_ncaaf_publication_hold() returns trigger
language plpgsql set search_path = '' as $$
declare prior jsonb := '[]'::jsonb;
begin
  if tg_table_name = 'winners_board' then
    if regexp_replace(lower(new.league),'[^a-z0-9]','','g') in ('ncaaf','americanfootballncaaf','footballncaaf','collegefootball') and
      (tg_op = 'INSERT' or regexp_replace(lower(old.league),'[^a-z0-9]','','g') not in ('ncaaf','americanfootballncaaf','footballncaaf','collegefootball') or new.candidate_id is distinct from old.candidate_id or public.ncaaf_hold_ticket(new.pick_snapshot) is distinct from public.ncaaf_hold_ticket(old.pick_snapshot)) then
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
