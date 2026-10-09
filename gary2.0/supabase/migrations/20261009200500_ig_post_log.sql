-- Instagram auto-post log (founder GO, Oct 9 2026). One row per post the Mac job
-- (GaryMarketing/ig-free-pick/ig-post.mjs) publishes to @betwithgary.ai. The row is
-- claimed before the send so overlapping runs never post twice; a failed send deletes it.
create table if not exists public.ig_post_log (
  id bigserial primary key,
  post_date date not null,
  slot text not null,            -- ig_free_pick | ig_ncaaf | ig_mlb
  kind text not null,            -- feed | story
  candidate_id bigint,
  league text,
  style text,                    -- print | night
  media_id text,
  permalink text,
  caption text,
  error text,
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  unique (post_date, slot, kind)
);

alter table public.ig_post_log enable row level security;
-- No policies: only the service role (the Mac job) reads and writes it.
