# User experience completion — September 4, 2026

## Shipped behavior

Web and iOS now share account-owned profiles, avatar/handle/bio editing, favorite sports, unit-display preferences and public-leaderboard opt-in. Account changes clear private caches and export files. Network failures retain the iOS session; stale requests cannot restore another account.

Your Book supports private manual entries (including props and parlays), recorded odds/stakes/date, notes, sportsbook, favorites, correction, result entry, reopening, voiding, deletion, filters, complete history and CSV export. Stakes are stored in units; dollar displays use the account's selected conversion. Changing that preference changes the dollar display across the history.

Verified tail/fade receipts use exact published game/prop identity and lock at game start. One designated verified streak pick per Eastern game date can be swapped atomically before lock. Wins extend the streak; a loss resets it; pushes, voids and skipped dates preserve it. Historical grade corrections recompute both current and best streaks. Manual entries never affect the public record.

Leaderboards use real opted-in, system-graded records with five decided picks to qualify, 7-day/30-day/season windows, sport/sort filters, pagination, personal qualification/rank and public profile cards. Nine former demo accounts are excluded through a private service-owned table; their history was preserved. No fake competition was added. Equal one-unit returns are computed directly from receipt odds, eliminating rounding-based stake advantages.

The cloud graders now settle personal receipts from persisted MLB/NFL/NBA/NCAAF game results and exact prop results, including older pending entries and recent corrections. Reads are paginated and conditional writes prevent duplicate settlement notifications.

## Winners and billing

`get_my_access` and `get_winners_board` are the shared account-based source of access. The existing preview ends October 1, 2026 at midnight Eastern. Accounts created before that time retain founding access. Afterwards, current paid passes unlock the purchased sports or All-Access; expired/test-mode passes do not. Historical boards remain public. Locked responses include counts without ticket snapshots, and the underlying table enforces the same policy. The service-only grader audit route cannot bypass the paywall.

Checkout uses a service-owned reservation per account/mode. Parallel plan requests cannot open duplicate sessions, deliberate plan changes expire the previous session, and interrupted requests recover the identical Stripe attempt. A crashed worker may need up to two minutes before a retry. Checkout authenticates the account, uses the configured price ladder, reuses owned customers and open attempts, refuses already-owned access, and limits All-Access trials to new subscribers. The live launch/founding account cannot be charged for included access. Billing management opens the account's Stripe portal. Both Stripe webhook endpoints now receive checkout, subscription and invoice lifecycle events. Canonical state and monotonic event handling prevent stale cancellation reversal.

Deletion expires owned open checkout sessions, cancels owned subscriptions and then deletes the auth user and all related personal data. An account/deletion recheck closes sessions created during deletion. A late Stripe completion for deleted account metadata is canceled automatically. These paths were exercised with real Stripe test-mode events and temporary private QA accounts; no live purchase or existing customer subscription was altered.

## Deployment components

Applied migrations: `complete_user_experience`, `exact_public_unit_returns`, `complete_account_deletion`, `winners_account_access`, `billing_checkout_lifecycle`, `serialize_account_checkout_attempts`.

Deployed functions: `grade-results`, `grade-props`, `create-checkout`, `stripe-webhook`, `billing-portal`, `delete-account`. Stripe webhook alone disables gateway JWT verification and validates the raw Stripe signature. Checkout/portal/deletion also verify the caller with Supabase Auth.

iOS version is 2.25, build 898. The machine's real GoogleService-Info.plist and SecretsLocal.swift remain local configuration; never commit them. The signed archive is `/Volumes/KINGSTON/GaryApp-UserExperience-2.25-898.xcarchive`.

## Verification

The feature was tested in an actual signed iPhone simulator and an authenticated desktop/mobile browser. Checks covered profile persistence, privacy, private manual results and corrections, favorites, CSV, leaderboard qualification, access transitions, six real Winners snapshots, and sign-out cache clearing. The Swift contract test includes locked counts, populated/empty leaderboard envelopes, malformed publication IDs, and revoked access during a failed board refresh.

The database fixtures exercise ownership, manual/verified separation, exact settlement, corrections, rounding, public privacy, atomic streak changes and concurrent sessions. Separate disposable-database tests advance time beyond the launch preview and verify anonymous, founding, paid-sport, expired and test-mode access. Billing fixtures test terminal cancellation, ownership, deletion and checkout races. End-to-end Stripe test checks confirmed repeated checkout reuse, subscription cancellation, checkout expiration, orphan-event cancellation and account-data removal.

The existing fixture-backed Home/Picks/Results smoke test also passes after integration with the parallel production audit. Screenshots and transient test logs live under `/tmp/gary-user-experience-*` and `/tmp/gary-web-*`; they are verification artifacts, not product fixtures.

App Store build 896 held the existing review slot at the start of this work. This implementation does not change that review submission or its release setting. Fresh App Store Connect browser access requires reauthentication; Xcode's stored upload session is separate.

Final local verification: 1,685 backend tests, 143 edge tests and 263 web tests pass; Next route types and the merged production build pass. Real parallel Stripe test: six competing requests returned one success and five busy responses, leaving one open session; changing plans expired it, and repeating the chosen plan reused the new session.

Production web SHA `3ed49366` deployed successfully and all four new/updated account pages plus all sixteen referenced JavaScript chunks returned HTTP 200. Later source-only release commits retain that verified web tree. The browser connection became unavailable for a fresh production UI pass; the actual interactive checks ran locally against the live account APIs.

The canonical production-truth check matches the live daemons and deployed functions. Its only warning is the intentionally uncommitted real GoogleService-Info.plist documented in AGENTS.md.
