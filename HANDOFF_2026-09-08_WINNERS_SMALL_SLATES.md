# Requested Winners rules for small slates — September 8, 2026

Status: founder direction recorded for the NFL/Winners discussion. These
exceptions have NOT yet been implemented or deployed. This handoff does not
claim the existing admission code already follows them.

Adam's requested rules:

- When a day has only one NFL game, its pick goes to Winners automatically,
  regardless of whether the normal reviewer qualifies it.
- The same single-game automatic admission applies to MLB.
- For a single NCAAF game, automatic admission requires at least one ranked
  team or at least one team belonging to a “Big 5” conference. Otherwise the
  pick follows ordinary qualification.
- On a two-game day, one pick goes to Winners. Both appear only when both
  independently qualify.

Clarifications requested alongside the rationale, awaiting Adam's answer:

1. Does the two-game rule apply to NFL, MLB and NCAAF, with the same NCAAF
   ranked/conference condition on any guaranteed place, or only NFL and MLB?
2. Does “Big 5” mean ACC, Big Ten, Big 12, SEC and Pac-12, or the first four?

Do not interpret a preselected UI answer as submitted approval or preference.
The single-game NFL and MLB direction is explicit and does not depend on
those clarifications.

Implementation observations from read-only inspection:

- Count the complete league schedule for the Eastern calendar day, including
  earlier games, rather than the number of picks generated so far. Existing
  daily_slate fetches request full-day schedules, but there is no durable
  complete-fetch receipt; failed reads preserve old rows and replacement
  writes are not atomic. Automatic admission needs trustworthy slate scope.
- Preserve the exact public ticket and original review result. Record a
  policy admission separately; never fabricate a successful factual review.
- MLB's current qualified status means factual eligibility. Ordinary Winners
  admission additionally requires endorsement and Gary's comparative choice.
  Define the second pick's independent qualification consistently with that
  process when implementing the exception.
- Both ordinary and automatic release paths must obey the two-game rule.
  An automatic first admission must not accidentally allow a second pick just
  because the second alone qualifies.
- Admitted candidate rows are immutable. Review completion and the historical
  mirror require attention when admitting a candidate before review finishes.
- Existing NCAAF conference/ranking display metadata is fail-soft. Null rank
  does not prove unranked; conference names and dated poll evidence must be
  verified before they grant automatic eligibility.

The NFL test remains test-only: test_daily_picks row75, date2026-09-09, arm
nfl-opening-night-preflight-20260908-r6. It is Seattle -3.5 (-104), FanDuel.
Its exact 403-word rationale and both cases are in
/Users/adam.preda/Documents/ChatGPT/Gary/NFL_OPENING_NIGHT_TEST_2026-09-08.md.
Recording this policy does not promote that test pick to the public board.
