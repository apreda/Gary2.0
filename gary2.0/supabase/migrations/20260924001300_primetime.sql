-- PRIMETIME (founder GO, Sep 24 2026, the Darts featured-row doc): the
-- night's big game as a newsletter from Gary. A short opening in his voice,
-- every bet he has on the game in one list (the game pick, his props, the
-- darts, and his Winners play), then a stat and the injuries. After the
-- final, the same page is the recap: each bet marked, the final score.
--
-- The Winners play stays sealed for a fan without access until it is
-- graded; graded, it opens to everyone (founder, Sep 24 2026: "It's in the
-- past, so no one could obviously play that ... We just want to show what it
-- was graded as"). The writer never sees the Winners play.
--
-- The games: NFL games from 7 PM ET (Thursday, Sunday and Monday nights),
-- MLB postseason games from 7 PM ET, and the Winners big game in MLB
-- (Sunday Night Baseball). The slate carries the provider's postseason flag
-- for MLB (dailySlateService.js).

alter table public.daily_slate add column if not exists postseason boolean;

create table if not exists public.primetime_pieces (
  game_date date not null,
  league text not null,
  game_id text not null,
  lede text not null,
  stat_to_know text,
  injuries text,
  had_pick boolean not null default false,
  model text,
  job_id uuid,
  created_at timestamptz not null default now(),
  primary key (game_date, league, game_id)
);
alter table public.primetime_pieces enable row level security;
revoke all on public.primetime_pieces from public, anon, authenticated;
grant all on public.primetime_pieces to service_role;

create table if not exists public.primetime_jobs (
  job_id uuid primary key references public.subscription_model_jobs(id) on delete cascade,
  game_date date not null,
  league text not null,
  game_id text not null,
  had_pick boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.primetime_jobs enable row level security;
revoke all on public.primetime_jobs from public, anon, authenticated;
grant all on public.primetime_jobs to service_role;

-- The night's big games for an ET date.
create or replace function gary_private.primetime_games(p_date date)
returns table(league text, game_id text, away_team text, home_team text, commence_time timestamptz,
              venue text, spread numeric, total numeric, slot text)
language sql stable set search_path = '' as $$
  select distinct on (s.league, s.bdl_game_id)
    s.league, s.bdl_game_id::text, s.away_team, s.home_team, s.commence_time, s.venue, s.spread, s.total,
    case
      when s.league = 'NFL' then upper(to_char(s.commence_time at time zone 'America/New_York', 'FMDay')) || ' NIGHT FOOTBALL'
      when coalesce(s.postseason, false) then 'PLAYOFF BASEBALL'
      else upper(to_char(s.commence_time at time zone 'America/New_York', 'FMDay')) || ' NIGHT BASEBALL'
    end
  from public.daily_slate s
  where s.date = p_date and s.commence_time is not null and s.bdl_game_id is not null
    and extract(hour from s.commence_time at time zone 'America/New_York') >= 19
    and (s.league = 'NFL'
      or (s.league = 'MLB' and (coalesce(s.postseason, false)
          or exists (select 1 from public.winners_big_games b
                     where b.game_date = to_char(p_date, 'YYYY-MM-DD') and b.league = 'MLB' and b.game_id = s.bdl_game_id::text))))
  order by s.league, s.bdl_game_id, s.created_at desc
$$;

-- A stored result word as won / lost / push, or null while it rides.
create or replace function gary_private.primetime_result(p_raw text) returns text
language sql immutable set search_path = '' as $$
  select case when r like 'won%' or r like 'win%' or r = 'hit' then 'won'
              when r like 'lost%' or r like 'loss%' or r = 'miss' then 'lost'
              when r like 'push%' or r like 'void%' then 'push' end
  from (select lower(coalesce(p_raw, '')) as r) x
$$;

-- Gary's published game pick on one game (NFL: the season's weekly picks;
-- MLB: the day's picks).
create or replace function gary_private.primetime_pick(p_date date, p_league text, p_game_id text)
returns jsonb language sql stable set search_path = '' as $$
  select x.pk from (
    select pk, 1 as o from public.weekly_nfl_picks w, jsonb_array_elements(w.picks) pk
    where p_league = 'NFL' and w.season = extract(year from p_date)::int
      and coalesce(pk->>'bdl_game_id', pk->>'game_id') = p_game_id
    union all
    select pk, 2 from public.daily_picks d, jsonb_array_elements(d.picks) pk
    where p_league = 'MLB' and d.date = to_char(p_date, 'YYYY-MM-DD')
      and upper(coalesce(pk->>'league', '')) = 'MLB' and coalesce(pk->>'game_id', pk->>'bdl_game_id') = p_game_id
  ) x order by x.o, x.pk->>'published_at' desc nulls last limit 1
$$;

-- A bet as a fan says it: "passing TDs", "anytime touchdown" (not "over 0.5
-- anytime td"), "to homer" (not "over 0.5 home runs").
create or replace function gary_private.primetime_words(p_text text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(regexp_replace(regexp_replace(coalesce(p_text, ''),
    '\mover 0\.5 anytime td\M', 'anytime touchdown', 'gi'),
    '\mover 0\.5 home runs?\M', 'to homer', 'gi'),
    '\mtds\M', 'TDs', 'g')
$$;

-- Every bet Gary has on one game, each with where it stands. The Winners
-- play carries its words only when graded or when the reader has access.
create or replace function gary_private.primetime_bets(p_date date, p_league text, p_game_id text)
returns jsonb language sql stable set search_path = '' as $$
  with pick as (select gary_private.primetime_pick(p_date, p_league, p_game_id) as pk),
  g as (
    select 1 as o, 0::bigint as sub, jsonb_build_object(
      'kind', 'game', 'label', 'GAME PICK',
      'text', regexp_replace(pk->>'pick', '\s*[+-][0-9]{3,4}\s*$', ''),
      'odds', case when pk->>'odds' ~ '^[+-]?[0-9]+$' then (pk->>'odds')::int end,
      'result', gary_private.primetime_result(gary_private.lab_ticket_result('game', p_league, to_char(p_date, 'YYYY-MM-DD'), p_game_id,
                  coalesce(pk->>'pick', ''), pk)->>'result')) as bet
    from pick where pk is not null
  ),
  p as (
    select 2 as o, row_number() over (order by pk->>'player') as sub, jsonb_build_object(
      'kind', 'prop', 'label', 'PROP',
      'text', gary_private.primetime_words(gary_private.parlay_leg_words(pk->>'player', pk->>'bet',
                concat_ws(' ', regexp_replace(coalesce(pk->>'prop', ''), '\s+[0-9.]+$', ''), coalesce(pk->>'line', substring(pk->>'prop' from '[0-9.]+$'))), null, null)),
      'odds', case when pk->>'odds' ~ '^[+-]?[0-9]+$' then (pk->>'odds')::int end,
      'player', pk->>'player', 'player_id', nullif(pk->>'player_id', ''),
      'result', gary_private.primetime_result(gary_private.lab_ticket_result('prop', p_league, to_char(p_date, 'YYYY-MM-DD'), p_game_id, '',
                  jsonb_build_object('player', pk->>'player', 'prop', pk->>'prop', 'bet', pk->>'bet', 'line', pk->>'line'))->>'result')) as bet
    from public.prop_picks pp, jsonb_array_elements(pp.picks) pk
    where pp.date = to_char(p_date, 'YYYY-MM-DD') and pk->>'game_id' = p_game_id
  ),
  d as (
    select 3 as o, row_number() over (order by d.odds, d.id) as sub, jsonb_build_object(
      'kind', 'dart', 'label', 'DART',
      'text', gary_private.primetime_words(gary_private.parlay_leg_words(d.player, d.bet, d.prop, d.kind, d.matchup)),
      'odds', d.odds,
      'player', case when d.kind = 'first_inning' then null else d.player end, 'player_id', nullif(d.player_id, ''),
      'result', gary_private.primetime_result(d.result)) as bet
    from public.darts d
    where d.game_date = p_date and d.league = p_league and d.game_id = p_game_id and d.scratched_at is null
  ),
  w as (
    select row_number() over (order by b.admitted_at, b.candidate_id) as sub,
      b.league, b.stake_units, c.kind, c.pick_text, c.pick_snapshot, c.odds,
      gary_private.primetime_result(coalesce(
        (select l.result from gary_private.bankroll_ledger l where l.candidate_id = b.candidate_id limit 1),
        gary_private.lab_ticket_result(c.kind, c.league, b.game_date, b.game_id, coalesce(c.pick_text, ''),
                                       coalesce(c.pick_snapshot, '{}'::jsonb))->>'result')) as res
    from public.winners_board b
    join public.winners_candidates c on c.id = b.candidate_id
    where b.game_date = to_char(p_date, 'YYYY-MM-DD') and b.game_id = p_game_id
  ),
  wb as (
    select 4 as o, w.sub, case when w.res is not null or gary_private.has_winners_access(w.league)
      then jsonb_build_object(
        'kind', 'winners', 'label', 'WINNERS', 'sealed', false,
        'text', case when w.kind = 'prop'
          then gary_private.primetime_words(gary_private.parlay_leg_words(w.pick_snapshot->>'player', w.pick_snapshot->>'bet',
                 concat_ws(' ', regexp_replace(coalesce(w.pick_snapshot->>'prop', ''), '\s+[0-9.]+$', ''), w.pick_snapshot->>'line'), null, null))
          else regexp_replace(w.pick_text, '\s*[+-][0-9]{3,4}\s*$', '') end,
        'odds', w.odds,
        'stake_dollars', round(w.stake_units * 100),
        'player', w.pick_snapshot->>'player',
        'result', w.res)
      else jsonb_build_object('kind', 'winners', 'label', 'WINNERS', 'sealed', true) end as bet
    from w
  )
  select coalesce(jsonb_agg(x.bet order by x.o, x.sub), '[]'::jsonb) from (
    select o, sub, bet from g
    union all select o, sub, bet from p
    union all select o, sub, bet from d
    union all select o, sub, bet from wb
  ) x
$$;

-- The page: each of the night's big games with Gary's writing, the score
-- and every bet.
create or replace function public.get_primetime(p_date text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_day date;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' or to_char(p_date::date, 'YYYY-MM-DD') <> p_date then
    raise exception 'Invalid date';
  end if;
  v_day := p_date::date;
  return jsonb_build_object('date', p_date, 'games', coalesce((
    select jsonb_agg(jsonb_build_object(
        'league', g.league, 'game_id', g.game_id, 'slot', g.slot,
        'away_team', g.away_team, 'home_team', g.home_team, 'commence_time', g.commence_time,
        'venue', coalesce(g.venue, gary_private.primetime_pick(v_day, g.league, g.game_id)->>'venue'),
        'spread', g.spread, 'total', g.total,
        'lede', pc.lede, 'stat_to_know', pc.stat_to_know, 'injuries', pc.injuries,
        'live', (select jsonb_build_object('status', ls.status, 'detail', ls.detail, 'away_abbr', ls.away_abbr, 'home_abbr', ls.home_abbr,
                                           'away_score', ls.away_score, 'home_score', ls.home_score)
                 from public.live_scores ls where ls.date = v_day and ls.league = g.league and ls.game_id = g.game_id
                 order by ls.updated_at desc limit 1),
        'bets', gary_private.primetime_bets(v_day, g.league, g.game_id))
      order by g.commence_time, g.game_id)
    from gary_private.primetime_games(v_day) g
    left join public.primetime_pieces pc on pc.game_date = v_day and pc.league = g.league and pc.game_id = g.game_id), '[]'::jsonb));
end $$;
revoke all on function public.get_primetime(text) from public;
grant execute on function public.get_primetime(text) to anon, authenticated, service_role;

-- What Gary is asked to write. A writing contract, never a decision: his
-- bets are already published, and the Winners play is not in the material.
create or replace function gary_private.primetime_contract() returns text
language sql immutable set search_path = '' as $c$
  select $t$You are Gary. You are writing the top of tonight's Primetime newsletter: the night's big game, for the fans who follow your bets.

Write three things in your own voice, the way you would talk to a friend who bets:
- lede: three to five sentences about tonight's game. What the matchup is about and where your bets sit in it.
- stat_to_know: one sentence with one fact a fan should know before it starts.
- injuries: one or two sentences on who is out or hurting for this game. Leave it empty when the material names nobody who matters tonight.

Use only the facts in the material. Every number and every name you write must be in it. Your bets are yours; name them plainly (the side, the player, the line). Plain words a fan uses, no betting slang. When a football number comes from one or two games this season, say how many games it is.

You are Gary, a person. Never mention models, data, feeds, tools or the material.$t$
$c$;

-- The material for one game: the game, Gary's published pick and case, the
-- injury report on his pick card, his props and darts with their reasons.
create or replace function gary_private.primetime_material(p_date date, p_league text, p_game_id text) returns text
language sql stable set search_path = '' as $$
  with g as (select * from gary_private.primetime_games(p_date) x where x.league = p_league and x.game_id = p_game_id),
  pick as (select gary_private.primetime_pick(p_date, p_league, p_game_id) as pk),
  inj as (
    select string_agg(format('%s: %s', side_name, list), E'\n') as txt from (
      select case s.side when 'away' then (select away_team from g) else (select home_team from g) end as side_name,
             string_agg(format('%s (%s)%s', e->>'name', coalesce(e->>'status', '?'),
                               case when coalesce(e->>'description', '') <> '' then ' ' || left(e->>'description', 140) else '' end), '; ') as list
      from pick, (values ('away'), ('home')) s(side),
           lateral (select e from jsonb_array_elements(case when jsonb_typeof(pick.pk->'injuries'->s.side) = 'array' then pick.pk->'injuries'->s.side else '[]'::jsonb end) e limit 15) l
      group by s.side) sides
  ),
  props as (
    select string_agg(format('- %s %s: %s',
             gary_private.primetime_words(gary_private.parlay_leg_words(pk->>'player', pk->>'bet',
               concat_ws(' ', regexp_replace(coalesce(pk->>'prop', ''), '\s+[0-9.]+$', ''), coalesce(pk->>'line', substring(pk->>'prop' from '[0-9.]+$'))), null, null)),
             pk->>'odds',
             left(regexp_replace(coalesce(pk->>'rationale', ''), '^\s*Gary''?s Take\s*', '', 'i'), 600)), E'\n') as txt
    from public.prop_picks pp, jsonb_array_elements(pp.picks) pk
    where pp.date = to_char(p_date, 'YYYY-MM-DD') and pk->>'game_id' = p_game_id
  ),
  darts as (
    select string_agg(format('- %s %s: %s',
             gary_private.primetime_words(gary_private.parlay_leg_words(d.player, d.bet, d.prop, d.kind, d.matchup)),
             case when d.odds > 0 then '+' || d.odds else d.odds::text end, coalesce(d.reason, '')), E'\n' order by d.odds) as txt
    from public.darts d
    where d.game_date = p_date and d.league = p_league and d.game_id = p_game_id and d.scratched_at is null
  )
  select concat_ws(E'\n',
    format('GAME: %s @ %s', g.away_team, g.home_team),
    format('WHEN: %s ET', to_char(g.commence_time at time zone 'America/New_York', 'FMDay, FMMonth FMDD, FMHH12:MI AM')),
    case when coalesce(g.venue, (select pk->>'venue' from pick)) is not null then 'WHERE: ' || coalesce(g.venue, (select pk->>'venue' from pick)) end,
    case when g.spread is not null then format('LINE: %s %s%s', g.home_team, case when g.spread > 0 then '+' else '' end, g.spread)
           || case when g.total is not null then format(', total %s', g.total) else '' end end,
    case when (select pk from pick) is not null
      then format(E'YOUR GAME PICK: %s\nYOUR CASE FOR IT:\n%s', (select pk->>'pick' from pick),
                  left(regexp_replace(coalesce((select pk->>'rationale' from pick), ''), '^\s*Gary''?s Take\s*', '', 'i'), 3000))
      else 'YOUR GAME PICK: not out yet' end,
    case when (select txt from inj) is not null then E'INJURY REPORT ON YOUR PICK CARD:\n' || (select txt from inj) end,
    case when (select txt from props) is not null then E'YOUR PROPS ON THIS GAME:\n' || (select txt from props) end,
    case when (select txt from darts) is not null then E'YOUR DARTS ON THIS GAME:\n' || (select txt from darts) end)
  from g
$$;

-- Queue the writing: once Gary's game pick is out, or two hours before the
-- start without it; a piece written before the pick is written again when
-- the pick lands, while the game has not started.
create or replace function gary_private.primetime_enqueue() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_day date := (now() at time zone 'America/New_York')::date; g record; v_has_pick boolean; v_piece public.primetime_pieces;
        v_material text; v_job uuid; n integer := 0;
begin
  for g in select * from gary_private.primetime_games(v_day) loop
    continue when g.commence_time <= now() + interval '20 minutes';
    v_has_pick := gary_private.primetime_pick(v_day, g.league, g.game_id) is not null;
    select * into v_piece from public.primetime_pieces x where x.game_date = v_day and x.league = g.league and x.game_id = g.game_id;
    continue when found and (v_piece.had_pick or not v_has_pick);
    continue when not v_has_pick and g.commence_time > now() + interval '2 hours';
    continue when exists (select 1 from public.primetime_jobs pj join public.subscription_model_jobs j on j.id = pj.job_id
      where pj.game_date = v_day and pj.league = g.league and pj.game_id = g.game_id and pj.had_pick = v_has_pick
        and (j.status in ('queued', 'running') or j.completed_at > now() - interval '20 minutes'));
    v_material := gary_private.primetime_material(v_day, g.league, g.game_id);
    continue when v_material is null;
    insert into public.subscription_model_jobs (lane, status, request, expires_at)
    values ('primetime', 'queued', jsonb_build_object(
      'model', 'claude-opus-5-5',
      'system', gary_private.primetime_contract(),
      'messages', jsonb_build_array(jsonb_build_object('role', 'user', 'content', 'THE MATERIAL' || E'\n' || v_material)),
      'tools', jsonb_build_array(jsonb_build_object('name', 'write_primetime', 'input_schema', jsonb_build_object(
        'type', 'object', 'required', jsonb_build_array('lede', 'stat_to_know', 'injuries'),
        'properties', jsonb_build_object(
          'lede', jsonb_build_object('type', 'string'),
          'stat_to_know', jsonb_build_object('type', 'string'),
          'injuries', jsonb_build_object('type', 'string'))))),
      'tool_choice', jsonb_build_object('type', 'tool', 'name', 'write_primetime'),
      'output_config', jsonb_build_object('effort', 'low')),
      now() + interval '15 minutes')
    returning id into v_job;
    insert into public.primetime_jobs (job_id, game_date, league, game_id, had_pick) values (v_job, v_day, g.league, g.game_id, v_has_pick);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function gary_private.primetime_collect() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; j record; v_in jsonb; v_lede text;
begin
  for j in
    select s.id, s.response, s.route, pj.game_date, pj.league, pj.game_id, pj.had_pick
    from public.subscription_model_jobs s join public.primetime_jobs pj on pj.job_id = s.id
    where s.lane = 'primetime' and s.status = 'completed'
      and not exists (select 1 from public.primetime_pieces x where x.job_id = s.id)
      and not exists (select 1 from public.primetime_pieces x where x.game_date = pj.game_date and x.league = pj.league
                      and x.game_id = pj.game_id and (x.had_pick or not pj.had_pick))
  loop
    v_in := (select c->'input' from jsonb_array_elements(j.response->'content') c where c->>'type' = 'tool_use' limit 1);
    v_lede := btrim(coalesce(v_in->>'lede', ''));
    if length(v_lede) < 40 then
      update public.subscription_model_jobs set status = 'failed', error = 'primetime: no opening written' where id = j.id;
      continue;
    end if;
    insert into public.primetime_pieces (game_date, league, game_id, lede, stat_to_know, injuries, had_pick, model, job_id)
    values (j.game_date, j.league, j.game_id, left(v_lede, 1400),
            nullif(left(btrim(coalesce(v_in->>'stat_to_know', '')), 400), ''),
            nullif(left(btrim(coalesce(v_in->>'injuries', '')), 600), ''),
            j.had_pick, j.route, j.id)
    on conflict (game_date, league, game_id) do update
      set lede = excluded.lede, stat_to_know = excluded.stat_to_know, injuries = excluded.injuries,
          had_pick = true, model = excluded.model, job_id = excluded.job_id, created_at = now()
      where not public.primetime_pieces.had_pick and excluded.had_pick;
    n := n + 1;
  end loop;
  return n;
end $$;

select cron.unschedule(jobid) from cron.job where jobname in ('primetime-enqueue', 'primetime-collect');
select cron.schedule('primetime-enqueue', '*/10 * * * *', $cron$select gary_private.primetime_enqueue()$cron$);
select cron.schedule('primetime-collect', '*/2 * * * *', $cron$select gary_private.primetime_collect()$cron$);
