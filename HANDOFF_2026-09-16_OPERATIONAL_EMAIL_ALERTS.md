# September 16: ordinary failure monitoring and email

Adam authorized replacing the deleted five-minute Codex heartbeat with ordinary code and selected email. Recipient: `apreda31@gmail.com`. Sender: `Gary Operations <alerts@betwithgary.ai>`, using the existing verified Resend domain/account. Do not recreate `gary-posting-failures` or start another AI monitor.

## Live operation

`com.gary.operational-alerts` runs the pinned Node 22 collector every 60 seconds in the canonical Mac checkout. It reads scheduler logs, durable required-data incidents, the scheduler heartbeat, and the host coverage report. It never calls a model, sports provider or X, runs a pick, or restarts the scheduler. Existing pick workers were not restarted to install it.

The service-only `report_operational_health` RPC records observations. Cloud cron `gary-operational-alerts` calls `gary_ops.tick()` each minute. New incidents and confirmed recoveries enqueue an email; unchanged observations produce none. Game/prop failures normally reach the next collector plus cloud tick, roughly one to two minutes. Existing coverage checks run every ten minutes; the collector forwards failures and detects reports older than fifteen minutes. A missing host report for five minutes generates a cloud alert even if the laptop is offline. Scheduler heartbeat gaps are detected after three minutes.

X's existing fifteen-minute schedule and 120-second timeout are preserved. Its command now calls `gary_ops.enqueue_social()` to retain the normal request ID. The monitor reads the resulting pg_net response, including non-JSON gateway errors, timeouts, HTTP errors and degraded health. It also checks stale/missing posting cron runs and unresolved publication receipts. It does not invoke the poster itself. Current writer remains v117.

## Durability and boundaries

- Private `gary_ops` tables contain settings, host observations, incidents, transition events, email attempts and social request receipts. RLS is enabled; public/app roles have no schema access. Configuration, enable/disable and ingestion RPCs allow service_role only, with fixed search paths. Tests deny anon/authenticated access.
- The existing Resend API key was transferred directly from production configuration into Supabase Vault through a service-only RPC. No key was printed or committed. Public email signup/campaign settings are unchanged.
- Retries retain the identical email body and idempotency key. API acceptance is stored with the provider ID. Unconfirmed sends stop after 23 hours, before the provider's 24-hour deduplication window expires. Inspect the mail ledger before retrying. Database/email outages can delay alerts; this cannot guarantee detection of every infrastructure failure.
- Errors are classified into bounded descriptions; raw prompts, provider messages and tokens are not emailed. Exact game ID and lane distinguish games, props and doubleheaders. Only a verified stored outcome or accepted props pass clears that game's scheduler failure. Another game's success, exit zero, missing/truncated logs, or date rollover is not recovery evidence.
- Older date-scoped incidents remain open for inspection instead of being marked recovered at midnight. The collector observes recorded failure/data/coverage signals; it does not independently prove every upstream stat or model login is valid. NCAAF piggyback required-data failures use durable incident files.
- Enabling sends one connection-test event, grouped with already-observed incidents. Setup found retained Yankees–Twins authentication-related props failure and Giants–Cardinals later props retry failure (props had already stored at 11:12 ET). These were existing job incidents, not a claim both games lacked picks. This change does not repair provider authentication.

## Controls and proof

Preview with `node scripts/run-operational-alerts.js --dry-run`. Launchd writes `~/Library/Logs/Gary2.0/operational-alerts.log` and `operational-alerts-error.log`.

Service-only `set_operational_email_enabled(false)` stops delivery; `true` resumes and queues one connection test. Cron returns immediately while disabled. Recipient/key changes use `configure_operational_email`; never put keys in SQL history or task output.

Inspect `gary_ops.settings.last_tick_at`, `gary_ops.host.received_at`, unresolved `gary_ops.incidents`, `gary_ops.mail.accepted_at/provider_id/last_error`, and cron run status. An enqueue alone is not delivery proof.

The real scheduled cloud tick sent the setup digest at **14:51 ET**. Gmail confirmed it arrived in Adam's inbox: message `1a0ab8ee051d00d4`, subject `Gary operations: 3 update(s)`. This includes the connection test and two retained props failures. Mail ledger id: `82f9c7f8-4af6-4e8e-86d3-5712c70cf64c`; Resend id `01a0ab8e-db82-720d-aa33-ca1ee3764eb9`, accepted on the next 14:52 tick with one send attempt and no duplicate.

Validation: 14 focused parser/PostgreSQL tests passed, including exact-game recovery, doubleheader isolation, safe descriptions, role denial, healthy silence, gateway errors, missing heartbeat, stale X receipts, idempotent retry and enable/disable. The full backend suite passed 390 files / 4,261 tests before the final control-only test was added; that test passed separately. Security advisors show only the intentional private RLS/no-policy INFOs for the new tables, with no new warning for these functions. Production-truth still reports the pre-existing missing local Supabase CLI login; deployment, cron and mail evidence were checked through the authenticated connector. The private iOS plist remains intentionally uncommitted.
