-- The Wire content redesign (founder, Aug 5 2026): "result" recaps of
-- yesterday's games duplicated the headline cards and read a day stale by
-- evening. The feed's new lead kind is "moment" — the day in baseball:
-- multi-HR games, no-hitters, milestone lines, wild finals. "result" stays in
-- the constraint so historical rows remain valid; the generator no longer
-- writes it.
ALTER TABLE public.wire_items
  DROP CONSTRAINT IF EXISTS wire_items_kind_check;
ALTER TABLE public.wire_items
  ADD CONSTRAINT wire_items_kind_check
  CHECK (kind IN ('result', 'line_move', 'injury', 'voice', 'pace', 'moment'));
