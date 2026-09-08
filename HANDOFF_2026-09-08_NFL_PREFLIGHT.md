# NFL opening-night preflight — September 8, 2026

Adam requested another bug check, a real NFL test pick saved in
`test_daily_picks`, and a readback of Gary's exact ticket and rationale before
the NFL strategy review. The verified opening game is New England at Seattle,
BDL game `1392216`, September 9 at 20:20 ET (`2026-09-10T00:20:00Z`).
Official schedule: https://www.nfl.com/schedules/2026/by-week/week-1.

## Bugs addressed

- NFL correction prompts now reach the existing model session. A token-limited
  answer cannot escape through the early JSON path or the final allowed turn;
  a pick without the required completed bilateral cases cannot ship.
- The Codex bridge requires an actual `turn.completed` receipt and preserves
  UTF-8 characters split across stdout chunks. Failure, abort and timeout
  handling still reject incomplete answers. Every POSIX invocation now owns
  its descendant process group, including calls without an explicit signal,
  so a timeout or parent shutdown cannot leave the native CLI running.
  No response-length cap was added.
- NFL injury labels retain the provider's status instead of calling every
  listed player OUT. Injuries match the correct team; fresh exact-player
  reports inform QB availability. Questionable/Doubtful remain uncertain and
  an entirely ruled-out QB depth chart remains unresolved.
- NFL recent form separates season and phase, includes dates, and preserves
  ties instead of reporting them as losses.
- The live preflight exposed provider rows claiming 17 games of 2026 team
  statistics before the season started. Both teams' values matched 2025.
  Current aggregates now require the team's own verified completed regular
  games and a compatible sample size. Invalid rows use explicitly fetched,
  labeled prior-season data. The same seeded-year issue was confirmed for
  Maye and Darnold's player aggregates. The verified per-team baseline now
  also feeds QB and key-player statistics, with actual 2026 roster/depth
  reads. Numbered receiver slots normalize before identity deduplication and
  display limits; return duties no longer duplicate offensive players. The
  formatted roster cache is versioned to prevent stale duplicate lists.
- Test runs bypass public-pick deduplication, support one explicit target date,
  preserve exact picks and arm labels, and verify the returned database
  snapshot. Bounded conditional append protects concurrent arms. Default
  execution-date behavior for existing experiments remains intact. Live
  `test_daily_picks_date_idx` is unique and the table has no custom triggers.

## Scope and isolation

NFL remains on its existing desk and bilateral spread-decision assignment,
using Astra as the primary brain. This bug check does not install MLB's staged
judgment or comparative Winners policy in NFL. Current rosters and injuries
must remain current even when statistical performance uses a prior season.
NBA's pinned prompts and the MLB judgment ledger remain unchanged.

The test CLI skips public daily/weekly pick publication, Winners admission,
public desk snapshots and pick-outbox replay. Normal shared market telemetry
can still record observed odds. Do not describe test mode as making no writes
outside the test table whatsoever.

The first preflight was intentionally stopped during scouting when the bad
2026 baseline was confirmed; Gary had not made a pick and no test pick was
stored. Its log is `/tmp/gary-nfl-preflight-20260908/run.log`. Its research
children were explicitly stopped. The corrected rerun uses a separate arm and
raw-response folder so incomplete first-attempt streams are not mistaken for
successful final receipts.

The second scouting attempt was also intentionally stopped before Gary's
decision when live roster readback revealed receiver duplication. The third
attempt reached follow-up research and exposed two further contradictions:
supplemental tools bypassed the corrected season baseline, and the injury
summarizer discarded NFL's injury groups. It was stopped before a completed
decision, with zero saved picks. Its log and raw streams remain under
`/tmp/gary-nfl-preflight-20260908/r3/`.

The corrected supplemental routes share `nflTeamBaseline.js` with the scout.
Mixed play-ledger/BDL responses retain both sources' actual statistical
vintages; special-teams responses retain that provenance too. Injury context
preserves dated status records, including reserve-list codes. Schedule context
uses Eastern dates. Provider QBR is labeled separately from passer rating.
The separate advanced-player endpoints returned no 2026 rows in the live
audit and truthfully reported unavailable data; they were not redesigned.

All 21 supplemental requests passed the live read-only replay. The fourth
attempt then exposed a separate assembled-scout cache bypass of `--nocache`:
it loaded the old report, including stale QBR and injury labels. It was stopped
before a completed decision and stored no pick. The cache now honors explicit
freshness and includes football source/market versions in its identity.
Both `--nocache` and `--fresh` bypass shared provider file caches and rebuild
the scout. The initial injury section retains Questionable/Doubtful labels
and report dates without calling them OUT or inventing established absences.

Attempt five confirmed the cache bypass and fresh provider reads, but a HOME
search returned a clarification request rather than research. The completed
response was incorrectly accepted as successful grounding. This run was
stopped before a pick; its raw input/output remain under
`/tmp/gary-nfl-preflight-20260908/r5/`. A narrow search-response guard now sends
that class of answer through the existing provider fallback. It inspects the
terminal completed answer while preserving the full valid research text.
Attempt six uses arm `nfl-opening-night-preflight-20260908-r6` and raw
input/output under `/tmp/gary-nfl-preflight-20260908/r6/`.
Play-ledger basis text now names each team's regular/postseason sample:
Seattle 20 games (17 regular, 3 postseason), New England 21 (17 regular, 4
postseason). These totals are separate from BDL's 17-game regular baseline.

