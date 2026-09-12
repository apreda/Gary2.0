> **Historical handoff:** Start with [the September 12 takeover](HANDOFF_2026-09-12_CLAUDE_FABLE_5_1.md). The hold, missing 920 components, local WIP, model policy and Apple state below were subsequently changed. Preserve this record as history, not the current release instruction.

# Gary takeover — Claude / Fable 5.1

Prepared September 8, 2026, Eastern time. This is the current takeover brief, including unfinished work. Read it before older handoffs: several older files describe candidates and operating assumptions that were superseded within hours.

## 1. Adam's latest instruction and release decision

Adam initially asked to commit/push everything, send Gary to the App Store and TestFlight, and write a comprehensive handoff for Claude/Fable 5.1. When asked about physical Apple sign-in, the remaining MLB/Savant use basis, and staffed support/profile reports, he replied:

> ah no it hasnt okay we are going to have to fix all that before submitting so write all that in for Claude to do please be details as fuck

**App Review submission is on hold until these issues are resolved.** No new build was uploaded or submitted by this takeover task. No expedited-review request or Apple email was sent. His answer does not distinguish an attempted failing physical login from a test he has not completed; reproduce and diagnose before naming a cause. It does not establish data permission or nominate a support operator.

Take ownership of the repairs, the unfinished Hub work, release verification and eventual submission. Continue useful technical work without asking Adam to approve the same scope repeatedly. Ask him only for facts/access/decisions you cannot supply. Do not invent a rights basis, successful device test, staffing commitment or Apple approval to get past a gate. The original release authorization is conditional on readiness under his latest correction.

This is a written handoff for Adam to give Claude, not evidence that another Claude session has been started or received it. “Fable 5.1” names the requested recipient; it is not an instruction to change Gary's production model configuration.

## 2. Correct checkout, Git state, and recoverable unfinished code

- Active repository and production root: `/Users/adam.preda/Gary2.0`.
- Backend: `/Users/adam.preda/Gary2.0/gary2.0`.
- Remote: `https://github.com/apreda/Gary2.0.git`.
- Normal development branch: `main`; completed authorized changes go directly to `origin/main`, without a mandatory PR.
- `/Users/adam.preda/Desktop/Gary2.0` is a compatibility symlink. The physical repository was moved September 7 after launchd could not read macOS-protected Desktop files.
- `/Users/adam.preda/Documents/ChatGPT/Gary` is the evidence/task workspace. Its outer Git repository has no commits or remote; it is NOT the application repository. Do not bulk-add it: it contains archives, old clones, source snapshots, raw research and local operational evidence.
- `/Users/adam.preda/Documents/ChatGPT/Gary/repo` is RETIRED. Its divergent old main is not a release base. The `audit-2026-09-04` worktree and other design worktrees are historical too.

At takeover, canonical main and origin/main were at `7bae591a` (Show measured one-run records with other-game context). The main-branch handoff commit adds documentation, not a new accepted native release. Unfinished source is preserved remotely on **`codex/claude-handoff-2026-09-08`**; see `docs/launch/CLAUDE_TAKEOVER_RECEIPT_2026-09-08.json` for exact commit IDs and verification results.

The checkpoint is intentionally a work-in-progress branch. It does not certify that its native tree builds. The same source edits remain in the canonical working directory so Claude can continue where the interrupted tasks stopped. They are backed up in Git; their presence as local modifications is deliberate. Do not blindly cherry-pick that checkpoint onto these identical local edits. On another machine, fetch the branch and inspect its diff against main; on this Mac, compare existing files with the checkpoint first. Do not use reset --hard, clean, or blanket checkout to obtain a cosmetic clean status.

Protected local configuration: `ios/GaryApp/GoogleService-Info.plist` differs intentionally from its tracked redacted template; `ios/GaryApp/SecretsLocal.swift` is ignored. Preserve both. Do not read, hash, stage, commit or copy private contents into a handoff. Prior frozen builds used compiler-only symlinks to these existing private paths. The handoff and checkpoint exclude them.

Read `AGENTS.md`, `gary2.0/CLAUDE.md`, and `web/AGENTS.md` before working in the corresponding lane. Historical design prescriptions are not standing instructions: Adam explicitly removed the old global style guidance. Follow current requests; retain accessibility and data-integrity requirements.

## 3. What Gary is and what Adam wants

