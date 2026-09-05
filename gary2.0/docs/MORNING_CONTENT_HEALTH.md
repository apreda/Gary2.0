# Morning content and health operations — September 5, 2026

The 7AM Claude routine is an observer; it does not generate Gary's board, picks, Wire, or cards. Morning failures have had different causes. Several recent mornings published normally; the available evidence does not establish that all seven 7AM checks failed.

## What the available history shows

| ET date | First retained MLB insight row | Scheduler/board evidence |
| --- | --- | --- |
| Aug 30 | 06:04 | Scheduler morning slate completed around 05:00 |
| Aug 31 | 06:15 | Scheduler morning slate completed around 05:00 |
| Sep 1 | 06:21 | Scheduler morning slate completed around 05:00 |
| Sep 2 | 11:11 | Scheduler morning slate completed around 05:00; insights arrived later |
| Sep 3 | 16:33 | First observed slate 09:30:29; board 09:31:42 |
| Sep 4 | 06:04 | Slate 05:02:22; board 05:03:46 |
| Sep 5 | 06:01 | Slate 05:03:02; early board attempts failed in optional provider work; board recovered 07:43:32 |

Evidence: `~/Library/Logs/Gary2.0/insights-launchd-{stdout,stderr}.log`, scheduler logs under `~/Library/Logs/Gary2.0/scheduler`, and read-only Supabase publication timestamps. Old insight logs do not timestamp each stage. Cards and Wire replace rows, so their first currently retained creation timestamp cannot establish first publication on a historical morning.

Confirmed failure mechanisms:

- The old single daily-insights command ran long football insight stages before cards, board, and Wire. Its caps totaled 114 minutes. The Sep 5 07:15:05 run reached college cards at 08:05:14 and board at 08:22:22. Launchd serializes this job; an overdue run can delay subsequent scheduled runs.
- Historical stderr contains Node `EINTR` / `uv_cwd` startup failures and repeated football stage caps. Startup retries now target only that immediate transient error.
- The local football provider gate was configured for three requests/minute despite verified paid-account headers allowing 600/minute. The separate rate-limit fix uses a conservative 120/minute. See `BDL_RATE_LIMIT.md`. College card recovery subsequently covered all 30 games in 135 seconds.
- Wire used a retired Claude CLI path, then an Anthropic account without available credits. It reported zero output and exited 1; its old successful-looking summary text was misleading. Wire now uses the existing Codex web-search bridge, retains the native Anthropic fallback, and reports failure plainly.
- Recap generation could count failed models or inserts but still exit successfully. It now returns a failed process status when any recap failed.
- College continuation looked up lowercase `ncaaf` against uppercase stored `NCAAF`. The shared identity filter is corrected. Injury selection and status rules were not changed.

## Installed jobs

Tracked definitions: `scripts/launchd/com.gary2.daily-insights.plist` and `scripts/launchd/com.gary.scheduler-watchdog.plist`. Both were installed while idle at approximately 08:35 ET on Sep 5; bytes matched installed LaunchAgents at final verification. Installing these jobs did not restart the live picks scheduler.

The existing daily-insights job runs at 02:30, 06:00, 07:15, 08:00, 11:00, 16:30, and 19:30 local time. The 02:30 phase is NFL + NCAAF cards only, with one shared three-hour outer cap and a 165-minute college work budget. It remains a checkpoint backstop, not a claim that paid-tier processing requires three hours. Normal daytime passes resume incomplete cards.

Normal sequence: board; Wire; MLB/NBA insights; MLB/NBA cards; NFL cards; NCAAF cards; NFL insights; NCAAF insights; NCAAF named-subject cards; Card Watch; health. Insight stages pass `--skip-cards` to avoid repeating embedded card builds. Existing stage caps remain explicit; each cap owns and cleans its child process group. A failed stage is recorded and the next independent stage runs.

The existing 120-second scheduler watchdog retains its original heartbeat policy. After that policy, it invokes the independent read-only health check once between 07:00 and 08:00 ET per date, with a 75-second cap. It writes `~/Library/Logs/Gary2.0/morning-health.log` and `morning-health-last.json`. Failures/timeouts remain failures; they are never marked healthy. No new recurring automation was created. The scheduled 7AM health invocation was **armed**, not observed, on Sep 5 because installation happened after that window.

## Read-only checks and targeted recovery

From the backend directory:

