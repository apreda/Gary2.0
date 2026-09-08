# App Review package — Gary AI 2.25 / candidate 913

**Historical package:** candidate 915 and current saved App Store state are documented in [the 915 package](APP_REVIEW_2_25_915.md). The dated status below is preserved as evidence, not the current release decision.

Prepared September 8, 2026. **Historical draft; not applied or submitted.** The [914 package](APP_REVIEW_2_25_914.md) now holds candidate submission copy. Native 913 source `9cb29134` is committed and pushed. Build 913 brings Billfold's You tab into the same presentation as Gary while preserving private tracking and the distinction between verified and self-graded records. It includes 912's historical score repair and the completed 909–911 feature, access, privacy and reliability changes. Its original review copy below is retained as a dated record.

Upload succeeded at **12:18:40.448 UTC / 08:18:40.448 Eastern**. Official Apple email evidence verified during the September 8 continuation confirms processing completed at **12:20:55 UTC** and a TestFlight availability notice to the existing tester at **12:20:42 UTC**. These are separate notification timestamps. Root subsequently verified 913 as Testing in the internal Beta group in App Store Connect. The current 2.25 App Review submission still uses **901 / Waiting for Review**; no 913 review submission or approval occurred in this task. Do not upload 913 again.

**September 8 evidence correction:** the final optimized 913 Simulator build includes the date-tick refinement and passed. Root observed actual-app guest Profile, Settings, sign-in/sign-up screens, What's New, Billfold and Board in Simulator. In-place installation of 913 on the physical phone passed, but iOS denied launch because the device was locked; this is not evidence of an app crash or successful physical launch. Authenticated flows and physical acceptance remain open. App Store privacy was separately published with 14 data types, including linked Customer Support for App Functionality and no tracking. Review credentials and review-contact phone/email were still blank at that readback.