Gary is an AI sports-prediction and research product for sports fans/bettors. Its core experience is finding a game and seeing Gary's exact pick, price and reasoning, with a public history of results. It also offers selected Winners, independent research in the Hub, available props, Fantasy information, private personal tracking/Book, and opt-in public profile/leaderboard features.

The product has two complementary jobs: make a considered call for the person who wants Gary's view, and gather useful evidence for the person who wants to make their own decision. Do not turn every surface into another game-pick narrative.

Adam explained the Hub as the information a bettor hears during a game and thinks, “I wish I had known that before I bet.” Surface specific, dated observations and connections that would otherwise require digging through multiple box scores. Examples: a pitcher's last three outings with relevant context; named bullpen usage across recent games; a team's unusual streak; series/sweep context with a verifiable prior sample. A season ERA alone adds little; an unexplained predictive paragraph also misses the purpose.

Keep direct navigation to exact player, team and game research. Cal Raleigh should open Cal Raleigh; a selected historical game must not show today's pitchers or use another game in a doubleheader. Workload alone does not prove a reliever is unavailable. Missing facts remain unknown. The Hub should help users reach their own conclusions, without repeatedly telling them what a stat means for tonight's wager.

The earlier judgment-first Hub (916) was superseded. The gray observational Hub was restored in 917; 918 added source-policy changes; 919 made research more compact and improved player/team/bullpen surfaces. The dedicated Hub game-judgment worker stays disabled; ordinary collection must not generate those game judgments by default. This does NOT disable the separate MLB pick brain's staged judgment process.

MLB has a compact Fantasy watch within the Hub, not the old separate MLB Fantasy tab. NFL retains its weekly Fantasy desk. The latest requested 920 direction is a compact masthead, a lead observation plus quick research list, independently expandable research modules, peer Fantasy watch, and contextual charts based on real observations. Gray cards and useful research remain the baseline; do not restore the rejected long narrative version.

## 4. Last known Apple release state — do not confuse stages

| Item | Last recorded state |
| --- | --- |
| App | Gary AI - Sports Predictions; Gary A.I. LLC |
| Apple app ID / bundle / team | `6751238914` / `ai.betwithgary.app` / `SFBTX6KPLM` |
| Marketing version | `2.25` |
| Latest uploaded build | **919**, frozen public native source `96e7f905a1604b05694ef8e6458bb8a5d0681267` |
| 919 upload | Succeeded September 8 at `2026-09-08T21:07:38.621Z` |
| 919 processing/distribution | Complete; existing internal **Beta** group, one tester; What to Test saved |
| 919 Apple build UUID | `459985e1-b2fb-4b21-b542-719d016c65f6` |
| 919 archive | `/Volumes/KINGSTON/Gary-2.25-919-Research.xcarchive` |
| 919 upload log | `/Volumes/KINGSTON/gary-919-upload.log` |
| Saved App Store draft | **2.25 / Prepare for Submission / build 915**, with saved notes and seven ordered screenshots |
| Final planned candidate | **920 reserved**, unfinished; project build settings still say 919 at takeover |
| This task | No upload, no App Review submission, no expedition, no email |

These Apple facts come from the existing release receipts, not a new authenticated browser read in this task. Re-read Apple before acting. Do not upload 915, 918 or 919 again. Do not export/upload/select superseded 916. Check Apple's build list before consuming 920 in case another owner has since used it.

The existing screenshot order is **Home, expanded Gary take, historical game, Hub, Fantasy, Winners, Gary Billfold**; verify the authoritative manifest before replacing. Final materials must show the eventual candidate, not a 915 or 919 screenshot presented as 920.

Authoritative materials: `docs/launch/APP_STORE_SUBMISSION_2026-09-08.md`; local evidence `/Users/adam.preda/Documents/ChatGPT/Gary/app-store-submission-2026-09-08/`, especially `native-919-upload-receipt.json`, `native-919-testflight-detail.txt`, `native-919-{source,archive,distribution}-independent.json`, `notes-for-review-919.txt`, and `whats-new-919.txt`.

The top of `HANDOFF_2026-09-08_LAUNCH_READINESS.md` still says 919 upload pending; the later upload receipt supersedes it. Many older files mention 901/912/915 waiting states or 918 as final. Preserve their historical evidence, but do not follow their stale candidate selection.

## 5. Priority zero: actual Sign in with Apple completion

