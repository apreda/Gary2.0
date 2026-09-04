-- Minimal production-shape schema for a disposable local PostgreSQL database.
create schema auth;
do $$begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end$$;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'$$;
grant usage on schema auth to anon,authenticated,service_role;
create table public.daily_picks(id uuid primary key default gen_random_uuid(),date text,picks jsonb);
create table public.weekly_nfl_picks(id uuid primary key default gen_random_uuid(),week_start date,created_at timestamptz default now(),picks jsonb);
create table public.prop_picks(id uuid primary key default gen_random_uuid(),date text,picks jsonb);
create table public.daily_slate(id bigint generated always as identity,date date,league text,bdl_game_id bigint,commence_time timestamptz,game_status text,kickoff_status text);
create table public.user_picks(id uuid default gen_random_uuid(),user_id uuid,decision text,outcome text,created_at timestamptz default now());
\ir ../../migrations/20260726_user_bets_tail_fade.sql
alter table public.user_bets add column gary_confidence numeric;
\ir ../../migrations/20260727_streak_game.sql
\ir ../../migrations/20260727_leaderboard_profiles.sql
\ir ../../migrations/20260810210000_user_flow_phase1.sql
\ir ../../migrations/20260810213000_profile_card.sql
grant select,insert,update,delete on public.user_bets to authenticated;
grant select on public.public_profiles,public.user_streaks to authenticated;
grant all on all tables in schema public to service_role;
\ir ../../migrations/20260904210547_complete_user_experience.sql

\ir ../../migrations/20260904212944_exact_public_unit_returns.sql
