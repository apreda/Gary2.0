# App Review package — Gary AI 2.25 / build 899

Prepared September 4; updated September 5, 2026. Working source and review instructions, not evidence of App Store Connect changes. Adam authorized completing the launch fixes in the current task. This file does not establish that a review submission, withdrawal, release-setting change or reviewer message occurred.

## Submission state to reconcile

The latest pre-work handoff has 896 in the review slot and 898 archived. This pass prepares 899. App Store Connect must identify the actual attached build, questionnaire, seller, territories and release setting before any submission action. Previous reports conflict on automatic versus manual release. Do not infer live state from these documents.

## Copy for Notes for Review

Gary is an AI sports analysis and personal bet-tracking app. It displays sportsbook prices, betting picks and performance records. It does not take wagering deposits, place real-money bets, withdraw funds or connect sportsbook accounts. The company providing the service is Gary A.I. LLC; please verify the organization account information associated with this submission.

The free experience includes public game picks, player/team information in the Hub and historical results. MLB, NFL and NCAAF are the current active coverage; NBA is seasonal. A game may be listed before its pick is published. Player props depend on available markets. Winners is a smaller evidence-reviewed set of published tickets; its board can legitimately be empty.

An optional account enables Your Book, profile/preferences, verified rides and fades, private manual entries, CSV export and an opt-in public leaderboard. The leaderboard uses system-graded receipts; manual entries remain private and do not affect rank. Please use the dedicated test account in App Review Information for account features. Do not use a customer account.

The Winners launch preview runs through September 30, 2026. Accounts created before October 1, 2026 at midnight America/New_York retain founding access. Later eligible accounts may buy recurring sport or All-Access passes through Stripe checkout; plans and any available trial are disclosed before purchase. The server controls access and blocks duplicate purchases or charging an account for its included founding access. Billing management opens that account's Stripe portal. There are no StoreKit consumable wagering credits or wagers.

This is a scheduled access transition in the submitted product. During the September preview, a founding account is intentionally not eligible for purchase. Please contact us if additional access is required to evaluate the later paid flow. We will provide an agreed review path rather than make undisclosed reviewer-specific changes. This release shows the external-purchase plan screen only for an Apple storefront whose country code is USA. Unknown and other storefronts show availability information without an external purchase link. The checkout call independently rechecks the storefront before it requests a session. Existing account access and billing management remain available.

Settings includes Privacy Policy, Terms, Responsible Gambling, support, account deletion and an optional Share product analytics toggle that is off by default. Turning it off stops future optional plan/checkout events. Account, billing and permitted push delivery remain functional. Account deletion cancels the account's Gary subscriptions, removes account data and clears the local session. For Apple-linked accounts whose revocation tokens were not retained, completion links to Apple's manual permission-removal instructions after Gary deletion succeeds, following TN3194. This does not delay deleting the Gary account.

## Dedicated review access

Keep the dedicated review account's credentials in App Store Connect's Sign-In Information, not this repository. Verify the password on the exact release before submission. The existing account is expected to have founding access based on its actual creation date. Do not manufacture paid entitlement or payment success for the reviewer. Sign in with Apple and Google are independently available and must be tested on an actual device.

## Reviewer walkthrough

1. Cold launch signed out. Browse Home → a published matchup → its pick reasoning. Verify a scheduled matchup without a published pick communicates its state.
2. Open Hub and a player/team card; browse Results. Record reporting scope and pending grades should be visible. Do not use a home-run or touchdown fun lane as proof of the tracked core record.
3. Sign in using the review account. Open Your Book, add a clearly labeled temporary manual test entry, edit its result, export CSV, then delete that entry. Manual entry does not create a sportsbook wager or a public leaderboard result.
4. Open profile/preferences. Verify changes persist after a fresh sign-in. Public leaderboard is opt-in; qualifying system-graded activity is required to rank.
5. Open Winners. Verify current preview/founding access. Check an empty board and a network failure as different states. Review the future paid transition separately with Apple if requested.
6. Settings → Privacy → Share product analytics starts off. Verify on and off choices persist; no analytics data is required for functionality.
7. On a disposable account only, use Settings → Delete Account. Verify account removal and signed-out state. Apple-linked accounts receive Apple authorization-removal guidance. Subscription cancellation tests use Stripe test mode; never delete the dedicated review login or charge a live customer for QA.

## Privacy label inventory

Gary's application manifest declares the following collected types. All are marked not used for cross-app advertising tracking; account-linked variants are marked linked. Account creation or opt-in does not make ongoing collection exempt from disclosure.

| ASC data type | Actual use | Purpose |
| --- | --- | --- |
| Name | Optional provider/profile name | App functionality |
| Email address | Authentication/account communication | App functionality |
| User ID | Account, access, profile; optional signed-in plan events | App functionality; analytics when enabled |
| Device ID | Push token and functional installation identifier | App functionality |
| Other user content | Profile bio, manual bet details/notes, preferences, verified selections | App functionality |
| Other financial information | Unit stakes, personal odds/results and unit-to-dollar display preference | App functionality |
| Purchase history | Plan/customer/subscription and payment status | App functionality |
| Product interaction | Optional plan views, plan choices and checkout steps | Analytics |

No full card number, sportsbook credentials, advertising identifier or precise location is requested by Gary. Stripe checkout processes payment details; review webview disclosure requirements and provider data separately. The manifest does not replace ASC answers.

