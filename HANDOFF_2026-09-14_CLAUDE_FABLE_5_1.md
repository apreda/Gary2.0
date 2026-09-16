> **Superseded September 16:** Use [the current project handoff](HANDOFF_2026-09-16_CLAUDE_FABLE_5_1.md). Apple approved the September 8 submission and 2.25 is publicly available US/Canada. Newer source 930 is still not confirmed delivered; a subsequent App Store update requires an incremental version. The pending-review continuation below is historical.

> **September 15 follow-up:** [The current launch scorecard](GaryMarketing/launch-2026-09/EXECUTION_REVIEW_2026-09-15.md) records Apple's actual Waiting for Review response, full Monday coverage and the deployed v115 weekly-NFL reporting fix. It supersedes the dated no-reply/v114 statements below. Build 930 delivery remains unconfirmed.

# Gary takeover — Claude / Fable 5.1

Prepared September 14, 2026, after Adam requested all work committed/pushed, delivery to App Store and TestFlight, and a complete project handoff. This is the current starting point. Older handoffs remain evidence, but their superseded blocker lists, build numbers and model policies are not current instructions.

## Outcome and immediate priority

All application source through **2f8c6503** was already on `origin/main`; this handoff commits the remaining September 14 launch review and aggregate evidence. The latest native candidate is **2.25 (930)** from **9e76551de60a36e3cd1f007c42fde64aed20cb02**. No native or CI workflow changes exist between that release source and 2f8c6503.

**Apple delivery is still blocked.** A fresh, authorized export/upload attempt at **2026-09-14 10:16:40 UTC** failed with **exit 70 / exportArchive Failed to Use Accounts**. App Store Connect showed its sign-in page in both the in-app browser and Chrome. No new upload, TestFlight processing, review submission, withdrawal or build replacement occurred. The Chrome sign-in tab was retained for account restoration.

Build **920 was submitted** September 8; **926 is the last confirmed TestFlight build**. Those are historical verified facts, not a fresh read of Apple's current status. Do not tell Adam that 930 is waiting on Apple review. The account session must be restored before it can be delivered. The existing archive can be retried without another build-number increment.

The source, CI, signed archive and deployment evidence support continuing the release process. They do not establish that every possible bug is gone, that every physical-device journey has passed, or that Apple has approved the product. Keep remaining acceptance work explicit.

## Repository and working rules

- Canonical checkout: `/Users/adam.preda/Gary2.0`, branch `main`, remote `https://github.com/apreda/Gary2.0.git`.
- Backend and workers: `gary2.0/`; native app: `ios/GaryApp/`; website: `web/`; strategy and committed marketing assets: `GaryMarketing/`.
- `/Users/adam.preda/Documents/ChatGPT/Gary` holds local media, signed-build evidence and prior task artifacts. Its `repo` clone is retired. Do not bulk-add the outer workspace or replay the old September 8 WIP branch.
- `/Users/adam.preda/Desktop/Gary2.0` is a compatibility symlink. Production moved outside Desktop after macOS privacy restrictions prevented launchd reads.
- Read `AGENTS.md`, this handoff, then `gary2.0/CLAUDE.md`. Read `web/AGENTS.md` for web work. Work directly on main, test relevant changes, commit explicit paths and push. Preserve other sessions' work.
- **Never read, print, hash, stage or commit** `ios/GaryApp/GoogleService-Info.plist` or ignored `SecretsLocal.swift`, including archive copies. The private plist deliberately differs from its tracked redacted template and remains local. Normal compilation uses the existing configuration without exporting it into evidence.
- Adam has authorized the release, appropriate fixes and Apple follow-up. Do not ask again for the same permission. Missing account access or a factual acceptance result cannot be invented. “Fable 5.1” names the handoff recipient; it does not change Gary's production models.
- There is no standing global design guide. Follow current founder requests and preserve accessibility and data integrity. Plan, execute, review, adjust and repeat; do not merely produce another plan.

## Apple: exact continuation

| Item | Evidence / value |
|---|---|
| App | Gary AI - Sports Predictions, Gary A.I. LLC |
| App / bundle / team IDs | `6751238914` / `ai.betwithgary.app` / `SFBTX6KPLM` |
| Current native source | `9e76551d`, version 2.25, build 930 |
| Verified signed archive | `/Volumes/KINGSTON/Gary-2.25-930-Performance.xcarchive` |
| Upload options | `/Volumes/KINGSTON/gary-924-upload-options.plist` |
| Latest attempt | September 14 10:16:40 UTC, exit 70, Failed to Use Accounts |
| Last confirmed review submission | 2.25 (920), ID `ca44f7e9-9ef5-4cb9-aae0-20731a668a77`, September 8 23:38 UTC; last recorded Waiting for Review |
| Last confirmed TestFlight availability | 926, official Apple notices September 9 |
| Existing support case | `102957999956`; expedition was requested, not confirmed granted |

