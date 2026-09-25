-- THE PARLAY OF THE DAY, BUILT AT PICK TIME (founder GO, Sep 24 2026 night):
-- "the parlay of the day is built by the brain that makes the picks, at pick
-- time, with the full desk in front of him, not by a list reader in SQL."
--
-- Gary answers one more question inside his bet ask (garyBet.js): is this one
-- for today's parlay? A yes is stored on the pick with his bet (gary_bet.parlay,
-- gary_bet.parlay_line); a dart's yes comes from the lineup-time review
-- (darts.parlay_at). parlay_lock() (pg_cron, every 2 minutes) syncs the yeses
-- into parlay_legs in the order he said them, keeps the first five that make a
-- valid ticket, and LOCKS 25 minutes before the ticket's first leg starts or
-- at five yeses: parlay_of_the_day is written exactly as before (legs jsonb,
-- parlay_price, the reason = his lines), so get_parlay, results and the page
-- do not change. Fewer than three at the lock: the SQL list builder completes
-- the ticket from the remaining plays and is told the legs already on it; a
-- day with no yes at all falls back to the list builder on its old clock.
--
-- A valid ticket (product facts, founder): three to five legs; at most two
-- from one game, and two only when they go together; never two legs that need
-- opposite things (a hitter's over and the opposing starter's hits-allowed
-- under; a team's moneyline and the other side's player over; one offense's
-- over and under); every leg unstarted. A leg that fails drops with its reason.
--
-- Also fixed: the collector read every completed job for a date and could
-- re-insert a stale answer after a rebuild. It now reads the newest completed
-- job per date once (parlay_jobs.collected_at) and the enqueue guard looks at
-- the newest job only.

create table if not exists public.parlay_legs (
  game_date date not null,
  key text not null,
  ord integer not null,
  league text,
  game_id text,
  text text,
  gary_line text,
  decided_at timestamptz,
  dropped_reason text,
  created_at timestamptz not null default now(),
  primary key (game_date, key)
);
alter table public.parlay_legs enable row level security;
revoke all on public.parlay_legs from anon, authenticated;

alter table public.parlay_jobs add column if not exists collected_at timestamptz;
alter table public.parlay_jobs add column if not exists fixed_keys text[];
alter table public.darts add column if not exists parlay_line text;
alter table public.darts add column if not exists parlay_at timestamptz;

-- The legs now carry the player's club (props and darts) so a same-game pair can be read.
create or replace function gary_private.parlay_legs(p_date date)
 returns table(key text, source text, league text, text text, odds integer, matchup text, game_id text, commence_time timestamp with time zone, grade jsonb)
 language sql stable set search_path to ''
