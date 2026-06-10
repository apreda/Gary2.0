-- Slide bullets: 2-4 short stat lines from the game with the betting lens
-- where a real price is in evidence (e.g. "Matt Olson 2 HR (+340 to homer)").
-- Written by the same Flash call that writes headline/recap.
ALTER TABLE public.game_recaps
  ADD COLUMN IF NOT EXISTS bullets JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.game_recaps.bullets IS
  'JSON array of 2-4 short stat bullets (<=45 chars each) from the game, betting lens only where a real price was in the evidence pack.';
