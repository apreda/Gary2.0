# Profile icon refinement — September 8, 2026

Adam requested a sleeker profile icon from the attached native-header screenshot.
The shared `ProfileAvatar` in `ios/GaryApp/ProfileExperience.swift` now uses an
outlined person at 52% of avatar size, a continuous rounded-square shape, and a
subtle warm neutral fill and border. Gold remains the foreground accent.
Initials, selected symbols, profile actions, authentication and accessibility
labels are unchanged; the header retains its 44-point hit target.

Verification: the exact shared component passed iOS Simulator SDK typechecking.
A native SwiftUI component render was visually checked at 28pt and 56pt. The
three existing profile safety/private preference/Winners suites passed all five
tests. `git diff --check` passed. No new tests were needed for the visual change.

Preview: `/Users/adam.preda/Documents/ChatGPT/Gary/profile-icon-2026-09-08/profile-comparison.png`.
The preview renders the actual component using SwiftUI on macOS; it is not an
installed iPhone app screenshot. The typecheck separately uses the iOS SDK.

Delivery: source is ready for the next native build. This task did not mutate
simulator devices, rebuild shared release products, or upload to Apple because
other active tasks own the 915 simulator/archive and release acceptance. A build
made before this change still contains the old avatar. Include this file in the
next source freeze and signed archive before claiming the icon is in TestFlight.


## Approved Billfold selector follow-up

Adam explicitly approved removing the redundant underline under GARY / YOU /
BOARD after discussing the screenshot. `BillfoldView.bookScopeTab` now renders
only the label: selected gold/bold, inactive muted/semibold. The existing font
size, letter spacing, scope persistence and button actions are retained. Vertical
padding preserves label breathing room. Selected buttons expose `.isSelected`
to accessibility. The outdated underline design comment was replaced.

The exact production helper passed iOS Simulator SDK typechecking and native
SwiftUI component rendering with each of the three scopes selected. Both
existing Billfold eligibility and long-shot exclusion suites passed all nine
tests. `git diff --check` passed. Preview:
`/Users/adam.preda/Documents/ChatGPT/Gary/billfold-tabs-2026-09-08/tab-comparison.png`.
This is a component render on macOS, not an installed iPhone screenshot.

BillfoldView.swift SHA-256:
`244c05c2e839a1f6cab0e93f032e9ba3a4acce302a9cbd555a60381893bb5f25`.

The active native release owner acknowledged the explicit new approval before
this edit and confirmed 915 remains unuploaded. It will include/review this
change and rebuild the combined simulator/archive. This task touched no
Simulator device, build product, build number or Apple upload. Further native
edits are held after delivery; installed-app acceptance and release remain with
the release owner. Prior artifacts made before this change retain the underline.
