-- The free pick video (founder GO, Oct 1 2026). The Mac records the app's own
-- Winners unveil of the day's free pick, renders the 16:9 cut and uploads it
-- to storage (bucket social-media, private); social-auto-post posts it to X
-- with one line of text (the game and the pick). Until a video is ready the
-- poster waits, and 25 minutes before the start it posts the line as text.
create table if not exists public.free_pick_videos (
  game_date date primary key,
  candidate_id bigint not null,
  status text not null check (status in ('rendering', 'ready', 'failed')),
  storage_path text,
  detail jsonb,
  updated_at timestamptz not null default now()
);
alter table public.free_pick_videos enable row level security;
revoke all on public.free_pick_videos from public, anon, authenticated;
grant all on public.free_pick_videos to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('social-media', 'social-media', false, 52428800, array['video/mp4', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;
