# Gary takeover — Claude / Fable 5.1

Prepared September 12, 2026. Read this before the September 8 handoff. Older files contain superseded build numbers, model policies and unfinished-work lists.

## Assignment and working directory

Adam wants all project work committed and pushed, the current app delivered to TestFlight and App Review, and a thorough takeover message for Claude. Release and the Apple expedite/email follow-up are authorized. Do not request the same permission again. The recipient name “Fable 5.1” does not authorize changing production models.

Canonical repository: `/Users/adam.preda/Gary2.0`, branch `main`, remote `https://github.com/apreda/Gary2.0.git`. Backend: `gary2.0/`; SwiftUI app: `ios/GaryApp/`; Next.js website: `web/`; marketing: `GaryMarketing/`. The Desktop path is a compatibility symlink. `/Users/adam.preda/Documents/ChatGPT/Gary` contains task evidence and media; its `repo` clone is retired. The production checkout moved out of Desktop because macOS privacy controls prevented launchd access.

Read `AGENTS.md`, this file and `gary2.0/CLAUDE.md`; follow `web/AGENTS.md` for web work. Adam prefers verified changes directly on main, followed by push, without a mandatory PR. Preserve concurrent work and stage explicit paths.

At the start of this pass, canonical main and the actual remote main both equaled **571ef2c9de15dda76662a8ca614d89ff1926d47c**. All application changes through September 11 were already committed and pushed. The sole local modification was the deliberate private Firebase configuration exception. The old September 8 WIP is no longer pending; do not replay `codex/claude-handoff-2026-09-08` onto current main.

Never read, print, hash, stage or commit `ios/GaryApp/GoogleService-Info.plist` or ignored `SecretsLocal.swift`, including archive copies/symlink targets. Preserve them. Normal compilation consumes existing local configuration; never copy private contents into handoff files or logs. Use public example configuration for fixtures. Avoid blanket staging or broad diffs.

## Current release: what actually happened

| Item | Verified evidence |
|---|---|
| App | Gary AI - Sports Predictions, previously Sports Betting Picks; Gary A.I. LLC |
| IDs | Apple app 6751238914; bundle ai.betwithgary.app; team SFBTX6KPLM |
| App Review | **2.25 (920)** submitted September 8 at 7:38 PM ET; submission **ca44f7e9-9ef5-4cb9-aae0-20731a668a77** |
| Last official review-status notice | **Waiting for Review**, September 8, 23:38:33 UTC |
| Latest confirmed TestFlight availability | **926**, official processing and testing emails September 9, 21:52:30 UTC |
| Current native source | **927**, commit 8d7ae87b; no native changes between that commit and 571ef2c9 |
| New archive prepared in this pass | **/Volumes/KINGSTON/Gary-2.25-927-Handoff.xcarchive** |
| 927 verification | Release archive succeeded; Info confirms 2.25/927 and correct bundle; strict/deep signature verification passed; 103 explicitly inventoried public source/config files unchanged from pre-build manifest |
| 927 upload attempt | Failed September 12 around 10:15 UTC: **exportArchive Failed to Use Accounts**, exit 70. **927 is not confirmed uploaded or available in TestFlight** |
| Current Apple browser access | Both in-app browser and Chrome showed Apple sign-in. Adam was asked to sign in to Chrome. No authenticated September 12 review-state read or submission change occurred |

The 103-file manifest deliberately excludes private inputs and is not an assertion that every asset in the repository was inventoried. Local source/metadata/signature evidence is not Apple acceptance.

**Next release action:** restore the authorized Apple account session. Xcode may separately require the existing developer account to be signed in under its Accounts settings. Do not bypass account checks or extract browser/session credentials. Inspect the live build list and review submission before choosing any build. If 927 is absent, retry export/upload from the verified archive; do not rebuild merely to retry authentication. Existing public upload options: `/Volumes/KINGSTON/gary-924-upload-options.plist` (App Store Connect upload, automatic signing, team above, automatic build-number management disabled). Then verify processing and the existing internal Beta group. Do not add testers/groups unnecessarily.

For App Review, reconcile the actual status and reviewer messages, final candidate, matching screenshots, notes and disclosures. Do not withdraw 920 speculatively or claim 927 is under review. If 920 is already being reviewed/approved, establish that fact before taking the normal next-update path. Record the selected build, submission ID, status and time. User authorization is already present; missing account access is the current operational blocker.

Review contact: Adam Preda, `adam.preda@betwithgary.ai`, +1 3177795640. **Developer membership email: apreda31@gmail.com.** Public support: `support@betwithgary.ai`. Reviewer credentials are private; preserve that account.

