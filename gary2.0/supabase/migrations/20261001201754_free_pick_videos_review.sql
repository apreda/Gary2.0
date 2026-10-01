-- A rendered video can wait for a look before it posts ('review'); the poster
-- posts only 'ready'. The pipeline's config decides which it writes.
alter table public.free_pick_videos drop constraint if exists free_pick_videos_status_check;
alter table public.free_pick_videos add constraint free_pick_videos_status_check
  check (status in ('rendering', 'review', 'ready', 'failed'));
