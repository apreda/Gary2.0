# Hub judgment v1

September 8, 2026. This contract adds `meta.judgment` to an existing
`insight_connections` row. Every original field, source statistic, rationale,
metadata sibling, identity and grade remains unchanged. A judgment is an
interpretation for understanding a game; it is not a new betting ticket and
must not inherit a source signal's grade as a grade of the interpretation.

## Published JSON

```json
{
  "schema_version": 1,
  "writer_version": "hub-judgment-v1-2026-09-08-r3",
  "status": "ready",
  "date": "YYYY-MM-DD",
  "league": "mlb",
  "game_id": "exact provider game ID",
  "primary_source_key": "category|game_id|player_id-or-empty|team_id-or-empty",
  "take": "Gary's judgment, up to 150 characters",
  "explanation": "Short connection, up to 650 characters",
  "full_case": "Complete argument, up to 4000 characters",
  "counterargument": "Strongest competing case, up to 700 characters",
  "watch_for": "Observable next check, up to 450 characters",
  "critical_condition": null,
  "what_changed": null,
  "prominence": "standard",
  "horizon": "pregame",
  "as_of": "ISO datetime of the latest successful context check",
  "generated_at": "ISO datetime when Gary wrote this argument",
  "valid_until": "ISO datetime bounded by first pitch/kickoff",
  "input_fingerprint": "SHA-256 of the substantive input",
  "supporting_evidence_ids": ["source_stablehash", "current_context"],
  "counter_evidence_ids": [],
  "supersedes_source_keys": ["category|game_id|player_id-or-empty|team_id-or-empty"],
  "related_subject_ids": ["player:exact-id", "team:exact-id"],
  "evidence": [],
  "evidence_state": []
}
```

`critical_condition` is null or a string up to 200 characters. `what_changed`
is null or a string up to 500 characters, supported by a measured difference
from the prior input snapshot. `prominence` is `standard` or `major`.
`horizon` is `pregame` or `next_game`; this initial game synthesis does not
invent weekly opportunities. MLB Fantasy retains its separate supported
roster/scoring/horizon contract.

Each evidence object has string `id`, `label`, `summary`, `source`, `as_of`
and `game_id`; optional string/null `source_key`, `source_updated_at`,
`player_id`, `team_id`, `category`; and a JSON `facts` object. Source IDs
are stable hashes of exact source keys. `current_context` carries both
teams' actual checked lineup/pitcher context. `change_…` evidence explicitly
compares a prior published observation with the current observation.

At least two distinct supporting evidence IDs are required. All support and
counterargument IDs must resolve within `evidence`, the selected primary
source must be cited, and supplied current game context must be cited.
Evidence need not be visible until the reader opens the full case.
Source evidence declares `primary_eligible`: ordinary story rows can anchor
the judgment; official practice reports remain citeable support while
retaining their dedicated module. Fantasy and receipt modules are excluded.
The model sees short, game-local citation aliases (`e1`, `e2`, etc.). They
resolve strictly against that game's supplied evidence; stored IDs, source
keys and native citations remain canonical. Unknown or duplicated aliases
still fail validation. A documented parenthesized park games count is
prepared as a measured count. Legacy park innings retain their explicit
rounded-decimal convention; unsupplied notation conversions are rejected.

`evidence_state` holds `{source_key, fingerprint, summary}` records for the
complete input pool, including uncited observations. It supports actual
change detection without mistaking an uncited observation for a newly
arrived fact. It is operational metadata, not another UI section.

## Context, identity and freshness

Every judgment requires exact date/league/game identity and a known future
start. Date-only schedules, unresolved identities, begun/final/interrupted
games and tomorrow's source rows cannot acquire a current pregame judgment.
Names never substitute for IDs. A new selected anchor explicitly supersedes
the previous one; invalidations are returned even when the previous source
row is absent from the new pool or excluded from display caps.

Source observation `as_of` retains its original collection/creation time.
A metadata patch does not refresh that observation. Source `computed_detail`
and structured measurements can support a judgment; old generated
`detail`, `read`, `verdict` or `meta.evidence` cannot serve as factual proof.

