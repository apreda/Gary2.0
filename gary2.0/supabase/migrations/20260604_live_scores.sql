-- Live game scores for today's slate, refreshed by a 2-minute poller.
-- One row per (date, league, game) — upserted in place as games progress.
-- Applied to the Gary project 2026-06-04 via MCP apply_migration.
CREATE TABLE IF NOT EXISTS public.live_scores (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date date NOT NULL,
  league text NOT NULL,
  game_id text NOT NULL,
  away_abbr text,
  home_abbr text,
  away_score int,
  home_score int,
  status text NOT NULL DEFAULT 'scheduled',  -- scheduled | live | final
  detail text,                                -- "INN 7" / "Q3 4:12" / "64'" / null
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, league, game_id)
);

CREATE INDEX IF NOT EXISTS live_scores_date_idx ON public.live_scores (date);

ALTER TABLE public.live_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon can read live scores" ON public.live_scores;
CREATE POLICY "anon can read live scores"
  ON public.live_scores FOR SELECT TO anon USING (true);
