-- One recap per pick. Keyed on (game_date, league, matchup), a doubleheader's
-- second game found the first game's row, read it as stale and overwrote it:
-- Sep 22 2026, the Rays' game-1 loss (Rays ML +116, 0-2) showed game 2's 6-1
-- story marked won. The pick text separates the two games.
begin;
alter table public.game_recaps drop constraint game_recaps_game_date_league_matchup_key;
alter table public.game_recaps add constraint game_recaps_game_date_league_matchup_pick_key
  unique (game_date, league, matchup, pick_text);
-- Row 1788 carries game 2's story and result; give it game 2's pick so the
-- grader writes game 1's own recap on its next pass.
update public.game_recaps set pick_text = 'Tampa Bay Rays ML +110'
  where id = 1788 and game_date = '2026-09-22' and pick_text = 'Rays ML +116' and result = 'won';
commit;