Prior App Review feedback on August 19 concerned reviewed version **2.23 (874)** on **iPad Air 11-inch (M3), iPadOS 26.6**. Apple sign-in returned to the login screen without completing. Pricing in the subtitle and reviewer access were separate findings, subsequently addressed in the prepared draft. The old review item's mutable selected-build display is not evidence that Apple reviewed 915.

Start in `ios/GaryApp/AuthView.swift` and `AuthManager.swift`:

- `AppleSignInCoordinator` retains an `ASAuthorizationController`, requests authorization, supplies an explicit active-window presentation anchor, and sends the credential to `AuthManager.signInWithApple`.
- `signInWithApple` exchanges the Apple credential with Supabase, then adopts it through generation-bound session handling. Existing error paths expose exchange failures.
- Auth sheet dismissal handles both an already-authenticated appearance and new authentication transitions. Preserve account-generation guards; a late callback must not authenticate or clear a different account.
- Prior distribution checks already verified Apple sign-in entitlement `Default` in signed code AND profile, correct application/team ID, production push, and `get-task-allow=false`. Correct signing is necessary but did not prove provider completion.

Reproduction plan:

1. Identify the exact installed signed build and device/OS. Start with available 919 for diagnosis if appropriate. Have Adam perform any Apple account/password/biometric interaction that requires him. Record whether he never tested, gets a visible error, cancels, or returns to login after apparently authorizing.
2. Trace the actual stages: button tap → authorization presented → delegate success/error → nonempty identity token → Supabase exchange response → session adoption → auth state update → login sheet dismissal → authenticated profile/Book reads. Capture safe error codes, timestamps and HTTP status; never persist tokens, credentials or personal identity in logs/commits.
3. Inspect live Supabase Apple-provider configuration using supported authenticated administration. Verify the identifiers match the actual native flow; distinguish native ID-token exchange from browser OAuth/service-ID configuration. Review the shipped request's nonce requirements against current official Apple/Supabase documentation before changing the flow. A missing or mismatched field is a hypothesis until the observed response supports it.
4. Check UI presentation on iPhone and the iPad family Apple reported. Retry, cancellation, exchange failure, slow/offline responses and returning to the app must produce clear states. Do not treat the unsigned Simulator's previous authorization-start error as a proven release defect or proof of its cause.
5. Verify new and returning Apple login where accounts/access permit, persisted session after relaunch, logout and re-login, revoked credential handling, and account switching without cross-account Book/profile data. Check email/Google paths for regressions when changing shared auth/session code.
6. Save a sanitized physical-device acceptance receipt tied to final build/source, steps and actual result. A passing email login, existing reviewer credentials, successful compile, or hidden login sheet by itself does not close this issue.

The prior iPhone Mirroring session could not connect. Fixing mirroring is not the user outcome; a direct signed-device test by Adam is valid evidence if the device/build/steps/result are recorded. Do not repeatedly rebuild unrelated UI while this remains undiagnosed.

Separate authorized Auth hardening remains open: OTP validity **1800 seconds** and leaked-password protection enabled. Last recorded configuration had OTP over 3600 seconds and protection disabled. Read current values first, perform narrowly scoped supported updates, then read back/advisor-check. These are not established causes of Apple login failure. Do not use a broad Supabase config push or extract browser/session credentials.

## 6. Priority zero: third-party data rights and truthful Apple declaration

The prior App Information read says the app does not contain/show/access third-party content. That conflicts with implemented provider reads. Do not leave that known mismatch or replace it with an unsupported all-rights declaration.

`docs/launch/PROVIDER_RIGHTS_2026-09-08.md` contains dated primary-source links, use paths and the bounded evidence audit. Re-check current official terms and actual source usage before concluding. This handoff is an evidence inventory, not a legal clearance.

- BallDontLie and The Odds API have recorded public commercial-display/analysis grants for the reviewed use, with scope/restrictions. A separate bespoke contract is not automatically required. Preserve subscription and applicable terms evidence; API access is not league endorsement.
- nflverse attribution and license/adaptation links are deployed on `/data-sources#nflverse`, linked from Terms. Its data license is distinct from software licensing; upstream-derived material still needs appropriate provenance. Do not remove this credit.
- Remaining direct **MLB StatsAPI and Baseball Savant** enrichments lack a documented applicable basis in the bounded audit. Their being public, accurate or available without a key does not establish that basis. The search of Gmail, Drive and Dropbox found no agreement, but did not prove none exists.
- Several paths have already been replaced: MLB field lineups now use BDL; native MLB live batting reads the new BDL-backed cache; NFL current practice reports use exact paginated BDL designations. The original provider-rights table predates these repairs; do not redo them or reintroduce the old NFL scrape.
- Remaining MLB paths include live outs/base occupancy, first-inning research, bullpen and other derived Hub/Fantasy enrichment. Re-inventory imports, running collectors, native/web transports and visible cached rows. Do not assume removing one client URL removes the server dependency.
- Tank01 terms/access remain to verify before NBA relaunch or enabling a new salary surface. An old unused adapter is different from a shipping consumer.

