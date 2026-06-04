-- Per-player betting breakdown packs for the Hub's "full breakdown" view.
-- One row per (date, player) for players surfaced in that day's hub edges.
-- payload is the full render-ready pack (splits, pitch matchup, BvP, xstats…).
-- Applied to the Gary project 2026-06-04 via MCP apply_migration.
CREATE TABLE IF NOT EXISTS public.player_insight_cards (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date date NOT NULL,
  league text NOT NULL,
  player_id text NOT NULL,
  player_name text,
  team_abbr text,
  game_id text,
  payload jsonb NOT NULL,
  generated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, player_id)
);

CREATE INDEX IF NOT EXISTS player_insight_cards_date_player_idx
  ON public.player_insight_cards (date, player_id);

ALTER TABLE public.player_insight_cards ENABLE ROW LEVEL SECURITY;

-- iOS reads with the anon key; writes go through the service-role runner.
DROP POLICY IF EXISTS "anon can read player insight cards" ON public.player_insight_cards;
CREATE POLICY "anon can read player insight cards"
  ON public.player_insight_cards FOR SELECT TO anon USING (true);
