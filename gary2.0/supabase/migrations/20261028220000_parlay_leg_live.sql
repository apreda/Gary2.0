-- THE PARLAY, LIVE (founder, Oct 28 2026: "instead of tracking the score, since score isn't really relevant to
-- the bet, can we actually live track their stats to see how they're doing"): each player leg's count so far,
-- written by the live-score poller from its game's live stat feed (scripts/lib/parlayLegLive.js). get_parlay
-- hands it to the ticket with the leg's line; a graded dart's official count takes its place once it is in.

create table if not exists public.parlay_leg_live (
  game_date date not null,
  key text not null,
  actual numeric not null,
  line numeric not null,
  bet text not null check (bet in ('over', 'under')),
  is_final boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (game_date, key)
);
alter table public.parlay_leg_live enable row level security;
revoke all on public.parlay_leg_live from anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_parlay(p_date text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_day date; v_p public.parlay_of_the_day; v_legs jsonb; v_n int; v_won int; v_lost int; v_push int;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  v_day := p_date::date;
  select * into v_p from public.parlay_of_the_day where game_date = v_day;
  if not found then return null; end if;

  select jsonb_agg(x.leg order by x.n) into v_legs from (
    select (l->>'n')::int as n, (l || jsonb_build_object(
        'text', case when l->>'key' ~ '^dart:[0-9]+$'
          then coalesce((select case when d.kind = 'first_inning' then case when lower(d.bet) = 'under' then 'NRFI' else 'YRFI' end end
                         from public.darts d where d.id = substring(l->>'key' from 6)::bigint), l->>'text')
          else l->>'text' end,
        'result', gary_private.parlay_leg_result(l, v_day),
        'live', (select jsonb_build_object('status', ls.status, 'detail', ls.detail, 'away_abbr', ls.away_abbr, 'home_abbr', ls.home_abbr,
                                           'away_score', ls.away_score, 'home_score', ls.home_score)
                 from public.live_scores ls where ls.date = v_day and ls.league = (l->>'league') and ls.game_id = (l->>'game_id')
                 order by ls.updated_at desc limit 1),
        'progress', (select jsonb_build_object(
                       'actual', coalesce(case when l->>'key' ~ '^dart:[0-9]+$' then (select d.actual from public.darts d
                                   where d.id = substring(l->>'key' from 6)::bigint and d.result in ('hit', 'miss')) end, pl.actual),
                       'line', pl.line, 'bet', pl.bet, 'is_final', pl.is_final)
                     from public.parlay_leg_live pl where pl.game_date = v_day and pl.key = l->>'key'),
        'team', case when l->>'key' ~ '^dart:[0-9]+$'
          then (select nullif(d.team, '') from public.darts d where d.id = substring(l->>'key' from 6)::bigint)
          else nullif(l->'grade'->'snapshot'->>'team', '') end,
        'player', case when l->>'key' ~ '^dart:[0-9]+$'
          then (select case when d.kind = 'first_inning' then null else d.player end from public.darts d where d.id = substring(l->>'key' from 6)::bigint)
          else nullif(l->'grade'->'snapshot'->>'player', '') end,
        'player_id', case when l->>'key' ~ '^dart:[0-9]+$'
          then (select nullif(d.player_id::text, '') from public.darts d where d.id = substring(l->>'key' from 6)::bigint)
          else nullif(l->'grade'->'snapshot'->>'player_id', '') end
      )) - 'grade' as leg
    from jsonb_array_elements(v_p.legs) l) x;

  select count(*), count(*) filter (where e->>'result' = 'won'), count(*) filter (where e->>'result' = 'lost'),
         count(*) filter (where e->>'result' = 'push')
    into v_n, v_won, v_lost, v_push
  from jsonb_array_elements(coalesce(v_legs, '[]'::jsonb)) e;

  return jsonb_build_object(
    'date', v_p.game_date, 'american_odds', v_p.american_odds, 'payout_10', v_p.payout_10, 'reason', v_p.reason,
    'result', case when v_lost > 0 then 'lost' when v_won > 0 and v_won + v_push = v_n then 'won' end,
    'landed', v_won,
    'legs', v_legs);
end $function$;
