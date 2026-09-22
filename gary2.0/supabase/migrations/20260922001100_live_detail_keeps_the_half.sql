-- Two writers share live_scores.detail for MLB: the cloud frame writes "INN 6"
-- every minute from BDL, which knows no half; the local poller patches
-- "TOP 6" / "BOT 6" / "MID 6" from the MLB linescore every two. The cloud kept
-- overwriting the richer value within a minute, so the app almost never saw
-- the half (founder, Sep 22 2026). Within the same inning the named half
-- wins; a new inning number from the cloud still goes through, so nothing
-- ever goes stale.
create or replace function gary_private.live_detail_keeps_the_half() returns trigger
language plpgsql as $$
begin
  if new.league = 'MLB' and new.status = 'live'
     and new.detail ~ '^INN [0-9]+$'
     and old.detail ~ '^(TOP|BOT|MID|END) [0-9]+$'
     and substring(old.detail from '[0-9]+$') = substring(new.detail from '[0-9]+$') then
    new.detail := old.detail;
  end if;
  return new;
end $$;
drop trigger if exists live_detail_keeps_the_half on public.live_scores;
create trigger live_detail_keeps_the_half before update on public.live_scores
  for each row execute function gary_private.live_detail_keeps_the_half();
