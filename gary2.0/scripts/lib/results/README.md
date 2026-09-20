# Results runner ownership

`scripts/run-all-results.js` loads credentials, parses the existing arguments,
creates the engine and reports fatal failures. `index.js` composes one run;
importing it does not fetch providers, start settlement or write results.

| Module | Responsibility |
| --- | --- |
| `transport.js` | HTTP retry/deadline behavior and the existing shared BDL request gate |
| `provider.js` | Per-run game/box/stat caches, complete pagination and exact-game evidence |
| `grading.js` | Eastern date interpretation, measured stat extraction and shared grade delegation |
| `storage.js` | Schema capability checks, exact/legacy identity lookup, recap prop reads and write readback |
| `grounding.js` | Existing legacy search fallback through authorized subscription accounts |
| `games.js` | Game finality, published ticket identity, Winners stamps and result persistence |
| `props.js` | Prop finality, exact player/game evidence, grades and persistence |
| `enrichment.js` | Existing post-game rationale checks and recap writes |
| `runner.js` | Date ordering, full/football-only mode and existing nightly follow-up jobs |

Factories own caches and schema flags for one process run. They accept external
collaborators, so tests call the actual modules without importing the executable
CLI. The settlement rules still belong to the existing shared game/MLB helpers,
`resultsGradingReliability.js`, `nflPlaySettlement.js` and team matching service.
Do not add a parallel grading policy here.

The full run settles props before games so recaps can cite stored real prices.
Its default order remains today then yesterday in Eastern time. The manual
football mode runs yesterday first, attempts both dates after a failure, checks
persisted-result coverage and skips editorial/other-sport jobs. No scheduler or
workflow frequency changed in this extraction.

Focused verification:

```sh
npx vitest run tests/scripts/resultsEngine.test.js tests/scripts/resultsGameMatching.test.js tests/scripts/nflPropSettlement.test.js tests/scripts/mlbPropSettlement.test.js tests/scripts/nflPlaySettlementLoader.test.js tests/scripts/gameSettlementBoundaries.test.js tests/scripts/recapBoxWriters.test.js tests/scripts/mlbResultsMemory.test.js tests/scripts/resultsRunMode.test.js tests/scripts/resultsGradingReliability.test.js
```

The assembled-engine fixture exercises real Supabase request construction,
provider response parsing, both football game writers, a measured-zero prop,
readback failure and idempotent reruns. HTTP responses are local fixtures;
unexpected hosts/tables fail the test. Other suites retain missing/ambiguous
identity, incomplete pagination, finality and local/cloud grade parity cases.
Cache tests observe reuse/retry behavior instead of inspecting private maps.

For real delivery, run the full backend checks, push main and run
`scripts/production-truth.js`. Results invocations are fresh processes; changing
these modules does not require restarting the scheduler. Never run production
settlement merely to test a refactor.