### Later completions that supersede old blockers

- `docs/launch/APP_STORE_SUBMISSION_2026-09-08.md`, “Build 920 submitted,” records the actual submission, seven replacement screenshots, notes and Content Rights choice. Its earlier unsent sections are historical.
- `HANDOFF_2026-09-09_YOUR_BOOK_ANALYTICS.md` records Adam confirming Apple Sign-in works on the phone. Do not reopen “never tested” as an unresolved fact. Changes to shared auth code still need regression checks.
- The support Workspace alias was added September 9; its recorded delivery test no longer bounced. Adam is the support/moderation operator. This does not establish guaranteed response coverage.
- OTP expiry and leaked-password protection were still follow-ups in the September 9 record. Read current settings before claiming they remain wrong or have been fixed.

### Expedite and email — corrected in this pass

The September 9 company-email message states an expedited request was filed. Apple's acknowledgement assigned **case 102957999956**. On September 11, Aaron at `appreview@apple.com` said Apple could not locate the company email among App Store Connect team members and requested contact from the membership email. This is a contact-identity issue, not an app rejection or confirmed expedited-review decision.

On **September 12, 10:09:56 UTC**, this pass sent one corrected follow-up **from apreda31@gmail.com to appreview@apple.com**, referencing that case, app ID, 920 submission and planned September 13 launch. It asks for current review status and help with the existing expedited request. Gmail verified the `SENT` label, message **1a095185bdddb8e8**. Exact text is saved in the local evidence directory. Do not duplicate the request or claim expedition was granted. Continue this case using the developer membership identity.

### Xcode Cloud

Official Cloud failure emails for builds 1398/1403 report that the tracked Firebase configuration is redacted. Local signed builds reached TestFlight through 926. Do not fix Cloud by committing the private plist or bypassing `validate_release_config.sh`. Cloud requires a configured secret-materialization path and verified workflow; the current `ci_post_clone.sh` only materializes the existing voice configuration. Cloud repair is distinct from the current Xcode account failure during local export.

## Product and founder intent

Gary helps sports fans find a game, see Gary's exact priced pick, read its reasoning/counterargument, and judge the public record. Winners is a selected board; Hub is independent dated research; available props and Fantasy provide other ways in. Your Book tracks personal decisions. Gary does not accept wagers.

Adam wants professional, reliable company execution while keeping the content useful and fun. Lead with what the app does; the name and mark supply much of the personality. Use real app screens, readable demonstrations and actual records. Aspirational creative must not imply shipped capabilities, guaranteed wins, invented reviews or sportsbook relationships.

The Hub should reveal specific observations a bettor would otherwise need several box scores to find, with exact player/team/game destinations and source dates. Missing data remains unknown; workload alone does not establish availability. MLB has Fantasy watch within the Hub; NFL keeps its weekly desk. Rejected 916 judgment-first layouts and old style prescriptions are historical, not instructions to restore them.

## Changes since the September 8 handoff

| Lane | Current direction / source |
|---|---|
| Hub and data | 920 completed the missing dashboard components. 98f24866 fixed sample units and first-inning chronology; 2608a620 moved bullpen usage to BALLDONTLIE per-game pitching lines. 923–926 added/refined THE LINE, THE LADDER and Hub line movers. Movers stop at kickoff; live ladder rungs are labeled. |
| Your Book | September 9 added periods, calendar, breakdowns, market types, tags, bankroll windows, friends lens/following, web parity and slip scanner. Scanner prefills the form; it never saves a bet automatically. Full details and historical QA: HANDOFF_2026-09-09_YOUR_BOOK_ANALYTICS.md. |
| Home | 927 removes the redundant “THE BIG ONE” row label; the Winners star remains. |
| MLB | September 11 restored the June 15 engine, wired its stat routers, repaired H2H identity, added Anthropic conversation caching and corrected cache-cost accounting. September staged-judgment directions are superseded. |
| Football/props | NFL research and line history changed September 9. Anytime-touchdown picks have separate cards. Current prop cascade is bridge-only; comments describing earlier metered fallbacks are stale. |
| Winners | From September 9, game admission follows server rules: valid future underdog ML/plus-line tickets enter; favorites fill configured daily capacity. Recorded review no longer gates game admission; props retain review gating. Immutable board snapshots remain authoritative. |
| Web | Later Book, real-screen App page, THE LINE, game research and category-label changes are committed. Latest Vercel production deployment was not newly certified in this pass. |

