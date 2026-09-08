# Gary launch readiness — September 8, 2026

**Historical-game source repair verified; final app verification underway:** `41793ede` binds scouting, player details and lineup popups to the selected date and exact game. It fixes the observed September 7 NYM/MIA page borrowing September 8 context. The original pick and dated board were correct; no production data repair was needed. Final serial checks pass 63 cases across seven suites, with independent review and replay. The release owner has frozen 129 public build/test inputs at that commit and is building the combined 915 artifact. Corrected installed UI, signed archive and upload remain pending. [Repair evidence](docs/launch/HISTORICAL_GAME_CONTEXT_2026-09-08.md).

**16:08 UTC: the goal remains active and launch signoff is not complete.** The authoritative current state, evidence and remaining gates are in [the continuation](docs/launch/CONTINUATION_2026-09-08.md). Prior build, fixture and production receipts remain in [the historical release ledger](docs/launch/READINESS_2026-09-07.md). Do not treat older pending/complete labels as current state.

## Delivered and verified

- Both authorized disposable accounts were deleted through actual product flows: QA A on deployed web, QA B in the fingerprinted native 915 app. All 30 checked account-data relations are empty for each; the dedicated Apple reviewer remains intact. Deleted web credentials are rejected and native local settings reset. This does not establish paid-subscription cancellation or Apple/Google provider acceptance.
- Web account repair `bc64568c` is included in READY production `a729d9c1`, with the Product Hunt badge and live nflverse credit. The integrated web checks pass **838 tests / 72 suites**, TypeScript and full ESLint. Canonical domain aliases and actual account deletion were verified.
- Native account guards `4e985ac8` passed independent review and five focused executable regressions. Winners spacing correction `6cddd21f` passed review, eight existing checks and actual empty/populated visual review; Billfold retains its results controls. The manual empty-Winners bottom-scroll check remains pending after automated scroll inputs were no-ops.
- App Store Connect saves interim **2.25 / 914 / Prepare for Submission**, after withdrawal of 901. Reviewer credentials, reviewed copy and the supplied contact are saved/read back. Fourteen privacy types are published, including linked Customer Support/App Functionality, with no tracking. Availability is United States/Canada only.
- The separately authorized complete MLB judgment/memory implementation `1c96ce0e` and reporting follow-up `f2976edb` are deployed with migration `20260908155113`. Final owner readback confirms the canonical Winners worker at `mlb-conviction-v4`, era `4294d3b5a7d2`, 20 edge timestamps and zero started games missing picks. Stable backend scope passes 3,298 tests / 275 suites; additional contract, real PostgreSQL and edge receipts are separately recorded. Natural publications and expectation-memory outcomes remain prospective. [Policy and exact test evidence](HANDOFF_2026-09-08_MLB_STAGED_JUDGMENT.md).

## Active final release

The final **915** candidate includes the user-requested visual-only profile icon `5d5e78ba` alongside the account and Winners repairs. It passed a separate iOS SDK typecheck, native component rendering and five existing checks. The subsequently approved Billfold selector `110623f9` is also included: no underline, gold/bold selected text and selected accessibility semantics, with unchanged actions/persistence. It passed helper typechecking, three-state component rendering and nine existing checks. The completed archive before that change is withheld. The release owner is making the combined optimized simulator and signed archive, then capturing actual public screenshots. **No 915 upload has occurred.** Do not reuse already uploaded numbers 908–914.

[The release handoff](HANDOFF_2026-09-08_ACCOUNT_GUARD_915.md) owns exact artifact paths, source hashes, signature/privacy checks and upload/processing receipts. Root owns final screenshot review, App Store draft selection and matching [915 reviewer copy](GaryMarketing/APP_REVIEW_2_25_915.md). Preserve the AuthManager/AuthView/Settings hashes from actual native deletion acceptance in the final artifact. Source, simulator, physical installation, TestFlight, saved draft, review submission, approval and release establish different facts.

The earlier `6da0c97e` MLB implementation is a historical baseline, superseded for new decisions by the completed staged judgment/research/price/memory work above. The first scheduled decision window is 17:05 Eastern, before the first game at 18:35 Eastern; tests do not establish improved betting outcomes.

Independent review found two database validation gaps in the staged MLB work: original research-response equality for Winners admission and exact original-game identity for expectation-review storage. The owner is addressing those with direct PostgreSQL negative cases; no actual corrupted publication is established. This follow-up remains open until its deployed verification receipt passes.

The separate **Discuss Hub redesign and product** task is preparing candidate 916 for explicit feature approval. Its main native hold was released after the exact 41793ede public-input snapshot was verified. Build 915 is compiled from that frozen snapshot, with before/after hashes; later main changes are outside its artifact and acceptance evidence.

## Remaining completion gates

1. Finish the combined 915 artifact, screenshots, processing/internal Testing and saved review draft.
2. Complete actual physical/provider/recovery/push/billing/VoiceOver and long-reading acceptance, including the pending Winners scroll gesture. Developer services work and physical 913 installation passed; iOS denied the earlier launch because the phone was locked.
3. Obtain supported Auth configuration access and narrowly set OTP expiry to 1800 seconds plus leaked-password protection, with readback. Existing values remain unchanged; do not replace this with a broad configuration push.
4. Document MLB StatsAPI/NFL practice-grid rights and reconcile Apple's Content Rights answer. The bounded company-record search found no additional written permission, which is not proof none exists. Preserve explicit BDL/Odds grants and the live nflverse credit; verify current Tank01 terms before NBA relaunch. [Rights inventory](docs/launch/PROVIDER_RIGHTS_2026-09-08.md).
5. Confirm the responsible support/moderation owner, coverage and appeals handling. The supplied review contact alone is not staffing evidence.

## Marketing and future work

The separate [execution review](GaryMarketing/launch-2026-09/EXECUTION_REVIEW_2026-09-08.md) preserves channel authority, actual audience evidence and remaining prerequisites. Eight finished vertical masters include three real-app ads and five NFL options, plus cutdowns/stills. Product Hunt is scheduled for September 13 at 12:01 AM Pacific / 3:01 AM Eastern; scheduled is not live or approved. Its video is unlisted/playable with published English captions, while the last copyright check remains pending. New campaign eligibility, pilot users, mature retention windows, provider relationships, email delivery/address and Reddit handoff remain separate outcomes. Do not invent audience activity or send new invitations/vendor messages from this launch task.

## Working rules

Work on `/Users/adam.preda/Gary2.0`, `main`, and stage only explicitly owned paths. Preserve `ios/GaryApp/GoogleService-Info.plist` without reading, editing or staging it; do not read SecretsLocal.swift. Private QA credentials stay outside the repository, and the reviewer must not be deleted. Do not generate production picks, grade production data or notify customers as QA. No root model/prompt/injury-policy change is authorized; the separate MLB owner's explicit scope is recorded in its handoff.

Root's latest runtime check exits 1 for shared in-progress Hub/docs/private configuration despite passing worker/slate/edge checks and zero unpushed commits. Do not claim globally green production parity. Coordinate the single Simulator/compile owner and preserve all other tasks' changes. Continue existing work and the existing launch heartbeat; do not create duplicate goals, automations, uploads or unchanged broad test runs. The goal is active, not complete.
