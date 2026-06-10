-- night_highlights: three new categories — 'gem' (dominant starts: 7+ IP with
-- <=1 ER, or 10+ K), 'rbi_night' (3+ RBI), 'sb_night' (2+ SB). Built by
-- src/services/nightHighlights.js.

ALTER TABLE public.night_highlights
  DROP CONSTRAINT night_highlights_category_check;

ALTER TABLE public.night_highlights
  ADD CONSTRAINT night_highlights_category_check
  CHECK (category IN ('hr', 'multi_hit', 'k_show', 'gem', 'rbi_night', 'sb_night'));

COMMENT ON COLUMN public.night_highlights.category IS
  'hr | multi_hit | k_show | gem | rbi_night | sb_night';