as $function$
  with w as (
    select 'winners:' || c.id as key, 'winners' as source, c.league,
      case when c.kind = 'prop'
        then gary_private.parlay_leg_words(c.pick_snapshot->>'player', c.pick_snapshot->>'bet',
               concat_ws(' ', regexp_replace(coalesce(c.pick_snapshot->>'prop',''), '\s+[0-9.]+$', ''), c.pick_snapshot->>'line'), null, null)
        else regexp_replace(c.pick_text, '\s*[+-][0-9]{3,4}\s*$', '') end as text,
      c.odds, coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')) as matchup,
      c.game_id, c.commence_time,
      jsonb_build_object('kind', c.kind, 'candidate_id', c.id, 'pick_text', c.pick_text, 'snapshot', c.pick_snapshot) as grade
    from public.winners_board b join public.winners_candidates c on c.id = b.candidate_id
    where b.game_date = to_char(p_date, 'YYYY-MM-DD') and c.odds is not null and abs(c.odds) >= 100
  ), p as (
    select 'prop:' || md5(coalesce(pk->>'player','') || coalesce(pk->>'prop','') || coalesce(pk->>'bet','')) as key, 'prop' as source,
      case when pk->>'sport' ilike '%mlb%' then 'MLB' when pk->>'sport' ilike '%ncaaf%' then 'NCAAF' when pk->>'sport' ilike '%nfl%' then 'NFL' else upper(coalesce(pk->>'league', pk->>'sport')) end as league,
      gary_private.parlay_leg_words(pk->>'player', pk->>'bet',
        concat_ws(' ', regexp_replace(coalesce(pk->>'prop',''), '\s+[0-9.]+$', ''), coalesce(pk->>'line', substring(pk->>'prop' from '[0-9.]+$'))), null, null) as text,
      (pk->>'odds')::integer as odds, pk->>'matchup' as matchup, pk->>'game_id' as game_id,
      (pk->>'commence_time')::timestamptz as commence_time,
      jsonb_build_object('kind', 'prop', 'snapshot', jsonb_build_object('player', pk->>'player', 'prop', pk->>'prop', 'bet', pk->>'bet', 'line', pk->>'line', 'team', pk->>'team')) as grade
    from public.prop_picks pp, jsonb_array_elements(pp.picks) pk
    where pp.date = to_char(p_date, 'YYYY-MM-DD') and (pk->>'odds') ~ '^-?[0-9]+$' and abs((pk->>'odds')::integer) >= 100
  ), d as (
    select 'dart:' || d.id as key, 'dart' as source, d.league,
      gary_private.parlay_leg_words(d.player, d.bet, d.prop, d.kind, d.matchup) as text,
      d.odds, d.matchup, d.game_id, d.commence_time,
      jsonb_build_object('kind', 'prop', 'snapshot', jsonb_build_object('player', d.player, 'prop', d.prop, 'bet', d.bet, 'team', d.team, 'dart_kind', d.kind)) as grade
    from public.darts d where d.game_date = p_date and d.scratched_at is null and d.odds is not null and abs(d.odds) >= 100
  )
  select * from (select * from w union all select * from p union all select * from d) x
  where x.commence_time > now()
  order by x.commence_time, x.key
$function$;

-- A club's short name for matching: "Boston Red Sox" → "red sox", "Los Angeles Dodgers" → "dodgers".
create or replace function gary_private.parlay_nick(p text) returns text
language sql immutable set search_path = '' as $$
  select case when lower(btrim(coalesce(p, ''))) ~ '(red|white) sox$|blue jays$'
    then substring(lower(btrim(p)) from '(\S+ \S+)$')
    else substring(lower(btrim(coalesce(p, ''))) from '(\S+)$') end
$$;

-- What a leg needs, as claims on its game: win:<club>, off:<club> ±1 (that
-- offense up or down), total ±1, first ±1. Player legs mark their claims.
create or replace function gary_private.parlay_leg_claims(p_leg jsonb)
returns table(claim text, sign integer, from_player boolean)
language plpgsql immutable set search_path = '' as $$
declare
  snap jsonb := coalesce(p_leg->'grade'->'snapshot', '{}'::jsonb);
  kind text := coalesce(p_leg->'grade'->>'kind', '');
  mu text := coalesce(p_leg->>'matchup', '');
  away text := gary_private.parlay_nick(split_part(mu, ' @ ', 1));
  home text := gary_private.parlay_nick(split_part(mu, ' @ ', 2));
  pick text; team text; opp text; prop text; bet text;
