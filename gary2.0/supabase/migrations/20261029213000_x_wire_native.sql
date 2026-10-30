-- TONIGHT ON X, drawn by the app (founder, Oct 29 2026: X's own embeds were "massive size wise", wore X's blue
-- dim theme, and lagged in and out). The app now draws each post itself in X's layout, so the function stores
-- what that needs: the person's picture and check, the post's clean text, and its first photo or video still.

alter table public.x_wire_accounts
  add column if not exists avatar_url text,
  add column if not exists verified_type text;

alter table public.x_wire_posts
  add column if not exists display_text text,
  add column if not exists media jsonb,
  add column if not exists replies integer not null default 0;

create or replace function public.get_x_wire(p_date date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select p.*, a.name, a.avatar_url, a.verified_type, a.followers,
           row_number() over (partition by p.username order by p.big_game desc, p.likes + 2 * p.reposts desc, p.posted_at desc) as per_person
    from public.x_wire_posts p
    join public.x_wire_accounts a on a.username = p.username and a.active
    where p.slate_date = p_date and p.display_text is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'username', username, 'name', name, 'avatar_url', avatar_url, 'verified_type', verified_type,
           'text', display_text, 'media', media, 'league', league, 'matchup', matchup, 'big_game', big_game,
           'posted_at', posted_at, 'likes', likes, 'reposts', reposts, 'replies', replies)
         order by big_game desc, followers desc, posted_at desc), '[]'::jsonb)
  from (select * from ranked where per_person <= 2
        order by big_game desc, followers desc, posted_at desc limit 6) top;
$$;
revoke all on function public.get_x_wire(date) from public;
grant execute on function public.get_x_wire(date) to anon, authenticated;

-- The founder's budget (Oct 29 2026: "this feature cant cost us more than ... 5 dollar a month or 9 max"): one
-- search per pass returns only the chosen people's posts that name tonight's teams, so nothing else is paid for,
-- and the function stops at 50 post reads a day and 1,500 a month ($7.50 at $0.005 a read). The newest post id
-- seen today carries between passes.
alter table public.x_wire_reads add column if not exists since_id text;