**Later September 8 account/availability preflight:** actual distribution is U.S./Canada only, separately verified from the age-rating list. The full unchanged questionnaire is Gambling=Yes, User-Generated Content=Yes, Simulated Gambling/Contests=Frequent and calculated 18+. Current `delete-account` v9 can retain a legacy `public.users` identity after Auth deletion; transactional cleanup and its verification are pending. The historical reviewer copy below does not establish completed deletion acceptance. Use the [current 914 gates](APP_REVIEW_2_25_914.md#evidence-and-remaining-gates) before applying submission notes.

## Notes for Review

Gary is an AI sports analysis and personal bet-tracking app from Gary A.I. LLC. It displays predictions, sportsbook prices, written reasoning and historical results. It does not accept wagering deposits, place real-money bets, connect sportsbook accounts or award cash prizes. Book entries record user decisions and hypothetical unit results; they are not wagers placed through Gary.

Public features include Home, Picks, Hub player/team information, Fantasy analysis and Billfold's historical record. Coverage varies by sport and season. A scheduled game can appear before its analysis is published. Winners contains a smaller set of reviewed game and prop selections and can have no selections for a slate.

Use the dedicated account in Sign-In Information for account features. Accept the welcome notice, then open Billfold > You > Sign in. An account adds Your Book, private manual entries, CSV export, profile/preferences and an optional public leaderboard. Favorite sports and Book display preferences can be saved without claiming a public handle. A handle is required to create a profile with an avatar/bio or join public rankings. Public profiles show a handle, avatar, bio and verified record. Private stakes, notes and outside bets do not affect public rankings. No purchase is required for the review account.

To check the product: open Picks, choose a supported sport and a published game, then read its original reasoning. Explore a Hub player or team read. Open Billfold > Gary for historical results and Billfold > You for your own book. You now shares Gary's balance, chart, period controls, statistics and ledger presentation. Its summary and chart follow the selected source and date/search/favorite filters; the Yours source is labeled self-graded. Verified results remain separate. Pending slips remain visible independently of the history date window. Logging, editing, favorites, search, CSV export and bet details remain available. Share Verified shares the all-time verified record.

The leaderboard uses qualified, opted-in public records; an empty ranking is a valid state. In another public profile, signed-in users can report or block the profile; blocked profiles can be managed from the Board. Profile text is filtered on the server, and reports enter a private moderation queue. The support and appeals contact is support@betwithgary.ai. Community rules are available at https://www.betwithgary.ai/terms#profile-safety.

Winners has a free launch preview through September 30, 2026. Accounts created before October 1, 2026 at midnight America/New_York retain founding access. Eligible later accounts may purchase recurring sport or All-Access passes through Stripe. The selected price, renewal terms and any eligible trial appear before checkout. The server prevents charging accounts for access they already have. External purchase plans and checkout require the USA Apple storefront. Existing access and billing management remain available in other storefronts. The live billing portal permits cancellation and payment-method management; subscription plan changes are disabled. This scheduled October transition is part of the product described for review.

Settings includes separate, off-by-default choices for checkout analytics and reading analytics. Share reading analytics counts sessions and expanded original game/prop card reasoning visible for five continuous foreground seconds on the instrumented card surfaces in Home, Winners and Picks. It uses a random in-memory session ID, with no account or notification ID, pick details, stakes or reasoning text, and does not link visits across app launches. Neither optional measurement choice is required to use Gary.

Notification permission is optional. If enabled, Gary uses Firebase Cloud Messaging and the disclosed account/installation identifiers for delivery; neither analytics choice is required for notifications.

Apple, Google and email sign-in are available. Forgot Password opens Gary's website in the user's browser and explains the return to the app. Settings includes account deletion. Successful deletion removes account data, cancels Gary subscriptions and clears local consent/session state. Apple-linked accounts without retained revocation tokens receive Apple's manual authorization-removal guidance after Gary deletion succeeds. Please use a disposable account for deletion testing rather than deleting the dedicated review account.

## What's New

Your Book now shares Gary's Billfold layout, with a clearer balance, chart, period controls and ledger. Filter your record while keeping verified calls and self-graded entries distinct. This update also improves Home, Picks and Hub loading, adds profile reporting and blocking, and includes clearer Winners states and separate optional reading analytics. Save private preferences without claiming a public handle. Includes fixes for game alerts, game-detail matching, historical score labels, Settings navigation and date changes.

## Store listing

Use the product description in [the 901 package](APP_REVIEW_2_25_901.md#store-listing-description) as the base, with these current additions where space permits. The old package's release status, What's New and privacy inventory are historical and must not replace this candidate's guidance.

- Explore available Fantasy player and lineup analysis alongside game predictions.
- Report or block public profiles and manage your blocked list.
- Review your personal Book through the updated Billfold balance, chart, filters and ledger, with verified and self-graded records labeled separately.

Retain variable-coverage language, the accurate October offer, personal-tracking boundaries, the 18+ audience and the fallibility of predictions. Do not promise sportsbook syncing, AI chat, a fixed number of Winners, guaranteed results, universal prop markets or unverified partnerships.

## Privacy inventory inherited from 912

All **21** privacy manifests in signed 913 match signed 912. A fresh read of 913's archived manifests confirms **14** collected-data categories, no tracking and no tracking domains. The Billfold presentation change introduces no new declared category. Thirteen categories have a linked declaration; Other Diagnostic Data is unlinked.

| Declared purpose | Categories in the signed application/SDK union |
|---|---|
| App Functionality | Name, Email Address, Phone Number, Coarse Location, Other Financial Info, Other User Content, Purchase History, **Customer Support** |
| App Functionality and Analytics | User ID, Device ID, Other Data Types, Other Diagnostic Data |
| Analytics | Product Interaction, Other Usage Data |

Customer Support is linked and used for App Functionality. System Boot Time with reason **35F9.1** remains in the required-reason API manifest; it is not an additional collected-data category. Preserve the complete required-reason entries in the signed inventory.

This inventory includes conditional SDK declarations. Google Sign-In declares potential Phone Number, Coarse Location and other categories; Gary does not request phone/location permissions or additional Google scopes. The union is not proof that each SDK category is collected from every user, and no device network capture is claimed. Reconcile the actual app and SDK data practices with the App Store labels; archive manifests do not update App Store Connect automatically. References: [Apple privacy details](https://developer.apple.com/app-store/app-privacy-details/), [Google Sign-In disclosures](https://developers.google.com/identity/sign-in/ios/app-privacy), [Firebase disclosures](https://firebase.google.com/docs/ios/app-store-data-collection).

## Candidate evidence and remaining release gates

- **913 artifact:** `/Volumes/KINGSTON/Gary-2.25-913-You.xcarchive`; bundle `ai.betwithgary.app`, version 2.25/build 913, strict/deep signature verification passed. Upload log: `/Volumes/KINGSTON/gary-913-upload.log`.
- **913 tests:** five focused regression files / seven tests passed without skips. They cover verified/manual separation, chronological daily totals, settlement states, source/search/favorite/date filters and date-independent pending slips. The final optimized Simulator build, fixture build and signed archive include the date-tick refinement. These are not physical-device or authenticated-write results.
- **Actual UI evidence:** root's later 913 guest checks observed Profile, Settings, sign-in/sign-up screens, What's New, Billfold and Board in Simulator. The earlier Billfold design evidence remains a separate local fixture with stubbed services; its lower-layout image omits upper blocks only in the fixture. Do not use fixture data or that inspection layout as final store screenshots. Physical installation passed, while launch was denied by the locked device. Long-reading/collapse, scrolling, VoiceOver, private preferences, historical-score acceptance and authenticated flows remain gates for the final candidate.
- **Physical accounts:** verify Apple/Google/email success, cancel and failure; confirmation and password recovery through completion; account changes and private-cache clearing; real APNs/FCM delivery and notification routing; storefront access, checkout/billing return; and authorized disposable-account Book/profile CRUD, result entry, export, leaderboard opt-in, report/block and deletion. A paired device, fixture test or availability email does not establish those flows.
- **Auth settings:** the latest read-only advisors still report email OTP expiry over one hour and leaked-password protection disabled. Configure through an authorized settings route and read back the result; this package does not claim those changes have occurred.
- **People and review access:** confirm the moderation/report-queue/support owner and operating cadence, appeals handling and actual dedicated reviewer-account sign-in. Product controls and a published address do not establish staffing. Keep deletion testing separate from the reviewer account.
- **App Store Connect:** 913 internal Beta Testing is verified; current 2.25 review remains 901 / Waiting for Review. Privacy now shows 14 published data types including linked Customer Support / App Functionality, with no tracking. Review username/password and contact phone/email remained blank. Confirm actual review access, current questionnaire/territories/seller fields and accurate final screenshots for the chosen candidate. The recorded 901 questionnaire declared Gambling=Yes, user-generated content and recurring simulated tracking/leaderboard activity, with calculated age 18+; inspect the current live answers. Do not substitute an age override for truthful content answers. This document claims no new selection, submission or approval.

Current release state and external receipts belong in the [launch readiness ledger](../docs/launch/READINESS_2026-09-07.md) and [913 handoff](../HANDOFF_2026-09-08_YOU_BILLFOLD.md). [Billfold evidence](../audit-evidence/billfold-you-2026-09-08/README.md) records the exact source and fixture limitations. Web/backend deployment and account acceptance have separate receipts; these submission documents make no new runtime deployment or acceptance claim.