begin
  if kind = 'game' then
    pick := lower(coalesce(snap->>'pick', p_leg->>'text', ''));
    if pick ~ '^\s*(over|under)\M' then
      claim := 'total'; sign := case when pick ~ '^\s*over' then 1 else -1 end; from_player := false; return next; return;
    end if;
    if home <> '' and (strpos(pick, home) > 0 or strpos(pick, lower(coalesce(snap->>'homeTeam', '~'))) > 0) then team := home;
    elsif away <> '' and (strpos(pick, away) > 0 or strpos(pick, lower(coalesce(snap->>'awayTeam', '~'))) > 0) then team := away;
    end if;
    if team is not null then claim := 'win:' || team; sign := 1; from_player := false; return next; end if;
    return;
  end if;
  prop := lower(coalesce(snap->>'prop', snap->>'prop_type', ''));
  bet := lower(coalesce(snap->>'bet', 'over'));
  if prop ~ 'first_inning' or snap->>'dart_kind' = 'first_inning' then
    claim := 'first'; sign := case when bet = 'under' then -1 else 1 end; from_player := false; return next; return;
  end if;
  team := gary_private.parlay_nick(snap->>'team');
  if team is null or team = '' then return; end if;
  opp := case when team = home then away when team = away then home end;
  if prop ~ '^pitcher_' then
    if opp is null then return; end if;
    claim := 'off:' || opp;
    sign := case when (prop ~ '(strikeouts|outs)' and bet = 'over') or (prop ~ '(hits_allowed|earned_runs|walks|runs)' and bet = 'under') then -1 else 1 end;
    from_player := false; return next; return;
  end if;
  if prop ~ '(sacks|tackles|defensive)' then return; end if;
  claim := 'off:' || team;
  sign := case when prop ~ 'interceptions' then (case when bet = 'over' then -1 else 1 end) else (case when bet = 'under' then -1 else 1 end) end;
  from_player := true; return next;
end $$;

-- Why two legs of one game cannot share a ticket, or null when they can.
create or replace function gary_private.parlay_pair_conflict(a jsonb, b jsonb) returns text
language sql immutable set search_path = '' as $$
  select case
    when exists (select 1 from gary_private.parlay_leg_claims(a) x join gary_private.parlay_leg_claims(b) y on x.claim = y.claim and x.sign = -y.sign)
      then 'the two legs need opposite things in the same game'
    when exists (select 1 from gary_private.parlay_leg_claims(a) x, gary_private.parlay_leg_claims(b) y
                 where x.claim like 'win:%' and y.claim like 'win:%' and x.claim <> y.claim)
      then 'the two legs back different teams to win'
    when exists (select 1 from gary_private.parlay_leg_claims(a) x, gary_private.parlay_leg_claims(b) y
                 where (x.claim like 'win:%' and y.from_player and y.sign = 1 and y.claim like 'off:%' and substring(y.claim from 5) <> substring(x.claim from 5))
                    or (y.claim like 'win:%' and x.from_player and x.sign = 1 and x.claim like 'off:%' and substring(x.claim from 5) <> substring(y.claim from 5)))
      then 'a team to win and the other side''s player over'
  end
$$;

-- Every play of the day by key, started or not (the lock and the collector resolve keys here).
create or replace function gary_private.parlay_resolve(p_date date)
returns table(key text, source text, league text, text text, odds integer, matchup text, game_id text, commence_time timestamptz, grade jsonb)
language sql stable set search_path = '' as $$
  select c.key, c.source, c.league, c.text, c.odds, c.matchup, c.game_id, c.commence_time, c.grade from gary_private.parlay_legs(p_date) c
  union all
  select 'pick:' || c.id, 'pick', c.league, regexp_replace(c.pick_text, '\s*[+-][0-9]{3,4}\s*$', ''), c.odds,
         coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')),
         c.game_id, c.commence_time, jsonb_build_object('kind', 'game', 'candidate_id', c.id, 'pick_text', c.pick_text, 'snapshot', c.pick_snapshot)
  from public.winners_candidates c where c.game_date = to_char(p_date, 'YYYY-MM-DD') and c.kind = 'game'
$$;