Resolution work: map each retained source to request → transformation → storage → customer-visible output; find documented applicable grants/permission if they exist; otherwise evaluate a permitted replacement that preserves exact facts, dates and identities. BDL is not mandated as the only source. If available sources cannot support a feature, explicitly hide/unavailable that feature rather than fabricate values or silently substitute a different stat. Do not remove useful data indiscriminately.

After changes, test both positive observations and unknown/empty/conflicting/doubleheader cases, deploy actual backend/edge changes, reconcile current visible caches through bounded audited repairs, and archive a new native build when client code changes. Document source/use/terms date/attribution/limits and unresolved gaps. Only then reconcile Apple's field with the supported facts.

Adam explicitly forbids **xERA everywhere**: no use, citation, estimate, prompt field or display. Actual ERA and other valid observations stay. 918 removed active xERA transport/display/generation and retired ten specifically inventoried current ungraded pitcher-regression rows with originals preserved. Eight refreshed Fantasy decisions were verified clean. Old inactive `meta.judgment` references and null legacy keys are historical data, not permission to revive xERA. See `HANDOFF_2026-09-08_SOURCE_POLICY_918.md`.

## 7. Priority zero: support inbox and human profile moderation

Technical controls exist: report/block, private queue, audited moderation RPCs, public rules and appeal route. That does not establish someone monitors them. Adam has not yet nominated an operator or committed response coverage.

Read `docs/launch/PROFILE_MODERATION.md`. Public route is `https://www.betwithgary.ai/terms#profile-safety`; support address is `support@betwithgary.ai`. Verify actual inbox access/delivery, not merely a mailto link or App Review contact. Ask Adam for the human owner, actual staffed schedule, realistic response target, backup and urgent escalation/appeal handling. Do not invent a 24-hour guarantee.

Read-only operator entrypoints, from the canonical backend:

```sh
node scripts/profile-safety.js status
node scripts/profile-safety.js queue
node scripts/profile-safety.js show REPORT_UUID
```

Queue/show output is private. Keep profile snapshots and report details out of public commits and shared handoffs. Last earlier status check showed zero open reports; re-read before acting. `hide`, `dismiss`, and `restore` use the existing audited path and preview unless `--apply` is supplied. A report alone must not change a person's bets, results or global rank.

Use consenting test accounts/staging for end-to-end report/block/unblock, moderator review, visibility removal, owner appeal and restoration. Check account switches, stale report rejection, denial/offline errors and private data isolation. Do not manufacture production reports or punish a real account to prove the workflow. Update operator documentation and truthful reviewer notes once actual coverage is established.

## 8. Unfinished 920 source — exact work Claude inherits

Native files at takeover:

- `ios/GaryApp/HubView.swift`: new compact header; sport-specific saved open-module state; research navigation; grouped expandable workspace; quick category selection; embedded Fantasy; bullpen chart-sheet references.
- `ios/GaryApp/HubFrontPageSelection.swift`: configurable supporting-row limit (clamped 0–4); new `HubResearchLayout` helpers for per-league saved sections and stable row grouping.
- `ios/GaryApp/FantasyBriefingView.swift`: `embeddedInHub` flag that avoids a duplicate compact masthead and retains the scoring menu.

**Known integration blocker:** the source references `HubResearchDashboard`, `HubQuickResearchPage`, `HubResearchModule`, `HubResearchModuleCard`, and `HubBullpenChartSheet`, but a repository Swift-source search found uses only, with no definitions. The previous task was interrupted before delivering those components. No 920 archive/build/upload exists in this task. Do not call it ready because selection/helper tests pass. Finish the missing implementation or deliberately revise the incomplete design while preserving Adam's latest scope; wire any new source into the actual Xcode project.

