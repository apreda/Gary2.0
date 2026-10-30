-- Tonight on X runs newest first (Oct 29 2026 bug check): ranked by reach, a live reaction from a smaller account
-- landed last and fell off the six; the slideshow is the night as it happens. Big games still lead, two posts a
-- person at most.
create or replace function public.get_x_wire(p_date date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select p.*, a.name, a.avatar_url, a.verified_type,
           row_number() over (partition by p.username order by p.big_game desc, p.posted_at desc) as per_person
    from public.x_wire_posts p
    join public.x_wire_accounts a on a.username = p.username and a.active
    where p.slate_date = p_date and p.display_text is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'username', username, 'name', name, 'avatar_url', avatar_url, 'verified_type', verified_type,
           'text', display_text, 'media', media, 'league', league, 'matchup', matchup, 'big_game', big_game,
           'posted_at', posted_at, 'likes', likes, 'reposts', reposts, 'replies', replies)
         order by big_game desc, posted_at desc), '[]'::jsonb)
  from (select * from ranked where per_person <= 2 order by big_game desc, posted_at desc limit 6) top;
$$;
revoke all on function public.get_x_wire(date) from public;
grant execute on function public.get_x_wire(date) to anon, authenticated;
