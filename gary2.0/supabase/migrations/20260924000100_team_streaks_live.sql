-- Team win/loss runs, live (founder, Sep 24 2026). The Darts W/L map showed
-- one club (Diamondbacks W4) because MLB runs surfaced only at four games and
-- refreshed with the nightly results runs. Now the `team-streaks` edge
-- function owns every `win` / `loss` row: every five minutes, both leagues,
-- runs of two or more, written for today's ET date. The nightly builders keep
-- the player streaks and the NFL's covers and never touch win/loss again.
--
-- Readers take each league's latest `game_date`, so a date must never hold one
-- half of the picture: whichever writer reaches a new date first carries the
-- other half forward from the latest earlier date, and the other writer
-- replaces it when it runs.

create or replace function public.carry_streaks_forward(p_date date, p_league text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_from date;
begin
  -- The runs (win/loss) and everything else are separate halves.
  if not exists (select 1 from public.streaks where game_date = p_date and league = p_league and kind in ('win', 'loss')) then
    select max(game_date) into v_from from public.streaks
      where league = p_league and kind in ('win', 'loss') and game_date < p_date;
    if v_from is not null then
      insert into public.streaks (game_date, league, subject_type, subject, team, kind, length, detail, next_game)
      select p_date, league, subject_type, subject, team, kind, length, detail, next_game
        from public.streaks where game_date = v_from and league = p_league and kind in ('win', 'loss')
      on conflict (game_date, league, kind, subject) do nothing;
    end if;
  end if;
  if not exists (select 1 from public.streaks where game_date = p_date and league = p_league and kind not in ('win', 'loss')) then
    select max(game_date) into v_from from public.streaks
      where league = p_league and kind not in ('win', 'loss') and game_date < p_date;
    if v_from is not null then
      insert into public.streaks (game_date, league, subject_type, subject, team, kind, length, detail, next_game)
      select p_date, league, subject_type, subject, team, kind, length, detail, next_game
        from public.streaks where game_date = v_from and league = p_league and kind not in ('win', 'loss')
      on conflict (game_date, league, kind, subject) do nothing;
    end if;
  end if;
end $function$;

-- One league's runs for one date, in one transaction, so a reader never
-- catches the moment between the delete and the insert.
create or replace function public.replace_team_runs(p_date date, p_league text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare v_n integer;
begin
  if p_league not in ('MLB', 'NFL') then raise exception 'Unknown league %', p_league; end if;
  delete from public.streaks where game_date = p_date and league = p_league and kind in ('win', 'loss');
  insert into public.streaks (game_date, league, subject_type, subject, team, kind, length, detail, next_game)
  select p_date, p_league, 'team', r->>'subject', r->>'team', r->>'kind', (r->>'length')::int, r->>'detail', r->>'next_game'
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
   where r->>'kind' in ('win', 'loss') and (r->>'length')::int >= 2 and coalesce(r->>'subject', '') <> '';
  get diagnostics v_n = row_count;
  perform public.carry_streaks_forward(p_date, p_league);
  return v_n;
end $function$;

revoke all on function public.carry_streaks_forward(date, text) from public, anon, authenticated;
revoke all on function public.replace_team_runs(date, text, jsonb) from public, anon, authenticated;
grant execute on function public.carry_streaks_forward(date, text) to service_role;
grant execute on function public.replace_team_runs(date, text, jsonb) to service_role;

-- Every five minutes, around the clock.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'team-streaks-5min';
  perform cron.schedule('team-streaks-5min', '*/5 * * * *', $cron$
    select net.http_post(
      url := 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/team-streaks',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
        (select 'Bearer ' || decrypted_secret from vault.decrypted_secrets where name = 'GARY_CRON_SERVICE_ROLE_KEY')),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$);
end;
$$;
