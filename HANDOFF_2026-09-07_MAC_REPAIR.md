# Mac reliability and Home board repair — September 7

The production checkout is now `/Users/adam.preda/Gary2.0`. The previous
`/Users/adam.preda/Desktop/Gary2.0` is a compatibility symlink to those same
files. Keep working on main in this single checkout. The retired Documents
clone remains retired. Preserve the real local `ios/GaryApp/GoogleService-Info.plist`;
it is the intentional uncommitted configuration exception.

## Delivered

- Home's outer vertical scroll view is constrained to the phone width, uses
  UIKit directional locking and disables horizontal always-bounce. The fix
  targets sideways/diagonal page movement on the MLB game/status board. The
  vertical feed and nested horizontal rails retain their scrolling.
- Version 2.25 build **902** archived and uploaded successfully at 11:12 ET.
  Apple accepted it for processing. Build 901's existing App Store review
  submission was not changed. The fix reaches phones through the new build;
  uploading is not evidence that Apple has finished processing or review.
- MLB's subscription researcher uses three separate factor chats instead of
  one serial chat. All eight factors, the complete original desk, existing
  models/reasoning, cancellation budget and decision reserve remain. Shared
  pending stat reads avoid duplicate provider requests. The concurrency policy
  is included in the era fingerprint. NBA's pinned prompts and injury handling
  were untouched.
- The first live changed run, Angels at Red Sox (5059930), completed **8/8 in
  521.9 seconds**, with 31 stat and two grounding calls and a 40,309-character
  briefing. Astra subsequently stored its game pick. Earlier serial runs had
  exhausted the 1,200-second research budget. This is one observed successful
  run, not a guarantee that every provider call will meet its deadline.
- The existing watchdog now invokes a read-only disk and actual board/pick/card
  coverage check every ten minutes, logging changed incidents and recovery.
  It makes no model calls, sends no notifications and does not restart workers
  because a data lane is late. The prior uncommitted morning-health correction
  is integrated: complete but aging cards cannot revive a recovered overnight
  writer failure.
- The production audit now calls the installed native Supabase CLI directly,
  with a 60-second hard timeout. The npm-wrapper version stalled with inherited
  stdio still open; the direct CLI completed the 20 deployment timestamp checks.

## Mac startup recovery

Node **22.23.2** is installed from the official Darwin ARM64 distribution,
verified against its published SHA256. Its private installation is
`~/.local/share/gary/runtimes/node-v22.23.2-darwin-arm64/bin`. Launch definitions
pin the executable and child PATH; global Homebrew Node is unchanged.

The initial migration exposed an operating-system access problem. Newly
restarted launchd jobs blocked opening package metadata inside Desktop.
Restoring the old binary did not solve it. An independent `/usr/bin/wc` launchd
probe returned **Operation not permitted** on the project's package.json.
A harmless directory/shortcut fixture proved an unprotected home directory
resolved the denial. The real directory was then moved atomically on the same
volume, keeping the original files and leaving the Desktop symlink. No privacy
permissions were broadened, and no source/configuration files were deleted.

The scheduler finished its active game/prop work before the move. Restarted
Node 22 subsequently rebuilt its real schedule, synchronized exact MLB slate
identities and stamped era `b6b70fc3d097` from the new folder. Live-score polling
and the watchdog completed under launchd with exit zero. A forced launchd health
check also completed on Node 22 with only the internal-disk margin warning.
Winners temporarily ran under the current session during recovery. Its active
reviews finished before it returned to launchd at **11:34:21 ET**, on Node 22,
PID 89023. The temporary process was stopped first; the restoration receipt is
`winners-restored-to-launchd.json`. All nine installed plists match the repo.
The 11:30 results job and local score polling subsequently completed with exit
zero. The 11:29 forced launchd health read found no started MLB/NCAAF games
without saved picks. Postgres remained up since September 6 at 12:57:05 UTC;
the 11:32 read counted 2,029 successful cron runs today and no recorded failures.

The concurrent remote Supabase dependency update was merged. Installed packages
match 2.115.0; the `@supabase` directory was exchanged atomically, retaining the
prior packages temporarily for rollback. No dependency folder was absent during
the exchange.

## Cleanup and verification

The initial generated-build cleanup increased free external space by about
**62.7 GiB**. New simulator/release builds then used some of that room. It also
removed 1.8 GiB of temporary internal Swift package checkouts, followed by about
1.1 GiB of other compiler/package caches and part of npm's download cache.
The first external deletion resumed after an exFAT AppleDouble race, so the
per-path receipt is a lower bound; use measured volume free-space differences
for the initial external figure. Source projects, signed archives, simulator
saved data, exports and private configuration were preserved. The only IndyCar
payload deleted was a verified tar of disposable Syncd DerivedData.

Root verification covers 2,154 backend, 180 edge and 349 web tests plus types.
All passed again from the new physical folder on Node 22 and Supabase 2.115.0.
Native measurements used the actual board row and direction-lock helper with
fixture fonts/data: 32 baseline/fixed cases, four phone widths, MLB SWEATING,
WINNING, LOSING and NCAAF. Every fixed case had zero horizontal overflow, a
locked outer scroll view, vertical scrollable content and scrollable card rails.
The full app built and was inspected in Simulator. Remote gesture injection
was unreliable, so no physical-device reproduction is claimed.

Receipts are in
`/Users/adam.preda/Documents/ChatGPT/Gary/mac-repair-2026-09-07/`.
Build/upload logs are `/tmp/gary-home902-archive-20260907.log` and
`/tmp/gary-home902-upload-20260907.log`. Final local verification and production
receipts use `/tmp/gary-final-location-verify-20260907.log` and
`/tmp/gary-final-production-20260907.log`.

## Remaining constraints

Push notifications are explicitly out of scope. No push credentials or messages
were changed. Xcode Cloud still fails its existing release configuration guard
because its GoogleService-Info.plist is redacted; the signed Mac archive/upload
succeeded. Do not commit the private local file to repair that cloud failure.
Internal free space remains around 11 GiB and is monitored; deleting user data
or simulator saved state was not justified. No Time Machine destination or
complete machine-restore drill has been configured. The Mac remains the sole
local production host, with no additional hosting subscription.
