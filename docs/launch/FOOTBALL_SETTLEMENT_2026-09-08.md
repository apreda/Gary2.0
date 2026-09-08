# Football settlement repair — September 8, 2026

NFL and NCAAF settlement now requires complete, exact-game evidence. Missing measurements no longer become zero, and missing players no longer become an inferred DNP/push. The NFL lookup honors stored player IDs and rejects ambiguous names. Complete games can settle independently when another game’s provider page fails.

For supported missing NFL touchdown, longest-completion and interception measurements, the grader fetches complete exact-game plays once per game in the settlement pass. It verifies final game/team/player identity, unique rows, a plausible unique terminal period, scoring transitions and per-passer completion/attempt/yard evidence. Failed fetches are memoized within that pass and retried on the next pass. The five-page, 120-second budget includes the shared rate-gate wait; each request has a maximum 20-second transport budget. Existing measured values do not open this fallback.

The preserved actual fixture contains all 166 plays, 88 player stat rows and two team stat rows for provider game 1393562. It was obtained with five bounded read-only provider requests and reduced to public sports evidence. The production loader fetches plays and checks the complete player box; the optional team totals provide an additional fixture corroboration and are not a new mandatory provider request. The replay reproduces four touchdown scorers, all six quarterback longest completions, and five zero-interception passers plus the one actual interception. The catch/fumble completion uses an exact full-name/structured-role match and independent count/yard reconciliation; initials and receiving maxima are not substitutes.

Independent review found four issues before source freeze: uncertainty present only in short text, an implausible terminal period, a rate-gate wait outside the deadline, and contradictory incompletion-team identity in the interception fallback. Each is repaired with executable regressions. The final focused integrated set is 301 tests across eight files; the independent reviewer separately passes 143 tests across three files. Full-suite evidence is recorded in the current release ledger.

## Explicit evidence limits

- Unverified return-touchdown, safety or conversion play shapes leave the derived scoring ledger unavailable. Missing/null categories are not silently treated as measured zeroes.
- Ambiguous completions and lateral plays require verified attribution; a teammate’s receiving maximum is not the passer’s longest completion.
- No-completion games do not establish a sportsbook’s longest-completion settlement rule.
- A complete stats box omits some real participants. No authoritative separate DNP source is implemented here, so absent players remain pending.
- The actual replay validates these observed provider shapes, not every future provider response.

## Historical audit

All 93 stored NFL game grades reproduce. Thirty-four 2026 preseason rows match retained original tickets and saved scores and remain excluded from public records. Forty-six older rows reproduce from saved numeric evidence. Thirteen sparse playoff rows reproduce against official NFL round results. Only the 34 have recoverable exact original tickets; the older ticket provenance remains limited.

Of 243 legacy player-attributed NFL prop results, 231 match unique retained originals and reproduce against saved actuals. This does not independently verify every saved measurement against a provider. The one separately verified Etienne actual-value correction is documented in [its evidence record](corrections/2026-09-08-etienne-actual.md); the original pick and win grade were preserved.

## Runtime and verification boundary

The local live-finalization and daily jobs launch fresh `run-all-results.js` children from the canonical checkout. These source changes do not alter an edge function, pick generation, model choice, prediction rationale or immutable ticket. The cloud prop grader remains MLB-only. No production grading run or customer notification was triggered as QA. Deployment/process evidence and full final test counts belong to [the release ledger](READINESS_2026-09-07.md).

Provider references: [NFL stats and play documentation](https://nfl.balldontlie.io/), [OpenAPI contract](https://www.balldontlie.io/openapi/nfl.yml), [official NFL statistical guide](https://www.nflgsis.com/gsis/documentation/stadiumguides/guide_for_statisticians.pdf). Actual sanitized fixture: `gary2.0/tests/fixtures/nfl/bdl-game-1393562-settlement.json`. Detailed audit/review receipts are retained under the launch workspace’s `launch-readiness/` directory.