1. Restore the existing developer account in **Xcode → Settings → Accounts** and sign into **App Store Connect**. Do not extract session cookies, passwords or credentials. Inspect live build/review state and reviewer messages before replacing anything.
2. If 930 is absent, retry the verified archive:

   ```sh
   xcodebuild -exportArchive \
     -archivePath /Volumes/KINGSTON/Gary-2.25-930-Performance.xcarchive \
     -exportOptionsPlist /Volumes/KINGSTON/gary-924-upload-options.plist \
     -exportPath /Volumes/KINGSTON/gary-930-upload-sep14 \
     -allowProvisioningUpdates
   ```

   Options use App Store Connect upload, automatic signing and `manageAppVersionAndBuildNumber=false`. Do not upload an already processed duplicate. Record the actual result, then verify processing and access by the existing internal **Beta** group. Upload, processing, tester availability and App Review are separate milestones.
3. Reconcile current screenshots, review notes, privacy answers, contact details and offer against the selected final candidate. Existing 920 submission materials are dated and may need replacement for visible 930 changes. Complete the authorized App Review path using the actual live status. Do not withdraw an existing review speculatively or present an old submission as the latest build.
4. Preserve release settings unless the live workflow requires an authorized change. If an existing version has already been approved/released, use the normal subsequent-update route; inspect before choosing a version/build.
5. Continue the existing Apple case only when there is new information to supply. The corrected email was already sent **September 12 at 10:09:56 UTC from `apreda31@gmail.com` to `appreview@apple.com`**, Gmail SENT receipt `1a095185bdddb8e8`. Apple had rejected the company sender identity as unrecognized on the team. Do not duplicate the request or claim expedition was granted. Any new launch-date follow-up must use **September 20**, not the September 13 date in that historical email.

Review contact: Adam Preda, `adam.preda@betwithgary.ai`, +1 3177795640. Membership email: `apreda31@gmail.com`. Public support: `support@betwithgary.ai`. Reviewer credentials remain private.

Previously resolved: Adam confirmed physical Apple sign-in September 9; the support alias was created and its recorded test did not bounce; Adam owns support/moderation. September 12 verified OTP expiry at 30 minutes and leaked-password protection enabled. Do not reopen these as never completed. New auth changes still require regression testing. Xcode Cloud is explicitly deferred while local signed releases work; do not fix Cloud by committing the private plist or bypassing the release-config gate.

Read [build 930 verification](HANDOFF_2026-09-13_TESTFLIGHT_930.md), [the fresh retry receipt](docs/launch/evidence/claude-takeover-2026-09-14.json), and the final “Build 920 submitted” section of [submission history](docs/launch/APP_STORE_SUBMISSION_2026-09-08.md). Earlier unsent sections are historical.

## Product and user experience

Gary helps a sports fan find a game, see Gary's exact priced pick, understand its reasoning and opposing case, and judge the public record. It does not accept wagers. Winners is a selected board, Hub is independent dated research, props and Fantasy add relevant views, and Your Book tracks the user's own decisions. Public profiles and leaderboard features are implemented; they are not a blank project to rebuild simply because older requests called them half finished.

The Hub should surface useful observations a bettor would otherwise need several box scores to find. Preserve exact player/team/game identity and observation dates. A historical game must not inherit today's pitchers; doubleheaders must remain distinct. Missing data stays unknown. Workload alone does not imply a player is unavailable. NFL retains its weekly desk; MLB has Fantasy watch within Hub. The rejected 916 judgment-first layout is historical.

Your Book includes manual entries, periods/calendar/breakdowns, market types/tags, bankroll windows, friends/following and a slip scanner with web parity. The scanner prefills a form; it does not save automatically. Maintain clear labels for user entries, Gary's immutable original tickets and system settlement. There is **no confirmed sportsbook account import or partnership**. See [Book implementation and acceptance history](HANDOFF_2026-09-09_YOUR_BOOK_ANALYTICS.md).

Build 930 completes the previously unfinished native performance work: cached formatting/game identity, lazy strip creation, deferred Book foreground refresh, Home countdown activity gating and one-line recap dates. Main views include `HomeView.swift`, `PicksView.swift`, `HubView.swift`, `WinnersView.swift`, `BillfoldView.swift`, `UserBookView.swift`; shared authentication is in `AuthManager.swift`. Inspect current source before reviving old defects or redesigns.

