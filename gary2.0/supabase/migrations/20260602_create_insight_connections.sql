-- insight_connections: pre-computed betting "edges" that power the iOS "Today's Edges" hub.
-- Each row is one connection — a serif headline + bettor angle tying a stat/situation to a game.
-- Many rows per day per league; the iOS client reads them under the anon role and ranks by
-- relevance_score. Written server-side by the edge generation scripts (service role).

CREATE TABLE IF NOT EXISTS public.insight_connections (
  id               BIGSERIAL PRIMARY KEY,
  date             DATE NOT NULL,
  league           TEXT NOT NULL,
  -- category: heat_check | platoon_edge | ballpark_shift | regression_watch |
  --           beneficiary | rest_fatigue | owned | cooling_off
  category         TEXT NOT NULL,
  headline         TEXT,        -- serif one-liner
  detail           TEXT,        -- the bettor angle
  game             TEXT,        -- matchup, e.g. 'PADRES @ DODGERS'
  value            TEXT,        -- display token, e.g. '.380', '9-2', '5 HR', '+25%'
  tone             TEXT,        -- good | bad | neutral
  spark            JSONB,       -- nullable numeric array for the mini bar chart
  line_val         NUMERIC,     -- nullable raw numeric backing `value`
  relevance_score  NUMERIC,     -- 0-100 ranking score
  -- Linkage to source entities (all nullable — depends on category)
  player_id        TEXT,
  team_id          TEXT,
  game_id          TEXT,
  -- Provenance + bookkeeping
  generated_by     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS insight_connections_date_league_category_idx
  ON public.insight_connections (date, league, category);

CREATE INDEX IF NOT EXISTS insight_connections_date_relevance_idx
  ON public.insight_connections (date, relevance_score DESC);

COMMENT ON TABLE public.insight_connections IS
  'Pre-computed betting edges powering the iOS "Today''s Edges" hub. One row per connection.';
COMMENT ON COLUMN public.insight_connections.category IS
  'heat_check | platoon_edge | ballpark_shift | regression_watch | beneficiary | rest_fatigue | owned | cooling_off';
COMMENT ON COLUMN public.insight_connections.headline IS 'Serif one-liner shown on the edge card.';
COMMENT ON COLUMN public.insight_connections.detail IS 'The bettor angle / why it matters.';
COMMENT ON COLUMN public.insight_connections.value IS 'Display token, e.g. ''.380'', ''9-2'', ''5 HR'', ''+25%''.';
COMMENT ON COLUMN public.insight_connections.tone IS 'good | bad | neutral.';
COMMENT ON COLUMN public.insight_connections.spark IS 'Nullable numeric array backing the mini bar chart.';
COMMENT ON COLUMN public.insight_connections.relevance_score IS '0-100 ranking score for ordering edges.';

-- RLS: anon (and everyone) can SELECT; only the service role may write.
ALTER TABLE public.insight_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insight_connections read" ON public.insight_connections;
CREATE POLICY "insight_connections read"
  ON public.insight_connections FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "insight_connections service write" ON public.insight_connections;
CREATE POLICY "insight_connections service write"
  ON public.insight_connections FOR ALL
  USING (auth.role() = 'service_role');
