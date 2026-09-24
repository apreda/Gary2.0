-- THE FANTASY COLUMN (founder GO, Sep 24 2026, the Darts featured-row doc):
-- a start/sit column in Gary's voice, written the way ESPN writes them, with
-- one difference: every player comes with the bet that goes with the call.
-- NFL only, one column per slate day (Thursday, Sunday, Monday).
--
-- The players are the ones Gary already has a bet on for the day (a dart or
-- a prop) in games not yet started; his own evidence for those bets (the
-- reason, the dart's this-season and last-season numbers, the prop's case) is
-- the material. He picks four to six, says START or SIT, and names which of
-- his bets goes under his words. A bet's result is read live.

create table if not exists public.fantasy_columns (
  slate_date date primary key,
  league text not null default 'NFL',
  entries jsonb not null,
  model text,
  job_id uuid,
  created_at timestamptz not null default now()
);
alter table public.fantasy_columns enable row level security;
revoke all on public.fantasy_columns from public, anon, authenticated;
grant all on public.fantasy_columns to service_role;

create table if not exists public.fantasy_jobs (
  job_id uuid primary key references public.subscription_model_jobs(id) on delete cascade,
  slate_date date not null,
  pool jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.fantasy_jobs enable row level security;
revoke all on public.fantasy_jobs from public, anon, authenticated;
grant all on public.fantasy_jobs to service_role;

-- The NFL week of an ET date: weeks turn over on the Tuesday on or before
-- the season opener.
create or replace function gary_private.nfl_week(p_date date) returns integer
language sql stable set search_path = '' as $$
  select case when o is null or p_date < o then null
    else floor((p_date - (o - ((extract(dow from o)::int - 2 + 7) % 7))) / 7.0)::int + 1 end
  from (select min(s.date) as o from public.daily_slate s
        where s.league = 'NFL' and s.date >= make_date(extract(year from p_date)::int, 9, 1)) x
$$;

-- A dart's numbers as a fan reads them: "rec yds this season: 95, 58 (2
-- games); last season: 361 rec yds in 14 games".
create or replace function gary_private.fantasy_form_words(p_form jsonb) returns text
language sql immutable set search_path = '' as $$
  select case when p_form is null or jsonb_typeof(p_form) <> 'object' then null else concat_ws('; ',
    case when coalesce((p_form->'now'->>'g')::int, 0) > 0 then format('%s this season: %s (%s game%s)', coalesce(p_form->>'unit', ''),
      (select string_agg(v, ', ') from jsonb_array_elements_text(p_form->'now'->'v') v), p_form->'now'->>'g',
      case when (p_form->'now'->>'g')::int = 1 then '' else 's' end) end,
    case when coalesce((p_form->'last'->>'g')::int, 0) > 0 then format('last season: %s %s in %s games', p_form->'last'->>'total', coalesce(p_form->>'unit', ''), p_form->'last'->>'g') end)
  end
$$;

-- Every player Gary has a dart or a prop on in the day's NFL games, with his
-- bets on that player.
create or replace function gary_private.fantasy_pool(p_date date)
returns table(player text, player_id text, team text, pos text, game_id text, matchup text,
              commence_time timestamptz, bets jsonb)
language sql stable set search_path = '' as $$
  with b as (
    select d.player, nullif(d.player_id, '') as player_id, d.team, d.position, d.game_id, d.matchup, d.commence_time,
      jsonb_build_object('ref', 'dart:' || d.id,
        'text', gary_private.primetime_words(gary_private.parlay_leg_words(d.player, d.bet, d.prop, d.kind, d.matchup)),
        'odds', d.odds, 'reason', d.reason, 'form', gary_private.fantasy_form_words(d.form)) as bet
    from public.darts d
    where d.game_date = p_date and d.league = 'NFL' and d.scratched_at is null and d.kind <> 'first_inning'
    union all
    select pk->>'player', nullif(pk->>'player_id', ''), pk->>'team', null, pk->>'game_id', pk->>'matchup',
      (pk->>'commence_time')::timestamptz,
      jsonb_build_object('ref', 'prop:' || md5(coalesce(pk->>'player', '') || coalesce(pk->>'prop', '') || coalesce(pk->>'bet', '')),
        'text', gary_private.primetime_words(gary_private.parlay_leg_words(pk->>'player', pk->>'bet',
          concat_ws(' ', regexp_replace(coalesce(pk->>'prop', ''), '\s+[0-9.]+$', ''), coalesce(pk->>'line', substring(pk->>'prop' from '[0-9.]+$'))), null, null)),
        'odds', case when pk->>'odds' ~ '^[+-]?[0-9]+$' then (pk->>'odds')::int end,
        'reason', left(regexp_replace(coalesce(pk->>'rationale', ''), '^\s*Gary''?s Take\s*', '', 'i'), 700),
        'grade', jsonb_build_object('player', pk->>'player', 'prop', pk->>'prop', 'bet', pk->>'bet', 'line', pk->>'line'))
    from public.prop_picks pp, jsonb_array_elements(pp.picks) pk
    where pp.date = to_char(p_date, 'YYYY-MM-DD') and upper(coalesce(pk->>'sport', pk->>'league', '')) like '%NFL%'
      and coalesce(pk->>'player', '') <> '' and (pk->>'commence_time') is not null
  )
  select b.player, max(b.player_id), max(b.team), max(b.position), max(b.game_id), max(b.matchup), min(b.commence_time),
         jsonb_agg(b.bet order by (b.bet->>'odds')::int)
  from b group by b.player