Additional acceptance work: verify module open/close state is independent and per sport; all categories remain reachable; quick-list targets open the full corresponding research; lead items remain discoverable in their category; expanded full-width modules and compact peers lay out correctly; large Dynamic Type switches to usable single-column content. Check chart availability from real dated bullpen observations, labels/units, no invented availability claim, and sheet-to-detail transitions. Verify MLB/NFL/NCAAF routing, today/history transitions, stale/error/empty states, actual player/team/game taps, VoiceOver labels and touch targets. The checked-in project currently still has `CURRENT_PROJECT_VERSION = 919` twice; do not accidentally upload changed source under 919. Avoid blindly regenerating from stale `project.yml` version defaults.

Unfinished backend source:

- `src/services/insights/computers/firstInning.js` plus `tests/services/insights/firstInningResearch.test.js`: typed observed facts, de-duplicated official game IDs, conflict rejection, exact probable/opponent/side checks, retained sample IDs/dates, measured detail through `firstInningResearchDetail`, removal of predictive lane-read prose. **Chronology remains unfinished:** current same-date ordering uses descending `gamePk`; this is not proof of doubleheader order. Finish actual game-time/order provenance and boundary tests before publishing a new “last ten” sample. Prior research mentioned `gameDate`; the on-disk sample projection still retains only `gamePk` and `date`.
- `src/services/insights/computers/heatCheck.js`, `coolingOff.js`, new `recentBattingSample.js`, and new `recentBattingSample.test.js`: preserve true PA versus AB fallback; missing PA can use a valid AB sample, while known zero/short PA cannot be promoted by fallback. Reject impossible AB > PA. Carry source/window/count/unit metadata and keep sample wording truthful.

An actual 919 Devers card exposed the problem: restored body said **57 PA** while native source stats showed **57 AB**. The initial 47-row restoration therefore does not close factual sample-unit acceptance. Finish source-specific recomputation and bounded current-row correction, including readback in the actual player card. Do not globally replace every PA with AB, invent the count, or assume every restored old paragraph was source-verified.

Focused verification in this takeover task: **94 tests / six suites passed** for recent batting sample, first-inning research, Hub data accuracy, typed research facts, fresh research helper, and actual Swift front-page selection. This does not include a full app compile, the missing-component integration, completed chronology fixes, or live current-row republication. Log: `docs/launch/evidence/claude-takeover-2026-09-08/focused-tests.txt`.

## 9. Already published research corrections and safe continuation

Recent main commits include `96e7f905` (919 native research), `0b678ea6` (bounded research copy restoration), `49ea372c` (typed source formatters/validation), and `7bae591a` (measured one-run records).

The earlier task published 47 specifically reviewed current ungraded MLB body/metadata repairs with 47 immutable originals. Forty restored original bodies verbatim; seven omitted the exact terminal “He starts tonight.” statement. Ballpark-shift copy with invalid 44.7 baseball innings was excluded. Philadelphia row 30496 separately received measured **25–13 in one-run games, 56–50 in the other 106**, from 144 unique completed regular-season games before September 8. Texas bullpen research has separately retained named-arm workload, season context, source dates and the September 7 off day.

Evidence lives in `/Users/adam.preda/Documents/ChatGPT/Gary/hub-stats-first-2026-09-08/`: `legacy-research-rpc-publication-receipt.json` and its `.originals` directory, `philadelphia-one-run-publication-receipt.json` and originals, `texas-bullpen-publication-receipt.json`, `first-inning-fresh-unique-source-preview.json`, and independent review receipts. First-inning previews are not proof that the corresponding repair was published. Inspect exact receipt status and live readback.

The service-only CAS migration is `20260908211837_observed_hub_research_cas`. Current date, grade, exact identity, old detail and full old metadata are checked atomically. Current clients change **detail and meta only**, preserving headline/value/tone/spark. The SQL optional display-field parameters do not extend the compared expected-state fields; do not use them as a full-row CAS. Metadata travels in POST bodies because direct URL predicates were too large. Preserve immutable originals, stop on stale identity/state, and do not overwrite started/graded/historical records to refresh a preview.

## 10. Production architecture and non-negotiable data contracts

The backend is Node/ES modules with local launchd scheduling, provider services, research/model orchestration and Supabase storage/edge handlers. Native is SwiftUI in `ios/GaryApp`; web is Next.js in `web`, deployed through Vercel at `www.betwithgary.ai`. Supabase project is `xuttubsfgdcjfgmskcol`; migrations and functions primarily live under `gary2.0/supabase`. Follow the actual deployment layout before changing either similarly named directory.

