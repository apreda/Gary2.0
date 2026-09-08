# Gary 2.25 (915) release — September 8, 2026

Build 915 uploaded successfully on September 8 at **16:33:34.556 UTC**. Apple processing is **Complete** and the internal Beta group shows **Testing**. Seven App Store screenshots from the exact installed simulator build passed independent visual and format review and were delivered to the designated submission owner. **Do not upload 915 again.**

The release is built from the approved committed public-source snapshot `41793ededc47a1934a3c2ef09fb2a5608822bed1`. Current main can advance independently to the separate build-916 Hub candidate; it is not the parity basis for 915. This release task did not submit App Review. The “Update profile icon” task now owns final App Store submission, expedited-review request and email under Adam’s separate instruction; the launch root owns independent review.

## Included changes

- `4e985ac8`: binds account deletion confirmation to the original owner and sign-in generation, validates before dispatch and response completion, adopts candidate identity/token atomically, and invalidates pending email sign-in when the sheet closes. Five focused tests exercise optimized shipping Swift state, transport and Settings completion without skips; the original dispatch fails the negative control. Root's independent source review passed.
- `acd2ca43` and `6cddd21f`: remove the overall-picks recap from Winners while retaining overall results in Billfold → Gary, and give Winners content its natural height instead of stretching its footer with viewport minimum height and flexible spacers. The date/access flow and bottom scroll allowance are preserved. Four existing suites/eight tests pass. Root independently reviewed the source and actual September 4 populated screen; the layout owner also checked the empty screen and Billfold results.
- `5d5e78ba`: refines the shared profile avatar with an outlined person and a subtle warm-neutral rounded square. Initials, selected symbols, account actions, labels and 44-point header hit target remain unchanged. The owner reports iOS SDK typechecking, component renders at 28pt/56pt and five tests across three existing suites passing. Root and release source reviews passed.
- `110623f9`: removes the Billfold GARY / YOU / BOARD underline, retains gold/bolder selected text and adds the selected accessibility trait. Actions and persistence remain unchanged. The owner reports iOS SDK typechecking, all three selected-state component renders and nine tests across two existing Billfold suites passing; root and release source reviews passed.
- `41793ede`: gives historical game scouting and player context an explicit selected date and exact game identity, scopes board/player/wire caches by date, ignores stale completions and limits current connections to today. Four native files changed: ScoutTrio, PicksTab, FootballGameIntelView and MLBGameIntelView. The optimized loader fixture passed both cases; independent checks passed 7/7, the affected baseline passed 60 tests, and Swift parsing and root source/hash review passed.
- `bea6b254`: keeps version 2.25 and increments the unused build number to 915.

The release retains the brighter Fantasy surfaces and shared Hub branding verified in [the build 914 handoff](HANDOFF_2026-09-08_HUB_BRAND_ALIGNMENT.md), including its live SEO verification. The private Google configuration and SecretsLocal file are excluded from this task's reads and commits.

## Final artifact evidence

Evidence root: `/Users/adam.preda/Documents/ChatGPT/Gary/account-guard-915-2026-09-08/`.

- Source: `build-input-snapshots/915-41793ede/`. All **129 committed public inputs** (122 native and seven test files) and their inventory match before and after the optimized simulator and signed archive builds. `frozen-build-inputs.json`, `final-native-source-sha256.json` and `root-frozen-input-independent-review.json` record the exact inputs. The protected configuration files were excluded from export and linked to their existing canonical paths; their bytes were not opened, copied or hashed by this task.
- Optimized simulator: `/Volumes/KINGSTON/gary-release-dd/Build/Products/Release-iphonesimulator/GaryApp.app`, executable SHA-256 `f3217e7d01382e660fdffe46ef5d5733592be3803e4d9dfebd86388d6d04f0dd`. Installed executable, Info.plist and CodeResources hashes matched the product on Gary Winners Layout QA. Receipts: `final-simulator-fingerprint.json` and `installed-final-simulator-fingerprint.json`.
- Signed archive: `/Volumes/KINGSTON/Gary-2.25-915-Account-Guard-FINAL.xcarchive`, executable SHA-256 `b6a553295ed11d0e923ecda3e8ca6959752ded3095e0c2b0bc4dd789782368ae`. Version 2.25/build 915, strict/deep signature verification passed, and all **21 privacy manifests** are byte-identical to signed 914. Receipts: `final-archive-verification.json` and `root-final-archive-independent-review.json`.
- Both build logs end in success: `/Volumes/KINGSTON/gary-915-frozen-final-simulator.log` and `/Volumes/KINGSTON/gary-915-frozen-final-archive.log`. `/Volumes/KINGSTON/gary-915-upload.log` records Upload succeeded and EXPORT SUCCEEDED; the export command exited 0.
- Apple build UUID: `85fccc30-ce8c-4ac6-9c57-d5fdaaa6a021`. `apple-processing-verification.json`, `apple-915-builds-dom.txt` and `apple-915-internal-beta-dom.txt` record Complete and internal Testing. This read-only check changed no review selection or metadata.