-- Gary's yeses since the last pass, in the order he said them.
create or replace function gary_private.parlay_sync_yes(p_date date) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with c as (select * from gary_private.parlay_candidates(p_date)),
  yes as (
    select c.key, c.league, c.game_id, c.text,
      case
        when c.key ~ '^(winners|pick):' then (select wc.pick_snapshot->'gary_bet' from public.winners_candidates wc where wc.id = (c.grade->>'candidate_id')::bigint)
        when c.key ~ '^prop:' then (select pk->'gary_bet' from public.prop_picks pp, jsonb_array_elements(pp.picks) pk
                                    where pp.date = to_char(p_date, 'YYYY-MM-DD')
                                      and 'prop:' || md5(coalesce(pk->>'player','') || coalesce(pk->>'prop','') || coalesce(pk->>'bet','')) = c.key limit 1)
        when c.key ~ '^dart:[0-9]+$' then (select jsonb_build_object('parlay', d.parlay_at is not null, 'parlay_line', d.parlay_line, 'decided_at', d.parlay_at)
                                           from public.darts d where d.id = substring(c.key from 6)::bigint)
      end as gb
    from c
  ), fresh as (
    select y.* from yes y
    where coalesce((y.gb->>'parlay')::boolean, false)
      and not exists (select 1 from public.parlay_legs l where l.game_date = p_date
                      and (l.key = y.key or (l.game_id = y.game_id and lower(l.text) = lower(y.text))))
  )
  insert into public.parlay_legs (game_date, key, ord, league, game_id, text, gary_line, decided_at)
  select p_date, f.key,
    (select coalesce(max(l.ord), 0) from public.parlay_legs l where l.game_date = p_date) + row_number() over (order by (f.gb->>'decided_at')::timestamptz nulls last, f.key),
    f.league, f.game_id, f.text, nullif(btrim(f.gb->>'parlay_line'), ''), (f.gb->>'decided_at')::timestamptz
  from fresh f
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- The ticket as it stands: the valid legs in Gary's order (at most five), and each dropped leg's reason recorded.
create or replace function gary_private.parlay_standing(p_date date)
returns table(key text, ord integer, leg jsonb, gary_line text)
language plpgsql security definer set search_path = '' as $$
declare r record; kept jsonb[] := '{}'; k jsonb; why text; same integer;
begin
  for r in
    select l.key, l.ord, l.gary_line, to_jsonb(x) as leg
    from public.parlay_legs l join gary_private.parlay_resolve(p_date) x on x.key = l.key
    where l.game_date = p_date and l.dropped_reason is null
    order by l.ord
  loop
    why := null;
    if (r.leg->>'commence_time')::timestamptz <= now() then why := 'started before the ticket locked'; end if;
    if why is null and cardinality(kept) >= 5 then why := 'the ticket already had five legs'; end if;
    if why is null then
      same := 0;
      foreach k in array kept loop
        if k->>'league' = r.leg->>'league' and k->>'game_id' = r.leg->>'game_id' then
          same := same + 1;
          why := coalesce(why, gary_private.parlay_pair_conflict(k, r.leg));
        end if;
      end loop;
      if why is null and same >= 2 then why := 'a third leg from one game'; end if;
    end if;
    if why is not null then
      update public.parlay_legs l set dropped_reason = why where l.game_date = p_date and l.key = r.key;
      continue;
    end if;
    kept := kept || r.leg;
    key := r.key; ord := r.ord; leg := r.leg; gary_line := r.gary_line;
    return next;
  end loop;
end $$;

