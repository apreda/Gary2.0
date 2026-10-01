-- Leaderboard logging alert (founder GO, Oct 1 2026). Gary's Winners picks go on
-- Adam's own Action Network and Betstamp accounts, and both verify a pick only at
-- the line on the board when it is logged. Each new Winners play reaches his
-- inbox within about two minutes of Gary's bet with the exact line to enter; a
-- play Gary later scratches gets a follow-up so it can be deleted there too.
-- Logging stays by hand: both platforms' terms ban automated access. Units are
-- Gary's stake / $100, capped at Action Network's 3-unit verified maximum.
-- Code only, no AI. Turn off with: select cron.unschedule('gary-leaderboard-alerts');

create table if not exists gary_ops.leaderboard_alerts (
  candidate_id bigint not null,
  event text not null check (event in ('log', 'scratch')),
  mail_id uuid,
  created_at timestamptz not null default now(),
  primary key (candidate_id, event)
);

create or replace function gary_ops.leaderboard_pick_text(w public.winners_board) returns text
language sql stable set search_path to '' as $$
  select case when w.kind = 'prop' then concat_ws(' ',
      w.pick_snapshot->>'player', w.pick_snapshot->>'bet', w.pick_snapshot->>'line',
      case split_part(w.pick_snapshot->>'prop', ' ', 1)
        when 'hits_runs_rbis' then 'hits + runs + RBIs'
        when 'pitcher_outs' then 'outs recorded'
        when 'pitcher_hits_allowed' then 'hits allowed'
        when 'pitcher_strikeouts' then 'strikeouts'
        else replace(split_part(w.pick_snapshot->>'prop', ' ', 1), '_', ' ') end,
      case when w.pick_snapshot->>'odds' ~ '^[0-9]' then '+' || (w.pick_snapshot->>'odds') else w.pick_snapshot->>'odds' end)
    else w.pick_snapshot->>'pick' end
    || ' · ' || trim_scale(least(w.stake_units, 3))
    || case when least(w.stake_units, 3) = 1 then ' unit' else ' units' end
$$;

create or replace function gary_ops.leaderboard_pick_detail(w public.winners_board) returns text
language sql stable set search_path to '' as $$
  select coalesce(w.pick_snapshot->>'matchup', (w.pick_snapshot->>'awayTeam') || ' @ ' || (w.pick_snapshot->>'homeTeam'))
    || ' · ' || w.league || case when w.kind = 'prop' then ' prop' else '' end
    || ' · ' || to_char((w.pick_snapshot->>'commence_time')::timestamptz at time zone 'America/New_York', 'FMHH12:MI AM') || ' ET'
    || E'\n' || 'Gary''s stake $' || round(w.stake_units * 100)
$$;

create or replace function gary_ops.leaderboard_alert_mail() returns uuid
language plpgsql security definer set search_path to '' as $$
declare
  cfg gary_ops.settings;
  log_ids bigint[]; log_text text; log_first text;
  scr_ids bigint[]; scr_text text; scr_first text;
  n_log int; n_scr int; subject text; body text; new_mail uuid;
begin
  if not pg_try_advisory_xact_lock(20261001, 1) then return null; end if;
  select * into cfg from gary_ops.settings where singleton;
  if not found or not cfg.enabled then return null; end if;

  -- New plays: admitted in the last 30 minutes (an older line has already moved),
  -- game not started, not scratched, not alerted.
  select array_agg(candidate_id order by admitted_at),
         string_agg(gary_ops.leaderboard_pick_text(f) || E'\n' || gary_ops.leaderboard_pick_detail(f), E'\n\n' order by admitted_at),
         (array_agg(gary_ops.leaderboard_pick_text(f) order by admitted_at))[1]
    into log_ids, log_text, log_first
    from (select w.* from public.winners_board w
          where w.scratched_at is null
            and w.admitted_at >= now() - interval '30 minutes'
            and nullif(w.pick_snapshot->>'commence_time', '')::timestamptz > now()
            and not exists (select 1 from gary_ops.leaderboard_alerts a
                            where a.candidate_id = w.candidate_id and a.event = 'log')
          order by w.admitted_at limit 20) f;

  -- Plays already sent that Gary has since scratched.
  select array_agg(candidate_id order by scratched_at),
         string_agg(gary_ops.leaderboard_pick_text(f) || E'\n' || gary_ops.leaderboard_pick_detail(f), E'\n\n' order by scratched_at),
         (array_agg(gary_ops.leaderboard_pick_text(f) order by scratched_at))[1]
    into scr_ids, scr_text, scr_first
    from (select w.* from public.winners_board w
          where w.scratched_at is not null
            and exists (select 1 from gary_ops.leaderboard_alerts a
                        where a.candidate_id = w.candidate_id and a.event = 'log')
            and not exists (select 1 from gary_ops.leaderboard_alerts a
                            where a.candidate_id = w.candidate_id and a.event = 'scratch')
          limit 20) f;

  n_log := coalesce(array_length(log_ids, 1), 0);
  n_scr := coalesce(array_length(scr_ids, 1), 0);
  if n_log = 0 and n_scr = 0 then return null; end if;

  subject := case
    when n_log = 1 then 'Log now: ' || log_first
    when n_log > 1 then 'Log now: ' || log_first || ' +' || (n_log - 1) || ' more'
    when n_scr = 1 then 'Pulled: ' || scr_first
    else 'Pulled: ' || scr_first || ' +' || (n_scr - 1) || ' more' end;

  body := '';
  if n_log > 0 then
    body := 'Log on Action Network and Betstamp before the line moves.' || E'\n\n' || log_text;
  end if;
  if n_scr > 0 then
    body := body || case when body = '' then '' else E'\n\n\n' end
      || 'Gary pulled ' || case when n_scr = 1 then 'this pick' else 'these picks' end
      || '. Delete it on Action Network and Betstamp if the game has not started.' || E'\n\n' || scr_text;
  end if;
  body := body || E'\n\n' || 'Units are Gary''s stake divided by $100, capped at 3. Automatic alert from the Winners board. No AI was used.';

  insert into gary_ops.mail(payload) values (jsonb_build_object(
    'from', cfg.sender, 'to', jsonb_build_array(cfg.recipient), 'subject', subject, 'text', body))
    returning id into new_mail;
  insert into gary_ops.leaderboard_alerts(candidate_id, event, mail_id)
    select unnest(log_ids), 'log', new_mail where n_log > 0;
  insert into gary_ops.leaderboard_alerts(candidate_id, event, mail_id)
    select unnest(scr_ids), 'scratch', new_mail where n_scr > 0;
  return new_mail;
end $$;

revoke all on function gary_ops.leaderboard_alert_mail() from public;

-- Every minute; gary_ops.tick() (also every minute) sends the queued mail.
select cron.unschedule(jobid) from cron.job where jobname = 'gary-leaderboard-alerts';
select cron.schedule('gary-leaderboard-alerts', '* * * * *', 'select gary_ops.leaderboard_alert_mail();');