Current MLB context is collected independently of surfaced highlights:
both teams' posted/partial/unposted orders, probable pitchers and exact
players' regular-season baselines. The collector does not substitute
projected lineups or call a probable starter confirmed. Baseline statistics
are labeled as season measurements. The check timestamp is not presented as
the provider's last update time. Any mandatory transport failure marks the
context incomplete and prevents renewal/new synthesis.

Season baselines retain raw measurements and add deterministic
`display_measurements` using conventional precision. These prepared values
are themselves cited evidence; validation does not authorize arbitrary
numeric rounding. Pitching summaries include both appearances and starts
so a mixed-role historical sample is not silently presented as starter-only.

Fingerprinting is independent of source-row order and collection clocks,
but includes actual lineup/pitcher identities, measurements and provider
update fields. A complete unchanged context can reuse a still-valid
argument without another model call: `as_of` and the checked validity window
advance, while `generated_at` remains the original generation time and each
source observation retains its own time. Validity is at most six hours after
the successful context check and always ends by first pitch/kickoff.

For non-MLB availability-sensitive observations (injury/practice reports,
roster quarterback assignments and beneficiaries), validity also ends six
hours after the original successful collector read. The generator records
`source_collected_at` at that actual collector boundary. Stored-row replay
uses that original timestamp or immutable row creation time, never generic
metadata update time or its new schedule-check time. Missing/future/expired
observation clocks make context incomplete and withdraw the current take;
they cannot renew it or generate another claim from the same stale report.
The original argument and factual row remain preserved. Derived eligibility
descriptors and collection clocks do not constitute changed evidence.

MLB matchup-history evidence must carry verified `meta.season_type: regular`.
Legacy rows without that provenance are not reinterpreted as regular-season
results; those older rows may include spring training and cannot support
new judgments until an actual scoped collector read replaces them.

Changed/failed context or a re-anchored take returns an explicit invalidation
with status `context_changed`, `context_unavailable` or `superseded`.
It preserves the earlier case/evidence for historical inspection but sets
`valid_until` to the check time. Clients must never display an invalidated
judgment as the current take, nor suppress original research on its behalf.
An invalid/expired judgment leaves the original factual source available.

## Runtime integration

`generateInsightConnections` resolves exact source identities, then calls
optional `options.synthesizeJudgments({date,league,rows,games,bdl,asOf,
collectorFailures})` with the complete raw pool before display caps.
The callback composes `collectHubJudgmentContext` and
`synthesizeHubJudgments(args, options)`. Generation uses the existing
`generateSolText` provider/model seam. It adds no app-open model call.

Synthesis runs at most four concurrent requests with up to two games per
batch, one correction attempt, a 160 KB prompt bound and a four-minute
deadline. Context collection has a 90-second deadline and at most three
concurrent lineup requests; statistics use bounded exact-player chunks and
the existing paginated provider adapter. Oversized/incomplete evidence is
not silently truncated into a confident take.

Synthesis returns `{rows,failures,skipped,invalidations,diagnostics}`. Each
identifiable game is validated independently, so a bad sibling cannot
discard an accepted case. One repair covers only the failed games;
repairs join the end of the shared queue so every initial game batch is
dispatched before a repair can consume a worker. This prevents early
validation failures from starving later games inside the unchanged run
deadline. No additional model/provider or unbounded retry is introduced.
intentional omissions in valid JSON count as abstention. Malformed root
JSON never counts as abstention. Diagnostics record game IDs, elapsed time
and exact validation failures before repair, including errors if the repair
subsequently times out. The generator
returns normal `connections`, plus `judgmentUpdates`,
`judgmentInvalidations` and `judgmentFailures` outside display caps.
Ready anchors are retained ahead of ordinary category/floor filtering.
The publisher owns atomic, identity-scoped metadata merge and monotonic
check times; it must not overwrite source prose or unrelated metadata.

Fixture validation covers exact identities, doubleheaders, full-case
preservation, missing data, stale clocks, source grounding, changes,
uncited numbers, expiry, invalidation, re-anchoring, cap placement and
cancellation. Real model output against current source evidence still
requires editorial acceptance; structural validation is not proof that
Gary's interpretation is substantively sound.
