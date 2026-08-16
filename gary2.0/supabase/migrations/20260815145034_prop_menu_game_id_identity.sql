-- A matchup string is not a game identity: doubleheaders have the same teams
-- and date. Every existing production prop_menu row has a BDL game id, so make
-- that invariant explicit before replacing the matchup-based unique index.
alter table public.prop_menu
  alter column bdl_game_id set not null;

create unique index prop_menu_game_id_uniq
  on public.prop_menu (league, bdl_game_id);

drop index if exists public.prop_menu_game_uniq;
