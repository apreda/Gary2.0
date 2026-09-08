# App Review package — Gary AI 2.25 / uploaded 914

**Historical package:** candidate 915 and current saved App Store state are documented in [the 915 package](APP_REVIEW_2_25_915.md). The dated status below is preserved as evidence, not the current release decision.

Prepared September 8, 2026. **Draft review package; not submitted.** Latest native source `a82c2ea6` is committed and pushed. It adds Hub slate-day filtering and player-card context, incorporating the shared Hub/Fantasy Gary design from `12f4df5a` and Billfold countability repair from `875fc9bb`. Candidate 914 inherits 913's You layout and the earlier access, profile safety, privacy, score and reliability improvements. These native changes introduce no new privacy data category or offer change. Individual listing-field saves are tracked below.

**914 artifact status, verified September 8:** final optimized Simulator build and signed archive passed on source `a82c2ea61f7ae23e746047ac13a42b253f05929e`. Archive `/Volumes/KINGSTON/Gary-2.25-914-Hub-Brand-final.xcarchive` identifies `ai.betwithgary.app`, 2.25 (914); strict/deep signature passed at 13:31:35 UTC and all 21 privacy manifests are byte-identical to signed 913. Final upload succeeded **13:33:26 UTC**, UUID `7df2c9e4-fbc3-4276-962c-f22bf97d9b3a`. The release owner independently verified Apple **Complete** and internal **Beta / Testing**. This is the final integrated artifact, distinct from the earlier pre-countability archive that was held without upload. It does not establish physical TestFlight installation or App Review selection.

**Current Apple state:** the fresh September 8 App Store Connect read still shows **2.25 / build 901 / Waiting for Review**. Final build 914 is independently verified as Testing in the internal Beta group. App Privacy now publishes 14 data types, including linked Customer Support / App Functionality, with no tracking. Actual availability is **United States and Canada: 2 Available / 173 Not Available**. The supplied review-contact phone/email are saved and independently visually confirmed after returning to the page; Save is disabled. Working dedicated reviewer sign-in acceptance remains required. No credentials or personal contact values belong in this package. **The subtitle, promotional text and direct Support URL below were saved and independently read back.** The support page returned HTTP 200 and displayed the support email. The full 914 description, What's New and reviewer notes remain unapplied drafts. No new review-build selection, withdrawal, submission, approval or release is claimed.

## Before applying the reviewer notes

Supply and successfully sign in to a dedicated review account; enter its credentials in App Store Connect Sign-In Information, not this repository. Keep two disposable QA accounts separate so deletion/account-switch checks cannot remove reviewer access. The legacy-account cleanup migration is deployed and the server repair is complete; finish actual disposable-account UI deletion and independent cleanup readback before claiming end-to-end deletion acceptance. The authorized review contact is saved and visually verified. Preserve those fields without copying personal values into this repository. The notes below assume these prerequisites are completed. Remaining physical, account and rights gates are recorded below.

## Notes for Review

Gary is an AI sports analysis and personal bet-tracking app from Gary A.I. LLC. It shows predictions, sportsbook prices, reasoning and historical results. It does not accept wagering deposits, place real-money bets, connect sportsbook accounts or award cash prizes. Book entries record user decisions and hypothetical unit results.

After the welcome notice, browse Home, Picks, Hub, Fantasy and Billfold > Gary without an account. Choose a supported sport and a published game to read its original reasoning. Coverage varies by sport and season; a scheduled game may appear before its analysis. Winners is a smaller set of reviewed game/prop picks and can have an empty slate.

Use the dedicated account in Sign-In Information for Billfold > You. No purchase is required for that account. Check manual logging, edit/grade a temporary entry, filters, favorites and CSV export. Verified rides/fades and self-graded entries remain separate; pending slips are independent of the history date filter. Share Verified uses the all-time verified record. Private sports/unit preferences can be saved without a public handle; a handle is needed for an avatar, bio or public ranking.

