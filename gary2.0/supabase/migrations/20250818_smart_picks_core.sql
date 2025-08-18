-- Smart Picks Core Schema: games, odds_history, derived_signals, model_outputs, smart_picks, clv_log
-- Views: v_latest_odds, v_best_price
-- Function: get_candidate_picks()

create extension if not exists "pgcrypto";

create table if not exists games (
  game_id text primary key,
  sport text not null,
  home_team text not null,
  away_team text not null,
  start_time timestamptz not null,
  venue text,
  status text default 'scheduled'
);
create index if not exists idx_games_start on games(start_time);

create table if not exists odds_history (
  id bigserial primary key,
  game_id text references games(game_id) on delete cascade,
  ts timestamptz not null default now(),
  book text not null,
  market text not null,
  selection text not null,
  price_american int not null,
  line numeric,
  unique(game_id, ts, book, market, selection)
);
create index if not exists idx_odds_game_ts on odds_history(game_id, ts);
create index if not exists idx_odds_market on odds_history(market, selection);

create table if not exists derived_signals (
  id bigserial primary key,
  game_id text references games(game_id) on delete cascade,
  ts timestamptz not null default now(),
  signals jsonb not null
);
create index if not exists idx_signals_game_ts on derived_signals(game_id, ts);

create table if not exists model_outputs (
  id bigserial primary key,
  game_id text references games(game_id) on delete cascade,
  ts timestamptz not null default now(),
  market text not null,
  selection text not null,
  model_version text not null,
  model_prob numeric not null check (model_prob > 0 and model_prob < 1),
  fair_american int not null,
  top_features jsonb
);
create index if not exists idx_model_game_ts on model_outputs(game_id, ts);

create table if not exists smart_picks (
  pick_id uuid primary key default gen_random_uuid(),
  game_id text references games(game_id) on delete cascade,
  created_at timestamptz not null default now(),
  market text not null,
  selection text not null,
  best_book text not null,
  price_american int not null,
  model_prob numeric not null,
  fair_american int not null,
  edge_ev numeric not null,
  kelly_fraction numeric not null,
  stake_units numeric not null,
  trap_score int not null,
  reasons jsonb not null,
  what_changes jsonb,
  narrative text,
  status text not null default 'open'
);
create index if not exists idx_smart_picks_game_created on smart_picks(game_id, created_at);

create table if not exists clv_log (
  id bigserial primary key,
  pick_id uuid references smart_picks(pick_id) on delete cascade,
  ts timestamptz not null default now(),
  price_american int not null,
  clv_cents int not null
);
create index if not exists idx_clv_pick_ts on clv_log(pick_id, ts);

create or replace view v_latest_odds as
select distinct on (game_id, book, market, selection)
  game_id, book, market, selection, price_american, line, ts
from odds_history
order by game_id, book, market, selection, ts desc;

create or replace view v_best_price as
with latest as (select * from v_latest_odds)
select game_id, market, selection,
       (array_agg(book order by case when price_american > 0 then -price_american else price_american end asc))[1] as best_book,
       (case when max(price_american) > 0
             then max(price_american)
             else (select price_american from latest l2
                   where l2.game_id = l.game_id
                     and l2.market = l.market
                     and l2.selection = l.selection
                   order by price_american asc limit 1)
        end) as best_price_american
from latest l
group by game_id, market, selection;

create or replace function get_candidate_picks()
returns table (
  game_id text,
  market text,
  selection text,
  best_book text,
  best_price_american int,
  model_prob numeric,
  fair_american int,
  market_opp_steam numeric,
  news_risk numeric,
  outlier_books_only boolean,
  schedule_spot_bad numeric,
  low_limits_best boolean,
  public_vs_handle_skew numeric,
  top_features jsonb,
  red_flags jsonb
) language sql stable as $$
  with latest_model as (
    select distinct on (game_id, market, selection)
      game_id, market, selection, model_prob, fair_american, top_features, ts
    from model_outputs
    order by game_id, market, selection, ts desc
  ),
  latest_signals as (
    select distinct on (game_id)
      game_id, signals
    from derived_signals
    order by game_id, ts desc
  )
  select m.game_id, m.market, m.selection,
         b.best_book, b.best_price_american,
         m.model_prob, m.fair_american,
         (s.signals->>'market_opp_steam')::numeric as market_opp_steam,
         (s.signals->>'news_risk')::numeric as news_risk,
         (s.signals->>'outlier_books_only')::boolean as outlier_books_only,
         (s.signals->>'schedule_spot_bad')::numeric as schedule_spot_bad,
         (s.signals->>'low_limits_best')::boolean as low_limits_best,
         (s.signals->>'public_vs_handle_skew')::numeric as public_vs_handle_skew,
         m.top_features,
         coalesce(s.signals->'red_flags', '[]'::jsonb) as red_flags
  from latest_model m
  join v_best_price b using (game_id, market, selection)
  left join latest_signals s on s.game_id = m.game_id
$$;

alter table games enable row level security;
alter table odds_history enable row level security;
alter table derived_signals enable row level security;
alter table model_outputs enable row level security;
alter table smart_picks enable row level security;
alter table clv_log enable row level security;

create policy if not exists "public_read_games" on games for select using (true);
create policy if not exists "public_read_views" on odds_history for select using (true);
create policy if not exists "public_read_signals" on derived_signals for select using (true);
create policy if not exists "public_read_model" on model_outputs for select using (true);
create policy if not exists "public_read_smart_picks" on smart_picks for select using (true);
create policy if not exists "public_read_clv" on clv_log for select using (true);

create policy if not exists "service_writes_odds" on odds_history for insert with check (auth.role() = 'service_role');
create policy if not exists "service_writes_games" on games for insert with check (auth.role() = 'service_role');
create policy if not exists "service_writes_signals" on derived_signals for insert with check (auth.role() = 'service_role');
create policy if not exists "service_writes_model" on model_outputs for insert with check (auth.role() = 'service_role');
create policy if not exists "service_writes_picks" on smart_picks for insert with check (auth.role() = 'service_role');
create policy if not exists "service_writes_clv" on clv_log for insert with check (auth.role() = 'service_role');


