# Production job inventory

These nine plists describe the production Mac jobs. September 7 pins Node to
22.23.2 in Gary's private runtime folder, matching CI's supported major version.
Backup `.bak` files are not additional jobs.

| Label | Responsibility | Schedule in the Mac's Eastern time zone |
| --- | --- | --- |
| `com.gary.scheduler` | Slate, boards and timed game/prop generation | Continuous; KeepAlive |
| `com.gary.winners` | Review published candidates and admit tickets | Continuous; KeepAlive |
| `com.gary.keepawake` | AC/idle sleep inhibition | Continuous; KeepAlive |
| `com.gary.scheduler-watchdog` | Heartbeat recovery, morning health, disk and coverage observations | Every 120 seconds; coverage/disk every 10 minutes; morning check during 07:00–08:00 |
| `com.gary2.daily-insights` | Content pipeline; college cards before 06:00 | 02:30, 06:00, 07:15, 08:00, 11:00, 16:30, 19:30 |
| `com.gary2.daily-results` | Results, football proof, insight grading, pulse | 02:00, 06:45, 11:30, 16:45, 20:00 |
| `com.gary2.live-scores` | Local score polling | Every 120 seconds |
| `com.gary2.live-scores-watchdog` | Recover stalled score polling | Every 120 seconds |
| `com.gary2.recap-backfill` | Fill missing game recaps | 08:30, 10:30, 17:00, 20:15 |

The canonical checkout is `/Users/adam.preda/Gary2.0`. These are exact
machine configurations with absolute paths, not portable cloud templates.
They require the configured user session, Node, provider CLIs, the backend
environment, and provider authentication. Secrets are not contained here.

The pinned binary is
`~/.local/share/gary/runtimes/node-v22.23.2-darwin-arm64/bin/node`.
Restore it from Node's official `v22.23.2` Darwin ARM64 distribution, checking
the tarball against that release's `SHASUMS256.txt` before extracting it. The
plists pin both direct execution and child-process PATH; changing a shell's
Node version alone does not update an already-running scheduler. Verify the
repository under the pinned binary and reload each job when its work is idle.
The global Homebrew executable is intentionally independent of Gary's pin.

`run-host-health.js` reads actual published slate/pick/card coverage and free
space on the production volume. It stores the latest report in
`~/Library/Logs/Gary2.0/host-health-latest.json` and logs only a changed warning,
failure, or recovery to `host-health.log`. It makes no model calls, sends no
notifications, and never restarts a healthy process because a data lane is
late. Coverage reads time out after 60 seconds. Disk below 15 GiB warns and
below 5 GiB fails; cache removal remains an explicit maintenance operation.

`run-watchdog.js` recovers the scheduler after a heartbeat older than five
minutes and the live-score job after a log older than eight minutes. Before
scheduler recovery it checks descendants and detached pick writers, deferring
while those processes are active. Failed process/job inspection also withholds
recovery. An idle stale job is unloaded once, then bootstrap is retried up to
three times, two seconds apart. Both jobs use RunAtLoad; there is no subsequent
force-kickstart that would kill their new process. Watchdog failures remain
nonzero even when the following health observation succeeds. This protects
observed active work; it is not a transaction lock on future process launches.

For recovery, first restore the canonical checkout and install locked
dependencies. Restore credentials from the operator's secure source, verify
the clock/time zone and each executable path, and validate the database and
CLI authentication before loading any writer. Reconcile each installed plist
against its versioned counterpart. Load only one instance of each owner;
do not run an unvalidated cloud backstop alongside it. Restarting the
scheduler during an active pick requires coordination with that run.

Install the native `supabase` CLI on PATH for the deployment audit; the audit
does not download an npm wrapper at runtime. After recovery, run
`node scripts/production-truth.js` and
`node scripts/morning-health.js --json` from the backend. Confirm the actual
process folder, eras, deployed edges, scheduled publication windows and stored
coverage. An idle calendar job with exit code zero is normal between runs.

These files close the configuration inventory gap. They are not a backup of
the Mac, its keychain or OAuth sessions, and no complete host-restore drill has
yet been performed. KeepAlive and caffeinate do not provide cloud failover.
