-- THE READ CHECK (founder GO, Oct 4 2026): "Check his reads the morning after, not only win or loss. For each
-- pick, did the thing he said would happen actually happen? ... It separates bad luck from bad reads ... a
-- report for us and never shown to him." NFL only for now.
-- After an NFL game pick settles, the results job reads the pick's write-up beside the game's box score and
-- marks each thing the pick leaned on as right, wrong or unclear (src/services/factCheck.js, the engine the
-- retired app-facing fact check used; that table, pick_fact_checks, is not written). Private: service role only.
-- Nothing here is ever put in front of Gary.
create table if not exists public.gary_read_checks (
  id bigint generated always as identity primary key,
  game_date date not null,
  league text not null,
  matchup text not null,
  pick_text text not null,
  result text not null,
  claims jsonb not null,
  right_count integer not null default 0,
  wrong_count integer not null default 0,
  unclear_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (game_date, league, matchup)
);
alter table public.gary_read_checks enable row level security;
revoke all on public.gary_read_checks from public, anon, authenticated;
grant all on public.gary_read_checks to service_role;

-- The report: each pick with its result beside how its read did, and the four counts that matter
-- (won or lost, read held or missed). A read "held" when more of what the pick leaned on was right than wrong.
create or replace function public.gary_read_report(p_league text default 'NFL', p_from date default null, p_to date default null)
returns jsonb
language sql stable security definer
set search_path to ''
as $$
  with r as (
    select c.game_date, c.pick_text, c.result, c.right_count, c.wrong_count, c.unclear_count,
           case when c.right_count > c.wrong_count then 'held'
                when c.wrong_count > c.right_count then 'missed'
                when c.right_count + c.wrong_count = 0 then 'unclear'
                else 'even' end as read
    from public.gary_read_checks c
    where c.league = p_league
      and (p_from is null or c.game_date >= p_from) and (p_to is null or c.game_date <= p_to))
  select jsonb_build_object(
    'league', p_league,
    'picks', (select count(*) from r),
    'won_read_held', (select count(*) from r where result = 'won' and read = 'held'),
    'won_read_missed', (select count(*) from r where result = 'won' and read = 'missed'),
    'lost_read_held', (select count(*) from r where result = 'lost' and read = 'held'),
    'lost_read_missed', (select count(*) from r where result = 'lost' and read = 'missed'),
    'no_clear_read', (select count(*) from r where read in ('even', 'unclear') or result not in ('won', 'lost')),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('date', game_date, 'pick', pick_text, 'result', result,
      'right', right_count, 'wrong', wrong_count, 'unclear', unclear_count, 'read', read) order by game_date desc, pick_text) from r), '[]'::jsonb));
$$;
revoke all on function public.gary_read_report(text, date, date) from public, anon, authenticated;
grant execute on function public.gary_read_report(text, date, date) to service_role;
