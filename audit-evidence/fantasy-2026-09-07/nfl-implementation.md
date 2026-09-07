# NFL Fantasy implementation verification — September 7, 2026

The new NFL provider and evidence builder use Gary's existing paid BALLDONTLIE connection. This pass made no model calls, publication writes, migrations or commits. Shared runner integration and the final facts-only command were verified with the flow agent. Research sources and product comparisons are in `nfl-research.md`.

## Final read-only result

Artifact: `nfl-live-facts-final.json`, collected at `2026-09-07T19:02:17.423Z` by the actual `scripts/run-fantasy-briefing.js --league NFL --facts-only` runner.

- Complete regular-season schedule: 272 games; selected Week 1 contains 16 games, September 9–14. The Wednesday opener is retained on a Monday with no games.
- 427 weekly forecasts and 944 ownership rows were fully paginated. 422 candidates had a positive current, schedule-verified forecast. Five all-zero projected opportunities were excluded without being labeled as starts or pickups.
- The discovery pool contains 32 players: eight QB, eight RB, eight WR and eight TE. Nine have a current rookie listing. All selected IDs, names, positions and teams matched the current active-player directory.
- No 2026 regular-season observations were returned before opening week. Twenty-three veterans have explicitly labeled 2025 baselines with the actual game dates; rookies have no invented NFL baseline. Once current-season observations exist for a player, those replace the historical baseline in his evidence.
- Seven complete logical collections required 25 successful HTTP requests: schedule 3 pages, projections 5, ownership 10, scoring definitions 1, current identities 1, and current/prior player stats 5 total. Every request used the existing cross-process rate gate, at the configured 120 local requests/minute, with at most three active requests.
- Raw responses totaled 8,274,076 bytes. Transport normalization retained 1,369,650 bytes while removing repeated scoring dictionaries and unrelated fields. The final complete shared-writer prompt is 186,237 bytes, below its 220,000-byte bound; no prompt was clipped.
- Provider-source validity ends at `2026-09-08T00:15:01.106Z`, earlier than a new six-hour TTL from this collection. Serving expiry is bounded by each selected forecast's original collection time plus six hours, and by any earlier included ownership timestamp plus 24 hours. Individual next-game decisions also expire at their player's linked kickoff.

## Meaningful evidence checks

The final artifact retains useful context rather than attaching a new label to rankings. Bhayshul Tuten's linked Cleveland game has 15 provider-projected carries; his five actual 2025 observations total 23 carries, averaging 4.6, dated November 23, 2025 through January 4, 2026. Those describe different periods and different kinds of evidence; they do not establish a current role change. Michael Pittman Jr.'s current identity is Pittsburgh, while his dated baseline games remain labeled Indianapolis. Chris Brooks has carries measured in only three of five baseline observations, so the five-game carry average remains null instead of treating the missing values as zero.

Scoring evidence preserves standard, half-PPR and PPR forecasts separately, with the relevant season's reception rules. The game schedule supplies the opponent, venue side, kickoff and next scheduled games; it does not imply a starting role, a personal league lock rule, a bye from a missing entry, or an opponent-specific advantage unsupported by data. Provider ownership is aggregate context; personal roster, availability, waiver deadline, league size and custom bonuses remain unknown. No snap/route shares or locked injury interpretation were added.

## Focused verification

`npx vitest run tests/services/insights/nflFantasyProvider.test.js tests/services/insights/nflFantasyEvidence.test.js`: **40 tests passed**.

Coverage includes opaque cursor pagination, repeated/empty/incomplete pages, malformed envelopes, safe provider errors, request budget, concurrency and cancellation; real-week resolution and stale in-progress status; exact player/game/team/date/season joins; filtering completed regular-season observations before the last-five limit; missing values versus measured zero; conflicting duplicate rows and historical team identity; three scoring formats; ownership and forecast freshness; source-based expiry; complete versus missing required collections; rookie and position coverage; full 32-player prompt-size cases with zero, one and five current observations; and the shared writer's numeric/evidence validation and kickoff deadline.

The only post-artifact code change adds rejection of a schedule game still marked in progress more than 24 hours after kickoff, preventing an obsolete live status from pinning the wrong week and replacing the board with an empty one. Its regression passes; the final live artifact contains no in-progress games, so its facts and prompt are unaffected.

Provider bounds are explicit: maximum three concurrent requests, 12 seconds per transport, 180 seconds per collection instance and 80 total requests. Per-collection page caps are schedule 5, ownership 20, projections 20, scoring definitions 2, identities 2 and player stats 8. Hitting a bound or failing a required reader throws; it cannot publish a partial collection. A current week with no usable forecasts preserves the previous briefing. The new files perform no model selection or recommendation scoring.
