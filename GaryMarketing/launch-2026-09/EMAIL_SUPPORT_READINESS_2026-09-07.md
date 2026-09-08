# Website email and support readiness — September 7, 2026

Status: read-only configuration/live-site audit plus a bounded NFL page correction, deployed in `119fa81b8d56b0c231325b748119acfc48c709f6`. Production deployment `dpl_HSiPwa3U8EgkzNdCLioU8MK28Bqg` was Ready and aliased to `www.betwithgary.ai`; the live legacy `/nfl?joined=1#notify` URL showed the board CTA and no email form/promise on September 7 at about 11:13 PM Eastern. No email was sent, no subscription was created, no private recipient list was opened, and no DNS, environment, database or provider configuration was changed.

## What is actually ready

| Area | Observed evidence | Limit of this evidence |
| --- | --- | --- |
| Sender configuration | Production environment names include `RESEND_API_KEY`, `RESEND_EMAIL_DOMAIN`, `EMAIL_TOKEN_SECRET`, `CRON_SECRET`, `RESEND_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL`. Values were not read or printed. | Presence is not proof that the values are valid or that delivery works. |
| Recurring email implementation | Website code implements confirmation, daily-board and Sunday-record campaigns, consent versioning, unsubscribe, delivery idempotency/retries, capacity limits and signed provider-event handling. | The current production database migration state and provider-event receipts were not reverified in this audit. |
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

Removing new capture does not fulfill any promise already made. Adam owns the follow-up decision for existing waitlist subscribers before September 9: establish the actual consented audience and an authorized delivery method, or arrange an appropriate scoped correction if the promised message cannot be delivered. A one-time kickoff signup is not consent to a daily/Sunday newsletter. Do not silently import that audience into the recurring list or send a catch-up blast.

## Acceptance still needed before promising email

1. Supply the exact approved factual company mailing address. Adam authorized the scoped email activation September 8; that approval need not be requested again, but it does not supply the missing address or test recipient.
2. Verify the real Resend domain status, configured sender/reply-to identity, usable key, applicable provider capacity and registered webhook event selection for `/api/webhooks/resend`.
3. Verify the current website-email storage/migration contracts without reading or exporting private recipient lists unnecessarily.
4. Use an explicitly authorized owner-controlled test address to verify confirmation receipt, consent activation, the intended campaign, unsubscribe and suppression/event recording. No such test was performed by this audit.
5. Recheck the live signup only after deployment, and record a real delivery/cron receipt before marking the recurring flow operational.
6. Separately verify receipt and reply routing for the public support, privacy and legal addresses. Adam is the launch support owner in the runbook; actual inbox access/coverage and the internal next-business-day review target still need acceptance. Do not publish a response-time guarantee from that internal target.

These open items correspond to C10, C11 and the conditional P12 email row in `LAUNCH_COMPLETION_TRACKER.md`; they are not completed by the source correction.

## September 8 provider-console follow-up

A read-only check of the existing authenticated Resend session, completed around midnight Eastern, exposed a workspace named `betwithgary` under the business identity. Its Domains table contained exactly one unrelated project domain and no `betwithgary.ai` sending domain; Webhooks reported “No webhooks yet.” The team selector listed only this workspace. The default Emails view reported no sent messages within its displayed last-15-days filter; no recipient lists or message contents were opened.

This establishes a configuration gap in the accessible workspace, not the ownership of the production website's API key. The production key-to-workspace mapping was not verified and no secret value was read. It remains possible that production uses a different provider account. Before activation, establish that mapping and verify Gary's actual sender domain and webhook there. Do not replace DNS, rotate a key, create a webhook in an unconfirmed workspace or enable campaigns merely to make this screen look ready. No Resend settings, subscriptions, sends or billing were changed.

## September 8 authorization follow-up

Adam's confirmation grants the previously requested scoped email activation authority. The remaining request is factual: **the exact company mailing address to put in Gary's emails and an owner-controlled address authorized to receive confirmation, campaign and unsubscribe tests**. Neither value was supplied by the general approval. Do not infer a home address, use a placeholder or assume a business login address is the chosen delivery-test recipient.

No production environment, provider, DNS, storage or sending setting was changed by this follow-up, and no email test or campaign was sent. Adding `COMPANY_POSTAL_ADDRESS` can activate both signup and existing scheduled campaigns; complete provider/storage checks and define the scoped acceptance plan before enabling it. Account for the scheduled campaign audience and timing, then verify delivery and unsubscribe during controlled activation before declaring the flow operational. Prior one-time NFL subscribers require their separate consented resolution, not an automatic recurring-list import. Their September 9 promise remains time-sensitive.
