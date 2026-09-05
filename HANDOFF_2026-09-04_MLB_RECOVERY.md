# MLB generation outage — September 4, 2026

The founder reported missing MLB game picks at approximately 7:56 PM ET.
This supersedes the earlier handoff's implication that deployment parity alone
established a healthy end-to-end MLB pipeline.

## What failed

The public database contained only three MLB game picks when investigated.
Game generation was failing before a final decision reached storage. Props
continued to publish after failed game jobs; Winners admission was not blocking
public game publication.

The child logs establish the following sequence:

1. Haiku research received an Anthropic 400 response for insufficient credit.
2. The fallback Luna researcher exceeded its 1,200-second outer timeout.
3. The timed-out research kept running after the caller abandoned it.
4. Same-brain retries and then brain fallback restarted the research, creating
   overlapping work inside the same child.
5. A single MLB worker held each affected game for the 45-minute child cap.
   Later games lost their pregame windows while the queue waited.

The September 4 evidence change also accidentally removed the compact limits
on prior-factor carry-forward. This was our regression and plausibly amplified
latency. Logs do not isolate its exact contribution from provider and search
latency. The full later briefings were approximately 50,000–54,000 characters;
the earlier successful Luna briefings were approximately 27,000–29,000.

Concrete scheduler failures: Red Sox–Orioles at 5:29 PM, Cubs–Marlins at
6:16 PM, Giants–Mets at 7:03 PM, and Diamondbacks–Astros at 7:49 PM. Each
reached the 45-minute child deadline without publishing a game pick.

Evidence is preserved in `gary2.0/logs/scheduler/scheduler-2026-09-04.log` and
the corresponding `2026-09-04---mlb---game-id-<id>.log` child logs. API keys
and credentials must not be copied into incident documents.

## Repairs

- Restore a 740-character prior-factor content budget while retaining source,
  context and uncertainty labels. The final complete briefing remains available.
- Give the entire optional researcher cascade one cancellable time budget.
  Stop further work on abort; do not turn cancellation into another retry.
- Carry cancellation through backup OpenAI/Anthropic web-search API calls as
  well as the bridge, without changing ordinary provider-timeout fallback.
- Reserve decision time against the scheduler's actual child deadline. Research
  unavailability allows Gary to decide from the original source desk.
- Reuse the exact desk's research result, including an unavailable result,
  across brain retries instead of restarting research for every brain attempt.
- Run three bounded rolling game→props workers, selecting due games by first
  pitch and retaining the same-game lock through props. Later due games can use
  free slots without waiting for a static batch to finish.
- Keep undispatched games in the live pending queue until a worker is free,
  preserving official delay, postponement and revised-start updates while they
  wait. This final safeguard was loaded by the second restart after all healthy
  active game and props runs finished.
- Include the research lifecycle and configured research mode in the MLB era
  fingerprint so future operational profiles can be distinguished.

The code fixes do not replenish Anthropic credit. The existing configured Luna
fallback remains available, and unavailable research no longer prevents an
otherwise valid source-desk decision. Game primaries remain Astra; props remain
Sol. No injury handling or pinned NBA prompt text was changed.

## Recovery record

The urgent recoveries used the normal production game runner with Astra and
`GARY_RESEARCHER=off`. They retained the original source-desk and pregame write
checks. Full logs are `/tmp/gary-mlb-recovery-<id>.log`.

- 5059891, Diamondbacks–Astros: published before its 8:10 PM first pitch.
- 5059892, Blue Jays–Royals: published before its 8:10 PM first pitch.
- 5059890, Rays–Rangers: stopped before its 8:05 PM first pitch without a pick.
- 5059893, Cardinals–Rockies: published at approximately 8:13 PM, before its
  8:40 PM first pitch; the normal runner verified the stored outcome.

Games already started without a published pick remain missed coverage. No
postgame picks, backdated publications, or invented results were added.

At the original report, six started MLB games lacked picks. Rays–Rangers then
also expired before recovery could complete, making seven missed game picks.
Deployment checks must be supplemented by actual publication checks; a live
scheduler PID and matching source hashes do not establish successful generation.

## Live verification