## Picks, props, Winners and production

The Mac launchd worker runs `gary2.0/scripts/scheduler.js`; the game entry point is `scripts/run-agentic-picks.js`. Winners runs independently via `scripts/run-winners-board.js --watch`. Supabase project **xuttubsfgdcjfgmskcol** supplies database, Auth, edge functions and cron. The website deploys separately on Vercel. A Git push alone does not deploy every worker, database migration or edge handler.

Fresh September 14 readback: scheduler **PID 2340**, Winners **2347**, both canonical. Games/MLB use **codex-gpt-5.6-sol**, props **codex-gpt-5.6-luna**. Current game/June stamp is **ddea440c3b63**, props **0dc78ba3374d**. All **22 edge timestamp checks pass**. These timestamp checks are not source-byte parity; social-auto-post has a separate exact-source receipt.

**Preserve June unchanged for the 300-pick observation period, including xERA and the two documented quirks.** This later founder decision supersedes September 8's contrary MLB policy. The September 12 MLB hold was removed; do not restore it. Permitted plumbing changes can alter the full stamp without resetting the cohort. Do not bulk-delete September modules: Winners/history/shared routers still consume them. No new 300-pick total was computed in this pass.

Research is **Sonnet 5 subscription → Luna subscription → paid Haiku 4.5 research**, preserving full context across transport changes. Metered search is capped at zero. This authorized research chain is distinct from the **no-fallback X copy policy**. Do not infer permission to change brain providers or billing. Claude usage credits remain off; the separate API account's existing funding/auto-reload is documented historically, not freshly certified here.

Current Winners is **daily-curation-v2**: per-sport start windows, normal target `min(5, max(window count, ceil(slate count × 0.25)))`, reservations per window, and an independent 15-second coverage clock. Valid lone games enter when published; other windows fill ordinary coverage by T−60 with available valid tickets. An unavailable model/read grade cannot silently veto coverage. A sixth game requires the documented final-window/all-six-clear exception. Original tickets, odds, timestamps and immutable admission evidence remain authoritative. Props have separate policy. Read the exact [September 12 completion handoff](HANDOFF_2026-09-12_CODEX_COMPLETION.md) before editing these rules.

Sunday September 13 had **28/28 stored picks: 15 MLB and 13 NFL**. All 13 NFL publication times preceded kickoff; individual MLB publication times were unavailable in this query. The prior day's 23/60 and long scheduler gap followed laptop power loss. Both facts matter: recovered coverage is encouraging, but one full day does not prove permanent reliability. Daily-only queries omit weekly NFL picks; use the correct merged source. Do not backfill fictional pregame picks or rewrite losses.

## X and monitoring

Adam requires **fact → blank line → bare pick → blank line → fact**. Both facts must be whole original concrete sentences from the same supporting paragraph. Use **one primary selector over validated pairs**, no fallback copy/provider and no silent retry. Missing eligible source facts or primary failures must be visible. This is his preference; audience improvement is not yet proven.

Source **2f8c6503**, deployed **social-auto-post v114 at 10:07:33.401 UTC September 14**, prevents an explicitly labeled strongest/main/primary threat to the ticket from being supplied as supporting copy. The actual Miami regression failed before the fix and passes afterward. All 14 deployed files match canonical text, JWT remains enabled. It does not rewrite any original rationale or already published post.

Eight curated game roots and two recaps were published Sunday; all eight durable game intents completed. Current audience-drip-v1 cadence, cap and timing windows remain unchanged. The natural **10:15 UTC September 14** cycle returned HTTP 200 / health ok / zero posts with zero unresolved publication receipts. That is entrypoint health, not a positive new-copy posting test.

The **Gary posting failures** five-minute automation already reported Eagles and Cowboys `NO_SAFE_COPY`: their original sources have no eligible two-sentence pair at the available budgets. Those incidents remain in `~/Library/Logs/Gary2.0/social-alert-state.json`; do not clear them merely because recent pg_net responses are healthy. The read-only query is `scripts/lib/socialFailureStatus.sql`. Limited retention and the monitor's host availability are explicit limits. Do not test by creating live tweets or synthetic audience activity.

Read [X primary-only direction](HANDOFF_2026-09-13_X_FORMAT.md), [the current six-lane scorecard](GaryMarketing/launch-2026-09/EXECUTION_REVIEW_2026-09-14.md) and [prior audience selection](HANDOFF_2026-09-12_SOCIAL_AUDIENCE.md).

## Marketing, content and demand

