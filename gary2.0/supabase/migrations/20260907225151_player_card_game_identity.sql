-- One exact-game pack per player, while preserving every historical and
-- NULL-game season/form row. PostgreSQL 15 NULLS NOT DISTINCT makes repeated
-- unassigned packs idempotent without inventing a placeholder game ID.
-- Cut over with the card writer's matching four-column ON CONFLICT target.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.player_insight_cards
  DROP CONSTRAINT player_insight_cards_date_league_player_id_key,
  ADD CONSTRAINT player_insight_cards_date_league_player_game_key
    UNIQUE NULLS NOT DISTINCT (date, league, player_id, game_id);

NOTIFY pgrst, 'reload schema';
COMMIT;
