-- Optional structured payload for lanes whose cards need more than prose
-- (first user: beneficiary's player-swap rows — out player, injury, replacement).
-- Applied to the Gary project 2026-06-04 via MCP apply_migration.
ALTER TABLE public.insight_connections
  ADD COLUMN IF NOT EXISTS meta jsonb;
