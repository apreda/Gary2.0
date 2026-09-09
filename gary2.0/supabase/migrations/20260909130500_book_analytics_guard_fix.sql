-- The guard trigger runs as the caller (authenticated), which has no usage on
-- user_experience_private, so the tag cleaner has to live in public.
begin;

create or replace function public.book_clean_tags(p_tags text[])
returns text[] language plpgsql immutable set search_path='' as $$
declare cleaned text[];
begin
  select coalesce(array_agg(distinct t order by t),'{}') into cleaned
  from (select lower(btrim(x)) t from unnest(coalesce(p_tags,'{}')) x where btrim(coalesce(x,''))<>'') s;
  if cardinality(cleaned)>8 then raise exception 'up to 8 tags per bet'; end if;
  if exists(select 1 from unnest(cleaned) t where t !~ '^[a-z0-9][a-z0-9 _.\-]{0,23}$') then
    raise exception 'tags are 1 to 24 letters, numbers, spaces, dashes or underscores'; end if;
  return cleaned;
end;
$$;
revoke all on function public.book_clean_tags(text[]) from public,anon;
grant execute on function public.book_clean_tags(text[]) to authenticated,service_role;
drop function if exists user_experience_private.clean_tags(text[]);

create or replace function public.user_bets_guard()
returns trigger language plpgsql set search_path='' as $$
declare trusted boolean := current_user in ('postgres','supabase_admin','service_role')
  or coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role'='service_role'
  or current_setting('app.user_bets_rpc',true)='1';
begin
  -- Serialize writes for the same account before mutation, including graders.
  perform pg_advisory_xact_lock(hashtextextended(coalesce(new.user_id,old.user_id)::text,914007));
  if tg_op='DELETE' then return old; end if;
  if coalesce(trusted,false) then return new; end if;
  if new.user_id is distinct from auth.uid() then raise exception 'not your bet'; end if;
  if length(coalesce(new.notes,''))>2000 or length(coalesce(new.bookmaker,''))>80 then
    raise exception 'notes or sportsbook name too long'; end if;
  if new.stake_units is null or new.stake_units::text='NaN' or new.stake_units<=0 or new.stake_units>10 then
    raise exception 'stake must be between 0.01 and 10 units'; end if;
  if tg_op='UPDATE' and (new.id is distinct from old.id or new.user_id is distinct from old.user_id
    or new.kind is distinct from old.kind or new.placed_at is distinct from old.placed_at) then
    raise exception 'bet identity is immutable'; end if;
  new.tags := public.book_clean_tags(new.tags);
  if new.kind='manual' then
    if new.odds_american is null or abs(new.odds_american::bigint) not between 100 and 100000 then
      raise exception 'American odds must be -100000 to -100 or +100 to +100000'; end if;
    if length(btrim(coalesce(new.pick_text,''))) not between 1 and 300
       or length(coalesce(new.description,''))>500 then raise exception 'enter a pick of 1 to 300 characters'; end if;
    if new.game_date < date '1900-01-01' or new.game_date > (now() at time zone 'America/New_York')::date+366 then
      raise exception 'bet date out of range'; end if;
    new.pick_text := btrim(new.pick_text);
    new.streak_pick := false; new.lock_at := null; new.odds_estimated := false;
    new.source_game_id := null; new.source_pick_id := null; new.source_line := null; new.source_side := null;
    new.gary_confidence := null;
    if tg_op='INSERT' then new.placed_at := now(); end if;
    new.graded_by := case when new.status='pending' then null else 'user' end;
    new.graded_at := case when new.status='pending' then null else now() end;
    new.units_net := case new.status when 'pending' then null when 'lost' then -new.stake_units
      when 'won' then round(new.stake_units * case when new.odds_american>0 then new.odds_american/100.0 else 100.0/abs(new.odds_american) end,2)
      when 'push' then 0 when 'void' then 0 end;
    return new;
  end if;
  if tg_op='INSERT' then raise exception 'verified bets must be placed through the app'; end if;
  -- Only personal annotation (favorite, notes, sportsbook, tags) is editable on
  -- locked verified tickets. Before lock, stake and the legacy streak flag
  -- remain editable; identity, market and grading are server-owned.
  if (to_jsonb(new)-array['is_favorite','notes','bookmaker','tags','stake_units','streak_pick']) is distinct from
     (to_jsonb(old)-array['is_favorite','notes','bookmaker','tags','stake_units','streak_pick']) then
    raise exception 'verified ticket and result are server-owned'; end if;
  if (new.stake_units is distinct from old.stake_units or new.streak_pick is distinct from old.streak_pick)
     and (old.status<>'pending' or old.lock_at is null or now()>=old.lock_at) then
    raise exception 'game is locked'; end if;
  return new;
end;
$$;

notify pgrst,'reload schema';
commit;
