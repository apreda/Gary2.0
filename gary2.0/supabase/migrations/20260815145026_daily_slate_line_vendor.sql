-- The slate writer has carried same-book line provenance since Aug 14. Keep
-- that value in schema so a line snapshot can be compared only with the same
-- sportsbook later, rather than failing the entire daily_slate upsert.
alter table public.daily_slate
  add column if not exists line_vendor text;

comment on column public.daily_slate.line_vendor is
  'Sportsbook/provider for this exact line snapshot; null when unavailable.';

comment on column public.daily_slate.league is
  'MLB | NFL | NCAAF | NBA (plus retained historical leagues).';
