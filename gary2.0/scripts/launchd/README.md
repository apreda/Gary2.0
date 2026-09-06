# Production job inventory

These nine plists match the installed jobs on the production Mac as of
September 6, 2026. The five previously untracked definitions were copied from
the running installation and validated with `plutil -lint`; capturing them
does not change or restart a job. Backup `.bak` files are not additional jobs.

| Label | Responsibility | Schedule in the Mac's Eastern time zone |
| --- | --- | --- |
| `com.gary.scheduler` | Slate, boards and timed game/prop generation | Continuous; KeepAlive |
| `com.gary.winners` | Review published candidates and admit tickets | Continuous; KeepAlive |
| `com.gary.keepawake` | AC/idle sleep inhibition | Continuous; KeepAlive |
| `com.gary.scheduler-watchdog` | Heartbeat recovery and morning health | Every 120 seconds; health during 07:00–08:00 |
| `com.gary2.daily-insights` | Content pipeline; college cards before 06:00 | 02:30, 06:00, 07:15, 08:00, 11:00, 16:30, 19:30 |
| `com.gary2.daily-results` | Results, football proof, insight grading, pulse | 02:00, 06:45, 11:30, 16:45, 20:00 |
| `com.gary2.live-scores` | Local score polling | Every 120 seconds |
| `com.gary2.live-scores-watchdog` | Recover stalled score polling | Every 120 seconds |
| `com.gary2.recap-backfill` | Fill missing game recaps | 08:30, 10:30, 17:00, 20:15 |

The canonical checkout is `/Users/adam.preda/Desktop/Gary2.0`. These are exact
machine configurations with absolute paths, not portable cloud templates.
They require the configured user session, Node, provider CLIs, the backend
environment, and provider authentication. Secrets are not contained here.

For recovery, first restore the canonical checkout and install locked
dependencies. Restore credentials from the operator's secure source, verify
the clock/time zone and each executable path, and validate the database and
CLI authentication before loading any writer. Reconcile each installed plist
against its versioned counterpart. Load only one instance of each owner;
do not run an unvalidated cloud backstop alongside it. Restarting the
scheduler during an active pick requires coordination with that run.

After recovery, run `node scripts/production-truth.js` and
`node scripts/morning-health.js --json` from the backend. Confirm the actual
process folder, eras, deployed edges, scheduled publication windows and stored
coverage. An idle calendar job with exit code zero is normal between runs.

These files close the configuration inventory gap. They are not a backup of
the Mac, its keychain or OAuth sessions, and no complete host-restore drill has
yet been performed. KeepAlive and caffeinate do not provide cloud failover.
