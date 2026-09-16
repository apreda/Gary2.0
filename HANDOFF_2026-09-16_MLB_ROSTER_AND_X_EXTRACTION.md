# September 16: anonymous MLB rationale and X extraction

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
