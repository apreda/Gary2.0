-- today_board — TODAY's look-ahead snapshot, an exact copy of tomorrow_board's
-- schema (columns, types, the UNIQUE(date) constraint, indexes, defaults), keyed
-- on TODAY's ET slate day. Feeds the iOS Home "The Day Ahead" section (the same
-- Starters / Form / Run Profile / Weather + MLB/WC table the Tomorrow page uses).
--
-- Written by `node scripts/run-tomorrow-board.js --today` (which calls
-- writeTomorrowBoard(todayET, 'today_board')), scheduled in run-daily-insights.sh.
CREATE TABLE IF NOT EXISTS public.today_board (LIKE public.tomorrow_board INCLUDING ALL);

-- Match tomorrow_board's access: RLS on, anon/authenticated may read.
ALTER TABLE public.today_board ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "today_board anon read" ON public.today_board;
CREATE POLICY "today_board anon read" ON public.today_board
  FOR SELECT TO anon, authenticated USING (true);
