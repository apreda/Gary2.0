-- The application validates these types before publication. Enforce the same
-- JSON contract for every service-role write without rewriting applied RPCs.
ALTER TABLE public.fantasy_briefings
  ADD CONSTRAINT fantasy_briefings_payload_types_check CHECK (
    payload->'schema_version' IS NOT DISTINCT FROM '1'::jsonb
    AND payload->'coverage'->'complete' IS NOT DISTINCT FROM 'true'::jsonb
  );
