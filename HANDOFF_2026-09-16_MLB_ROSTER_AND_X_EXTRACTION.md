# September 16: anonymous MLB rationale and X extraction

**Later September 16 X direction:** Adam authorized normal primary writing from the full rationale, including condensation across paragraphs. [X_PRIMARY_WRITER](HANDOFF_2026-09-16_X_PRIMARY_WRITER.md) supersedes the pending-approval and verbatim-copy restrictions below. The Codex posting-failure automation was deleted at his request.

**Later same-day root-cause audit:** [PICK_DATA_ROOT_CAUSES](HANDOFF_2026-09-16_PICK_DATA_ROOT_CAUSES.md) records the additional authorized data repairs and current June stamp. The earlier statements below that only the safety boundary changed describe the first repair, not the final September 16 state.

Addendum to `HANDOFF_2026-09-16_CLAUDE_FABLE_5_1.md`. Adam supplied the full Giants ML +136 rationale and asked why the tweet could not extract two reasons and why the rationale did not name players.

## Proven causes

Game 5060044 / MLB gamePk 823004, Giants at Cardinals, September 16 at 17:15 UTC. The retained scheduler log is `gary2.0/logs/scheduler/2026-09-16---mlb---game-id-5060044.log`.

The stored rationale has multiple facts, but social-auto-post v115's whole-sentence classifier rejects the .880 OPS sentence because it contains interpretation (“reason to trust” / “offensive opportunity”). It also requires both selected sentences to be in the same supporting paragraph. The retained opposing-case exclusion disqualifies the final paragraph. Only the Cardinals starter's 5.53 ERA / 1.49 WHIP / 27 HR / 143.1 IP sentence survives. NO_SAFE_COPY therefore reflects an overly restrictive extraction contract, not a lack of evidence in the rationale or an Anthropic outage. The primary provider is never called when the eligible-pair list is empty.

The raw model response already used anonymous roles. No app or storage transformation removed names. The exact cached scout report named Matthew Liberatore, Anthony Molina and Bryce Eldridge in starter/lineup data, but its separate ROSTERS section said “Roster unavailable” for both teams. June's frozen PLAYER NAMES constraint permits names only from the roster section. That input/prompt conflict explains the generic labels; it is not evidence that those players were absent from the available data.

The odds adapter supplies team names without `home_team_data` / `away_team_data` IDs. June's scout reader calls the roster and recent-game APIs only if those IDs exist. It skipped both roster calls. Ball Don't Lie's team IDs (26/24) must not be used as MLBAM IDs (138/137).

## Implemented repair

`gary2.0/scripts/lib/mlbScoutInput.js` resolves exact team aliases against MLB's active official directory and verifies both named rosters before entering June. The runner passes the resulting MLB team objects into the unchanged engine. Unknown/ambiguous clubs, identical clubs, incomplete rosters and upstream errors surface before any model retry; no invented roster or alternate provider is substituted. Original game identity, timing and bookmaker data stay intact.

The official API readback returned 28 players for each club, including Liberatore for St. Louis and Molina/Eldridge for San Francisco. Two still-valid cached reports with missing rosters were moved out of the active cache, retaining originals and a receipt at `/Users/adam.preda/Library/Logs/Gary2.0/roster-cache-repair-2026-09-16/`. Older expired caches were not touched. No stored pick, rationale or result was rewritten or regenerated. New per-game child processes load the repaired runner; already running processes retain their earlier imports.

June prompts, constitution, decision rules, injury handling and known xERA quirks are unchanged. The existing 300-pick observation remains in force. Restoring IDs also restores June's already-existing roster/recent-game reads; it does not introduce a new decision strategy.

## X change still pending Adam's answer

An asynchronous question asks whether the primary writer may faithfully condense two reasons from anywhere in the rationale, preserving names, numbers, qualifiers and fact / pick / fact. The previously recorded requirement was whole verbatim sentences from one supporting paragraph. **No answer has arrived and no X writer change has been deployed in this pass.** Do not claim the Giants NO_SAFE_COPY incident is repaired by the roster fix.

The concrete replacement should send the full rationale to the existing primary writer once, ask for two concise supporting facts with exact source quotations, preserve three blocks and the bare pick, validate source attribution, numbers, qualifiers and length, and expose provider/validation failures. Preserve the counterargument regression, durable publication/dedup safeguards and scheduled audience policy. No fallback format/provider, silent retry or manual test tweet. A proposed condensed example from the supplied rationale (not posted):

> The Cardinals’ starter has a 5.53 ERA and 1.49 WHIP, with 27 home runs allowed in 143.1 IP.
>
> Giants ML
>
> The Giants’ second hitter has an .880 OPS against left-handed pitching in 118 AB.

Do not inject the verified player names into a source-only rewrite unless the approved contract also permits that separately attributed data. Future repaired scout reports should let Gary use the names himself.

