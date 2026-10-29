-- TONIGHT ON X (founder, Oct 29 2026): the Wire under Home's board becomes a slow slideshow of X's own embeds,
-- real people's takes on tonight's games ("the reaction from the influencers plus the talking heads on TV, but no
-- ESPN, no companies"). The x-wire function reads the chosen accounts' new posts with Gary's X keys, keeps the
-- ones about the slate's games, and the app embeds them. Reads are paid per post, so the function keeps a daily
-- count and stops at its cap.

create table if not exists public.x_wire_accounts (
  username text primary key,
  user_id text unique,
  name text,
  followers integer not null default 0,
  description text,
  active boolean not null default true,
  -- The newest post already read, so each pass pays only for new posts.
  since_id text,
  resolved_at timestamptz,
  added_at timestamptz not null default now()
);

create table if not exists public.x_wire_posts (
  id text primary key,
  username text not null references public.x_wire_accounts(username) on delete cascade,
  posted_at timestamptz not null,
  slate_date date not null,
  league text,
  matchup text,
  big_game boolean not null default false,
  likes integer not null default 0,
  reposts integer not null default 0,
  text text not null,
  fetched_at timestamptz not null default now()
);
create index if not exists x_wire_posts_slate on public.x_wire_posts (slate_date, big_game desc, posted_at desc);

create table if not exists public.x_wire_reads (
  day date primary key,
  posts integer not null default 0,
  users integer not null default 0,
  passes integer not null default 0
);

alter table public.x_wire_accounts enable row level security;
alter table public.x_wire_posts enable row level security;
alter table public.x_wire_reads enable row level security;
-- Only the function (service role) touches these; readers go through get_x_wire.

-- The slideshow for a slate day: big games first, then the reach of the person and the post's pull, newest
-- breaking ties; two posts per person at most, six in all.
create or replace function public.get_x_wire(p_date date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select p.id, p.username, a.name, p.league, p.matchup, p.big_game, p.posted_at,
           row_number() over (partition by p.username order by p.big_game desc, p.likes + 2 * p.reposts desc, p.posted_at desc) as per_person,
           a.followers
    from public.x_wire_posts p
    join public.x_wire_accounts a on a.username = p.username and a.active
    where p.slate_date = p_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'username', username, 'name', name, 'league', league, 'matchup', matchup,
           'big_game', big_game, 'posted_at', posted_at)
         order by big_game desc, followers desc, posted_at desc), '[]'::jsonb)
  from (select * from ranked where per_person <= 2
        order by big_game desc, followers desc, posted_at desc limit 6) top;
$$;
revoke all on function public.get_x_wire(date) from public;
grant execute on function public.get_x_wire(date) to anon, authenticated;

-- Every 20 minutes; the function itself decides whether the slate day is live and stops at its daily cap.
select cron.unschedule('x-wire-20min') where exists (select 1 from cron.job where jobname = 'x-wire-20min');
select cron.schedule('x-wire-20min', '*/20 * * * *', $cron$
    select net.http_post(
      url := 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/x-wire',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
        (select 'Bearer ' || decrypted_secret from vault.decrypted_secrets where name = 'GARY_CRON_SERVICE_ROLE_KEY')),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
$cron$);
