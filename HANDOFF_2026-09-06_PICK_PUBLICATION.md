# Game-pick publication integrity — September 6, 2026

The founder reiterated that Gary must not accept partially working behavior after discussing malformed stored picks. This bounded repair covers the game-pick publication/read/retry path. It preserves game and prop selection policy, Gary's numeric confidence, published original tickets, the pinned NBA prompts, and injury handling. Canonical checkout: `/Users/adam.preda/Desktop/Gary2.0`, main.

## Evidence

Read-only production queries found no missing ticket, matchup, start time, rationale, or price among the 58 daily game picks stored September 4–5. Their confidence and numeric market metadata use numbers or intentional nulls. A 90-day sample of 1,283 daily array entries contained no empty/non-string ticket or PASS/PENDING/NO PICK placeholder. These observations do not establish that every historical record or every field is valid.

Offline reproductions identified actual code paths that could falsely report success:

- A database RPC response with `data: null, error: null` was accepted as successful storage, allowing the caller to acknowledge its saved retry copy.
- Exact-ID checks counted an object with a game ID but no usable ticket as already published, suppressing retries.
- The writer accepted incomplete game objects and malformed numeric confidence, and one pre-try exception could leave the process-local storage lock held.
- NFL write retries did not recheck the pregame deadline after waiting, unlike daily writes.
- A process killed during a retry-file rewrite could truncate the prior complete decision. A controlled test reduced a 280-byte pending file to ten unreadable bytes. The old reader deleted unreadable files.
- Morning health silently converted malformed serialized pick data to empty data; it could also count object-valued tickets as game coverage.
- The web archive retained the permissive malformed-to-empty game parser, and current game reads accepted objects without a real ticket.

## Repair

New game writes validate the required ticket, game identity, matchup, market, price, rationale, start time, and numeric metadata. A stated finite confidence number stays unchanged; null stays null. Matchup names come from the actual game supplied to the parser. Invalid model formatting uses the existing decision-retry path.

Storage success requires a structurally consistent receipt from the existing atomic RPC. Skipped writes additionally verify that the ledger contains a usable original ticket under the same identity rules as the SQL guard. A valid original opposing selection remains immutable. Missing or malformed existing tickets cause an explicit unconfirmed-publication failure; they are not overwritten or backdated. NFL retries and retry-file replay recheck the pregame boundary.

Retry files are published with a complete temporary write, fsync, and atomic rename. Malformed files are retained in an outbox quarantine directory; ordinary read failures and failed valid writes retain their pending originals. Expired tickets remain ineligible for publication. Tests use private temporary directories rather than the production outbox.

Health distinguishes malformed data from confirmed empty storage, supports serialized arrays, and excludes props/placeholders from game coverage. Missing picks warn inside the existing final retry window (15 minutes for MLB/NBA; 30 for NFL/NCAAF) and fail at kickoff. These are observations when the existing health command runs, not new scheduling or notification subscriptions. The web current/archive readers reject corrupt game data rather than presenting a false empty or partial record.

## Verification and release

At 10:02:09 ET the revised read-only health check passed against production: 18/18 board games, MLB cards across 15 games, college cards across three games, and 45/45 previous-day grades/recaps. All current picks were correctly pending before their publication windows. No generated test picks or record mutations were used.

The complete credential-free web smoke passed Home, Picks, Results, Leaderboard, full matchup/prop receipts, archive/day/month, all sitemap URLs, RSS, and results export. Log: `/tmp/gary-pick-publication-smoke-20260906.log`. The first isolated setup with symlinked dependencies failed a sitemap request-scope check identically on unchanged HEAD. An independent physical dependency copy passed with the repaired source; no production sitemap code changed for this observation.

Final local checks passed: 2,129 backend tests across 234 suites with isolated PostgreSQL 17.10 enabled, 168 edge-helper tests, 349 web tests across 48 suites, and Next/TypeScript checks. Logs: `/tmp/gary-publication-backend-full-20260906.log`, `/tmp/gary-publication-edge-20260906.log`, and the smoke log above. The final focused writer run passed 118 cases; health and outbox suites passed 44 and 17 cases respectively.

The scheduler imports the publication service for its own coverage and terminal checks, so the release also requires one idle scheduler reload even though the scheduler file did not change. Fresh pick children load the new writer independently. Commit, deployment, and production-truth receipts are added below after completion; until then this section does not claim release. The separate infrastructure task owns commit `92e81090`; its repairs remain intact. The real local Firebase plist must remain uncommitted and uninspected.