Main operational entrypoints: `gary2.0/scripts/scheduler.js`, `run-agentic-picks.js`, `run-winners-board.js --watch`, `production-truth.js`. Core model orchestration: `src/services/agentic/orchestrator/agentLoop.js`, scout desks in `src/services/agentic/scoutReport`, sport awareness in `src/services/agentic/constitution`, and actual model configuration in `orchestratorConfig.js` plus launchd plists.

Game picks use Astra; props use Sol. The configured fallback cascade uses Sol/Anthropic lanes as documented in current config. Gemini is retired. NBA's April 8 winning-era prompts stay pinned for relaunch. MLB, NFL and NCAAF are active; NHL/NCAAB were removed. NFL still uses its own desk/bilateral spread assignment; don't transplant MLB's staged policy into football incidentally.

When changing prompts, preserve the “Layer 3” rule: describe observations and investigation, never prescribe “factor X means bet Y,” assign canned point values, or force a market conclusion. Confidence is the model's judgment, not calibrated probability. Injury labels/duration are locked; do not change them casually under a release task. Preserve FRESH/PRICED IN distinctions, uncertain statuses, exact team/player identity, and current roster context.

MLB now uses `mlb-judgment-v2`: same-session research and initial judgment with visible odds; durable original expectation; up to two targeted factual questions; scenario stress test; endorse/decline the unchanged priced ticket; exact publication receipt. `mlb-conviction-v4` uses Sol for factual eligibility and Gary's comparative selection of endorsed originals in pregame capacity windows. Public ticket snapshots and original evidence stay immutable. The -179 ML cap and original run-line menus remain. Postgame expectation memory separates pregame support from what actually happened; it uses a private leased retry queue and cannot rewrite original claims. Read `HANDOFF_2026-09-08_MLB_STAGED_JUDGMENT.md` before changing that lane.

New-policy natural publication, selection, completed postgame memory and actual performance are separate observations. Tests do not prove a win-rate lift. The separate notebook/formula experiments remain experiments, not public Winners policy.

## 11. NFL and Winners work not to lose

NFL preflight is completed and **test-only**: `test_daily_picks` row **75**, date **2026-09-09**, arm `nfl-opening-night-preflight-20260908-r6`. Ticket: **Seattle -3.5 (-104), FanDuel**. Exact 403-word rationale and both cases: `/Users/adam.preda/Documents/ChatGPT/Gary/NFL_OPENING_NIGHT_TEST_2026-09-08.md`. It must not be promoted into the public slate by a handoff or review.

The preflight repaired bad provider 2026 totals that actually matched 2025, labeled prior-season baselines, preserved current roster/injuries, fixed duplicated roster roles, real freshness/caching, bilateral correction delivery, completed-response/process cleanup and book/form rendering. Read `HANDOFF_2026-09-08_NFL_PREFLIGHT.md`. Its insufficient-credit diagnostic identified an **unfunded Anthropic fallback**, not a malformed request. Confirm account funding/access with Adam, then make a bounded verification before relying on that fallback. Do not silently change the model policy or purchase credits.

Requested small-slate Winners rules are **not implemented**. Read `HANDOFF_2026-09-08_WINNERS_SMALL_SLATES.md`: automatic single-game NFL/MLB admission; conditional NCAAF admission for ranked/“Big 5” team; one Winner on a two-game day unless both independently qualify. Two-game sport scope and the intended conferences still need clarification. Count the complete Eastern-day league schedule, not picks generated so far; verify complete-fetch evidence. Preserve original review outcomes and record policy exceptions separately. Do not fabricate a passing review or backfill historical Winners.

## 12. Runtime and host state at takeover

Read-only production check in this task found canonical scheduler PID **96216**, Winners worker PID **759**, intended Astra/Sol models, game era **81cdc873daf6**, props era **dd289e7071a6**, and **10 of 15 MLB games published, zero started games missing a pick, five pending**. These are time-bound observations, not a guarantee for the next slate. All **21 edge deployment timestamp comparisons passed**. The check exited **1 for the shared dirty tree**; it was not a clean global parity pass. A timestamp comparison is not byte-for-byte deployed-source verification.

