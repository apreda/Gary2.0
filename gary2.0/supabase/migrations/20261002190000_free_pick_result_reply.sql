-- The morning result under each free pick post (founder, Oct 2 2026: "close the loop every morning ...
-- win or lose"). social-auto-post replies "Won." / "Lost." / "Push." to yesterday's post once it is graded.
alter table public.social_post_log
  add column if not exists result text,
  add column if not exists result_tweet_id text;