```sh
node scripts/morning-health.js
node scripts/morning-health.js --date 2026-09-05 --json
node scripts/run-daily-content.js --date 2026-09-05 --plan
node scripts/run-daily-content.js --date 2026-09-05 --stages ncaaf-insights,ncaaf-card-subjects,card-watch,morning-health --plan
```

Removing `--plan` runs the named production stages. Recovery stage selection is validated and retains normal order. Avoid overlapping a manual writer with the same running launchd stage. A selected run proves only the stages listed in its journal, not the full daily pipeline.

Durable stage evidence is in `~/Library/Logs/Gary2.0/daily-content-stages.jsonl`: run ID, ET date, selected stages, start/end timestamps, duration, attempt, process status, and failure reason. No model/provider failure triggers an immediate whole-stage retry; only an immediate Node `EINTR uv_cwd` startup error does.

Health compares exact league/game IDs against today's slate, with per-league board, insights, cards, Wire, and football pulse checks. Cards missing within two hours of kickoff fail; incomplete earlier coverage warns. College completion requires the latest successful two-team build marker. Pregame picks are pending; a started game without its exact saved pick fails. Yesterday's grades match exact date/league/game/ticket and accept the actual result vocabulary. Recap availability is reported separately. Grades settled before 02:00 are valid. Table read errors cannot become green. Conditional insight categories and props are not required for every game; this check currently does not grade prop-generation completeness.

## Existing cloud observer

Claude routine: **Gary scheduler 7am health check**, trigger `trig_01NrcskvukdP5rYxieZyHsPh`, daily at 11:00 UTC. The last local update record is Aug 17 in `~/.claude/projects/-Users-adam-preda/ce4c75fa-5f6d-4700-9b85-357c4a935394.jsonl`, lines 873–874. The connected tools cannot read or update that remote routine, and seven daily outcomes were not available locally. Its prompt remains unchanged.

When that existing routine is next edited, use this replacement prompt:

> Check Gary's current Eastern-date morning health using the output of `node scripts/morning-health.js --json` and its latest completed stage journal when local execution is available. Otherwise perform equivalent read-only exact-date, exact-league/game checks. Report each failing or warning surface with observed counts, timestamps, and owning job. Treat pregame picks as pending, conditional insight categories as optional, and results already settled before 2AM as valid. Distinguish missing content from a stopped scheduler. Do not restart or regenerate anything from a stale content row alone. If local health or remote reads are unavailable, say verification is unavailable; do not declare the app healthy. Include the observation time and avoid claiming an entire day or pipeline passed from a single healthy league.

## Sep 5 recovery and source audit

Wire recovery logs: `/tmp/gary-wire-recovery-2026-09-05.log` and `/tmp/gary-wire-recovery-ncaaf-2026-09-05.log`. Original 14 rows were backed up before correction in `logs/audits/wire-recovery-2026-09-05-before-source-audit.json`. The recovery's weather source was captured at 12:37:17.064 UTC: `https://www.fantasyinfocentral.com/mlb/weather/?date=2026-09-05`.

Six unsupported items were removed by exact ID/date: Miami's unconfirmed roof claim (3011), and five college total-movement items without same-book timestamped opening/current receipts (3015–3019). The retained eight rows are five MLB and three NCAAF items. Seven moments carry exact input recap IDs; the Cincinnati weather item carries its captured public URL. The Athletics subline was narrowed to its verified final and hits. No picks or grades were altered.

Future non-moment Wire items require source URLs captured by the actual tool response, not merely written in final model text. Line movements require host-supplied same-book, same-game/date, ordered timestamped receipts with matching market values; the current Wire supplies no such receipts and therefore emits no line-movement items. It does not reconstruct movement from web summaries. Source uncertainty must survive into headlines. Publishing already inserts before deleting only captured old IDs: failed insertion preserves the old feed; failed cleanup may leave duplicates but cannot blank it or delete a concurrent new publication.

At 09:10 ET, read-only health verified board 45/45, MLB cards 15/15 games, college cards 30/30 complete games, Wire 5 MLB + 3 NCAAF, and yesterday's grades and recaps 13/13. College insight coverage was 26 rows across 19/30 games; a targeted refresh began at 09:13:50 through the new runner with a 12-minute cap. Its outcomes are in the durable journal and `/tmp/gary-content-recovery-2026-09-05.log`. This timestamped snapshot is not a guarantee of future job completion.

