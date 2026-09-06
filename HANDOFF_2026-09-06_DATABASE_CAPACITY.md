# Database capacity repair — September 6, 2026

The founder asked to fix the underlying repeated database stalls after the
earlier content recovery and deployment repairs. The missed infrastructure
configuration was a legacy Nano database in the paid Pro organization.
Production project `xuttubsfgdcjfgmskcol` now runs **Micro, 1 GB RAM**.

## Evidence and diagnosis

- Supabase emailed a project-specific Disk IO Budget depletion warning on
  September 5 at 13:50:47 UTC, before that day's availability incident.
- The organization API reports Pro. Before this repair, the billing API had
  no selected compute add-on; the server exposed only **426,258,432 bytes
  (406.51 MiB)** of RAM. This matches the legacy Nano allocation despite the
  organization being on a paid plan.
- At 12:54:19 UTC on September 6, only 2 hours 35 minutes after the earlier
  recovery restart, Linux had swapped **1,815,160 pages in** and
  **1,803,534 pages out**: about **13.8 GiB combined**, using 4 KiB pages.
  There were **343.09 MiB** currently in swap. The two CPUs had spent about
  **1,022 combined CPU-seconds** waiting for I/O versus roughly 278 in user
  computation. The data disk had only 30 seconds of busy time; the other
  disk had 731 seconds. Match disks by filesystem identity, not the nvme
  device number, which changed during the resize.
- PostgreSQL's shared buffers used 224 MiB out of the 406.51 MiB host.
  Ordinary SQL was already mostly cached: approximately 2.31 million buffer
  hits versus 8,753 reads in the database counters. The connection snapshot
  had 12 idle client connections and one active diagnostic query, without
  a lock storm, an exhausted 60-connection limit, or an OOM kill.
- The database occupies about 400.7 MiB, including 237 MiB of allocated cron
  history. The September 5 indexed readiness-query and bounded retention
  repairs remain applied. No further bulk deletion or locking vacuum was
  performed in this task.
- September 6's first ordinary query timeouts began at 03:02 UTC, with cron
  startup timeouts from 03:04. The retention job runs at 03:37, so that job
  cannot explain the first onset that night.

The concrete defect was insufficient memory and baseline I/O capacity,
with substantial disk traffic caused by memory swapping. It explains why
restarting the same small server temporarily restored service without
correcting the capacity mismatch. The provider warning and measured swapping
support this diagnosis; the precise instant the earlier burst budget reached
zero has not been retrieved from historical infrastructure charts. Do not
claim this observation proves every historical failure had one cause.

## Applied infrastructure change and price

The supported Management API accepted one
`PATCH /v1/projects/xuttubsfgdcjfgmskcol/billing/addons` with
`{"addon_type":"compute_instance","addon_variant":"ci_micro"}` at
**12:56:29 UTC / 08:56:29 ET**. The request began at 12:56:23 UTC.
Postgres restarted at **12:57:05.409696 UTC**. The project was healthy by
12:57:33 UTC. This was a compute resize, not another recovery restart loop.

The selected add-on is now `ci_micro`, priced at **$0.01344/hour (~$10/month)**.
Supabase bills legacy Nano at the same rate in paid organizations; the
Nano-to-Micro correction adds **no recurring compute charge**. The existing
custom-domain add-on remains selected. The 8 GB gp3 disk, 3,000 provisioned
IOPS and 125 MiB/s provisioned throughput remain unchanged. Micro doubles the
compute's sustained I/O allowance from 250 to 500 IOPS and about 5 to 11 MB/s.

