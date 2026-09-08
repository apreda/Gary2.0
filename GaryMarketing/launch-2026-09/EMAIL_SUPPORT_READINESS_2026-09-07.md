# Website email and support readiness — September 7, 2026

Original September 7 audit: read-only configuration/live-site inspection plus a bounded NFL page correction, deployed in `119fa81b8d56b0c231325b748119acfc48c709f6`. Production deployment `dpl_HSiPwa3U8EgkzNdCLioU8MK28Bqg` was Ready and aliased to `www.betwithgary.ai`; the live legacy `/nfl?joined=1#notify` URL showed the board CTA and no email form/promise at about 11:13 PM Eastern. That audit sent no email, created no subscription, opened no private recipient list and changed no DNS, environment, database or provider configuration. The later, separately verified email-table permission repair is recorded below.

**Latest acceptance checkpoint: September 8, 9:47 AM Eastern.** Production website-email storage definitions match the canonical migration, and the server-only excess table permissions have been narrowed and verified. The production-scoped Resend key returns a verified Gary sending domain and enabled Gary webhook; the earlier browser workspace was not representative of those resources. Activation remains off pending the factual mailing address, chosen test inbox and remaining provider/delivery acceptance. See the dated checks below; configuration metadata is not proof of an email reaching an inbox.

## What is actually ready

| Area | Observed evidence | Limit of this evidence |
| --- | --- | --- |
| Sender configuration | September 7 inventoried production environment names only: `RESEND_API_KEY`, `RESEND_EMAIL_DOMAIN`, `EMAIL_TOKEN_SECRET`, `CRON_SECRET`, `RESEND_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL`. September 8 used selected email configuration values in memory for the provider checks below; no secret values were printed, exported or persisted. | Variable presence is not delivery proof. The later scoped provider receipt verifies the sending domain and registered webhook, not inbox acceptance. |
| Recurring email implementation | Website code implements confirmation, daily-board and Sunday-record campaigns, consent versioning, unsubscribe, delivery idempotency/retries, capacity limits and signed provider-event handling. September 8 catalog checks verified the deployed schema and all fourteen function definitions; isolated PostgreSQL tests verified their required operations before the table-permission repair. | Isolated tests and production metadata do not establish live message delivery, inbox acceptance or production webhook processing. |
| Automated schedule | `web/vercel.json` contains daily and Sunday cron schedules. Routes authenticate with `CRON_SECRET`. | The audit did not invoke a campaign or certify successful production cron executions. |
| Public mail DNS | Apex Google Workspace MX and Google SPF are present. A Resend DKIM selector is present. `send.betwithgary.ai` has the Amazon SES MX and SPF records. DMARC exists with `p=none`. | These are public provisioned records, not proof of a verified active Resend sender, authenticated message delivery or functioning support aliases. DMARC monitoring mode is not by itself a launch blocker. |
| Support destinations | `/contact` and `/corrections` expose the public company support mailbox. `/privacy` exposes the privacy address and `/terms` the legal address. The sampled public pages respond successfully. | A working page or domain MX does not prove an individual mailbox/alias exists, can receive a message or is monitored. |
| Local verification | Five website test files passed: 22 tests covering the existing email policies/integration shape/pagination/migration contracts and the corrected NFL destination. | These are isolated local tests, not an end-to-end send or inbox-delivery receipt. |

The subsequent full working-tree website verification passed 384 tests across 54 files, TypeScript and ESLint. This includes other sessions' in-flight website tests, not just this two-file correction. An independent review found no date-redirect, SEO, legacy-link or wording regression.

A final copy-only follow-up, `cab21f177efc282a611972ea8bd76047f36061fe`, also removed older every-game, guaranteed-publication and next-morning-grading language from the NFL page and metadata. It preserves kickoff facts, calculated record values, offer, navigation, date redirect and all pick processes. The final full website check passed 385 tests across 54 files, TypeScript and ESLint. Production `dpl_B1R6d7F2rjM5ypqqEZc5mbmWR27t` was Ready with the real website alias, and the clean live `/nfl` page was browser-verified at about 11:19 PM Eastern: qualified heading/coverage, pending-result explanation and free board link, with no email form. The readiness task's separate Book commit `d52c34a9` is an ancestor of this release; its implementation belongs to that task.

