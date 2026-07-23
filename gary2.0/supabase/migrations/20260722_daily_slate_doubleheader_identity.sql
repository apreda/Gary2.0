-- Doubleheader identity for daily_slate (Jul 22 2026).
--
-- The unique key was (date, league, away_team, home_team) — a same-matchup
-- doubleheader physically could not fit, so the writer kept only the earliest
-- kickoff (the 2026-06-24 "3 doubleheaders" outage patch). That collapse is
-- how game 2's starter (Max Fried, PIT @ NYY nightcap) ended up rendered on
-- game 1's page: downstream surfaces had no second game to attach him to.
--
-- One game = one row: commence_time joins the key, and bdl_game_id gives every
-- reader (iOS game pages, insight attachment) the game's true identity.

ALTER TABLE public.daily_slate
  DROP CONSTRAINT IF EXISTS daily_slate_date_league_away_team_home_team_key;

ALTER TABLE public.daily_slate
  ADD COLUMN IF NOT EXISTS bdl_game_id BIGINT;

ALTER TABLE public.daily_slate
  ADD CONSTRAINT daily_slate_game_key
  UNIQUE (date, league, away_team, home_team, commence_time);

COMMENT ON COLUMN public.daily_slate.bdl_game_id IS
  'BallDontLie game id — the game''s identity; disambiguates doubleheaders.';