Focused validation at 09:13:17: 43 tests passed across seven suites covering stage ordering and cleanup, selected recovery stages, health semantics and read deadlines, watchdog marker/cap behavior, Wire sources and movement receipts, Wire insert/cleanup failures, recap exit status, and college continuation identity.

### Completed targeted run, 09:22–09:24 ET

The selected production run ended successfully at 09:22:36 after 8m46s. Its three stages all exited 0 and wrote completed journal entries. College insights increased to 127 rows across all 30 games. Availability searched 12 games within its existing eight-minute budget and left 18 for later passes; successful process status does not claim those remaining reports were researched.

Verification exposed a generic storage mismatch: the college QB/availability ledger skips previously completed games, but category-wide snapshot cleanup removed those skipped games' old rows. `insightRefreshScope.js` now restricts cleanup to the fresh exact game IDs for these two college categories. Other snapshot categories are unchanged; injury wording, classification, and selection are unchanged. The running process had already loaded the prior code, so its two original QB rows (24281/24282, game 457178) were restored exactly from the pre-run backup after verifying both were absent. Final college insight total is 129, including 57 QB rows. Focused validation for the final persistence fix: 59 tests passed across 10 suites at 09:20:34.

Card Watch reported 18 of 80 newly surfaced college player rows without individual cards, although every game has a completed base pack. This is a separate named-player coverage warning, not a failed game-pack build. The card audit owns follow-up; do not interpret game coverage or the limited health evaluator's OK status as proof that every named subject or every availability report is complete. Final read-only health snapshot: `logs/audits/morning-health-2026-09-05-after-content-recovery.json`. No content recovery processes remained after the run.

### Unconditional 09:00 restart found at 10:14 ET

The scheduler PID changed from the intentional 08:45 reload to PID 23440 at 09:00:03 because the user's crontab contains an unconditional daily 09:00 `launchctl bootout`, two-second sleep, and `bootstrap` for `com.gary.scheduler`. Unified macOS logs confirm removal at 09:00:00.870 and respawn at 09:00:03.033. The heartbeat watchdog did not act: its last restart log is Sep 3; its runs exit 0, and the current scheduler reports one run and no subsequent exit since 09:00. PID 23440 and its fresh heartbeat remained intact throughout this investigation.

No repository installer contains this cron entry. Existing local Claude transcripts show it was already installed on Aug 12 (session `5f62d964-468d-4363-9dbd-3d9c468d6ea7.jsonl`, line 604), Aug 24, and Sep 1; these observations do not establish its original creator. Its sleep-recovery purpose is superseded by the heartbeat watchdog. **Do not reinstall a clock-based unconditional scheduler restart:** it can interrupt healthy active picks.

Removal was authorized and prepared with exact before/after backups under `logs/audits/crontab-2026-09-05-{before,after}-scheduler-restart-removal.txt`; there were no other cron entries to preserve. However, the native `crontab` update waited without returning or changing installed content. After more than three minutes the pending update alone was stopped. No scheduler action was taken. Therefore the obsolete entry **remains installed** and requires completing its native removal; do not report this repair complete. The exact reason for the native wait was not exposed by the available process/log evidence. Verification must compare `crontab -l` with the prepared after file and confirm the existing scheduler PID is unchanged. The prepared change removes only the single restart line and its adjacent descriptive comment.

A bounded PTY retry at 10:32 ET also timed out without modifying cron. Debug-level unified logs now identify the authorization boundary: `tccd` received `kTCCServiceSystemPolicyAllFiles` for native `/usr/bin/crontab` PID 69859, attributed to responsible `com.openai.codex` (`/Applications/ChatGPT.app`, PID 66014). No explicit denial or completed authorization was returned during the attempt. This is an OS privacy authorization wait; changing shell/PTY does not resolve it. No permissions were changed and no alternate agent identity was used to bypass that boundary.

A guarded manual command is prepared at `/tmp/gary-remove-obsolete-scheduler-cron.py`. The user can run `python3 /tmp/gary-remove-obsolete-scheduler-cron.py` in their own Terminal and respond to any native authorization request. It refuses to overwrite a crontab that differs from the exact reviewed backup, prints the proposed diff, installs the reviewed replacement, and verifies readback. Do not report removal complete until that verification succeeds. The agent's bounded retry left no pending process and scheduler PID 23440 remained unchanged.