## Verification

- Focused adapter / actual runner / frozen-June tests: 51 passed; MLB transport deduplication tests also passed.
- The first full backend run exposed nine failures in the isolated runner test harness because it lacked the new dependency. Updated that harness to execute the real adapter against fixture data, verified both IDs on every model attempt, and added a test that missing rosters prevent all brain calls. The full backend rerun passed: **379 files / 4,152 tests** (September 16, 11:44–11:46 AM Eastern).
- Live read-only adapter check: Cardinals 138 / Giants 137, 28 named players each.
- Production truth confirms the canonical local worker folder and deployed social-auto-post v115. Uncommitted source during verification plus the protected Firebase plist produce the expected dirty-tree warning. No edge source changed in this repair.


## Follow-up: required data must fail the pick (September 16, noon Eastern)

Adam explicitly clarified that missing required data must stop the pick process and be reported, rather than produce a completed pick with an incomplete rationale. The prior roster-ID repair was necessary but was not a sufficient end-to-end failure contract.

Fresh June reports already rejected absent nine-batter lineups / starters, but rosters were optional and cached reports bypassed that fresh-build check. The actual Giants incident had 9/9 lineups and both starters; its separate rosters were missing. This distinction is documented, not used to excuse publication.

The additional repair adds `src/services/mlbDataReadiness.js`. The exact scout report is checked before research/model setup and before a fresh report is cached; cached reports pass the same gate. Each club needs a named roster whose declared count matches its entries, nine distinct named hitters in order 1–9, and a named starter; every lineup player and starter must appear in the roster allowed by the prompt. The report must match the current teams and the runner must have exact game/start identity. Missing, placeholder, duplicate and inconsistent data fail with `required_data_unavailable` / `MLB_REQUIRED_DATA`, `retryModel: false`.

The runner also validates the actual `_context.scoutReport` attached by the orchestrator, overriding any model-supplied readiness claim. A receipt binds the report hash and named-player evidence to the exact game, teams and start time. New MLB publications require that receipt in both the runner and shared daily storage validation, and storage preserves it as `input_readiness`. Legacy readers remain readable. Outbox replay independently rejects and quarantines incomplete pregame MLB payloads before either writer runs. A data error records a durable incident and causes the runner to fail; another brain is not asked to work around missing input. Later scheduled attempts can succeed after the input is repaired.

This is a **founder-authorized safety-boundary exception to the June freeze**. Only `orchestratorMain.js` changes within the frozen folder: report checks and error classification. Its pin was deliberately updated to include those checks. No prompt, constitution, report builder, statistical formula, injury rule, model, xERA quirk or judgment stage changed. The full June stamp changes because the file changed; the observation cohort is not reset.

Durable local incidents are in `gary2.0/logs/data-readiness-failures/`, one per UTC date / exact game, retaining first/latest failure and attempt count. The existing `gary-posting-failures` heartbeat now checks those records in addition to X, with separate deduplication at `~/Library/Logs/Gary2.0/mlb-data-alert-state.json`. It remains read-only, quiet for unchanged incidents and on its existing five-minute cadence; no promise of instant alerts or operation while the Mac is unavailable. Recovery needs a later exact-game publication with a valid receipt. No duplicate automation was created.

The read-only production audit at roughly noon showed two already-published MLB picks: **Giants ML +136 / 5060044** and **Guardians ML -164 / 5060043**, both without the new receipt. Their retained original scout reports both show missing rosters. These are known pre-repair publications, not certified complete inputs. No picks, rationales, bets, outcomes or timestamps were rewritten, and no replacement pick or tweet was generated. A missing old receipt alone is not proof about all historical inputs; use retained reports for any wider incident audit. There were no active game-generation child processes at the deployment check, so no already-running child needed interruption.

Verification includes the real Giants report as a regression fixture: the original fails; an explicitly labeled offline replay with official same-day rosters passes and identifies Liberatore, Molina and Eldridge. Tests cover fresh/cached reports stopping before model setup, incomplete/duplicate lineups, missing/out-of-roster starters, wrong-game receipts, a completed model response with incomplete context, no model retry, no database call for an unverified pick, receipt persistence and blocked/quarantined outbox replay. Fixture incident writes use private temporary directories, not the production monitor directory. Full backend result and final source stamp are recorded below.

Final local verification: **381 backend files / 4,180 tests passed**. A subsequent MLB identifier-normalization hardening adds four cases; all 101 tests across the affected readiness/publication/storage/outbox suites pass after that last change. June safety-boundary stamp: **e65f6fe7149f**. Source prompts and statistical judgment pins remain unchanged. Production audit shows the canonical scheduler and Winners worker running, all edge timestamps current, no pending outbox files, and no active cached report containing “Roster unavailable.” The private Firebase plist remains the only intended local configuration exception after commit.
