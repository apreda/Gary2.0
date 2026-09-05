# Three sequential sports-stat repair passes — September 5, 2026

Founder instruction: “find and fix them [then] repeat this twice.” Work performed directly on production main in `/Users/adam.preda/Desktop/Gary2.0/gary2.0`. This follows the earlier college-menu/original-evidence/no-market-football repair in `HANDOFF_2026-09-05_PICK_EVIDENCE_REPAIR.md`.

## Pass 1 — menu and formatter contracts

- NFL's implemented `PLAYER_GAME_LOGS` factor was missing from its advertised menu; added it.
- NBA advertised `PERIMETER_DEFENSE` without its documented alias; it now resolves to `THREE_PT_DEFENSE`.
- NFL `SPECIAL_TEAMS` was being formatted as hockey power-play/penalty-kill percentages. Football payloads now preserve the actual kicking/return fields.
- Quarter/half scoring responses could return only the scope heading and discard their nested scores. The formatter retains scores, zero values, games analyzed, allowed scoring, and source scope.
- Nested football player/record facts could become `[object Object]`; complete structured results now survive formatting.
- MLB's readable response strings lost accompanying source, prior-season, coverage, and uncertainty fields. Those fields now accompany the original response text.

Verification: initial focused 18 tests in four files passed.

## Pass 2 — player logs and league identity

Replaced the duplicated Gary/research-assistant player-log implementations with `src/services/agentic/tools/playerGameLogTool.js`.

- Gary's generic college branch always returned empty logs. It now calls the existing NCAAF dated player-game endpoint and applies the existing college season/player/date/duplicate/conflict checks.
- The research assistant sent NCAAF player IDs to the NFL endpoint. Both callers now derive the league from the enclosing matchup rather than the model's `args.sport`.
- NFL logs went through a basketball PTS/REB/AST formatter. Football passing/rushing/receiving fields and dates now reach the model.
- Last-name fallback could select an entirely different player; shared-city-prefix matching could resolve ambiguous identities incorrectly. Require a full normalized identity and use complete matchup team names to resolve duplicate names; otherwise return unavailable.
- MLB relief appearances and walk-only games were discarded by the starter/batter summarizer. Preserve dated game rows, including both batting and pitching rows for a two-way player's selected game.
- Honor the requested game count, bounded to 1–15, and retain sample size, dates, source, explicit research-season labels, and missing values.
- Empty logs are unavailable evidence, rather than “available” research or zero basketball production. Research provider calls retain their cancellation wrapper.
- Removed retired NHL/NCAAB choices from this tool's supported-league enum and removed obsolete player-log summarizers after all consumers moved.

Verification: initial focused 19 tests passed. Live read-only provider calls returned three dated 2025 NFL Josh Allen games and three dated 2026 MLB Edwin Diaz relief games. Arch Manning returned no 2026 rows, correctly reported as unavailable; an explicit 2025 request returned three college games dated December 31, November 29, and November 22, with their actual college stat fields and season label. There is no silent prior-season substitution.

## Pass 3 — market, zeros, and requests for both teams

- MLB could cascade through models without a valid priced ticket. Both orchestration entry points now use the existing ticket menu/house limit to return `market_unavailable` before scouting or model work. Existing runner retry policy stops the model cascade and leaves a later scheduled data attempt possible.
- Ticket menus accepted zero, fractional, boolean, or whitespace American odds. Require integer prices of at least 100 in absolute value; keep actual zero-point spreads legal.
- NBA numeric fallback aliases replaced real zero observations with alternate fields or N/A. Numeric aliases now preserve zero; missing home/road records display N/A rather than undefined.
- Two player-stat calls for different teams but the same `stat_type` were treated as duplicates. Deduplicate complete request arguments for player/team tools while retaining token-level deduplication for matchup-wide `fetch_stats`.
- Unavailable requests no longer populate the already-gathered set, and one player's log request no longer suppresses an entire team-level player-log factor.
- College full player names matched neither first-name-only nor last-name-only fields. Match the full name. The resulting player payload previously rendered the player's name as Unknown and discarded most fields; NFL/NCAAF specialized player responses now retain the full named evidence and sample metadata.
- The research stat formatter now receives the enclosing sport, so its generic NFL/MLB token responses use the repaired formatting too.

Verification: an actual agent-loop regression requests offense for two different college teams in one batch and verifies both complete named responses survive into the original decision envelope. Other regressions cover wrong model-supplied league, preflight skipping all model/scout work, a later priced attempt, zero stats, relievers, identity ambiguity, and cancellation.

## Final verification and production state

- `npm run verify` exited 0: 1,950 backend tests across 226 files; 168 edge tests; 313 web tests across 44 files; Next route generation and TypeScript passed. The first backend run exposed three MLB research-fallback fixtures without market data; valid odds were added so they still exercise the intended fallback paths.
- Final focused verification after preserving the existing injury-renderer boundary: 70 tests across seven files passed. Existing injury behavior and the pinned NBA prompt file remain untouched.
- `git diff --check` passed.
- Fresh production-folder Node process PID 54230 loaded the repaired source. All advertised tokens resolve: NFL 46, NCAAF 63, MLB 38, NBA 47; zero unresolved tokens.
- Fresh-process eras: NFL `bb56e3b5bb13`, NCAAF `1f958c8a4e42`, MLB `6ff5e785b621`. Player-log source and formatter are included in applicable football/MLB evidence-era hashes.
- Production truth at 09:48 ET: scheduler PID 23440 in the canonical backend folder; Winners PID 11032 running; all listed edge functions deployed. Nine stored September 5 picks still carry earlier eras, as expected for decisions made before this repair. No newly published pick using the final repair era was claimed in this verification.
- Pick runners load source in fresh processes, so the next scheduled run uses these changes without restarting the scheduler. This task did not modify scheduler code or the Winners worker.
- Whole-tree production parity remains flagged while concurrent reliability/content/native/web work is uncommitted. The private local Firebase configuration remains preserved. Use scoped staging and scoped commits; those concurrent files belong to other work.

Logs from this session: `/tmp/gary-sports-pass1-tests.log`, `/tmp/gary-sports-pass2-tests.log`, `/tmp/gary-sports-pass3-tests.log`, `/tmp/gary-sports-boundary-tests.log`, `/tmp/gary-sports-final-verify.log`, `/tmp/gary-sports-final-focused.log`, `/tmp/gary-sports-production-truth.log`.

These are data-delivery and execution repairs. They do not establish improved betting performance. Provider data can still be absent; unsupported college stat concepts remain explicitly unavailable instead of being invented or relabeled from another league.
