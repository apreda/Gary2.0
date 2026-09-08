# App Review package — Gary AI 2.25 / candidate 912

Prepared September 8, 2026. **Draft; not submitted.** Candidate 912 preserves verified team-score labels and leaves ambiguous archived score strings unlabeled rather than assigning scores to the wrong team. It includes the completed 909–911 feature, access, privacy and reliability changes. Native source `7745aada` is committed and pushed. Optimized simulator build and signed archive pass; strict/deep signature and all 21 privacy manifests / 14 data categories are verified at 07:09:41 UTC. Upload succeeded at **07:11:57.117 UTC / 03:11 ET**; official Apple emails verified in the September 8 heartbeat confirm processing completed at **07:14:08 UTC** and TestFlight availability to the existing recipient at **07:13:44 UTC**. App Review selection, approval, all-group membership and device acceptance remain unverified. This package supersedes the draft for 911; do not reuse the older crash-only What's New text.

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

Improved Home, Picks and Hub loading and scrolling. Added profile reporting and blocking, clearer empty Winners boards, reliable links from game alerts, and separate optional reading analytics. Save private preferences without claiming a public handle. Fixed game-detail matching, historical score labels, Settings navigation and date changes while the app stays open.

## Store listing

Use the truthful product description in `APP_REVIEW_2_25_901.md` as the base, with these additions where space permits:

- Explore available Fantasy player and lineup analysis alongside game predictions.
- Report or block public profiles and manage your blocked list.

Retain variable-coverage language, the accurate October offer, personal-tracking boundaries, the 18+ audience and the fallibility of predictions. Do not promise sportsbook syncing, AI chat, a fixed number of Winners, guaranteed results, universal prop markets or unverified partnerships.

## Candidate evidence and remaining release gates

- Native 912 has 79 unique focused score-display and compatibility tests passing, plus the optimized simulator build and signed archive. Archive: `/Volumes/KINGSTON/Gary-2.25-912-Launch.xcarchive`.
- Signed inventory matches 911: 21 valid manifests, 14 collected-data categories, no tracking or tracking domains. System Boot Time / `35F9.1` and linked Customer Support / App Functionality remain present. Archive inventory does not update App Store Connect privacy labels.
- The web source is now `04647d9f`, verified live with 504 tests / 64 files, TypeScript and full lint after the attribution repair. Prior fixture SSR acceptance remains recorded for `04635425`. Backend football repairs have their own final source/test receipt in the readiness ledger.
- Prior actual guest UI checks are from 909. The changed labels/forms and full reading/accessibility journey need new visible acceptance after Mac access is restored. Accurate final store screenshot selection/export is still required.
- Verify physical sign-in/recovery, notification delivery/account transitions, storefront access and billing management, and authorized disposable-account Book/profile/deletion flows.
- Confirm actual moderation/support coverage and dedicated review-account access. Do not treat this draft as proof of staffing or successful review-account sign-in.
- Reconcile the complete signed privacy inventory in App Store Connect, verify intended build selection, then apply this package and accurate screenshots. No change to the prior 901 submission is claimed.

Current release status and precise receipts: [launch readiness ledger](../docs/launch/READINESS_2026-09-07.md). The live portal configuration was inspected read-only: cancellation and payment/customer/invoice management enabled; subscription plan changes disabled. No customer session, purchase or subscription change was used for QA.