**Hold remaining launch campaigns until September 20.** Product Hunt was saved for **3:01 AM Eastern September 20**, with rehearsal September 19. Normal game posting continues. This is a launch target, not promised Apple approval. The October offer is account-based: accounts created before **October 1, 2026 at midnight Eastern** retain founding Winners access. Do not replace it with install-based, season-only or invented lifetime copy. Check current pricing/checkout and storefront eligibility before promotion.

The strategy order remains: submission/disclosures/offer; measurable first useful game; X writing/reliability; polished eligible content; actual personal-tracking demand; then sportsbook discussions with evidence. Adam wants a useful, professional and fun sports company. Lead creative with the app's value and actual features. Use real screens and clear demonstrations, with researched creative references; do not invent shipped integrations, winnings or testimonials.

The delivered video library is local at **`/Users/adam.preda/Documents/ChatGPT/Gary/launch-delivery/video-campaign/README.md`**, with a `review.html` gallery: **three real-app ads, five NFL options including a 27.5-second product demo, plus three six-second cutdowns**. It includes editable scenes, captions, audio, source/rights manifests and publication links. The real screens are build **907**, so refresh or label dated examples before current launch use. Two films use an existing Runway stadium clip; appropriate synthetic-content disclosure remains part of placement review. Existing exports do not require a new paid account. The large local media package is not silently added to Git.

Committed stills/captions are in `GaryMarketing/launch-2026-09/content/`. The Product Hunt packet, published website-only YouTube overview and forum receipt are in that launch directory. Prepared assets are not publication receipts. Instagram age/link/handle checks and TikTok/Shorts placement eligibility remain unresolved; recheck current platform rules before use. Do not treat a 21+ caption as platform approval or open a paid campaign by inference.

September 7–13 UTC telemetry: **24 consented website sessions, one useful read**; four observed-browser cohorts, only **one mature** and three waiting, with no recorded return in the one mature cohort. One Book-open, manual-save and settlement session is recorded. It is not identified as an independent customer or recruited pilot; its return window is immature. Older August 31–September 6: eight sessions, one useful read, one return among three mature observed browsers. Counts are not people/installs, and historical Google-account referral misclassification is not SEO evidence.

Use [runbook](GaryMarketing/launch-2026-09/LAUNCH_RUNBOOK.md), [completion tracker](GaryMarketing/launch-2026-09/LAUNCH_COMPLETION_TRACKER.md), [personal tracking pilot](GaryMarketing/launch-2026-09/PERSONAL_TRACKING_PILOT.md) and [integration packet](GaryMarketing/launch-2026-09/INTEGRATION_PACKET.md). Sportsbook diligence requires willing users asking for import, viable written economics, applicable rights and authorized contact/pilot scope. Affiliate distribution and consented history import are different relationships; neither is established.

## Verification and next work

Native source 9e76551d passed **64 focused local cases** and [full GitHub Verify](https://github.com/apreda/Gary2.0/actions/runs/34776573234): 4,119 backend tests with 12 explicit platform/optional skips, plus passing Apple, web and edge jobs. Release archive and strict/deep signature verification passed. CI success was reread September 14. The latest X fix passed **165 focused tests, all 235 edge-helper tests and Deno check**. Do not describe those dated checks as a newly completed all-page physical-device audit.

September 14 additionally verified the public Picks → archive → dated Miami/Raiders game path and visible research/reasoning headings, with analytics declined. This is a bounded browser journey, not purchase/auth/Book/mobile acceptance. The website was observed READY at deployment `dpl_BhJgv28P8wCtEdwoHFjNBFbM5za2`, source `ab095b70`; GitHub dependency alerts were zero. Fresh production truth passed worker/model/edge checks and flagged the pending documentation plus the protected plist; after committing docs, the plist remains the expected local exception.

Useful commands, from root unless stated:

```sh
git status --short --branch
git worktree list
npm run verify
npm run smoke:web
```

From `gary2.0/`: `node scripts/production-truth.js`, `node scripts/marketing-readiness.js --json`, `node scripts/profile-safety.js status`. From `web/`: `npm run report:funnel -- --week YYYY-MM-DD` for a completed UTC week. Follow AGENTS for isolated PostgreSQL and credential-free fixture setup. Never print credentials or export raw customer identifiers.

Immediate continuation: restore Apple access and complete the existing candidate's delivery; reconcile final review materials and device acceptance; keep natural picks and primary X failures observable; rehearse the final account/Book/mobile journey before September 20; refresh dated footage and obtain real voluntary product observations. Preserve current scheduling and existing automations; no duplicate monitor is needed. Do not perform a blanket database push: historical local/remote migration naming mismatches require a content audit.

This is a written handoff for Adam to give Claude. It does not claim a Claude session was started, that all six launch lanes are complete, or that the app is already publicly available.
