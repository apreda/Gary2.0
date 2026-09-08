# Gary 2.25 (915) release — September 8, 2026

Build 915 remains unuploaded while the final combined simulator build, signed archive and actual App Store screenshot candidates are prepared. The launch root approved the combined public-source freeze at `110623f9`: the account ownership guard, corrected Winners spacing and shared profile icon refinement and Billfold selector polish. The separate judgment-first Hub candidate is outside this release.

## Included changes

- `4e985ac8`: binds account deletion confirmation to the original owner and sign-in generation, validates before dispatch and response completion, adopts candidate identity/token atomically, and invalidates pending email sign-in when the sheet closes. Five focused tests exercise optimized shipping Swift state, transport and Settings completion without skips; the original dispatch fails the negative control. Root's independent source review passed.
- `acd2ca43` and `6cddd21f`: remove the overall-picks recap from Winners while retaining overall results in Billfold → Gary, and give Winners content its natural height instead of stretching its footer with viewport minimum height and flexible spacers. The date/access flow and bottom scroll allowance are preserved. Four existing suites/eight tests pass. Root independently reviewed the source and actual September 4 populated screen; the layout owner also checked the empty screen and Billfold results.
- `5d5e78ba`: refines the shared profile avatar with an outlined person and a subtle warm-neutral rounded square. Initials, selected symbols, account actions, labels and 44-point header hit target remain unchanged. The owner reports iOS SDK typechecking, component renders at 28pt/56pt and five tests across three existing suites passing. Root and release source reviews passed.
- `110623f9`: removes the Billfold GARY / YOU / BOARD underline, retains gold/bolder selected text and adds the selected accessibility trait. Actions and persistence remain unchanged. The owner reports iOS SDK typechecking, all three selected-state component renders and nine tests across two existing Billfold suites passing; root and release source reviews passed.
- `bea6b254`: keeps version 2.25 and increments the unused build number to 915.

The release retains the brighter Fantasy surfaces and shared Hub branding verified in [the build 914 handoff](HANDOFF_2026-09-08_HUB_BRAND_ALIGNMENT.md), including its live SEO verification. The private Google configuration and SecretsLocal file are excluded from this task's reads and commits.

## Evidence and current release gates

Evidence is in `/Users/adam.preda/Documents/ChatGPT/Gary/account-guard-915-2026-09-08/`. `final-native-source-sha256.json` records the 64 public native/project/test hashes and native inventory for the approved combined freeze. The combined optimized simulator build passed with all 64 source hashes matching on September 8 at 15:32 UTC. Its executable SHA-256 is `3f9ea575de6c65f539dddaa2132e71dbe849ba42db86a61cd6a0cf659c201e58`. Signed archive creation is held for the historical Picks date-routing finding described below. Final artifact checks and the upload receipt will be added after completion; filenames prefixed `pre-` are historical evidence.

Final simulator product: `/Volumes/KINGSTON/gary-release-dd/Build/Products/Release-iphonesimulator/GaryApp.app`. Intended final archive: `/Volumes/KINGSTON/Gary-2.25-915-Account-Guard-FINAL.xcarchive`. Current build logs are `/Volumes/KINGSTON/gary-915-selector-final-simulator.log` and `/Volumes/KINGSTON/gary-915-selector-final-archive.log`; intended upload log is `/Volumes/KINGSTON/gary-915-upload.log`.

Earlier archives are preserved under `/Volumes/KINGSTON/` as `Gary-2.25-915-PRE-WINNERS-CHANGE-DO-NOT-UPLOAD.xcarchive`, `Gary-2.25-915-PRE-SPACING-FIX-DO-NOT-UPLOAD.xcarchive` and `Gary-2.25-915-PRE-PROFILE-ICON-DO-NOT-UPLOAD.xcarchive`. The pre-profile archive passed strict/deep signature verification and all 21 privacy manifests match signed 914; its public source check correctly identifies ProfileExperience.swift as the subsequent difference. These checks do not establish final-profile artifact parity.

Root completed native controlled account deletion on fingerprinted pre-spacing 915 (`fa427746…`): email sign-in, saved $10 unit, analytics off, actual Settings deletion, Account Deleted confirmation and the signed-out/unset-unit state were checked. Both QA identities have zero rows across all 30 checked relations, while the dedicated reviewer identity remains retained. Root's receipt is `/Users/adam.preda/Documents/ChatGPT/Gary/launch-readiness/continuation-2026-09-08/qa-after-both-deletions-verification.json`. The later spacing/icon changes leave AuthManager, AuthView and Settings source unchanged.

The corrected pre-profile simulator (`cf5cc8ae…`) was installed on Gary Winners Layout QA, device `724DBB90-8691-4260-965F-FCC128993722`. The layout owner's exact source, build and installed-binary receipts are under `/Users/adam.preda/Documents/ChatGPT/Gary/winners-layout-2026-09-08/`. Its empty and actual populated visual checks passed. **Automated wheel/drag/Page Down did not move the empty board, so manual bottom-scroll acceptance remains pending.** This limitation is not a gesture pass. Root returned Simulator ownership to this release task and authorized final installation/navigation/screenshots without holding the entire capture set for that check.

## Screenshot candidates

Capture the final installed build through Simulator's native Save Screen UI. Keep actual public content, visible dates, sport and results; include no QA identity or private account data. Candidate views are Home, Picks, an opened game and reasoning, Hub, Fantasy when complete, Winners and Gary Billfold. The launch root owns candidate review, App Store screenshot upload, build selection and submission.

The iPhone 17 Pro Max native 1320 × 2868 portrait output fits Apple's 6.9-inch screenshot slot. Verify actual dimensions, opaque PNG/JPEG format and visible content. Preserve raw images without resizing, cropping or compositing. [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/). Candidates are pending in the evidence folder's `screenshots/` directory.

## Production verification scope

`/Volumes/KINGSTON/gary-915-profile-production-truth.log` is the latest read-only runtime check. All 20 edge deployment checks pass and no unpushed commits were reported. It exits 1 for 23 active shared working-tree changes, including other owners' backend work and preserved private configuration. This native receipt does not claim a clean global checkout or behavioral coverage of the separately deployed MLB policy and active Hub backend changes. Those owners and the launch root retain their validation responsibility.

## Capture-discovered correctness review

On the installed pre-profile simulator, Picks → Yesterday (September 7) → NYM @ MIA correctly shows the final 9–4 result and Mets ML +108. The flipped Gary’s Take discusses Tong/Pérez while THE ARMS panel below discusses Manaea/Alcantara. This view is withheld from screenshot candidates. Raw native PNG, window image and accessibility text are preserved in the evidence folder’s `capture-integrity/` directory. Root assigned an independent source/date-identity investigation and explicitly held signed archive creation pending classification; this release task made no date-routing implementation changes.

Native Save Screen exports full 1320 × 2868 RGBA PNGs. A preflight confirms every alpha value is 255. Untouched native originals will be preserved alongside lossless RGB PNG delivery copies, with dimensions and every RGB pixel verified identical; no crop, scaling or compositing is applied.
