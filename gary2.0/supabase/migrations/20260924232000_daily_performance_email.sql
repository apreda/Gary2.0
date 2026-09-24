-- Adam's daily performance email (founder, Sep 24 2026: "internally set up
-- that I get an email each day about Gary's overall performance": props, game
-- picks, Winners, the parlay, darts). One plain email a morning for the day
-- before, queued on the operations mail rail (gary_ops.mail), which sends it
-- through Resend with retries and an idempotency key. Code only, no AI.

create table if not exists gary_ops.performance_reports (
  day date primary key,
  mail_id uuid,
  created_at timestamptz not null default now()
);

create or replace function gary_ops.money(p_result text, p_odds int) returns numeric
language sql immutable as $$
  -- $100 a pick: a win pays the price, a loss costs the $100, a push is even.
  select case lower(coalesce(p_result, ''))
    when 'won' then case when p_odds is null then null when p_odds > 0 then p_odds::numeric else round(10000.0 / abs(p_odds), 2) end
    when 'lost' then -100
    else 0 end
$$;

create or replace function gary_ops.signed_dollars(p numeric) returns text
language sql immutable as $$
  select case when p is null then 'n/a' when p < 0 then '-$' else '+$' end
    || case when p is null then '' else to_char(abs(round(p)), 'FM999,999,990') end
$$;

