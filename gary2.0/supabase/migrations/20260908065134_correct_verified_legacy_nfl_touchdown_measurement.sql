-- Derived measurement only. Official evidence, prior state and rollback value:
-- docs/launch/corrections/2026-09-08-etienne-actual.md in the repository root.
-- Look up the existing row by its complete public ticket identity; do not
-- assume generated IDs are portable across database environments.
DO $correction$
DECLARE
  audited public.prop_results%ROWTYPE;
BEGIN
  SELECT * INTO audited
  FROM public.prop_results
  WHERE game_date = DATE '2025-12-21'
    AND player_name = 'Travis Etienne Jr.'
    AND prop_type = 'Anytime TD'
    AND bet = 'over'
    AND line_value = 0.5
    AND matchup = 'Jacksonville Jaguars @ Denver Broncos'
  FOR UPDATE;

  -- A new/local database has no historical row to correct.
  IF NOT FOUND THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.prop_results
      WHERE game_date = DATE '2025-12-21'
        AND player_name = 'Travis Etienne Jr.'
        AND prop_type = 'Anytime TD' AND bet = 'over' AND line_value = 0.5
        AND matchup = 'Jacksonville Jaguars @ Denver Broncos') <> 1
    OR audited.result IS DISTINCT FROM 'won'
    OR audited.sport IS NOT NULL OR audited.game_id IS NOT NULL
    OR audited.actual_value IS NULL OR audited.actual_value NOT IN (0, 1)
  THEN
    RAISE EXCEPTION 'Verified Etienne measurement identity or prior state changed; no correction applied';
  END IF;

  IF audited.actual_value = 0 THEN
    UPDATE public.prop_results SET actual_value = 1 WHERE id = audited.id;
  END IF;
END
$correction$;
