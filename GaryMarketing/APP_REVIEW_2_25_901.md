# App Review package — Gary AI 2.25 / build 901

Prepared September 5, 2026. Build 901 replaces the crash-affected 896 review submission. See the root crash handoff for the final submission receipt and test evidence.

## Notes for Review

Build 901 fixes a Picks crash during launch/refresh when MLB game picks, player props and home-run props refer to the same game. Picks now has individual sport tabs without an All section. This replaces our withdrawn build 896.

Gary is an AI sports analysis and personal bet-tracking app from Gary A.I. LLC. It displays betting picks, sportsbook prices, written analysis and performance records. It does not accept wagering deposits, place real-money bets, withdraw funds, connect sportsbook accounts or award cash prizes. Book entries record user decisions and hypothetical unit results; they are not wagers placed through Gary.

Public features include Home, Picks, the Hub's player/team information and Billfold's historical results. Active coverage is MLB, NFL and NCAAF; other sports are seasonal. Games can appear before analysis is published. Winners is a smaller set of reviewed selections and may have an empty board.

Use the dedicated account in Sign-In Information to test account features. On launch, accept the welcome notice, then open Billfold > You > Sign in. An account adds Your Book, private manual entries, CSV export, profile/preferences and an opt-in public leaderboard. Public profiles show a handle, avatar, bio and verified record. Private stakes, notes and manual entries are excluded from rankings. No purchase is required for the review account.

Suggested checks: browse a published game and its reasoning; open Hub player details; reveal a Winners game/prop; open Billfold > You > Log a bet > Log an outside bet, save a temporary entry, edit or grade it, export CSV, and delete the temporary entry. Profile > Settings includes privacy, terms, responsible gambling, support and account deletion. Please do not delete the dedicated review account; use a disposable account for deletion testing.

Winners has a free launch preview through September 30, 2026. Accounts created before October 1 at midnight America/New_York retain founding access. Later eligible accounts may purchase recurring sport or All-Access passes through Stripe; price, renewal terms and any trial are shown before purchase. The server blocks duplicate purchases and charging founding accounts for included access. External purchase plans and checkout require the USA Apple storefront; other or unknown storefronts show availability information. Existing access and billing management remain available. This scheduled transition is included in the submitted product; please contact us if a separate path is needed to review the later paid flow.

Optional product analytics is off by default in Settings. Account deletion removes the account and its data, cancels its Gary subscriptions and clears the local session. Apple-linked accounts without retained revocation tokens receive Apple's manual authorization-removal guidance after Gary deletion succeeds. Apple and Google sign-in are also available.

## Store listing description

Gary is an AI sports analyst who publishes game predictions and explains the reasoning behind them.

Browse daily MLB analysis, NFL and college football coverage, player projections, live scores and a public results history. Coverage and available markets vary by sport and season. A scheduled game can appear before its analysis is published.

WHAT YOU CAN DO

• Read Gary's picks and the written case for each game.
• Explore player and team information in the Hub.
• Review previous predictions, wins and losses in Billfold.
• Keep a personal book of picks and outside bets, with private notes, results and CSV export.
• Choose whether to share your handle and verified record on the public leaderboard. Private manual entries do not affect rankings.

Winners is a smaller collection of reviewed game and player-prop selections. Its launch preview is free through September 30, 2026. Accounts created before October 1, 2026 at midnight Eastern retain founding access. Eligible later accounts may need a recurring pass for Winners; available plans and terms are disclosed before purchase. Public picks, the personal book and leaderboard remain free.

Gary provides sports information, analysis and personal tracking. It does not accept deposits, place real-money wagers, connect sportsbook accounts or award cash prizes. Predictions can be wrong, and past results do not guarantee future outcomes. For adults 18 and over.

## What's New

Fixed a crash when game picks and player props refresh together. Picks now opens directly to individual sports. This update also includes college football game pages, Hub player and team details, personal bet tracking and clearer account and privacy controls.

## Privacy reconciliation

The signed 901 archive contains 21 privacy manifests. The App Store disclosure uses the union of the application and bundled SDK declarations: 13 data types, no advertising tracking. Twelve types are linked; Other Diagnostic Data is not linked. Phone Number, Other Usage Data and Other Data Types include GoogleSignIn's declared potential collection; Gary does not request phone or location permissions or additional Google scopes. This avoids omitting SDK-declared collection based only on app-owned data. It is not a claim that every user supplies every type or that a device network trace was performed.

App Functionality: Name, Email Address, Phone Number, Other Financial Info, Coarse Location, Other User Content and Purchase History. App Functionality plus Analytics: User ID, Device ID, Other Diagnostic Data and Other Data Types. Analytics: Product Interaction and Other Usage Data.

Primary guidance: [Apple privacy details](https://developer.apple.com/app-store/app-privacy-details/), [Google Sign-In disclosures](https://developers.google.com/identity/sign-in/ios/app-privacy), [Firebase disclosures](https://firebase.google.com/docs/ios/app-store-data-collection). Declared SDK data was retained rather than inferring noncollection from the absence of optional permissions.

Age questionnaire: existing Gambling=Yes retained; public profiles declared as user-generated content, and recurring simulated tracking/leaderboard activity declared Frequent. Calculated age remains 18+. This is a content declaration, not a claim that Gary operates a real-money wagering service.