Disk check found about **3.9 GiB free internally** and **78 GiB on KINGSTON**. Recheck before heavy compilation. Keep generated archives/DerivedData on the established external location where appropriate; retain evidence and active artifacts. Prior external-volume PostgreSQL tests failed due to ExFAT AppleDouble sidecars; run temporary databases on internal storage or follow the established isolated test workaround. Do not delete arbitrary user data or ongoing builds to free space.

Supabase was moved from undersized legacy Nano to Micro September 6 after measured swapping/I/O stalls; see `HANDOFF_2026-09-06_DATABASE_CAPACITY.md`. That is a recorded configuration change, not a fresh capacity audit here. Mac runtime is pinned to Node 22.23.2 in the infrastructure handoffs. Watchdog recovery was repaired to avoid restart loops; preserve it. Verify actual executable/process cwd rather than assuming a plist or Git commit is active. Restart long-lived workers only when needed for changed loaded code and safe for in-flight work; fresh per-game children read source on launch.

No backend code was altered or restarted by this takeover task. Pending backend edits already existed in the live checkout when the task began; a future collector may read them despite their WIP Git status. That is an explicit runtime caveat, not an isolated draft claim. Finish and verify them promptly. Do not run a broad collector/publication command merely to prove the app works.

## 13. Website, monetization, launch and growth context

Read the current `GaryMarketing/launch-2026-09/LAUNCH_RUNBOOK.md`, `EXECUTION_REVIEW_2026-09-08.md`, `LAUNCH_COMPLETION_TRACKER.md`, and `PRODUCT_HUNT_PACKET.md`. Older `POSITIONING.md`, `LAUNCH_SEP13.md` and early build review packs contain superseded sports, availability and offer copy.

Current offer: Winners preview until **October 1, 2026 at midnight Eastern**; **accounts created before the cutoff** retain founding access with no currently implemented expiry. Do not change this to install date, “this season,” or an invented lifetime promise. Free reasoning, available props, Hub, record and private Book remain free. New-purchase pricing must agree with actual checkout; iOS external purchase link is restricted to the verified U.S. storefront path. Do not broaden that eligibility from U.S./Canada app availability.

The web app-first site/hero 04 is the current production direction, with native-style pick cards. Follow installed Next.js docs and `web/AGENTS.md`. The account/session ownership, deletion, profile safety, attribution and historical game-context work has earlier deployed acceptance receipts; preserve those contracts and verify the actual Vercel deployment after future changes. Do not equate an auto-skipped docs/native-only deployment with missing web source.

Product Hunt was recorded **Scheduled for September 13 at 12:01 a.m. Pacific / 3:01 a.m. Eastern**; scheduled is not published, approved or featured. September 9 kickoff and September 13 first-Sunday promotion depend on actual picks and available features. Do not advertise an unapproved native build as public. Prepared Apple expedite/email drafts are in the local submission evidence directory; only use them after actual App Review submission, update real IDs/builds, and verify one send/confirmation. The hold applies now.

Existing X game publishing remains game-paced; do not send QA tweets or increase cadence. Source excerpts should name their subjects and remain grounded in stored reasoning. Durable publication and natural sends need actual receipts. Earlier X account-credit failures were separate from Anthropic fallback credit failures; check the correct account rather than conflating them.

Eight finished vertical video masters (three real-app ads and five NFL options), cutdowns and stills already exist in the evidence workspace under `launch-delivery/video-campaign/`. Their completion does not mean campaign publication or platform eligibility. Some footage is build 907 and may need refresh for the final UI. Instagram age/link/handle controls, TikTok/YouTube eligibility and Reddit account completion have separate outstanding steps. Verify actual account state before claiming completion.

Growth evidence remains small. The earlier completed-week report had eight consented sessions, one useful read and three observed browsers; it is not mature retention or proof of lift. Public Book rows are not active users or voluntary-return evidence. Personal tracking still needs real usability observations and consenting pilot users. Sportsbook affiliate distribution and user-authorized bet-history import are different businesses; there is no established partnership, import permission or authorized new outreach to claim. Do not send DMs, vendor email or pilot invitations without the corresponding explicit authority.

## 14. Verification and eventual release sequence

