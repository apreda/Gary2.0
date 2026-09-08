# Gary launch readiness — September 8, 2026

The root launch task owns the active goal requested by Adam: audit and repair the app, its game/prop systems, incomplete intended features and release experience. **Do not mark launch readiness complete yet.** The current gate-by-gate record is [docs/launch/READINESS_2026-09-07.md](docs/launch/READINESS_2026-09-07.md).

## Canonical source and delivered changes

Work directly on `/Users/adam.preda/Gary2.0`, `main`, preserving the private uncommitted `ios/GaryApp/GoogleService-Info.plist`. Do not inspect or stage that configuration or `SecretsLocal.swift`. The retired workspace clone is not production. No prediction prompts, model choices or retired sports were changed by this release.

- Web `24b99c5c` is live READY as `dpl_8jCMDFZw3aG6pkGcEb6x4orA8RQb`: exact prop receipt identity, doubleheader grouping, explicit lock/error states and current privacy/offer disclosures. Full 452 tests / 63 files, TypeScript and real-app fixture SSR smoke pass.
- Native `7e7c163a` contains the integrated 909 repair: Home/Winners accepted-date and request ownership, exact game/lineup identity, account-bound push lifecycle and destinations, profile report/block controls, separate off-default reading measurement, truthful access/empty states, Settings navigation, the midnight Picks header and small-phone dock clearance.
- Native `e88b70ce` advances to 2.25 (910) with a narrow follow-up: the Hub's completed-game panel identifies related **Team streaks**, with explicit **NEXT GAME** opponent/time and wrapping. A legitimate next-opponent label previously appeared under “On the Line” in a different completed matchup. No pick or grade was wrong. Five existing optimized Hub tests pass; Swift parsing and whitespace checks are clean.
- Graders, pick notifications, authenticated registration, profile-safety RPCs, X service authorization, analytics view RLS and cache writers are deployed. The ledger records all nine actual applied migration versions and their behavior checks.

## Release artifacts

909 archive: `/Volumes/KINGSTON/Gary-2.25-909-Launch.xcarchive`. Signed identity, strict/deep signature and all 21 bundled privacy manifests pass. The 14-category union includes Customer Support linked for App Functionality; the root manifest includes System Boot Time reason `35F9.1`. No tracking domains are declared. Upload succeeded September 8 at **05:42:00.321 UTC**; `/Volumes/KINGSTON/gary-909-upload.log`. Apple reported processing, not processing completion. Preserve this archive and do not upload 909 again.

910 source is committed and pushed. The final optimized simulator build and signed archive passed; `/Volumes/KINGSTON/Gary-2.25-910-Launch.xcarchive` passes strict/deep signature and the same 21-manifest / 14-category privacy inventory as 909. Upload is in progress; `/Volumes/KINGSTON/gary-910-upload.log`. Build logs and archives belong on KINGSTON because internal disk space is limited.

The earlier responsiveness build 908 also uploaded successfully; preserve `/Volumes/KINGSTON/Gary-2.25-908-Responsiveness-final.xcarchive` and do not upload it again. Its detailed handoff is [HANDOFF_2026-09-08_RESPONSIVENESS.md](HANDOFF_2026-09-08_RESPONSIVENESS.md). No verified change to the older App Store 2.25 (901) submission is recorded.

## Acceptance evidence and limits

Frozen integrated backend regression: **289 files / 2,766 tests pass**, no skips, PostgreSQL 17 enabled. Edge helpers: **217 pass**. Last native dock/copy and 910 label changes receive targeted optimized execution/SDK checks; the full prior regression is not misrepresented as rerun after those presentation edits. Fifty-four exposed pitcher-walk tickets match final provider boxes; 428 game-result rows agree with stored score/ticket evidence, excluding the separate NFL table. No production grade/history rewrite or fake picks were used.

909 guest simulator checks cover Home, Picks, Winners, Hub/player/team, Fantasy, all Billfold tabs, leaderboard controls/rules, Profile, Settings, help and auth cancellation. Fresh iPhone SE onboarding reaches the correct Picks tab and keeps the dock legible at normal and maximum text sizes; iPhone 17 dock and saved-odds disclosure also pass. Detailed page boundaries and screenshots are in `/Users/adam.preda/Documents/ChatGPT/Gary/launch-readiness/`.

The Mac locked during the final pitcher-stats header check. Adam was asked to unlock it. The final 910 label check, complete long-card scrolling/collapse and real VoiceOver remain unverified. Sky's AX click shifted a card rail while ordinary coordinate expansion stayed aligned; Sky gestures also failed to scroll ordinary Home, so no physical touch bug or successful VoiceOver check is inferred from that automation behavior.

## Required continuation

1. Finish the 910 upload receipt, then inspect changed labels after the Mac is unlocked. Build/archive/privacy/signature checks already pass. Do not bypass the lock or manufacture screenshots.
2. After the existing App Store Connect sign-in request is satisfied, verify Apple processing/internal TestFlight inclusion and intended build selection. Apply the prepared review package [GaryMarketing/APP_REVIEW_2_25_910.md](GaryMarketing/APP_REVIEW_2_25_910.md), accurate store screenshots and privacy labels only after reconciling the candidate and review-account access. Customer Support classification is in the binary but still must be reconciled in App Store Connect.
3. Complete physical Apple/Google/email sign-in and recovery, APNs/FCM delivery/account transitions, storefront/billing return and authorized disposable-account Book/profile/deletion checks. Fixtures and guest simulator screens do not establish these results.
4. Supabase dashboard sign-in in Chrome was requested. Advisor status remains 0 ERROR / 63 WARN / 46 INFO; OTP lifetime exceeds one hour and leaked-password protection is off. The existing Pro plan supports protection. Configure/verify after sign-in; no setting change has been claimed.
5. Obtain Adam's actual moderation/support owner and coverage commitment. The question about the private report queue and `support@betwithgary.ai` is pending; functioning controls and a runbook do not prove staffed coverage.
6. Append the final canonical production-truth receipt and preserve the private local plist exception distinctly from actual code/deployment drift.

Use Node 22.23.2 at `/Users/adam.preda/.local/share/gary/runtimes/node-v22.23.2-darwin-arm64/bin`. PostgreSQL fixture temporary data must use internal `/tmp`, not ExFAT KINGSTON. The detached `/Volumes/KINGSTON/gary-launch-909-checks` snapshot is only a credential-free test worktree. Never read private config or send real social messages, notifications, purchases or user-data mutations as casual QA.

The live default Stripe portal was inspected read-only: cancellation, payment/customer updates and invoices enabled; plan/price/quantity changes disabled. No customer/session/charge was created. The launch preview/founding/October offer is reconciled in source and public disclosure; this does not prove future storefront behavior.

Root keeps the goal active and records explicit external dependencies. “Uploaded,” “processed,” “available in TestFlight,” “selected for review” and “approved” are separate states.
