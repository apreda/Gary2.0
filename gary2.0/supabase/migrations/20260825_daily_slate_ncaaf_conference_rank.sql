-- NCAAF navigation chrome (founder, Aug 25 2026): conference names + AP Top 25
-- ranks per side, stamped by dailySlateService for NCAAF rows only. Nullable
-- and additive — every other league stores NULLs and no reader is affected.
-- Applied to production 2026-08-25 via MCP (daily_slate_ncaaf_conference_rank_columns).
alter table public.daily_slate
  add column if not exists home_conference text,
  add column if not exists away_conference text,
  add column if not exists home_ranking integer,
  add column if not exists away_ranking integer;