Old missing-920-types and unstaged research blockers are resolved/superseded. Historical test receipts are not tests newly run today. Use current source and dated evidence before changing a lane.

## Architecture and production operation

The Mac launchd scheduler runs `gary2.0/scripts/scheduler.js`; the pick entry is `scripts/run-agentic-picks.js`. Winners has an independent `scripts/run-winners-board.js --watch` process. Supabase project **xuttubsfgdcjfgmskcol** supplies Postgres, Auth, edge functions and cron. Web is deployed separately on Vercel. A Git push alone does not deploy local workers, database changes or every cloud handler.

Fresh September 12 production report at source 571ef2c9:

- Scheduler **PID 11667**, canonical backend directory; Winners **PID 759**, running.
- Configured games/MLB: **codex-gpt-5.6-sol**; props: **codex-gpt-5.6-luna**. These override older Astra/Sol prose and source defaults. Do not change them merely to match old docs.
- Game/June era **80c55f8305ca**; props era **0dc78ba3374d**.
- All **22 edge deployment timestamp checks passed**; no unpushed commits; no open profile reports.
- Early-morning MLB: **0/15** published, **0 started without a pick**. Future games were pending.
- Exit **1** for the single preserved private Firebase configuration difference. Report the exception rather than resetting it or claiming an unqualified green tree.

Timestamp parity is not remote byte parity. A process/folder check does not establish complete slate coverage, correct settlements or profitable picks. Verify original ticket, price, chronology, source/era and outcome evidence separately. Restart a worker only when its loaded code needs a deliberate restart; preserve current scheduler settings and other tasks.

### Current MLB engine and an unresolved conflict

`src/services/agentic/mlbJuneEra/` contains June's prompt-bearing files from `c27db5f0` with marked adapter/import changes. MLB routes to this engine. Relevant commits:

- **67135fd4:** restored June engine.
- **565ee325:** wired June stat routers; ported accent matching, paginated/honest H2H and traded-reliever repairs.
- **9f2664e8:** resolved H2H team IDs.
- **dc03eaae:** moving Anthropic conversation-cache breakpoint.
- **571ef2c9:** priced cache reads and writes in cost tracking.

June uses current provider adapters and underlying data services. Do not quote older researcher-cost estimates or infer fallback funding from primary success.

**Policy conflict found September 12:** the restored June tree includes xERA instructions/formatting in `passBuilders.js`, `spreadEvaluationFactors.js`, `flashInvestigationPrompts.js`, `flashAdvisor.js` and `scoutReport/sports/mlb.js`. The earlier no-xERA direction is still explicit in CLAUDE.md; the September 11 source records a founder request to restore June verbatim except models. This pass did not silently rewrite restored prompts or assert xERA is absent. Reconcile the narrow conflict with Adam, inspect whether current provider output populates those fields, and test the resolution. A passing source-pin test does not resolve the conflict.

Keep test picks in `test_daily_picks`, never production `daily_picks`. Preserve original picks/results/evidence; never erase losses or relabel historical outcomes as a new policy's success. Confidence is not a calibrated probability. Gemini remains retired. Injury labels/duration handling have specific founder protections. Preserve pinned NBA prompts during unrelated work.

Research still requires exact doubleheader identity, unique completed-game samples, chronological ordering, correct PA/AB units, source dates and honest unknowns. September 8 research updates retained backups and used expected old detail/meta with restricted application patches. Update integrity is not factual correctness; consult subsequent commits before repeating old repairs.

`docs/launch/PROVIDER_RIGHTS_2026-09-08.md` contains both the original audit and the later basis used for Apple's answer. It records BALLDONTLIE/The Odds API grants, nflverse attribution and remaining MLB/Savant migration paths. A public endpoint, attribution or accurate numbers alone do not establish unrestricted commercial rights. Preserve the documented scope; the later recorded rationale is not an independent legal clearance.

## Launch and marketing handoff

The priority order remains offer/privacy consistency → measurable first useful visit → X quality/reliability → professional content for eligible channels → personal-tracking evidence → sportsbook diligence. Implementation does not prove audience demand.

Read `GaryMarketing/launch-2026-09/LAUNCH_RUNBOOK.md`, `LAUNCH_COMPLETION_TRACKER.md`, the execution reviews, `PERSONAL_TRACKING_PILOT.md`, `PRODUCT_HUNT_PACKET.md` and `INTEGRATION_PACKET.md`. Their offer/measurement definitions remain useful; older build/model/Winners states need this update.