Resend requires an actual verified domain for sending; DNS records alone should not be substituted for that provider status. [Verified domains](https://resend.com/docs/dashboard/domains/introduction). Its production webhook must also be registered with the selected events, beyond having an endpoint and an environment variable. [Managing webhooks](https://resend.com/docs/webhooks/introduction).

## Confirmed missing requirement

`COMPANY_POSTAL_ADDRESS` is absent from the production environment listing. This is the exact variable the website requires; `EMAIL_POSTAL_ADDRESS` is not the implemented name. `web/lib/email/config.ts` returns not-ready without it, and `web/components/EmailSignup.tsx` hides the general signup. Live GETs of `/` and `/contact` confirmed the daily/Sunday signup section is absent.

Adam must supply the approved factual company mailing address before this email flow can be enabled. Do not invent an address or add one from an unrelated document. Setting that variable can activate both the public signup and the existing scheduled campaigns, so activation needs the remaining provider/storage verification and an explicitly authorized test recipient. Do not treat adding the value as a harmless cosmetic change.

## NFL launch promise correction

At audit time, `/nfl` displayed an email form promising exactly one message when the first NFL card posts September 9. The action in `web/app/nfl/actions.ts` inserts into `launch_waitlist`; the website's recurring sender reads the separate confirmed website subscription audience. A bounded repository source search found no website delivery consumer for `launch_waitlist`. An out-of-repository/manual sender was not verified.

The bounded source correction in `web/app/nfl/page.tsx` replaces that new-capture form and the query-string success/error branches with a direct free `/picks/nfl` link and accurate published-analysis copy. It preserves the `#notify` anchor, request-time date behavior and September 9 redirect. It does not change the existing waitlist action, delete records, import recipients, enable email or touch any sports pick process.

Removing new capture would not fulfill a promise already made. The September 8 aggregate check below found no currently stored NFL waitlist subscribers, so this audit has not established an existing stored audience requiring a September 9 delivery or correction. If separate evidence of prior subscribers emerges, Adam owns the scoped follow-up within their actual consent and promise. A one-time kickoff signup is not consent to a daily/Sunday newsletter; do not silently import such an audience into the recurring list or send a catch-up blast.

## Acceptance still needed before promising email

1. Supply the exact approved factual company mailing address. Adam authorized the scoped email activation September 8; that approval need not be requested again, but it does not supply the missing address or test recipient.
2. Domain, sender/reply-to defaults, metadata-usable production key and registered webhook events were verified September 8. Still establish applicable provider capacity and webhook-secret/live event acceptance. The protected secret was not comparable and the private-beta usage endpoint returned no limits; neither is proof of a broken configuration.
3. Website-email storage/migration definitions and the narrowed table grants were verified September 8 without reading recipient rows. All fourteen invoker functions passed isolated PostgreSQL acceptance. Preserve those contracts; this is not a live send test.
4. Use an explicitly authorized owner-controlled test address to verify confirmation receipt, consent activation, the intended campaign, unsubscribe and suppression/event recording. No such test was performed by this audit.
5. Recheck the live signup only after deployment, and record a real delivery/cron receipt before marking the recurring flow operational.
6. Separately verify receipt and reply routing for the public support, privacy and legal addresses. Adam is the launch support owner in the runbook; actual inbox access/coverage and the internal next-business-day review target still need acceptance. Do not publish a response-time guarantee from that internal target.

These open items correspond to C10, C11 and the conditional P12 email row in `LAUNCH_COMPLETION_TRACKER.md`; they are not completed by the source correction.

## September 8 provider-console follow-up

A read-only check of the existing authenticated Resend session, completed around midnight Eastern, exposed a workspace named `betwithgary` under the business identity. Its Domains table contained exactly one unrelated project domain and no `betwithgary.ai` sending domain; Webhooks reported “No webhooks yet.” The team selector listed only this workspace. The default Emails view reported no sent messages within its displayed last-15-days filter; no recipient lists or message contents were opened.

This established a configuration gap in the accessible workspace, not in the production website's API key. The later production-key-scoped check below supersedes that uncertainty about Gary's actual sender domain and webhook. The human-readable workspace name remains unverified. Do not replace DNS, rotate a key, create a duplicate webhook in an unconfirmed workspace or enable campaigns merely to make the earlier screen look ready. No Resend settings, subscriptions, sends or billing were changed.

## September 8 authorization follow-up

Adam's confirmation grants the previously requested scoped email activation authority. The remaining request is factual: **the exact company mailing address to put in Gary's emails and an owner-controlled address authorized to receive confirmation, campaign and unsubscribe tests**. Neither value was supplied by the general approval. Do not infer a home address, use a placeholder or assume a business login address is the chosen delivery-test recipient.

No production environment, provider, DNS, storage or sending setting was changed by this follow-up, and no email test or campaign was sent. Adding `COMPANY_POSTAL_ADDRESS` can activate both signup and existing scheduled campaigns; complete provider/storage checks and define the scoped acceptance plan before enabling it. Account for the scheduled campaign audience and timing, then verify delivery and unsubscribe during controlled activation before declaring the flow operational. The aggregate check below found no current stored NFL audience. If separate evidence of prior one-time subscribers emerges, handle their actual consent and promise separately rather than importing them into recurring email.

## September 8 current-audience check

At **2026-09-08 13:07:30 UTC / 9:07 AM Eastern**, the existing read-only `node scripts/marketing-readiness.js --json` query on the linked production project returned `launch_waitlist` count **0** and an empty status-group result for `web_email_subscriptions` (**zero current stored subscription rows**). The source SQL was reviewed; it counted rows without selecting recipient identities. No records were inserted, changed or deleted, and no email was sent. [Scoped aggregate receipt](evidence/x-introduction-2026-09-08.json).

This removes the presumption that there is a known current stored audience awaiting the September 9 message. It does not prove that no historical/deleted or externally managed audience ever existed. The later checks below verify storage definitions and sender configuration separately; actual delivery and unsubscribe acceptance remain open. Exact mailing address/test-recipient inputs are still required despite the empty tables. Do not populate the list merely to mark readiness complete.

## September 8 production storage verification

Catalog-only queries at **13:29:04 UTC / 9:29 AM Eastern**, reconciled at **13:30:10 UTC**, verified all **9 tables, 67 columns, 46 validated constraints, 18 valid indexes and 14 function bodies/signatures** against the canonical website-email migration. All tables have RLS enabled and forced; public, anonymous and authenticated roles have no table or function grants. Functions remain `SECURITY INVOKER` with fixed search paths and service-role execution. [Sanitized storage receipt](evidence/email-storage-2026-09-08.json).

The applied migration version is `20260903214811`, with name `20260903181433_web_email_updates`; its complete stored SQL matches the canonical file exactly. The different version number is not a missing deployment. Eighteen focused local email tests across four files also passed at 9:31 AM Eastern. No recipient rows or operational singleton state were read and no production function was invoked.

The audit found that default grants left `service_role` with ALL table privileges despite the migration's narrower additive grants. This was not public exposure or a demonstrated delivery failure. It was repaired with the isolated test gate and production verification below.

### Email-only table-permission repair

Migration **`20260908134649_web_email_table_privileges.sql`** is applied. At **13:47:08 UTC / 9:47 AM Eastern**, production readback verified exactly the intended grants on all nine email tables, with all fourteen function bodies/execution permissions unchanged and public denial/forced RLS intact. The source filename was reconciled to the actual applied version; the stored SQL and reviewed file match exactly. [Permission repair receipt](evidence/email-permissions-2026-09-08.json).

The clean regression first failed against the broad grants, then passed **24 PostgreSQL acceptance tests / 42 focused email tests across five suites**, zero skips, with type-checking, focused lint and independent source review passing. The fixtures use a socket-only disposable PostgreSQL 17.10 instance; production is PostgreSQL 15.14. They exercise all fourteen invoker functions, retries/final failures, confirmation, suppression, unsubscribe, leases, capacity and operational cleanup without any actual email provider. Exact ACL checks include the privileges supported by the test server; replay preserves schema, functions, RLS, defaults, unrelated ACLs and cron metadata.

After reconciling the actual applied migration filename, the full current website checkout passed **611 tests / 68 files**, zero skips, route-type generation/type-checking and full ESLint. This includes other sessions' independently owned website fixes; it is not a claim that all 611 tests were added by the email repair.

Post-apply security checks show no email WARN/ERROR findings and the same nine informational “RLS enabled, no policies” notices. That is intentional for these private server-only tables; do not add public policies to suppress an informational notice. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

The migration changes only these nine service-role table grants, atomically with bounded timeouts. It changes no rows, function definitions, RLS, global defaults, schedules, account objects, iOS or sport pick processes. No live email RPC, email send or webhook test event was invoked; provider/env/DNS/billing settings and the activation gate remain unchanged.

## September 8 production-key-scoped provider verification

At **13:33:04 UTC / 9:33 AM Eastern**, the current production-scoped website key was used entirely in memory for documented read-only metadata requests. The correct Vercel project owns both apex and `www` domains. Resend returned exactly one domain, **`betwithgary.ai`, verified, sending enabled**, and exactly one **enabled** webhook at `https://www.betwithgary.ai/api/webhooks/resend`, subscribed to `email.delivered`, `email.bounced`, `email.complained`, `email.failed` and `email.suppressed`. Neither list had another page. [Sanitized provider receipt](evidence/email-provider-2026-09-08.json).

There are no explicit sender/reply-to overrides in that production configuration; current source defaults resolve to `Gary AI <updates@betwithgary.ai>` and `support@betwithgary.ai`. The mailing address is still absent. This verifies current configured resources, not a captured environment snapshot inside the running deployment or actual inbox delivery. It does not establish the human-readable provider workspace name.

At **13:35:41 UTC / 9:35 AM Eastern**, the configured webhook secret was present but protected as sensitive; the supported retrieval did not expose a usable value, so no comparison was performed. That is not evidence of a mismatch. The documented aggregate usage endpoint returned HTTP 404 with no limits and is currently private beta. Capacity remains unverified; no alternate secret extraction, upgrade, beta enrollment or plan change was attempted. [Webhook retrieval](https://resend.com/docs/api-reference/webhooks/get-webhook); [usage availability](https://resend.com/docs/api-reference/usage/retrieve-usage).

No secret was printed, exported or persisted, and no recipient/message data, email send, webhook test event, provider setting, environment, DNS or billing change was involved. Controlled confirmation/campaign/unsubscribe/event receipts still require the approved factual address and an explicitly chosen owner-controlled test inbox.