R6 delivered all 50,151 scout characters exactly to Astra. The independent
receipt is `r6/independent-scout-audit.json`. Its six optional football deep
reads completed five lanes; `skill_players` hit the existing three-minute
Codex timeout, then the Anthropic fallback returned HTTP 400. A replay of that
single fallback request confirmed insufficient Anthropic account credits,
not a malformed request. Safe diagnostic receipt:
`r6/anthropic-skill-fallback-diagnostic.json`. The scout still contained both
teams' complete relevant skill-player depth, current changes and prior-season
player evidence, so the same pick continued without resampling. Funding the
backup account remains an external action. A subsequent diagnostic-only fix
names insufficient credits explicitly; it does not change the request or
silently substitute another analysis policy.

## Final verification

The complete backend run before the final search-response guard passed
**3,608 tests / 296 suites**, excluding native
`ios*.test.js` suites. Log:
`/tmp/gary-nfl-preflight-backend-final-20260908.log`.
The final search-response guard then passed **64 tests / 9 suites**, including
the exact observed non-answer, cached-answer rejection and provider fallback.
Its captured output is preserved in
`/tmp/gary-nfl-preflight-20260908/search-guard-tests-20260908.receipt.txt`
(saved from the tool result afterward, not a separately redirected raw log).
The insufficient-credit diagnostic then passed **47 tests / 4 suites**;
log: `/tmp/gary-nfl-preflight-20260908/anthropic-fallback-diagnostic-tests-20260908.log`.
Earlier runs exposed two fixture updates required by the new truthful labels
and one process-fixture readiness timeout; that process suite passed all 14
checks in isolation, and the final full run passed with two workers.
The bridge completion/cancellation/real descendant-cleanup checks also passed
27 tests in four suites before that backend run. No completed pick was
resampled during these investigations.

The full run also exposed a 600ms pregame setup race in the isolated MLB
postgame-ledger test fixture under machine load. The test now allows five
seconds and waits until the database's actual kickoff before its postgame
assertions; production SQL and clock guards are unchanged. The isolated
42-case suite and the complete backend suite both passed afterward.

The completed R6 chose **Seattle Seahawks -3.5 (-104)** after 23 follow-up
requests across 20 categories. Runtime was 823.4 seconds. The CLI saved exactly
one pick in `test_daily_picks`, row **75**, date **2026-09-09**, arm
`nfl-opening-night-preflight-20260908-r6`. The 2,798-character, 403-word rationale
and both completed cases match the raw model output exactly. Rationale SHA256:
`300e405735463b578118792502087f72cdd55d6aadb4e206be7ce8f011984fb0`.

Readback exposed two additional card bugs, both now fixed. The book resolver
still assumed football spreads went through book election and therefore
ignored spread receipts. It now matches the exact line and price and prefers
the original desk vendor; this ticket matches **FanDuel**. The separate table
formatter mixed NFL preseason/postseason games and counted ties as losses.
Its NFL row now uses exact-team current regular-season finals, keeps ties,
and carries season/game/as-of provenance. Before this opener the row is
`L5 Form · 2026 regular: N/A` for both teams.

The existing test record received only those metadata corrections through a
conditional timestamp update. Fresh provider verification confirmed zero
completed 2026 regular games at its original timestamp. The original pick,
rationale, cases, publication time and decision era `1f1696d7c6c7` were retained.
The final source includes subsequent diagnostic/card fixes, so its era differs
from this preserved test-era stamp; no completed pick was regenerated.
Original and repaired snapshots, raw-parity receipts and the conditional-write
receipt are under `/tmp/gary-nfl-preflight-20260908/`. Final independent receipt:
`r6/independent-after-repair-parity.json`. All ten readback checks passed;
the L5 row/text/stats mirror agree; NFL public daily, weekly and Winners
snapshots remained unchanged.

The final combined run of changed test suites passed **265 tests / 23 suites**,
including the card, storage, model-completion, fallback and real process-cleanup
checks. Log: `/tmp/gary-nfl-preflight-20260908/final-owned-regressions.log`.
The book fix separately passed 23/4; form fix passed 93/6. The full backend and
PostgreSQL receipts above precede these narrow follow-up fixes.

The user-facing full rationale and both cases are at
`/Users/adam.preda/Documents/ChatGPT/Gary/NFL_OPENING_NIGHT_TEST_2026-09-08.md`.
Production uses fresh pick children from the canonical local checkout; there
are no SQL migrations or edge-function changes in this patch. Verify the
independent Winners worker is idle before reloading it for the shared CLI
bridge, and use `scripts/production-truth.js` for the post-push runtime receipt.
Unrelated changes from parallel tasks and private local Firebase configuration
must not be included in the NFL commit or described as globally clean.