The signed archive's actual bundled declarations are extracted in `PRIVACY_INVENTORY_2_25_899.json`. GoogleDataTransport and Firebase declare Other Diagnostic Data; Firebase Messaging also declares Other Data Types. GoogleSignIn declares Name, Email, Phone Number, Coarse Location, User ID, Device ID, Other Data Types and Other Usage Data. These are SDK declarations, which can include conditional behavior; they are not evidence Gary requests phone or location permissions. Gary uses basic Google sign-in without extra phone/location scopes. Reconcile these categories against the exact SDK usage before final ASC certification rather than treating the eight app-owned rows as the entire inventory. Gary initializes Firebase only after notification permission, disables its optional default collection, and does not link Firebase Analytics. Google sign-in is invoked when the user selects that provider; the first-party analytics toggle does not claim to stop required provider service diagnostics.

### September 5 SDK reconciliation

The absence of a device-location permission does **not** justify omitting Coarse Location. Google documents IP-based general-location estimation for sign-in fraud prevention. Add **Coarse Location → App Functionality → linked → not tracking** to the ASC draft, consistent with the signed GoogleSignIn manifest. The public privacy page now explicitly describes this IP-based use. [Google's sign-in disclosure guidance](https://developers.google.com/identity/sign-in/ios/app-privacy)

For Firebase, GoogleDataTransport always collects SDK-quality diagnostics; retain **Other Diagnostic Data**, not linked, with the manifest's Analytics and App Functionality purposes as applicable. Messaging retains its push/install identifiers and subscription metadata despite disabling optional default collection. The optional Firebase user-agent collection is disabled in 899, and notification-interaction analytics is not linked. [Firebase collection guidance](https://firebase.google.com/docs/ios/app-store-data-collection)

The remaining GoogleSignIn declarations for Phone Number, Other Usage Data, Other Data Types and identifier Analytics purposes still require exact SDK-use reconciliation before final certification. Do not silently omit them or assert that the first-party analytics toggle disables Google's service processing. The archive inventory supplies the declared linked/tracking/purpose values. A native device/provider trace or explicit provider clarification can resolve conditional behavior; no such trace was performed here.

On September 5, Chrome initially displayed a cached organization Apps page, but opening Gary and reloading confirmed the Apple session had expired. Build 899 upload success is recorded; processing, build attachment, live privacy answers, age questionnaire and release mode remain unverified until sign-in is restored.

The updated public policy includes iOS consent, account-owned preferences, opt-in leaderboard, billing and deletion. Anonymous/legacy installation events are not falsely claimed to be removed through an account-only request. Account-linked `app_events` are explicitly removed by the deletion handler; pseudonymous legacy installations need their matching identifier to resolve a separate deletion request.

## Release gates and unresolved external items

- Verify organization seller and full, truthful content questionnaire. Apple's previous instruction required Gambling=Yes for this app; an 18+ override is not a substitute. Recheck contest/simulated-gambling classifications based on actual features.
- Confirm distribution territories. Release checkout and its purchase UI now require the U.S. Apple storefront, with unknown/non-U.S. storefronts failing closed. This gate is not a certification that all regional regulatory or multiplatform-access requirements have been satisfied; review those before expanding paid distribution.
- Replace retired bridge screenshots with the exact release's Home, pick reasoning, Winners, Your Book and public record. Use fictitious review data, not customer records. Label paid/preview features clearly.
- Update the public privacy label from Data Not Collected using the inventory and archive report. Confirm the public legal/support URLs respond and the named support mailboxes are staffed.
- Check fresh, repeat and hidden-email Sign in with Apple on iPhone and iPad. The new credential-state observer signs out only the matching account on provider revocation; it does not establish server-side Apple token revocation.
- Automatic Apple revocation for new authorizations still needs the company's Apple signing-key/client-secret infrastructure, secure code exchange/token retention and server notifications. No private key was found or requested in this pass, and no token store was fabricated. Existing-account deletion uses Apple's documented manual fallback.
- Confirm subscriptions, cancellation, refunds and trial claims against live Stripe configuration; test only with disposable users and Stripe test mode. No offer price or founding end date is changed by this package.
- Do not promote the new Winners policy as proven profitable. Confidence is model judgment, not a calibrated win probability; label public results with scope, dates and policy era.

## Verification for this pass

Focused validation passed: ten deletion-handler tests; a compiled Swift test for default-off/opt-in/opt-out measurement, property minimization, no signed-out identifier, and USA/unknown/non-USA checkout policy. The deletion function was deployed as version 9 on September 4, 2026 at 6:44:11 PM Eastern, ACTIVE with gateway JWT verification on. An unauthenticated live POST returned HTTP 401 and the real web-origin OPTIONS request returned HTTP 204. A read-only database query confirmed the events table and required service-role delete/filter privileges. No existing account or subscription was modified. Final signed Release archive 899 passed with the storefront and SDK-initialization changes. Its bundled manifest and metadata match the current source. Xcode upload completed September 4, 2026 at 6:53 PM Eastern with EXPORT SUCCEEDED and "Uploaded package is processing"; processing completion and attachment to App Review still require App Store Connect verification. Archive: `/Volumes/KINGSTON/GaryApp-Privacy-2.25-899.xcarchive`. Upload log: `/tmp/gary-privacy-899-upload.log`. The final archive contains 21 privacy manifests; the extracted inventory is saved beside this package. Web TypeScript checks and focused diff whitespace checks passed. No fresh interactive Apple sign-in, reviewer login or app-deletion action on an actual device was performed by this pass. Passing unit checks is not a claim of live App Review approval or device authentication success.

## Primary sources checked September 4, 2026

- Apple review guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple privacy-label definitions: https://developer.apple.com/app-store/app-privacy-details/
- Apple account-deletion guidance: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Apple TN3194: https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple
- Apple age-rating definitions: https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/
- Firebase collection disclosures: https://firebase.google.com/docs/ios/app-store-data-collection