$$;

create or replace function gary_private.fantasy_contract() returns text
language sql immutable set search_path = '' as $c$
  select $t$You are Gary. You are writing your fantasy football start/sit column for today's games. The fans reading it play fantasy football and they bet.

Pick four to six players from the list who make the most useful start/sit decisions for a fantasy manager today. For each one give:
- player: his name exactly as the list writes it.
- verdict: START or SIT.
- words: two or three sentences in your own voice on why, the way a fantasy columnist talks to his readers.
- bet: the one bet of yours on him that goes with the call, copied exactly from his list of bets. A fan sees it under your words.

Every player on the list already carries a bet of yours. Use only the facts in the list: every number and name you write must be in it. Plain words a fan uses. When a number comes from one or two games this season, say how many games it is.

You are Gary, a person. Never mention models, data, feeds, tools or the list.$t$
$c$;

create or replace function gary_private.fantasy_enqueue() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_day date := (now() at time zone 'America/New_York')::date; v_first timestamptz; v_pool jsonb; v_n integer;
        v_games text; v_material text; v_job uuid;
begin
  if exists (select 1 from public.fantasy_columns where slate_date = v_day) then return 0; end if;
  if exists (select 1 from public.fantasy_jobs fj join public.subscription_model_jobs j on j.id = fj.job_id
             where fj.slate_date = v_day and (j.status in ('queued', 'running') or j.completed_at > now() - interval '20 minutes')) then return 0; end if;
  if now() < ((v_day + time '11:00') at time zone 'America/New_York') then return 0; end if;
  select min(p.commence_time), count(*), jsonb_agg(to_jsonb(p) order by p.commence_time, p.player)
    into v_first, v_n, v_pool
  from gary_private.fantasy_pool(v_day) p where p.commence_time > now() + interval '15 minutes';
  if v_n < 4 or now() < v_first - interval '6 hours' then return 0; end if;
  select string_agg(distinct p->>'matchup', ', ') into v_games from jsonb_array_elements(v_pool) p;
  select string_agg(concat_ws(E'\n',
      concat_ws(' · ', p->>'player', nullif(p->>'pos', ''), nullif(p->>'team', ''), p->>'matchup'),
      (select string_agg(concat_ws(E'\n', '  Your bet: ' || (b->>'text') || ' ' || case when (b->>'odds')::int > 0 then '+' else '' end || (b->>'odds'),
                                   case when coalesce(b->>'form', '') <> '' then '    Numbers: ' || (b->>'form') end,
                                   case when coalesce(b->>'reason', '') <> '' then '    Why: ' || (b->>'reason') end), E'\n')
       from jsonb_array_elements(p->'bets') b)), E'\n\n')
    into v_material from jsonb_array_elements(v_pool) p;
  insert into public.subscription_model_jobs (lane, status, request, expires_at)
  values ('fantasy-column', 'queued', jsonb_build_object(
    'model', 'claude-opus-5-5',
    'system', gary_private.fantasy_contract(),
    'messages', jsonb_build_array(jsonb_build_object('role', 'user', 'content',
      format(E'TODAY: %s\nTHE GAMES: %s\n\nTHE PLAYERS\n%s', to_char(v_day, 'FMDay, FMMonth FMDD'), v_games, v_material))),
    'tools', jsonb_build_array(jsonb_build_object('name', 'write_column', 'input_schema', jsonb_build_object(
      'type', 'object', 'required', jsonb_build_array('entries'),
      'properties', jsonb_build_object('entries', jsonb_build_object('type', 'array', 'minItems', 4, 'maxItems', 6,
        'items', jsonb_build_object('type', 'object', 'required', jsonb_build_array('player', 'verdict', 'words', 'bet'),
          'properties', jsonb_build_object(
            'player', jsonb_build_object('type', 'string'),
            'verdict', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('START', 'SIT')),
            'words', jsonb_build_object('type', 'string'),
            'bet', jsonb_build_object('type', 'string')))))))),
    'tool_choice', jsonb_build_object('type', 'tool', 'name', 'write_column'),
    'output_config', jsonb_build_object('effort', 'medium')),
    now() + interval '20 minutes')
  returning id into v_job;
  insert into public.fantasy_jobs (job_id, slate_date, pool) values (v_job, v_day, v_pool);
  return 1;
