-- DARTS, its own lane (founder, Sep 22 2026): "this is totally separate from
-- the game picks or the prop picks... we're not grading them. They're not
-- going into the Billfold." Gary throws the day's darts every morning from
-- the day's real markets (scripts/run-darts.js, com.gary.darts), five per
-- category: MLB home run, 2+ hits and a run, first-inning run; NFL anytime
-- TD, tight end TD, QB rushing TD, first TD, receiving yards, passing TDs,
-- interception thrown. A player who does not play is marked scratched.
--
-- This retires the first version, which drew darts from Gary's prop lanes
-- (select_darts every 20 minutes) and joined the props grader for Hit/Miss.
begin;

select cron.unschedule(jobid) from cron.job where jobname = 'darts-select';
drop function if exists public.select_darts(text);

alter table public.darts
  add column if not exists position text,
  add column if not exists book text,
  add column if not exists odds_alt integer,        -- the run leg's price on a 2+ hits and a run dart
  add column if not exists model text,
  add column if not exists scratched_at timestamptz,
  add column if not exists scratch_reason text;

-- One dart per subject per category per game (a first-inning dart's subject
-- is the matchup, so a doubleheader's two games are two subjects).
alter table public.darts drop constraint if exists darts_game_date_league_player_prop_key;
alter table public.darts drop constraint if exists darts_one_per_subject;
alter table public.darts add constraint darts_one_per_subject unique (game_date, league, kind, player, game_id);

-- Every throw attempt, for the job's pacing and for us. Service role only.
create table if not exists public.dart_runs (
  id bigserial primary key,
  game_date date not null,
  league text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',     -- running | ok | short | failed
  needed jsonb,
  thrown integer,
  model text,
  error text
);
alter table public.dart_runs enable row level security;
create index if not exists dart_runs_day on public.dart_runs (game_date, league, started_at desc);

-- One day's darts. No grade: darts are never graded.
create or replace function public.darts_day(p_day date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'game_date', d.game_date, 'league', d.league, 'kind', d.kind, 'player', d.player,
    'player_id', d.player_id, 'team', d.team, 'position', d.position, 'matchup', d.matchup, 'game_id', d.game_id,
    'commence_time', d.commence_time, 'prop', d.prop, 'bet', d.bet, 'odds', d.odds, 'odds_alt', d.odds_alt,
    'book', d.book, 'reason', d.reason, 'scratched', d.scratched_at is not null, 'scratch_reason', d.scratch_reason)
    order by d.commence_time nulls last, d.id), '[]'::jsonb)
  from public.darts d
  where d.game_date = p_day
$$;
revoke all on function public.darts_day(date) from public;

-- The page's one read: today's darts, the streaks and Gary's run.
-- `yesterday` stays an empty list for builds that still decode it.
create or replace function public.get_darts(p_date text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_day date;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  v_day := p_date::date;
  return jsonb_build_object(
    'date', v_day,
    'today', public.darts_day(v_day),
    'yesterday', '[]'::jsonb,
    'streaks', (select coalesce(jsonb_agg(jsonb_build_object(
        'game_date', s.game_date, 'league', s.league, 'subject_type', s.subject_type, 'subject', s.subject,
        'team', s.team, 'kind', s.kind, 'length', s.length, 'detail', s.detail, 'next_game', s.next_game)
        order by s.league, s.length desc), '[]'::jsonb)
      from (select s.* from public.streaks s
            where s.league in ('MLB', 'NFL')
              and s.game_date = (select max(x.game_date) from public.streaks x where x.league = s.league)
            order by s.league, s.length desc limit 120) s),
    'run', public.gary_run(v_day));
end $$;
revoke all on function public.get_darts(text) from public;
grant execute on function public.get_darts(text) to anon, authenticated, service_role;

commit;
