-- The Wire (betting-angle news items) + Market Pulse (league-wide daily market
-- results) for the Home page. Both written by service-role runners
-- (run-wire-items.js / run-market-pulse.js) and read by iOS with the anon key.
-- Applied to the Gary project 2026-06-05 via MCP apply_migration.

-- ─────────────────────────────────────────────────────────────────────────────
-- wire_items: per-day betting-angle news cards (results, line moves, injuries,
-- analyst voices, pace notes). Replaced per (date, league) on each run.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wire_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date date NOT NULL,
  league text,
  kind text NOT NULL CHECK (kind IN ('result','line_move','injury','voice','pace')),
  headline text NOT NULL,
  subline text,
  source_handle text,
  game text,
  relevance_score int,
  meta jsonb,
  generated_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wire_items_date_relevance_idx
  ON public.wire_items (date, relevance_score DESC);

ALTER TABLE public.wire_items ENABLE ROW LEVEL SECURITY;

-- iOS reads with the anon key; writes go through the service-role runner.
DROP POLICY IF EXISTS "anon can read wire items" ON public.wire_items;
CREATE POLICY "anon can read wire items"
  ON public.wire_items FOR SELECT TO anon USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- market_pulse: one row per (date, league) summarizing how the market behaved
-- yesterday — overs/unders record, favorites ML record, dogs flat-stake net.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.market_pulse (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date date NOT NULL,
  league text NOT NULL,
  overs_wins int NOT NULL DEFAULT 0,
  overs_losses int NOT NULL DEFAULT 0,
  overs_pushes int NOT NULL DEFAULT 0,
  fav_wins int NOT NULL DEFAULT 0,
  fav_losses int NOT NULL DEFAULT 0,
  dog_wins int NOT NULL DEFAULT 0,
  dog_losses int NOT NULL DEFAULT 0,
  dog_net_units numeric,
  games_counted int NOT NULL DEFAULT 0,
  meta jsonb,
  generated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, league)
);

CREATE INDEX IF NOT EXISTS market_pulse_date_idx
  ON public.market_pulse (date);

ALTER TABLE public.market_pulse ENABLE ROW LEVEL SECURITY;

-- iOS reads with the anon key; writes go through the service-role runner.
DROP POLICY IF EXISTS "anon can read market pulse" ON public.market_pulse;
CREATE POLICY "anon can read market pulse"
  ON public.market_pulse FOR SELECT TO anon USING (true);