-- Every two minutes: sync the yeses; at five, or 25 minutes before the first leg, lock.
create or replace function gary_private.parlay_lock() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_day date := (now() at time zone 'America/New_York')::date; v_n integer; v_first timestamptz; v_legs jsonb; v_prices integer[]; v_reason text; v_price record; v_keys text[];
begin
  if exists (select 1 from public.parlay_of_the_day where game_date = v_day) then return 0; end if;
  perform gary_private.parlay_sync_yes(v_day);
  select count(*), min((s.leg->>'commence_time')::timestamptz), array_agg(s.key order by s.ord)
    into v_n, v_first, v_keys from gary_private.parlay_standing(v_day) s;
  if v_n = 0 then return 0; end if;
  if v_n < 5 and now() < v_first - interval '25 minutes' then return 0; end if;
  if v_n >= 3 then
    select jsonb_agg(jsonb_build_object('n', rn, 'key', s.leg->>'key', 'source', s.leg->>'source', 'league', s.leg->>'league', 'text', s.leg->>'text',
             'odds', (s.leg->>'odds')::integer, 'matchup', s.leg->>'matchup', 'game_id', s.leg->>'game_id', 'commence_time', s.leg->>'commence_time', 'grade', s.leg->'grade') order by rn),
           array_agg((s.leg->>'odds')::integer order by rn),
           string_agg(s.gary_line, ' ' order by rn) filter (where s.gary_line is not null)
      into v_legs, v_prices, v_reason
      from (select st.*, row_number() over (order by st.ord) as rn from gary_private.parlay_standing(v_day) st) s;
    select * into v_price from gary_private.parlay_price(v_prices);
    insert into public.parlay_of_the_day (game_date, legs, american_odds, payout_10, reason, model, job_id)
    values (v_day, v_legs, v_price.american_odds, v_price.payout_10, left(coalesce(v_reason, ''), 400), 'gary at pick time', null)
    on conflict (game_date) do nothing;
    return 1;
  end if;
  -- Fewer than three at the lock: the list builder completes the ticket around his legs.
  return gary_private.parlay_enqueue_with(v_day, v_keys);
end $$;