1. Read this brief and exact Git receipt; reconcile main, WIP branch, local modifications and active tasks. Preserve configuration and evidence. Re-read live Apple state and build-number availability.
2. Reproduce/resolve Apple-provider completion; establish data-use basis or finish scoped permitted-source replacements; get real support ownership/inbox coverage. Continue independently solvable tasks while waiting on facts.
3. Finish 920 native component integration and pending measured-research fixes. Complete same-date first-inning chronology, PA/AB source/copy consistency and any necessary bounded current-row repair. Confirm final user-facing design in the running app.
4. Run focused regressions, then the relevant full checks. Root commands: `npm run verify`, `npm run smoke:web`. PostgreSQL cases need `pg_config` or `GARY_TEST_PG_BIN`. Use fixture preview for web QA without production credentials; tests do not replace physical auth or real native navigation.
5. Commit/push completed source on main. Apply migrations and deploy each changed edge function using the established project; verify live behavior and exact data identity. Run `node scripts/production-truth.js` from the backend and explain every remaining flag. Verify web deployment if web changed.
6. Freeze a specific reviewed public native source, increment an unused build number, compile optimized Simulator and signed device archive, inspect source parity/signature/entitlements/privacy manifests, and run physical acceptance. Preserve private config through the established build method.
7. Upload once, keep Xcode upload receipt, wait for actual Apple processing, confirm the existing Beta group receives the build and save accurate What to Test. Do not claim upload equals internal distribution or App Review submission.
8. Update matching final screenshots, What's New, review notes, working reviewer access, contact and truthful privacy/content-rights fields. Preserve existing approved business/release settings unless a real change requires it. Reload and verify exact saved build/materials.
9. With Adam's stated prerequisites resolved, submit once; record App Review ID/status. If the prior expedition/email authorization still applies, use the prepared reviewable drafts updated with actual submission facts, then verify their receipts. Do not imply review approval or public availability until observed.
10. Update this handoff/release receipt with actual completed work, remaining limitations and links. Inspect existing launch follow-up automations before adding duplicates; there is no new submission automation created here.

## 15. Reading map and evidence boundaries

Read first: this file; `AGENTS.md`; `gary2.0/CLAUDE.md`; `docs/launch/APP_STORE_SUBMISSION_2026-09-08.md`; `HANDOFF_2026-09-08_HUB_RESEARCH_919.md`; `HANDOFF_2026-09-08_SOURCE_POLICY_918.md`; `docs/launch/PROFILE_MODERATION.md`; `docs/launch/PROVIDER_RIGHTS_2026-09-08.md`.

Then by lane: `HANDOFF_2026-09-08_MLB_STAGED_JUDGMENT.md`; `HANDOFF_2026-09-08_NFL_PREFLIGHT.md`; `HANDOFF_2026-09-08_WINNERS_SMALL_SLATES.md`; `HANDOFF_2026-09-08_ACCOUNT_GUARD_915.md`; `HANDOFF_2026-09-08_HEADLINE_SCORES.md`; `HANDOFF_2026-09-08_RESPONSIVENESS.md`; `HANDOFF_2026-09-07_MAC_REPAIR.md`; `HANDOFF_2026-09-07_MAC_SECOND_PASS.md`; `HANDOFF_2026-09-06_DATABASE_CAPACITY.md`; current launch runbook and execution tracker.

Local evidence root: `/Users/adam.preda/Documents/ChatGPT/Gary/`. Existing Claude auto-memory is documented at `/Users/adam.preda/.claude/projects/-Users-adam-preda/memory/`; it was not read or modified during this takeover and may contain stale preferences. Current explicit user direction and current source/receipts take precedence.

Relevant prior Codex tasks, if available for read-only history: **Discuss Hub redesign and product** (`01a08141-a99a-7ba3-9bac-546b214007e3`), **Update profile icon** (`01a0818d-6d01-7070-a14a-1e611f65da22`, which expanded into research/Apple release work), **Review Gary launch marketing** (`01a06e37-dd2d-7f71-bb44-522e748e693e`), and this task **Ship Gary and write handoff** (`01a082f3-2b56-71a2-a964-98d6001faacd`). Previous task ownership notes are historical coordination, not a reason to stall now that Adam has requested Claude takeover. Check for active work before competing for shared files or release tools.

The task did not newly verify all earlier business, provider, release and test claims. Dated receipts are identified as such. It did newly inspect canonical Git/code state, run the six focused suites and production check, identify missing 920 Swift definitions, preserve unfinished code, and record Adam's explicit submission hold. Never collapse “implemented,” “tests passed,” “deployed,” “uploaded,” “processed,” “submitted,” and “approved” into “done.”
