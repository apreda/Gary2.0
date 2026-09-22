-- Winners Lab: the play breakdown RPC, desk sections, the fan's own systems
-- (Beat Gary) and Gary talk usage. Spec:
-- docs/superpowers/specs/2026-09-21-winners-lab-design.md (sections 2.1-2.4).
--
-- Every function here is security definer with an empty search_path and fully
-- qualified names. Reader-facing text stays in plain words.
--
-- Spread sign convention, verified September 21, 2026 against the live rows:
--   public.daily_slate.spread is the HOME team's handicap (negative = home
--   favored). Giants @ Rams (bdl 1392247): daily_slate.spread = -6.5 with
--   ml_home -300 / ml_away 245, and Gary's stored pick for that game
--   (weekly_nfl_picks) reads "New York Giants +6.5 -102" with spread = 6.5.
--   Nationals @ Tigers (5060113): daily_slate.spread = -1.5 (home favored) and
--   the daily_picks Tigers ML pick carries spread = -1.5. Blue Jays @ Orioles
--   (5060112): daily_slate.spread = 1.5 (home dog) and the Orioles pick carries
--   spread = 1.5. So a stored pick's `spread` is written from the PICKED
--   team's side, while the slate's is the home side's:
--     home line = daily_slate.spread, away line = -daily_slate.spread.
--   daily_slate rows are refreshed with in-game numbers once a game starts
--   (the Sep 20 rows carry live lines), so systems enter bets only pregame.

create schema if not exists gary_private;

-- ---------------------------------------------------------------------------
-- 2.3 / 2.4 tables
-- ---------------------------------------------------------------------------
create table public.user_systems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  filters jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index user_systems_user on public.user_systems(user_id);
alter table public.user_systems enable row level security;
revoke all on public.user_systems from public, anon, authenticated;
grant select on public.user_systems to authenticated;
create policy user_systems_select on public.user_systems
  for select to authenticated using ((select auth.uid()) = user_id);

create table public.system_bets (
  id bigint generated always as identity primary key,
  system_id uuid not null references public.user_systems(id) on delete cascade,
  user_id uuid not null,
  game_date text not null,
  league text not null,
  game_id text not null,
  matchup text,
  pick_text text not null,
  side text,
  market text not null,
  line numeric,
  odds integer not null,
  odds_estimated boolean not null default false,
  stake_units numeric not null default 1,
  commence_time timestamptz,
  status text not null default 'pending',
  units_net numeric,
  entered_at timestamptz not null default now(),
  graded_at timestamptz,
  unique (system_id, game_date, game_id, market)
);
create index system_bets_user_date on public.system_bets(user_id, game_date);
create index system_bets_pending on public.system_bets(commence_time) where status = 'pending';
alter table public.system_bets enable row level security;
revoke all on public.system_bets from public, anon, authenticated;
grant select on public.system_bets to authenticated;
create policy system_bets_select on public.system_bets
  for select to authenticated using ((select auth.uid()) = user_id);

create table public.gary_talk_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  used integer not null default 0,
  primary key (user_id, day)
);
alter table public.gary_talk_usage enable row level security;
revoke all on public.gary_talk_usage from public, anon, authenticated;
grant select on public.gary_talk_usage to authenticated;
create policy gary_talk_usage_select on public.gary_talk_usage
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Private helpers (gary_private.lab_*)
-- ---------------------------------------------------------------------------
create function gary_private.lab_int(p text) returns integer
language sql immutable set search_path = '' as $$
  select case when p ~ '^\s*[+-]?[0-9]+(\.0+)?\s*$' then round(btrim(p)::numeric)::integer end
$$;

create function gary_private.lab_num(p text) returns numeric
language sql immutable set search_path = '' as $$
  select case when p ~ '^\s*[+-]?[0-9]+(\.[0-9]+)?\s*$' then btrim(p)::numeric end
$$;

create function gary_private.lab_ts(p text) returns timestamptz
language sql immutable set search_path = '' as $$
  select case when p ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}' then p::timestamptz end
$$;

