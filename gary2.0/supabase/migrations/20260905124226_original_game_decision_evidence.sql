-- Keep the exact decision inputs beside the original desk for queue recovery.
-- Existing rows stay null; historical evidence must never be reconstructed.
alter table public.pick_desks add column if not exists decision_evidence jsonb;
comment on column public.pick_desks.decision_evidence is
  'Original decision envelope: exact published ticket, accepted cases, source tool responses and pregame observation time. Service-role access only under existing table RLS.';
