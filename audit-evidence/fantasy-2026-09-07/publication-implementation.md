# Fantasy publication and scheduling verification — September 7, 2026

One atomic `publish_fantasy_briefing` transaction now owns the dated briefing and its compatible `insight_connections` display rows. Failed insertion rolls back both writes. The fetched-evidence timestamp rejects a slower older run; incomplete or malformed payloads cannot erase the prior complete board. Public clients can read the briefing, while publication remains restricted to the service role.

The local migration filenames match the versions applied by the rollout owner:

- `20260907181536_fantasy_briefings.sql`
- `20260907183011_fantasy_briefing_legacy_projection.sql`
- `20260907183743_fantasy_briefing_payload_types.sql`
- `20260907192157_fantasy_briefing_legacy_pitcher_role.sql`

The compatible rows retain each complete call, why-now explanation, fit, risk and next evidence. MLB uses category `fantasy_pickups` with kind `fantasy_pickup`; NFL uses `fantasy_usage`. The old decoder receives string evidence and its required MLB `SP` display role; the original structured decision stays unchanged. No confidence tier is introduced. Only the current date/league's noninjury Fantasy lanes are replaced. `return_watch`, other leagues/dates and betting lanes remain intact.

Grading and reset integration is complete. `run-grade-insights.js` now reads both Fantasy provenance markers; `footballGrade.js` treats Fantasy calls as context before evaluating any team result. A player's team winning or losing cannot create a Fantasy hit or miss. The general `--reset` path uses `insightResetScopeParams` and preserves rows marked by either `generated_by` or `meta.source`. Its explicit NULL handling retains the previous reset behavior for ordinary legacy rows.

The hourly owner runs NFL at all hours for weekly planning and overnight waivers. An explicit `America/New_York` filter adds MLB from 06:00 through 23:00, before NFL. Each child is capped at ten minutes; the complete owner is capped at twelve minutes overnight or twenty-five minutes for both leagues. Scheduled and manual children share a Mac kernel lock that releases automatically if its process dies. Reusing unchanged input requires more than seventy minutes of remaining validity and never advances old source timestamps.

MLB reads the existing app's current `return_watch` reports as unchanged, dated conflict context; missing rows do not imply clearance. NFL discovers its own regular-season week and never enters the MLB schedule or status-reader path. The final NFL facts-only integration is recorded in `nfl-live-facts-final.json` and `nfl-implementation.md`.

Focused final verification: nine isolated Postgres tests pass, including rollback, concurrent publication, public-read/service-write access, scoped replacement and old-app pitcher roles. Twenty-one grading/reset integration tests pass. The installed LaunchAgent matches the repository and remained unloaded during this verification; activation requires the rollout owner's explicit step. This verification performed no model runs, publication writes, commits or pushes.

Rollout owner update, 15:41 ET: both MLB and NFL now have eight published decisions and eight compatible rows. The hourly LaunchAgent was loaded at approximately 15:37 ET after both live publication paths passed review. The six MLB return-watch rows remain. See `HANDOFF_2026-09-07_FANTASY_BRIEFING.md` at the repository root for final native upload and rollout status.