The repaired scheduler restarted at 8:25 PM ET as PID 79782, running from
`/Users/adam.preda/Desktop/Gary2.0/gary2.0`. The old Yankees runner and its
replacement props child were terminated before restarting; no duplicate game
writer was left running. The normal rolling pool then launched Yankees–Padres
and Athletics–Mariners together, recognized the existing Cardinals pick, and
continued that game's props. Official lineup arrival brought both 10:10 PM
games forward from their usual T-90 trigger.

The new pick children carry their actual deadline and the configured Astra
game/Sol props models. The on-disk MLB era at this restart was `2fdedd43241e`.
The focused integration run passed 116 tests in 13 files, including real local
subprocess cancellation and shared initial/follow-up research budgets.

`production-truth.js` now reports MLB slate publication coverage alongside
runtime and deployment parity. At 8:27 PM it reported six published, seven
started without a pick, and three pending. All edge deployment timestamps
passed. The incident changes were still uncommitted at this intermediate check.
The real local Firebase plist remains an intentional uncommitted configuration
exception; preserve it and never commit or redact the working credential.

The initial full backend run passed all 1,767 tests in 198 files (48.35 seconds).
Three stale expectations were updated for bounded optional research and the
new slate-coverage read. Coverage tests distinguish missed starts from pending
games and fail when the slate cannot be read. Scheduler tests cover waiting
games receiving official hold, retirement, and revised-start updates.

All three later games then published through the normal scheduler, each using
Astra and the repaired era `2fdedd43241e`:

- Yankees–Padres (5059894): Yankees ML -116; scheduler verified storage at
  8:54:31 PM, before the 9:40 PM first pitch.
- Athletics–Mariners (5059895): Mariners -1.5 +104; scheduler verified storage
  at 8:56:24 PM, before the 10:10 PM first pitch.
- Nationals–Dodgers (5059896): Nationals +1.5 +105; present in the database
  by 8:57 PM, before the 10:10 PM first pitch.

The child logs confirm the repaired behavior: optional research exhausted its
single 1,200-second budget, stopped, and Astra continued from the original desk
to a stored decision. The observed old Yankees research process group had no
survivors. This establishes actual publication after timeout, beyond source
parity or process existence alone.

Tonight therefore reached nine MLB game picks: the original three, three
urgent recoveries, and three normal scheduled publications after the repair.
Seven earlier games remain missed. Later game/props activity must not rewrite
those missed pregame windows.

A final fallback-API cancellation patch additionally covers direct HTTP
requests if the bridge fails. It passed all 1,774 backend tests in 199 files
(58.03 seconds). That patch and the final queue safeguard were loaded
after the healthy props jobs finished. New eras include the raw Anthropic search
helper as well as the search facade; the three already-published repaired
game picks correctly retain their preceding era. A misleading legacy startup
log claiming the researcher was always OFF was also removed.

The three late-game props jobs each stored three selections: Athletics at
8:58:06 PM, Yankees at 8:58:37 PM, and Nationals at 8:59:22 PM. The later
Yankees retry recognized the existing game pick and props without replacement.

At 9:00:40 PM the final scheduler restarted cleanly as PID 2008, after verifying
that no game/props child remained. Its startup logged game era `fbee57bc41bd`,
props era `aa5fa0ab453b`, and the canonical backend directory. Code fixes are
pushed to `origin/main` in `62745df1` and `e487b219`. The first repaired games
retain era `2fdedd43241e`; this is expected because the final backup-search
patch followed those runs. No published ticket was rewritten to a newer era.

Separate observation for later investigation: NCAAF exact-ID schedule polling
was repeatedly paging toward the 100-page limit and waiting on the shared
provider rate gate. This was not established as the MLB outage's cause and was
not changed as part of this repair.

The final production audit confirmed PID 2008 in the canonical backend, Astra
games/Sol props, nine of 16 MLB slate games published, seven missed, and zero
pending publications. Every edge deployment timestamp passed and no code
commits were unpushed. Its sole parity flag was the intentionally uncommitted
local Firebase configuration; the command therefore returned exit 1 rather
than a literal green result. Preserve that configuration exception. Audit
output: `/tmp/gary-production-truth-final-2026-09-04.log`.
