-- Keep outcome realization separate from decision quality. Existing hindsight
-- autopsies remain historical, with no fabricated v2 assessment or backfill.
alter table public.pick_autopsies
  add column if not exists review_version text,
  add column if not exists pregame_evidence jsonb,
  add column if not exists decision_review jsonb,
  add column if not exists outcome_review jsonb;

-- The notebook's exact input may differ from the public pick's desk (the
-- notebook itself, or a researcher retry). Preserve it at decision time.
alter table public.diary_picks
  add column if not exists pregame_evidence jsonb;

comment on column public.pick_autopsies.decision_review is
  'Pregame evidence assessment; not inferred from whether the ticket won. Unknown when unsupported.';
comment on column public.pick_autopsies.outcome_review is
  'Postgame claim realization and possible variance; not a grade of the original decision.';
comment on column public.diary_picks.pregame_evidence is
  'Original desk, research briefing, notebook and card for this separate experiment; never refreshed with postgame data.';
