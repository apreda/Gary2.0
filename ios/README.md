# Native app maintenance

`GaryApp/project.yml` owns the Xcode project. After adding or moving sources,
run `xcodegen generate --spec ios/GaryApp/project.yml` from the repository root,
then `node scripts/check-native-project.mjs` on macOS. Commit both the spec and
the generated project. Add a new source directory as an explicit source entry
and exclude it from the root `.` entry so XcodeGen creates one group per folder.

## Ownership

| Area | Owner |
| --- | --- |
| Navigation and shared data | `ContentView.swift`, `SharedStores.swift`, `SupabaseAPI.swift` |
| Decoding, game identity and stored tickets | `Models/` by domain |
| Locked injury types | Original `Models.swift`; handling remains unchanged |
| Home request lifecycle and section coordination | `HomeView.swift` |
| Home board, accounting, recap and card rendering | `Home/` |
| Picks navigation, focus and selection state | `PicksTab.swift` |
| Picks matching, grading, caches and sections | `Picks/` |
| Hub request lifecycle and selection state | `HubView.swift` |
| Hub sections and sheets | `Hub/` |
| Personal book coordination | `UserBookView.swift` |
| Book API, logging, rows, profile and leaderboard | `Book/` |

Keep network ownership, cancellation and stale-response guards in the feature
coordinator. Extract presentation components with explicit inputs and callbacks;
do not expose all private view state merely to distribute it across extensions.
Home and Picks still have substantial coordination code; further state-store
extraction must preserve the existing asynchronous ownership regression cases.
Fixture/team catalogs and frozen decision code are not file-size targets.

## Configuration

For a compile-only checkout, copy `GaryApp/SecretsLocal.swift.example` to
`GaryApp/SecretsLocal.swift`. The real ignored file contains local credentials;
never overwrite it during setup. CI uses dummy values and never launches a
production session. `.example` files are excluded from the app bundle.

The committed `GoogleService-Info.plist` is redacted. The canonical Mac has a
private local replacement, intentionally left uncommitted under root `AGENTS.md`.
Preserve that file; do not stage it with a native change. A production archive
requires the real Firebase configuration and signing account. Simulator CI
needs neither signing nor a production Firebase configuration.

Xcode Cloud's `ci_scripts/ci_post_clone.sh` separately creates its ignored local
configuration from the configured secret environment. It is not part of the
application bundle. Do not substitute CI dummy values into a release archive.

## Verification

Root `npm run verify` includes the existing native behavior harnesses. Prefer
`gary2.0/tests/helpers/swiftFixture.js` for new domain tests: it compiles complete
shipping Swift files with fixture inputs. The combined-source readers exist
only for older tests awaiting migration; they are not production modules.

The Verify workflow checks native source membership and compiles the whole app
for iOS Simulator, in addition to the Apple framework cases. On a local Mac:

```sh
node scripts/check-native-project.mjs
xcodebuild -project ios/GaryApp/GaryApp.xcodeproj -scheme GaryApp \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

A source commit or Simulator build is not release delivery. Native changes
still require a signed archive, upload, and Apple's TestFlight confirmation.