Build 914 aligns Hub and Fantasy with Gary's shared design, separates tomorrow's team context from today's Hub reads, and displays supplied player slate context. It fixes Billfold sport/timeframe changes and Top Pick metrics admitting preseason results. Preseason game results remain graded on pick cards but do not enter Billfold performance. It includes the updated You layout, historical score-label fixes and earlier loading, game-alert and account improvements.

Public profiles are optional and show a handle, avatar, bio and verified record. Stakes, notes and manual entries stay private and do not affect rankings. Qualified, opted-in accounts appear on the leaderboard; empty rankings are valid. Signed-in users can report/block a public profile and manage blocked profiles from the Board. Profile text is filtered and reports enter a private moderation queue. Support/appeals: support@betwithgary.ai. Rules: https://www.betwithgary.ai/terms#profile-safety.

Winners has a free preview through September 30, 2026. Accounts created before October 1, 2026 at midnight America/New_York retain founding access. Eligible later accounts may buy recurring sport or All-Access passes through Stripe; prices, renewal terms and eligible trials appear before checkout. The server blocks purchases of included access. External purchase plans and checkout require the USA Apple storefront; other/unknown storefronts show availability information. Existing access and billing management remain available. The billing portal supports cancellation and payment-method updates, with plan changes disabled. This scheduled October transition is part of the product.

Settings has separate, off-by-default checkout and reading analytics. Reading measurement counts sessions and expanded original game/prop reasoning visible for five foreground seconds on Home, Winners and Picks cards, using an in-memory session ID without account/notification IDs, pick details, stakes or reasoning text. It does not link app launches. Notifications are optional; Firebase delivery uses disclosed identifiers independently of analytics consent.

Apple, Google and email sign-in are available. Forgot Password opens Gary's website and explains returning to the app. Settings provides account deletion, which removes Gary account records, cancels Gary subscriptions and clears local consent/session state. Apple-linked accounts without retained revocation tokens receive Apple's manual permission-removal guidance after deletion. Please use a separate disposable account for deletion testing, not the dedicated review account.

## What's New

Your Book, Hub and Fantasy now share Gary's updated design. Hub reads keep today's and tomorrow's team context separate and show clearer player context. Filter your personal record while keeping verified calls and self-graded entries distinct. Billfold consistently excludes preseason results from performance figures when switching sports and timeframes. This update also improves loading, game alerts and historical score labels, adds profile reporting and blocking, and provides clearer Winners states and separate optional reading analytics. Save private preferences without claiming a public handle.

## Store listing

### Name

Gary AI - Sports Predictions

### Subtitle

Sports picks with the receipts

### Promotional text

Find Gary's take on the game you're watching. Explore the reasoning, follow the public results and keep your own record alongside Gary.

### Description

Meet Gary, your AI sports analyst with a take on the game and a record you can check.

LOOK UP YOUR GAME
Browse MLB, NFL and college football matchups during active seasons. Gary publishes game picks as the available research and lineup information are ready. Player props depend on available markets and data. NBA coverage returns with its season. A matchup can appear before Gary's pick is ready; the app shows the current state.

SEE THE REASONING
Read the facts, matchup context and assumptions behind a pick. Explore player and team information in the Hub and available Fantasy analysis. Confidence is Gary's judgment, not a calibrated probability or a promise of a win.

EXPLORE WINNERS
Winners is a smaller selection of published game picks and player props reviewed against their original evidence and price. The number varies by slate; some boards may be empty. Current access is shown in the app. Winners and the public pick record are different groups, and past results do not guarantee future performance.

KEEP YOUR OWN BOOK
Create an optional account to record your bets, odds, unit stakes, results, notes and sportsbook labels. Track your verified rides or fades alongside Gary, keep manual entries private, save favorites and export your history. Filter your Book by source, date and search. Save private preferences without claiming a public handle. An optional public leaderboard uses system-graded rides and fades; manual entries do not count toward it. Report or block public profiles. Gary does not connect to your sportsbook account or place wagers.

