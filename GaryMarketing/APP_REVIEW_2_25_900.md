# App Review package — Gary AI 2.25 / build 900

Prepared September 5, 2026 after verifying the final signed archive and successful upload. This supersedes build 899 as the intended submission candidate. It does not establish that Apple has finished processing it, attached it to review or approved it.

## Verified binary and upload

- Release archive: `/tmp/GaryApp-Reliability-2.25-900.xcarchive`.
- Archive `Info.plist` confirms version **2.25**, build **900**. Deep, strict code-signature verification passed.
- The reliability task reports the final archive includes `f97de41a`, `990e6041` and `42e17e1c`. The last change removes Home's unverified Winners count and expected seal time; its fallback now says “Selections appear after review · games + props.” These source changes do not establish that a reviewed Winners ticket exists.
- Xcode log `/tmp/gary-reliability-900-upload.log` records **Upload succeeded**, **EXPORT SUCCEEDED**, and **Uploaded package is processing** at September 5, **11:03:46 AM Eastern**.
- The 21 archived privacy manifests exactly match the 899 archive for **every plist key**, including collected types, linked/tracking flags, purposes and required-reason API declarations. The current extraction is [PRIVACY_INVENTORY_2_25_900.json](PRIVACY_INVENTORY_2_25_900.json); the comparison and binary hash are in [the verification evidence](launch-2026-09/evidence/privacy-900-archive-verification.json).
- Matching manifests establish declaration parity, not proof of runtime SDK behavior. No new device/provider network trace or interactive account-deletion/sign-in test was performed in this verification.

## Current launch blocker

At approximately 10:54–10:55 AM Eastern, the reliability and database tasks observed application REST/SQL timeouts. This supersedes the earlier healthy morning checks. Task “Investigate Gary picks on Astra” owns recovery; it reported pausing only the routine daily-insights agent. The scheduler and Winners agents remain owned by their existing task. The reported cause is not established.

Do not advance review/release readiness from a successful archive or a provider control-panel health label. First verify the restored live signed-out game journey, account/Book access, Winners empty versus error behavior and publication-health coverage. This task does not add database load or change recovery controls while recovery is owned elsewhere.

## Copy for Notes for Review

Gary is an AI sports analysis and personal bet-tracking app. It displays sportsbook prices, betting picks and performance records. It does not take wagering deposits, place real-money bets, withdraw funds or connect sportsbook accounts. The company providing the service is Gary A.I. LLC; please verify the organization account information associated with this submission.

The free experience includes public game picks, player/team information in the Hub and historical results. MLB, NFL and NCAAF are the current active coverage; NBA is seasonal. A game may be listed before its pick is published. Player props depend on available markets. Winners is a smaller evidence-reviewed set of published tickets; its board can legitimately be empty.

An optional account enables Your Book, profile/preferences, verified rides and fades, private manual entries, CSV export and an opt-in public leaderboard. The leaderboard uses system-graded receipts; manual entries remain private and do not affect rank. Please use the dedicated test account in App Review Information for account features. Do not use a customer account.

The Winners launch preview runs through September 30, 2026. Accounts created before October 1, 2026 at midnight America/New_York retain founding access. Later eligible accounts may buy recurring sport or All-Access passes through Stripe checkout; plans and any available trial are disclosed before purchase. The server controls access and blocks duplicate purchases or charging an account for its included founding access. Billing management opens that account's Stripe portal. There are no StoreKit consumable wagering credits or wagers.

This is a scheduled access transition in the submitted product. During the September preview, a founding account is intentionally not eligible for purchase. Please contact us if additional access is required to evaluate the later paid flow. We will provide an agreed review path rather than make undisclosed reviewer-specific changes. This release shows the external-purchase plan screen only for an Apple storefront whose country code is USA. Unknown and other storefronts show availability information without an external purchase link. The checkout call independently rechecks the storefront before it requests a session. Existing account access and billing management remain available.

Settings includes Privacy Policy, Terms, Responsible Gambling, support, account deletion and an optional Share product analytics toggle that is off by default. Turning it off stops future optional plan/checkout events. Account, billing and permitted push delivery remain functional. Account deletion cancels the account's Gary subscriptions, removes account data and clears the local session. For Apple-linked accounts whose revocation tokens were not retained, completion links to Apple's manual permission-removal instructions after Gary deletion succeeds, following TN3194. This does not delay deleting the Gary account.


## Review access and walkthrough

Use the [dedicated review-account instructions and full walkthrough in the 899 package](APP_REVIEW_2_25_899.md#dedicated-review-access) on **build 900**, after database recovery. Keep credentials solely in App Store Connect. The prior unit/deletion checks remain historical evidence and are not substitutes for testing this exact build's live account, provider and billing paths.

## Privacy and App Store Connect reconciliation

Carry forward the [899 privacy inventory discussion and September 5 SDK reconciliation](APP_REVIEW_2_25_899.md#privacy-label-inventory), using the new archive inventory above. Manifest parity does not resolve the remaining conditional GoogleSignIn categories: Phone Number, Other Usage Data, Other Data Types and identifier Analytics purposes. Preserve the documented coarse-location and functional SDK diagnostics disclosures. Do not certify the eight app-owned types as the entire SDK inventory.

App Store Connect sign-in was unavailable at the last browser check. Processing completion, attached build, live privacy answers, organization seller, distribution territories, truthful age questionnaire, release mode and reviewer access remain unverified. Reconcile the actual live submission before changing it. Do not infer these settings from an upload log or local notes.

The account-based October 1 midnight America/New_York cutoff and September preview remain unchanged. The actual U.S. storefront checkout gating, provider handling, subscription terms and applicable distribution conditions still require the device/live checks listed in the [prior release gates](APP_REVIEW_2_25_899.md#release-gates-and-unresolved-external-items). No new claim of Apple approval, import capability or sportsbook partnership is made.