end $$;

-- Keep what matches the pool: a named player, START or SIT, words, and one
-- of his own bets (the first of them when the named bet is not his).
create or replace function gary_private.fantasy_collect() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; j record; v_in jsonb; v_entries jsonb;
begin
  for j in
    select s.id, s.response, s.route, fj.slate_date, fj.pool
    from public.subscription_model_jobs s join public.fantasy_jobs fj on fj.job_id = s.id
    where s.lane = 'fantasy-column' and s.status = 'completed'
      and not exists (select 1 from public.fantasy_columns c where c.slate_date = fj.slate_date)
  loop
    v_in := (select c->'input' from jsonb_array_elements(j.response->'content') c where c->>'type' = 'tool_use' limit 1);
    select jsonb_agg(jsonb_build_object(
        'player', p->>'player', 'player_id', p->>'player_id', 'team', p->>'team', 'position', p->>'pos',
        'matchup', p->>'matchup', 'game_id', p->>'game_id', 'commence_time', p->>'commence_time',
        'verdict', upper(e->>'verdict'),
        'words', left(btrim(e->>'words'), 700),
        'bet', coalesce(
          (select b - 'reason' - 'form' from jsonb_array_elements(p->'bets') b
           where lower(btrim(b->>'text')) = lower(btrim(regexp_replace(e->>'bet', '\s*[+-][0-9]{3,4}\s*$', ''))) limit 1),
          (p->'bets'->0) - 'reason' - 'form'))
      order by ord)
      into v_entries
    from jsonb_array_elements(coalesce(v_in->'entries', '[]'::jsonb)) with ordinality as x(e, ord)
    join jsonb_array_elements(j.pool) p on lower(btrim(p->>'player')) = lower(btrim(x.e->>'player'))
    where upper(x.e->>'verdict') in ('START', 'SIT') and length(btrim(coalesce(x.e->>'words', ''))) >= 20;
    if coalesce(jsonb_array_length(v_entries), 0) < 3 then
      update public.subscription_model_jobs set status = 'failed', error = 'fantasy column: fewer than three usable players' where id = j.id;
      continue;
    end if;
    insert into public.fantasy_columns (slate_date, entries, model, job_id) values (j.slate_date, v_entries, j.route, j.id)
    on conflict (slate_date) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

-- The column as the app reads it: the latest slate within the last three
-- days, each bet with where it stands.
create or replace function public.get_fantasy(p_date text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_day date; v_c public.fantasy_columns;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' or to_char(p_date::date, 'YYYY-MM-DD') <> p_date then
    raise exception 'Invalid date';
  end if;
  v_day := p_date::date;
  select * into v_c from public.fantasy_columns c where c.slate_date between v_day - 3 and v_day order by c.slate_date desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'slate_date', v_c.slate_date,
    'week', gary_private.nfl_week(v_c.slate_date),
    'games', (select jsonb_agg(distinct e->>'matchup') from jsonb_array_elements(v_c.entries) e),
    'entries', (select jsonb_agg(e || jsonb_build_object('bet', (e->'bet') - 'grade' || jsonb_build_object('result',
        case when e->'bet'->>'ref' ~ '^dart:[0-9]+$'
          then (select gary_private.primetime_result(d.result) from public.darts d where d.id = substring(e->'bet'->>'ref' from 6)::bigint)
          else gary_private.primetime_result(gary_private.lab_ticket_result('prop', 'NFL', to_char(v_c.slate_date, 'YYYY-MM-DD'),
                 e->>'game_id', '', coalesce(e->'bet'->'grade', '{}'::jsonb))->>'result') end)) order by ord)
      from jsonb_array_elements(v_c.entries) with ordinality as x(e, ord)));
end $$;
revoke all on function public.get_fantasy(text) from public;
grant execute on function public.get_fantasy(text) to anon, authenticated, service_role;

select cron.unschedule(jobid) from cron.job where jobname in ('fantasy-column-enqueue', 'fantasy-column-collect');
select cron.schedule('fantasy-column-enqueue', '*/10 * * * *', $cron$select gary_private.fantasy_enqueue()$cron$);
select cron.schedule('fantasy-column-collect', '*/2 * * * *', $cron$select gary_private.fantasy_collect()$cron$);