create or replace function gary_ops.performance_mail(p_day date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  d date := coalesce(p_day, (now() at time zone 'America/New_York')::date - 1);
  cfg gary_ops.settings;
  body text := '';
  subject_bits text[] := '{}';
  r record;
  w jsonb; pl jsonb;
  w_won int; w_lost int; w_push int; w_net numeric; w_bank numeric;
  new_mail uuid;
begin
  select * into cfg from gary_ops.settings where singleton;
  if not found then return null; end if;
  if exists (select 1 from gary_ops.performance_reports where day = d) then return null; end if;

  body := 'Gary, ' || trim(to_char(d, 'Day')) || ' ' || trim(to_char(d, 'Mon FMDD')) || E'\n';

  -- WINNERS: the paid card, real dollars.
  begin
    w := public.get_winners_recap(d::text);
  exception when others then w := null;
  end;
  if w is not null and jsonb_array_length(coalesce(w->'tickets', '[]')) > 0 then
    select count(*) filter (where t->>'result' = 'won'), count(*) filter (where t->>'result' = 'lost'),
           count(*) filter (where t->>'result' not in ('won', 'lost') and t->>'result' is not null),
           sum(nullif(t->>'net_dollars', '')::numeric)
      into w_won, w_lost, w_push, w_net
      from jsonb_array_elements(w->'tickets') t;
    w_bank := nullif(w->>'bankroll_dollars', '')::numeric;
    body := body || E'\nWINNERS  ' || w_won || '-' || w_lost || case when w_push > 0 then '-' || w_push else '' end
      || '  ' || gary_ops.signed_dollars(coalesce(w_net, 0))
      || case when w_bank is not null then '  (bankroll $' || to_char(round(w_bank), 'FM999,999,990') || ')' else '' end;
    subject_bits := subject_bits || ('Winners ' || w_won || '-' || w_lost || ' ' || gary_ops.signed_dollars(coalesce(w_net, 0)));
  else
    body := body || E'\nWINNERS  no plays';
  end if;

  -- GAME PICKS, by league, $100 a pick at the published price.
  select count(*) filter (where result = 'won') won, count(*) filter (where result = 'lost') lost,
         count(*) filter (where result = 'push') push,
         count(*) filter (where result is null or result not in ('won', 'lost', 'push')) open,
         sum(gary_ops.money(result, substring(pick_text from '([+-][0-9]{3,4})\s*$')::int)) net
    into r from public.game_results where game_date = d;
  if r.won + r.lost + r.push + r.open > 0 then
    body := body || E'\n\nGAME PICKS  ' || r.won || '-' || r.lost || case when r.push > 0 then '-' || r.push else '' end
      || '  ' || gary_ops.signed_dollars(r.net) || ' at $100 a pick' || case when r.open > 0 then '  (' || r.open || ' ungraded)' else '' end;
    subject_bits := subject_bits || ('games ' || r.won || '-' || r.lost);
    for r in select league, count(*) filter (where result = 'won') won, count(*) filter (where result = 'lost') lost,
               count(*) filter (where result = 'push') push,
               sum(gary_ops.money(result, substring(pick_text from '([+-][0-9]{3,4})\s*$')::int)) net
             from public.game_results where game_date = d group by league order by league loop
      body := body || E'\n  ' || r.league || '  ' || r.won || '-' || r.lost || case when r.push > 0 then '-' || r.push else '' end
        || '  ' || gary_ops.signed_dollars(r.net);
    end loop;
  else
    body := body || E'\n\nGAME PICKS  none graded';
  end if;

  -- PROPS, by league.
  select count(*) filter (where result = 'won') won, count(*) filter (where result = 'lost') lost,
         count(*) filter (where result = 'push') push,
         count(*) filter (where result is null or result not in ('won', 'lost', 'push')) open,
         sum(gary_ops.money(result, nullif(regexp_replace(coalesce(odds, ''), '[^0-9-]', '', 'g'), '')::int)) net
    into r from public.prop_results where game_date = d;
  if r.won + r.lost + r.push + r.open > 0 then
    body := body || E'\n\nPROPS  ' || r.won || '-' || r.lost || case when r.push > 0 then '-' || r.push else '' end
      || '  ' || gary_ops.signed_dollars(r.net) || ' at $100 a pick' || case when r.open > 0 then '  (' || r.open || ' ungraded)' else '' end;
    subject_bits := subject_bits || ('props ' || r.won || '-' || r.lost);
    for r in select sport, count(*) filter (where result = 'won') won, count(*) filter (where result = 'lost') lost,
               count(*) filter (where result = 'push') push,
               sum(gary_ops.money(result, nullif(regexp_replace(coalesce(odds, ''), '[^0-9-]', '', 'g'), '')::int)) net
             from public.prop_results where game_date = d group by sport order by sport loop
      body := body || E'\n  ' || coalesce(r.sport, '?') || '  ' || r.won || '-' || r.lost || case when r.push > 0 then '-' || r.push else '' end
        || '  ' || gary_ops.signed_dollars(r.net);
    end loop;
  else
    body := body || E'\n\nPROPS  none graded';
  end if;

  -- THE PARLAY OF THE DAY.
  begin
    pl := public.get_parlay(d::text);
  exception when others then pl := null;
  end;
  if pl is not null then
    body := body || E'\n\nPARLAY  ' || jsonb_array_length(pl->'legs') || ' legs at '
      || case when (pl->>'american_odds')::int > 0 then '+' else '' end || (pl->>'american_odds')
      || '  ' || coalesce(upper(pl->>'result'), 'OPEN') || '  (' || coalesce(pl->>'landed', '0') || ' of '
      || jsonb_array_length(pl->'legs') || ' landed)';
    subject_bits := subject_bits || ('parlay ' || coalesce(pl->>'result', 'open'));
  else
    body := body || E'\n\nPARLAY  none';
  end if;

  -- DARTS: hits per category, scratched darts left out.
  select count(*) filter (where result = 'hit') hit, count(*) filter (where result in ('hit', 'miss')) graded
    into r from public.darts where game_date = d and scratched_at is null;
  if r.graded > 0 then
    body := body || E'\n\nDARTS  ' || r.hit || ' of ' || r.graded || ' hit';
    subject_bits := subject_bits || ('darts ' || r.hit || '/' || r.graded);
    for r in select league, kind, count(*) filter (where result = 'hit') hit, count(*) filter (where result in ('hit', 'miss')) graded
             from public.darts where game_date = d and scratched_at is null group by league, kind
             having count(*) filter (where result in ('hit', 'miss')) > 0 order by league, kind loop
      body := body || E'\n  ' || r.league || ' ' || case r.kind
          when 'hr' then 'home runs' when 'multihit' then '2+ hits' when 'first_inning' then '1st inning run'
          when 'td' then 'anytime TD' when 'qbtd' then 'QB rushing TD' when 'recyds' then 'receiving yards'
          when 'rushyds' then 'rushing yards' when 'passtd' then 'passing TDs' when 'int' then 'interceptions'
          else r.kind end || '  ' || r.hit || ' of ' || r.graded;
    end loop;
  else
    body := body || E'\n\nDARTS  none graded';
  end if;

  body := body || E'\n\nAutomatic daily report from the results tables. No AI was used.';

  insert into gary_ops.mail(payload) values (jsonb_build_object(
    'from', cfg.sender, 'to', jsonb_build_array(cfg.recipient),
    'subject', 'Gary ' || trim(to_char(d, 'Dy Mon FMDD')) || ': ' || coalesce(array_to_string(subject_bits, ', '), 'no results'),
    'text', body)) returning id into new_mail;
  insert into gary_ops.performance_reports(day, mail_id) values (d, new_mail);
  return new_mail;
end $$;

revoke all on function gary_ops.performance_mail(date) from public;

-- 9:30 AM Eastern (13:30 UTC in daylight time, 8:30 AM once clocks fall back),
-- after the overnight grading runs.
select cron.unschedule(jobid) from cron.job where jobname = 'gary-daily-performance-email';
select cron.schedule('gary-daily-performance-email', '30 13 * * *', 'select gary_ops.performance_mail();');