References: [Supabase compute and disk](https://supabase.com/docs/guides/platform/compute-and-disk),
[high disk I/O](https://supabase.com/docs/guides/troubleshooting/exhaust-disk-io),
[high swap usage](https://supabase.com/docs/guides/troubleshooting/exhaust-swap),
[compute management API](https://supabase.com/docs/reference/api/v1-apply-project-addon).

## Verification

- The live host now reports **948,191,232 bytes (904.27 MiB)** of usable RAM.
  PostgreSQL picked up Micro defaults: 256 MiB shared buffers, 64 MiB
  maintenance memory, 3,500 KiB work memory, 60 maximum connections.
- All five detailed services passed at 13:00:13 UTC: database, database as
  postgres user, REST, pooler and Auth. `pg_up=1`; OOM-kill counter is zero.
- The natural 09:00 ET cron batch completed all nine jobs. Both materialized
  view refreshes finished in under 0.8 seconds, compared with roughly
  2.3-second means before the resize. Cron success for HTTP jobs proves
  enqueueing; downstream response verification is recorded separately.
- At 08:58 ET, independent morning health was OK: board 18/18 games, 90 MLB
  insights across 15 games, 23 NCAAF insights across three games, all current
  game cards, and 45/45 yesterday results with recaps. Picks are correctly
  pending before their normal publication windows.
- Home, Picks, Results, Archive and archive XML all returned HTTP 200 without
  an application error boundary after the resize.

- All ten retained downstream HTTP responses from 13:00–13:03 UTC returned
  200 with no timeouts. There were no waiting locks or client I/O waits in
  the 13:03:51 snapshot.
- Resource sampling from 12:59:37–13:02:46 UTC covered the scheduled batch:
  minimum available RAM **475.22 MiB**, average combined disk activity
  **74 IOPS** and **2.39 MiB/s**, comfortably below Micro's sustained limits.
  CPU I/O wait averaged **1.59%**. Swap moved 15.24 MiB in and 35.56 MiB out
  over that interval; it did not stop completely. Every sample had `pg_up=1`
  and zero OOM kills. Rates use cumulative differences over the full interval
  because provider samples refresh once a minute.

The next overnight workload has not yet occurred; current passing checks
must not be described as an observed successful future morning.

Production truth verified the canonical scheduler folder, unchanged game era
`6c7eb813e8a8`, props era `aa5fa0ab453b`, Astra games/Sol props, Winners
availability and all 20 edge deployment timestamp checks. This task changed
infrastructure and operational documentation, not application source. The
final receipt is `/tmp/gary-core-production-final-2026-09-06.log`; its known
working-tree exception is the real Firebase plist described below.

## Operational continuity and evidence

The scheduler was PID **39624** before the resize. A separate start at
09:00:04 ET produced current PID **55412** in the canonical backend; this
session did not restart that worker. Its fresh slate, today's board and
tomorrow's board all completed successfully by 09:01:17 ET. Production truth
verified its folder and eras. Winners remains PID **11032**.
No decision prompts, pick policy, alert subscription,
database data, or job schedules were changed by this capacity repair.
Completed physical backups from this morning were verified before resizing.
The dashboard remained signed out; supported CLI credentials provided the
management access. No credential values were written into these receipts.

Local receipts:

- `/tmp/gary-core-metrics-before-2026-09-06.txt`
- `/tmp/gary-core-addons-before-2026-09-06.json`
- `/tmp/gary-core-compute-upgrade-receipt-2026-09-06.json`
- `/tmp/gary-core-metrics-after-2026-09-06.txt`
- `/tmp/gary-core-addons-after-2026-09-06.json`
- `/tmp/gary-core-health-after-2026-09-06.json`
- `/tmp/gary-core-resource-observation-2026-09-06.jsonl`
- `/tmp/gary-core-resource-summary-2026-09-06.json`
- `/tmp/gary-core-morning-after-2026-09-06.json`
- `/tmp/gary-core-morning-final-2026-09-06.json`
- `/tmp/gary-core-production-final-2026-09-06.log`

The previously prepared Supabase support draft remains unsent and is
superseded by this diagnosis and applied repair. The real local
`ios/GaryApp/GoogleService-Info.plist` remains uncommitted under the
repository's explicit configuration exception.
