-- Public factual cache; only the internal scheduled writer can change it.
create table public.mlb_live_batting (
  date date not null,
  game_id text not null check (game_id ~ '^[1-9][0-9]*$'),
  source text not null default 'balldontlie' check (source = 'balldontlie'),
  is_final boolean not null,
  fetched_at timestamptz not null,
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 100),
  primary key (date, game_id)
);
alter table public.mlb_live_batting enable row level security;
revoke all on public.mlb_live_batting from public, anon, authenticated;
grant select on public.mlb_live_batting to anon, authenticated;
grant select, insert, update, delete on public.mlb_live_batting to service_role;
create policy public_batting_read on public.mlb_live_batting for select to anon, authenticated using (true);

-- Overlapping refreshes cannot demote a reconciled final or replace newer
-- evidence with a slow older request. The original graded ledger is separate.
create function public.publish_mlb_live_batting(p_date date, p_game_id text, p_fetched_at timestamptz,
  p_is_final boolean, p_lines jsonb) returns boolean language plpgsql set search_path = '' as $$
declare changed integer;
begin
  insert into public.mlb_live_batting(date,game_id,fetched_at,is_final,lines)
    values(p_date,p_game_id,p_fetched_at,p_is_final,p_lines)
    on conflict(date,game_id) do update set fetched_at=excluded.fetched_at,is_final=excluded.is_final,lines=excluded.lines
    where not mlb_live_batting.is_final and excluded.fetched_at > mlb_live_batting.fetched_at;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.publish_mlb_live_batting(date,text,timestamptz,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.publish_mlb_live_batting(date,text,timestamptz,boolean,jsonb) to service_role;

-- Use the existing service credential in Vault; no secret enters cron text.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'GARY_CRON_SERVICE_ROLE_KEY' and length(trim(decrypted_secret)) > 0) then
    raise exception 'Configure the cron service credential before this migration';
  end if;
  perform cron.schedule('mlb-live-batting-1min', '* * * * *', $cron$
    select net.http_post(
      url := 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/mlb-live-batting',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
        (select 'Bearer ' || decrypted_secret from vault.decrypted_secrets where name = 'GARY_CRON_SERVICE_ROLE_KEY')),
      body := '{}'::jsonb, timeout_milliseconds := 60000
    );
  $cron$);
  perform cron.schedule('mlb-live-batting-retention', '10 10 * * *', $cron$
    delete from public.mlb_live_batting where date < (now() at time zone 'America/New_York')::date - 3;
  $cron$);
end;
$$;
