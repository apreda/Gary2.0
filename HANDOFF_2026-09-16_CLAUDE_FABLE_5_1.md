# Gary takeover — Claude / Fable 5.1

Prepared September 16, 2026 for Adam's request to commit/push completed work, deliver the app to Apple and TestFlight, and hand over the whole project. Start here and in `AGENTS.md`. This supersedes the September 14 handoff wherever status differs. Historical handoffs remain evidence, not instructions to replay old work.

## The release outcome

**Gary 2.25 is approved and publicly available in the US and Canada.** Apple completed submission `ca44f7e9-9ef5-4cb9-aae0-20731a668a77` at **September 16 02:31:21 UTC**, marked the app Ready for Distribution seven seconds later, and both public storefront lookups report version 2.25 released at **02:31:23 UTC** (September 15, 10:31 PM Eastern). The matching September 8 submission ledger identifies **build 920**, source `e1ef5383`. Public lookup does not expose a build number. [Sanitized approval and lookup receipt](GaryMarketing/launch-2026-09/evidence/apple-approval-2026-09-16.json). [US App Store](https://apps.apple.com/us/app/gary-ai-sports-predictions/id6751238914).

**The latest native code is newer than the released app.** The latest signed candidate is **2.25 (930)**, source `9e76551de60a36e3cd1f007c42fde64aed20cb02`. It has not been confirmed uploaded or available in TestFlight. **926 remains the last confirmed TestFlight build.** The September 14 actual upload failed with exit 70, `exportArchive Failed to Use Accounts`. September 16 UI checks still show sign-in screens in both App Store Connect browser sessions. No duplicate upload, new version, review submission, withdrawal or email was made in this pass.

All application source was already on `origin/main` at **65b6d14d44683423a15d0b030dda1faab094ea6a**. September 16 adds this handoff, the current scorecard and sanitized evidence. Native source and CI workflows have no changes between the verified 930 commit and that starting HEAD. The private Firebase plist is the sole intentional local exception; it is not unfinished application code.

Apple approval closes the submitted version's review gate. It does not establish delivery of later code, universal physical-device acceptance, a bug-free app, eligible advertising placements or validated demand.

## Apple continuation: an update after release

| Item | Current value |
|---|---|
| App / organization | Gary AI - Sports Predictions / Gary A.I. LLC |
| App / bundle / team | `6751238914` / `ai.betwithgary.app` / `SFBTX6KPLM` |
| Public version | 2.25; approved September 8 submission identified as build 920 |
| Latest verified native candidate | 2.25 (930), source `9e76551d` |
| Existing signed archive | `/Volumes/KINGSTON/Gary-2.25-930-Performance.xcarchive` |
| Existing upload options | `/Volumes/KINGSTON/gary-924-upload-options.plist` |
| Last confirmed TestFlight | 926, official September 9 notices |
| Current blocker | App Store Connect signed out; last Xcode upload could not use Apple accounts |
| Existing Apple support case | `102957999956`; review is now complete |

1. Restore the existing developer-account sessions in **Xcode → Settings → Accounts** and **App Store Connect**. Adam already received this access request; do not ask for passwords, extract credentials, or keep retrying unchanged authentication. The existing Chrome Apple sign-in tab is retained. Inspect current builds, versions, reviewer messages and existing Beta-group access after sign-in.
2. **Do not run the old “replace the pending 2.25 build” instructions. 2.25 has shipped.** Apple requires an incremental App Store version for a subsequent update. Inspect live state before choosing an unused version/build, package the current native code into a newly signed archive for that version, and record its exact source. A proposed 2.26/931 is not reserved or created here. Whether Apple accepts another 2.25 TestFlight upload must be checked; do not promise that retrying the old 930 archive alone satisfies both requested destinations. [Apple's new-version procedure](https://developer.apple.com/help/app-store-connect/update-your-app/create-a-new-version).
3. Verify the new archive, upload it, then verify processing and the existing internal **Beta** group's availability. These are separate outcomes. Reconcile screenshots, What's New, review notes, privacy/offer answers and device acceptance against the actual new binary before submitting it for App Review. Preserve the released app and ordinary release settings. Do not distribute an internal-only build if it also needs App Review eligibility.
4. The actual Xcode project is `ios/GaryApp/GaryApp.xcodeproj`, scheme `GaryApp`. The committed project currently says 2.25/930. **`ios/GaryApp/project.yml` still has stale 2.23/4 version defaults**: do not blindly regenerate the project and downgrade the version. If using that generator for a new release, reconcile its settings and inspect the resulting diff. Do not edit the existing signed archive in place.
5. No further generic expedite email is needed for the completed 920 review. A corrected follow-up was already sent September 12 from the membership email; Apple replied September 14 and approved September 16. Do not duplicate it or claim an expedite grant. Any later update-specific request must reflect the actual new submission and September 20 campaign date.

Review contact: Adam Preda, `adam.preda@betwithgary.ai`, +1 3177795640. Membership email: `apreda31@gmail.com`. Public support: `support@betwithgary.ai`. Keep reviewer credentials private.

Previously resolved: Adam confirmed physical Apple sign-in September 9; the Workspace support alias was created and its recorded delivery test did not bounce; Adam owns support/moderation. September 12 verified OTP expiry at 30 minutes and leaked-password protection enabled. Recheck affected flows if code changes; do not reopen these as never completed. Xcode Cloud is explicitly deferred while local signed releases are used. Never fix its redacted-config failure by committing secrets or bypassing the release-config gate.

## Repository, architecture and working rules

- Canonical checkout: **`/Users/adam.preda/Gary2.0`**, `main`, `https://github.com/apreda/Gary2.0.git`. Work directly on main, verify, commit explicit paths, push and check the relevant deployment. Several sessions can share the tree; preserve their work.
- `ios/GaryApp/`: SwiftUI app. `gary2.0/`: Node backend, scheduled workers, tests, Supabase migrations/functions. `web/`: Next.js website. `GaryMarketing/`: launch strategy and committed content. Read `web/AGENTS.md` and installed Next docs before web changes.
- `/Users/adam.preda/Documents/ChatGPT/Gary` is the local media/build-evidence workspace. Its `repo` clone is retired. `/Users/adam.preda/Desktop/Gary2.0` is a compatibility symlink; production moved outside Desktop after macOS denied launchd access. Do not restart work from an old audit worktree or replay a September 8 WIP branch.
- **Never read, print, hash, stage or commit** `ios/GaryApp/GoogleService-Info.plist` or ignored `SecretsLocal.swift`, including archive copies. Normal build tools consume existing configuration. Preserve the local private plist and report its expected production-truth warning.
- There is no standing global Gary design guide. Follow Adam's current requests, accessibility and data integrity. Plan, execute, review, adjust and repeat. “Fable 5.1” names the handoff recipient; it does not change production model settings.
- Supabase project **`xuttubsfgdcjfgmskcol`** supplies Postgres, Auth, edge functions and cron. Vercel deploys the website. The Mac runs the scheduler and Winners worker. Git push alone does not deploy every edge function, migration or loaded worker module. Do not perform a blanket database push: historical local/remote migration names need a content audit.

## Product: what exists and what users should understand

Gary helps sports fans find a game, see Gary's exact priced pick, read the reasoning and opposing case, and judge the public record. It does **not** accept wagers. Winners is a selected board; Hub is independent dated research; props and Fantasy provide relevant detail; Your Book tracks the user's decisions. Public profiles and leaderboard features are implemented. Do not rebuild them as a blank project because an old request described them as unfinished.

Preserve exact player/team/game identity, dates and doubleheader distinction. Historical games must not inherit today's starters. Unknown data stays unknown; workload alone does not imply a player is unavailable. NFL retains its weekly desk; MLB has Fantasy watch in Hub. The rejected 916 judgment-first Hub layout is historical.

Your Book now has manual entry, periods/calendar/breakdowns, markets/tags, bankroll windows, friends/following and a slip scanner with web parity. Scanning prefills a form; it does not save automatically. Keep user entries, Gary's immutable tickets and system settlement distinct. **No sportsbook account import or partnership is confirmed.** [Book implementation and acceptance history](HANDOFF_2026-09-09_YOUR_BOOK_ANALYTICS.md).

Important release difference: the Book analytics expansion, later Hub/line-movement presentation, feed readability and performance work followed source `e1ef5383`/920. Do not advertise all current source features as included in the public 920 binary. Build 930 includes cached pick formatting/game identity, lazy strip construction, deferred Book foreground refresh, Home countdown activity gating and single-line recap dates. Main views include `HomeView.swift`, `PicksView.swift`, `HubView.swift`, `WinnersView.swift`, `BillfoldView.swift`, `UserBookView.swift`; shared authentication is in `AuthManager.swift`.

## Picks, props, Winners and reliability

The scheduler is `gary2.0/scripts/scheduler.js`; game generation enters through `scripts/run-agentic-picks.js`; Winners uses `scripts/run-winners-board.js --watch`. September 16 production readback: scheduler **70396**, Winners **2347**, canonical folder, games/MLB **codex-gpt-5.6-sol**, props **codex-gpt-5.6-luna**, June/game stamp **ddea440c3b63**, props **0dc78ba3374d**. All **22 edge timestamp checks pass**, with no open profile reports. Timestamp parity is not source-byte parity. [Operational receipt](GaryMarketing/launch-2026-09/evidence/operations-2026-09-16.json).

**Preserve June unchanged for the 300-pick observation period, including xERA and the two documented quirks.** This later founder direction supersedes September 8's contrary MLB instructions. The September 12 MLB hold was removed; do not restore it. Plumbing can change a full stamp without resetting the cohort. Do not bulk-delete September modules still consumed by Winners/history/shared routers. No updated 300-pick cohort total is certified here.

Research is **Sonnet 5 subscription → Luna subscription → paid Haiku 4.5 research**, preserving full context across transport changes. Metered search is capped at zero. This authorized research chain is distinct from X's no-fallback policy. Do not change brains, providers, billing or credits by inference.

Current Winners is **daily-curation-v2**: per-sport start windows; normal target `min(5, max(window count, ceil(slate count × 0.25)))`; window reservations; independent 15-second coverage clock. Valid lone games enter when published; other windows fill ordinary coverage by T−60 with valid available tickets. Unavailable model/read grading cannot silently veto coverage. A sixth game needs the documented final-window/all-six-clear exception. Preserve original tickets, odds, timestamps and immutable admission evidence. Props have separate policy. Read [September 12 completion](HANDOFF_2026-09-12_CODEX_COMPLETION.md) before editing these rules.

Stored full-day coverage was **28/28 Sep 13**, **11/11 Sep 14**, **15/15 Sep 15** after the earlier laptop power loss and 23/60 Sep 12 gap. Tuesday was all MLB; its individual publication timestamps were absent, so do not assert every MLB pick was pregame from that evidence. Correct audits merge daily picks with latest active weekly NFL picks by league/game identity. Never backfill fictional pregame tickets or rewrite losses. Tuesday's log contains a 9 AM scheduler start; only overnight gaps exceeded an hour. Cause and uninterrupted uptime are not established.

## X: current contract, deployed fix and unfinished correction

Adam requires **fact / blank line / bare pick / blank line / fact**: two whole, original concrete sentences from one supporting paragraph. One primary selector over validated pairs; **no fallback copy/provider or silent retry**. Source insufficiency and provider failures must remain visible.

**social-auto-post v115** is live. September 14 source `2f8c6503` prevents explicit counterarguments from being used as support. September 15 source `3889c7c5` includes `nfl_results` in weekly and trailing records, excludes preseason and fails closed on results/dedup read errors. It was merged with the backend Supabase SDK 2.116.0 update as `f7fe01a8`. All 14 deployed files matched canonical text, JWT remained enabled, 168 focused checks and 236 edge tests passed, and a production dry run correctly returned 45–67 without publishing. [September 15 repair evidence](GaryMarketing/launch-2026-09/EXECUTION_REVIEW_2026-09-15.md).

**Monday's old weekly post still needs a correction.** It omitted NFL. Correct Sep 7–13 total: **45–67**; its original Monday trailing-30-day total: **208–237**. The next day's moving window is different. [Prepared correction](GaryMarketing/launch-2026-09/content/WEEKLY_RECORD_CORRECTION_2026-09-15.md) is **unsent**; the existing publication question has no answer. Do not treat source repair as correction of the public post.

Tuesday produced three game roots and two recaps; all three durable game intents completed and all three fact pairs pass offline source validation. Recaps show Monday MLB 6–4 and NFL 0–1. Normal audience-drip timing, quotas/cap and scheduling remain unchanged. The natural September 16 10:00 UTC cycle was HTTP 200/healthy/zero posts; unresolved/uncertain sends were zero. These do not prove every historical posting failure resolved.

The existing five-minute **Gary posting failures** automation owns incident state in `~/Library/Logs/Gary2.0/social-alert-state.json`; use `scripts/lib/socialFailureStatus.sql` read-only. It already notified Tuesday Angels/Padres NO_SAFE_COPY: offline replay finds no eligible pair. Earlier Eagles/Cowboys and Monday incidents remain retained. Do not clear them because newer cycles are healthy or pg_net retention expires, and do not test by sending tweets or generating synthetic audience activity.

## Launch, creative and real demand

**Keep remaining launch campaigns held until September 20.** Product Hunt is saved for **3:01 AM Eastern Sep 20**; rehearsal is **Sep 19**. Approval does not move that schedule. Normal game posting continues. Account creation before **October 1, 2026 at midnight Eastern** retains founding Winners access; the current entitlement has no expiry. Do not change that to install-based, season-only or a promised lifetime offer. Free reasoning/available props/Hub/record/Book stay free. U.S./Canada app availability does not imply Canadian external-purchase-link eligibility.

Strategy order: submission/disclosures/offer → measurable useful-game journey → X writing/reliability → polished eligible content → actual personal-tracking use → sportsbook discussions with evidence. Lead with app value and real features; aim for useful, professional and fun, without overdeveloping Gary as a fictional character. Use current real screens, researched creative references and clear demos. Do not invent integrations, wins, customers or testimonials.

The local video library is **`/Users/adam.preda/Documents/ChatGPT/Gary/launch-delivery/video-campaign/`**: README, playback `review.html`, **three real-app ads, five NFL options including a 27.5-second demo, and three six-second cutdowns**. Eight masters are 1080×1920/30fps H.264 with AAC audio, editable scenes, captions, source/rights manifests and publishing links. Footage is build **907** and dated game examples; refresh or clearly label before launch. Two films reuse the existing Runway stadium clip. Existing exports need no new subscription; platform-specific synthetic-content disclosure still needs placement review. Large media remains local, not silently committed.

Committed stills/captions, PH materials, a website-only YouTube overview and forum publication receipts are in `GaryMarketing/launch-2026-09/`. Prepared files are not publication receipts. Instagram age/link/handle settings and TikTok/Shorts placement eligibility remain open; do not infer permission from a 21+ caption. Current rules must be checked before a placement. No new paid campaign, invitations or vendor outreach is authorized by the release/handoff request.

The completed Sep 7–13 UTC website cohort remains **24 consented sessions / one useful read**. As of Sep 16 10:00 UTC, **three of four** observed-browser return windows are mature, with **one return**; one window remains immature. The one useful-first-session cohort has no recorded return. The Book cohort has one open/save/settlement session and now one mature first-save window with **no Book return**. The underlying 40 qualifying events did not grow; maturation changed the denominators. These are browser/session observations, not people, installs, satisfaction or independent recruited customers. Historical `accounts.google.com` classification is not SEO evidence. [Aggregate receipt](GaryMarketing/launch-2026-09/evidence/website-funnel-2026-09-07-asof-2026-09-16.json).

Use the [runbook](GaryMarketing/launch-2026-09/LAUNCH_RUNBOOK.md), [completion tracker](GaryMarketing/launch-2026-09/LAUNCH_COMPLETION_TRACKER.md), [personal-tracking protocol](GaryMarketing/launch-2026-09/PERSONAL_TRACKING_PILOT.md) and [integration packet](GaryMarketing/launch-2026-09/INTEGRATION_PACKET.md). Sportsbook diligence needs willing current Book users requesting import, applicable data rights, written viable economics and authorized contact/pilot scope. Affiliate distribution and consented history import are separate relationships; neither partnership is established.

## Verification, remaining work and takeover order

Native 930's exact-source [GitHub Verify run](https://github.com/apreda/Gary2.0/actions/runs/34776573234) was reread September 16: all three jobs passed. Its existing verification includes 64 focused local cases, 4,119 backend cases with 12 optional/platform skips, web/types and Apple coverage, successful Xcode 26.6 Release archive and strict signature verification. Read [the 930 evidence](HANDOFF_2026-09-13_TESTFLIGHT_930.md), whose old pending-review continuation is superseded above. No native code was changed or new archive created in this pass.

Four public launch pages returned HTTP 200. An unmeasured HEAD to `/go/app?surface=app_page_hero` returned 302 to the correct Apple app ID with the existing custom-product-page ID. This verifies the redirect, not authenticated custom-page acceptance or physical download. [Destination receipt](GaryMarketing/launch-2026-09/evidence/public-links-2026-09-16.json). September 14's public Picks → archive → dated game browser walkthrough remains bounded evidence, not account/purchase/Book/mobile acceptance.

1. Resolve Apple account access and ship the **next** candidate to TestFlight and App Review using the released-version continuation above. Record real milestones; do not withdraw or re-submit the public 2.25 version.
2. Complete final signed-device account/Book/mobile and storefront acceptance for the new candidate; reconcile screenshot/feature claims with the binary actually available to customers.
3. Keep pick coverage, source-copy failures, immutable results and current scheduled workers observable. Publish the prepared weekly correction only when its explicit authorization arrives.
4. Rehearse on Sep 19; refresh/label media and complete eligible-channel settings. Preserve the Sep 20 campaign hold and October offer.
5. Gather voluntary real Book/useful-reading feedback before increasing spend or pursuing sportsbook integrations. Do not manufacture participants or treat instrumentation as validation.

Useful commands: root `git status --short --branch`, `git worktree list`, `npm run verify`, `npm run smoke:web`; backend `node scripts/production-truth.js`, `node scripts/marketing-readiness.js --json`, `node scripts/profile-safety.js status`; web `npm run report:funnel -- --week YYYY-MM-DD`. Follow AGENTS for credential-free fixtures and isolated PostgreSQL. Production truth can return nonzero solely for the protected plist; report the actual flags. Relevant checks suffice; do not repeatedly run a full suite for documentation-only edits.

The daily launch review and five-minute posting monitor already exist; do not create duplicates. Their scope remains unchanged. This is a written handoff for Adam to give Claude; it does not start a Claude session or declare all six launch workstreams complete.
