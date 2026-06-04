-- Live MLB game state for the on-card base diamond + outs dots.
-- outs: 0-2 during play (3 transiently at inning change); null for non-live / non-MLB.
-- bases: 3-char occupancy string for [first, second, third], e.g. "101" = runners on 1st & 3rd.
ALTER TABLE live_scores ADD COLUMN IF NOT EXISTS outs SMALLINT;
ALTER TABLE live_scores ADD COLUMN IF NOT EXISTS bases TEXT;
