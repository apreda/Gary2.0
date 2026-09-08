# App Review package — Gary AI 2.25 / candidate 911

Prepared September 8, 2026. **Draft; not submitted.** Candidate 911 completes private preference editing and corrects personal Book history/open-slip presentation. Its optimized simulator build and integrated tests pass; signed archive, strict/deep signature and privacy inventory pass; upload succeeded at **06:21:31.199 UTC** on September 8, with Apple reporting processing. Source: `04635425`. The preceding 910 upload succeeded at **05:54:41.786 UTC**, and 909 uploaded at 05:42:00 UTC on September 8. Processing completion, internal TestFlight availability and selection for App Review remain unverified. The earlier 901 submission and uploaded 908 build are separate records. Do not reuse the older crash-only What's New text for this candidate.

## Notes for Review

Gary is an AI sports analysis and personal bet-tracking app from Gary A.I. LLC. It displays predictions, sportsbook prices, written reasoning and historical results. It does not accept wagering deposits, place real-money bets, connect sportsbook accounts or award cash prizes. Book entries record user decisions and hypothetical unit results; they are not wagers placed through Gary.

Public features include Home, Picks, Hub player/team information, Fantasy analysis and Billfold's historical record. Coverage varies by sport and season. A scheduled game can appear before its analysis is published. Winners contains a smaller set of reviewed game and prop selections and can have no selections for a slate.

Use the dedicated account in Sign-In Information for account features. Accept the welcome notice, then open Billfold > You > Sign in. An account adds Your Book, private manual entries, CSV export, profile/preferences and an optional public leaderboard. Favorite sports and Book display preferences can be saved without claiming a public handle. A handle is required to create a profile with an avatar/bio or join public rankings. Public profiles show a handle, avatar, bio and verified record. Private stakes, notes and outside bets do not affect public rankings. No purchase is required for the review account.

To check the product: open Picks, choose a supported sport and a published game, then read its original reasoning. Explore a Hub player or team read. Open Billfold > Gary for historical results and Billfold > You for your own book. The leaderboard uses qualified, opted-in public records; an empty ranking is a valid state. In another public profile, signed-in users can report or block the profile; blocked profiles can be managed from the Board. Profile text is filtered on the server, and reports enter a private moderation queue. Support and appeals are available at support@betwithgary.ai.

Winners has a free launch preview through September 30, 2026. Accounts created before October 1, 2026 at midnight America/New_York retain founding access. Eligible later accounts may purchase recurring sport or All-Access passes through Stripe. The selected price, renewal terms and any eligible trial appear before checkout. The server prevents charging accounts for access they already have. External purchase plans and checkout require the USA Apple storefront. Existing access and billing management remain available in other storefronts. The live billing portal permits cancellation and payment-method management; subscription plan changes are disabled. This scheduled October transition is part of the product described for review.

Settings includes separate, off-by-default choices for checkout analytics and reading analytics. Share reading analytics counts sessions and expanded original game/prop card reasoning visible for five continuous foreground seconds on the instrumented card surfaces in Home, Winners and Picks. It uses a random in-memory session ID, with no account or notification ID, pick details, stakes or reasoning text, and does not link visits across app launches. Neither optional measurement choice is required to use Gary.

Notification permission is optional. If enabled, Gary uses Firebase Cloud Messaging and the disclosed account/installation identifiers for delivery; neither analytics choice is required for notifications. Community rules, support and appeals are available at https://www.betwithgary.ai/terms#profile-safety.

Apple, Google and email sign-in are available. Forgot Password opens Gary's website in the user's browser and explains the return to the app. Settings includes account deletion. Successful deletion removes account data, cancels Gary subscriptions and clears local consent/session state. Apple-linked accounts without retained revocation tokens receive Apple's manual authorization-removal guidance after Gary deletion succeeds. Please use a disposable account for deletion testing rather than deleting the dedicated review account.

## What's New

Improved Home, Picks and Hub loading and scrolling. Added profile reporting and blocking, clearer empty Winners boards, reliable links from game alerts, and separate optional reading analytics. Save private preferences without claiming a public handle. Fixed game-detail matching, Settings navigation and date changes while the app stays open.

## Store listing

Use the truthful product description in `APP_REVIEW_2_25_901.md` as the base, with these additions where space permits:

- Explore available Fantasy player and lineup analysis alongside game predictions.
- Report or block public profiles and manage your blocked list.

Retain variable-coverage language, the accurate October offer, personal-tracking boundaries, the 18+ audience and the fallibility of predictions. Do not promise sportsbook syncing, AI chat, a fixed number of Winners, guaranteed results, universal prop markets or unverified partnerships.

## Candidate evidence and remaining release gates

- 911 source `04635425` passes 2,769 backend tests / 291 files, 484 web tests / 64 files, TypeScript and its optimized simulator build. The native zero/unset unit preference reopens correctly; saved public identities are preserved. Signed 911 archive/privacy/signature checks pass at 06:19:12 UTC, with all 21 manifests / 14 categories matching signed 910. Upload succeeded at **06:21:31.199 UTC**; `/Volumes/KINGSTON/gary-911-upload.log`. Changed-form UI and Apple processing/selection receipts remain pending.
- Build 910 source is committed and pushed as `e88b70ce`. It clarifies team streak context and labels the stored next opponent explicitly; it changes no pick, grading, provider or privacy behavior. Final optimized simulator build, signed archive and strict/deep signature pass. All 21 manifests / 14 categories match signed 909. Upload succeeded at **05:54:41.786 UTC**; `/Volumes/KINGSTON/gary-910-upload.log`. The changed-label UI check is pending Mac unlock, and Apple processing completion/selection remains unverified.
- Complete: optimized simulator build, signed 909 archive, strict/deep code-signature verification and successful upload. Archive: `/Volumes/KINGSTON/Gary-2.25-909-Launch.xcarchive`; upload log: `/Volumes/KINGSTON/gary-909-upload.log`.
- Complete: signed archive inventory has 21 valid manifests, a 14-category collected-data union, no tracking or tracking domains. The root manifest matches canonical source and declares System Boot Time / `35F9.1` and Customer Support linked to the user for App Functionality.
- Still required: mirror the Customer Support classification in App Store Connect and reconcile the complete label against the signed inventory. Local manifest compliance does not update App Store Connect automatically.
- Actual 909 iPhone SE and iPhone 17 QA screenshots are retained in the launch workspace's `launch-readiness/909-ui-evidence/`. Store screenshot selection/export and remaining physical-device checks are not complete.
- Final device checks for sign-in/recovery, notification delivery and account transitions, storefront access and billing management.
- Confirmed moderation/support coverage and dedicated review-account access.
- Fresh App Store Connect processing, selected build, review metadata and submission status.

The live portal configuration was inspected read-only at 2026-09-08 04:21:52 UTC. Its single active live default has cancellation/invoice/payment-method/customer updates enabled and subscription updates disabled. See `launch-readiness/billing-portal-audit-2026-09-08.md` in the launch workspace for the sanitized receipt. No customer data, portal session or subscription was created or changed for that check.