Earlier pre-Winners, pre-spacing and pre-profile archives remain explicitly named DO-NOT-UPLOAD. Earlier simulator and verification receipts are labeled historical in `release-status.json`; none is the final candidate. Simulator and device executables have distinct, separately verified fingerprints.

## Installed acceptance

Final installed 915 shows September 7 NYM at MIA (game 5059929), Mets ML +108 and final 9–4 with the correct **Tong/Pérez** scouting. The original pre-fix mismatch with today’s Manaea/Alcantara was repaired in 41793ede. The historical Jakob Marsee popup uses September 6 as its last game and the dated Tong context. Returning to September 8 selects game 5059941, current Manaea/Alcantara scouting and a distinct Marsee pack whose last game is September 7. Root independently matched 11/11 data checks. `root-historical-installed-ui-review.json` and `final-ui/` retain the screenshots, accessibility evidence and explicit distinction between visible and offscreen text.

The Winners sign-in/create-account CTA opens the expected Auth sheet and closes back to the guest view without beginning authentication. The shared profile icon and all GARY/YOU/BOARD states were checked on the fingerprinted 110623f9 simulator; those source files are unchanged in final 41793ede. Root independently reviewed the relevant views. The final seven screenshots also show the profile and selector refinements.

Root previously completed controlled native account deletion on fingerprinted pre-spacing 915: email sign-in, saved $10 unit, analytics off, Settings deletion, Account Deleted confirmation and the signed-out/unset-unit state passed. Both disposable QA identities have zero rows across all 30 checked relations; the dedicated reviewer identity remains retained. The receipt is `launch-readiness/continuation-2026-09-08/qa-after-both-deletions-verification.json`. AuthManager, AuthView and Settings hashes are unchanged in the final snapshot. Root also installed the exact final 915 on the physical device in place and independently read back version/build; that install receipt does not establish physical UI or provider acceptance.

**Manual scrolling remains unestablished.** Two requested drags on the empty Winners panel showed no observed movement; the same gesture on a long Home positive control also showed no movement. This is bounded tool uncertainty, not a gesture pass or a confirmed app defect. The source review and populated/empty visual checks remain separately valid. No speculative native edit was made.

## Approved App Store screenshots

Use `screenshots/apple/` in the fixed order: **01 Home, 02 Gary’s expanded take, 03 historical game/scouting, 04 Hub, 05 Fantasy, 06 Winners, 07 Gary Billfold**. `screenshots/README.md` explains each real content/date context; `screenshots/manifest.json` records the original export paths, capture times and every raw/delivery hash. `root-final-screenshot-review.json` closes the independent seven-image review.

All images were captured using Simulator’s native Save Screen UI at **1320 × 2868**. Untouched originals are in `screenshots/raw-native/`, with byte-for-byte parity to the native Desktop exports. Each alpha value was 255; lossless RGB delivery copies preserve every visible pixel and the ICC profile. `screenshots/apple/format-verification.json` passes all seven. No resizing, cropping, compositing, fabricated content, status-bar alteration or private identity was introduced. The dated Winners loss and Billfold’s hypothetical $100/bet disclosure are preserved. This size fits Apple’s 6.9-inch portrait slot: [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).

AX activation of the Take expansion control shifted the carousel horizontally. That export is retained in `screenshots/rejected-captures/` and excluded from delivery. Resetting the card and using ordinary coordinate taps on the visible card and chevron produced the correctly aligned expanded Take. `final-ui/take-coordinate-expanded.jpeg` and its accessibility text document that distinction.

After all seven captures and Apple verification, the Simulator/GUI hold was released to the 916 owner, subject to coordination with the submission owner’s screenshot file picker. No 916 upload or App Store selection was authorized by this release handoff.

## Production verification scope

The final read-only production check is recorded in `/Volumes/KINGSTON/gary-915-final-production-truth.log`, at current main `2375c89e`. Scheduler PID 96216 and Winners PID 72466 run from the canonical checkout; all 20 edge deployment timestamp checks pass. The September 8 MLB slate has 15 future games and zero started games without a pick. The command exits 1 for nine shared uncommitted paths and one concurrent unpushed commit, including release/launch documentation and the preserved private configuration. Those are explicit current-main exceptions, not a clean global parity pass. Native 915 parity is established against its frozen snapshot; this readback does not claim behavioral coverage of the independently evolving backend or build-916 Hub candidate.

## Ownership and remaining acceptance

The release and screenshot work is complete. The designated submission owner handles App Store screenshots, 915 selection, final readiness, submission, expedited review and email. Root continues independent oversight. This handoff does not attest content rights, moderation commitments, manual gestures, VoiceOver or physical/provider acceptance, and does not claim App Review approval. The original SEO correction remains live and checked; Google’s full validation is still pending as recorded in the build-914 handoff.