WHAT'S FREE AND WHAT'S PAID
Public game picks, the Hub and historical results are available without a subscription. Winners is open during the launch preview through September 30, 2026. Create an account before October 1, 2026 at midnight Eastern to retain the included founding access described in the app. Eligible later accounts can purchase a sport pass or All-Access; available plans, recurring charges and trial terms are shown before checkout. Purchase availability depends on your storefront. Signing in keeps your access tied to your account across supported devices.

YOUR PRIVACY
Checkout and reading analytics are separate, optional and off by default in the iOS app. Manage them in Settings. Accounts and notifications are optional for browsing public content. Account deletion is available inside the app.

Gary provides sports analysis and tracking for adults of legal betting age in their location. It does not accept deposits, withdraw funds, place sportsbook bets or guarantee outcomes. Odds and information can change. Bet only where legal and within your means. Responsible gambling resources: https://www.ncpgambling.org/help-treatment/.

Privacy: https://www.betwithgary.ai/privacy
Terms: https://www.betwithgary.ai/terms
Support: https://www.betwithgary.ai/contact

### Keywords

mlb,nfl,ncaaf,nba,props,odds,analysis,results,tracker,fantasy,baseball,football,basketball

### URLs

Support: https://www.betwithgary.ai/contact
Privacy Policy: https://www.betwithgary.ai/privacy
Marketing: https://www.betwithgary.ai

## Privacy inventory and published labels

Final signed 914 contains **21 privacy manifests / 14 collected-data categories**. At 13:31:35 UTC the release owner verified all 21 manifests byte-identical to signed 913, preserving the inherited 912 inventory. The 914 branding, countability and Hub-context changes add no declared category. Thirteen categories have linked declarations; Other Diagnostic Data is unlinked. No tracking or tracking domains are declared.

| Declared purpose | Application/SDK category union |
|---|---|
| App Functionality | Name, Email Address, Phone Number, Coarse Location, Other Financial Info, Other User Content, Purchase History, Customer Support |
| App Functionality and Analytics | User ID, Device ID, Other Data Types, Other Diagnostic Data |
| Analytics | Product Interaction, Other Usage Data |

Root's September 8 App Store Connect read confirms **14 published data types**, including **Customer Support / App Functionality / linked / not used for tracking**. The previous 13-type label gap is closed. System Boot Time / `35F9.1` remains a required-reason API declaration, not another collected-data category.

