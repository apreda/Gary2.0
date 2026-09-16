> **September 16 release update:** 2.25 is now approved and publicly released from the September 8 build-920 submission. 930 delivery remains unconfirmed. Use [the current release continuation](HANDOFF_2026-09-16_CLAUDE_FABLE_5_1.md#apple-continuation-an-update-after-release); do not assume retrying the 2.25 archive can replace the released build or satisfy the next App Store update. Verification below remains the dated 930 baseline.

# September 13 — latest native build 930

Adam explicitly requested the most updated native app in TestFlight. Source `9e76551d` commits the previously unfinished performance work as 2.25 (930), including cached pick formatting and game identity, lazy strip construction, deferred Billfold foreground refresh, Home countdown activity gating and the single-line recap date. The private GoogleService plist is the only remaining working-tree exception; it was preserved and excluded from staging. The release build's existing configuration gate passed without printing values.

## Verified and ready

- All 64 local focused cases passed across six suites for formatting, historical context, football wiring, Home lifecycle/rendering and Picks responsiveness.
- Full GitHub Verify succeeded on the exact source commit: https://github.com/apreda/Gary2.0/actions/runs/34776573234. Backend: 375 files / 4,119 tests passed, with 12 platform/optional skips. Apple and web jobs passed too; required Apple coverage owns the moved Hub networking tests. Edge-helper job passed.
- Xcode 26.6 Release archive succeeded from the canonical production checkout at `/Volumes/KINGSTON/Gary-2.25-930-Performance.xcarchive`. Identity is `ai.betwithgary.app`, 2.25 (930), minimum iOS 16.0. Independent `codesign --verify --deep --strict` passed.
- Production truth confirms the canonical scheduler, current models/eras, deployed edge timestamps and no unpushed source. Overall status remains flagged for the one private plist exception. This does not establish physical-device acceptance.

## Upload blocker — do not claim TestFlight delivery

At September 13, 19:09:22 UTC, the actual upload returned **exit 70 / exportArchive Failed to Use Accounts**. App Store Connect was also signed out in both available Chrome and Codex browser sessions. **930 is NOT uploaded or confirmed in TestFlight.** The last confirmed available build remains 926. No App Review selection was changed and no existing submission was withdrawn.

Adam was asked to restore Xcode → Settings → Accounts and sign into App Store Connect. Once he confirms, inspect live Apple status, retry the prepared archive, and verify Apple processing plus access by his existing internal Beta group. Do not rebuild or increment merely to retry an authentication failure. Preserve the existing App Review state.

Retry command (authorized by Adam's current TestFlight request):

```sh
xcodebuild -exportArchive \
  -archivePath /Volumes/KINGSTON/Gary-2.25-930-Performance.xcarchive \
  -exportOptionsPlist /Volumes/KINGSTON/gary-924-upload-options.plist \
  -exportPath /Volumes/KINGSTON/gary-930-upload \
  -allowProvisioningUpdates
```

The existing options specify `destination=upload`, `method=app-store-connect`, automatic signing, team SFBTX6KPLM and `manageAppVersionAndBuildNumber=false`. Successful archive creation is not upload, and upload is not processing or tester access. Receipts are in `docs/launch/evidence/testflight-930-2026-09-13/`. Full local logs: `/tmp/gary-930-archive.log`, `/tmp/gary-930-release-tests.log`, `/tmp/gary-930-upload.log`.
