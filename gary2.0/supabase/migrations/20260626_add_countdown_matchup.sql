-- countdown_matchup — the opening game(s) of the day, named (e.g. "NYY @ BOS"),
-- so the Tomorrow/Today countdown hero shows WHICH game(s) kick off (founder).
-- Added to both boards (today_board was created LIKE tomorrow_board before this
-- column existed). Written by tomorrowService.writeTomorrowBoard.
ALTER TABLE public.tomorrow_board ADD COLUMN IF NOT EXISTS countdown_matchup text;
ALTER TABLE public.today_board    ADD COLUMN IF NOT EXISTS countdown_matchup text;
