# September 5 launch execution

Continues Adam's approved launch order and the September 4 readiness handoff. This records observed completion separately from missing account access and provider funding. Source commit/push and web deployment are coordinated with the existing “Verify Astra capabilities” task to avoid shared-checkout races.

## Private X draft reliability shipped

- `engagement-sheet` v7 ACTIVE, deployed September 5 at 11:47:53 UTC. All four deployed files exactly match local source, including the shared weekly NFL pick merger. JWT gateway verification stays off for the private phone page; its existing fail-closed `SHEET_TOKEN` gate remains required.
- X search has a 20-second request timeout; draft requests have a 30-second timeout. Account-credit/auth/rate/timeout failures stop the batch. Empty, partial-failure and failed-storage batches preserve the existing sheet. Successful replacements use a transaction and per-date lock through a service-role-only invoker RPC.
- New database migration: `20260905114747_reliable_engagement_sheet.sql`, applied and recorded remotely. `anon` and `authenticated` cannot execute the RPC; `service_role` can. Existing draft tables remain private under RLS. The advisor's no-policy notice is expected for these service-only tables; unrelated baseline notices were not treated as fixes made by this task. [Supabase notice explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- Replies receive pick facts only for a unique full-team-name match; generic words such as “State” no longer attach unrelated picks. Voice instructions identify Gary truthfully as an AI product character and forbid invented personal experiences, wagers and partnerships.
- Checks: all 168 edge tests passed, three real isolated-PostgreSQL cases passed, and Deno type-check passed. The database cases verify transaction rollback after deletion, date scope, input rejection and role privileges.
- Live private smoke: invalid token **401**, authorized page **200**. Actual generation found 11 candidates and stopped after one provider request with **503 / MODEL_CREDITS_UNAVAILABLE**. Generated 0; existing sheet preserved. No X post or reply was sent. Private drafts remain stale until the existing Anthropic account has credits. The regular game poster is separate and its existing schedule is unchanged.

## Public company profiles

Instagram `@betwithgary.ai` is an existing Business Account, category Arts & entertainment, linked to the Gary A.I Facebook page. Observed 33 posts, 70 followers, latest visible grid post March 19. Saved and reloaded bio:

> AI sports picks with reasoning. Wins and losses on the record. Track your own Book. Built by a sports fan. 21+

Instagram Account Status reports no reach restrictions and recommendation eligibility. It also explicitly says under-18s can see the account. Requested the mobile-only default minimum age of 21; no saved age change has been verified. Mobile link editing is also required to set/verify the company website. Current Terms' domain-name-in-username consent requirement remains to reconcile for the existing handle; no rename or permission claim was made.

X `@BetwithGary` had 130 followers at inspection. Its stale NHL/every-game bio was replaced with:

> AI sports picks with reasoning. Wins and losses on the record. Track your own Book. Free game picks. Built by a sports fan. 21+

The website now goes directly to `https://www.betwithgary.ai/picks?utm_source=x&utm_content=bio_v1`. This is a web referral, not install attribution. The outdated September 1 season-offer post was unpinned; it was not deleted. Prepared replacement copy is in the content README. No new posts or schedules were created.

Current Meta organic and ad rules were read directly on September 5. The runbook now separates an adult editorial rollout from ads requiring authorization. TikTok remains dependent on an identified company account and applicable business approval; its licensed gambling route is not satisfied by a 21+ caption. No account was created, paid campaign booked or partner contacted.

## App Store and public privacy

Build 2.25/899 was uploaded in the previous pass. The existing Chrome App Store page was cached; navigation/reload confirmed the Apple session had expired. Requested sign-in. Processing, attachment to the review version, live privacy answers, questionnaire and release mode remain unverified.

Google's current official disclosure page confirms that sign-in can estimate general location from IP for fraud prevention without device-location permission. The public privacy source was clarified accordingly and dated September 5; web type-check passed. The build-899 review package now explicitly adds Coarse Location to the ASC draft and records remaining SDK category reconciliation. No new binary was needed for that public policy clarification. [Google guidance](https://developers.google.com/identity/sign-in/ios/app-privacy)

## Remaining concrete actions

1. Restore App Store Connect sign-in so the uploaded build and actual submission settings can be verified and completed. Reconcile conditional SDK categories before certifying the privacy label.
2. Save Instagram's minimum-age control at 21 in the mobile app, verify its website link, and resolve the existing domain-form username. Then use the prepared introductory assets in the permitted editorial workflow.
3. Restore credit on the existing Anthropic content account and run one private generation to verify fresh drafts; no funding or model change was made here.
4. Publish the prepared replacement product pin and introductory campaign pieces after final editorial review. Record real URLs and measured useful sessions; no current audience results have been invented.
5. Identify the TikTok company account and resolve its eligibility before posting the prepared founder scripts. Record founder footage. Use the integration packet only after the stated audience evidence exists.

The other existing task owns the September 5 board/football recovery and daemon restarts; see its separate handoff. Preserve the real local `ios/GaryApp/GoogleService-Info.plist` outside commits. Final source push and Vercel deployment evidence are reported by the coordinated commit task; this document does not infer production web completion from a local edit.
