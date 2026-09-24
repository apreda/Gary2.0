-- The pick's lane on its graded result (Sep 24 2026). The app reads
-- prop_results directly and already decodes `lane`; without the column every
-- NFL anytime touchdown fell back to the old TD lane and left the props
-- record, though a touchdown Gary picks as a prop counts like any other
-- (founder, Sep 23 2026). Older rows stay null and keep the prop-type rule.
alter table public.prop_results add column if not exists lane text;
