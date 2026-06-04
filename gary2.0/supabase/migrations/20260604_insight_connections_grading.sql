-- Edge grading: next-morning pass marks each insight_connections row with how
-- the claim played out. result: 'hit' | 'miss' | 'push' (NULL = ungraded or
-- ungradeable). result_note carries the grader's evidence one-liner.
-- Applied to the Gary project 2026-06-04 via MCP apply_migration.
ALTER TABLE public.insight_connections
  ADD COLUMN IF NOT EXISTS result text CHECK (result IN ('hit', 'miss', 'push')),
  ADD COLUMN IF NOT EXISTS result_note text,
  ADD COLUMN IF NOT EXISTS graded_at timestamptz;

CREATE INDEX IF NOT EXISTS insight_connections_date_result_idx
  ON public.insight_connections (date, result);
