# Gary 2.25 (918): source policy and release candidate

September 8, 2026. The user's submission authorization is active. **Build 918 uploaded successfully at 20:04:04.076 UTC; Apple processing is pending. Do not upload it again.** App Review submission, expedition and the urgency email remain unsent for this candidate. The profile-icon task retains sole ownership of those Apple writes.

The user reaffirmed that xERA must never be used and that BDL is not the only acceptable provider. Accurate, useful non-xERA measurements remain; third-party use still needs an applicable permission basis. The frozen 918 native source is `994b948a`, retaining the original observational Hub restored in 917. The superseded 916 must not be uploaded. Existing 915 and 917 artifacts remain intact.

## Included changes

- `5e10d02b`: actionable private profile-report moderation CLI and runbook.
- `7f451116`: deployed exact BDL MLB field lineups and probable-pitcher identity.
- `b0eab098`, `83164a9c`: deployed service-only MLB batting writer, public exact-game cache, migration/cron, and native stale/missing-observation handling; exact BDL NFL practice reports.
- `076eb0bc`, `994b948a`: remove xERA transport fields, pitcher regression cards, orphan Fantasy writers, current analysis/publication and native labels; reject older excluded analysis without changing immutable picks or historical records.
- Live cleanup retained originals and retired ten specifically reviewed current ungraded pitcher-regression cards. Today's independent Fantasy runner published eight clean decisions; all eight mirror rows match their parent decisions. The five valid original research rows with only inactive judgment references remain.

## Verification

The broader focused scope passes 512 tests across 45 suites, including actual Swift cache/provenance checks. One PostgreSQL suite initially failed on external-volume AppleDouble files; its 35 cases then passed on the internal drive. Independent source, cache, provider, publication, artifact and two-image reviews found no blocking defect in their bounded scopes. This is not proof of all manual/VoiceOver/physical behavior.

- Frozen public snapshot: `/Users/adam.preda/Documents/ChatGPT/Gary/app-store-submission-2026-09-08/native-918-public-snapshot-r2/manifest.json` (162 tracked public iOS files; all match disk and source commit).
- Simulator: `/Volumes/KINGSTON/gary-source-migration-918-dd/Build/Products/Release-iphonesimulator/GaryApp.app`; SHA-256 `2f387c3e146f16cc58d558b79be1680a00816eb4061ded53d67bcd8a8feb78a1`.
- Signed archive: `/Volumes/KINGSTON/Gary-2.25-918-Source-Policy.xcarchive`; executable SHA-256 `99d33f1fc0384190d822730f9bfd554a3fcb892a7101a9a581c0f0b2d4d349e1`.
- Local distribution export: `/Volumes/KINGSTON/gary-918-local-export/GaryApp.ipa`; executable SHA-256 `011f0f75a4dc7280500f81cf31851121e98fb706dbe8cdf87b29df9e42667b67`.
- Archive and distribution signatures pass strict/deep verification. The actual distribution code/profile agree: correct team/app, Apple sign-in `Default`, production push, `get-task-allow=false`; profile expires December 6. All 21 privacy manifests match 915 byte-for-byte.
- Upload log: `/Volumes/KINGSTON/gary-918-upload.log`. Local export used `destination=export`; the separate successful upload used `destination=upload`.
- The final production-truth read verifies canonical processes, all 21 edge deployment timestamps, no unpushed commits and only the known private Google configuration difference. Its exit 1 is that preserved exception, not a clean global parity result.

Protected canonical configuration was never opened, edited, staged or hashed. Frozen archive compilation used only the established compiler-only symlinks. Do not inspect or commit those private targets.

## Remaining factual and submission work

1. Actual successful Sign in with Apple on the signed phone build. The unsigned simulator surfaced an authorization-start error; that neither proves release failure nor establishes success. Phone mirroring could not connect.
2. A documented use basis for the remaining direct MLB StatsAPI/Baseball Savant reads. Commercial BDL/Odds API grants are verified; the removed direct NFL feed is no longer a dependency. Bounded Gmail, Drive and Dropbox searches did not find the remaining authorization, which does not prove none exists. Accuracy is separate from the rights declaration.
3. Confirmed support/report operator and inbox access/coverage. The queue and moderation tooling are implemented; a human commitment cannot be inferred from that.

The saved App Store draft is still 2.25/915, Prepare for Submission, with disabled Save. New 918 review notes (3,921 bytes) and What's New are local drafts. After final candidate acceptance, use matching screenshots/materials, correct the rights declaration truthfully, select the verified build and submit once. Verify the review submission ID/status before sending the prepared expedited request and authorized Apple urgency email. The documented Product Hunt launch is September 13 at 12:01 a.m. Pacific.

Full receipts, drafts and checkpoints: `docs/launch/APP_STORE_SUBMISSION_2026-09-08.md` and `/Users/adam.preda/Documents/ChatGPT/Gary/app-store-submission-2026-09-08/`.