create function gary_private.lab_norm_text(p text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'))
$$;

create function gary_private.lab_norm_result(p text) returns text
language sql immutable set search_path = '' as $$
  select case lower(btrim(coalesce(p, '')))
    when 'win' then 'won' when 'won' then 'won'
    when 'loss' then 'lost' when 'lost' then 'lost'
    when 'push' then 'push' when 'pushed' then 'push'
    when 'void' then 'void' when 'voided' then 'void'
    else nullif(lower(btrim(coalesce(p, ''))), '') end
$$;

-- Net units for a graded ticket: stake * (odds>0 ? odds/100 : 100/|odds|) on a
-- win, -stake on a loss, 0 otherwise. Unpriced odds count as even money.
create function gary_private.lab_units(p_result text, p_odds integer, p_stake numeric) returns numeric
language sql immutable set search_path = '' as $$
  select case p_result
    when 'won' then coalesce(p_stake, 0) * case
      when p_odds is null or abs(p_odds) < 100 then 1
      when p_odds > 0 then p_odds / 100.0
      else 100.0 / abs(p_odds) end
    when 'lost' then -coalesce(p_stake, 0)
    else 0 end
$$;

create function gary_private.lab_fmt_odds(p integer) returns text
language sql immutable set search_path = '' as $$
  select case when p is null then '' when p > 0 then '+' || p::text else p::text end
$$;

create function gary_private.lab_fmt_num(p numeric) returns text
language sql immutable set search_path = '' as $$
  select case when p is null then ''
    when p = trunc(p) then trunc(p)::text
    else rtrim(rtrim(p::text, '0'), '.') end
$$;

create function gary_private.lab_fmt_line(p numeric) returns text
language sql immutable set search_path = '' as $$
  select case when p is null then '' when p > 0 then '+' || gary_private.lab_fmt_num(p)
    when p = 0 then 'PK' else gary_private.lab_fmt_num(p) end
$$;

-- Access rule for a play: historical (before today ET) or the league is open.
create function gary_private.lab_can_see(p_game_date text, p_league text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_game_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and p_game_date::date < (now() at time zone 'America/New_York')::date, false)
    or gary_private.has_winners_access(p_league)
$$;

-- The result row for a board ticket, matched the way the bankroll ledger does:
-- NFL games by game_date + pick_text (fallback game_id); other games by
-- game_date + league + pick_text (fallback game_id, then matchup); props by
-- game_date + player + market + line + bet.
create function gary_private.lab_ticket_result(
  p_kind text, p_league text, p_game_date text, p_game_id text, p_pick_text text, p_snapshot jsonb
) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when p_game_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then null
    when p_kind = 'prop' then (
      select jsonb_build_object('result', gary_private.lab_norm_result(r.result),
        'actual_value', r.actual_value, 'line_value', r.line_value)
      from public.prop_results r
      where r.game_date = p_game_date::date and r.result is not null
        and lower(btrim(coalesce(r.player_name, ''))) = lower(btrim(coalesce(p_snapshot->>'player', '')))
        and regexp_replace(regexp_replace(lower(btrim(coalesce(r.prop_type, ''))), '^player_', ''), '[\s_]+', '_', 'g')
          = regexp_replace(regexp_replace(regexp_replace(lower(btrim(coalesce(p_snapshot->>'prop', p_snapshot->>'prop_type', ''))),
              '\s+[+-]?[0-9]+(\.[0-9]+)?$', ''), '^player_', ''), '[\s_]+', '_', 'g')
        and r.line_value = gary_private.lab_num(p_snapshot->>'line')
        and lower(btrim(coalesce(r.bet, ''))) = lower(btrim(coalesce(p_snapshot->>'bet', '')))
      order by (r.game_id = p_game_id) desc nulls last, greatest(r.updated_at, r.created_at) desc nulls last
      limit 1)
    when upper(p_league) = 'NFL' then (
      select jsonb_build_object(
        'result', case when r.season_type = 1 then 'void' else gary_private.lab_norm_result(r.result) end,
        'final_score', r.final_score, 'home_score', r.home_score, 'away_score', r.away_score)
      from public.nfl_results r
      where r.game_date = p_game_date::date and r.result is not null
        and (gary_private.lab_norm_text(r.pick_text) = gary_private.lab_norm_text(p_pick_text) or r.game_id = p_game_id)
      order by (gary_private.lab_norm_text(r.pick_text) = gary_private.lab_norm_text(p_pick_text)) desc,
        greatest(r.updated_at, r.created_at) desc nulls last
      limit 1)
    else (
      select jsonb_build_object('result', gary_private.lab_norm_result(r.result), 'final_score', r.final_score,
        'home_score', case when r.final_score ~ '^[0-9]+-[0-9]+$' then split_part(r.final_score, '-', 2)::integer end,
        'away_score', case when r.final_score ~ '^[0-9]+-[0-9]+$' then split_part(r.final_score, '-', 1)::integer end)
      from public.game_results r
      where r.game_date = p_game_date::date and r.result is not null
        and upper(coalesce(r.league, '')) = upper(p_league)
        and (gary_private.lab_norm_text(r.pick_text) = gary_private.lab_norm_text(p_pick_text)
          or r.game_id = p_game_id
          or gary_private.lab_norm_text(r.matchup) = gary_private.lab_norm_text(
               coalesce(p_snapshot->>'awayTeam', '') || ' @ ' || coalesce(p_snapshot->>'homeTeam', '')))
      order by (gary_private.lab_norm_text(r.pick_text) = gary_private.lab_norm_text(p_pick_text)) desc,
        (r.game_id = p_game_id) desc nulls last, greatest(r.updated_at, r.created_at) desc nulls last
      limit 1)
  end
$$;

-- Board tickets in a window with their result and net units. A ticket
-- admitted before sizing existed (stake_units null) counts flat at 1u.
create function gary_private.lab_board_ledger(p_from date, p_to date)
returns table(candidate_id bigint, game_date text, league text, kind text, odds integer,
              stake_units numeric, result text, units numeric)
language sql stable security definer set search_path = '' as $$
  select b.candidate_id, b.game_date, b.league, b.kind, c.odds, b.stake_units, r.result,
    case when r.result in ('won', 'lost', 'push')
      then gary_private.lab_units(r.result, c.odds, coalesce(b.stake_units, 1)) else 0 end
  from public.winners_board b
  join public.winners_candidates c on c.id = b.candidate_id
  cross join lateral (
    select gary_private.lab_ticket_result(b.kind, b.league, b.game_date, b.game_id, c.pick_text, b.pick_snapshot)->>'result' as result
  ) r
  where b.game_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and b.game_date::date between p_from and p_to
$$;

create function gary_private.lab_record(p_from date, p_to date, p_league text, p_kind text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'won', count(*) filter (where l.result = 'won'),
    'lost', count(*) filter (where l.result = 'lost'),
    'push', count(*) filter (where l.result = 'push'),
    'units', round(coalesce(sum(l.units), 0), 2))
  from gary_private.lab_board_ledger(p_from, p_to) l
  where (p_league is null or l.league = p_league) and (p_kind is null or l.kind = p_kind)
$$;

create function gary_private.lab_tape(p_league text, p_kind text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with l as (
    select * from gary_private.lab_board_ledger(
      (now() at time zone 'America/New_York')::date - 30,
      (now() at time zone 'America/New_York')::date)
  )
  select jsonb_build_object(
    'board_30d', coalesce((
      select jsonb_object_agg(x.league, x.rec) from (
        select l.league, jsonb_build_object(
          'won', count(*) filter (where l.result = 'won'),
          'lost', count(*) filter (where l.result = 'lost'),
          'push', count(*) filter (where l.result = 'push'),
          'units', round(coalesce(sum(l.units), 0), 2)) as rec
        from l group by l.league) x), '{}'::jsonb),
    'kind', (
      select jsonb_build_object(
        'won', count(*) filter (where l.result = 'won'),
        'lost', count(*) filter (where l.result = 'lost'),
        'push', count(*) filter (where l.result = 'push'),
        'units', round(coalesce(sum(l.units), 0), 2))
      from l where l.league = p_league and l.kind = p_kind))
$$;

-- Desk sections. A header is a markdown heading (# to ####), a line wrapped in
-- ═ marks with text inside, or a bare upper-case line (the spec's pattern,
-- minus photo-credit lines that carry a slash).
create function gary_private.lab_is_desk_header(p_line text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(
    p_line ~ '^#{1,4} \S'
    or p_line ~ '^═{2,}\s*[^═\s].*═{2,}\s*$'
    or (p_line ~ '^[A-Z][A-Z0-9 /&,:()\-]{8,}$' and position('/' in p_line) = 0), false)
$$;

create function gary_private.lab_title_case(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  w text; core text; nw text; i integer := 0; out_words text[] := '{}';
  acr text[] := array['NFL','MLB','NCAAF','NBA','NHL','AFC','NFC','AL','NL','QB','QBS','RB','RBS','WR','WRS','TE','TES',
    'OL','DL','LB','LBS','DB','DBS','CB','CBS','SP','RP','DH','ERA','WHIP','OPS','OBP','SLG','AVG','RBI','RBIS','HR','HRS',
    'BB','SO','IP','H2H','ATS','ML','MNF','SNF','TNF','TD','TDS','INT','INTS','IR','IL','PFF','EPA','DVOA','YPA','YPC',
    'USA','ESPN','MVP','ACC','SEC','CFP','AP','ET','EDT','EST','PM','AM','ID','BDL','API','MLBAM','FBS','FCS','OT','PAT',
    'FG','FGS','XP','LHP','RHP','LHB','RHB','L1','L3','L5','L10','L20','L30','II','III','IV','TBD','TBA','NY','LA','KC',
    'SF','GB','NE','TB','NO','LV','JAX','DAL','PHI','MIN','CHI','DET','ATL','CAR','TEN','PIT','CLE','BAL','CIN','HOU',
    'DEN','SEA','ARI','MIA','IND','WAS','WSH','NYG','NYJ','LAR','LAC','BUF','TOR','BOS','TEX','SD','STL','MIL','COL','CWS'];
  small text[] := array['a','an','and','the','of','for','to','in','on','at','by','vs','or','from','with','as','is','are','its'];
begin
  foreach w in array regexp_split_to_array(coalesce(p, ''), '\s+') loop
    i := i + 1;
    core := regexp_replace(w, '[^A-Za-z0-9]', '', 'g');
    if core ~ '^[A-Z0-9]+$' and core ~ '[A-Z]' then
      if core = any(acr) then nw := w;
      elsif i > 1 and lower(core) = any(small) then nw := lower(w);
      else
        nw := initcap(lower(w));
        nw := regexp_replace(nw, '''S$', '''s');
        nw := regexp_replace(nw, '-(To|Of|And|The|A|An|In|On|For)-', '-\1-', 'g');
        nw := replace(replace(replace(nw, '-To-', '-to-'), '-Of-', '-of-'), '-And-', '-and-');
      end if;
    else
      nw := w;
    end if;
    out_words := out_words || nw;
  end loop;
  return btrim(array_to_string(out_words, ' '));
end $$;

create function gary_private.lab_desk_title(p_line text) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := coalesce(p_line, '');
begin
  t := regexp_replace(t, '^#{1,4}\s*', '');
  t := regexp_replace(t, '^═+\s*', '');
  t := regexp_replace(t, '\s*═+\s*$', '');
  t := replace(t, chr(9888), '');
  t := replace(t, chr(65039), '');
  t := regexp_replace(t, '\s*[—–-]+\s*(AS WRITTEN|REPORTED OBSERVATIONS|FROM BDL)\s*$', '', 'i');
  t := regexp_replace(t, '\s*[—–-]+\s*(AS WRITTEN|REPORTED OBSERVATIONS|FROM BDL)\s*$', '', 'i');
  t := regexp_replace(t, ',\s*AS WRITTEN\s*$', '', 'i');
  t := regexp_replace(t, '\s*\([^)]*(BDL|AS WRITTEN|[0-9]{4})[^)]*\)', '', 'gi');
  t := regexp_replace(t, '\s+FROM BDL\y', '', 'gi');
  t := regexp_replace(t, '\s*[—–-]+\s*[a-z0-9]+(-[a-z0-9]+){2,}\s*$', '');
  t := regexp_replace(t, '\s*:\s*$', '');
  t := btrim(regexp_replace(t, '\s+', ' ', 'g'), ' —–-');
  return gary_private.lab_title_case(t);
end $$;

-- Sections of a desk: index = ordinal of the header line (0 = the text before
-- the first header, titled "The matchup"; a desk with no headers is one
-- section titled "The desk"). Consecutive duplicate titles merge.
create function gary_private.lab_desk_sections(p_text text)
returns table(idx integer, title text, line_from integer, line_to integer, chars integer)
language sql immutable set search_path = '' as $$
  with l as (
    select t.line, t.n::integer as n, (sum(length(t.line) + 1) over (order by t.n))::integer as cum
    from regexp_split_to_table(coalesce(p_text, ''), E'\n') with ordinality as t(line, n)
  ),
  h as (
    select l.n, gary_private.lab_desk_title(l.line) as title
    from l where gary_private.lab_is_desk_header(l.line)
  ),
  h1 as (
    select x.n, x.title from (
      select h.n, h.title, lag(h.title) over (order by h.n) as prev from h) x
    where x.prev is distinct from x.title
  ),
  firsth as (select min(h1.n) as n from h1),
  pre as (
    select 0 as n, case when (select f.n from firsth f) is null then 'The desk' else 'The matchup' end as title
    where exists (
      select 1 from l, firsth f
      where (f.n is null or l.n < f.n) and btrim(l.line, ' ═━─' || E'\t') <> '')
  ),
  allh as (select pre.n, pre.title from pre union all select h1.n, h1.title from h1),
  sec as (select a.n, a.title, lead(a.n) over (order by a.n) as next_n from allh a),
  bounds as (
    select s.n, s.title,
      case when s.n = 0 then 1 else s.n end as line_from,
      coalesce(s.next_n - 1, (select max(l.n) from l)) as line_to
    from sec s
  )
  select b.n, b.title, b.line_from, b.line_to,
    greatest(coalesce((select l.cum from l where l.n = b.line_to), 0)
           - coalesce((select l.cum from l where l.n = b.line_from - 1), 0) - 1, 0)
  from bounds b
  order by b.n
$$;

-- Gary's stored game picks for an ET date: daily_picks (MLB, NCAAF) plus the
-- NFL week rows in weekly_nfl_picks whose kickoff falls on that ET date.
create function gary_private.lab_gary_picks(p_date text)
returns table(league text, game_id text, home_team text, away_team text, pick text,
              odds integer, spread numeric, spread_odds integer, total numeric, commence_time timestamptz)
language sql stable security definer set search_path = '' as $$
  select upper(p->>'league'), coalesce(p->>'game_id', p->>'bdl_game_id'), p->>'homeTeam', p->>'awayTeam', p->>'pick',
    gary_private.lab_int(p->>'odds'), gary_private.lab_num(p->>'spread'), gary_private.lab_int(p->>'spreadOdds'),
    gary_private.lab_num(p->>'total'), gary_private.lab_ts(p->>'commence_time')
  from public.daily_picks d,
    jsonb_array_elements(case when jsonb_typeof(d.picks) = 'array' then d.picks else '[]'::jsonb end) p
  where d.date = p_date and jsonb_typeof(p) = 'object'
  union all
  select 'NFL', coalesce(p->>'bdl_game_id', p->>'game_id'), p->>'homeTeam', p->>'awayTeam', p->>'pick',
    gary_private.lab_int(p->>'odds'), gary_private.lab_num(p->>'spread'), gary_private.lab_int(p->>'spreadOdds'),
    gary_private.lab_num(p->>'total'), gary_private.lab_ts(p->>'commence_time')
  from public.weekly_nfl_picks w,
    jsonb_array_elements(case when jsonb_typeof(w.picks) = 'array' then w.picks else '[]'::jsonb end) p
  where jsonb_typeof(p) = 'object'
    and w.week_start between p_date::date - 8 and p_date::date
    and (gary_private.lab_ts(p->>'commence_time') at time zone 'America/New_York')::date = p_date::date
$$;

create function gary_private.lab_check_filters(p_filters jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare f jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  if jsonb_typeof(f) <> 'object' then raise exception 'Bad filters'; end if;
  if f ? 'sports' and jsonb_typeof(f->'sports') <> 'null' then
    if jsonb_typeof(f->'sports') <> 'array' then raise exception 'Bad filters'; end if;
    if exists (select 1 from jsonb_array_elements_text(f->'sports') s where upper(s) not in ('MLB','NFL','NCAAF')) then
      raise exception 'Bad filters';
    end if;
  end if;
  if coalesce(nullif(f->>'side', ''), 'any_dog') not in
     ('road_dog','home_dog','any_dog','road_favorite','home_favorite','any_favorite','home','road') then
    raise exception 'Bad filters';
  end if;
  if coalesce(nullif(f->>'market', ''), 'moneyline') not in ('moneyline','spread','total_over','total_under') then
    raise exception 'Bad filters';
  end if;
  if coalesce(nullif(f->>'time', ''), 'any') not in ('day','night','primetime','any') then raise exception 'Bad filters'; end if;
  if coalesce(nullif(f->>'gary', ''), 'any') not in ('any','with','against') then raise exception 'Bad filters'; end if;
  if (f->>'price_min') is not null and gary_private.lab_int(f->>'price_min') is null then raise exception 'Bad filters'; end if;
  if (f->>'price_max') is not null and gary_private.lab_int(f->>'price_max') is null then raise exception 'Bad filters'; end if;
  if (f->>'spread_max') is not null and gary_private.lab_num(f->>'spread_max') is null then raise exception 'Bad filters'; end if;
  if (f->>'total_min') is not null and gary_private.lab_num(f->>'total_min') is null then raise exception 'Bad filters'; end if;
  if (f->>'total_max') is not null and gary_private.lab_num(f->>'total_max') is null then raise exception 'Bad filters'; end if;
end $$;

-- The slate games a filter set matches on an ET date, priced from the slate:
-- moneyline = the exact slate price; spread and totals = the slate line at
-- -110 (estimated) unless Gary's pick on the same side carries a price.
create function gary_private.lab_matches(p_filters jsonb, p_date text)
returns table(league text, game_id text, matchup text, home_team text, away_team text,
              commence_time timestamptz, pick_text text, side text, market text, line numeric,
              odds integer, odds_estimated boolean, gary_pick text, gary_agrees boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_sports text[]; v_side text; v_market text; v_pmin integer; v_pmax integer;
  v_smax numeric; v_tmin numeric; v_tmax numeric; v_time text; v_gary text;
begin
  if p_date is null or p_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date'; end if;
  perform gary_private.lab_check_filters(f);
  if f ? 'sports' and jsonb_typeof(f->'sports') = 'array' then
    select array_agg(upper(x)) into v_sports from jsonb_array_elements_text(f->'sports') x;
  end if;
  v_sports := coalesce(v_sports, array['MLB','NFL','NCAAF']);
  v_side := coalesce(nullif(f->>'side', ''), 'any_dog');
  v_market := coalesce(nullif(f->>'market', ''), 'moneyline');
  v_pmin := gary_private.lab_int(f->>'price_min');
  v_pmax := gary_private.lab_int(f->>'price_max');
  v_smax := gary_private.lab_num(f->>'spread_max');
  v_tmin := gary_private.lab_num(f->>'total_min');
  v_tmax := gary_private.lab_num(f->>'total_max');
  v_time := coalesce(nullif(f->>'time', ''), 'any');
  v_gary := coalesce(nullif(f->>'gary', ''), 'any');

  return query
  with s as (
    select distinct on (upper(ds.league), ds.bdl_game_id)
      upper(ds.league) as league, ds.bdl_game_id::text as game_id, ds.home_team, ds.away_team, ds.commence_time,
      ds.spread, round(ds.ml_home)::integer as ml_home, round(ds.ml_away)::integer as ml_away, ds.total
    from public.daily_slate ds
    where ds.date = p_date::date and ds.bdl_game_id is not null and upper(ds.league) = any(v_sports)
    order by upper(ds.league), ds.bdl_game_id, ds.created_at desc
  ),
  g as (select * from gary_private.lab_gary_picks(p_date)),
  sg as (
    select s.*, gp.pick as gary_pick, gp.spread_odds as gary_spread_odds, gp.odds as gary_odds,
      case when gp.pick is null then null
           when position(lower(s.home_team) in lower(gp.pick)) = 1 then 'home'
           when position(lower(s.away_team) in lower(gp.pick)) = 1 then 'away'
           when lower(gp.pick) ~ '^over\s' then 'over'
           when lower(gp.pick) ~ '^under\s' then 'under' end as gary_side,
      case when gp.pick is null then null
           when lower(gp.pick) ~ '^(over|under)\s' then 'total'
           when lower(gp.pick) ~ '\sml(\s|$)' then 'moneyline'
           else 'spread' end as gary_market
    from s
    left join lateral (
      select g.* from g
      where g.league = s.league
        and (g.game_id = s.game_id
          or (lower(g.home_team) = lower(s.home_team) and lower(g.away_team) = lower(s.away_team)))
      limit 1) gp on true
  ),
  fav as (
    select sg.*,
      case when sg.ml_home is not null and sg.ml_away is not null and sg.ml_home <> sg.ml_away then (sg.ml_home < sg.ml_away)
           when sg.spread is not null and sg.spread <> 0 then (sg.spread < 0) end as home_fav
    from sg
  ),
  taken as (
    select fav.*,
      case when v_market in ('total_over', 'total_under') then replace(v_market, 'total_', '')
           when v_side = 'home' then 'home'
           when v_side = 'road' then 'away'
           when v_side = 'road_dog' and fav.home_fav then 'away'
           when v_side = 'home_dog' and fav.home_fav = false then 'home'
           when v_side = 'any_dog' then case when fav.home_fav then 'away' when fav.home_fav = false then 'home' end
           when v_side = 'road_favorite' and fav.home_fav = false then 'away'
           when v_side = 'home_favorite' and fav.home_fav then 'home'
           when v_side = 'any_favorite' then case when fav.home_fav then 'home' when fav.home_fav = false then 'away' end
      end as tside
    from fav
  ),
  priced as (
    select t.*,
      case when t.tside = 'home' then t.home_team when t.tside = 'away' then t.away_team end as team,
      case v_market
        when 'moneyline' then null::numeric
        when 'spread' then case when t.tside = 'home' then t.spread when t.tside = 'away' then -t.spread end
        else t.total end as pline,
      case v_market
        when 'moneyline' then case when t.tside = 'home' then t.ml_home when t.tside = 'away' then t.ml_away end
        when 'spread' then case when t.gary_market = 'spread' and t.gary_side = t.tside and t.gary_spread_odds is not null
                                then t.gary_spread_odds else -110 end
        else case when t.gary_market = 'total' and t.gary_side = t.tside and t.gary_odds is not null
                  then t.gary_odds else -110 end
      end as podds,
      case v_market
        when 'moneyline' then false
        when 'spread' then not coalesce(t.gary_market = 'spread' and t.gary_side = t.tside and t.gary_spread_odds is not null, false)
        else not coalesce(t.gary_market = 'total' and t.gary_side = t.tside and t.gary_odds is not null, false)
      end as pest,
      case when t.gary_side is null then null
           when v_market in ('total_over', 'total_under') then
             case when t.gary_side in ('over', 'under') then t.gary_side = t.tside end
           else case when t.gary_side in ('home', 'away') then t.gary_side = t.tside end
      end as agrees
    from taken t
  )
  select p.league, p.game_id, p.away_team || ' @ ' || p.home_team, p.home_team, p.away_team, p.commence_time,
    case v_market
      when 'moneyline' then p.team || ' ML ' || gary_private.lab_fmt_odds(p.podds)
      when 'spread' then p.team || ' ' || gary_private.lab_fmt_line(p.pline) || ' ' || gary_private.lab_fmt_odds(p.podds)
      when 'total_over' then 'Over ' || gary_private.lab_fmt_num(p.pline) || ' ' || gary_private.lab_fmt_odds(p.podds)
      else 'Under ' || gary_private.lab_fmt_num(p.pline) || ' ' || gary_private.lab_fmt_odds(p.podds) end,
    p.tside, v_market, p.pline, p.podds, p.pest, p.gary_pick, p.agrees
  from priced p
  where p.tside is not null
    and (v_market <> 'moneyline' or p.podds is not null)
    and (v_market = 'moneyline' or p.pline is not null)
    and (v_pmin is null or p.podds >= v_pmin)
    and (v_pmax is null or p.podds <= v_pmax)
    and (v_smax is null or (p.spread is not null and abs(p.spread) <= v_smax))
    and (v_tmin is null or (p.total is not null and p.total >= v_tmin))
    and (v_tmax is null or (p.total is not null and p.total <= v_tmax))
    and (v_time = 'any' or (p.commence_time is not null and
          case v_time
            when 'day' then extract(hour from p.commence_time at time zone 'America/New_York') < 17
            when 'night' then extract(hour from p.commence_time at time zone 'America/New_York') >= 17
            else extract(hour from p.commence_time at time zone 'America/New_York') >= 20 end))
    and (v_gary = 'any' or (v_gary = 'with' and p.agrees) or (v_gary = 'against' and p.agrees = false))
  order by p.commence_time, p.away_team;
end $$;

create function gary_private.lab_enter_system(p_system_id uuid, p_date text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_s public.user_systems; n integer;
begin
  select * into v_s from public.user_systems us where us.id = p_system_id;
  if not found then return 0; end if;
  insert into public.system_bets (system_id, user_id, game_date, league, game_id, matchup, pick_text, side, market,
                                  line, odds, odds_estimated, stake_units, commence_time)
  select p_system_id, v_s.user_id, p_date, m.league, m.game_id, m.matchup, m.pick_text, m.side, m.market,
         m.line, m.odds, m.odds_estimated, 1, m.commence_time
  from gary_private.lab_matches(v_s.filters, p_date) m
  where m.commence_time > now()
  on conflict (system_id, game_date, game_id, market) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- The final for a system bet's game: NFL from nfl_results (game_id, fallback
-- matchup), other leagues from game_results.final_score ('away-home').
create function gary_private.lab_final_score(p_league text, p_game_date text, p_game_id text, p_matchup text)
returns table(home_score integer, away_score integer)
language sql stable security definer set search_path = '' as $$
  select * from (
    select r.home_score, r.away_score
    from public.nfl_results r
    where upper(p_league) = 'NFL' and p_game_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and r.game_date = p_game_date::date and r.home_score is not null and r.away_score is not null
      and (r.game_id = p_game_id or gary_private.lab_norm_text(r.matchup) = gary_private.lab_norm_text(p_matchup))
    order by (r.game_id = p_game_id) desc nulls last, greatest(r.updated_at, r.created_at) desc nulls last
    limit 1) a
  union all
  select * from (
    select split_part(r.final_score, '-', 2)::integer, split_part(r.final_score, '-', 1)::integer
    from public.game_results r
    where upper(p_league) <> 'NFL' and p_game_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and r.game_date = p_game_date::date and upper(coalesce(r.league, '')) = upper(p_league)
      and r.final_score ~ '^[0-9]+-[0-9]+$'
      and (r.game_id = p_game_id or gary_private.lab_norm_text(r.matchup) = gary_private.lab_norm_text(p_matchup))
    order by (r.game_id = p_game_id) desc nulls last, greatest(r.updated_at, r.created_at) desc nulls last
    limit 1) b
  limit 1
$$;

-- Current streak of a system: +n consecutive wins, -n consecutive losses,
-- newest first (pushes and pending bets are skipped).
create function gary_private.lab_streak(p_system_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  with g as (
    select sb.status, row_number() over (order by sb.commence_time desc nulls last, sb.id desc) as rn
    from public.system_bets sb where sb.system_id = p_system_id and sb.status in ('won', 'lost')
  ),
  f as (select g.status as first_status from g where g.rn = 1),
  brk as (select min(g.rn) as rn from g, f where g.status <> f.first_status)
  select coalesce((
    select (case when f.first_status = 'won' then 1 else -1 end)
         * (coalesce((select brk.rn from brk), (select max(g.rn) + 1 from g)) - 1)
    from f), 0)::integer
$$;

create function gary_private.lab_system_record(p_system_id uuid, p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'won', count(*) filter (where sb.status = 'won'),
    'lost', count(*) filter (where sb.status = 'lost'),
    'push', count(*) filter (where sb.status = 'push'),
    'pending', count(*) filter (where sb.status = 'pending'),
    'units', round(coalesce(sum(sb.units_net) filter (where sb.status in ('won', 'lost', 'push')), 0), 2),
    'streak', gary_private.lab_streak(p_system_id))
  from public.system_bets sb
  where sb.system_id = p_system_id
    and (p_from is null or (sb.game_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and sb.game_date::date between p_from and p_to))
$$;

-- ---------------------------------------------------------------------------
-- 2.1 get_winners_play
-- ---------------------------------------------------------------------------
create function public.get_winners_play(p_candidate_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_c public.winners_candidates;
  v_b public.winners_board;
  v_desk text; v_cases jsonb; v_home text; v_away text; v_home_team text; v_away_team text; v_pick_is_home boolean;
begin
  select * into v_c from public.winners_candidates wc where wc.id = p_candidate_id and wc.admitted_at is not null;
  if not found then raise exception 'No such play'; end if;
  select * into v_b from public.winners_board wb where wb.candidate_id = p_candidate_id;
  if not found then raise exception 'No such play'; end if;
  if not gary_private.lab_can_see(v_c.game_date, v_c.league) then raise exception 'Locked'; end if;

  v_desk := v_c.evidence_snapshot->>'deskText';
  if v_c.kind = 'game' then
    v_home := coalesce(nullif(v_c.evidence_snapshot->>'caseHome', ''), nullif(v_b.pick_snapshot->>'path_home', ''));
    v_away := coalesce(nullif(v_c.evidence_snapshot->>'caseAway', ''), nullif(v_b.pick_snapshot->>'path_away', ''));
    v_home_team := coalesce(v_c.evidence_snapshot->>'homeTeam', v_b.pick_snapshot->>'homeTeam');
    v_away_team := coalesce(v_c.evidence_snapshot->>'awayTeam', v_b.pick_snapshot->>'awayTeam');
    v_pick_is_home := case
      when (v_c.evidence_snapshot->>'pickIsHome') in ('true', 'false') then (v_c.evidence_snapshot->>'pickIsHome')::boolean
      when v_home_team is not null then position(lower(v_home_team) in lower(v_c.pick_text)) = 1 end;
    if v_home is not null or v_away is not null then
      v_cases := jsonb_build_object('home', v_home, 'away', v_away, 'pick_is_home', v_pick_is_home,
                                    'home_team', v_home_team, 'away_team', v_away_team);
    end if;
  end if;

  return jsonb_build_object(
    'candidate', jsonb_build_object(
      'id', v_c.id, 'game_date', v_c.game_date, 'league', v_c.league, 'kind', v_c.kind, 'game_id', v_c.game_id,
      'pick_text', v_c.pick_text, 'odds', v_c.odds, 'commence_time', v_c.commence_time,
      'admitted_at', v_b.admitted_at, 'reason', v_b.reason, 'stake_units', v_b.stake_units),
    'snapshot', v_b.pick_snapshot,
    'cases', v_cases,
    'briefing', nullif(v_c.evidence_snapshot->>'researchBriefing', ''),
    'desk', jsonb_build_object(
      'chars', coalesce(length(v_desk), 0),
      'sections', coalesce((
        select jsonb_agg(jsonb_build_object('index', d.idx, 'title', d.title, 'chars', d.chars) order by d.idx)
        from gary_private.lab_desk_sections(v_desk) d), '[]'::jsonb)),
    'with_it', coalesce((
      select jsonb_agg(jsonb_build_object(
          'candidate_id', w.candidate_id, 'kind', w.kind, 'pick_text', wc.pick_text, 'odds', wc.odds,
          'stake_units', w.stake_units, 'reason', w.reason, 'pick_snapshot', w.pick_snapshot)
        order by w.admitted_at, w.candidate_id)
      from public.winners_board w
      join public.winners_candidates wc on wc.id = w.candidate_id
      where w.game_date = v_c.game_date and w.league = v_c.league and w.game_id = v_c.game_id
        and w.candidate_id <> v_c.id), '[]'::jsonb),
    'ladder', public.line_ladder(v_c.league, v_c.game_date, v_c.game_id),
    'result', gary_private.lab_ticket_result(v_c.kind, v_c.league, v_c.game_date, v_c.game_id, v_c.pick_text, v_b.pick_snapshot),
    'live', (
      select to_jsonb(ls) from public.live_scores ls
      where v_c.game_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and ls.date = v_c.game_date::date
        and ls.league = v_c.league and ls.game_id = v_c.game_id
      order by ls.updated_at desc limit 1),
    'tape', gary_private.lab_tape(v_c.league, v_c.kind));
end $$;

-- ---------------------------------------------------------------------------
-- 2.2 get_winners_desk_section
-- ---------------------------------------------------------------------------
create function public.get_winners_desk_section(p_candidate_id bigint, p_index integer) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_game_date text; v_league text; v_desk text; v_from integer; v_to integer;
begin
  select wc.game_date, wc.league, wc.evidence_snapshot->>'deskText' into v_game_date, v_league, v_desk
  from public.winners_candidates wc where wc.id = p_candidate_id and wc.admitted_at is not null;
  if not found then raise exception 'No such play'; end if;
  if not gary_private.lab_can_see(v_game_date, v_league) then raise exception 'Locked'; end if;
  select d.line_from, d.line_to into v_from, v_to from gary_private.lab_desk_sections(v_desk) d where d.idx = p_index;
  if not found then raise exception 'No such section'; end if;
  return array_to_string((regexp_split_to_array(coalesce(v_desk, ''), E'\n'))[v_from:v_to], E'\n');
end $$;

-- ---------------------------------------------------------------------------
-- 2.3 systems
-- ---------------------------------------------------------------------------
create function public.system_matches(p_filters jsonb, p_date text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'league', m.league, 'game_id', m.game_id, 'matchup', m.matchup, 'home_team', m.home_team,
      'away_team', m.away_team, 'commence_time', m.commence_time, 'pick_text', m.pick_text, 'side', m.side,
      'market', m.market, 'line', m.line, 'odds', m.odds, 'odds_estimated', m.odds_estimated,
      'gary_pick', m.gary_pick, 'gary_agrees', m.gary_agrees) order by m.commence_time, m.matchup)
    from gary_private.lab_matches(p_filters, p_date) m), '[]'::jsonb)
$$;

create function public.upsert_system(p_id uuid, p_name text, p_filters jsonb, p_active boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if length(v_name) < 1 or length(v_name) > 60 then raise exception 'Bad name'; end if;
  perform gary_private.lab_check_filters(coalesce(p_filters, '{}'::jsonb));
  if p_id is null then
    if (select count(*) from public.user_systems us where us.user_id = v_uid) >= 25 then
      raise exception 'Too many systems';
    end if;
    insert into public.user_systems (user_id, name, filters, active)
    values (v_uid, v_name, coalesce(p_filters, '{}'::jsonb), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.user_systems us
    set name = v_name, filters = coalesce(p_filters, '{}'::jsonb), active = coalesce(p_active, us.active), updated_at = now()
    where us.id = p_id and us.user_id = v_uid
    returning us.id into v_id;
    if v_id is null then raise exception 'No such system'; end if;
  end if;
  return v_id;
end $$;

create function public.delete_system(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  delete from public.user_systems us where us.id = p_id and us.user_id = v_uid;
  if not found then raise exception 'No such system'; end if;
end $$;

create function public.my_systems() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'filters', s.filters, 'active', s.active,
      'record', gary_private.lab_system_record(s.id, null, null),
      'last_entered', (select max(sb.entered_at) from public.system_bets sb where sb.system_id = s.id))
      order by s.created_at desc)
    from public.user_systems s where s.user_id = (select auth.uid())), '[]'::jsonb)
$$;

create function public.enter_system_bets(p_system_id uuid, p_date text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_active boolean;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if p_date is null or p_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date'; end if;
  select us.active into v_active from public.user_systems us where us.id = p_system_id and us.user_id = v_uid;
  if not found then raise exception 'No such system'; end if;
  if not v_active then return 0; end if;
  return gary_private.lab_enter_system(p_system_id, p_date);
end $$;

create function public.enter_all_active_systems() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0; v_today text := to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD');
begin
  for r in select us.id from public.user_systems us where us.active order by us.created_at loop
    begin
      n := n + gary_private.lab_enter_system(r.id, v_today);
    exception when others then
      null;
    end;
  end loop;
  return n;
end $$;

create function public.settle_system_bets() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with graded as (
    select b.id,
      case b.market
        when 'moneyline' then case when x.ts > x.os then 'won' when x.ts < x.os then 'lost' else 'push' end
        when 'spread' then case when x.ts + coalesce(b.line, 0) > x.os then 'won'
                                when x.ts + coalesce(b.line, 0) < x.os then 'lost' else 'push' end
        when 'total_over' then case when f.home_score + f.away_score > b.line then 'won'
                                    when f.home_score + f.away_score < b.line then 'lost' else 'push' end
        when 'total_under' then case when f.home_score + f.away_score < b.line then 'won'
                                     when f.home_score + f.away_score > b.line then 'lost' else 'push' end
      end as st
    from public.system_bets b
    cross join lateral gary_private.lab_final_score(b.league, b.game_date, b.game_id, b.matchup) f
    cross join lateral (
      select case b.side when 'home' then f.home_score when 'away' then f.away_score end as ts,
             case b.side when 'home' then f.away_score when 'away' then f.home_score end as os) x
    where b.status = 'pending' and (b.commence_time is null or b.commence_time < now())
      and (b.market in ('total_over', 'total_under') or b.side in ('home', 'away'))
      and (b.market not in ('total_over', 'total_under') or b.line is not null)
  )
  update public.system_bets b
  set status = g.st, units_net = gary_private.lab_units(g.st, b.odds, b.stake_units), graded_at = now()
  from graded g where g.id = b.id and g.st is not null;
  get diagnostics n = row_count;
  return n;
end $$;

create function public.beat_gary(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'America/New_York')::date; v_from date;
begin
  v_from := v_today - greatest(coalesce(p_days, 30), 1);
  return jsonb_build_object(
    'days', greatest(coalesce(p_days, 30), 1),
    'gary', gary_private.lab_record(v_from, v_today, null, null),
    'systems', coalesce((
      select jsonb_agg((jsonb_build_object('id', s.id, 'name', s.name)
               || (gary_private.lab_system_record(s.id, v_from, v_today) - 'pending' - 'streak'))
             order by s.created_at desc)
      from public.user_systems s where s.user_id = (select auth.uid())), '[]'::jsonb));
end $$;

create function public.system_bets_for(p_system_id uuid, p_date text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if p_date is null or p_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date'; end if;
  if not exists (select 1 from public.user_systems us where us.id = p_system_id and us.user_id = v_uid) then
    raise exception 'No such system';
  end if;
  return coalesce((
    select jsonb_agg((to_jsonb(b) || jsonb_build_object('gary', (
      select case when gary_private.lab_can_see(w.game_date, w.league) then jsonb_build_object(
          'candidate_id', w.candidate_id, 'pick_text', c.pick_text, 'odds', c.odds, 'reason', w.reason,
          'stake_units', w.stake_units,
          'agrees', case
            when lower(c.pick_text) ~ '^(over|under)\s' then
              case when b.side in ('over', 'under') then lower(c.pick_text) ~ ('^' || b.side || '\s') end
            when b.side = 'home' then position(lower(split_part(b.matchup, ' @ ', 2)) in lower(c.pick_text)) = 1
            when b.side = 'away' then position(lower(split_part(b.matchup, ' @ ', 1)) in lower(c.pick_text)) = 1 end)
        end
      from public.winners_board w
      join public.winners_candidates c on c.id = w.candidate_id
      where w.game_date = b.game_date and w.league = b.league and w.game_id = b.game_id and w.kind = 'game'
      order by w.admitted_at limit 1))) order by b.commence_time, b.id)
    from public.system_bets b where b.system_id = p_system_id and b.game_date = p_date), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- 2.4 talk usage: 80 messages per ET day
-- ---------------------------------------------------------------------------
create function public.record_gary_talk() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_used integer; v_day date := (now() at time zone 'America/New_York')::date;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  insert into public.gary_talk_usage (user_id, day, used) values (v_uid, v_day, 1)
  on conflict (user_id, day) do update set used = public.gary_talk_usage.used + 1
    where public.gary_talk_usage.used < 80
  returning used into v_used;
  if v_used is null then raise exception 'limit'; end if;
  return jsonb_build_object('used', v_used, 'limit', 80);
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function gary_private.lab_int(text) from public;
revoke all on function gary_private.lab_num(text) from public;
revoke all on function gary_private.lab_ts(text) from public;
revoke all on function gary_private.lab_norm_text(text) from public;
revoke all on function gary_private.lab_norm_result(text) from public;
revoke all on function gary_private.lab_units(text, integer, numeric) from public;
revoke all on function gary_private.lab_fmt_odds(integer) from public;
revoke all on function gary_private.lab_fmt_num(numeric) from public;
revoke all on function gary_private.lab_fmt_line(numeric) from public;
revoke all on function gary_private.lab_can_see(text, text) from public;
revoke all on function gary_private.lab_ticket_result(text, text, text, text, text, jsonb) from public;
revoke all on function gary_private.lab_board_ledger(date, date) from public;
revoke all on function gary_private.lab_record(date, date, text, text) from public;
revoke all on function gary_private.lab_tape(text, text) from public;
revoke all on function gary_private.lab_is_desk_header(text) from public;
revoke all on function gary_private.lab_title_case(text) from public;
revoke all on function gary_private.lab_desk_title(text) from public;
revoke all on function gary_private.lab_desk_sections(text) from public;
revoke all on function gary_private.lab_gary_picks(text) from public;
revoke all on function gary_private.lab_check_filters(jsonb) from public;
revoke all on function gary_private.lab_matches(jsonb, text) from public;
revoke all on function gary_private.lab_enter_system(uuid, text) from public;
revoke all on function gary_private.lab_final_score(text, text, text, text) from public;
revoke all on function gary_private.lab_streak(uuid) from public;
revoke all on function gary_private.lab_system_record(uuid, date, date) from public;

revoke all on function public.get_winners_play(bigint) from public;
revoke all on function public.get_winners_desk_section(bigint, integer) from public;
revoke all on function public.system_matches(jsonb, text) from public;
revoke all on function public.upsert_system(uuid, text, jsonb, boolean) from public;
revoke all on function public.delete_system(uuid) from public;
revoke all on function public.my_systems() from public;
revoke all on function public.enter_system_bets(uuid, text) from public;
revoke all on function public.enter_all_active_systems() from public;
revoke all on function public.settle_system_bets() from public;
revoke all on function public.beat_gary(integer) from public;
revoke all on function public.system_bets_for(uuid, text) from public;
revoke all on function public.record_gary_talk() from public;

grant execute on function public.get_winners_play(bigint) to authenticated, service_role;
grant execute on function public.get_winners_desk_section(bigint, integer) to authenticated, service_role;
grant execute on function public.system_matches(jsonb, text) to authenticated, service_role;
grant execute on function public.upsert_system(uuid, text, jsonb, boolean) to authenticated, service_role;
grant execute on function public.delete_system(uuid) to authenticated, service_role;
grant execute on function public.my_systems() to authenticated, service_role;
grant execute on function public.enter_system_bets(uuid, text) to authenticated, service_role;
grant execute on function public.beat_gary(integer) to authenticated, service_role;
grant execute on function public.system_bets_for(uuid, text) to authenticated, service_role;
grant execute on function public.record_gary_talk() to authenticated, service_role;
-- The two cron entry points stay server-side (pg_cron runs them as postgres).
grant execute on function public.enter_all_active_systems() to service_role;
grant execute on function public.settle_system_bets() to service_role;

-- ---------------------------------------------------------------------------
-- pg_cron
-- ---------------------------------------------------------------------------
select cron.schedule('winners-systems-enter', '*/30 * * * *', 'select public.enter_all_active_systems()');
select cron.schedule('winners-systems-settle', '*/10 * * * *', 'select public.settle_system_bets()');