- **Offer:** Winners preview ends October 1, 2026 at midnight Eastern. Accounts created before the cutoff retain founding access, with no expiry currently configured. Eligibility is account creation, not installation. Do not invent a lifetime marketing promise or season-end date. Reconcile actual checkout/pricing and storefront behavior.
- **Measurement:** use consented useful reasoning views and explicitly matured return cohorts, excluding QA/admin/demo traffic. Impressions are not installs, unique people or retained users. Completed Eastern publishing dates and UTC funnel weeks have different boundaries.
- **Fresh X check:** September 12 at 10:11:42 UTC, readiness is **action_required**: one stale publication reservation has an uncertain send outcome; latest poster health is degraded for that reason. Reconcile the reservation against actual X receipts before retrying; never blindly re-send. September 11's complete day logged **18 posts, 16 pick threads**. This is observed logging, not proof of full scheduled-slate coverage or fresh prose quality.
- **Mature social cohort:** 118 standard posts in the report's completed 14-day window have measured median 436 impressions and total 270 profile clicks. Thread components overlap; 68 have an own reply. Link-click measurement is unavailable. This is not a video conversion result or website retention evidence. Do not aggregate overlapping formats as unique reach.
- **Video library:** `/Users/adam.preda/Documents/ChatGPT/Gary/launch-delivery/video-campaign/review.html` and `README.md` contain eight finished vertical masters (three real-app ads, five NFL options including a product demo) plus three six-second cutdowns. Real screens are September 7 captures from 907; preserve dated-example wording and refresh footage for materially changed screens. Captions, campaign IDs, source/rights notes and QA receipts are included. Prepared content is not a published or approved campaign.
- **Later creatives:** `GaryMarketing/ads/2026-09-09-x-ads/` and `GaryMarketing/Ad.md` record September 9 artboards and publications. Recheck live posts and claims before measuring or reusing them. These are separate from the eight video masters.
- **Channels:** last tracker still has Instagram age/link/account tasks and TikTok/Shorts eligibility work. A 21+ bio/caption is not an account age control or paid approval. No new spending or autonomous campaign is implied.
- **Product Hunt:** scheduled September 13 at 00:01 Pacific / 03:01 Eastern. Recheck its live dashboard and final assets before claiming launched/featured. The schedule does not make an unapproved build publicly available.
- **Personal tracking:** the Book feature is substantially richer, but real users completing and returning still need observation. September 9 scope skipped sportsbook syncing, CLV/EV/arbitrage and copying other users' picks. No FanDuel/DraftKings partnership is established. Demand, economics, privacy and use rights precede integration commitments.
- **Support:** preserve audited profile-safety controls, private report data and reviewer access. An empty moderation queue is not proof of support coverage or a completed launch rehearsal.

No new marketing campaign, vendor message, user invitation or purchase was made in this pass. The already authorized Apple follow-up is recorded above.

## Verification and immediate continuation

This pass ran **39 tests across six suites**, all passing: June source contracts, cost tracking/levers, Home rendering, Home lifecycle, and actual stale-response/account-ownership behavior. The signed Release archive also passed. These checks do not constitute a fresh every-page audit or proof the app is bug-free.

From repository root, `npm run verify` covers backend/native helpers/web/TypeScript; `npm run smoke:web` covers local read-only fixture journeys. Read AGENTS setup notes first. These do not verify live providers, purchases or App Review.

From `gary2.0/`:

```sh
node scripts/production-truth.js
node scripts/marketing-readiness.js --json
node scripts/winners-book.js
node scripts/profile-safety.js status
```

From `web/`, `npm run report:funnel -- --week YYYY-MM-DD` reads a completed UTC week and explicit mature cohorts using existing authorized credentials. Never print credentials or raw customer IDs. No new funnel/retention result was computed in this pass.

Immediate work:
1. Restore Apple/Xcode account access; verify live review/build state; retry the ready 927 archive's upload if absent and complete authorized submission with matching materials.
2. Continue Apple case 102957999956 from the membership email; wait for an actual response before claiming expedition.
3. Reconcile the uncertain X publication from receipts, without duplicate posting.
4. Resolve the June/xERA conflict and recheck remaining Auth/Cloud configuration through supported access.
5. Rehearse current Book and campaign destinations, refresh matured funnel evidence, and verify the September 13 launch packet.

Local evidence: `/Users/adam.preda/Documents/ChatGPT/Gary/claude-handoff-2026-09-12/`. The committed release receipt carries the final bounded outcomes. This is a written handoff for Adam to provide to Claude; no new Claude session or message delivery is implied.