Google Sign-In declares potential Phone Number, Coarse Location and other categories; Gary requests no phone/location permission or additional Google scopes. Conditional SDK declarations are not proof that every user supplies each category. No device network-capture acceptance is claimed. The final signed-manifest parity and published 14-type label have separate verified receipts; a source manifest never publishes the label automatically. References: [Apple privacy details](https://developer.apple.com/app-store/app-privacy-details/), [Google Sign-In disclosures](https://developers.google.com/identity/sign-in/ios/app-privacy), [Firebase disclosures](https://firebase.google.com/docs/ios/app-store-data-collection).

## Evidence and remaining gates

- **914 source and focused calculation evidence:** the seven added lines centralize countable game results and guard Top Pick metrics. The optimized shipping-Swift fixture preserves 93 retained NFL rows and all 34 graded preseason lookup entries, while full/selection/Top Pick performance agrees on 59 countable rows, 30–29–0 and -1.039919 units. Full/selection, timeframe/sport, journal/streak/chart/calibration and independent spread paths pass. Four focused files / five tests passed without skips; the negative control reproduced the previous 52–40–1 selection record. All three frozen hashes matched on independent review. This is fixture evidence, not a public result claim or physical interaction acceptance.
- **913 evidence, preserved separately:** upload succeeded at **12:18:40.448 UTC / 08:18:40.448 Eastern**; official processing email is **12:20:55 UTC**, and the existing tester's availability notice is **12:20:42 UTC**. Internal Beta Testing was later verified directly. The final optimized Simulator build includes the date-tick fix. Root observed actual-app guest Profile, Settings, sign-in/sign-up screens, What's New, Billfold and Board in Simulator. In-place physical installation passed, but the OS denied launch because the device was locked. This does not establish a crash or successful physical launch. See the [dated 913 package](APP_REVIEW_2_25_913.md).
- **914 build and visual acceptance:** final optimized build, signed archive, strict/deep signature, exact source/version/build, 21-manifest parity, upload, Complete and internal Beta Testing are verified. Actual final Simulator NFL Billfold displays **30–29–0 / −1u** and tomorrow context is correct; sampled Hub/Fantasy and off-slate player context are verified. [Final archive receipt](/Users/adam.preda/Documents/ChatGPT/Gary/hub-brand-alignment-2026-09-08/final-archive-verification.json), [Apple processing](/Users/adam.preda/Documents/ChatGPT/Gary/hub-brand-alignment-2026-09-08/apple-processing-914.txt), [internal Testing](/Users/adam.preda/Documents/ChatGPT/Gary/hub-brand-alignment-2026-09-08/apple-internal-beta-914.txt), [actual NFL display](/Users/adam.preda/Documents/ChatGPT/Gary/hub-brand-alignment-2026-09-08/billfold-nfl-914-final.png). Physical launch/scrolling/long-reading/VoiceOver and notifications remain separate. Use genuine final-app screenshots, not the early fixture omitting upper Billfold blocks.
- **Authenticated acceptance:** on authorized disposable accounts, finish Apple/Google/email success/cancel/failure, confirmation/recovery through return to the app, account changes/private-cache clearing, private preferences, Book create/edit/settle/reopen/void/export/delete, leaderboard opt-in, report/block and account deletion. Verify intended storefront access and account-owned billing/cancellation return without charging real customers. Preview/founding access does not itself exercise the scheduled October paid flow. Apple manual revocation guidance is a documented fallback, not proof of automatic revocation for every legacy account.
- **Auth settings:** latest read-only advisors still report email OTP expiry above one hour and leaked-password protection disabled. The bounded proposal is 1,800 seconds and enabled leaked-password protection, followed by supported settings readback/advisors. No settings change is claimed here. The installed CLI/connector has no supported narrow Auth-config command; [the documented two-field Management API plan](/Users/adam.preda/Documents/ChatGPT/Gary/launch-readiness/continuation-2026-09-08/supabase-auth-narrow-config-route.md) awaits a supported Auth-management connection or restored dashboard access.
- **Legacy account deletion:** preflight found that `delete-account` v9 could leave a legacy `public.users` identity after Auth deletion. Transactional cleanup migration **`20260908132857_delete_legacy_account_identity.sql` is deployed** and the server repair is complete. Independent source review and six new PostgreSQL cases, eleven existing privacy cases and ten unchanged deployed-path edge fixtures passed. Actual disposable-account UI acceptance is still in progress; verify both Auth and legacy identity removal, dependent private data and session/cache clearing before claiming the full flow complete. The old preflight no-accounts/deployment-pending statements are dated history.
- **Review access and people:** supplied review phone/email are saved and independently visually confirmed with Save disabled. [Sanitized match-only receipt](/Users/adam.preda/Documents/ChatGPT/Gary/launch-readiness/continuation-2026-09-08/appstore-contact-verification.json). Dedicated retained reviewer sign-in, moderation/support/report-queue ownership and response cadence remain separate requirements. Contact fields do not establish mailbox monitoring; provisioning does not prove recovery delivery or physical sign-in.
- **Current listing and rights fields:** "Sports picks with the receipts", the promotional text and direct Support URL are saved and read back; the remaining candidate copy is still draft. Content Rights still says the app does not contain, show or access third-party content. Provider data is present, so that declaration needs a substantiated correction. The rights review is checking applicable public provider terms and any additional permissions; bespoke contracts are not assumed necessary for every source. The incomplete evidence inventory does not establish that the content is unlicensed.
- **Ratings and availability, now read back:** all seven age-questionnaire steps were inspected without changes: Gambling=Yes, User-Generated Content=Yes, Simulated Gambling=Frequent and Contests=Frequent; calculated age is 18+. Gambling=Yes preserves Apple's earlier written instruction, recorded in the [899 package](APP_REVIEW_2_25_899.md). Apple lists ten rating-related exclusions: Afghanistan, Brazil, Gabon, Iraq, Libya, Maldives, Morocco, Republic of Korea, Saudi Arabia and United Arab Emirates. Separately, actual availability is only **United States and Canada**, with **173 Not Available**. The earlier 173-territory age display is not a distribution list. No questionnaire, territory or age-override change occurred.
- **DSA and future European availability:** the non-trader field and incomplete account compliance are recorded facts. With verified U.S./Canada-only App Store distribution, they are not a demonstrated current launch mismatch: [Apple's DSA guidance](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/) says App Store distribution only outside the EU does not constitute acting as a trader on the App Store. Before EU expansion, determine the applicable role and complete required contact/document verification. This is not a blanket legal-clearance statement or a new attestation.
- **Submission controls:** review final metadata, screenshots, reviewer access and rights/DSA declarations against the selected candidate. Current review remains 901 / Waiting for Review. This document neither withdraws that submission nor selects/submits/releases 914. Root owns those external controls and receipts.

## Account provisioning and rights evidence

Repository review instructions describe a dedicated account but establish no usable login. Keep credentials outside tracked documents. The supported provisioning route is a trusted server-side `auth.admin.createUser({ email, password, email_confirm: true })` using a separate administrative client with session persistence and refresh disabled. Normal server configuration names are `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY`; no values were read. This operation requires a secret or service-role credential and sends no invitation or confirmation email. Authorized account QA is underway; its final acceptance receipt remains separate from this provisioning description. This document itself creates no accounts. [Supabase admin reference](https://supabase.com/docs/reference/javascript/auth-admin), [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

Use three distinct controlled identities and generated passwords: two empty disposable QA accounts and one retained review account. Create only Auth users; the deployed signup trigger also creates the matching legacy `public.users` identity. Verify no public-profile/bet rows exist, and include the legacy identity in deletion readback. Do not seed `public_profiles` generically: its column default is public, while Gary's [profile RPC](../gary2.0/supabase/migrations/20260904210547_complete_user_experience.sql) defaults a new profile to private. Keep QA profiles private unless explicitly testing opt-in. Creation before October 1 naturally qualifies for founding access under the existing rules; do not manufacture entitlements. Use the controlled identities already authorized for QA/review; complete sign-in acceptance separately. Review-contact fields are now saved and independently verified.

A bounded source inventory confirms third-party data from Ball Don't Lie ([observed provider receipt](../docs/launch/FOOTBALL_SETTLEMENT_2026-09-08.md)), MLB Stats API ([native reads](../ios/GaryApp/SharedStores.swift)), The Odds API ([NCAAF markets](../gary2.0/src/services/ncaafPropOddsService.js)), official NFL reports ([practice report source](../gary2.0/src/services/insights/computers/footballPracticeReport.js)), nflverse ([dataset adapter](../gary2.0/src/services/nflverseService.js)) and Tank01/RapidAPI ([adapter](../gary2.0/src/services/tank01DfsService.js)). No active provider-photo/team-logo loader surfaced in this bounded review. The [provider-rights audit](../docs/launch/PROVIDER_RIGHTS_2026-09-08.md) verifies explicit public commercial grants for BDL/The Odds API and the nflverse license, while identifying the narrow MLB/NFL authorization and Tank01 terms gaps; API access alone is not a complete rights basis, and bespoke contracts are not presumed necessary. This inventory calls for an accurate declaration without claiming either unlicensed use or complete rights clearance.

Current operational status belongs in the [readiness ledger](../docs/launch/READINESS_2026-09-07.md) and [launch handoff](../HANDOFF_2026-09-08_LAUNCH_READINESS.md). Earlier handoff statements remain dated evidence where superseded by explicit September 8 receipts. Listing copy is synchronized with [AppStoreMetadata.md](../ios/GaryApp/AppStoreMetadata.md).

Field budgets follow [Apple's official reference](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information): promotional text 170 characters; description and What's New 4,000 characters; keywords 100 bytes; review notes 4,000 bytes. Only the Notes for Review body belongs in the review-notes field.