-- The list builder, told the legs already on the ticket (none on a day with no yes).
create or replace function gary_private.parlay_enqueue_with(p_day date, p_fixed text[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_games integer; v_n integer; v_keys text[]; v_list text; v_fixed_list text; v_job uuid; v_min integer; v_max integer; v_fixed integer := coalesce(cardinality(p_fixed), 0);
begin
  if exists (select 1 from public.parlay_of_the_day where game_date = p_day) then return 0; end if;
  if exists (select 1 from public.parlay_jobs pj join public.subscription_model_jobs j on j.id = pj.job_id
             where pj.game_date = p_day and pj.created_at = (select max(x.created_at) from public.parlay_jobs x where x.game_date = p_day)
               and (j.status in ('queued','running') or j.completed_at > now() - interval '20 minutes')) then return 0; end if;
  select count(*), count(distinct c.game_id) into v_n, v_games from gary_private.parlay_candidates(p_day) c where not (c.key = any(coalesce(p_fixed, '{}')));
  if v_n + v_fixed < 4 or v_games < 2 then return 0; end if;
  select array_agg(c.key order by c.ord),
         string_agg(format('[%s] %s · %s · %s · %s · %s', c.key, c.league, c.text,
           case when c.odds > 0 then '+' || c.odds else c.odds::text end, coalesce(c.matchup, ''),
           to_char(c.commence_time at time zone 'America/New_York', 'FMHH12:MI PM') || ' ET') || E'\n    ' || c.signal, E'\n' order by c.ord)
    into v_keys, v_list
    from (select * from gary_private.parlay_candidates(p_day) c where not (c.key = any(coalesce(p_fixed, '{}'))) limit 24) c;
  select string_agg(format('%s · %s · %s · %s', x.league, x.text, case when x.odds > 0 then '+' || x.odds else x.odds::text end,
           to_char(x.commence_time at time zone 'America/New_York', 'FMHH12:MI PM') || ' ET'), E'\n' order by array_position(p_fixed, x.key))
    into v_fixed_list from gary_private.parlay_resolve(p_day) x where x.key = any(coalesce(p_fixed, '{}'));
  v_min := greatest(1, 3 - v_fixed); v_max := 5 - v_fixed;
  insert into public.subscription_model_jobs (lane, status, request, expires_at)
  values ('parlay-of-the-day', 'queued', jsonb_build_object(
    'model', 'claude-opus-5-5',
    'system', gary_private.parlay_contract(),
    'messages', jsonb_build_array(jsonb_build_object('role', 'user', 'content',
      case when v_fixed > 0 then 'THE TICKET SO FAR (your legs, already on it):' || E'\n' || v_fixed_list || E'\n\n'
        || format('Complete it: add %s to %s more from the plays below.', v_min, v_max) || E'\n\n' else '' end
      || 'TODAY''S PLAYS' || E'\n' || v_list)),
    'tools', jsonb_build_array(jsonb_build_object('name', 'build_parlay', 'input_schema', jsonb_build_object(
      'type', 'object', 'required', jsonb_build_array('legs', 'reason'),
      'properties', jsonb_build_object(
        'legs', jsonb_build_object('type', 'array', 'minItems', v_min, 'maxItems', v_max, 'items', jsonb_build_object('type', 'string'),
          'description', case when v_fixed > 0 then 'the ids of the legs you add, in the order they read after the legs already on the ticket' else 'the ids of the legs, in the order they read on the ticket' end),
        'reason', jsonb_build_object('type', 'string'))))),
    'tool_choice', jsonb_build_object('type', 'tool', 'name', 'build_parlay'),
    'output_config', jsonb_build_object('effort', 'medium')),
    now() + interval '25 minutes')
  returning id into v_job;
  insert into public.parlay_jobs (job_id, game_date, leg_keys, fixed_keys) values (v_job, p_day, v_keys, p_fixed);
  return 1;
end $$;

-- The old clock, only for a day with no yes on the ticket.
create or replace function gary_private.parlay_enqueue() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_day date := (now() at time zone 'America/New_York')::date; v_slate integer; v_picked integer; v_late boolean;
begin
  if exists (select 1 from public.parlay_of_the_day where game_date = v_day) then return 0; end if;
  if exists (select 1 from public.parlay_legs l where l.game_date = v_day and l.dropped_reason is null) then return 0; end if;
  select count(*) into v_slate from public.daily_slate s where s.date::text = to_char(v_day, 'YYYY-MM-DD') and lower(coalesce(s.game_status,'')) not in ('cancelled','canceled','postponed');
  select count(distinct c.game_id) into v_picked from public.winners_candidates c where c.game_date = to_char(v_day, 'YYYY-MM-DD') and c.kind = 'game';
  v_late := (now() at time zone 'America/New_York')::time >= time '17:30';
  if not v_late and (v_slate = 0 or v_picked < ceil(0.6 * v_slate)) then return 0; end if;
  return gary_private.parlay_enqueue_with(v_day, '{}');
end $$;

-- The newest completed job per date, read once; fixed legs first, then his additions.
create or replace function gary_private.parlay_collect() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; j record; added text[]; chosen text[]; legs jsonb; reason text; prices integer[]; ok boolean; why text; v_price record; a jsonb; b jsonb;
begin
  for j in
    select distinct on (pj.game_date) s.id, pj.game_date, pj.leg_keys, coalesce(pj.fixed_keys, '{}') as fixed_keys, s.response, s.route
    from public.subscription_model_jobs s join public.parlay_jobs pj on pj.job_id = s.id
    where s.lane = 'parlay-of-the-day' and s.status = 'completed' and pj.leg_keys is not null and pj.collected_at is null
      and not exists (select 1 from public.parlay_of_the_day x where x.game_date = pj.game_date)
    order by pj.game_date, s.completed_at desc nulls last
  loop
    update public.parlay_jobs pj set collected_at = now()
      where pj.game_date = j.game_date and pj.collected_at is null
        and exists (select 1 from public.subscription_model_jobs s where s.id = pj.job_id and s.status = 'completed');
    select array_agg(btrim(e.value, '[]')) into added
      from jsonb_array_elements_text(coalesce(j.response->'content'->0->'input'->'legs', '[]'::jsonb)) e;
    chosen := j.fixed_keys || coalesce(added, '{}');
    reason := left(btrim(concat_ws(' ',
      (select string_agg(l.gary_line, ' ' order by l.ord) from public.parlay_legs l where l.game_date = j.game_date and l.key = any(j.fixed_keys) and l.gary_line is not null),
      j.response->'content'->0->'input'->>'reason')), 400);
    ok := coalesce(cardinality(chosen), 0) between 3 and 5 and coalesce(added, '{}') <@ j.leg_keys
      and cardinality(chosen) = (select count(distinct x) from unnest(chosen) x);
    why := case when not ok then 'parlay rejected: the ticket was not three to five different legs from the list' end;
    if ok then
      select jsonb_agg(jsonb_build_object('n', ord, 'key', l.key, 'source', l.source, 'league', l.league, 'text', l.text, 'odds', l.odds,
                                          'matchup', l.matchup, 'game_id', l.game_id, 'commence_time', l.commence_time, 'grade', l.grade) order by ord),
             array_agg(l.odds order by ord),
             count(*) = cardinality(chosen) and bool_and(l.commence_time > now())
        into legs, prices, ok
      from unnest(chosen) with ordinality as k(key, ord)
      join gary_private.parlay_resolve(j.game_date) l on l.key = k.key;
      if not ok then why := 'parlay rejected: a leg started or left the board before collection'; end if;
    end if;
    if ok and exists (select 1 from jsonb_array_elements(legs) e group by e->>'league', e->>'game_id' having count(*) > 2) then
      ok := false; why := 'parlay rejected: three legs from one game';
    end if;
    if ok then
      for a, b in select x.value, y.value from jsonb_array_elements(legs) x, jsonb_array_elements(legs) y
                  where (x.value->>'n')::int < (y.value->>'n')::int and x.value->>'league' = y.value->>'league' and x.value->>'game_id' = y.value->>'game_id'
      loop
        why := gary_private.parlay_pair_conflict(a, b);
        if why is not null then ok := false; why := format('parlay rejected: %s and %s: %s', a->>'text', b->>'text', why); exit; end if;
      end loop;
    end if;
    if ok then
      select * into v_price from gary_private.parlay_price(prices);
      insert into public.parlay_of_the_day (game_date, legs, american_odds, payout_10, reason, model, job_id)
      values (j.game_date, legs, v_price.american_odds, v_price.payout_10, reason, j.route, j.id) on conflict (game_date) do nothing;
      n := n + 1;
    else
      update public.subscription_model_jobs set status = 'failed', error = why where id = j.id;
    end if;
  end loop;
  return n;
end $$;

-- What Gary sees in his bet ask: the ticket so far, the slate, whether it is locked.
create or replace function public.parlay_ticket_state(p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_slate integer; v_picked integer;
begin
  select count(*) into v_slate from public.daily_slate s where s.date::text = to_char(p_date, 'YYYY-MM-DD') and lower(coalesce(s.game_status,'')) not in ('cancelled','canceled','postponed');
  select count(distinct c.game_id) into v_picked from public.winners_candidates c where c.game_date = to_char(p_date, 'YYYY-MM-DD') and c.kind = 'game';
  return jsonb_build_object(
    'locked', exists (select 1 from public.parlay_of_the_day where game_date = p_date),
    'legs', coalesce((select jsonb_agg(jsonb_build_object('text', x.text, 'odds', x.odds, 'matchup', x.matchup, 'commence_time', x.commence_time) order by l.ord)
                      from public.parlay_legs l join gary_private.parlay_resolve(p_date) x on x.key = l.key
                      where l.game_date = p_date and l.dropped_reason is null), '[]'::jsonb),
    'slate_games', v_slate,
    'games_to_pick', greatest(0, v_slate - v_picked));
end $$;
revoke all on function public.parlay_ticket_state(date) from public, anon, authenticated;
grant execute on function public.parlay_ticket_state(date) to service_role;

select cron.schedule('parlay-lock', '*/2 * * * *', 'select gary_private.parlay_lock()');
