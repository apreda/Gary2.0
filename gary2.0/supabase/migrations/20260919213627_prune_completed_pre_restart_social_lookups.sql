-- SET UNLOGGED preserves current rows. Remove the completed lookup entries
-- left by earlier server lifetimes so their reused request numbers cannot
-- collide before the next crash clears this now-transient table naturally.
-- Current requests, pending checks and durable publication history stay intact.
delete from gary_ops.social_requests
where created_at < pg_postmaster_start_time() and checked_at is not null;
